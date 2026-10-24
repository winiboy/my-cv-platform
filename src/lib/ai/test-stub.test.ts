import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiCompletionError } from './client'
import { generateCoverLetter } from './cover-letter-generation'
import { checkOfferPage } from '@/lib/cover-letter-from-job/offer-availability'
import {
  AI_TEST_STUB_COVER_LETTER_TEXTS,
  AI_TEST_STUB_DIRECTIVES,
  AI_TEST_STUB_ENABLED_VALUE,
  AI_TEST_STUB_OFFER_PAGE_PARAM,
  AI_TEST_STUB_OFFER_PAGE_TIMEOUT,
  coverLetterGeneratorFor,
  offerPageCheckerFor,
  stubCheckOfferPage,
  generateStubCoverLetter,
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

  it('answers a Job Search complete-resume request, which has no job title, with achievements', async () => {
    const { resumeData } = await generateStubResumeFromJobDescription({
      jobDescription: DESCRIPTION,
      locale: 'fr',
      completeResume: true,
    })
    expect(resumeData.summary).toContain('Poste IA de test')
    expect(resumeData.experience[0].achievements).toEqual(['Réalisation IA de test 1', 'Réalisation IA de test 2'])
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

describe('generateStubCoverLetter', () => {
  const INPUT = {
    jobDescription: 'An offer for the stub test.',
    jobTitle: 'Dateningenieur',
    companyName: 'Beispiel AG',
  }

  it('answers with a complete letter in the requested language, naming the job title', async () => {
    const letter = await generateStubCoverLetter({ ...INPUT, locale: 'de' })
    const german = AI_TEST_STUB_COVER_LETTER_TEXTS.de
    expect(letter).toEqual({
      greeting: german.greeting,
      openingParagraph: german.opening('Dateningenieur'),
      bodyParagraphs: [german.body],
      closingParagraph: german.closing,
      signOff: german.signOff,
    })
    expect(letter.openingParagraph).toContain('KI-Testtext')
    expect(letter.openingParagraph).toContain('Dateningenieur')
  })

  it('answers in every content language, and in English for any other', async () => {
    expect((await generateStubCoverLetter({ ...INPUT, locale: 'fr' })).openingParagraph).toContain('Texte IA de test')
    expect((await generateStubCoverLetter({ ...INPUT, locale: 'it' })).openingParagraph).toContain('Testo IA di prova')
    expect((await generateStubCoverLetter({ ...INPUT, locale: 'en' })).openingParagraph).toContain('Test AI text')
    expect((await generateStubCoverLetter({ ...INPUT, locale: 'es' })).openingParagraph).toContain('Test AI text')
  })

  it('writes one more body paragraph when the request carries a CV profile', async () => {
    const french = AI_TEST_STUB_COVER_LETTER_TEXTS.fr
    for (const profile of [
      { resumeSummary: 'Un profil.' },
      { resumeExperience: [{ position: 'Analyste', company: 'Acme' }] },
      { resumeSkills: ['SQL'] },
    ]) {
      const letter = await generateStubCoverLetter({ ...INPUT, ...profile, locale: 'fr' })
      expect(letter.bodyParagraphs).toEqual([french.body, french.resumeUsed])
    }
    const withoutProfile = await generateStubCoverLetter({ ...INPUT, resumeExperience: [], resumeSkills: [], locale: 'fr' })
    expect(withoutProfile.bodyParagraphs).toEqual([french.body])
  })

  it('is deterministic', async () => {
    const input = { ...INPUT, locale: 'it', resumeSummary: 'Profilo.' }
    expect(await generateStubCoverLetter(input)).toEqual(await generateStubCoverLetter(input))
  })

  it('fails as the provider would when the description asks it to', async () => {
    await expect(
      generateStubCoverLetter({ ...INPUT, jobDescription: `${INPUT.jobDescription} ${AI_TEST_STUB_DIRECTIVES.providerError}` })
    ).rejects.toMatchObject({ name: 'AiCompletionError', reason: 'provider_error', providerStatus: 500 })
    const rateLimited = generateStubCoverLetter({
      ...INPUT,
      jobDescription: `${INPUT.jobDescription} ${AI_TEST_STUB_DIRECTIVES.rateLimited}`,
    })
    await expect(rateLimited).rejects.toBeInstanceOf(AiCompletionError)
    await expect(rateLimited).rejects.toMatchObject({ reason: 'rate_limited', providerStatus: 429 })
  })
})

describe('coverLetterGeneratorFor', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('picks the stub only when every guard condition holds', () => {
    vi.stubEnv('AI_TEST_STUB', AI_TEST_STUB_ENABLED_VALUE)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('VERCEL_ENV', '')
    expect(coverLetterGeneratorFor(LOCAL_REQUEST)).toBe(generateStubCoverLetter)
    expect(coverLetterGeneratorFor(request('https://cv.example.com/x', { host: 'cv.example.com' }))).toBe(
      generateCoverLetter
    )

    vi.stubEnv('VERCEL_ENV', 'production')
    expect(coverLetterGeneratorFor(LOCAL_REQUEST)).toBe(generateCoverLetter)
  })

  it('picks the real AI without the flag', () => {
    vi.stubEnv('AI_TEST_STUB', '')
    expect(coverLetterGeneratorFor(LOCAL_REQUEST)).toBe(generateCoverLetter)
  })
})

describe('stubCheckOfferPage', () => {
  const page = (directive?: string) =>
    `https://www.jobs.ch/de/stellenangebote/detail/123/${
      directive === undefined ? '' : `?${AI_TEST_STUB_OFFER_PAGE_PARAM}=${directive}`
    }`

  it('answers the status the URL names, mapped as the real check maps it', async () => {
    await expect(stubCheckOfferPage(page('404'))).resolves.toEqual({ kind: 'gone', status: 404 })
    await expect(stubCheckOfferPage(page('410'))).resolves.toEqual({ kind: 'gone', status: 410 })
    await expect(stubCheckOfferPage(page('200'))).resolves.toEqual({ kind: 'answered', status: 200 })
    await expect(stubCheckOfferPage(page('503'))).resolves.toEqual({ kind: 'answered', status: 503 })
  })

  it('times out when asked to', async () => {
    await expect(stubCheckOfferPage(page(AI_TEST_STUB_OFFER_PAGE_TIMEOUT))).resolves.toEqual({
      kind: 'undetermined',
      cause: 'timeout',
    })
  })

  it('is inconclusive without a directive, or with one it does not know', async () => {
    for (const url of [page(), page('gone'), page('999'), page('')]) {
      await expect(stubCheckOfferPage(url)).resolves.toEqual({ kind: 'undetermined', cause: 'stubbed' })
    }
  })

  it('is inconclusive where the real check would be, whatever the directive', async () => {
    await expect(stubCheckOfferPage(null)).resolves.toEqual({ kind: 'undetermined', cause: 'no-url' })
    await expect(stubCheckOfferPage('not a url')).resolves.toEqual({ kind: 'undetermined', cause: 'invalid-url' })
    await expect(
      stubCheckOfferPage(`ftp://www.jobs.ch/x?${AI_TEST_STUB_OFFER_PAGE_PARAM}=404`)
    ).resolves.toEqual({ kind: 'undetermined', cause: 'scheme-not-allowed' })
    await expect(
      stubCheckOfferPage(`https://careers.example.com/x?${AI_TEST_STUB_OFFER_PAGE_PARAM}=404`)
    ).resolves.toEqual({ kind: 'undetermined', cause: 'host-not-allowed' })
  })

  it('never touches the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    for (const url of [page(), page('404'), page('200'), page(AI_TEST_STUB_OFFER_PAGE_TIMEOUT)]) {
      await stubCheckOfferPage(url)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('offerPageCheckerFor', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('picks the stub only when every guard condition holds', () => {
    vi.stubEnv('AI_TEST_STUB', AI_TEST_STUB_ENABLED_VALUE)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('VERCEL_ENV', '')
    expect(offerPageCheckerFor(LOCAL_REQUEST)).toBe(stubCheckOfferPage)
    expect(offerPageCheckerFor(request('https://cv.example.com/x', { host: 'cv.example.com' }))).toBe(checkOfferPage)

    vi.stubEnv('VERCEL', '1')
    expect(offerPageCheckerFor(LOCAL_REQUEST)).toBe(checkOfferPage)
  })

  it('picks the real check without the flag', () => {
    vi.stubEnv('AI_TEST_STUB', '')
    expect(offerPageCheckerFor(LOCAL_REQUEST)).toBe(checkOfferPage)
  })
})
