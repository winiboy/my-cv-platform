import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import frCommon from '../src/locales/fr/common.json'
import enCommon from '../src/locales/en/common.json'
import deCommon from '../src/locales/de/common.json'
import itCommon from '../src/locales/it/common.json'

/**
 * The banner on the "new cover letter" page, opened from a job application, is
 * in the page's language (cover-letter-alignment-and-job-banner, US-002).
 *
 * The page reads `coverLetters.new.creatingForJob`, which no locale defined, so
 * every locale showed the page's English fallback. The expected strings are
 * read from the dictionaries rather than restated here, and the English
 * fallback is asserted absent outside /en, so a key that goes missing again in
 * any locale fails this spec.
 *
 * The CV's own banner (`resumes.new.creatingForJob`) is checked once as a
 * guard that the fix did not touch it.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover-letter-new-job-banner spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const COMMON = { fr: frCommon, en: enCommon, de: deCommon, it: itCommon } as const

/** The literal the page renders when the key is missing. */
const ENGLISH_FALLBACK = 'Creating cover letter for job application'

const JOB_TITLE = 'Médecin adjoint·e'
const COMPANY = 'Beispiel AG'

async function seedApplication(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('job_applications')
    .insert({
      user_id: userId,
      job_title: JOB_TITLE,
      company_name: COMPANY,
      job_description: null,
      status: 'saved',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed a job application: ${error?.message}`)
  return data.id as string
}

test.use({ viewport: { width: 1440, height: 900 } })

test.describe('Banner on the new cover letter page for a job application', () => {
  for (const locale of ['fr', 'en', 'de', 'it'] as const) {
    test(`reads in ${locale}`, async ({ page, authedUser }) => {
      const strings = COMMON[locale]
      const title = strings.coverLetters.new.creatingForJob
      expect(title, `coverLetters.new.creatingForJob is missing in ${locale}`).toBeTruthy()

      const applicationId = await seedApplication(authedUser.id)
      await page.goto(`/${locale}/dashboard/cover-letters/new?jobApplicationId=${applicationId}`)

      await expect(page.getByText(title, { exact: true })).toBeVisible()
      await expect(page.getByText(`${JOB_TITLE} ${strings.common.at} ${COMPANY}`, { exact: true })).toBeVisible()

      if (locale === 'en') {
        // en keeps the words the page already rendered as its fallback.
        expect(title).toBe(ENGLISH_FALLBACK)
      } else {
        expect(title).not.toBe(ENGLISH_FALLBACK)
        await expect(page.getByText(ENGLISH_FALLBACK, { exact: true })).toHaveCount(0)
      }
    })
  }

  test('the CV banner still reads resumes.new.creatingForJob', async ({ page, authedUser }) => {
    const strings = COMMON.fr
    const applicationId = await seedApplication(authedUser.id)
    await page.goto(`/fr/dashboard/resumes/new?jobApplicationId=${applicationId}`)

    await expect(page.getByText(strings.resumes.new.creatingForJob, { exact: true })).toBeVisible()
    await expect(page.getByText(`${JOB_TITLE} ${strings.common.at} ${COMPANY}`, { exact: true })).toBeVisible()
    await expect(page.getByText(strings.coverLetters.new.creatingForJob, { exact: true })).toHaveCount(0)
  })
})
