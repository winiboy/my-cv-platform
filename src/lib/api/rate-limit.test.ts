import { describe, expect, it, vi } from 'vitest'

import {
  createInMemoryRateLimitStore,
  enforceRateLimit,
  type RateLimitOutcome,
  type RateLimitPolicy,
  type RateLimitStore,
} from './rate-limit'

/**
 * Unit coverage for the rate-limit mechanism.
 *
 * The clock is injected rather than faked globally, so "the window resets" is
 * asserted by moving time forward explicitly instead of by sleeping. That keeps
 * the suite deterministic and fast, and it is the reason the store takes a
 * `now` in the first place.
 */

const POLICY: RateLimitPolicy = { limit: 3, windowSeconds: 60 }

/** A clock the tests move by hand. */
function createClock(startMs = 1_700_000_000_000) {
  let currentMs = startMs
  return {
    now: () => currentMs,
    advanceSeconds(seconds: number) {
      currentMs += seconds * 1000
    },
  }
}

/** A store with a fixed answer, for the two-tier assertions. */
function stubStore(answer: RateLimitOutcome | null): RateLimitStore & { consume: ReturnType<typeof vi.fn> } {
  return { consume: vi.fn(async () => answer) }
}

describe('createInMemoryRateLimitStore', () => {
  it('admits requests up to the limit and refuses the one past it', async () => {
    const clock = createClock()
    const store = createInMemoryRateLimitStore({ now: clock.now })

    for (let i = 0; i < POLICY.limit; i += 1) {
      const outcome = await store.consume('caller-a', POLICY)
      expect(outcome).toEqual({ allowed: true, retryAfterSeconds: 0 })
    }

    const refused = await store.consume('caller-a', POLICY)
    expect(refused?.allowed).toBe(false)
  })

  it('reports the seconds remaining in the window, never zero', async () => {
    const clock = createClock()
    const store = createInMemoryRateLimitStore({ now: clock.now })

    for (let i = 0; i < POLICY.limit; i += 1) {
      await store.consume('caller-a', POLICY)
    }

    clock.advanceSeconds(20)
    const refused = await store.consume('caller-a', POLICY)
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 40 })

    // One millisecond of window left must still round up to a usable value: a
    // `Retry-After: 0` tells a client to retry immediately, which is the
    // opposite of the instruction.
    clock.advanceSeconds(39.999)
    const nearlyOver = await store.consume('caller-a', POLICY)
    expect(nearlyOver).toEqual({ allowed: false, retryAfterSeconds: 1 })
  })

  it('opens a fresh window once the old one has elapsed', async () => {
    const clock = createClock()
    const store = createInMemoryRateLimitStore({ now: clock.now })

    for (let i = 0; i < POLICY.limit; i += 1) {
      await store.consume('caller-a', POLICY)
    }
    expect((await store.consume('caller-a', POLICY))?.allowed).toBe(false)

    clock.advanceSeconds(POLICY.windowSeconds)

    expect(await store.consume('caller-a', POLICY)).toEqual({ allowed: true, retryAfterSeconds: 0 })
    // And the fresh window is a full one, not a single spare request.
    for (let i = 1; i < POLICY.limit; i += 1) {
      expect((await store.consume('caller-a', POLICY))?.allowed).toBe(true)
    }
    expect((await store.consume('caller-a', POLICY))?.allowed).toBe(false)
  })

  it('keeps one caller from spending another caller budget', async () => {
    const clock = createClock()
    const store = createInMemoryRateLimitStore({ now: clock.now })

    for (let i = 0; i <= POLICY.limit; i += 1) {
      await store.consume('ai:anon:198.51.100.7', POLICY)
    }
    expect((await store.consume('ai:anon:198.51.100.7', POLICY))?.allowed).toBe(false)

    expect(await store.consume('ai:anon:203.0.113.9', POLICY)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
    expect(await store.consume('ai:user:11111111-1111-4111-8111-111111111111', POLICY)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
  })

  it('reclaims ended windows instead of growing without bound', async () => {
    const clock = createClock()
    const store = createInMemoryRateLimitStore({ now: clock.now, maxBuckets: 2 })

    await store.consume('a', POLICY)
    await store.consume('b', POLICY)
    expect(store.size()).toBe(2)

    // Full, and every tracked window is live: the store declines to decide
    // rather than evicting a live counter, which would let an address spray
    // clear an attacker's own window.
    expect(await store.consume('c', POLICY)).toBeNull()
    expect(store.size()).toBe(2)

    clock.advanceSeconds(POLICY.windowSeconds)
    expect(await store.consume('c', POLICY)).toEqual({ allowed: true, retryAfterSeconds: 0 })
    expect(store.size()).toBe(1)
  })
})

describe('enforceRateLimit', () => {
  it('lets the shared tier decide when it can answer', async () => {
    const local = stubStore({ allowed: true, retryAfterSeconds: 0 })
    const shared = stubStore({ allowed: false, retryAfterSeconds: 42 })

    const decision = await enforceRateLimit('ai:anon:198.51.100.7', POLICY, { local, shared })

    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 42, enforcedBy: 'shared' })
    expect(shared.consume).toHaveBeenCalledWith('ai:anon:198.51.100.7', POLICY)
  })

  it('refuses on the local tier without troubling the shared store', async () => {
    const local = stubStore({ allowed: false, retryAfterSeconds: 7 })
    const shared = stubStore({ allowed: true, retryAfterSeconds: 0 })

    const decision = await enforceRateLimit('ai:anon:198.51.100.7', POLICY, { local, shared })

    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 7, enforcedBy: 'local' })
    expect(shared.consume).not.toHaveBeenCalled()
  })

  it('degrades to the local tier, and says so, when the shared store cannot answer', async () => {
    const local = stubStore({ allowed: true, retryAfterSeconds: 0 })
    const shared = stubStore(null)

    const decision = await enforceRateLimit('ai:anon:198.51.100.7', POLICY, { local, shared })

    // Fails open on purpose: a database blip must not take every AI feature
    // down for legitimate users. The tier reported is what makes the weaker
    // guarantee visible rather than silent.
    expect(decision).toEqual({ allowed: true, retryAfterSeconds: 0, enforcedBy: 'local' })
  })

  it('still enforces the per-instance limit while the shared store is down', async () => {
    const clock = createClock()
    const local = createInMemoryRateLimitStore({ now: clock.now })
    const shared = stubStore(null)

    for (let i = 0; i < POLICY.limit; i += 1) {
      const decision = await enforceRateLimit('ai:anon:198.51.100.7', POLICY, { local, shared })
      expect(decision.allowed).toBe(true)
    }

    const decision = await enforceRateLimit('ai:anon:198.51.100.7', POLICY, { local, shared })
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 60, enforcedBy: 'local' })
  })
})
