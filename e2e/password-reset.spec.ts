import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  createTestUser,
  deleteTestUser,
  TEST_PASSWORD,
  type TestUser,
} from './fixtures/auth'
import {
  expectNoEmailTo,
  extractRecoveryLink,
  purgeMailbox,
  recoveryLinkDestination,
  waitForEmailTo,
} from './fixtures/mail'
import {
  LOCAL_ANON_KEY,
  LOCAL_SUPABASE_URL,
  assertLocalSupabase,
} from '../src/test/local-stack'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/** The same strings the pages render, so assertions cannot drift from the copy. */
const COMMON_STRINGS = { en, fr, de, it }

/**
 * Password recovery, end to end, against the local stack.
 *
 * WHAT "END TO END" MEANS HERE, AND WHY THE BAR IS SET THERE
 * The happy path below requests a link in the browser, reads the message the
 * mail catcher actually received, follows the link that was actually in it, sets
 * a password, and then SIGNS IN WITH IT. Every one of those steps replaces an
 * assumption that a shorter test would have had to make. A suite that stopped at
 * the success panel would pass against a form that posted nowhere; one that
 * stopped at "the reset page said it worked" would pass against an
 * `updateUser` whose result was never checked.
 *
 * The last assertion is the one that is easiest to leave out and hardest to do
 * without: the OLD password must stop working. "The new password works" is
 * satisfied by a system that accepts both, which is a system where a leaked
 * password is never actually revoked. It is asserted by a failed sign-in, not
 * inferred from the successful one.
 *
 * WHAT IS NOT HERE, AND WHERE IT IS INSTEAD
 * The rate limit. A browser cannot make the server see a chosen client address,
 * so every request from this suite shares one bucket — and the shared tier
 * stores buckets as database rows that outlive the run, so a limit test here
 * would leak spent budget into whatever ran next and behave differently on a
 * second run inside the window. It lives in
 * `src/app/api/auth/password-reset/route.integration.test.ts`, where each case
 * invents its own address. What IS asserted here is the consequence a user
 * would see, on the one path a browser can reach.
 *
 * ON SUPABASE'S OWN EMAIL THROTTLE
 * `[auth.rate_limit] email_sent` is global and hourly. At its original value of
 * 2 the third scenario in this file was refused by GoTrue, which looks exactly
 * like the product failing. `supabase/config.toml` raises it for the local stack
 * only, with the reasoning recorded there. This suite still keeps the number of
 * messages it sends small, because a test that needs a large quota is a test
 * that will break again the next time someone tightens one.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E password-reset suite')

const NEW_PASSWORD = 'e2e-reset-password-9876'

/**
 * Give this page its own rate-limit budget.
 *
 * MUST be called by every test that asks for a recovery email, and the first
 * run of this file is why. The request endpoint admits five requests per
 * fifteen minutes per client address; every browser in this suite reaches the
 * server from 127.0.0.1, so the whole file shared one budget and the sixth
 * scenario onwards was refused. Four tests failed with "no email was delivered",
 * which reads as the product failing to send mail and was in fact the product
 * correctly refusing to.
 *
 * `x-forwarded-for` is how the server learns the caller's address in production
 * — `resolveClientIp` reads that header first, because behind Vercel it is the
 * only truthful source. Setting it here is therefore not a bypass of the guard
 * but the ordinary input to it, and the guard runs exactly as written.
 *
 * The run id is as load-bearing as the counter. The limiter's shared tier stores
 * buckets as database rows that outlive the process, so a fixed address would
 * make the second `pnpm test:e2e` inside fifteen minutes fail on budget the
 * first one spent — a required check whose result depended on how recently it
 * last ran. 198.51.100.0/24 is the RFC 5737 documentation range: not routable,
 * and impossible to confuse with a real caller.
 */
const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
let addressCounter = 0
async function useFreshClientAddress(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({
    'x-forwarded-for': `198.51.100.${(addressCounter += 1)}-${RUN_ID}`,
  })
}

/**
 * Attempt a sign-in outside the browser and report only whether it worked.
 *
 * Outside the browser on purpose. Driving the login form would make every
 * credential assertion depend on the form's own behaviour — its validation, its
 * error rendering, its redirect — and a regression in any of those would be
 * reported here as "the password did not change", which is a different and much
 * more alarming claim. This asks the auth server directly.
 */
async function canSignIn(email: string, password: string): Promise<boolean> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  return !error && !!data.session
}

/**
 * Ask for a recovery link through the real page, and do not return until the
 * request has actually been answered.
 *
 * ── WHY THIS IS NOT "WAIT FOR AN h1" ─────────────────────────────────────────
 *
 * It was, and that made the most important test in this file fail about one run
 * in three.
 *
 * The form renders an `<h1>` in BOTH states: "Reset your password" before
 * submission and "Check your inbox" after it. So `getByRole('heading', {level: 1})`
 * is satisfied the instant the page loads, before the button is even clicked,
 * and this helper returned while the POST was still in flight. The next
 * `page.goto` then tore the page down and aborted it.
 *
 * Nothing surfaced. The route deliberately swallows every failure so that a
 * registered and an unregistered address are indistinguishable (FR-1) — correct,
 * and it also means an aborted request looks exactly like a successful one from
 * the browser's side. The symptom appeared two steps later as "no email was
 * delivered", pointing at the mail catcher or at Supabase's throttle rather than
 * at this function. Confirmed in the GoTrue log: two requests made, one
 * `/recover` received.
 *
 * So the wait is on the POST response — the only event that actually decides
 * whether the request happened — and then on the heading that exists ONLY after
 * submission. `waitForResponse` was already used correctly elsewhere in this
 * file; it simply had not been applied to the helper every test depends on.
 */
async function requestRecovery(page: Page, email: string, locale = 'en'): Promise<void> {
  await useFreshClientAddress(page)
  await page.goto(`/${locale}/forgot-password`)
  await page.fill('#email', email)

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/auth/password-reset') && r.request().method() === 'POST',
      { timeout: 30_000 }
    ),
    page.click('button[type="submit"]'),
  ])

  expect(
    response.status(),
    'the recovery request must be accepted; a 429 here means the test has exhausted ' +
      'its own rate-limit budget and needs a fresh client address'
  ).toBe(202)

  // The confirmation heading specifically, not "a level-1 heading". This is the
  // assertion that distinguishes the two states, and it is the one the previous
  // version was missing.
  await expect(
    page.getByRole('heading', { level: 1, name: expectedSentTitle(locale) }),
    'the request must reach the confirmation panel, not merely leave the form on screen'
  ).toBeVisible({ timeout: 20_000 })
}

/**
 * The confirmation heading for a locale, read from the same translation files
 * the page renders from.
 *
 * Imported rather than hardcoded so that rewording the copy cannot silently
 * turn the assertion above back into one that matches nothing — which would
 * reintroduce exactly the flake it was written to fix, and in a form that looks
 * like a product failure.
 */
function expectedSentTitle(locale: string): string {
  const title = COMMON_STRINGS[locale as keyof typeof COMMON_STRINGS]?.auth?.forgotPassword
    ?.sentTitle
  if (!title) {
    throw new Error(`No auth.forgotPassword.sentTitle string for locale "${locale}"`)
  }
  return title
}

/**
 * Follow a recovery link and wait for the reset page to finish deciding.
 *
 * The wait is on the outcome, not on a timeout: the page starts in a "checking"
 * state while it validates the grant against the auth server, and a test that
 * asserted immediately would race that and see the checking panel.
 */
async function followRecoveryLink(page: Page, recoveryLink: string): Promise<void> {
  await page.goto(recoveryLink)
  await expect(
    page.locator('#password, a[href*="/forgot-password"]').first(),
    'the reset page must settle into either a password form or the invalid-link panel'
  ).toBeVisible({ timeout: 30_000 })
}

test.describe('password recovery', () => {
  /**
   * US-001 AC5: the link that has 404ed on every login page since it was
   * written.
   *
   * Asserted per locale because the href is built from the route segment, and a
   * page that exists only for `en` would satisfy a single-locale check. The
   * heading, not the URL: a 404 leaves the URL alone, which is the trap
   * `auth.spec.ts` documents twice.
   */
  for (const locale of ['en', 'fr', 'de', 'it']) {
    test(`the login page's "forgot password" link reaches a real page in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/login`)

      const link = page.locator(`a[href="/${locale}/forgot-password"]`)
      await expect(link, 'the login form must offer a recovery link').toHaveCount(1)

      await link.click()
      await expect(page).toHaveURL(new RegExp(`/${locale}/forgot-password$`))
      await expect(
        page.getByRole('heading', { level: 1 }),
        'the recovery page must render a heading, not a 404'
      ).toBeVisible()
      await expect(page.locator('body')).not.toContainText('404')
      await expect(page.locator('#email')).toBeVisible()
    })
  }

  /**
   * US-002, whole. This is the test the feature exists to pass.
   */
  test('a user recovers their account from the email they were actually sent', async ({ page }) => {
    const user = await createTestUser()
    try {
      await purgeMailbox()

      // 1. Ask, through the page.
      await requestRecovery(page, user.email, 'en')

      // 2. Read the message that was really delivered. Everything after this
      //    point uses what the email contained, not what the test expected it
      //    to contain.
      const email = await waitForEmailTo(user.email)
      expect(email.to.map((a) => a.toLowerCase())).toContain(user.email.toLowerCase())
      const recoveryLink = extractRecoveryLink(email)

      // 3. The link must come back to this app's reset page, not to the
      //    Supabase site_url. A link that lands on the home page with the
      //    tokens attached is the exact symptom of a redirect allow-list that
      //    does not cover the origin in use, and it would otherwise surface as
      //    an inexplicable failure three steps later.
      expect(recoveryLinkDestination(recoveryLink)).toMatch(/\/en\/reset-password$/)

      // 4. Follow it and set a new password.
      await followRecoveryLink(page, recoveryLink)
      await expect(
        page.locator('#password'),
        'a valid recovery link must produce a usable password form'
      ).toBeVisible()

      // The grant must not survive in the address bar: it would sit in browser
      // history and in any screenshot the user takes of this page.
      expect(
        await page.evaluate(() => window.location.hash),
        'the recovery grant must be erased from the URL'
      ).toBe('')

      await page.fill('#password', NEW_PASSWORD)
      await page.fill('#confirmPassword', NEW_PASSWORD)
      await page.click('button[type="submit"]')

      await expect(
        page.locator(`a[href="/en/login"]`),
        'a completed reset must offer the way back to sign-in'
      ).toBeVisible({ timeout: 20_000 })

      // 5. The new password authenticates. Against the auth server, so this is
      //    a statement about the credential and not about the login form.
      expect(
        await canSignIn(user.email, NEW_PASSWORD),
        'the new password must authenticate'
      ).toBe(true)

      // 6. And the old one does not. Asserted, not inferred — a system that
      //    accepts both passwords passes step 5 and has revoked nothing.
      expect(
        await canSignIn(user.email, TEST_PASSWORD),
        'the old password must no longer authenticate'
      ).toBe(false)
    } finally {
      await deleteTestUser(user.id)
    }
  })

  /**
   * US-002, the other half of the sign-in claim: the user can get back in
   * through the actual login form, not only through the API.
   *
   * Separate from the test above so a failure says which of the two broke. It
   * reuses the password set there rather than sending a second email, because
   * every message this suite sends is charged against a global hourly counter.
   */
  test('the recovered password works in the login form', async ({ page }) => {
    const user = await createTestUser()
    try {
      await purgeMailbox()
      await requestRecovery(page, user.email, 'en')
      const recoveryLink = extractRecoveryLink(await waitForEmailTo(user.email))

      await followRecoveryLink(page, recoveryLink)
      await page.fill('#password', NEW_PASSWORD)
      await page.fill('#confirmPassword', NEW_PASSWORD)
      await page.click('button[type="submit"]')
      await expect(page.locator('a[href="/en/login"]')).toBeVisible({ timeout: 20_000 })

      await page.goto('/en/login')
      await page.fill('#email', user.email)
      await page.fill('#password', NEW_PASSWORD)
      await page.click('button[type="submit"]')

      await expect(page, 'the recovered account must reach the dashboard').toHaveURL(
        /\/en\/dashboard/,
        { timeout: 30_000 }
      )
      // The URL alone is not evidence the session is real; the reload forces the
      // server to prove it holds one.
      await page.reload()
      await expect(page).toHaveURL(/\/en\/dashboard/)
    } finally {
      await deleteTestUser(user.id)
    }
  })

  /**
   * FR-3: the locale must survive the round trip through an email.
   *
   * The failure this pins is a French user landing on `/en/reset-password`,
   * which is what a hardcoded or default locale in the `redirectTo` produces —
   * and which no English-only test would ever see.
   *
   * It checks the link rather than following it, so it costs one message and no
   * token. Following it is covered above.
   */
  test('a French request comes back to the French reset page', async ({ page }) => {
    const user = await createTestUser()
    try {
      await purgeMailbox()
      await requestRecovery(page, user.email, 'fr')

      const recoveryLink = extractRecoveryLink(await waitForEmailTo(user.email))
      expect(
        recoveryLinkDestination(recoveryLink),
        'a request made in French must return the user to the French reset page'
      ).toMatch(/\/fr\/reset-password$/)
    } finally {
      await deleteTestUser(user.id)
    }
  })

  /**
   * FR-1 as a user can observe it.
   *
   * The byte-level comparison of the HTTP responses is in the integration suite.
   * What this adds is the rendered result, which is what an attacker actually
   * looks at: the same panel, word for word, for an address with an account and
   * one without.
   *
   * Deliberately compares the full text content of the card rather than one
   * heading. A difference in a subtitle, a hint line, or the presence of a
   * "check your spam folder" note is just as good an oracle as a different
   * heading, and none of those would be caught by a narrower assertion.
   */
  test('an unregistered address is indistinguishable from a registered one', async ({ page }) => {
    const user = await createTestUser()
    const unregistered = `definitely-not-a-user-${Date.now()}@example.test`
    try {
      await purgeMailbox()

      // The card, not `main, body`. That earlier selector worked only because
      // the `(auth)` group happens to render no `<main>`, so it always fell
      // through to `body` — and `body` also contains the dev branch indicator
      // and the toast container, which are noise this comparison does not want
      // and which could one day differ between two loads for reasons that have
      // nothing to do with the property under test.
      const panel = page.locator('form, div.rounded-2xl').last()

      await requestRecovery(page, user.email, 'en')
      const registeredPanel = await panel.innerText()
      const registeredUrl = page.url()

      await requestRecovery(page, unregistered, 'en')
      const unregisteredPanel = await panel.innerText()

      // Guard against the comparison succeeding because both sides are empty:
      // a selector that matched nothing would make this test pass forever.
      expect(
        registeredPanel.trim().length,
        'the panel being compared must actually have content'
      ).toBeGreaterThan(20)

      expect(
        unregisteredPanel,
        'the rendered response must not differ between a registered and an unregistered address'
      ).toBe(registeredPanel)
      expect(page.url(), 'and must not differ in where it leaves the user').toBe(registeredUrl)

      // The other half: the registered address really did get mail, so the
      // identical panels above are not identical because nothing happened in
      // either case. Without this, a completely broken endpoint would pass.
      await waitForEmailTo(user.email)
      await expectNoEmailTo(unregistered)
    } finally {
      await deleteTestUser(user.id)
    }
  })

  /**
   * US-003 AC2, as a user experiences it.
   *
   * The limit's real coverage — that it admits exactly the policy limit, that
   * varying the requested address does not reset it, that one client cannot
   * spend another's budget — is in the integration suite, for the reasons at the
   * top of this file. What is missing there is the browser half: that tripping
   * the limit produces a bounded, comprehensible page rather than an unhandled
   * error, and that it sends no mail.
   *
   * This test pins one client address for all of its requests, unlike every
   * other test here, because exhausting a single budget is the point.
   */
  test('exhausting the request limit is refused visibly and sends no mail', async ({ page }) => {
    const target = `throttled-${Date.now()}@example.test`

    // One address, held for the whole test.
    await useFreshClientAddress(page)
    await page.goto('/en/forgot-password')

    // Submit until the endpoint refuses, waiting on the actual HTTP response
    // rather than on whatever appears on screen.
    //
    // The first version of this test raced the render instead, and matched the
    // ToastProvider's own `[role="alert"]` container — which is in the root
    // layout, present on every page, and empty. It "found" an alert with no text
    // and failed on the assertion below rather than on the thing it was checking.
    // Two lessons, both worth keeping: wait for the response that decides the
    // outcome, and scope a `role="alert"` query to the form it belongs to.
    //
    // Exactly where the boundary sits is the integration suite's assertion, so
    // this loop only needs an upper bound generous enough to reach it.
    const MAX_ATTEMPTS = 8
    let refusedAtAttempt: number | null = null

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await page.goto('/en/forgot-password')
      await page.fill('#email', target)

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes('/api/auth/password-reset') && r.request().method() === 'POST',
          { timeout: 20_000 }
        ),
        page.click('button[type="submit"]'),
      ])

      if (response.status() === 429) {
        refusedAtAttempt = attempt
        break
      }
      expect(
        response.status(),
        'an admitted request must be the ordinary accepted response'
      ).toBe(202)
    }

    expect(
      refusedAtAttempt,
      `the limit must be reached within ${MAX_ATTEMPTS} requests from one address`
    ).not.toBeNull()

    // The refusal has to reach the user. A 429 the page swallows leaves someone
    // waiting for mail that was never requested.
    const alert = page.locator('form [role="alert"]')
    await expect(
      alert,
      'a caller past the limit must be told so'
    ).toBeVisible({ timeout: 20_000 })

    // Bounded and non-enumerating: it talks about the caller's own request rate
    // and says nothing about whether the address has an account.
    const throttleMessage = await alert.innerText()
    expect(throttleMessage.toLowerCase()).toContain('too many')
    expect(throttleMessage).not.toContain(target)

    // And no mail was sent to the address being hammered. This is the half that
    // makes the limit worth having: the refusal has to happen before Supabase is
    // asked to send anything.
    await expectNoEmailTo(target)
  })

  /**
   * US-002 AC4, the three refusal cases.
   *
   * All three must produce the same panel. That is not laziness about error
   * messages: "this token does not exist" and "this token expired" are
   * distinguishable to GoTrue, and telling them apart tells someone holding a
   * guessed token that the guess was structurally right.
   */
  test.describe('a link that cannot be used', () => {
    test('a consumed link is refused the second time', async ({ page }) => {
      const user = await createTestUser()
      try {
        await purgeMailbox()
        await requestRecovery(page, user.email, 'en')
        const recoveryLink = extractRecoveryLink(await waitForEmailTo(user.email))

        // Spend it properly, by completing a reset. A link that was merely
        // opened and abandoned is a weaker case, and the one that matters is
        // the link in an old email after the user has already recovered.
        await followRecoveryLink(page, recoveryLink)
        await page.fill('#password', NEW_PASSWORD)
        await page.fill('#confirmPassword', NEW_PASSWORD)
        await page.click('button[type="submit"]')
        await expect(page.locator('a[href="/en/login"]')).toBeVisible({ timeout: 20_000 })

        // Now the same link again.
        await followRecoveryLink(page, recoveryLink)
        await expect(
          page.locator('#password'),
          'a consumed link must NOT produce a password form'
        ).toHaveCount(0)
        await expect(
          page.locator('a[href="/en/forgot-password"]'),
          'and must offer a way to get a new link'
        ).toBeVisible()
      } finally {
        await deleteTestUser(user.id)
      }
    })

    /**
     * The fragments GoTrue produces for a refused token, and the ones an
     * attacker would try, without spending an email on any of them.
     *
     * Navigating straight to the reset page with a chosen fragment is exactly
     * what a browser does after GoTrue's 303 — the fragment never reaches the
     * server, so there is no difference between arriving this way and arriving
     * from a real link. `#error=…&error_code=otp_expired` is the verbatim
     * fragment measured from a second use of a real recovery link.
     */
    const UNUSABLE_FRAGMENTS: ReadonlyArray<readonly [string, string]> = [
      ['no fragment at all', ''],
      [
        "GoTrue's refusal",
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ],
      ['a forged grant', '#access_token=not.a.token&refresh_token=nope&type=recovery'],
      ['a truncated grant', '#access_token=not.a.token&type=recovery'],
      ['a magic-link grant', '#access_token=not.a.token&refresh_token=nope&type=magiclink'],
      ['a PKCE-style code', '#code=abc123'],
    ]

    for (const [description, fragment] of UNUSABLE_FRAGMENTS) {
      test(`${description} is refused`, async ({ page }) => {
        await page.goto(`/en/reset-password${fragment}`)

        await expect(
          page.locator('a[href="/en/forgot-password"]'),
          'the page must settle into the invalid-link panel'
        ).toBeVisible({ timeout: 30_000 })

        await expect(
          page.locator('#password'),
          'no password form may be offered without a valid recovery grant'
        ).toHaveCount(0)
      })
    }

    /**
     * FR-8, and the reason the reset page does not use the app's own Supabase
     * client.
     *
     * An already-signed-in visitor must get the invalid-link panel, not a form.
     * If this page ever fell back to the ambient session, it would become a
     * "change my password without knowing it" surface — which is a real feature,
     * but one that belongs behind a re-authentication prompt in account
     * settings, and is explicitly out of scope here.
     */
    test('an authenticated session does not unlock the form', async ({ page }) => {
      const user = await createTestUser()
      try {
        await page.goto('/en/login')
        await page.fill('#email', user.email)
        await page.fill('#password', TEST_PASSWORD)
        await page.click('button[type="submit"]')
        await page.waitForURL(/\/en\/dashboard/, { timeout: 30_000 })

        await page.goto('/en/reset-password')
        await expect(
          page.locator('a[href="/en/forgot-password"]'),
          'a signed-in visitor with no recovery link must see the invalid-link panel'
        ).toBeVisible({ timeout: 30_000 })
        await expect(page.locator('#password')).toHaveCount(0)

        // And the session is still intact: this page must not have signed the
        // user out as a side effect of refusing them.
        await page.goto('/en/dashboard')
        await expect(page).toHaveURL(/\/en\/dashboard/)
      } finally {
        await deleteTestUser(user.id)
      }
    })

    /**
     * The recovery grant must not become an app session.
     *
     * The single most valuable thing in this file after the happy path. GoTrue's
     * recovery session is an ordinary `aal1` session — measured: the access
     * token's `amr` claim is `otp` and nothing marks it as restricted — so if the
     * reset page persisted it, clicking a link in an email would sign the
     * recipient in with full access to the account. That is a complete
     * authentication bypass wearing the costume of a convenience.
     *
     * Asserted on the consequence rather than on the configuration: after
     * landing on a valid recovery link, a protected page must still redirect to
     * login.
     */
    test('a recovery link does not sign the visitor in', async ({ page, context }) => {
      const user = await createTestUser()
      try {
        await purgeMailbox()
        await requestRecovery(page, user.email, 'en')
        const recoveryLink = extractRecoveryLink(await waitForEmailTo(user.email))

        await followRecoveryLink(page, recoveryLink)
        await expect(page.locator('#password')).toBeVisible()

        // No session cookie was written by consuming the link.
        const authCookie = (await context.cookies()).find(
          (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
        )
        expect(
          authCookie,
          'consuming a recovery link must not write an app session cookie'
        ).toBeUndefined()

        // And the app agrees, which is the assertion that would still hold if
        // the session were ever stored somewhere other than a cookie.
        await page.goto('/en/dashboard')
        await expect(
          page,
          'a recovery grant must not admit the holder to a protected page'
        ).toHaveURL(/\/en\/login/)
      } finally {
        await deleteTestUser(user.id)
      }
    })
  })

  /**
   * US-002 AC5: a password Supabase will not accept must say so, in the user's
   * language.
   *
   * The client-side rule (8 characters, matching the signup form) is stricter
   * than Supabase's `minimum_password_length = 6`, so this exercises the local
   * rule. The GoTrue-rejected case cannot be reached from here without
   * loosening the client rule, which would be changing the product to suit the
   * test; the mapping from `weak_password` to a localised message is covered by
   * reading the handler, and is recorded as a limitation rather than claimed.
   */
  test('a too-short password is refused in the page’s own locale', async ({ page }) => {
    const user = await createTestUser()
    try {
      await purgeMailbox()
      await requestRecovery(page, user.email, 'fr')
      const recoveryLink = extractRecoveryLink(await waitForEmailTo(user.email))

      await followRecoveryLink(page, recoveryLink)
      await page.fill('#password', 'court')
      await page.fill('#confirmPassword', 'court')
      await page.click('button[type="submit"]')

      await expect(
        page.locator('#password-error'),
        'a rejected password must be explained'
      ).toBeVisible()
      await expect(
        page.locator('#password-error'),
        'and explained in French, not in English'
      ).toContainText('caractères')

      // Nothing changed: the old password must still work, because a refused
      // submission must not half-apply.
      expect(await canSignIn(user.email, TEST_PASSWORD)).toBe(true)
    } finally {
      await deleteTestUser(user.id)
    }
  })

  test('mismatched confirmation is refused', async ({ page }) => {
    const user = await createTestUser()
    try {
      await purgeMailbox()
      await requestRecovery(page, user.email, 'en')
      const recoveryLink = extractRecoveryLink(await waitForEmailTo(user.email))

      await followRecoveryLink(page, recoveryLink)
      await page.fill('#password', NEW_PASSWORD)
      await page.fill('#confirmPassword', `${NEW_PASSWORD}-different`)
      await page.click('button[type="submit"]')

      await expect(page.locator('#confirm-password-error')).toBeVisible()
      expect(
        await canSignIn(user.email, TEST_PASSWORD),
        'a mismatched confirmation must not change the password'
      ).toBe(true)
    } finally {
      await deleteTestUser(user.id)
    }
  })
})

/**
 * The link on the login page used to 404, and its RSC prefetch 404ed on every
 * single login-page visit. That noise is why
 * `e2e/cover-letter-pdf-export.spec.ts` filters console errors.
 *
 * This asserts the noise is gone, which is the observable half of US-001 AC5 and
 * the precondition for ever tightening that filter.
 */
test('visiting the login page no longer produces a 404 for the recovery route', async ({ page }) => {
  const notFound: string[] = []
  page.on('response', (response) => {
    if (response.status() === 404 && response.url().includes('forgot-password')) {
      notFound.push(response.url())
    }
  })

  await page.goto('/en/login')
  // Hovering is what triggers Next's prefetch for a link that was not prefetched
  // on load, so this covers both moments.
  await page.hover('a[href="/en/forgot-password"]')
  await page.waitForTimeout(2_000)

  expect(notFound, 'nothing about /forgot-password may 404 from the login page').toEqual([])
})
