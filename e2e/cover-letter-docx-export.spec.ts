import JSZip from 'jszip'
import { test, expect, createTestUser, deleteTestUser } from './fixtures/auth'
import type { APIResponse, Download, Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'

/**
 * A cover letter downloads as a Word file, from the letters list's ⋮ menu and
 * from the editor (cover-letter-export-translate, US-002).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The file is built server-side by `POST /api/cover-letters/[id]/download-docx`,
 * but what the user gets is what their browser saves: the click, the request,
 * the name the page gives the download and the bytes.
 *
 * WHAT IS ASSERTED, in fr and de
 *
 *   - The download is a valid Word package (a zip holding
 *     `word/document.xml`) named after the letter's title, and no dialog opens.
 *   - Its text holds every part of the letter, in order — sender, date,
 *     recipient block, subject, greeting, opening, each body paragraph,
 *     closing, sign-off, signature name — each part a paragraph of its own.
 *   - Accents and typographic characters (é, ü, ß, ’, « ») arrive intact.
 *   - Bold and italic runs, and the numbered list as a Word list.
 *   - The editor refuses with unsaved changes, telling the user to save first,
 *     and sends no request at all.
 *   - A failed generation shows the localized error and saves no file.
 *
 * And, once: another user's letter id answers 404 with no file.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter DOCX export')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const LOCALES = { fr, de } as const
type TestLocale = keyof typeof LOCALES

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Accented on purpose: the name travels RFC 5987-encoded and must come back intact. */
const LETTER_TITLE = 'Lettre Word Zürich'

const BODY_PARAGRAPHS = [
  'Corps un : j’ai livré des logiciels en production pendant des années.',
  'Körper zwei: Ich verantworte die Exportkette, Größe und Maße inklusive.',
  'Body three: I care about accessibility, localization and the details users notice.',
]

/** The letter every test downloads. Each part is a distinct marker. */
const FULL_LETTER = {
  sender_name: 'Zoë Lovelace',
  recipient_name: 'Jürgen Weiß',
  recipient_title: 'Leiter Entwicklung',
  company_name: 'Größe & Söhne AG',
  company_address: 'Bahnhofstraße 1\n8001 Zürich',
  job_title: 'Ingénieur logiciel',
  greeting: 'Sehr geehrter Herr Weiß,',
  opening_paragraph:
    '<p>Je postule avec <strong>une conviction forte</strong> et <em>un réel intérêt</em> « sincère ».</p>' +
    '<ol><li>Première raison</li><li>Deuxième raison</li></ol>',
  body_paragraphs: BODY_PARAGRAPHS.map((text) => `<p>${text}</p>`),
  closing_paragraph: '<p>Merci pour votre temps et votre considération.</p>',
  sign_off: 'Mit freundlichen Grüßen,',
}

/**
 * The date line and the subject FULL_LETTER prints under each page locale.
 * Its paragraphs mix French, German and English too thinly for a language to
 * be told, so they follow the page (cover-letter-template-language, US-001).
 */
const PAGE_LANGUAGE_PARTS: Readonly<Record<TestLocale, { date: RegExp; subject: string }>> = {
  fr: { date: /^\d{1,2} [a-zéû]+ \d{4}$/, subject: 'Candidature au poste de Ingénieur logiciel' },
  de: { date: /^\d{1,2}\. [A-ZÄ][a-zä]+ \d{4}$/, subject: 'Bewerbung als Ingénieur logiciel' },
}

/** Every paragraph of FULL_LETTER's Word file, in order, opened under `locale`. */
const fullLetterParagraphs = (locale: TestLocale): (string | RegExp)[] => [
  'Zoë Lovelace',
  PAGE_LANGUAGE_PARTS[locale].date,
  'Jürgen Weiß',
  'Leiter Entwicklung',
  'Größe & Söhne AG',
  'Bahnhofstraße 1\n8001 Zürich',
  PAGE_LANGUAGE_PARTS[locale].subject,
  'Sehr geehrter Herr Weiß,',
  'Je postule avec une conviction forte et un réel intérêt « sincère ».',
  'Première raison',
  'Deuxième raison',
  ...BODY_PARAGRAPHS,
  'Merci pour votre temps et votre considération.',
  'Mit freundlichen Grüßen,',
  'Zoë Lovelace',
]

async function insertLetter(userId: string, fields: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({ user_id: userId, title: LETTER_TITLE, ...FULL_LETTER, ...fields })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

/** Collects dialogs, so a test can assert none opened. */
function watchDialogs(page: Page): string[] {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`)
    void dialog.dismiss()
  })
  return dialogs
}

/** Counts requests to the Word route, so a test can assert none was sent. */
function watchDocxRequests(page: Page): string[] {
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\/api\/cover-letters\/[^/]+\/download-docx$/.test(new URL(request.url()).pathname)) requests.push(request.method())
  })
  return requests
}

/** Opens the ⋮ menu of the letter's card and returns its Word item. */
async function openListWordItem(page: Page, locale: TestLocale): Promise<Locator> {
  const card = page
    .locator('div.relative')
    .filter({ has: page.getByRole('heading', { level: 3, name: LETTER_TITLE }) })
    .last()
  await expect(card.getByRole('heading', { name: LETTER_TITLE })).toBeVisible()
  // The kebab carries an icon and no label, so it is addressed by position.
  await card.locator('button').first().click()
  const item = page.getByRole('button', { name: LOCALES[locale].coverLetters.downloadWord, exact: true })
  await expect(item).toBeVisible()
  return item
}

async function openEditor(page: Page, locale: TestLocale, letterId: string): Promise<Locator> {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  const button = page.getByRole('button', { name: LOCALES[locale].coverLetters.downloadWord, exact: true })
  await expect(button).toBeVisible()
  return button
}

/** The editor's Word notice, by id: Next's route announcer is a second `role="alert"`. */
const wordNotice = (page: Page) => page.locator('#cover-letter-docx-notice')

function requestDocx(page: Page, letterId: string): Promise<APIResponse> {
  return page.request.post(`/api/cover-letters/${letterId}/download-docx`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
}

async function downloadedBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

const unescapeXml = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

interface WordParagraph {
  text: string
  runs: { text: string; bold: boolean; italic: boolean }[]
  numbered: boolean
}

/** The paragraphs of `word/document.xml`, as Word reads them. */
async function readWordParagraphs(docx: Buffer): Promise<WordParagraph[]> {
  expect(docx.subarray(0, 2).toString('latin1'), 'a .docx is a zip').toBe('PK')
  const zip = await JSZip.loadAsync(docx)
  const document = zip.file('word/document.xml')
  expect(document, 'word/document.xml').not.toBeNull()
  const xml = await document!.async('string')
  return [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(([, body]) => {
    const runs = [...body.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map(([, run]) => ({
      text: [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:br\/>/g)]
        .map((match) => (match[0] === '<w:br/>' ? '\n' : unescapeXml(match[1])))
        .join(''),
      bold: /<w:b\/>/.test(run),
      italic: /<w:i\/>/.test(run),
    }))
    return { text: runs.map((run) => run.text).join(''), runs, numbered: /<w:numPr>/.test(body) }
  })
}

async function expectFullLetter(docx: Buffer, download: Download, locale: TestLocale): Promise<void> {
  await test.info().attach('cover-letter.docx', { body: docx, contentType: DOCX_TYPE })
  expect(download.suggestedFilename()).toBe(`${LETTER_TITLE}.docx`)

  const paragraphs = await readWordParagraphs(docx)
  const texts = paragraphs.map((paragraph) => paragraph.text)
  // Every part, in order, each a paragraph of its own: nothing more, nothing less.
  const expectedParagraphs = fullLetterParagraphs(locale)
  expect(texts).toHaveLength(expectedParagraphs.length)
  expectedParagraphs.forEach((expected, index) => {
    if (typeof expected === 'string') expect(texts[index]).toBe(expected)
    else expect(texts[index]).toMatch(expected)
  })

  const opening = paragraphs.find((paragraph) => paragraph.text.startsWith('Je postule'))!
  expect(opening.runs.find((run) => run.text === 'une conviction forte')).toMatchObject({ bold: true, italic: false })
  expect(opening.runs.find((run) => run.text === 'un réel intérêt')).toMatchObject({ bold: false, italic: true })
  expect(paragraphs.filter((paragraph) => paragraph.numbered).map((paragraph) => paragraph.text)).toEqual([
    'Première raison',
    'Deuxième raison',
  ])
}

for (const locale of Object.keys(LOCALES) as TestLocale[]) {
  const messages = LOCALES[locale].coverLetters

  test.describe(`cover letter Word (${locale})`, () => {
    test('the list ⋮ menu downloads the letter as a Word file with every part in order', async ({ page, authedUser }) => {
      const dialogs = watchDialogs(page)
      await insertLetter(authedUser.id)
      await page.goto(`/${locale}/dashboard/cover-letters`)

      const item = await openListWordItem(page, locale)
      const downloading = page.waitForEvent('download', { timeout: 60_000 })
      await item.click()
      const download = await downloading

      await expectFullLetter(await downloadedBytes(download), download, locale)
      expect(dialogs).toEqual([])
    })

    test('the editor downloads the saved letter as a Word file with every part in order', async ({ page, authedUser }) => {
      const dialogs = watchDialogs(page)
      const letterId = await insertLetter(authedUser.id)
      const button = await openEditor(page, locale, letterId)

      const downloading = page.waitForEvent('download', { timeout: 60_000 })
      await button.click()
      const download = await downloading

      await expectFullLetter(await downloadedBytes(download), download, locale)
      expect(dialogs).toEqual([])
      await expect(button).toBeEnabled()
    })

    test('with unsaved changes the editor asks to save first and downloads nothing', async ({ page, authedUser }) => {
      const letterId = await insertLetter(authedUser.id)
      const button = await openEditor(page, locale, letterId)
      const requests = watchDocxRequests(page)
      let downloads = 0
      page.on('download', () => {
        downloads++
      })

      await page.getByPlaceholder(messages.editor.titlePlaceholder).fill('Edited title')
      await button.click()

      await expect(wordNotice(page)).toHaveText(messages.editor.saveBeforeDownloadWord)
      expect(requests).toEqual([])
      expect(downloads).toBe(0)

      // Nothing was saved on the user's behalf.
      const { data } = await admin().from('cover_letters').select('title').eq('id', letterId).single()
      expect((data as { title: string }).title).toBe(LETTER_TITLE)
    })

    test('a failed generation shows the localized error and saves no file', async ({ page, authedUser }) => {
      const letterId = await insertLetter(authedUser.id)
      await page.route('**/api/cover-letters/*/download-docx', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Failed to generate Word document"}' }),
      )
      let downloads = 0
      page.on('download', () => {
        downloads++
      })

      // Editor: an inline alert, and the button is usable again for a retry.
      const button = await openEditor(page, locale, letterId)
      await button.click()
      await expect(wordNotice(page)).toHaveText(messages.downloadWordError)
      await expect(button).toBeEnabled()

      // List: the card reports its failures in a dialog.
      const dialogs = watchDialogs(page)
      await page.goto(`/${locale}/dashboard/cover-letters`)
      await (await openListWordItem(page, locale)).click()
      await expect.poll(() => dialogs).toEqual([`alert: ${messages.downloadWordError}`])

      expect(downloads).toBe(0)
    })
  })
}

test("another user's letter id is refused with 404 and no Word file", async ({ page, authedUser }) => {
  const other = await createTestUser()
  try {
    const foreignId = await insertLetter(other.id)
    // The signed-in user's own letter answers, so the 404 is about ownership.
    const ownId = await insertLetter(authedUser.id)

    const foreign = await requestDocx(page, foreignId)
    expect(foreign.status()).toBe(404)
    expect(foreign.headers()['content-type']).not.toContain(DOCX_TYPE)
    expect(foreign.headers()['content-disposition']).toBeUndefined()

    expect((await requestDocx(page, '00000000-0000-4000-8000-000000000000')).status()).toBe(404)
    expect((await requestDocx(page, 'not-a-uuid')).status()).toBe(404)

    const own = await requestDocx(page, ownId)
    expect(own.status()).toBe(200)
    expect(own.headers()['content-type']).toBe(DOCX_TYPE)
  } finally {
    await deleteTestUser(other.id)
  }
})
