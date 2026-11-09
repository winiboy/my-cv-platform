import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/**
 * The Signature tab's name field asks for first and last name, in the
 * interface language (cover-letter-sender-placeholders, US-001).
 *
 * WHAT IS ASSERTED, under /fr, /en, /de and /it
 *
 *   - The name field's label is the exact wording of the acceptance criteria.
 *     The expected strings are written out here rather than read from the
 *     dictionaries, so the test proves the text and not only the key.
 *   - The field's placeholder is still the locale's `namePlaceholder`.
 *   - A stored `sender_name` is shown in the field unchanged.
 *
 * The letter is a real row created for the signed-in user through the
 * service-role client, and the page load's HTTP status is asserted, so a
 * failing server render cannot hide behind the client.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter signature name label')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const STORED_SENDER_NAME = 'Marie-Claire Dupont'

const CASES = [
  { locale: 'fr', dict: fr, label: 'Votre prénom et nom' },
  { locale: 'en', dict: en, label: 'Your first and last name' },
  { locale: 'de', dict: de, label: 'Ihr Vorname und Name' },
  { locale: 'it', dict: it, label: 'Il tuo nome e cognome' },
] as const

async function insertLetter(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'E2E signature name label',
      sender_name: STORED_SENDER_NAME,
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

for (const { locale, dict, label } of CASES) {
  test(`the signature name field asks for first and last name in ${locale}`, async ({
    page,
    authedUser,
  }) => {
    const editor = dict.coverLetters.editor
    await page.setViewportSize({ width: 1440, height: 900 })
    const letterId = await insertLetter(authedUser.id)

    const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
    expect(response?.status()).toBe(200)

    await page.getByRole('button', { name: editor.sections.signature, exact: true }).click()
    // The editor pane is the scroll container between the section nav and the
    // preview; the preview prints the stored sender name too.
    const pane = page.locator('div.overflow-y-auto.p-6')
    await expect(pane.getByRole('heading', { level: 3, name: editor.signature.title })).toBeVisible()

    const nameInput = pane.getByPlaceholder(editor.signature.namePlaceholder, { exact: true })
    await expect(nameInput).toHaveCount(1)
    await expect(nameInput).toHaveValue(STORED_SENDER_NAME)
    // The label is the input's preceding sibling inside the same field wrapper.
    await expect(nameInput.locator('xpath=preceding-sibling::label')).toHaveText(label)
  })
}
