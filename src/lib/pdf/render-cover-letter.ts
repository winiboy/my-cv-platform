import type { Browser, BrowserContext, Page } from 'playwright-core'
import {
  buildCoverLetterPdfHtml,
  coverLetterBodyParagraphs,
  type CoverLetterPdfFields,
} from '@/lib/cover-letter-pdf-html'
import type { CoverLetterLanguage } from '@/lib/cover-letter-language'
import { sanitizeRichHtml } from '@/lib/rich-html-sanitizer'
import { launchPdfBrowser, pdfBrowserRuntime } from './browser'
import { SUBSTITUTE_FAMILIES, serverlessFontSubstitutes, type SubstituteFontFace } from './font-substitutes'
import { PdfRenderError, type PdfRenderStage } from './render-preview'

/**
 * Print a cover letter to a PDF in a headless Chromium.
 *
 * ONE LAYOUT. The page is the markup of `buildCoverLetterPdfHtml`, the builder
 * the letters list exported with before this renderer existed, so the PDF has
 * the same template and section order; Chromium prints it as text, with its
 * fonts embedded, instead of a picture of it.
 *
 * WHAT THE PAGE IS. A document set with `page.setContent`, never navigated to:
 * it has no origin, no cookie, no session and nothing of the app. Its content
 * is one user's letter, which is untrusted, so:
 *
 *   - plain-text fields are HTML-escaped by the builder;
 *   - rich-text paragraphs are sanitized by `sanitizeRichHtml`, the editor's
 *     own allowlist, run inside this browser (it needs a DOM, which the server
 *     has nowhere else) BEFORE the letter's markup exists in any document;
 *   - the page's scripts are disabled, so nothing in the markup can run;
 *   - every request is aborted, so no URL in the letter is ever fetched. The
 *     fonts need none: the system's, or on a serverless host the
 *     metric-compatible substitutes, inlined as `data:` URLs.
 *
 * Chromium inherits the allowlisted environment of `browser.ts`, with the
 * launch, sandbox and hardening the resume renderer has.
 *
 * HOW LONG. One deadline covers the whole render, launch included, and the
 * browser is closed in `finally` whatever happened.
 */

export interface RenderCoverLetterPdfInput {
  /** Already shown to exist and to belong to the signed-in user. */
  coverLetter: CoverLetterPdfFields
  /** The date line, pre-formatted (`formatCoverLetterDate`) in `language`. */
  currentDate: string
  /** The letter's display language (`coverLetterLanguage`). */
  language: CoverLetterLanguage
  timeoutMs: number
}

/**
 * The geometry the letter's markup is drawn for (816 x 1056 CSS px, 8.5 x 11
 * in) and that the export has always had: the cover letter was deliberately
 * kept out of the resumes' move to A4.
 */
export const COVER_LETTER_PAGE = { widthPx: 816, heightPx: 1056 } as const

/**
 * The letter's top and bottom margin on a continuation page: the template's
 * own padding, which the first page gets from the markup.
 */
const CONTINUATION_MARGIN_PX = 64

/**
 * The stylesheet the letter is printed with.
 *
 * The builder's markup was written for the dashboard page, which carries
 * Tailwind's preflight: border-box sizing (without it the 816 px letter with
 * its 64 px padding would be 944 px wide) and zero paragraph margins (the
 * builder spaces paragraphs with its own wrappers). Those two are restored
 * here, so the spacing is the export's.
 *
 * Lists get their markers back as the editor shows them, a disc for `ul` and
 * a number for `ol`: preflight removed them, and a list without markers no
 * longer reads as a list. The disc is a "•" character rather than a drawn
 * shape, so it is part of the PDF's text: copied, searched and read by an
 * applicant-tracking parser along with the item it marks.
 *
 * Paging: the template's `min-height` filled exactly one canvas page, and
 * would push a short letter onto a blank second page once the page has a
 * bottom margin, so it is lifted. The first page keeps the template's own top
 * padding; every page gets the bottom margin from `@page`, and continuation
 * pages their top margin, so a long letter flows on with a margin instead of
 * being cut at the page edge. The template's bottom padding is removed for
 * the same reason: on top of the `@page` margin it would add nothing visible
 * but could spill alone onto an otherwise empty last page.
 */
export const COVER_LETTER_PRINT_CSS = [
  '*, ::before, ::after { box-sizing: border-box; }',
  'html, body { margin: 0; padding: 0; background: #ffffff; }',
  'p { margin: 0; }',
  'ul, ol { margin: 0.5rem 0; padding-left: 2rem; }',
  // A bullet and two no-break spaces, as the marker's own text (CSS escapes).
  "ul { list-style-type: '\\2022\\00a0\\00a0'; }",
  'ol { list-style-type: decimal; }',
  `@page { size: ${COVER_LETTER_PAGE.widthPx}px ${COVER_LETTER_PAGE.heightPx}px; margin: ${CONTINUATION_MARGIN_PX}px 0; }`,
  '@page :first { margin-top: 0; }',
  'body > div:first-child { min-height: 0 !important; padding-bottom: 0 !important; }',
].join('\n')

/**
 * `@font-face` rules for the serverless substitutes (`font-substitutes.ts`),
 * under the names of the fonts they stand in for: Georgia for the letter
 * itself, Arial and Calibri for a paragraph whose rich text names them.
 *
 * Every value comes from the installed Fontsource packages, whose stylesheets
 * `parseFontsourceStylesheet` has already reduced to a weight, a style, a
 * `unicode-range` and a base64 `data:` source. None comes from the letter.
 */
export function fontFaceCss(faces: readonly SubstituteFontFace[]): string {
  return faces
    .map(
      (face) =>
        `@font-face { font-family: "${face.family}"; font-style: ${face.style}; font-weight: ${face.weight}; ` +
        `src: ${face.source}; unicode-range: ${face.unicodeRange}; }`,
    )
    .join('\n')
}

/** The complete document the browser prints: the letter's markup and the stylesheet above. */
export function buildCoverLetterPdfDocument(letterHtml: string, faces: readonly SubstituteFontFace[]): string {
  const css = faces.length > 0 ? `${fontFaceCss(faces)}\n${COVER_LETTER_PRINT_CSS}` : COVER_LETTER_PRINT_CSS
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    `<style>${css}</style></head><body>${letterHtml}</body></html>`
  )
}

/** The rich-text fields the builder interpolates, each to be sanitized once. */
export function richTextFields(coverLetter: CoverLetterPdfFields): string[] {
  const fields = [
    coverLetter.opening_paragraph,
    ...coverLetterBodyParagraphs(coverLetter.body_paragraphs),
    coverLetter.closing_paragraph,
  ]
  // Empty strings stay: the builder interpolates an empty body paragraph too.
  return Array.from(new Set(fields.filter((field): field is string => typeof field === 'string')))
}

/**
 * The builder's `sanitizeRichText`, answering from what the browser already
 * sanitized. A field it was not given fails the render rather than reaching
 * the page unsanitized.
 */
export function sanitizedLookup(sanitized: ReadonlyMap<string, string>): (html: string) => string {
  return (html) => {
    const clean = sanitized.get(html)
    if (clean === undefined) throw new Error('A rich-text field reached the PDF markup unsanitized')
    return clean
  }
}

const BLANK_DOCUMENT = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'

export async function renderCoverLetterPdf(input: RenderCoverLetterPdfInput): Promise<Buffer> {
  const launching = launchPdfBrowser({ timeoutMs: input.timeoutMs })
  const fontSubstitutes: Promise<SubstituteFontFace[]> =
    pdfBrowserRuntime(process.env) === 'serverless' ? serverlessFontSubstitutes() : Promise.resolve([])
  // Reported once the browser is up; a launch failing first must not leave
  // this rejection unhandled.
  fontSubstitutes.catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new PdfRenderError('timeout', `PDF render exceeded ${input.timeoutMs} ms`)),
        input.timeoutMs,
      )
    })
    const render = launching.then(
      async (browser) => {
        const fonts = await fontSubstitutes.catch((cause: unknown) => {
          throw new PdfRenderError('fonts', 'Could not read the substitute fonts', { cause })
        })
        return printLetter(browser, input, fonts)
      },
      (cause: unknown) => {
        throw new PdfRenderError('launch', 'Could not launch the PDF browser', { cause })
      },
    )
    return await Promise.race([render, deadline])
  } finally {
    clearTimeout(timer)
    // Awaited even after a timeout: a launch still in flight resolves to a
    // browser that must not be left running.
    const browser = await launching.catch(() => null)
    if (browser) {
      await browser.close().catch((error: unknown) => {
        console.error('Cover letter PDF renderer: closing the browser failed:', error instanceof Error ? error.name : 'unknown')
      })
    }
  }
}

async function printLetter(
  browser: Browser,
  input: RenderCoverLetterPdfInput,
  fonts: readonly SubstituteFontFace[],
): Promise<Buffer> {
  let stage: PdfRenderStage = 'context'
  try {
    const context = await openIsolatedContext(browser, input.timeoutMs)
    const page = await context.newPage()

    stage = 'sanitize'
    await page.setContent(BLANK_DOCUMENT, { waitUntil: 'load' })
    const sanitized = await sanitizeInPage(page, richTextFields(input.coverLetter))
    const letterHtml = buildCoverLetterPdfHtml(input.coverLetter, {
      currentDate: input.currentDate,
      language: input.language,
      sanitizeRichText: sanitizedLookup(sanitized),
    })

    stage = 'navigate'
    await page.setContent(buildCoverLetterPdfDocument(letterHtml, fonts), { waitUntil: 'load' })

    stage = 'settle'
    await settleFonts(page)
    if (fonts.length > 0) await assertSubstitutesLoaded(page)

    stage = 'print'
    await page.emulateMedia({ media: 'print' })
    return await page.pdf({ preferCSSPageSize: true, displayHeaderFooter: false })
  } catch (error) {
    if (error instanceof PdfRenderError) throw error
    throw new PdfRenderError(stage, `PDF render failed at ${stage}`, { cause: error })
  }
}

async function openIsolatedContext(browser: Browser, timeoutMs: number): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: COVER_LETTER_PAGE.widthPx, height: COVER_LETTER_PAGE.heightPx },
    // The page's own scripts never run. `page.evaluate` still does: it is the
    // renderer's code, not the document's.
    javaScriptEnabled: false,
    serviceWorkers: 'block',
    acceptDownloads: false,
  })
  context.setDefaultTimeout(timeoutMs)
  context.setDefaultNavigationTimeout(timeoutMs)
  // Nothing is fetched: the document is set, not loaded, and its fonts are
  // local or inline. Any request is something in the letter asking for a URL.
  await context.route('**/*', (route) => route.abort('blockedbyclient'))
  // Scripts are off, so nothing can open one; closed anyway, as the resume
  // renderer does, so the policy does not rest on that alone.
  await context.routeWebSocket(/.*/, (socket) => socket.close())
  return context
}

/**
 * Each distinct rich-text field through `sanitizeRichHtml`, in the blank page.
 *
 * The function is handed over as its source text, which is why it is written
 * to depend on nothing outside its body (see `rich-html-sanitizer.ts`).
 */
async function sanitizeInPage(page: Page, fields: readonly string[]): Promise<Map<string, string>> {
  const results = await Promise.all(fields.map((field) => page.evaluate(sanitizeRichHtml, field)))
  return new Map(fields.map((field, index) => [field, results[index]]))
}

/**
 * Wait for every font the laid-out letter asked for. Reading `offsetHeight`
 * forces the layout that starts those loads, so `fonts.ready` cannot resolve
 * before they have begun.
 */
async function settleFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await document.fonts.ready
  })
}

/** Fail rather than print with a substitute that did not load, in another font with other line breaks. */
async function assertSubstitutesLoaded(page: Page): Promise<void> {
  const failed = await page.evaluate(
    (families) =>
      Array.from(document.fonts).filter(
        (face) => families.includes(face.family.replace(/^["']|["']$/g, '')) && face.status === 'error',
      ).length,
    SUBSTITUTE_FAMILIES,
  )
  if (failed > 0) throw new PdfRenderError('settle', 'A substitute font failed to load')
}
