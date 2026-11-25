/**
 * The resume photo as the Word export can embed it.
 *
 * The photo lives only in this browser (`resume_photo_${id}` in localStorage),
 * stored as whatever data URL the uploaded file produced. The Word route can
 * embed only the raster types the `docx` ImageRun understands, and drops any
 * other type without an error — so a WebP or AVIF photo, which the Preview and
 * the browser-drawn PDF show, used to vanish from the Word document alone.
 *
 * The stored value may not change (the upload handler, background removal and
 * the storage key are fixed by the approved PRD), so the conversion happens
 * here, per download, on a copy: the browser decodes the photo it can already
 * display and re-encodes it in a type Word embeds.
 *
 * Kept free of server-only imports and of top-level DOM access: the route's
 * bound (`docx-photo-bound.ts`) imports its constants from this module.
 */

/**
 * The image data-URL forms the Word route accepts.
 *
 * The single definition, used by the route's trust-boundary check and by the
 * browser to decide what needs re-encoding before it is sent. Widening it
 * widens what the server accepts; it must only ever list types the `docx`
 * ImageRun can embed.
 */
export const DOCX_PHOTO_DATA_URL = /^data:image\/(?:jpeg|jpg|png|gif|bmp);base64,/

/**
 * The largest photo the Word route will look at, in base64 characters.
 *
 * Sized to be unreachable by any photo the application can legitimately
 * produce, so that it can never cost a user their photo, while still bounding
 * what an attacker can make the server decode.
 *
 * The application's own limit is 2 MB of BINARY, enforced on the file picker in
 * `modern-template.tsx`. Base64 inflates that by 4/3, to roughly 2.8 MB of
 * characters. The stored value can legitimately be larger than the uploaded
 * file — background removal re-encodes the image as PNG and writes the result
 * back under the same key — so the bound is set well above that re-encode
 * rather than at the upload limit itself.
 *
 * 8 MB of characters is also above what a browser could have stored: the value
 * is held in localStorage, whose per-origin quota is around 5 MB in every
 * engine the application targets. A request over this bound therefore did not
 * come from this application's own storage.
 *
 * The browser checks a re-encoded photo against it too: that copy is not held
 * in localStorage, so the quota argument does not bound it.
 */
export const MAX_DOCX_PHOTO_LENGTH = 8 * 1024 * 1024

/**
 * The longest edge, in pixels, of a re-encoded photo.
 *
 * The photo is drawn a few centimetres wide in every template, where 1024 px
 * is well above print resolution. A re-encode at natural size would not be: a
 * 2 MB WebP can hold 12 megapixels, which as PNG is tens of megabytes — over
 * `MAX_DOCX_PHOTO_LENGTH`, so the route would drop it — and slow to encode on
 * the main thread.
 */
export const DOCX_PHOTO_MAX_EDGE = 1024

/**
 * JPEG quality for an opaque re-encoded photo: visually lossless at the size
 * the photo is printed.
 */
export const DOCX_PHOTO_JPEG_QUALITY = 0.9

/**
 * Image data URLs the browser may decode and re-encode for Word.
 *
 * Any image type except SVG, which is refused for the same reason the PDF
 * refuses it: it is a document rather than a picture. The browser's own
 * decoder is the real test — a type it cannot decode fails there and the photo
 * is left out.
 */
const REENCODABLE_DATA_URL = /^data:image\/(?!svg\+xml[;,])[a-z0-9.+-]+;base64,/i

/** What a re-encode may yield: the two types it encodes, with a payload. */
const REENCODED_DATA_URL = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]/

/** Pixel dimensions. */
export interface PhotoSize {
  width: number
  height: number
}

/**
 * `size` scaled down so its longer edge is at most `maxEdge`, keeping its
 * aspect ratio; never scaled up. Each edge is at least 1 px.
 */
export function fitWithin(size: PhotoSize, maxEdge: number = DOCX_PHOTO_MAX_EDGE): PhotoSize {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height))
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/** Whether any pixel of RGBA data is less than fully opaque. */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let alpha = 3; alpha < rgba.length; alpha += 4) {
    if (rgba[alpha] !== 255) return true
  }
  return false
}

/** Decodes an image data URL and re-encodes it as a data URL Word embeds. */
export type DocxPhotoReencoder = (dataUrl: string) => Promise<string>

/**
 * Re-encodes an image data URL with the browser's decoder: scaled down to
 * `DOCX_PHOTO_MAX_EDGE` (never up), as PNG when any pixel is transparent — a
 * background-removed photo keeps its transparency — and as JPEG otherwise,
 * which is several times smaller for a photograph.
 *
 * Transparency is read off the scaled canvas, so the scan is bounded by the
 * scaled size rather than the original's. Rejects when the image cannot be
 * decoded or drawn.
 */
export const reencodeForDocx: DocxPhotoReencoder = (dataUrl) =>
  new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const { naturalWidth, naturalHeight } = image
      if (naturalWidth === 0 || naturalHeight === 0) {
        reject(new Error('Photo has no intrinsic size'))
        return
      }
      const { width, height } = fitWithin({ width: naturalWidth, height: naturalHeight })
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas 2D context unavailable'))
        return
      }
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)
      const transparent = hasTransparency(context.getImageData(0, 0, width, height).data)
      resolve(
        transparent ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', DOCX_PHOTO_JPEG_QUALITY)
      )
    }
    image.onerror = () => reject(new Error('Photo could not be decoded'))
    image.src = dataUrl
  })

/**
 * The photo to send to the Word route, or `undefined` to send none.
 *
 * - A type the route accepts is returned unchanged, byte for byte.
 * - Another raster image data URL is re-encoded (`reencodeForDocx`). If that
 *   fails, yields neither a JPEG nor a PNG data URL, or is still over
 *   `MAX_DOCX_PHOTO_LENGTH`, nothing is sent and the document is produced
 *   without a photo — what the route already did with such a photo.
 * - An SVG data URL is not sent: the route would drop it.
 * - A value that is not a data URL is returned unchanged for the route to
 *   judge, as before; the application itself only stores data URLs.
 */
export async function photoForDocx(
  stored: string | null | undefined,
  reencode: DocxPhotoReencoder = reencodeForDocx
): Promise<string | undefined> {
  if (!stored) return undefined
  if (DOCX_PHOTO_DATA_URL.test(stored)) return stored
  if (!stored.startsWith('data:')) return stored
  if (!REENCODABLE_DATA_URL.test(stored)) return undefined

  let reencoded: string
  try {
    reencoded = await reencode(stored)
  } catch (error) {
    // The error's message only, never the photo itself.
    console.warn('Photo left out of the Word export:', error instanceof Error ? error.message : 'unknown error')
    return undefined
  }
  if (!REENCODED_DATA_URL.test(reencoded)) return undefined
  if (reencoded.length > MAX_DOCX_PHOTO_LENGTH) {
    console.warn('Photo left out of the Word export: still over the size limit after re-encoding')
    return undefined
  }
  return reencoded
}
