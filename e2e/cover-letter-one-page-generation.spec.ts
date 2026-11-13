import { test, expect } from './fixtures/auth'
import type { Page } from '@playwright/test'
import { admin } from './fixtures/cover-letter-preview'
import { readPdf } from './fixtures/pdf'
import { AI_TEST_STUB_COVER_LETTER_TEXTS, AI_TEST_STUB_DIRECTIVES } from '../src/lib/ai/test-stub-contract'
import en from '../src/locales/en/common.json'

/**
 * A letter written by the AI fits on one page (cover-letter-one-page, US-002).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The routes decide whether the AI's first letter fits by laying it out in the
 * PDF renderer's own headless browser and measuring its lines: only a real
 * server, with its real browser, does that. The AI itself is the server-side
 * stub (`AI_TEST_STUB`): a directive in the job description makes its first
 * letter run over two pages, and another chooses what the shortening call
 * answers.
 *
 * WHAT IS ASSERTED
 *
 *   - From a job application, a long first letter is replaced by its
 *     shortened version: the stored letter is the shorter one, its downloaded
 *     PDF has one page, and the preview shows no page-break marker. The
 *     shortened letter is stored only because the real measurement found the
 *     first one over a page.
 *   - A shortened letter that still runs over is kept as it is: the PDF has
 *     more than one page, and the preview's markers say how many.
 *   - The editor's Generate button, with the same stubs, puts the shorter
 *     letter in the editor, and sends the letter's id so the server measures
 *     it inside the letter's own header.
 *
 * This is the suite CI runs with a browser: on the creation path it is the
 * evidence that the server's measurement and the downloaded PDF agree (FR-1,
 * FR-2). The finer comparison, letter by letter, is
 * `src/lib/pdf/measure-cover-letter.integration.test.ts`, which needs a local
 * Chromium.
 */

const english = AI_TEST_STUB_COVER_LETTER_TEXTS.en
const editorDict = en.coverLetters.editor
const generationDict = en.coverLetters.generation

const OFFER = 'We are hiring a software engineer to build our data platform in Lausanne. You will work with product teams.'
const longOffer = (...directives: string[]) => [OFFER, AI_TEST_STUB_DIRECTIVES.longLetter, ...directives].join(' ')

async function seedApplication(userId: string, description: string): Promise<string> {
  const { data, error } = await admin()
    .from('job_applications')
    .insert({
      user_id: userId,
      job_title: 'Software Engineer',
      company_name: 'Acme SA',
      job_description: description,
      status: 'saved',
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

async function storedLetter(letterId: string) {
  const { data, error } = await admin()
    .from('cover_letters')
    .select('opening_paragraph, body_paragraphs, closing_paragraph, greeting, sign_off')
    .eq('id', letterId)
    .single()
  expect(error, error?.message).toBeNull()
  return data as {
    opening_paragraph: string
    body_paragraphs: string[]
    closing_paragraph: string
    greeting: string
    sign_off: string
  }
}

/** Creates the letter from the application through the form, and returns its id. */
async function createFromApplication(page: Page, applicationId: string): Promise<string> {
  await page.goto(`/en/dashboard/cover-letters/new?jobApplicationId=${applicationId}`)
  const responsePromise = page.waitForResponse('**/api/cover-letters/from-job-application')
  await page.locator('button[type="submit"]').click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  const { coverLetterId } = (await response.json()) as { coverLetterId: string }
  await page.waitForURL(new RegExp(`/en/dashboard/cover-letters/${coverLetterId}/edit`))
  return coverLetterId
}

async function pdfPages(page: Page, letterId: string, name: string): Promise<number> {
  const response = await page.request.post(`/api/cover-letters/${letterId}/download-pdf`, {
    data: { locale: 'en' },
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(response.status()).toBe(200)
  const pdf = await response.body()
  await test.info().attach(name, { body: pdf, contentType: 'application/pdf' })
  return (await readPdf(pdf)).pages.length
}

const pane = (page: Page) => page.getByTestId('cover-letter-preview-pane')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('from a job application, a letter running over one page is stored shortened, and prints on one page', async ({
  page,
  authedUser,
}) => {
  const applicationId = await seedApplication(authedUser.id, longOffer())

  const letterId = await createFromApplication(page, applicationId)

  // The shortened letter, not the long first one.
  const letter = await storedLetter(letterId)
  expect(letter.opening_paragraph).toBe(`<p>${english.shortenedOpening}</p>`)
  expect(letter.body_paragraphs).toEqual([`<p>${english.body}</p>`])
  expect(letter.greeting).toBe(english.greeting)
  expect(letter.sign_off).toBe(english.signOff)

  expect(await pdfPages(page, letterId, 'shortened.pdf')).toBe(1)

  await expect(pane(page).getByText(english.shortenedOpening, { exact: true })).toBeVisible()
  await expect(pane(page).getByTestId('page-break-indicator')).toHaveCount(0)
})

test('a shortened letter that still runs over is kept as it is, and the preview marks its pages', async ({
  page,
  authedUser,
}) => {
  const applicationId = await seedApplication(authedUser.id, longOffer(AI_TEST_STUB_DIRECTIVES.shortenTooLong))

  const letterId = await createFromApplication(page, applicationId)

  const letter = await storedLetter(letterId)
  expect(letter.opening_paragraph).toBe(`<p>${english.shortenedOpening}</p>`)
  // Nothing cut: every long paragraph is still there.
  expect(letter.body_paragraphs.filter((paragraph) => paragraph === `<p>${english.longBody}</p>`).length).toBeGreaterThan(5)

  const pages = await pdfPages(page, letterId, 'still-too-long.pdf')
  expect(pages).toBeGreaterThan(1)
  await expect(pane(page).getByText(english.shortenedOpening, { exact: true })).toBeVisible()
  await expect(pane(page).getByTestId('page-break-indicator')).toHaveCount(pages - 1)
})

test("the editor's Generate button puts the shortened letter in the editor", async ({ page, authedUser }) => {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: authedUser.id,
      title: 'Generated in the editor',
      sender_name: 'Zoë Lovelace',
      sender_street: 'Rue de Bourg 12',
      sender_postal_locality: '1003 Lausanne',
      company_name: 'Acme SA',
      company_address: 'Avenue de la Gare 10\n1000 Lausanne',
      greeting: '',
      sign_off: '',
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  const letterId = (data as { id: string }).id

  await page.goto(`/en/dashboard/cover-letters/${letterId}/edit`)
  await page.getByRole('button', { name: editorDict.generate, exact: true }).first().click()
  await page.getByPlaceholder(generationDict.jobTitlePlaceholder, { exact: true }).fill('Software Engineer')
  await page.getByPlaceholder(generationDict.companyPlaceholder, { exact: true }).fill('Acme SA')
  await page.getByPlaceholder(generationDict.jobDescriptionPlaceholder, { exact: true }).fill(longOffer())

  const requestPromise = page.waitForRequest('**/api/ai/generate-cover-letter')
  const responsePromise = page.waitForResponse('**/api/ai/generate-cover-letter')
  // The modal's own button: rendered after the header's button of the same name.
  await page.getByRole('button', { name: generationDict.generate, exact: true }).last().click()
  const request = await requestPromise
  const response = await responsePromise

  // The letter's id goes with the request, so its stored header is measured.
  expect(request.postDataJSON()).toMatchObject({ coverLetterId: letterId })
  expect(response.status()).toBe(200)
  const { coverLetter } = (await response.json()) as { coverLetter: { openingParagraph: string; bodyParagraphs: string[] } }
  expect(coverLetter.openingParagraph).toBe(english.shortenedOpening)
  expect(coverLetter.bodyParagraphs).toEqual([english.body])

  await expect(pane(page).getByText(english.shortenedOpening, { exact: true })).toBeVisible()
  await expect(pane(page).getByText(english.longBody, { exact: true })).toHaveCount(0)
  await expect(pane(page).getByTestId('page-break-indicator')).toHaveCount(0)
})
