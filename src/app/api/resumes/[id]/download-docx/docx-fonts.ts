import { readFile } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { INTER_FONTSOURCE_PACKAGE, SUPPLEMENTED_HYPHENS, readOncePerInstance } from '@/lib/pdf/font-substitutes'
import { buildCmap, cmapGlyphIds, decodeWoff, encodeSfnt } from '@/lib/pdf/sfnt'
import { APP_BODY_FONT } from './docx-helpers'

/**
 * Inter, embedded in the Word export of the templates that draw their text in
 * it.
 *
 * WHY. A Word file that only names Inter is drawn in a substitute on any
 * computer without Inter, with other advance widths: the lines break
 * elsewhere and the pages end at other entries than the PDF's. Embedded, the
 * font travels with the file. Georgia and Arial are on every computer that
 * opens a Word file, so the templates drawn only in them embed nothing.
 *
 * WHICH. The faces a Word run can select: regular, and bold (`w:b`). Word has
 * no other weight under one family name, and the generators draw every bolder
 * text bold. No italic: the app serves Inter upright only and the browser
 * slants it for italic text, as Word slants an embedded upright face.
 *
 * WHAT. The latin subset of `@fontsource/inter`, the font revision next/font
 * serves the Preview and the PDF (`font-substitutes.ts`), and the only subset
 * the app loads (`subsets: ['latin']`): a character outside it falls back to
 * another font in Word as it does in the Preview. Its WOFF holds TrueType
 * (`glyf`) outlines, which Word requires, and is written back out as a plain
 * TrueType file. Like the PDF's hyphen supplement, its `cmap` also maps the
 * hyphens the subset lacks (U+2010–2012) to its own hyphen, so Word draws them
 * in Inter too.
 *
 * HOW. `docx` obfuscates each font as OOXML requires and writes one font-table
 * entry per font, each declared regular; `pairInterFaces` then makes the second
 * the first's bold face, so Word draws bold runs with it, and sets Word's
 * "Embed fonts in the file" (`w:embedTrueTypeFonts`), so the faces are still
 * in the file after its owner edits and saves it in Word. Whole faces, not
 * subsets (no `w:saveSubsetFonts`): an edit may type a character the
 * original text did not use.
 */

/** The faces embedded, in the order of `interDocxFonts`: regular first, then bold. */
export const INTER_DOCX_FACES = Object.freeze([
  { face: 'regular', file: 'inter-latin-400-normal.woff' },
  { face: 'bold', file: 'inter-latin-700-normal.woff' },
] as const)

const HYPHEN_MINUS = 0x2d

/**
 * A TrueType file of the font in this WOFF, with the hyphens it lacks mapped
 * to its own U+002D glyph. Every other table is kept as it is, so the glyphs,
 * their advance widths and the vertical metrics are the face's own.
 */
export function wordTrueType(woff: Buffer): Buffer {
  const tables = decodeWoff(woff)
  if (!tables.has('glyf')) throw new Error('The font has no glyf table: Word embeds TrueType outlines only')
  const cmap = tables.get('cmap')
  if (!cmap) throw new Error('The font has no cmap table')
  const glyphIds = cmapGlyphIds(cmap)
  const hyphen = glyphIds.get(HYPHEN_MINUS)
  if (hyphen === undefined) throw new Error('The font has no glyph for U+002D')
  const missing = SUPPLEMENTED_HYPHENS.filter((codePoint) => !glyphIds.has(codePoint))
  if (missing.length > 0) {
    for (const codePoint of missing) glyphIds.set(codePoint, hyphen)
    tables.set('cmap', buildCmap(glyphIds))
  }
  return encodeSfnt(tables)
}

/** One font of a `docx` Document's `fonts`: the family name and its TrueType data. */
export interface DocxFont {
  readonly name: string
  readonly data: Buffer
}

/**
 * Inter's regular and bold faces, as a `docx` Document's `fonts`, read from
 * the installed package. `fontsourceRoot` is `node_modules/@fontsource` of the
 * running app; the files are listed for the Word route's output trace in
 * `next.config.js`.
 */
export async function loadInterDocxFonts(fontsourceRoot: string): Promise<DocxFont[]> {
  const packageDir = path.join(fontsourceRoot, INTER_FONTSOURCE_PACKAGE, 'files')
  return Promise.all(
    INTER_DOCX_FACES.map(async ({ file }) => ({ name: APP_BODY_FONT, data: wordTrueType(await readFile(path.join(packageDir, file))) })),
  )
}

/** Inter's faces for a Word export, read and converted once per server instance. */
export const interDocxFonts: () => Promise<DocxFont[]> = readOncePerInstance(loadInterDocxFonts)

const INTER_FONT_ENTRY = new RegExp(`<w:font w:name="${APP_BODY_FONT}">[\\s\\S]*?</w:font>`, 'g')
const EMBED_REGULAR = /<w:embedRegular (r:id="[^"]+" w:fontKey="[^"]+")\/>/

/**
 * The font table with Inter's two entries made one: the first entry's face is
 * its regular, the second's becomes its bold (`w:embedBold`, which follows
 * `w:embedRegular` in CT_Font). Anything but exactly two Inter entries, each
 * with one regular face, is an error: a `docx` change of how it writes them
 * must fail the export loudly, not ship a file whose bold is drawn as regular.
 */
export function pairInterFaceEntries(fontTableXml: string): string {
  const entries = [...fontTableXml.matchAll(INTER_FONT_ENTRY)]
  if (entries.length !== INTER_DOCX_FACES.length) {
    throw new Error(`The font table has ${entries.length} ${APP_BODY_FONT} entries, not ${INTER_DOCX_FACES.length}`)
  }
  const [regular, bold] = entries
  const boldEmbed = EMBED_REGULAR.exec(bold[0])
  if (!EMBED_REGULAR.test(regular[0]) || !boldEmbed) throw new Error(`An embedded ${APP_BODY_FONT} entry has no regular face`)
  const merged = regular[0].replace('</w:font>', `<w:embedBold ${boldEmbed[1]}/></w:font>`)
  const regularEnd = (regular.index ?? 0) + regular[0].length
  const boldStart = bold.index ?? 0
  return (
    fontTableXml.slice(0, regular.index) +
    merged +
    fontTableXml.slice(regularEnd, boldStart) +
    fontTableXml.slice(boldStart + bold[0].length)
  )
}

/**
 * The CT_Settings children that come before `w:embedTrueTypeFonts`, in schema
 * order (ECMA-376 Part 1, 17.15.1.78): the new element goes after the last of
 * them the settings have.
 */
const SETTINGS_BEFORE_EMBED_FONTS = [
  'writeProtection',
  'view',
  'zoom',
  'removePersonalInformation',
  'removeDateAndTime',
  'doNotDisplayPageBoundaries',
  'displayBackgroundShape',
  'printPostScriptOverText',
  'printFractionalCharacterWidth',
  'printFormsData',
]

/**
 * The document settings with Word's "Embed fonts in the file" on, in its
 * place in the schema's sequence. Settings that already have it are an
 * error: nothing else writes it, so it would mean `docx` changed.
 */
export function embedFontsSetting(settingsXml: string): string {
  if (/<w:embedTrueTypeFonts\b/.test(settingsXml)) throw new Error('The settings already set w:embedTrueTypeFonts')
  const open = /<w:settings\b[^>]*>/.exec(settingsXml)
  if (!open) throw new Error('The settings have no w:settings element')
  let at = open.index + open[0].length
  for (const name of SETTINGS_BEFORE_EMBED_FONTS) {
    const element = new RegExp(`<w:${name}\\b[^>]*/>|<w:${name}\\b[^>]*>[\\s\\S]*?</w:${name}>`).exec(settingsXml)
    if (element) at = Math.max(at, element.index + element[0].length)
  }
  return `${settingsXml.slice(0, at)}<w:embedTrueTypeFonts/>${settingsXml.slice(at)}`
}

/**
 * The packed Word file with Inter's bold face declared as such
 * (`pairInterFaceEntries`) and its fonts kept on save (`embedFontsSetting`).
 */
export async function pairInterFaces(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file('word/fontTable.xml')
  if (!file) throw new Error('The generated document has no word/fontTable.xml')
  const settings = zip.file('word/settings.xml')
  if (!settings) throw new Error('The generated document has no word/settings.xml')
  zip.file('word/fontTable.xml', pairInterFaceEntries(await file.async('string')))
  zip.file('word/settings.xml', embedFontsSetting(await settings.async('string')))
  // Compressed as `Packer` writes it, so the file grows by the font data alone.
  return (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })) as Buffer
}
