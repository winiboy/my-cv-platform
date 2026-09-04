import {
  test,
  expect,
  createTestUser,
  deleteTestUser,
  mintExpiredRevokedSessionCookie,
  AUTH_COOKIE_NAME,
  TEST_PASSWORD,
} from './fixtures/auth'
import { test as base, expect as baseExpect, type Page } from '@playwright/test'

/**
 * The first real E2E flow: authentication.
 *
 * This is the layer the integration suite deliberately does not reach. Those
 * tests replace `createServerSupabaseClient`, so everything from the browser to
 * that seam - the login form, the Supabase client in the browser, the cookies
 * it writes, and the server reading them back - had never been executed by any
 * test before this file.
 */

test.describe('authenticated session', () => {
  // `authedUser` must be requested even where the test body does not use it:
  // Playwright only runs a fixture that a test asks for, so dropping it here
  // silently skips the login and the test then asserts against an anonymous
  // page. That is what happened on the first run of this file.
  test('the session survives a full page load', async ({ page, authedUser }) => {
    await expect(page).toHaveURL(/\/en\/dashboard/)

    // The real assertion. A cookie existing proves only that the browser wrote
    // one; this proves the server reads it back and honours it. Without the
    // reload, this test would pass on a client-side route change with no
    // server-side session behind it at all.
    await page.reload()
    await expect(page).toHaveURL(/\/en\/dashboard/)
  })

  test('the session carries to another protected page', async ({ page, authedUser }) => {
    // /en/dashboard/resumes, not /en/resumes: `(dashboard)` is a route group,
    // so the segment appears in the file path but not the URL. The first
    // version of this test navigated to /en/resumes - a 404 - and asserted the
    // URL was /en/resumes, which a 404 satisfies. It passed while testing
    // nothing.
    await page.goto('/en/dashboard/resumes')
    await expect(page).toHaveURL(/\/en\/dashboard\/resumes/)
    // A 404 also leaves the URL alone, so the URL alone is not evidence.
    // Assert the page actually rendered as the authenticated app.
    await expect(page.locator('body')).not.toContainText('404', { timeout: 10_000 })
  })
})

base.describe('unauthenticated access', () => {
  base('protected pages redirect an anonymous visitor to login', async ({ page }) => {
    // No fixture, so no session. This is the negative control for the tests
    // above: without it they would still pass if every page were reachable by
    // anyone.
    //
    // Auth here is defense in depth, and the outermost layer is the one that
    // actually fires: src/middleware.ts redirects unauthenticated requests
    // before any page or layout runs, and then the (dashboard) layout and
    // every page guard again independently.
    //
    // Worth knowing when this test fails: mutating the page guards changes
    // nothing observable, because anonymous requests never reach them. Only
    // mutating the middleware makes this test fail - verified. The page-level
    // guards are additionally enforced by the type system, since the code
    // after each one dereferences `user`.
    for (const path of ['/en/dashboard', '/en/dashboard/resumes']) {
      await page.goto(path)
      await baseExpect(page, `${path} must redirect an anonymous visitor`).toHaveURL(/\/en\/login/)
    }
  })

  base('a wrong password creates no session', async ({ page, context }) => {
    const user = await createTestUser()
    try {
      await page.goto('/en/login')
      await page.fill('#email', user.email)
      await page.fill('#password', 'definitely-not-the-password')
      await page.click('button[type="submit"]')

      // Assert on the cookie, not the URL. A failed login leaves the URL at
      // /login - but so does a SUCCESSFUL one, because of the redirect bug
      // documented below. Only the absence of the cookie distinguishes them.
      await page.waitForTimeout(3_000)
      const cookies = await context.cookies()
      const authCookie = cookies.find((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
      baseExpect(authCookie, 'a rejected login must not write a session cookie').toBeUndefined()
    } finally {
      await deleteTestUser(user.id)
    }
  })

  base('a deleted user can no longer sign in', async ({ page, context }) => {
    // Also proves the fixture's cleanup genuinely removes the account rather
    // than leaving usable credentials behind after every run.
    const user = await createTestUser()
    await deleteTestUser(user.id)

    await page.goto('/en/login')
    await page.fill('#email', user.email)
    await page.fill('#password', TEST_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForTimeout(3_000)
    const cookies = await context.cookies()
    baseExpect(cookies.find((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))).toBeUndefined()
  })
})

/**
 * A dead session must be cleared by the redirect that rejects it.
 *
 * When a session has expired AND its refresh token is rejected, @supabase/ssr
 * queues a removal of the auth cookie on the response `updateSession` builds.
 * The protected-route branch of src/middleware.ts used to return a fresh
 * `NextResponse.redirect`, discarding that removal, so the dead cookie stayed
 * in the browser and every later request paid another failed refresh round
 * trip to Supabase.
 *
 * Two things about this test are load-bearing and neither is optional:
 *
 *  - The session is genuinely expired and genuinely revoked. A malformed or
 *    truncated cookie produces NO cookie operations at all, so a test built on
 *    one passes against the broken middleware too and proves nothing. See
 *    `mintExpiredRevokedSessionCookie`.
 *
 *  - The redirect is NOT followed. /en/login runs the very same middleware,
 *    fails the very same refresh, and - not being a protected route - returns
 *    the Supabase response itself, removal included. So the cookie ends up
 *    cleared one hop later whether or not the defect is fixed. Following the
 *    redirect would therefore make every assertion below pass in both states.
 *    Stopping at the 307 is the entire reason this test discriminates.
 *
 * Asserting on the destination URL would prove nothing either: the redirect is
 * byte-for-byte identical in both states. Only the Set-Cookie distinguishes
 * them.
 */
base.describe('an expired session with a revoked refresh token', () => {
  base('the login redirect clears the dead auth cookie', async ({ context, baseURL }) => {
    const user = await createTestUser()
    try {
      const cookie = await mintExpiredRevokedSessionCookie(user)
      await context.addCookies([{ ...cookie, url: baseURL! }])

      const response = await context.request.get(`${baseURL}/en/dashboard`, { maxRedirects: 0 })

      // Prove the request took the branch under test before asserting on what
      // that branch returned. A 200 here would mean the dead session was
      // somehow accepted; a 404 would mean this test is measuring a page that
      // no longer exists.
      baseExpect(response.status(), 'a dead session must be redirected, not served').toBe(307)
      baseExpect(
        response.headers()['location'],
        'the redirect must be the protected-route login redirect'
      ).toContain('/en/login')

      // headersArray, not headers(): multiple Set-Cookie headers are collapsed
      // into one comma-joined string by headers(), and a cookie value can
      // itself contain a comma, so splitting that back apart is guesswork.
      const setCookieHeaders = response
        .headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value)

      const authCookieHeader = setCookieHeaders.find((h) => h.startsWith(`${AUTH_COOKIE_NAME}=`))

      baseExpect(
        authCookieHeader,
        `the redirect that rejects a dead session must carry Supabase's removal of ` +
          `${AUTH_COOKIE_NAME}; got Set-Cookie: ${JSON.stringify(setCookieHeaders)}`
      ).toBeDefined()

      // Present is not enough - it has to actually expire the cookie rather
      // than re-set it.
      baseExpect(
        authCookieHeader!,
        `${AUTH_COOKIE_NAME} must be expired, not merely re-sent`
      ).toMatch(/(^|;)\s*(max-age=0|expires=)/i)

      // The consequence, in the client the user actually has. This is not a
      // second opinion on the header: because the redirect was not followed,
      // the jar reflects this one response and nothing else.
      const jar = await context.cookies()
      baseExpect(
        jar.find((c) => c.name === AUTH_COOKIE_NAME),
        'the dead cookie must be gone from the browser after the redirect'
      ).toBeUndefined()
    } finally {
      await deleteTestUser(user.id)
    }
  })
})

/**
 * A successful login must land on the dashboard with no further interaction.
 *
 * This was a `fixme` recording a login that never left /login. The mechanism
 * recorded with it - that `router.push()` fires before the auth cookie is
 * persisted - did not survive measurement: the Cookie header on the dashboard
 * RSC request was checked directly and carries the session every time.
 * `_saveSession` writes `document.cookie` synchronously and is awaited before
 * `signInWithPassword` resolves (@supabase/ssr 0.8 browser storage adapter,
 * auth-js 2.87 GoTrueClient), so the cookie cannot be missing at `push()`.
 *
 * The symptom did not reproduce under any of: 12 unthrottled attempts, the
 * dashboard RSC response delayed 0.5-3s, CPU throttled 4x/10x/20x, or the
 * sign-in response delayed 1-3s. So this test is asserting the behaviour, not
 * reproducing a known-failing case - it passed on the unfixed form too. It is
 * kept because the behaviour is worth pinning, but it is NOT a regression test
 * for that defect, and it must not be cited as proof that one was fixed.
 *
 * The three assertions below are one each for the three ways that can be
 * wrong, and they are deliberately not interchangeable:
 *
 *  - the URL, because the symptom was never leaving /login;
 *  - the 10s budget, because a fix that navigates eventually is still a fix
 *    the user experiences as a dead button;
 *  - the reload, because a client-side route change to /dashboard with no
 *    server-readable session behind it satisfies the first two and is still
 *    the bug. Only the reload forces the server to prove it has the session.
 */
base('a successful login lands on the dashboard by itself', async ({ page }) => {
  const user = await createTestUser()
  try {
    await page.goto('/en/login')
    await page.fill('#email', user.email)
    await page.fill('#password', TEST_PASSWORD)

    const submittedAt = Date.now()
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/en\/dashboard/, { timeout: 10_000 })
    const elapsed = Date.now() - submittedAt
    baseExpect(elapsed, 'the dashboard must be reached within 10s of submitting').toBeLessThan(10_000)

    await page.reload()
    await baseExpect(page, 'the destination must survive a reload').toHaveURL(/\/en\/dashboard/)
  } finally {
    await deleteTestUser(user.id)
  }
})

/**
 * Fill and submit the login form. Deliberately does not wait for any
 * particular destination: every test below is about WHERE the form sends the
 * user, so waiting for a destination here would decide the thing under test.
 */
async function submitLogin(page: Page, email: string): Promise<void> {
  await page.fill('#email', email)
  await page.fill('#password', TEST_PASSWORD)
  await page.click('button[type="submit"]')
}

/**
 * Post-login destination: deep links, ?callbackUrl, and open-redirect refusal.
 *
 * Until this suite was written, the middleware wrote its destination as
 * `?redirect=` while the login form read `?callbackUrl=`. Nothing read what
 * the middleware wrote, so a deep link was silently discarded and - more
 * quietly - the form's open-redirect validator was dead code on the middleware
 * path. These tests cover both halves: that the destination now survives, and
 * that making it survive did not open a redirect.
 */
base.describe('post-login destination', () => {
  base('a deep link survives the sign-in detour', async ({ page }) => {
    const user = await createTestUser()
    try {
      // The query string is part of the link. A deep link that comes back
      // without it has not survived - it has been truncated to its path.
      await page.goto('/en/dashboard/resumes?sort=updated')
      await baseExpect(page, 'an anonymous deep link must detour via login').toHaveURL(/\/en\/login/)

      await submitLogin(page, user.email)

      await baseExpect(
        page,
        'signing in must return the user to the originally requested deep link'
      ).toHaveURL(/\/en\/dashboard\/resumes\?sort=updated$/, { timeout: 20_000 })

      // The URL alone is not evidence the page is real - a 404 leaves it
      // alone too. This is the same trap the resumes test above documents.
      await baseExpect(page.locator('body')).not.toContainText('404')
    } finally {
      await deleteTestUser(user.id)
    }
  })

  base('a deep link returns to its own locale, not the default', async ({ page }) => {
    // FR-4. The failure this pins is a /fr/ deep link coming back as /en/,
    // which is exactly what a locale-blind default destination produces.
    const user = await createTestUser()
    try {
      await page.goto('/fr/dashboard/resumes')
      await baseExpect(page, 'a /fr/ deep link must detour via the /fr/ login').toHaveURL(/\/fr\/login/)

      await submitLogin(page, user.email)

      await baseExpect(
        page,
        'a /fr/ deep link must return to /fr/, not /en/'
      ).toHaveURL(/\/fr\/dashboard\/resumes$/, { timeout: 20_000 })
    } finally {
      await deleteTestUser(user.id)
    }
  })

  base('an existing ?callbackUrl entry point still works', async ({ page }) => {
    // AC2. This is a regression guard, not a fix demonstration: ?callbackUrl
    // was always the parameter the form read, so this passes against the
    // unfixed code too. It is here because the fix had the option of renaming
    // the parameter, and renaming it would have broken every marketing tools
    // page silently.
    const user = await createTestUser()
    try {
      await page.goto('/en/login?callbackUrl=%2Fen%2Ftools%2Fcover-letter-checker')
      await submitLogin(page, user.email)

      await baseExpect(
        page,
        '?callbackUrl must still be honoured'
      ).toHaveURL(/\/en\/tools\/cover-letter-checker$/, { timeout: 20_000 })
    } finally {
      await deleteTestUser(user.id)
    }
  })

  base('a failed sign-in with a deep link pending shows the error and stays put', async ({ page }) => {
    // FR-5. Also a regression guard - it passes against the unfixed code,
    // because the destination is only ever consulted after a successful
    // sign-in. It is here because "always go to the remembered destination" is
    // a tempting way to write this fix and would send a user who typed the
    // wrong password onward as though nothing were wrong.
    const user = await createTestUser()
    try {
      await page.goto('/en/dashboard/resumes')
      await baseExpect(page).toHaveURL(/\/en\/login/)
      const loginUrl = page.url()

      await page.fill('#email', user.email)
      await page.fill('#password', 'definitely-not-the-password')
      await page.click('button[type="submit"]')

      await baseExpect(
        page.locator('form div.bg-red-50'),
        'a rejected sign-in must still show the error'
      ).toBeVisible()

      // Still on login, still carrying the pending destination: a failed
      // attempt must not consume the deep link either.
      baseExpect(page.url(), 'a rejected sign-in must not navigate').toBe(loginUrl)
    } finally {
      await deleteTestUser(user.id)
    }
  })

  base('the marketing tools pages still link into login with a callbackUrl', async ({ page }) => {
    // The other half of AC2: the entry point above has to still be generated.
    // Asserting only that the parameter is honoured would pass even if every
    // page had stopped producing it.
    await page.goto('/en/tools/cover-letter-checker')
    const loginLink = page.locator('a[href*="/en/login?callbackUrl="]').first()
    await baseExpect(
      loginLink,
      'the anonymous tools page must offer a login link carrying callbackUrl'
    ).toHaveCount(1)
    await baseExpect(loginLink).toHaveAttribute(
      'href',
      '/en/login?callbackUrl=%2Fen%2Ftools%2Fcover-letter-checker'
    )
  })

  /**
   * AC3/AC4: destinations that are not single-slash relative paths.
   *
   * Every one of these is a real string a browser resolves off-origin, and
   * each is here because it defeats a different naive check:
   *
   *   //evil.test          the textbook protocol-relative form
   *   https://evil.test    an absolute URL
   *   javascript:alert(1)  a non-http scheme
   *   /\evil.test          starts with exactly one '/', yet WHATWG URL
   *                        parsing treats '\' as '/' - so this resolves to
   *                        http://evil.test/
   *   /<TAB>/evil.test     travels the wire as %09 and comes back decoded; a
   *                        URL parser strips tab BEFORE parsing, leaving the
   *                        protocol-relative //evil.test. /<LF>/ and /<CR>/
   *                        are the same class and are listed separately
   *                        because "the same class" is an argument, and the
   *                        point of this list is to stop arguing.
   *   //evil.test/%2e%2e   protocol-relative with an encoded traversal tail
   *   /.//evil.test        the dot-segment class, and the subtlest of the lot.
   *   /..//evil.test       Every one of these IS same-origin when parsed - the
   *                        leading single slash makes it path-relative, so an
   *                        origin check on the parsed URL passes honestly. The
   *                        danger appears only when the parsed URL is
   *                        SERIALIZED BACK to a string: dot-segment
   *                        normalization collapses these to the pathname
   *                        "//evil.test", which is protocol-relative again the
   *                        next time anything resolves it.
   *
   * That last class is here because a previous version of this fix introduced
   * it. The validator reconstructed its return value as
   * `pathname + search + hash` and checked only the intermediate URL object,
   * so it validated one representation and returned a different one. The old
   * code was safe on all six; the new code escaped on all six. Anything that
   * reconstructs a destination must re-check what it reconstructed.
   *
   * Note the tab is a real character here, not the text "%09". Written
   * literally, "%09" survives one round of decoding as the three characters
   * '%', '0', '9' and stays a harmless same-origin path - it is not this bug,
   * and an earlier draft of this list tested that harmless string by mistake.
   */
  const HOSTILE_DESTINATIONS = [
    '//evil.test',
    'https://evil.test',
    'javascript:alert(1)',
    '/\\evil.test',
    '/\t/evil.test',
    '/\n/evil.test',
    '/\r/evil.test',
    '//evil.test/%2e%2e',
    '/.//evil.test',
    '/..//evil.test',
  ]

  for (const destination of HOSTILE_DESTINATIONS) {
    // JSON.stringify so a tab in the destination shows up as \t in the test
    // name instead of silently widening the output.
    base(`a hostile destination is refused: ${JSON.stringify(destination)}`, async ({ page, context }) => {
      // Nothing may actually leave for evil.test. Aborting rather than
      // letting DNS fail also keeps the failure fast and identical on every
      // machine, instead of depending on how the network resolves a name that
      // does not exist.
      // Match on the hostname, never on the URL as a string: several of these
      // destinations appear verbatim inside the ?callbackUrl of a perfectly
      // ordinary same-origin request to /en/login, and a substring matcher
      // aborts that request instead - which is how the first version of this
      // test "failed" for a reason that had nothing to do with the app.
      const offOriginAttempts: string[] = []
      await context.route(
        (url) => url.hostname === 'evil.test' || url.hostname.endsWith('.evil.test'),
        (route) => {
          offOriginAttempts.push(route.request().url())
          return route.abort()
        }
      )

      const user = await createTestUser()
      try {
        await page.goto(`/en/login?callbackUrl=${encodeURIComponent(destination)}`)
        await submitLogin(page, user.email)

        await baseExpect(
          page,
          `${JSON.stringify(destination)} must be refused and fall back to the default destination`
        ).toHaveURL(/\/en\/dashboard$/, { timeout: 20_000 })

        baseExpect(
          offOriginAttempts,
          `${JSON.stringify(destination)} must not cause any request to leave for evil.test`
        ).toEqual([])
      } finally {
        await deleteTestUser(user.id)
      }
    })
  }
})
