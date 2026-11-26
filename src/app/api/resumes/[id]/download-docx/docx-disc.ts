import { deflateSync } from 'node:zlib'

/**
 * An opaque PNG of one colour, for a filled rectangle Word has no other way to
 * draw where a page needs it: a column's fill drawn behind every page, which a
 * table cell's own fill cannot do (it ends where the row's part on a page ends).
 *
 * The encoder is here rather than in a dependency because the project adds none
 * for this, and because one colour is a dozen lines of pixel writing plus the
 * PNG container. Every image is deterministic and cached: the same arguments
 * give the same bytes, in this process and the next, so two exports of the same
 * resume agree in every part but `docProps/core.xml` — which carries the
 * wall-clock stamp `Packer.toBuffer` writes for every template and has never
 * been reproducible.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let crc = -1
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

/** One PNG chunk: length, type, data, CRC of type+data. */
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
  return out
}

/** `#RRGGBB` or `RRGGBB` as three channel values. */
function channels(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`The PNG colour "${hex}" is not a six-digit hex colour`)
  const digits = match[1]
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as [number, number, number]
}

const cache = new Map<string, Buffer>()

/** Width of the square `solidColourPng` draws; Word does not draw a 1 × 1 PNG at all (measured). */
const SOLID_PNG_SIZE_PX = 4

/**
 * An opaque PNG of one colour, for a filled rectangle Word has no other way to
 * draw where a page needs it: stretched by its drawing's extent, so its own
 * size is irrelevant. Deterministic and cached.
 *
 * @param colourHex six-digit hex with or without a leading `#`.
 */
export function solidColourPng(colourHex: string): Buffer {
  const [red, green, blue] = channels(colourHex)
  const key = `solid:${red},${green},${blue}`
  const cached = cache.get(key)
  if (cached) return cached

  const raw = Buffer.alloc((SOLID_PNG_SIZE_PX * 4 + 1) * SOLID_PNG_SIZE_PX)
  let at = 0
  for (let y = 0; y < SOLID_PNG_SIZE_PX; y += 1) {
    raw[at] = 0 // filter type: none
    at += 1
    for (let x = 0; x < SOLID_PNG_SIZE_PX; x += 1) {
      raw[at] = red
      raw[at + 1] = green
      raw[at + 2] = blue
      raw[at + 3] = 255
      at += 4
    }
  }
  const png = rgbaPng(SOLID_PNG_SIZE_PX, SOLID_PNG_SIZE_PX, raw)
  cache.set(key, png)
  return png
}

/** The PNG container around RGBA scanlines that each start with their filter byte. */
function rgbaPng(widthPx: number, heightPx: number, raw: Buffer): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(widthPx, 0)
  header.writeUInt32BE(heightPx, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: truecolour with alpha
  // bytes 10-12 stay 0: deflate compression, adaptive filtering, no interlace.

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
