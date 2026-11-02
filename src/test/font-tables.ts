import { brotliDecompressSync } from 'node:zlib'

/**
 * Test-only readers for the font data the PDF renderers register
 * (`src/lib/pdf/font-substitutes.ts`), so a test can look up what a face can
 * actually draw. Independent of `src/lib/pdf/sfnt.ts`'s writer, so a test of
 * that writer does not check it against itself.
 */

export interface SfntTableEntry {
  tag: string
  checksum: number
  offset: number
  length: number
  data: Buffer
}

export interface ParsedSfnt {
  sfntVersion: number
  searchRange: number
  entrySelector: number
  rangeShift: number
  tables: SfntTableEntry[]
}

/** The header and table directory of an sfnt (`.ttf`), with each table's bytes. */
export function parseSfnt(font: Buffer): ParsedSfnt {
  const numTables = font.readUInt16BE(4)
  const tables: SfntTableEntry[] = []
  for (let index = 0; index < numTables; index++) {
    const entry = 12 + index * 16
    const offset = font.readUInt32BE(entry + 8)
    const length = font.readUInt32BE(entry + 12)
    if (offset + length > font.length) throw new Error('sfnt table runs past the end of the file')
    tables.push({
      tag: font.toString('latin1', entry, entry + 4),
      checksum: font.readUInt32BE(entry + 4),
      offset,
      length,
      data: font.subarray(offset, offset + length),
    })
  }
  return {
    sfntVersion: font.readUInt32BE(0),
    searchRange: font.readUInt16BE(6),
    entrySelector: font.readUInt16BE(8),
    rangeShift: font.readUInt16BE(10),
    tables,
  }
}

/** WOFF2 "known table" tags, by the index a directory entry's flags byte gives. */
const WOFF2_KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]

/**
 * The tables of a WOFF2 file that the format stores untransformed (`cmap`,
 * `maxp`, `hhea`…), as the font has them. Transformed tables (`glyf`, `loca`,
 * possibly `hmtx`) are left out: reading them takes the full decoder.
 * https://www.w3.org/TR/WOFF2/
 */
export function woff2UntransformedTables(woff2: Buffer): Map<string, Buffer> {
  if (woff2.toString('latin1', 0, 4) !== 'wOF2') throw new Error('Not a WOFF2 file')
  const numTables = woff2.readUInt16BE(12)
  const totalCompressedSize = woff2.readUInt32BE(20)
  let cursor = 48

  function uintBase128(): number {
    let value = 0
    for (let index = 0; index < 5; index++) {
      const byte = woff2[cursor++]
      if (index === 0 && byte === 0x80) throw new Error('UIntBase128 with a leading zero')
      value = value * 128 + (byte & 0x7f)
      if ((byte & 0x80) === 0) return value
    }
    throw new Error('UIntBase128 longer than 5 bytes')
  }

  const entries: { tag: string; length: number; transformed: boolean }[] = []
  for (let index = 0; index < numTables; index++) {
    const flags = woff2[cursor++]
    let tag = WOFF2_KNOWN_TAGS[flags & 0x3f]
    if ((flags & 0x3f) === 0x3f) {
      tag = woff2.toString('latin1', cursor, cursor + 4)
      cursor += 4
    }
    if (tag === undefined) throw new Error('Unknown WOFF2 table index')
    const transformVersion = flags >> 6
    const origLength = uintBase128()
    const transformed = tag === 'glyf' || tag === 'loca' ? transformVersion !== 3 : transformVersion !== 0
    const length = transformed ? uintBase128() : origLength
    entries.push({ tag, length, transformed })
  }

  const stream = brotliDecompressSync(woff2.subarray(cursor, cursor + totalCompressedSize))
  const tables = new Map<string, Buffer>()
  let offset = 0
  for (const { tag, length, transformed } of entries) {
    if (!transformed) tables.set(tag, stream.subarray(offset, offset + length))
    offset += length
  }
  if (offset !== stream.length) throw new Error('WOFF2 table lengths do not add up to the decompressed stream')
  return tables
}

/** The advance width `hmtx` gives a glyph. */
export function advanceWidth(hhea: Buffer, hmtx: Buffer, glyphId: number): number {
  const numberOfHMetrics = hhea.readUInt16BE(34)
  return hmtx.readUInt16BE(Math.min(glyphId, numberOfHMetrics - 1) * 4)
}

/** The bytes of an inline `url(data:<type>;base64,…) format(…)` source. */
export function dataUrlBytes(source: string): { mediaType: string; data: Buffer } {
  const match = /^url\(data:([a-z0-9/+-]+);base64,([A-Za-z0-9+/=]+)\)/.exec(source)
  if (!match) throw new Error('Not an inline base64 data: source')
  return { mediaType: match[1], data: Buffer.from(match[2], 'base64') }
}
