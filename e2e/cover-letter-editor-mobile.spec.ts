import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { admin, insertLetter, rect, SENDER_NAME, type Box } from './fixtures/cover-letter-preview'
import en from '../src/locales/en/common.json'
import de from '../src/locales/de/common.json'

/**
 * Below 1280px the cover letter editor shows one view at a time, chosen with
 * an Édition / Aperçu toggle (cover-letter-editor-mobile, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * Everything at stake is layout and interaction: which column is rendered at
 * a given width, whether a field lies inside the viewport, whether the page
 * scrolls sideways, and what keyboard and pointer do to the toggle. None of
 * that exists outside a rendered page.
 *
 * WHAT IS ASSERTED, at 320, 375, 768 and 1024, in en and de
 *
 *   - The toggle is a radio group named in the locale, under the header; it
 *     opens on Édition, each option is at least 44px tall, the arrow keys
 *     move the selection with a visible focus ring, and the selected option
 *     is exposed as checked.
 *   - Édition: the section nav and the form at the editor's full width, no
 *     preview rendered; for every section, every control and text block of
 *     the form lies inside the viewport once scrolled to, and nothing in the
 *     form is wider than it.
 *   - Aperçu: only the letter, at the editor's full width, fitted to it (at
 *     most 85%, as the pane always was); the zoom controls inside the
 *     viewport; the letter's last line reachable by scrolling.
 *   - Switching keeps an unsaved greeting and paragraph, the unsaved-changes
 *     indicator and the selected section, shows the unsaved greeting in the
 *     letter, and never saves.
 *   - The section nav is the resume editor's tab strip (US-002): one row
 *     above the form that scrolls sideways (always at 320 and 375), seven
 *     tabs of one line each, at least 44px tall; only the active tab carries
 *     `aria-current`; selecting a tab partly off the strip scrolls it into
 *     view and shows its section; Tab and Enter work, with a visible focus;
 *     the selected tab stays current and in view after Aperçu and back.
 *   - No horizontal scroll of the page or of the dashboard's <main>.
 *
 * And the compact header, the "•••" menu and the bottom bar (US-003), at the
 * same widths and locales:
 *
 *   - The header is one row of at most 64px: Back, a 44x44 link named
 *     `common.back`; the title, inside the header and clear of its
 *     neighbours, with the save status whole; and the "•••" trigger, 44x44,
 *     named in the locale. The six desktop buttons, the translate row and
 *     the Preview button are not rendered.
 *   - The menu: a `menu` named like its trigger (`aria-haspopup`,
 *     `aria-expanded`, `aria-controls`), holding Generate, Check, Download
 *     PDF and Download Word, then a Translate group of the four targets with
 *     today's names and the very flags of the desktop row; every item at
 *     least 44px tall and on screen. Arrow keys, Home and End move a visible
 *     focus; Escape, Tab and a click outside close it, Escape and the click
 *     handing focus back to the trigger.
 *   - Each item does what its desktop control does: Generate and Check open
 *     their modals; PDF and Word send the desktop's request (method, path,
 *     body, as recorded at 1280), show the busy state on the trigger and the
 *     item, and the desktop's notice on failure, in view, focus on the
 *     trigger; with unsaved edits they ask to save first and send nothing; a
 *     translation is announced busy, then opens the new letter, and a failed
 *     one shows its notice in view.
 *   - The bottom bar's Save: the only Save, at least 44px tall; disabled
 *     until an edit, busy while saving, then saved (stored), and a failed
 *     save's notice is scrolled into view; on screen while the form scrolls;
 *     at the end of every section the form's last element, and at the end of
 *     the letter its last line, lie above the bar.
 *
 * And at 1280 and 1440: no toggle, and the nav, form and pane side by side,
 * the nav still the vertical 192px column with the active tab current; no
 * "•••" trigger and no bottom bar, the six header buttons, the translate row
 * and the Preview button as before.
 */

const TOUCH_TARGET = 44
const PAGE_WIDTH = 794
/** The pane variant's starting scale is fitted to the width, never above 85%. */
const PANE_MAX_SCALE = 0.85
/** Sub-pixel rounding between layout boxes. */
const TOLERANCE = 1

const NARROW_VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
] as const

const WIDE_VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const

const LOCALES = { en, de } as const
type LocaleCode = keyof typeof LOCALES
type Dict = (typeof LOCALES)[LocaleCode]

/** The editor's sections, in the order `cover-letter-editor.tsx` lists them. */
const SECTIONS = ['resume', 'job', 'recipient', 'opening', 'body', 'closing', 'signature'] as const

const UNSAVED_GREETING = 'Dear Ms Unsaved Toggle,'
const UNSAVED_OPENING = 'An unsaved sentence typed before switching views.'

interface Editor {
  header: Locator
  toggle: Locator
  editRadio: Locator
  previewRadio: Locator
  nav: Locator
  form: Locator
  pane: Locator
  scrollArea: Locator
  letterPage: Locator
  zoomControls: Locator
}

function editor(page: Page, dict: Dict): Editor {
  const view = dict.coverLetters.editor.view
  const pane = page.getByTestId('cover-letter-preview-pane')
  return {
    header: page.getByTestId('cover-letter-editor-header'),
    toggle: page.getByRole('radiogroup', { name: view.label, exact: true }),
    editRadio: page.getByRole('radio', { name: view.edit, exact: true }),
    previewRadio: page.getByRole('radio', { name: view.preview, exact: true }),
    nav: page.locator('nav').filter({
      has: page.getByRole('button', { name: dict.coverLetters.editor.sections.recipient, exact: true }),
    }),
    // The form is the scroll container between the section nav and the pane.
    form: page.locator('div.overflow-y-auto.p-6'),
    pane,
    scrollArea: pane.getByTestId('cover-letter-preview-scroll-area'),
    letterPage: pane.getByTestId('cover-letter-preview-page'),
    zoomControls: pane.getByTestId('cover-letter-zoom-controls'),
  }
}

async function openEditor(page: Page, locale: LocaleCode, letterId: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  const ui = editor(page, LOCALES[locale])
  await expect(ui.header).toBeVisible()
  return ui
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) throw new Error('No <main> element')
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      main: main.scrollWidth - main.clientWidth,
    }
  })
  expect(overflow, `${label}: horizontal scroll`).toEqual({ page: 0, main: 0 })
}

/** The width the editor spans: its header runs edge to edge. */
async function expectFullWidth(ui: Editor, locator: Locator, label: string) {
  const header = await rect(ui.header)
  const box = await rect(locator)
  expect(Math.abs(box.left - header.left), `${label}: left edge`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(box.right - header.right), `${label}: right edge`).toBeLessThanOrEqual(TOLERANCE)
}

async function expectEditView(ui: Editor, label: string) {
  await expect(ui.editRadio, label).toBeChecked()
  await expect(ui.previewRadio, label).not.toBeChecked()
  await expect(ui.nav, `${label}: nav`).toBeVisible()
  await expect(ui.form, `${label}: form`).toBeVisible()
  // Not rendered: no layout box anywhere, beside or below the form.
  await expect(ui.pane, `${label}: pane`).toBeHidden()
  await expect(ui.letterPage, `${label}: letter`).toBeHidden()
}

async function expectPreviewView(ui: Editor, label: string) {
  await expect(ui.previewRadio, label).toBeChecked()
  await expect(ui.editRadio, label).not.toBeChecked()
  await expect(ui.pane, `${label}: pane`).toBeVisible()
  await expect(ui.nav, `${label}: nav`).toBeHidden()
  await expect(ui.form, `${label}: form`).toBeHidden()
}

/** The label the radio sits in: it carries the option's look and focus ring. */
function optionOf(radio: Locator): Locator {
  return radio.locator('xpath=..')
}

/** Whether the radio shows keyboard focus, and its option's box shadow, where the ring is drawn. */
function focusLook(radio: Locator): Promise<{ focusVisible: boolean; shadow: string }> {
  return radio.evaluate((element) => ({
    focusVisible: element.matches(':focus-visible'),
    shadow: window.getComputedStyle(element.parentElement!).boxShadow,
  }))
}

/** The heading the active section starts with. */
function sectionHeading(ui: Editor): Locator {
  return ui.form.locator('h3').first()
}

/**
 * Every control and text block of the active section lies inside the
 * viewport once scrolled to, and the form never scrolls sideways.
 */
async function expectSectionInsideViewport(page: Page, ui: Editor, label: string) {
  const { width, height } = page.viewportSize()!
  const offenders = await ui.form.evaluate(
    (form, viewport) => {
      const selector = 'input, textarea, select, button, a, label, p, h3, [contenteditable="true"]'
      const found: string[] = []
      if (form.scrollWidth > form.clientWidth) found.push(`form scrollWidth ${form.scrollWidth} > ${form.clientWidth}`)
      for (const element of Array.from(form.querySelectorAll<HTMLElement>(selector))) {
        const style = window.getComputedStyle(element)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        if (element.getClientRects().length === 0) continue
        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
        const box = element.getBoundingClientRect()
        // Visually hidden helpers (1px, clipped) are not on screen to begin with.
        if (box.width <= 1 || box.height <= 1) continue
        const name = `${element.tagName.toLowerCase()} "${(element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 40)}"`
        if (box.left < -0.5 || box.right > viewport.width + 0.5) {
          found.push(`${name}: x ${box.left.toFixed(1)}..${box.right.toFixed(1)}`)
        }
        if (box.top < -0.5 || box.bottom > viewport.height + 0.5) {
          found.push(`${name}: y ${box.top.toFixed(1)}..${box.bottom.toFixed(1)}`)
        }
      }
      // Below xl the page scrolls in <main>, not in the form.
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' })
      return found
    },
    { width, height },
  )
  expect(offenders, `${label}: outside the viewport`).toEqual([])
}

for (const locale of Object.keys(LOCALES) as LocaleCode[]) {
  const dict = LOCALES[locale]
  const editorDict = dict.coverLetters.editor

  test.describe(`below 1280 px, ${locale}`, () => {
    test(`the toggle is a named radio group that opens on Édition and works with the keyboard (${locale})`, async ({
      page,
      authedUser,
    }) => {
      const letterId = await insertLetter(authedUser.id)
      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const ui = await openEditor(page, locale, letterId, viewport)
          await expect(ui.toggle).toBeVisible()
          await expectEditView(ui, `${label}, on open`)

          // Under the header, at the editor's full width.
          const header = await rect(ui.header)
          const toggle = await rect(ui.toggle)
          expect(toggle.top, `${label}: toggle under the header`).toBeGreaterThanOrEqual(header.bottom - TOLERANCE)
          await expectFullWidth(ui, ui.toggle, `${label}: toggle`)

          for (const radio of [ui.editRadio, ui.previewRadio]) {
            const option = await rect(optionOf(radio))
            expect(option.height, `${label}: option height`).toBeGreaterThanOrEqual(TOUCH_TARGET)
            // The radio covers its whole option, so a tap anywhere on it selects.
            const hit = await rect(radio)
            expect(Math.abs(hit.width - option.width), `${label}: radio width`).toBeLessThanOrEqual(TOLERANCE)
            expect(Math.abs(hit.height - option.height), `${label}: radio height`).toBeLessThanOrEqual(TOLERANCE)
          }

          // Keyboard: the arrow keys move the selection, as in any radio group.
          await ui.editRadio.focus()
          await page.keyboard.press('ArrowRight')
          await expect(ui.previewRadio).toBeFocused()
          await expectPreviewView(ui, `${label}, ArrowRight`)

          // Visible focus, on a selected and on an unselected option. The
          // selected option has a shadow of its own, so the ring is proven by
          // the option's look changing when its radio loses focus.
          const selectedFocused = await focusLook(ui.previewRadio)
          expect(selectedFocused.focusVisible, `${label}: selected option focus-visible`).toBe(true)
          // Focus moved from a keyboard-focused radio keeps the focus visible.
          await ui.editRadio.focus()
          await expect(ui.editRadio, `${label}: focusing does not select`).not.toBeChecked()
          const unselectedFocused = await focusLook(ui.editRadio)
          expect(unselectedFocused.focusVisible, `${label}: unselected option focus-visible`).toBe(true)
          const selectedBlurred = await focusLook(ui.previewRadio)
          expect(selectedBlurred.shadow, `${label}: ring on the focused selected option`).not.toBe(
            selectedFocused.shadow,
          )
          await ui.editRadio.blur()
          const unselectedBlurred = await focusLook(ui.editRadio)
          expect(unselectedBlurred.shadow, `${label}: ring on the focused unselected option`).not.toBe(
            unselectedFocused.shadow,
          )

          await ui.previewRadio.focus()
          await page.keyboard.press('ArrowLeft')
          await expect(ui.editRadio).toBeFocused()
          await expectEditView(ui, `${label}, ArrowLeft`)

          // Windows High Contrast: shadows and backgrounds are dropped, so the
          // selection is a border and the focus an outline. Polled: the
          // option's `transition-colors` animates the border colour into place.
          await page.emulateMedia({ forcedColors: 'active' })
          await expect(async () => {
            const [selectedContrast, unselectedContrast] = await Promise.all(
              [ui.editRadio, ui.previewRadio].map((radio) =>
                optionOf(radio).evaluate((element) => {
                  const style = window.getComputedStyle(element)
                  return { width: style.borderTopWidth, color: style.borderTopColor, outline: style.outlineStyle }
                }),
              ),
            )
            expect(selectedContrast.width, `${label}: forced-colors selection border`).toBe('2px')
            expect(unselectedContrast.width, `${label}: forced-colors border reserved`).toBe('2px')
            expect(selectedContrast.color, `${label}: forced-colors selection shown`).not.toBe(unselectedContrast.color)
            expect(selectedContrast.outline, `${label}: forced-colors focus outline`).not.toBe('none')
            expect(unselectedContrast.outline, `${label}: no outline without focus`).toBe('none')
          }).toPass({ timeout: 5_000 })
          await page.emulateMedia({ forcedColors: 'none' })

          // Pointer.
          await ui.previewRadio.click()
          await expectPreviewView(ui, `${label}, click`)
          await expectNoHorizontalScroll(page, `${label}, Aperçu`)
          await ui.editRadio.click()
          await expectEditView(ui, `${label}, click back`)
          await expectNoHorizontalScroll(page, `${label}, Édition`)
        })
      }
    })

    test(`in Édition every field of every section is inside the viewport (${locale})`, async ({
      page,
      authedUser,
    }) => {
      const letterId = await insertLetter(authedUser.id)
      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const ui = await openEditor(page, locale, letterId, viewport)
          await expectEditView(ui, label)
          await expectFullWidth(ui, ui.nav, `${label}: nav`)
          await expectFullWidth(ui, ui.form, `${label}: form`)

          for (const section of SECTIONS) {
            const before = await sectionHeading(ui).textContent()
            const button = ui.nav.getByRole('button', { name: editorDict.sections[section], exact: true })
            await expectInside(page, button, `${label}, ${section} nav button`)
            await button.click()
            await expect(sectionHeading(ui)).not.toHaveText(before ?? '')
            await expectSectionInsideViewport(page, ui, `${label}, ${section}`)
            await expect(ui.letterPage, `${label}, ${section}: no letter`).toBeHidden()
            await expectNoHorizontalScroll(page, `${label}, ${section}`)
          }

          // The ones the PRD names: the Body section's add-paragraph button and
          // hint, the rich-text toolbar, and the sign-off select.
          await ui.nav.getByRole('button', { name: editorDict.sections.body, exact: true }).click()
          await expectInside(page, ui.form.getByRole('button', { name: editorDict.body.addParagraph, exact: true }), `${label}: add paragraph`)
          await expectInside(page, ui.form.getByText(editorDict.body.hint, { exact: true }), `${label}: body hint`)
          const fontSelect = ui.form.getByRole('combobox', { name: dict.resumes.editor.richTextToolbar.font, exact: true }).first()
          await expectInside(page, fontSelect, `${label}: toolbar font select`)
          await ui.nav.getByRole('button', { name: editorDict.sections.signature, exact: true }).click()
          await expectInside(page, ui.form.locator('select').first(), `${label}: sign-off select`)
        })
      }
    })

    test(`the section nav is a horizontally scrolling tab strip above the form (${locale})`, async ({
      page,
      authedUser,
    }) => {
      const letterId = await insertLetter(authedUser.id)
      const labels = SECTIONS.map((section) => editorDict.sections[section])
      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const ui = await openEditor(page, locale, letterId, viewport)
          const tabs = ui.nav.getByRole('button')
          await expect(tabs).toHaveText(labels)

          // A strip: one row above the form, scrolling sideways on a phone.
          const strip = await stripGeometry(ui.nav)
          expect(strip.overflowX, `${label}: strip scrolls sideways`).toBe('auto')
          expect(new Set(strip.tabTops).size, `${label}: tabs in one row`).toBe(1)
          const nav = await rect(ui.nav)
          const form = await rect(ui.form)
          expect(nav.bottom, `${label}: strip above the form`).toBeLessThanOrEqual(form.top + TOLERANCE)
          if (viewport.width < 768) {
            expect(strip.scrollWidth, `${label}: more tabs than fit`).toBeGreaterThan(strip.clientWidth)
          }

          // At least 44px tall, and exactly the one-line height: a wrapped
          // label would make its tab taller than the others.
          for (const [index, height] of strip.tabHeights.entries()) {
            expect(height, `${label}: ${labels[index]} height`).toBeGreaterThanOrEqual(TOUCH_TARGET)
            expect(height, `${label}: ${labels[index]} on one line`).toBeLessThanOrEqual(TOUCH_TARGET + TOLERANCE)
          }

          // The section the editor opens on is the current one, and only it.
          await expectCurrentTab(ui, editorDict.sections.recipient, label)

          if (strip.scrollWidth > strip.clientWidth) {
            // Selecting a tab partly off the strip scrolls the strip, and only
            // the strip, until the tab clears the fade. Dispatched rather than
            // clicked: Playwright's click scrolls the tab into view itself.
            const last = tabs.last()
            expect(await tabVisibility(ui.nav, last), `${label}: last tab starts off the strip`).toBe('clipped')
            await last.dispatchEvent('click')
            await expectCurrentTab(ui, editorDict.sections.signature, label)
            await expect(sectionHeading(ui)).toHaveText(editorDict.signature.title)
            await expect
              .poll(() => tabVisibility(ui.nav, last), { message: `${label}: last tab scrolled into view` })
              .toBe('visible')
            await expectNoHorizontalScroll(page, `${label}, last tab`)

            // Back to the start: the first tab, scrolled out, scrolls back in.
            const first = tabs.first()
            if (viewport.width < 768) {
              expect(await tabVisibility(ui.nav, first), `${label}: first tab scrolled out`).toBe('clipped')
            }
            await first.dispatchEvent('click')
            await expectCurrentTab(ui, editorDict.sections.resume, label)
            await expect(sectionHeading(ui)).not.toHaveText(editorDict.signature.title)
            await expect
              .poll(() => tabVisibility(ui.nav, first), { message: `${label}: first tab scrolled back` })
              .toBe('visible')
          }

          // Keyboard: Tab moves along the strip with a visible focus, Enter selects.
          await tabs.nth(2).focus()
          await page.keyboard.press('Tab')
          await expect(tabs.nth(3)).toBeFocused()
          expect(
            await tabs.nth(3).evaluate((element) => element.matches(':focus-visible')),
            `${label}: focus visible`,
          ).toBe(true)
          await page.keyboard.press('Enter')
          await expectCurrentTab(ui, editorDict.sections.opening, label)
          await expect(sectionHeading(ui)).toHaveText(editorDict.opening.title)
          await expect
            .poll(() => tabVisibility(ui.nav, tabs.nth(3)), { message: `${label}: selected tab in view` })
            .toBe('visible')

          // Aperçu and back keeps the selected tab current and in view.
          await tabs.last().dispatchEvent('click')
          await expectCurrentTab(ui, editorDict.sections.signature, label)
          await ui.previewRadio.click()
          await ui.editRadio.click()
          await expectCurrentTab(ui, editorDict.sections.signature, `${label}, back from Aperçu`)
          await expect
            .poll(() => tabVisibility(ui.nav, tabs.last()), { message: `${label}: selected tab in view after Aperçu` })
            .toBe('visible')
          await expectNoHorizontalScroll(page, label)
        })
      }
    })

    test(`in Aperçu only the letter is shown, fitted to the full width (${locale})`, async ({ page, authedUser }) => {
      const letterId = await insertLetter(authedUser.id)
      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const ui = await openEditor(page, locale, letterId, viewport)
          await ui.previewRadio.click()
          await expectPreviewView(ui, label)
          await expectFullWidth(ui, ui.pane, `${label}: pane`)

          // Fitted to the area's width, at most 85%, as the pane always starts.
          await expect(async () => {
            const area = await ui.scrollArea.evaluate((element: HTMLElement) => {
              const style = window.getComputedStyle(element)
              return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            })
            const letter = await rect(ui.letterPage)
            const expected = Math.min(area, PANE_MAX_SCALE * PAGE_WIDTH)
            expect(Math.abs(letter.width - expected), `${label}: page ${letter.width}, expected ${expected}`).toBeLessThanOrEqual(
              TOLERANCE + 0.5,
            )
            const scrollWidth = await ui.scrollArea.evaluate((element) => element.scrollWidth - element.clientWidth)
            expect(scrollWidth, `${label}: letter scrolls sideways`).toBeLessThanOrEqual(0)
          }).toPass({ timeout: 10_000 })

          // Zoom controls, and each of their buttons, inside the viewport.
          await expect(ui.zoomControls).toBeVisible()
          await expectInside(page, ui.zoomControls, `${label}: zoom controls`)
          for (const button of await ui.zoomControls.getByRole('button').all()) {
            await expectInside(page, button, `${label}: zoom button`)
          }

          // The end of the letter can be scrolled into view.
          await ui.scrollArea.evaluate((element) =>
            element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }),
          )
          const lastLine = ui.letterPage.getByText(SENDER_NAME, { exact: true }).last()
          await expect(async () => {
            const area = await rect(ui.scrollArea)
            const line = await rect(lastLine)
            expect(line.top, `${label}: last line top`).toBeGreaterThanOrEqual(area.top)
            expect(line.bottom, `${label}: last line bottom`).toBeLessThanOrEqual(area.bottom)
            expect(line.bottom, `${label}: last line in the viewport`).toBeLessThanOrEqual(viewport.height)
          }).toPass({ timeout: 10_000 })
          await expectInside(page, ui.zoomControls, `${label}: zoom controls at the end of the letter`)
          await expectNoHorizontalScroll(page, label)
        })
      }
    })

    test(`switching views keeps unsaved edits, the indicator and the section, and never saves (${locale})`, async ({
      page,
      authedUser,
    }) => {
      const letterId = await insertLetter(authedUser.id)
      const writes: string[] = []
      page.on('request', (request) => {
        if (request.method() !== 'GET' && request.url().includes('/rest/v1/cover_letters')) {
          writes.push(`${request.method()} ${request.url()}`)
        }
      })

      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const ui = await openEditor(page, locale, letterId, viewport)
          const unsaved = ui.header.getByText(editorDict.unsavedChanges, { exact: true })
          await expect(unsaved).toHaveCount(0)

          await ui.nav.getByRole('button', { name: editorDict.sections.opening, exact: true }).click()
          await expect(sectionHeading(ui)).toHaveText(editorDict.opening.title)
          const greeting = ui.form.locator('input[type="text"]').first()
          await greeting.fill(UNSAVED_GREETING)
          const opening = ui.form.locator('#opening-paragraph')
          await opening.click()
          await page.keyboard.press('Control+End')
          await page.keyboard.type(` ${UNSAVED_OPENING}`)
          await expect(unsaved).toBeVisible()

          await ui.previewRadio.click()
          await expectPreviewView(ui, `${label}, Aperçu`)
          await expect(unsaved, `${label}: indicator in Aperçu`).toBeVisible()
          await expect(ui.letterPage.getByText(UNSAVED_GREETING, { exact: true })).toBeVisible()
          await expect(ui.letterPage).toContainText(UNSAVED_OPENING)

          await ui.editRadio.click()
          await expectEditView(ui, `${label}, back to Édition`)
          await expect(sectionHeading(ui), `${label}: same section`).toHaveText(editorDict.opening.title)
          await expect(greeting).toHaveValue(UNSAVED_GREETING)
          await expect(opening).toContainText(UNSAVED_OPENING)
          await expect(unsaved, `${label}: indicator back in Édition`).toBeVisible()
        })
      }
      expect(writes, 'switching views saved the letter').toEqual([])
    })
  })
}

/** The strip's scroll extent, and each tab's top and height. */
function stripGeometry(nav: Locator) {
  return nav.evaluate((element) => {
    const tabs = Array.from(element.querySelectorAll('button')).map((tab) => tab.getBoundingClientRect())
    return {
      overflowX: window.getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      tabTops: tabs.map((box) => Math.round(box.top)),
      tabHeights: tabs.map((box) => box.height),
    }
  })
}

/**
 * Whether the tab lies wholly in the strip's visible part: inside its left
 * edge, and clear of the fade over its end padding.
 */
async function tabVisibility(nav: Locator, tab: Locator): Promise<'visible' | 'clipped'> {
  const strip = await nav.evaluate((element) => {
    const { left, right } = element.getBoundingClientRect()
    return { left, visibleRight: right - parseFloat(window.getComputedStyle(element).paddingRight) }
  })
  const box = await rect(tab)
  return box.left >= strip.left - 0.5 && box.right <= strip.visibleRight + 0.5 ? 'visible' : 'clipped'
}

/** The named tab, and no other, is marked current. */
async function expectCurrentTab(ui: Editor, name: string, label: string) {
  await expect(ui.nav.locator('[aria-current]'), `${label}: one current tab`).toHaveCount(1)
  await expect(ui.nav.getByRole('button', { name, exact: true }), `${label}: ${name} current`).toHaveAttribute(
    'aria-current',
    'true',
  )
}

async function expectInside(page: Page, locator: Locator, label: string) {
  const { width, height } = page.viewportSize()!
  await locator.scrollIntoViewIfNeeded()
  const box = await rect(locator)
  expect(box.width, `${label}: width`).toBeGreaterThan(0)
  expect(box.left, `${label}: left`).toBeGreaterThanOrEqual(-0.5)
  expect(box.right, `${label}: right`).toBeLessThanOrEqual(width + 0.5)
  expect(box.top, `${label}: top`).toBeGreaterThanOrEqual(-0.5)
  expect(box.bottom, `${label}: bottom`).toBeLessThanOrEqual(height + 0.5)
}

test('widening from Édition at 1024 to 1280 px shows the pane fitted to its width', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)
  const ui = await openEditor(page, 'en', letterId, { width: 1024, height: 768 })
  await expectEditView(ui, '1024, Édition')

  // The pane was hidden, and measured as empty, until this resize shows it.
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(ui.toggle).toBeHidden()
  await expect(ui.pane).toBeVisible()
  await expect(async () => {
    const paneInner = await ui.pane.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return (
        element.getBoundingClientRect().width -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth) -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      )
    })
    const area = await ui.scrollArea.evaluate((element: HTMLElement) => {
      const style = window.getComputedStyle(element)
      return {
        scrollbar:
          element.offsetWidth - element.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
        padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
      }
    })
    const letter = await rect(ui.letterPage)
    const expected = Math.min(paneInner - area.scrollbar - area.padding, PANE_MAX_SCALE * PAGE_WIDTH)
    expect(Math.abs(letter.width - expected), `page ${letter.width}, expected ${expected}`).toBeLessThanOrEqual(1)
  }).toPass({ timeout: 10_000 })
})

test('a menu left open while widening to 1280 px is closed when the window narrows again', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, 'en', letterId, { width: 1024, height: 768 })
  const actions = actionsOf(page, en)
  await openMenu(actions)
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(actions.trigger).toHaveCount(0)
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(actions.trigger).toBeVisible()
  await expect(actions.menu).toHaveCount(0)
  await expect(actions.trigger).toHaveAttribute('aria-expanded', 'false')
})

test('at 1280 and 1440 px there is no toggle and the three columns sit side by side', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)
  for (const locale of Object.keys(LOCALES) as LocaleCode[]) {
    for (const viewport of WIDE_VIEWPORTS) {
      const label = `${locale} ${viewport.width}x${viewport.height}`
      await test.step(label, async () => {
        const ui = await openEditor(page, locale, letterId, viewport)
        await expect(ui.toggle, `${label}: toggle`).toBeHidden()
        await expect(ui.nav).toBeVisible()
        await expect(ui.form).toBeVisible()
        await expect(ui.pane).toBeVisible()
        await expect(ui.zoomControls).toBeVisible()

        const header = await rect(ui.header)
        const navColumn = await rect(ui.nav.locator('xpath=..'))
        const form = await rect(ui.form)
        const pane = await rect(ui.pane)
        expect(navColumn.width, `${label}: nav width`).toBeCloseTo(192, 0)
        expect(Math.abs(navColumn.left - header.left), `${label}: nav at the left`).toBeLessThanOrEqual(TOLERANCE)
        expect(Math.abs(form.left - navColumn.right), `${label}: form after the nav`).toBeLessThanOrEqual(TOLERANCE)
        expect(Math.abs(pane.left - form.right), `${label}: pane after the form`).toBeLessThanOrEqual(TOLERANCE)
        expect(Math.abs(pane.right - header.right), `${label}: pane at the right`).toBeLessThanOrEqual(TOLERANCE)
        expect(Math.abs(pane.width - header.width / 2), `${label}: pane half the width`).toBeLessThanOrEqual(TOLERANCE)
        for (const column of [navColumn, form, pane]) {
          expect(Math.abs(column.top - navColumn.top), `${label}: one row`).toBeLessThanOrEqual(TOLERANCE)
        }
        // The nav stays a vertical list, one button per row.
        const buttons = await ui.nav.getByRole('button').all()
        const tops = await Promise.all(buttons.map(async (button) => (await rect(button)).top))
        expect(new Set(tops).size, `${label}: one nav button per row`).toBe(SECTIONS.length)
        await expectCurrentTab(ui, LOCALES[locale].coverLetters.editor.sections.recipient, label)

        // US-003: nothing of the compact layout, and the desktop controls as before.
        const dict = LOCALES[locale]
        const actions = actionsOf(page, dict)
        await expect(actions.trigger, `${label}: no "•••"`).toHaveCount(0)
        await expect(page.getByRole('button', { name: dict.common.save, exact: true }), `${label}: one Save`).toHaveCount(1)
        for (const name of desktopButtonNames(dict)) {
          await expect(ui.header.getByRole('button', { name, exact: true }), `${label}: "${name}"`).toBeVisible()
        }
        const flags = page.getByRole('group', { name: dict.coverLetters.editor.translate.label, exact: true }).getByRole('button')
        await expect(flags, `${label}: translate row`).toHaveCount(4)
        for (const flag of await flags.all()) await expect(flag).toBeVisible()
        await expectNoHorizontalScroll(page, label)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// US-003: the compact header, the "•••" menu and the bottom bar
// ---------------------------------------------------------------------------

const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

const HEADER_MAX_HEIGHT = 64
const LONG_TITLE = 'Cover Letter - Senior Full-Stack Software Engineer at Acme International Holdings SA'
const PDF_ROUTE = '**/api/cover-letters/*/download-pdf'
const WORD_ROUTE = '**/api/cover-letters/*/download-docx'
const TRANSLATE_ROUTE = '**/api/cover-letters/*/translate'
const LETTER_WRITE_ROUTE = '**/rest/v1/cover_letters**'

/** The six header buttons at 1280 and above, by their accessible names. */
function desktopButtonNames(dict: Dict): string[] {
  const editorDict = dict.coverLetters.editor
  return [
    editorDict.generate,
    editorDict.check,
    editorDict.preview,
    dict.coverLetters.downloadPDF,
    dict.coverLetters.downloadWord,
    dict.common.save,
  ]
}

interface Actions {
  trigger: Locator
  menu: Locator
  items: Locator
  translateGroup: Locator
  item: (name: string) => Locator
  save: Locator
  bar: Locator
}

function actionsOf(page: Page, dict: Dict): Actions {
  const menu = page.getByRole('menu', { name: dict.common.moreActions, exact: true })
  const save = page.getByRole('button', { name: dict.common.save, exact: true })
  return {
    trigger: page.getByRole('button', { name: dict.common.moreActions, exact: true }),
    menu,
    items: menu.getByRole('menuitem'),
    translateGroup: menu.getByRole('group', { name: dict.coverLetters.editor.translate.label, exact: true }),
    item: (name: string) => menu.getByRole('menuitem', { name, exact: true }),
    save,
    bar: save.locator('xpath=..'),
  }
}

/** The menu's items in order, by name: the actions, then the four translation targets. */
function menuItemNames(dict: Dict): string[] {
  const to = dict.coverLetters.editor.translate.to
  return [
    dict.coverLetters.editor.generate,
    dict.coverLetters.editor.check,
    dict.coverLetters.downloadPDF,
    dict.coverLetters.downloadWord,
    to.en,
    to.fr,
    to.de,
    to.it,
  ]
}

async function openMenu(actions: Actions) {
  await actions.trigger.click()
  await expect(actions.menu).toBeVisible()
  await expect(actions.trigger).toHaveAttribute('aria-expanded', 'true')
}

/** Scrolls the dashboard's <main>, which scrolls the page below xl, and settles. */
function scrollMain(page: Page, to: 'top' | 'middle' | 'bottom') {
  return page.evaluate((where) => {
    const main = document.querySelector('main')!
    const max = main.scrollHeight - main.clientHeight
    const top = where === 'top' ? 0 : where === 'middle' ? Math.floor(max / 2) : max
    main.scrollTo({ top, behavior: 'instant' })
    return { max, top: main.scrollTop }
  }, to)
}

/** The lowest edge of anything rendered in the form: its last field, button or text. */
function formContentBottom(form: Locator): Promise<number> {
  return form.evaluate((element) => {
    let bottom = -Infinity
    for (const child of Array.from(
      element.querySelectorAll<HTMLElement>('input, textarea, select, button, a, label, p, h3, [contenteditable="true"]'),
    )) {
      if (child.getClientRects().length === 0) continue
      bottom = Math.max(bottom, child.getBoundingClientRect().bottom)
    }
    return bottom
  })
}

/** A route held until released, answering with `fulfil` or passing through. */
function holdRoute(page: Page, pattern: string, answer: 'continue' | { status: number; body: string }, method?: string) {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const requests: { method: string; path: string; body: string | null }[] = []
  const ready = page.route(pattern, async (route) => {
    const request = route.request()
    if (method && request.method() !== method) return route.continue()
    requests.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postData() })
    await held
    if (answer === 'continue') return route.continue()
    return route.fulfill({ status: answer.status, contentType: 'application/json', body: answer.body })
  })
  return { ready, release, requests }
}

for (const locale of Object.keys(LOCALES) as LocaleCode[]) {
  const dict = LOCALES[locale]
  const editorDict = dict.coverLetters.editor

  test.describe(`below 1280 px, the compact header, the menu and the bottom bar, ${locale}`, () => {
    test(`the header is one row of at most 64 px with Back, the title and "•••" (${locale})`, async ({
      page,
      authedUser,
    }) => {
      const letterId = await insertLetter(authedUser.id)
      for (const viewport of NARROW_VIEWPORTS) {
        for (const titleCase of ['short', 'long'] as const) {
          const label = `${locale} ${viewport.width}x${viewport.height}, ${titleCase} title`
          await test.step(label, async () => {
            const ui = await openEditor(page, locale, letterId, viewport)
            const actions = actionsOf(page, dict)
            const title = ui.header.getByRole('textbox')
            const status = ui.header.getByText(editorDict.unsavedChanges, { exact: true })
            if (titleCase === 'long') {
              await title.fill(LONG_TITLE)
              await expect(status).toBeVisible()
            }

            const header = await rect(ui.header)
            expect(header.height, `${label}: header height`).toBeLessThanOrEqual(HEADER_MAX_HEIGHT)

            const back = ui.header.getByRole('link', { name: dict.common.back, exact: true })
            const backBox = await rect(back)
            expect(Math.round(backBox.width), `${label}: Back width`).toBeGreaterThanOrEqual(TOUCH_TARGET)
            expect(Math.round(backBox.height), `${label}: Back height`).toBeGreaterThanOrEqual(TOUCH_TARGET)

            await expect(actions.trigger).toBeVisible()
            await expect(actions.trigger).toHaveAttribute('aria-haspopup', 'menu')
            await expect(actions.trigger).toHaveAttribute('aria-expanded', 'false')
            const triggerBox = await rect(actions.trigger)
            expect(Math.round(triggerBox.width), `${label}: "•••" width`).toBeGreaterThanOrEqual(TOUCH_TARGET)
            expect(Math.round(triggerBox.height), `${label}: "•••" height`).toBeGreaterThanOrEqual(TOUCH_TARGET)

            // One row: Back, the title and "•••" side by side, inside the header.
            const titleBox = await rect(title)
            expect(backBox.right, `${label}: title after Back`).toBeLessThanOrEqual(titleBox.left + TOLERANCE)
            expect(titleBox.right, `${label}: "•••" after the title`).toBeLessThanOrEqual(triggerBox.left + TOLERANCE)
            for (const [name, box] of [
              ['Back', backBox],
              ['title', titleBox],
              ['"•••"', triggerBox],
            ] as const) {
              expect(box.left, `${label}: ${name} left`).toBeGreaterThanOrEqual(header.left)
              expect(box.right, `${label}: ${name} right`).toBeLessThanOrEqual(header.right)
              expect(box.top, `${label}: ${name} top`).toBeGreaterThanOrEqual(header.top)
              expect(box.bottom, `${label}: ${name} bottom`).toBeLessThanOrEqual(header.bottom)
            }
            const centre = (box: Box) => (box.top + box.bottom) / 2
            expect(Math.abs(centre(backBox) - centre(triggerBox)), `${label}: Back and "•••" on one row`).toBeLessThanOrEqual(
              TOLERANCE,
            )
            // A usable title: the field keeps a width of its own.
            expect(titleBox.width, `${label}: title width`).toBeGreaterThanOrEqual(96 - TOLERANCE)

            if (titleCase === 'long') {
              // The status is inside the header and covers nothing. It is whole
              // wherever its line has room; where it has not (de at 320) it is
              // cut with an ellipsis inside its column, never run under "•••".
              const statusBox = await rect(status)
              const fits = await status.evaluate((element) => element.scrollWidth <= element.clientWidth)
              if (!fits) {
                expect(
                  await status.evaluate((element) => window.getComputedStyle(element).textOverflow),
                  `${label}: a cut status ends in an ellipsis`,
                ).toBe('ellipsis')
              }
              if (viewport.width >= 375 || locale === 'en') expect(fits, `${label}: status whole`).toBe(true)
              expect(statusBox.right, `${label}: status before "•••"`).toBeLessThanOrEqual(triggerBox.left + TOLERANCE)
              expect(statusBox.left, `${label}: status left`).toBeGreaterThanOrEqual(header.left)
              expect(statusBox.bottom, `${label}: status bottom`).toBeLessThanOrEqual(header.bottom)
              expect(intersects(statusBox, triggerBox), `${label}: status under "•••"`).toBe(false)
              expect(intersects(statusBox, titleBox), `${label}: status over the title`).toBe(false)
            }

            // The desktop controls are not rendered: six buttons, flags, Preview.
            for (const name of desktopButtonNames(dict)) {
              await expect(ui.header.getByRole('button', { name, exact: true }), `${label}: header "${name}"`).toHaveCount(0)
            }
            await expect(
              page.getByRole('group', { name: editorDict.translate.label, exact: true }),
              `${label}: translate row`,
            ).toHaveCount(0)
            await expect(page.getByRole('button', { name: editorDict.preview, exact: true }), `${label}: Preview`).toHaveCount(0)
            await expectNoHorizontalScroll(page, label)
          })
        }
      }
    })

    test(`the "•••" menu lists the actions and works with the keyboard and the pointer (${locale})`, async ({
      page,
      authedUser,
    }) => {
      const letterId = await insertLetter(authedUser.id)
      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const ui = await openEditor(page, locale, letterId, viewport)
          const actions = actionsOf(page, dict)

          await openMenu(actions)
          const menuId = await actions.menu.getAttribute('id')
          await expect(actions.trigger).toHaveAttribute('aria-controls', menuId!)
          await expect(actions.items).toHaveText(menuItemNames(dict))
          for (const [index, item] of (await actions.items.all()).entries()) {
            const box = await rect(item)
            expect(box.height, `${label}: item ${index} height`).toBeGreaterThanOrEqual(TOUCH_TARGET)
            await expectInside(page, item, `${label}: item ${index}`)
          }

          // The Translate group: the four targets, each with today's flag.
          const targets = actions.translateGroup.getByRole('menuitem')
          await expect(targets).toHaveText(menuItemNames(dict).slice(4))
          for (const code of ['en', 'fr', 'de', 'it'] as const) {
            const name = editorDict.translate.to[code]
            const menuFlag = await actions.item(name).locator('svg').evaluate((svg) => svg.outerHTML)
            // The desktop flag, in the DOM though not rendered below xl.
            const desktopFlag = await page
              .locator(`button[aria-label="${name}"]:not([role]) svg`)
              .evaluate((svg) => svg.outerHTML)
            expect(menuFlag, `${label}: ${code} flag`).toBe(desktopFlag)
          }

          // Keyboard: the first item is focused, the arrows, Home and End move.
          await expect(actions.items.first()).toBeFocused()
          await page.keyboard.press('ArrowDown')
          await expect(actions.items.nth(1)).toBeFocused()
          expect(
            await actions.items.nth(1).evaluate((element) => element.matches(':focus-visible')),
            `${label}: item focus visible`,
          ).toBe(true)
          await page.keyboard.press('End')
          await expect(actions.items.last()).toBeFocused()
          await page.keyboard.press('ArrowDown')
          await expect(actions.items.first(), `${label}: ArrowDown wraps`).toBeFocused()
          await page.keyboard.press('ArrowUp')
          await expect(actions.items.last(), `${label}: ArrowUp wraps`).toBeFocused()
          await page.keyboard.press('Home')
          await expect(actions.items.first()).toBeFocused()
          // One tab stop: the focused item alone.
          await expect(actions.menu.locator('[tabindex="0"]')).toHaveCount(1)

          // Escape closes, focus back on "•••".
          await page.keyboard.press('Escape')
          await expect(actions.menu).toHaveCount(0)
          await expect(actions.trigger).toBeFocused()
          await expect(actions.trigger).toHaveAttribute('aria-expanded', 'false')

          // From the keyboard: Enter opens on the first item, ArrowUp on the last.
          await page.keyboard.press('Enter')
          await expect(actions.items.first()).toBeFocused()
          await page.keyboard.press('Escape')
          await page.keyboard.press('ArrowUp')
          await expect(actions.items.last()).toBeFocused()
          // Tab leaves the menu and closes it.
          await page.keyboard.press('Tab')
          await expect(actions.menu).toHaveCount(0)

          // A click outside closes it, focus back on "•••".
          // Pressed beside the menu, at its height: the menu is right-aligned
          // and covers the form under it, so the press lands in <main>'s gutter.
          await openMenu(actions)
          const menuBox = await rect(actions.menu)
          expect(menuBox.left, `${label}: room beside the menu`).toBeGreaterThan(8)
          await page.mouse.click(4, (menuBox.top + menuBox.bottom) / 2)
          await expect(actions.menu).toHaveCount(0)
          await expect(actions.trigger).toBeFocused()

          // A press on a control that takes no focus (the bottom bar's Save,
          // disabled with nothing to save) closes it, focus back on "•••".
          await openMenu(actions)
          await expect(actions.save).toBeDisabled()
          // Forced: Playwright will not press a disabled button otherwise.
          await actions.save.click({ force: true })
          await expect(actions.menu).toHaveCount(0)
          await expect(actions.trigger, `${label}: focus after pressing a disabled control`).toBeFocused()

          // A press on a field closes it too, and the field keeps the focus.
          await openMenu(actions)
          const title = ui.header.getByRole('textbox')
          await title.click()
          await expect(actions.menu).toHaveCount(0)
          await expect(title).toBeFocused()

          // The trigger toggles it.
          await openMenu(actions)
          await actions.trigger.click()
          await expect(actions.menu).toHaveCount(0)
          await expectNoHorizontalScroll(page, label)
        })
      }
    })

    test(`each menu item does what its desktop control does (${locale})`, async ({ page, authedUser }) => {
      const letterId = await insertLetter(authedUser.id)

      // The desktop's requests, recorded at 1280 through the header buttons.
      await openEditor(page, locale, letterId, { width: 1280, height: 800 })
      const desktop: Record<'pdf' | 'docx', { method: string; path: string; body: string | null }[]> = { pdf: [], docx: [] }
      for (const [format, pattern, name] of [
        ['pdf', PDF_ROUTE, dict.coverLetters.downloadPDF],
        ['docx', WORD_ROUTE, dict.coverLetters.downloadWord],
      ] as const) {
        const held = holdRoute(page, pattern, { status: 500, body: '{"error":"stubbed"}' })
        await held.ready
        held.release()
        await page.getByRole('button', { name, exact: true }).click()
        await expect(page.locator(`#cover-letter-${format}-notice`)).toBeVisible()
        desktop[format] = held.requests
        await page.unroute(pattern)
      }
      expect(desktop.pdf).toHaveLength(1)
      expect(desktop.docx).toHaveLength(1)

      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const actions = actionsOf(page, dict)

          // Generate and Check open their modals.
          for (const [name, heading] of [
            [editorDict.generate, dict.coverLetters.generation.title],
            [editorDict.check, dict.coverLetters.checker.title],
          ] as const) {
            await openEditor(page, locale, letterId, viewport)
            await openMenu(actions)
            await actions.item(name).click()
            await expect(actions.menu).toHaveCount(0)
            await expect(page.getByRole('heading', { level: 2, name: heading, exact: true }), `${label}: ${name}`).toBeVisible()
          }

          // PDF and Word: the desktop's request, the busy state, the notice.
          for (const [format, pattern, idle, busy, failure] of [
            ['pdf', PDF_ROUTE, dict.coverLetters.downloadPDF, editorDict.downloadingPdf, dict.coverLetters.downloadPDFError],
            ['docx', WORD_ROUTE, dict.coverLetters.downloadWord, editorDict.downloadingWord, dict.coverLetters.downloadWordError],
          ] as const) {
            await openEditor(page, locale, letterId, viewport)
            const held = holdRoute(page, pattern, { status: 500, body: '{"error":"stubbed"}' })
            await held.ready
            await openMenu(actions)
            await actions.item(idle).click()
            await expect(actions.menu).toHaveCount(0)
            await expect(actions.trigger, `${label}: ${format} busy on "•••"`).toHaveAttribute('aria-busy', 'true')
            await expect(actions.trigger).toBeFocused()
            await expect.poll(() => held.requests.length).toBe(1)
            expect(held.requests, `${label}: ${format} request`).toEqual(desktop[format])

            // Reopened while busy: the item is busy and cannot be chosen again.
            await openMenu(actions)
            const busyItem = actions.item(busy)
            await expect(busyItem).toHaveAttribute('aria-busy', 'true')
            await expect(busyItem).toHaveAttribute('aria-disabled', 'true')
            // Dispatched: Playwright will not click an `aria-disabled` element.
            await busyItem.dispatchEvent('click')
            await expect(actions.menu, `${label}: a busy item keeps the menu open`).toBeVisible()
            await page.keyboard.press('Escape')
            expect(held.requests).toHaveLength(1)

            held.release()
            const notice = page.locator(`#cover-letter-${format}-notice`)
            await expect(notice).toHaveText(failure)
            await expect(notice).toHaveAttribute('role', 'alert')
            await expectInViewport(page, notice, `${label}: ${format} notice`)
            await expect(actions.trigger).toHaveAttribute('aria-busy', 'false')
            await expect(actions.trigger, `${label}: focus stays on "•••"`).toBeFocused()
            await openMenu(actions)
            await expect(actions.item(idle)).toHaveAttribute('aria-describedby', `cover-letter-${format}-notice`)
            await page.keyboard.press('Escape')
            await page.unroute(pattern)
          }

          // With unsaved edits: save first, and no request.
          await openEditor(page, locale, letterId, viewport)
          const sent: string[] = []
          const watch = (request: { url: () => string }) => {
            if (/\/download-(pdf|docx)$/.test(request.url())) sent.push(request.url())
          }
          page.on('request', watch)
          await editorHeader(page).getByRole('textbox').fill('Edited title')
          await openMenu(actions)
          await actions.item(dict.coverLetters.downloadPDF).click()
          await expect(page.locator('#cover-letter-pdf-notice')).toHaveText(editorDict.saveBeforeDownload)
          await openMenu(actions)
          await actions.item(dict.coverLetters.downloadWord).click()
          await expect(page.locator('#cover-letter-docx-notice')).toHaveText(editorDict.saveBeforeDownloadWord)
          await expectInViewport(page, page.locator('#cover-letter-docx-notice'), `${label}: save-first notice`)
          page.off('request', watch)
          expect(sent, `${label}: nothing sent with unsaved edits`).toEqual([])

          // A failed translation: the desktop's notice, in view.
          await openEditor(page, locale, letterId, viewport)
          const failing = holdRoute(page, TRANSLATE_ROUTE, { status: 500, body: '{"error":"stubbed"}' })
          await failing.ready
          await openMenu(actions)
          await actions.item(editorDict.translate.to.fr).click()
          await expect(actions.trigger).toHaveAttribute('aria-busy', 'true')
          await expect(page.getByRole('status').filter({ hasText: editorDict.translate.translating.fr })).toHaveCount(1)
          await openMenu(actions)
          await expect(actions.item(editorDict.translate.translating.fr)).toHaveAttribute('aria-busy', 'true')
          for (const code of ['en', 'de', 'it'] as const) {
            await expect(actions.item(editorDict.translate.to[code])).toHaveAttribute('aria-disabled', 'true')
          }
          await page.keyboard.press('Escape')
          failing.release()
          const translateNotice = page.locator('#cover-letter-translate-notice')
          await expect(translateNotice).toHaveText(editorDict.translate.failed)
          await expect(translateNotice).toHaveAttribute('role', 'alert')
          await expectInViewport(page, translateNotice, `${label}: translation notice`)
          expect(failing.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
            `POST /api/cover-letters/${letterId}/translate`,
          ])
          await page.unroute(TRANSLATE_ROUTE)
          await expectNoHorizontalScroll(page, label)
        })
      }
    })

    test(`a translation started from the menu opens the new letter (${locale})`, async ({ page, authedUser }) => {
      for (const viewport of [NARROW_VIEWPORTS[0], NARROW_VIEWPORTS[3]]) {
        await test.step(`${locale} ${viewport.width}x${viewport.height}`, async () => {
          const letterId = await insertLetter(authedUser.id)
          await openEditor(page, locale, letterId, viewport)
          const actions = actionsOf(page, dict)
          const held = holdRoute(page, TRANSLATE_ROUTE, 'continue')
          await held.ready
          await openMenu(actions)
          await actions.item(editorDict.translate.to.de).click()
          await expect(actions.trigger).toHaveAttribute('aria-busy', 'true')
          await expect(page.getByRole('status').filter({ hasText: editorDict.translate.translating.de })).toHaveCount(1)
          held.release()
          await page.waitForURL((url) => /\/dashboard\/cover-letters\/[^/]+\/edit$/.test(url.pathname) && !url.pathname.includes(letterId))
          await expect(editorHeader(page).getByRole('textbox')).toHaveValue('Preview window letter (DE)')
          await page.unroute(TRANSLATE_ROUTE)
        })
      }
    })

    test(`the bottom bar holds Save, stays in view and never covers the form or the letter (${locale})`, async ({
      page,
      authedUser,
    }) => {
      const letterId = await insertLetter(authedUser.id)
      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const ui = await openEditor(page, locale, letterId, viewport)
          const actions = actionsOf(page, dict)
          await expect(actions.save, `${label}: one Save`).toHaveCount(1)
          await expect(actions.save).toBeVisible()
          await expect(actions.save, `${label}: nothing to save`).toBeDisabled()
          const saveBox = await rect(actions.save)
          expect(saveBox.height, `${label}: Save height`).toBeGreaterThanOrEqual(TOUCH_TARGET)
          expect(saveBox.width, `${label}: Save width`).toBeGreaterThanOrEqual(TOUCH_TARGET)
          await expectFullWidth(ui, actions.bar, `${label}: bar`)

          // In view while the form scrolls: halfway down a long section.
          await ui.nav.getByRole('button', { name: editorDict.sections.body, exact: true }).click()
          const { max } = await scrollMain(page, 'middle')
          expect(max, `${label}: the Body section scrolls`).toBeGreaterThan(0)
          await expectBarOnScreenEdge(page, actions.bar, `${label}: mid-scroll`)

          // At the end of every section, its last element is above the bar.
          for (const section of SECTIONS) {
            await scrollMain(page, 'top')
            await ui.nav.getByRole('button', { name: editorDict.sections[section], exact: true }).click()
            await scrollMain(page, 'bottom')
            const bar = await rect(actions.bar)
            expect(await formContentBottom(ui.form), `${label}, ${section}: last element above the bar`).toBeLessThanOrEqual(
              bar.top + TOLERANCE,
            )
            await expectBarOnScreenEdge(page, actions.bar, `${label}, ${section}: end of scroll`)
          }

          // A field focused near the bottom stops above the bar.
          await scrollMain(page, 'top')
          await ui.nav.getByRole('button', { name: editorDict.sections.body, exact: true }).click()
          const addParagraph = ui.form.getByRole('button', { name: editorDict.body.addParagraph, exact: true })
          await addParagraph.focus()
          const focused = await rect(addParagraph)
          expect(focused.bottom, `${label}: focused control above the bar`).toBeLessThanOrEqual(
            (await rect(actions.bar)).top + TOLERANCE,
          )

          // Aperçu: the bar stays, and the end of the letter scrolls above it.
          await scrollMain(page, 'top')
          await ui.previewRadio.click()
          await expectBarOnScreenEdge(page, actions.bar, `${label}: Aperçu`)
          await ui.scrollArea.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }))
          const lastLine = ui.letterPage.getByText(SENDER_NAME, { exact: true }).last()
          await expect(async () => {
            const line = await rect(lastLine)
            const bar = await rect(actions.bar)
            expect(line.bottom, `${label}: the letter's end above the bar`).toBeLessThanOrEqual(bar.top + TOLERANCE)
            expect(line.top, `${label}: the letter's end in view`).toBeGreaterThanOrEqual(0)
          }).toPass({ timeout: 10_000 })
          await expectNoHorizontalScroll(page, label)
        })
      }
    })

    test(`the bottom bar's Save is disabled until an edit, busy while saving, and saves (${locale})`, async ({
      page,
      authedUser,
    }) => {
      for (const viewport of NARROW_VIEWPORTS) {
        const label = `${locale} ${viewport.width}x${viewport.height}`
        await test.step(label, async () => {
          const letterId = await insertLetter(authedUser.id)
          const ui = await openEditor(page, locale, letterId, viewport)
          const actions = actionsOf(page, dict)
          await expect(actions.save).toBeDisabled()

          const greeting = `Dear Ms Bottom Bar ${viewport.width},`
          await ui.nav.getByRole('button', { name: editorDict.sections.opening, exact: true }).click()
          await ui.form.locator('input[type="text"]').first().fill(greeting)
          await expect(actions.save, `${label}: enabled by an edit`).toBeEnabled()

          const held = holdRoute(page, LETTER_WRITE_ROUTE, 'continue', 'PATCH')
          await held.ready
          await actions.save.click()
          const saving = page.getByRole('button', { name: dict.common.saving, exact: true })
          await expect(saving, `${label}: busy`).toBeDisabled()
          held.release()
          await expect(actions.save, `${label}: saved, nothing left to save`).toBeDisabled()
          await expect(ui.header.getByText(new RegExp(`^${editorDict.lastSaved} `))).toBeVisible()
          expect(held.requests).toHaveLength(1)
          await page.unroute(LETTER_WRITE_ROUTE)
          const { data } = await admin().from('cover_letters').select('greeting').eq('id', letterId).single()
          expect((data as { greeting: string }).greeting, `${label}: stored`).toBe(greeting)

          // A failed save, started at the bottom of a long section: its
          // notice is scrolled into view.
          await ui.nav.getByRole('button', { name: editorDict.sections.body, exact: true }).click()
          await ui.form.getByRole('button', { name: editorDict.body.addParagraph, exact: true }).click()
          await scrollMain(page, 'bottom')
          const failing = holdRoute(page, LETTER_WRITE_ROUTE, { status: 500, body: '{"message":"stubbed"}' }, 'PATCH')
          await failing.ready
          failing.release()
          await actions.save.click()
          const error = page.getByText(editorDict.saveFailed, { exact: true })
          await expect(error).toBeVisible()
          await expectInViewport(page, error, `${label}: save error`)
          await expect(actions.save, `${label}: still unsaved`).toBeEnabled()
          await page.unroute(LETTER_WRITE_ROUTE)
        })
      }
    })
  })
}

/** The editor's header, on whichever letter the page shows now. */
function editorHeader(page: Page): Locator {
  return page.getByTestId('cover-letter-editor-header')
}

/**
 * Where the bar sits at the bottom of the screen.
 *
 * Below 1024 it is on the screen's edge, with nothing painted under it: its
 * bottom is that of <main>, the area that scrolls, and the viewport's, and
 * the last pixel rows belong to the bar. <main> itself ends 1px below the
 * viewport there: the site header is 65px tall while the dashboard layout
 * sizes the area under it as `h-[calc(100vh-64px)]`, hence the 1px allowed.
 *
 * From 1024 that header is taller still and <main> ends 17px below the
 * viewport, a defect of the dashboard shell, outside this editor. The bar
 * then rests on <main>'s bottom padding instead, so it is whole: it lies
 * inside the viewport. The form scrolls through that padding, so the bar's
 * background reaches down over it: what shows under the bar is the bar (or
 * the page's gutter), never the form or the letter.
 */
async function expectBarOnScreenEdge(page: Page, bar: Locator, label: string) {
  const { width, height } = page.viewportSize()!
  const box = await rect(bar)
  expect(box.top, `${label}: bar top`).toBeGreaterThanOrEqual(0)
  if (width < 1024) {
    const mainBottom = await page.evaluate(() => document.querySelector('main')!.getBoundingClientRect().bottom)
    expect(Math.abs(box.bottom - mainBottom), `${label}: bar bottom ${box.bottom}, <main> ${mainBottom}`).toBeLessThanOrEqual(
      0.5,
    )
    expect(Math.abs(box.bottom - height), `${label}: bar bottom ${box.bottom}, viewport ${height}`).toBeLessThanOrEqual(1)
  } else {
    expect(box.bottom, `${label}: bar bottom ${box.bottom}, viewport ${height}`).toBeLessThanOrEqual(height)
  }
  // At the bottom edge: the bar below 1024; from 1024, the bar or the
  // gutter, never anything else of the editor. A pseudo-element is hit as
  // the element it belongs to, so the bar's extended background is the bar.
  const hits = await bar.evaluate((element) => {
    const editorRoot = document.querySelector('[data-testid="cover-letter-editor-header"]')!.parentElement!
    const { left, right } = element.getBoundingClientRect()
    return [left + 2, (left + right) / 2, right - 2].map((x) => {
      const hit = document.elementFromPoint(x, window.innerHeight - 2)
      if (hit !== null && element.contains(hit)) return 'bar'
      if (hit !== null && editorRoot.contains(hit)) return `editor ${hit.tagName.toLowerCase()}`
      return 'gutter'
    })
  })
  const expected = width < 1024 ? ['bar', 'bar', 'bar'] : hits.map((hit) => (hit === 'bar' ? 'bar' : 'gutter'))
  expect(hits, `${label}: what is painted at the bottom edge`).toEqual(expected)
}

/** Fully inside the viewport where it is, without scrolling to it. */
async function expectInViewport(page: Page, locator: Locator, label: string) {
  const { width, height } = page.viewportSize()!
  const box = await rect(locator)
  expect(box.width, `${label}: width`).toBeGreaterThan(0)
  expect(box.left, `${label}: left`).toBeGreaterThanOrEqual(-0.5)
  expect(box.right, `${label}: right`).toBeLessThanOrEqual(width + 0.5)
  expect(box.top, `${label}: top`).toBeGreaterThanOrEqual(-0.5)
  expect(box.bottom, `${label}: bottom`).toBeLessThanOrEqual(height + 0.5)
}
