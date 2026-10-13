import pdfParse from 'pdf-parse'
import { test, expect } from './fixtures/auth'
import {
  fixtureResumeContent,
  seedFixtureResume,
  type FixtureContentOverrides,
  type SeededResume,
} from './fixtures/resume'
import {
  LONG_EXPERIENCE,
  ONE_PAGE,
  expectClearOfPageEdge,
  expectedPages,
} from './fixtures/page-breaks'
import { PAGE_HEIGHT_PX } from '../src/lib/resume-page-size'
import type { Page } from '@playwright/test'

/**
 * US-002: the Preview page marks every edge between two printed A4 sheets, as
 * the editor does (US-001), over the document actually rendered on the page.
 *
 * The Preview draws the CV unscaled, so the indicators are expected at
 * k × PAGE_HEIGHT_PX below the document's top, within 1 px. As in the editor
 * spec, the expected count is computed here from the measured height, and every
 * multi-page case first asserts that the height is clear of a page edge.
 */

interface IndicatorReading {
  page: number
  /** The indicator's offset below the document's top edge. */
  offset: number
  /** The centre of its drawn line, on the same reference. */
  lineOffset: number
  label: string
  labelLeft: number
  /** False when the Preview has no gutter to draw the label in. */
  labelVisible: boolean
  pointerEvents: string
  insideDocument: boolean
}

interface PreviewReading {
  /** The height the page measures: `offsetHeight` of the frame around the document. */
  measuredHeight: number
  documentHeight: number
  documentRight: number
  /**
   * Horizontal overflow of the page's scroll container with the overlay, and
   * with it removed. The dashboard locks the root's height and hides its
   * overflow, so the Preview scrolls inside `<main>`; that is where an overflow
   * the overlay added would show up as a scrollbar.
   */
  pageOverflowX: number
  pageOverflowXWithoutOverlay: number
  /** Width of `<main>`'s content box: the room the sheet and its gutter have. */
  mainContentWidth: number
  indicators: IndicatorReading[]
}

async function readPreview(page: Page): Promise<PreviewReading> {
  return page.evaluate(() => {
    const documentElement = document.querySelector<HTMLElement>('[data-testid="resume-document"]')
    const frame = documentElement?.parentElement
    if (!documentElement || !frame) throw new Error('Preview document not rendered')

    const documentRect = documentElement.getBoundingClientRect()
    const indicators = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="page-break-indicator"]')
    ).map((indicator) => {
      const line = indicator.firstElementChild as HTMLElement
      const lineRect = line.getBoundingClientRect()
      const label = indicator.querySelector<HTMLElement>('[data-testid="page-break-label"]')
      if (!label) throw new Error('Indicator without a label')
      return {
        page: Number(indicator.dataset.page),
        offset: indicator.getBoundingClientRect().top - documentRect.top,
        lineOffset: lineRect.top + lineRect.height / 2 - documentRect.top,
        label: label.textContent ?? '',
        labelLeft: label.getBoundingClientRect().left,
        labelVisible: label.checkVisibility(),
        pointerEvents: getComputedStyle(label).pointerEvents,
        insideDocument: documentElement.contains(indicator),
      }
    })

    const main = document.querySelector<HTMLElement>('main')
    if (!main) throw new Error('No <main> element')
    const root = document.documentElement
    // Both the scroll container and the root, so an overflow cannot escape by
    // moving to whichever one is not measured.
    const overflowX = () =>
      Math.max(main.scrollWidth - main.clientWidth, root.scrollWidth - root.clientWidth)
    const pageOverflowX = overflowX()
    const overlay = document.querySelector<HTMLElement>('[data-testid="page-break-indicators"]')
    let pageOverflowXWithoutOverlay = pageOverflowX
    if (overlay) {
      overlay.style.display = 'none'
      pageOverflowXWithoutOverlay = overflowX()
      overlay.style.display = ''
    }
    const mainStyle = getComputedStyle(main)
    const mainContentWidth =
      main.clientWidth - parseFloat(mainStyle.paddingLeft) - parseFloat(mainStyle.paddingRight)

    return {
      measuredHeight: frame.offsetHeight,
      documentHeight: documentElement.offsetHeight,
      documentRight: documentRect.right,
      pageOverflowX,
      pageOverflowXWithoutOverlay,
      mainContentWidth,
      indicators,
    }
  })
}

/** The indicators match the height of the document on the page, once it has settled. */
async function expectIndicatorsSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const reading = await readPreview(page)
      return reading.indicators.length === expectedPages(reading.measuredHeight) - 1
    })
    .toBe(true)
}

/** Every indicator sits on its sheet edge, outside the CV, and labels the page below it. */
async function expectIndicatorsAligned(
  page: Page,
  labelFor: (page: number) => string
): Promise<PreviewReading> {
  await expectIndicatorsSettled(page)
  const reading = await readPreview(page)
  // The frame the page measures is exactly the document: nothing else in it
  // adds height, so the count is the document's.
  expect(reading.measuredHeight).toBe(reading.documentHeight)
  expectClearOfPageEdge(reading.measuredHeight)
  const pages = expectedPages(reading.measuredHeight)
  expect(pages).toBeGreaterThan(1)
  expect(reading.indicators.map((indicator) => indicator.page)).toEqual(
    Array.from({ length: pages - 1 }, (_, index) => index + 2)
  )

  for (const indicator of reading.indicators) {
    const expected = (indicator.page - 1) * PAGE_HEIGHT_PX
    expect(Math.abs(indicator.offset - expected), `page ${indicator.page} offset`).toBeLessThanOrEqual(1)
    expect(Math.abs(indicator.lineOffset - expected), `page ${indicator.page} line`).toBeLessThanOrEqual(1)
    expect(indicator.label).toBe(labelFor(indicator.page))
    expect(indicator.labelVisible).toBe(true)
    expect(indicator.pointerEvents).toBe('none')
    expect(indicator.insideDocument).toBe(false)
    // In the gutter right of the page, never over the CV.
    expect(indicator.labelLeft).toBeGreaterThanOrEqual(reading.documentRight)
  }
  expect(reading.pageOverflowX).toBe(reading.pageOverflowXWithoutOverlay)
  return reading
}

async function openPreview(
  page: Page,
  resumeId: string,
  locale = 'en',
  width = 1280
): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`/${locale}/dashboard/resumes/${resumeId}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

/**
 * Store a `resume_draft_${id}` draft of the seeded resume with other content,
 * as the editor does for unsaved changes, before the Preview page loads.
 */
async function storeDraft(
  page: Page,
  resume: SeededResume,
  overrides: FixtureContentOverrides
): Promise<void> {
  const draft = {
    id: resume.id,
    user_id: resume.userId,
    title: `Visual baseline - ${resume.template}`,
    template: resume.template,
    ...fixtureResumeContent(overrides),
  }
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`resume_draft_${resume.id}`, JSON.stringify(draft)] as const
  )
}

/** Each page's text and the page count of the PDF the Preview prints, as shipped. */
async function printPdf(page: Page): Promise<{ pages: number; texts: string[] }> {
  await expect(page.getByTestId('controls-toggle')).toBeChecked()
  await page.emulateMedia({ media: 'print' })
  const pdf = await page.pdf({ preferCSSPageSize: true })
  await page.emulateMedia({ media: 'screen' })

  const texts: string[] = []
  const parsed = await pdfParse(pdf, {
    pagerender: async (pageData: unknown) => {
      const content = await (
        pageData as { getTextContent(): Promise<{ items: { str: string }[] }> }
      ).getTextContent()
      const text = content.items.map((item) => item.str).join('')
      texts.push(text)
      return text
    },
  })
  return { pages: parsed.numpages, texts }
}

const indicators = (page: Page) => page.getByTestId('page-break-indicator')

for (const template of ['professional', 'classic'] as const) {
  test(`${template}: a one-page CV shows no indicator`, async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, template, ONE_PAGE)
    await openPreview(page, resume.id)

    const { measuredHeight } = await readPreview(page)
    expect(measuredHeight).toBeGreaterThan(0)
    expect(measuredHeight).toBeLessThanOrEqual(PAGE_HEIGHT_PX)
    if (template === 'professional') {
      // Its minimum height: exactly one page, the boundary case of the rule.
      expect(measuredHeight).toBe(PAGE_HEIGHT_PX)
      expect(measuredHeight).toBe((await readPreview(page)).documentHeight)
    }
    await expect(indicators(page)).toHaveCount(0)
    await expect(page.getByTestId('page-break-indicators')).toHaveCount(0)
  })
}

test('a multi-page CV marks every sheet edge, and its PDF carries no trace of them', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic', { experience: LONG_EXPERIENCE })
  await openPreview(page, resume.id)

  const reading = await expectIndicatorsAligned(page, (n) => `Page ${n}`)

  // Decorative: hidden from assistive technology as a whole.
  await expect(page.getByTestId('page-break-indicators')).toHaveAttribute('aria-hidden', 'true')

  // A click on the line reaches the CV underneath, not the overlay.
  const hit = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>('[data-testid="page-break-indicator"]')
      ?.firstElementChild as HTMLElement | null
    const documentElement = document.querySelector('[data-testid="resume-document"]')
    if (!line || !documentElement) throw new Error('Nothing to hit')
    line.scrollIntoView({ block: 'center' })
    const rect = line.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return !!target && documentElement.contains(target)
  })
  expect(hit).toBe(true)

  // Print media: the overlay is gone.
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByTestId('page-break-indicators')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
  await expect(page.getByTestId('page-break-indicators')).toBeVisible()

  // The printed PDF: one page per sheet the indicators mark, and no label on any of them.
  const pdf = await printPdf(page)
  expect(pdf.pages).toBe(reading.indicators.length + 1)
  expect(pdf.texts).toHaveLength(pdf.pages)
  const printed = pdf.texts.join('\n')
  // The CV itself must be in the text layer, or an absent label would prove nothing.
  expect(printed).toContain('Northwind Systems 1')
  for (const indicator of reading.indicators) {
    expect(printed).not.toContain(indicator.label)
  }
  expect(printed).not.toMatch(/Page\s*\d/)
})

test('the overlay adds no horizontal scroll at any window width', async ({ page, authedUser }) => {
  // Professional draws no editing control outside the sheet on this page, so
  // the sheet alone decides whether <main> overflows. Classic's sliders sit
  // past the sheet's edge and would mask the overlay's overflow with their own.
  const resume = await seedFixtureResume(authedUser.id, 'professional', {
    experience: LONG_EXPERIENCE,
  })
  await openPreview(page, resume.id)
  await expectIndicatorsAligned(page, (n) => `Page ${n}`)

  /**
   * Window widths by what the sheet does there (sidebar from md, scrollbar
   * gutter below xl, p-4/p-6 padding on <main>):
   * - fits: wider than <main>'s content box, but inside its end padding, so
   *   there is no scroll; a label past the sheet's edge would add one;
   * - overflows: the sheet already scrolls; the overlay must not lengthen it;
   * - room: a gutter beside the sheet wide enough for a label, which is drawn.
   * Below that gutter the Preview drops the labels and keeps the lines.
   */
  const cases = [
    { width: 1090, sheet: 'fits' },
    { width: 1095, sheet: 'fits' },
    { width: 1100, sheet: 'fits' },
    { width: 1118, sheet: 'fits' },
    { width: 390, sheet: 'overflows' },
    { width: 767, sheet: 'overflows' },
    { width: 1000, sheet: 'overflows' },
    // Just past the narrowest gutter that holds a label: drawn, and still no scroll.
    { width: 1140, sheet: 'room' },
    { width: 1280, sheet: 'room' },
  ] as const

  for (const { width, sheet } of cases) {
    await page.setViewportSize({ width, height: 900 })
    const reading = await readPreview(page)
    if (sheet === 'overflows') {
      expect(reading.pageOverflowXWithoutOverlay, `${width}px: the sheet overflows`).toBeGreaterThan(0)
    } else {
      expect(reading.pageOverflowXWithoutOverlay, `${width}px: the sheet fits`).toBe(0)
    }
    expect(reading.pageOverflowX, `${width}px: overflow added by the overlay`).toBe(
      reading.pageOverflowXWithoutOverlay
    )
    // The sheet edges stay marked at every width, labelled or not.
    expect(reading.indicators.length, `${width}px`).toBeGreaterThan(0)
    for (const indicator of reading.indicators) {
      const expected = (indicator.page - 1) * PAGE_HEIGHT_PX
      expect(Math.abs(indicator.lineOffset - expected), `${width}px page ${indicator.page}`).toBeLessThanOrEqual(1)
    }
    expect(
      reading.indicators.map((indicator) => indicator.labelVisible),
      `${width}px: labels drawn only where a gutter holds them`
    ).toEqual(reading.indicators.map(() => sheet === 'room'))
  }
})

test('the label follows the Preview locale', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic', { experience: LONG_EXPERIENCE })
  const words: Record<string, string> = { fr: 'Page', de: 'Seite', it: 'Pagina' }

  for (const [locale, word] of Object.entries(words)) {
    await openPreview(page, resume.id, locale)
    await expectIndicatorsAligned(page, (n) => `${word} ${n}`)
  }
})

test('a longer draft restored from localStorage drives the indicators', async ({ page, authedUser }) => {
  // Stored: one page. Draft: several. Only the draft can produce an indicator.
  const resume = await seedFixtureResume(authedUser.id, 'classic', ONE_PAGE)
  await storeDraft(page, resume, { experience: LONG_EXPERIENCE })
  await openPreview(page, resume.id)

  // The Preview says it is showing the draft, and the draft's content is on the page.
  await expect(page.getByText('Preview with unsaved changes')).toBeVisible()
  await expect(page.getByTestId('resume-document')).toContainText('Meridian Labs 10')
  await expectIndicatorsAligned(page, (n) => `Page ${n}`)
})

test('a shorter draft restored from localStorage removes the indicators', async ({
  page,
  authedUser,
}) => {
  // Stored: several pages. Draft: one. The stored content's indicators must not survive.
  const resume = await seedFixtureResume(authedUser.id, 'classic', { experience: LONG_EXPERIENCE })
  await storeDraft(page, resume, ONE_PAGE)
  await openPreview(page, resume.id)

  await expect(page.getByText('Preview with unsaved changes')).toBeVisible()
  await expect(page.getByTestId('resume-document')).not.toContainText('Northwind Systems 1')
  await expectIndicatorsSettled(page)
  expect((await readPreview(page)).measuredHeight).toBeLessThan(PAGE_HEIGHT_PX)
  await expect(indicators(page)).toHaveCount(0)
})

test('an image that finishes loading after the page follows into the indicators without a reload', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic', ONE_PAGE)

  // The image is held until the test releases it, so "after load" is not a race.
  let release: () => void = () => {
    throw new Error('The late image was never requested')
  }
  let markRequested: () => void = () => {}
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve
  })
  await page.route('**/__e2e-late-image.svg', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve
      markRequested()
    })
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="1300"></svg>',
    })
  })

  await openPreview(page, resume.id)
  const before = await readPreview(page)
  expect(before.measuredHeight).toBeLessThan(PAGE_HEIGHT_PX)
  await expect(indicators(page)).toHaveCount(0)

  // Any full navigation would reset this marker; it survives only without a reload.
  await page.evaluate(() => {
    ;(window as unknown as { __noReload: boolean }).__noReload = true
  })

  // Stands in for late-loading content of the document (a photo, a font swap):
  // something inside it whose height is only known once it has loaded.
  await page.evaluate(() => {
    const image = document.createElement('img')
    image.id = 'e2e-late-image'
    image.style.display = 'block'
    image.src = '/__e2e-late-image.svg'
    document.querySelector('[data-testid="resume-document"]')?.appendChild(image)
  })
  await requested
  // Still loading: the document has not grown, and nothing is marked.
  expect((await readPreview(page)).measuredHeight).toBe(before.measuredHeight)
  await expect(indicators(page)).toHaveCount(0)

  release()
  await expect(indicators(page)).toHaveCount(1)
  await expectIndicatorsAligned(page, (n) => `Page ${n}`)

  // And back: the document shrinks, the indicator goes.
  await page.evaluate(() => document.getElementById('e2e-late-image')?.remove())
  await expect(indicators(page)).toHaveCount(0)

  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
})
