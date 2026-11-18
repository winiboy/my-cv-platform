import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { insertLetter, rect, type Box } from './fixtures/cover-letter-preview'
import fr from '../src/locales/fr/common.json'
import en from '../src/locales/en/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/**
 * The cover letter editor's save status sits on its own line under the
 * letter's title, at every width, and never hides it
 * (cover-letter-save-status-below-title, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * Every criterion is layout: where the status's box lies relative to the
 * title's, whether the title field spans its column, whether the page
 * scrolls sideways. The time format depends on the browser's Intl data.
 *
 * WHAT IS ASSERTED, in fr, en, de and it, at 1440, 1280, 1024, 768, 375
 * and 320
 *
 *   - On load, before any status, the status's line is already there and
 *     empty: the first edit moves neither the title nor the header's height.
 *   - With a long title typed ("Unsaved changes") and after saving it
 *     ("Saved <time>"): the status's top is at or below the title field's
 *     bottom, its left edge is the title's (within 2px), the two boxes do
 *     not intersect, and the status is inside the header and not hidden
 *     from assistive technology.
 *   - The title field spans its whole column: it is not cut where the
 *     status begins, only at the end of the title area.
 *   - The page and the dashboard's <main> do not scroll sideways.
 *   - Below 1280: Back, the title and "•••" on one row, Back and "•••" at
 *     least 44x44, and the header no taller than its 64px row.
 *   - From 1280: the six header buttons on the title's row, after it, as
 *     before (the row wraps at the group's explicit 13.5rem, whatever the
 *     title's length). The header's height is logged at each width.
 *   - The time is the interface locale's hours and minutes, with no seconds:
 *     the very string `toLocaleTimeString(locale, { hour: '2-digit',
 *     minute: '2-digit' })` gives for the save time, as the CV editor shows.
 */

const LOCALES = { fr, en, de, it } as const
type LocaleCode = keyof typeof LOCALES
type Dict = (typeof LOCALES)[LocaleCode]

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
  { width: 320, height: 640 },
] as const

const XL = 1280
const TOUCH_TARGET = 44
/** Generate, Check, Preview, PDF, Word and Save. */
const XL_HEADER_BUTTONS = 6
const HEADER_MAX_HEIGHT = 64
/** Sub-pixel rounding between layout boxes. */
const TOLERANCE = 1
/** How far the status's left edge may sit from the title's. */
const ALIGN_TOLERANCE = 2

const LONG_TITLE = 'Lettre de motivation - Médecin adjoint·e en pédopsychiatrie'

/** Hours and minutes, no seconds; en is a 12-hour clock. */
const TIME_PATTERN: Record<LocaleCode, RegExp> = {
  fr: /^\d{2}:\d{2}$/,
  de: /^\d{2}:\d{2}$/,
  it: /^\d{2}:\d{2}$/,
  en: /^\d{1,2}:\d{2}\s?[AP]M$/,
}

const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const centre = (box: Box) => (box.top + box.bottom) / 2

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) throw new Error('No <main> element')
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main: main.scrollWidth - main.clientWidth,
    }
  })
  expect(overflow, `${label}: horizontal scroll`).toEqual({ page: 0, main: 0 })
}

/** The status below the title, aligned with it, covering nothing, in the header and in the accessibility tree. */
async function expectStatusBelowTitle(
  page: Page,
  dict: Dict,
  header: Locator,
  title: Locator,
  status: Locator,
  label: string,
) {
  await expect(status, `${label}: status`).toBeVisible()
  const headerBox = await rect(header)
  const titleBox = await rect(title)
  const statusBox = await rect(status)

  expect(statusBox.top, `${label}: status under the title`).toBeGreaterThanOrEqual(titleBox.bottom - TOLERANCE)
  expect(Math.abs(statusBox.left - titleBox.left), `${label}: status aligned with the title`).toBeLessThanOrEqual(
    ALIGN_TOLERANCE,
  )
  expect(intersects(statusBox, titleBox), `${label}: status over the title`).toBe(false)
  expect(statusBox.right, `${label}: status no wider than the title`).toBeLessThanOrEqual(titleBox.right + TOLERANCE)
  expect(statusBox.top, `${label}: status top in the header`).toBeGreaterThanOrEqual(headerBox.top)
  expect(statusBox.bottom, `${label}: status bottom in the header`).toBeLessThanOrEqual(headerBox.bottom)
  expect(statusBox.right, `${label}: status right in the header`).toBeLessThanOrEqual(headerBox.right)
  expect(
    await status.evaluate((element) => element.closest('[aria-hidden="true"]') === null),
    `${label}: status hidden from assistive technology`,
  ).toBe(true)

  // The title spans its column: cut only where the title area ends.
  const columnWidth = await title.evaluate((element) => element.parentElement!.getBoundingClientRect().width)
  expect(titleBox.width, `${label}: title spans its column`).toBeGreaterThanOrEqual(columnWidth - TOLERANCE)

  const width = page.viewportSize()!.width
  if (width < XL) {
    const back = header.getByRole('link', { name: dict.common.back, exact: true })
    const trigger = header.getByRole('button', { name: dict.common.moreActions, exact: true })
    const backBox = await rect(back)
    const triggerBox = await rect(trigger)
    expect(headerBox.height, `${label}: header height`).toBeLessThanOrEqual(HEADER_MAX_HEIGHT)
    for (const [name, box] of [
      ['Back', backBox],
      ['"•••"', triggerBox],
    ] as const) {
      expect(Math.round(box.width), `${label}: ${name} width`).toBeGreaterThanOrEqual(TOUCH_TARGET)
      expect(Math.round(box.height), `${label}: ${name} height`).toBeGreaterThanOrEqual(TOUCH_TARGET)
    }
    expect(Math.abs(centre(backBox) - centre(triggerBox)), `${label}: Back and "•••" on one row`).toBeLessThanOrEqual(
      TOLERANCE,
    )
    expect(backBox.right, `${label}: title after Back`).toBeLessThanOrEqual(titleBox.left + TOLERANCE)
    expect(titleBox.right, `${label}: "•••" after the title`).toBeLessThanOrEqual(triggerBox.left + TOLERANCE)
    expect(statusBox.right, `${label}: status before "•••"`).toBeLessThanOrEqual(triggerBox.left + TOLERANCE)
    expect(statusBox.top, `${label}: status within the row`).toBeGreaterThanOrEqual(backBox.top - TOLERANCE)
    expect(statusBox.bottom, `${label}: status within the row`).toBeLessThanOrEqual(backBox.bottom + TOLERANCE)
  } else {
    // The buttons stay on the title's row, after the title's group.
    const group = await rect(header.getByRole('link', { name: dict.common.back, exact: true }).locator('xpath=..'))
    const buttons = await header.locator('button:visible').all()
    expect(buttons, `${label}: header buttons`).toHaveLength(XL_HEADER_BUTTONS)
    for (const button of buttons) {
      const name = (await button.getAttribute('aria-label')) ?? (await button.innerText())
      const box = await rect(button)
      expect(box.left, `${label}: "${name}" after the title`).toBeGreaterThanOrEqual(group.right - TOLERANCE)
      expect(box.top, `${label}: "${name}" top in the header`).toBeGreaterThanOrEqual(headerBox.top)
      expect(box.bottom, `${label}: "${name}" bottom in the header`).toBeLessThanOrEqual(headerBox.bottom)
      expect(Math.abs(centre(box) - centre(group)), `${label}: "${name}" on the title's row`).toBeLessThanOrEqual(
        TOLERANCE,
      )
    }
  }
  console.log(`${label}: header height ${headerBox.height}px`)
  await expectNoHorizontalScroll(page, label)
}

for (const locale of Object.keys(LOCALES) as LocaleCode[]) {
  const dict = LOCALES[locale]
  const editorDict = dict.coverLetters.editor

  test(`the save status sits under the title, saved and unsaved (${locale})`, async ({ page, authedUser }) => {
    for (const viewport of VIEWPORTS) {
      const label = `${locale} ${viewport.width}x${viewport.height}`
      await test.step(label, async () => {
        const letterId = await insertLetter(authedUser.id)
        await page.setViewportSize(viewport)
        const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
        expect(response?.status()).toBe(200)

        const header = page.getByTestId('cover-letter-editor-header')
        await expect(header).toBeVisible()
        const title = header.getByRole('textbox')
        const unsaved = header.getByText(editorDict.unsavedChanges, { exact: true })
        const saved = header.getByText(new RegExp(`^${escapeRegExp(editorDict.lastSaved)} `))
        await expect(unsaved).toHaveCount(0)
        await expect(saved).toHaveCount(0)

        // On load the status's line is reserved and empty, so the first edit
        // moves nothing.
        const statusLine = title.locator('xpath=following-sibling::p[1]')
        await expect(statusLine, `${label}: reserved status line`).toHaveText('')
        const lineBox = await rect(statusLine)
        expect(lineBox.top, `${label}: reserved line under the title`).toBeGreaterThanOrEqual(
          (await rect(title)).bottom - TOLERANCE,
        )
        expect(Math.round(lineBox.height), `${label}: reserved line height`).toBeGreaterThan(0)
        const titleOnLoad = await rect(title)
        const headerOnLoad = await rect(header)
        console.log(`${label}, on load: header height ${headerOnLoad.height}px`)

        await title.fill(LONG_TITLE)
        await expect(unsaved).toBeVisible()
        const titleEdited = await rect(title)
        expect(
          Math.abs(titleEdited.top - titleOnLoad.top),
          `${label}: title top moved by the first edit`,
        ).toBeLessThanOrEqual(0.5)
        expect(
          Math.abs(titleEdited.bottom - titleOnLoad.bottom),
          `${label}: title bottom moved by the first edit`,
        ).toBeLessThanOrEqual(0.5)
        expect(
          Math.abs((await rect(header)).height - headerOnLoad.height),
          `${label}: header height changed by the first edit`,
        ).toBeLessThanOrEqual(0.5)
        await expectStatusBelowTitle(page, dict, header, title, unsaved, `${label}, unsaved`)

        await page.getByRole('button', { name: dict.common.save, exact: true }).click()
        await expect(saved).toBeVisible()
        await expect(unsaved).toHaveCount(0)
        await expect(title).toHaveValue(LONG_TITLE)
        await expectStatusBelowTitle(page, dict, header, title, saved, `${label}, saved`)

        // The interface locale's hours and minutes, as the CV editor formats
        // them. The save happened within the last minute, so the time shown is
        // one of the two minutes up to now.
        const text = (await saved.textContent())!.trim()
        const time = text.slice(editorDict.lastSaved.length).trim()
        expect(time, `${label}: time "${time}" in the locale's hours and minutes`).toMatch(TIME_PATTERN[locale])
        const expected = await page.evaluate((code) => {
          const now = Date.now()
          return [now, now - 60_000].map((at) =>
            new Date(at).toLocaleTimeString(code, { hour: '2-digit', minute: '2-digit' }),
          )
        }, locale)
        expect(expected, `${label}: time "${time}" formatted as toLocaleTimeString(${locale})`).toContain(time)
      })
    }
  })
}
