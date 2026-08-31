/**
 * Connection details for the local Supabase stack, shared by the integration
 * suite and the E2E suite.
 *
 * These live in one module rather than in each suite because both are
 * destructive - they create and delete users - and a drifted copy is how one
 * of them would end up pointed somewhere it should not be.
 *
 * The keys are Supabase's published local development defaults. They are
 * identical on every machine, are not secrets, and are useless against any
 * hosted project.
 */

export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'

export const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/**
 * Throw unless `url` is unambiguously local.
 *
 * This is the enforcement behind "never point destructive tests at a deployed
 * environment", and it matters more for E2E than for the integration suite:
 * the app reads `.env.local`, which points at a real project, so an E2E run
 * that failed to override it would create and delete users in production.
 */
export function assertLocalSupabase(url: string, context: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`${context}: refusing to run against malformed URL "${url}"`)
  }
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(
      `${context}: refusing to run against non-local host "${host}". ` +
        `These tests create and delete users. Start the local stack with ` +
        `"pnpm supabase start" and leave the Supabase environment variables unset.`
    )
  }
}
