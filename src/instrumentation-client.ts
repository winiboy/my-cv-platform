// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumbUrls, scrubEventUrlFragments, scrubUrlFragmentsDeep } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: "https://333229cc96e7ce83ea2dfa610493397f@o4510522193412096.ingest.de.sentry.io/4510522199834704",

  // Personal data is NOT sent. This is a resume platform: request bodies carry
  // names, addresses, phone numbers, employment history and cover-letter text,
  // and .claude/rules/security.md forbids logging resume content or unnecessary
  // personal data. sendDefaultPii would also send cookies and the client IP.
  // Phase 30's security review found this on by default at 100% sampling.
  sendDefaultPii: false,

  // Sample a tenth of traces in production; everything in development.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,

  // Last line of defence: strip the request payload, cookies and headers even
  // if an SDK default or a future option would otherwise attach them.
  //
  // `request.url` is scrubbed of its fragment rather than deleted: the path is
  // what makes an error report actionable, and only the fragment can hold a
  // credential. See `@/lib/sentry-scrub` for why a fragment is a credential
  // store at all, and which default integrations read it.
  beforeSend(event) {
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
      delete event.request.headers
    }
    delete event.user
    return scrubEventUrlFragments(event)
  },

  // Transactions are a SEPARATE hook: `beforeSend` never runs on them. Without
  // this, a sampled pageload on the password-recovery page shipped the access
  // and refresh tokens — in `request.url`, and in the `description` of every
  // browser-metrics child span (`browser.DNS`, `browser.connect`,
  // `browser.loadEvent`, ...), which is eight more copies in a place no
  // field-name list predicted. Measured against a real browser, not inferred.
  //
  // The payload/cookie/header/user deletions are repeated here rather than left
  // to `beforeSend`: this hook is the only thing standing in front of a
  // transaction, and a new hook that is weaker than the one beside it is a gap
  // that looks like coverage.
  beforeSendTransaction(event) {
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
      delete event.request.headers
    }
    delete event.user
    return scrubEventUrlFragments(event)
  },

  // Standalone spans are a FOURTH path. They ship in their own envelope and
  // pass through this hook only — never `beforeSend`, never
  // `beforeSendTransaction`.
  //
  // Nothing is leaking through it today: the standalone spans this SDK version
  // emits carry a route name or an element URL, not the document URL. That is a
  // fact about SDK internals, and a fact about SDK internals is precisely what
  // was wrong the first time this file was written — the browser-metrics span
  // descriptions were "obviously" not a URL field either. So the hook is wired
  // up rather than reasoned about.
  //
  // TWO THINGS TO KNOW BEFORE EDITING THIS. A falsy return DROPS the span, so
  // it must return unconditionally — `scrubUrlFragmentsDeep` returns its
  // argument, and an early `return` added below would silently delete
  // telemetry. And merely defining this hook changes the path transaction child
  // spans take: they now pass through here as well, which is harmless because
  // the operation is idempotent, but it means this runs far more often than the
  // standalone case it was added for.
  beforeSendSpan(span) {
    return scrubUrlFragmentsDeep(span)
  },

  // Breadcrumbs are a THIRD path, and the one `beforeSend` can never reach:
  // it receives an event whose breadcrumbs were captured earlier and are not
  // re-inspected. Navigation breadcrumbs record the URL a `history` call moved
  // away FROM, computed before the call is applied — so on the recovery page
  // the breadcrumb is created by the very `replaceState` that erases the token,
  // and then rides on every error captured for the rest of that page's life.
  beforeBreadcrumb(breadcrumb) {
    return scrubBreadcrumbUrls(breadcrumb)
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;