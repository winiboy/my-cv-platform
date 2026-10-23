import { test, expect, createTestUser, deleteTestUser, type TestUser } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { AI_TEST_STUB_COVER_LETTER_TEXTS, AI_TEST_STUB_DIRECTIVES } from '../src/lib/ai/test-stub-contract'
import frCommon from '../src/locales/fr/common.json'
import deCommon from '../src/locales/de/common.json'

/**
 * A cover letter created from a saved job application is written by the AI
 * from the offer and the selected CV (cover-letter-from-job, US-001).
 *
 * WHAT IS REAL
 * The pages, the route `/api/cover-letters/from-job-application`, the session,
 * RLS and the rows in the local Supabase stack. Applications, CVs and letters
 * are seeded for the signed-in user through the service-role client.
 *
 * WHAT IS STUBBED
 * Only the AI provider, on the server, by `src/lib/ai/test-stub.ts`: the
 * Playwright web server sets `AI_TEST_STUB`, and a directive in the job
 * description picks a provider failure or a rate limit. Without a directive the
 * stub writes a letter in the language it is asked for, with one more body
 * paragraph when it was given a CV, so a test can tell that the CV reached it.
 *
 * WHAT IS ASSERTED
 * (a) a German offer under /fr with a CV gives a German letter, stored with
 *     every part non-empty, the CV and its contact name, linked both ways, and
 *     shown in the editor;
 * (b) a French offer under /de without a CV gives a French letter with no
 *     resume_id;
 * (c) a failing or rate-limited AI shows the localized error, creates nothing,
 *     leaves the application's cover_letter_id as it was and keeps the form
 *     filled;
 * (d) another user's application or CV is refused and nothing is created;
 * (e) a letter created without an application is unchanged: the default
 *     greeting and sign-off, no request to the new route;
 * (f) the busy label is localized in fr and de, and two submits in one tick
 *     send one request and create one letter.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover-letter-from-job-application spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

test.use({ viewport: { width: 1440, height: 900 } })

const COMMON = { fr: frCommon, de: deCommon } as const

const ROUTE = '/api/cover-letters/from-job-application'

const GERMAN_OFFER = `Wir suchen eine Data Engineer (m/w/d) für unser Team in Zürich. Sie sind für die Konzeption
der Datenpipelines verantwortlich und arbeiten eng mit den Produktteams zusammen. Ihr Profil: mindestens drei
Jahre Erfahrung in einer ähnlichen Position und sehr gute Python-Kenntnisse. Wir bieten Ihnen ein dynamisches
Umfeld und ein motiviertes Team an unserem Standort.`

const FRENCH_OFFER = `Nous recherchons un ingénieur de données pour notre équipe à Lausanne. Vous serez responsable de la
conception des pipelines de données et vous travaillerez avec les équipes produit. Votre profil : au moins trois
ans d'expérience dans un poste similaire et une très bonne maîtrise de Python. Nous vous offrons un environnement
dynamique et une équipe motivée sur notre site.`

interface StoredLetter {
  id: string
  title: string
  resume_id: string | null
  job_application_id: string | null
  company_name: string | null
  job_title: string | null
  greeting: string
  opening_paragraph: string | null
  body_paragraphs: string[]
  closing_paragraph: string | null
  sign_off: string
  sender_name: string | null
}

async function seedApplication(
  userId: string,
  fields: { jobTitle: string; company: string; description: string | null; coverLetterId?: string }
): Promise<string> {
  const { data, error } = await admin()
    .from('job_applications')
    .insert({
      user_id: userId,
      job_title: fields.jobTitle,
      company_name: fields.company,
      job_description: fields.description,
      cover_letter_id: fields.coverLetterId ?? null,
      status: 'saved',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed a job application: ${error?.message}`)
  return data.id as string
}

async function seedResume(userId: string, title: string, contactName: string): Promise<string> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({
      user_id: userId,
      title,
      template: 'modern',
      contact: { name: contactName, email: 'test@example.test' },
      summary: 'Datenexpertin mit acht Jahren Erfahrung.',
      experience: [{ position: 'Data Engineer', company: 'Acme', startDate: '2020-01', current: true }],
      skills: [{ category: 'Daten', items: ['Python', 'SQL'] }],
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed a resume: ${error?.message}`)
  return data.id as string
}

async function seedLetter(userId: string, title: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({ user_id: userId, title, greeting: 'Dear Hiring Manager,', sign_off: 'Sincerely,' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed a cover letter: ${error?.message}`)
  return data.id as string
}

async function lettersOf(userId: string): Promise<StoredLetter[]> {
  const { data, error } = await admin()
    .from('cover_letters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Could not read cover letters: ${error.message}`)
  return (data ?? []) as StoredLetter[]
}

async function linkedCoverLetterId(applicationId: string): Promise<string | null> {
  const { data, error } = await admin()
    .from('job_applications')
    .select('cover_letter_id')
    .eq('id', applicationId)
    .single()
  if (error) throw new Error(`Could not read the application: ${error.message}`)
  return (data?.cover_letter_id as string | null) ?? null
}

async function submitAndWaitForRoute(page: Page) {
  const responsePromise = page.waitForResponse(`**${ROUTE}`)
  await page.locator('button[type="submit"]').click()
  return responsePromise
}

test.describe('Cover letter from a saved job application', () => {
  test('(a) a German offer under /fr with a CV gives a German letter, linked and shown in the editor', async ({
    page,
    authedUser,
  }) => {
    const resumeId = await seedResume(authedUser.id, 'Mein Lebenslauf', 'Anna Muster')
    const applicationId = await seedApplication(authedUser.id, {
      jobTitle: 'Data Engineer',
      company: 'Beispiel AG',
      description: GERMAN_OFFER,
    })

    await page.goto(`/fr/dashboard/cover-letters/new?jobApplicationId=${applicationId}`)
    await page.locator('#resumeId').selectOption(resumeId)

    const response = await submitAndWaitForRoute(page)
    expect(response.status()).toBe(201)
    await page.waitForURL(/\/fr\/dashboard\/cover-letters\/[0-9a-f-]+\/edit/)

    const german = AI_TEST_STUB_COVER_LETTER_TEXTS.de
    const [letter] = await lettersOf(authedUser.id)
    expect(letter).toMatchObject({
      resume_id: resumeId,
      job_application_id: applicationId,
      company_name: 'Beispiel AG',
      job_title: 'Data Engineer',
      greeting: german.greeting,
      opening_paragraph: `<p>${german.opening('Data Engineer')}</p>`,
      // The second paragraph is the stub's proof that it was given the CV.
      body_paragraphs: [`<p>${german.body}</p>`, `<p>${german.resumeUsed}</p>`],
      closing_paragraph: `<p>${german.closing}</p>`,
      sign_off: german.signOff,
      sender_name: 'Anna Muster',
    })
    expect(await linkedCoverLetterId(applicationId)).toBe(letter.id)
    expect(page.url()).toContain(`/fr/dashboard/cover-letters/${letter.id}/edit`)

    // The editor's preview shows the generated letter.
    for (const text of [german.greeting, german.opening('Data Engineer'), german.body, german.resumeUsed, german.closing]) {
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible()
    }
  })

  test('(b) a French offer under /de without a CV gives a French letter with no resume_id', async ({
    page,
    authedUser,
  }) => {
    // A CV exists but is not selected: the letter must not use it.
    await seedResume(authedUser.id, 'Nicht gewählt', 'Anna Muster')
    const applicationId = await seedApplication(authedUser.id, {
      jobTitle: 'Ingénieur de données',
      company: 'Exemple SA',
      description: FRENCH_OFFER,
    })

    await page.goto(`/de/dashboard/cover-letters/new?jobApplicationId=${applicationId}`)
    await expect(page.locator('#resumeId')).toHaveValue('')

    const response = await submitAndWaitForRoute(page)
    expect(response.status()).toBe(201)
    await page.waitForURL(/\/de\/dashboard\/cover-letters\/[0-9a-f-]+\/edit/)

    const french = AI_TEST_STUB_COVER_LETTER_TEXTS.fr
    const [letter] = await lettersOf(authedUser.id)
    expect(letter).toMatchObject({
      resume_id: null,
      sender_name: null,
      job_application_id: applicationId,
      greeting: french.greeting,
      opening_paragraph: `<p>${french.opening('Ingénieur de données')}</p>`,
      body_paragraphs: [`<p>${french.body}</p>`],
      closing_paragraph: `<p>${french.closing}</p>`,
      sign_off: french.signOff,
    })
    expect(await linkedCoverLetterId(applicationId)).toBe(letter.id)
    await expect(page.getByText(french.closing, { exact: true }).first()).toBeVisible()
  })

  for (const [locale, label, directive] of [
    ['fr', 'a provider failure', AI_TEST_STUB_DIRECTIVES.providerError],
    ['de', 'a provider rate limit', AI_TEST_STUB_DIRECTIVES.rateLimited],
  ] as const) {
    test(`(c) ${label} under /${locale} shows the error, creates nothing and keeps the form`, async ({
      page,
      authedUser,
    }) => {
      const existingLetterId = await seedLetter(authedUser.id, 'Bestehendes Anschreiben')
      const applicationId = await seedApplication(authedUser.id, {
        jobTitle: 'Data Engineer',
        company: 'Beispiel AG',
        description: `${GERMAN_OFFER}\n${directive}`,
        coverLetterId: existingLetterId,
      })

      await page.goto(`/${locale}/dashboard/cover-letters/new?jobApplicationId=${applicationId}`)
      await page.locator('#title').fill('Mein Anschreiben')

      const response = await submitAndWaitForRoute(page)
      expect(response.status()).toBe(directive === AI_TEST_STUB_DIRECTIVES.rateLimited ? 429 : 502)

      await expect(page.getByText(COMMON[locale].coverLetters.new.generationFailed, { exact: true })).toBeVisible()
      expect(page.url()).toContain(`/${locale}/dashboard/cover-letters/new`)
      // The form stays filled and usable, so the user can retry.
      await expect(page.locator('#title')).toHaveValue('Mein Anschreiben')
      await expect(page.locator('#companyName')).toHaveValue('Beispiel AG')
      await expect(page.locator('button[type="submit"]')).toBeEnabled()

      const letters = await lettersOf(authedUser.id)
      expect(letters.map((letter) => letter.id)).toEqual([existingLetterId])
      expect(await linkedCoverLetterId(applicationId)).toBe(existingLetterId)
    })
  }

  test.describe("(d) another user's application or CV", () => {
    let other: TestUser

    test.beforeEach(async () => {
      other = await createTestUser()
    })

    test.afterEach(async () => {
      await deleteTestUser(other.id)
    })

    test('is refused by the route, and nothing is created or linked', async ({ page, authedUser }) => {
      const foreignApplicationId = await seedApplication(other.id, {
        jobTitle: 'Secret role',
        company: 'Other user company',
        description: GERMAN_OFFER,
      })
      const foreignResumeId = await seedResume(other.id, 'Secret CV', 'Other User')
      const ownApplicationId = await seedApplication(authedUser.id, {
        jobTitle: 'Data Engineer',
        company: 'Beispiel AG',
        description: GERMAN_OFFER,
      })

      // Forged requests with the signed-in user's session.
      const body = { title: 'Forged', companyName: 'X', jobTitle: 'Y', locale: 'fr' }
      const foreignApplication = await page.request.post(ROUTE, {
        data: { ...body, jobApplicationId: foreignApplicationId, resumeId: null },
      })
      const missingApplication = await page.request.post(ROUTE, {
        data: { ...body, jobApplicationId: '00000000-0000-4000-8000-000000000000', resumeId: null },
      })
      const foreignResume = await page.request.post(ROUTE, {
        data: { ...body, jobApplicationId: ownApplicationId, resumeId: foreignResumeId },
      })
      const missingResume = await page.request.post(ROUTE, {
        data: { ...body, jobApplicationId: ownApplicationId, resumeId: '00000000-0000-4000-8000-000000000000' },
      })

      for (const response of [foreignApplication, missingApplication, foreignResume, missingResume]) {
        expect(response.status()).toBe(404)
      }
      expect(await lettersOf(authedUser.id)).toEqual([])
      expect(await lettersOf(other.id)).toEqual([])
      expect(await linkedCoverLetterId(foreignApplicationId)).toBeNull()
      expect(await linkedCoverLetterId(ownApplicationId)).toBeNull()
    })
  })

  test('(e) a letter created without an application is unchanged', async ({ page, authedUser }) => {
    let routeCalls = 0
    page.on('request', (request) => {
      if (request.url().includes(ROUTE)) routeCalls += 1
    })

    await page.goto('/fr/dashboard/cover-letters/new')
    await page.locator('#title').fill('Lettre vide')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/fr\/dashboard\/cover-letters\/[0-9a-f-]+\/edit/)

    const [letter] = await lettersOf(authedUser.id)
    expect(letter).toMatchObject({
      title: 'Lettre vide',
      resume_id: null,
      job_application_id: null,
      greeting: 'Dear Hiring Manager,',
      opening_paragraph: null,
      body_paragraphs: [],
      closing_paragraph: null,
      sign_off: 'Sincerely,',
      sender_name: null,
    })
    expect(routeCalls).toBe(0)
  })

  for (const locale of ['fr', 'de'] as const) {
    test(`(f) the busy label reads in ${locale}, and a double submit creates one letter`, async ({
      page,
      authedUser,
    }) => {
      const strings = COMMON[locale]
      const applicationId = await seedApplication(authedUser.id, {
        jobTitle: 'Data Engineer',
        company: 'Beispiel AG',
        description: GERMAN_OFFER,
      })

      await page.goto(`/${locale}/dashboard/cover-letters/new?jobApplicationId=${applicationId}`)

      // Hold the request so the busy state can be read, and count submissions.
      let posts = 0
      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route(`**${ROUTE}`, async (route) => {
        posts += 1
        await held
        await route.continue()
      })

      // Two submits in the same tick: the second arrives before React has
      // re-rendered the disabled button, so only the form's own guard stops it.
      await page.evaluate(() => {
        const form = document.querySelector('form')
        if (!form) throw new Error('no form on the page')
        form.requestSubmit()
        form.requestSubmit()
      })
      const submit = page.locator('button[type="submit"]')
      await expect(submit).toHaveText(strings.coverLetters.new.generating)
      await expect(submit).toBeDisabled()
      release()

      await page.waitForURL(new RegExp(`/${locale}/dashboard/cover-letters/[0-9a-f-]+/edit`))
      expect(posts).toBe(1)
      const letters = await lettersOf(authedUser.id)
      expect(letters).toHaveLength(1)
      expect(await linkedCoverLetterId(applicationId)).toBe(letters[0].id)
    })
  }
})
