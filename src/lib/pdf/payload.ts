import { z } from 'zod'
import { MAX_PHOTO_LENGTH, boundedPdfPhoto } from './photo'

// The photo bound lives in `photo.ts`, shared with the browser; re-exported
// here because this module is where the request's bounds are read.
export { MAX_PHOTO_LENGTH, boundedPdfPhoto }

/**
 * What a resume PDF request may carry, and the bounds it is held to.
 *
 * The route renders the Preview page, and the Preview shows two things the
 * server cannot see: the unsaved draft (`resume_draft_${id}`) and the photo
 * (`resume_photo_${id}`), both held only in the browser's localStorage. The
 * request body is how they reach the render. Everything in it is untrusted:
 * it is bounded here, before a browser is launched, and the draft's rich text
 * is then sanitized by the Preview itself exactly as it is for the user.
 */

/**
 * The largest draft accepted, in characters.
 *
 * A draft is the resume serialized by the editor; a long real CV is tens of
 * kilobytes. 2 MiB is far above that and still well inside the ~5 MB
 * localStorage quota the draft has to fit in alongside the photo.
 */
export const MAX_DRAFT_LENGTH = 2 * 1024 * 1024

/**
 * The largest request body read, in bytes: both fields at their bounds plus the
 * JSON around them. A photo or draft that is valid can never exceed it, and a
 * body that does is refused with 413 without being buffered past this point.
 */
export const MAX_PDF_REQUEST_BYTES = MAX_PHOTO_LENGTH + MAX_DRAFT_LENGTH + 64 * 1024

/**
 * The body's shape. Unknown keys are refused, so nothing else — a layout, a
 * template, an owner — can be slipped in beside the two named exceptions.
 */
const PdfRequestBodySchema = z.strictObject({
  /** The `resume_draft_${id}` localStorage value, verbatim. */
  draft: z.string().optional(),
  /** The `resume_photo_${id}` localStorage value, verbatim. */
  photoBase64: z.unknown().optional(),
})

export type PdfRequestRejection =
  | { ok: false; status: 400; reason: string }
  | { ok: false; status: 413; reason: string }

export interface PdfRequestContent {
  ok: true
  /** The draft re-serialized after validation, or `null` to render the stored resume. */
  draft: string | null
  /** A bounded photo data URL, or `null` to render without one. */
  photo: string | null
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validate a request body against the resume it was sent for.
 *
 * @param body       The raw body text; empty means "no draft, no photo".
 * @param resumeId   The resume id from the URL, already shown to belong to
 * @param userId     this signed-in user.
 *
 * The draft must be a JSON object naming exactly this resume, and if it names
 * an owner, this user: a draft can change what the Preview shows, never which
 * resume is rendered or whose it is.
 */
export function parsePdfRequestBody(
  body: string,
  resumeId: string,
  userId: string,
): PdfRequestContent | PdfRequestRejection {
  if (body.trim().length === 0) return { ok: true, draft: null, photo: null }

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return { ok: false, status: 400, reason: 'Invalid JSON body' }
  }

  const parsed = PdfRequestBodySchema.safeParse(json)
  if (!parsed.success) return { ok: false, status: 400, reason: 'Invalid request body' }

  const photo = boundedPdfPhoto(parsed.data.photoBase64) ?? null
  const rawDraft = parsed.data.draft
  if (rawDraft === undefined) return { ok: true, draft: null, photo }

  if (rawDraft.length > MAX_DRAFT_LENGTH) {
    return { ok: false, status: 413, reason: 'Draft too large' }
  }

  let draft: unknown
  try {
    draft = JSON.parse(rawDraft)
  } catch {
    return { ok: false, status: 400, reason: 'Invalid draft' }
  }
  if (!isPlainObject(draft)) return { ok: false, status: 400, reason: 'Invalid draft' }
  if (draft.id !== resumeId) {
    return { ok: false, status: 400, reason: 'Draft does not belong to this resume' }
  }
  if (draft.user_id !== undefined && draft.user_id !== userId) {
    return { ok: false, status: 400, reason: 'Draft does not belong to this resume' }
  }

  // Re-serialized rather than passed through: the page parses exactly the
  // object validated above, whatever duplicate keys or spacing the client sent.
  return { ok: true, draft: JSON.stringify(draft), photo }
}

/**
 * Read a request body as text, refusing it once it exceeds `maxBytes`.
 *
 * A declared `Content-Length` over the limit is refused before anything is
 * read. The stream is counted as well, because the header is optional and is
 * the client's own claim: a chunked or understated body is cut off at the
 * limit rather than buffered whole.
 */
export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; status: 413 }> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 }
  if (!request.body) return { ok: true, text: '' }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      return { ok: false, status: 413 }
    }
    chunks.push(value)
  }

  return { ok: true, text: Buffer.concat(chunks).toString('utf-8') }
}
