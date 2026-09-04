import { test as base, type Page, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_ANON_KEY,
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
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY
// The anon key is needed for one thing only: minting a session outside the
// browser in `mintExpiredRevokedSessionCookie`. Every other sign-in in this
// suite goes through the real login form, which uses the key the app was
// built with.
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E auth fixture')

/**
 * The cookie name Supabase stores the session under, derived exactly as
 * supabase-js derives it: `sb-${hostname.split('.')[0]}-auth-token`. Against
 * the local stack at 127.0.0.1 that is `sb-127-auth-token`.
 *
 * Derived rather than hardcoded so that pointing the suite at a different
 * local host does not leave a test silently asserting on a cookie name nothing
 * writes - which would pass for the wrong reason.
 */
export const AUTH_COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

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
 * Build the auth cookie of a user whose session has EXPIRED and whose refresh
 * token has been REVOKED, ready to be injected with `context.addCookies`.
 *
 * That precise combination is the whole point. @supabase/ssr only queues a
 * cookie removal when it holds a session it must refresh and the refresh is
 * rejected by the auth server. A merely malformed or truncated cookie produces
 * no cookie operations at all - measured, not assumed - so a test built on one
 * would behave identically against fixed and broken middleware and prove
 * nothing.
 *
 * So the session is real: minted with the anon key exactly as the browser
 * would, then killed server-side with a global admin sign-out, which is what
 * makes the refresh token genuinely rejected rather than merely stale. Only
 * `expires_at` is falsified, and only to skip the hour of waiting that would
 * otherwise be required for the client to decide a refresh is due.
 */
export async function mintExpiredRevokedSessionCookie(
  user: TestUser
): Promise<{ name: string; value: string }> {
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await anon.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  })
  if (error || !data.session) {
    throw new Error(`Could not mint a session: ${error?.message ?? 'no session returned'}`)
  }

  // Revoke it. Without this the refresh below would SUCCEED, the middleware
  // would set a fresh cookie instead of removing one, and the test would be
  // exercising a different code path than the one under test.
  const { error: revokeError } = await admin().auth.admin.signOut(data.session.access_token, 'global')
  if (revokeError) {
    throw new Error(`Could not revoke the minted session: ${revokeError.message}`)
  }

  const expired = {
    ...data.session,
    expires_at: Math.floor(Date.now() / 1000) - 3600,
    expires_in: -3600,
  }

  // `base64-` + base64url is the storage encoding @supabase/ssr writes and
  // reads (cookieEncoding defaults to "base64url" in createServerClient).
  const value = `base64-${Buffer.from(JSON.stringify(expired), 'utf-8').toString('base64url')}`

  // Above MAX_CHUNK_SIZE, @supabase/ssr splits the value across `${key}.0`,
  // `${key}.1`, ... and a single cookie under the base name would then be read
  // back as nothing at all. Measured at ~2600 characters, so this is headroom,
  // not a live concern - but it must fail loudly rather than quietly turn this
  // test into one that asserts against an unauthenticated request.
  const MAX_CHUNK_SIZE = 3180
  if (encodeURIComponent(value).length > MAX_CHUNK_SIZE) {
    throw new Error(
      `The session cookie is ${encodeURIComponent(value).length} characters and would be ` +
        `chunked by @supabase/ssr; this helper writes a single unchunked cookie.`
    )
  }

  return { name: AUTH_COOKIE_NAME, value }
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

  // Wait for the redirect the form itself performs. The fixture deliberately
  // does not navigate on the form's behalf: doing so would hide a regression
  // in the post-login redirect from every test that logs in.
  await page.waitForURL(new RegExp(`/${locale}/dashboard`), { timeout: 30_000 })
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
