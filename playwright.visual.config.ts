import { defineConfig, devices } from '@playwright/test'
import { LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, assertLocalSupabase } from './src/test/local-stack'

/**
 * Visual regression configuration.
 *
 * Separate from `playwright.config.ts` rather than a second project inside it,
 * for three reasons:
 *
 *   - The screenshot settings here (device scale factor, animation handling,
 *     diff thresholds) are wrong for the functional suite and would quietly
 *     change how those tests behave.
 *   - A baseline update run (`--update-snapshots`) must not be able to touch
 *     the functional suite.
 *   - The two suites need separate ports and build directories so one can be
 *     re-run without disturbing the other.
 *
 *   pnpm supabase start
 *   pnpm test:visual
 *
 * The same production-build-not-dev-server reasoning as the functional config
 * applies, and for the same measured reason: successive dev servers sharing a
 * .next cache produced intermittent 500s.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY

assertLocalSupabase(SUPABASE_URL, 'Visual regression tests')

const PORT = Number(process.env.VISUAL_PORT ?? 3110)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/visual',
  testIgnore: ['**/node_modules/**', '**/.claude/**', '**/.next/**'],

  // Baselines live beside the spec under a per-platform name. The platform
  // segment is not optional: Windows and Linux rasterise text differently, so
  // a shared baseline would fail on whichever machine did not create it, and
  // the only way to make it pass would be a threshold loose enough to hide
  // real layout regressions.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',

  timeout: 120_000,
  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      // Tight on purpose. The fixture is fully deterministic and animations
      // are disabled, so the only expected variance is antialiasing jitter on
      // glyph edges. 120 pixels of an ~816x1100 document is about 0.013% -
      // enough to absorb that, far too little to absorb a moved element.
      //
      // If this ever needs raising, the correct response is to find what
      // became nondeterministic, not to widen the tolerance.
      maxDiffPixels: 120,
      // Per-pixel channel tolerance. 0.2 ignores near-identical greys from
      // subpixel rendering while still catching a colour change.
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  // A screenshot test that only passes on retry is not passing; it means the
  // page has not settled and the baseline is a coin flip.
  retries: 0,
  workers: 1,

  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'off',
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    // Viewport and deviceScaleFactor are pinned in the project below, not
    // here: the project's `use` wins, so setting them at this level has no
    // effect at all.
    // The document is rendered in English; the fixture content is not
    // translated, so locale would only affect date and label formatting.
    locale: 'en-GB',
    timezoneId: 'UTC',
    colorScheme: 'light',
  },

  // The viewport is set HERE, after the device spread, not in the top-level
  // `use` block. Project-level `use` overrides config-level `use`, so a
  // viewport declared above is silently replaced by Desktop Chrome's 1280x720
  // - which is what truncated the first set of baselines. Measured, not
  // assumed: the spec's truncation guard reported the effective height as 720
  // while the config above said otherwise.
  //
  // 2600 clears the tallest template (minimal, at 1711px) with room for the
  // documents to grow.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 2600 },
        deviceScaleFactor: 1,
      },
    },
  ],

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
      NEXT_DIST_DIR: '.next-visual',
    },
  },
})
