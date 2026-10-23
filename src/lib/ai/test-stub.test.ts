import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AiCompletionError } from './client'
import {
  AI_TEST_STUB_DIRECTIVES,
  AI_TEST_STUB_ENABLED_VALUE,
  generateStubResumeFromJobDescription,
  isAiTestStubEnabled,
  type AiTestStubEnvironment,
  type AiTestStubRequest,
} from './test-stub'

/** The environment of the Playwright web server, where the stub must work. */
const E2E_ENV: AiTestStubEnvironment = {
  AI_TEST_STUB: AI_TEST_STUB_ENABLED_VALUE,
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NODE_ENV: 'production',
}

function request(url: string, headers: Record<string, string> = {}): AiTestStubRequest {
  const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return { url, headers: { get: (name) => lower.get(name.toLowerCase()) ?? null } }
}

const LOCAL_REQUEST = request('http://127.0.0.1:3100/api/resumes/from-job-application', {
  host: '127.0.0.1:3100',
  'x-forwarded-for': '127.0.0.1',
})

describe('isAiTestStubEnabled', () => {
  it('is active in the local e2e server, on a local request', () => {
    expect(isAiTestStubEnabled(E2E_ENV, LOCAL_REQUEST)).toBe(true)
    expect(isAiTestStubEnabled(E2E_ENV, request('http://localhost:3100/x', { host: 'localhost:3100' }))).toBe(true)
    expect(isAiTestStubEnabled(E2E_ENV, request('http://[::1]:3100/x', { 'x-forwarded-for': '::ffff:127.0.0.1' }))).toBe(true)
  })

  it('is off without the flag, or with any other value', () => {
    for (const value of [undefined, '', '1', 'true', `${AI_TEST_STUB_ENABLED_VALUE} `, 'LOCAL-E2E-ONLY']) {
      expect(isAiTestStubEnabled({ ...E2E_ENV, AI_TEST_STUB: value }, LOCAL_REQUEST)).toBe(false)
    }
  })

  describe('can never be active in a production deployment, even with the flag set', () => {
    it('is off on any Vercel deployment, production or preview', () => {
      expect(isAiTestStubEnabled({ ...E2E_ENV, VERCEL: '1' }, LOCAL_REQUEST)).toBe(false)
      expect(isAiTestStubEnabled({ ...E2E_ENV, VERCEL_ENV: 'production' }, LOCAL_REQUEST)).toBe(false)
      expect(isAiTestStubEnabled({ ...E2E_ENV, VERCEL_ENV: 'preview' }, LOCAL_REQUEST)).toBe(false)
    })

    it('is off when the server stores data in a hosted Supabase project', () => {
      for (const url of ['https://abcdefgh.supabase.co', 'http://127.0.0.1.evil.example', 'not a url', undefined]) {
        expect(isAiTestStubEnabled({ ...E2E_ENV, NEXT_PUBLIC_SUPABASE_URL: url }, LOCAL_REQUEST)).toBe(false)
      }
    })

    it('is off for a request that is not local', () => {
      const remote = [
        request('https://cv.example.com/api/resumes/from-job-application', { host: 'cv.example.com' }),
        // A local URL with a public Host header, as behind a proxy.
        request('http://127.0.0.1:3100/x', { host: 'cv.example.com' }),
        // A forwarded public client, even through a local hop.
        request('http://127.0.0.1:3100/x', { host: '127.0.0.1:3100', 'x-forwarded-for': '203.0.113.7, 127.0.0.1' }),
        request('http://127.0.0.1:3100/x', { host: '127.0.0.1:3100', 'x-forwarded-for': '10.0.0.5' }),
      ]
      for (const candidate of remote) {
        expect(isAiTestStubEnabled(E2E_ENV, candidate)).toBe(false)
      }
    })

    it('is off for a real deployment environment as a whole', () => {
      const deployed: AiTestStubEnvironment = {
        AI_TEST_STUB: AI_TEST_STUB_ENABLED_VALUE,
        NODE_ENV: 'production',
        VERCEL: '1',
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefgh.supabase.co',
      }
      expect(isAiTestStubEnabled(deployed, LOCAL_REQUEST)).toBe(false)
    })
  })

  it('is enabled by the Playwright web server config with the guarded constant', () => {
    const config = readFileSync(join(process.cwd(), 'playwright.config.ts'), 'utf-8')
    expect(config).toContain('AI_TEST_STUB: AI_TEST_STUB_ENABLED_VALUE,')
  })
})

describe('generateStubResumeFromJobDescription', () => {
  const DESCRIPTION = 'An offer long enough to be sent to the AI, for the stub test.'

  it('answers in the requested language, with achievements for a complete-resume request', async () => {
    const { resumeData } = await generateStubResumeFromJobDescription({
      jobDescription: DESCRIPTION,
      locale: 'de',
      targetJobTitle: 'Dateningenieur',
    })
    expect(resumeData.summary).toContain('KI-Testtext')
    expect(resumeData.summary).toContain('Dateningenieur')
    expect(resumeData.experience[0].achievements).toEqual(['KI-Testerfolg 1', 'KI-Testerfolg 2'])
  })

  it('sends no achievements when the request does not ask for them, like the real prompt', async () => {
    const { resumeData } = await generateStubResumeFromJobDescription({ jobDescription: DESCRIPTION, locale: 'fr' })
    expect(resumeData.experience[0]).not.toHaveProperty('achievements')
  })

  it('is deterministic', async () => {
    const input = { jobDescription: DESCRIPTION, locale: 'it', targetJobTitle: 'Ingegnere' }
    expect(await generateStubResumeFromJobDescription(input)).toEqual(await generateStubResumeFromJobDescription(input))
  })

  it('fails as the provider would when the description asks it to', async () => {
    await expect(
      generateStubResumeFromJobDescription({ jobDescription: `${DESCRIPTION} ${AI_TEST_STUB_DIRECTIVES.providerError}` })
    ).rejects.toMatchObject({ name: 'AiCompletionError', reason: 'provider_error' })
    const rateLimited = generateStubResumeFromJobDescription({
      jobDescription: `${DESCRIPTION} ${AI_TEST_STUB_DIRECTIVES.rateLimited}`,
    })
    await expect(rateLimited).rejects.toBeInstanceOf(AiCompletionError)
    await expect(rateLimited).rejects.toMatchObject({ reason: 'rate_limited' })
  })
})
