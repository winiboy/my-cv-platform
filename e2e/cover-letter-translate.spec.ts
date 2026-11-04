import { test, expect, createTestUser, deleteTestUser } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import type { APIResponse, Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { AI_TEST_STUB_DIRECTIVES, aiTestStubTranslationPrefix } from '../src/lib/ai/test-stub-contract'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'

/**
 * A letter is translated by flag into a new copy (cover-letter-export-translate,
 * US-003).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The flags live in the editor; what matters is what the user can reach and
 * what they end up on: the localized names, the keyboard, the busy state, and
 * the new letter's page. The translation itself runs on the server, answered
 * by the guarded AI test stub (`src/lib/ai/test-stub.ts`), which prefixes
 * every segment with `[DE] ` and keeps its markup.
 *
 * WHAT IS ASSERTED, in fr and de
 *
 *   - The four flags carry localized names ("Traduire en allemand").
 *   - Clicking DE on a French letter shows a localized busy state, then opens
 *     a NEW letter whose stored row has the "(DE)" title, the five translated
 *     parts with their bold, italic and list structure, every other column
 *     kept; the original row is unchanged and the application's
 *     `cover_letter_id` still names the original.
 *   - An AI failure, and a provider rate limit, show the localized error and
 *     create no letter.
 *   - Keyboard: Tab reaches the flags in order, Enter translates.
 *
 * And, once: another user's letter id answers 404 and creates nothing; and a
 * letter whose title is a default title (FR-6) gives a copy titled with the
 * German default, without the "(DE)" suffix, while a user title keeps the
 * suffix (cover-letter-preview-and-card-language, US-004).
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter translate')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const LOCALES = { fr, de } as const
type TestLocale = keyof typeof LOCALES

const LETTER_TITLE = 'Lettre Zürich'
const DE = aiTestStubTranslationPrefix('de')

/** A French letter; every translated part is distinct. */
const FRENCH_LETTER = {
  sender_name: 'Zoë Lovelace',
  recipient_name: 'Jürgen Weiß',
  recipient_title: 'Leiter Entwicklung',
  company_name: 'Größe & Söhne AG',
  company_address: 'Bahnhofstraße 1\n8001 Zürich',
  job_title: 'Ingénieur logiciel',
  job_description: 'Nous cherchons un ingénieur logiciel.',
  greeting: 'Madame, Monsieur,',
  opening_paragraph:
    '<p>Je postule avec <strong>une conviction forte</strong> et <em>un réel intérêt</em>.</p>' +
    '<ol><li>Première raison</li><li>Deuxième raison</li></ol>',
  body_paragraphs: ['<p>Corps un : j’ai livré des logiciels.</p>', '<p>Corps deux : l’accessibilité compte.</p>'],
  closing_paragraph: '<p>Merci pour votre temps.</p>',
  sign_off: 'Cordialement,',
}

/** The stub's translation of FRENCH_LETTER into German, as stored. */
const TRANSLATED_DE = {
  title: `${LETTER_TITLE} (DE)`,
  greeting: `${DE}Madame, Monsieur,`,
  opening_paragraph:
    `<p>${DE}Je postule avec <strong>une conviction forte</strong> et <em>un réel intérêt</em>.</p>` +
    `<ol><li>${DE}Première raison</li><li>${DE}Deuxième raison</li></ol>`,
  body_paragraphs: [`<p>${DE}Corps un : j’ai livré des logiciels.</p>`, `<p>${DE}Corps deux : l’accessibilité compte.</p>`],
  closing_paragraph: `<p>${DE}Merci pour votre temps.</p>`,
  sign_off: `${DE}Cordialement,`,
}

/** The columns a translation copies unchanged. */
const KEPT_COLUMNS = [
  'recipient_name',
  'recipient_title',
  'company_name',
  'company_address',
  'sender_name',
  'job_title',
  'job_description',
  'template',
  'resume_id',
  'job_application_id',
] as const

interface Seeded {
  letterId: string
  applicationId: string
  resumeId: string
}

/** A French letter linked both ways to an application, and to a CV. */
async function seedLinkedLetter(userId: string, fields: Record<string, unknown> = {}): Promise<Seeded> {
  const db = admin()
  const resume = await seedFixtureResume(userId, 'professional')
  const { data: letter, error: letterError } = await db
    .from('cover_letters')
    .insert({ user_id: userId, title: LETTER_TITLE, resume_id: resume.id, ...FRENCH_LETTER, ...fields })
    .select('id')
    .single()
  expect(letterError, letterError?.message).toBeNull()
  const letterId = (letter as { id: string }).id

  const { data: application, error: applicationError } = await db
    .from('job_applications')
    .insert({
      user_id: userId,
      job_title: FRENCH_LETTER.job_title,
      company_name: FRENCH_LETTER.company_name,
      cover_letter_id: letterId,
      resume_id: resume.id,
      status: 'saved',
    })
    .select('id')
    .single()
  expect(applicationError, applicationError?.message).toBeNull()
  const applicationId = (application as { id: string }).id

  const { error: linkError } = await db.from('cover_letters').update({ job_application_id: applicationId }).eq('id', letterId)
  expect(linkError, linkError?.message).toBeNull()
  return { letterId, applicationId, resumeId: resume.id }
}

async function lettersOf(userId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await admin().from('cover_letters').select('*').eq('user_id', userId).order('created_at')
  expect(error, error?.message).toBeNull()
  return data as Record<string, unknown>[]
}

async function letter(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin().from('cover_letters').select('*').eq('id', id).single()
  expect(error, error?.message).toBeNull()
  return data as Record<string, unknown>
}

async function applicationCoverLetterId(applicationId: string): Promise<string | null> {
  const { data, error } = await admin().from('job_applications').select('cover_letter_id').eq('id', applicationId).single()
  expect(error, error?.message).toBeNull()
  return (data as { cover_letter_id: string | null }).cover_letter_id
}

async function openEditor(page: Page, locale: TestLocale, letterId: string): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  await expect(flag(page, locale, 'de')).toBeVisible()
}

function flag(page: Page, locale: TestLocale, language: 'en' | 'fr' | 'de' | 'it'): Locator {
  return page.getByRole('button', { name: LOCALES[locale].coverLetters.editor.translate.to[language], exact: true })
}

/** The translate notice, by id: Next's route announcer is a second `role="alert"`. */
const translateNotice = (page: Page) => page.locator('#cover-letter-translate-notice')

function requestTranslation(page: Page, letterId: string): Promise<APIResponse> {
  return page.request.post(`/api/cover-letters/${letterId}/translate`, {
    data: { targetLanguage: 'de' },
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The new letter: the stored row is the stub's German translation, with every other column kept. */
async function expectGermanCopy(userId: string, seeded: Seeded, original: Record<string, unknown>): Promise<string> {
  const letters = await lettersOf(userId)
  expect(letters).toHaveLength(2)
  const copy = letters.find((row) => row.id !== seeded.letterId)!
  expect(copy).toMatchObject(TRANSLATED_DE)
  for (const column of KEPT_COLUMNS) expect(copy[column], column).toEqual(original[column])
  expect(copy.resume_id).toBe(seeded.resumeId)
  expect(copy.job_application_id).toBe(seeded.applicationId)

  // The original is untouched, and the application still names it.
  expect(await letter(seeded.letterId)).toEqual(original)
  expect(await applicationCoverLetterId(seeded.applicationId)).toBe(seeded.letterId)
  return copy.id as string
}

for (const locale of Object.keys(LOCALES) as TestLocale[]) {
  const messages = LOCALES[locale].coverLetters.editor.translate

  test.describe(`cover letter translation (${locale})`, () => {
    test('the four flags carry localized names, in the shared order', async ({ page, authedUser }) => {
      const { letterId } = await seedLinkedLetter(authedUser.id)
      await openEditor(page, locale, letterId)

      const group = page.getByRole('group', { name: messages.label, exact: true })
      await expect(group.getByRole('button')).toHaveCount(4)
      const names = await group.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
      expect(names).toEqual([messages.to.en, messages.to.fr, messages.to.de, messages.to.it])
      // Each flag is the shared SVG, hidden from assistive technology.
      await expect(group.locator('svg[aria-hidden="true"]')).toHaveCount(4)
    })

    test('clicking DE creates a translated copy and opens it, leaving the original and its link unchanged', async ({
      page,
      authedUser,
    }) => {
      const seeded = await seedLinkedLetter(authedUser.id)
      const original = await letter(seeded.letterId)
      await openEditor(page, locale, seeded.letterId)

      // Held until the busy state has been seen.
      let release!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/api/cover-letters/*/translate', async (route) => {
        await held
        await route.continue()
      })

      await flag(page, locale, 'de').click()
      const busy = page.getByRole('button', { name: messages.translating.de, exact: true })
      await expect(busy).toHaveAttribute('aria-busy', 'true')
      await expect(page.getByRole('status').filter({ hasText: messages.translating.de })).toBeVisible()
      release()

      await page.waitForURL((url) => /\/dashboard\/cover-letters\/[^/]+\/edit$/.test(url.pathname) && !url.pathname.includes(seeded.letterId))
      const copyId = await expectGermanCopy(authedUser.id, seeded, original)
      expect(new URL(page.url()).pathname).toBe(`/${locale}/dashboard/cover-letters/${copyId}/edit`)
      // The new letter's editor shows the translated title.
      await expect(page.getByPlaceholder(LOCALES[locale].coverLetters.editor.titlePlaceholder)).toHaveValue(TRANSLATED_DE.title)
    })

    test('keyboard: Tab reaches the flags in order, and Enter translates', async ({ page, authedUser }) => {
      const seeded = await seedLinkedLetter(authedUser.id)
      const original = await letter(seeded.letterId)
      await openEditor(page, locale, seeded.letterId)

      // The Word button is the last header control before the flags (Save is
      // disabled with nothing to save).
      await page.getByRole('button', { name: LOCALES[locale].coverLetters.downloadWord, exact: true }).focus()
      for (const language of ['en', 'fr', 'de'] as const) {
        await page.keyboard.press('Tab')
        await expect(flag(page, locale, language)).toBeFocused()
      }
      await page.keyboard.press('Enter')

      await page.waitForURL((url) => !url.pathname.includes(seeded.letterId))
      await expectGermanCopy(authedUser.id, seeded, original)
    })

    test('an AI failure or rate limit shows the localized error and creates no letter', async ({ page, authedUser }) => {
      for (const [directive, message] of [
        [AI_TEST_STUB_DIRECTIVES.providerError, messages.failed],
        [AI_TEST_STUB_DIRECTIVES.rateLimited, messages.rateLimited],
      ] as const) {
        const seeded = await seedLinkedLetter(authedUser.id, {
          body_paragraphs: [`<p>Corps ${directive}</p>`],
        })
        const before = await lettersOf(authedUser.id)
        const original = await letter(seeded.letterId)
        await openEditor(page, locale, seeded.letterId)

        const button = flag(page, locale, 'de')
        await button.click()
        await expect(translateNotice(page)).toHaveText(message)
        await expect(button).toHaveAttribute('aria-disabled', 'false')
        await expect(button).toHaveAttribute('aria-describedby', 'cover-letter-translate-notice')
        expect(new URL(page.url()).pathname).toBe(`/${locale}/dashboard/cover-letters/${seeded.letterId}/edit`)

        expect(await lettersOf(authedUser.id)).toHaveLength(before.length)
        expect(await letter(seeded.letterId)).toEqual(original)
        expect(await applicationCoverLetterId(seeded.applicationId)).toBe(seeded.letterId)
      }
    })

    test('with unsaved changes the editor asks to save first and translates nothing', async ({ page, authedUser }) => {
      const seeded = await seedLinkedLetter(authedUser.id)
      await openEditor(page, locale, seeded.letterId)
      const requests: string[] = []
      page.on('request', (request) => {
        if (request.url().endsWith('/translate')) requests.push(request.method())
      })

      await page.getByPlaceholder(LOCALES[locale].coverLetters.editor.titlePlaceholder).fill('Edited title')
      await flag(page, locale, 'de').click()

      await expect(translateNotice(page)).toHaveText(messages.saveFirst)
      expect(requests).toEqual([])
      expect(await lettersOf(authedUser.id)).toHaveLength(1)
    })
  })
}

test("another user's letter id is refused with 404 and creates nothing", async ({ page, authedUser }) => {
  const other = await createTestUser()
  try {
    const foreign = await seedLinkedLetter(other.id)
    const foreignOriginal = await letter(foreign.letterId)

    const response = await requestTranslation(page, foreign.letterId)
    expect(response.status()).toBe(404)
    expect(await response.json()).toEqual({ error: 'Cover letter not found' })

    expect(await lettersOf(other.id)).toHaveLength(1)
    expect(await lettersOf(authedUser.id)).toHaveLength(0)
    expect(await letter(foreign.letterId)).toEqual(foreignOriginal)

    expect((await requestTranslation(page, '00000000-0000-4000-8000-000000000000')).status()).toBe(404)
    expect((await requestTranslation(page, 'not-a-uuid')).status()).toBe(404)
  } finally {
    await deleteTestUser(other.id)
  }
})

test.describe('the translated copy of a default-titled letter', () => {
  const FRENCH_DEFAULT = `Lettre de motivation - ${FRENCH_LETTER.job_title} chez ${FRENCH_LETTER.company_name}`
  const GERMAN_DEFAULT = `Anschreiben - ${FRENCH_LETTER.job_title} bei ${FRENCH_LETTER.company_name}`

  test('clicking DE under /fr gives the German default title, with no suffix', async ({ page, authedUser }) => {
    const seeded = await seedLinkedLetter(authedUser.id, { title: FRENCH_DEFAULT })
    await openEditor(page, 'fr', seeded.letterId)

    await flag(page, 'fr', 'de').click()
    await page.waitForURL((url) => /\/dashboard\/cover-letters\/[^/]+\/edit$/.test(url.pathname) && !url.pathname.includes(seeded.letterId))

    const copy = (await lettersOf(authedUser.id)).find((row) => row.id !== seeded.letterId)!
    expect(copy).toMatchObject({
      title: GERMAN_DEFAULT,
      job_title: FRENCH_LETTER.job_title,
      company_name: FRENCH_LETTER.company_name,
    })
    expect((await letter(seeded.letterId)).title).toBe(FRENCH_DEFAULT)
    await expect(page.getByPlaceholder(fr.coverLetters.editor.titlePlaceholder)).toHaveValue(GERMAN_DEFAULT)
  })

  test('a suffixed English default gives the German default; a user title keeps the suffix', async ({ page, authedUser }) => {
    const english = await seedLinkedLetter(authedUser.id, {
      title: `Cover Letter - ${FRENCH_LETTER.job_title} at ${FRENCH_LETTER.company_name} (FR)`,
    })
    const response = await requestTranslation(page, english.letterId)
    expect(response.status()).toBe(201)
    const { coverLetterId } = (await response.json()) as { coverLetterId: string }
    expect((await letter(coverLetterId)).title).toBe(GERMAN_DEFAULT)

    const user = await seedLinkedLetter(authedUser.id, { title: `${FRENCH_DEFAULT} (Copy)` })
    const userResponse = await requestTranslation(page, user.letterId)
    expect(userResponse.status()).toBe(201)
    const { coverLetterId: userCopyId } = (await userResponse.json()) as { coverLetterId: string }
    expect((await letter(userCopyId)).title).toBe(`${FRENCH_DEFAULT} (Copy) (DE)`)
  })
})
