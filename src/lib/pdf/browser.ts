import { chromium, type Browser, type LaunchOptions } from 'playwright-core'

/**
 * Where the resume PDF renderer gets its Chromium from. The ONE place.
 *
 * Everything else about the render — the page, the network policy, the print
 * options — lives in `render-preview.ts` and does not depend on which binary
 * runs it. Two binaries, chosen by `pdfBrowserRuntime`:
 *
 *   - LOCAL (developer machines, CI): the Chromium Playwright already installs
 *     for the e2e suite. `playwright-core` resolves the same browser revision
 *     as `@playwright/test`, so the route prints with the browser the e2e
 *     suite compares it against. Sandbox on.
 *   - SERVERLESS (Vercel, AWS Lambda): `@sparticuz/chromium`, a Chromium
 *     headless-shell build packed for Amazon Linux, because no browser is
 *     installed there and `playwright-core` ships none. Its version is pinned
 *     to the Chromium major of the installed `playwright-core` (see
 *     docs/engineering/pdf-export-runtime.md). Sandbox off — see
 *     `serverlessLaunchOptions`.
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
 *
 * On a serverless runtime, importing `@sparticuz/chromium` sets three of
 * these in `process.env` before the launch reads it: `LD_LIBRARY_PATH` (its
 * bundled Amazon Linux 2023 libraries), `FONTCONFIG_PATH` (its fonts) and
 * `HOME`. Without them the binary does not start or finds no font.
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

type Env = Readonly<Record<string, string | undefined>>

/** The allowlisted subset of `env`, with no empty values. */
export function chromiumEnv(env: Env): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of CHROMIUM_ENV_ALLOWLIST) {
    const value = env[name]
    if (value !== undefined && value !== '') result[name] = value
  }
  return result
}

export type PdfBrowserRuntime = 'local' | 'serverless'

/**
 * Which Chromium this process runs.
 *
 * `VERCEL` is set by Vercel in its build and function environments;
 * `AWS_LAMBDA_FUNCTION_NAME` by AWS Lambda itself, which Vercel functions run
 * on. Either one means a Linux function with no installed browser. Read from
 * the platform's environment, never from a request.
 */
export function pdfBrowserRuntime(env: Env): PdfBrowserRuntime {
  return env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME ? 'serverless' : 'local'
}

/**
 * `@sparticuz/chromium`'s recommended flags that are dropped whole.
 *
 * They exist for scraping, and each one only weakens the page: the renderer
 * loads one page of the app's own origin, so it needs neither the same-origin
 * policy switched off, nor mixed content allowed, nor site isolation's field
 * trials disabled.
 */
export const DROPPED_SERVERLESS_ARGS: readonly string[] = Object.freeze([
  '--disable-web-security',
  '--allow-running-insecure-content',
  '--disable-site-isolation-trials',
])

/**
 * Entries removed from the package's feature lists, keeping the others.
 *
 *   - `--disable-features`: `IsolateOrigins` and `site-per-process` (site
 *     isolation). `AudioServiceOutOfProcess` stays: it is part of what lets the
 *     build run in one process.
 *   - `--enable-features`: `SharedArrayBuffer`, which the package turns on
 *     without cross-origin isolation, handing page scripts a high-resolution
 *     timer. A CV does not use it.
 *
 * A list left empty is dropped, flag and all.
 */
export const DROPPED_SERVERLESS_FEATURES: Readonly<Record<'--disable-features' | '--enable-features', readonly string[]>> =
  Object.freeze({
    '--disable-features': Object.freeze(['IsolateOrigins', 'site-per-process']),
    '--enable-features': Object.freeze(['SharedArrayBuffer']),
  })

/**
 * The package's flags minus those that weaken the page's isolation. Every other
 * flag is kept unchanged, because without a Linux launch to prove otherwise
 * they are what makes that build start inside a function (`--single-process`,
 * `--no-zygote`, `--no-sandbox`, `--disable-setuid-sandbox`, `--in-process-gpu`)
 * or how it is meant to render (`--font-render-hinting=none`,
 * `--headless='shell'`).
 */
export function hardenServerlessArgs(args: readonly string[]): string[] {
  const result: string[] = []
  for (const arg of args) {
    if (DROPPED_SERVERLESS_ARGS.includes(arg)) continue
    const separator = arg.indexOf('=')
    const flag = separator === -1 ? arg : arg.slice(0, separator)
    if (flag === '--disable-features' || flag === '--enable-features') {
      const dropped = DROPPED_SERVERLESS_FEATURES[flag]
      const kept = arg
        .slice(separator + 1)
        .split(',')
        .filter((feature) => feature !== '' && !dropped.includes(feature))
      if (kept.length > 0) result.push(`${flag}=${kept.join(',')}`)
      continue
    }
    result.push(arg)
  }
  return result
}

/**
 * The launch options for `@sparticuz/chromium`.
 *
 * SANDBOX OFF, DELIBERATELY. A Vercel or Lambda function cannot give Chromium
 * its process sandbox: no user namespaces, no setuid helper, and the build
 * itself only runs `--single-process --no-sandbox`. In one process, site
 * isolation cannot separate anything either; the flags above are removed so
 * the page gets Chromium's default web security, not to claim process
 * isolation it does not have.
 *
 * WHAT THAT LEAVES. A renderer compromise — a bug in Chromium's HTML, CSS,
 * font or image decoding, reached by the page — would run as the function's
 * own user, with nothing between it and the function. The allowlisted
 * environment above limits what Chromium INHERITS; it does not limit what
 * such code can REACH: the same user can read the Node process's environment
 * (`/proc/<ppid>/environ`), and with it every deployment secret. The
 * compensating controls make that bug hard to reach, not harmless:
 *
 *   - the page renders only content this app produced: the stored resume or a
 *     draft for the same resume, through the Preview's own sanitizer, with
 *     client-supplied script never run;
 *   - the network policy and redirect refusal of `route-guard.ts`: only the
 *     app's own origin, read-only, and the Google Fonts endpoints, so neither
 *     attacker-hosted content nor an exfiltration channel is reachable;
 *   - what remains is Chromium's parsers and decoders fed by that content, so
 *     `@sparticuz/chromium` and `playwright-core` must be kept current
 *     (docs/engineering/pdf-export-runtime.md, "Version pin");
 *   - one fresh browser per request, closed in `finally`, and the function's
 *     own isolation from other deployments.
 */
export function serverlessLaunchOptions(executablePath: string, args: readonly string[]): LaunchOptions {
  return {
    executablePath,
    args: hardenServerlessArgs(args),
    headless: true,
    chromiumSandbox: false,
  }
}

/**
 * The serverless binary, inflated once per function instance.
 *
 * `executablePath()` decompresses the brotli-packed browser into `/tmp` on
 * first use. Two renders starting together on a cold instance would each see
 * it missing and write the same file at once; sharing one promise prevents
 * that. A failed inflation is forgotten, so the next request tries again.
 */
let serverlessChromium: Promise<{ executablePath: string; args: readonly string[] }> | null = null

function loadServerlessChromium(): Promise<{ executablePath: string; args: readonly string[] }> {
  serverlessChromium ??= (async () => {
    // Imported here, not at the top: its module body rewrites `process.env`
    // on a Lambda or Vercel host, which must never happen on a local server.
    const { default: packed } = await import('@sparticuz/chromium')
    // WebGL is not part of a CV; without it the build does not switch to its
    // SwiftShader software GPU (`--enable-unsafe-swiftshader`).
    packed.setGraphicsMode = false
    return { executablePath: await packed.executablePath(), args: packed.args }
  })().catch((error: unknown) => {
    serverlessChromium = null
    throw error
  })
  return serverlessChromium
}

export interface LaunchPdfBrowserOptions {
  /** How long the launch itself may take: what remains of the render's budget. */
  timeoutMs: number
}

export async function launchPdfBrowser({ timeoutMs }: LaunchPdfBrowserOptions): Promise<Browser> {
  if (pdfBrowserRuntime(process.env) === 'serverless') {
    const { executablePath, args } = await loadServerlessChromium()
    // The environment is read after the import above, which may have set the
    // library and font paths.
    return chromium.launch({
      ...serverlessLaunchOptions(executablePath, args),
      env: chromiumEnv(process.env),
      timeout: timeoutMs,
    })
  }

  // Playwright's defaults already run a throwaway profile with no extensions
  // and no first-run UI; no flag is added, so the render matches the print the
  // e2e suite takes with the same browser.
  return chromium.launch({
    headless: true,
    chromiumSandbox: true,
    env: chromiumEnv(process.env),
    timeout: timeoutMs,
  })
}
