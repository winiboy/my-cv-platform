/**
 * The rate-limit guard in front of every route that spends the project's Groq
 * account: the public tools under `/api/tools/*` and the authenticated routes
 * under `/api/ai/*`.
 *
 * WHY THIS EXISTS
 * Those routes forward caller text to a paid provider. Without a limit, one
 * anonymous loop exhausts the account's quota, which takes every AI feature
 * down for real users and bills the owner for the privilege. Input ceilings
 * (see `ai-input-limits.ts`) bound the cost of a single request; this bounds
 * the number of them.
 *
 * WHAT IT GUARANTEES, PRECISELY
 * Two tiers count every request:
 *
 *   local  — a per-process Map. Always available, reset by every deploy, scale
 *            event and cold start, and private to one instance. On a
 *            multi-instance deployment it alone admits up to
 *            `limit x instances` per window.
 *   shared — a PostgreSQL counter incremented through the
 *            `public.consume_rate_limit` function (migration
 *            `008_api_rate_limits.sql`). One counter per caller for the whole
 *            deployment, so this is the tier that makes the published limit
 *            mean what it says.
 *
 * So: with the migration applied, the limit holds across instances, up to the
 * boundary burst inherent in a fixed window (documented in `rate-limit.ts`).
 * With the migration NOT applied, or during a database outage, the shared tier
 * cannot answer and the guard degrades to the local tier — a per-instance
 * limit, which is a speed bump and not a guarantee. It fails open rather than
 * closed on purpose: failing closed would take every AI feature down for
 * legitimate users on an unrelated database blip, which is the same outcome the
 * attack produces. Each degradation is reported to Sentry, throttled, so the
 * gap is visible rather than silent.
 *
 * WHAT IT DOES NOT GUARANTEE, IN ANY CONFIGURATION
 * - Anonymous callers are keyed by client IP. An attacker with a proxy or
 *   botnet gets one budget per address, and callers behind one corporate NAT
 *   or CGNAT share a budget. There is no way to do better without identifying
 *   the caller, which is what the tools deliberately do not require.
 * - The IP is read from the platform's forwarding headers. Behind Vercel those
 *   are set by the platform and cannot be spoofed by the client. In a
 *   deployment where the app is reachable without a trusted proxy in front,
 *   `x-forwarded-for` is caller-controlled and the anonymous key can be
 *   rotated at will. Anyone changing the deployment topology must revisit this.
 * - It does not cap total spend. It caps requests per caller per window. A
 *   hard budget ceiling belongs at the provider account, and is the owner's to
 *   set.
 */

import * as Sentry from '@sentry/nextjs'
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  createInMemoryRateLimitStore,
  enforceRateLimit,
  type RateLimitPolicy,
  type RateLimitStore,
} from './rate-limit'

/**
 * Who is making the request.
 *
 * The public tools are anonymous by product design, so they are keyed by
 * address; the `/api/ai/*` routes have already authenticated the caller by the
 * time they reach this guard, so they are keyed by user id and are unaffected
 * by shared addresses.
 */
export type AiCaller =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'user'; readonly userId: string }

/** The single anonymous caller value, so public routes do not each allocate one. */
export const ANONYMOUS_AI_CALLER: AiCaller = { kind: 'anonymous' }

/**
 * Anonymous budget: 20 requests per 10 minutes per address.
 *
 * Sized against the legitimate session it has to leave untouched: a visitor
 * pastes a CV, reviews it, fixes it, reviews it again, runs the grammar check,
 * then generates and checks a cover letter. That is under ten provider calls,
 * so twenty leaves room for retries and for a second person behind the same
 * office address, while capping an unattended loop at 2,880 calls per day per
 * address instead of an unbounded number per minute.
 */
export const ANONYMOUS_AI_POLICY: RateLimitPolicy = { limit: 20, windowSeconds: 600 }

/**
 * Authenticated budget: 60 requests per 10 minutes per user.
 *
 * Higher because the surface is different: an editor session fires one
 * transform, optimise or translate call per field touched, so a user working
 * through a resume legitimately makes many more small calls than a visitor
 * running one-shot tools. Sixty is well above observed editing bursts and far
 * below what a scripted loop on a stolen session would need to be profitable.
 */
export const AUTHENTICATED_AI_POLICY: RateLimitPolicy = { limit: 60, windowSeconds: 600 }

/**
 * Bucket used when no client address can be determined.
 *
 * On Vercel the platform always supplies one, so this is effectively the local
 * development case. Everything unattributed shares one budget: a degradation,
 * not an exemption. Granting unattributed callers a free pass would make the
 * guard trivially bypassable by stripping a header.
 */
const UNATTRIBUTED_IP = 'unattributed'

/**
 * Reads the client address from the platform's forwarding headers.
 *
 * `x-forwarded-for` is a comma-separated chain appended to by each hop; the
 * first entry is the original client as seen by the outermost trusted proxy.
 * Truncated because the header is caller-influenced in the general case and
 * must not be able to write an unbounded key into a database column.
 *
 * Next 15 removed `NextRequest.ip`, which used to sit behind these two headers
 * as a third fallback. Nothing is lost in production: Vercel populates
 * `x-forwarded-for` on every request, and `ip` was itself derived from it. A
 * caller that reaches here with neither header now lands in UNATTRIBUTED_IP,
 * which is a shared budget rather than an exemption.
 */
export function resolveClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const candidate =
    forwardedFor?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    ''

  return candidate ? candidate.slice(0, 64) : UNATTRIBUTED_IP
}

/**
 * The counter key for a caller.
 *
 * One bucket per caller across all AI routes, not one per route: per-route
 * buckets would hand an attacker the sum of every route's budget for the same
 * provider account, which is the thing being protected.
 */
export function aiRateLimitBucket(caller: AiCaller, clientIp: string): string {
  return caller.kind === 'user' ? `ai:user:${caller.userId}` : `ai:anon:${clientIp}`
}

/** The policy that applies to a caller. */
export function aiRateLimitPolicy(caller: AiCaller): RateLimitPolicy {
  return caller.kind === 'user' ? AUTHENTICATED_AI_POLICY : ANONYMOUS_AI_POLICY
}

/**
 * Per-instance tier. Module-level so it survives between requests within one
 * warm instance, which is the only lifetime it can have.
 */
const localStore = createInMemoryRateLimitStore()

/** Minimum gap between shared-store failure reports, per process. */
const DEGRADATION_REPORT_INTERVAL_MS = 60_000
let lastDegradationReportAt = 0

/**
 * Reports that the shared tier could not answer.
 *
 * Throttled: a database outage would otherwise emit one Sentry event per
 * request and bury the signal in its own volume.
 */
function reportDegradation(error: unknown): void {
  const now = Date.now()
  if (now - lastDegradationReportAt < DEGRADATION_REPORT_INTERVAL_MS) {
    return
  }
  lastDegradationReportAt = now

  Sentry.captureException(error instanceof Error ? error : new Error('Rate limit store unavailable'), {
    level: 'warning',
    tags: { area: 'rate-limit', rate_limit_tier: 'shared' },
    extra: {
      note: 'AI rate limiting degraded to the per-instance tier; the cross-instance limit is not in force.',
    },
  })
}

/**
 * Cross-instance tier, backed by `public.consume_rate_limit`.
 *
 * The increment and the limit comparison happen inside one statement in the
 * database, so two concurrent requests cannot both read the same count and
 * both conclude they are under the limit.
 *
 * The anon key is enough: the function is SECURITY DEFINER and the table it
 * writes denies direct access, so no privileged credential is involved and no
 * caller can read or edit another caller's counter.
 */
function createSupabaseRateLimitStore(): RateLimitStore {
  return {
    async consume(bucket, policy) {
      try {
        const supabase = await createServerSupabaseClient()
        const { data, error } = await supabase.rpc('consume_rate_limit', {
          p_bucket: bucket,
          p_limit: policy.limit,
          p_window_seconds: policy.windowSeconds,
        })

        if (error || !data || data.length === 0) {
          reportDegradation(error ?? new Error('consume_rate_limit returned no row'))
          return null
        }

        const [row] = data
        return {
          allowed: row.allowed,
          retryAfterSeconds: row.allowed ? 0 : Math.max(1, row.retry_after_seconds),
        }
      } catch (error) {
        reportDegradation(error)
        return null
      }
    },
  }
}

const sharedStore = createSupabaseRateLimitStore()

/**
 * Builds the refusal. `Retry-After` is the standard header for a 429 and is
 * what a well-behaved client waits on; the body repeats it for clients that
 * only read JSON.
 */
function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      retryAfter: retryAfterSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  )
}

/**
 * Counts this request against the caller's budget.
 *
 * Returns a 429 response the route must return unchanged, or `null` when the
 * request may proceed. Called before any provider call, and — on the
 * authenticated routes — after authentication, so the budget is keyed by the
 * verified user rather than by an address the caller controls.
 *
 * A request that is later rejected by validation still consumes budget. That is
 * deliberate: the guard exists to bound how often a caller can reach this
 * route at all, and exempting malformed requests would make the cheapest
 * possible loop the unlimited one.
 */
export async function enforceAiRateLimit(
  request: NextRequest,
  caller: AiCaller
): Promise<NextResponse | null> {
  const bucket = aiRateLimitBucket(caller, resolveClientIp(request))
  const decision = await enforceRateLimit(bucket, aiRateLimitPolicy(caller), {
    local: localStore,
    shared: sharedStore,
  })

  return decision.allowed ? null : tooManyRequests(decision.retryAfterSeconds)
}
