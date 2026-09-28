import { describe, it, expect } from 'vitest'
import {
  isUrlWithFragment,
  scrubBreadcrumbUrls,
  scrubEventUrlFragments,
  stripUrlFragment,
} from './sentry-scrub'

/**
 * The fragment scrubbers.
 *
 * These exist because the recovery flow puts a live credential in a URL
 * fragment, and two of Sentry's default browser integrations read fragments.
 * The cases below are written as the leak they prevent rather than as string
 * manipulation, so a future edit that "simplifies" one of them has to argue
 * with the token in the expectation.
 *
 * The real recovery fragment is used verbatim throughout. A synthetic
 * `#foo=bar` would pass against a scrubber that only handled short strings, and
 * would not make the stakes visible to whoever reads a failure.
 */

const ACCESS_TOKEN =
  'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxIn0.eyJzdWIiOiI2OGI0MWYzYSJ9.zGnNSpa7GFTWtPJ8'
const RECOVERY_FRAGMENT = `#access_token=${ACCESS_TOKEN}&expires_at=1790547966&refresh_token=4ctkokmkehrw&token_type=bearer&type=recovery`

describe('stripUrlFragment', () => {
  it('removes a recovery fragment from an absolute URL', () => {
    const scrubbed = stripUrlFragment(
      `https://example.com/en/reset-password${RECOVERY_FRAGMENT}`
    )
    expect(scrubbed).toBe('https://example.com/en/reset-password')
    expect(scrubbed).not.toContain(ACCESS_TOKEN)
    expect(scrubbed).not.toContain('refresh_token')
  })

  it('removes a recovery fragment from a relative path', () => {
    // Navigation breadcrumbs carry paths, not absolute URLs, so this is not the
    // same case as above — it is the case an implementation built on `new URL()`
    // would throw on.
    expect(stripUrlFragment(`/fr/reset-password${RECOVERY_FRAGMENT}`)).toBe(
      '/fr/reset-password'
    )
  })

  it('leaves a URL without a fragment exactly as it was', () => {
    // A scrubber that normalises is a scrubber that changes evidence it was not
    // asked to touch.
    for (const url of [
      'https://example.com/en/login?callbackUrl=%2Fen%2Fdashboard',
      '/en/dashboard/resumes?sort=updated',
      '',
      '/',
    ]) {
      expect(stripUrlFragment(url)).toBe(url)
    }
  })

  it('keeps the query string, which is before the fragment', () => {
    expect(stripUrlFragment(`/en/reset-password?locale=fr${RECOVERY_FRAGMENT}`)).toBe(
      '/en/reset-password?locale=fr'
    )
  })

  it('cuts at the FIRST hash', () => {
    // A fragment can itself contain '#'. Cutting at the last one would leave
    // most of the fragment in place.
    expect(stripUrlFragment('/p#a=1#b=2')).toBe('/p')
  })

  it('handles a URL that is nothing but a fragment', () => {
    expect(stripUrlFragment(RECOVERY_FRAGMENT)).toBe('')
  })

  it('does not treat a percent-encoded %23 as a fragment', () => {
    // %23 survives as a path or query character and is not a delimiter. Trimming
    // there would corrupt a legitimate URL.
    expect(stripUrlFragment('/search?q=%23hashtag')).toBe('/search?q=%23hashtag')
  })
})

describe('scrubBreadcrumbUrls', () => {
  it('strips the fragment the recovery page’s own replaceState records', () => {
    // This is the exact breadcrumb Sentry builds when `reset-password-form.tsx`
    // erases the fragment from the address bar: the handler runs BEFORE the
    // call is applied, so `from` is the pre-erasure URL, tokens and all.
    const breadcrumb = scrubBreadcrumbUrls({
      category: 'navigation',
      data: {
        from: `/en/reset-password${RECOVERY_FRAGMENT}`,
        to: '/en/reset-password',
      },
    })

    expect(breadcrumb.data!.from).toBe('/en/reset-password')
    expect(JSON.stringify(breadcrumb)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(breadcrumb)).not.toContain('refresh_token')
  })

  it('strips a fragment from a fetch breadcrumb’s url', () => {
    const breadcrumb = scrubBreadcrumbUrls({
      category: 'fetch',
      data: { url: `https://example.com/api/thing${RECOVERY_FRAGMENT}`, status_code: 200 },
    })

    expect(breadcrumb.data!.url).toBe('https://example.com/api/thing')
    expect(breadcrumb.data!.status_code).toBe(200)
  })

  it('leaves a breadcrumb with no data alone', () => {
    expect(scrubBreadcrumbUrls({ category: 'console', message: 'hello' })).toEqual({
      category: 'console',
      message: 'hello',
    })
  })

  it('does not coerce a non-string url field', () => {
    const breadcrumb = scrubBreadcrumbUrls({ category: 'x', data: { to: 42, from: null } })
    expect(breadcrumb.data!.to).toBe(42)
    expect(breadcrumb.data!.from).toBeNull()
  })

  it('preserves every other field of the breadcrumb', () => {
    const breadcrumb = scrubBreadcrumbUrls({
      category: 'navigation',
      level: 'info',
      timestamp: 1790547966,
      data: { from: `/a${RECOVERY_FRAGMENT}`, to: '/b', keep: 'this' },
    })

    expect(breadcrumb.level).toBe('info')
    expect(breadcrumb.timestamp).toBe(1790547966)
    expect(breadcrumb.data!.keep).toBe('this')
  })
})

describe('scrubEventUrlFragments', () => {
  it('strips the fragment from an error event', () => {
    const event = scrubEventUrlFragments({
      request: { url: `https://example.com/en/reset-password${RECOVERY_FRAGMENT}` },
    })

    expect(event.request!.url).toBe('https://example.com/en/reset-password')
    expect(JSON.stringify(event)).not.toContain(ACCESS_TOKEN)
  })

  it('strips the fragment from a transaction event', () => {
    // Structurally the same call, and the reason it is a separate test: these
    // are two different Sentry hooks, and the defect this fixes was that only
    // one of them was wired up. At a 10% trace sample rate the transaction path
    // was leaking roughly one recovery visit in ten.
    const event = scrubEventUrlFragments({
      type: 'transaction' as const,
      request: { url: `https://example.com/en/reset-password${RECOVERY_FRAGMENT}` },
    })

    expect(event.request!.url).toBe('https://example.com/en/reset-password')
  })

  it('leaves an event with no request alone', () => {
    // Typed rather than inlined: the generic infers its parameter from the
    // literal, and TypeScript's excess-property check then rejects `message` on
    // a fresh object literal. The annotation is what a real Sentry event
    // provides anyway.
    const event: { message: string; request?: { url?: string } } = { message: 'boom' }
    expect(scrubEventUrlFragments(event)).toEqual({ message: 'boom' })
  })

  it('leaves an event whose request has no url alone', () => {
    const event = scrubEventUrlFragments({ request: { method: 'GET' } as { url?: string } })
    expect(event.request).toEqual({ method: 'GET' })
  })

  /**
   * The case a field-name list missed, and the reason the scrubber walks the
   * whole event.
   *
   * `browserTracingIntegration` emits one child span per pageload milestone,
   * and each one's `description` is the full document URL. They live in
   * `event.spans[]`, nowhere near `event.request`. This payload is shaped like
   * the real envelope measured from a browser on the recovery page.
   */
  it('strips fragments from browser-metrics span descriptions', () => {
    const pageUrl = `http://127.0.0.1:3201/en/reset-password${RECOVERY_FRAGMENT}`
    const event = scrubEventUrlFragments({
      type: 'transaction' as const,
      transaction: '/en/reset-password',
      request: { url: pageUrl },
      contexts: { trace: { op: 'pageload', data: { 'http.url': pageUrl } } },
      spans: [
        { op: 'browser.DNS', description: pageUrl, origin: 'auto.ui.browser.metrics' },
        { op: 'browser.connect', description: pageUrl },
        { op: 'browser.loadEvent', description: pageUrl },
        { op: 'browser.domContentLoadedEvent', description: pageUrl, data: { url: pageUrl } },
      ],
    })

    const serialised = JSON.stringify(event)
    expect(serialised).not.toContain(ACCESS_TOKEN)
    expect(serialised).not.toContain('refresh_token')
    expect(serialised).not.toContain('#')

    // Still useful: the spans keep their identity and their URL minus the
    // fragment. A scrubber that blanked the description would be safe and
    // useless.
    expect(event.spans[0].description).toBe('http://127.0.0.1:3201/en/reset-password')
    expect(event.spans[0].op).toBe('browser.DNS')
    expect(event.transaction).toBe('/en/reset-password')
  })

  it('strips fragments from breadcrumbs carried on an event', () => {
    // `beforeBreadcrumb` is the live path, but an event can also arrive here
    // with breadcrumbs already attached. Both nets, same hole.
    const event = scrubEventUrlFragments({
      request: { url: 'https://example.com/en/reset-password' },
      breadcrumbs: [
        { category: 'navigation', data: { from: `/en/reset-password${RECOVERY_FRAGMENT}`, to: '/en/reset-password' } },
      ],
    })
    expect(JSON.stringify(event)).not.toContain(ACCESS_TOKEN)
  })

  it('does not rewrite prose that merely mentions a URL', () => {
    // A scrubber that edits messages is a scrubber that destroys evidence.
    const message = `Navigation to https://example.com/a#b failed`
    const event = scrubEventUrlFragments({
      request: { url: 'https://example.com/a' },
      message,
    } as { request?: { url?: string }; message: string })
    expect(event.message).toBe(message)
  })

  it('survives a deeply nested event without throwing', () => {
    // The depth bound exists so the code that reports errors cannot itself
    // become an error.
    let deep: Record<string, unknown> = { url: `/x${RECOVERY_FRAGMENT}` }
    for (let i = 0; i < 200; i += 1) {
      deep = { nested: deep }
    }
    expect(() =>
      scrubEventUrlFragments({ request: { url: 'https://example.com/a' }, ...deep })
    ).not.toThrow()
  })

  /**
   * The depth boundary itself, pinned from both sides.
   *
   * Without this, nothing would object to the bound being "tidied" from 12 to
   * 4 — and the real payload that motivated this module,
   * `event.spans[].data['http.url']`, sits at depth 4. A bound chosen by
   * intuition and guarded by nothing is a bound that drifts until it is wrong,
   * and the symptom would be a token quietly shipping again.
   *
   * `buildNest(n)` puts the URL at depth `n`, counting the event object itself
   * as depth 0 — the same frame of reference `scrubStringsInPlace` uses.
   */
  describe('the depth bound', () => {
    function buildNest(depth: number): { request: { url: string }; nest: unknown } {
      let node: Record<string, unknown> = { url: `/deep${RECOVERY_FRAGMENT}` }
      // One level is consumed by the `nest` key on the event itself.
      for (let i = 0; i < depth - 2; i += 1) {
        node = { down: node }
      }
      return { request: { url: 'https://example.com/a' }, nest: node }
    }

    it('scrubs a URL at the deepest level it promises to reach', () => {
      const event = scrubEventUrlFragments(buildNest(12))
      expect(JSON.stringify(event)).not.toContain(ACCESS_TOKEN)
    })

    it('does NOT scrub beyond that level, which is the bound being real', () => {
      // Asserting the negative deliberately. If this ever starts passing as
      // "also scrubbed", the bound has moved and the test above no longer pins
      // anything.
      const event = scrubEventUrlFragments(buildNest(14))
      expect(JSON.stringify(event)).toContain(ACCESS_TOKEN)
    })

    it('reaches the real payload shape with room to spare', () => {
      // `event.spans[].data['http.url']` — event(0) -> spans(1) -> [0](2) ->
      // data(3) -> value(4). The margin between 4 and 12 is the point.
      const event = scrubEventUrlFragments({
        request: { url: 'https://example.com/a' },
        spans: [{ data: { 'http.url': `https://example.com/p${RECOVERY_FRAGMENT}` } }],
      })
      expect(JSON.stringify(event)).not.toContain(ACCESS_TOKEN)
    })
  })
})

describe('isUrlWithFragment', () => {
  it.each([
    ['an absolute URL with a fragment', 'https://example.com/p#a=1', true],
    ['a root-relative path with a fragment', '/en/reset-password#access_token=x', true],
    ['an absolute URL with no fragment', 'https://example.com/p', false],
    ['a root-relative path with no fragment', '/en/reset-password', false],
    ['a bare anchor, which is more likely a CSS selector', '#main', false],
    ['prose containing a URL', 'failed to load https://example.com/p#a', false],
    ['an empty string', '', false],
    ['a non-URL word with a hash', 'issue#42', false],
  ])('%s -> %s', (_case, value, expected) => {
    expect(isUrlWithFragment(value)).toBe(expected)
  })
})
