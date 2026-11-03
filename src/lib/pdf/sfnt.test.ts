import { readFileSync } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseSfnt } from '@/test/font-tables'
import { TRUETYPE_SFNT_VERSION, buildCmap, cmapGlyphId, decodeWoff, encodeSfnt, tableChecksum } from './sfnt'

const GELASIO_WOFF = readFileSync(
  path.join(process.cwd(), 'node_modules', '@fontsource', 'gelasio', 'files', 'gelasio-latin-400-normal.woff'),
)

/** The sum of a whole file's big-endian 32-bit words, as validators compute it. */
function fileChecksum(font: Buffer): number {
  let sum = 0
  for (let offset = 0; offset < font.length; offset += 4) sum = (sum + font.readUInt32BE(offset)) >>> 0
  return sum
}

describe('buildCmap', () => {
  const cmap = buildCmap(new Map([[0x2012, 7], [0x2010, 7], [0x2011, 7]]))

  it('maps exactly the given code points, in a (0,3) and a (3,1) record sharing one format 4 subtable', () => {
    expect(cmap.readUInt16BE(0)).toBe(0)
    expect(cmap.readUInt16BE(2)).toBe(2)
    expect([cmap.readUInt16BE(4), cmap.readUInt16BE(6), cmap.readUInt32BE(8)]).toEqual([0, 3, 20])
    expect([cmap.readUInt16BE(12), cmap.readUInt16BE(14), cmap.readUInt32BE(16)]).toEqual([3, 1, 20])
    for (const codePoint of [0x2010, 0x2011, 0x2012]) expect(cmapGlyphId(cmap, codePoint)).toBe(7)
    for (const codePoint of [0x0000, 0x002d, 0x200f, 0x2013, 0xfffe, 0xffff, 0x1f600]) expect(cmapGlyphId(cmap, codePoint)).toBe(0)
  })

  it('writes the format 4 header and the final 0xFFFF segment the specification requires', () => {
    const subtable = 20
    const segCount = 4
    expect(cmap.readUInt16BE(subtable)).toBe(4)
    expect(cmap.readUInt16BE(subtable + 2)).toBe(16 + segCount * 8)
    expect(cmap.length).toBe(subtable + 16 + segCount * 8)
    expect(cmap.readUInt16BE(subtable + 6)).toBe(segCount * 2)
    expect(cmap.readUInt16BE(subtable + 8)).toBe(8) // searchRange: 2 × 2^floor(log2 4)
    expect(cmap.readUInt16BE(subtable + 10)).toBe(2) // entrySelector
    expect(cmap.readUInt16BE(subtable + 12)).toBe(0) // rangeShift
    const endCodes = subtable + 14
    const startCodes = endCodes + segCount * 2 + 2
    expect(cmap.readUInt16BE(endCodes + segCount * 2)).toBe(0) // reservedPad
    expect([0, 1, 2, 3].map((segment) => cmap.readUInt16BE(endCodes + segment * 2))).toEqual([0x2010, 0x2011, 0x2012, 0xffff])
    expect([0, 1, 2, 3].map((segment) => cmap.readUInt16BE(startCodes + segment * 2))).toEqual([0x2010, 0x2011, 0x2012, 0xffff])
    expect(cmap.readUInt16BE(startCodes + segCount * 2 + 3 * 2)).toBe(1) // idDelta of the 0xFFFF segment
  })

  it.each([
    ['a code point beyond the BMP', new Map([[0x1f600, 7]])],
    ['U+FFFF, which the final segment reserves', new Map([[0xffff, 7]])],
    ['the missing glyph', new Map([[0x2010, 0]])],
  ])('refuses %s', (_label, mapping) => {
    expect(() => buildCmap(mapping)).toThrow()
  })
})

describe('decodeWoff, on an installed Fontsource WOFF', () => {
  it('returns every table at its declared length, each matching its WOFF checksum', () => {
    const tables = decodeWoff(GELASIO_WOFF)
    expect([...tables.keys()]).toEqual(expect.arrayContaining(['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'OS/2', 'post']))
    expect(tables.get('head')?.readUInt32BE(12)).toBe(0x5f0f3cf5) // head.magicNumber
  })

  it('refuses a file that is not WOFF', () => {
    expect(() => decodeWoff(Buffer.from('not a font at all, not even close to one'.padEnd(64)))).toThrow('Not a WOFF file')
  })

  it('refuses a WOFF holding a CFF-outline font', () => {
    const cff = Buffer.from(GELASIO_WOFF)
    cff.write('OTTO', 4, 'latin1')
    expect(() => decodeWoff(cff)).toThrow('TrueType')
  })

  it('refuses a WOFF table that inflates past its declared length, without inflating it all', () => {
    const declaredLength = 100
    const compressed = deflateSync(Buffer.alloc(4096))
    const woff = Buffer.alloc(44 + 20 + compressed.length)
    woff.write('wOFF', 0, 'latin1')
    woff.writeUInt32BE(TRUETYPE_SFNT_VERSION, 4)
    woff.writeUInt32BE(woff.length, 8)
    woff.writeUInt16BE(1, 12)
    woff.write('name', 44, 'latin1')
    woff.writeUInt32BE(64, 48)
    woff.writeUInt32BE(compressed.length, 52)
    woff.writeUInt32BE(declaredLength, 56)
    compressed.copy(woff, 64)
    expect(compressed.length).toBeLessThan(declaredLength)
    // A RangeError from zlib's output bound, not the length check after a full inflation.
    expect(() => decodeWoff(woff)).toThrow(RangeError)
  })

  it('refuses a WOFF whose table data was altered', () => {
    const tables = decodeWoff(GELASIO_WOFF)
    const corrupted = Buffer.from(GELASIO_WOFF)
    // The last directory entry's stored data: flip its final byte.
    const lastEntry = 44 + (tables.size - 1) * 20
    const end = corrupted.readUInt32BE(lastEntry + 4) + corrupted.readUInt32BE(lastEntry + 8) - 1
    corrupted[end] ^= 0xff
    expect(() => decodeWoff(corrupted)).toThrow()
  })
})

describe('encodeSfnt', () => {
  const source = decodeWoff(GELASIO_WOFF)
  const font = encodeSfnt(source)
  const parsed = parseSfnt(font)

  it('writes a TrueType header whose binary-search fields match its table count', () => {
    const numTables = source.size
    expect(parsed.sfntVersion).toBe(TRUETYPE_SFNT_VERSION)
    expect(parsed.tables).toHaveLength(numTables)
    expect(parsed.entrySelector).toBe(Math.floor(Math.log2(numTables)))
    expect(parsed.searchRange).toBe(2 ** parsed.entrySelector * 16)
    expect(parsed.rangeShift).toBe(numTables * 16 - parsed.searchRange)
  })

  it('lists the tables sorted by tag, each on a 4-byte boundary, inside the file, with its checksum', () => {
    const tags = parsed.tables.map(({ tag }) => tag)
    expect(tags).toEqual([...tags].sort())
    for (const { tag, checksum, offset, length, data } of parsed.tables) {
      expect(offset % 4, tag).toBe(0)
      expect(offset + length).toBeLessThanOrEqual(font.length)
      expect(checksum, tag).toBe(tableChecksum(tag, data))
    }
    expect(font.length % 4).toBe(0)
  })

  it('keeps every table byte-identical, apart from head.checkSumAdjustment', () => {
    for (const { tag, data } of parsed.tables) {
      const original = source.get(tag) as Buffer
      if (tag === 'head') {
        expect(Buffer.concat([data.subarray(0, 8), data.subarray(12)]).equals(Buffer.concat([original.subarray(0, 8), original.subarray(12)]))).toBe(true)
      } else {
        expect(data.equals(original), tag).toBe(true)
      }
    }
  })

  it('sets head.checkSumAdjustment so the whole file sums to 0xB1B0AFBA', () => {
    expect(fileChecksum(font)).toBe(0xb1b0afba)
  })

  it('refuses tables without a head', () => {
    const headless = new Map(source)
    headless.delete('head')
    expect(() => encodeSfnt(headless)).toThrow('head')
  })
})
