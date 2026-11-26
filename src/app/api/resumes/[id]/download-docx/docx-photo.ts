import type { IMediaTransformation } from 'docx'

/**
 * The photo helpers every Word generator draws the resume photo with: detect
 * the image type, read its size and EXIF orientation, and crop it to its zone
 * as the Preview's `object-fit: cover` does.
 *
 * The photo is untrusted input (bounded in size by `docx-photo-bound.ts` before
 * it reaches here), so every reader below is bounded by the buffer and returns
 * a neutral value rather than throwing on a malformed file.
 */

/**
 * Detect the image type from a base64 data URL or raw base64 string.
 * Returns a docx-compatible type or null if unrecognized.
 */
export function detectImageType(base64: string): 'jpg' | 'png' | 'gif' | 'bmp' | null {
  if (base64.startsWith('data:image/jpeg') || base64.startsWith('data:image/jpg')) return 'jpg'
  if (base64.startsWith('data:image/png')) return 'png'
  if (base64.startsWith('data:image/gif')) return 'gif'
  if (base64.startsWith('data:image/bmp')) return 'bmp'

  // Check raw base64 magic bytes (no data URL prefix)
  // JPEG starts with /9j/, PNG starts with iVBOR
  if (base64.startsWith('/9j/')) return 'jpg'
  if (base64.startsWith('iVBOR')) return 'png'
  if (base64.startsWith('R0lGOD')) return 'gif'

  return null
}

/**
 * Extract raw base64 data from a data URL. If already raw, returns as-is.
 */
export function extractBase64Data(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex !== -1 && dataUrl.startsWith('data:')) {
    return dataUrl.substring(commaIndex + 1)
  }
  return dataUrl
}

/**
 * Parse original image dimensions from PNG or JPEG binary data.
 * PNG: width at bytes 16-19, height at bytes 20-23 (big-endian uint32).
 * JPEG: iterate marker segments to find SOF0/SOF1/SOF2 for dimensions.
 */
export function parseImageDimensions(
  buffer: Buffer,
  imageType: 'jpg' | 'png' | 'gif' | 'bmp'
): { width: number; height: number } | null {
  try {
    if (imageType === 'png') {
      // PNG IHDR chunk: width at offset 16, height at offset 20 (big-endian)
      if (buffer.length < 24) return null
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      if (width > 0 && height > 0) return { width, height }
      return null
    }

    if (imageType === 'jpg') {
      // JPEG: verify SOI marker (0xFF 0xD8)
      if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null

      let offset = 2
      while (offset < buffer.length - 1) {
        // Scan for 0xFF marker prefix, skipping fill bytes (0xFF 0xFF)
        if (buffer[offset] !== 0xff) {
          offset++
          continue
        }
        // Skip consecutive 0xFF fill bytes
        while (offset < buffer.length - 1 && buffer[offset + 1] === 0xff) {
          offset++
        }
        if (offset >= buffer.length - 1) break

        const marker = buffer[offset + 1]
        offset += 2

        // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2) — Start of Frame markers
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          // Skip 2-byte segment length + 1-byte precision
          if (offset + 7 > buffer.length) return null
          const height = buffer.readUInt16BE(offset + 3)
          const width = buffer.readUInt16BE(offset + 5)
          if (width > 0 && height > 0) return { width, height }
          return null
        }

        // SOS (0xDA) — Start of Scan: no more parseable markers
        if (marker === 0xda) break
        // EOI (0xD9) — End of Image
        if (marker === 0xd9) break

        // Other marker: read 2-byte length and skip
        if (offset + 2 > buffer.length) break
        const segmentLength = buffer.readUInt16BE(offset)
        if (segmentLength < 2) break
        offset += segmentLength
      }
      return null
    }

    // GIF and BMP not supported for cropping
    return null
  } catch {
    return null
  }
}

/**
 * Calculate OOXML srcRect crop percentages to achieve CSS object-fit: cover.
 * Values are in 100,000ths of the source image dimensions (e.g., 25000 = 25%).
 */
export function calculateCoverCropPercents(
  origWidth: number,
  origHeight: number,
  zoneWidth: number,
  zoneHeight: number
): { l: number; t: number; r: number; b: number } {
  const origRatio = origWidth / origHeight
  const zoneRatio = zoneWidth / zoneHeight

  if (origRatio > zoneRatio) {
    // Image is wider than zone — crop left and right
    const scale = zoneHeight / origHeight
    const visibleWidth = zoneWidth / scale
    const cropEach = (origWidth - visibleWidth) / 2
    const cropPercent = Math.round((cropEach / origWidth) * 100000)
    return { l: cropPercent, r: cropPercent, t: 0, b: 0 }
  } else if (origRatio < zoneRatio) {
    // Image is taller than zone — crop top and bottom
    const scale = zoneWidth / origWidth
    const visibleHeight = zoneHeight / scale
    const cropEach = (origHeight - visibleHeight) / 2
    const cropPercent = Math.round((cropEach / origHeight) * 100000)
    return { t: cropPercent, b: cropPercent, l: 0, r: 0 }
  }

  return { l: 0, t: 0, r: 0, b: 0 }
}

/** EXIF orientation 1: the stored pixels are already upright. */
export const EXIF_ORIENTATION_NONE = 1
const EXIF_ORIENTATION_TAG = 0x0112
const TIFF_TYPE_SHORT = 3
const TIFF_IFD_ENTRY_BYTES = 12
/** Real JPEGs carry a handful of segments before SOS; past this the file is not one we trust. */
const MAX_JPEG_HEADER_SEGMENTS = 64

/**
 * The orientation in the EXIF block of an APP1 segment spanning
 * `[start, end)`, or 1. Every read is checked against `end`, the segment's
 * own end, so a lying offset or count can never reach past it.
 */
function exifSegmentOrientation(buffer: Buffer, start: number, end: number): number {
  const tiff = start + 6 // after "Exif\0\0"
  if (tiff + 8 > end) return EXIF_ORIENTATION_NONE

  const byteOrder = buffer.readUInt16BE(tiff)
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return EXIF_ORIENTATION_NONE
  const littleEndian = byteOrder === 0x4949
  const u16 = (at: number) => (littleEndian ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at))
  const u32 = (at: number) => (littleEndian ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at))
  if (u16(tiff + 2) !== 0x002a) return EXIF_ORIENTATION_NONE

  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > end) return EXIF_ORIENTATION_NONE
  const entryCount = u16(ifd)
  // A count claiming more entries than the segment holds is malformed.
  if (ifd + 2 + entryCount * TIFF_IFD_ENTRY_BYTES > end) return EXIF_ORIENTATION_NONE

  for (let i = 0; i < entryCount; i++) {
    const entry = ifd + 2 + i * TIFF_IFD_ENTRY_BYTES
    if (u16(entry) !== EXIF_ORIENTATION_TAG) continue
    if (u16(entry + 2) !== TIFF_TYPE_SHORT || u32(entry + 4) !== 1) return EXIF_ORIENTATION_NONE
    // A single SHORT sits in the first two bytes of the entry's value field.
    const value = u16(entry + 8)
    return value >= 1 && value <= 8 ? value : EXIF_ORIENTATION_NONE
  }
  return EXIF_ORIENTATION_NONE
}

/**
 * The EXIF orientation (1–8) of a JPEG, read from its first Exif APP1
 * segment; 1 when there is none or anything about the file is unexpected.
 *
 * The photo is untrusted input, so the marker walk is bounded by the buffer
 * and by a segment cap, the EXIF read by the APP1 segment's own length, and no
 * exception escapes.
 */
export function readJpegOrientation(buffer: Buffer): number {
  try {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return EXIF_ORIENTATION_NONE

    let offset = 2
    for (let segments = 0; segments < MAX_JPEG_HEADER_SEGMENTS; segments++) {
      // Fill bytes: any number of 0xFF may precede a marker.
      while (offset + 1 < buffer.length && buffer[offset] === 0xff && buffer[offset + 1] === 0xff) offset++
      if (offset + 4 > buffer.length || buffer[offset] !== 0xff) return EXIF_ORIENTATION_NONE

      const marker = buffer[offset + 1]
      // SOS or EOI: the header, where EXIF lives, is over.
      if (marker === 0xda || marker === 0xd9) return EXIF_ORIENTATION_NONE

      const length = buffer.readUInt16BE(offset + 2)
      const segmentStart = offset + 4
      const segmentEnd = offset + 2 + length
      if (length < 2 || segmentEnd > buffer.length) return EXIF_ORIENTATION_NONE

      if (
        marker === 0xe1 &&
        segmentEnd - segmentStart >= 6 &&
        buffer.toString('latin1', segmentStart, segmentStart + 6) === 'Exif\0\0'
      ) {
        return exifSegmentOrientation(buffer, segmentStart, segmentEnd)
      }
      offset = segmentEnd
    }
    return EXIF_ORIENTATION_NONE
  } catch {
    return EXIF_ORIENTATION_NONE
  }
}

export interface PhotoOrientationTransform {
  /** Written on the picture's `a:xfrm`; Word applies the flip before the rotation. */
  readonly picture: Pick<IMediaTransformation, 'rotation' | 'flip'>
  /** Orientations 5–8 display the stored image with width and height swapped. */
  readonly swapsAxes: boolean
}

/**
 * The picture transform that makes Word draw an EXIF-oriented JPEG the way
 * the Preview does: Chromium applies EXIF orientation before
 * `object-fit: cover`. Measured in Word's own render for every orientation.
 */
export const EXIF_PHOTO_TRANSFORMS: Readonly<Record<number, PhotoOrientationTransform>> = {
  2: { picture: { flip: { horizontal: true } }, swapsAxes: false },
  3: { picture: { rotation: 180 }, swapsAxes: false },
  4: { picture: { flip: { vertical: true } }, swapsAxes: false },
  5: { picture: { flip: { horizontal: true }, rotation: 270 }, swapsAxes: true },
  6: { picture: { rotation: 90 }, swapsAxes: true },
  7: { picture: { flip: { horizontal: true }, rotation: 90 }, swapsAxes: true },
  8: { picture: { rotation: 270 }, swapsAxes: true },
}
