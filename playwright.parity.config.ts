import { defineConfig, devices } from '@playwright/test'
import { LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, assertLocalSupabase } from './src/test/local-stack'

/**
 * Parity check configuration (US-008).
 *
 *   pnpm supabase start
 *   pnpm test:parity
 *
 * Renders one fixture resume to the Preview, the PDF and the DOCX and compares
 * each against the stored layout model and against the others. See
 * `e2e/parity/parity.spec.ts` for what a verdict means and when the command
 * exits non-zero.
 *
 * NOT PART OF `pnpm test:e2e`, AND NOT A CI GATE
 *
 * The check is expected to fail against the divergences Part 3 enumerates, and
 * to fail outright on any it does not. `playwright.config.ts` ignores
 * `e2e/parity` so that the required suite never collects it.
 *
 * SEPARATE PORT, BUILD DIRECTORY AND OUTPUT DIRECTORY
 *
 * The port and build directory are separate for the reasons
 * `playwright.visual.config.ts` gives: one suite must be re-runnable without
 * disturbing another, and a shared `.next` cache produced intermittent 500s.
 *
 * The output directory is separate because Playwright empties its output
 * directory at the start of a run. The functional and visual configs share
 * `test-results/`, and a run of one wiped the other's failure artifacts during
 * US-007. This suite's observations and report live in `test-results-parity/`.
 *
 * `.next-parity` and `test-results-parity` are listed in `.gitignore` and in
 * `eslint.config.mjs`; a build directory missing from the latter is how lint
 * once went from 311 problems to tens of thousands.
 *
 * INTERMITTENT DOCX EXPORT FAILURES ON THE US-008 MACHINE ARE NOT A DEFECT
 *
 * A collect test can fail on its DOCX request with a 15s client timeout or a
 * server `socket hang up` at about 10s, while every Node event loop freezes.
 * The cause is an OS-level network filter holding HTTP socket writes and closes
 * under concurrent load, most likely AVG Antivirus HTTP inspection (unconfirmed);
 * a raw-socket control under the same load does not stall. Do not absorb it with
 * timeouts, retries or reduced load: that changes what is accepted rather than
 * what is measured, and would hide a real server stall too. A stalled run fails
 * loudly as a collect failure, never as a false verdict; re-run it. Evidence:
 * `tasks/ralph/progress.txt`, under US-008.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY

assertLocalSupabase(SUPABASE_URL, 'Parity check')

const PORT = Number(process.env.PARITY_PORT ?? 3120)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/parity',
  testIgnore: ['**/node_modules/**', '**/.claude/**', '**/.next/**'],
  outputDir: './test-results-parity',

  // A collect test renders one template to three surfaces behind a login.
  timeout: 300_000,
  expect: { timeout: 15_000 },

  // Rows read what the collect tests wrote, so the order of execution matters:
  // one worker, declaration order. No retries — a measurement that only holds
  // on the second attempt is not a measurement.
  retries: 0,
  workers: 1,
  fullyParallel: false,

  forbidOnly: !!process.env.CI,
  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    // Dates in the templates are built from `YYYY-MM-01` strings; a timezone
    // west of UTC would render the previous month.
    timezoneId: 'UTC',
    colorScheme: 'light',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NEXTAUTH_URL: BASE_URL,
      NEXT_DIST_DIR: '.next-parity',
    },
  },
})
