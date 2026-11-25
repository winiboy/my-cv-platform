import { readFileSync } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'

/**
 * Inter's advance widths, read at test time from the WOFF files of
 * `@fontsource/inter` (already a dependency: the PDF route's font), so a test
 * can measure whether a word fits a column of a template drawn in Inter.
 * Test-only: nothing here ships, and no width is copied into the source.
 *
 * Kerning is not applied, so a summed width is never narrower than the one a
 * browser or Word draws with Inter's pair kerning. A character the latin and
 * latin-ext subsets do not map throws, rather than being measured as anything.
 */

export type InterWeight = 400 | 600 | 700

interface Face {
  unitsPerEm: number
  advance: Map<number, number>
}

const FONT_DIR = path.join(process.cwd(), 'node_modules/@fontsource/inter/files')

/** The tables of a WOFF 1.0 file, decompressed. */
function woffTables(file: Buffer): Map<string, Buffer> {
  if (file.toString('latin1', 0, 4) !== 'wOFF') throw new Error('Not a WOFF 1.0 file')
  const count = file.readUInt16BE(12)
  const tables = new Map<string, Buffer>()
  for (let i = 0; i < count; i += 1) {
    const entry = 44 + i * 20
    const tag = file.toString('latin1', entry, entry + 4)
    const offset = file.readUInt32BE(entry + 4)
    const compLength = file.readUInt32BE(entry + 8)
    const origLength = file.readUInt32BE(entry + 12)
    const data = file.subarray(offset, offset + compLength)
    tables.set(tag, compLength < origLength ? inflateSync(data) : Buffer.from(data))
  }
  return tables
}

/** Code point to glyph id, from the cmap's format 4 (BMP) subtable. */
function cmapFormat4(cmap: Buffer): Map<number, number> {
  const count = cmap.readUInt16BE(2)
  for (let i = 0; i < count; i += 1) {
    const offset = cmap.readUInt32BE(4 + i * 8 + 4)
    if (cmap.readUInt16BE(offset) !== 4) continue
    const segX2 = cmap.readUInt16BE(offset + 6)
    const ends = offset + 14
    const starts = ends + segX2 + 2
    const deltas = starts + segX2
    const rangeOffsets = deltas + segX2
    const glyphs = new Map<number, number>()
    for (let s = 0; s < segX2 / 2; s += 1) {
      const end = cmap.readUInt16BE(ends + s * 2)
      const start = cmap.readUInt16BE(starts + s * 2)
      const delta = cmap.readInt16BE(deltas + s * 2)
      const rangeOffset = cmap.readUInt16BE(rangeOffsets + s * 2)
      for (let code = start; code <= end && code !== 0xffff; code += 1) {
        let glyph: number
        if (rangeOffset === 0) {
          glyph = (code + delta) & 0xffff
        } else {
          const at = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2
          const raw = cmap.readUInt16BE(at)
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
        }
        if (glyph !== 0) glyphs.set(code, glyph)
      }
    }
    return glyphs
  }
  throw new Error('Inter: no format 4 cmap subtable')
}

function readFace(file: string): Face {
  const tables = woffTables(readFileSync(path.join(FONT_DIR, file)))
  const head = tables.get('head')
  const hhea = tables.get('hhea')
  const hmtx = tables.get('hmtx')
  const cmap = tables.get('cmap')
  if (!head || !hhea || !hmtx || !cmap) throw new Error(`Inter ${file}: a table is missing`)
  const metrics = hhea.readUInt16BE(34)
  const advanceOf = (glyph: number) => hmtx.readUInt16BE(Math.min(glyph, metrics - 1) * 4)
  const advance = new Map<number, number>()
  for (const [code, glyph] of cmapFormat4(cmap)) advance.set(code, advanceOf(glyph))
  return { unitsPerEm: head.readUInt16BE(18), advance }
}

const faces = new Map<InterWeight, Face[]>()

function facesOf(weight: InterWeight): Face[] {
  const cached = faces.get(weight)
  if (cached) return cached
  const loaded = ['latin', 'latin-ext'].map((subset) => readFace(`inter-${subset}-${weight}-normal.woff`))
  faces.set(weight, loaded)
  return loaded
}

/** The width of `text` set in Inter at `weight` and `px`, in CSS px, unkerned. */
export function interTextWidthPx(text: string, weight: InterWeight, px: number): number {
  let width = 0
  for (const character of text) {
    const code = character.codePointAt(0) as number
    const face = facesOf(weight).find((candidate) => candidate.advance.has(code))
    if (!face) throw new Error(`Inter maps no glyph for U+${code.toString(16).toUpperCase().padStart(4, '0')}`)
    width += ((face.advance.get(code) as number) / face.unitsPerEm) * px
  }
  return width
}
