import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The module under test imports playwright-core at load time and
// @sparticuz/chromium on a serverless launch. Both are faked: no browser is
// launched and no binary is inflated, so the selection runs on any OS.
const launch = vi.fn(async (options: unknown) => ({ launchedWith: options }))
vi.mock('playwright-core', () => ({ chromium: { launch } }))

/**
 * `@sparticuz/chromium` 153.0.0's `args` with WebGL off, as the launch reads
 * them. Checked against the installed package below, so an upgrade that
 * changes the package's flags fails here until the new list is reviewed.
 */
const PACKAGE_ARGS_153 = [
  '--ash-no-nudges',
  '--disable-domain-reliability',
  '--disable-print-preview',
  '--disk-cache-size=33554432',
  '--no-default-browser-check',
  '--no-pings',
  '--single-process',
  '--font-render-hinting=none',
  '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
  '--enable-features=SharedArrayBuffer',
  '--ignore-gpu-blocklist',
  '--in-process-gpu',
  '--disable-webgl',
  '--allow-running-insecure-content',
  '--disable-setuid-sandbox',
  '--disable-site-isolation-trials',
  '--disable-web-security',
  "--headless='shell'",
  '--no-sandbox',
  '--no-zygote',
]

/** What the renderer launches with: the list above minus every flag that weakens page isolation. */
const HARDENED_ARGS_153 = [
  '--ash-no-nudges',
  '--disable-domain-reliability',
  '--disable-print-preview',
  '--disk-cache-size=33554432',
  '--no-default-browser-check',
  '--no-pings',
  '--single-process',
  '--font-render-hinting=none',
  '--disable-features=AudioServiceOutOfProcess',
  '--ignore-gpu-blocklist',
  '--in-process-gpu',
  '--disable-webgl',
  '--disable-setuid-sandbox',
  "--headless='shell'",
  '--no-sandbox',
  '--no-zygote',
]

const SERVERLESS_ARGS = PACKAGE_ARGS_153
/**
 * What the real module does to `process.env` on a Vercel or Lambda host
 * (build/helper.js `setupLambdaEnvironment`, run by its import). Simulated in
 * `executablePath`, which also runs before the launch: vitest evaluates a mock
 * factory once per file, so a side effect there would not repeat for the
 * fresh module instances below.
 */
function simulateServerlessImport() {
  process.env.LD_LIBRARY_PATH = '/tmp/al2023/lib'
  process.env.FONTCONFIG_PATH = '/tmp/fonts'
}
const executablePath = vi.fn(async () => {
  simulateServerlessImport()
  return '/tmp/chromium'
})
const graphicsModes: boolean[] = []
const packedChromium = {
  args: SERVERLESS_ARGS,
  executablePath,
  set setGraphicsMode(value: boolean) {
    graphicsModes.push(value)
  },
}
vi.mock('@sparticuz/chromium', () => ({ default: packedChromium }))

const {
  CHROMIUM_ENV_ALLOWLIST,
  DROPPED_SERVERLESS_ARGS,
  DROPPED_SERVERLESS_FEATURES,
  chromiumEnv,
  hardenServerlessArgs,
  launchPdfBrowser,
  pdfBrowserRuntime,
  serverlessLaunchOptions,
} = await import('./browser')

const SERVER_ENV = {
  PATH: '/usr/bin',
  SystemRoot: 'C:\\Windows',
  TEMP: 'C:\\Temp',
  HOME: '/home/app',
  LANG: 'en_US.UTF-8',
  FONTCONFIG_PATH: '/var/task/fonts',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  TEST_SUPABASE_SERVICE_KEY: 'service',
  GROQ_API_KEY: 'groq',
  NEXTAUTH_SECRET: 'secret',
  SENTRY_AUTH_TOKEN: 'token',
  HEALTH_CHECK_TOKEN: 'health',
  ADZUNA_APP_KEY: 'adzuna',
  DATABASE_URL: 'postgres://user:pass@host/db',
  VERCEL_OIDC_TOKEN: 'oidc',
  VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass',
  AWS_SECRET_ACCESS_KEY: 'aws',
  NODE_OPTIONS: '--require ./inject.js',
  EMPTY_ALLOWED: '',
  TMP: '',
}

const CREDENTIAL_NAME = /SUPABASE|SECRET|KEY|TOKEN|PASS|DATABASE|AUTH|BYPASS|NODE_OPTIONS/i

describe('chromiumEnv', () => {
  it('passes the allowlisted variables through unchanged', () => {
    expect(chromiumEnv(SERVER_ENV)).toEqual({
      PATH: '/usr/bin',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      HOME: '/home/app',
      LANG: 'en_US.UTF-8',
      FONTCONFIG_PATH: '/var/task/fonts',
    })
  })

  it('passes no secret, key, token, Supabase, database or Node option variable', () => {
    const names = Object.keys(chromiumEnv(SERVER_ENV))
    for (const name of names) {
      expect(name).not.toMatch(CREDENTIAL_NAME)
    }
  })

  it('has no allowlisted name that looks like a credential', () => {
    for (const name of CHROMIUM_ENV_ALLOWLIST) {
      expect(name).not.toMatch(CREDENTIAL_NAME)
    }
  })

  it('includes the paths @sparticuz/chromium sets on a serverless host', () => {
    // build/helper.js `setupLambdaEnvironment`: without them the binary finds
    // neither its Amazon Linux libraries nor its fonts.
    expect(CHROMIUM_ENV_ALLOWLIST).toEqual(expect.arrayContaining(['LD_LIBRARY_PATH', 'FONTCONFIG_PATH', 'HOME']))
  })

  it('drops empty values and returns nothing from an empty environment', () => {
    expect(chromiumEnv({ TMP: '' })).toEqual({})
    expect(chromiumEnv({})).toEqual({})
  })
})

describe('pdfBrowserRuntime', () => {
  it.each([
    ['Vercel', { VERCEL: '1' }],
    ['AWS Lambda', { AWS_LAMBDA_FUNCTION_NAME: 'my-cv-platform-fn' }],
    ['both', { VERCEL: '1', AWS_LAMBDA_FUNCTION_NAME: 'fn' }],
  ])('is serverless on %s', (_label, env) => {
    expect(pdfBrowserRuntime(env)).toBe('serverless')
  })

  it.each([
    ['a developer machine or CI', { PATH: '/usr/bin', CI: 'true' }],
    ['empty markers', { VERCEL: '', AWS_LAMBDA_FUNCTION_NAME: '' }],
    ['nothing', {}],
  ])('is local on %s', (_label, env) => {
    expect(pdfBrowserRuntime(env)).toBe('local')
  })
})

describe('the installed @sparticuz/chromium', () => {
  it('has exactly the flags reviewed above, with WebGL off', async () => {
    // The real module, not this file's fake. Its import changes process.env
    // only on a Vercel or Lambda host, which this test does not set.
    expect(process.env.VERCEL ?? process.env.AWS_LAMBDA_FUNCTION_NAME).toBeUndefined()
    const { default: packed } = await vi.importActual<typeof import('@sparticuz/chromium')>('@sparticuz/chromium')
    packed.setGraphicsMode = false
    expect(packed.args).toEqual(PACKAGE_ARGS_153)
  })
})

describe('serverlessLaunchOptions', () => {
  it("uses the packed binary with its hardened flags, headless, without Chromium's sandbox", () => {
    expect(serverlessLaunchOptions('/tmp/chromium', PACKAGE_ARGS_153)).toEqual({
      executablePath: '/tmp/chromium',
      args: HARDENED_ARGS_153,
      headless: true,
      chromiumSandbox: false,
    })
  })
})

describe('hardenServerlessArgs', () => {
  it('drops the flags that switch off web security or site isolation', () => {
    expect(DROPPED_SERVERLESS_ARGS).toEqual([
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-site-isolation-trials',
    ])
    const args = hardenServerlessArgs(PACKAGE_ARGS_153)
    for (const dropped of DROPPED_SERVERLESS_ARGS) expect(args).not.toContain(dropped)
  })

  it('removes the isolation entries from the feature lists and keeps the rest', () => {
    expect(DROPPED_SERVERLESS_FEATURES).toEqual({
      '--disable-features': ['IsolateOrigins', 'site-per-process'],
      '--enable-features': ['SharedArrayBuffer'],
    })
    expect(hardenServerlessArgs(['--disable-features=A,IsolateOrigins,B,site-per-process', '--enable-features=SharedArrayBuffer,C'])).toEqual([
      '--disable-features=A,B',
      '--enable-features=C',
    ])
    expect(hardenServerlessArgs(['--disable-features=IsolateOrigins,site-per-process', '--enable-features=SharedArrayBuffer'])).toEqual([])
    expect(hardenServerlessArgs(['--disable-features=', '--enable-features=,'])).toEqual([])
  })

  it('keeps every flag the build needs to start in a function', () => {
    const args = hardenServerlessArgs(PACKAGE_ARGS_153)
    for (const required of [
      '--single-process',
      '--no-zygote',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--in-process-gpu',
      "--headless='shell'",
      '--disable-features=AudioServiceOutOfProcess',
    ]) {
      expect(args).toContain(required)
    }
  })

  it('leaves no flag naming an isolation or web-security switch', () => {
    expect(hardenServerlessArgs(PACKAGE_ARGS_153).join(' ')).not.toMatch(
      /web-security|insecure-content|site-isolation|IsolateOrigins|site-per-process|SharedArrayBuffer/,
    )
  })
})

describe('launchPdfBrowser', () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    launch.mockClear()
    executablePath.mockClear()
    graphicsModes.length = 0
    for (const name of ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'LD_LIBRARY_PATH', 'FONTCONFIG_PATH']) {
      delete process.env[name]
    }
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  })

  afterEach(() => {
    process.env = { ...savedEnv }
  })

  /** A new function instance: the module's inflation cache starts empty. */
  async function freshInstance() {
    vi.resetModules()
    return (await import('./browser')).launchPdfBrowser
  }

  it("launches Playwright's own Chromium, sandboxed, with no executable or flag, off serverless", async () => {
    await launchPdfBrowser({ timeoutMs: 1234 })
    expect(executablePath).not.toHaveBeenCalled()
    expect(launch).toHaveBeenCalledTimes(1)
    const options = launch.mock.calls[0][0] as Record<string, unknown>
    expect(options).toEqual({ headless: true, chromiumSandbox: true, env: chromiumEnv(process.env), timeout: 1234 })
    expect(options).not.toHaveProperty('executablePath')
    expect(options).not.toHaveProperty('args')
  })

  it.each([
    ['Vercel', 'VERCEL', '1'],
    ['AWS Lambda', 'AWS_LAMBDA_FUNCTION_NAME', 'fn'],
  ])('launches the packed Chromium on %s, with the paths its import set', async (_label, name, value) => {
    const freshLaunch = await freshInstance()
    process.env[name] = value
    await freshLaunch({ timeoutMs: 1234 })

    const options = launch.mock.calls[0][0] as Record<string, unknown>
    expect(options).toEqual({
      ...serverlessLaunchOptions('/tmp/chromium', SERVERLESS_ARGS),
      env: expect.objectContaining({ LD_LIBRARY_PATH: '/tmp/al2023/lib', FONTCONFIG_PATH: '/tmp/fonts' }),
      timeout: 1234,
    })
    expect(options.chromiumSandbox).toBe(false)
    expect(Object.keys(options.env as object).filter((key) => CREDENTIAL_NAME.test(key))).toEqual([])
  })

  it('inflates the binary once per instance, with WebGL off, even for concurrent launches', async () => {
    const freshLaunch = await freshInstance()
    process.env.VERCEL = '1'
    await Promise.all([freshLaunch({ timeoutMs: 1 }), freshLaunch({ timeoutMs: 1 })])
    await freshLaunch({ timeoutMs: 1 })
    expect(launch).toHaveBeenCalledTimes(3)
    expect(executablePath).toHaveBeenCalledTimes(1)
    expect(graphicsModes).toEqual([false])
  })

  it('tries again on the next request after a failed inflation instead of keeping the failure', async () => {
    const freshLaunch = await freshInstance()
    process.env.VERCEL = '1'
    executablePath.mockRejectedValueOnce(new Error('ENOSPC'))
    await expect(freshLaunch({ timeoutMs: 1 })).rejects.toThrow('ENOSPC')
    await expect(freshLaunch({ timeoutMs: 1 })).resolves.toBeDefined()
    expect(executablePath).toHaveBeenCalledTimes(2)
    expect(launch).toHaveBeenCalledTimes(1)
  })
})
