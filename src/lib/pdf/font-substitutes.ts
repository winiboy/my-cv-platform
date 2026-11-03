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
 *
 * INTER. Not a substitute: the app's own `next/font` Inter is served to the
 * headless page as to the user, and prints. Its latin subset, too, claims
 * U+2000–206F without drawing U+2010–2012, so a resume printed in Inter
 * (Classic's body text, and Minimal's and Creative's when no font is chosen)
 * showed the same box. Inter therefore gets the same supplement, built from
 * `@fontsource/inter` (the same font revision as next/font's), but none of
 * its own faces are registered or replaced. Because next/font names the
 * family in the page's CSS, the resume renderer reads that name from the
 * page and registers the supplements under the fallback family next/font
 * lists right after Inter (`nextFontInterFallbackFamily`): the browser falls
 * through to that family for a character Inter has no glyph for. Only the
 * resume renderer: the cover letter prints in Georgia, Arial and Calibri.
 *
 * Only Inter inherited from `<body>` is covered. The font picker's own "Inter"
 * entry (`'Inter', sans-serif`) never reaches that fallback family, so a CV
 * where the user picks Inter still prints the box for U+2010–2012 there.
 * Covering it would change the picker's stack, out of this scope; registering
 * in the Inter family itself is not done, as a face there can displace
 * next/font's variable face.
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

/** One weight and style of a Fontsource package: one stylesheet. */
export type FontsourceFaceStyle = { weight: number; style: 'normal' | 'italic' }

export type SubstituteFaceStyle = FontsourceFaceStyle & { weight: 400 | 700 }

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
export function fontsourceStylesheetName({ weight, style }: FontsourceFaceStyle): string {
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
          const { faces, supplement } = await readFontsourceFaceStyle(packageDir, fontsourcePackage, faceStyle)
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
          return [...subsets, { family, ...supplementFace(faceStyle, supplement) }]
        }),
      )
      return perStyle.flat()
    }),
  )
  return perPackage.flat()
}

/**
 * One stylesheet of a Fontsource package, checked, and the hyphen supplement
 * of its subset holding U+002D. Shared by the substitutes and Inter, so both
 * are read, checked and supplemented the same way.
 */
async function readFontsourceFaceStyle(
  packageDir: string,
  fontsourcePackage: string,
  faceStyle: FontsourceFaceStyle,
): Promise<{ faces: FontsourceFace[]; supplement: { codePoints: number[]; font: Buffer } | null }> {
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
  return { faces, supplement }
}

/** A supplement as a face: registered for exactly the hyphens it maps, inline. */
function supplementFace(
  { weight, style }: FontsourceFaceStyle,
  supplement: { codePoints: number[]; font: Buffer },
): HyphenSupplementFace {
  return {
    weight,
    style,
    unicodeRange: formatUnicodeRange(supplement.codePoints),
    source: `url(data:font/ttf;base64,${supplement.font.toString('base64')}) format('truetype')`,
  }
}

/**
 * A hyphen supplement for a font whose own faces the page already has, before
 * the family it is registered under is known: the page names that family.
 */
export type HyphenSupplementFace = Omit<SubstituteFontFace, 'family'>

/** The `@fontsource` package Inter's supplements are built from. */
export const INTER_FONTSOURCE_PACKAGE = 'inter'

/**
 * Every weight of next/font's variable Inter (`font-weight: 100 900`), upright
 * only. Inter's hyphen widens with the weight, so each weight a template can
 * print in (light to black) needs its own; a static weight is a named
 * instance of the variable font, with the same advances. No italic: next/font
 * serves Inter upright only and the browser slants it for italic text, so an
 * italic hyphen is the slanted upright one, which an upright supplement
 * reproduces the same way. A real italic face would print another glyph.
 */
export const INTER_FACE_STYLES: readonly FontsourceFaceStyle[] = Object.freeze(
  [100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => ({ weight, style: 'normal' as const })),
)

/**
 * Inter's hyphen supplements, one per weight, from the installed package. Only
 * the supplement of the latin subset: Inter's own faces stay next/font's.
 */
export async function loadInterHyphenSupplements(fontsourceRoot: string): Promise<HyphenSupplementFace[]> {
  const packageDir = path.join(fontsourceRoot, INTER_FONTSOURCE_PACKAGE)
  const perStyle = await Promise.all(
    INTER_FACE_STYLES.map(async (faceStyle) => {
      const { supplement } = await readFontsourceFaceStyle(packageDir, INTER_FONTSOURCE_PACKAGE, faceStyle)
      return supplement ? [supplementFace(faceStyle, supplement)] : []
    }),
  )
  return perStyle.flat()
}

/** The family next/font gives Inter in this app's CSS (`@font-face` and `inter.className`). */
export const NEXT_FONT_INTER_FAMILY = 'Inter'

/**
 * The fallback family next/font lists right after Inter, read from the
 * computed `font-family` of the page's `<body>` (`inter.className`), which the
 * resume inherits unless a font is chosen.
 *
 * next/font writes the class as `'<family>', '<family> Fallback'`, the second
 * being an `@font-face` with `local("Arial")` and size overrides. Inter's own
 * faces claim U+2010–2012 by `unicode-range` but have no glyph for them, so the
 * browser takes those characters from the next family of the list: registered
 * there, the supplement draws them, without competing with Inter's faces in
 * Inter's own family.
 *
 * A body that does not start with exactly that pair is an error, not "no
 * Inter": a Next.js change of how it names the families must fail the render
 * loudly, not register the supplement under a name no text uses.
 *
 * The value comes from the page, whose scripts could make it anything, so it
 * is bounded before it is parsed, and parsed in linear time.
 */
export function nextFontInterFallbackFamily(bodyFontFamily: string): string {
  const fallback = `${NEXT_FONT_INTER_FAMILY} Fallback`
  const error = new Error(`The page's font-family does not start with next/font's ${NEXT_FONT_INTER_FAMILY} and its fallback`)
  if (bodyFontFamily.length > MAX_FONT_FAMILY_LENGTH) throw error
  let families: string[]
  try {
    families = parseFontFamilyList(bodyFontFamily)
  } catch (cause) {
    throw new Error(error.message, { cause })
  }
  if (families[0] !== NEXT_FONT_INTER_FAMILY || families[1] !== fallback) throw error
  return fallback
}

/**
 * The longest page-read `font-family` value parsed. The body's is next/font's
 * pair, about 25 characters; anything near this bound is not that stack.
 */
export const MAX_FONT_FAMILY_LENGTH = 256

/**
 * The family names of a CSS `font-family` value, unquoted: `Inter, "Inter
 * Fallback"` (computed) and `'Inter', 'Inter Fallback'` (authored) alike. A
 * character scanner, so its time is linear in the length of the value. A
 * malformed value (an unterminated quote, text after a quoted name, an empty
 * entry) is an error.
 */
export function parseFontFamilyList(value: string): string[] {
  const families: string[] = []
  const isSpace = (char: string) => char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f'
  let index = 0
  const skipSpaces = () => {
    while (index < value.length && isSpace(value[index])) index++
  }
  while (true) {
    skipSpaces()
    let family = ''
    const quote = value[index]
    if (quote === '"' || quote === "'") {
      index++
      while (index < value.length && value[index] !== quote) {
        if (value[index] === '\\') index++
        if (index < value.length) family += value[index++]
      }
      if (index >= value.length) throw new Error('Unterminated quoted font family')
      index++
      skipSpaces()
    } else {
      let pendingSpace = false
      while (index < value.length && value[index] !== ',') {
        const char = value[index++]
        if (char === '"' || char === "'") throw new Error('A quote inside an unquoted font family')
        if (isSpace(char)) {
          pendingSpace = family.length > 0
        } else {
          family += (pendingSpace ? ' ' : '') + (char === '\\' && index < value.length ? value[index++] : char)
          pendingSpace = false
        }
      }
      if (family === '') throw new Error('An empty font family')
    }
    families.push(family)
    if (index >= value.length) return families
    if (value[index] !== ',') throw new Error('Text after a quoted font family')
    index++
  }
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
 * A read done once per server instance. A failed read is forgotten, so the
 * next request tries again.
 */
function readOncePerInstance<T>(read: (fontsourceRoot: string) => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null
  return () => {
    // `process.cwd()` is the app's root under `next start` and in a Vercel
    // function (/var/task), where the traced `node_modules` sits.
    cached ??= read(path.join(process.cwd(), 'node_modules', '@fontsource')).catch((error: unknown) => {
      cached = null
      throw error
    })
    return cached
  }
}

export const serverlessFontSubstitutes: () => Promise<SubstituteFontFace[]> = readOncePerInstance(loadFontSubstitutes)

export const serverlessInterHyphenSupplements: () => Promise<HyphenSupplementFace[]> =
  readOncePerInstance(loadInterHyphenSupplements)

/**
 * Registers the faces in the page and returns them. Runs INSIDE the headless
 * page, so it must not reference anything outside its body: as an init script
 * before any of the page's own scripts (the substitutes), or once the page has
 * loaded (Inter's supplements, whose family the page names). Only on the
 * app's own documents.
 *
 * `FontFace` + `document.fonts.add` rather than a `<style>` element, so the
 * document React hydrates is untouched. A `data:` source is fetched by no one
 * (`font-src` already allows `data:`), and is decoded lazily: only the faces
 * whose `unicode-range` the CV actually uses.
 */
export function registerFontSubstitutes({ origin, faces }: { origin: string; faces: readonly SubstituteFontFace[] }): FontFace[] {
  if (window.location.origin !== origin) return []
  return faces.map((face) => {
    const fontFace = new FontFace(face.family, face.source, {
      weight: String(face.weight),
      style: face.style,
      unicodeRange: face.unicodeRange,
    })
    document.fonts.add(fontFace)
    return fontFace
  })
}

/** The families the page registers, to check after load that none failed. */
export const SUBSTITUTE_FAMILIES: readonly string[] = Object.freeze(FONT_SUBSTITUTES.map(({ family }) => family))
