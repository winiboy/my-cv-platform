import { test, expect } from './fixtures/auth'
import type { Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'

/**
 * A letter created from the creation form starts with the Swiss greeting and
 * sign-off of its language (cover-letter-swiss-format, US-005).
 *
 * WHAT IS ASSERTED, under /fr and /de
 *
 *   - The form stores an empty greeting and an empty sign-off, not the
 *     English "Dear Hiring Manager," and "Sincerely,".
 *   - The editor preview prints the language's default greeting and sign-off.
 *   - The editor's empty state names those defaults: the greeting field's
 *     placeholder, and the selected sign-off option.
 *   - A greeting the user types and a sign-off the user picks are stored and
 *     printed as written.
 *   - The default sign-off stays the select's first option; picked again, it
 *     stores an empty sign-off and prints the language default.
 *
 * The letter is created through the real form and read back with the
 * service-role client, so the assertion is on the stored row.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter Swiss greeting')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const CASES = [
  {
    locale: 'fr',
    dict: fr,
    defaultGreeting: 'Madame, Monsieur,',
    defaultSignOff: 'Meilleures salutations',
    typedGreeting: 'Chère Madame Dupont,',
    pickedSignOff: fr.coverLetters.editor.signature.signOffOptions.sincerely,
    otherSignOffs: ['Cordialement,', 'Bien à vous,', 'Salutations distinguées,', 'Respectueusement,', 'Avec mes remerciements,'],
  },
  {
    locale: 'de',
    dict: de,
    defaultGreeting: 'Sehr geehrte Damen und Herren,',
    defaultSignOff: 'Freundliche Grüsse',
    typedGreeting: 'Sehr geehrte Frau Muster,',
    pickedSignOff: de.coverLetters.editor.signature.signOffOptions.sincerely,
    otherSignOffs: ['Mit freundlichen Grüßen', 'Beste Grüße', 'Hochachtungsvoll', 'Mit vorzüglicher Hochachtung', 'Mit herzlichem Dank'],
  },
] as const

async function storedGreetingAndSignOff(letterId: string): Promise<{ greeting: string; sign_off: string }> {
  const { data, error } = await admin()
    .from('cover_letters')
    .select('greeting, sign_off')
    .eq('id', letterId)
    .single()
  expect(error, error?.message).toBeNull()
  return data as { greeting: string; sign_off: string }
}

function previewPart(page: Page, kind: 'greeting' | 'signOff') {
  return page
    .getByTestId('cover-letter-preview-pane')
    .getByTestId('cover-letter-preview-page')
    .locator(`[data-letter-part="${kind}"]`)
}

for (const { locale, dict, defaultGreeting, defaultSignOff, typedGreeting, pickedSignOff, otherSignOffs } of CASES) {
  test(`a letter created from the form in ${locale} prints its language's greeting and sign-off`, async ({
    page,
    authedUser,
  }) => {
    const editorDict = dict.coverLetters.editor
    await page.setViewportSize({ width: 1440, height: 900 })

    const response = await page.goto(`/${locale}/dashboard/cover-letters/new`)
    expect(response?.status()).toBe(200)
    await page.locator('#title').fill(`Lettre ${locale}`)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(new RegExp(`/${locale}/dashboard/cover-letters/[0-9a-f-]+/edit`))
    const letterId = /cover-letters\/([0-9a-f-]+)\/edit/.exec(page.url())?.[1]
    if (!letterId) throw new Error(`no letter id in ${page.url()}`)

    const { data: rows, error } = await admin()
      .from('cover_letters')
      .select('id')
      .eq('user_id', authedUser.id)
    expect(error, error?.message).toBeNull()
    expect(rows).toEqual([{ id: letterId }])
    expect(await storedGreetingAndSignOff(letterId)).toEqual({ greeting: '', sign_off: '' })

    await expect(previewPart(page, 'greeting')).toHaveText(defaultGreeting)
    await expect(previewPart(page, 'signOff')).toHaveText(defaultSignOff)

    // The empty state names the defaults the letter prints.
    await page.getByRole('button', { name: editorDict.sections.opening, exact: true }).click()
    const greeting = page.getByPlaceholder(defaultGreeting, { exact: true })
    await expect(greeting).toHaveValue('')

    await page.getByRole('button', { name: editorDict.sections.signature, exact: true }).click()
    const signOff = page.locator('select')
    await expect(signOff).toHaveValue('')
    await expect(signOff.locator('option:checked')).toHaveText(defaultSignOff)
    // Offered once: the localized option with the default's closing
    // ("Meilleures salutations,", "Freundliche Grüße") is left out.
    await expect(signOff.locator('option')).toHaveText([defaultSignOff, ...otherSignOffs])
    await expect(page.getByText(editorDict.signature.signOffDefaultHint, { exact: true })).toBeVisible()

    // What the user writes and picks is stored and printed as written.
    await page.getByRole('button', { name: editorDict.sections.opening, exact: true }).click()
    await greeting.fill(typedGreeting)
    await page.getByRole('button', { name: editorDict.sections.signature, exact: true }).click()
    await signOff.selectOption(pickedSignOff)

    await expect(previewPart(page, 'greeting')).toHaveText(typedGreeting)
    await expect(previewPart(page, 'signOff')).toHaveText(pickedSignOff)

    await page.getByRole('button', { name: dict.common.save, exact: true }).click()
    await expect(page.getByText(editorDict.unsavedChanges, { exact: true })).toHaveCount(0)
    await expect
      .poll(() => storedGreetingAndSignOff(letterId))
      .toEqual({ greeting: typedGreeting, sign_off: pickedSignOff })

    const reopened = await page.reload()
    expect(reopened?.status()).toBe(200)
    await expect(previewPart(page, 'greeting')).toHaveText(typedGreeting)
    await expect(previewPart(page, 'signOff')).toHaveText(pickedSignOff)

    // The language default stays on offer, first, and can be picked again.
    await page.getByRole('button', { name: editorDict.sections.signature, exact: true }).click()
    await expect(signOff).toHaveValue(pickedSignOff)
    await expect(signOff.locator('option').first()).toHaveText(defaultSignOff)
    await signOff.selectOption('')
    await expect(previewPart(page, 'signOff')).toHaveText(defaultSignOff)

    await page.getByRole('button', { name: dict.common.save, exact: true }).click()
    await expect(page.getByText(editorDict.unsavedChanges, { exact: true })).toHaveCount(0)
    await expect
      .poll(() => storedGreetingAndSignOff(letterId))
      .toEqual({ greeting: typedGreeting, sign_off: '' })
  })
}
