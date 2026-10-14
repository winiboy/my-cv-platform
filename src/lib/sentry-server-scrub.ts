import type { Event } from '@sentry/nextjs'

/**
 * Keeping request payloads, cookies and headers out of server and edge
 * Sentry events: errors AND transactions.
 *
 * WHY TRANSACTIONS NEED THEIR OWN HOOK. `beforeSend` never runs on a
 * transaction; `beforeSendTransaction` is the only thing in front of one (the
 * client config learned this first, see `src/instrumentation-client.ts`). On
 * the server that matters because of two SDK defaults (@sentry/nextjs 10):
 *
 *   - `requestDataIntegration` copies the incoming request's headers and
 *     cookies into `event.request`, whatever `sendDefaultPii` says, and runs
 *     on transactions as well as errors.
 *   - On every root span, `@sentry/nextjs` also copies EVERY request header
 *     into a span attribute named `http.request.header.<name>`, which a
 *     transaction carries in `contexts.trace.data`. Values are masked only for
 *     names containing `auth`, `token`, `secret`, `cookie`, `key` and a few
 *     others.
 *
 * The resume PDF renderer's requests to the app carry Vercel's
 * `x-vercel-protection-bypass` secret when Deployment Protection is bypassed
 * (`src/lib/pdf/route-guard.ts`). Its name matches none of those snippets, so
 * a sampled transaction for the Preview page would ship the secret in clear.
 * Every header attribute is removed rather than that one name, for the same
 * reason the existing hook deletes `request.headers` whole: a list of the
 * names that are secret is a guess about the future.
 *
 * Mutates and returns, as Sentry's hooks expect. Always returns its argument:
 * a falsy return would drop the event.
 */

const REQUEST_HEADER_ATTRIBUTE = 'http.request.header.'

function deleteRequestHeaderAttributes(data: Record<string, unknown> | undefined): void {
  if (!data) return
  for (const key of Object.keys(data)) {
    if (key.startsWith(REQUEST_HEADER_ATTRIBUTE)) delete data[key]
  }
}

export function scrubServerEvent<T extends Event>(event: T): T {
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
    delete event.request.headers
  }
  delete event.user
  deleteRequestHeaderAttributes(event.contexts?.trace?.data)
  for (const span of event.spans ?? []) deleteRequestHeaderAttributes(span.data)
  return event
}
