/**
 * The rate-limit guard in front of `POST /api/auth/password-reset`.
 *
 * It sits beside `ai-rate-limit.ts` deliberately: same layer, same primitives,
 * same shared store, and the policy below is documented to the same standard as
 * the AI policies so the two can be read against each other. It is a separate
 * module rather than another policy inside that one because the thing being
 * protected is different, and the bucket namespaces must not meet — an AI
 * flood must not be able to spend a locked-out user's ability to recover their
 * account.
 *
 * WHY THIS ENDPOINT NEEDS A LIMIT AT ALL
 * It is unauthenticated, and one request makes the product send an email to an
 * address the caller chose. Unbounded, that is two abuses at once: it spends
 * the owner's transactional-email quota, and it turns the product into a relay
 * for mail-bombing a third party's inbox. Neither requires an account, and
 * neither shows up as an error anywhere.
 *
 * THE POLICY, AND WHY THESE NUMBERS
 * Five requests per fifteen minutes per client address.
 *
 * Sized against the legitimate session it must leave untouched: someone who
 * cannot sign in asks once, does not see the mail, checks the spam folder,
 * realises they typed the address wrong, and asks again. That is two or three
 * requests in a few minutes, and five leaves room for a second person behind
 * the same office address. Above that, a human is not the explanation.
 *
 * Read as a bound on the abuse, five per fifteen minutes is at most twenty
 * emails per hour and 480 per day to any one address — far below the volume
 * that would threaten a sender reputation, and a different order of magnitude
 * from the unbounded per-minute flood the endpoint allows without it.
 *
 * WHAT IT DOES NOT GUARANTEE
 * - It is keyed by client address, so an attacker with a proxy pool or a botnet
 *   gets one budget per address, and users behind one corporate NAT share one.
 *   There is no better key available: the caller is by definition not signed
 *   in, and the alternatives are worse (see the bucket documentation below).
 * - Migration `008_api_rate_limits.sql` is NOT deployed to the hosted database,
 *   so the shared tier cannot answer there and the limit is enforced by the
 *   per-instance tier alone. On a serverless deployment that multiplies the
 *   effective limit by the number of instances serving the caller, and every
 *   deploy and cold start resets it. Until that migration is deployed this is a
 *   speed bump, not a bound, and it must not be described as one. The
 *   degradation is reported to Sentry, throttled, so it is visible.
 * - Like the AI guard, the address is read from the platform's forwarding
 *   headers. Behind Vercel those are set by the platform; in a deployment
 *   reachable without a trusted proxy in front, `x-forwarded-for` is
 *   caller-controlled and the key can be rotated at will.
 */

import { NextResponse, type NextRequest } from 'next/server'
import {
  createInMemoryRateLimitStore,
  enforceRateLimit,
  type RateLimitPolicy,
} from './rate-limit'
// `resolveClientIp` comes from the shared-store module, NOT from
// `ai-rate-limit.ts` where it used to live. Importing it from there executed
// that module's top level, which instantiates the AI guard's two stores — so
// the password-reset path was constructing the AI rate limiter on every cold
// start, and an auth route depended on a module about a Groq account.
import { createSupabaseRateLimitStore, resolveClientIp } from './rate-limit-shared-store'

/** Five recovery requests per fifteen minutes per client address. */
export const PASSWORD_RESET_POLICY: RateLimitPolicy = { limit: 5, windowSeconds: 900 }

/**
 * The counter key for a caller.
 *
 * Keyed by client address and by NOTHING ELSE. The two tempting additions are
 * both wrong, and both are explicit failure conditions of this work:
 *
 *   the requested email — it is a value the caller picks freely, so a bucket
 *     containing it is a bucket the caller can reset at will by changing one
 *     character. The limit would then bound nothing: a loop varying the address
 *     is exactly the mail-bombing case this exists to stop.
 *   a cookie or header the client sets — same defect, one step further from
 *     view.
 *
 * Keying on the address alone means one client cannot consume another's budget,
 * which is the property required, and it is the strongest key available for a
 * caller who is by definition not authenticated.
 *
 * The `pwreset:` prefix keeps this namespace disjoint from `ai:`.
 */
export function passwordResetRateLimitBucket(clientIp: string): string {
  return `pwreset:ip:${clientIp}`
}

/**
 * Per-instance tier. Module-level so it survives between requests within one
 * warm instance, which is the only lifetime it can have. Its own store rather
 * than the AI guard's, so neither surface can exhaust the other's bucket cap.
 */
const localStore = createInMemoryRateLimitStore()

const sharedStore = createSupabaseRateLimitStore({
  area: 'password-reset',
  degradationNote:
    'Password-reset rate limiting degraded to the per-instance tier; the cross-instance limit is ' +
    'not in force. Expected until migration 008_api_rate_limits.sql is deployed.',
})

/**
 * Counts this request against the caller's budget.
 *
 * Returns a 429 response the route must return unchanged, or `null` when the
 * request may proceed.
 *
 * Two things about the refusal matter for the no-enumeration property:
 *
 *   It is returned BEFORE the request body is read or validated. So the refusal
 *   cannot depend on the address requested, and a caller learns nothing about
 *   any account from it — only that they personally have asked too often.
 *
 *   A malformed request still consumes budget, for the same reason the AI guard
 *   charges for one: exempting requests that fail validation would make the
 *   cheapest possible loop the unlimited one.
 */
export async function enforcePasswordResetRateLimit(
  request: NextRequest
): Promise<NextResponse | null> {
  const bucket = passwordResetRateLimitBucket(resolveClientIp(request))
  const decision = await enforceRateLimit(bucket, PASSWORD_RESET_POLICY, {
    local: localStore,
    shared: sharedStore,
  })

  if (decision.allowed) {
    return null
  }

  // The body deliberately carries no address and no account-shaped detail: it
  // is the same refusal for every caller who has asked too often, whatever they
  // asked about.
  return NextResponse.json(
    {
      error: 'Too many requests',
      retryAfter: decision.retryAfterSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } }
  )
}
