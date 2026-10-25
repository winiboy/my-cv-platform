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

/**
 * Builds the HTML markup of a cover letter's PDF, which the server prints in a
 * headless browser (`src/lib/pdf/render-cover-letter.ts`).
 *
 * Plain-text fields (sender_name, recipient_name, recipient_title,
 * company_name, company_address, job_title, greeting, sign_off, and the
 * date) are entered by the user as text, so they are HTML-escaped: the markup
 * is parsed as HTML, and unescaped values would become elements.
 *
 * Rich-text fields (opening_paragraph, body_paragraphs, closing_paragraph)
 * legitimately contain formatting markup, so they go through
 * `sanitizeRichText` instead and are not escaped, which would destroy the
 * formatting.
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

  const bodyParagraphs = coverLetterBodyParagraphs(coverLetter.body_paragraphs)

  return `
        <div style="width: 816px; min-height: 1056px; background: white; padding: 64px; font-family: Georgia, serif; font-size: 14px; line-height: 1.625; color: #1f2937;">
          <!-- Sender name -->
          ${coverLetter.sender_name ? `<div style="font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 4px;">${escapeHtml(coverLetter.sender_name)}</div>` : ''}

          <!-- Date -->
          <div style="margin-bottom: 24px; color: #4b5563;">${escapeHtml(currentDate)}</div>

          <!-- Recipient info -->
          ${coverLetter.recipient_name || coverLetter.company_name ? `
            <div style="margin-bottom: 24px;">
              ${coverLetter.recipient_name ? `<div>${escapeHtml(coverLetter.recipient_name)}</div>` : ''}
              ${coverLetter.recipient_title ? `<div>${escapeHtml(coverLetter.recipient_title)}</div>` : ''}
              ${coverLetter.company_name ? `<div>${escapeHtml(coverLetter.company_name)}</div>` : ''}
              ${coverLetter.company_address ? `<div style="white-space: pre-line;">${escapeHtml(coverLetter.company_address)}</div>` : ''}
            </div>
          ` : ''}

          <!-- Job reference -->
          ${coverLetter.job_title ? `<div style="margin-bottom: 24px;"><strong>Re: Application for ${escapeHtml(coverLetter.job_title)}</strong></div>` : ''}

          <!-- Greeting -->
          <div style="margin-bottom: 16px;">${escapeHtml(coverLetter.greeting || 'Dear Hiring Manager,')}</div>

          <!-- Opening paragraph -->
          ${coverLetter.opening_paragraph ? `<div style="margin-bottom: 16px; text-align: justify;">${sanitizeRichText(coverLetter.opening_paragraph)}</div>` : ''}

          <!-- Body paragraphs -->
          ${bodyParagraphs.map(p => `<div style="margin-bottom: 16px; text-align: justify;">${sanitizeRichText(p)}</div>`).join('')}

          <!-- Closing paragraph -->
          ${coverLetter.closing_paragraph ? `<div style="margin-bottom: 24px; text-align: justify;">${sanitizeRichText(coverLetter.closing_paragraph)}</div>` : ''}

          <!-- Sign-off -->
          <div style="margin-top: 32px;">
            <div style="margin-bottom: 32px;">${escapeHtml(coverLetter.sign_off || 'Sincerely,')}</div>
            ${coverLetter.sender_name ? `<div style="font-weight: 600;">${escapeHtml(coverLetter.sender_name)}</div>` : ''}
          </div>
        </div>
      `
}
