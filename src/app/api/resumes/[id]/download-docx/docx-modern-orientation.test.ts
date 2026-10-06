import { readFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { resolveResumeLayout } from '@/lib/layout-settings'
import type { DocxGeneratorSettings } from './docx-helpers'
import { generateModernDocx, readJpegOrientation } from './docx-modern'

/**
 * A JPEG photo's EXIF orientation in the Modern DOCX.
 *
 * The Preview (Chromium) applies a JPEG's EXIF orientation before
 * `object-fit: cover`; Word draws the stored pixels. The generator reads the
 * orientation and writes it as the picture's rotation and flips, with the
 * cover crop computed on the displayed size. The transforms, extents and
 * offsets below were measured in Word's own render for every orientation
 * (`docs/engineering/docx-word-parity.md`); these tests pin the XML that
 * produced them.
 *
 * The fixture is the 300 × 400 `e2e/fixtures/photo-portrait.jpg`, which has
 * no APP1; each case splices an Exif APP1 segment in after SOI, so no binary
 * fixture per orientation is needed.
 */

const PORTRAIT = readFileSync(path.join(process.cwd(), 'e2e/fixtures/photo-portrait.jpg'))
const STORED = { width: 300, height: 400 }
const SIDEBAR_TWIPS = 3572
const EMU_PER_PX = 9525
const ZONE = { width: SIDEBAR_TWIPS / 15, height: 220 }

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

const dataUrl = (jpeg: Buffer) => `data:image/jpeg;base64,${jpeg.toString('base64')}`

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

function settingsFor(photoBase64: string | undefined): { row: Record<string, unknown>; settings: DocxGeneratorSettings } {
  const row = {
    title: 'Orientation',
    contact: { name: 'Robin Orient', email: 'robin@orientation.test' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    languages: [],
    certifications: [],
    custom_sections: {},
    layout_settings: null,
  }
  const layout = resolveResumeLayout(row, null)
  return {
    row,
    settings: {
      fontFamily: layout.fontFamily,
      fontScale: layout.fontScale,
      titleFontSize: layout.titleFontSize,
      contactFontSize: layout.contactFontSize,
      sectionTitleFontSize: layout.sectionTitleFontSize,
      sectionDescFontSize: layout.sectionDescFontSize,
      locale: 'en',
      sidebarHue: layout.sidebarHue,
      sidebarSaturation: layout.sidebarSaturation,
      sidebarBrightness: layout.sidebarBrightness,
      sidebarWidth: layout.sidebarWidth,
      sidebarTopMargin: layout.sidebarTopMargin,
      mainContentTopMargin: layout.mainContentTopMargin,
      sidebarOrder: [...layout.sidebarOrder],
      mainContentOrder: [...layout.mainContentOrder],
      hiddenSidebarSections: [...layout.hiddenSidebarSections],
      hiddenMainSections: [...layout.hiddenMainSections],
      photoBase64,
    },
  }
}

interface Drawing {
  document: string
  anchors: string[]
  media: Buffer[]
}

async function draw(photoBase64: string): Promise<Drawing> {
  const { row, settings } = settingsFor(photoBase64)
  const zip = await JSZip.loadAsync(await generateModernDocx(row, settings))
  const document = await zip.file('word/document.xml')!.async('string')
  // JPEG media only: the sidebar's fill is a PNG.
  const media = await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.startsWith('word/media/') && entry.name.endsWith('.jpg'))
      .map((entry) => entry.async('nodebuffer'))
  )
  return { document, anchors: document.match(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g) ?? [], media }
}

const attribute = (fragment: string, element: string, name: string) =>
  new RegExp(`<${element}\\b[^>]*\\s${name}="([^"]*)"`).exec(fragment)?.[1] ?? null

const posOffset = (anchor: string, axis: 'H' | 'V') =>
  Number(new RegExp(`<wp:position${axis}\\b[^>]*><wp:posOffset>(-?\\d+)</wp:posOffset>`).exec(anchor)?.[1])

/** The `a:xfrm` on the picture's shape properties, the one Word turns. */
const pictureXfrm = (anchor: string) => /<pic:spPr\b[^>]*><a:xfrm\b[^>]*>/.exec(anchor)?.[0] ?? ''

/** Cover on the displayed size: the fraction trimmed from each side of each displayed axis. */
function coverTrim(displayedWidth: number, displayedHeight: number) {
  const scale = Math.max(ZONE.width / displayedWidth, ZONE.height / displayedHeight)
  return {
    x: Math.round(((displayedWidth - ZONE.width / scale) / 2 / displayedWidth) * 100_000),
    y: Math.round(((displayedHeight - ZONE.height / scale) / 2 / displayedHeight) * 100_000),
  }
}

/**
 * The transform each orientation writes (Word applies the flip, then the
 * rotation, in degrees). This pins the XML whose rendering was measured in
 * Word (`docs/engineering/docx-word-parity.md`); the test measures nothing
 * itself, so it cannot catch a mapping error shared with
 * `EXIF_PHOTO_TRANSFORMS`; only the Word render evidence can.
 */
const EXPECTED: Record<number, { rotation: number; flipH: boolean; flipV: boolean; swapsAxes: boolean }> = {
  1: { rotation: 0, flipH: false, flipV: false, swapsAxes: false },
  2: { rotation: 0, flipH: true, flipV: false, swapsAxes: false },
  3: { rotation: 180, flipH: false, flipV: false, swapsAxes: false },
  4: { rotation: 0, flipH: false, flipV: true, swapsAxes: false },
  5: { rotation: 270, flipH: true, flipV: false, swapsAxes: true },
  6: { rotation: 90, flipH: false, flipV: false, swapsAxes: true },
  7: { rotation: 90, flipH: true, flipV: false, swapsAxes: true },
  8: { rotation: 270, flipH: false, flipV: false, swapsAxes: true },
}

describe('modern DOCX photo orientation', () => {
  for (let orientation = 1; orientation <= 8; orientation++) {
    it(`draws an orientation ${orientation} JPEG turned and cover-cropped as the Preview shows it`, async () => {
      const expected = EXPECTED[orientation]
      const jpeg = withSegments(exifApp1(orientation))
      const { anchors, media } = await draw(dataUrl(jpeg))
      expect(anchors).toHaveLength(1)
      const anchor = anchors[0]

      // The transform on the picture itself.
      const xfrm = pictureXfrm(anchor)
      expect(xfrm, 'the picture has an a:xfrm').not.toBe('')
      const rot = attribute(xfrm, 'a:xfrm', 'rot')
      expect(rot === null ? 0 : Number(rot) / 60_000).toBe(expected.rotation)
      expect(attribute(xfrm, 'a:xfrm', 'flipH') === 'true').toBe(expected.flipH)
      expect(attribute(xfrm, 'a:xfrm', 'flipV') === 'true').toBe(expected.flipV)

      // Unturned extent and offsets: a 90° turn about the centre lands the
      // zone-height × zone-width picture exactly on the zone.
      const cx = Number(attribute(anchor, 'wp:extent', 'cx'))
      const cy = Number(attribute(anchor, 'wp:extent', 'cy'))
      const zoneCx = SIDEBAR_TWIPS * 635
      const zoneCy = ZONE.height * EMU_PER_PX
      const shift = Math.round(((ZONE.width - ZONE.height) / 2) * EMU_PER_PX)
      if (expected.swapsAxes) {
        expect([cx, cy]).toEqual([zoneCy, zoneCx])
        expect([posOffset(anchor, 'H'), posOffset(anchor, 'V')]).toEqual([shift, -shift])
        // The turned box: centre minus half the swapped size is the zone's top-left.
        expect(posOffset(anchor, 'H') + cx / 2 - cy / 2).toBeCloseTo(0, 0)
        expect(posOffset(anchor, 'V') + cy / 2 - cx / 2).toBeCloseTo(0, 0)
      } else {
        expect([cx, cy]).toEqual([zoneCx, zoneCy])
        expect([posOffset(anchor, 'H'), posOffset(anchor, 'V')]).toEqual([0, 0])
      }

      // Cover on the displayed size, written in the stored image's axes.
      const displayed = expected.swapsAxes
        ? { width: STORED.height, height: STORED.width }
        : STORED
      const trim = coverTrim(displayed.width, displayed.height)
      const source = expected.swapsAxes ? { lr: trim.y, tb: trim.x } : { lr: trim.x, tb: trim.y }
      expect(anchor).toContain(`<a:srcRect l="${source.lr}" t="${source.tb}" r="${source.lr}" b="${source.tb}"/>`)
      // Displayed 4:3 the photo is trimmed at its sides, displayed 3:4 top and
      // bottom; either way that is the stored image's top and bottom.
      expect(expected.swapsAxes ? [trim.x > 0, trim.y] : [trim.y > 0, trim.x]).toEqual([true, 0])

      // The photo is embedded as uploaded: no re-encoding.
      expect(media).toHaveLength(1)
      expect(media[0].equals(jpeg)).toBe(true)
    })
  }

  it('writes the same document for tag 1 and for no tag at all', async () => {
    const untagged = await draw(dataUrl(PORTRAIT))
    const tagged = await draw(dataUrl(withSegments(exifApp1(1, { order: 'MM' }))))
    expect(tagged.document).toBe(untagged.document)
    expect(untagged.media[0].equals(PORTRAIT)).toBe(true)
    expect(pictureXfrm(untagged.anchors[0])).toBe('<pic:spPr bwMode="auto"><a:xfrm>')
  })

  it('still embeds a photo whose EXIF is malformed, with no orientation applied', async () => {
    const untagged = await draw(dataUrl(PORTRAIT))
    for (const segment of [
      exifApp1(6, { entryCount: 0xffff }),
      exifApp1(6, { ifdOffset: 0xfffffff0 }),
      app1(Buffer.from('Exif\0\0MM', 'latin1')),
    ]) {
      const jpeg = withSegments(segment)
      const { document, anchors, media } = await draw(dataUrl(jpeg))
      expect(anchors).toHaveLength(1)
      expect(document).toBe(untagged.document)
      expect(media[0].equals(jpeg)).toBe(true)
    }
  })
})
