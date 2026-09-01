import { test, expect, createTestUser, deleteTestUser, TEST_PASSWORD } from './fixtures/auth'
import { test as base, expect as baseExpect } from '@playwright/test'

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
