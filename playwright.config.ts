import { defineConfig, devices } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_ANON_KEY,
  assertLocalSupabase,
} from './src/test/local-stack'

/**
 * E2E configuration.
 *
 * These tests drive a real browser against a real Next.js server talking to
 * the real local Supabase stack. They cover the one layer the integration
 * suite deliberately does not: cookie and session translation, middleware, and
 * anything that only exists once a page is rendered.
 *
 *   pnpm supabase start
 *   pnpm test:e2e
 *
 * THE SAFETY PROPERTY THAT MATTERS
 *
 * The app reads `.env.local`, which points at a deployed Supabase project.
 * These tests create and delete users. Running them against that project would
 * create real users in production.
 *
 * Next.js does not overwrite variables already present in `process.env`, so
 * the `webServer.env` block below wins over `.env.local` and pins the server
 * to the local stack. `assertLocalSupabase` then fails the run outright if
 * anything has overridden that with a non-local host - belt and braces,
 * because the cost of being wrong here is production data.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E tests')

const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Agent worktrees under .claude/ hold a full duplicate copy of the repo.
  // Without this every spec would be collected twice, as happened to lint and
  // to the unit suite before they were excluded.
  testIgnore: ['**/node_modules/**', '**/.claude/**', '**/.next/**'],

  timeout: 90_000,
  expect: { timeout: 15_000 },

  // A test that only passes on retry is not passing. Retries would hide
  // exactly the flakiness that makes a required check worse than no check.
  retries: 0,
  workers: 1,

  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // A production build, not `next dev`, and a dedicated .next-e2e directory.
    //
    // Both are here for determinism rather than realism. Running against dev
    // produced intermittent 500s - "SyntaxError: Unexpected end of JSON input"
    // from the server, and a bare "Internal Server Error" page in the browser -
    // because successive runs each started a dev server writing to the same
    // .next cache. Two tests failed on one run and passed on the next with no
    // code change between them.
    //
    // A flaky required check is worse than no check, so this trades a slower
    // start for a server that behaves the same way every time. It also removes
    // on-demand route compilation, which was the reason the timeouts here had
    // to be so generous.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    // Never reuse. Reuse is what let a half-dead server from a previous run
    // answer the health check and then fail the tests.
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NEXTAUTH_URL: BASE_URL,
      // A separate build directory so an E2E run never shares .next with a
      // dev server the developer already has open - the collision that caused
      // the cache corruption above.
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
})
