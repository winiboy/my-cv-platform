/**
 * POST /api/auth/password-reset — ask Supabase to send a recovery email.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A CALL FROM THE BROWSER
 * `supabase.auth.resetPasswordForEmail` works perfectly well from a client
 * component, and the first shape of this feature did exactly that. It cannot be
 * rate limited. A limit enforced in the browser is a limit the caller deletes,
 * and this endpoint sends mail on demand to an address the caller chooses, so
 * the limit is the point (see `password-reset-rate-limit.ts`). Putting the call
 * behind a route handler is what makes a server-side counter possible at all.
 *
 * NO ENUMERATION — THE PROPERTY THIS FILE EXISTS TO PROTECT
 * A registered address and an unregistered one must be indistinguishable. If
 * they are not, this endpoint is a free oracle for "does this person use this
 * product", answered about a service holding people's career histories and job
 * applications. That is worth more to an attacker than most of what is behind
 * the login.
 *
 * So the handler has no branch that depends on the answer. It cannot: it never
 * learns it. There is exactly one success response, built from a constant, and
 * it is returned whatever Supabase says — including when Supabase reports an
 * error. Three specific things follow from that and none of them is incidental:
 *
 *   1. The response body and status are literals, assembled at one place below.
 *      A second `NextResponse.json` on a per-address path is how this breaks.
 *
 *   2. Supabase's own errors are swallowed. This looks like sloppiness and is
 *      the opposite. GoTrue answers `/recover` with 200 for an unknown address
 *      already, but it does NOT answer identically forever: its
 *      `email_sent` throttle counts emails actually sent, so a registered
 *      address exhausts that quota and starts returning 429 while an
 *      unregistered address — which sends nothing — never does. Forwarding that
 *      429 would reintroduce the oracle at the third request per address, in a
 *      form no test of the first request would catch. The failure is reported to
 *      Sentry instead, where it is visible to the owner and invisible to the
 *      caller.
 *
 *   3. The rate-limit refusal is issued before the body is read, so it cannot
 *      correlate with the address either.
 *
 *   4. THE RESPONSE DOES NOT WAIT FOR GOTRUE. This is the one that took two
 *      attempts, and the reasoning that replaced it is recorded here because
 *      the first version's reasoning was plausible and wrong.
 *
 *      GoTrue renders and hands off a message for a registered address and does
 *      nothing for an unregistered one, so awaiting it published the answer as
 *      latency. Measured over 20 samples each on loopback — no network noise to
 *      hide behind — the registered median was 120 ms against 64 ms
 *      unregistered, and the registered MINIMUM (79 ms) exceeded the
 *      unregistered median. Identical bytes, identical status, identical
 *      headers, and still a working oracle. An attacker does not need to
 *      average hundreds of samples to read a separation like that.
 *
 *      The earlier version of this comment considered exactly one remedy —
 *      holding every response for a fixed time budget — rejected it for the
 *      slowdown it imposes on every user, and concluded the channel was
 *      Supabase's to own. That was a false choice. The call does not have to be
 *      awaited at all: the response is a constant, so nothing in it depends on
 *      how the call turns out. Deferring the work removes the channel outright
 *      and costs a user nothing.
 *
 *      `after()` rather than a bare floating promise. A promise left dangling
 *      in a serverless handler races the platform freezing or reclaiming the
 *      invocation once the response is sent, and the failure mode is silent:
 *      some recovery emails simply never get sent, more often under low
 *      traffic. `after()` hands the work to Next's own post-response lifecycle,
 *      which on Vercel is backed by `waitUntil` — the runtime keeps the
 *      invocation alive until it settles. See the call site for what remains
 *      unverified about that.
 *
 *      RE-MEASURED AFTER THE FIX, against a production build pinned to the
 *      local stack, 20 samples per arm, alternating, each registered sample a
 *      DISTINCT user — and with the count of emails actually delivered checked
 *      (20 of 20) so the registered arm is known to have done the full work
 *      rather than being waved through by a throttle:
 *
 *                       median    min     p90     mean
 *        registered     22.7 ms   15.0    31.9    23.2
 *        unregistered   21.4 ms   17.8    26.4    21.9
 *
 *      A 1.3 ms separation against a 56 ms separation before, and the
 *      registered minimum now sits BELOW the unregistered median rather than
 *      above it — the distributions overlap completely. Two earlier attempts at
 *      this measurement were invalid and are recorded in the report rather than
 *      here; the short version is that both failure modes made the arms look
 *      identical for the wrong reason, which is exactly what a timing fix is
 *      most at risk of being "confirmed" by.
 *
 * What this still does NOT claim: the residual difference is now between "the
 * rate-limit check plus JSON parsing plus a Zod parse" in both cases, which does
 * not branch on the address.
 *
 * NO ELEVATED CREDENTIAL
 * The anon key, and only the anon key. Recovery does not need more: `/recover`
 * is an unauthenticated GoTrue endpoint by design. The admin API could confirm
 * whether an address exists, which is precisely the capability this route must
 * not have — not having it is what makes the property above true by construction
 * rather than by care.
 */

import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { locales } from '@/lib/i18n'
import { enforcePasswordResetRateLimit } from '@/lib/api/password-reset-rate-limit'

/**
 * Upper bound on the email address, so an absurdly long string is not forwarded
 * to GoTrue. 254 is the longest address that can exist at all (RFC 5321
 * forward-path limit).
 *
 * It does NOT bound what this route holds in memory, and an earlier version of
 * this comment claimed it did. `await request.json()` materialises the entire
 * body before Zod ever sees it, so a large payload is already allocated by the
 * time this limit applies. Bounding that needs a body-size guard on the
 * declared content length, the way `enforceJsonBodyLimit` does for the AI
 * routes — which is a separate thing this route does not currently do.
 */
const MAX_EMAIL_LENGTH = 254

const PasswordResetRequestSchema = z.object({
  // Trimmed before it is validated, not after: a trailing space typed into the
  // field would otherwise fail the address check, and the user would be told
  // their own address is invalid with nothing visible to correct.
  email: z.string().trim().min(1).max(MAX_EMAIL_LENGTH).pipe(z.email()),
  // The locale decides where the recovery link lands, so it is validated
  // against the supported set rather than interpolated into a URL as received.
  // `locales` is the same list the router and the middleware use, so a locale
  // added there cannot be silently missing here.
  locale: z.enum(locales),
})

/**
 * The one and only success response.
 *
 * A function rather than a shared constant because `NextResponse` objects carry
 * a single-use body stream and must not be reused across requests. The literal
 * it is built from is the thing that must not vary.
 */
function accepted(): NextResponse {
  return NextResponse.json({ status: 'accepted' }, { status: 202 })
}

/**
 * Where the recovery link should land.
 *
 * Prefers the configured base URL, matching `src/middleware.ts` and
 * `src/app/api/auth/callback/route.ts` — but NOT their fallback to the request
 * origin, and the difference is deliberate.
 *
 * `request.nextUrl.origin` comes from the `Host` header, which the client sets.
 * On this route that header would decide where a recovery link points. GoTrue's
 * allow-list does catch it — verified: a forged host is replaced with
 * `site_url` — so this was never exploitable on its own. It becomes exploitable
 * the moment the hosted allow-list contains a wildcard wider than the app's own
 * origins, and a `*.vercel.app` preview entry is exactly such a wildcard and
 * exactly the kind of thing that gets added for convenience. That list is
 * owner-only and cannot be checked from here, so the safety of the fallback
 * rests on a fact this code cannot see. That is not a good enough reason to
 * keep it.
 *
 * So the origin comes from configuration, or the request fails loudly.
 *
 * The one exception is a code-level allow-list, not a client-controlled value:
 * a loopback origin is accepted when nothing is configured, so `pnpm dev`
 * without a full environment still works. A forged `Host: 127.0.0.1` against a
 * deployment only produces a link pointing at the attacker's own machine, which
 * gains them nothing.
 *
 * Returns `null` when no origin can be trusted. The caller turns that into a
 * uniform failure — uniform because a misconfiguration must not become the one
 * response that varies by address.
 *
 * ── `NEXT_PUBLIC_APP_URL` IS SUBSTITUTED AT BUILD TIME ────────────────────────
 *
 * Not read at runtime. Next replaces `process.env.NEXT_PUBLIC_*` with literals
 * during `next build`, so the compiled form of the line below is
 * `false || process.env.NEXTAUTH_URL` when the variable was absent from the
 * BUILD environment — and setting it later, in the runtime environment, changes
 * nothing. A deployment that sets only `NEXT_PUBLIC_APP_URL`, and only at
 * runtime, gets a hard 503 on every recovery request.
 *
 * So `NEXT_PUBLIC_APP_URL` must be present when the application is BUILT.
 * `NEXTAUTH_URL` carries no `NEXT_PUBLIC_` prefix and is therefore a genuine
 * runtime read, which is the difference between the two halves of that
 * expression.
 *
 * This is the same confusion that, during implementation, had a locally-started
 * server talking to the hosted Supabase project while runtime variables said
 * otherwise. A build carries its targets immutably; only unprefixed variables
 * are late-bound.
 *
 * ── AND WHEN TESTING THE 503 PATH: EMPTY IS NOT UNSET ─────────────────────────
 *
 * `NEXTAUTH_URL=""` does not disable this branch. Next's `.env.local` loader
 * treats an empty string as absent and refills it from the file, so a probe
 * that blanks the variable gets the configured value back and every request
 * returns 202 — making it look as though the 503 can never fire. Security
 * review hit exactly that and had to withdraw the observation.
 *
 * `delete process.env.NEXTAUTH_URL` is what actually unsets it, which is what
 * the integration tests for this path do.
 */

/**
 * Hosts accepted when nothing is configured.
 *
 * THIS IS MATCHED AGAINST THE PARSED `URL.hostname`, AND THAT IS THE POINT.
 * Do not "tighten" it into a string comparison on the raw `Host` header — that
 * would be strictly worse, for a reason that is not obvious.
 *
 * IPv4 has many spellings, and a parser normalises all of them:
 * `2130706433`, `0x7f.0.0.1`, `127.1`, `0177.0.0.1` and even a fullwidth
 * `①27.0.0.1` all come out of `new URL()` as the hostname `127.0.0.1`. So does
 * `http://evil.com:80@127.0.0.1/`, where `evil.com:80` is userinfo and the host
 * is loopback. Every one of those is correctly ACCEPTED here, and none of them
 * can do any harm: the link is built from `request.nextUrl.origin`, which is
 * the parser's own serialisation and drops userinfo entirely, so the result
 * cannot point anywhere but loopback.
 *
 * A raw-string matcher would reject those spellings while being fooled by the
 * ones it did not enumerate. Parsing first is what makes the set complete.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function resolveRecoveryUrl(request: NextRequest, locale: string): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  if (configured) {
    return `${configured.replace(/\/+$/, '')}/${locale}/reset-password`
  }

  const origin = request.nextUrl.origin
  let hostname: string
  try {
    hostname = new URL(origin).hostname
  } catch {
    return null
  }

  if (!LOOPBACK_HOSTS.has(hostname)) {
    return null
  }

  return `${origin.replace(/\/+$/, '')}/${locale}/reset-password`
}

export async function POST(request: NextRequest) {
  // First, before the body is read: see the guard's own documentation for why
  // the order matters to the no-enumeration property.
  const throttled = await enforcePasswordResetRateLimit(request)
  if (throttled) {
    return throttled
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
  }

  const parsed = PasswordResetRequestSchema.safeParse(body)
  if (!parsed.success) {
    // Shape only. A malformed request is a malformed request whether or not the
    // address it carries has an account, so this reveals nothing — and the
    // field names are deliberately not echoed back with their values.
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
  }

  const { email, locale } = parsed.data

  // Resolved here, on the request, rather than inside the deferred callback:
  // `request.nextUrl` belongs to a request that has already been answered by
  // the time that callback runs.
  const recoveryUrl = resolveRecoveryUrl(request, locale)
  if (!recoveryUrl) {
    // A deployment with no configured origin cannot produce a usable recovery
    // link, and must not quietly send one that lands nowhere. Loud, and the
    // same for every caller — a misconfiguration that answered differently for
    // a registered address would be an oracle of its own.
    Sentry.captureException(new Error('No trusted origin for the recovery link'), {
      level: 'error',
      tags: { area: 'password-reset', failure_kind: 'unconfigured_origin' },
      extra: {
        note:
          'NEXT_PUBLIC_APP_URL and NEXTAUTH_URL are both unset and the request origin ' +
          'is not loopback, so no recovery link can be built. Password recovery is ' +
          'down for every user until one of them is set.',
      },
    })
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Nothing about this request is a session. The handler is stateless and
        // must not write one: a route handler that persisted a session would
        // share it with the next request this instance serves.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        // Load-bearing, and the reason this is `@supabase/supabase-js` rather
        // than the `@supabase/ssr` server client.
        //
        // PKCE puts a `?code=` on the recovery link and requires the verifier
        // that was generated here to be present in the browser that later opens
        // it. Those are two different clients, so the exchange cannot complete.
        // Implicit puts the tokens in the link's URL fragment, which the reset
        // page reads directly — and which, being a fragment, is never sent to
        // any server, so the recovery token cannot reach a log or an access
        // record on the way.
        //
        // It also keeps the flow working with Supabase's DEFAULT recovery email
        // template. The alternative (`token_hash` + a confirm route) needs the
        // hosted project's template edited, which only the owner can do, so
        // choosing it would make this feature undeliverable until someone
        // changed a setting in a dashboard.
        flowType: 'implicit',
      },
    }
  )

  // Deliberately NOT awaited — this is the fix for the latency oracle described
  // at the top of this file, and the `await` that used to be here is the defect.
  //
  // `after()` runs the callback once the response has been sent. On Vercel it is
  // backed by the platform's `waitUntil`, so the invocation is kept alive until
  // the work settles rather than being frozen the moment the response flushes.
  // A bare floating promise would have removed the timing channel just as well
  // and would have introduced a worse bug: recovery emails silently not sent,
  // most often on a quiet instance that gets reclaimed immediately.
  //
  // WHAT IS NOT VERIFIED HERE. That `after()` survives to completion on the
  // deployed runtime has been taken from Next's documented contract, not
  // measured — this branch has never been deployed. The local evidence is that
  // the callback runs and the message is delivered, which is the same on either
  // runtime.
  //
  // IF RECOVERY MAIL GOES MISSING IN PRODUCTION, SUSPECT THE FLUSH FIRST, not
  // `after()` itself. The two are indistinguishable from outside — both look
  // like "no email, no Sentry event" — but they are not equally likely, and an
  // earlier version of this note pointed only at the less likely one.
  //
  // `@sentry/nextjs` schedules its flush when the WRAPPED HANDLER RETURNS
  // (`wrapRouteHandlerWithSentry`: `responseEnd.waitUntil(flushSafelyWithTimeout())`),
  // which is strictly before this callback runs. So anything captured in here
  // arrives after that flush has already resolved against an empty queue, and
  // once every `waitUntil` promise settles the platform may freeze the
  // invocation with the ingest request still in flight. Hence the explicit
  // `Sentry.flush` in the callback's `finally` below.
  //
  // THE ASYMMETRY IS WORTH KNOWING. The 503 report above — the unconfigured
  // origin — is captured INSIDE the handler, so the wrapper's own flush covers
  // it and it needs nothing extra. Only the two post-response reports are
  // affected. Whether a report survives depends on which side of the response
  // it was raised on, which is not visible from the call sites themselves.
  //
  // This is the only `after()` in the codebase, so there was no precedent to
  // copy. The next one will need the same flush, for the same reason.
  after(async () => {
    // The whole body is wrapped, not just the call.
    //
    // supabase-js RETURNS `{ error }` for the outage class that actually
    // happens — connection refused is covered by an integration test that
    // points the client at a dead port — so this catch is the residual: an SDK
    // that throws instead of returning, at a layer below that contract.
    //
    // It is three lines for a reason worth stating. The entire argument for
    // `after()` over a floating promise was to remove SILENT non-delivery. A
    // rejected callback would put that back, with the outcome depending on
    // whether this Next version and Sentry's wrapper happen to surface an
    // unhandled rejection from post-response work — a framework detail, and not
    // one to rest the last slice of the argument on. The failure being guarded
    // is a user told "check your email" who never gets one and leaves no trace.
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryUrl,
      })

      if (!error) {
        return
      }

      // Reported, never returned — and now, necessarily, reported after the
      // caller has already been answered. `error.message` and `error.code` are
      // GoTrue's own strings and carry no address; the address is not attached
      // here and must not be, because Sentry is one of the places FR-6 forbids a
      // full email from appearing. `failure_kind` is what an on-call owner
      // actually needs: which class of failure, not who it happened to.
      Sentry.captureException(error, {
        level: 'warning',
        tags: {
          area: 'password-reset',
          failure_kind: error.code ?? 'unknown',
        },
        extra: {
          note:
            'A recovery email could not be sent. The caller received the ordinary ' +
            'accepted response before this ran, because neither the outcome nor the ' +
            'time it took may reveal whether the address has an account.',
          status: error.status ?? null,
        },
      })
    } catch (thrown) {
      // Same payload discipline as every other report on this path: failure
      // kind only, no address, no token. A distinct `failure_kind` because this
      // one means the SDK broke its own contract, which is a different thing to
      // investigate than a refused connection.
      Sentry.captureException(
        thrown instanceof Error ? thrown : new Error('Deferred recovery send threw'),
        {
          level: 'error',
          tags: { area: 'password-reset', failure_kind: 'deferred_send_threw' },
          extra: {
            note:
              'The deferred recovery send threw instead of returning an error. The ' +
              'caller was already answered, so no email was sent and nothing else ' +
              'would have recorded it.',
          },
        }
      )
    } finally {
      // Deliver whatever was just captured.
      //
      // Without this, neither report above reaches Sentry on a serverless
      // runtime: the SDK's own flush was scheduled when the wrapped handler
      // returned, which is before this callback ran, so it resolved against an
      // empty queue — and once every `waitUntil` promise settles the invocation
      // can be frozen with the ingest request still in flight. The result is a
      // GoTrue failure that produces neither an email nor a report, which is
      // exactly the silent non-delivery `after()` was chosen to eliminate.
      //
      // In the `finally`, so it also covers the returned-error branch, which
      // exits through the early `return` above rather than falling off the end.
      // It therefore runs on the success path too, where the queue is empty and
      // it resolves immediately.
      //
      // 2000 ms matches the SDK's own default timeout.
      //
      // THE `.catch` IS NOT CARELESSNESS. A `finally` is not covered by the
      // `catch` beside it, so a rejection here would escape the callback — and
      // an unhandled rejection in post-response work is precisely what the
      // wrapping above exists to prevent. Without this, the fix for silent
      // non-delivery would reintroduce silent non-delivery one level up, in its
      // own cleanup.
      //
      // The documented contract says `flush` resolves either way and does not
      // reject, and there is no evidence against that. The reason not to rely
      // on it is that `@sentry/nextjs` does not: its own internal helper is
      // called `flushSafelyWithTimeout`, and it wraps the same call in a
      // try/catch. When an SDK guards its own API that way, matching it costs
      // eight characters.
      //
      // Swallowing is the right response rather than reporting: the only way to
      // report a failed flush is to capture an event and flush it.
      await Sentry.flush(2000).catch(() => {})
    }
  })

  return accepted()
}
