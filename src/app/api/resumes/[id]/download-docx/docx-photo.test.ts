import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readJpegOrientation } from './docx-photo'

/**
 * Reading a JPEG photo's EXIF orientation, which every Word generator applies
 * to the photo as the Preview (Chromium) does before `object-fit: cover`.
 *
 * The fixture is the 300 × 400 `e2e/fixtures/photo-portrait.jpg`, which has
 * no APP1; each case splices an Exif APP1 segment in after SOI, so no binary
 * fixture per orientation is needed.
 */


const PORTRAIT = readFileSync(path.join(process.cwd(), 'e2e/fixtures/photo-portrait.jpg'))
const STORED = { width: 300, height: 400 }

type ByteOrder = 'II' | 'MM'

interface ExifOptions {
  order?: ByteOrder
  /** TIFF field type of the orientation entry (3 = SHORT). */
  type?: number
  /** Overrides the IFD0 entry count. */
  entryCount?: number
  /** Overrides the IFD0 offset from the TIFF header. */
  ifdOffset?: number
  /** Overrides the APP1 length field. */
  segmentLength?: number
  /** The orientation entry's value count (1 for a valid tag). */
  valueCount?: number
  /** Puts an ImageWidth (0x0100) entry before the orientation entry, as cameras do. */
  afterImageWidth?: boolean
}

/** An APP1 segment holding a TIFF header and an IFD0 with an orientation entry. */
function exifApp1(orientation: number, options: ExifOptions = {}): Buffer {
  const { order = 'II', type = 3, ifdOffset = 8, valueCount = 1, afterImageWidth = false } = options
  const entries = afterImageWidth ? 2 : 1
  const { entryCount = entries } = options
  const le = order === 'II'
  // Header (8) + count (2) + 12 per entry + next-IFD offset (4).
  const tiff = Buffer.alloc(8 + 2 + 12 * entries + 4)
  const u16 = (value: number, at: number) => (le ? tiff.writeUInt16LE(value, at) : tiff.writeUInt16BE(value, at))
  const u32 = (value: number, at: number) => (le ? tiff.writeUInt32LE(value, at) : tiff.writeUInt32BE(value, at))
  tiff.write(order, 0, 'latin1')
  u16(0x2a, 2)
  u32(ifdOffset, 4)
  u16(entryCount, 8)
  let entry = 10
  if (afterImageWidth) {
    u16(0x0100, entry)
    u16(3, entry + 2)
    u32(1, entry + 4)
    u16(STORED.width, entry + 8)
    entry += 12
  }
  u16(0x0112, entry)
  u16(type, entry + 2)
  u32(valueCount, entry + 4)
  u16(orientation, entry + 8)
  u32(0, entry + 12)
  return app1(Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]), options.segmentLength)
}

function app1(payload: Buffer, segmentLength = payload.length + 2): Buffer {
  const head = Buffer.from([0xff, 0xe1, 0, 0])
  head.writeUInt16BE(segmentLength, 2)
  return Buffer.concat([head, payload])
}

/** The fixture JPEG with `segments` inserted right after SOI. */
function withSegments(...segments: Buffer[]): Buffer {
  return Buffer.concat([PORTRAIT.subarray(0, 2), ...segments, PORTRAIT.subarray(2)])
}

describe('readJpegOrientation', () => {
  for (const order of ['II', 'MM'] as const) {
    it(`reads every orientation 1–8 in ${order} byte order`, () => {
      for (let orientation = 1; orientation <= 8; orientation++) {
        expect(readJpegOrientation(withSegments(exifApp1(orientation, { order }))), `${orientation}`).toBe(orientation)
      }
    })
  }

  it('is 1 for a JPEG without APP1', () => {
    expect(readJpegOrientation(PORTRAIT)).toBe(1)
  })

  it('skips an APP1 that is not Exif, and reads the Exif one after it', () => {
    const xmp = app1(Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>', 'latin1'))
    expect(readJpegOrientation(withSegments(xmp))).toBe(1)
    expect(readJpegOrientation(withSegments(xmp, exifApp1(6)))).toBe(6)
  })

  it('is 1 for an orientation value outside 1–8, or an entry that is not one SHORT', () => {
    for (const value of [0, 9, 0xffff]) {
      expect(readJpegOrientation(withSegments(exifApp1(value))), `${value}`).toBe(1)
    }
    expect(readJpegOrientation(withSegments(exifApp1(6, { type: 4 })))).toBe(1)
    expect(readJpegOrientation(withSegments(exifApp1(6, { valueCount: 2 })))).toBe(1)
  })

  it('skips fill bytes before a marker on the way to the Exif APP1', () => {
    // Two extra 0xFF before a COM segment, and one before the APP1 itself.
    const comment = Buffer.from([0xff, 0xff, 0xff, 0xfe, 0x00, 0x04, 0x68, 0x69])
    expect(readJpegOrientation(withSegments(comment, Buffer.from([0xff]), exifApp1(6)))).toBe(6)
  })

  for (const order of ['II', 'MM'] as const) {
    it(`finds the orientation entry after another IFD0 entry in ${order} byte order`, () => {
      expect(readJpegOrientation(withSegments(exifApp1(8, { order, afterImageWidth: true })))).toBe(8)
    })
  }

  it('is 1 for an APP1 truncated before its TIFF header or IFD ends', () => {
    // 6 bytes of "Exif\0\0" and only 4 of TIFF header.
    expect(readJpegOrientation(withSegments(app1(Buffer.from('Exif\0\0II*\0', 'latin1'))))).toBe(1)
    // A length cutting the IFD entry off: its bytes still follow in the file,
    // but they are past the segment's end and must not be read.
    const whole = exifApp1(6)
    expect(readJpegOrientation(withSegments(exifApp1(6, { segmentLength: whole.length - 2 - 8 })))).toBe(1)
  })

  it('is 1 for an APP1 whose length runs past the end of the file', () => {
    const jpeg = Buffer.concat([PORTRAIT.subarray(0, 2), exifApp1(6, { segmentLength: 0xfff0 })])
    expect(readJpegOrientation(jpeg)).toBe(1)
  })

  it('is 1 for an IFD entry count or offset that points past the segment', () => {
    expect(readJpegOrientation(withSegments(exifApp1(6, { entryCount: 0xffff })))).toBe(1)
    expect(readJpegOrientation(withSegments(exifApp1(6, { ifdOffset: 0xfffffff0 })))).toBe(1)
  })

  it('does not read an APP1 after the start of scan', () => {
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02])
    expect(readJpegOrientation(withSegments(sos, exifApp1(6)))).toBe(1)
  })

  it('is 1 for a non-JPEG, an empty buffer or a bare SOI', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    expect(readJpegOrientation(png)).toBe(1)
    expect(readJpegOrientation(Buffer.alloc(0))).toBe(1)
    expect(readJpegOrientation(Buffer.from([0xff, 0xd8]))).toBe(1)
  })

  it('never throws on any truncation of a tagged JPEG, and reads the tag only once its segment is whole', () => {
    const tagged = withSegments(exifApp1(6, { order: 'MM' }))
    const app1End = 2 + exifApp1(6).length
    for (let length = 0; length <= app1End + 8; length++) {
      const result = readJpegOrientation(tagged.subarray(0, length))
      // A segment is read only once its whole length is in the buffer.
      expect(result, `${length} bytes`).toBe(length < app1End ? 1 : 6)
    }
  })
})
