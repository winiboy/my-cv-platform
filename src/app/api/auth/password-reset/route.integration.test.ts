/**
 * Integration tests for `POST /api/auth/password-reset`.
 *
 * These call the real route handler against the real local Supabase stack: real
 * GoTrue, real `/recover`, real `consume_rate_limit` in the real database. Two
 * seams only — `createServerSupabaseClient`, so the shared rate-limit tier can
 * reach the local database without cookie plumbing, and `@sentry/nextjs`, which
 * is replaced because what is passed to it is itself one of the things under
 * test (FR-6).
 *
 * WHY THE RATE-LIMIT EVIDENCE LIVES HERE AND NOT IN THE E2E SUITE
 * A browser cannot make the handler see a chosen client address, so every E2E
 * request would share the one bucket for 127.0.0.1 — leaving the limit test
 * order-dependent, and leaking its consumed budget into the flow tests that run
 * after it. Worse, the shared tier is a row in the database, so a bucket
 * survives the run: a second `pnpm test:e2e` inside the same window would
 * behave differently from the first.
 *
 * Here each test invents its own address, so each gets its own bucket, the
 * limit is exercised exactly as written, and nothing depends on order or on how
 * recently the suite last ran. It also means the limit is reached by this code's
 * own counter and never by Supabase's `email_sent` throttle — a refused request
 * is refused before the body is read, so GoTrue is not contacted at all. That is
 * US-003's requirement that the test not depend on Supabase's throttle to
 * produce the failure, satisfied by construction rather than by timing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  assertStackReachable,
  createTestUser,
  deleteTestUser,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  type TestUser,
} from '@/test/integration/supabase'
import { PASSWORD_RESET_POLICY } from '@/lib/api/password-reset-rate-limit'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  // The deferred callback flushes explicitly, because the SDK's own flush is
  // scheduled when the wrapped handler returns — before that callback runs — so
  // without it neither post-response report reaches Sentry on a serverless
  // runtime. Stubbed here rather than omitted: leaving it out makes the
  // callback throw out of its own `finally`, which would fail these tests for a
  // reason that has nothing to do with what they check.
  flush: vi.fn().mockResolvedValue(true),
}))

/**
 * Work the handler deferred with `after()`, captured instead of run.
 *
 * `after()` needs a Next request scope, which exists when a real server invokes
 * a route handler and does not exist when a test calls the exported function
 * directly — it throws outright. So the hook is replaced here, and the
 * replacement is more useful than a no-op: it records the callbacks, so a test
 * can assert both that the response came back WITHOUT waiting for them (the
 * latency-oracle fix) and that they do what they are supposed to once run.
 *
 * Only `after` is replaced. `NextRequest` and `NextResponse` come from the real
 * module, here and in the rate-limit guard.
 */
const deferredWork: Array<() => unknown> = []

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (callback: () => unknown) => {
      deferredWork.push(callback)
    },
  }
})

/** Runs everything the handler deferred, and clears the queue. */
async function flushDeferredWork(): Promise<void> {
  const pending = deferredWork.splice(0, deferredWork.length)
  for (const callback of pending) {
    await callback()
  }
}

import { createServerSupabaseClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'
import { POST } from './route'

const asServerClient = vi.mocked(createServerSupabaseClient)
const captureException = vi.mocked(Sentry.captureException)

/**
 * The handler reads the public Supabase variables directly, as it does in the
 * app. Vitest does not load `.env.local`, so without this the anon client would
 * be constructed from `undefined` and every test would fail for the wrong
 * reason. Pinned to the local stack, which `assertLocalSupabase` in
 * `src/test/integration/supabase.ts` has already refused to let be anything else
 * — these tests create users and send mail.
 */
function pinEnvironmentToLocalStack(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY
  // Decides the `redirectTo` on the recovery link. The local stack's allow-list
  // covers this origin (see `supabase/config.toml`).
  process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3100'
}

/**
 * A client address no other test in this file, or any previous run, has used.
 *
 * The run id matters as much as the counter: the shared tier stores buckets as
 * database rows that outlive the process, so a fixed address would make the
 * second run of this suite inside fifteen minutes fail on a budget the first
 * run spent. 198.51.100.0/24 and 203.0.113.0/24 are the RFC 5737
 * documentation ranges — they are not routable and cannot collide with a real
 * caller's address if this ever ran somewhere it should not.
 */
const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
let addressCounter = 0
function freshClientAddress(): string {
  return `198.51.100.${(addressCounter += 1)}-${RUN_ID}`
}

function resetRequest(
  body: unknown,
  options: { clientIp?: string; raw?: string } = {}
): NextRequest {
  const clientIp = options.clientIp ?? freshClientAddress()
  return new NextRequest('http://127.0.0.1:3100/api/auth/password-reset', {
    method: 'POST',
    body: options.raw ?? JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      // How the handler learns the caller's address in production, behind a
      // proxy that sets it. `resolveClientIp` reads this header first.
      'x-forwarded-for': clientIp,
    },
  })
}

/**
 * Everything about a response that a caller can observe.
 *
 * Deliberately includes the body text verbatim and every header, because the
 * no-enumeration property is about observability and not about intent. A
 * `Set-Cookie` that appeared on one path, a `Vary` that did not, a body with
 * different whitespace — each would be a distinguisher, and none would be
 * caught by comparing a parsed object.
 */
async function observe(response: Response) {
  return {
    status: response.status,
    body: await response.text(),
    headers: Object.fromEntries(
      [...response.headers.entries()].filter(([name]) => name !== 'date')
    ),
  }
}

describe('POST /api/auth/password-reset', () => {
  let registered: TestUser

  beforeAll(async () => {
    await assertStackReachable()
    pinEnvironmentToLocalStack()
    registered = await createTestUser()
  })

  afterAll(async () => {
    await deleteTestUser(registered.id)
  })

  beforeEach(() => {
    // The shared tier needs a client that can call `consume_rate_limit`. The
    // anon key is enough — the function is SECURITY DEFINER. Using a real
    // client rather than a stub means the limit under test is the one the
    // database enforces, not one a double agreed to.
    asServerClient.mockResolvedValue(
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      }) as never
    )
    captureException.mockClear()
    deferredWork.length = 0
  })

  /**
   * SEC-001. The response must not wait for GoTrue.
   *
   * GoTrue renders and sends a message for a registered address and does
   * nothing for an unregistered one, so awaiting it published the answer as
   * latency: measured over 20 samples on loopback, a 120 ms median against
   * 64 ms, with the registered MINIMUM above the unregistered median. Byte
   * identical responses and still an oracle.
   *
   * This asserts the structural property rather than a timing threshold. A test
   * that measured milliseconds would be a test that fails on a loaded CI box
   * and passes on a fast one, and it would not say why. "The handler returned
   * while the Supabase call had not been started" cannot be satisfied by a slow
   * machine or a fast one.
   */
  it('answers without waiting for Supabase', async () => {
    const response = await POST(resetRequest({ email: registered.email, locale: 'en' }))

    expect(response.status).toBe(202)
    expect(
      deferredWork,
      'the Supabase call must have been deferred, not awaited inside the handler'
    ).toHaveLength(1)
    expect(
      captureException,
      'nothing may have been reported yet either, since nothing has run'
    ).not.toHaveBeenCalled()

    // And the deferred work is real: running it sends the mail.
    await flushDeferredWork()
  })

  /**
   * FR-1, and the reason this endpoint is worth testing at all.
   *
   * Not "both return 200": both return the SAME BYTES, the same status and the
   * same headers. The comparison is of whole observations, so a future change
   * that adds a header or reshapes the body on one path fails here rather than
   * shipping an oracle.
   */
  describe('no account enumeration', () => {
    it('answers a registered and an unregistered address identically', async () => {
      // One address for both requests, so the requested email is the ONLY thing
      // that differs between them. Two different client addresses would still
      // produce identical responses here, but the comparison would no longer be
      // of two requests that differ in exactly one respect, which is the whole
      // claim.
      const clientIp = freshClientAddress()

      const knownAddress = await observe(
        await POST(resetRequest({ email: registered.email, locale: 'en' }, { clientIp }))
      )
      const unknownAddress = await observe(
        await POST(
          resetRequest(
            { email: `absolutely-no-such-account-${RUN_ID}@example.test`, locale: 'en' },
            { clientIp }
          )
        )
      )

      expect(unknownAddress).toEqual(knownAddress)
      // Pinned separately so a refactor that made BOTH sides return, say, a 500
      // could not satisfy the equality above and call it a pass.
      expect(knownAddress.status).toBe(202)
      expect(knownAddress.body).toBe(JSON.stringify({ status: 'accepted' }))
    })

    it('answers identically in every locale', async () => {
      // The locale changes the recovery link, which the caller cannot see. It
      // must not change the response, or the response becomes a second channel.
      const observations = []
      for (const locale of ['en', 'fr', 'de', 'it']) {
        observations.push(
          await observe(await POST(resetRequest({ email: registered.email, locale })))
        )
        observations.push(
          await observe(
            await POST(resetRequest({ email: `nobody-${locale}-${RUN_ID}@example.test`, locale }))
          )
        )
      }
      for (const observation of observations) {
        expect(observation).toEqual(observations[0])
      }
    })

    it('answers identically when Supabase itself fails', async () => {
      // The subtle half of FR-1. GoTrue answers `/recover` with 200 for an
      // unknown address, but its `email_sent` throttle counts only emails
      // actually sent — so a registered address starts being refused while an
      // unregistered one never is. Forwarding a Supabase error would therefore
      // reintroduce enumeration at the Nth request per address, invisible to any
      // test of the first.
      //
      // A dead port stands in for the whole class: throttled, misconfigured,
      // down. Whatever Supabase says, the caller gets the one response.
      const healthy = await observe(
        await POST(resetRequest({ email: registered.email, locale: 'en' }))
      )

      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1'
      try {
        const broken = await observe(
          await POST(resetRequest({ email: registered.email, locale: 'en' }))
        )
        expect(broken).toEqual(healthy)
      } finally {
        pinEnvironmentToLocalStack()
      }
    })

    /**
     * FR-6, asserted on the payload rather than trusted to the code reading
     * carefully. The failure above is the one path that reports anything, which
     * makes it the one path that could leak an address into Sentry.
     */
    it('reports a failure without the address, a token, or anything identifying', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1'
      try {
        await POST(resetRequest({ email: registered.email, locale: 'en' }))
        // The report now happens AFTER the response, so it has to be driven
        // here. The caller was answered before any of this ran, which is the
        // point of the deferral.
        await flushDeferredWork()
      } finally {
        pinEnvironmentToLocalStack()
      }

      expect(captureException).toHaveBeenCalled()

      const serialised = JSON.stringify(
        captureException.mock.calls.map(([error, context]) => ({
          message: error instanceof Error ? error.message : String(error),
          context,
        }))
      )

      expect(serialised).not.toContain(registered.email)
      // The local part alone is as identifying as the whole address.
      expect(serialised).not.toContain(registered.email.split('@')[0])
      expect(serialised).not.toContain(SUPABASE_ANON_KEY)

      // And the report must still be useful, or the safe thing to do would be
      // to send nothing.
      const [, context] = captureException.mock.calls[0]
      expect((context as { tags: Record<string, string> }).tags.area).toBe('password-reset')
      expect((context as { tags: Record<string, string> }).tags.failure_kind).toBeTruthy()

      // And it was flushed. A report captured after the response is not
      // delivered by the SDK's own flush, which was scheduled when the handler
      // returned; without an explicit flush this event would be captured into a
      // queue the runtime may never drain.
      expect(
        Sentry.flush,
        'a report raised after the response must be flushed explicitly'
      ).toHaveBeenCalled()
    })
  })

  describe('rate limiting', () => {
    it('admits exactly the policy limit and then refuses', async () => {
      const clientIp = freshClientAddress()

      for (let n = 1; n <= PASSWORD_RESET_POLICY.limit; n += 1) {
        const response = await POST(
          resetRequest({ email: `rl-${n}-${RUN_ID}@example.test`, locale: 'en' }, { clientIp })
        )
        expect(response.status, `request ${n} of ${PASSWORD_RESET_POLICY.limit} must be admitted`).toBe(202)
      }

      const refused = await POST(
        resetRequest({ email: `rl-over-${RUN_ID}@example.test`, locale: 'en' }, { clientIp })
      )
      expect(refused.status).toBe(429)
      // A `Retry-After: 0` is a header that tells a client nothing; the
      // primitive guarantees at least 1.
      expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0)
    })

    /**
     * The explicit failure condition: "a limit that can be bypassed by varying
     * a client-controlled value".
     *
     * The address requested is the obvious candidate, and keying on it would be
     * a natural-looking mistake — it reads like fairness. This exhausts the
     * budget with five different addresses and then asks about a sixth, which
     * is exactly the mail-bombing loop, and it must still be refused.
     */
    it('is not reset by changing the requested address', async () => {
      const clientIp = freshClientAddress()

      for (let n = 1; n <= PASSWORD_RESET_POLICY.limit; n += 1) {
        await POST(
          resetRequest({ email: `varying-${n}-${RUN_ID}@example.test`, locale: 'en' }, { clientIp })
        )
      }

      const refused = await POST(
        resetRequest({ email: `varying-new-${RUN_ID}@example.test`, locale: 'en' }, { clientIp })
      )
      expect(refused.status).toBe(429)
    })

    it('does not spend one client’s budget on another', async () => {
      const exhausted = freshClientAddress()
      for (let n = 0; n <= PASSWORD_RESET_POLICY.limit; n += 1) {
        await POST(
          resetRequest({ email: `other-${RUN_ID}@example.test`, locale: 'en' }, { clientIp: exhausted })
        )
      }

      const bystander = await POST(
        resetRequest({ email: `bystander-${RUN_ID}@example.test`, locale: 'en' })
      )
      expect(bystander.status).toBe(202)
    })

    it('charges a malformed request against the budget', async () => {
      // Otherwise the cheapest possible loop is the unlimited one, and the guard
      // is bypassed by sending nonsense.
      const clientIp = freshClientAddress()

      for (let n = 1; n <= PASSWORD_RESET_POLICY.limit; n += 1) {
        const response = await POST(resetRequest(null, { clientIp, raw: 'not json at all' }))
        expect(response.status).toBe(400)
      }

      const refused = await POST(
        resetRequest({ email: `after-junk-${RUN_ID}@example.test`, locale: 'en' }, { clientIp })
      )
      expect(refused.status).toBe(429)
    })

    it('refuses before reading the body, so the refusal cannot depend on the address', async () => {
      const clientIp = freshClientAddress()
      for (let n = 0; n <= PASSWORD_RESET_POLICY.limit; n += 1) {
        await POST(resetRequest({ email: `fill-${n}-${RUN_ID}@example.test`, locale: 'en' }, { clientIp }))
      }

      // A registered address, an unregistered one, and a body that is not even
      // valid JSON all get the same refusal. If the guard ran after parsing, the
      // third would be a 400 and the refusal would have become an oracle for
      // request shape — and, one step later, for address validity.
      const refusals = [
        await observe(await POST(resetRequest({ email: registered.email, locale: 'en' }, { clientIp }))),
        await observe(
          await POST(resetRequest({ email: `nope-${RUN_ID}@example.test`, locale: 'en' }, { clientIp }))
        ),
        await observe(await POST(resetRequest(null, { clientIp, raw: '{{{' }))),
      ]

      for (const refusal of refusals) {
        expect(refusal.status).toBe(429)
        expect(refusal).toEqual(refusals[0])
      }
    })
  })

  describe('input validation', () => {
    it('rejects a body that is not JSON', async () => {
      const response = await POST(resetRequest(null, { raw: 'nope' }))
      expect(response.status).toBe(400)
    })

    it.each([
      ['a missing email', { locale: 'en' }],
      ['an empty email', { email: '', locale: 'en' }],
      ['a malformed email', { email: 'not-an-address', locale: 'en' }],
      ['an over-long email', { email: `${'a'.repeat(250)}@example.test`, locale: 'en' }],
      ['a missing locale', { email: 'someone@example.test' }],
      ['an unsupported locale', { email: 'someone@example.test', locale: 'es' }],
      ['a locale that is a path traversal', { email: 'someone@example.test', locale: '../../evil' }],
    ])('rejects %s', async (_case, body) => {
      const response = await POST(resetRequest(body))
      expect(response.status).toBe(400)
    })

    it('does not echo the submitted address back in a validation error', async () => {
      // A reflected value is an XSS sink waiting for a consumer and, here, a
      // log line containing an address that FR-6 says must not be recorded.
      const address = `reflected-${RUN_ID}@example.test`
      const response = await POST(resetRequest({ email: address, locale: 'nonsense' }))
      expect(response.status).toBe(400)
      expect(await response.text()).not.toContain(address)
    })

    /**
     * SEC-002. The recovery link's origin must come from configuration, never
     * from the client-controlled `Host` header.
     *
     * The old fallback was safe only because GoTrue's allow-list rejected a
     * forged host — a fact about a hosted setting this code cannot see, and one
     * that a single wildcard preview entry (`*.vercel.app`) would undo.
     */
    it('refuses to build a link when no trusted origin is configured', async () => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      const authUrl = process.env.NEXTAUTH_URL
      delete process.env.NEXT_PUBLIC_APP_URL
      delete process.env.NEXTAUTH_URL

      try {
        // A forged, non-loopback Host. Previously this decided where the
        // recovery link pointed.
        const forged = new NextRequest('https://attacker.example/api/auth/password-reset', {
          method: 'POST',
          body: JSON.stringify({ email: registered.email, locale: 'en' }),
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': freshClientAddress(),
          },
        })

        const response = await POST(forged)

        expect(response.status, 'an untrusted origin must fail closed').toBe(503)
        expect(
          deferredWork,
          'and no mail may be requested with a link nobody can use'
        ).toHaveLength(0)
      } finally {
        if (appUrl) process.env.NEXT_PUBLIC_APP_URL = appUrl
        if (authUrl) process.env.NEXTAUTH_URL = authUrl
      }
    })

    it('still works on loopback with nothing configured, for local development', async () => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      const authUrl = process.env.NEXTAUTH_URL
      delete process.env.NEXT_PUBLIC_APP_URL
      delete process.env.NEXTAUTH_URL

      try {
        const response = await POST(resetRequest({ email: registered.email, locale: 'en' }))
        // `resetRequest` builds its URL on 127.0.0.1, which is the code-level
        // allow-list — not a value the caller can turn into a useful target.
        expect(response.status).toBe(202)
      } finally {
        if (appUrl) process.env.NEXT_PUBLIC_APP_URL = appUrl
        if (authUrl) process.env.NEXTAUTH_URL = authUrl
      }
    })

    it('the unconfigured failure is identical for a registered and an unknown address', async () => {
      // A misconfiguration must not become the one response that varies by
      // address — that would be FR-1 defeated by an outage.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      const authUrl = process.env.NEXTAUTH_URL
      delete process.env.NEXT_PUBLIC_APP_URL
      delete process.env.NEXTAUTH_URL

      try {
        const make = (email: string) =>
          new NextRequest('https://attacker.example/api/auth/password-reset', {
            method: 'POST',
            body: JSON.stringify({ email, locale: 'en' }),
            headers: {
              'content-type': 'application/json',
              'x-forwarded-for': freshClientAddress(),
            },
          })

        const known = await observe(await POST(make(registered.email)))
        const unknown = await observe(await POST(make(`nobody-${RUN_ID}@example.test`)))
        expect(unknown).toEqual(known)
      } finally {
        if (appUrl) process.env.NEXT_PUBLIC_APP_URL = appUrl
        if (authUrl) process.env.NEXTAUTH_URL = authUrl
      }
    })

    it('accepts an address with surrounding whitespace', async () => {
      // A trailing space is easy to paste and the user cannot see it. Rejecting
      // it would tell them their own address is invalid with nothing to fix.
      const response = await POST(
        resetRequest({ email: `  ${registered.email}  `, locale: 'en' })
      )
      expect(response.status).toBe(202)
    })
  })
})
