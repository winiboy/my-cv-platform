import { test, expect } from './fixtures/auth'
import type { Page } from '@playwright/test'
import { AI_TEST_STUB_DIRECTIVES } from '../src/lib/ai/test-stub-contract'
import { RESUME_SAMPLE_VALUES } from '../src/lib/resume-from-job/sample-values'
import { expectCompleteRow, expectEditorShowsEverySection, resumesOf } from './fixtures/resume-from-job'
import frJobs from '../src/locales/fr/jobs.json'
import deJobs from '../src/locales/de/jobs.json'

/**
 * A CV created from Job Search is complete (cv-from-job-complete, US-003).
 *
 * WHAT IS REAL
 * The Job Search page, the "Créer un CV" modal, the route
 * `/api/ai/generate-from-job-description`, the session, RLS and the stored row
 * in the local Supabase stack.
 *
 * WHAT IS STUBBED
 * In the browser, the job list (`/api/jobs`) and the external job fetch
 * (`/api/jobs/fetch-external`) that pre-fills the modal, as in
 * `job-cv-template-picker.spec.ts`. On the server, only the AI provider, by the
 * guarded stub of `src/lib/ai/test-stub.ts`; a directive in the description
 * makes it fail.
 *
 * WHAT IS ASSERTED
 * In fr and de, a German offer gives a complete German CV: every field of the
 * stored row non-empty, the stub's AI text and achievements in it, the sample
 * values of the same language around them, and every section showing its
 * content in the editor. When the AI fails, the modal shows the error, stays
 * open, and no CV is created (AC3: no silent fallback).
 */

test.use({ viewport: { width: 1440, height: 900 } })

const JOBS = { fr: frJobs, de: deJobs } as const
type TestLocale = keyof typeof JOBS

const JOB = {
  id: 'e2e-cv-from-job-search',
  title: 'Data Engineer',
  company: 'Beispiel AG',
  location_city: 'Zürich',
  location_country: 'CH',
  employment_type: 'full-time',
  description: 'Listing description of a data engineering role in Zürich, with pipelines and Python every day.',
  posted_date: '2026-01-15',
  application_url: 'https://jobs.example.test/offers/data-engineer',
  is_saved: false,
}

const GERMAN_OFFER = `Zur Verstärkung unseres Data-Teams in Zürich suchen wir eine erfahrene Data Engineer (m/w/d).
Sie sind für die Konzeption und Wartung der Datenpipelines verantwortlich, die unsere Produkte versorgen. Ihre
Aufgaben: Sie entwickeln zuverlässige Datenflüsse und arbeiten eng mit den Produktteams zusammen. Ihr Profil:
mindestens drei Jahre Erfahrung in einer ähnlichen Position und sehr gute Python-Kenntnisse. Wir bieten Ihnen ein
dynamisches Umfeld und ein motiviertes Team an unserem Standort.`

async function stubJobSearch(page: Page, jobDescription: string): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/jobs',
    (route) => route.fulfill({ json: { jobs: [JOB], total: 1, source: 'mock' } })
  )
  await page.route(
    (url) => url.pathname === '/api/jobs/fetch-external',
    (route) =>
      route.fulfill({ json: { success: true, jobTitle: JOB.title, company: JOB.company, jobDescription } })
  )
}

/** Open Job Search, open "Créer un CV" and submit the pre-filled modal. */
async function submitFromJobSearch(page: Page, locale: TestLocale) {
  const response = await page.goto(`/${locale}/dashboard/jobs`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 2, name: JOB.title, exact: true })).toBeVisible()

  await page.getByRole('button', { name: JOBS[locale].createCV.button, exact: true }).click()
  await expect(page.getByRole('radiogroup')).toBeVisible()

  const generation = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/ai/generate-from-job-description')
  await page.getByRole('button', { name: JOBS[locale].createCV.createButton, exact: true }).click()
  return generation
}

for (const locale of ['fr', 'de'] as const) {
  test(`${locale}: a German offer gives a complete German CV from Job Search`, async ({ page, authedUser }) => {
    await stubJobSearch(page, GERMAN_OFFER)

    const generation = await submitFromJobSearch(page, locale)
    expect(generation.status()).toBe(200)
    await page.waitForURL(new RegExp(`/${locale}/dashboard/resumes/[0-9a-f-]+/edit$`), { timeout: 30_000 })

    const [resume] = await resumesOf(authedUser.id)
    // The request fields of before: the CV title the modal sends, the template it defaults to.
    expect(resume.title).toBe(`CV - ${JOB.company}`)
    expect(resume.template).toBe('professional')
    expectCompleteRow(resume)

    // The stub's German text and achievements, as the AI's would be.
    expect(resume.summary).toContain('KI-Testtext')
    const experience = resume.experience as Array<{ company: string; achievements: string[] }>
    expect(experience[0].company).toBe('KI-Testunternehmen')
    expect(experience[0].achievements).toEqual(['KI-Testerfolg 1', 'KI-Testerfolg 2'])
    // The rest from the German sample set, whatever the page language.
    const german = RESUME_SAMPLE_VALUES.de
    expect((resume.contact as Record<string, string>).name).toBe(german.contact.name)
    expect((resume.education as Array<{ school: string }>)[0].school).toBe(german.education.school)
    expect((resume.certifications as Array<{ name: string }>)[0].name).toBe(german.certification.name)

    await expectEditorShowsEverySection(page, locale, resume)
  })
}

test('an AI failure shows the error and creates no CV', async ({ page, authedUser }) => {
  await stubJobSearch(page, `${GERMAN_OFFER}\n${AI_TEST_STUB_DIRECTIVES.providerError}`)

  const generation = await submitFromJobSearch(page, 'fr')
  expect(generation.status()).toBe(500)

  // The error the modal has always shown: the route's message.
  await expect(page.getByText('Failed to generate resume', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/fr\/dashboard\/jobs/)
  expect(await resumesOf(authedUser.id)).toEqual([])
})
