import JSZip from 'jszip'
import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { admin, rect } from './fixtures/cover-letter-preview'
import { readPdfTextItems, type PdfTextItem } from './fixtures/pdf'
import { seedFixtureResume } from './fixtures/resume'
import { SWISS_LETTER_GEOMETRY_MM, mmToPx } from '../src/lib/cover-letter-swiss-letter'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/**
 * A cover letter's paragraphs can be aligned left, center, right or justified,
 * as in Word (cover-letter-alignment-and-job-banner, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The alignment is written by the browser's own `justify*` editing commands,
 * on the paragraph(s) the cursor or selection is in, and the active button
 * follows the cursor through `selectionchange`. Where a paragraph's lines land
 * in the PDF is a layout outcome of the server's headless print.
 *
 * WHAT IS ASSERTED
 *
 *   - The four buttons, in order, on the opening, a body paragraph, a body
 *     paragraph added with "Add paragraph", and the closing.
 *   - A click aligns only the paragraph holding the cursor; a selection across
 *     two paragraphs aligns both and leaves the third alone; the active button
 *     follows the cursor, left for a paragraph with no alignment.
 *   - A button is reachable and operable with the keyboard, with visible focus.
 *   - After save and reload: the editor's HTML, both previews' computed
 *     alignment, the PDF's line positions (centered lines centered in the text
 *     column, right lines flush right, justified lines full width but the
 *     last) and the Word file's `w:jc` for every paragraph.
 *   - Labels and tooltips from the dictionary in fr, en, de and it; the
 *     toolbar inside the form at every width the editor supports.
 *   - A CV field gets no new button: the key-achievements toolbar above it
 *     keeps its three alignment buttons, and no ribbon alignment group exists.
 */

const LOCALES = { en, fr, de, it } as const
type LocaleCode = keyof typeof LOCALES

const ALIGN_KEYS = ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'] as const
const labelsOf = (locale: LocaleCode) => ALIGN_KEYS.map((key) => LOCALES[locale].resumes.editor.richTextToolbar[key])
const [LEFT, CENTER, RIGHT, JUSTIFY] = labelsOf('en')

/** The text column of the printed page, in PDF points. */
const PT_PER_PX = 72 / 96
const COLUMN_LEFT_PT = mmToPx(SWISS_LETTER_GEOMETRY_MM.marginLeft) * PT_PER_PX
const COLUMN_RIGHT_PT = mmToPx(SWISS_LETTER_GEOMETRY_MM.pageWidth - SWISS_LETTER_GEOMETRY_MM.marginRight) * PT_PER_PX
const COLUMN_CENTER_PT = (COLUMN_LEFT_PT + COLUMN_RIGHT_PT) / 2
/** Glyph side bearings and rounding in the printed line. */
const EDGE_PT = 1.5

/** A paragraph long enough to wrap on several lines, of words of uneven length so justifying is visible. */
const JUSTIFY_WORDS = Array.from(
  { length: 70 },
  (_, index) => `ju${String(index + 1).padStart(2, '0')}${['', 'x', 'long', 'mediumish', 'ab'][index % 5]}`,
).join(' ')

const OPENING = '<p>Opening centered line.</p><p>Opening right line.</p>'
const BODY = [`<p>${JUSTIFY_WORDS}</p>`]
const CLOSING = '<p>Closing first selected.</p><p>Closing second selected.</p><p>Closing untouched line.</p>'
const NEW_PARAGRAPH = 'New paragraph set back to left.'

/** What every paragraph must end up with, by its text. `''` = no alignment of its own (left). */
const EXPECTED: ReadonlyArray<{ text: string; stored: string; field: string }> = [
  { text: 'Opening centered line.', stored: 'center', field: 'opening' },
  { text: 'Opening right line.', stored: 'right', field: 'opening' },
  { text: JUSTIFY_WORDS, stored: 'justify', field: 'body' },
  { text: NEW_PARAGRAPH, stored: 'left', field: 'body' },
  { text: 'Closing first selected.', stored: 'center', field: 'closing' },
  { text: 'Closing second selected.', stored: 'center', field: 'closing' },
  { text: 'Closing untouched line.', stored: '', field: 'closing' },
]

async function insertLetter(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'Paragraph alignment',
      sender_name: 'Zoë Lovelace',
      company_name: 'Acme SA',
      job_title: 'Software Engineer',
      greeting: 'Dear Hiring Manager,',
      opening_paragraph: OPENING,
      body_paragraphs: BODY,
      closing_paragraph: CLOSING,
      sign_off: 'Sincerely,',
      annexes: '',
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

type LetterSection = 'opening' | 'body' | 'closing'

/** The section nav: the editor shows one section's fields at a time, the recipient's first. */
const sectionNav = (page: Page, locale: LocaleCode) =>
  page.locator('nav').filter({
    has: page.getByRole('button', { name: LOCALES[locale].coverLetters.editor.sections.recipient, exact: true }),
  })

/** Shows a section's fields and waits for its first editor to hold the stored text. */
async function showSection(page: Page, section: LetterSection, locale: LocaleCode = 'en') {
  await sectionNav(page, locale)
    .getByRole('button', { name: LOCALES[locale].coverLetters.editor.sections[section], exact: true })
    .click()
  const firstEditor = { opening: '#opening-paragraph', body: '#body-paragraph-0', closing: '#closing-paragraph' }[section]
  await expect(page.locator(firstEditor).locator('p, div').first()).not.toBeEmpty()
}

async function openEditor(page: Page, letterId: string, locale: LocaleCode = 'en') {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  await showSection(page, 'opening', locale)
  await expect(page.locator('#opening-paragraph p').first()).toHaveText('Opening centered line.')
}

/** The editor wrapper: its ribbon and its contentEditable. */
const fieldOf = (page: Page, editorId: string) => page.locator(`#${editorId}`).locator('xpath=..')
const alignButton = (field: Locator, label: string) => field.getByRole('button', { name: label, exact: true })

/** The alignment buttons' accessible names, in document order. */
async function alignmentLabels(field: Locator) {
  const group = field.getByTestId('formatting-ribbon-alignment')
  await expect(group).toBeVisible()
  return group
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => ({ label: button.getAttribute('aria-label'), title: button.getAttribute('title') })),
    )
}

async function expectActive(field: Locator, active: string) {
  for (const label of [LEFT, CENTER, RIGHT, JUSTIFY]) {
    await expect(alignButton(field, label), `${label} pressed`).toHaveAttribute('aria-pressed', String(label === active))
  }
}

/** Each innermost block of the editor: its text and its own `text-align`. */
const blockAlignments = (scope: Locator) =>
  scope.evaluate((root) =>
    Array.from(root.querySelectorAll('p, div, li'))
      .filter((element) => !element.querySelector('p, div, li') && element.textContent!.trim() !== '')
      .map((element) => ({ text: element.textContent!.trim(), align: (element as HTMLElement).style.textAlign })),
  )

/** The computed alignment of the block holding each expected text, inside a rendered letter. */
const renderedAlignments = (scope: Locator) =>
  scope.evaluate(
    (root, texts) =>
      texts.map((text) => {
        const block = Array.from(root.querySelectorAll('p, div, li')).find(
          (element) => !element.querySelector('p, div, li') && element.textContent!.trim() === text,
        )
        if (!block) throw new Error(`No block "${text.slice(0, 30)}" in the letter`)
        return getComputedStyle(block).textAlign
      }),
    EXPECTED.map((paragraph) => paragraph.text),
  )

/** Puts the caret inside the text of the editor's `index`-th block, as a click there does. */
async function clickInto(editor: Locator, index: number) {
  await editor.locator('p, div').nth(index).click()
}

interface PdfLine {
  text: string
  left: number
  right: number
}

/** Page 1's printed lines: items sharing a baseline, joined left to right. */
function pdfLines(items: PdfTextItem[]): PdfLine[] {
  const lines = new Map<number, PdfTextItem[]>()
  for (const item of items) {
    const key = [...lines.keys()].find((baseline) => Math.abs(baseline - item.baseline) < 1) ?? item.baseline
    lines.set(key, [...(lines.get(key) ?? []), item])
  }
  return [...lines.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, line]) => {
      const sorted = [...line].sort((a, b) => a.x - b.x)
      return {
        text: sorted.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim(),
        left: Math.min(...sorted.map((item) => item.x)),
        right: Math.max(...sorted.map((item) => item.x + item.width)),
      }
    })
}

const lineWith = (lines: PdfLine[], text: string) => {
  const found = lines.find((line) => line.text.includes(text))
  if (!found) throw new Error(`No PDF line with "${text}" in ${JSON.stringify(lines.map((line) => line.text))}`)
  return found
}

test('paragraphs are aligned one by one and keep their alignment in the editor, both previews, the PDF and Word', async ({
  page,
  authedUser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)

  const opening = fieldOf(page, 'opening-paragraph')
  const openingEditor = page.locator('#opening-paragraph')
  const body = fieldOf(page, 'body-paragraph-0')
  const closing = fieldOf(page, 'closing-paragraph')
  const closingEditor = page.locator('#closing-paragraph')

  const ALL_FOUR = [LEFT, CENTER, RIGHT, JUSTIFY].map((label) => ({ label, title: label }))
  expect(await alignmentLabels(opening), 'opening: buttons').toEqual(ALL_FOUR)

  // One paragraph at a time: only the one holding the cursor.
  await clickInto(openingEditor, 0)
  await expectActive(opening, LEFT)
  await alignButton(opening, CENTER).click()
  await expectActive(opening, CENTER)
  expect(await blockAlignments(openingEditor)).toEqual([
    { text: 'Opening centered line.', align: 'center' },
    { text: 'Opening right line.', align: '' },
  ])

  // Undo changes the alignment without moving the cursor: the active button follows it.
  await page.keyboard.press('Control+z')
  expect(await blockAlignments(openingEditor)).toEqual([
    { text: 'Opening centered line.', align: '' },
    { text: 'Opening right line.', align: '' },
  ])
  await expectActive(opening, LEFT)
  // Ctrl+Shift+Z redoes in Chromium on every platform; Ctrl+Y only on Windows
  await page.keyboard.press('Control+Shift+z')
  expect(await blockAlignments(openingEditor)).toEqual([
    { text: 'Opening centered line.', align: 'center' },
    { text: 'Opening right line.', align: '' },
  ])
  await expectActive(opening, CENTER)

  // The active button follows the cursor: left for a paragraph with no alignment.
  await clickInto(openingEditor, 1)
  await expectActive(opening, LEFT)
  await clickInto(openingEditor, 0)
  await expectActive(opening, CENTER)

  // Keyboard: from the second paragraph, back through the size and font
  // selects and the justify button to the right one, then Enter.
  await clickInto(openingEditor, 1)
  for (let step = 0; step < 4; step++) await page.keyboard.press('Shift+Tab')
  const right = alignButton(opening, RIGHT)
  await expect(right).toBeFocused()
  const focusLook = await right.evaluate((element) => ({
    focusVisible: element.matches(':focus-visible'),
    shadow: getComputedStyle(element).boxShadow,
  }))
  expect(focusLook.focusVisible).toBe(true)
  expect(focusLook.shadow, 'a visible focus ring').not.toBe('none')
  await page.keyboard.press('Enter')
  expect(await blockAlignments(openingEditor)).toEqual([
    { text: 'Opening centered line.', align: 'center' },
    { text: 'Opening right line.', align: 'right' },
  ])
  await expectActive(opening, RIGHT)

  // A body paragraph.
  await showSection(page, 'body')
  expect(await alignmentLabels(body), 'body: buttons').toEqual(ALL_FOUR)
  await clickInto(page.locator('#body-paragraph-0'), 0)
  await alignButton(body, JUSTIFY).click()
  await expectActive(body, JUSTIFY)

  // A body paragraph added now has the buttons too.
  await page.getByRole('button', { name: en.coverLetters.editor.body.addParagraph, exact: true }).click()
  const added = fieldOf(page, 'body-paragraph-1')
  const addedEditor = page.locator('#body-paragraph-1')
  expect(await alignmentLabels(added), 'added body paragraph: buttons').toEqual(ALL_FOUR)
  await addedEditor.click()
  await page.keyboard.type(NEW_PARAGRAPH)
  await alignButton(added, CENTER).click()
  await expectActive(added, CENTER)
  await alignButton(added, LEFT).click()
  await expectActive(added, LEFT)
  expect(await blockAlignments(addedEditor)).toEqual([{ text: NEW_PARAGRAPH, align: 'left' }])

  // A selection across two of the closing's three paragraphs aligns both.
  await showSection(page, 'closing')
  expect(await alignmentLabels(closing), 'closing: buttons').toEqual(ALL_FOUR)
  await closingEditor.evaluate((element) => {
    const [first, second] = Array.from(element.querySelectorAll('p'))
    const range = document.createRange()
    range.setStart(first.firstChild!, 3)
    range.setEnd(second.firstChild!, 3)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await alignButton(closing, CENTER).click()
  expect(await blockAlignments(closingEditor)).toEqual([
    { text: 'Closing first selected.', align: 'center' },
    { text: 'Closing second selected.', align: 'center' },
    { text: 'Closing untouched line.', align: '' },
  ])
  await clickInto(closingEditor, 2)
  await expectActive(closing, LEFT)

  // The other fields kept theirs.
  await showSection(page, 'body')
  expect(await blockAlignments(page.locator('#body-paragraph-0'))).toEqual([{ text: JUSTIFY_WORDS, align: 'justify' }])
  expect(await blockAlignments(addedEditor)).toEqual([{ text: NEW_PARAGRAPH, align: 'left' }])
  await showSection(page, 'opening')
  expect(await blockAlignments(openingEditor)).toEqual([
    { text: 'Opening centered line.', align: 'center' },
    { text: 'Opening right line.', align: 'right' },
  ])

  const save = page.getByRole('button', { name: en.common.save, exact: true }).first()
  await save.click()
  await expect(save).toBeDisabled()

  await page.reload()
  await showSection(page, 'opening')

  // The editor, after the reload.
  const stored = [...(await blockAlignments(page.locator('#opening-paragraph')))]
  await showSection(page, 'body')
  await expect(page.locator('#body-paragraph-0 p')).toHaveAttribute('style', 'text-align: justify;')
  stored.push(
    ...(await blockAlignments(page.locator('#body-paragraph-0'))),
    ...(await blockAlignments(page.locator('#body-paragraph-1'))),
  )
  await showSection(page, 'closing')
  stored.push(...(await blockAlignments(page.locator('#closing-paragraph'))))
  expect(stored).toEqual(EXPECTED.map(({ text, stored: align }) => ({ text, align })))

  // Both previews.
  const computed = EXPECTED.map(({ stored: align }) => (align === '' ? 'left' : align))
  const pane = page.getByTestId('cover-letter-preview-pane')
  await expect(pane.locator('[data-letter-part="closing"]')).not.toBeEmpty()
  expect(await renderedAlignments(pane.getByTestId('cover-letter-preview-page')), 'editor pane').toEqual(computed)
  await test.info().attach('editor-and-pane.png', { body: await page.screenshot(), contentType: 'image/png' })

  await page.getByRole('button', { name: en.coverLetters.editor.preview, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: en.coverLetters.editor.previewTitle, exact: true })
  await expect(dialog.locator('[data-letter-part="closing"]')).not.toBeEmpty()
  expect(await renderedAlignments(dialog.getByTestId('cover-letter-preview-page')), 'preview window').toEqual(computed)
  await test.info().attach('preview-window.png', {
    body: await dialog.getByTestId('cover-letter-preview-page').screenshot(),
    contentType: 'image/png',
  })
  await page.keyboard.press('Escape')

  // The PDF.
  const pdfResponse = await page.request.post(`/api/cover-letters/${letterId}/download-pdf`, {
    data: { locale: 'en' },
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  const pdf = await pdfResponse.body()
  await test.info().attach('aligned-letter.pdf', { body: pdf, contentType: 'application/pdf' })
  const pages = await readPdfTextItems(pdf)
  expect(pages, 'a one-page letter').toHaveLength(1)
  const lines = pdfLines(pages[0])
  const report = (line: PdfLine) => `${line.text.slice(0, 30)}: ${line.left.toFixed(2)}–${line.right.toFixed(2)} pt`
  test.info().annotations.push({
    type: 'text column',
    description: `${COLUMN_LEFT_PT.toFixed(2)}–${COLUMN_RIGHT_PT.toFixed(2)} pt`,
  })

  for (const text of ['Opening centered line.', 'Closing first selected.', 'Closing second selected.']) {
    const line = lineWith(lines, text)
    test.info().annotations.push({ type: 'centered', description: report(line) })
    expect(Math.abs((line.left + line.right) / 2 - COLUMN_CENTER_PT), `${text} centered`).toBeLessThanOrEqual(EDGE_PT)
    expect(line.left - COLUMN_LEFT_PT, `${text} not at the left edge`).toBeGreaterThan(50)
  }

  const rightLine = lineWith(lines, 'Opening right line.')
  test.info().annotations.push({ type: 'right', description: report(rightLine) })
  expect(Math.abs(rightLine.right - COLUMN_RIGHT_PT), 'flush right').toBeLessThanOrEqual(EDGE_PT)
  expect(rightLine.left - COLUMN_LEFT_PT, 'not at the left edge').toBeGreaterThan(100)

  for (const text of [NEW_PARAGRAPH, 'Closing untouched line.']) {
    const line = lineWith(lines, text)
    test.info().annotations.push({ type: 'left', description: report(line) })
    expect(Math.abs(line.left - COLUMN_LEFT_PT), `${text} flush left`).toBeLessThanOrEqual(EDGE_PT)
  }

  const justified = lines.filter((line) => /\bju\d\d/.test(line.text))
  expect(justified.length, 'the justified paragraph wraps').toBeGreaterThanOrEqual(3)
  justified.forEach((line, index) => {
    test.info().annotations.push({ type: `justified line ${index + 1}`, description: report(line) })
    expect(Math.abs(line.left - COLUMN_LEFT_PT), `justified line ${index + 1} flush left`).toBeLessThanOrEqual(EDGE_PT)
    if (index < justified.length - 1) {
      expect(Math.abs(line.right - COLUMN_RIGHT_PT), `justified line ${index + 1} full width`).toBeLessThanOrEqual(EDGE_PT)
    } else {
      expect(COLUMN_RIGHT_PT - line.right, 'the last justified line is not stretched').toBeGreaterThan(20)
    }
  })

  // The Word file.
  const docxResponse = await page.request.post(`/api/cover-letters/${letterId}/download-docx`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  const docx = await docxResponse.body()
  await test.info().attach('aligned-letter.docx', {
    body: docx,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const xml = await JSZip.loadAsync(docx).then((zip) => zip.file('word/document.xml')!.async('string'))
  const wordParagraphs = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(([, paragraph]) => ({
    text: [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(''),
    jc: /<w:jc w:val="(\w+)"\/>/.exec(paragraph)?.[1],
  }))
  const WORD: Record<string, string> = { '': 'left', left: 'left', center: 'center', right: 'right', justify: 'both' }
  for (const { text, stored: align } of EXPECTED) {
    const paragraph = wordParagraphs.find((candidate) => candidate.text === text)
    expect(paragraph, `Word paragraph "${text.slice(0, 30)}"`).toBeDefined()
    expect(paragraph!.jc, `w:jc of "${text.slice(0, 30)}"`).toBe(WORD[align])
  }
})

for (const locale of ['fr', 'en', 'de', 'it'] as const) {
  test(`${locale}: the alignment buttons are named and titled in the interface language`, async ({ page, authedUser }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const letterId = await insertLetter(authedUser.id)
    await openEditor(page, letterId, locale)
    const labels = labelsOf(locale)
    for (const [section, editorId] of [
      ['opening', 'opening-paragraph'],
      ['body', 'body-paragraph-0'],
      ['closing', 'closing-paragraph'],
    ] as const) {
      await showSection(page, section, locale)
      const field = fieldOf(page, editorId)
      expect(await alignmentLabels(field), editorId).toEqual(labels.map((label) => ({ label, title: label })))
      await test.info().attach(`${locale}-${section}-toolbar.png`, { body: await field.screenshot(), contentType: 'image/png' })
    }
  })
}

for (const viewport of [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const) {
  test(`${viewport.width}px: the toolbar with its alignment buttons stays inside its field`, async ({ page, authedUser }) => {
    await page.setViewportSize(viewport)
    const letterId = await insertLetter(authedUser.id)
    await openEditor(page, letterId, 'fr')
    const field = fieldOf(page, 'opening-paragraph')
    await field.scrollIntoViewIfNeeded()
    const fieldBox = await rect(field)
    for (const label of labelsOf('fr')) {
      const button = alignButton(field, label)
      await expect(button).toBeVisible()
      const box = await rect(button)
      expect(box.left, `${label} inside the field`).toBeGreaterThanOrEqual(fieldBox.left - 0.5)
      expect(box.right, `${label} inside the field`).toBeLessThanOrEqual(fieldBox.right + 0.5)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBe(0)
    await test.info().attach(`fr-${viewport.width}-opening-toolbar.png`, {
      body: await field.screenshot(),
      contentType: 'image/png',
    })
  })
}

test('a CV rich-text field gets no new button: its key-achievements toolbar is unchanged', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // The key-achievements toolbar sits above the skills and project fields on
  // every template. The summary and experience fields showed it only under the
  // legacy Professional template, removed by swiss-templates-only-page-fidelity
  // US-001: on a Swiss template they edit with no toolbar at all, so they must
  // not have gained one, nor the cover letter's ribbon.
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')
  const t = en.resumes.editor.richTextToolbar
  for (const [section, editorId] of [
    ['summary', 'summary-editor'],
    ['experience', 'experience-description-0'],
  ] as const) {
    await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=${section}`)
    await expect(page.locator(`#${editorId}`)).toBeVisible()
    await expect(page.getByTestId('formatting-ribbon-alignment'), section).toHaveCount(0)
    for (const label of [LEFT, CENTER, RIGHT, JUSTIFY]) {
      await expect(page.getByRole('button', { name: label, exact: true }), `${section} ${label}`).toHaveCount(0)
    }
  }
  for (const [section, editorId, labels] of [
    ['skills', 'skill-content-0', [LEFT, CENTER, JUSTIFY, t.bulletList, t.dashList, t.numberedList, t.bold]],
    ['projects', 'project-description-0', [LEFT, CENTER, JUSTIFY, t.bulletList, t.dashList, t.numberedList, t.bold, t.italic]],
  ] as const) {
    await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=${section}`)
    await expect(page.locator(`#${editorId}`)).toBeVisible()
    await expect(page.getByTestId('formatting-ribbon-alignment'), section).toHaveCount(0)
    await expect(page.getByRole('button', { name: RIGHT, exact: true }), section).toHaveCount(0)
    // The toolbar keeps its three alignment buttons and gains no "right".
    const leftButton = page.getByRole('button', { name: LEFT, exact: true })
    await expect(leftButton, section).toHaveCount(1)
    const toolbarLabels = await leftButton
      .locator('xpath=..')
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
    expect(toolbarLabels, section).toEqual(labels)
  }
})
