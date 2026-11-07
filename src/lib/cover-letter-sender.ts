import { z } from 'zod'
import type { CoverLetter } from '@/types/database'
import { sanitizeUntrustedPlainText } from '@/lib/resume-from-job/untrusted-text'
import { COVER_LETTER_FIELD_LIMITS } from './cover-letter-limits'

/**
 * The sender's details a Swiss letter prints under the sender's name, and the
 * enclosures line (cover-letter-swiss-format, US-001).
 *
 * `annexes` is not a sender detail: it follows the same validation, but takes
 * no CV fallback, and its empty string means something of its own
 * (`COVER_LETTER_NO_ANNEXES`).
 */
export const COVER_LETTER_SENDER_DETAIL_FIELDS = [
  'sender_street',
  'sender_postal_locality',
  'sender_phone',
  'sender_email',
] as const

export type CoverLetterSenderDetailField = (typeof COVER_LETTER_SENDER_DETAIL_FIELDS)[number]

export type CoverLetterSenderDetails = Pick<CoverLetter, CoverLetterSenderDetailField>

/** The five columns, in the order the editor shows them. */
export const COVER_LETTER_SENDER_FIELDS = [...COVER_LETTER_SENDER_DETAIL_FIELDS, 'annexes'] as const

export type CoverLetterSenderField = (typeof COVER_LETTER_SENDER_FIELDS)[number]

/**
 * The stored `annexes` of a letter the user wants without an Annexes block.
 * `null` is the other state: not set, so the letter prints the default list
 * in its language. Nothing may turn one into the other.
 */
export const COVER_LETTER_NO_ANNEXES = ''

const limited = (limit: number) => z.string().max(limit).nullable().optional()

/**
 * The zod fields of the five columns: the one definition of what may be
 * stored in them, shared by `POST /api/cover-letters`,
 * `PATCH /api/cover-letters/[id]` and the editor's save
 * (`validateCoverLetterSenderFields`). Each is a nullable string within
 * `COVER_LETTER_FIELD_LIMITS`; the e-mail is format-checked unless empty, as
 * an empty field is how the user clears it.
 */
export const coverLetterSenderFieldsShape = {
  sender_street: limited(COVER_LETTER_FIELD_LIMITS.sender_street),
  sender_postal_locality: limited(COVER_LETTER_FIELD_LIMITS.sender_postal_locality),
  sender_phone: limited(COVER_LETTER_FIELD_LIMITS.sender_phone),
  sender_email: z
    .union([z.literal(''), z.email().max(COVER_LETTER_FIELD_LIMITS.sender_email)])
    .nullable()
    .optional(),
  annexes: limited(COVER_LETTER_FIELD_LIMITS.annexes),
}

/** Why a field's value cannot be saved: over its limit, or not an e-mail address. */
export type CoverLetterSenderFieldError = 'tooLong' | 'invalidEmail'

/**
 * The fields of these values that `coverLetterSenderFieldsShape` refuses, and
 * why; empty when every value may be stored. Lets the editor refuse, before
 * its direct write, exactly what the API would refuse with a 400.
 */
export function validateCoverLetterSenderFields(
  values: Partial<Record<CoverLetterSenderField, string | null>>,
): Partial<Record<CoverLetterSenderField, CoverLetterSenderFieldError>> {
  const errors: Partial<Record<CoverLetterSenderField, CoverLetterSenderFieldError>> = {}
  for (const field of COVER_LETTER_SENDER_FIELDS) {
    const value = values[field]
    if (coverLetterSenderFieldsShape[field].safeParse(value).success) continue
    const tooLong = typeof value === 'string' && value.length > COVER_LETTER_FIELD_LIMITS[field]
    errors[field] = tooLong || field !== 'sender_email' ? 'tooLong' : 'invalidEmail'
  }
  return errors
}

/**
 * The annexes as they are stored. The empty string, the user's explicit
 * "no Annexes block", stays as it is. Any other value is trimmed, and one
 * with nothing but whitespace becomes `null`: the user typed nothing, so the
 * letter keeps the default list rather than printing an empty block.
 */
export function normalizeAnnexes(annexes: string | null): string | null {
  if (annexes === null || annexes === COVER_LETTER_NO_ANNEXES) return annexes
  const trimmed = annexes.trim()
  return trimmed === '' ? null : trimmed
}

const senderEmailSchema = coverLetterSenderFieldsShape.sender_email

/**
 * The sender details a CV's `contact` provides: phone, e-mail and locality
 * (`contact.location`). A CV has no street. Each value is plain text
 * (`sanitizeUntrustedPlainText`: markup removed, whitespace collapsed) cut to
 * its column limit; an e-mail the API would refuse is left out.
 */
export function senderDetailsFromContact(contact: unknown): CoverLetterSenderDetails {
  const source = typeof contact === 'object' && contact !== null ? (contact as Record<string, unknown>) : {}
  const value = (key: string, limit: number): string | null => sanitizeUntrustedPlainText(source[key], limit) || null
  const email = value('email', COVER_LETTER_FIELD_LIMITS.sender_email)
  return {
    sender_street: null,
    sender_postal_locality: value('location', COVER_LETTER_FIELD_LIMITS.sender_postal_locality),
    sender_phone: value('phone', COVER_LETTER_FIELD_LIMITS.sender_phone),
    sender_email: email !== null && senderEmailSchema.safeParse(email).success ? email : null,
  }
}

/** The fields that fall back to the linked CV; the street has no CV counterpart. */
const CV_FALLBACK_FIELDS = ['sender_postal_locality', 'sender_phone', 'sender_email'] as const

/**
 * The sender details a letter prints and the editor shows: the stored ones,
 * with the linked CV as an automatic fallback (owner decision, 2026-11-05).
 *
 * For the phone, the e-mail and the locality, a stored value that is not
 * `null` is used as it is stored, the empty string included: that is a field
 * the user cleared on purpose, and it stays empty. A `null` one was never set
 * and takes the CV's value (`senderDetailsFromContact`), or stays `null`
 * without a CV. The street is always the stored one.
 *
 * THE ONE PLACE THIS RULE LIVES. The editor shows its fields through it, and
 * saves what it returns; the preview, the PDF and the Word export render the
 * sender block through it too, the server loading the linked CV's contact.
 * So a letter that was never saved since its CV was linked looks the same in
 * all of them, and nothing has to be saved for its export to carry the CV's
 * details.
 *
 * `contact` is the linked CV's `contact`, or `null` when the letter has no
 * CV or it could not be read.
 */
export function effectiveSenderDetails(
  letter: CoverLetterSenderDetails,
  contact: unknown,
): CoverLetterSenderDetails {
  const fromContact = contact === null ? null : senderDetailsFromContact(contact)
  const details: CoverLetterSenderDetails = { ...pickSenderDetails(letter) }
  for (const field of CV_FALLBACK_FIELDS) {
    if (details[field] === null) details[field] = fromContact?.[field] ?? null
  }
  return details
}

function pickSenderDetails(letter: CoverLetterSenderDetails): CoverLetterSenderDetails {
  return {
    sender_street: letter.sender_street ?? null,
    sender_postal_locality: letter.sender_postal_locality ?? null,
    sender_phone: letter.sender_phone ?? null,
    sender_email: letter.sender_email ?? null,
  }
}
