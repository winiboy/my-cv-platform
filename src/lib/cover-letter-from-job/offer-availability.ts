import {
  BlockedRequestError,
  safeFetch,
  type BlockedReason,
  type FetchImpl,
  type HostResolver,
} from '@/lib/security/safe-fetch'
import { JOB_BOARD_ALLOWED_HOSTS } from '@/lib/security/job-board-allowlist'
import { companyAddressFromOfferPage } from './offer-page-address'

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
 * How much of an offer page's body is read for its JSON-LD (1 MiB). Boards put
 * the `JobPosting` block in the page's head, well inside this; a larger page is
 * read only up to it, and a block cut by the cap fails to parse and is skipped.
 */
export const OFFER_PAGE_MAX_BODY_BYTES = 1_048_576

/** The content types read as HTML, ignoring parameters such as `charset`. */
const HTML_CONTENT_TYPE = /^\s*(?:text\/html|application\/xhtml\+xml)\s*(?:;|$)/i

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
 *
 * `answered` also carries the company's address from the page's `JobPosting`
 * data (cover-letter-recipient-address-from-offer, US-001), or `null` when the
 * page gave none or could not be read: the address never changes the verdict.
 */
export type OfferPageCheck =
  | { readonly kind: 'gone'; readonly status: number }
  | { readonly kind: 'answered'; readonly status: number; readonly companyAddress: string | null }
  | {
      readonly kind: 'undetermined'
      readonly cause: 'no-url' | 'timeout' | 'network-error' | 'stubbed' | BlockedReason
    }

/** Checks an offer's page. Never throws. */
export type OfferPageChecker = (jobUrl: string | null) => Promise<OfferPageCheck>

/**
 * The check's result for a page that answered with `status`, with the address
 * read from its body when it was read. A gone page has no address.
 */
export function offerPageCheckForStatus(status: number, companyAddress: string | null = null): OfferPageCheck {
  return GONE_STATUSES.has(status) ? { kind: 'gone', status } : { kind: 'answered', status, companyAddress }
}

function isReadableHtmlAnswer(response: Response): boolean {
  return response.status >= 200 && response.status < 300 && HTML_CONTENT_TYPE.test(response.headers.get('content-type') ?? '')
}

/** The decoder for the answer's declared charset, UTF-8 when it names none or one the runtime lacks. */
function decoderFor(contentType: string | null): TextDecoder {
  const charset = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? '')?.[1]
  if (charset) {
    try {
      return new TextDecoder(charset)
    } catch {
      // An unknown label: UTF-8, which every board in the allowlist serves.
    }
  }
  return new TextDecoder('utf-8')
}

/**
 * At most `maxBytes` of `body` as text, or `null` when `budgetMs` runs out
 * first. The stream is cancelled in every case, so a page longer than the cap
 * is not downloaded further.
 *
 * WHY ITS OWN TIMER
 * `safeFetch` clears its abort timer when it returns the response, so its
 * budget does not cover the body. Each read is raced against the time left of
 * the same budget instead; this works for any stream, including one whose
 * pending read would ignore cancellation.
 */
async function readCappedBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  budgetMs: number,
  decoder: TextDecoder
): Promise<string | null> {
  const reader = body.getReader()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<'expired'>((resolve) => {
    timer = setTimeout(() => resolve('expired'), budgetMs)
  })

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < maxBytes) {
      const result = await Promise.race([reader.read(), expired])
      if (result === 'expired') return null
      if (result.done) break
      const room = maxBytes - total
      const chunk = result.value.byteLength > room ? result.value.subarray(0, room) : result.value
      chunks.push(chunk)
      total += chunk.byteLength
    }
  } finally {
    clearTimeout(timer)
    // Releases the socket. Not awaited, here and in `companyAddressOf`: a source
    // whose cancel never settles must not hold the address read past its
    // budget, and a failure changes nothing read.
    void reader.cancel().catch(() => undefined)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return decoder.decode(bytes)
}

/**
 * The company's address on a page that answered: read from the body only for
 * a success status with an HTML answer, within what is left of the budget.
 * Never throws: any failure here gives no address, and the verdict stands.
 */
async function companyAddressOf(response: Response, budgetMs: number): Promise<string | null> {
  if (!response.body || !isReadableHtmlAnswer(response) || budgetMs <= 0) {
    void response.body?.cancel().catch(() => undefined)
    return null
  }
  try {
    const decoder = decoderFor(response.headers.get('content-type'))
    const html = await readCappedBody(response.body, OFFER_PAGE_MAX_BODY_BYTES, budgetMs, decoder)
    return html === null ? null : companyAddressFromOfferPage(html)
  } catch {
    return null
  }
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
 * `safeFetch` only sends GET. The body of a gone page, a non-success status or
 * an answer that is not HTML is never read: it is cancelled as soon as the
 * status is known. A successful HTML answer is read for its address, up to
 * `OFFER_PAGE_MAX_BODY_BYTES` and within what is left of
 * `OFFER_PAGE_TIMEOUT_MS`, so the whole check, body included, stays inside the
 * one budget.
 */
export function createOfferPageChecker(options: OfferPageCheckerOptions = {}): OfferPageChecker {
  return async (jobUrl) => {
    const url = jobUrl?.trim()
    if (!url) return { kind: 'undetermined', cause: 'no-url' }

    const startedAt = Date.now()
    try {
      const response = await safeFetch(url, {
        allowlist: JOB_BOARD_ALLOWED_HOSTS,
        timeoutMs: OFFER_PAGE_TIMEOUT_MS,
        maxRedirects: OFFER_PAGE_MAX_REDIRECTS,
        headers: { ...OFFER_PAGE_HEADERS },
        fetchImpl: options.fetchImpl,
        resolveHost: options.resolveHost,
      })
      if (GONE_STATUSES.has(response.status)) {
        // Releases the socket; a failure to cancel changes nothing about the status.
        await response.body?.cancel().catch(() => undefined)
        return offerPageCheckForStatus(response.status)
      }
      const budgetLeftMs = OFFER_PAGE_TIMEOUT_MS - (Date.now() - startedAt)
      return offerPageCheckForStatus(response.status, await companyAddressOf(response, budgetLeftMs))
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
