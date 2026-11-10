import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchImpl, HostResolver } from '@/lib/security/safe-fetch'
import {
  OFFER_PAGE_MAX_BODY_BYTES,
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

const HTML = { 'content-type': 'text/html; charset=utf-8' }

/** An offer page whose JobPosting names the hiring organization's address. */
function offerHtml(street = 'Avenue de la Gare 10'): string {
  const posting = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: 'Data Engineer',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Beispiel AG',
      address: { streetAddress: street, postalCode: '1003', addressLocality: 'Lausanne', addressCountry: 'CH' },
    },
  }
  return `<html><head><script type="application/ld+json">${JSON.stringify(posting)}</script></head><body></body></html>`
}

/** A page whose body records whether it was pulled and whether it was cancelled. */
function trackedPage(html: string, init: ResponseInit) {
  let pulls = 0
  let cancelled = false
  const bytes = new TextEncoder().encode(html)
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1
        controller.enqueue(bytes)
        controller.close()
      },
      cancel() {
        cancelled = true
      },
    },
    // No read-ahead: a pull happens only when the checker reads.
    { highWaterMark: 0 }
  )
  return { response: new Response(body, init), pulls: () => pulls, cancelled: () => cancelled }
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

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status, companyAddress: null })
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

  it.each([404, 410])('cancels the body of a page answering %i instead of reading it, even when it is HTML', async (status) => {
    const page = trackedPage(offerHtml(), { status, headers: HTML })
    const check = createOfferPageChecker({ fetchImpl: answering(page.response), resolveHost: PUBLIC_DNS })

    await expect(check(JOB_URL)).resolves.toEqual({ kind: 'gone', status })

    expect(page.pulls()).toBe(0)
    expect(page.cancelled()).toBe(true)
  })

  describe("the company's address (cover-letter-recipient-address-from-offer, US-001)", () => {
    it('reads it from a successful HTML answer', async () => {
      const check = createOfferPageChecker({
        fetchImpl: answering(new Response(offerHtml(), { status: 200, headers: HTML })),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toEqual({
        kind: 'answered',
        status: 200,
        companyAddress: 'Avenue de la Gare 10\n1003 Lausanne',
      })
    })

    it('reads an XHTML answer, and one whose content type has parameters', async () => {
      for (const contentType of ['application/xhtml+xml', 'TEXT/HTML; charset=UTF-8']) {
        const check = createOfferPageChecker({
          fetchImpl: answering(new Response(offerHtml(), { status: 200, headers: { 'content-type': contentType } })),
          resolveHost: PUBLIC_DNS,
        })

        await expect(check(JOB_URL)).resolves.toMatchObject({ companyAddress: 'Avenue de la Gare 10\n1003 Lausanne' })
      }
    })

    it('decodes the declared charset', async () => {
      const latin1 = Uint8Array.from(offerHtml('Zürichstrasse 5'), (character) => character.charCodeAt(0))
      const check = createOfferPageChecker({
        fetchImpl: answering(
          new Response(latin1, { status: 200, headers: { 'content-type': 'text/html; charset=ISO-8859-1' } })
        ),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toMatchObject({ companyAddress: 'Zürichstrasse 5\n1003 Lausanne' })
    })

    it.each([
      ['no content type', {}],
      ['JSON', { 'content-type': 'application/ld+json' }],
      ['plain text', { 'content-type': 'text/plain' }],
      ['a type that only starts like HTML', { 'content-type': 'text/htmlx' }],
    ])('does not read an answer with %s, and cancels it', async (_label, headers) => {
      const page = trackedPage(offerHtml(), { status: 200, headers })
      const check = createOfferPageChecker({ fetchImpl: answering(page.response), resolveHost: PUBLIC_DNS })

      await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status: 200, companyAddress: null })
      expect(page.pulls()).toBe(0)
      expect(page.cancelled()).toBe(true)
    })

    it('does not wait for the cancel of an answer it does not read', async () => {
      const body = new ReadableStream<Uint8Array>({ cancel: () => new Promise<void>(() => undefined) })
      const check = createOfferPageChecker({
        fetchImpl: answering(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status: 200, companyAddress: null })
    })

    it('gives no address for a page whose bytes are not in the charset it declares', async () => {
      // "Zürich" in windows-1252 is not valid UTF-8: decoding it as declared damages the text.
      const html = offerHtml().replace('Lausanne', 'Zürich')
      const bytes = Uint8Array.from(html, (character) => character.charCodeAt(0))
      const check = createOfferPageChecker({
        fetchImpl: answering(new Response(bytes, { status: 200, headers: HTML })),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status: 200, companyAddress: null })
    })

    it.each([401, 403, 429, 500])('does not read an HTML answer with status %i, and cancels it', async (status) => {
      const page = trackedPage(offerHtml(), { status, headers: HTML })
      const check = createOfferPageChecker({ fetchImpl: answering(page.response), resolveHost: PUBLIC_DNS })

      await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status, companyAddress: null })
      expect(page.pulls()).toBe(0)
      expect(page.cancelled()).toBe(true)
    })

    it('reads any success status, not only 200', async () => {
      const check = createOfferPageChecker({
        fetchImpl: answering(new Response(offerHtml(), { status: 203, headers: HTML })),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toEqual({
        kind: 'answered',
        status: 203,
        companyAddress: 'Avenue de la Gare 10\n1003 Lausanne',
      })
    })

    it('gives no address for a successful HTML page without one', async () => {
      const check = createOfferPageChecker({
        fetchImpl: answering(new Response('<html><body>Offer</body></html>', { status: 200, headers: HTML })),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status: 200, companyAddress: null })
    })

    it(`stops reading at ${OFFER_PAGE_MAX_BODY_BYTES} bytes and cancels the rest of the page`, async () => {
      // An endless page: the address block first, then filler for ever. The
      // check must stop pulling at the cap and still read the block it holds.
      const chunk = new TextEncoder().encode(`<p>${'x'.repeat(64 * 1024 - 7)}</p>`)
      let pulledBytes = 0
      let cancelled = false
      let sentHead = false
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          const next = sentHead ? chunk : new TextEncoder().encode(offerHtml().replace('</html>', ''))
          sentHead = true
          pulledBytes += next.byteLength
          controller.enqueue(next)
        },
        cancel() {
          cancelled = true
        },
      })
      const check = createOfferPageChecker({
        fetchImpl: answering(new Response(body, { status: 200, headers: HTML })),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toEqual({
        kind: 'answered',
        status: 200,
        companyAddress: 'Avenue de la Gare 10\n1003 Lausanne',
      })
      expect(cancelled).toBe(true)
      // The stream may have queued one chunk ahead; it never runs on unbounded.
      expect(pulledBytes).toBeLessThanOrEqual(OFFER_PAGE_MAX_BODY_BYTES + 2 * chunk.byteLength)
    })

    it('ignores a block the cap cuts in half', async () => {
      const filler = `<!--${'x'.repeat(OFFER_PAGE_MAX_BODY_BYTES - 100)}-->`
      const check = createOfferPageChecker({
        fetchImpl: answering(new Response(`<html><head>${filler}${offerHtml()}`, { status: 200, headers: HTML })),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status: 200, companyAddress: null })
    })

    it('keeps the verdict when the body fails while it is read', async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new TypeError('terminated'))
        },
      })
      const check = createOfferPageChecker({
        fetchImpl: answering(new Response(body, { status: 200, headers: HTML })),
        resolveHost: PUBLIC_DNS,
      })

      await expect(check(JOB_URL)).resolves.toEqual({ kind: 'answered', status: 200, companyAddress: null })
    })

    it(`stops reading a slow body when the ${OFFER_PAGE_TIMEOUT_MS} ms budget runs out, and keeps the verdict`, async () => {
      vi.useFakeTimers()
      let cancelled = false
      // Sends nothing and never ends; a pending read that ignores cancel too.
      const body = new ReadableStream<Uint8Array>({
        pull: () => new Promise<void>(() => undefined),
        cancel() {
          cancelled = true
        },
      })
      const fetchImpl = vi.fn<FetchImpl>(async () => {
        // The page answered after 3 s: 2 s of the budget are left for the body.
        await new Promise((resolve) => setTimeout(resolve, 3_000))
        return new Response(body, { status: 200, headers: HTML })
      })
      let settled = false
      const result = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })(JOB_URL).finally(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(3_000)
      await vi.advanceTimersByTimeAsync(OFFER_PAGE_TIMEOUT_MS - 3_000 - 1)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)

      await expect(result).resolves.toEqual({ kind: 'answered', status: 200, companyAddress: null })
      expect(cancelled).toBe(true)
    })

    it('does not read the body when the budget is already spent', async () => {
      vi.useFakeTimers()
      const page = trackedPage(offerHtml(), { status: 200, headers: HTML })
      const fetchImpl = vi.fn<FetchImpl>(async () => {
        // safeFetch's own timer would abort a real request here; this one ignores it.
        await new Promise((resolve) => setTimeout(resolve, OFFER_PAGE_TIMEOUT_MS))
        return page.response
      })
      const result = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })(JOB_URL)

      await vi.advanceTimersByTimeAsync(OFFER_PAGE_TIMEOUT_MS)

      await expect(result).resolves.toEqual({ kind: 'answered', status: 200, companyAddress: null })
      expect(page.pulls()).toBe(0)
      expect(page.cancelled()).toBe(true)
    })

    it('reads the final page of a redirect chain once', async () => {
      const fetchImpl = answering(
        new Response(null, { status: 301, headers: { location: '/de/stellenangebote/detail/123/neu' } }),
        new Response(offerHtml(), { status: 200, headers: HTML })
      )
      const check = createOfferPageChecker({ fetchImpl, resolveHost: PUBLIC_DNS })

      await expect(check(JOB_URL)).resolves.toMatchObject({ companyAddress: 'Avenue de la Gare 10\n1003 Lausanne' })
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    })
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
