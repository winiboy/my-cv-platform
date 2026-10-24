import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchImpl, HostResolver } from '@/lib/security/safe-fetch'
import {
  OFFER_PAGE_MAX_REDIRECTS,
  OFFER_PAGE_TIMEOUT_MS,
  createOfferPageChecker,
  isDeadlinePassed,
} from './offer-availability'

/**
 * The offer-availability check (cover-letter-from-job, US-002), with the
 * network and DNS injected the way `safe-fetch.test.ts` does it.
 */

const PUBLIC_DNS: HostResolver = async () => ['93.184.216.34']
const JOB_URL = 'https://www.jobs.ch/de/stellenangebote/detail/123/'

function answering(...responses: Response[]): ReturnType<typeof vi.fn<FetchImpl>> {
  const fetchImpl = vi.fn<FetchImpl>()
  for (const response of responses) fetchImpl.mockResolvedValueOnce(response)
  return fetchImpl
}

afterEach(() => {
  vi.useRealTimers()
})

describe('isDeadlinePassed', () => {
  const NOW = new Date('2026-10-24T12:00:00Z')

  it('is true only for a date before today in UTC', () => {
    expect(isDeadlinePassed('2026-10-23', NOW)).toBe(true)
    expect(isDeadlinePassed('2025-01-01', NOW)).toBe(true)
    expect(isDeadlinePassed('2026-10-24', NOW)).toBe(false)
    expect(isDeadlinePassed('2026-10-25', NOW)).toBe(false)
  })

  it('compares UTC calendar dates', () => {
    expect(isDeadlinePassed('2026-10-23', new Date('2026-10-23T23:59:59Z'))).toBe(false)
    expect(isDeadlinePassed('2026-10-23', new Date('2026-10-24T00:00:00Z'))).toBe(true)
  })

  it('decides nothing for a missing or malformed deadline', () => {
    for (const deadline of [null, '', '24.10.2025', '2025-1-1', '2025-01-01T00:00:00Z']) {
      expect(isDeadlinePassed(deadline, NOW)).toBe(false)
    }
  })
})

describe('createOfferPageChecker', () => {
  it.each([404, 410])('finds a page answering %i gone', async (status) => {
    const fetchImpl = answering(new Response('x', { status }))
    const check = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'gone', status })
    expect(fetchImpl).toHaveBeenCalledWith(JOB_URL, expect.objectContaining({ redirect: 'manual' }))
  })

  it.each([200, 401, 403, 429, 500, 503])('finds a page answering %i still there', async (status) => {
    const check = createOfferPageChecker({ fetchImpl: answering(new Response('x', { status })), resolveHost: PUBLIC_DNS })

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status })
  })

  it('sends the browser headers fetch-external sends', async () => {
    const fetchImpl = answering(new Response('x', { status: 200 }))
    await createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })(JOB_URL)

    const init = fetchImpl.mock.calls[0][1]
    expect(init.headers).toMatchObject({ 'User-Agent': expect.stringContaining('Mozilla/5.0') })
  })

  it('follows redirects and judges the final page', async () => {
    const fetchImpl = answering(
      new Response(null, { status: 301, headers: { location: '/expired' } }),
      new Response('gone', { status: 410 })
    )
    const check = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'gone', status: 410 })
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([JOB_URL, 'https://www.jobs.ch/expired'])
  })

  it(`stops after ${OFFER_PAGE_MAX_REDIRECTS} redirects, inconclusive`, async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => new Response(null, { status: 302, headers: { location: JOB_URL } }))
    const check = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'undetermined', cause: 'too-many-redirects' })
    expect(fetchImpl).toHaveBeenCalledTimes(OFFER_PAGE_MAX_REDIRECTS + 1)
  })

  it('cancels the body instead of reading it', async () => {
    let cancelled = false
    const body = new ReadableStream({
      cancel() {
        cancelled = true
      },
    })
    const check = createOfferPageChecker({
      fetchImpl: answering(new Response(body, { status: 404 })),
      resolveHost: PUBLIC_DNS,
    })

    await check(JOB_URL)

    expect(cancelled).toBe(true)
  })

  it.each([
    ['no URL', null, 'no-url'],
    ['an empty URL', '  ', 'no-url'],
    ['an invalid URL', 'not a url', 'invalid-url'],
    ['a non-http scheme', 'ftp://www.jobs.ch/x', 'scheme-not-allowed'],
    ['a host outside the allowlist', 'https://careers.example.com/job/1', 'host-not-allowed'],
  ])('is inconclusive for %s, without a request', async (_label, url, cause) => {
    const fetchImpl = vi.fn<FetchImpl>()
    const check = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })

    await expect(check(url)).resolves.toEqual({ kind: 'undetermined', cause })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    ['a private address', async () => ['10.0.0.5'], 'private-address'],
    ['the cloud metadata address', async () => ['169.254.169.254'], 'private-address'],
    ['a host that does not resolve', async () => Promise.reject(new Error('ENOTFOUND')), 'unresolvable-host'],
  ] as Array<[string, HostResolver, string]>)('is inconclusive for %s, without a request', async (_l, resolveHost, cause) => {
    const fetchImpl = vi.fn<FetchImpl>()
    const check = createOfferPageChecker({ fetchImpl, resolveHost })

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'undetermined', cause })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a redirect into private space, inconclusive', async () => {
    const fetchImpl = answering(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }))
    const check = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'undetermined', cause: 'host-not-allowed' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it(`gives up after ${OFFER_PAGE_TIMEOUT_MS} ms, inconclusive`, async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn<FetchImpl>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    const result = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })(JOB_URL)

    await vi.advanceTimersByTimeAsync(OFFER_PAGE_TIMEOUT_MS)

    await expect(result).resolves.toEqual({ kind: 'undetermined', cause: 'timeout' })
  })

  it('is inconclusive on a network error', async () => {
    const fetchImpl = vi.fn<FetchImpl>().mockRejectedValue(new TypeError('fetch failed'))
    const check = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'undetermined', cause: 'network-error' })
  })
})
