import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import { LONG_EXPERIENCE, ONE_PAGE } from './fixtures/page-breaks'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { resolveLayoutModel } from '../src/lib/layout-settings'
import { PAGE_WIDTH_PX } from '../src/lib/resume-page-size'
import type { ResumeTemplate } from '../src/types/database'

/**
 * US-001 (modern-print-sidebar-full-page): a printed Modern CV keeps its
 * sidebar band down to the bottom of every page, the last one included.
 *
 * READ FROM THE PDF. Each case prints the Preview page with `page.pdf()` under
 * print media, as the parity harness does, and rasterises the PDF itself with
 * the pdf.js build pdf-parse bundles, inside Chromium, at 72 dpi so one pixel
 * is one PDF point. No screenshot of the page stands in for the paper: the
 * defect lived only on the paper, below the end of the document on the last
 * page, where no screen capture of the document can look.
 *
 * Three pixel columns are read down every page:
 *
 *   - INSIDE LEFT, 2pt from the page edge, and INSIDE RIGHT, 4pt inside the
 *     band's expected right edge: inside the sidebar's padding, so only
 *     background is there. No row of either may be paper, and no single row
 *     may break a run of one colour (a seam where two fills meet).
 *   - OUTSIDE, 4pt past the band's expected right edge: below the last page's
 *     content it must be paper.
 *
 * Below the lowest text of the last page both inside columns must be exactly
 * the stored sidebar colour, down to the page's last row: that region is
 * where the band used to stop. There, one full pixel row is also read across
 * the page and the band's right edge located where the colour crosses half way
 * from the band to paper; it must lie within 1pt of the stored `sidebarWidth`.
 *
 * WHY 4pt AND A LOCATED EDGE. The band is a CSS gradient with hard stops, which
 * Chromium writes as an axial shading; pdf.js 2.0.550 renders a shading by
 * sampling its function, so a hard stop becomes a ramp about 2pt wide. A column
 * read inside that ramp reads a blend however exact the PDF is, so the exact
 * colour checks keep clear of it and the edge is located instead.
 *
 * WHOLE ROWS ONLY. A4 is 841.89pt tall, so the canvas rounds up to a last
 * pixel row that lies mostly past the page edge; pdf.js anti-aliases what the
 * page paints into it against the canvas, so its colour describes the raster,
 * not the paper. Only the rows wholly inside the page are read.
 */

const SCRATCH_PDF_DIR = process.env.MODERN_PRINT_BAND_PDF_DIR

/** pdf.js bundled with pdf-parse; the same build `e2e/parity/surfaces.ts` reads PDFs with. */
const PDFJS_VERSION = '2.0.550'

/** CSS px to PDF points: 72 / 96. */
const PT_PER_PX = 0.75

/** Distance from the page's left edge the inside-left column is read at, in points. */
const LEFT_INSET_PT = 2

/** Distance either side of the band's right edge the columns are read at, clear of pdf.js's shading ramp. */
const EDGE_INSET_PT = 4

/** How far the located band edge may lie from the stored width, in points. */
const EDGE_TOLERANCE_PT = 1

/** The full row read across the last page, in points above its bottom edge: below any content. */
const ROW_FROM_BOTTOM_PT = 20

/** Per-channel tolerance between the stored colour and the PDF's pixel, for colour-space rounding. */
const CHANNEL_TOLERANCE = 3

/** Points kept clear below the last page's lowest text baseline (descenders, the main column's last line). */
const BELOW_TEXT_CLEARANCE_PT = 20

/** The last page must keep at least this much of itself empty, or it is not "partly filled". */
const MIN_EMPTY_TAIL_PT = 100

let service: SupabaseClient | null = null
function admin(): SupabaseClient {
  const url = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
  const key = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY
  assertLocalSupabase(url, 'The modern print-band check')
  if (!service) service = createClient(url, key, { auth: { persistSession: false } })
  return service
}

async function seedLayout(resumeId: string, layout: Record<string, number>): Promise<void> {
  const { error } = await admin().from('resumes').update({ layout_settings: layout }).eq('id', resumeId)
  if (error) throw new Error(`Could not seed the layout settings: ${error.message}`)
}

type Rgb = readonly [number, number, number]

/** CSS `hsl()` to sRGB, per CSS Color 4, written independently of the app. */
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const s = saturation / 100
  const l = lightness / 100
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

const PAPER: Rgb = [255, 255, 255]

const agrees = (a: Rgb, b: Rgb) => a.every((v, i) => Math.abs(v - b[i]) <= CHANNEL_TOLERANCE)
const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`

interface RasterPage {
  width: number
  /** Pixel rows wholly inside the page; the columns and pixels hold these rows only. */
  height: number
  /** Lowest text baseline on the page, in points from its top; null for a page with no text. */
  lowestTextPt: number | null
  /** One array per requested column: the colour of every pixel row, top to bottom. */
  columns: Rgb[][]
  /** The full pixel row `ROW_FROM_BOTTOM_PT` above the page's bottom edge, left to right. */
  bottomRow: Rgb[]
  /** Every pixel of the page, row-major RGBA, when requested. */
  pixels?: number[]
}

/**
 * Rasterise every page of `pdf` with pdf.js inside Chromium and read the given
 * pixel columns (in points from the page's left edge) top to bottom.
 */
async function rasterise(
  page: Page,
  pdf: Buffer,
  columnsPt: readonly number[],
  options: { scale?: number; allPixels?: boolean } = {},
): Promise<RasterPage[]> {
  const build = path.join(
    path.dirname(require.resolve('pdf-parse/package.json')),
    'lib',
    'pdf.js',
    `v${PDFJS_VERSION}`,
    'build',
  )
  const raster = await page.context().newPage()
  try {
    await raster.setContent('<!doctype html><html><body></body></html>')
    await raster.addScriptTag({ content: readFileSync(path.join(build, 'pdf.worker.js'), 'utf-8') })
    await raster.addScriptTag({ content: readFileSync(path.join(build, 'pdf.js'), 'utf-8') })
    const result = await raster.evaluate(
      async ({ base64, xs, scale, allPixels, rowFromBottom }) => {
        interface PdfJsPage {
          getViewport(scale: number): { width: number; height: number }
          getTextContent(): Promise<{ items: { str: string; transform: number[] }[] }>
          render(parameters: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> }
        }
        interface PdfJs {
          version: string
          getDocument(source: { data: Uint8Array }): {
            promise: Promise<{ numPages: number; getPage(pageNumber: number): Promise<PdfJsPage> }>
          }
        }
        const lib = (window as unknown as Record<string, PdfJs | undefined>)['pdfjs-dist/build/pdf']
        if (!lib) throw new Error('pdf.js did not load into the raster page')
        const doc = await lib.getDocument({ data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) }).promise
        const pages = []
        for (let n = 1; n <= doc.numPages; n++) {
          const pdfPage = await doc.getPage(n)
          const pointViewport = pdfPage.getViewport(1)
          const viewport = pdfPage.getViewport(scale)
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const wholeRows = Math.floor(viewport.height)
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) throw new Error('No 2D canvas context to rasterise the PDF with')
          // Paper first: a region the PDF never paints must read as white, not transparent black.
          context.fillStyle = '#FFFFFF'
          context.fillRect(0, 0, canvas.width, canvas.height)
          await pdfPage.render({ canvasContext: context, viewport }).promise
          const text = await pdfPage.getTextContent()
          const baselines = text.items
            .filter((item) => item.str.trim() !== '')
            .map((item) => pointViewport.height - item.transform[5])
          const columns = xs.map((x) => {
            const data = context.getImageData(Math.round(x * scale), 0, 1, wholeRows).data
            const rows: [number, number, number][] = []
            for (let y = 0; y < wholeRows; y++) rows.push([data[y * 4], data[y * 4 + 1], data[y * 4 + 2]])
            return rows
          })
          const rowData = context.getImageData(0, wholeRows - Math.round(rowFromBottom * scale), canvas.width, 1).data
          const bottomRow: [number, number, number][] = []
          for (let x = 0; x < canvas.width; x++) bottomRow.push([rowData[x * 4], rowData[x * 4 + 1], rowData[x * 4 + 2]])
          pages.push({
            width: canvas.width,
            bottomRow,
            height: wholeRows,
            lowestTextPt: baselines.length ? Math.max(...baselines) : null,
            columns,
            pixels: allPixels ? Array.from(context.getImageData(0, 0, canvas.width, wholeRows).data) : undefined,
          })
        }
        return { version: lib.version, pages }
      },
      { base64: pdf.toString('base64'), xs: [...columnsPt], scale: options.scale ?? 1, allPixels: options.allPixels ?? false, rowFromBottom: ROW_FROM_BOTTOM_PT },
    )
    if (result.version !== PDFJS_VERSION) {
      throw new Error(`The raster page loaded pdf.js ${result.version}, not ${PDFJS_VERSION}`)
    }
    return result.pages
  } finally {
    await raster.close()
  }
}

/** Open the Preview page, settled, the way a user reaches Download PDF. */
async function openPreview(page: Page, resumeId: string): Promise<void> {
  const response = await page.goto(`/en/dashboard/resumes/${resumeId}/preview`)
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  await page.evaluate(() => globalThis.document.fonts.ready)
}

/** Print the open Preview as shipped: controls on, print media, the CSS page size. */
async function printPreview(page: Page, label: string): Promise<Buffer> {
  const toggle = page.getByTestId('controls-toggle')
  await toggle.check({ force: true })
  await expect(toggle).toBeChecked()
  await page.emulateMedia({ media: 'print' })
  const pdf = await page.pdf({ preferCSSPageSize: true })
  await page.emulateMedia({ media: 'screen' })
  if (SCRATCH_PDF_DIR) {
    mkdirSync(SCRATCH_PDF_DIR, { recursive: true })
    writeFileSync(path.join(SCRATCH_PDF_DIR, `${label}.pdf`), pdf)
  }
  return pdf
}

/** The background a page's root and body compute, under the current media. */
async function rootBackgrounds(page: Page) {
  return page.evaluate(() => {
    const read = (element: Element) => {
      const style = getComputedStyle(element)
      return { image: style.backgroundImage, color: style.backgroundColor }
    }
    return { html: read(document.documentElement), body: read(document.body) }
  })
}

interface BandCase {
  name: string
  /** Exactly what is written to `resumes.layout_settings`; null leaves the column unset. */
  layout: Record<string, number> | null
}

const BAND_CASES: readonly BandCase[] = [
  // No stored layout: the Preview draws the model's defaults.
  { name: 'stored defaults', layout: null },
  // The template's own fallback width, stored explicitly.
  { name: 'width 35, default colour', layout: { sidebarWidth: 35 } },
  // Non-default width and colour, so a band drawn from any default cannot pass.
  { name: 'width 42, green', layout: { sidebarWidth: 42, sidebarHue: 150, sidebarSaturation: 60, sidebarBrightness: 28 } },
]

test.describe('modern: the printed sidebar band reaches the bottom of every page', () => {
  for (const bandCase of BAND_CASES) {
    test(`multi-page, ${bandCase.name}: the band covers every page top to bottom, in the stored colour and width`, async ({
      page,
      authedUser,
    }) => {
      const resume = await seedFixtureResume(authedUser.id, 'modern', { experience: LONG_EXPERIENCE })
      if (bandCase.layout) await seedLayout(resume.id, bandCase.layout)
      const model = resolveLayoutModel(bandCase.layout)
      const expectedColour = hslToRgb(model.sidebarHue, model.sidebarSaturation, model.sidebarBrightness)
      const bandWidthPt = (model.sidebarWidth / 100) * PAGE_WIDTH_PX * PT_PER_PX

      await openPreview(page, resume.id)

      // The Preview draws its sidebar from the same stored values the band must follow.
      const drawn = await page.getByTestId('resume-document').evaluate((root) => {
        const sidebar = root.firstElementChild as HTMLElement
        return {
          colour: getComputedStyle(sidebar).backgroundColor,
          widthPx: sidebar.getBoundingClientRect().width,
        }
      })
      expect(drawn.colour, 'the Preview sidebar colour').toBe(`rgb(${expectedColour.join(', ')})`)
      expect(drawn.widthPx * PT_PER_PX, 'the Preview sidebar width, in points').toBeCloseTo(bandWidthPt, 1)

      const pdf = await printPreview(page, `modern-${bandCase.name.replace(/[^a-z0-9]+/gi, '-')}`)
      const insideLeft = LEFT_INSET_PT
      const insideRight = bandWidthPt - EDGE_INSET_PT
      const outside = bandWidthPt + EDGE_INSET_PT
      const pages = await rasterise(page, pdf, [insideLeft, insideRight, outside])

      // Preconditions: several pages, the last one only partly filled.
      expect(pages.length, 'printed pages').toBeGreaterThanOrEqual(2)
      const last = pages[pages.length - 1]
      expect(last.lowestTextPt, 'the last page carries text').not.toBeNull()
      const contentEndPt = (last.lowestTextPt ?? 0) + BELOW_TEXT_CLEARANCE_PT
      expect(last.height - contentEndPt, 'the last page is only partly filled').toBeGreaterThan(MIN_EMPTY_TAIL_PT)

      // On every page, top to bottom: no row of either inside column is paper,
      // and no single row breaks a run of one colour.
      pages.forEach((p, index) => {
        for (const [label, column] of [
          ['inside left', p.columns[0]],
          ['inside right', p.columns[1]],
        ] as const) {
          const paperRows = column.flatMap((rgb, y) => (agrees(rgb, PAPER) ? [y] : []))
          expect(
            paperRows.length === 0 ? 'none' : `rows ${paperRows[0]}-${paperRows[paperRows.length - 1]} (${paperRows.length})`,
            `page ${index + 1}, ${label} column: paper rows in the band`,
          ).toBe('none')
          const seams = column.flatMap((rgb, y) =>
            y > 0 && y < column.length - 1 && agrees(column[y - 1], column[y + 1]) && !agrees(rgb, column[y - 1])
              ? [`y=${y} ${hex(rgb)} in ${hex(column[y - 1])}`]
              : [],
          )
          expect(seams, `page ${index + 1}, ${label} column: one-row seams`).toEqual([])
        }
      })

      // Below the last page's content: exactly the band, to the last row, and paper beside it.
      const from = Math.ceil(contentEndPt)
      for (const [label, column, expected] of [
        ['inside left', last.columns[0], expectedColour],
        ['inside right', last.columns[1], expectedColour],
        ['outside', last.columns[2], PAPER],
      ] as const) {
        const wrong = column
          .slice(from)
          .map((rgb, offset) => ({ y: from + offset, rgb }))
          .filter(({ rgb }) => !agrees(rgb, expected))
        expect(
          wrong.length === 0 ? 'none' : `${wrong.length} rows, first y=${wrong[0].y} ${hex(wrong[0].rgb)}`,
          `last page below the content, ${label} column, expected ${hex(expected)}`,
        ).toBe('none')
      }

      // The band's right edge, located below the last page's content.
      const row = last.bottomRow
      const channel = [0, 1, 2].reduce((best, c) =>
        Math.abs(PAPER[c] - expectedColour[c]) > Math.abs(PAPER[best] - expectedColour[best]) ? c : best,
      )
      const share = (rgb: Rgb) => (rgb[channel] - expectedColour[channel]) / (PAPER[channel] - expectedColour[channel])
      const start = Math.round(insideLeft)
      expect(share(row[start]), 'the located row starts inside the band').toBeLessThan(0.05)
      const crossing = row.findIndex((rgb, x) => x > start && share(rgb) >= 0.5)
      expect(crossing, 'the band ends on the located row').toBeGreaterThan(start)
      const before = share(row[crossing - 1])
      const edgePt = crossing - 1 + (0.5 - before) / (share(row[crossing]) - before) + 0.5
      expect(Math.abs(edgePt - bandWidthPt), `band edge at ${edgePt.toFixed(2)}pt, stored width ${bandWidthPt.toFixed(2)}pt`).toBeLessThanOrEqual(
        EDGE_TOLERANCE_PT,
      )
    })
  }

  /**
   * A one-page CV's document covers its whole page, so the band lies entirely
   * under it. The one place the band can still reach the paper is the
   * sidebar's anti-aliased right edge: the edge pixel there is now the sidebar
   * blended over the band rather than over white. That column, within
   * `EDGE_TOLERANCE_PT` of the edge, is the only difference allowed.
   */
  test('one page: the band adds nothing to the printed page but its sidebar edge', async ({ page, authedUser }) => {
    const stored = { sidebarWidth: 42, sidebarHue: 150, sidebarSaturation: 60, sidebarBrightness: 28 }
    const resume = await seedFixtureResume(authedUser.id, 'modern', ONE_PAGE)
    await seedLayout(resume.id, stored)
    await openPreview(page, resume.id)
    const scale = 2
    const edgePx = (stored.sidebarWidth / 100) * PAGE_WIDTH_PX * PT_PER_PX * scale

    const withBand = await rasterise(page, await printPreview(page, 'modern-one-page'), [], { scale, allPixels: true })
    expect(withBand.length, 'printed pages').toBe(1)

    // The same print with the root and body backgrounds forced to paper, so no
    // band of any kind can be drawn: the page as it printed before the band.
    await page.addStyleTag({
      content:
        '@media print { :root:root:root:root:root { background: white !important } ' +
        'body:not(#__no_band_a):not(#__no_band_b) { background: white !important } }',
    })
    const withoutBand = await rasterise(page, await printPreview(page, 'modern-one-page-no-band'), [], {
      scale,
      allPixels: true,
    })
    expect(withoutBand.length, 'printed pages without any band').toBe(1)

    const a = withBand[0].pixels ?? []
    const b = withoutBand[0].pixels ?? []
    expect(a.length).toBeGreaterThan(0)
    expect(a.length).toBe(b.length)
    const width = withBand[0].width
    const outsideEdge: string[] = []
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue
      const x = (i / 4) % width
      if (Math.abs(x + 0.5 - edgePx) > EDGE_TOLERANCE_PT * scale) outsideEdge.push(`x=${x} y=${Math.floor(i / 4 / width)}`)
    }
    expect(outsideEdge.slice(0, 10), `pixels the band changes away from the sidebar edge (${outsideEdge.length})`).toEqual([])
  })

  test('screen: nothing of the band shows on the Preview page or in the editor', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern', { experience: LONG_EXPERIENCE })
    await seedLayout(resume.id, { sidebarWidth: 42, sidebarHue: 150, sidebarSaturation: 60, sidebarBrightness: 28 })

    await openPreview(page, resume.id)
    await page.emulateMedia({ media: 'screen' })
    const preview = await rootBackgrounds(page)
    expect(preview.html.image, 'Preview page: html background image on screen').toBe('none')
    expect(preview.body.image, 'Preview page: body background image on screen').toBe('none')

    const response = await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId('resume-document').first()).toBeVisible()
    const editor = await rootBackgrounds(page)
    expect(editor.html.image, 'editor: html background image on screen').toBe('none')
    expect(editor.body.image, 'editor: body background image on screen').toBe('none')
  })

  const OTHER_TEMPLATES: readonly ResumeTemplate[] = ['professional', 'classic', 'minimal', 'creative']
  for (const template of OTHER_TEMPLATES) {
    test(`${template}: printing it draws no Modern band`, async ({ page, authedUser }) => {
      const resume = await seedFixtureResume(authedUser.id, template, { experience: LONG_EXPERIENCE })
      await seedLayout(resume.id, { sidebarWidth: 42, sidebarHue: 150, sidebarSaturation: 60, sidebarBrightness: 28 })
      await openPreview(page, resume.id)
      await page.emulateMedia({ media: 'print' })
      const printed = await rootBackgrounds(page)
      await page.emulateMedia({ media: 'screen' })

      // The page root keeps the plain paper globals.css gives every print.
      expect(printed.html, `${template}: html background in print`).toEqual({
        image: 'none',
        color: 'rgb(255, 255, 255)',
      })
      if (template === 'professional') {
        // Professional keeps its own band on body, which this story does not touch.
        expect(printed.body.image, 'professional: body band in print').toMatch(/^linear-gradient\(/)
      } else {
        expect(printed.body, `${template}: body background in print`).toEqual({
          image: 'none',
          color: 'rgb(255, 255, 255)',
        })
      }
    })
  }
})
