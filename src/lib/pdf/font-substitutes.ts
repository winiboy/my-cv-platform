import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildCmap, cmapGlyphId, decodeWoff, encodeSfnt } from './sfnt'

/**
 * Metric-compatible stand-ins for the system fonts a resume can be printed in,
 * for the serverless renderer only.
 *
 * WHY. The user's Preview, and the print they compare the PDF with, use their
 * own computer's fonts. The serverless Chromium has a single system font (Open
 * Sans, from `@sparticuz/chromium`), so any family that is neither a web font
 * nor installed there would print in Open Sans: other glyph widths, other line
 * breaks, possibly another page count. A metric-compatible family has the same
 * advance width for every glyph as the font it replaces, so the text breaks
 * into the same lines and pages.
 *
 * HOW. Each stand-in is registered in the headless page, under the NAME of the
 * font it replaces, as a `FontFace` (`registerFontSubstitutes`). A font face
 * registered by the page wins over a system font of the same name, which is
 * exactly why this happens only where that system font is absent: on a
 * developer's Windows or macOS machine the real Arial, Calibri or Georgia
 * prints, as it does today. Registered in the page rather than installed for
 * fontconfig, because the packages ship WOFF2 and WOFF only, which Chromium's
 * own web-font decoder reads (the path the Google Fonts already take) and
 * which can therefore be checked on any machine; whether the serverless
 * build's FreeType reads WOFF2 as a system font cannot.
 *
 * WHICH. Only the families a printed resume can reach where the replaced font
 * is absent (docs/engineering/pdf-export-runtime.md, "Fonts on the server"):
 *
 *   - Arial: the "Arial" picker entry, and the end of the "Helvetica" one.
 *   - Calibri: the "Calibri" picker entry, ahead of its Outfit fallback.
 *   - Georgia: Classic's default title and section headings (`font-serif`,
 *     whose first installed family on Windows and macOS is Georgia).
 *
 * Only the faces the replaced fonts have: regular, italic, bold and bold
 * italic. Registering a 500 or 600 the real font lacks would print a weight
 * the user's own print cannot show; with 400 and 700 only, the browser's
 * weight matching resolves medium to regular and semibold to bold, as it does
 * for the real font.
 *
 * HYPHENS. Each latin subset is registered for the whole block U+2000–206F,
 * yet the latin subsets of Gelasio, Arimo and Carlito have no glyph for
 * U+2010 HYPHEN, U+2011 NON-BREAKING HYPHEN or U+2012 FIGURE DASH, and
 * neither has the serverless Chromium's Open Sans: with nothing to fall back
 * to, those printed as the missing-glyph box. Each face style therefore gets
 * a supplement (`hyphenSupplement`): the same font, read from its WOFF
 * sibling, with a `cmap` mapping only the code points it lacks to its own
 * U+002D glyph. It is the one face registered for those code points, which
 * the subsets' ranges no longer claim, so the choice does not depend on
 * declaration order. That includes Arimo's Hebrew subset, which does draw
 * U+2010: taking it out of that range is intentional, so all three hyphens
 * print with the latin hyphen.
 *
 * The text is not rewritten: a U+2011 still does not break and still copies
 * as U+2011, and it prints with the advance of the substitute's own hyphen.
 * Being a separate font run, it is not kerned against the letters beside it.
 * A font change `hyphenSupplement` rejects fails every serverless PDF at
 * stage `fonts`; the unit tests run it against the installed packages.
 */

export interface FontSubstitute {
  /** The font the resume names and the user's computer has. */
  readonly family: string
  /** The `@fontsource/<name>` package with its metric-compatible stand-in. */
  readonly fontsourcePackage: 'arimo' | 'carlito' | 'gelasio'
}

export const FONT_SUBSTITUTES: readonly FontSubstitute[] = Object.freeze([
  { family: 'Arial', fontsourcePackage: 'arimo' },
  { family: 'Calibri', fontsourcePackage: 'carlito' },
  { family: 'Georgia', fontsourcePackage: 'gelasio' },
])

export type SubstituteFaceStyle = { weight: 400 | 700; style: 'normal' | 'italic' }

/** The four faces Arial, Calibri and Georgia each have. */
export const SUBSTITUTE_FACE_STYLES: readonly SubstituteFaceStyle[] = Object.freeze([
  { weight: 400, style: 'normal' },
  { weight: 400, style: 'italic' },
  { weight: 700, style: 'normal' },
  { weight: 700, style: 'italic' },
])

/** One face as the page registers it: one weight, style and script subset. */
export interface SubstituteFontFace {
  family: string
  weight: number
  style: string
  /** The CSS `unicode-range` of the subset, so only the scripts a CV uses are decoded. */
  unicodeRange: string
  /**
   * `url(data:font/woff2;base64,…) format('woff2')`, or `font/ttf` and
   * `truetype` for a hyphen supplement: no request leaves the page for it.
   */
  source: string
}

/** One `@font-face` rule of a Fontsource stylesheet, reduced to what is used. */
export interface FontsourceFace {
  weight: number
  style: string
  /** The WOFF2 file, relative to the package folder: `files/<name>.woff2`. */
  woff2: string
  /** Its WOFF sibling, the same font revision, read only to build the hyphen supplement. */
  woff: string
  unicodeRange: string
}

const FONT_FACE_RULE = /@font-face\s*\{([^}]*)\}/g

/**
 * The `@font-face` rules of a Fontsource stylesheet (`400.css`,
 * `700-italic.css`…): one per script subset. A rule missing any descriptor
 * this module relies on is an error, not a skipped face: a package update
 * that changed its stylesheets must fail the render loudly, not print with a
 * subset quietly missing.
 */
export function parseFontsourceStylesheet(css: string): FontsourceFace[] {
  const faces: FontsourceFace[] = []
  for (const [, body] of css.matchAll(FONT_FACE_RULE)) {
    const weight = /font-weight:\s*(\d+)\s*;/.exec(body)?.[1]
    const style = /font-style:\s*(normal|italic)\s*;/.exec(body)?.[1]
    const woff2 = /url\(\.\/(files\/[a-z0-9-]+\.woff2)\)\s*format\(['"]woff2['"]\)/.exec(body)?.[1]
    const woff = /url\(\.\/(files\/[a-z0-9-]+\.woff)\)\s*format\(['"]woff['"]\)/.exec(body)?.[1]
    const unicodeRange = /unicode-range:\s*([U+0-9A-Fa-f?,\s-]+);/.exec(body)?.[1]?.trim()
    if (!weight || !style || !woff2 || !woff || !unicodeRange) {
      throw new Error('A Fontsource @font-face rule lacks its weight, style, WOFF2 source, WOFF source or unicode-range')
    }
    faces.push({ weight: Number(weight), style, woff2, woff, unicodeRange })
  }
  return faces
}

/** The Fontsource stylesheet holding every subset of one weight and style. */
export function fontsourceStylesheetName({ weight, style }: SubstituteFaceStyle): string {
  return style === 'italic' ? `${weight}-italic.css` : `${weight}.css`
}

/**
 * Every face of every substitute, read from the installed packages.
 *
 * `fontsourceRoot` is `node_modules/@fontsource` of the running app. The files
 * are listed for this route's output trace in `next.config.js`.
 */
export async function loadFontSubstitutes(fontsourceRoot: string): Promise<SubstituteFontFace[]> {
  const perPackage = await Promise.all(
    FONT_SUBSTITUTES.map(async ({ family, fontsourcePackage }) => {
      const packageDir = path.join(fontsourceRoot, fontsourcePackage)
      const perStyle = await Promise.all(
        SUBSTITUTE_FACE_STYLES.map(async (faceStyle) => {
          const stylesheet = `${fontsourcePackage} ${fontsourceStylesheetName(faceStyle)}`
          const css = await readFile(path.join(packageDir, fontsourceStylesheetName(faceStyle)), 'utf8')
          const faces = parseFontsourceStylesheet(css)
          if (faces.length === 0) throw new Error(`No @font-face rule in ${stylesheet}`)
          for (const face of faces) {
            if (face.weight !== faceStyle.weight || face.style !== faceStyle.style) {
              throw new Error(`${stylesheet} declares another weight or style`)
            }
          }

          const hyphenFaces = faces.filter((face) => unicodeRangeIncludes(face.unicodeRange, HYPHEN_MINUS))
          if (hyphenFaces.length !== 1) throw new Error(`${stylesheet} has ${hyphenFaces.length} subsets for U+002D, not one`)
          const supplement = hyphenSupplement(await readFile(path.join(packageDir, hyphenFaces[0].woff)))

          const subsets = await Promise.all(
            faces.map(async (face): Promise<SubstituteFontFace> => {
              const data = await readFile(path.join(packageDir, face.woff2))
              return {
                family,
                weight: face.weight,
                style: face.style,
                unicodeRange: supplement ? excludeFromUnicodeRange(face.unicodeRange, supplement.codePoints) : face.unicodeRange,
                source: `url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')`,
              }
            }),
          )
          if (!supplement) return subsets
          return [
            ...subsets,
            {
              family,
              weight: faceStyle.weight,
              style: faceStyle.style,
              unicodeRange: formatUnicodeRange(supplement.codePoints),
              source: `url(data:font/ttf;base64,${supplement.font.toString('base64')}) format('truetype')`,
            },
          ]
        }),
      )
      return perStyle.flat()
    }),
  )
  return perPackage.flat()
}

const HYPHEN_MINUS = 0x2d

/** The hyphens a supplement draws with the font's own U+002D glyph, when the font lacks them. */
export const SUPPLEMENTED_HYPHENS: readonly number[] = Object.freeze([0x2010, 0x2011, 0x2012])

/**
 * The supplement for one face: its font, from the WOFF of the subset holding
 * U+002D, with a `cmap` mapping the hyphens it lacks to its U+002D glyph, and
 * every other table as it is, so the glyph, its advance width and the font's
 * vertical metrics are the face's own. `null` when the font lacks none.
 *
 * A font without a U+002D glyph is an error, not a face left without
 * supplement: a package update that changed its fonts must fail loudly.
 */
export function hyphenSupplement(woff: Buffer): { codePoints: number[]; font: Buffer } | null {
  const tables = decodeWoff(woff)
  const cmap = tables.get('cmap')
  if (!cmap) throw new Error('The font has no cmap table')
  const hyphenGlyph = cmapGlyphId(cmap, HYPHEN_MINUS)
  if (hyphenGlyph === 0) throw new Error('The font has no glyph for U+002D')
  const codePoints = SUPPLEMENTED_HYPHENS.filter((codePoint) => cmapGlyphId(cmap, codePoint) === 0)
  if (codePoints.length === 0) return null
  tables.set('cmap', buildCmap(new Map(codePoints.map((codePoint) => [codePoint, hyphenGlyph]))))
  return { codePoints, font: encodeSfnt(tables) }
}

/** One `U+…` term of a CSS `unicode-range`, as its first and last code point. */
function unicodeRangeTerm(term: string): { first: number; last: number } {
  const match = /^U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?$/i.exec(term.trim())
  if (!match) throw new Error(`Unreadable unicode-range term: ${term}`)
  const [, start, end] = match
  if (end !== undefined) {
    // CSS allows a wildcard only in a single-value term.
    if (start.includes('?')) throw new Error(`A unicode-range wildcard cannot have an end: ${term}`)
    return { first: parseInt(start, 16), last: parseInt(end, 16) }
  }
  return { first: parseInt(start.replace(/\?/g, '0'), 16), last: parseInt(start.replace(/\?/g, 'F'), 16) }
}

/** The terms of a CSS `unicode-range`, each as its first and last code point. */
export function parseUnicodeRange(unicodeRange: string): { first: number; last: number }[] {
  return unicodeRange.split(',').map(unicodeRangeTerm)
}

export function unicodeRangeIncludes(unicodeRange: string, codePoint: number): boolean {
  return parseUnicodeRange(unicodeRange).some(({ first, last }) => first <= codePoint && codePoint <= last)
}

function hex(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, '0')
}

/** The code points as `unicode-range` terms, consecutive ones merged: `U+2010-2012`. */
export function formatUnicodeRange(codePoints: readonly number[]): string {
  const terms: string[] = []
  const sorted = [...codePoints].sort((a, b) => a - b)
  for (let index = 0; index < sorted.length; ) {
    let end = index
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++
    terms.push(index === end ? `U+${hex(sorted[index])}` : `U+${hex(sorted[index])}-${hex(sorted[end])}`)
    index = end + 1
  }
  return terms.join(',')
}

/**
 * The range without these code points. A term that holds none of them is
 * kept as written, so a range the supplement does not touch is unchanged.
 */
export function excludeFromUnicodeRange(unicodeRange: string, codePoints: readonly number[]): string {
  const terms = unicodeRange.split(',').flatMap((term) => {
    const { first, last } = unicodeRangeTerm(term)
    const excluded = codePoints.filter((codePoint) => first <= codePoint && codePoint <= last).sort((a, b) => a - b)
    if (excluded.length === 0) return [term]
    const kept: string[] = []
    let next = first
    for (const codePoint of [...excluded, last + 1]) {
      if (codePoint > next) kept.push(next === codePoint - 1 ? `U+${hex(next)}` : `U+${hex(next)}-${hex(codePoint - 1)}`)
      next = codePoint + 1
    }
    return kept
  })
  if (terms.length === 0) throw new Error('Excluding the supplemented code points leaves an empty unicode-range')
  return terms.join(',')
}

/**
 * The substitutes, read once per server instance. A failed read is forgotten,
 * so the next request tries again.
 */
let cached: Promise<SubstituteFontFace[]> | null = null

export function serverlessFontSubstitutes(): Promise<SubstituteFontFace[]> {
  // `process.cwd()` is the app's root under `next start` and in a Vercel
  // function (/var/task), where the traced `node_modules` sits.
  cached ??= loadFontSubstitutes(path.join(process.cwd(), 'node_modules', '@fontsource')).catch((error: unknown) => {
    cached = null
    throw error
  })
  return cached
}

/**
 * Registers the faces in the page. Runs INSIDE the headless page as an init
 * script, before any of the page's own scripts, so it must not reference
 * anything outside its body. Only on the app's own documents.
 *
 * `FontFace` + `document.fonts.add` rather than a `<style>` element, so the
 * document React hydrates is untouched. A `data:` source is fetched by no one
 * (`font-src` already allows `data:`), and is decoded lazily: only the faces
 * whose `unicode-range` the CV actually uses.
 */
export function registerFontSubstitutes({ origin, faces }: { origin: string; faces: readonly SubstituteFontFace[] }): void {
  if (window.location.origin !== origin) return
  for (const face of faces) {
    document.fonts.add(
      new FontFace(face.family, face.source, {
        weight: String(face.weight),
        style: face.style,
        unicodeRange: face.unicodeRange,
      }),
    )
  }
}

/** The families the page registers, to check after load that none failed. */
export const SUBSTITUTE_FAMILIES: readonly string[] = Object.freeze(FONT_SUBSTITUTES.map(({ family }) => family))
