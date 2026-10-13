import pdfParse from 'pdf-parse'
import { test, expect } from './fixtures/auth'
import { seedFixtureResume, type FixtureContentOverrides } from './fixtures/resume'
import {
  LONG_EXPERIENCE,
  ONE_PAGE,
  expectClearOfPageEdge,
  expectedPages,
} from './fixtures/page-breaks'
import { PAGE_HEIGHT_PX } from '../src/lib/resume-page-size'
import type { Page } from '@playwright/test'
import type { ResumeTemplate } from '../src/types/database'

/**
 * US-003: the printed PDF is the authority on the page-break indicator.
 *
 * For every template, one CV that fits one page and one that runs past it are
 * opened on the Preview page and printed from there, as a user downloading the
 * PDF does: print media, the page's own `@page` size, the controls toggle in
 * its shipped state (on; it is `print:hidden`, and resume-print-geometry.spec
 * proves print with controls on lays the document out as the screen does).
 * The number of indicators the Preview draws, plus one, must equal the PDF's
 * page count, and the editor's live preview of the same resume must draw as
 * many indicators as the Preview.
 *
 * A match only proves something when the document is not sitting on a sheet
 * edge, where a rounding difference could flip the count either way: every
 * multi-page case first asserts its height is clear of an edge, and that the
 * rule gives at least two pages. The one-page case keeps the edge on purpose
 * for professional and modern, whose minimum height is exactly one page.
 *
 * The measurements are attached to each test as annotations.
 */

const TEMPLATES: ResumeTemplate[] = ['professional', 'modern', 'classic', 'minimal', 'creative']

const FIXTURES: { name: string; overrides: FixtureContentOverrides; multiPage: boolean }[] = [
  { name: 'one page', overrides: ONE_PAGE, multiPage: false },
  { name: 'multi-page', overrides: { experience: LONG_EXPERIENCE }, multiPage: true },
]

/** Wide enough for the Preview's gutter and the editor's split view; neither hides an indicator. */
const VIEWPORT = { width: 1280, height: 900 }

const indicators = (page: Page) => page.getByTestId('page-break-indicator')

/**
 * The unscaled height each surface measures: `offsetHeight` of the element
 * directly around `resume-document` (the Preview's frame, the editor's scaled
 * wrapper), the input of their indicators.
 */
async function measuredHeight(page: Page): Promise<number> {
  return page.getByTestId('resume-document').evaluate((documentElement) => {
    const frame = documentElement.parentElement
    if (!frame) throw new Error('resume-document has no frame')
    return frame.offsetHeight
  })
}

/**
 * Resolve once the surface draws the indicators its current height calls for,
 * then return that height and the count. Polling covers the layout effect and
 * the ResizeObserver that follow hydration and font loading.
 */
async function settledIndicators(page: Page): Promise<{ height: number; count: number }> {
  let reading = { height: 0, count: -1 }
  await expect
    .poll(async () => {
      reading = { height: await measuredHeight(page), count: await indicators(page).count() }
      return reading.height > 0 && reading.count === expectedPages(reading.height) - 1
    })
    .toBe(true)
  return reading
}

/** The PDF a user gets from the Preview page, and the document's height in print media. */
async function printPdf(page: Page): Promise<{ pages: number; printHeight: number }> {
  await expect(page.getByTestId('controls-toggle')).toBeChecked()
  await page.emulateMedia({ media: 'print' })
  const printHeight = await page
    .getByTestId('resume-document')
    .evaluate((element) => (element as HTMLElement).offsetHeight)
  const pdf = await page.pdf({ preferCSSPageSize: true })
  await page.emulateMedia({ media: 'screen' })
  const parsed = await pdfParse(pdf)
  return { pages: parsed.numpages, printHeight }
}

for (const template of TEMPLATES) {
  for (const fixture of FIXTURES) {
    test(`${template}, ${fixture.name}: indicators + 1 equals the printed PDF's pages, in the Preview and the editor`, async ({
      page,
      authedUser,
    }) => {
      // Recorded before each assertion, so a failing run still says which number moved.
      const record = (surface: string, values: Record<string, number>) =>
        test.info().annotations.push({ type: surface, description: JSON.stringify(values) })

      const resume = await seedFixtureResume(authedUser.id, template, fixture.overrides)
      await page.setViewportSize(VIEWPORT)

      // The Preview page, as the user opens it before printing.
      await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
      await expect(page.getByTestId('resume-document')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const preview = await settledIndicators(page)
      record('preview', { height: preview.height, indicators: preview.count })

      if (fixture.multiPage) {
        expectClearOfPageEdge(preview.height)
        expect(expectedPages(preview.height), 'the long fixture must print on several pages').toBeGreaterThanOrEqual(2)
      } else {
        expect(preview.height).toBeLessThanOrEqual(PAGE_HEIGHT_PX)
        expect(preview.count).toBe(0)
        if (template === 'professional' || template === 'modern') {
          // Their minimum height: exactly one page, the edge case of the rule.
          expect(preview.height).toBe(PAGE_HEIGHT_PX)
        }
      }

      const pdf = await printPdf(page)
      record('pdf', { printHeight: pdf.printHeight, pages: pdf.pages })
      expect(pdf.pages, 'PDF pages vs Preview indicators + 1').toBe(preview.count + 1)

      // The editor's live preview of the same resume.
      await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
      await expect(page.getByTestId('resume-document')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const editor = await settledIndicators(page)
      record('editor', { height: editor.height, indicators: editor.count })
      expect(editor.count, 'editor indicators vs Preview indicators').toBe(preview.count)
    })
  }
}
