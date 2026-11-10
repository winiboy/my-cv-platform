import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import {
  AI_TEST_STUB_OFFER_PAGE_ADDRESS,
  AI_TEST_STUB_OFFER_PAGE_ADDRESS_PARAM,
  AI_TEST_STUB_OFFER_PAGE_PARAM,
  AI_TEST_STUB_OFFER_PAGE_WITH_ADDRESS,
  AI_TEST_STUB_OFFER_TEXT_ADDRESS,
} from '../src/lib/ai/test-stub-contract'
import frCommon from '../src/locales/fr/common.json'

/**
 * A cover letter created from a saved job application gets the company's
 * address from the offer's page (cover-letter-recipient-address-from-offer,
 * US-001), otherwise from the offer's text (US-002).
 *
 * WHAT IS REAL
 * The pages, the route `/api/cover-letters/from-job-application`, the session,
 * RLS, the rows in the local Supabase stack, the JSON-LD parser, the editor's
 * Destinataire tab and its preview.
 *
 * WHAT IS STUBBED
 * The AI provider and the offer page, on the server, by
 * `src/lib/ai/test-stub.ts`. The seeded `job_url` is on an allowed board and
 * names what its page answers: `AI_TEST_STUB_OFFER_PAGE_PARAM=200`, plus
 * `AI_TEST_STUB_OFFER_PAGE_ADDRESS_PARAM` for a page whose `JobPosting` has the
 * hiring organization's address `AI_TEST_STUB_OFFER_PAGE_ADDRESS` (and a job
 * location elsewhere). No test reaches a real job board. Asked for the
 * address in the text, the stubbed AI always answers
 * `AI_TEST_STUB_OFFER_TEXT_ADDRESS`, as an AI that invents one would: the
 * route's real check that it is in the offer's text decides what is stored.
 *
 * WHAT IS ASSERTED
 * (a) a page with an address: the letter stores it as "street", then
 *     "postcode locality", with no country line for Switzerland; the
 *     Destinataire tab's "Adresse de l'entreprise" holds those two lines; the
 *     preview prints them under the company name;
 * (b) a page without an address and a text without one: the letter stores
 *     none, the field is empty and the preview prints the company name alone;
 * (c) a page without an address and a text that has the stub's address: the
 *     letter stores it, the field holds it and the preview prints it;
 * (d) a page without an address and a text that has the stub's street but
 *     another postcode and locality: the AI's answer is rejected as not in
 *     the text, and the field is empty.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover-letter-recipient-address-from-offer spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

test.use({ viewport: { width: 1440, height: 900 } })

const ROUTE = '/api/cover-letters/from-job-application'
const COMPANY = 'Beispiel AG'
const EDITOR = frCommon.coverLetters.editor

const FRENCH_OFFER = `Nous recherchons un ingénieur de données pour notre équipe à Lausanne. Vous serez responsable de la
conception des pipelines de données et vous travaillerez avec les équipes produit. Votre profil : au moins trois
ans d'expérience dans un poste similaire et une très bonne maîtrise de Python. Nous vous offrons un environnement
dynamique et une équipe motivée sur notre site.`

/** The offer with the stub's text address in it, written with other case and spacing. */
const FRENCH_OFFER_WITH_ADDRESS = `${FRENCH_OFFER}
Envoyez votre dossier à : ${COMPANY}, ${AI_TEST_STUB_OFFER_TEXT_ADDRESS.streetAddress.toUpperCase()},
CH-${AI_TEST_STUB_OFFER_TEXT_ADDRESS.postalCode}  ${AI_TEST_STUB_OFFER_TEXT_ADDRESS.addressLocality}.`

/** The offer naming the stub's street, but in another town. */
const FRENCH_OFFER_WITH_ANOTHER_TOWN = `${FRENCH_OFFER}
Envoyez votre dossier à : ${COMPANY}, ${AI_TEST_STUB_OFFER_TEXT_ADDRESS.streetAddress}, 1003 Lausanne.`

/** The stub's text address as the letter stores it: Swiss, so no country line. */
const EXPECTED_TEXT_ADDRESS = [
  AI_TEST_STUB_OFFER_TEXT_ADDRESS.streetAddress,
  `${AI_TEST_STUB_OFFER_TEXT_ADDRESS.postalCode} ${AI_TEST_STUB_OFFER_TEXT_ADDRESS.addressLocality}`,
].join('\n')

/** The stubbed page's address as the letter stores it: Swiss, so no country line. */
const EXPECTED_ADDRESS = [
  AI_TEST_STUB_OFFER_PAGE_ADDRESS.streetAddress,
  `${AI_TEST_STUB_OFFER_PAGE_ADDRESS.postalCode} ${AI_TEST_STUB_OFFER_PAGE_ADDRESS.addressLocality}`,
].join('\n')

/** A `job_url` on an allowed board whose stubbed page answers 200, with or without the address. */
function stubbedJobUrl(withAddress: boolean): string {
  const url = new URL('https://www.jobs.ch/fr/offres-emplois/detail/e2e-address/')
  url.searchParams.set(AI_TEST_STUB_OFFER_PAGE_PARAM, '200')
  if (withAddress) url.searchParams.set(AI_TEST_STUB_OFFER_PAGE_ADDRESS_PARAM, AI_TEST_STUB_OFFER_PAGE_WITH_ADDRESS)
  return url.toString()
}

async function seedApplication(userId: string, jobUrl: string, jobDescription: string = FRENCH_OFFER): Promise<string> {
  const { data, error } = await admin()
    .from('job_applications')
    .insert({
      user_id: userId,
      job_title: 'Ingénieur de données',
      company_name: COMPANY,
      job_description: jobDescription,
      job_url: jobUrl,
      status: 'saved',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed a job application: ${error?.message}`)
  return data.id as string
}

async function storedLetters(userId: string): Promise<Array<{ id: string; company_name: string | null; company_address: string | null }>> {
  const { data, error } = await admin()
    .from('cover_letters')
    .select('id, company_name, company_address')
    .eq('user_id', userId)
  if (error) throw new Error(`Could not read cover letters: ${error.message}`)
  return data ?? []
}

/** Creates the letter from the application under /fr and waits for its editor. */
async function createLetterFrom(page: Page, applicationId: string): Promise<void> {
  await page.goto(`/fr/dashboard/cover-letters/new?jobApplicationId=${applicationId}`)
  const responsePromise = page.waitForResponse(`**${ROUTE}`)
  await page.locator('button[type="submit"]').click()
  expect((await responsePromise).status()).toBe(201)
  await page.waitForURL(/\/fr\/dashboard\/cover-letters\/[0-9a-f-]+\/edit/)
}

/** Opens the Destinataire tab and returns its "Adresse de l'entreprise" textarea. */
async function companyAddressField(page: Page) {
  await page.getByRole('button', { name: EDITOR.sections.recipient, exact: true }).click()
  await expect(page.getByRole('heading', { level: 3, name: EDITOR.recipient.title })).toBeVisible()
  // The label is not tied to the textarea; its placeholder names it uniquely.
  const field = page.getByPlaceholder(EDITOR.recipient.addressPlaceholder, { exact: true })
  await expect(page.getByText(EDITOR.recipient.addressLabel, { exact: true })).toBeVisible()
  return field
}

function previewRecipient(page: Page) {
  return page
    .getByTestId('cover-letter-preview-pane')
    .getByTestId('cover-letter-preview-page')
    .locator('[data-letter-part="recipient"]')
}

test.describe("Cover letter from an application: the company's address from the offer page", () => {
  test('(a) a page with an address fills "Adresse de l\'entreprise" and the preview prints it under the company', async ({
    page,
    authedUser,
  }) => {
    const applicationId = await seedApplication(authedUser.id, stubbedJobUrl(true))

    await createLetterFrom(page, applicationId)

    const [letter] = await storedLetters(authedUser.id)
    expect(letter).toMatchObject({ company_name: COMPANY, company_address: EXPECTED_ADDRESS })
    expect(page.url()).toContain(`/fr/dashboard/cover-letters/${letter.id}/edit`)

    const field = await companyAddressField(page)
    await expect(field).toHaveValue(EXPECTED_ADDRESS)

    // The recipient block: the company name, then the address on its own lines.
    const recipient = previewRecipient(page)
    await expect(recipient).toBeVisible()
    await expect.poll(() => recipient.innerText()).toBe(`${COMPANY}\n${EXPECTED_ADDRESS}`)
  })

  test('(b) a page without an address leaves the field empty and the preview prints the company alone', async ({
    page,
    authedUser,
  }) => {
    const applicationId = await seedApplication(authedUser.id, stubbedJobUrl(false))

    await createLetterFrom(page, applicationId)

    const [letter] = await storedLetters(authedUser.id)
    expect(letter).toMatchObject({ company_name: COMPANY, company_address: null })

    const field = await companyAddressField(page)
    await expect(field).toHaveValue('')

    const recipient = previewRecipient(page)
    await expect(recipient).toBeVisible()
    await expect.poll(() => recipient.innerText()).toBe(COMPANY)
  })

  test('(c) a text with the address fills "Adresse de l\'entreprise" when the page has none', async ({ page, authedUser }) => {
    const applicationId = await seedApplication(authedUser.id, stubbedJobUrl(false), FRENCH_OFFER_WITH_ADDRESS)

    await createLetterFrom(page, applicationId)

    const [letter] = await storedLetters(authedUser.id)
    expect(letter).toMatchObject({ company_name: COMPANY, company_address: EXPECTED_TEXT_ADDRESS })

    const field = await companyAddressField(page)
    await expect(field).toHaveValue(EXPECTED_TEXT_ADDRESS)

    const recipient = previewRecipient(page)
    await expect(recipient).toBeVisible()
    await expect.poll(() => recipient.innerText()).toBe(`${COMPANY}\n${EXPECTED_TEXT_ADDRESS}`)
  })

  test('(d) an address the text does not contain is not stored, and the field stays empty', async ({ page, authedUser }) => {
    const applicationId = await seedApplication(authedUser.id, stubbedJobUrl(false), FRENCH_OFFER_WITH_ANOTHER_TOWN)

    await createLetterFrom(page, applicationId)

    const [letter] = await storedLetters(authedUser.id)
    expect(letter).toMatchObject({ company_name: COMPANY, company_address: null })

    const field = await companyAddressField(page)
    await expect(field).toHaveValue('')

    const recipient = previewRecipient(page)
    await expect(recipient).toBeVisible()
    await expect.poll(() => recipient.innerText()).toBe(COMPANY)
  })
})
