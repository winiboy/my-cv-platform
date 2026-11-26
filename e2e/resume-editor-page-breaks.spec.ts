import { test, expect } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import { LONG_EXPERIENCE, ONE_PAGE, sheetTopFor, sheetsForHeight } from './fixtures/page-breaks'
import { PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from '../src/lib/resume-page-size'
import { SHEET_GAP_PX } from '../src/lib/resume-sheets'
import type { Page } from '@playwright/test'
import type { ResumeTemplate } from '../src/types/database'
import { RESUME_TEMPLATES } from '../src/lib/resume-templates'

/**
 * The editor's live preview draws the CV as separate A4 sheets, a gap apart,
 * scaled to the pane (swiss-templates-only-page-fidelity US-003, replacing
 * the dashed edge indicators of the page-break US-001), and labels every
 * sheet after the first in the gutter.
 *
 * Sheet n is expected at unscaled y = (n − 1) × (PAGE_HEIGHT_PX + gap), so on
 * screen at that × scale below the document's top, within 1 px, with its gap
 * just above. The expected count is computed here from the measured height,
 * which is a whole number of sheets once settled, rather than taken from the
 * app.
 *
 * What this checks is internal consistency: the sheets, gaps and labels agree
 * with the frame's own height and with each other at the pane's scale. It does
 * not check that the sheets break where print breaks; that rests on
 * e2e/resume-page-break-pdf-count.spec.ts (the sheet count against the printed
 * page count) and e2e/resume-preview-pdf-pages.spec.ts (each sheet's text
 * against its PDF page's, in the Editor too).
 */

const HEIGHT = 900

interface IndicatorReading {
  page: number
  /** The indicator's on-screen offset below the document's top edge. */
  offset: number
  /** The centre of the gap drawn above its sheet, on the same reference. */
  lineOffset: number
  label: string
  labelLeft: number
  labelRight: number
  pointerEvents: string
  insideDocument: boolean
}

interface PreviewReading {
  /** The unscaled height of the sheets' frame, `offsetHeight` inside the scaled wrapper. */
  unscaledHeight: number
  /** Sheets drawn behind the document. */
  sheets: number
  scale: number
  documentRight: number
  paneRight: number
  /** Horizontal overflow of the pane with the overlay, and with it removed. */
  paneOverflowX: number
  paneOverflowXWithoutOverlay: number
  indicators: IndicatorReading[]
}

async function readPreview(page: Page): Promise<PreviewReading> {
  return page.evaluate((pageWidth) => {
    const documentElement = document.querySelector<HTMLElement>('[data-testid="resume-document"]')
    const pane = document.querySelector<HTMLElement>('[data-testid="resume-editor-preview"]')
    const wrapper = documentElement?.parentElement
    if (!documentElement || !pane || !wrapper) throw new Error('Editor preview not rendered')

    const documentRect = documentElement.getBoundingClientRect()
    const paneRect = pane.getBoundingClientRect()
    const indicators = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="page-break-indicator"]')
    ).map((indicator) => {
      const line = indicator.firstElementChild as HTMLElement
      const lineRect = line.getBoundingClientRect()
      const label = indicator.querySelector<HTMLElement>('[data-testid="page-break-label"]')
      if (!label) throw new Error('Indicator without a label')
      const labelRect = label.getBoundingClientRect()
      return {
        page: Number(indicator.dataset.page),
        offset: indicator.getBoundingClientRect().top - documentRect.top,
        lineOffset: lineRect.top + lineRect.height / 2 - documentRect.top,
        label: label.textContent ?? '',
        labelLeft: labelRect.left,
        labelRight: labelRect.right,
        pointerEvents: getComputedStyle(label).pointerEvents,
        insideDocument: documentElement.contains(indicator),
      }
    })

    const paneOverflowX = pane.scrollWidth - pane.clientWidth
    const overlay = document.querySelector<HTMLElement>('[data-testid="page-break-indicators"]')
    let paneOverflowXWithoutOverlay = paneOverflowX
    if (overlay) {
      overlay.style.display = 'none'
      paneOverflowXWithoutOverlay = pane.scrollWidth - pane.clientWidth
      overlay.style.display = ''
    }

    return {
      unscaledHeight: wrapper.offsetHeight,
      sheets: wrapper.querySelectorAll('[data-testid="resume-sheet"]').length,
      scale: documentRect.width / pageWidth,
      documentRight: documentRect.right,
      // The pane's padding box: the gutter the labels are drawn in.
      paneRight: paneRect.left + pane.clientLeft + pane.clientWidth,
      paneOverflowX,
      paneOverflowXWithoutOverlay,
      indicators,
    }
  }, PAGE_WIDTH_PX)
}

/** The sheets, the frame's height and the indicators agree: the pagination has settled. */
async function expectSheetsSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const reading = await readPreview(page)
      const sheets = sheetsForHeight(reading.unscaledHeight)
      return sheets !== null && reading.sheets === sheets && reading.indicators.length === sheets - 1
    })
    .toBe(true)
}

/** Every indicator sits on the top of its sheet, outside the CV, and labels it. */
async function expectIndicatorsAligned(page: Page, labelFor: (page: number) => string): Promise<PreviewReading> {
  await expectSheetsSettled(page)
  const reading = await readPreview(page)
  const pages = sheetsForHeight(reading.unscaledHeight) ?? 0
  expect(pages).toBeGreaterThan(1)
  expect(reading.indicators.map((indicator) => indicator.page)).toEqual(
    Array.from({ length: pages - 1 }, (_, index) => index + 2)
  )

  for (const indicator of reading.indicators) {
    const expected = sheetTopFor(indicator.page) * reading.scale
    const gap = (sheetTopFor(indicator.page) - SHEET_GAP_PX / 2) * reading.scale
    expect(Math.abs(indicator.offset - expected), `page ${indicator.page} offset`).toBeLessThanOrEqual(1)
    expect(Math.abs(indicator.lineOffset - gap), `page ${indicator.page} gap`).toBeLessThanOrEqual(1)
    expect(indicator.label).toBe(labelFor(indicator.page))
    expect(indicator.pointerEvents).toBe('none')
    expect(indicator.insideDocument).toBe(false)
    // The label is in the gutter right of the page, never over the CV, and
    // inside the pane rather than overflowing it.
    expect(indicator.labelLeft).toBeGreaterThanOrEqual(reading.documentRight)
    expect(indicator.labelRight).toBeLessThanOrEqual(reading.paneRight + 0.5)
  }
  // A template may overflow the pane on its own; the overlay must add nothing
  // to that.
  expect(reading.paneOverflowX).toBe(reading.paneOverflowXWithoutOverlay)
  return reading
}

async function openEditor(page: Page, resumeId: string, width: number, locale = 'en'): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT })
  await page.goto(`/${locale}/dashboard/resumes/${resumeId}/edit`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  await expectPreviewSettled(page)
}

/** The frame follows the measured height, so the overlay has its final input. */
async function expectPreviewSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const frame = await page.getByTestId('resume-editor-preview-frame').boundingBox()
      const documentBox = await page.getByTestId('resume-document').boundingBox()
      return !!frame && !!documentBox && Math.abs(frame.height - documentBox.height) <= 1
    })
    .toBe(true)
}

const indicators = (page: Page) => page.getByTestId('page-break-indicator')

const ALL_TEMPLATES: readonly ResumeTemplate[] = RESUME_TEMPLATES

for (const template of ALL_TEMPLATES) {
  test(`${template}: a one-page CV shows one full sheet and no indicator`, async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, template, ONE_PAGE)
    await openEditor(page, resume.id, 1280)
    await expectSheetsSettled(page)

    const { unscaledHeight, sheets } = await readPreview(page)
    expect(unscaledHeight).toBe(PAGE_HEIGHT_PX)
    expect(sheets).toBe(1)
    await expect(indicators(page)).toHaveCount(0)
    await expect(page.getByTestId('page-break-indicators')).toHaveCount(0)
  })
}

for (const template of ['swissCommerce', 'swissTrades'] as const) {
  test(`${template}: a multi-page CV is drawn on separate sheets`, async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, template, { experience: LONG_EXPERIENCE })
    await openEditor(page, resume.id, 1280)

    const reading = await expectIndicatorsAligned(page, (n) => `Page ${n}`)
    expect(reading.scale).toBeLessThan(1)

    // Decorative: hidden from assistive technology as a whole.
    await expect(page.getByTestId('page-break-indicators')).toHaveAttribute('aria-hidden', 'true')

    // A click on a gap reaches the CV underneath, not the overlay.
    const hit = await page.evaluate(() => {
      const line = document.querySelector<HTMLElement>('[data-testid="page-break-indicator"]')
        ?.firstElementChild as HTMLElement | null
      const documentElement = document.querySelector('[data-testid="resume-document"]')
      if (!line || !documentElement) throw new Error('Nothing to hit')
      const rect = line.getBoundingClientRect()
      line.scrollIntoView({ block: 'center' })
      const after = line.getBoundingClientRect()
      const target = document.elementFromPoint(rect.left + rect.width / 2, after.top + after.height / 2)
      return !!target && documentElement.contains(target)
    })
    expect(hit).toBe(true)

    // Print media: the overlay is gone and the document is untouched.
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByTestId('page-break-indicators')).toBeHidden()
    await page.emulateMedia({ media: 'screen' })
    await expect(page.getByTestId('page-break-indicators')).toBeVisible()
  })
}

test('the label follows the editor locale', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce', { experience: LONG_EXPERIENCE })
  const words: Record<string, string> = { fr: 'Page', de: 'Seite', it: 'Pagina' }

  for (const [locale, word] of Object.entries(words)) {
    await openEditor(page, resume.id, 1280, locale)
    await expectIndicatorsAligned(page, (n) => `${word} ${n}`)
  }
})

test('sheets appear and disappear as content is added and removed, without a reload', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce', ONE_PAGE)
  await openEditor(page, resume.id, 1280)

  await expectSheetsSettled(page)
  const before = await readPreview(page)
  expect(before.unscaledHeight).toBe(PAGE_HEIGHT_PX)
  await expect(indicators(page)).toHaveCount(0)

  // Any full navigation would reset this marker; it survives only without a reload.
  await page.evaluate(() => {
    ;(window as unknown as { __noReload: boolean }).__noReload = true
  })

  await page.getByTestId('resume-editor-section-nav').getByRole('button', { name: 'Summary' }).click()
  const summary = page.locator('#summary-editor')
  await summary.click()
  await page.keyboard.press('End')
  const sentence = 'Shipped a deterministic layout engine across five document templates. '
  await page.keyboard.insertText(' ' + sentence.repeat(60))

  await expect(indicators(page)).toHaveCount(1)
  await expectPreviewSettled(page)
  await expectIndicatorsAligned(page, (n) => `Page ${n}`)

  // Remove all of it again: back to one sheet, no indicator.
  await summary.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await expect(indicators(page)).toHaveCount(0)
  await expectSheetsSettled(page)
  expect((await readPreview(page)).unscaledHeight).toBe(PAGE_HEIGHT_PX)

  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
})

test('indicators stay aligned on a narrow screen', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', { experience: LONG_EXPERIENCE })
  await openEditor(page, resume.id, 390)

  await expectIndicatorsAligned(page, (n) => `Page ${n}`)

  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) throw new Error('No <main> element')
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      main: main.scrollWidth - main.clientWidth,
    }
  })
  expect(overflow).toEqual({ page: 0, main: 0 })
})

test('indicators stay aligned after the split divider is dragged', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', { experience: LONG_EXPERIENCE })
  await openEditor(page, resume.id, 1440)

  const before = await expectIndicatorsAligned(page, (n) => `Page ${n}`)

  const divider = page.locator('.cursor-col-resize')
  const handle = await divider.boundingBox()
  if (!handle) throw new Error('Split divider not rendered')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x - 150, handle.y + handle.height / 2, { steps: 5 })
  await page.mouse.up()

  await expect.poll(async () => (await readPreview(page)).scale).toBeGreaterThan(before.scale + 0.05)
  await expectPreviewSettled(page)
  await expectIndicatorsAligned(page, (n) => `Page ${n}`)
})
