import { test, expect } from './fixtures/auth'
import { parsePdf } from './fixtures/pdf'
import { seedFixtureResume, type FixtureContentOverrides } from './fixtures/resume'
import { LONG_EXPERIENCE, ONE_PAGE, sheetsForHeight } from './fixtures/page-breaks'
import type { Page } from '@playwright/test'
import { RESUME_TEMPLATES } from '../src/lib/resume-templates'

/**
 * The printed PDF is the authority on the sheets the Preview draws
 * (swiss-templates-only-page-fidelity US-003; first written for the
 * page-break indicators' US-003).
 *
 * For every template, one CV that fits one page and one that runs past it are
 * opened on the Preview page and printed from there, as a user downloading the
 * PDF does: print media and the page's own `@page` size. The Preview draws no
 * editing control (swiss-cv-templates FR-13). The number of sheets the Preview
 * draws must equal the PDF's page count, and the editor's live preview of the
 * same resume must draw as many sheets as the Preview.
 *
 * The sheets are counted three ways that must agree: the frame's height (n
 * sheets and n − 1 gaps), the sheets drawn, and the page-break indicators
 * (one per sheet after the first). Which items each sheet holds is asserted
 * against the PDF by `resume-preview-pdf-pages.spec.ts`.
 *
 * The measurements are attached to each test as annotations.
 */

const TEMPLATES = RESUME_TEMPLATES

const FIXTURES: { name: string; overrides: FixtureContentOverrides; multiPage: boolean }[] = [
  { name: 'one page', overrides: ONE_PAGE, multiPage: false },
  { name: 'multi-page', overrides: { experience: LONG_EXPERIENCE }, multiPage: true },
]

/** Wide enough for the Preview's gutter and the editor's split view; neither hides an indicator. */
const VIEWPORT = { width: 1280, height: 900 }

const indicators = (page: Page) => page.getByTestId('page-break-indicator')

/**
 * The unscaled height of the frame directly around `resume-document`, the
 * sheets' frame on both surfaces: `offsetHeight` ignores the editor's scaling.
 */
async function measuredHeight(page: Page): Promise<number> {
  return page.getByTestId('resume-document').evaluate((documentElement) => {
    const frame = documentElement.parentElement
    if (!frame) throw new Error('resume-document has no frame')
    return frame.offsetHeight
  })
}

/**
 * Resolve once the surface's height, sheets and indicators agree, then return
 * the height and the sheet count. Polling covers the pagination that follows
 * hydration, font and photo loading.
 */
async function settledSheets(page: Page): Promise<{ height: number; sheets: number }> {
  let reading = { height: 0, sheets: -1 }
  await expect
    .poll(async () => {
      const height = await measuredHeight(page)
      const sheets = await page.getByTestId('resume-sheet').count()
      reading = { height, sheets }
      return sheetsForHeight(height) === sheets && (await indicators(page).count()) === sheets - 1
    })
    .toBe(true)
  return reading
}

/** The PDF a user gets from the Preview page, and the document's height in print media. */
async function printPdf(page: Page): Promise<{ pages: number; printHeight: number }> {
  // The Preview has no controls switch and draws no editing control (swiss-cv-templates FR-13).
  await expect(page.getByTestId('controls-toggle')).toHaveCount(0)
  await page.emulateMedia({ media: 'print' })
  const printHeight = await page
    .getByTestId('resume-document')
    .evaluate((element) => (element as HTMLElement).offsetHeight)
  const pdf = await page.pdf({ preferCSSPageSize: true })
  await page.emulateMedia({ media: 'screen' })
  // Through `parsePdf`, never pdf-parse directly: a Buffer can fail to parse (see `e2e/fixtures/pdf.ts`).
  const parsed = await parsePdf(pdf)
  return { pages: parsed.numpages, printHeight }
}

for (const template of TEMPLATES) {
  for (const fixture of FIXTURES) {
    test(`${template}, ${fixture.name}: the sheets drawn equal the printed PDF's pages, in the Preview and the editor`, async ({
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
      const preview = await settledSheets(page)
      record('preview', { height: preview.height, sheets: preview.sheets })

      if (fixture.multiPage) {
        expect(preview.sheets, 'the long fixture must print on several pages').toBeGreaterThanOrEqual(2)
      } else {
        expect(preview.sheets).toBe(1)
      }

      const pdf = await printPdf(page)
      record('pdf', { printHeight: pdf.printHeight, pages: pdf.pages })
      expect(pdf.pages, 'PDF pages vs Preview sheets').toBe(preview.sheets)

      // The editor's live preview of the same resume.
      await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
      await expect(page.getByTestId('resume-document')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const editor = await settledSheets(page)
      record('editor', { height: editor.height, sheets: editor.sheets })
      expect(editor.sheets, 'editor sheets vs Preview sheets').toBe(preview.sheets)
    })
  }
}
