import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'

/**
 * The Signature tab's street and postcode fields show a neutral example in
 * the letter's language, not the interface's
 * (cover-letter-sender-placeholders, US-002).
 *
 * WHAT IS ASSERTED
 *
 *   - A German letter opened under /fr, and a French letter opened under /de,
 *     with no linked CV and no stored address: both fields are empty and show
 *     the exact example of the letter's language, without a prefix. The
 *     expected strings are written out here rather than read from the
 *     letter wording, so the test proves the text and not only the key.
 *   - Typing the opening in another language, unsaved, switches both
 *     examples to that language, as it switches the default greeting.
 *   - Saving without typing in the fields stores nothing in them (they stay
 *     `null`), and the preview never prints an example.
 *
 * The letter is a real row created for the signed-in user through the
 * service-role client, and the page load's HTTP status is asserted, so a
 * failing server render cannot hide behind the client.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter sender address examples')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Long enough for the letter's language to be detected. */
const GERMAN_OPENING =
  '<p>Mit großem Interesse habe ich Ihre Anzeige gelesen und bewerbe mich für die Stelle als Entwickler. In meiner bisherigen Erfahrung bei einer Firma habe ich die Aufgaben im Team mit Freude übernommen und bin sicher, dass ich auch Ihre Erwartungen erfülle.</p>'
const FRENCH_OPENING =
  "<p>Je vous écris pour vous présenter ma candidature au poste de développeur. Avec cinq ans d'expérience dans une équipe agile, je suis convaincu que mon profil correspond à vos besoins et à votre entreprise.</p>"
const FRENCH_OPENING_TYPED =
  "Je vous écris pour vous présenter ma candidature au poste de développeur. Avec cinq ans d'expérience dans une équipe agile, je suis convaincu que mon profil correspond à vos besoins et à votre entreprise."

const GERMAN_EXAMPLES = { street: 'Dorfstrasse 12', postalLocality: '1234 Mein Ort' }
const FRENCH_EXAMPLES = { street: 'Rue du Bourg 12', postalLocality: '1234 Ma ville' }
const ALL_EXAMPLES = [GERMAN_EXAMPLES, FRENCH_EXAMPLES].flatMap(({ street, postalLocality }) => [street, postalLocality])

type Dict = typeof fr | typeof de

async function insertLetter(userId: string, openingParagraph: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'E2E sender address examples',
      sender_name: 'Zoë Lovelace',
      resume_id: null,
      sender_street: null,
      sender_postal_locality: null,
      opening_paragraph: openingParagraph,
      body_paragraphs: [],
      closing_paragraph: null,
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

interface StoredLetter {
  opening_paragraph: string | null
  sender_street: string | null
  sender_postal_locality: string | null
}

async function storedLetter(letterId: string): Promise<StoredLetter> {
  const { data, error } = await admin()
    .from('cover_letters')
    .select('opening_paragraph, sender_street, sender_postal_locality')
    .eq('id', letterId)
    .single()
  expect(error, error?.message).toBeNull()
  return data as StoredLetter
}

async function openEditor(page: Page, locale: 'fr' | 'de', letterId: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
}

/** Shows the Signature tab and returns its street and postcode inputs, found by their labels. */
async function addressFields(page: Page, dict: Dict): Promise<{ street: Locator; postalLocality: Locator }> {
  const editor = dict.coverLetters.editor
  await page.getByRole('button', { name: editor.sections.signature, exact: true }).click()
  // The editor pane is the scroll container between the section nav and the preview.
  const pane = page.locator('div.overflow-y-auto.p-6')
  await expect(pane.getByRole('heading', { level: 3, name: editor.signature.title })).toBeVisible()
  return {
    street: pane.getByLabel(editor.signature.streetLabel, { exact: true }),
    postalLocality: pane.getByLabel(editor.signature.postalLocalityLabel, { exact: true }),
  }
}

async function expectExamples(
  fields: { street: Locator; postalLocality: Locator },
  examples: { street: string; postalLocality: string },
): Promise<void> {
  await expect(fields.street).toHaveValue('')
  await expect(fields.street).toHaveAttribute('placeholder', examples.street)
  await expect(fields.postalLocality).toHaveValue('')
  await expect(fields.postalLocality).toHaveAttribute('placeholder', examples.postalLocality)
}

async function expectNoExampleInPreview(page: Page): Promise<void> {
  const preview = page.getByTestId('cover-letter-preview-pane')
  await expect(preview.getByTestId('cover-letter-preview-page')).toContainText('Zoë Lovelace')
  const text = await preview.innerText()
  for (const example of ALL_EXAMPLES) expect(text, `the preview prints "${example}"`).not.toContain(example)
}

test('a German letter opened under /fr shows German address examples, which follow the letter and are never stored', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id, GERMAN_OPENING)
  await openEditor(page, 'fr', letterId)

  // The labels follow the interface language; the examples, the letter's.
  expect(fr.coverLetters.editor.signature.streetLabel).toBe('Rue et numéro')
  expect(fr.coverLetters.editor.signature.postalLocalityLabel).toBe('NPA et localité')
  const fields = await addressFields(page, fr)
  await expectExamples(fields, GERMAN_EXAMPLES)
  await expectNoExampleInPreview(page)

  // An unsaved opening in French makes it a French letter.
  await page.getByRole('button', { name: fr.coverLetters.editor.sections.opening, exact: true }).click()
  await page.locator('#opening-paragraph').fill(FRENCH_OPENING_TYPED)
  await expectExamples(await addressFields(page, fr), FRENCH_EXAMPLES)

  // Saving without typing in the address fields stores nothing in them.
  await page.getByRole('button', { name: fr.common.save, exact: true }).click()
  await expect(page.getByText(fr.coverLetters.editor.unsavedChanges, { exact: true })).toHaveCount(0)
  // The save landed: the typed opening is stored, so the unchanged address was written too.
  await expect.poll(async () => (await storedLetter(letterId)).opening_paragraph).toContain('Je vous écris')
  const stored = await storedLetter(letterId)
  expect({ sender_street: stored.sender_street, sender_postal_locality: stored.sender_postal_locality }).toEqual({
    sender_street: null,
    sender_postal_locality: null,
  })
  await expectNoExampleInPreview(page)
})

test('a French letter opened under /de shows French address examples', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id, FRENCH_OPENING)
  await openEditor(page, 'de', letterId)

  const fields = await addressFields(page, de)
  await expectExamples(fields, FRENCH_EXAMPLES)
  await expectNoExampleInPreview(page)
})
