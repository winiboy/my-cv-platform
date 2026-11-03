import { inflateSync } from 'node:zlib'

/**
 * The few pieces of the OpenType/TrueType file format the serverless font
 * substitutes need (`font-substitutes.ts`): read a WOFF 1.0 file into its
 * tables, look a code point up in its `cmap`, build a `cmap`, and write the
 * tables back out as an sfnt that Chromium's OTS sanitizer accepts.
 *
 * WOFF rather than the WOFF2 the pages register: WOFF tables are plain zlib
 * streams, while WOFF2 transforms `glyf`/`loca`, which would take a decoder
 * of its own. Fontsource ships both for every face, encoded from the same
 * font revision (a unit test pins the metrics that must agree).
 *
 * Specifications: https://www.w3.org/TR/WOFF/ and
 * https://learn.microsoft.com/typography/opentype/spec/otff
 */

/** The sfnt version of a font with TrueType (`glyf`) outlines. */
export const TRUETYPE_SFNT_VERSION = 0x00010000

/** The tables of one font, keyed by their four-character tag. */
export type SfntTables = ReadonlyMap<string, Buffer>

const WOFF_SIGNATURE = 0x774f4646 // 'wOFF'
const WOFF_HEADER_LENGTH = 44
const WOFF_DIRECTORY_ENTRY_LENGTH = 20
const SFNT_HEADER_LENGTH = 12
const SFNT_DIRECTORY_ENTRY_LENGTH = 16
/** `head.checkSumAdjustment` is the font's whole checksum subtracted from this. */
const CHECKSUM_MAGIC = 0xb1b0afba
const HEAD_CHECKSUM_ADJUSTMENT_OFFSET = 8

/**
 * The tables of a WOFF 1.0 file with TrueType outlines. Anything else (a CFF
 * font, a truncated or inconsistent file, a table whose checksum does not
 * match) is an error: the result is handed to a browser as a font.
 */
export function decodeWoff(woff: Buffer): Map<string, Buffer> {
  if (woff.length < WOFF_HEADER_LENGTH || woff.readUInt32BE(0) !== WOFF_SIGNATURE) {
    throw new Error('Not a WOFF file')
  }
  if (woff.readUInt32BE(4) !== TRUETYPE_SFNT_VERSION) {
    throw new Error('The WOFF file does not hold a TrueType-outline font')
  }
  const numTables = woff.readUInt16BE(12)
  if (WOFF_HEADER_LENGTH + numTables * WOFF_DIRECTORY_ENTRY_LENGTH > woff.length) {
    throw new Error('The WOFF table directory runs past the end of the file')
  }
  const tables = new Map<string, Buffer>()
  for (let index = 0; index < numTables; index++) {
    const entry = WOFF_HEADER_LENGTH + index * WOFF_DIRECTORY_ENTRY_LENGTH
    const tag = woff.toString('latin1', entry, entry + 4)
    const offset = woff.readUInt32BE(entry + 4)
    const compLength = woff.readUInt32BE(entry + 8)
    const origLength = woff.readUInt32BE(entry + 12)
    const origChecksum = woff.readUInt32BE(entry + 16)
    if (tables.has(tag)) throw new Error(`The WOFF file lists table ${tag} twice`)
    if (offset + compLength > woff.length || compLength > origLength) {
      throw new Error(`The WOFF table ${tag} has an inconsistent offset or length`)
    }
    const stored = woff.subarray(offset, offset + compLength)
    // Bounded by the declared length, so a corrupted file cannot inflate past it.
    const data = compLength < origLength ? inflateSync(stored, { maxOutputLength: origLength }) : Buffer.from(stored)
    if (data.length !== origLength) throw new Error(`The WOFF table ${tag} does not inflate to its declared length`)
    if (tableChecksum(tag, data) !== origChecksum) throw new Error(`The WOFF table ${tag} fails its checksum`)
    tables.set(tag, data)
  }
  return tables
}

/**
 * The glyph id a font's Windows Unicode BMP `cmap` subtable (platform 3,
 * encoding 1, format 4) gives a code point; 0, the missing glyph, when it has
 * none. A font without that subtable is an error rather than "no glyph".
 */
export function cmapGlyphId(cmap: Buffer, codePoint: number): number {
  const subtable = windowsBmpSubtableOffset(cmap)
  if (cmap.readUInt16BE(subtable) !== 4) throw new Error('The cmap (3,1) subtable is not format 4')
  if (codePoint > 0xffff) return 0
  const segCount = cmap.readUInt16BE(subtable + 6) / 2
  const endCodes = subtable + 14
  const startCodes = endCodes + segCount * 2 + 2
  const idDeltas = startCodes + segCount * 2
  const idRangeOffsets = idDeltas + segCount * 2
  for (let segment = 0; segment < segCount; segment++) {
    if (codePoint > cmap.readUInt16BE(endCodes + segment * 2)) continue
    const startCode = cmap.readUInt16BE(startCodes + segment * 2)
    if (codePoint < startCode) return 0
    const idDelta = cmap.readUInt16BE(idDeltas + segment * 2)
    const idRangeOffsetAt = idRangeOffsets + segment * 2
    const idRangeOffset = cmap.readUInt16BE(idRangeOffsetAt)
    if (idRangeOffset === 0) return (codePoint + idDelta) & 0xffff
    const glyphId = cmap.readUInt16BE(idRangeOffsetAt + idRangeOffset + (codePoint - startCode) * 2)
    return glyphId === 0 ? 0 : (glyphId + idDelta) & 0xffff
  }
  return 0
}

function windowsBmpSubtableOffset(cmap: Buffer): number {
  const numTables = cmap.readUInt16BE(2)
  for (let index = 0; index < numTables; index++) {
    const record = 4 + index * 8
    if (cmap.readUInt16BE(record) === 3 && cmap.readUInt16BE(record + 2) === 1) return cmap.readUInt32BE(record + 4)
  }
  throw new Error('The font has no Windows Unicode BMP (3,1) cmap subtable')
}

/**
 * A `cmap` table mapping exactly the given BMP code points, as one format 4
 * subtable listed for Unicode (0,3) and Windows Unicode BMP (3,1), the two
 * records the Fontsource fonts carry. One segment per code point, plus the
 * 0xFFFF segment format 4 requires last.
 */
export function buildCmap(glyphIdByCodePoint: ReadonlyMap<number, number>): Buffer {
  const codePoints = [...glyphIdByCodePoint.keys()].sort((a, b) => a - b)
  for (const codePoint of codePoints) {
    const glyphId = glyphIdByCodePoint.get(codePoint) ?? 0
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint >= 0xffff) {
      throw new Error(`Code point ${codePoint} cannot be mapped by a format 4 cmap`)
    }
    if (!Number.isInteger(glyphId) || glyphId < 1 || glyphId > 0xffff) {
      throw new Error(`Glyph id ${glyphId} is not a drawable glyph`)
    }
  }

  const segCount = codePoints.length + 1
  const entrySelector = Math.floor(Math.log2(segCount))
  const searchRange = 2 * 2 ** entrySelector
  const subtableLength = 16 + segCount * 8
  const subtableOffset = 4 + 2 * 8
  const cmap = Buffer.alloc(subtableOffset + subtableLength)

  cmap.writeUInt16BE(0, 0) // version
  cmap.writeUInt16BE(2, 2) // numTables
  cmap.writeUInt16BE(0, 4) // platform: Unicode
  cmap.writeUInt16BE(3, 6) // encoding: Unicode 2.0 BMP
  cmap.writeUInt32BE(subtableOffset, 8)
  cmap.writeUInt16BE(3, 12) // platform: Windows
  cmap.writeUInt16BE(1, 14) // encoding: Unicode BMP
  cmap.writeUInt32BE(subtableOffset, 16)

  const subtable = subtableOffset
  cmap.writeUInt16BE(4, subtable) // format
  cmap.writeUInt16BE(subtableLength, subtable + 2)
  cmap.writeUInt16BE(0, subtable + 4) // language
  cmap.writeUInt16BE(segCount * 2, subtable + 6)
  cmap.writeUInt16BE(searchRange, subtable + 8)
  cmap.writeUInt16BE(entrySelector, subtable + 10)
  cmap.writeUInt16BE(segCount * 2 - searchRange, subtable + 12)
  const endCodes = subtable + 14
  const startCodes = endCodes + segCount * 2 + 2 // after reservedPad
  const idDeltas = startCodes + segCount * 2
  // idRangeOffsets stay 0: every segment maps through its idDelta alone.
  const segments = [
    ...codePoints.map((codePoint) => ({ codePoint, idDelta: ((glyphIdByCodePoint.get(codePoint) ?? 0) - codePoint) & 0xffff })),
    { codePoint: 0xffff, idDelta: 1 },
  ]
  segments.forEach(({ codePoint, idDelta }, segment) => {
    cmap.writeUInt16BE(codePoint, endCodes + segment * 2)
    cmap.writeUInt16BE(codePoint, startCodes + segment * 2)
    cmap.writeUInt16BE(idDelta, idDeltas + segment * 2)
  })
  return cmap
}

/**
 * An sfnt (a `.ttf`) of these tables: directory sorted by tag, each table on
 * a 4-byte boundary with its checksum, and `head.checkSumAdjustment` set for
 * the whole file, as the OpenType specification requires.
 */
export function encodeSfnt(tables: SfntTables): Buffer {
  const head = tables.get('head')
  if (!head || head.length < HEAD_CHECKSUM_ADJUSTMENT_OFFSET + 4) throw new Error('The font has no complete head table')

  const tags = [...tables.keys()].sort()
  const numTables = tags.length
  const entrySelector = Math.floor(Math.log2(numTables))
  const searchRange = 2 ** entrySelector * SFNT_DIRECTORY_ENTRY_LENGTH
  const directoryEnd = SFNT_HEADER_LENGTH + numTables * SFNT_DIRECTORY_ENTRY_LENGTH
  const length = tags.reduce((total, tag) => total + padded((tables.get(tag) as Buffer).length), directoryEnd)
  const font = Buffer.alloc(length)

  font.writeUInt32BE(TRUETYPE_SFNT_VERSION, 0)
  font.writeUInt16BE(numTables, 4)
  font.writeUInt16BE(searchRange, 6)
  font.writeUInt16BE(entrySelector, 8)
  font.writeUInt16BE(numTables * SFNT_DIRECTORY_ENTRY_LENGTH - searchRange, 10)

  let offset = directoryEnd
  let headOffset = 0
  tags.forEach((tag, index) => {
    const data = tables.get(tag) as Buffer
    const entry = SFNT_HEADER_LENGTH + index * SFNT_DIRECTORY_ENTRY_LENGTH
    font.write(tag, entry, 4, 'latin1')
    font.writeUInt32BE(tableChecksum(tag, data), entry + 4)
    font.writeUInt32BE(offset, entry + 8)
    font.writeUInt32BE(data.length, entry + 12)
    data.copy(font, offset)
    if (tag === 'head') headOffset = offset
    offset += padded(data.length)
  })

  // Summed with the adjustment zeroed, then written: the sum of the finished
  // file is then the magic constant, as validators check.
  font.writeUInt32BE(0, headOffset + HEAD_CHECKSUM_ADJUSTMENT_OFFSET)
  font.writeUInt32BE((CHECKSUM_MAGIC - checksum(font)) >>> 0, headOffset + HEAD_CHECKSUM_ADJUSTMENT_OFFSET)
  return font
}

/**
 * A table's checksum: the sum of its big-endian 32-bit words, zero-padded.
 * `head` is summed with its `checkSumAdjustment` as zero, which is what that
 * field's definition makes of it.
 */
export function tableChecksum(tag: string, data: Buffer): number {
  if (tag !== 'head' || data.length < HEAD_CHECKSUM_ADJUSTMENT_OFFSET + 4) return checksum(data)
  const head = Buffer.from(data)
  head.writeUInt32BE(0, HEAD_CHECKSUM_ADJUSTMENT_OFFSET)
  return checksum(head)
}

function checksum(data: Buffer): number {
  let sum = 0
  for (let offset = 0; offset < data.length; offset += 4) {
    const word =
      ((data[offset] ?? 0) * 0x1000000 + ((data[offset + 1] ?? 0) << 16) + ((data[offset + 2] ?? 0) << 8) + (data[offset + 3] ?? 0)) >>> 0
    sum = (sum + word) >>> 0
  }
  return sum
}

function padded(length: number): number {
  return (length + 3) & ~3
}
