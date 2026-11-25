import { DOCX_PHOTO_DATA_URL, MAX_DOCX_PHOTO_LENGTH } from '@/lib/photo-for-docx'

/**
 * The Word route's trust-boundary check on the photo, the one resume property
 * it accepts from the client (see the route's "THE PHOTO" note for why).
 *
 * In its own module rather than in `route.ts` because a route file may only
 * export its handlers, and the check is tested directly. The accepted types and
 * the size bound are defined in `@/lib/photo-for-docx`, which the browser reads
 * to prepare a photo this check will accept.
 */

/**
 * The image data-URL forms `docx-modern.ts` can actually decode.
 *
 * A superset check, not a second implementation of the generator's own
 * detection: anything accepted here is still identified — or rejected — there.
 * Kept as a superset deliberately, so that narrowing this list is the only way
 * to lose a photo that used to work, and so a format the generator drops
 * cannot be smuggled past on the strength of its prefix alone.
 */
const SUPPORTED_PHOTO_DATA_URL = DOCX_PHOTO_DATA_URL

/** Base64 as `FileReader` and `btoa` emit it: no whitespace, no line breaks. */
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * The photo, if the request carried one the route is willing to hand on.
 *
 * Returns `undefined` for anything unusable rather than failing the request.
 * That is the behaviour a caller already gets for an unrecognised image — the
 * generator skips it and produces the document without a photo — and matching
 * it means this bound cannot turn an export that used to succeed into an error
 * response. The document is still produced; it simply has no photo in it.
 */
export function boundedPhoto(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.length === 0 || value.length > MAX_DOCX_PHOTO_LENGTH) return undefined

  // A supported data URL contributes its prefix; anything else must be raw
  // base64 in full. An unsupported data URL (`data:image/svg+xml;base64,...`,
  // say) reaches the payload check with its own prefix still attached and
  // fails it on the characters that prefix contains.
  const prefix = SUPPORTED_PHOTO_DATA_URL.exec(value)
  const payload = prefix ? value.slice(prefix[0].length) : value

  if (payload.length === 0 || !BASE64_PAYLOAD.test(payload)) return undefined
  return value
}
