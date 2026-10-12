import { test, expect } from './fixtures/auth'
import {
  FIXTURE_EDUCATION,
  FIXTURE_EXPERIENCE,
  FIXTURE_LANGUAGES,
  FIXTURE_SKILLS,
  seedFixtureResume,
  type FixtureContentOverrides,
  type FixtureExperience,
} from './fixtures/resume'
import { PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from '../src/lib/resume-page-size'
import type { Page } from '@playwright/test'
import type { ResumeTemplate } from '../src/types/database'

/**
 * US-001: the editor's live preview marks every edge between two printed A4
 * sheets.
 *
 * The preview draws the CV as one continuous page, scaled to the pane. The
 * indicators are expected at unscaled y = k × PAGE_HEIGHT_PX, so on screen at
 * k × PAGE_HEIGHT_PX × scale below the document's top, within 1 px.
 *
 * The expected page count is computed here from the measured height rather
 * than taken from the app, and every multi-page case first asserts that the
 * height is not within a px of a page edge, so the count cannot pass on a
 * rounding coincidence.
 */

const HEIGHT = 900

/**
 * Enough extra roles to push every template well past one page. Invented
 * content; the company name is numbered so no two roles render identically.
 */
const LONG_EXPERIENCE: FixtureExperience[] = Array.from({ length: 10 }, (_, index) => ({
  ...FIXTURE_EXPERIENCE[index % FIXTURE_EXPERIENCE.length],
  company: `${FIXTURE_EXPERIENCE[index % FIXTURE_EXPERIENCE.length].company} ${index + 1}`,
}))

/**
 * A CV short enough for every template to fit one page. The shared fixture
 * does not: it runs onto a second page in all but professional, whose page
 * minimum absorbs it.
 */
const ONE_PAGE: FixtureContentOverrides = {
  summary: 'Product engineer building document tooling for regulated industries.',
  experience: [{ ...FIXTURE_EXPERIENCE[0], achievements: [] }],
  education: [FIXTURE_EDUCATION[0]],
  skills: [FIXTURE_SKILLS[0]],
  projects: [],
  languages: [FIXTURE_LANGUAGES[0]],
  certifications: [],
}

interface IndicatorReading {
  page: number
  /** The indicator's on-screen offset below the document's top edge. */
  offset: number
  /** The centre of its drawn line, on the same reference. */
  lineOffset: number
  label: string
  labelLeft: number
  labelRight: number
  pointerEvents: string
  insideDocument: boolean
}

interface PreviewReading {
  /** The unscaled height the editor measures, `offsetHeight` of the scaled wrapper. */
  unscaledHeight: number
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

/**
 * The page count FR-2 gives for this height, written independently of the app:
 * every sheet edge the document passes by more than 1 px starts a new page.
 */
function expectedPages(unscaledHeight: number): number {
  let pages = 1
  while (unscaledHeight > pages * PAGE_HEIGHT_PX + 1) pages++
  return pages
}

/**
 * Precondition for a multi-page case: the height is clear of every page edge,
 * so the count cannot pass on the tolerance band or a rounding coincidence.
 */
function expectClearOfPageEdge(unscaledHeight: number): void {
  const distance = unscaledHeight % PAGE_HEIGHT_PX
  expect(distance, `height ${unscaledHeight} is within a px of a page edge`).toBeGreaterThan(1)
  expect(PAGE_HEIGHT_PX - distance).toBeGreaterThan(1)
}

/** Every indicator sits on its sheet edge, outside the CV, and labels the page below it. */
async function expectIndicatorsAligned(page: Page, labelFor: (page: number) => string): Promise<PreviewReading> {
  const reading = await readPreview(page)
  expectClearOfPageEdge(reading.unscaledHeight)
  const pages = expectedPages(reading.unscaledHeight)
  expect(pages).toBeGreaterThan(1)
  expect(reading.indicators.map((indicator) => indicator.page)).toEqual(
    Array.from({ length: pages - 1 }, (_, index) => index + 2)
  )

  for (const indicator of reading.indicators) {
    const expected = (indicator.page - 1) * PAGE_HEIGHT_PX * reading.scale
    expect(Math.abs(indicator.offset - expected), `page ${indicator.page} offset`).toBeLessThanOrEqual(1)
    expect(Math.abs(indicator.lineOffset - expected), `page ${indicator.page} line`).toBeLessThanOrEqual(1)
    expect(indicator.label).toBe(labelFor(indicator.page))
    expect(indicator.pointerEvents).toBe('none')
    expect(indicator.insideDocument).toBe(false)
    // The label is in the gutter right of the page, never over the CV, and
    // inside the pane rather than overflowing it.
    expect(indicator.labelLeft).toBeGreaterThanOrEqual(reading.documentRight)
    expect(indicator.labelRight).toBeLessThanOrEqual(reading.paneRight + 0.5)
  }
  // Some templates overflow the pane on their own (classic's in-template
  // controls); the overlay must add nothing to that.
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

const ALL_TEMPLATES: ResumeTemplate[] = ['professional', 'modern', 'classic', 'minimal', 'creative']

for (const template of ALL_TEMPLATES) {
  test(`${template}: a one-page CV shows no indicator`, async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, template, ONE_PAGE)
    await openEditor(page, resume.id, 1280)

    const { unscaledHeight } = await readPreview(page)
    expect(unscaledHeight).toBeGreaterThan(0)
    expect(unscaledHeight).toBeLessThanOrEqual(PAGE_HEIGHT_PX)
    if (template === 'professional' || template === 'modern') {
      // Their minimum height: exactly one page, the boundary case of the rule.
      expect(unscaledHeight).toBe(PAGE_HEIGHT_PX)
    }
    await expect(indicators(page)).toHaveCount(0)
    await expect(page.getByTestId('page-break-indicators')).toHaveCount(0)
  })
}

for (const template of ['professional', 'classic'] as const) {
  test(`${template}: a multi-page CV marks every sheet edge`, async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, template, { experience: LONG_EXPERIENCE })
    await openEditor(page, resume.id, 1280)

    const reading = await expectIndicatorsAligned(page, (n) => `Page ${n}`)
    expect(reading.scale).toBeLessThan(1)

    // Decorative: hidden from assistive technology as a whole.
    await expect(page.getByTestId('page-break-indicators')).toHaveAttribute('aria-hidden', 'true')

    // A click on the line reaches the CV underneath, not the overlay.
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
  const resume = await seedFixtureResume(authedUser.id, 'classic', { experience: LONG_EXPERIENCE })
  const words: Record<string, string> = { fr: 'Page', de: 'Seite', it: 'Pagina' }

  for (const [locale, word] of Object.entries(words)) {
    await openEditor(page, resume.id, 1280, locale)
    await expectIndicatorsAligned(page, (n) => `${word} ${n}`)
  }
})

test('indicators appear and disappear as content is added and removed, without a reload', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic', ONE_PAGE)
  await openEditor(page, resume.id, 1280)

  const before = await readPreview(page)
  expect(before.unscaledHeight).toBeLessThan(PAGE_HEIGHT_PX)
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

  // Remove all of it again: back under one page, no indicator.
  await summary.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await expect(indicators(page)).toHaveCount(0)
  expect((await readPreview(page)).unscaledHeight).toBeLessThan(PAGE_HEIGHT_PX)

  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
})

test('a font scale change that moves the document across a page edge updates the indicators', async ({
  page,
  authedUser,
}) => {
  // Measured: one page at the smallest scale, two at the largest.
  const resume = await seedFixtureResume(authedUser.id, 'classic', { projects: [] })
  await openEditor(page, resume.id, 1280)

  const slider = page.locator('input.font-slider')
  const pagesAt = async (scale: string) => {
    await slider.fill(scale)
    await expectPreviewSettled(page)
    await expect
      .poll(async () => {
        const reading = await readPreview(page)
        return reading.indicators.length === expectedPages(reading.unscaledHeight) - 1
      })
      .toBe(true)
    return expectedPages((await readPreview(page)).unscaledHeight)
  }

  // The setting must actually move the document across an edge for this to prove anything.
  expect(await pagesAt('0.7')).toBe(1)
  await expect(indicators(page)).toHaveCount(0)

  expect(await pagesAt('1.3')).toBeGreaterThan(1)
  await expectIndicatorsAligned(page, (n) => `Page ${n}`)

  expect(await pagesAt('0.7')).toBe(1)
  await expect(indicators(page)).toHaveCount(0)
})

test('indicators stay aligned on a narrow screen', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional', { experience: LONG_EXPERIENCE })
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
  const resume = await seedFixtureResume(authedUser.id, 'professional', { experience: LONG_EXPERIENCE })
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
