import { describe, expect, it, vi } from 'vitest'

// The module under test imports playwright-core at load time; only the pure
// env builder is exercised here, so the browser API is never touched.
vi.mock('playwright-core', () => ({ chromium: {} }))

const { CHROMIUM_ENV_ALLOWLIST, chromiumEnv } = await import('./browser')

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
  AWS_SECRET_ACCESS_KEY: 'aws',
  NODE_OPTIONS: '--require ./inject.js',
  EMPTY_ALLOWED: '',
  TMP: '',
}

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
      expect(name).not.toMatch(/SUPABASE|SECRET|KEY|TOKEN|PASS|DATABASE|AUTH|NODE_OPTIONS/i)
    }
  })

  it('has no allowlisted name that looks like a credential', () => {
    for (const name of CHROMIUM_ENV_ALLOWLIST) {
      expect(name).not.toMatch(/SUPABASE|SECRET|KEY|TOKEN|PASS|DATABASE|AUTH|NODE_OPTIONS/i)
    }
  })

  it('drops empty values and returns nothing from an empty environment', () => {
    expect(chromiumEnv({ TMP: '' })).toEqual({})
    expect(chromiumEnv({})).toEqual({})
  })
})
