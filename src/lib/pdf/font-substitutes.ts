import { readFile } from 'node:fs/promises'
import path from 'node:path'

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
  /** `url(data:font/woff2;base64,…) format('woff2')`: no request leaves the page for it. */
  source: string
}

/** One `@font-face` rule of a Fontsource stylesheet, reduced to what is used. */
export interface FontsourceFace {
  weight: number
  style: string
  /** The WOFF2 file, relative to the package folder: `files/<name>.woff2`. */
  woff2: string
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
    const unicodeRange = /unicode-range:\s*([U+0-9A-Fa-f?,\s-]+);/.exec(body)?.[1]?.trim()
    if (!weight || !style || !woff2 || !unicodeRange) {
      throw new Error('A Fontsource @font-face rule lacks its weight, style, WOFF2 source or unicode-range')
    }
    faces.push({ weight: Number(weight), style, woff2, unicodeRange })
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
          const css = await readFile(path.join(packageDir, fontsourceStylesheetName(faceStyle)), 'utf8')
          const faces = parseFontsourceStylesheet(css)
          if (faces.length === 0) throw new Error(`No @font-face rule in ${fontsourcePackage} ${fontsourceStylesheetName(faceStyle)}`)
          return Promise.all(
            faces.map(async (face): Promise<SubstituteFontFace> => {
              if (face.weight !== faceStyle.weight || face.style !== faceStyle.style) {
                throw new Error(`${fontsourcePackage} ${fontsourceStylesheetName(faceStyle)} declares another weight or style`)
              }
              const data = await readFile(path.join(packageDir, face.woff2))
              return {
                family,
                weight: face.weight,
                style: face.style,
                unicodeRange: face.unicodeRange,
                source: `url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')`,
              }
            }),
          )
        }),
      )
      return perStyle.flat()
    }),
  )
  return perPackage.flat()
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
