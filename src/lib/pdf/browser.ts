import { chromium, type Browser } from 'playwright-core'

/**
 * Where the resume PDF renderer gets its Chromium from. The ONE place.
 *
 * Everything else about the render — the page, the network policy, the print
 * options — lives in `render-preview.ts` and does not depend on which binary
 * runs it. Locally and in CI this is the Chromium Playwright already installs
 * for the e2e suite (`playwright-core` is pinned to the same version as
 * `@playwright/test`, so it resolves the same browser revision). A serverless
 * runtime that ships its own Chromium build changes this module — an
 * `executablePath`, its launch arguments, `sandbox: false` — and nothing else.
 */

/**
 * The environment variables Chromium is started with: what it needs to find
 * system libraries, a temporary directory, a profile home, fonts and the
 * locale. Nothing else is passed.
 *
 * Playwright otherwise hands the browser the server's ENTIRE `process.env` —
 * the Supabase service key, the AI provider key, every deployment secret —
 * and a renderer process is the last place they belong. An allowlist rather
 * than a denylist, so a secret added to the deployment later cannot leak by
 * having an unforeseen name.
 */
export const CHROMIUM_ENV_ALLOWLIST: readonly string[] = Object.freeze([
  // Executable and library lookup.
  'PATH',
  'LD_LIBRARY_PATH',
  // Windows system locations Chromium resolves at startup.
  'SystemRoot',
  'SYSTEMROOT',
  'windir',
  'SystemDrive',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'CommonProgramFiles',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  // Temporary files and the throwaway profile's home.
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'LOCALAPPDATA',
  'APPDATA',
  // Fonts and text: what decides the glyphs and line breaks of the PDF.
  'FONTCONFIG_PATH',
  'FONTCONFIG_FILE',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_DIRS',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
])

/** The allowlisted subset of `env`, with no empty values. */
export function chromiumEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of CHROMIUM_ENV_ALLOWLIST) {
    const value = env[name]
    if (value !== undefined && value !== '') result[name] = value
  }
  return result
}

export interface LaunchPdfBrowserOptions {
  /** How long the launch itself may take: what remains of the render's budget. */
  timeoutMs: number
  /**
   * Run Chromium's own process sandbox. On by default, and it works on the
   * Windows, macOS and Linux desktops and CI runners this is developed and
   * tested on. Serverless Linux runtimes typically cannot provide it (no user
   * namespaces); a deployment there sets it to `false` here, deliberately,
   * leaning instead on the network policy and the per-request browser.
   */
  sandbox?: boolean
}

export async function launchPdfBrowser({ timeoutMs, sandbox = true }: LaunchPdfBrowserOptions): Promise<Browser> {
  // Playwright's defaults already run a throwaway profile with no extensions
  // and no first-run UI; no flag is added, so the render matches the print the
  // e2e suite takes with the same browser.
  return chromium.launch({
    headless: true,
    chromiumSandbox: sandbox,
    env: chromiumEnv(process.env),
    timeout: timeoutMs,
  })
}
