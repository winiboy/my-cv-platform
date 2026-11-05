import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { insertLetter, rect, SENDER_NAME } from './fixtures/cover-letter-preview'
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
 * And at 1280 and 1440: no toggle, and the nav, form and pane side by side,
 * the nav still the vertical 192px column with the active tab current.
 */

const TOUCH_TARGET = 44
const PAGE_WIDTH = 816
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
        await expectNoHorizontalScroll(page, label)
      })
    }
  }
})
