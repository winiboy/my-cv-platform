import { readFileSync } from 'node:fs'
import path from 'node:path'
import pdfParse from 'pdf-parse'
import type { Page } from '@playwright/test'

/**
 * Reading a PDF as a user would see it: its pages, their size and their text,
 * and what is painted down given pixel columns. Used to compare two PDFs of the
 * same resume — the one the PDF route returns and the one the Preview prints.
 */

/** pdf.js bundled with pdf-parse; the build `e2e/parity/surfaces.ts` reads PDFs with. */
const PDFJS_VERSION = '2.0.550'

export interface PdfPage {
  /** The page's text in reading order, whitespace collapsed. */
  text: string
  widthPt: number
  heightPt: number
}

export interface ReadPdf {
  pages: PdfPage[]
  /** Image XObjects the file embeds: a raster photo is one, text and vector shapes are not. */
  images: number
}

/** The part of pdf.js's page proxy pdf-parse hands to `pagerender`. */
interface PdfPageProxy {
  view: number[]
  getTextContent(): Promise<{ items: { str: string }[] }>
}

/**
 * Every e2e call to `pdf-parse` goes through here, so that pdf.js is always
 * handed a plain `Uint8Array` with its own ArrayBuffer, never a Node Buffer.
 * The options are passed through unchanged.
 *
 * Why: pdf.js's in-process worker copies a Buffer with
 * `new value.constructor(value)`, that is `new Buffer(buffer)`. Under
 * Playwright's `Buffer.poolSize`, that copy of a PDF under 32 KB is drawn from
 * Node's shared Buffer pool. With a Buffer, the parse intermittently throws
 * "bad XRef entry" on valid bytes; with a plain `Uint8Array`, which pdf.js
 * copies with `new Uint8Array(value)` and never from the pool, it does not.
 * Which allocation corrupts the pooled copy is not identified. The bytes
 * themselves are not changed, only the type that carries them.
 * Measured; see `tasks/prds/e2e-pdf-parse-buffer.md`.
 */
export function parsePdf(pdf: Uint8Array, options?: Parameters<typeof pdfParse>[1]): ReturnType<typeof pdfParse> {
  // `new Uint8Array(typedArray)` copies the elements into a fresh ArrayBuffer,
  // so a Buffer that is a view into the shared pool yields exactly its bytes.
  const bytes = new Uint8Array(pdf)
  // pdf-parse is declared (`src/types/pdf-parse.d.ts`) as taking a Buffer, but
  // at runtime it hands its argument to pdf.js's `getDocument`, which takes any
  // Uint8Array. The plain Uint8Array is the point, so the type is cast here, at
  // the one call, rather than changing a declaration the product code shares.
  return pdfParse(bytes as Buffer, options)
}

export async function readPdf(pdf: Buffer): Promise<ReadPdf> {
  const pages: PdfPage[] = []
  // pdf-parse renders pages one after another, awaiting each, so the order of
  // the calls is the order of the pages.
  await parsePdf(pdf, {
    version: `v${PDFJS_VERSION}`,
    pagerender: async (pageData: unknown) => {
      const proxy = pageData as PdfPageProxy
      const content = await proxy.getTextContent()
      const text = content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim()
      const [x0, y0, x1, y1] = proxy.view
      pages.push({ text, widthPt: x1 - x0, heightPt: y1 - y0 })
      return text
    },
  })
  const images = (pdf.toString('latin1').match(/\/Subtype\s*\/Image\b/g) ?? []).length
  return { pages, images }
}

/** A4 in PDF points, the page every resume surface is drawn on. */
export const A4_PT = { width: 595.28, height: 841.89 }

export type Rgb = readonly [number, number, number]

export interface RasterPage {
  /** Pixel rows wholly inside the page; the columns hold these rows only. */
  height: number
  /** Lowest text baseline on the page, in points from its top; null for a page with no text. */
  lowestTextPt: number | null
  /** One array per requested column: the colour of every pixel row, top to bottom. */
  columns: Rgb[][]
}

/**
 * Rasterise every page of `pdf` with pdf.js inside Chromium at 72 dpi (one
 * pixel per point) and read the given pixel columns, in points from the page's
 * left edge, top to bottom. The approach of
 * `e2e/modern-print-sidebar-full-page.spec.ts`, reduced to the columns.
 */
export async function rasteriseColumns(page: Page, pdf: Buffer, columnsPt: readonly number[]): Promise<RasterPage[]> {
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
    return await raster.evaluate(
      async ({ base64, xs }) => {
        interface PdfJsPage {
          getViewport(scale: number): { width: number; height: number }
          getTextContent(): Promise<{ items: { str: string; transform: number[] }[] }>
          render(parameters: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> }
        }
        interface PdfJs {
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
          const viewport = pdfPage.getViewport(1)
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const wholeRows = Math.floor(viewport.height)
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) throw new Error('No 2D canvas context to rasterise the PDF with')
          context.fillStyle = '#FFFFFF'
          context.fillRect(0, 0, canvas.width, canvas.height)
          await pdfPage.render({ canvasContext: context, viewport }).promise
          const text = await pdfPage.getTextContent()
          const baselines = text.items
            .filter((item) => item.str.trim() !== '')
            .map((item) => viewport.height - item.transform[5])
          const columns = xs.map((x) => {
            const data = context.getImageData(Math.round(x), 0, 1, wholeRows).data
            const rows: [number, number, number][] = []
            for (let y = 0; y < wholeRows; y++) rows.push([data[y * 4], data[y * 4 + 1], data[y * 4 + 2]])
            return rows
          })
          pages.push({ height: wholeRows, lowestTextPt: baselines.length ? Math.max(...baselines) : null, columns })
        }
        return pages
      },
      { base64: pdf.toString('base64'), xs: [...columnsPt] },
    )
  } finally {
    await raster.close()
  }
}
