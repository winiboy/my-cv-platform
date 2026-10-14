// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { scrubServerEvent } from "@/lib/sentry-server-scrub";

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
  // if an SDK default or a future option would otherwise attach them -
  // including the `http.request.header.*` span attributes the SDK adds.
  beforeSend(event) {
    return scrubServerEvent(event)
  },

  // Transactions are a SEPARATE hook: `beforeSend` never runs on them, and the
  // SDK attaches every request header to a sampled server transaction. The
  // resume PDF renderer's requests carry Vercel's protection bypass secret in
  // a header the SDK does not mask. See `@/lib/sentry-server-scrub`.
  beforeSendTransaction(event) {
    return scrubServerEvent(event)
  },
});
