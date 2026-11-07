import { test, expect } from './fixtures/auth'
import type { APIResponse, Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import {
  SWISS_LETTER_GEOMETRY_MM,
  SWISS_LETTER_FONT_SIZE_PT,
  SWISS_LETTER_LAYOUT_PX,
  SWISS_LETTER_LINE_HEIGHT,
  SWISS_LETTER_WINDOW_MAX_LINES,
} from '../src/lib/cover-letter-swiss-letter'
import { A4_PT, readPdf, readPdfTextItems, type PdfTextItem } from './fixtures/pdf'
import { FRENCH_PARAGRAPHS, GERMAN_OPENING } from './fixtures/swiss-letter'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'

/**
 * The PDF export prints the same Swiss A4 letter as the preview
 * (cover-letter-swiss-format, US-003), and the editor warns when the
 * recipient block does not fit the envelope window (Amendment 1).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The PDF is printed server-side in a headless Chromium: only the file shows
 * its page size, where each line landed and what its text is. The warning
 * counts wrapped lines, which only a browser's text layout can tell.
 *
 * WHAT IS ASSERTED
 *
 *   - PDF, in fr and de: an A4 page (595 x 842 pt, within 1 pt); the typical
 *     letter of US-002 (about 250 words) on one page; text in the order
 *     sender block, place-and-date line, subject without a label,
 *     paragraphs, sign-off, sender name, Annexes block; the same parts, in
 *     the same order, with the same text as the preview of the same letter;
 *     every recipient text item inside the FR-2 window zone (left edge at or
 *     right of 110 mm, top at or below 50 mm, right edge at or left of
 *     190 mm, last baseline within the six lines); the de letter's sender
 *     details from its linked CV.
 *   - Markup typed in each new field prints as text, never as markup.
 *   - The editor's window warning, in fr at 1440 x 900 and in de at
 *     375 x 812: absent for a short block and for exactly six lines; shown
 *     for seven lines and for a long line that wraps past six; described on
 *     the recipient fields; gone once the block is shortened. Nothing typed
 *     is cut.
 *
 * Positions are pdf.js's, in points from the page's top-left corner:
 * 1 mm = 72 / 25.4 pt.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter Swiss PDF')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const LOCALES = { fr, de } as const
type TestLocale = keyof typeof LOCALES

const mmToPt = (mm: number) => (mm * 72) / 25.4

/** Sub-point rounding of glyph positions. */
const POSITION_TOLERANCE_PT = 0.5
/** Within this many points of A4. */
const PAGE_SIZE_TOLERANCE_PT = 1

const geometry = SWISS_LETTER_GEOMETRY_MM
const LINE_HEIGHT_PT = SWISS_LETTER_FONT_SIZE_PT * SWISS_LETTER_LINE_HEIGHT
const WINDOW_PT = {
  left: mmToPt(geometry.windowLeft),
  top: mmToPt(geometry.windowTop),
  right: mmToPt(geometry.pageWidth - geometry.marginRight),
  bottom: mmToPt(geometry.windowTop) + SWISS_LETTER_WINDOW_MAX_LINES * LINE_HEIGHT_PT,
}

const SENDER_NAME = 'Zoë Lovelace'

const STORED_DETAILS = {
  sender_street: 'Rue de Bourg 12',
  sender_postal_locality: '1003 Lausanne',
  sender_phone: '+41 21 555 01 42',
  sender_email: 'zoe@example.ch',
}

const RECIPIENT = {
  recipient_name: 'Madame Claire Dupont',
  recipient_title: 'Responsable des ressources humaines',
  company_name: 'Acme SA',
  company_address: 'Avenue de la Gare 10\n1000 Lausanne',
}

const RECIPIENT_LINES = ['Madame Claire Dupont', 'Responsable des ressources humaines', 'Acme SA', 'Avenue de la Gare 10', '1000 Lausanne']

async function insertLetter(userId: string, fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({ user_id: userId, title: 'Lettre suisse PDF', sender_name: SENDER_NAME, greeting: '', sign_off: '', ...fields })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

async function insertResume(userId: string, contact: Record<string, string>): Promise<string> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({ user_id: userId, title: 'CV suisse', template: 'modern', contact })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

/** POST to the PDF route with the page's own session, as the editor does. */
function requestPdf(page: Page, letterId: string, locale: TestLocale): Promise<APIResponse> {
  return page.request.post(`/api/cover-letters/${letterId}/download-pdf`, {
    data: { locale },
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
}

async function downloadPdf(page: Page, letterId: string, locale: TestLocale, name: string): Promise<Buffer> {
  const response = await requestPdf(page, letterId, locale)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
  const pdf = await response.body()
  await test.info().attach(name, { body: pdf, contentType: 'application/pdf' })
  return pdf
}

/** The date line in `dateLocale`, as the server formats it: same machine, same time zone. */
const dateLine = (dateLocale: string, date: Date) =>
  new Intl.DateTimeFormat(dateLocale, { month: 'long', day: 'numeric', year: 'numeric' }).format(date)

/** Whitespace removed: where pdf.js splits a line into items is not the letter's business. */
const squash = (text: string) => text.replace(/\s+/g, '')

/** Every part found, each after the one before it. */
function expectPartsInOrder(text: string, parts: readonly string[]): void {
  const haystack = squash(text)
  let from = 0
  for (const part of parts) {
    const at = haystack.indexOf(squash(part), from)
    expect(at, `"${part}" is missing, or out of order, in: ${text}`).toBeGreaterThanOrEqual(0)
    from = at + squash(part).length
  }
}

/** The PDF is A4 and holds `pages` pages. */
async function expectA4(pdf: Buffer, pages: number): Promise<string> {
  const read = await readPdf(pdf)
  expect(read.pages).toHaveLength(pages)
  for (const pdfPage of read.pages) {
    expect(Math.abs(pdfPage.widthPt - A4_PT.width), `page width ${pdfPage.widthPt} pt`).toBeLessThanOrEqual(PAGE_SIZE_TOLERANCE_PT)
    expect(Math.abs(pdfPage.heightPt - A4_PT.height), `page height ${pdfPage.heightPt} pt`).toBeLessThanOrEqual(
      PAGE_SIZE_TOLERANCE_PT,
    )
  }
  return read.pages.map((pdfPage) => pdfPage.text).join(' ')
}

/**
 * The header of page 1, split where it is printed: the items above the end
 * of the window zone, left of it (the sender block) and in it (the recipient
 * block). Each recipient item must lie inside the zone.
 */
async function expectRecipientInWindow(pdf: Buffer, sender: readonly string[], recipient: readonly string[]) {
  const [firstPage] = await readPdfTextItems(pdf)
  const header = firstPage.filter((item) => item.baseline <= WINDOW_PT.bottom)
  const inWindowColumn = (item: PdfTextItem) => item.x >= WINDOW_PT.left - POSITION_TOLERANCE_PT
  const senderItems = header.filter((item) => !inWindowColumn(item))
  const recipientItems = header.filter(inWindowColumn)

  const joined = (items: PdfTextItem[]) => squash(items.map((item) => item.str).join(''))
  expect(joined(senderItems), 'the sender block, left of the window').toBe(squash(sender.join('')))
  expect(joined(recipientItems), 'the recipient block, in the window').toBe(squash(recipient.join('')))

  for (const item of recipientItems) {
    const where = `"${item.str}" at x ${item.x.toFixed(1)}, baseline ${item.baseline.toFixed(1)} pt`
    expect(item.x, `${where}: left edge at or right of 110 mm`).toBeGreaterThanOrEqual(WINDOW_PT.left - POSITION_TOLERANCE_PT)
    expect(item.x + item.width, `${where}: right edge at or left of 190 mm`).toBeLessThanOrEqual(
      WINDOW_PT.right + POSITION_TOLERANCE_PT,
    )
    expect(item.baseline - item.fontSize, `${where}: top at or below 50 mm`).toBeGreaterThanOrEqual(
      WINDOW_PT.top - POSITION_TOLERANCE_PT,
    )
    expect(Math.abs(item.fontSize - SWISS_LETTER_FONT_SIZE_PT), `${where}: at 11 pt`).toBeLessThanOrEqual(0.1)
  }
  test.info().annotations.push({
    type: 'recipient position',
    description: recipientItems.map((item) => `${item.str}@(${item.x.toFixed(1)}, ${item.baseline.toFixed(1)})`).join(' | '),
  })
}

/** Each part of the editor preview's letter, as text, in its order. */
async function previewPartTexts(page: Page, locale: TestLocale, letterId: string): Promise<string[]> {
  await page.setViewportSize({ width: 1440, height: 900 })
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  const letterPage = page.getByTestId('cover-letter-preview-pane').getByTestId('cover-letter-preview-page')
  // The paragraphs are filled in after hydration (`SanitizedHtml`).
  await expect(letterPage.locator('[data-letter-part="opening"]')).not.toBeEmpty()
  return letterPage
    .locator('[data-letter-part]')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).innerText))
}

test('fr: the typical letter prints on one A4 page, as the preview shows it, the recipient in the window', async ({
  page,
  authedUser,
}) => {
  const startedAt = new Date()
  const letterId = await insertLetter(authedUser.id, {
    ...STORED_DETAILS,
    ...RECIPIENT,
    job_title: 'Ingénieur logiciel',
    annexes: null,
    opening_paragraph: `<p>${FRENCH_PARAGRAPHS[0]}</p>`,
    body_paragraphs: [`<p>${FRENCH_PARAGRAPHS[1]}</p>`],
    closing_paragraph: `<p>${FRENCH_PARAGRAPHS[2]}</p>`,
  })

  const pdf = await downloadPdf(page, letterId, 'fr', 'typical-letter-fr.pdf')
  const text = await expectA4(pdf, 1)
  const dateLines = [startedAt, new Date()].map((date) => `Lausanne, le ${dateLine('fr-FR', date)}`)
  const placeDate = dateLines.find((line) => squash(text).includes(squash(line))) ?? dateLines[0]

  const senderLines = [SENDER_NAME, ...Object.values(STORED_DETAILS)]
  expectPartsInOrder(text, [
    ...senderLines,
    placeDate,
    'Candidature au poste de Ingénieur logiciel',
    'Madame, Monsieur,',
    ...FRENCH_PARAGRAPHS,
    'Meilleures salutations',
    SENDER_NAME,
    'Annexes',
    'CV, certificats de travail, diplômes',
  ])
  expect(text).not.toMatch(/Objet\s*:/)

  await expectRecipientInWindow(pdf, senderLines, RECIPIENT_LINES)

  // FR-1: the preview of the same stored letter shows the same parts, in the
  // same order, with the same text.
  const previewParts = await previewPartTexts(page, 'fr', letterId)
  // Sender, recipient, place-date, subject, greeting, opening, body, closing,
  // sign-off, signature, annexes.
  expect(previewParts).toHaveLength(11)
  expectPartsInOrder(
    text,
    previewParts.flatMap((part) => part.split('\n')).filter((line) => line.trim() !== ''),
  )
})

test('de: the linked CV fills the details never set, and the recipient prints in the window', async ({
  page,
  authedUser,
}) => {
  const startedAt = new Date()
  const resumeId = await insertResume(authedUser.id, {
    name: SENDER_NAME,
    email: 'zoe.cv@example.ch',
    phone: '+41 44 555 01 99',
    location: '8001 Zürich',
  })
  const recipient = ['Herr Jonas Keller', 'Muster AG', 'Limmatquai 5', '8001 Zürich']
  const letterId = await insertLetter(authedUser.id, {
    resume_id: resumeId,
    sender_street: 'Bahnhofstrasse 1',
    sender_postal_locality: null,
    sender_phone: null,
    sender_email: null,
    recipient_name: 'Herr Jonas Keller',
    company_name: 'Muster AG',
    company_address: 'Limmatquai 5\n8001 Zürich',
    job_title: 'Softwareentwickler',
    annexes: null,
    opening_paragraph: GERMAN_OPENING,
    body_paragraphs: ['<p>In meinem Team verantworte ich die Exporte und die Tests.</p>'],
    closing_paragraph: '<p>Ich freue mich auf ein persönliches Gespräch.</p>',
  })

  const pdf = await downloadPdf(page, letterId, 'de', 'cv-fallback-de.pdf')
  const text = await expectA4(pdf, 1)
  const dateLines = [startedAt, new Date()].map((date) => `Zürich, ${dateLine('de-DE', date)}`)
  const placeDate = dateLines.find((line) => squash(text).includes(squash(line))) ?? dateLines[0]

  const senderLines = [SENDER_NAME, 'Bahnhofstrasse 1', '8001 Zürich', '+41 44 555 01 99', 'zoe.cv@example.ch']
  expectPartsInOrder(text, [
    ...senderLines,
    placeDate,
    'Bewerbung als Softwareentwickler',
    'Sehr geehrte Damen und Herren,',
    'Mit grossem Interesse',
    'In meinem Team verantworte ich die Exporte und die Tests.',
    'Ich freue mich auf ein persönliches Gespräch.',
    'Freundliche Grüsse',
    SENDER_NAME,
    'Beilagen',
    'Lebenslauf, Arbeitszeugnisse, Diplome',
  ])
  expect(text).not.toContain('ß')
  expect(text).not.toContain('Betreff')

  await expectRecipientInWindow(pdf, senderLines, recipient)

  // FR-1: the preview of the same stored letter shows the same parts, in the
  // same order, with the same text.
  const previewParts = await previewPartTexts(page, 'de', letterId)
  // Sender, recipient, place-date, subject, greeting, opening, body, closing,
  // sign-off, signature, annexes.
  expect(previewParts).toHaveLength(11)
  expectPartsInOrder(
    text,
    previewParts.flatMap((part) => part.split('\n')).filter((line) => line.trim() !== ''),
  )
})

test('markup typed in a new field prints as text, never as markup', async ({ page, authedUser }) => {
  const typed = {
    sender_street: '<b>Rue</b> de Bourg 12',
    sender_postal_locality: '1003 <i>Lausanne</i>',
    sender_phone: '<script>alert(1)</script>',
    sender_email: '"><img src=x>@example.ch',
    annexes: '<u>CV</u>\n<img src="x" onerror="alert(1)">',
  }
  const letterId = await insertLetter(authedUser.id, {
    ...typed,
    ...RECIPIENT,
    job_title: 'Ingénieur logiciel',
    opening_paragraph: `<p>${FRENCH_PARAGRAPHS[0]}</p>`,
  })

  const pdf = await downloadPdf(page, letterId, 'fr', 'markup-in-new-fields.pdf')
  const text = await expectA4(pdf, 1)
  expect((await readPdf(pdf)).images, 'no markup became an image').toBe(0)
  expectPartsInOrder(text, [
    SENDER_NAME,
    typed.sender_street,
    typed.sender_postal_locality,
    typed.sender_phone,
    typed.sender_email,
    // The place of the place-and-date line is the locality without its postcode, as typed.
    '<i>Lausanne</i>, le',
    'Annexes',
    '<u>CV</u>',
    '<img src="x" onerror="alert(1)">',
  ])
})

/* The editor's window warning. */

const editorDict = (locale: TestLocale) => LOCALES[locale].coverLetters.editor
const windowWarning = (locale: TestLocale) =>
  editorDict(locale).recipient.windowOverflow.replace('{lines}', String(SWISS_LETTER_WINDOW_MAX_LINES))

/**
 * Waits until the window check has measured `lines` lines: the measurer's
 * height is `lines` letter lines (within 1 px), then two animation frames, so
 * its ResizeObserver has reported that height and React has rendered the
 * result. Only then does the absence of the warning prove anything.
 */
async function expectMeasuredLines(page: Page, lines: number): Promise<void> {
  const measurer = page.getByTestId('recipient-window-measurer')
  const expected = lines * SWISS_LETTER_LAYOUT_PX.lineHeight
  await expect
    .poll(async () => Math.abs((await measurer.evaluate((element) => (element as HTMLElement).offsetHeight)) - expected), {
      message: `the recipient block measured at ${lines} lines (${expected.toFixed(1)} px)`,
    })
    .toBeLessThanOrEqual(1)
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

/** Opens the editor on the Recipient section and returns its address field. */
async function openRecipientSection(page: Page, locale: TestLocale, letterId: string): Promise<Locator> {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  const dict = editorDict(locale)
  await page.getByRole('button', { name: dict.sections.recipient, exact: true }).click()
  await expect(page.getByRole('heading', { level: 3, name: dict.recipient.title })).toBeVisible()
  const address = page.getByPlaceholder(dict.recipient.addressPlaceholder, { exact: true })
  await expect(address).toBeVisible()
  return address
}

for (const { locale, viewport } of [
  { locale: 'fr' as const, viewport: { width: 1440, height: 900 } },
  { locale: 'de' as const, viewport: { width: 375, height: 812 } },
]) {
  test(`${locale} at ${viewport.width}px: the editor warns while the recipient block overflows the window`, async ({
    page,
    authedUser,
  }) => {
    await page.setViewportSize(viewport)
    // Four lines before the address: name, title, company, one address line.
    const letterId = await insertLetter(authedUser.id, {
      recipient_name: 'Madame Claire Dupont',
      recipient_title: 'RH',
      company_name: 'Acme SA',
      company_address: 'Avenue de la Gare 10',
    })
    const address = await openRecipientSection(page, locale, letterId)
    const dict = editorDict(locale)
    const nameField = page.getByPlaceholder(dict.recipient.namePlaceholder, { exact: true })
    const warning = page.getByRole('status').filter({ hasText: windowWarning(locale) })

    // Four lines: no warning.
    await expectMeasuredLines(page, 4)
    await expect(page.getByText(windowWarning(locale))).toHaveCount(0)
    await expect(address).not.toHaveAttribute('aria-describedby')

    // Exactly six lines still fit.
    await address.fill('Avenue de la Gare 10\nCase postale 12\n1000 Lausanne')
    await expectMeasuredLines(page, 6)
    await expect(page.getByText(windowWarning(locale))).toHaveCount(0)
    await expect(address).not.toHaveAttribute('aria-describedby')

    // Seven lines do not.
    const sevenLines = 'Avenue de la Gare 10\nCase postale 12\nBâtiment B\n1000 Lausanne'
    await address.fill(sevenLines)
    await expect(warning).toBeVisible()
    await expect(warning).toHaveText(windowWarning(locale))
    const warningId = await warning.getAttribute('id')
    expect(warningId).toBeTruthy()
    await expect(address).toHaveAttribute('aria-describedby', warningId!)
    await expect(nameField).toHaveAttribute('aria-describedby', warningId!)
    // Nothing typed is cut.
    await expect(address).toHaveValue(sevenLines)

    // Shortened back to fit: the warning is gone.
    await address.fill('Avenue de la Gare 10\n1000 Lausanne')
    await expect(page.getByText(windowWarning(locale))).toHaveCount(0)
    await expect(address).not.toHaveAttribute('aria-describedby')

    // Five lines, one of them long enough to wrap twice at the window width:
    // seven printed lines.
    await nameField.fill(
      'Madame Claire Dupont-Rochat, responsable du recrutement des ingénieurs logiciels pour la Suisse romande',
    )
    await expect(warning).toBeVisible()
    await nameField.fill('Madame Claire Dupont')
    await expect(page.getByText(windowWarning(locale))).toHaveCount(0)
  })
}
