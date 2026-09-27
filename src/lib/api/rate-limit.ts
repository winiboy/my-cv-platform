/**
 * Fixed-window request counting.
 *
 * This module is the mechanism only: pure counting over an injectable store
 * and an injectable clock, with no knowledge of HTTP, of Supabase, or of which
 * routes it protects. `ai-rate-limit.ts` composes it into the guard the AI
 * routes call.
 *
 * WHAT A FIXED WINDOW IS
 * Each bucket owns one window. The first counted request opens a window of
 * `windowSeconds`; every request inside that window increments the same
 * counter; the request that pushes the counter past `limit` is refused and told
 * how long the window still has to run. When the window ends the next request
 * opens a fresh one. This admits the classic burst at a window boundary — up
 * to `2 * limit` requests across two adjacent windows — which is accepted
 * deliberately: the purpose here is to bound spend over minutes, not to shape
 * traffic smoothly, and a sliding window costs a second store round trip for
 * a guarantee this threat does not need.
 */

/** A limit and the window it applies over. */
export interface RateLimitPolicy {
  /** Maximum requests admitted per bucket per window. Must be >= 1. */
  readonly limit: number
  /** Window length in seconds. Must be >= 1. */
  readonly windowSeconds: number
}

/** The result of counting one request against a bucket. */
export interface RateLimitOutcome {
  readonly allowed: boolean
  /**
   * Seconds the caller should wait before retrying. Always 0 when allowed, and
   * always at least 1 when refused, so a `Retry-After` header built from it is
   * never the meaningless `Retry-After: 0`.
   */
  readonly retryAfterSeconds: number
}

/**
 * A place counted requests are recorded.
 *
 * `consume` resolves `null` for "this store cannot answer right now" — a
 * database outage, or a local store that has hit its own capacity. `null` is
 * deliberately distinct from `{ allowed: true }`: the caller decides what an
 * unavailable store means, and `enforceRateLimit` below treats it as a reason
 * to fall back to another tier rather than as permission.
 */
export interface RateLimitStore {
  consume(bucket: string, policy: RateLimitPolicy): Promise<RateLimitOutcome | null>
}

/** Which tier actually decided a request. Reported so callers can log honestly. */
export type RateLimitTier = 'shared' | 'local'

export interface RateLimitDecision extends RateLimitOutcome {
  /**
   * `'shared'` means the cross-instance counter decided, which is the only
   * case where the limit holds for the deployment as a whole. `'local'` means
   * only this instance's counter did, either because it already refused the
   * request or because the shared store was unavailable.
   */
  readonly enforcedBy: RateLimitTier
}

/** An in-memory store, plus the handles tests need to inspect and reset it. */
export interface InMemoryRateLimitStore extends RateLimitStore {
  /** Forgets every window. For tests and for nothing else. */
  reset(): void
  /** Number of buckets currently tracked. */
  size(): number
}

interface WindowState {
  /** Epoch milliseconds at which this window stops counting. */
  windowEndsAt: number
  count: number
}

/**
 * Default cap on tracked buckets.
 *
 * An unbounded Map keyed by caller IP is itself an attack surface: a spray of
 * distinct source addresses would grow it until the instance ran out of memory.
 * Ten thousand entries is far more than any legitimate concurrent-visitor
 * count for this product and costs on the order of a megabyte.
 */
const DEFAULT_MAX_BUCKETS = 10_000

/**
 * A per-process fixed-window counter.
 *
 * Its reach is exactly one Node process. On a multi-instance deployment each
 * instance keeps its own counters, so the effective limit is the policy limit
 * multiplied by the number of instances serving the caller, and it is reset by
 * every deploy, scale-up and cold start. It is therefore a floor, not a
 * guarantee — see the tier documentation in `ai-rate-limit.ts`.
 */
export function createInMemoryRateLimitStore(
  options: { now?: () => number; maxBuckets?: number } = {}
): InMemoryRateLimitStore {
  const now = options.now ?? (() => Date.now())
  const maxBuckets = options.maxBuckets ?? DEFAULT_MAX_BUCKETS
  const windows = new Map<string, WindowState>()

  /** Drops windows that have already ended. Cheap: it runs only when full. */
  function dropExpired(currentMs: number): void {
    for (const [bucket, state] of windows) {
      if (state.windowEndsAt <= currentMs) {
        windows.delete(bucket)
      }
    }
  }

  return {
    async consume(bucket, policy) {
      const currentMs = now()
      const state = windows.get(bucket)

      if (state && state.windowEndsAt > currentMs) {
        state.count += 1
        if (state.count > policy.limit) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((state.windowEndsAt - currentMs) / 1000)),
          }
        }
        return { allowed: true, retryAfterSeconds: 0 }
      }

      if (windows.size >= maxBuckets) {
        dropExpired(currentMs)
      }
      if (windows.size >= maxBuckets) {
        // Every tracked bucket is inside a live window and there is no room for
        // another. Reporting "cannot answer" rather than evicting a live window
        // keeps an address spray from being a way to clear an attacker's own
        // counter, and leaves the decision to the shared tier.
        return null
      }

      windows.set(bucket, {
        windowEndsAt: currentMs + policy.windowSeconds * 1000,
        count: 1,
      })
      return { allowed: true, retryAfterSeconds: 0 }
    },

    reset() {
      windows.clear()
    },

    size() {
      return windows.size
    },
  }
}

/**
 * Counts one request against both tiers and returns the binding decision.
 *
 * The local tier is consulted first because it cannot fail and costs nothing:
 * a caller already over the limit on this instance is refused without a
 * database round trip, and the shared counter is left alone for the requests
 * it can actually decide. When the local tier admits the request, the shared
 * counter is the authority. When the shared store cannot answer, the request
 * is admitted on the local tier's word alone and the decision says so, so the
 * caller can report the degradation instead of implying a guarantee that was
 * not in force.
 */
export async function enforceRateLimit(
  bucket: string,
  policy: RateLimitPolicy,
  tiers: { local: RateLimitStore; shared: RateLimitStore }
): Promise<RateLimitDecision> {
  const local = await tiers.local.consume(bucket, policy)
  if (local && !local.allowed) {
    return { ...local, enforcedBy: 'local' }
  }

  const shared = await tiers.shared.consume(bucket, policy)
  if (shared) {
    return { ...shared, enforcedBy: 'shared' }
  }

  return { allowed: true, retryAfterSeconds: 0, enforcedBy: 'local' }
}
