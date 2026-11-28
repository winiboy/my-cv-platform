import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { admin, insertLetter as insertLongLetter, rect } from './fixtures/cover-letter-preview'
import { seedFixtureResume } from './fixtures/resume'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/**
 * One text toolbar at the top of the cover letter editor formats the field
 * the cursor is in (cover-letter-top-toolbar, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * Which field a command lands in depends on focus and on the document's
 * selection: a toolbar button press and a native <select> both take them away
 * from the field, and the field must still be the one formatted, on the
 * selection made before. Only a real browser moves focus and selection.
 *
 * WHAT IS ASSERTED
 *
 *   - AC 1: at 1440×900 the toolbar is in the band under the header, left of
 *     the "Translate" label, below the title's save-status line.
 *   - AC 2: no formatting control inside the opening, either body paragraph
 *     or the closing; the page has one Bold button.
 *   - AC 3, 4, 5: bold, italic, underline, bullet list, numbered list, font
 *     and size, in the opening, body paragraph 2 and the closing, change the
 *     selected word of that field only. "Only" is read from the editor pane's
 *     preview, which renders every field at once: the other fields' rendered
 *     HTML is byte-identical before and after. Font and size are chosen after
 *     the select has taken focus and the page's selection has been removed.
 *   - AC 6, 7: the toolbar is visible and its selection-based controls are
 *     aria-disabled (never `disabled`, so every control stays in the Tab
 *     order) until a field has the cursor; the alignment buttons, which align
 *     the whole letter since US-002, are enabled while the letter has text; a
 *     toolbar control keeps the target; acting in another control clears it:
 *     a click on the greeting input, the section nav or another section,
 *     typing in the greeting, Enter on a paragraph's "Move up". Moving focus
 *     does not: Shift+Tab from the opening reaches the toolbar with its
 *     controls enabled, and Bold, pressed with Enter, bolds the opening's
 *     selection. Nor does a click on padding, on text that is no control or
 *     on the column's scrollbar region. A disabled control does nothing.
 *   - AC 8: Bold, Italic and Underline show the selection's state in the
 *     target field (class and aria-pressed), and not a selection elsewhere on
 *     the page.
 *   - AC 9: the CV editor's summary field is as on origin/main.
 */

const OPENING = '<p>obold oitalic ounderline ofont osize</p><p>obullet</p><p>onumbered</p>'
const BODY = [
  '<p>Body one stays untouched.</p>',
  '<p>bbold bitalic bunderline bfont bsize</p><p>bbullet</p><p>bnumbered</p>',
]
const CLOSING = '<p>cbold citalic cunderline cfont csize</p><p>cbullet</p><p>cnumbered</p>'

const t = en.resumes.editor.richTextToolbar
const editorDict = en.coverLetters.editor

async function insertLetter(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'Top toolbar',
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

type LetterSection = 'recipient' | 'opening' | 'body' | 'closing'

const sectionNav = (page: Page) =>
  page.locator('nav').filter({
    has: page.getByRole('button', { name: editorDict.sections.recipient, exact: true }),
  })

const sectionButton = (page: Page, section: LetterSection) =>
  sectionNav(page).getByRole('button', { name: editorDict.sections[section], exact: true })

async function showSection(page: Page, section: LetterSection) {
  await sectionButton(page, section).click()
  await expect(page.locator('div.overflow-y-auto.p-6').getByRole('heading', { level: 3, name: editorDict[section].title })).toBeVisible()
}

async function openEditor(page: Page, letterId: string) {
  await page.setViewportSize({ width: 1440, height: 900 })
  const response = await page.goto(`/en/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('cover-letter-editor-header')).toBeVisible()
}

const toolbarOf = (page: Page) => page.getByRole('toolbar', { name: editorDict.formattingToolbar, exact: true })

/** The toolbar's selection-based controls, by accessible name. */
function selectionControls(toolbar: Locator): Record<string, Locator> {
  const button = (name: string) => toolbar.getByRole('button', { name, exact: true })
  return {
    bold: button(t.bold),
    italic: button(t.italic),
    underline: button(t.underline),
    bulletList: button(t.bulletList),
    numberedList: button(t.numberedList),
    font: toolbar.getByRole('combobox', { name: t.font, exact: true }),
    fontSize: toolbar.getByRole('combobox', { name: t.fontSize, exact: true }),
  }
}

/**
 * The controls are disabled with aria-disabled, not `disabled`, so they stay
 * in the Tab order: the native attribute must never be there.
 */
async function expectControls(toolbar: Locator, state: 'enabled' | 'disabled', context: string) {
  await expect(toolbar, context).toBeVisible()
  for (const [name, control] of Object.entries(selectionControls(toolbar))) {
    await expect(control, `${context}: ${name}`).toHaveAttribute('aria-disabled', String(state === 'disabled'))
    await expect(control, `${context}: ${name} not natively disabled`).not.toHaveAttribute('disabled')
  }
}

/** Every control of the toolbar, by accessible name, in document (and Tab) order. */
const ALL_CONTROL_LABELS = [
  t.bold,
  t.italic,
  t.underline,
  t.bulletList,
  t.numberedList,
  t.alignLeft,
  t.alignCenter,
  t.alignRight,
  t.alignJustify,
  t.font,
  t.fontSize,
]

const activeLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)

/** Focuses the editor as a click does, then selects `word` in it. */
async function selectWord(editor: Locator, word: string) {
  await editor.click()
  await editor.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent!.indexOf(target)
      if (index < 0) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + target.length)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    throw new Error(`No "${target}" in #${element.id}`)
  }, word)
}

/** Whether `word`'s text is wrapped, whole, by an element matching `selector` inside the editor. */
const isWrapped = (editor: Locator, word: string, selector: string) =>
  editor.evaluate(
    (element, { target, css }) =>
      Array.from(element.querySelectorAll(css)).some((candidate) => candidate.textContent!.trim() === target),
    { target: word, css: selector },
  )

type PartKey = 'opening' | 'body0' | 'body1' | 'closing'

/** The rendered HTML of each field in the editor pane's preview, which shows every field at once. */
async function renderedParts(page: Page): Promise<Record<PartKey, string>> {
  const letter = page.getByTestId('cover-letter-preview-pane').getByTestId('cover-letter-preview-page')
  return letter.evaluate((root) => {
    const html = (selector: string, index = 0) => {
      const part = root.querySelectorAll(`[data-letter-part="${selector}"]`)[index]
      if (!part) throw new Error(`No ${selector} #${index} in the preview`)
      return part.innerHTML
    }
    return { opening: html('opening'), body0: html('body', 0), body1: html('body', 1), closing: html('closing') }
  })
}

interface Command {
  name: 'bold' | 'italic' | 'underline' | 'bulletList' | 'numberedList' | 'font' | 'fontSize'
  word: (prefix: string) => string
  /** What wraps the selected word once applied, in the editor. */
  wrapper: string
}

const COMMANDS: readonly Command[] = [
  { name: 'bold', word: (p) => `${p}bold`, wrapper: 'b, strong' },
  { name: 'italic', word: (p) => `${p}italic`, wrapper: 'i, em' },
  { name: 'underline', word: (p) => `${p}underline`, wrapper: 'u' },
  { name: 'font', word: (p) => `${p}font`, wrapper: 'span[style*="font-family: Georgia"]' },
  { name: 'fontSize', word: (p) => `${p}size`, wrapper: 'span[style*="font-size: 18px"]' },
  { name: 'bulletList', word: (p) => `${p}bullet`, wrapper: 'ul > li' },
  { name: 'numberedList', word: (p) => `${p}numbered`, wrapper: 'ol > li' },
]

const FIELDS: ReadonlyArray<{ section: LetterSection; editorId: string; part: PartKey; prefix: string }> = [
  { section: 'opening', editorId: 'opening-paragraph', part: 'opening', prefix: 'o' },
  { section: 'body', editorId: 'body-paragraph-1', part: 'body1', prefix: 'b' },
  { section: 'closing', editorId: 'closing-paragraph', part: 'closing', prefix: 'c' },
]

/** Applies a command from the top toolbar to the current selection. */
async function apply(page: Page, toolbar: Locator, command: Command) {
  const control = selectionControls(toolbar)[command.name]
  if (command.name === 'font' || command.name === 'fontSize') {
    // Opening a select takes focus. The page's selection is then removed too,
    // so the command can only reach the word through the field's own memory
    // of the selection made before.
    await control.focus()
    await expect(control).toBeFocused()
    await page.evaluate(() => window.getSelection()!.removeAllRanges())
    await control.selectOption(command.name === 'font' ? { label: 'Georgia' } : '18')
    return
  }
  await control.click()
}

test('the toolbar sits in the band under the header, left of Translate, below the save status', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)

  const header = page.getByTestId('cover-letter-editor-header')
  const toolbar = page.getByTestId('cover-letter-formatting-toolbar')
  const translateLabel = page.locator('#cover-letter-translate-label')
  await expect(toolbar).toBeVisible()
  await expect(translateLabel).toHaveText(editorDict.translate.label)
  await expect(toolbarOf(page)).toBeVisible()

  // One band holds both, under the header.
  expect(
    await toolbar.evaluate((element, labelId) => element.parentElement!.contains(document.getElementById(labelId)), 'cover-letter-translate-label'),
    'toolbar and Translate share the band',
  ).toBe(true)

  const statusLine = header.locator('input[type="text"] + p')
  const [box, label, status, headerBox] = await Promise.all([rect(toolbar), rect(translateLabel), rect(statusLine), rect(header)])
  expect(box.top, 'below the header').toBeGreaterThanOrEqual(headerBox.bottom - 0.5)
  expect(box.top, 'below the save-status line').toBeGreaterThanOrEqual(status.bottom)
  expect(box.right, 'left of the Translate label').toBeLessThanOrEqual(label.left)
  await test.info().attach('band-1440.png', { body: await page.screenshot(), contentType: 'image/png' })
})

test('390px: the toolbar is under the Édition / Aperçu switch, which does not move when Aperçu hides the toolbar', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  await page.setViewportSize({ width: 390, height: 844 })
  const response = await page.goto(`/en/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  const view = editorDict.view
  const toggle = page.getByRole('radiogroup', { name: view.label, exact: true })
  const toolbar = page.getByTestId('cover-letter-formatting-toolbar')
  await expect(toggle).toBeVisible()
  await expect(toolbar).toBeVisible()

  const inEdit = await rect(toggle)
  expect((await rect(toolbar)).top, 'the toolbar under the switch').toBeGreaterThanOrEqual(inEdit.bottom)
  await test.info().attach('390-edition.png', { body: await page.screenshot(), contentType: 'image/png' })

  await page.getByRole('radio', { name: view.preview, exact: true }).click()
  await expect(page.getByRole('radio', { name: view.preview, exact: true })).toBeChecked()
  await expect(toolbar, 'no toolbar in Aperçu').toBeHidden()
  const inPreview = await rect(toggle)
  expect(inPreview.top, 'the switch keeps its place').toBe(inEdit.top)
  await test.info().attach('390-apercu.png', { body: await page.screenshot(), contentType: 'image/png' })

  await page.getByRole('radio', { name: view.edit, exact: true }).click()
  await expect(toolbar).toBeVisible()
  expect((await rect(toggle)).top, 'the switch keeps its place back in Édition').toBe(inEdit.top)
})

test('the opening, every body paragraph and the closing have no toolbar of their own', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)

  for (const [section, editorIds] of [
    ['opening', ['opening-paragraph']],
    ['body', ['body-paragraph-0', 'body-paragraph-1']],
    ['closing', ['closing-paragraph']],
  ] as const) {
    await showSection(page, section)
    for (const editorId of editorIds) {
      const field = page.locator(`#${editorId}`).locator('xpath=..')
      await expect(page.locator(`#${editorId}`)).toBeVisible()
      await expect(field.locator('button, select, [role="toolbar"]'), editorId).toHaveCount(0)
    }
    await expect(page.getByRole('button', { name: t.bold, exact: true }), `${section}: one Bold button`).toHaveCount(1)
    await expect(page.getByRole('button', { name: t.alignJustify, exact: true }), `${section}: one Justify button`).toHaveCount(1)
    await expect(page.getByRole('combobox', { name: t.font, exact: true }), `${section}: one font select`).toHaveCount(1)
  }
})

test('each command formats the selection of the field holding the cursor, and no other field', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  await expect(page.getByTestId('cover-letter-preview-pane').locator('[data-letter-part="closing"]')).not.toBeEmpty()

  for (const field of FIELDS) {
    await showSection(page, field.section)
    const editor = page.locator(`#${field.editorId}`)
    await expect(editor).toContainText(`${field.prefix}bold`)

    for (const command of COMMANDS) {
      const word = command.word(field.prefix)
      const context = `${command.name} in ${field.editorId}`
      const before = await renderedParts(page)
      const body0Html = field.part === 'body1' ? await page.locator('#body-paragraph-0').innerHTML() : null

      await selectWord(editor, word)
      await apply(page, toolbar, command)

      await expect.poll(() => isWrapped(editor, word, command.wrapper), `${context}: the selected word`).toBe(true)
      await expect.poll(async () => (await renderedParts(page))[field.part], `${context}: shown in the preview`).not.toBe(
        before[field.part],
      )
      const after = await renderedParts(page)
      for (const other of ['opening', 'body0', 'body1', 'closing'] as const) {
        if (other !== field.part) expect(after[other], `${context}: ${other} unchanged`).toBe(before[other])
      }
      if (body0Html !== null) {
        expect(await page.locator('#body-paragraph-0').innerHTML(), `${context}: body paragraph 1's field unchanged`).toBe(body0Html)
      }
    }
  }
  await test.info().attach('formatted-1440.png', { body: await page.screenshot(), contentType: 'image/png' })
})

test('the toolbar is disabled until a field has the cursor, keeps it through its own controls, and loses it elsewhere', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  const form = page.locator('div.overflow-y-auto.p-6')

  // The Recipient section opens first: no rich-text field yet.
  await expect(form.getByRole('heading', { level: 3, name: editorDict.recipient.title })).toBeVisible()
  await expectControls(toolbar, 'disabled', 'recipient section')
  // The alignment buttons align the whole letter (US-002): they need no
  // target, only text in the letter, which this one has.
  for (const label of [t.alignLeft, t.alignCenter, t.alignRight, t.alignJustify]) {
    await expect(toolbar.getByRole('button', { name: label, exact: true }), `recipient section: ${label}`).toHaveAttribute(
      'aria-disabled',
      'false',
    )
  }
  await test.info().attach('disabled-1440.png', { body: await page.screenshot(), contentType: 'image/png' })

  // The greeting input is not a rich-text field.
  await showSection(page, 'opening')
  await expectControls(toolbar, 'disabled', 'opening section opened')
  const greeting = form.locator('input[type="text"]')
  await greeting.click()
  await expectControls(toolbar, 'disabled', 'greeting focused')

  // A field: the toolbar targets it, and keeps it through a button and a select.
  await page.locator('#opening-paragraph').click()
  await expectControls(toolbar, 'enabled', 'opening focused')
  await selectionControls(toolbar).bold.click()
  await expectControls(toolbar, 'enabled', 'after the Bold button')
  await selectionControls(toolbar).fontSize.focus()
  await expect(selectionControls(toolbar).fontSize).toBeFocused()
  await expectControls(toolbar, 'enabled', 'size select focused')

  // The greeting input clears it.
  await greeting.click()
  await expectControls(toolbar, 'disabled', 'greeting focused after the field')

  // So does the section nav, and another section.
  await page.locator('#opening-paragraph').click()
  await expectControls(toolbar, 'enabled', 'opening focused again')
  await showSection(page, 'body')
  await expectControls(toolbar, 'disabled', 'body section opened')
  await page.locator('#body-paragraph-1').click()
  await expectControls(toolbar, 'enabled', 'body paragraph 2 focused')
  await showSection(page, 'recipient')
  await expectControls(toolbar, 'disabled', 'recipient section opened')
})

test('Shift+Tab from a field reaches the toolbar with that field still its target', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  const controls = selectionControls(toolbar)
  await showSection(page, 'opening')
  const opening = page.locator('#opening-paragraph')
  const openingHtml = await opening.innerHTML()

  // Back through the greeting input and the section nav, by keyboard only:
  // passing them does not clear the target, as a click on them does.
  await selectWord(opening, 'obold')
  const inToolbar = () => toolbar.evaluate((element) => element.contains(document.activeElement))
  let steps = 0
  while (!(await inToolbar())) {
    expect(++steps, 'a toolbar control is reached by Shift+Tab').toBeLessThanOrEqual(40)
    await page.keyboard.press('Shift+Tab')
  }
  await expectControls(toolbar, 'enabled', 'toolbar reached by Shift+Tab')

  // On to Bold, within the toolbar, and press it.
  steps = 0
  while (!(await controls.bold.evaluate((element) => element === document.activeElement))) {
    expect(++steps, 'Bold is reached by Shift+Tab within the toolbar').toBeLessThanOrEqual(20)
    await page.keyboard.press('Shift+Tab')
  }
  await page.keyboard.press('Enter')
  await expect.poll(() => isWrapped(opening, 'obold', 'b, strong'), 'the opening selection is bold').toBe(true)
  expect(await opening.innerHTML(), 'the opening changed').not.toBe(openingHtml)
  expect(
    await opening.evaluate((element) => Array.from(element.querySelectorAll('b, strong')).map((bold) => bold.textContent)),
    'only the selected word',
  ).toEqual(['obold'])
})

test('typing in the greeting input reached by Shift+Tab clears the target: Bold then changes nothing', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  await showSection(page, 'opening')
  const opening = page.locator('#opening-paragraph')
  const openingHtml = await opening.innerHTML()

  await selectWord(opening, 'obold')
  await page.keyboard.press('Shift+Tab')
  const greeting = page.locator('div.overflow-y-auto.p-6').locator('input[type="text"]')
  await expect(greeting).toBeFocused()
  await expectControls(toolbar, 'enabled', 'greeting reached by Shift+Tab')

  await page.keyboard.type('x')
  await expectControls(toolbar, 'disabled', 'after typing in the greeting')
  // aria-disabled keeps the button clickable for the browser: the click must do nothing.
  await selectionControls(toolbar).bold.click({ force: true })
  expect(await opening.innerHTML(), 'the opening unchanged').toBe(openingHtml)
})

test('a click on blank space, padding or the scrollbar region keeps the target, and Bold still applies', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  const form = page.locator('div.overflow-y-auto.p-6')
  await showSection(page, 'body')
  const body0 = page.locator('#body-paragraph-0')
  const body1 = page.locator('#body-paragraph-1')
  const body0Html = await body0.innerHTML()

  await selectWord(body1, 'bbold')
  // The form column's padding, above the section heading.
  await form.click({ position: { x: 8, y: 8 } })
  await expectControls(toolbar, 'enabled', 'after a click on the padding')
  // Text that is no control: the section hint. It moves the page's selection out of the field.
  await form.getByText(editorDict.body.hint, { exact: true }).click()
  await expectControls(toolbar, 'enabled', 'after a click on the hint')
  // The column's right edge, where its scrollbar sits when it scrolls: pressed and dragged.
  const box = await rect(form)
  await page.mouse.move(box.right - 4, box.top + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.right - 4, box.top + box.height / 2 + 30)
  await page.mouse.up()
  await expectControls(toolbar, 'enabled', 'after a drag on the scrollbar region')

  await selectionControls(toolbar).bold.click()
  await expect.poll(() => isWrapped(body1, 'bbold', 'b, strong'), 'body paragraph 2: its selection bold').toBe(true)
  expect(await body0.innerHTML(), 'body paragraph 1 unchanged').toBe(body0Html)
})

test('moving a paragraph with the keyboard clears the target', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  await showSection(page, 'body')

  await page.locator('#body-paragraph-0').click()
  await expectControls(toolbar, 'enabled', 'body paragraph 1 focused')
  // Tab leaves the field for paragraph 2's "Move up" button: moving focus keeps the target.
  await page.keyboard.press('Tab')
  const moveUp = page.getByRole('button', { name: editorDict.body.moveUp, exact: true }).nth(1)
  await expect(moveUp).toBeFocused()
  await expectControls(toolbar, 'enabled', 'Move up focused by Tab')

  // Acting on it does clear it.
  await page.keyboard.press('Enter')
  await expect(page.locator('#body-paragraph-0')).toContainText('bbold')
  await expectControls(toolbar, 'disabled', 'after moving paragraph 2 up')
})

test('with no target, every toolbar control is reached by Tab; the selection-based ones are aria-disabled', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  await expectControls(toolbar, 'disabled', 'recipient section')

  // From the letter's title, forward through the header to the toolbar.
  await page.getByTestId('cover-letter-editor-header').locator('input[type="text"]').click()
  let steps = 0
  while ((await activeLabel(page)) !== t.bold) {
    expect(++steps, 'Bold is reached by Tab').toBeLessThanOrEqual(30)
    await page.keyboard.press('Tab')
  }

  const reached: string[] = []
  for (let index = 0; index < ALL_CONTROL_LABELS.length; index++) {
    const label = await activeLabel(page)
    reached.push(label ?? '')
    // The alignment buttons align the whole letter (US-002): enabled with no target
    const isAlignment = [t.alignLeft, t.alignCenter, t.alignRight, t.alignJustify].includes(label ?? '')
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-disabled')),
      `${label}: aria-disabled`,
    ).toBe(String(!isAlignment))
    if (label === t.fontSize) {
      // A value change on a disabled select applies nothing and is not kept.
      const size = selectionControls(toolbar).fontSize
      const before = await size.inputValue()
      await page.keyboard.press('ArrowDown')
      await expect(size, 'the size select keeps its value').toHaveValue(before)
    }
    if (index < ALL_CONTROL_LABELS.length - 1) await page.keyboard.press('Tab')
  }
  expect(reached, 'every control, in order').toEqual(ALL_CONTROL_LABELS)
})

test('Bold, Italic and Underline show the state of the selection in the target field only', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)
  const toolbar = toolbarOf(page)
  const controls = selectionControls(toolbar)
  const ACTIVE = /\bbg-teal-100\b/

  await showSection(page, 'opening')
  const opening = page.locator('#opening-paragraph')
  for (const name of ['bold', 'italic', 'underline'] as const) {
    await selectWord(opening, `o${name}`)
    await controls[name].click()
    await expect.poll(() => isWrapped(opening, `o${name}`, { bold: 'b, strong', italic: 'i, em', underline: 'u' }[name])).toBe(true)
    await expect(controls[name], `${name} pressed once applied`).toHaveAttribute('aria-pressed', 'true')
  }

  for (const name of ['bold', 'italic', 'underline'] as const) {
    await selectWord(opening, `o${name}`)
    for (const other of ['bold', 'italic', 'underline'] as const) {
      if (other === name) await expect(controls[other], `o${name}: ${other} active`).toHaveClass(ACTIVE)
      else await expect(controls[other], `o${name}: ${other} not active`).not.toHaveClass(ACTIVE)
      await expect(controls[other], `o${name}: ${other} pressed`).toHaveAttribute('aria-pressed', String(other === name))
    }
  }
  await selectWord(opening, 'ofont')
  for (const name of ['bold', 'italic', 'underline'] as const) {
    await expect(controls[name], `plain word: ${name} not active`).not.toHaveClass(ACTIVE)
    await expect(controls[name], `plain word: ${name} not pressed`).toHaveAttribute('aria-pressed', 'false')
  }

  // A bold word selected outside the target field (in the preview) is not the toolbar's state.
  await selectWord(opening, 'obold')
  await expect(controls.bold).toHaveClass(ACTIVE)
  await page
    .getByTestId('cover-letter-preview-pane')
    .locator('[data-letter-part="opening"] strong, [data-letter-part="opening"] b')
    .first()
    .evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    })
  await expect(controls.bold, 'a selection outside the field').not.toHaveClass(ACTIVE)
  await expect(controls.bold, 'a selection outside the field: not pressed').toHaveAttribute('aria-pressed', 'false')
})

test("the CV editor's summary field is unchanged: no shared toolbar, and no ribbon of its own, as on origin/main", async ({
  page,
  authedUser,
}) => {
  // On origin/main the summary editor is rendered with showRibbon={false} and,
  // on the Swiss templates (the only ones), has no toolbar above it at all
  // (see the CV test in cover-letter-paragraph-alignment.spec.ts). Unchanged
  // means it still has none, and the cover letter's toolbar is not here.
  await page.setViewportSize({ width: 1440, height: 900 })
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')
  await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=summary`)
  const summary = page.locator('#summary-editor')
  await expect(summary).toBeVisible()
  await expect(summary).toHaveClass(/\brounded-lg\b/)
  await expect(summary.locator('xpath=..').locator('button, select')).toHaveCount(0)
  await expect(page.getByTestId('cover-letter-formatting-toolbar')).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: editorDict.formattingToolbar, exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: t.bold, exact: true })).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// US-003: the toolbar stays reachable while scrolling and on a phone.
//
//   - AC 1: at 1440×900 the form column scrolls on its own; the band is
//     outside it and keeps its place.
//   - AC 2: below xl <main> scrolls the whole editor; the band is sticky in
//     it, one row under the header, still in view at the form's bottom.
//   - AC 3: at 390 and 320 the row does not wrap: it scrolls sideways on its
//     own, Tab brings a control beyond the width into view, and the page
//     has no horizontal scroll.
//   - AC 4: each of the 11 controls is a Tab stop, shows a teal focus ring
//     and is named in fr, en, de and it.
//   - AC 5: with touch emulation, a tap on Bold, Italic or the font select
//     formats the selection made before it.
// ---------------------------------------------------------------------------

const LOCALES = { en, fr, de, it } as const

/** Opens the editor at the viewport already set (openEditor sets 1440×900). */
async function openAtViewport(page: Page, letterId: string) {
  const response = await page.goto(`/en/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('cover-letter-editor-header')).toBeVisible()
}

/** The toolbar's role="toolbar" row and its controls' boxes. */
async function rowGeometry(page: Page) {
  return toolbarOf(page).evaluate((row) => {
    const controls = Array.from(row.querySelectorAll('button, select')).map((control) => {
      const { top, bottom, height } = control.getBoundingClientRect()
      return { tag: control.tagName.toLowerCase(), top, bottom, height, center: (top + bottom) / 2 }
    })
    const groups = Array.from(row.children) as HTMLElement[]
    return {
      overflowX: getComputedStyle(row).overflowX,
      scrollWidth: row.scrollWidth,
      clientWidth: row.clientWidth,
      controls,
      lastGroupBorder: getComputedStyle(groups[groups.length - 1]).borderRightWidth,
    }
  })
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('main')!
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      main: main.scrollWidth - main.clientWidth,
    }
  })

test('1440px: the toolbar keeps its place while the form column scrolls to its bottom', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const letterId = await insertLongLetter(authedUser.id)
  await openAtViewport(page, letterId)
  await showSection(page, 'body')
  const toolbar = page.getByTestId('cover-letter-formatting-toolbar')
  const form = page.locator('div.overflow-y-auto.p-6')

  const before = await rect(toolbar)
  const scrolled = await form.evaluate((column) => {
    column.scrollTop = column.scrollHeight
    return { top: column.scrollTop, max: column.scrollHeight - column.clientHeight }
  })
  expect(scrolled.max, 'the form column has something to scroll').toBeGreaterThan(200)
  expect(scrolled.top, 'scrolled to its bottom').toBeGreaterThanOrEqual(scrolled.max - 1)
  const after = await rect(toolbar)
  expect(after, 'the same position').toEqual(before)
  expect(after.top).toBeGreaterThanOrEqual(0)
  expect(after.bottom).toBeLessThanOrEqual(900)
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const) {
  test(`${viewport.width}px: one row under the header, in view at the form's bottom, scrolling sideways on its own`, async ({
    page,
    authedUser,
  }) => {
    await page.setViewportSize(viewport)
    const letterId = await insertLongLetter(authedUser.id)
    await openAtViewport(page, letterId)
    await showSection(page, 'body')
    const band = page.getByTestId('cover-letter-formatting-toolbar')
    const header = page.getByTestId('cover-letter-editor-header')
    const toggle = page.getByRole('radiogroup', { name: editorDict.view.label, exact: true })

    // One row, under the header and the Édition / Aperçu switch.
    const geometry = await rowGeometry(page)
    expect(geometry.controls).toHaveLength(11)
    const centers = geometry.controls.map((control) => control.center)
    expect(Math.max(...centers) - Math.min(...centers), 'one row').toBeLessThanOrEqual(1)
    // A mouse keeps 32px buttons; touch screens get 44px (the touch test below)
    for (const control of geometry.controls.filter((control) => control.tag === 'button')) {
      expect(control.height, 'buttons').toBeGreaterThanOrEqual(32)
    }
    expect(geometry.lastGroupBorder, 'no divider after the last group').toBe('0px')
    const bandBox = await rect(band)
    expect(bandBox.top).toBeGreaterThanOrEqual((await rect(header)).bottom - 0.5)
    expect(bandBox.top).toBeGreaterThanOrEqual((await rect(toggle)).bottom - 0.5)

    // Wider than the screen: the row scrolls, the page does not.
    expect(geometry.overflowX).toBe('auto')
    expect(geometry.scrollWidth, 'more controls than fit').toBeGreaterThan(geometry.clientWidth)
    expect(await pageOverflow(page), 'no horizontal page scroll').toEqual({ page: 0, main: 0 })

    // Tab reaches the last control and brings it into the row's view.
    await selectionControls(toolbarOf(page)).bold.focus()
    for (let step = 0; step < 10; step++) await page.keyboard.press('Tab')
    const size = selectionControls(toolbarOf(page)).fontSize
    await expect(size).toBeFocused()
    const rowBox = await rect(toolbarOf(page))
    const sizeBox = await rect(size)
    expect(sizeBox.left, 'the focused control is in view').toBeGreaterThanOrEqual(rowBox.left - 0.5)
    expect(sizeBox.right, 'the focused control is in view').toBeLessThanOrEqual(rowBox.right + 0.5)
    expect(await toolbarOf(page).evaluate((row) => row.scrollLeft), 'the row scrolled').toBeGreaterThan(0)
    expect(await pageOverflow(page), 'still no horizontal page scroll').toEqual({ page: 0, main: 0 })

    // Scrolled to the form's bottom, the band is still in view, at the top.
    const scrolled = await page.evaluate(() => {
      const main = document.querySelector('main')!
      main.scrollTop = main.scrollHeight
      return { top: main.scrollTop, max: main.scrollHeight - main.clientHeight }
    })
    expect(scrolled.max, '<main> has something to scroll').toBeGreaterThan(200)
    expect(scrolled.top).toBeGreaterThanOrEqual(scrolled.max - 1)
    await expect(band).toBeInViewport()
    const stuck = await rect(band.locator('xpath=..'))
    const main = await rect(page.locator('main'))
    expect(Math.abs(stuck.top - main.top), 'stuck to the top of the scrolling area').toBeLessThanOrEqual(1)
    expect(stuck.bottom).toBeLessThanOrEqual(viewport.height)
    // Opaque: what is under it does not show through.
    expect(
      await band.evaluate((element) => getComputedStyle(element.parentElement!).backgroundColor),
      'an opaque background',
    ).toMatch(/^rgb\(/)
    await test.info().attach(`${viewport.width}-scrolled.png`, { body: await page.screenshot(), contentType: 'image/png' })
  })
}

for (const [locale, dict] of Object.entries(LOCALES) as Array<[keyof typeof LOCALES, (typeof LOCALES)[keyof typeof LOCALES]]>) {
  test(`${locale}: every toolbar control is a Tab stop with an accessible name and a visible teal focus ring`, async ({
    page,
    authedUser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const letterId = await insertLetter(authedUser.id)
    const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
    expect(response?.status()).toBe(200)
    const labels = dict.resumes.editor.richTextToolbar
    const toolbar = page.getByRole('toolbar', { name: dict.coverLetters.editor.formattingToolbar, exact: true })
    await expect(toolbar).toBeVisible()
    const names = [
      labels.bold,
      labels.italic,
      labels.underline,
      labels.bulletList,
      labels.numberedList,
      labels.alignLeft,
      labels.alignCenter,
      labels.alignRight,
      labels.alignJustify,
      labels.font,
      labels.fontSize,
    ]
    expect(new Set(names).size, 'eleven distinct names').toBe(11)

    // From the letter's title, Tab forward to the toolbar, then through it.
    await page.getByTestId('cover-letter-editor-header').locator('input[type="text"]').click()
    let steps = 0
    while ((await activeLabel(page)) !== labels.bold) {
      expect(++steps, 'Bold is reached by Tab').toBeLessThanOrEqual(30)
      await page.keyboard.press('Tab')
    }
    for (const [index, name] of names.entries()) {
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement
        const style = getComputedStyle(element)
        // The theme's teal-500, as the browser resolves it
        const probe = document.createElement('span')
        probe.style.color = 'var(--color-teal-500)'
        document.body.appendChild(probe)
        const teal = getComputedStyle(probe).color
        probe.remove()
        return {
          teal,
          name: element.getAttribute('aria-label'),
          inToolbar: !!element.closest('[role="toolbar"]'),
          focusVisible: element.matches(':focus-visible'),
          opacity: style.opacity,
          ring: style.boxShadow,
          outlineStyle: style.outlineStyle,
        }
      })
      expect(focused.name, `control ${index + 1}`).toBe(name)
      expect(focused.inToolbar).toBe(true)
      expect(focused.focusVisible, `${name}: focus-visible`).toBe(true)
      // aria-disabled here (no field has the cursor): only the icon or text is dimmed, not the ring
      expect(focused.opacity, `${name}: the control, and its ring, at full opacity`).toBe('1')
      expect(focused.ring, `${name}: a 2px teal ring`).toContain(`${focused.teal} 0px 0px 0px 2px`)
      // outline-hidden: no outline beside the ring here; forced-colors mode,
      // which removes the ring, gets a real one (see the forced-colors test)
      expect(focused.outlineStyle, `${name}: no outline beside the ring`).toBe('none')
      await expect(
        toolbar.getByRole(index >= 9 ? 'combobox' : 'button', { name, exact: true }),
        `${name}: found by its accessible name`,
      ).toHaveCount(1)
      if (index < names.length - 1) await page.keyboard.press('Tab')
    }
    await test.info().attach(`${locale}-focus.png`, { body: await toolbar.screenshot(), contentType: 'image/png' })
  })
}

test('in forced-colors mode every toolbar control still shows its focus, as an outline', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ forcedColors: 'active' })
  const letterId = await insertLetter(authedUser.id)
  await openAtViewport(page, letterId)
  const labels = en.resumes.editor.richTextToolbar

  // The teal ring is a box-shadow, which forced-colors mode removes: the
  // outline, transparent otherwise, is what shows focus there.
  await page.getByTestId('cover-letter-editor-header').locator('input[type="text"]').click()
  let steps = 0
  while ((await activeLabel(page)) !== labels.bold) {
    expect(++steps, 'Bold is reached by Tab').toBeLessThanOrEqual(30)
    await page.keyboard.press('Tab')
  }
  for (let index = 0; index < ALL_CONTROL_LABELS.length; index++) {
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement
      const style = getComputedStyle(element)
      return {
        name: element.getAttribute('aria-label'),
        forced: window.matchMedia('(forced-colors: active)').matches,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      }
    })
    expect(focused.forced, 'forced colors are emulated').toBe(true)
    expect(focused.name).toBe(ALL_CONTROL_LABELS[index])
    expect(focused.outlineStyle, `${focused.name}: an outline`).not.toBe('none')
    expect(focused.outlineWidth, `${focused.name}: an outline`).not.toBe('0px')
    if (index < ALL_CONTROL_LABELS.length - 1) await page.keyboard.press('Tab')
  }
  await test.info().attach('forced-colors-focus.png', { body: await toolbarOf(page).screenshot(), contentType: 'image/png' })
})

test('390px: a control Shift+Tab reaches while <main> is scrolled is not hidden under the sticky band', async ({
  page,
  authedUser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const letterId = await insertLongLetter(authedUser.id)
  await openAtViewport(page, letterId)
  await showSection(page, 'body')
  const band = page.locator('[data-sticky-formatting-band]')

  // From the last body paragraph, at the bottom of the form, back upwards:
  // each control focused is scrolled to, and must stay clear of the band.
  await page.evaluate(() => {
    const main = document.querySelector('main')!
    main.scrollTop = main.scrollHeight
  })
  const last = page.locator('div[contenteditable][id^="body-paragraph-"]').last()
  await last.click()
  for (let step = 1; step <= 8; step++) {
    await page.keyboard.press('Shift+Tab')
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement
      const { top, bottom } = element.getBoundingClientRect()
      return { id: element.id || element.getAttribute('title') || element.tagName, top, bottom }
    })
    const bandBox = await rect(band)
    expect(focused.top, `step ${step} (${focused.id}): below the band`).toBeGreaterThanOrEqual(bandBox.bottom - 0.5)
  }
  expect(
    await page.evaluate(() => document.querySelector('main')!.scrollTop),
    '<main> was scrolled up to reach them',
  ).toBeGreaterThan(0)
})

test('1024px with a mouse: the row fits, with 32px controls and no sideways scroll', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  const letterId = await insertLetter(authedUser.id)
  await openAtViewport(page, letterId)
  expect(await page.evaluate(() => window.matchMedia('(pointer: fine)').matches), 'a fine pointer').toBe(true)
  const geometry = await rowGeometry(page)
  test.info().annotations.push({ type: 'row at 1024', description: `${geometry.scrollWidth}/${geometry.clientWidth}px` })
  expect(geometry.scrollWidth, 'the row fits: nothing to scroll').toBeLessThanOrEqual(geometry.clientWidth)
  for (const control of geometry.controls) {
    if (control.tag === 'button') expect(control.height, '32px buttons').toBeGreaterThanOrEqual(32)
    expect(control.height, 'not the touch size').toBeLessThan(44)
  }
  expect(await pageOverflow(page)).toEqual({ page: 0, main: 0 })
})

test.describe('on a phone, with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the row has 44px tap targets and no visible scrollbar, and still scrolls sideways', async ({ page, authedUser }) => {
    const letterId = await insertLetter(authedUser.id)
    await openAtViewport(page, letterId)
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches), 'a coarse pointer').toBe(true)
    const geometry = await rowGeometry(page)
    const centers = geometry.controls.map((control) => control.center)
    expect(Math.max(...centers) - Math.min(...centers), 'one row').toBeLessThanOrEqual(1)
    for (const control of geometry.controls) expect(control.height, '44px tap targets').toBeGreaterThanOrEqual(44)
    expect(geometry.scrollWidth, 'more controls than fit').toBeGreaterThan(geometry.clientWidth)
    expect(await toolbarOf(page).evaluate((row) => getComputedStyle(row).scrollbarWidth), 'no scrollbar').toBe('none')
    expect(await pageOverflow(page)).toEqual({ page: 0, main: 0 })
    await test.info().attach('390-touch-row.png', { body: await toolbarOf(page).screenshot(), contentType: 'image/png' })
  })

  test('a tap on Bold, Italic or the font select formats the selection made before it', async ({ page, authedUser }) => {
    const letterId = await insertLetter(authedUser.id)
    await openAtViewport(page, letterId)
    const toolbar = toolbarOf(page)
    const controls = selectionControls(toolbar)
    await sectionButton(page, 'opening').tap()
    const opening = page.locator('#opening-paragraph')
    await expect(opening).toContainText('obold')

    /** Taps into the field, as a finger does, then selects `word` in it. */
    const selectByTouch = async (word: string) => {
      await opening.tap()
      await opening.evaluate((element, target) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = node.textContent!.indexOf(target)
          if (index < 0) continue
          const range = document.createRange()
          range.setStart(node, index)
          range.setEnd(node, index + target.length)
          window.getSelection()!.removeAllRanges()
          window.getSelection()!.addRange(range)
          return
        }
        throw new Error(`No "${target}"`)
      }, word)
    }

    /** The page's selection, when it is in the opening: the tap did not dismiss it. */
    const selectionInField = () =>
      opening.evaluate((element) => {
        const selection = window.getSelection()!
        return selection.rangeCount > 0 && element.contains(selection.getRangeAt(0).startContainer)
          ? selection.toString()
          : null
      })

    await selectByTouch('obold')
    await controls.bold.tap()
    expect(await selectionInField(), 'the selection is still in the field after the tap').toBe('obold')
    await expect.poll(() => isWrapped(opening, 'obold', 'b, strong'), 'Bold tapped').toBe(true)

    await selectByTouch('oitalic')
    await controls.italic.tap()
    expect(await selectionInField(), 'the selection is still in the field after the tap').toBe('oitalic')
    await expect.poll(() => isWrapped(opening, 'oitalic', 'i, em'), 'Italic tapped').toBe(true)

    await selectByTouch('ofont')
    await controls.font.tap()
    await controls.font.selectOption({ label: 'Georgia' })
    await expect.poll(() => isWrapped(opening, 'ofont', 'span[style*="font-family: Georgia"]'), 'font chosen').toBe(true)

    // Nothing else in the field changed.
    expect(await isWrapped(opening, 'ounderline', 'b, strong, i, em, u, span')).toBe(false)
  })
})
