import { test, expect } from './fixtures/auth'
import type { Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { AI_TEST_STUB_DIRECTIVES } from '../src/lib/ai/test-stub-contract'
import { RESUME_SAMPLE_VALUES } from '../src/lib/resume-from-job/sample-values'
import { expectCompleteRow, expectEditorShowsEverySection, resumesOf } from './fixtures/resume-from-job'
import frJobs from '../src/locales/fr/jobs.json'
import deJobs from '../src/locales/de/jobs.json'
import frCommon from '../src/locales/fr/common.json'
import deCommon from '../src/locales/de/common.json'

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
 *
 * job-cv-linking US-001: the offer is saved as the user's job application, or
 * the one already saved with its URL is reused, and the CV and the application
 * point to each other; the CV's badge shows on its Mes candidatures card. A
 * CV the application was linked to before is kept, its link cleared. When the
 * AI fails, no application is created or changed.
 */

test.use({ viewport: { width: 1440, height: 900 } })

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E CV from Job Search spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const JOBS = { fr: frJobs, de: deJobs } as const
const COMMON = { fr: frCommon, de: deCommon } as const
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

/** The listing's location as the page's "{city}, Switzerland" text renders it. */
const EXPECTED_LOCATION: Record<TestLocale, string> = { fr: 'Zürich, Suisse', de: 'Zürich, Schweiz' }

async function applicationsOf(userId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin().from('job_applications').select('*').eq('user_id', userId)
  if (error) throw new Error(`Could not read job applications: ${error.message}`)
  return data ?? []
}

/** An application already saved for the offer's URL, linked to an older CV. */
async function seedSavedOfferWithOldCv(userId: string): Promise<{ applicationId: string; oldResumeId: string }> {
  const db = admin()
  const { data: application, error: applicationError } = await db
    .from('job_applications')
    .insert({
      user_id: userId,
      job_title: 'Saved earlier',
      company_name: JOB.company,
      job_url: JOB.application_url,
      status: 'applied',
    })
    .select('id')
    .single()
  if (applicationError || !application) throw new Error(`Could not seed an application: ${applicationError?.message}`)

  const { data: oldResume, error: resumeError } = await db
    .from('resumes')
    .insert({ user_id: userId, title: 'Old CV', template: 'classic', job_application_id: application.id })
    .select('id')
    .single()
  if (resumeError || !oldResume) throw new Error(`Could not seed a resume: ${resumeError?.message}`)

  const { error: linkError } = await db.from('job_applications').update({ resume_id: oldResume.id }).eq('id', application.id)
  if (linkError) throw new Error(`Could not link the seeded resume: ${linkError.message}`)
  return { applicationId: application.id as string, oldResumeId: oldResume.id as string }
}

/** An application's card in Mes candidatures, by its accessible name. */
function applicationCard(page: Page, locale: TestLocale, application: Record<string, unknown>) {
  const name = COMMON[locale].kanban.card.ariaLabel
    .replace('{title}', application.job_title as string)
    .replace('{company}', application.company_name as string)
  return page.getByRole('button', { name, exact: true })
}

/** The CV's badge on its application's card in Mes candidatures. */
async function expectKanbanBadge(
  page: Page,
  locale: TestLocale,
  application: Record<string, unknown>,
  resume: Record<string, unknown>
): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/job-applications`)
  expect(response?.status()).toBe(200)
  const card = applicationCard(page, locale, application)
  await expect(card).toBeVisible()
  const badge = card.locator(`a[href="/${locale}/dashboard/resumes/${resume.id as string}/edit"]`)
  await expect(badge).toBeVisible()
  await expect(badge).toContainText(resume.title as string)
}

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

    // job-cv-linking US-001: the unsaved offer is now the user's application,
    // with the listing's fields, and the two point to each other.
    const applications = await applicationsOf(authedUser.id)
    expect(applications).toHaveLength(1)
    const [application] = applications
    expect(application).toMatchObject({
      job_title: JOB.title,
      company_name: JOB.company,
      location: EXPECTED_LOCATION[locale],
      job_url: JOB.application_url,
      job_description: JOB.description,
      status: 'saved',
      resume_id: resume.id,
    })
    expect(resume.job_application_id).toBe(application.id)

    await expectKanbanBadge(page, locale, application, resume)
  })

  test(`${locale}: an offer already saved is linked to the new CV, which replaces the old one`, async ({
    page,
    authedUser,
  }) => {
    const { applicationId, oldResumeId } = await seedSavedOfferWithOldCv(authedUser.id)
    await stubJobSearch(page, GERMAN_OFFER)

    const generation = await submitFromJobSearch(page, locale)
    expect(generation.status()).toBe(200)
    const { resumeId } = (await generation.json()) as { resumeId: string }
    await page.waitForURL(new RegExp(`/${locale}/dashboard/resumes/${resumeId}/edit$`), { timeout: 30_000 })

    // No second application for the same URL; its own fields are kept.
    const applications = await applicationsOf(authedUser.id)
    expect(applications).toHaveLength(1)
    expect(applications[0]).toMatchObject({
      id: applicationId,
      job_title: 'Saved earlier',
      status: 'applied',
      resume_id: resumeId,
    })

    const resumes = await resumesOf(authedUser.id)
    expect(resumes).toHaveLength(2)
    const newResume = resumes.find((row) => row.id === resumeId)
    const oldResume = resumes.find((row) => row.id === oldResumeId)
    expect(newResume?.job_application_id).toBe(applicationId)
    // The old CV is kept, no longer linked.
    expect(oldResume).toMatchObject({ title: 'Old CV', job_application_id: null })

    await expectKanbanBadge(page, locale, applications[0], newResume as Record<string, unknown>)
    await expect(
      applicationCard(page, locale, applications[0]).locator(`a[href="/${locale}/dashboard/resumes/${oldResumeId}/edit"]`)
    ).toHaveCount(0)
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
  // job-cv-linking US-001: nor any application.
  expect(await applicationsOf(authedUser.id)).toEqual([])
})

test('an AI failure leaves an already saved offer and its CV unchanged', async ({ page, authedUser }) => {
  const { applicationId, oldResumeId } = await seedSavedOfferWithOldCv(authedUser.id)
  const applicationsBefore = await applicationsOf(authedUser.id)
  await stubJobSearch(page, `${GERMAN_OFFER}\n${AI_TEST_STUB_DIRECTIVES.providerError}`)

  const generation = await submitFromJobSearch(page, 'de')
  expect(generation.status()).toBe(500)
  await expect(page.getByText('Failed to generate resume', { exact: true })).toBeVisible()

  expect(await applicationsOf(authedUser.id)).toEqual(applicationsBefore)
  const resumes = await resumesOf(authedUser.id)
  expect(resumes.map((row) => [row.id, row.job_application_id])).toEqual([[oldResumeId, applicationId]])
})
