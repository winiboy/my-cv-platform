import type { CoverLetter } from '@/types/database'
import { escapeHtml } from './escape-html'
import {
  COVER_LETTER_WORDING,
  formatCoverLetterDate,
  resolveCoverLetterLanguage,
  type CoverLetterLanguage,
} from './cover-letter-language'
import { coverLetterBodyParagraphs } from './cover-letter-body-paragraphs'
import type { CoverLetterSenderDetails } from './cover-letter-sender'
import {
  SWISS_LETTER_FONT_FAMILY,
  SWISS_LETTER_GEOMETRY_MM,
  SWISS_LETTER_LAYOUT_PX,
  mmToPx,
  swissLetterParts,
  swissLetterSpaceBeforePx,
  type SwissLetterPart,
} from './cover-letter-swiss-letter'

export { coverLetterBodyParagraphs }

/**
 * The cover letter fields a letter export prints: the PDF's Swiss letter
 * (`swissLetterParts`, its sender details through `effectiveSenderDetails`)
 * and, until US-004, the Word file's `coverLetterParts`, which reads a subset
 * of them.
 */
export type CoverLetterPdfFields = Pick<
  CoverLetter,
  | 'sender_name'
  | 'sender_street'
  | 'sender_postal_locality'
  | 'sender_phone'
  | 'sender_email'
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
  | 'annexes'
>

/**
 * The columns a letter export reads: what it prints, the title it is named
 * after, and the linked CV whose contact the sender details fall back to
 * (`effectiveSenderDetails`). Nothing else. One literal, shared by the PDF and
 * Word routes, so supabase-js can type the row from it.
 */
export const COVER_LETTER_EXPORT_COLUMNS =
  'title, resume_id, sender_name, sender_street, sender_postal_locality, sender_phone, sender_email, recipient_name, recipient_title, company_name, company_address, job_title, greeting, opening_paragraph, body_paragraphs, closing_paragraph, sign_off, annexes'

export interface CoverLetterPdfHtmlOptions {
  /** The sender details as printed: `effectiveSenderDetails(letter, linked CV contact)`. */
  senderDetails: CoverLetterSenderDetails
  /** The date of the place-and-date line, pre-formatted in `language` (`formatCoverLetterDate`). */
  currentDate: string
  /** The letter's display language (`coverLetterLanguage`). */
  language: CoverLetterLanguage
  /** Sanitizer applied to rich-text paragraphs before interpolation. */
  sanitizeRichText: (html: string) => string
}

/**
 * THE resolver of a letter's display language, for the exports and the
 * preview: detected from its opening, body and closing, the page's language
 * otherwise (`resolveCoverLetterLanguage`).
 */
export function coverLetterLanguage(
  coverLetter: Pick<CoverLetterPdfFields, 'opening_paragraph' | 'body_paragraphs' | 'closing_paragraph'>,
  pageLanguage: CoverLetterLanguage,
): CoverLetterLanguage {
  return resolveCoverLetterLanguage(
    [
      coverLetter.opening_paragraph ?? '',
      ...coverLetterBodyParagraphs(coverLetter.body_paragraphs),
      coverLetter.closing_paragraph ?? '',
    ],
    pageLanguage,
  )
}

/**
 * The most an export request body may hold. It carries only the page's
 * `locale`, so anything near this is not a real request and is refused (413)
 * rather than buffered.
 */
export const MAX_COVER_LETTER_EXPORT_REQUEST_BYTES = 1024

/**
 * The language and date line an export prints, one call shared by the PDF
 * and Word routes so the two files cannot drift: the letter's display language
 * (`coverLetterLanguage`) and `now` formatted in it.
 */
export function coverLetterExportLanguage(
  coverLetter: Pick<CoverLetterPdfFields, 'opening_paragraph' | 'body_paragraphs' | 'closing_paragraph'>,
  pageLanguage: CoverLetterLanguage,
  now: Date,
): { language: CoverLetterLanguage; currentDate: string } {
  const language = coverLetterLanguage(coverLetter, pageLanguage)
  return { language, currentDate: formatCoverLetterDate(now, language) }
}

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
 * TRANSITIONAL: the part list of the Word export only, until US-004
 * (cover-letter-swiss-format) switches it to `swissLetterParts`
 * (`cover-letter-swiss-letter.ts`), after which it is deleted. The editor
 * preview and the PDF already render from `swissLetterParts`. Until then it
 * defines what the Word file contains, which parts are left out when empty,
 * the defaults, and the subject line's wording, in `language`
 * (`COVER_LETTER_WORDING`).
 * The recipient block exists only with a recipient name or a company, as it
 * always has. Body paragraphs are kept even when empty; the Word builder
 * leaves out an empty one itself.
 */
export function coverLetterParts(
  coverLetter: CoverLetterPdfFields,
  currentDate: string,
  language: CoverLetterLanguage,
): CoverLetterPart[] {
  const wording = COVER_LETTER_WORDING[language]
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

  if (coverLetter.job_title) parts.push({ kind: 'subject', text: wording.subject(coverLetter.job_title) })
  parts.push({ kind: 'greeting', text: coverLetter.greeting || wording.defaultGreeting })

  if (coverLetter.opening_paragraph) parts.push({ kind: 'opening', html: coverLetter.opening_paragraph })
  for (const paragraph of coverLetterBodyParagraphs(coverLetter.body_paragraphs)) {
    parts.push({ kind: 'body', html: paragraph })
  }
  if (coverLetter.closing_paragraph) parts.push({ kind: 'closing', html: coverLetter.closing_paragraph })

  parts.push({ kind: 'signOff', text: coverLetter.sign_off || wording.defaultSignOff })
  if (coverLetter.sender_name) parts.push({ kind: 'signature', text: coverLetter.sender_name })

  return parts
}

/** A length in CSS pixels, rounded to a thousandth so the markup stays readable. */
const px = (value: number): string => `${Number(value.toFixed(3))}px`

const layout = SWISS_LETTER_LAYOUT_PX

/**
 * The page: padded by the FR-2 margins, at the letter's font, size and line
 * height, left-aligned, from the constants the preview's page
 * (`ModernLetterTemplate`) is drawn from. One difference: this page is exactly
 * A4 wide (210 mm, 793.70 px, `SWISS_LETTER_GEOMETRY_MM`) where the preview
 * draws the rounded 794 px of `SWISS_LETTER_PAGE_PX`, so the markup is never
 * wider than the printed page, which Chromium would shrink to fit. The text
 * column differs by 0.3 px.
 */
const PAGE_STYLE = [
  `width: ${px(mmToPx(SWISS_LETTER_GEOMETRY_MM.pageWidth))}`,
  `min-height: ${px(layout.page.height)}`,
  `padding: ${px(layout.padding.top)} ${px(layout.padding.right)} ${px(layout.padding.bottom)} ${px(layout.padding.left)}`,
  'background: white',
  `font-family: ${SWISS_LETTER_FONT_FAMILY}`,
  `font-size: ${px(layout.fontSize)}`,
  `line-height: ${px(layout.lineHeight)}`,
  'color: #1f2937',
  'text-align: left',
].join('; ')

/**
 * The sender block and the window zone share one grid cell, so the
 * place-and-date line starts below whichever ends lower: the window zone, or a
 * recipient block longer than it (nothing is cut).
 */
const HEADER_STYLE = `display: grid; min-height: ${px(layout.window.top + layout.window.height)}`

const SENDER_STYLE = `grid-area: 1 / 1; align-self: start; width: ${px(layout.senderWidth)}; overflow-wrap: break-word`

const RECIPIENT_STYLE = [
  'grid-area: 1 / 1',
  'align-self: start',
  `margin-top: ${px(layout.window.top)}`,
  `margin-left: ${px(layout.window.left)}`,
  `width: ${px(layout.window.width)}`,
  'overflow-wrap: break-word',
].join('; ')

type FlowPart = Exclude<SwissLetterPart, { kind: 'sender' | 'recipient' }>

function flowPartHtml(part: FlowPart, sanitizeRichText: (html: string) => string): string {
  const open = `<div data-letter-part="${part.kind}" style="margin-top: ${px(swissLetterSpaceBeforePx(part.kind))};">`
  switch (part.kind) {
    case 'opening':
    case 'body':
    case 'closing':
      return `${open}<div style="text-align: left;">${sanitizeRichText(part.html)}</div></div>`
    case 'annexes':
      return `${open}<div>${escapeHtml(part.label)}</div><div style="white-space: pre-line;">${escapeHtml(part.text)}</div></div>`
    case 'subject':
      return `${open}<strong>${escapeHtml(part.text)}</strong></div>`
    case 'placeDate':
    case 'greeting':
    case 'signOff':
    case 'signature':
      return `${open}${escapeHtml(part.text)}</div>`
  }
}

/**
 * Builds the HTML markup of a cover letter's PDF, which the server prints in a
 * headless browser (`src/lib/pdf/render-cover-letter.ts`): the Swiss A4 letter
 * of `swissLetterParts`, laid out as the editor preview lays it out
 * (`SWISS_LETTER_LAYOUT_PX`), so the two show the same parts, in the same
 * order, at the same positions.
 *
 * Plain-text parts (the sender and recipient lines, the place-and-date line,
 * subject, greeting, sign-off, signature, the Annexes label and list) are
 * entered by the user as text, so they are HTML-escaped: the markup is parsed
 * as HTML, and unescaped values would become elements.
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
  const { senderDetails, currentDate, language, sanitizeRichText } = options
  const parts = swissLetterParts(coverLetter, { senderDetails, date: currentDate, language })

  const header: string[] = []
  const flow: string[] = []
  for (const part of parts) {
    switch (part.kind) {
      case 'sender':
        header.push(
          `<div data-letter-part="sender" style="${SENDER_STYLE};">${part.lines
            .map((line) => `<div>${escapeHtml(line)}</div>`)
            .join('')}</div>`,
        )
        break
      case 'recipient':
        header.push(
          `<div data-letter-part="recipient" style="${RECIPIENT_STYLE};">${part.lines
            .map((line) =>
              line.multiline
                ? `<div style="white-space: pre-line;">${escapeHtml(line.text)}</div>`
                : `<div>${escapeHtml(line.text)}</div>`,
            )
            .join('')}</div>`,
        )
        break
      default:
        flow.push(flowPartHtml(part, sanitizeRichText))
    }
  }

  return `<div style="${PAGE_STYLE};"><div style="${HEADER_STYLE};">${header.join('')}</div>${flow.join('')}</div>`
}
