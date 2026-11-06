import { coverLetterBodyParagraphs, type CoverLetterPdfFields } from './cover-letter-pdf-html'

/**
 * The length limits of a cover letter's text fields, in UTF-16 code units
 * (`String.length`, which is what zod's `.max` counts). One source for the
 * create and update APIs' schemas. Not used by the PDF export, whose guard is
 * `COVER_LETTER_PDF_GUARD` below.
 */
export const COVER_LETTER_FIELD_LIMITS = Object.freeze({
  title: 255,
  recipient_name: 255,
  recipient_title: 255,
  company_name: 255,
  company_address: 1_000,
  greeting: 255,
  opening_paragraph: 5_000,
  /** Each body paragraph. */
  body_paragraph: 5_000,
  closing_paragraph: 5_000,
  sign_off: 255,
  sender_name: 255,
  sender_street: 255,
  sender_postal_locality: 255,
  sender_phone: 50,
  /** The longest address SMTP can carry (RFC 5321, as amended by errata 1690). */
  sender_email: 254,
  annexes: 1_000,
  job_title: 255,
  job_description: 50_000,
})

/**
 * The PDF render guard: how large a stored letter may be for the server to
 * print it.
 *
 * A RESOURCE BOUND, NOT A CONTENT POLICY. These values exist only so that one
 * row cannot hold a headless browser, and a render slot every PDF export on
 * the instance shares (`render-slots.ts`), for minutes of layout (SEC-012).
 * They are deliberately independent of `COVER_LETTER_FIELD_LIMITS`: the editor
 * saves rows directly, without those API limits, so a letter it saved may
 * exceed them, and it must still export. Each value is set far above any real
 * letter, and only a row no one could have meant as a letter reaches it.
 *
 * Lengths are of the stored text, rich-text markup included, in UTF-16 code
 * units (`String.length`).
 */
export const COVER_LETTER_PDF_GUARD = Object.freeze({
  /** Each printed rich-text field: the opening, the closing and each body paragraph. */
  richTextField: 20_000,
  /** Each printed plain-text field (sender, recipient block, subject, greeting, sign-off). */
  plainTextField: 2_000,
  /**
   * Body paragraphs. No API caps the count, and
   * `AI_LIST_LIMITS.COVER_LETTER_PARAGRAPHS` (10) bounds what the AI writes,
   * not what a user may; a real letter already spans pages at a dozen.
   */
  bodyParagraphs: 50,
  /** Everything printed, together: about 100 pages of plain prose. */
  totalPrinted: 200_000,
})

const PRINTED_PLAIN_TEXT_FIELDS = [
  'sender_name',
  'recipient_name',
  'recipient_title',
  'company_name',
  'company_address',
  'job_title',
  'greeting',
  'sign_off',
] as const satisfies readonly (keyof CoverLetterPdfFields)[]

const PRINTED_RICH_TEXT_FIELDS = ['opening_paragraph', 'closing_paragraph'] as const satisfies readonly (keyof CoverLetterPdfFields)[]

const textLength = (value: unknown): number => (typeof value === 'string' ? value.length : 0)

/**
 * Whether the server may print this stored letter: every printed part within
 * `COVER_LETTER_PDF_GUARD`. Checked before a render slot is taken, and by the
 * Word export before it builds anything: a letter over this guard exports in
 * neither format. The reverse does not hold: the Word export adds its own
 * structural caps (`COVER_LETTER_DOCX_LIMITS` in
 * `src/app/api/cover-letters/[id]/download-docx/cover-letter-docx.ts`: 1,000
 * paragraphs and 5,000 runs), so a letter within this guard can still export
 * as a PDF but be refused with 422 as a Word file.
 *
 * Body items that are not strings are neither counted nor printed
 * (`coverLetterBodyParagraphs`).
 */
export function isCoverLetterWithinPdfGuard(coverLetter: CoverLetterPdfFields): boolean {
  const guard = COVER_LETTER_PDF_GUARD
  const plain = PRINTED_PLAIN_TEXT_FIELDS.map((field) => textLength(coverLetter[field]))
  const body = coverLetterBodyParagraphs(coverLetter.body_paragraphs)
  const rich = [...PRINTED_RICH_TEXT_FIELDS.map((field) => textLength(coverLetter[field])), ...body.map(textLength)]

  if (body.length > guard.bodyParagraphs) return false
  if (plain.some((length) => length > guard.plainTextField)) return false
  if (rich.some((length) => length > guard.richTextField)) return false
  const total = [...plain, ...rich].reduce((sum, length) => sum + length, 0)
  return total <= guard.totalPrinted
}
