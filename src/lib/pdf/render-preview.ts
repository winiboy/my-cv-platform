import type { APIResponse, Browser, BrowserContext, Page } from 'playwright-core'
import type { Locale } from '@/lib/i18n'
import { layoutCacheKey } from '@/lib/resume-layout-store'
import { launchPdfBrowser, pdfBrowserRuntime } from './browser'
import {
  SUBSTITUTE_FAMILIES,
  registerFontSubstitutes,
  serverlessFontSubstitutes,
  type SubstituteFontFace,
} from './font-substitutes'
import type { NamedCookie } from './render-policy'
import { createRendererRouteHandler } from './route-guard'

/**
 * Print the resume's Preview page to a PDF in a headless Chromium.
 *
 * WHY THE PREVIEW PAGE ITSELF. The PDF must be the document the user sees and
 * prints. Rendering the real page — its server component, its client
 * hydration, its templates and `globals.css`'s print rules — makes it that
 * document by construction: there is no second layout of the CV to drift from
 * the first. The same is true of sanitization: the draft's rich text goes
 * through the Preview's own browser-side `sanitizeHtml`, exactly as it does
 * for the user, rather than through a server copy of it.
 *
 * WHAT THE PAGE IS GIVEN, AND NOTHING ELSE
 *
 *   - The user's Supabase session cookies, for the app's origin only and
 *     HttpOnly, so the page's own scripts cannot read them.
 *   - The draft and the photo, written into localStorage under the keys the
 *     Preview reads, for this resume id only, as data passed to an init
 *     script — never spliced into script source.
 *   - On a serverless host only, metric-compatible stand-ins for Arial,
 *     Calibri and Georgia, registered as font faces under those names
 *     (`font-substitutes.ts`), because that host has none of them.
 *
 * WHAT IT MAY DO. Every request goes through `createRendererRouteHandler`:
 * GETs to the app's own origin and the font picker's font files, fetched with
 * redirects refused; everything else, Supabase and any `file:` URL included,
 * is aborted. Chromium inherits an allowlisted environment that carries none
 * of the server's secrets, and runs sandboxed except on a serverless host that
 * cannot provide the sandbox (`browser.ts`, which states what remains there). WebSockets are closed,
 * service workers blocked, dialogs dismissed, downloads refused and any popup
 * closed. Nothing the page does can write to the account.
 *
 * HOW LONG. A hard deadline covers the whole render, launch included. The
 * browser is closed in `finally`, whatever happened, including a launch that
 * completes after the deadline already fired.
 */

export interface RenderPreviewPdfInput {
  /** The trusted origin from `resolveRenderOrigin`, never one taken from the request. */
  origin: string
  locale: Locale
  /** Already shown to exist and to belong to the signed-in user. */
  resumeId: string
  sessionCookies: readonly NamedCookie[]
  /** A validated draft from `parsePdfRequestBody`, or `null` for the stored resume. */
  draft: string | null
  /** A bounded photo data URL, or `null` for none. */
  photo: string | null
  /** Vercel's Deployment Protection bypass, sent to the app's origin only (`route-guard.ts`). */
  protectionBypassSecret?: string
  timeoutMs: number
}

/** The step a render was on when it failed, so a log can say where without saying what. */
export type PdfRenderStage = 'launch' | 'fonts' | 'context' | 'navigate' | 'settle' | 'print'

export class PdfRenderError extends Error {
  constructor(
    readonly stage: PdfRenderStage | 'timeout',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'PdfRenderError'
  }
}

/**
 * The Preview as a desktop browser opens it, matching the e2e suite's
 * `Desktop Chrome` device, whose print the route's PDF is compared against.
 * Print layout is driven by `@page` (A4), not by this size.
 */
const VIEWPORT = { width: 1280, height: 720 }

/**
 * The print call the e2e and parity suites reproduce a user's print with: the
 * stylesheet's own `@page` size and no browser header or footer. Background
 * graphics are not requested, as in the browser's print dialog by default;
 * `globals.css` marks every element `print-color-adjust: exact`, which is what
 * prints the templates' colours.
 */
const PDF_OPTIONS = { preferCSSPageSize: true, displayHeaderFooter: false } as const

export async function renderPreviewPdf(input: RenderPreviewPdfInput): Promise<Buffer> {
  // The launch is the first thing on the clock, so its own limit is the whole
  // budget; the deadline below still bounds everything that follows it.
  const launching = launchPdfBrowser({ timeoutMs: input.timeoutMs })
  // Read alongside the launch, on the same clock. Only where the fonts they
  // stand in for are absent: see `font-substitutes.ts`.
  const fontSubstitutes: Promise<SubstituteFontFace[]> =
    pdfBrowserRuntime(process.env) === 'serverless' ? serverlessFontSubstitutes() : Promise.resolve([])
  // Its failure is reported once the browser is up; a launch failing first must
  // not leave this rejection unhandled.
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
        return printPreview(browser, input, fonts)
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
        console.error('PDF renderer: closing the browser failed:', error instanceof Error ? error.name : 'unknown')
      })
    }
  }
}

async function printPreview(
  browser: Browser,
  input: RenderPreviewPdfInput,
  fonts: readonly SubstituteFontFace[],
): Promise<Buffer> {
  let stage: PdfRenderStage = 'context'
  try {
    const context = await openIsolatedContext(browser, input, fonts)
    const page = await context.newPage()
    page.on('dialog', (dialog) => {
      void dialog.dismiss().catch(() => undefined)
    })
    // The renderer works in exactly one page; anything the page opens is closed.
    page.on('popup', (popup) => {
      void popup.close().catch(() => undefined)
    })

    stage = 'navigate'
    const path = `/${input.locale}/dashboard/resumes/${input.resumeId}/preview`
    const response = await page.goto(`${input.origin}${path}`, { waitUntil: 'load' })
    // The page must be the Preview, on the trusted origin. The route handler
    // already refuses every redirect; this states the outcome independently,
    // so a page that ended up anywhere else is a failure, never a PDF.
    const landed = new URL(page.url())
    if (!response || response.status() !== 200 || landed.origin !== input.origin || landed.pathname !== path) {
      throw new PdfRenderError('navigate', `The Preview page did not load (status ${response?.status() ?? 'none'})`)
    }

    stage = 'settle'
    await assertSeeded(page, seededEntries(input))
    await settlePreview(page, input.resumeId)
    if (fonts.length > 0) await assertSubstitutesLoaded(page)

    stage = 'print'
    await page.emulateMedia({ media: 'print' })
    return await page.pdf(PDF_OPTIONS)
  } catch (error) {
    if (error instanceof PdfRenderError) throw error
    throw new PdfRenderError(stage, `PDF render failed at ${stage}`, { cause: error })
  }
}

async function openIsolatedContext(
  browser: Browser,
  input: RenderPreviewPdfInput,
  fonts: readonly SubstituteFontFace[],
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: input.locale,
    javaScriptEnabled: true,
    serviceWorkers: 'block',
    acceptDownloads: false,
  })
  context.setDefaultTimeout(input.timeoutMs)
  context.setDefaultNavigationTimeout(input.timeoutMs)

  await context.route(
    '**/*',
    createRendererRouteHandler<APIResponse>(input.origin, { protectionBypassSecret: input.protectionBypassSecret }),
  )
  await context.routeWebSocket(/.*/, (socket) => socket.close())

  const secure = new URL(input.origin).protocol === 'https:'
  await context.addCookies(
    input.sessionCookies.map(({ name, value }) => ({
      name,
      value,
      url: input.origin,
      httpOnly: true,
      secure,
      sameSite: 'Lax' as const,
    })),
  )

  const storage = seededEntries(input)
  if (storage.length > 0) {
    await context.addInitScript(
      ({ origin, entries }) => {
        // Only the app's own documents get the entries; any other frame
        // (about:blank, an aborted navigation) is left alone.
        if (window.location.origin !== origin) return
        for (const [key, value] of entries) window.localStorage.setItem(key, value)
      },
      { origin: input.origin, entries: storage },
    )
  }

  if (fonts.length > 0) {
    await context.addInitScript(registerFontSubstitutes, { origin: input.origin, faces: fonts })
  }

  return context
}

/** The localStorage entries the Preview reads the draft and the photo from, for this resume only. */
function seededEntries(input: RenderPreviewPdfInput): [string, string][] {
  const entries: [string, string][] = []
  if (input.draft !== null) entries.push([`resume_draft_${input.resumeId}`, input.draft])
  if (input.photo !== null) entries.push([`resume_photo_${input.resumeId}`, input.photo])
  return entries
}

/**
 * Fail rather than print a PDF missing what the client sent.
 *
 * `localStorage.setItem` throws when the origin's quota is exhausted, and an
 * exception in an init script does not stop the page: without this check the
 * PDF would silently come out without the draft or the photo. Lengths are
 * compared instead of values so that megabytes of photo are not sent back
 * across the protocol.
 */
async function assertSeeded(page: Page, entries: readonly [string, string][]): Promise<void> {
  if (entries.length === 0) return
  const expected = entries.map(([key, value]) => [key, value.length] as const)
  const missing = await page.evaluate(
    (pairs) => pairs.filter(([key, length]) => window.localStorage.getItem(key)?.length !== length).length,
    expected,
  )
  if (missing > 0) throw new PdfRenderError('settle', 'The draft or the photo could not be handed to the Preview')
}

/**
 * Fail rather than print with a substitute font that did not load: the text
 * would silently fall back to another font, with other line breaks. Only the
 * faces this renderer registered are checked; a face that was never needed
 * stays `unloaded` and is fine.
 */
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

/**
 * Wait until the Preview shows what the user's own Preview would.
 *
 * HYDRATED, THEN EFFECTS APPLIED. The server sends the stored resume at the
 * default layout; the account's layout, the draft and the photo are applied by
 * the wrapper's mount effects, which React flushes together and commits in one
 * render. The layout hook writes its browser cache in an effect that runs only
 * after that render, so once `layoutCacheKey(id)` is in localStorage, the
 * document on the page carries the layout, the draft and the photo. Reading a
 * signal the page emits, rather than waiting a fixed time, is what keeps this
 * deterministic.
 *
 * Then the fonts the committed document asked for, and every image decoded.
 */
async function settlePreview(page: Page, resumeId: string): Promise<void> {
  await page.waitForFunction(
    (cacheKey) => {
      const root = document.querySelector('[data-testid="resume-document"]')
      const hydrated = !!root && Object.keys(root).some((key) => key.startsWith('__reactFiber$'))
      return hydrated && window.localStorage.getItem(cacheKey) !== null
    },
    layoutCacheKey(resumeId),
  )

  await page.evaluate(async () => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    // Two frames: the committed document is laid out, so the font loads it
    // needs have started before `fonts.ready` is read.
    await frame()
    await frame()
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images).map((image) => image.decode().catch(() => undefined)),
    )
  })
}
