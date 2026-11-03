import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/**
 * The editor's Preview button opens the letter in a full-screen window
 * (cover-letter-preview-and-card-language, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * What is at stake is what the user sees and reaches: the unsaved letter, a
 * page scaled with a CSS transform (which leaves its layout height
 * unscaled, so a scroll area around it can end too early or too late), and
 * where keyboard focus goes. None of that exists outside a rendered page.
 *
 * WHAT IS ASSERTED
 *
 *   - The Preview button sits immediately before the PDF button.
 *   - The window is a modal dialog named by its title, and focus moves into
 *     its scroll area.
 *   - A greeting typed and not saved is shown in the window.
 *   - The letter is taller than the window; the keyboard scrolls it to the
 *     bottom, where the last line (the sender's name) is fully inside the
 *     scroll area, with no large blank space after it.
 *   - Tab stays inside the window.
 *   - Escape and the close button both close it, and focus returns to the
 *     Preview button.
 *   - PageUp, ArrowDown and the mouse wheel scroll it as well.
 *   - Opening and closing never saves the letter: no write to the
 *     `cover_letters` table, and the unsaved-changes indicator stays.
 *   - At 768x1024 and 375x812, the page fits the window's width with a
 *     gutter on both sides, and the window does not scroll sideways.
 *
 * And for the editor header, which the Preview button made wider (a long
 * unsaved title is the widest the title side gets):
 *
 *   - At 1280x800, in en/fr/de/it, with the stored short title and with a
 *     long unsaved one, the six action buttons lie inside the header on the
 *     title's row, and the page does not scroll sideways.
 *   - At 1024x768 and 768x1024, in de, the buttons wrap instead: they stay
 *     inside the header, never cover the back link or the title, which
 *     keeps at least 10rem, and the page does not scroll sideways.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter preview window')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const SENDER_NAME = 'Zoë Lovelace'
const UNSAVED_GREETING = 'Dear Ms Unsaved Greeting,'

const editorDict = en.coverLetters.editor

/** Enough body text that the letter runs well past one window's height. */
const LONG_BODY = Array.from(
  { length: 12 },
  (_, index) =>
    `<p>Paragraph ${index + 1}: over several years I have led projects from their first sketch to their release, ` +
    'working with designers, engineers and clients to ship reliable software on time and within budget, ' +
    'and I would bring the same care and attention to detail to your team.</p>',
)

async function insertLetter(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'Preview window letter',
      sender_name: SENDER_NAME,
      company_name: 'Acme SA',
      job_title: 'Software Engineer',
      greeting: 'Dear Hiring Manager,',
      opening_paragraph: '<p>I am writing to apply for the Software Engineer position at Acme SA.</p>',
      body_paragraphs: LONG_BODY,
      closing_paragraph: '<p>Thank you for your time and consideration.</p>',
      sign_off: 'Sincerely,',
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

/** Every write the browser sends to the `cover_letters` table: a save would be one. */
function recordLetterWrites(page: Page): string[] {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/rest/v1/cover_letters')) {
      writes.push(`${request.method()} ${request.url()}`)
    }
  })
  return writes
}

/** The element's visible rectangle, in viewport pixels. */
async function rect(locator: Locator) {
  return locator.evaluate((element) => {
    const { top, bottom, left, right } = element.getBoundingClientRect()
    return { top, bottom, left, right }
  })
}

/**
 * The area's scrollTop once any smooth scroll has finished: two reads 100 ms
 * apart agree. A key press or a wheel turn animates the scroll, so a value
 * read straight after it is not yet where it will stop.
 */
function settledScrollTop(area: Locator): Promise<number> {
  return area.evaluate(async (element) => {
    let previous = element.scrollTop
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (element.scrollTop === previous) return previous
      previous = element.scrollTop
    }
    throw new Error(`scrollTop did not settle, last at ${previous}`)
  })
}

test('the Preview button opens the unsaved letter in a scrollable full-screen window', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  const response = await page.goto(`/en/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)

  const previewButton = page.getByRole('button', { name: editorDict.preview, exact: true })
  const pdfButton = page.getByRole('button', { name: en.coverLetters.downloadPDF, exact: true })
  await expect(previewButton).toBeVisible()
  await expect(pdfButton).toBeVisible()

  // Beside PDF and Word, immediately before PDF.
  const nextIsPdf = await previewButton.evaluate(
    (button) => button.nextElementSibling?.getAttribute('aria-label') ?? null,
  )
  expect(nextIsPdf).toBe(en.coverLetters.downloadPDF)

  // An unsaved edit: the greeting, typed and not saved.
  await page.getByRole('button', { name: editorDict.sections.opening, exact: true }).click()
  await page.getByPlaceholder(editorDict.opening.greetingPlaceholder, { exact: true }).fill(UNSAVED_GREETING)
  const unsavedIndicator = page.getByText(editorDict.unsavedChanges, { exact: true })
  await expect(unsavedIndicator).toBeVisible()

  const writes = recordLetterWrites(page)

  // --- Open ---
  await previewButton.click()
  const dialog = page.getByRole('dialog', { name: editorDict.previewTitle, exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')

  const scrollArea = dialog.getByRole('region', { name: editorDict.previewScrollArea, exact: true })
  await expect(scrollArea).toBeFocused()

  // The letter as it is on screen, not as it is saved.
  await expect(dialog.getByText(UNSAVED_GREETING, { exact: true })).toBeVisible()
  await expect(dialog.getByText('Dear Hiring Manager,', { exact: true })).toHaveCount(0)

  // --- Scroll to the last line ---
  const lastLine = dialog.getByText(SENDER_NAME, { exact: true }).last()
  const sizes = await scrollArea.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }))
  expect(sizes.scrollHeight, 'the letter must need scrolling in this window').toBeGreaterThan(sizes.clientHeight)
  {
    const area = await rect(scrollArea)
    const line = await rect(lastLine)
    expect(line.top, 'the last line starts out of view').toBeGreaterThanOrEqual(area.bottom)
  }

  // The keyboard scrolls the focused area, one page at a time, to its end.
  await expect(async () => {
    await scrollArea.press('PageDown')
    const atEnd = await scrollArea.evaluate(
      (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
    )
    expect(atEnd).toBe(true)
  }).toPass({ timeout: 15_000 })
  const atBottom = await settledScrollTop(scrollArea)

  const area = await rect(scrollArea)
  const line = await rect(lastLine)
  expect(line.top).toBeGreaterThanOrEqual(area.top)
  expect(line.bottom).toBeLessThanOrEqual(area.bottom)
  expect(line.left).toBeGreaterThanOrEqual(area.left)
  expect(line.right).toBeLessThanOrEqual(area.right)
  // Below the last line: the page's bottom padding (64 px at most, at scale 1)
  // and the preview's own (16 px). A page laid out at its unscaled height
  // would leave far more.
  expect(area.bottom - line.bottom, 'blank space after the last line').toBeLessThan(120)

  // --- The other keys, and the mouse wheel, scroll it too ---
  // Each press is measured from where the one before it came to rest.
  const scrollTop = () => scrollArea.evaluate((element) => element.scrollTop)
  await scrollArea.press('PageUp')
  await expect.poll(scrollTop, 'PageUp scrolls up').toBeLessThan(atBottom)
  const afterPageUp = await settledScrollTop(scrollArea)
  await scrollArea.press('ArrowDown')
  await expect.poll(scrollTop, 'ArrowDown scrolls down').toBeGreaterThan(afterPageUp)
  await settledScrollTop(scrollArea)

  await scrollArea.evaluate((element) => {
    element.scrollTop = 0
  })
  expect(await settledScrollTop(scrollArea)).toBe(0)
  const areaBox = await scrollArea.boundingBox()
  expect(areaBox).not.toBeNull()
  await page.mouse.move(areaBox!.x + areaBox!.width / 2, areaBox!.y + areaBox!.height / 2)
  await page.mouse.wheel(0, 400)
  await expect.poll(scrollTop, 'the wheel scrolls down').toBeGreaterThan(0)
  expect(await settledScrollTop(scrollArea), 'the wheel scrolls down').toBeGreaterThan(0)

  // --- Tab stays inside ---
  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }

  // --- Escape closes, focus returns ---
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(previewButton).toBeFocused()
  await expect(unsavedIndicator).toBeVisible()

  // --- The close button closes, focus returns ---
  await previewButton.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: editorDict.closePreview, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(previewButton).toBeFocused()

  // Nothing was saved, and the editor still says so.
  await expect(unsavedIndicator).toBeVisible()
  expect(writes).toEqual([])
  const { data: stored, error } = await admin()
    .from('cover_letters')
    .select('greeting')
    .eq('id', letterId)
    .single()
  expect(error, error?.message).toBeNull()
  expect((stored as { greeting: string }).greeting).toBe('Dear Hiring Manager,')
})

const HEADER_LOCALES = { en, fr, de, it } as const
type HeaderLocale = keyof typeof HEADER_LOCALES

const LONG_TITLE = 'Cover Letter - Senior Full-Stack Software Engineer at Acme International Holdings SA'

type Box = Awaited<ReturnType<typeof rect>>

const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** The seeded title, as stored; or a long one typed and not saved, the widest the title side gets. */
type HeaderTitle = 'short' | 'long'

/**
 * Opens the editor in `locale` with `titleCase`'s title, checks the header's
 * buttons lie inside it, cover neither the back link nor the title, and that
 * the page does not scroll sideways. Returns the buttons' and the back link's boxes.
 */
async function checkHeader(
  page: Page,
  letterId: string,
  locale: HeaderLocale,
  titleCase: HeaderTitle,
): Promise<{ buttons: Box[]; backLink: Box }> {
  const messages = HEADER_LOCALES[locale]
  const dict = messages.coverLetters.editor
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)

  const header = page.getByTestId('cover-letter-editor-header')
  await expect(header.getByRole('button', { name: dict.preview, exact: true })).toBeVisible()
  const title = header.getByRole('textbox')
  if (titleCase === 'long') {
    await title.fill(LONG_TITLE)
    await expect(page.getByText(dict.unsavedChanges, { exact: true })).toBeVisible()
  }

  const headerBox = await rect(header)
  const backLinkBox = await rect(header.locator('a').first())
  const titleBox = await rect(title)
  expect(titleBox.right - titleBox.left, `${locale} title width`).toBeGreaterThanOrEqual(160)

  const names = [
    dict.generate,
    dict.check,
    dict.preview,
    messages.coverLetters.downloadPDF,
    messages.coverLetters.downloadWord,
    messages.common.save,
  ]
  const boxes: Box[] = []
  for (const name of names) {
    const box = await rect(header.getByRole('button', { name, exact: true }))
    expect(box.left, `${locale} "${name}" left`).toBeGreaterThanOrEqual(headerBox.left)
    expect(box.right, `${locale} "${name}" right`).toBeLessThanOrEqual(headerBox.right)
    expect(box.top, `${locale} "${name}" top`).toBeGreaterThanOrEqual(headerBox.top)
    expect(box.bottom, `${locale} "${name}" bottom`).toBeLessThanOrEqual(headerBox.bottom)
    expect(intersects(box, backLinkBox), `${locale} "${name}" covers the back link`).toBe(false)
    expect(intersects(box, titleBox), `${locale} "${name}" covers the title`).toBe(false)
    boxes.push(box)
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(overflow.scrollWidth, `${locale} horizontal scroll`).toBeLessThanOrEqual(overflow.innerWidth)
  return { buttons: boxes, backLink: backLinkBox }
}

test('at 1280 px the header holds all six action buttons on one row in every locale', async ({
  page,
  authedUser,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const letterId = await insertLetter(authedUser.id)

  for (const locale of Object.keys(HEADER_LOCALES) as HeaderLocale[]) {
    for (const titleCase of ['short', 'long'] as const) {
      await test.step(`${locale}, ${titleCase} title`, async () => {
        const { buttons, backLink } = await checkHeader(page, letterId, locale, titleCase)
        const label = `${locale}, ${titleCase} title`
        // On the title's row, not on a row of their own below it: a group that
        // wraps as a whole stays aligned with itself, so each button must also
        // overlap the back link vertically.
        for (const box of buttons) {
          expect(box.top < backLink.bottom && backLink.top < box.bottom, `${label}: a button off the title row`).toBe(
            true,
          )
        }
        // One row: every button's vertical centre within 2 px of the first's.
        // Their heights differ by a pixel or so (the purple Generate button has
        // no border), so their tops need not be equal; a second row would be a
        // whole button height lower.
        const centres = buttons.map((box) => (box.top + box.bottom) / 2)
        for (const centre of centres) {
          expect(Math.abs(centre - centres[0]), `${label}, one row: ${centres.join(', ')}`).toBeLessThanOrEqual(2)
        }
      })
    }
  }
})

test('below 1280 px the header buttons wrap without covering the title', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
  ]) {
    await test.step(`de at ${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport)
      await checkHeader(page, letterId, 'de', 'long')
    })
  }
})

test('in a narrow window the page fits its width, with a gutter on both sides', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport)
      const response = await page.goto(`/en/dashboard/cover-letters/${letterId}/edit`)
      expect(response?.status()).toBe(200)

      await page.getByRole('button', { name: editorDict.preview, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: editorDict.previewTitle, exact: true })
      await expect(dialog).toBeVisible()
      const scrollArea = dialog.getByRole('region', { name: editorDict.previewScrollArea, exact: true })
      const letterPage = dialog.locator('div.shadow-2xl')
      await expect(letterPage).toHaveCount(1)

      await expect(async () => {
        const widths = await scrollArea.evaluate((element) => ({
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }))
        expect(widths.scrollWidth, 'the window scrolls sideways').toBeLessThanOrEqual(widths.clientWidth)
        const area = await rect(scrollArea)
        const pageBox = await rect(letterPage)
        expect(pageBox.left - area.left, 'left gutter').toBeGreaterThanOrEqual(8)
        expect(area.right - pageBox.right, 'right gutter').toBeGreaterThanOrEqual(8)
      }).toPass({ timeout: 10_000 })

      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    })
  }
})
