import { test, expect } from './fixtures/auth'
import { FIXTURE_EXPERIENCE, seedFixtureResume } from './fixtures/resume'
import { A4_PT, rasteriseColumns, readPdfTextItems, type PdfTextItem, type Rgb } from './fixtures/pdf'
import type { ResumeTemplate } from '../src/types/database'
import { SWISS_VOCATIONAL_GEOMETRY } from '../src/lib/swiss-vocational-template'
import { SWISS_COMMERCE_GEOMETRY } from '../src/lib/swiss-commerce-template'
import { SWISS_TRADES_GEOMETRY } from '../src/lib/swiss-trades-template'
import { SWISS_HEALTH_GEOMETRY } from '../src/lib/swiss-health-template'
import { SWISS_FINANCE_GEOMETRY } from '../src/lib/swiss-finance-template'
import { SWISS_ENGINEERING_GEOMETRY } from '../src/lib/swiss-engineering-template'
import { SWISS_VOCATIONAL_ACCENT } from '../src/lib/resume-graphics'
import { PAGE_WIDTH_PX } from '../src/lib/resume-page-size'
import { DOCX_PALETTE } from '../src/app/api/resumes/[id]/download-docx/docx-palette'

/**
 * swiss-templates-only-page-fidelity US-002: every printed page of the six
 * Swiss templates that had none keeps a top margin after page 1 and a foot
 * margin on every page, while the backgrounds that run to the paper's edges
 * still do, on every page.
 *
 * Each case prints a two-page CV through the real PDF route and reads the
 * PDF: text positions from pdf.js (`readPdfTextItems`), and the edge-to-edge
 * backgrounds from the pages rasterised at one pixel per point
 * (`rasteriseColumns`). A margin is asserted on the glyphs' font-size box
 * (baseline minus the font size, baseline plus a quarter of it for
 * descenders), with 2pt of tolerance for that approximation, as the
 * per-template specs measure swissFirstJob's.
 */

/** A pixel column, in points from the page's left edge, that must be `colour` from the paper's top edge to its foot. */
interface EdgeToEdgeColumn {
  label: string
  xPt: number
  colour: Rgb
}

interface Case {
  template: ResumeTemplate
  /** Every page after the first: no glyph above this, in px. */
  pageTop: number
  /** Every page: no glyph below this distance from the foot, in px. */
  pageBottom: number
  /** Page 1's first glyph line starts here, in px, as on screen; null where the first text sits in a band. */
  firstPageTextTop: number | null
  /** Backgrounds that reach the paper's top and foot on every page. */
  everyPage: EdgeToEdgeColumn[]
  /** Backgrounds that reach the paper's top edge on page 1 only, checked over `rows` pixel rows from the top. */
  firstPageTop?: { columns: EdgeToEdgeColumn[]; rows: number }
}

const rgb = (hex: string): Rgb => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
const pt = (px: number) => px * 0.75

const CASES: readonly Case[] = [
  {
    template: 'swissVocational',
    pageTop: SWISS_VOCATIONAL_GEOMETRY.pageTop,
    pageBottom: SWISS_VOCATIONAL_GEOMETRY.pageBottom,
    firstPageTextTop: SWISS_VOCATIONAL_GEOMETRY.paddingY,
    // The red strip down the paper's left edge, in its middle.
    everyPage: [{ label: 'red strip', xPt: pt(SWISS_VOCATIONAL_ACCENT.stripPx / 2), colour: rgb(DOCX_PALETTE.swissVocational['red-700']) }],
  },
  {
    template: 'swissCommerce',
    pageTop: SWISS_COMMERCE_GEOMETRY.pageTop,
    pageBottom: SWISS_COMMERCE_GEOMETRY.pageBottom,
    firstPageTextTop: null,
    everyPage: [],
    // The navy band meets the paper's top edge on page 1, at both side edges,
    // over the band's top padding, which holds no text.
    firstPageTop: {
      rows: Math.floor(pt(SWISS_COMMERCE_GEOMETRY.bandPaddingY)),
      columns: [
        { label: 'band, left edge', xPt: 2, colour: rgb(DOCX_PALETTE.swissCommerce.navy) },
        { label: 'band, right edge', xPt: A4_PT.width - 2, colour: rgb(DOCX_PALETTE.swissCommerce.navy) },
      ],
    },
  },
  {
    template: 'swissTrades',
    pageTop: SWISS_TRADES_GEOMETRY.pageTop,
    pageBottom: SWISS_TRADES_GEOMETRY.pageBottom,
    firstPageTextTop: SWISS_TRADES_GEOMETRY.sidebarPaddingTop,
    // The dark column, clear of its text: at the paper's left edge, and in its right padding.
    everyPage: [
      { label: 'dark column, left edge', xPt: 2, colour: rgb(DOCX_PALETTE.swissTrades.sidebar) },
      {
        label: 'dark column, right padding',
        xPt: pt(SWISS_TRADES_GEOMETRY.sidebarWidth - SWISS_TRADES_GEOMETRY.sidebarPaddingX / 2),
        colour: rgb(DOCX_PALETTE.swissTrades.sidebar),
      },
    ],
  },
  {
    template: 'swissHealth',
    pageTop: SWISS_HEALTH_GEOMETRY.pageTop,
    pageBottom: SWISS_HEALTH_GEOMETRY.pageBottom,
    firstPageTextTop: SWISS_HEALTH_GEOMETRY.paddingTop,
    everyPage: [],
  },
  {
    template: 'swissFinance',
    pageTop: SWISS_FINANCE_GEOMETRY.pageTop,
    pageBottom: SWISS_FINANCE_GEOMETRY.pageBottom,
    firstPageTextTop: SWISS_FINANCE_GEOMETRY.paddingTop,
    everyPage: [],
  },
  {
    template: 'swissEngineering',
    pageTop: SWISS_ENGINEERING_GEOMETRY.pageTop,
    pageBottom: SWISS_ENGINEERING_GEOMETRY.pageBottom,
    firstPageTextTop: SWISS_ENGINEERING_GEOMETRY.columnPaddingTop,
    // The blue bar in its middle, and the light column at the paper's right edge, clear of its text.
    everyPage: [
      {
        label: 'blue bar',
        xPt: pt(PAGE_WIDTH_PX - SWISS_ENGINEERING_GEOMETRY.columnWidth + SWISS_ENGINEERING_GEOMETRY.columnBar / 2),
        colour: rgb(DOCX_PALETTE.swissEngineering.bar),
      },
      { label: 'light column, right edge', xPt: A4_PT.width - 2, colour: rgb(DOCX_PALETTE.swissEngineering.column) },
    ],
  },
]

/** Fourteen roles, two achievements each: enough to run every template onto a second page. */
const LONG_EXPERIENCE = Array.from({ length: 14 }, (_, index) => ({
  ...FIXTURE_EXPERIENCE[0],
  company: `Continuation Works ${index + 1}`,
  achievements: ['A first achievement long enough to fill its line of the page.', 'A second achievement, also drawn.'],
}))

const glyphTop = (items: PdfTextItem[]) => Math.min(...items.map((item) => item.baseline - item.fontSize))
const glyphBottom = (items: PdfTextItem[]) => Math.max(...items.map((item) => item.baseline + item.fontSize * 0.25))
const agrees = (actual: Rgb, expected: Rgb) => actual.every((channel, i) => Math.abs(channel - expected[i]) <= 6)
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const WHITE: Rgb = [255, 255, 255]

/**
 * The rows of a pixel column that are not `expected`, leaving out a lone
 * anti-aliased row nearer `expected` than the paper: the seam pdf.js draws
 * where the document's own column ends at a fractional px over the same
 * colour painted under it. Two such rows in a row, or one nearer white, is a
 * gap and is kept.
 */
function offRows(rows: Rgb[], expected: Rgb): { colour: Rgb; row: number }[] {
  const off = (row: number) => row >= 0 && row < rows.length && !agrees(rows[row], expected)
  return rows
    .map((colour, row) => ({ colour, row }))
    .filter(({ row }) => off(row))
    .filter(({ colour, row }) => off(row - 1) || off(row + 1) || distance(colour, expected) >= distance(colour, WHITE))
}

for (const c of CASES) {
  test(`${c.template}: a two-page PDF keeps a top margin after page 1 and a foot margin on every page, its full-bleed backgrounds still edge to edge`, async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, c.template, { experience: LONG_EXPERIENCE })
    // A page of the app first, so the request carries the session.
    const preview = await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
    expect(preview?.status(), 'the Preview server render').toBe(200)
    await expect(page.getByTestId('resume-document')).toBeVisible()

    const response = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
      timeout: 90_000,
    })
    expect(response.status()).toBe(200)
    const pdf = await response.body()
    const pages = await readPdfTextItems(pdf)
    expect(pages.length, 'the CV runs onto a second page').toBeGreaterThanOrEqual(2)

    // Page 1 starts where the screen draws it. The name's large type, set
    // tighter than its size, rises up to 4pt above its line box's top; the
    // exact page-1 look is the visual suite's to hold.
    if (c.firstPageTextTop !== null) {
      expect(glyphTop(pages[0]), 'page 1: first text').toBeGreaterThanOrEqual(pt(c.firstPageTextTop) - 4)
      expect(glyphTop(pages[0]), 'page 1: first text').toBeLessThan(pt(c.firstPageTextTop) + 12)
    }
    pages.forEach((items, index) => {
      expect(items.length, `page ${index + 1} holds text`).toBeGreaterThan(0)
      // Every page after the first: no glyph above the top margin.
      if (index > 0) expect(glyphTop(items), `page ${index + 1}: top margin`).toBeGreaterThanOrEqual(pt(c.pageTop) - 2)
      // Every page: the last line ends at least the foot margin above the paper's bottom edge.
      expect(A4_PT.height - glyphBottom(items), `page ${index + 1}: foot margin`).toBeGreaterThanOrEqual(pt(c.pageBottom) - 2)
    })

    const columns = [...c.everyPage, ...(c.firstPageTop?.columns ?? [])]
    if (columns.length === 0) return
    const raster = await rasteriseColumns(
      page,
      pdf,
      columns.map((column) => column.xPt),
    )
    expect(raster.length).toBe(pages.length)
    raster.forEach((rasterPage, index) => {
      columns.forEach((column, columnIndex) => {
        const firstPageOnly = columnIndex >= c.everyPage.length
        if (firstPageOnly && index > 0) return
        const rows = firstPageOnly ? rasterPage.columns[columnIndex].slice(0, c.firstPageTop!.rows) : rasterPage.columns[columnIndex]
        const off = offRows(rows, column.colour)
        const summary = off.length === 0 ? null : { rows: off.length, first: off[0], last: off[off.length - 1] }
        expect(summary, `page ${index + 1}, ${column.label}: rows not its colour (of ${rows.length})`).toBeNull()
      })
    })
  })
}
