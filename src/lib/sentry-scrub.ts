/**
 * Keeping URL fragments out of Sentry.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * A URL fragment never reaches a server. That makes it the right place to carry
 * a short-lived credential — it cannot land in an access log, a proxy, or a
 * Referer header — and it is why the password-recovery link delivers its tokens
 * as `…/reset-password#access_token=…&refresh_token=…`.
 *
 * But "never reaches a server" is a statement about HTTP, not about the page.
 * The fragment is fully visible to client-side JavaScript, and Sentry is
 * client-side JavaScript. Two of its DEFAULT browser integrations pick it up
 * with no opt-in, and neither is covered by the `beforeSend` scrubbing in
 * `instrumentation-client.ts`:
 *
 *   1. NAVIGATION BREADCRUMBS. `browserSessionIntegration` patches
 *      `history.pushState` and `history.replaceState`, and its handler runs
 *      BEFORE the call is applied, computing `from` from the current
 *      `window.location.href` — fragment included.
 *
 *      The consequence is worth stating plainly, because it is the opposite of
 *      what the code looks like it does: the `history.replaceState` in
 *      `reset-password-form.tsx`, whose entire purpose is to ERASE the token
 *      from the address bar, is itself what records the token in a breadcrumb.
 *      That breadcrumb then rides along on every error captured for the rest of
 *      the page's life, and `beforeSend` never inspects breadcrumbs.
 *
 *   2. `event.request.url`. `httpContextIntegration` sets it from
 *      `document.location.href`, fragment included. The existing `beforeSend`
 *      deletes `data`, `cookies` and `headers` — but not `url`. And
 *      `beforeSend` does not run on transaction events at all, so at a 10%
 *      trace sample rate roughly one recovery visit in ten shipped both tokens
 *      in the pageload transaction's `request.url`.
 *
 *   3. BROWSER-METRICS SPAN DESCRIPTIONS, which is the one that makes the
 *      approach below deep rather than a list of two field names.
 *
 *      A first version of this module fixed (1) and (2) only. Measured against
 *      a real browser, the tokens were still in the envelope: every child span
 *      `browserTracingIntegration` emits for a pageload — `browser.DNS`,
 *      `browser.connect`, `browser.request`, `browser.domContentLoadedEvent`,
 *      `browser.loadEvent` — carries the full document URL as its
 *      `description`, and those live in `event.spans[]`, nowhere near
 *      `event.request`. One pageload produced eight copies of the token in
 *      fields no field-name list had thought to include.
 *
 *      That is the lesson this file is built around: enumerating the places a
 *      URL can appear in a Sentry event is a guess about an SDK's internals,
 *      and it was wrong the first time it was made here.
 *
 * ── WHY IT IS GLOBAL AND UNCONDITIONAL ───────────────────────────────────────
 *
 * This could have been fixed on the recovery page, by suppressing Sentry around
 * that one `replaceState`. It is fixed here instead, for every event, because
 * the page-local version only protects the one fragment somebody remembered to
 * think about. The next feature that puts a token, a share key or a signed
 * parameter in a fragment gets this for free and without a review catching it.
 *
 * Fragments are stripped unconditionally rather than pattern-matched for
 * things that look like tokens. A matcher has to be right about every future
 * secret's shape; removing the whole fragment has to be right once. What is
 * lost is the fragment's debugging value, which for this application is an
 * anchor link.
 *
 * ── THE INVARIANT, AND HOW IT IS ENFORCED ────────────────────────────────────
 *
 * The rule is "no string leaving this browser may be a URL carrying a
 * fragment", and it is enforced by walking the whole event rather than by
 * visiting named fields. That is the only version of this that survives an SDK
 * adding a field, which is exactly what defeated the first attempt.
 *
 * The walk only rewrites a string that IS a URL with a fragment — absolute
 * `https://host/path#…` or root-relative `/path#…`. It does not touch prose
 * that happens to contain a '#', does not touch a bare `#anchor` (which is far
 * more likely to be a CSS selector in a breadcrumb than a credential), and
 * never reorders or normalises anything it leaves alone. A scrubber that
 * rewrites evidence it was not asked to touch is its own kind of bug.
 */

import type { Breadcrumb } from '@sentry/nextjs'

/**
 * `url` without its fragment.
 *
 * Works on absolute and relative URLs alike, which it has to: `event.request.url`
 * is absolute, while a navigation breadcrumb's `from` and `to` are paths. So this
 * cuts at the first `#` rather than going through the URL parser, which would
 * need a base for the relative case and would also normalise the rest of the
 * string — a scrubber must not rewrite the value it is only meant to trim.
 *
 * A percent-encoded `%23` is not a fragment delimiter and is deliberately left
 * alone.
 */
export function stripUrlFragment(url: string): string {
  const hash = url.indexOf('#')
  return hash === -1 ? url : url.slice(0, hash)
}

/**
 * The breadcrumb fields that can hold a URL.
 *
 * `from` and `to` are what navigation breadcrumbs carry. `url` is covered too
 * because fetch and xhr breadcrumbs use it, and a request built from a URL that
 * still had its fragment would otherwise slip through this net for the sake of
 * one field name.
 */
const URL_BEARING_BREADCRUMB_FIELDS = ['from', 'to', 'url'] as const

/**
 * Strips the fragment from every URL-bearing field of a breadcrumb.
 *
 * Mutates and returns, matching the shape Sentry's `beforeBreadcrumb` hook
 * expects and the style `beforeSend` in `instrumentation-client.ts` already
 * uses. `stripUrlFragment` above is the pure part, and is where the behaviour
 * is actually pinned by tests.
 *
 * Non-string values are left untouched rather than coerced: a breadcrumb whose
 * `data.to` is somehow not a string is not something this function should be
 * quietly rewriting.
 */
export function scrubBreadcrumbUrls(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data
  if (!data) {
    return breadcrumb
  }

  for (const field of URL_BEARING_BREADCRUMB_FIELDS) {
    const value = data[field]
    if (typeof value === 'string') {
      data[field] = stripUrlFragment(value)
    }
  }

  return breadcrumb
}

/**
 * True if `value` is a URL that carries a fragment.
 *
 * Accepts the two forms that actually appear in Sentry events: an absolute
 * `http(s)` URL, and a root-relative path (navigation breadcrumbs use these).
 *
 * Deliberately false for a string starting with '#'. A bare `#something` in
 * telemetry is far more likely to be a CSS selector or an anchor name than a
 * credential, and blanking those would damage breadcrumbs for no gain. Known
 * URL fields are handled by `stripUrlFragment` directly, which has no such
 * reservation.
 *
 * Whitespace disqualifies the part before the '#': a sentence that mentions a
 * URL is prose, and prose is not rewritten.
 */
export function isUrlWithFragment(value: string): boolean {
  const hash = value.indexOf('#')
  if (hash <= 0) {
    return false
  }
  const beforeFragment = value.slice(0, hash)
  return (
    /^https?:\/\/[^\s]+$/i.test(beforeFragment) || /^\/[^\s#]*$/.test(beforeFragment)
  )
}

/**
 * How deep the walk goes.
 *
 * Sentry events nest to roughly `event.spans[].data.<key>` — four or five
 * levels. Twelve is generous headroom, and the bound exists so that a
 * malformed or unexpectedly deep payload cannot turn a scrubber into a stack
 * overflow on the path that reports errors.
 */
const MAX_WALK_DEPTH = 12

/** Rewrites every URL-with-fragment string reachable from `node`, in place. */
function scrubStringsInPlace(node: unknown, depth: number): void {
  if (depth > MAX_WALK_DEPTH || node === null || typeof node !== 'object') {
    return
  }

  // Arrays and plain objects are handled by the same key walk; `Object.keys`
  // gives array indices as strings, and assignment through them works.
  const container = node as Record<string, unknown>
  for (const key of Object.keys(container)) {
    const value = container[key]
    if (typeof value === 'string') {
      if (isUrlWithFragment(value)) {
        container[key] = stripUrlFragment(value)
      }
    } else if (typeof value === 'object') {
      scrubStringsInPlace(value, depth + 1)
    }
  }
}

/**
 * Removes URL fragments from anywhere in a payload, whatever its shape.
 *
 * The general form, used for anything the SDK ships that is not an event —
 * today, standalone spans via `beforeSendSpan`, whose `SpanJSON` has no
 * `request` field at all.
 *
 * ALWAYS RETURNS ITS ARGUMENT. That is not incidental: `beforeSendSpan` treats
 * a falsy return as "drop this span", so any future edit here that returns
 * early with `undefined` would silently delete telemetry rather than scrub it.
 */
export function scrubUrlFragmentsDeep<T>(payload: T): T {
  scrubStringsInPlace(payload, 0)
  return payload
}

/**
 * Removes URL fragments from anywhere in an event.
 *
 * Generic over the event shape so one implementation serves both `beforeSend`
 * (an `ErrorEvent`) and `beforeSendTransaction` (a `TransactionEvent`). Those
 * are two separate hooks in the SDK, and wiring only one of them covers only
 * errors — leaving every sampled pageload transaction carrying the URL in
 * full, which was one of the two original defects.
 *
 * `request.url` is additionally stripped by name. That is not redundant with
 * the walk: it is a field known to hold a URL, so it is trimmed whether or not
 * it satisfies the conservative predicate above.
 */
export function scrubEventUrlFragments<T extends { request?: { url?: string } }>(event: T): T {
  if (typeof event.request?.url === 'string') {
    event.request.url = stripUrlFragment(event.request.url)
  }
  return scrubUrlFragmentsDeep(event)
}
