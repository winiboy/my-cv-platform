import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test, expect, createTestUser, deleteTestUser } from './fixtures/auth'
import type { APIResponse, Download, Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'
import { readPdf, type ReadPdf } from './fixtures/pdf'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'

/**
 * A cover letter downloads as a real PDF file, from the letters list's ⋮ menu
 * and from the editor (cover-letter-export-translate, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The PDF is printed server-side by `POST /api/cover-letters/[id]/download-pdf`
 * in a headless Chromium, but what the user gets is a file their browser
 * saves: the click, the request, the name the page gives the download and the
 * bytes. Only a real download shows all of them, and only the PDF's own text
 * shows that every part of the letter reached it, in order.
 *
 * WHAT IS ASSERTED, in fr and de
 *
 *   - The download is a complete PDF (`%PDF-` ... `%%EOF`) named after the
 *     letter's title, at the cover letter's own 816 x 1056 px (612 x 792 pt)
 *     page, and no dialog opens on the way.
 *   - It is a TEXT PDF, not a picture: no image is embedded, and its extracted
 *     text holds every part of the letter in order — sender, date, recipient
 *     block, subject, greeting, opening, each body paragraph, closing,
 *     sign-off, signature name.
 *   - Rich text keeps its meaning: bold and italic faces are embedded, and an
 *     ordered list keeps its numbers.
 *   - A long letter flows onto exactly two pages with nothing missing.
 *   - The editor refuses with unsaved changes, telling the user to save first,
 *     and sends no request at all.
 *   - A failed generation shows the localized error and saves no file.
 *   - Another user's letter id answers 404 with no PDF.
 *
 * And, once, independent of the page language:
 *
 *   - Page boundary: a letter that ends just above the bottom of page 1 is one
 *     page with its last line on it; one paragraph more is two pages, neither
 *     of them empty. Both letters are built from one-line paragraphs, whose
 *     height is set by the template's line-height rather than by the width of
 *     whichever serif the machine has, so the boundary holds on every machine.
 *     Measured: the one-page letter ends 9.5 px above page 1's bottom margin.
 *   - `ul` items keep their "•" bullet, as text beside the item.
 *   - A hostile letter (images, an @import, a frame, a meta refresh, a
 *     javascript: link, an onerror handler, CSS backgrounds, all aimed at a
 *     listener this test runs on the loopback) prints its visible text, and
 *     the listener records no request at all.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter PDF export')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const LOCALES = { fr, de } as const
type TestLocale = keyof typeof LOCALES

/** US Letter in points: the cover letter's 816 x 1056 CSS px page. */
const LETTER_PAGE_PT = { width: 612, height: 792 }

/** Accented on purpose: the name travels RFC 5987-encoded and must come back intact. */
const LETTER_TITLE = 'Lettre PDF Zürich'

const BODY_PARAGRAPHS = [
  'Body one: I have spent the last several years building and shipping production software.',
  'Body two: I own the document export pipeline end to end, from markup to file.',
  'Body three: I care about accessibility, localization and the details users notice.',
]

/** The letter every short-letter test downloads. Each part is a distinct marker. */
const FULL_LETTER = {
  sender_name: 'Ada Lovelace',
  recipient_name: 'Charles Babbage',
  recipient_title: 'Head of Engineering',
  company_name: 'Analytical Engines SA',
  company_address: '12 Rue du Calcul\n1003 Lausanne',
  job_title: 'Senior Software Engineer',
  greeting: 'Dear Mr. Babbage,',
  opening_paragraph:
    '<p>I am writing to apply with <strong>strong conviction</strong> and <em>genuine interest</em>.</p>' +
    '<ol><li>First listed reason</li><li>Second listed reason</li></ol>',
  body_paragraphs: BODY_PARAGRAPHS.map((text) => `<p>${text}</p>`),
  closing_paragraph: '<p>Thank you for your time and consideration.</p>',
  sign_off: 'Sincerely,',
}

/** Every part of FULL_LETTER, in the order the letter prints them. */
const FULL_LETTER_PARTS: (string | RegExp)[] = [
  'Ada Lovelace',
  /\d{1,2}[A-Z][a-z]+\d{4}/,
  'Charles Babbage',
  'Head of Engineering',
  'Analytical Engines SA',
  '12 Rue du Calcul',
  '1003 Lausanne',
  'Application for Senior Software Engineer',
  'Dear Mr. Babbage,',
  'I am writing to apply with strong conviction and genuine interest.',
  '1.',
  'First listed reason',
  '2.',
  'Second listed reason',
  ...BODY_PARAGRAPHS,
  'Thank you for your time and consideration.',
  'Sincerely,',
  'Ada Lovelace',
]

/**
 * Long enough to need a second page with a wide margin either way, so a
 * different serif on another machine still lands on exactly two: about 1.4
 * pages of content.
 */
const LONG_BODY = Array.from(
  { length: 8 },
  (_, i) =>
    `Long paragraph ${i + 1}: ` +
    'I have built and shipped production software for many years, and I own the export pipeline. '.repeat(3),
)

/** A one-line body paragraph: it never wraps, whatever the font's widths. */
const SHORT_LINES = (count: number) => Array.from({ length: count }, (_, i) => `<p>Short line ${i + 1}.</p>`)

/** The page-boundary letters' fixed parts: one-line paragraphs and a two-item `ul`. */
const BOUNDARY_LETTER = {
  opening_paragraph: '<p>Opening line.</p><ul><li>Bullet alpha</li><li>Bullet beta</li></ul>',
  closing_paragraph: '<p>Thank you.</p>',
}

/** Body paragraphs that end the letter 9.5 px above page 1's bottom margin. */
const LINES_FILLING_PAGE_ONE = 10

async function insertLetter(userId: string, fields: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({ user_id: userId, title: LETTER_TITLE, ...FULL_LETTER, ...fields })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

/** Collects dialogs, so a test can assert none opened (no print dialog, no alert). */
function watchDialogs(page: Page): string[] {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`)
    void dialog.dismiss()
  })
  return dialogs
}

/** Counts requests to the PDF route, so a test can assert none was sent. */
function watchPdfRequests(page: Page): string[] {
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\/api\/cover-letters\/[^/]+\/download-pdf$/.test(new URL(request.url()).pathname)) requests.push(request.method())
  })
  return requests
}

/** Opens the ⋮ menu of the letter's card and returns its PDF item. */
async function openListPdfItem(page: Page, locale: TestLocale): Promise<Locator> {
  const card = page
    .locator('div.relative')
    .filter({ has: page.getByRole('heading', { level: 3, name: LETTER_TITLE }) })
    .last()
  await expect(card.getByRole('heading', { name: LETTER_TITLE })).toBeVisible()
  // The kebab carries an icon and no label, so it is addressed by position.
  await card.locator('button').first().click()
  const item = page.getByRole('button', { name: LOCALES[locale].coverLetters.downloadPDF, exact: true })
  await expect(item).toBeVisible()
  return item
}

async function openEditor(page: Page, locale: TestLocale, letterId: string): Promise<Locator> {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  const button = page.getByRole('button', { name: LOCALES[locale].coverLetters.downloadPDF, exact: true })
  await expect(button).toBeVisible()
  return button
}

/**
 * The editor's PDF notice, by id: Next's route announcer is a second
 * `role="alert"` on every page.
 */
const pdfNotice = (page: Page) => page.locator('#cover-letter-pdf-notice')

/** POST to the PDF route with the page's own session. */
function requestPdf(page: Page, letterId: string): Promise<APIResponse> {
  return page.request.post(`/api/cover-letters/${letterId}/download-pdf`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
}

async function downloadedBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** Whitespace removed: where pdf.js splits a line into items is not the letter's business. */
const squash = (text: string) => text.replace(/\s+/g, '')

/** Every part found, each after the one before it. */
function expectPartsInOrder(text: string, parts: readonly (string | RegExp)[]): void {
  const haystack = squash(text)
  let from = 0
  for (const part of parts) {
    let at: number
    let length: number
    if (typeof part === 'string') {
      at = haystack.indexOf(squash(part), from)
      length = squash(part).length
    } else {
      const match = new RegExp(part.source, 'g')
      match.lastIndex = from
      const found = match.exec(haystack)
      at = found ? found.index : -1
      length = found ? found[0].length : 0
    }
    expect(at, `"${String(part)}" is missing, or out of order, in: ${text}`).toBeGreaterThanOrEqual(0)
    from = at + length
  }
}

/** A complete text PDF at the cover letter's page size. */
async function expectTextPdf(pdf: Buffer): Promise<ReadPdf> {
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true)
  const read = await readPdf(pdf)
  expect(read.images, 'the letter must be text, not a picture of the page').toBe(0)
  for (const page of read.pages) {
    expect(Math.round(page.widthPt)).toBe(LETTER_PAGE_PT.width)
    expect(Math.round(page.heightPt)).toBe(LETTER_PAGE_PT.height)
  }
  return read
}

/** The names of the fonts the PDF embeds; Chromium keeps the style in them. */
function embeddedFontNames(pdf: Buffer): string[] {
  return [...pdf.toString('latin1').matchAll(/\/FontName\s*\/([^\s/<>[\]]+)/g)].map((match) => match[1])
}

async function expectFullLetter(pdf: Buffer, download: Download): Promise<void> {
  await test.info().attach('cover-letter.pdf', { body: pdf, contentType: 'application/pdf' })
  expect(download.suggestedFilename()).toBe(`${LETTER_TITLE}.pdf`)
  const read = await expectTextPdf(pdf)
  expect(read.pages).toHaveLength(1)
  expectPartsInOrder(read.pages.map((page) => page.text).join(' '), FULL_LETTER_PARTS)

  const fonts = embeddedFontNames(pdf)
  expect(fonts.some((name) => /Bold/i.test(name)), `bold face embedded: ${fonts.join(', ')}`).toBe(true)
  expect(fonts.some((name) => /Italic|Oblique/i.test(name)), `italic face embedded: ${fonts.join(', ')}`).toBe(true)
}

for (const locale of Object.keys(LOCALES) as TestLocale[]) {
  const messages = LOCALES[locale].coverLetters

  test.describe(`cover letter PDF (${locale})`, () => {
    test('the list ⋮ menu downloads the letter as a text PDF with every part in order', async ({ page, authedUser }) => {
      const dialogs = watchDialogs(page)
      await insertLetter(authedUser.id)
      await page.goto(`/${locale}/dashboard/cover-letters`)

      const item = await openListPdfItem(page, locale)
      const downloading = page.waitForEvent('download', { timeout: 60_000 })
      await item.click()
      const download = await downloading

      await expectFullLetter(await downloadedBytes(download), download)
      expect(dialogs).toEqual([])
    })

    test('the editor downloads the saved letter as a text PDF with every part in order', async ({ page, authedUser }) => {
      const dialogs = watchDialogs(page)
      const letterId = await insertLetter(authedUser.id)
      const button = await openEditor(page, locale, letterId)

      const downloading = page.waitForEvent('download', { timeout: 60_000 })
      await button.click()
      const download = await downloading

      await expectFullLetter(await downloadedBytes(download), download)
      expect(dialogs).toEqual([])
    })

    test('a long letter flows onto a second page with no part missing', async ({ page, authedUser }) => {
      const letterId = await insertLetter(authedUser.id, {
        body_paragraphs: LONG_BODY.map((text) => `<p>${text}</p>`),
      })
      const button = await openEditor(page, locale, letterId)

      const downloading = page.waitForEvent('download', { timeout: 60_000 })
      await button.click()
      const pdf = await downloadedBytes(await downloading)
      await test.info().attach('long-cover-letter.pdf', { body: pdf, contentType: 'application/pdf' })

      const read = await expectTextPdf(pdf)
      expect(read.pages).toHaveLength(2)
      expectPartsInOrder(read.pages.map((p) => p.text).join(' '), [
        'Ada Lovelace',
        'Dear Mr. Babbage,',
        ...LONG_BODY.map((text) => text.trim()),
        'Thank you for your time and consideration.',
        'Sincerely,',
        'Ada Lovelace',
      ])
      // The second page carries the end of the letter, not a blank sheet.
      expectPartsInOrder(read.pages[1].text, ['Sincerely,', 'Ada Lovelace'])
    })

    test('with unsaved changes the editor asks to save first and downloads nothing', async ({ page, authedUser }) => {
      const letterId = await insertLetter(authedUser.id)
      const button = await openEditor(page, locale, letterId)
      const requests = watchPdfRequests(page)
      let downloads = 0
      page.on('download', () => {
        downloads++
      })

      await page.getByPlaceholder(LOCALES[locale].coverLetters.editor.titlePlaceholder).fill('Edited title')
      await button.click()

      await expect(pdfNotice(page)).toHaveText(messages.editor.saveBeforeDownload)
      expect(requests).toEqual([])
      expect(downloads).toBe(0)

      // Nothing was saved on the user's behalf.
      const { data } = await admin().from('cover_letters').select('title').eq('id', letterId).single()
      expect((data as { title: string }).title).toBe(LETTER_TITLE)
    })

    test('a failed generation shows the localized error and saves no file', async ({ page, authedUser }) => {
      const letterId = await insertLetter(authedUser.id)
      await page.route('**/api/cover-letters/*/download-pdf', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Failed to generate PDF"}' }),
      )
      let downloads = 0
      page.on('download', () => {
        downloads++
      })

      // Editor: an inline alert.
      const button = await openEditor(page, locale, letterId)
      await button.click()
      await expect(pdfNotice(page)).toHaveText(messages.downloadPDFError)

      // List: the card reports its failures in a dialog.
      const dialogs = watchDialogs(page)
      await page.goto(`/${locale}/dashboard/cover-letters`)
      await (await openListPdfItem(page, locale)).click()
      await expect.poll(() => dialogs).toEqual([`alert: ${messages.downloadPDFError}`])

      expect(downloads).toBe(0)
    })
  })
}

test("another user's letter id is refused with 404 and no PDF", async ({ page, authedUser }) => {
  const other = await createTestUser()
  try {
    const foreignId = await insertLetter(other.id)
    // The signed-in user's own letter answers, so the 404 is about ownership.
    const ownId = await insertLetter(authedUser.id)

    const post = (id: string) => requestPdf(page, id)

    const foreign = await post(foreignId)
    expect(foreign.status()).toBe(404)
    expect(foreign.headers()['content-type']).not.toContain('application/pdf')
    expect(foreign.headers()['content-disposition']).toBeUndefined()

    expect((await post('00000000-0000-4000-8000-000000000000')).status()).toBe(404)
    expect((await post('not-a-uuid')).status()).toBe(404)

    const own = await post(ownId)
    expect(own.status()).toBe(200)
    expect(own.headers()['content-type']).toBe('application/pdf')
  } finally {
    await deleteTestUser(other.id)
  }
})

test.describe('cover letter PDF: keyboard focus (fr)', () => {
  const locale: TestLocale = 'fr'

  test('after a failed request the editor button keeps focus, so Enter retries', async ({ page, authedUser }) => {
    const letterId = await insertLetter(authedUser.id)
    const button = await openEditor(page, locale, letterId)
    const route = '**/api/cover-letters/*/download-pdf'
    await page.route(route, (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Failed to generate PDF"}' }),
    )

    await button.focus()
    await expect(button).toBeFocused()
    await page.keyboard.press('Enter')

    // The button was disabled while busy, which drops focus to <body>; it must
    // come back once the request has ended.
    await expect(pdfNotice(page)).toHaveText(LOCALES[locale].coverLetters.downloadPDFError)
    await expect(button).toBeFocused()

    await page.unroute(route)
    const downloading = page.waitForEvent('download', { timeout: 60_000 })
    await page.keyboard.press('Enter')
    const pdf = await downloadedBytes(await downloading)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    await expect(button).toBeFocused()
  })

  test('the list ⋮ item hands focus back to the menu toggle it closes', async ({ page, authedUser }) => {
    await insertLetter(authedUser.id)
    await page.goto(`/${locale}/dashboard/cover-letters`)
    const item = await openListPdfItem(page, locale)
    const toggle = page
      .locator('div.relative')
      .filter({ has: page.getByRole('heading', { level: 3, name: LETTER_TITLE }) })
      .last()
      .locator('button')
      .first()

    const downloading = page.waitForEvent('download', { timeout: 60_000 })
    await item.click()
    await expect(toggle).toBeFocused()
    await downloading
    await expect(toggle).toBeFocused()
  })
})

test.describe('cover letter PDF: page boundary', () => {
  test('a letter ending near the bottom of page 1 is one page, with its last line on it', async ({ page, authedUser }) => {
    const letterId = await insertLetter(authedUser.id, {
      ...BOUNDARY_LETTER,
      body_paragraphs: SHORT_LINES(LINES_FILLING_PAGE_ONE),
    })
    const response = await requestPdf(page, letterId)
    expect(response.status()).toBe(200)
    const pdf = await response.body()
    await test.info().attach('page-one-full.pdf', { body: pdf, contentType: 'application/pdf' })

    const read = await expectTextPdf(pdf)
    expect(read.pages).toHaveLength(1)
    expectPartsInOrder(read.pages[0].text, [
      'Dear Mr. Babbage,',
      `Short line ${LINES_FILLING_PAGE_ONE}.`,
      'Thank you.',
      'Sincerely,',
      'Ada Lovelace',
    ])
    // The signature is the last thing on the page.
    expect(squash(read.pages[0].text).endsWith('AdaLovelace')).toBe(true)
  })

  test('one paragraph more is two pages, neither of them empty', async ({ page, authedUser }) => {
    const lines = LINES_FILLING_PAGE_ONE + 1
    const letterId = await insertLetter(authedUser.id, { ...BOUNDARY_LETTER, body_paragraphs: SHORT_LINES(lines) })
    const response = await requestPdf(page, letterId)
    expect(response.status()).toBe(200)
    const pdf = await response.body()
    await test.info().attach('page-one-overflow.pdf', { body: pdf, contentType: 'application/pdf' })

    const read = await expectTextPdf(pdf)
    expect(read.pages).toHaveLength(2)
    for (const pdfPage of read.pages) expect(pdfPage.text.trim()).not.toBe('')
    expectPartsInOrder(read.pages.map((p) => p.text).join(' '), [
      ...Array.from({ length: lines }, (_, i) => `Short line ${i + 1}.`),
      'Thank you.',
      'Sincerely,',
      'Ada Lovelace',
    ])
    expectPartsInOrder(read.pages[1].text, ['Ada Lovelace'])
  })

  test('ul items keep their bullet as text beside the item', async ({ page, authedUser }) => {
    const letterId = await insertLetter(authedUser.id, { ...BOUNDARY_LETTER, body_paragraphs: SHORT_LINES(1) })
    const response = await requestPdf(page, letterId)
    expect(response.status()).toBe(200)
    const read = await expectTextPdf(await response.body())
    expectPartsInOrder(read.pages[0].text, ['Opening line.', '•', 'Bullet alpha', '•', 'Bullet beta', 'Short line 1.'])
  })
})

test.describe('cover letter PDF: hostile content', () => {
  let listener: Server
  let port = 0
  const hits: string[] = []

  test.beforeAll(async () => {
    listener = createServer((request, response) => {
      hits.push(`${request.method} ${request.url}`)
      response.writeHead(204)
      response.end()
    })
    await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
    port = (listener.address() as AddressInfo).port
  })

  test.afterAll(async () => {
    await new Promise<void>((resolve) => listener.close(() => resolve()))
  })

  test('prints the visible text and reaches no URL in the letter', async ({ page, authedUser }) => {
    const target = (path: string) => `http://127.0.0.1:${port}/${path}`

    // The listener answers on this machine, where the server renders: a request
    // from the renderer would have been recorded.
    await fetch(target('probe'))
    expect(hits).toEqual(['GET /probe'])
    hits.length = 0

    const letterId = await insertLetter(authedUser.id, {
      sender_name: `Ada <img src="${target('sender')}">`,
      opening_paragraph:
        '<p>Visible opening text.</p>' +
        `<img src="${target('img')}">` +
        `<style>@import url(${target('css')})</style>` +
        `<iframe src="${target('frame')}"></iframe>` +
        `<meta http-equiv="refresh" content="0;url=${target('meta')}">` +
        '<a href="javascript:alert(1)">Visible link text</a>' +
        `<img src="x" onerror="fetch('${target('onerror')}')">`,
      body_paragraphs: [
        `<p style="font-family:x;background:url(${target('bg')})">Visible body text.</p>`,
        `<p><span style="font-family:x;background-image:url(${target('span-bg')})">Visible span text.</span></p>`,
      ],
      closing_paragraph: '<p>Visible closing text.</p>',
    })

    const response = await requestPdf(page, letterId)
    expect(response.status()).toBe(200)
    const pdf = await response.body()
    await test.info().attach('hostile-cover-letter.pdf', { body: pdf, contentType: 'application/pdf' })

    const read = await expectTextPdf(pdf)
    const text = read.pages.map((p) => p.text).join(' ')
    expectPartsInOrder(text, [
      'Visible opening text.',
      'Visible link text',
      'Visible body text.',
      'Visible span text.',
      'Visible closing text.',
    ])
    // A plain-text field prints its markup as text, escaped.
    expect(squash(text)).toContain(squash(`Ada <img src="${target('sender')}">`))

    expect(hits, 'the renderer must not request any URL from the letter').toEqual([])
  })
})
