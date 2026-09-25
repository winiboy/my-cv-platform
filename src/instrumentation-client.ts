// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

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
  beforeSend(event) {
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
      delete event.request.headers
    }
    delete event.user
    return event
  },


});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;