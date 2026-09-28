/**
 * The cross-instance rate-limit tier, backed by PostgreSQL.
 *
 * WHY THIS IS ITS OWN MODULE
 * Two unrelated surfaces now need a cross-instance counter: the AI routes,
 * which protect a paid provider account, and the password-reset request route,
 * which protects the owner's transactional-email quota and third parties'
 * inboxes. They have different policies and must not share a bucket namespace,
 * but the store beneath them is the same security control, and a copy of a
 * security control is a copy that drifts. `ai-rate-limit.ts` owned this code
 * first; it was lifted here unchanged rather than duplicated.
 *
 * WHAT IT GUARANTEES
 * The increment and the limit comparison happen inside one statement in the
 * database (`public.consume_rate_limit`, migration `008_api_rate_limits.sql`),
 * so two concurrent requests cannot both read the same count and both conclude
 * they are under the limit. That single statement is the only reason a published
 * limit means anything on a multi-instance deployment.
 *
 * WHAT IT DOES NOT
 * When the migration is not applied, or the database is unreachable, `consume`
 * resolves `null` — "this store cannot answer" — and `enforceRateLimit` falls
 * back to the per-instance tier. Migration 008 is NOT deployed to the hosted
 * project, so today every caller of this store is running on the local tier in
 * production. Each degradation is reported to Sentry, throttled, so the gap is
 * visible rather than silent.
 *
 * The anon key is enough: `consume_rate_limit` is SECURITY DEFINER and the
 * table it writes denies direct access, so no privileged credential is involved
 * and no caller can read or edit another caller's counter.
 */

import * as Sentry from '@sentry/nextjs'
import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { RateLimitStore } from './rate-limit'

/**
 * Bucket used when no client address can be determined.
 *
 * On Vercel the platform always supplies one, so this is effectively the local
 * development case. Everything unattributed shares one budget: a degradation,
 * not an exemption. Granting unattributed callers a free pass would make every
 * guard built on this trivially bypassable by stripping a header.
 */
const UNATTRIBUTED_IP = 'unattributed'

/**
 * Reads the client address from the platform's forwarding headers.
 *
 * Lives here, beside the store, rather than in `ai-rate-limit.ts` where it was
 * first written. Two reasons, and the second is the one that forced the move:
 *
 *   It is a security control shared by every guard, and a second copy of it is
 *   a copy that drifts — the same argument that put the shared store in this
 *   file.
 *
 *   Importing it from `ai-rate-limit.ts` executed that module's top level, which
 *   instantiates the AI guard's in-memory store and its Supabase store. The
 *   password-reset request path was therefore constructing the AI rate limiter
 *   on every cold start, for no reason, and coupling an auth route to a module
 *   about a Groq account.
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
 *
 * WHAT THIS CANNOT DO. Behind a trusted proxy these headers are set by the
 * platform and cannot be spoofed. In a deployment reachable without one in
 * front, `x-forwarded-for` is caller-controlled and any key derived from it can
 * be rotated at will. Anyone changing the deployment topology must revisit
 * every guard that calls this.
 */
export function resolveClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const candidate =
    forwardedFor?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    ''

  return candidate ? candidate.slice(0, 64) : UNATTRIBUTED_IP
}

/** Minimum gap between shared-store failure reports, per store, per process. */
const DEGRADATION_REPORT_INTERVAL_MS = 60_000

/**
 * Builds a shared-tier store for one protected area.
 *
 * `area` names the surface in the Sentry tags and in the degradation note, so a
 * report says which limit stopped holding rather than only that "a" limit did.
 * Each store owns its own report throttle: one area's outage must not silence
 * the other's first report.
 */
export function createSupabaseRateLimitStore(options: {
  readonly area: string
  readonly degradationNote: string
}): RateLimitStore {
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

    Sentry.captureException(
      error instanceof Error ? error : new Error('Rate limit store unavailable'),
      {
        level: 'warning',
        tags: { area: options.area, rate_limit_tier: 'shared' },
        extra: { note: options.degradationNote },
      }
    )
  }

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
