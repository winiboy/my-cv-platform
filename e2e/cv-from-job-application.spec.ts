import { test, expect, createTestUser, deleteTestUser, type TestUser } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { AI_TEST_STUB_DIRECTIVES } from '../src/lib/ai/test-stub-contract'
import { RESUME_SAMPLE_VALUES } from '../src/lib/resume-from-job/sample-values'
import enCommon from '../src/locales/en/common.json'
import frCommon from '../src/locales/fr/common.json'
import deCommon from '../src/locales/de/common.json'

/**
 * A CV created from a saved job application is complete
 * (cv-from-job-complete, US-002).
 *
 * WHAT IS REAL
 * The pages, the route `/api/resumes/from-job-application`, the session, RLS
 * and the rows in the local Supabase stack. Applications are seeded for the
 * signed-in user through the service-role client.
 *
 * WHAT IS STUBBED
 * Only the AI provider, on the server, by `src/lib/ai/test-stub.ts`: the
 * Playwright web server sets `AI_TEST_STUB`, and a directive in the job
 * description picks a provider failure or a rate limit. Without a directive the
 * stub answers in the language it is asked for, with text that says it is the
 * stub's, so the test can tell AI content from sample values.
 *
 * WHAT IS ASSERTED
 * (a) a German offer opened under /fr gives a German CV with the AI's content,
 *     linked both ways, every field non-empty in the stored row and every
 *     section showing its content in the rendered editor;
 * (b) no description, and (c) a failing or rate-limited AI, give a complete
 *     sample CV in the page language, linked, with the localized notice;
 * (d) another user's application is refused by the route and nothing is
 *     created or linked;
 * (e) a CV created without an application stays empty, through the client
 *     insert as before;
 * (f) the banner, the title-required message and the busy state are localized
 *     in fr and de, and en is unchanged; two submits in one tick send one
 *     request and create one CV;
 * (g) a 255-character job title is pre-filled cut to the 200 characters the
 *     route keeps, and saved exactly as shown.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cv-from-job-application spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

test.use({ viewport: { width: 1440, height: 900 } })

const COMMON = { en: enCommon, fr: frCommon, de: deCommon } as const

const GERMAN_OFFER = `Wir suchen eine Data Engineer (m/w/d) für unser Team in Zürich. Sie sind für die Konzeption
der Datenpipelines verantwortlich und arbeiten eng mit den Produktteams zusammen. Ihr Profil: mindestens drei
Jahre Erfahrung in einer ähnlichen Position und sehr gute Python-Kenntnisse. Wir bieten Ihnen ein dynamisches
Umfeld und ein motiviertes Team an unserem Standort.`

interface SeededApplication {
  id: string
  jobTitle: string
  company: string
}

async function seedApplication(
  userId: string,
  fields: { jobTitle: string; company: string; location?: string; description: string | null }
): Promise<SeededApplication> {
  const { data, error } = await admin()
    .from('job_applications')
    .insert({
      user_id: userId,
      job_title: fields.jobTitle,
      company_name: fields.company,
      location: fields.location ?? null,
      job_description: fields.description,
      status: 'saved',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed a job application: ${error?.message}`)
  return { id: data.id as string, jobTitle: fields.jobTitle, company: fields.company }
}

async function resumesOf(userId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin().from('resumes').select('*').eq('user_id', userId)
  if (error) throw new Error(`Could not read resumes: ${error.message}`)
  return data ?? []
}

async function linkedResumeId(applicationId: string): Promise<string | null> {
  const { data, error } = await admin().from('job_applications').select('resume_id').eq('id', applicationId).single()
  if (error) throw new Error(`Could not read the application: ${error.message}`)
  return (data?.resume_id as string | null) ?? null
}

/** Every field of the stored row non-empty except the photo (PRD AC "Every field"). */
function expectCompleteRow(resume: Record<string, unknown>): void {
  const nonEmpty = (value: unknown, path: string) =>
    expect(typeof value === 'string' ? value.trim() : value, path).toBeTruthy()

  nonEmpty(resume.title, 'title')
  nonEmpty(resume.summary, 'summary')
  const contact = resume.contact as Record<string, unknown>
  for (const key of ['name', 'email', 'phone', 'location', 'linkedin', 'github', 'website']) {
    nonEmpty(contact[key], `contact.${key}`)
  }
  const sections: Record<string, string[]> = {
    experience: ['company', 'position', 'startDate', 'endDate', 'location', 'description'],
    education: ['school', 'degree', 'field', 'startDate', 'endDate', 'gpa', 'description'],
    skills: ['category', 'skillsHtml'],
    languages: ['language', 'level'],
    certifications: ['name', 'issuer', 'date', 'expiryDate', 'credentialId', 'url'],
    projects: ['name', 'description', 'url', 'startDate', 'endDate'],
  }
  for (const [section, keys] of Object.entries(sections)) {
    const entries = resume[section] as Array<Record<string, unknown>>
    expect(entries.length, section).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.visible, `${section}.visible`).toBe(true)
      for (const key of keys) nonEmpty(entry[key], `${section}.${key}`)
    }
  }
  const experience = resume.experience as Array<{ achievements: string[] }>
  const education = resume.education as Array<{ achievements: string[] }>
  const projects = resume.projects as Array<{ technologies: string[] }>
  expect(experience[0].achievements.length).toBeGreaterThan(0)
  expect(education[0].achievements.length).toBeGreaterThan(0)
  expect(projects[0].technologies.length).toBeGreaterThan(0)
}

/** The text a section shows in the editor: its form fields and its rich-text editors. */
async function editorSectionText(page: Page, locale: string, resumeId: string, section: string): Promise<string> {
  const response = await page.goto(`/${locale}/dashboard/resumes/${resumeId}/edit?section=${section}`)
  expect(response?.status()).toBe(200)
  await page.locator('input, textarea, [contenteditable="true"]').first().waitFor()
  return page.evaluate(() =>
    [
      ...Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')).map(
        (field) => field.value
      ),
      ...Array.from(document.querySelectorAll<HTMLElement>('[contenteditable="true"]')).map(
        (editor) => editor.innerText
      ),
    ].join('\n')
  )
}

/** One stored value per section must show in that section of the rendered editor. */
async function expectEditorShowsEverySection(page: Page, locale: string, resume: Record<string, unknown>) {
  const first = (section: string) => (resume[section] as Array<Record<string, unknown>>)[0]
  const plain = (html: string) => html.replace(/<[^>]+>/g, '').trim()
  const expected: Record<string, string> = {
    contact: (resume.contact as Record<string, string>).name,
    summary: plain(resume.summary as string).slice(0, 30),
    experience: first('experience').company as string,
    education: first('education').school as string,
    skills: first('skills').category as string,
    languages: first('languages').language as string,
    certifications: first('certifications').name as string,
    projects: first('projects').name as string,
  }
  for (const [section, value] of Object.entries(expected)) {
    expect(value, `${section} has stored content`).toBeTruthy()
    await expect
      .poll(() => editorSectionText(page, locale, resume.id as string, section), { message: section })
      .toContain(value)
  }
}

async function createFromApplication(page: Page, locale: 'fr' | 'de' | 'en', applicationId: string) {
  await page.goto(`/${locale}/dashboard/resumes/new?jobApplicationId=${applicationId}`)
  const responsePromise = page.waitForResponse('**/api/resumes/from-job-application')
  await page.locator('button[type="submit"]').click()
  const response = await responsePromise
  await page.waitForURL(new RegExp(`/${locale}/dashboard/resumes/[0-9a-f-]+/edit`))
  return response
}

test.describe('CV from a saved job application', () => {
  test('(a) a German offer opened under /fr gives a complete, tailored German CV, linked both ways', async ({
    page,
    authedUser,
  }) => {
    const application = await seedApplication(authedUser.id, {
      jobTitle: 'Data Engineer',
      company: 'Beispiel AG',
      location: 'Zürich',
      description: GERMAN_OFFER,
    })

    await page.goto(`/fr/dashboard/resumes/new?jobApplicationId=${application.id}`)
    // AC1: the title starts as the job title.
    await expect(page.locator('#title')).toHaveValue('Data Engineer')

    const response = await createFromApplication(page, 'fr', application.id)
    expect(response.status()).toBe(201)
    expect(await response.json()).toMatchObject({ tailored: true })
    // No "not tailored" notice on the tailored path.
    await expect(page.getByText(frCommon.resumes.new.notTailored)).toHaveCount(0)

    const [resume] = await resumesOf(authedUser.id)
    expect(resume.job_application_id).toBe(application.id)
    expect(await linkedResumeId(application.id)).toBe(resume.id)
    expect(resume.title).toBe('Data Engineer')
    expectCompleteRow(resume)

    // The stub's German text, naming the job title, and its achievements.
    expect(resume.summary).toContain('KI-Testtext')
    expect(resume.summary).toContain('Data Engineer')
    const experience = resume.experience as Array<{ company: string; achievements: string[] }>
    expect(experience[0].company).toBe('KI-Testunternehmen')
    expect(experience[0].achievements).toEqual(['KI-Testerfolg 1', 'KI-Testerfolg 2'])
    // Gaps filled from the German sample set; the location from the offer.
    const german = RESUME_SAMPLE_VALUES.de
    expect((resume.contact as Record<string, string>).name).toBe(german.contact.name)
    expect((resume.contact as Record<string, string>).location).toBe('Zürich')
    expect((resume.education as Array<{ school: string }>)[0].school).toBe(german.education.school)

    await expectEditorShowsEverySection(page, 'fr', resume)
  })

  test('(b) no description gives a complete sample CV in the page language, with the notice', async ({
    page,
    authedUser,
  }) => {
    const application = await seedApplication(authedUser.id, {
      jobTitle: 'Datenanalyst',
      company: 'Muster GmbH',
      description: null,
    })

    const response = await createFromApplication(page, 'de', application.id)
    expect(response.status()).toBe(201)
    expect(await response.json()).toMatchObject({ tailored: false })
    await expect(page.getByText(deCommon.resumes.new.notTailored)).toBeVisible()

    const [resume] = await resumesOf(authedUser.id)
    expectCompleteRow(resume)
    expect(await linkedResumeId(application.id)).toBe(resume.id)
    const german = RESUME_SAMPLE_VALUES.de
    expect((resume.experience as Array<{ company: string }>)[0].company).toBe(german.experience.company)
    expect(resume.summary).toContain('Datenanalyst')
    expect(resume.summary).toContain('Muster GmbH')

    await expectEditorShowsEverySection(page, 'de', resume)
  })

  for (const [label, directive] of [
    ['a provider failure', AI_TEST_STUB_DIRECTIVES.providerError],
    ['a provider rate limit', AI_TEST_STUB_DIRECTIVES.rateLimited],
  ] as const) {
    test(`(c) ${label} still gives a complete sample CV in the offer language, with the notice`, async ({
      page,
      authedUser,
    }) => {
      const application = await seedApplication(authedUser.id, {
        jobTitle: 'Data Engineer',
        company: 'Beispiel AG',
        description: `${GERMAN_OFFER}\n${directive}`,
      })

      const response = await createFromApplication(page, 'fr', application.id)
      expect(response.status()).toBe(201)
      expect(await response.json()).toMatchObject({ tailored: false })
      // The notice speaks the page language; the content the offer's.
      await expect(page.getByText(frCommon.resumes.new.notTailored)).toBeVisible()

      const [resume] = await resumesOf(authedUser.id)
      expectCompleteRow(resume)
      expect(await linkedResumeId(application.id)).toBe(resume.id)
      expect((resume.education as Array<{ school: string }>)[0].school).toBe(RESUME_SAMPLE_VALUES.de.education.school)
      expect(resume.summary).not.toContain('KI-Testtext')
    })
  }

  test.describe("(d) another user's application", () => {
    let other: TestUser

    test.beforeEach(async () => {
      other = await createTestUser()
    })

    test.afterEach(async () => {
      await deleteTestUser(other.id)
    })

    test('is refused by the route, and nothing is created or linked', async ({ page, authedUser }) => {
      const foreign = await seedApplication(other.id, {
        jobTitle: 'Secret role',
        company: 'Other user company',
        description: GERMAN_OFFER,
      })

      // The page does not show the other user's application.
      await page.goto(`/fr/dashboard/resumes/new?jobApplicationId=${foreign.id}`)
      await expect(page.getByText('Other user company')).toHaveCount(0)
      await expect(page.locator('#title')).toHaveValue('')

      // A forged request with the signed-in user's session.
      const response = await page.request.post('/api/resumes/from-job-application', {
        data: { jobApplicationId: foreign.id, title: 'Forged', template: 'modern', locale: 'fr' },
      })
      expect(response.status()).toBe(404)

      // A missing application gets the same answer.
      const missing = await page.request.post('/api/resumes/from-job-application', {
        data: { jobApplicationId: '00000000-0000-4000-8000-000000000000', title: 'Forged', template: 'modern', locale: 'fr' },
      })
      expect(missing.status()).toBe(404)

      expect(await resumesOf(authedUser.id)).toEqual([])
      expect(await resumesOf(other.id)).toEqual([])
      expect(await linkedResumeId(foreign.id)).toBeNull()
    })
  })

  test('(e) a CV created without an application stays empty, as before', async ({ page, authedUser }) => {
    let routeCalls = 0
    page.on('request', (request) => {
      if (request.url().includes('/api/resumes/from-job-application')) routeCalls += 1
    })

    await page.goto('/fr/dashboard/resumes/new')
    await expect(page.locator('#title')).toHaveValue('')
    await page.locator('#title').fill('CV vide')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit/)

    const [resume] = await resumesOf(authedUser.id)
    expect(resume).toMatchObject({
      title: 'CV vide',
      template: 'modern',
      contact: {},
      summary: '',
      experience: [],
      education: [],
      skills: [],
      languages: [],
      certifications: [],
      projects: [],
      job_application_id: null,
    })
    expect(routeCalls).toBe(0)
  })

  test('(g) a 255-character job title is pre-filled cut to 200 characters and saved exactly as shown', async ({
    page,
    authedUser,
  }) => {
    const longTitle = `Senior ${'Data Platform '.repeat(19)}Engineer`.slice(0, 255)
    expect(longTitle).toHaveLength(255)
    const application = await seedApplication(authedUser.id, {
      jobTitle: longTitle,
      company: 'Beispiel AG',
      description: null,
    })

    await page.goto(`/fr/dashboard/resumes/new?jobApplicationId=${application.id}`)
    const shown = longTitle.slice(0, 200)
    await expect(page.locator('#title')).toHaveValue(shown)
    await expect(page.locator('#title')).toHaveAttribute('maxlength', '200')

    const response = await createFromApplication(page, 'fr', application.id)
    expect(response.status()).toBe(201)

    const [resume] = await resumesOf(authedUser.id)
    expect(resume.title).toBe(shown)
    expect(await linkedResumeId(application.id)).toBe(resume.id)
  })

  for (const locale of ['fr', 'de', 'en'] as const) {
    test(`(f) banner, title-required message and busy state read in ${locale}`, async ({ page, authedUser }) => {
      const strings = COMMON[locale]
      const application = await seedApplication(authedUser.id, {
        jobTitle: 'Data Engineer',
        company: 'Beispiel AG',
        description: GERMAN_OFFER,
      })

      await page.goto(`/${locale}/dashboard/resumes/new?jobApplicationId=${application.id}`)
      await expect(page.getByText(strings.resumes.new.creatingForJob, { exact: true })).toBeVisible()
      await expect(page.getByText(`Data Engineer ${strings.common.at} Beispiel AG`, { exact: true })).toBeVisible()
      if (locale === 'en') {
        // en is unchanged: the same words the page rendered as fallbacks before.
        expect(strings.resumes.new.creatingForJob).toBe('Creating CV for job application')
        expect(strings.common.at).toBe('at')
        expect(strings.resumes.errors.titleRequired).toBe('Resume title is required')
      }

      await page.locator('#title').fill('')
      await page.locator('button[type="submit"]').click()
      await expect(page.getByText(strings.resumes.errors.titleRequired, { exact: true })).toBeVisible()

      // Hold the request so the busy state can be read, and count submissions.
      let posts = 0
      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/api/resumes/from-job-application', async (route) => {
        posts += 1
        await held
        await route.continue()
      })

      await page.locator('#title').fill('Data Engineer')
      // Two submits in the same tick: the second arrives before React has
      // re-rendered the disabled button, so only the form's own guard stops it.
      await page.evaluate(() => {
        const form = document.querySelector('form')
        if (!form) throw new Error('no form on the page')
        form.requestSubmit()
        form.requestSubmit()
      })
      const submit = page.locator('button[type="submit"]')
      await expect(submit).toHaveText(strings.resumes.new.generating)
      await expect(submit).toBeDisabled()
      release()

      await page.waitForURL(new RegExp(`/${locale}/dashboard/resumes/[0-9a-f-]+/edit`))
      expect(posts).toBe(1)
      expect(await resumesOf(authedUser.id)).toHaveLength(1)
    })
  }
})
