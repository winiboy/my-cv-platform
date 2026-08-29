/**
 * Integration-test helpers for the local Supabase stack.
 *
 * These tests run real SQL against a real database. Every helper here is
 * destructive by design: it creates and deletes users and their owned rows.
 *
 * The stack is the one started by `pnpm supabase start`. The keys below are
 * the well-known local development defaults, identical on every machine and
 * published in the Supabase documentation. They are not secrets, and they are
 * useless against any hosted project.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const LOCAL_URL = 'http://127.0.0.1:54321'

const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_URL
export const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY
const SUPABASE_SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

/**
 * Refuse to run against anything that is not unambiguously local.
 *
 * `.claude/rules/testing.md` and roadmap Phase 11 both require that
 * destructive integration tests never point at a deployed environment. This
 * is the enforcement, not a convention: these helpers delete users.
 */
function assertLocal(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`Refusing to run integration tests: malformed URL ${url}`)
  }
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(
      `Refusing to run integration tests against non-local host "${host}". ` +
        `These tests create and delete users. Point TEST_SUPABASE_URL at a ` +
        `local stack (pnpm supabase start) or leave it unset.`
    )
  }
}

assertLocal(SUPABASE_URL)

/** Service-role client. Bypasses RLS — use only for fixture setup and teardown. */
export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export interface TestUser {
  id: string
  email: string
  /** Anon-key client authenticated as this user. Subject to RLS, like the app. */
  client: SupabaseClient<Database>
}

let seq = 0

/**
 * Create a confirmed user and return a client authenticated as them.
 *
 * Emails are unique per call so tests never collide, and the caller owns
 * cleanup via `deleteTestUser`.
 */
export async function createTestUser(): Promise<TestUser> {
  const admin = adminClient()
  const email = `it-${Date.now()}-${seq++}@example.test`
  const password = 'integration-test-password'

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`Could not create test user: ${error?.message ?? 'no user returned'}`)
  }

  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(`Could not sign in test user: ${signInError.message}`)
  }

  return { id: data.user.id, email, client }
}

/** Delete a test user. Owned rows go with them by ON DELETE CASCADE. */
export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id)
  // A user the test already removed is not a failure.
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`Could not delete test user ${id}: ${error.message}`)
  }
}

/**
 * Fail fast with an actionable message when the stack is not running, rather
 * than letting every test fail with an opaque fetch error.
 */
export async function assertStackReachable(): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    })
    if (!res.ok && res.status !== 404) {
      throw new Error(`status ${res.status}`)
    }
  } catch (err) {
    throw new Error(
      `Local Supabase stack is not reachable at ${SUPABASE_URL}. ` +
        `Start it with "pnpm supabase start" before running integration tests. ` +
        `(${err instanceof Error ? err.message : String(err)})`
    )
  }
}
