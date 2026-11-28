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
 * An alignment button aligns the whole letter: every paragraph of the
 * opening, of every body paragraph and of the closing, wherever the cursor is
 * (cover-letter-top-toolbar, US-002; it replaced the per-paragraph alignment
 * of cover-letter-alignment-and-job-banner, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The click goes through the toolbar, the letter's state and the mounted
 * editor's re-sync; where a paragraph's lines land in the PDF is a layout
 * outcome of the server's headless print.
 *
 * WHAT IS ASSERTED
 *
 *   - The four buttons, in order, in the editor's one toolbar under the header.
 *   - With no field holding the cursor, then with it in the opening, in the
 *     closing, and from the keyboard: each alignment sets that `text-align` on
 *     every block of the opening, both body paragraphs (a list's items
 *     included) and the closing, read section by section in the editors and
 *     in the editor pane's preview. The opening's bare line is wrapped in a
 *     paragraph of its own; no text is lost or reordered.
 *   - The letter becomes unsaved; the alignment buttons are enabled with no
 *     target while the selection-based controls are not; none is pressed
 *     while the stored paragraphs differ, the shared one once they agree.
 *   - A body paragraph added after Justify, typed into, is justified.
 *   - After save: the stored HTML byte for byte (bold, italic, underline,
 *     font, size and the list unchanged), and after a reload both previews'
 *     computed alignment, the PDF's justified lines and the Word file's
 *     `w:jc` "both" for every paragraph.
 *   - Labels and tooltips from the dictionary in fr, en, de and it; the
 *     toolbar inside the viewport at every width the editor supports.
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
/** Glyph side bearings and rounding in the printed line. */
const EDGE_PT = 1.5

/** A paragraph long enough to wrap on several lines, of words of uneven length so justifying is visible. */
const JUSTIFY_WORDS = Array.from(
  { length: 70 },
  (_, index) => `ju${String(index + 1).padStart(2, '0')}${['', 'x', 'long', 'mediumish', 'ab'][index % 5]}`,
).join(' ')

/** Inline formatting an alignment must leave byte for byte as it is. */
const OPENING_RICH =
  'Opening with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, ' +
  '<span style="font-family: Georgia, serif;">font</span> and <span style="font-size: 18px;">size</span>.'
/** A paragraph, then a line with no block of its own. */
const OPENING = `<p>${OPENING_RICH}</p>Opening bare line.`
/** Two body paragraphs: a long one, and a list followed by a line already centered (the letter starts mixed). */
const BODY = [
  `<p>${JUSTIFY_WORDS}</p>`,
  '<ul><li>Body list item one.</li><li>Body list item two.</li></ul><p style="text-align: center;">Body centered line.</p>',
]
const CLOSING = '<p>Closing first line.</p><p>Closing second line.</p>'
const NEW_PARAGRAPH = 'New paragraph typed after justify.'
const PASTED_PARAGRAPH = 'New paragraph pasted after justify.'
/** Entered at once, as an IME or a dead key commits text, with no key press per character. */
const COMPOSED_PARAGRAPH = 'Déjà vu, composed after justify.'

/** Every paragraph of the letter, in order, by its text. */
const TEXTS = [
  'Opening with bold, italic, underline, font and size.',
  'Opening bare line.',
  JUSTIFY_WORDS,
  'Body list item one.',
  'Body list item two.',
  'Body centered line.',
  'Closing first line.',
  'Closing second line.',
]

async function insertLetter(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'Whole-letter alignment',
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
  await expect(page.locator(firstEditor)).not.toBeEmpty()
}

/** Opens the editor on the Recipient section: no field has had the cursor. */
async function openEditor(page: Page, letterId: string, locale: LocaleCode = 'en') {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  await expect(toolbarOf(page)).toBeVisible()
}

/** The editor's one formatting toolbar, under the header. */
const toolbarOf = (page: Page) => page.getByTestId('cover-letter-formatting-toolbar')
const alignButton = (toolbar: Locator, label: string) => toolbar.getByRole('button', { name: label, exact: true })

/** The alignment buttons' accessible names, in document order. */
async function alignmentLabels(toolbar: Locator) {
  const group = toolbar.getByTestId('formatting-ribbon-alignment')
  await expect(group).toBeVisible()
  return group
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => ({ label: button.getAttribute('aria-label'), title: button.getAttribute('title') })),
    )
}

/** `active` pressed and the three others not; `null`: none pressed. */
async function expectActive(toolbar: Locator, active: string | null) {
  for (const label of [LEFT, CENTER, RIGHT, JUSTIFY]) {
    await expect(alignButton(toolbar, label), `${label} pressed`).toHaveAttribute('aria-pressed', String(label === active))
  }
}

/** Each innermost block of an element: its text and its own `text-align`. */
const blockAlignments = (scope: Locator) =>
  scope.evaluate((root) =>
    Array.from(root.querySelectorAll('p, div, li'))
      .filter((element) => !element.querySelector('p, div, li') && element.textContent!.trim() !== '')
      .map((element) => ({ text: element.textContent!.trim(), align: (element as HTMLElement).style.textAlign })),
  )

/** Every block of the opening, the body paragraphs and the closing, read in their editors section by section. */
async function editorBlocks(page: Page, bodyCount: number) {
  await showSection(page, 'opening')
  const blocks = [...(await blockAlignments(page.locator('#opening-paragraph')))]
  await showSection(page, 'body')
  for (let index = 0; index < bodyCount; index++) {
    blocks.push(...(await blockAlignments(page.locator(`#body-paragraph-${index}`))))
  }
  await showSection(page, 'closing')
  blocks.push(...(await blockAlignments(page.locator('#closing-paragraph'))))
  return blocks
}

/** The computed alignment of the block holding each text, inside a rendered letter. */
const renderedAlignments = (scope: Locator, texts: readonly string[]) =>
  scope.evaluate(
    (root, wanted) =>
      wanted.map((text) => {
        const block = Array.from(root.querySelectorAll('p, div, li')).find(
          (element) => !element.querySelector('p, div, li') && element.textContent!.trim() === text,
        )
        if (!block) throw new Error(`No block "${text.slice(0, 30)}" in the letter`)
        return getComputedStyle(block).textAlign
      }),
    texts,
  )

const panePage = (page: Page) => page.getByTestId('cover-letter-preview-pane').getByTestId('cover-letter-preview-page')

/** Puts the caret inside the text of the editor's `index`-th block, as a click there does. */
async function clickInto(editor: Locator, index: number) {
  await editor.locator('p, div, li').nth(index).click()
}

/** Checks every paragraph of the letter carries `alignment`, in the editors and in the editor pane's preview. */
async function expectWholeLetter(page: Page, alignment: string, context: string, texts: readonly string[] = TEXTS) {
  await expect
    .poll(() => renderedAlignments(panePage(page), texts), `${context}: editor pane preview`)
    .toEqual(texts.map(() => alignment))
  expect(await editorBlocks(page, texts.includes(NEW_PARAGRAPH) ? 3 : 2), `${context}: editors`).toEqual(
    texts.map((text) => ({ text, align: alignment })),
  )
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

test('an alignment button aligns every paragraph of the letter, wherever the cursor is, through to the PDF and Word', async ({
  page,
  authedUser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  const header = page.getByTestId('cover-letter-editor-header')

  const ALL_FOUR = [LEFT, CENTER, RIGHT, JUSTIFY].map((label) => ({ label, title: label }))
  expect(await alignmentLabels(toolbar), 'toolbar: buttons').toEqual(ALL_FOUR)

  // The stored paragraphs differ (one is centered): no button is pressed. With
  // no field holding the cursor the alignment buttons are enabled, the
  // selection-based ones are not.
  await expect(page.getByTestId('cover-letter-preview-pane').locator('[data-letter-part="closing"]')).not.toBeEmpty()
  await expectActive(toolbar, null)
  for (const label of [LEFT, CENTER, RIGHT, JUSTIFY]) {
    await expect(alignButton(toolbar, label), `${label} enabled with no target`).toHaveAttribute('aria-disabled', 'false')
  }
  await expect(toolbar.getByRole('button', { name: en.resumes.editor.richTextToolbar.bold, exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(header.getByText(en.coverLetters.editor.unsavedChanges, { exact: true })).toHaveCount(0)

  // No target at all: Center.
  await alignButton(toolbar, CENTER).click()
  await expectActive(toolbar, CENTER)
  await expect(header.getByText(en.coverLetters.editor.unsavedChanges, { exact: true }), 'the letter is unsaved').toBeVisible()
  await expectWholeLetter(page, 'center', 'Center, no target')

  // The cursor in the opening: Left, written explicitly.
  await showSection(page, 'opening')
  await clickInto(page.locator('#opening-paragraph'), 0)
  await alignButton(toolbar, LEFT).click()
  await expectActive(toolbar, LEFT)
  await expectWholeLetter(page, 'left', 'Left, cursor in the opening')

  // From the keyboard, the cursor in body paragraph 2: Shift+Tab to Right, then Enter.
  await showSection(page, 'body')
  await clickInto(page.locator('#body-paragraph-1'), 2)
  const right = alignButton(toolbar, RIGHT)
  let steps = 0
  while (!(await right.evaluate((element) => element === document.activeElement))) {
    expect(++steps, 'the right button is reached by Shift+Tab').toBeLessThanOrEqual(60)
    await page.keyboard.press('Shift+Tab')
  }
  const focusLook = await right.evaluate((element) => ({
    focusVisible: element.matches(':focus-visible'),
    shadow: getComputedStyle(element).boxShadow,
  }))
  expect(focusLook.focusVisible).toBe(true)
  expect(focusLook.shadow, 'a visible focus ring').not.toBe('none')
  await page.keyboard.press('Enter')
  await expectActive(toolbar, RIGHT)
  await expectWholeLetter(page, 'right', 'Right, from the keyboard')

  // The cursor in the closing: Justify.
  await showSection(page, 'closing')
  await clickInto(page.locator('#closing-paragraph'), 1)
  await alignButton(toolbar, JUSTIFY).click()
  await expectActive(toolbar, JUSTIFY)
  await expectWholeLetter(page, 'justify', 'Justify, cursor in the closing')

  // Body paragraphs added now start justified, however their text is entered:
  // typed, pasted, or committed at once as an IME or a dead key does.
  await showSection(page, 'body')
  const addParagraph = page.getByRole('button', { name: en.coverLetters.editor.body.addParagraph, exact: true })
  await addParagraph.click()
  const added = page.locator('#body-paragraph-2')
  await expect(added, 'empty until typed into').toBeEmpty()
  // Focused and left with nothing entered, it stays empty and shows its placeholder.
  await added.click()
  await page.getByText(en.coverLetters.editor.body.hint, { exact: true }).click()
  await expect(added, 'still empty once left').toBeEmpty()
  await added.click()
  await page.keyboard.type(NEW_PARAGRAPH)
  expect(await blockAlignments(added)).toEqual([{ text: NEW_PARAGRAPH, align: 'justify' }])

  await addParagraph.click()
  const pasted = page.locator('#body-paragraph-3')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await pasted.click()
  await page.evaluate((text) => navigator.clipboard.writeText(text), PASTED_PARAGRAPH)
  await page.keyboard.press('Control+V')
  await expect(pasted).toHaveText(PASTED_PARAGRAPH)
  expect(await blockAlignments(pasted)).toEqual([{ text: PASTED_PARAGRAPH, align: 'justify' }])

  await addParagraph.click()
  const composed = page.locator('#body-paragraph-4')
  await composed.click()
  await page.keyboard.insertText(COMPOSED_PARAGRAPH)
  expect(await blockAlignments(composed)).toEqual([{ text: COMPOSED_PARAGRAPH, align: 'justify' }])

  await expectActive(toolbar, JUSTIFY)
  const addedTexts = [NEW_PARAGRAPH, PASTED_PARAGRAPH, COMPOSED_PARAGRAPH]
  const allTexts = [...TEXTS.slice(0, 6), ...addedTexts, ...TEXTS.slice(6)]

  const save = page.getByRole('button', { name: en.common.save, exact: true }).first()
  await save.click()
  await expect(save).toBeDisabled()

  // What is stored: the alignment on every block, the bare line wrapped, and
  // everything else byte for byte, inline formatting and the list included.
  const J = 'text-align: justify;'
  const { data: stored, error } = await admin()
    .from('cover_letters')
    .select('opening_paragraph, body_paragraphs, closing_paragraph')
    .eq('id', letterId)
    .single()
  expect(error, error?.message).toBeNull()
  expect(stored!.opening_paragraph).toBe(`<p style="${J}">${OPENING_RICH}</p><p style="${J}">Opening bare line.</p>`)
  const storedBody = stored!.body_paragraphs as string[]
  expect(storedBody.slice(0, 2)).toEqual([
    `<p style="${J}">${JUSTIFY_WORDS}</p>`,
    `<ul><li style="${J}">Body list item one.</li><li style="${J}">Body list item two.</li></ul><p style="${J}">Body centered line.</p>`,
  ])
  expect(storedBody).toHaveLength(5)
  for (const [index, text] of addedTexts.entries()) {
    expect(storedBody[index + 2], `added paragraph ${index + 1}`).toMatch(new RegExp(`^<p style="${J}">[^<]+</p>$`))
    expect(storedBody[index + 2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')).toBe(text)
  }
  expect(stored!.closing_paragraph).toBe(`<p style="${J}">Closing first line.</p><p style="${J}">Closing second line.</p>`)

  // Both previews, after a reload.
  await page.reload()
  await expect(page.getByTestId('cover-letter-preview-pane').locator('[data-letter-part="closing"]')).not.toBeEmpty()
  await expectActive(toolbar, JUSTIFY)
  expect(await renderedAlignments(panePage(page), allTexts), 'editor pane').toEqual(allTexts.map(() => 'justify'))
  await test.info().attach('editor-and-pane.png', { body: await page.screenshot(), contentType: 'image/png' })

  await page.getByRole('button', { name: en.coverLetters.editor.preview, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: en.coverLetters.editor.previewTitle, exact: true })
  await expect(dialog.locator('[data-letter-part="closing"]')).not.toBeEmpty()
  expect(await renderedAlignments(dialog.getByTestId('cover-letter-preview-page'), allTexts), 'preview window').toEqual(
    allTexts.map(() => 'justify'),
  )
  await test.info().attach('preview-window.png', {
    body: await dialog.getByTestId('cover-letter-preview-page').screenshot(),
    contentType: 'image/png',
  })
  await page.keyboard.press('Escape')

  // The PDF: the long paragraph's lines run full width but the last; a
  // one-line paragraph is a justified paragraph's last line, flush left.
  const pdfResponse = await page.request.post(`/api/cover-letters/${letterId}/download-pdf`, {
    data: { locale: 'en' },
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  const pdf = await pdfResponse.body()
  await test.info().attach('justified-letter.pdf', { body: pdf, contentType: 'application/pdf' })
  const pages = await readPdfTextItems(pdf)
  expect(pages, 'a one-page letter').toHaveLength(1)
  const lines = pdfLines(pages[0])
  const report = (line: PdfLine) => `${line.text.slice(0, 30)}: ${line.left.toFixed(2)}–${line.right.toFixed(2)} pt`
  test.info().annotations.push({
    type: 'text column',
    description: `${COLUMN_LEFT_PT.toFixed(2)}–${COLUMN_RIGHT_PT.toFixed(2)} pt`,
  })

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
  for (const text of ['Opening bare line.', 'Body centered line.', NEW_PARAGRAPH, 'Closing second line.']) {
    const line = lineWith(lines, text)
    test.info().annotations.push({ type: 'one-line paragraph', description: report(line) })
    expect(Math.abs(line.left - COLUMN_LEFT_PT), `${text} flush left`).toBeLessThanOrEqual(EDGE_PT)
  }

  // The Word file: every paragraph of the opening, body and closing is "both".
  const docxResponse = await page.request.post(`/api/cover-letters/${letterId}/download-docx`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  const docx = await docxResponse.body()
  await test.info().attach('justified-letter.docx', {
    body: docx,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const xml = await JSZip.loadAsync(docx).then((zip) => zip.file('word/document.xml')!.async('string'))
  const wordParagraphs = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(([, paragraph]) => ({
    text: [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(''),
    jc: /<w:jc w:val="(\w+)"\/>/.exec(paragraph)?.[1],
  }))
  for (const text of allTexts) {
    const paragraph = wordParagraphs.find((candidate) => candidate.text === text)
    expect(paragraph, `Word paragraph "${text.slice(0, 30)}"`).toBeDefined()
    expect(paragraph!.jc, `w:jc of "${text.slice(0, 30)}"`).toBe('both')
  }
})

test('a command that changed nothing in a field does not keep it from taking the whole-letter alignment', async ({
  page,
  authedUser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  await showSection(page, 'opening')
  const opening = page.locator('#opening-paragraph')
  const openingPart = panePage(page).locator('[data-letter-part="opening"]')
  const shownAlignments = () =>
    openingPart.evaluate((part) =>
      Array.from(part.querySelectorAll('p, div, li'))
        .filter((element) => !element.querySelector('p, div, li') && element.textContent!.trim() !== '')
        .map((element) => getComputedStyle(element).textAlign),
    )

  // Ctrl+B with no selection: the field's HTML stays the same.
  await clickInto(opening, 0)
  const before = await opening.innerHTML()
  await page.keyboard.press('Control+b')
  expect(await opening.innerHTML(), 'Ctrl+B changed nothing').toBe(before)

  await alignButton(toolbar, JUSTIFY).click()
  await expectActive(toolbar, JUSTIFY)
  expect((await blockAlignments(opening)).map((block) => block.align), 'the field shows the alignment').toEqual([
    'justify',
    'justify',
  ])

  // Typing in it reports the aligned HTML, so the letter keeps the alignment.
  await clickInto(opening, 0)
  await page.keyboard.type('Z')
  await expect(opening).toContainText('Z')
  expect((await blockAlignments(opening)).map((block) => block.align), 'the field, after typing').toEqual(['justify', 'justify'])
  await expect(openingPart, 'the preview has the typed text').toContainText('Z')
  expect(await shownAlignments(), 'the preview, after typing').toEqual(['justify', 'justify'])
  await expectActive(toolbar, JUSTIFY)
})

test('an alignment click keeps the caret where it was in the field', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  await showSection(page, 'body')
  const body = page.locator('#body-paragraph-0')
  /** The caret's offset in the field's text, or -1 when it is not in the field. */
  const caretOffset = () =>
    body.evaluate((editor) => {
      const selection = window.getSelection()!
      if (selection.rangeCount === 0) return -1
      const range = selection.getRangeAt(0)
      if (!editor.contains(range.startContainer)) return -1
      const before = document.createRange()
      before.setStart(editor, 0)
      before.setEnd(range.startContainer, range.startOffset)
      return before.toString().length
    })

  // A real click mid-text, on the paragraph's first line.
  const line = await rect(body.locator('p').first())
  await page.mouse.click(line.left + line.width * 0.4, line.top + 8)
  const offset = await caretOffset()
  expect(offset, 'the caret is mid-text').toBeGreaterThan(5)
  const text = (await body.textContent())!

  for (const label of [CENTER, JUSTIFY]) {
    await alignButton(toolbar, label).click()
    await expectActive(toolbar, label)
    await expect(body.locator('p').first()).toHaveAttribute('style', `text-align: ${label === CENTER ? 'center' : 'justify'};`)
    await expect.poll(caretOffset, `${label}: the caret did not move`).toBe(offset)
  }

  await page.keyboard.type('QQ')
  const after = (await body.textContent())!
  expect(after.slice(offset, offset + 2), 'typed where the caret was').toBe('QQ')
  expect(after.slice(0, offset) + after.slice(offset + 2), 'nothing else changed').toBe(text)
})

test('a new paragraph that has focus before anything is typed takes an alignment chosen meanwhile', async ({
  page,
  authedUser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)

  await alignButton(toolbar, JUSTIFY).click()
  await expectActive(toolbar, JUSTIFY)
  await showSection(page, 'body')
  await page.getByRole('button', { name: en.coverLetters.editor.body.addParagraph, exact: true }).click()
  const added = page.locator('#body-paragraph-2')
  await added.click()

  // The alignment buttons need no target; the focus stays in the new paragraph.
  await alignButton(toolbar, CENTER).click()
  await expectActive(toolbar, CENTER)
  await expect(added).toBeFocused()
  await page.keyboard.type(NEW_PARAGRAPH)
  expect(await blockAlignments(added)).toEqual([{ text: NEW_PARAGRAPH, align: 'center' }])
  await expectActive(toolbar, CENTER)

  const save = page.getByRole('button', { name: en.common.save, exact: true }).first()
  await save.click()
  await expect(save).toBeDisabled()
  const { data: stored, error } = await admin().from('cover_letters').select('body_paragraphs').eq('id', letterId).single()
  expect(error, error?.message).toBeNull()
  const body = stored!.body_paragraphs as string[]
  expect(body).toHaveLength(3)
  expect(body[2]).toMatch(/^<p style="text-align: center;">[^<]+<\/p>$/)
  expect(body[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')).toBe(NEW_PARAGRAPH)
})

test('with no text in the opening, the body or the closing, the alignment buttons are disabled', async ({
  page,
  authedUser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: authedUser.id,
      title: 'Empty letter',
      sender_name: 'Zoë Lovelace',
      greeting: 'Dear Hiring Manager,',
      sign_off: 'Sincerely,',
      opening_paragraph: '',
      body_paragraphs: [],
      closing_paragraph: '',
      annexes: '',
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  await openEditor(page, (data as { id: string }).id)
  const toolbar = toolbarOf(page)
  for (const label of [LEFT, CENTER, RIGHT, JUSTIFY]) {
    await expect(alignButton(toolbar, label), `${label}: nothing to align`).toHaveAttribute('aria-disabled', 'true')
  }
  await expectActive(toolbar, null)

  // Text typed into the opening enables them.
  await sectionNav(page, 'en').getByRole('button', { name: en.coverLetters.editor.sections.opening, exact: true }).click()
  await expect(page.locator('#opening-paragraph')).toBeVisible()
  await page.locator('#opening-paragraph').click()
  await page.keyboard.type('Now there is text.')
  for (const label of [LEFT, CENTER, RIGHT, JUSTIFY]) {
    await expect(alignButton(toolbar, label), `${label}: text to align`).toHaveAttribute('aria-disabled', 'false')
  }
  await expectActive(toolbar, LEFT)
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
      await page.locator(`#${editorId}`).click()
      const toolbar = toolbarOf(page)
      expect(await alignmentLabels(toolbar), editorId).toEqual(labels.map((label) => ({ label, title: label })))
      await test.info().attach(`${locale}-${section}-toolbar.png`, { body: await toolbar.screenshot(), contentType: 'image/png' })
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
  test(`${viewport.width}px: the toolbar with its alignment buttons stays inside the viewport`, async ({ page, authedUser }) => {
    await page.setViewportSize(viewport)
    const letterId = await insertLetter(authedUser.id)
    await openEditor(page, letterId, 'fr')
    const toolbar = toolbarOf(page)
    await expect(toolbar).toBeVisible()
    const toolbarBox = await rect(toolbar)
    expect(toolbarBox.left, 'toolbar inside the viewport').toBeGreaterThanOrEqual(-0.5)
    expect(toolbarBox.right, 'toolbar inside the viewport').toBeLessThanOrEqual(viewport.width + 0.5)
    // The toolbar is one row that scrolls sideways on a narrow screen
    // (cover-letter-top-toolbar, US-003): a button beyond its width is
    // reached by scrolling the row, and then lies inside it.
    const row = toolbar.getByRole('toolbar')
    for (const label of labelsOf('fr')) {
      const button = alignButton(toolbar, label)
      await button.scrollIntoViewIfNeeded()
      await expect(button).toBeVisible()
      const rowBox = await rect(row)
      const box = await rect(button)
      expect(box.left, `${label} inside the toolbar`).toBeGreaterThanOrEqual(rowBox.left - 0.5)
      expect(box.right, `${label} inside the toolbar`).toBeLessThanOrEqual(rowBox.right + 0.5)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBe(0)
    await test.info().attach(`fr-${viewport.width}-opening-toolbar.png`, {
      body: await toolbar.screenshot(),
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
