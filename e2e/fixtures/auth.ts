import { test as base, type Page, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../../src/test/local-stack'

/**
 * Authenticated-session fixture.
 *
 * A user is created through the admin API, then signed in by driving the real
 * login form in the browser. Injecting a session cookie would be faster, but
 * the cookie and session plumbing is precisely the layer the integration suite
 * could not reach - stubbing it here would leave it untested at every level.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
// Only the service key is needed here: users are created and deleted through
// the admin API, and signing in happens in the browser with the anon key the
// app itself was built with.
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E auth fixture')

export const TEST_PASSWORD = 'e2e-test-password-1234'

export interface TestUser {
  id: string
  email: string
  password: string
}

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

let seq = 0

/** Create a confirmed user. The caller owns cleanup. */
export async function createTestUser(): Promise<TestUser> {
  const email = `e2e-${Date.now()}-${seq++}@example.test`
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`Could not create E2E user: ${error?.message ?? 'no user returned'}`)
  }
  return { id: data.user.id, email, password: TEST_PASSWORD }
}

/** Delete a user. Owned rows follow by ON DELETE CASCADE. */
export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id)
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`Could not delete E2E user ${id}: ${error.message}`)
  }
}

/**
 * Sign in through the real form and wait for the post-login redirect.
 *
 * Selectors are `#email`, `#password` and `button[type="submit"]`. The button
 * is addressed by type rather than by its label, which is translated into four
 * locales - matching on text would make this suite silently locale-dependent.
 */
export async function loginAs(page: Page, user: TestUser, locale = 'en'): Promise<void> {
  await page.goto(`/${locale}/login`)
  await page.fill('#email', user.email)
  await page.fill('#password', user.password)
  await page.click('button[type="submit"]')

  // Wait for the session cookie rather than for the redirect.
  //
  // WORKAROUND for a real application bug, not a test convenience. The form's
  // router.push() fires before signInWithPassword has persisted the cookie, so
  // the RSC request for the dashboard goes out unauthenticated, the dashboard
  // layout's getUser() finds nothing and redirects back to /login - and
  // nothing retries. Measured: the cookie lands at ~558ms while the URL is
  // still /login at 3.6s and stays there.
  //
  // The session itself is valid throughout: an explicit navigation reaches the
  // dashboard immediately and survives a reload. So this waits for the real
  // signal and then navigates itself.
  //
  // See the `test.fixme` in e2e/auth.spec.ts, which documents the broken
  // redirect without asserting it is correct. Remove this workaround when that
  // starts passing.
  await page.waitForFunction(
    () => document.cookie.split(';').some((c) => c.trim().startsWith('sb-') && c.includes('auth-token')),
    undefined,
    { timeout: 30_000 }
  )
  await page.goto(`/${locale}/dashboard`)
  await page.waitForURL(new RegExp(`/${locale}/dashboard`), { timeout: 60_000 })
}

/**
 * `test` extended with an `authedUser`: a created, signed-in user, removed
 * afterwards whether the test passed or failed.
 */
export const test = base.extend<{ authedUser: TestUser }>({
  authedUser: async ({ page }, use) => {
    const user = await createTestUser()
    try {
      await loginAs(page, user)
      await use(user)
    } finally {
      await deleteTestUser(user.id)
    }
  },
})

export { expect }
