/**
 * The photo a resume PDF may show, checked identically on both sides of the
 * request: by the route before the render (`payload.ts`), and by the browser
 * before it sends anything (`download-client.ts`), so that a photo the route
 * would drop is reported to the user instead of silently missing from the PDF.
 *
 * Kept free of server-only imports for that reason.
 */

/**
 * The largest photo this route will hand on, in characters.
 *
 * The same bound as `boundedPhoto()` in the DOCX route
 * (`src/app/api/resumes/[id]/download-docx/route.ts`), which documents the
 * sizing: above any photo the application can produce, and above what a
 * browser's localStorage can hold. Restated rather than imported because that
 * route may not change and does not export it.
 */
export const MAX_PHOTO_LENGTH = 8 * 1024 * 1024

/**
 * The image data-URL forms the PDF accepts.
 *
 * `boundedPhoto()`'s raster types plus WebP and AVIF (owner decision,
 * 2026-10-13): the PDF is drawn by Chromium, which renders both, so refusing
 * them would drop a photo the Preview shows. The DOCX bound is not widened by
 * this — Word cannot embed them and that route may not change.
 *
 * SVG stays refused: it is a document, not a picture, and can carry script and
 * external references into the render.
 */
const SUPPORTED_PHOTO_DATA_URL = /^data:image\/(?:jpeg|jpg|png|gif|bmp|webp|avif);base64,/

/** Base64 as `FileReader` and `btoa` emit it: no whitespace, no line breaks. */
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * Why a stored photo cannot be in the PDF, or `null` when it can.
 *
 * - `too-large`: over `MAX_PHOTO_LENGTH`.
 * - `unsupported`: anything else the route refuses — not a string, empty, not
 *   a data URL of an accepted type, or a payload that is not plain base64.
 */
export function pdfPhotoProblem(value: unknown): 'too-large' | 'unsupported' | null {
  if (typeof value !== 'string' || value.length === 0) return 'unsupported'
  if (value.length > MAX_PHOTO_LENGTH) return 'too-large'

  const prefix = SUPPORTED_PHOTO_DATA_URL.exec(value)
  if (!prefix) return 'unsupported'

  const payload = value.slice(prefix[0].length)
  if (payload.length === 0 || !BASE64_PAYLOAD.test(payload)) return 'unsupported'
  return null
}

/**
 * The photo, if it is one the render may show; `undefined` otherwise.
 *
 * `boundedPhoto()`'s checks, with two differences: the types above, and the
 * data-URL prefix is required. The photo becomes an `<img src>` on the rendered
 * page, and only a data URL is drawn there without a network request; a bare
 * base64 string would be resolved as a relative URL. The application only ever
 * stores data URLs (`FileReader.readAsDataURL` and the background-removal
 * output), so the tightening costs no real photo.
 *
 * Like `boundedPhoto()`, an unusable photo is dropped rather than failing the
 * request. The browser checks first with `pdfPhotoProblem` and does not send a
 * photo that would be dropped, so this only drops what a client other than the
 * application's own sends.
 */
export function boundedPdfPhoto(value: unknown): string | undefined {
  return typeof value === 'string' && pdfPhotoProblem(value) === null ? value : undefined
}
