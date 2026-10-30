import type { CoverLetter } from '@/types/database'
import { escapeHtml } from './escape-html'

/** The cover letter fields rendered by the PDF export template. */
export type CoverLetterPdfFields = Pick<
  CoverLetter,
  | 'sender_name'
  | 'recipient_name'
  | 'recipient_title'
  | 'company_name'
  | 'company_address'
  | 'job_title'
  | 'greeting'
  | 'opening_paragraph'
  | 'body_paragraphs'
  | 'closing_paragraph'
  | 'sign_off'
>

/**
 * The columns a letter export reads: what it prints, and the title it is named
 * after. Nothing else. One literal, shared by the PDF and Word routes, so
 * supabase-js can type the row from it.
 */
export const COVER_LETTER_EXPORT_COLUMNS =
  'title, sender_name, recipient_name, recipient_title, company_name, company_address, job_title, greeting, opening_paragraph, body_paragraphs, closing_paragraph, sign_off'

export interface CoverLetterPdfHtmlOptions {
  /** Pre-formatted date shown under the sender name. */
  currentDate: string
  /** Sanitizer applied to rich-text paragraphs before interpolation. */
  sanitizeRichText: (html: string) => string
}

/**
 * The body paragraphs a letter prints: the stored JSON array's strings, in
 * order. `body_paragraphs` is a JSON column the editor writes directly, so a
 * malformed row (not an array, or an item that is not a string) prints what it
 * can rather than failing the export. The one filter the builder and the PDF
 * renderer's sanitizing step share, so both see the same paragraphs.
 */
export function coverLetterBodyParagraphs(bodyParagraphs: CoverLetterPdfFields['body_paragraphs']): string[] {
  if (!Array.isArray(bodyParagraphs)) return []
  return bodyParagraphs.filter((paragraph): paragraph is string => typeof paragraph === 'string')
}

/**
 * The date line as the letter export has always printed it: US English, long
 * month. Localizing it is a separate requirement (PRD
 * `tasks/prds/cover-letter-export-translate.md`, Out of Scope).
 */
export function formatCoverLetterPdfDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/** The greeting printed when the letter has none. */
const DEFAULT_GREETING = 'Dear Hiring Manager,'

/** The sign-off printed when the letter has none. */
const DEFAULT_SIGN_OFF = 'Sincerely,'

/** One line of the recipient block. The company address keeps its line breaks. */
export interface CoverLetterRecipientLine {
  text: string
  multiline: boolean
}

/**
 * One part of a printed letter. `text` is plain text, to be escaped by
 * whoever draws it; `html` is the stored rich text, still to be sanitized.
 */
export type CoverLetterPart =
  | { kind: 'sender' | 'date' | 'subject' | 'greeting' | 'signOff' | 'signature'; text: string }
  | { kind: 'recipient'; lines: CoverLetterRecipientLine[] }
  | { kind: 'opening' | 'body' | 'closing'; html: string }

/**
 * The parts of a letter export, in the order it prints them: sender; date;
 * recipient and company block; subject; greeting; opening; each body
 * paragraph; closing; sign-off; signature name.
 *
 * THE ONE SOURCE of what the letter's PDF and Word files contain, which parts
 * are left out when empty, the defaults, and the subject line's wording, so
 * the two formats cannot disagree. The recipient block exists only with a
 * recipient name or a company, as it always has. Body paragraphs are kept
 * even when empty, as the PDF has always laid them out; a format that has no
 * use for an empty one leaves it out itself.
 */
export function coverLetterParts(coverLetter: CoverLetterPdfFields, currentDate: string): CoverLetterPart[] {
  const parts: CoverLetterPart[] = []

  if (coverLetter.sender_name) parts.push({ kind: 'sender', text: coverLetter.sender_name })
  parts.push({ kind: 'date', text: currentDate })

  if (coverLetter.recipient_name || coverLetter.company_name) {
    const lines: CoverLetterRecipientLine[] = []
    if (coverLetter.recipient_name) lines.push({ text: coverLetter.recipient_name, multiline: false })
    if (coverLetter.recipient_title) lines.push({ text: coverLetter.recipient_title, multiline: false })
    if (coverLetter.company_name) lines.push({ text: coverLetter.company_name, multiline: false })
    if (coverLetter.company_address) lines.push({ text: coverLetter.company_address, multiline: true })
    parts.push({ kind: 'recipient', lines })
  }

  if (coverLetter.job_title) parts.push({ kind: 'subject', text: `Re: Application for ${coverLetter.job_title}` })
  parts.push({ kind: 'greeting', text: coverLetter.greeting || DEFAULT_GREETING })

  if (coverLetter.opening_paragraph) parts.push({ kind: 'opening', html: coverLetter.opening_paragraph })
  for (const paragraph of coverLetterBodyParagraphs(coverLetter.body_paragraphs)) {
    parts.push({ kind: 'body', html: paragraph })
  }
  if (coverLetter.closing_paragraph) parts.push({ kind: 'closing', html: coverLetter.closing_paragraph })

  parts.push({ kind: 'signOff', text: coverLetter.sign_off || DEFAULT_SIGN_OFF })
  if (coverLetter.sender_name) parts.push({ kind: 'signature', text: coverLetter.sender_name })

  return parts
}

/**
 * Builds the HTML markup of a cover letter's PDF, which the server prints in a
 * headless browser (`src/lib/pdf/render-cover-letter.ts`), from
 * `coverLetterParts`.
 *
 * Plain-text parts (sender, date, recipient block, subject, greeting,
 * sign-off, signature) are entered by the user as text, so they are
 * HTML-escaped: the markup is parsed as HTML, and unescaped values would
 * become elements.
 *
 * Rich-text parts (opening, body paragraphs, closing) legitimately contain
 * formatting markup, so they go through `sanitizeRichText` instead and are not
 * escaped, which would destroy the formatting.
 *
 * The sanitizer is injected rather than imported because the project's
 * `sanitizeHtml` depends on `document`, which keeps this builder DOM-free and
 * testable in a node environment.
 */
export function buildCoverLetterPdfHtml(
  coverLetter: CoverLetterPdfFields,
  options: CoverLetterPdfHtmlOptions,
): string {
  const { currentDate, sanitizeRichText } = options

  const letter: string[] = []
  // The sign-off and the signature share one block, spaced from the letter.
  const signature: string[] = []

  for (const part of coverLetterParts(coverLetter, currentDate)) {
    switch (part.kind) {
      case 'sender':
        letter.push(`<div style="font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 4px;">${escapeHtml(part.text)}</div>`)
        break
      case 'date':
        letter.push(`<div style="margin-bottom: 24px; color: #4b5563;">${escapeHtml(part.text)}</div>`)
        break
      case 'recipient':
        letter.push(
          `<div style="margin-bottom: 24px;">${part.lines
            .map((line) =>
              line.multiline
                ? `<div style="white-space: pre-line;">${escapeHtml(line.text)}</div>`
                : `<div>${escapeHtml(line.text)}</div>`,
            )
            .join('')}</div>`,
        )
        break
      case 'subject':
        letter.push(`<div style="margin-bottom: 24px;"><strong>${escapeHtml(part.text)}</strong></div>`)
        break
      case 'greeting':
        letter.push(`<div style="margin-bottom: 16px;">${escapeHtml(part.text)}</div>`)
        break
      case 'opening':
      case 'body':
        letter.push(`<div style="margin-bottom: 16px; text-align: justify;">${sanitizeRichText(part.html)}</div>`)
        break
      case 'closing':
        letter.push(`<div style="margin-bottom: 24px; text-align: justify;">${sanitizeRichText(part.html)}</div>`)
        break
      case 'signOff':
        signature.push(`<div style="margin-bottom: 32px;">${escapeHtml(part.text)}</div>`)
        break
      case 'signature':
        signature.push(`<div style="font-weight: 600;">${escapeHtml(part.text)}</div>`)
        break
    }
  }

  return (
    '<div style="width: 816px; min-height: 1056px; background: white; padding: 64px; font-family: Georgia, serif; font-size: 14px; line-height: 1.625; color: #1f2937;">' +
    letter.join('') +
    `<div style="margin-top: 32px;">${signature.join('')}</div>` +
    '</div>'
  )
}
