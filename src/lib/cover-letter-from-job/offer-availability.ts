import {
  BlockedRequestError,
  safeFetch,
  type BlockedReason,
  type FetchImpl,
  type HostResolver,
} from '@/lib/security/safe-fetch'
import { JOB_BOARD_ALLOWED_HOSTS } from '@/lib/security/job-board-allowlist'

/**
 * Whether the offer a cover letter is written for is still open
 * (PRD `tasks/prds/cover-letter-from-job.md`, US-002, FR-2).
 *
 * An offer is closed only on clear evidence: its deadline is past, or its page
 * on an allowed job board answers 404 or 410. Everything else - no URL, a host
 * outside the allowlist, an unsafe URL, any other status, a timeout, a network
 * error - leaves the offer open, because many boards answer 200 with an
 * "expired" page or require a login, and a letter must never be refused on a
 * guess.
 *
 * The two parts are separate because the caller orders them around its rate
 * limit: the deadline costs nothing and is checked first; the page is fetched
 * only when the deadline has not already closed the offer.
 */

/** Why an offer counts as closed. Sent to the client, which localizes it. */
export type OfferClosedReason = 'deadline_passed' | 'page_unavailable'

/** The statuses that mean the offer's page was removed. */
const GONE_STATUSES: ReadonlySet<number> = new Set([404, 410])

/** Total budget for the page check, redirect chain included. */
export const OFFER_PAGE_TIMEOUT_MS = 5_000

/** Redirect hops followed; the same bound as `/api/jobs/fetch-external`. */
export const OFFER_PAGE_MAX_REDIRECTS = 5

/**
 * The headers `/api/jobs/fetch-external` sends: several boards refuse a request
 * without a browser user agent, and a refusal would only make the check
 * inconclusive.
 */
const OFFER_PAGE_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5,fr;q=0.3,de;q=0.2',
}

/**
 * What the page check found. Only `gone` closes the offer; the rest carry a
 * status or a cause for the server log, never the URL.
 */
export type OfferPageCheck =
  | { readonly kind: 'gone'; readonly status: number }
  | { readonly kind: 'answered'; readonly status: number }
  | {
      readonly kind: 'undetermined'
      readonly cause: 'no-url' | 'timeout' | 'network-error' | 'stubbed' | BlockedReason
    }

/** Checks an offer's page. Never throws. */
export type OfferPageChecker = (jobUrl: string | null) => Promise<OfferPageCheck>

/** The check's result for a page that answered with `status`. */
export function offerPageCheckForStatus(status: number): OfferPageCheck {
  return GONE_STATUSES.has(status) ? { kind: 'gone', status } : { kind: 'answered', status }
}

export interface OfferPageCheckerOptions {
  /** Test seam, passed to `safeFetch`. Defaults to global `fetch`. */
  readonly fetchImpl?: FetchImpl
  /** Test seam, passed to `safeFetch`. Defaults to DNS. */
  readonly resolveHost?: HostResolver
}

/**
 * A page checker on `safeFetch`: the shared job-board allowlist, every
 * redirect hop re-checked, a private or unresolvable address refused, one
 * bounded time budget for the whole chain.
 *
 * `safeFetch` only sends GET. The body is never read: it is cancelled as soon
 * as the status is known, so a large page is not downloaded.
 */
export function createOfferPageChecker(options: OfferPageCheckerOptions = {}): OfferPageChecker {
  return async (jobUrl) => {
    const url = jobUrl?.trim()
    if (!url) return { kind: 'undetermined', cause: 'no-url' }

    try {
      const response = await safeFetch(url, {
        allowlist: JOB_BOARD_ALLOWED_HOSTS,
        timeoutMs: OFFER_PAGE_TIMEOUT_MS,
        maxRedirects: OFFER_PAGE_MAX_REDIRECTS,
        headers: { ...OFFER_PAGE_HEADERS },
        fetchImpl: options.fetchImpl,
        resolveHost: options.resolveHost,
      })
      // Releases the socket; a failure to cancel changes nothing about the status.
      await response.body?.cancel().catch(() => undefined)
      return offerPageCheckForStatus(response.status)
    } catch (error) {
      if (error instanceof BlockedRequestError) return { kind: 'undetermined', cause: error.reason }
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        return { kind: 'undetermined', cause: 'timeout' }
      }
      return { kind: 'undetermined', cause: 'network-error' }
    }
  }
}

/** The real page checker. */
export const checkOfferPage: OfferPageChecker = createOfferPageChecker()

/** `YYYY-MM-DD`, the form Supabase returns a DATE column in. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Whether `deadline` is before today, both as UTC calendar dates. A deadline
 * of today is still open. A missing or malformed deadline decides nothing.
 */
export function isDeadlinePassed(deadline: string | null, now: Date): boolean {
  if (!deadline || !ISO_DATE.test(deadline)) return false
  const todayUtc = now.toISOString().slice(0, 10)
  return deadline < todayUtc
}
