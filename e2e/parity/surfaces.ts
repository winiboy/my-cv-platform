import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import pdfParse from 'pdf-parse'
import type { ResumeLayoutModel } from '../../src/lib/layout-settings'
import type { ResumeTemplate } from '../../src/types/database'
import { coloursAgree, isBlendOf } from './colour'
import { BODY_MARKER, type ProfileId, type SectionSpec, type TemplateSpec } from './profiles'

/**
 * Part 2 US-008: how each surface is measured.
 *
 * Every function here returns what it FOUND and throws when it cannot tell
 * what it is looking at — an ambiguous locator, a missing element, a document
 * that never settles. A measurement that quietly returns nothing is how three
 * checks in Part 2 US-007 printed confident verdicts over empty input.
 */

export type SurfaceId = 'preview' | 'pdf' | 'docx'

export const SURFACES: readonly SurfaceId[] = ['preview', 'pdf', 'docx']

export type TypographyElement = 'documentTitle' | 'sectionHeading' | 'bodyText'

export const TYPOGRAPHY_ELEMENTS: readonly TypographyElement[] = [
  'documentTitle',
  'sectionHeading',
  'bodyText',
]

export interface ColourSample {
  /** `#RRGGBB`, 8-bit sRGB. */
  hex: string
  /** 0–255. DOCX colours are always opaque. */
  alpha: number
  /**
   * The CSS colour string the sample was converted from, exactly as
   * `getComputedStyle` (or the model) gave it. Absent for DOCX, whose colours
   * are hex already. Kept so every conversion can be checked independently.
   */
  css?: string
}

/**
 * A line's leading: the distance from one baseline to the next.
 *
 * `ratio` is DRAWN leading as a multiple of the FONT SIZE: a CSS line-height
 * (the height of the element's line boxes), or a DOCX exact spacing divided by
 * the run size — Word lays every line of an exact paragraph at exactly that
 * pitch, whatever the font. The other kinds are what a surface ASKED for, whose
 * drawn leading depends on font metrics this check does not read, so none of
 * them ever equals a `ratio`:
 * - `auto-multiple`: Word auto spacing, a multiple of the font's SINGLE-LINE
 *   HEIGHT (ascent + descent + line gap), not of its size;
 * - `at-least`: Word at-least spacing, drawn at this multiple of the run size
 *   or at the font's single line, whichever is taller;
 * - `normal`: the font's own single line, on either surface.
 */
export type LineHeight =
  | { kind: 'normal' }
  | { kind: 'ratio'; ratio: number }
  | { kind: 'auto-multiple'; ratio: number }
  | { kind: 'at-least'; ratio: number }

export interface StyleSample {
  /** The text the sample was taken from, for the log. */
  text: string
  /** CSS px as computed; PDF points / 0.75; DOCX half-points / 1.5. */
  px: number
  /** `Math.round(px * 1.5)` — the conversion `pxToHalfPoints` uses — or `w:sz` for DOCX. */
  halfPoints: number
  colour: ColourSample
  /** The opaque background the text is drawn on; `null` for DOCX runs. */
  backdrop: ColourSample | null
  /**
   * The face actually used: Chromium's platform font for the Preview, the
   * embedded font for the PDF, `w:rFonts` for the DOCX.
   */
  fontFamily: string
  /**
   * The family that was ASKED for: the first declared CSS family (for the PDF,
   * that of the print rendering), or `w:rFonts` for the DOCX. Recorded beside
   * the used face so a report shows how this machine resolved each request.
   */
  declaredFamily: string
  /** Letter spacing in twips (1px = 15 twips); `normal` is 0. */
  letterSpacingTwips: number
  lineHeight: LineHeight
}

export interface ExtraColourSample {
  colour: ColourSample
  backdrop: ColourSample | null
}

/** Everything the verdicts read from one surface. */
export interface SurfaceMeasurement {
  /** Section keys found, in document order. */
  sequence: string[]
  /** `null` when the profile samples no typography. */
  typography: Record<TypographyElement, StyleSample> | null
  extraColours: Record<string, ExtraColourSample>
  sidebarBackground: ColourSample | null
  accent: ColourSample | null
  /** Width of the page the document is laid out on, in inches. */
  pageWidthInches: number
}

export interface Observation {
  profile: ProfileId
  template: ResumeTemplate
  /** The model the stored layout resolves to, re-read from the database. */
  model: ResumeLayoutModel
  /** The model's colours, converted by the same browser canvas the CSS colours go through. */
  modelColours: { sidebar: ColourSample; accent: ColourSample }
  surfaces: Record<SurfaceId, SurfaceMeasurement>
  /** Each CSS colour's canvas conversion beside its independent conversion (`colour.ts`). */
  colourChecks: string[]
  /** The sidebar column of every printed page, read from the PDF's pixels; `null` unless the profile reads the print. */
  printSidebarColumn: SidebarColumnReading | null
  /** Method notes per surface: counts and sources, printed and kept for audit. */
  evidence: Record<SurfaceId, string[]>
  /** What the observation depends on besides the code: the browser that rendered it. */
  environment: { browserVersion: string }
}

/** What to look for, shared by all three surfaces. */
export interface SurfaceProbe {
  sections: readonly SectionSpec[]
  titleText: string
  headingText: string
  bodyMarker: string
  sidebarKeys: readonly string[]
  sidebarBackgroundDepth: number | null
  accentDepth: number | null
  extraColourSamples: readonly { key: string; text: string }[]
  /**
   * Whether to sample title, heading and body typography. Off for probes whose
   * point is that a section a sample would read from is missing on one surface.
   */
  sampleTypography: boolean
  /** The model's colours as CSS, converted inside the same page reading as everything else. */
  modelColourCss: { sidebar: string; accent: string }
}

export function buildProbe(
  spec: TemplateSpec,
  titleText: string,
  sampleTypography: boolean,
  model: ResumeLayoutModel,
): SurfaceProbe {
  const headingSection = spec.sections.find((section) => section.key === spec.headingSampleKey)
  if (!headingSection || headingSection.locator.kind !== 'heading') {
    throw new Error(`${spec.template}: heading sample "${spec.headingSampleKey}" has no heading locator`)
  }
  return {
    sections: spec.sections,
    titleText,
    headingText: headingSection.locator.text,
    bodyMarker: BODY_MARKER,
    sidebarKeys: spec.sections.filter((section) => section.column === 'sidebar').map((s) => s.key),
    sidebarBackgroundDepth: spec.sidebarBackgroundDepth,
    accentDepth: spec.accentDepth,
    extraColourSamples: spec.extraColourSamples,
    sampleTypography,
    modelColourCss: {
      sidebar: `hsl(${model.sidebarHue}, ${model.sidebarSaturation}%, ${model.sidebarBrightness}%)`,
      // Modern's documented accent rule (modern-template.tsx, docx-modern.ts).
      accent:
        `hsl(${model.sidebarHue}, ${Math.min(model.sidebarSaturation + 20, 100)}%, ` +
        `${Math.min(model.sidebarBrightness + 25, 65)}%)`,
    },
  }
}

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim().toUpperCase()
const compact = (text: string) => text.replace(/\s+/g, '').toUpperCase()

/** Attribute this check sets on sampled elements, so the font query can find them. */
const SAMPLE_ATTRIBUTE = 'data-parity-sample'

// ---------------------------------------------------------------------------
// Preview, and the print rendering the PDF is made from
// ---------------------------------------------------------------------------

export interface DomMeasurement extends SurfaceMeasurement {
  /** Rendered `h2` elements no section locator claimed. Must be empty. */
  unclaimedHeadings: string[]
  renderedHeadingCount: number
  modelColours: { sidebar: ColourSample; accent: ColourSample }
}

/**
 * One reading of the rendered document.
 *
 * Headings are matched on `innerText`, not `textContent`: under print media
 * the in-template sliders are `display: none` but still sit inside some `h2`
 * elements, and `textContent` would read their "20px" labels as heading text.
 *
 * `fontFamily` is left as the DECLARED first family here; `measureSettled`
 * replaces it with the face Chromium actually used, which only the DevTools
 * protocol can report. Sampled elements are marked with `data-parity-sample`
 * for that query. The attribute is instrumentation: nothing styles it.
 */
export async function measureDom(page: Page, probe: SurfaceProbe): Promise<DomMeasurement> {
  return page.evaluate(
    ({ p, attributeName }) => {
      const root = document.querySelector('[data-testid="resume-document"]')
      if (!root) throw new Error('[data-testid="resume-document"] is not on the page')

      // Each reading marks its own samples afresh. A marker left by an earlier
      // reading — the screen Preview, before print re-rendered the controls —
      // could otherwise sit on a still-mounted element and be read as this one.
      for (const stale of Array.from(document.querySelectorAll(`[${attributeName}]`))) {
        stale.removeAttribute(attributeName)
      }

      /** First declared family; next/font's hashed names (`__Inter_1a2b3c`) read as the family they wrap. */
      const declaredFamily = (stack: string) => {
        const first = stack.split(',')[0].trim().replace(/['"]/g, '')
        const hashed = /^__(.+?)_[0-9a-f]{4,}$/.exec(first)
        return hashed ? hashed[1] : first
      }

      const norm = (text: string) => text.replace(/\s+/g, ' ').trim().toUpperCase()
      const rendered = (element: Element) => element.getClientRects().length > 0

      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('No 2D canvas context to convert colours with')
      const toColour = (css: string) => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = 'rgba(0, 0, 0, 0)'
        context.fillStyle = css
        context.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = Array.from(context.getImageData(0, 0, 1, 1).data)
        const hex = [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
        return { hex: `#${hex}`, alpha: a, css }
      }

      const textParents = (needle: string) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        const parents: HTMLElement[] = []
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement
          if (parent && (node.nodeValue ?? '').includes(needle) && rendered(parent)) parents.push(parent)
        }
        return parents
      }

      /** Elements whose own rendered text is exactly `text`, innermost only. */
      const exactText = (text: string) =>
        Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
          (element) =>
            rendered(element) &&
            norm(element.innerText ?? '') === norm(text) &&
            !Array.from(element.children).some((child) => norm((child as HTMLElement).innerText ?? '') === norm(text)),
        )

      const headings = Array.from(root.querySelectorAll('h2')).filter(rendered)
      const headingsWithText = (text: string) => headings.filter((h) => norm(h.innerText) === norm(text))

      const claimed = new Set<Element>()
      const anchors: { key: string; element: Element }[] = []
      for (const section of p.sections) {
        const matches =
          section.locator.kind === 'heading' ? headingsWithText(section.locator.text) : textParents(section.locator.text)
        if (matches.length > 1) {
          throw new Error(
            `${matches.length} rendered elements match section "${section.key}" ` +
              `(${section.locator.text}); the locator is ambiguous`,
          )
        }
        if (matches.length === 1) {
          anchors.push({ key: section.key, element: matches[0] })
          claimed.add(matches[0])
        }
      }
      anchors.sort((a, b) =>
        a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )

      /** Opaque backgrounds from `start` up to the document root, nearest first. */
      const opaqueBackgrounds = (start: Element | null) => {
        const found: ReturnType<typeof toColour>[] = []
        for (let current = start; current; current = current.parentElement) {
          const colour = toColour(getComputedStyle(current).backgroundColor)
          if (colour.alpha === 255) found.push(colour)
          if (current === root) break
        }
        return found
      }

      /** The nearest opaque background at or above `element`: what its text is drawn on. */
      const backdropOf = (element: Element) =>
        // Above the document there is only the page, white in every template and in print.
        opaqueBackgrounds(element)[0] ?? toColour(getComputedStyle(document.body).backgroundColor)

      const one = (label: string, matches: readonly HTMLElement[]) => {
        if (matches.length !== 1) throw new Error(`Expected one element for the ${label}, found ${matches.length}`)
        return matches[0]
      }

      const sample = (element: HTMLElement, text: string, key: string) => {
        element.setAttribute(attributeName, key)
        const style = getComputedStyle(element)
        const px = parseFloat(style.fontSize)
        const letterSpacing = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing)
        const lineHeight =
          style.lineHeight === 'normal'
            ? { kind: 'normal' as const }
            : { kind: 'ratio' as const, ratio: Math.round((parseFloat(style.lineHeight) / px) * 1000) / 1000 }
        return {
          text,
          px,
          halfPoints: Math.round(px * 1.5),
          colour: toColour(style.color),
          backdrop: backdropOf(element),
          fontFamily: declaredFamily(style.fontFamily),
          declaredFamily: declaredFamily(style.fontFamily),
          letterSpacingTwips: Math.round(letterSpacing * 15),
          lineHeight,
        }
      }

      const sampleTypography = () => {
        const titles = Array.from(root.querySelectorAll('h1')).filter(rendered) as HTMLElement[]
        const title = one('document title h1', titles)
        if (norm(title.innerText) !== norm(p.titleText)) {
          throw new Error(`The document h1 reads "${title.innerText}", expected "${p.titleText}"`)
        }
        const heading = one(`"${p.headingText}" heading`, headingsWithText(p.headingText))
        const body = one('body marker', textParents(p.bodyMarker))
        return {
          documentTitle: sample(title, title.innerText, 'documentTitle'),
          sectionHeading: sample(heading, heading.innerText, 'sectionHeading'),
          bodyText: sample(body, p.bodyMarker, 'bodyText'),
        }
      }

      const extraColours: Record<string, { colour: ReturnType<typeof toColour>; backdrop: ReturnType<typeof toColour> }> = {}
      for (const extra of p.extraColourSamples) {
        const element = one(`"${extra.text}" text`, exactText(extra.text))
        extraColours[extra.key] = { colour: toColour(getComputedStyle(element).color), backdrop: backdropOf(element) }
      }

      const sidebarAnchor = anchors.find((anchor) => p.sidebarKeys.includes(anchor.key))
      const ancestorColour = (depth: number | null, label: string) => {
        if (depth === null) return null
        if (!sidebarAnchor) throw new Error(`No sidebar section is rendered to read the ${label} from`)
        const colour = opaqueBackgrounds(sidebarAnchor.element.parentElement)[depth - 1]
        if (!colour) throw new Error(`No opaque ancestor at depth ${depth} for the ${label}`)
        return colour
      }

      return {
        sequence: anchors.map((anchor) => anchor.key),
        unclaimedHeadings: headings.filter((h) => !claimed.has(h)).map((h) => h.innerText),
        renderedHeadingCount: headings.length,
        // The document's own width at 96 CSS px per inch: the page the Preview lays it out on.
        pageWidthInches: root.getBoundingClientRect().width / 96,
        typography: p.sampleTypography ? sampleTypography() : null,
        extraColours,
        sidebarBackground: ancestorColour(p.sidebarBackgroundDepth, 'sidebar background'),
        accent: ancestorColour(p.accentDepth, 'accent'),
        modelColours: { sidebar: toColour(p.modelColourCss.sidebar), accent: toColour(p.modelColourCss.accent) },
      }
    },
    { p: probe, attributeName: SAMPLE_ATTRIBUTE },
  )
}

/**
 * The face Chromium used to draw each sampled element — the family with the
 * most glyphs — through the DevTools protocol. The declared stack says what
 * was asked for; this says what was rendered, which is what a PDF embeds.
 *
 * `CSS.getPlatformFontsForNode` is an EXPERIMENTAL CDP method. If a Chromium
 * update renames or removes it, `cdp.send` rejects and the collect test fails
 * with that error; if it returns nothing for an element, this throws. It can
 * never silently fall back to the declared family.
 *
 * The answer depends on the fonts installed on the machine, which is why the
 * report records the environment and every declared-to-used resolution.
 */
async function usedFonts(page: Page): Promise<Record<string, string>> {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
      nodeId: root.nodeId,
      selector: `[${SAMPLE_ATTRIBUTE}]`,
    })
    const fonts: Record<string, string> = {}
    for (const nodeId of nodeIds) {
      const { attributes } = await cdp.send('DOM.getAttributes', { nodeId })
      const key = attributes[attributes.indexOf(SAMPLE_ATTRIBUTE) + 1]
      const { fonts: used } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      const main = [...used].sort((a, b) => b.glyphCount - a.glyphCount)[0]
      if (!main) throw new Error(`Chromium reports no font used for the ${key} sample`)
      fonts[key] = main.familyName
    }
    return fonts
  } finally {
    await cdp.detach()
  }
}

/**
 * Read the document until two consecutive readings agree, then resolve the
 * faces actually used.
 *
 * The layout is applied by an effect after hydration, and the controls toggle
 * re-renders the template, so a single reading can land between states.
 */
export async function measureSettled(page: Page, probe: SurfaceProbe): Promise<DomMeasurement> {
  let previous = await measureDom(page, probe)
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await page.waitForTimeout(200)
    const next = await measureDom(page, probe)
    if (JSON.stringify(next) === JSON.stringify(previous)) {
      if (next.typography) {
        const fonts = await usedFonts(page)
        for (const element of TYPOGRAPHY_ELEMENTS) {
          const used = fonts[element]
          if (!used) throw new Error(`No used-font reading for the ${element} sample`)
          next.typography[element].fontFamily = used
        }
      }
      return next
    }
    previous = next
  }
  throw new Error('The rendered document did not settle across 20 consecutive readings')
}

/**
 * Open the Preview with its controls off and the layout applied.
 *
 * The toggle is only operated once React has hydrated the document — before
 * that, unchecking it changes a DOM checkbox and nothing else, and the page
 * would still be showing the server render's defaults.
 */
export async function openPreview(page: Page, resumeId: string): Promise<void> {
  await page.goto(`/en/dashboard/resumes/${resumeId}/preview`)
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="resume-document"]')
      return !!root && Object.keys(root).some((key) => key.startsWith('__reactFiber$'))
    },
    undefined,
    { timeout: 30_000 },
  )
  const toggle = page.getByTestId('controls-toggle')
  await expect(toggle).toBeChecked()
  await toggle.uncheck({ force: true })
  await expect(toggle).not.toBeChecked()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** What the PDF itself says about one sampled text: its size and embedded font. */
export interface PdfTextSample {
  text: string
  sizePt: number
  fontName: string
}

export interface PdfMeasurement {
  sequence: string[]
  pages: number
  characters: number
  pageWidthInches: number
  /**
   * Per page, the distance in points from the page's top edge down to its
   * lowest text baseline; `null` for a page with no text.
   */
  lowestTextPt: (number | null)[]
  /** `null` when the probe samples no typography. */
  samples: Record<TypographyElement, PdfTextSample> | null
}

/** The part of pdf.js's page proxy pdf-parse hands to `pagerender`. */
interface PdfPageProxy {
  pageNumber?: number
  /** Page box in PDF points: `[x0, y0, x1, y1]`. */
  view: number[]
  getTextContent(): Promise<{ items: { str: string; transform: number[]; fontName: string }[] }>
  getOperatorList(): Promise<unknown>
  commonObjs: { get(id: string, callback: (font: { name?: string } | undefined) => void): void }
}

interface PdfTextItem {
  page: number
  x: number
  y: number
  sizePt: number
  fontName: string
  text: string
}

const COLUMN_RANK: Readonly<Record<SectionSpec['column'], number>> = { header: 0, sidebar: 1, main: 2 }

/** The pdf.js build bundled with pdf-parse that resolves font names in Node (see `measurePdf`). */
const PDFJS_VERSION = '2.0.550'

/**
 * pdf.js resolves a page's font objects asynchronously once its operator list
 * is built; reading them synchronously finds them "not resolved yet".
 */
function resolveFontName(page: PdfPageProxy, id: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`pdf.js never resolved font ${id}`)), 10_000)
    page.commonObjs.get(id, (font) => {
      clearTimeout(timer)
      if (!font?.name) reject(new Error(`pdf.js resolved font ${id} without a name`))
      else resolve(font.name)
    })
  })
}

/**
 * An embedded PostScript name as a family: subset prefix (`ABCDEF+`) and
 * style suffix (`-Bold`, `,Italic`) removed, and the `MT`/`PSMT` foundry tag
 * dropped, so `ABCDEF+TimesNewRomanPS-BoldMT` reads as `TimesNewRoman`.
 */
export function pdfFamily(postScriptName: string): string {
  return postScriptName
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[-,].*$/, '')
    .replace(/(PSMT|PS|MT)$/, '')
}

/**
 * Section presence and order, page size, and the sampled texts' size and font,
 * all read from the PDF itself.
 *
 * ORDER IS GEOMETRIC, NOT STREAM ORDER: Chromium does not write text into the
 * content stream in reading order. Each title is placed where pdf.js says it
 * is drawn, and sections are ordered by template column, then page, then top
 * to bottom, then left to right.
 *
 * Texts are searched with whitespace removed and case folded, because
 * Chromium's PDF text carries `text-transform` and letter-spacing. Each must
 * occur at most once or the reading is refused as ambiguous.
 *
 * pdf.js 2.0.550, bundled with pdf-parse, is used rather than pdf-parse's
 * default 1.10.100: the older build tries to install web fonts into a
 * `document` that does not exist in Node as soon as fonts are resolved.
 *
 * THAT CHOICE IS FRAGILE, AND GUARDED. pdf-parse loads
 * `./pdf.js/${version}/build/pdf.js` with a plain `require` and caches the
 * result in a module-level `PDFJS` (`lib/pdf-parse.js`), so the `version`
 * option only takes effect if nothing in this worker called pdf-parse first
 * with another version. If that ever happens, `parsed.version` reports the
 * build actually used and this function throws rather than reading fonts with
 * the build known to crash on them.
 */
export async function measurePdf(buffer: Buffer, probe: SurfaceProbe): Promise<PdfMeasurement> {
  const items: PdfTextItem[] = []
  const pageWidths: number[] = []
  /** Each page box's top edge, in the user space text positions are given in. */
  const pageTops: number[] = []
  const fontNames = new Map<string, string>()
  let pagesRendered = 0
  const parsed = await pdfParse(buffer, {
    version: `v${PDFJS_VERSION}`,
    // pdf-parse renders pages one at a time, in order, awaiting each.
    pagerender: async (pageData: unknown) => {
      const pageProxy = pageData as PdfPageProxy
      pagesRendered += 1
      const page = pageProxy.pageNumber ?? pagesRendered
      pageWidths.push((pageProxy.view[2] - pageProxy.view[0]) / 72)
      pageTops.push(pageProxy.view[3])
      const content = await pageProxy.getTextContent()
      if (probe.sampleTypography) {
        await pageProxy.getOperatorList()
        for (const item of content.items) {
          // Font object ids are per document, so a name resolved on one page holds on the next.
          if (!fontNames.has(item.fontName)) fontNames.set(item.fontName, await resolveFontName(pageProxy, item.fontName))
        }
      }
      for (const item of content.items) {
        items.push({
          page,
          x: item.transform[4],
          y: item.transform[5],
          // pdf.js carries float noise in the text matrix (a 15px font reads 11.24999953125pt).
          // Unrounded, 22.4999990625 half-points rounds to 22 where the Preview's 22.5 rounds to 23:
          // a divergence of arithmetic, not of the document. A ten-thousandth of a point is
          // three orders of magnitude above that noise and far below any real size step.
          sizePt: Math.round(Math.hypot(item.transform[2], item.transform[3]) * 10_000) / 10_000,
          fontName: item.fontName,
          text: item.str,
        })
      }
      return content.items.map((item) => item.str).join(' ')
    },
  })

  let text = ''
  const owner: number[] = []
  items.forEach((item, index) => {
    const folded = compact(item.text)
    text += folded
    for (let k = 0; k < folded.length; k++) owner.push(index)
  })
  const locate = (needle: string, label: string): PdfTextItem | null => {
    const folded = compact(needle)
    const indices: number[] = []
    for (let at = text.indexOf(folded); at !== -1; at = text.indexOf(folded, at + 1)) indices.push(at)
    if (indices.length > 1) {
      throw new Error(`"${needle}" occurs ${indices.length} times in the PDF text; the ${label} cannot be located unambiguously`)
    }
    return indices.length === 1 ? items[owner[indices[0]]] : null
  }

  const found: { key: string; rank: number; item: PdfTextItem }[] = []
  for (const section of probe.sections) {
    const item = locate(section.locator.text, `section "${section.key}"`)
    if (item) found.push({ key: section.key, rank: COLUMN_RANK[section.column], item })
  }
  // pdf.js y grows upward; round it so glyphs on one baseline share a line.
  found.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.item.page - b.item.page ||
      Math.round(b.item.y) - Math.round(a.item.y) ||
      a.item.x - b.item.x,
  )

  const sampleText = (needle: string, label: string): PdfTextSample => {
    const item = locate(needle, label)
    if (!item) throw new Error(`The ${label} "${needle}" is not in the PDF text`)
    const fontName = fontNames.get(item.fontName)
    if (!fontName) throw new Error(`No embedded font name for the ${label}`)
    return { text: item.text, sizePt: item.sizePt, fontName }
  }

  if (parsed.version !== PDFJS_VERSION) {
    throw new Error(
      `pdf-parse used pdf.js ${parsed.version}, not ${PDFJS_VERSION}: something loaded pdf-parse earlier in ` +
        'this worker with another version, and its cached build is not safe for reading fonts in Node',
    )
  }
  if (parsed.numpages !== pagesRendered) {
    throw new Error(`The PDF has ${parsed.numpages} pages but ${pagesRendered} were read`)
  }
  if (pageWidths.some((width) => Math.abs(width - pageWidths[0]) > 0.005)) {
    throw new Error(`The PDF pages differ in width: ${pageWidths.join(', ')} in`)
  }
  const lowestTextPt = pageTops.map((top, index) => {
    const baselines = items.filter((item) => item.page === index + 1 && item.text.trim() !== '').map((item) => item.y)
    return baselines.length > 0 ? top - Math.min(...baselines) : null
  })
  return {
    sequence: found.map((f) => f.key),
    pages: parsed.numpages,
    characters: text.length,
    pageWidthInches: pageWidths[0],
    lowestTextPt,
    samples: probe.sampleTypography
      ? {
          documentTitle: sampleText(probe.titleText, 'document title'),
          sectionHeading: sampleText(probe.headingText, 'section heading'),
          bodyText: sampleText(probe.bodyMarker, 'body text'),
        }
      : null,
  }
}

/**
 * The PDF surface's typography: size and font from the PDF bytes; colour,
 * backdrop, letter spacing and line height from the print rendering the PDF is
 * made from, which is the only place they can be read (see the report's
 * LIMITATION entries for why).
 */
export function pdfTypography(
  print: DomMeasurement,
  pdf: PdfMeasurement,
): Record<TypographyElement, StyleSample> | null {
  if (!print.typography || !pdf.samples) return null
  const out = {} as Record<TypographyElement, StyleSample>
  for (const element of TYPOGRAPHY_ELEMENTS) {
    const fromPdf = pdf.samples[element]
    const px = fromPdf.sizePt / 0.75
    out[element] = {
      ...print.typography[element],
      text: fromPdf.text,
      px,
      halfPoints: Math.round(fromPdf.sizePt * 2),
      fontFamily: pdfFamily(fromPdf.fontName),
    }
  }
  return out
}

/**
 * Print the Preview the way a user downloading a PDF does — controls in their
 * shipped state, print media — sample its computed styles, then produce the PDF.
 */
export async function capturePrint(
  page: Page,
  probe: SurfaceProbe,
): Promise<{ print: DomMeasurement; pdf: PdfMeasurement; pdfBuffer: Buffer }> {
  const toggle = page.getByTestId('controls-toggle')
  await toggle.check({ force: true })
  await expect(toggle).toBeChecked()
  await page.emulateMedia({ media: 'print' })
  const print = await measureSettled(page, probe)
  const pdfBuffer = await page.pdf({ preferCSSPageSize: true })
  await page.emulateMedia({ media: 'screen' })
  const pdf = await measurePdf(pdfBuffer, probe)
  return { print, pdf, pdfBuffer }
}

/** The sidebar column as the printed pages show it. */
export interface SidebarColumnReading {
  /** Distinct colours down the column, merged within the colour tolerance, in order of first appearance. */
  colours: ColourSample[]
  /** Evidence: each run of one colour, `page 2 y0-640 #1E7A4C`. */
  runs: string[]
  /** Pixel rows read across all pages. */
  rowsRead: number
}

/** The strip read, in PDF points from the page's left edge: inside the sidebar's padding, where no text is drawn. */
const SIDEBAR_STRIP_X_PT = 2

/**
 * What the PDF paints down the sidebar column of every page, read from its pixels.
 *
 * `globals.css` paints a band behind the professional document under print,
 * and a band can only be seen where the document does not cover the page — so
 * no computed style can say whether it shows. The PDF is rasterised by the
 * same pdf.js build `measurePdf` reads it with, inside Chromium, at 72 dpi so
 * one pixel row is one point.
 *
 * Every row of every page is read; `summariseSidebarColumn` says which rows are
 * colours. A last page with no text cannot be bounded, and throws.
 */
export async function readPrintSidebarColumn(
  page: Page,
  pdfBuffer: Buffer,
  pdf: PdfMeasurement,
): Promise<SidebarColumnReading> {
  const lastTextPt = pdf.lowestTextPt[pdf.pages - 1]
  if (lastTextPt === null || lastTextPt === undefined) {
    throw new Error(`The last PDF page (${pdf.pages}) carries no text, so where the document ends on it cannot be told`)
  }
  const build = path.join(path.dirname(require.resolve('pdf-parse/package.json')), 'lib', 'pdf.js', `v${PDFJS_VERSION}`, 'build')

  const raster = await page.context().newPage()
  try {
    await raster.setContent('<!doctype html><html><body></body></html>')
    // The worker code is loaded into the page first, so pdf.js finds it in place
    // rather than fetching a worker script a blank page has no URL to serve from.
    await raster.addScriptTag({ content: readFileSync(path.join(build, 'pdf.worker.js'), 'utf-8') })
    await raster.addScriptTag({ content: readFileSync(path.join(build, 'pdf.js'), 'utf-8') })

    const rendered = await raster.evaluate(
      async ({ base64, stripX }) => {
        interface PdfJsPage {
          getViewport(scale: number): { width: number; height: number }
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
        const document_ = await lib.getDocument({ data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) }).promise
        const pages: { height: number; runs: { hex: string; from: number; to: number }[] }[] = []
        for (let pageNumber = 1; pageNumber <= document_.numPages; pageNumber++) {
          const pdfPage = await document_.getPage(pageNumber)
          const viewport = pdfPage.getViewport(1)
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) throw new Error('No 2D canvas context to rasterise the PDF with')
          await pdfPage.render({ canvasContext: context, viewport }).promise
          const column = context.getImageData(stripX, 0, 1, canvas.height).data
          const runs: { hex: string; from: number; to: number }[] = []
          for (let y = 0; y < canvas.height; y++) {
            const hex = `#${[column[y * 4], column[y * 4 + 1], column[y * 4 + 2]]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('')
              .toUpperCase()}`
            const last = runs[runs.length - 1]
            if (last && last.hex === hex) last.to = y
            else runs.push({ hex, from: y, to: y })
          }
          pages.push({ height: canvas.height, runs })
        }
        return { version: lib.version, pages }
      },
      { base64: pdfBuffer.toString('base64'), stripX: SIDEBAR_STRIP_X_PT },
    )

    if (rendered.version !== PDFJS_VERSION) {
      throw new Error(`The raster page loaded pdf.js ${rendered.version}, not ${PDFJS_VERSION}`)
    }
    if (rendered.pages.length !== pdf.pages) {
      throw new Error(`The raster has ${rendered.pages.length} pages but the PDF has ${pdf.pages}`)
    }

    return summariseSidebarColumn(rendered.pages, lastTextPt)
  } finally {
    await raster.close()
  }
}

/** One page of the column: runs of identical pixel rows, top to bottom, covering the page. */
export interface ColumnPage {
  height: number
  runs: readonly { hex: string; from: number; to: number }[]
}

const PAPER: ColourSample = { hex: '#FFFFFF', alpha: 255 }

/**
 * The colours a column shows, from its pixel runs. Pure, so its two rules can
 * be demonstrated on synthetic columns:
 *
 * - An EDGE is not a colour: a single pixel row between two different runs,
 *   whose colour is those two mixed at one coverage (`isBlendOf`), is the
 *   anti-aliased boundary a rasteriser draws where one fill ends and the next
 *   begins. A fill two rows tall or more is never an edge, so no band can pass
 *   as one.
 * - Below the last page's lowest text baseline the page may be paper the
 *   document never reached, so blank PAPER there is not a colour anything
 *   drew; any other colour there was painted, and counts.
 */
export function summariseSidebarColumn(pages: readonly ColumnPage[], lastTextPt: number): SidebarColumnReading {
  const colours: ColourSample[] = []
  const runs: string[] = []
  let rowsRead = 0
  pages.forEach((page, index) => {
    const lastRow = index === pages.length - 1 ? Math.floor(lastTextPt) : page.height - 1
    page.runs.forEach((run, position) => {
      const sample: ColourSample = { hex: run.hex, alpha: 255 }
      const before = page.runs[position - 1]
      const after = page.runs[position + 1]
      const edge =
        run.from === run.to &&
        before !== undefined &&
        after !== undefined &&
        isBlendOf(sample, { hex: before.hex, alpha: 255 }, { hex: after.hex, alpha: 255 })
      const paper = run.from > lastRow && coloursAgree(sample, PAPER)
      const qualifier = edge
        ? ` edge between ${before.hex} and ${after.hex}`
        : paper
          ? ' paper below the last text'
          : run.from > lastRow
            ? ' painted below the last text'
            : ''
      runs.push(`page ${index + 1} y${run.from}-${run.to} ${run.hex}${qualifier}`)
      rowsRead += run.to - run.from + 1
      if (!edge && !paper && !colours.some((colour) => coloursAgree(colour, sample))) colours.push(sample)
    })
  })
  return { colours, runs, rowsRead }
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

interface DocxRun {
  text: string
  halfPoints: number | null
  colour: string | null
  font: string | null
  /** `w:spacing w:val` in the run properties, in twips. */
  letterSpacingTwips: number | null
}

interface DocxParagraph {
  index: number
  /** Offset of the paragraph in `word/document.xml`, for finding its table cell. */
  offset: number
  text: string
  runs: DocxRun[]
  shading: string | null
  /** `w:spacing w:line` / `w:lineRule` in the paragraph properties. */
  line: number | null
  lineRule: string | null
}

export interface DocxMeasurement extends SurfaceMeasurement {
  paragraphCount: number
  runCount: number
}

const decodeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/** An attribute of the first `element` in `fragment`. `\b` keeps `w:sz` from matching `w:szCs`. */
function attribute(fragment: string, element: string, name: string): string | null {
  const match = new RegExp(`<${element}\\b[^>]*\\s${name}="([^"]*)"`).exec(fragment)
  return match ? match[1] : null
}

const numberOrNull = (value: string | null) => (value === null ? null : Number(value))

/**
 * The colour a `w:shd` paints. With `w:val="solid"` Word paints the pattern
 * colour `w:color`; otherwise it paints `w:fill`.
 */
function shadingColour(fragment: string): string | null {
  const shd = /<w:shd\b[^>]*\/?>/.exec(fragment)
  if (!shd) return null
  const val = attribute(shd[0], 'w:shd', 'w:val')
  const colour = attribute(shd[0], 'w:shd', 'w:color')
  const fill = attribute(shd[0], 'w:shd', 'w:fill')
  if (val === 'solid' && colour && colour !== 'auto') return `#${colour.toUpperCase()}`
  return fill && fill !== 'auto' ? `#${fill.toUpperCase()}` : null
}

function readRun(content: string): DocxRun {
  const properties = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(content)?.[1] ?? ''
  const texts = Array.from(content.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g), (m) => decodeXml(m[1]))
  const colour = attribute(properties, 'w:color', 'w:val')
  return {
    text: texts.join(''),
    halfPoints: numberOrNull(attribute(properties, 'w:sz', 'w:val')),
    colour: colour === null ? null : colour.toUpperCase(),
    font: attribute(properties, 'w:rFonts', 'w:ascii'),
    letterSpacingTwips: numberOrNull(attribute(properties, 'w:spacing', 'w:val')),
  }
}

function readParagraphs(xml: string): DocxParagraph[] {
  const paragraphs: DocxParagraph[] = []
  for (const match of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const content = match[1]
    const runs = Array.from(content.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g), (m) => readRun(m[1]))
    // The paragraph mark's own run properties sit inside pPr and are not paragraph spacing.
    const paragraphProperties = (/^\s*<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(content)?.[1] ?? '').replace(
      /<w:rPr>[\s\S]*?<\/w:rPr>/g,
      '',
    )
    paragraphs.push({
      index: paragraphs.length,
      offset: match.index ?? 0,
      text: runs.map((run) => run.text).join(''),
      runs,
      shading: shadingColour(paragraphProperties),
      line: numberOrNull(attribute(paragraphProperties, 'w:spacing', 'w:line')),
      lineRule: attribute(paragraphProperties, 'w:spacing', 'w:lineRule'),
    })
  }
  return paragraphs
}

/** The shading of the innermost table cell enclosing `offset`. */
function cellShadingAt(xml: string, offset: number): string | null {
  const stack: number[] = []
  for (const token of xml.matchAll(/<w:tc>|<w:tc\s[^>]*>|<\/w:tc>/g)) {
    if ((token.index ?? 0) >= offset) break
    if (token[0].startsWith('</')) stack.pop()
    else stack.push(token.index ?? 0)
  }
  const start = stack[stack.length - 1]
  if (start === undefined) return null
  const cellProperties = /^<w:tc(?:\s[^>]*)?>\s*<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(xml.slice(start))
  return cellProperties ? shadingColour(cellProperties[1]) : null
}

export async function measureDocx(buffer: Buffer, probe: SurfaceProbe): Promise<DocxMeasurement> {
  const zip = await JSZip.loadAsync(buffer)
  const documentPart = zip.file('word/document.xml')
  const stylesPart = zip.file('word/styles.xml')
  if (!documentPart || !stylesPart) {
    throw new Error(`Not a Word document: parts present are ${Object.keys(zip.files).join(', ')}`)
  }
  const xml = await documentPart.async('string')
  const styles = await stylesPart.async('string')

  const runDefaults = /<w:rPrDefault>([\s\S]*?)<\/w:rPrDefault>/.exec(styles)?.[1] ?? ''
  const paragraphDefaults = /<w:pPrDefault>([\s\S]*?)<\/w:pPrDefault>/.exec(styles)?.[1] ?? ''
  const defaultSize = numberOrNull(attribute(runDefaults, 'w:sz', 'w:val'))
  const defaultFont = attribute(runDefaults, 'w:rFonts', 'w:ascii')
  const defaultLetterSpacing = numberOrNull(attribute(runDefaults, 'w:spacing', 'w:val')) ?? 0
  const defaultLine = numberOrNull(attribute(paragraphDefaults, 'w:spacing', 'w:line'))
  const defaultLineRule = attribute(paragraphDefaults, 'w:spacing', 'w:lineRule')

  const pageWidthTwips = attribute(xml, 'w:pgSz', 'w:w')
  if (pageWidthTwips === null) throw new Error('The DOCX declares no page size (w:pgSz)')

  const paragraphs = readParagraphs(xml)
  const headingText = (paragraph: DocxParagraph) => normalise(paragraph.text.replace(/^[\s|]+/, ''))

  const anchors: { key: string; paragraph: DocxParagraph }[] = []
  for (const section of probe.sections) {
    const wanted = normalise(section.locator.text)
    const matches = paragraphs.filter((paragraph) =>
      section.locator.kind === 'heading'
        ? headingText(paragraph) === wanted
        : paragraph.text.includes(section.locator.text),
    )
    if (matches.length > 1) {
      throw new Error(
        `${matches.length} DOCX paragraphs match section "${section.key}" (${section.locator.text}); ` +
          'the locator is ambiguous',
      )
    }
    if (matches.length === 1) anchors.push({ key: section.key, paragraph: matches[0] })
  }
  anchors.sort((a, b) => a.paragraph.index - b.paragraph.index)

  const uniqueRun = (label: string, within: readonly DocxParagraph[], accept: (run: DocxRun) => boolean) => {
    const found = within.flatMap((paragraph) =>
      paragraph.runs.filter(accept).map((run) => ({ run, paragraph })),
    )
    if (found.length !== 1) throw new Error(`Expected one DOCX run for the ${label}, found ${found.length}`)
    return found[0]
  }

  const runColour = (run: DocxRun): ColourSample => ({
    // `auto` and an absent colour both render as the default text colour, black.
    hex: run.colour && run.colour !== 'AUTO' ? `#${run.colour}` : '#000000',
    alpha: 255,
  })

  const sample = ({ run, paragraph }: { run: DocxRun; paragraph: DocxParagraph }): StyleSample => {
    const halfPoints = run.halfPoints ?? defaultSize
    const font = run.font ?? defaultFont
    if (halfPoints === null || font === null) {
      throw new Error(`DOCX run "${run.text}" has no resolvable size or font`)
    }
    const line = paragraph.line ?? defaultLine ?? 240
    // OOXML: an omitted w:lineRule means auto.
    const lineRule = paragraph.line === null ? (defaultLineRule ?? 'auto') : (paragraph.lineRule ?? 'auto')
    // Auto spacing is in 240ths of the font's single line. Exact and at-least spacing are
    // twips (1/20 pt) and the run size is in half-points, so their quotient is a multiple
    // of the font size like CSS. Only exact spacing is drawn at that multiple for every
    // font; at-least is drawn at it only where the font's single line is not taller.
    const perFontSize = Math.round((line / 20 / (halfPoints / 2)) * 1000) / 1000
    let lineHeight: LineHeight
    switch (lineRule) {
      case 'auto':
        lineHeight = line === 240 ? { kind: 'normal' } : { kind: 'auto-multiple', ratio: Math.round((line / 240) * 1000) / 1000 }
        break
      case 'exact':
        lineHeight = { kind: 'ratio', ratio: perFontSize }
        break
      case 'atLeast':
        lineHeight = { kind: 'at-least', ratio: perFontSize }
        break
      default:
        throw new Error(`DOCX run "${run.text}" has a line rule this check does not read: ${lineRule}`)
    }
    return {
      text: run.text,
      px: halfPoints / 1.5,
      halfPoints,
      colour: runColour(run),
      backdrop: null,
      fontFamily: font,
      declaredFamily: font,
      letterSpacingTwips: run.letterSpacingTwips ?? defaultLetterSpacing,
      lineHeight,
    }
  }

  const headingParagraphs = paragraphs.filter((p) => headingText(p) === normalise(probe.headingText))
  const sidebarAnchor = anchors.find((anchor) => probe.sidebarKeys.includes(anchor.key))
  const sidebarColour = (depth: number | null, read: (paragraph: DocxParagraph) => string | null, label: string) => {
    if (depth === null) return null
    if (!sidebarAnchor) throw new Error(`No sidebar section in the DOCX to read the ${label} from`)
    const hex = read(sidebarAnchor.paragraph)
    if (hex === null) throw new Error(`The DOCX ${label} has no shading`)
    return { hex, alpha: 255 }
  }

  const extraColours: Record<string, ExtraColourSample> = {}
  for (const extra of probe.extraColourSamples) {
    const { run } = uniqueRun(`"${extra.text}" text`, paragraphs, (r) => normalise(r.text) === normalise(extra.text))
    extraColours[extra.key] = { colour: runColour(run), backdrop: null }
  }

  return {
    sequence: anchors.map((anchor) => anchor.key),
    paragraphCount: paragraphs.length,
    runCount: paragraphs.reduce((total, paragraph) => total + paragraph.runs.length, 0),
    pageWidthInches: Number(pageWidthTwips) / 1440,
    typography: probe.sampleTypography
      ? {
          documentTitle: sample(
            uniqueRun('document title', paragraphs, (run) => normalise(run.text) === normalise(probe.titleText)),
          ),
          sectionHeading: sample(
            uniqueRun('section heading', headingParagraphs, (run) => normalise(run.text) === normalise(probe.headingText)),
          ),
          bodyText: sample(uniqueRun('body text', paragraphs, (run) => run.text.includes(probe.bodyMarker))),
        }
      : null,
    extraColours,
    sidebarBackground: sidebarColour(
      probe.sidebarBackgroundDepth,
      (paragraph) => cellShadingAt(xml, paragraph.offset),
      'sidebar background',
    ),
    accent: sidebarColour(probe.accentDepth, (paragraph) => paragraph.shading, 'accent'),
  }
}
