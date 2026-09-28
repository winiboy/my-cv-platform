import { describe, it, expect } from 'vitest'
import {
  PASSWORD_RESET_POLICY,
  passwordResetRateLimitBucket,
} from './password-reset-rate-limit'
import { aiRateLimitBucket, ANONYMOUS_AI_CALLER } from './ai-rate-limit'

/**
 * The bucket key and the policy, in isolation.
 *
 * The guard itself — `enforcePasswordResetRateLimit` — is not unit tested here
 * on purpose. It composes a module-level in-memory store with a store that
 * reaches for the database, and a unit test of it would have to replace both,
 * at which point it would be asserting on the doubles rather than on the
 * counting. `rate-limit.test.ts` already covers the counting, and
 * `route.integration.test.ts` covers this guard against the real stack,
 * including the case that actually matters: that varying the requested address
 * does not buy a fresh budget.
 *
 * What is left for here is the part that is pure and that a review of the diff
 * cannot check by reading: whether the key is derived from anything it should
 * not be, and whether the two namespaces can collide.
 */

describe('passwordResetRateLimitBucket', () => {
  it('is derived from the client address and nothing else', () => {
    // If this ever takes a second argument, this test is the reminder that a
    // client-controlled value in the key is a limit the client can reset.
    expect(passwordResetRateLimitBucket('203.0.113.7')).toBe('pwreset:ip:203.0.113.7')
    expect(passwordResetRateLimitBucket.length).toBe(1)
  })

  it('gives two addresses two buckets', () => {
    expect(passwordResetRateLimitBucket('203.0.113.7')).not.toBe(
      passwordResetRateLimitBucket('203.0.113.8')
    )
  })

  it('cannot collide with an AI bucket for the same address', () => {
    // Both guards key anonymous callers by address and both share one shared
    // store, so a common prefix would let AI traffic spend a locked-out user's
    // recovery budget — or the reverse.
    const ip = '203.0.113.7'
    expect(passwordResetRateLimitBucket(ip)).not.toBe(
      aiRateLimitBucket(ANONYMOUS_AI_CALLER, ip)
    )
    expect(passwordResetRateLimitBucket(ip).startsWith('pwreset:')).toBe(true)
  })

  it('does not let a crafted address forge another bucket namespace', () => {
    // `resolveClientIp` truncates but does not sanitise, so the header can
    // contain a colon. The prefix must stay unambiguous: an address of
    // "ai:anon:x" must not produce the AI bucket for x.
    expect(passwordResetRateLimitBucket('ai:anon:1.2.3.4')).not.toBe(
      aiRateLimitBucket(ANONYMOUS_AI_CALLER, '1.2.3.4')
    )
  })
})

describe('PASSWORD_RESET_POLICY', () => {
  it('is the documented five requests per fifteen minutes', () => {
    // Pinned because the numbers are a product decision recorded in that
    // module's documentation, and a silent edit here would leave the reasoning
    // describing a limit that is no longer in force.
    expect(PASSWORD_RESET_POLICY).toEqual({ limit: 5, windowSeconds: 900 })
  })

  it('is satisfiable by a real user and small enough to exhaust in a test', () => {
    // The lower bound is a usability claim: someone who asks, waits, checks
    // spam and asks again must not be locked out.
    expect(PASSWORD_RESET_POLICY.limit).toBeGreaterThanOrEqual(3)
    // The upper bound is why the integration test can trip the limit in a
    // handful of requests instead of hundreds.
    expect(PASSWORD_RESET_POLICY.limit).toBeLessThanOrEqual(10)
  })
})
