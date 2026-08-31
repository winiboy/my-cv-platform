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
 * KNOWN BUG, found by this suite. Marked fixme so it is recorded without
 * being asserted as correct and without turning the suite red.
 *
 * A successful login does not land the user on the dashboard. The form calls
 * router.push() as soon as signInWithPassword resolves, but the auth cookie
 * has not been persisted yet, so the RSC request for the dashboard is
 * unauthenticated, the layout redirects to /login, and nothing retries.
 *
 * Measured against the local stack:
 *
 *     t+   47ms  cookie=no   url=/en/login
 *     t+  558ms  cookie=YES  url=/en/login
 *     t+ 3613ms  cookie=YES  url=/en/login     <- never leaves
 *     explicit goto /en/dashboard              -> holds, survives reload
 *
 * The session is valid the whole time. The user is signed in and stuck on the
 * login form. In production this may be intermittent rather than reliable,
 * since it is a race - which makes it the kind of defect that is easy to
 * dismiss as a one-off report.
 *
 * Fixing it is a change to production behaviour and needs its own PRD, so it
 * is out of scope here. When it is fixed this test starts passing, Playwright
 * reports the unexpected pass, and the workaround in fixtures/auth.ts should
 * be removed with it.
 */
base.fixme('a successful login lands on the dashboard by itself', async ({ page }) => {
  const user = await createTestUser()
  try {
    await page.goto('/en/login')
    await page.fill('#email', user.email)
    await page.fill('#password', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/en\/dashboard/, { timeout: 15_000 })
  } finally {
    await deleteTestUser(user.id)
  }
})
