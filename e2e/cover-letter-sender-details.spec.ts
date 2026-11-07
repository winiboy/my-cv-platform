import { test, expect } from './fixtures/auth'
import { FIXTURE_CONTACT, seedFixtureResume } from './fixtures/resume'
import type { Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/**
 * A letter stores the sender's details and its annexes, edited in the
 * editor's Signature section (cover-letter-swiss-format, US-001).
 *
 * WHAT IS ASSERTED
 *
 *   - The Signature section shows the five fields, under the sender name,
 *     with their labels, placeholders and the annexes' hint in fr, en, de
 *     and it.
 *   - The five fields are saved, stored, and shown again on reopening.
 *   - Annexes: an empty field is stored as null (the default list), as is
 *     whitespace; the "no Annexes block" checkbox stores the empty string and
 *     changes the hint; both survive a reload.
 *   - The CV fallback (owner decision, 2026-11-05): a letter whose details
 *     were never set (null) shows its linked CV's phone, e-mail and locality,
 *     without counting as changed, so the PDF downloads without a save; the
 *     next save stores them; a field the user clears stays empty when the
 *     letter is reopened; a stored detail is never replaced by the CV's.
 *   - Linking, re-linking and unlinking a CV move the fallback with the
 *     link, and never touch a field the user typed, not even while the link
 *     is being stored.
 *   - The editor refuses an invalid e-mail before writing anything: the
 *     error is next to the field, the field is invalid and focused.
 *   - The cards' Duplicate carries the five fields unchanged.
 *
 * The translated copy carrying them is asserted in
 * `cover-letter-translate.spec.ts`, and the letter from a job application
 * in `cover-letter-from-job-application.spec.ts`.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter sender details')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const LOCALES = { fr, en, de, it } as const
type TestLocale = keyof typeof LOCALES
type Dict = (typeof LOCALES)[TestLocale]

const SENDER_COLUMNS = ['sender_street', 'sender_postal_locality', 'sender_phone', 'sender_email', 'annexes'] as const
type SenderColumn = (typeof SENDER_COLUMNS)[number]
type SenderRow = Record<SenderColumn, string | null>

/** The dictionary key prefix of each field's label and placeholder. */
const FIELD_KEYS = {
  sender_street: 'street',
  sender_postal_locality: 'postalLocality',
  sender_phone: 'phone',
  sender_email: 'email',
  annexes: 'annexes',
} as const satisfies Record<SenderColumn, string>

const DETAILS: SenderRow = {
  sender_street: 'Rue de Bourg 12',
  sender_postal_locality: '1003 Zürich',
  sender_phone: '+41 21 555 01 42',
  sender_email: 'zoe@example.ch',
  annexes: 'CV, certificats de travail, diplômes',
}

const NEVER_SET: SenderRow = {
  sender_street: null,
  sender_postal_locality: null,
  sender_phone: null,
  sender_email: null,
  annexes: null,
}

/** A second CV, for re-linking: its contact differs from FIXTURE_CONTACT in every detail. */
const OTHER_CONTACT = {
  name: 'Bea Keller',
  email: 'bea.keller@example.test',
  phone: '+41 44 555 0199',
  location: '8001 Zürich',
}

async function insertLetter(userId: string, fields: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({ user_id: userId, title: 'Lettre expéditeur', sender_name: 'Zoë Lovelace', ...fields })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

async function insertResume(userId: string, title: string, contact: Record<string, string>): Promise<string> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({ user_id: userId, title, template: 'modern', contact })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

async function storedLetter(id: string): Promise<SenderRow & { title: string; resume_id: string | null }> {
  const { data, error } = await admin()
    .from('cover_letters')
    .select(`title, resume_id, ${SENDER_COLUMNS.join(', ')}`)
    .eq('id', id)
    .single()
  expect(error, error?.message).toBeNull()
  return data as unknown as SenderRow & { title: string; resume_id: string | null }
}

async function senderRow(id: string): Promise<SenderRow> {
  const { data, error } = await admin().from('cover_letters').select(SENDER_COLUMNS.join(', ')).eq('id', id).single()
  expect(error, error?.message).toBeNull()
  return data as unknown as SenderRow
}

async function lettersOf(userId: string): Promise<Array<SenderRow & { id: string }>> {
  const { data, error } = await admin()
    .from('cover_letters')
    .select(`id, ${SENDER_COLUMNS.join(', ')}`)
    .eq('user_id', userId)
    .order('created_at')
  expect(error, error?.message).toBeNull()
  return data as unknown as Array<SenderRow & { id: string }>
}

/** The editor pane: the scroll container between the section nav and the preview. */
const editorPane = (page: Page) => page.locator('div.overflow-y-auto.p-6')

async function openEditor(page: Page, locale: TestLocale, letterId: string): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
}

type Section = 'signature' | 'resume' | 'recipient'

async function showSection(page: Page, dict: Dict, section: Section): Promise<Locator> {
  const editor = dict.coverLetters.editor
  await page.getByRole('button', { name: editor.sections[section], exact: true }).click()
  const pane = editorPane(page)
  await expect(pane.getByRole('heading', { level: 3, name: editor[section].title })).toBeVisible()
  return pane
}

const signatureDict = (dict: Dict) => dict.coverLetters.editor.signature

/** A label or placeholder of the Signature section, by its dictionary key. */
const signatureText = (dict: Dict, key: string) => (signatureDict(dict) as Record<string, unknown>)[key] as string

function field(pane: Locator, dict: Dict, column: SenderColumn): Locator {
  return pane.getByLabel(signatureText(dict, `${FIELD_KEYS[column]}Label`), { exact: true })
}

const noAnnexes = (pane: Locator, dict: Dict) =>
  pane.getByRole('checkbox', { name: dict.coverLetters.editor.signature.noAnnexesLabel, exact: true })

const unsavedIndicator = (page: Page, dict: Dict) =>
  page.getByText(dict.coverLetters.editor.unsavedChanges, { exact: true })

const saveButton = (page: Page, dict: Dict) => page.getByRole('button', { name: dict.common.save, exact: true })

/** Saves, and waits until the editor reports the letter saved. */
async function save(page: Page, dict: Dict): Promise<void> {
  await saveButton(page, dict).click()
  await expect(unsavedIndicator(page, dict)).toHaveCount(0)
}

/** The fields show the fallback of this CV contact (a CV has no street). */
async function expectCvFallback(
  pane: Locator,
  dict: Dict,
  contact: { phone: string; email: string; location: string }
): Promise<void> {
  await expect(field(pane, dict, 'sender_phone')).toHaveValue(contact.phone)
  await expect(field(pane, dict, 'sender_email')).toHaveValue(contact.email)
  await expect(field(pane, dict, 'sender_postal_locality')).toHaveValue(contact.location)
}

async function linkResume(page: Page, dict: Dict, resumeId: string, letterId: string): Promise<void> {
  const pane = await showSection(page, dict, 'resume')
  await pane.locator('select').selectOption(resumeId)
  await expect.poll(async () => (await storedLetter(letterId)).resume_id).toBe(resumeId || null)
}

for (const locale of Object.keys(LOCALES) as TestLocale[]) {
  const dict = LOCALES[locale]
  const signature = signatureDict(dict)

  test(`the Signature section shows the five fields with ${locale} labels, under the sender name`, async ({
    page,
    authedUser,
  }) => {
    const letterId = await insertLetter(authedUser.id)
    await openEditor(page, locale, letterId)
    const pane = await showSection(page, dict, 'signature')

    const name = pane.getByPlaceholder(signature.namePlaceholder, { exact: true })
    const nameBox = (await name.boundingBox())!
    for (const column of SENDER_COLUMNS) {
      const input = field(pane, dict, column)
      await expect(input, column).toBeVisible()
      await expect(input).toHaveAttribute('placeholder', signatureText(dict, `${FIELD_KEYS[column]}Placeholder`))
      expect((await input.boundingBox())!.y, `${column} is under the sender name`).toBeGreaterThan(nameBox.y)
    }
    // The annexes' meaning is a persistent hint, tied to the field.
    await expect(field(pane, dict, 'annexes')).toHaveAccessibleDescription(signature.annexesHint)
    await expect(noAnnexes(pane, dict)).toBeVisible()
    await expect(noAnnexes(pane, dict)).not.toBeChecked()
  })
}

test('the five fields are saved, stored and shown again on reopening (fr)', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, 'fr', letterId)
  let pane = await showSection(page, fr, 'signature')

  for (const column of SENDER_COLUMNS) await field(pane, fr, column).fill(DETAILS[column]!)
  await expect(unsavedIndicator(page, fr)).toBeVisible()
  expect(await senderRow(letterId), 'nothing is stored before Save').toEqual(NEVER_SET)

  await save(page, fr)
  await expect.poll(() => senderRow(letterId)).toEqual(DETAILS)

  await page.reload()
  pane = await showSection(page, fr, 'signature')
  for (const column of SENDER_COLUMNS) await expect(field(pane, fr, column), column).toHaveValue(DETAILS[column]!)
  await expect(unsavedIndicator(page, fr)).toHaveCount(0)
})

test('annexes: empty and whitespace are null, the checkbox stores an empty string, and both survive a reload (de)', async ({
  page,
  authedUser,
}) => {
  const signature = signatureDict(de)
  const letterId = await insertLetter(authedUser.id, { sender_street: 'Bahnhofstrasse 1', annexes: 'Lebenslauf' })
  await openEditor(page, 'de', letterId)
  let pane = await showSection(page, de, 'signature')
  const annexes = () => field(pane, de, 'annexes')

  // Clearing the field returns to the default list: null, not ''.
  await expect(annexes()).toHaveValue('Lebenslauf')
  await annexes().fill('')
  await save(page, de)
  await expect.poll(async () => (await senderRow(letterId)).annexes).toBeNull()

  // Whitespace alone is no list either.
  await annexes().fill('   ')
  await save(page, de)
  await expect.poll(async () => (await senderRow(letterId)).annexes).toBeNull()

  // The checkbox stores the empty string: no Annexes block, and says so.
  await noAnnexes(pane, de).check()
  await expect(annexes()).toBeDisabled()
  await expect(annexes()).toHaveAccessibleDescription(signature.noAnnexesHint)
  await save(page, de)
  await expect.poll(async () => (await senderRow(letterId)).annexes).toBe('')

  await page.reload()
  pane = await showSection(page, de, 'signature')
  await expect(noAnnexes(pane, de)).toBeChecked()
  await expect(annexes()).toBeDisabled()
  await expect(annexes()).toHaveValue('')

  // Unchecking returns to the default list.
  await noAnnexes(pane, de).uncheck()
  await expect(annexes()).toBeEnabled()
  await expect(annexes()).toHaveAccessibleDescription(signature.annexesHint)
  await save(page, de)
  await expect.poll(async () => (await senderRow(letterId)).annexes).toBeNull()

  // The other fields were never touched.
  expect((await senderRow(letterId)).sender_street).toBe('Bahnhofstrasse 1')
})

test('a letter never given sender details shows its CV ones, unchanged, downloads, and stores them on the next save (fr)', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  const letterId = await insertLetter(authedUser.id, { resume_id: resume.id })

  await openEditor(page, 'fr', letterId)
  let pane = await showSection(page, fr, 'signature')
  await expectCvFallback(pane, fr, FIXTURE_CONTACT)
  // A CV has no street.
  await expect(field(pane, fr, 'sender_street')).toHaveValue('')
  // The fallback is no change: nothing to save, and the PDF downloads as it is.
  await expect(unsavedIndicator(page, fr)).toHaveCount(0)
  await expect(saveButton(page, fr)).toBeDisabled()
  const pdf = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/download-pdf'))
  await page.getByRole('button', { name: fr.coverLetters.downloadPDF, exact: true }).click()
  expect((await pdf).status()).toBe(200)
  await expect(page.locator('#cover-letter-pdf-notice')).toHaveCount(0)
  expect(await senderRow(letterId), 'nothing is stored by opening or downloading').toEqual(NEVER_SET)

  // Any real save stores what the fields show.
  await page.getByPlaceholder(fr.coverLetters.editor.titlePlaceholder).fill('Lettre enregistrée')
  await save(page, fr)
  await expect.poll(() => senderRow(letterId)).toEqual({
    ...NEVER_SET,
    sender_postal_locality: FIXTURE_CONTACT.location,
    sender_phone: FIXTURE_CONTACT.phone,
    sender_email: FIXTURE_CONTACT.email,
  })

  // A field cleared on purpose is stored empty, and is not refilled.
  await field(pane, fr, 'sender_phone').fill('')
  await save(page, fr)
  await expect.poll(async () => (await senderRow(letterId)).sender_phone).toBe('')
  await page.reload()
  pane = await showSection(page, fr, 'signature')
  await expect(field(pane, fr, 'sender_phone')).toHaveValue('')
  await expect(field(pane, fr, 'sender_email')).toHaveValue(FIXTURE_CONTACT.email)
  await expect(unsavedIndicator(page, fr)).toHaveCount(0)
})

test('a stored sender detail is never replaced by the CV one; the others fall back (en)', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  const letterId = await insertLetter(authedUser.id, { resume_id: resume.id, sender_phone: '+41 79 000 00 00' })

  await openEditor(page, 'en', letterId)
  const pane = await showSection(page, en, 'signature')
  await expect(field(pane, en, 'sender_phone')).toHaveValue('+41 79 000 00 00')
  await expect(field(pane, en, 'sender_email')).toHaveValue(FIXTURE_CONTACT.email)
  await expect(field(pane, en, 'sender_postal_locality')).toHaveValue(FIXTURE_CONTACT.location)
  await expect(unsavedIndicator(page, en)).toHaveCount(0)
})

test('linking, re-linking and unlinking a CV move the fallback and keep what the user typed (it)', async ({
  page,
  authedUser,
}) => {
  const resumeA = await seedFixtureResume(authedUser.id, 'professional')
  const resumeB = await insertResume(authedUser.id, 'CV B', OTHER_CONTACT)
  const letterId = await insertLetter(authedUser.id)

  await openEditor(page, 'it', letterId)
  let pane = await showSection(page, it, 'signature')
  for (const column of ['sender_phone', 'sender_email', 'sender_postal_locality'] as const) {
    await expect(field(pane, it, column), column).toHaveValue('')
  }
  await field(pane, it, 'sender_street').fill('Via Nassa 5')

  // Linked to A: the fields never set show A's details.
  await linkResume(page, it, resumeA.id, letterId)
  pane = await showSection(page, it, 'signature')
  await expectCvFallback(pane, it, FIXTURE_CONTACT)
  await field(pane, it, 'sender_email').fill('mia@example.ch')

  // Re-linked to B: B's details, except what the user typed.
  await linkResume(page, it, resumeB, letterId)
  pane = await showSection(page, it, 'signature')
  await expect(field(pane, it, 'sender_phone')).toHaveValue(OTHER_CONTACT.phone)
  await expect(field(pane, it, 'sender_postal_locality')).toHaveValue(OTHER_CONTACT.location)
  await expect(field(pane, it, 'sender_email')).toHaveValue('mia@example.ch')
  await expect(field(pane, it, 'sender_street')).toHaveValue('Via Nassa 5')

  // Unlinked: no fallback left; the typed fields stay.
  await linkResume(page, it, '', letterId)
  pane = await showSection(page, it, 'signature')
  await expect(field(pane, it, 'sender_phone')).toHaveValue('')
  await expect(field(pane, it, 'sender_postal_locality')).toHaveValue('')
  await expect(field(pane, it, 'sender_email')).toHaveValue('mia@example.ch')
  await expect(field(pane, it, 'sender_street')).toHaveValue('Via Nassa 5')

  await save(page, it)
  await expect.poll(() => senderRow(letterId)).toEqual({
    ...NEVER_SET,
    sender_street: 'Via Nassa 5',
    sender_email: 'mia@example.ch',
  })
})

test('a field typed while a CV link is being stored is kept (fr)', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  const letterId = await insertLetter(authedUser.id)

  // Hold the link's write until the user has typed.
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let held = false
  await page.route(/\/rest\/v1\/cover_letters/, async (route) => {
    if (route.request().method() === 'PATCH' && !held) {
      held = true
      await released
    }
    await route.continue()
  })

  await openEditor(page, 'fr', letterId)
  const resumePane = await showSection(page, fr, 'resume')
  await resumePane.locator('select').selectOption(resume.id)
  await expect.poll(() => held).toBe(true)

  const pane = await showSection(page, fr, 'signature')
  await field(pane, fr, 'sender_phone').fill('+41 79 111 11 11')
  release()
  await expect.poll(async () => (await storedLetter(letterId)).resume_id).toBe(resume.id)

  await expect(field(pane, fr, 'sender_phone')).toHaveValue('+41 79 111 11 11')
  await expect(field(pane, fr, 'sender_email')).toHaveValue(FIXTURE_CONTACT.email)
  await save(page, fr)
  await expect.poll(async () => (await senderRow(letterId)).sender_phone).toBe('+41 79 111 11 11')
})

test('the editor refuses an invalid e-mail before writing, next to the field (de)', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, 'de', letterId)
  let pane = await showSection(page, de, 'signature')
  const email = () => field(pane, de, 'sender_email')

  await email().fill('anna at example')
  await page.getByPlaceholder(de.coverLetters.editor.titlePlaceholder).fill('Nicht gespeichert')
  // Saved from another section: the editor brings the field back.
  await showSection(page, de, 'recipient')
  await saveButton(page, de).click()

  pane = editorPane(page)
  await expect(pane.getByRole('heading', { level: 3, name: de.coverLetters.editor.signature.title })).toBeVisible()
  await expect(email()).toHaveAttribute('aria-invalid', 'true')
  await expect(email()).toHaveAccessibleDescription(de.coverLetters.editor.signature.errors.invalidEmail)
  await expect(email()).toBeFocused()
  await expect(unsavedIndicator(page, de)).toBeVisible()
  expect(await storedLetter(letterId), 'nothing is written').toMatchObject({ title: 'Lettre expéditeur', sender_email: null })

  // Correcting the field clears the error, and the letter saves.
  await email().fill('anna@example.ch')
  await expect(email()).not.toHaveAttribute('aria-invalid', 'true')
  await save(page, de)
  await expect.poll(() => storedLetter(letterId)).toMatchObject({ title: 'Nicht gespeichert', sender_email: 'anna@example.ch' })
})

test("the cards' Duplicate carries the five fields unchanged (fr)", async ({ page, authedUser }) => {
  // An empty annexes and an empty phone, so the copy must keep '' apart from null.
  const original = { ...DETAILS, sender_phone: '', annexes: '' }
  const letterId = await insertLetter(authedUser.id, original)

  const response = await page.goto('/fr/dashboard/cover-letters')
  expect(response?.status()).toBe(200)
  const card = page
    .locator('div.relative')
    .filter({ has: page.getByRole('heading', { level: 3, name: 'Lettre expéditeur' }) })
    .last()
  await expect(card.getByRole('heading', { name: 'Lettre expéditeur' })).toBeVisible()
  // The kebab carries an icon and no label, so it is addressed by position.
  await card.locator('button').first().click()
  await page.getByRole('button', { name: fr.coverLetters.duplicate, exact: true }).click()

  await expect.poll(async () => (await lettersOf(authedUser.id)).length).toBe(2)
  const copy = (await lettersOf(authedUser.id)).find((row) => row.id !== letterId)!
  expect(copy).toEqual({ id: copy.id, ...original })
})
