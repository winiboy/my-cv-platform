import { deflateSync } from 'node:zlib'

/**
 * A translucent disc as a PNG, for the one Preview graphic that is a shape
 * rather than a box: creative's `bg-white/10 rounded-full` header circles
 * (US-007).
 *
 * WHY A RASTER. OOXML shading fills a run, a paragraph or a table cell, always
 * as the whole rectangle and always opaque, so no fill can be a see-through
 * disc. What OOXML does have is a floating drawing (`w:drawing`), which
 * `docx-modern.ts` already anchors inside a table cell for the photo — and a
 * PNG carries a real alpha channel, which is how the translucency survives.
 * The `docx` package exposes no vector-shape primitive, so the disc is drawn
 * here, pixel by pixel, rather than as `a:prstGeom prst="ellipse"`.
 *
 * Measured in Word 16 before this was written (scratch probes 4 and 5):
 * `behindDocument: true` puts the drawing behind the cell's own fill, where it
 * is invisible; `behindDocument: false` puts it over the fill, and Word clips
 * it to the cell exactly as the Preview's `overflow-hidden` clips the circles.
 *
 * The encoder is here rather than in a dependency because the project adds none
 * for this, and because a disc of one colour is a dozen lines of pixel writing
 * plus the PNG container. Every disc is deterministic and cached: the same
 * arguments give the same bytes, in this process and the next, so two exports of
 * the same resume agree in every part but `docProps/core.xml` — which carries
 * the wall-clock stamp `Packer.toBuffer` writes for every template and has never
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
  if (!match) throw new Error(`The disc colour "${hex}" is not a six-digit hex colour`)
  const digits = match[1]
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as [number, number, number]
}

const cache = new Map<string, Buffer>()

/**
 * A square RGBA PNG holding a centred disc of `colourHex` at `alpha`, fully
 * transparent outside it, with a one-pixel feathered edge — what a browser
 * antialiases a `rounded-full` into.
 *
 * @param sizePx the image's width and height, which is also the disc's diameter.
 * @param colourHex the disc's colour, six-digit hex with or without a leading `#`.
 * @param alpha a fraction between 0 and 1.
 */
export function translucentDiscPng(sizePx: number, colourHex: string, alpha: number): Buffer {
  if (!Number.isInteger(sizePx) || sizePx <= 0) throw new Error(`A disc needs a positive whole size, not ${sizePx}`)
  if (!(alpha >= 0 && alpha <= 1)) throw new Error(`An alpha of ${alpha} is not a fraction between 0 and 1`)

  const [red, green, blue] = channels(colourHex)
  const key = `${sizePx}:${red},${green},${blue}:${alpha}`
  const cached = cache.get(key)
  if (cached) return cached

  // One filter byte per scanline, then RGBA per pixel.
  const raw = Buffer.alloc((sizePx * 4 + 1) * sizePx)
  const radius = sizePx / 2
  let at = 0
  for (let y = 0; y < sizePx; y += 1) {
    raw[at] = 0 // filter type: none
    at += 1
    for (let x = 0; x < sizePx; x += 1) {
      const distance = Math.hypot(x + 0.5 - radius, y + 0.5 - radius)
      const coverage = Math.min(1, Math.max(0, radius - distance))
      raw[at] = red
      raw[at + 1] = green
      raw[at + 2] = blue
      raw[at + 3] = Math.round(255 * alpha * coverage)
      at += 4
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(sizePx, 0)
  header.writeUInt32BE(sizePx, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: truecolour with alpha
  // bytes 10-12 stay 0: deflate compression, adaptive filtering, no interlace.

  const png = Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  cache.set(key, png)
  return png
}
