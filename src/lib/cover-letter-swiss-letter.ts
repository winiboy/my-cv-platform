import type { CoverLetter } from '@/types/database'
import { COVER_LETTER_WORDING, type CoverLetterLanguage } from './cover-letter-language'
import { coverLetterBodyParagraphs, type CoverLetterRecipientLine } from './cover-letter-pdf-html'
import { COVER_LETTER_NO_ANNEXES, normalizeAnnexes, type CoverLetterSenderDetails } from './cover-letter-sender'

/**
 * THE canonical description of a Swiss cover letter (cover-letter-swiss-format,
 * FR-1 and FR-2): which parts it prints, in which order, with which wording,
 * and where they sit on the A4 page (`CLAUDE.md` §10).
 *
 * Today only the editor preview (its pane and the preview window) renders
 * from it. The PDF (US-003) and the Word export (US-004) move to it next,
 * after which `coverLetterParts` is removed; from then on no rendering can
 * add, drop or reorder a part, or place one elsewhere.
 *
 * Pure: no React, no DOM, nothing server-only, so the editor preview, the
 * server's PDF markup and the Word builder can all import it.
 */

/**
 * The page and its fixed positions, in millimetres from the page's top-left
 * corner (FR-2). These follow common Swiss right-window templates; adjust them
 * here and every rendering follows.
 */
export const SWISS_LETTER_GEOMETRY_MM = Object.freeze({
  /** A4. */
  pageWidth: 210,
  pageHeight: 297,
  /** FR-2: top 15–20 mm, left 25 mm, right 20 mm. FR-2 sets no bottom margin. */
  marginTop: 18,
  marginRight: 20,
  marginBottom: 15,
  marginLeft: 25,
  /** The recipient window zone's left edge and top. */
  windowLeft: 110,
  windowTop: 50,
  /** FR-2: the window zone is at most 85 mm wide. */
  windowMaxWidth: 85,
  /** Clearance between the sender block's right edge and the window zone. */
  senderWindowGap: 5,
})

/** FR-2: the recipient block takes at most six lines of the window zone. */
export const SWISS_LETTER_WINDOW_MAX_LINES = 6

/** FR-2: the letter's font size. */
export const SWISS_LETTER_FONT_SIZE_PT = 11

/** Line height, as a multiple of the font size. */
export const SWISS_LETTER_LINE_HEIGHT = 1.3

/** A4 at 96 dpi, the CSS pixel page the preview draws (210 × 297 mm, rounded). */
export const SWISS_LETTER_PAGE_PX = Object.freeze({ width: 794, height: 1123 })

const CSS_PX_PER_INCH = 96
const MM_PER_INCH = 25.4
const PT_PER_INCH = 72

/** Millimetres as CSS pixels (96 dpi). */
export function mmToPx(mm: number): number {
  return (mm * CSS_PX_PER_INCH) / MM_PER_INCH
}

/** Points as CSS pixels (96 dpi). */
export function ptToPx(pt: number): number {
  return (pt * CSS_PX_PER_INCH) / PT_PER_INCH
}

/** A part of a Swiss letter. */
export type SwissLetterPart =
  /** Name, street, postcode and locality, phone, e-mail: the lines that have text. */
  | { kind: 'sender'; lines: string[] }
  /** Recipient name, title, company, address: the lines that have text. */
  | { kind: 'recipient'; lines: CoverLetterRecipientLine[] }
  | { kind: 'placeDate' | 'subject' | 'greeting' | 'signOff' | 'signature'; text: string }
  /** Stored rich text, still to be sanitized by whoever draws it. */
  | { kind: 'opening' | 'body' | 'closing'; html: string }
  /** The Annexes block: its label, then the list as written (line breaks kept). */
  | { kind: 'annexes'; label: string; text: string }

export type SwissLetterPartKind = SwissLetterPart['kind']

/**
 * The space above each part, in lines of the letter's text, from the end of
 * the part above it. `placeDate` is measured from the bottom of the window
 * zone; `signature` is the space left for the handwritten signature. The
 * sender sits at the top margin and the recipient in the window zone, so
 * neither has space of its own.
 */
export const SWISS_LETTER_SPACE_BEFORE_LINES: Readonly<Record<SwissLetterPartKind, number>> = Object.freeze({
  sender: 0,
  recipient: 0,
  placeDate: 1,
  subject: 2,
  greeting: 1,
  opening: 1,
  body: 1,
  closing: 1,
  signOff: 1,
  signature: 2.5,
  annexes: 1,
})

const geometry = SWISS_LETTER_GEOMETRY_MM
const fontSizePx = ptToPx(SWISS_LETTER_FONT_SIZE_PT)
const lineHeightPx = fontSizePx * SWISS_LETTER_LINE_HEIGHT
const contentRightMm = geometry.pageWidth - geometry.marginRight

/**
 * The FR-2 geometry in CSS pixels, for a page laid out as a box padded by the
 * margins. Offsets inside the content box are from its top-left corner (the
 * top and left margins).
 */
export const SWISS_LETTER_LAYOUT_PX = Object.freeze({
  page: SWISS_LETTER_PAGE_PX,
  padding: Object.freeze({
    top: mmToPx(geometry.marginTop),
    right: mmToPx(geometry.marginRight),
    bottom: mmToPx(geometry.marginBottom),
    left: mmToPx(geometry.marginLeft),
  }),
  fontSize: fontSizePx,
  lineHeight: lineHeightPx,
  /** The sender block's width: up to the window zone, less the clearance. */
  senderWidth: mmToPx(geometry.windowLeft - geometry.senderWindowGap - geometry.marginLeft),
  window: Object.freeze({
    top: mmToPx(geometry.windowTop - geometry.marginTop),
    left: mmToPx(geometry.windowLeft - geometry.marginLeft),
    /** At most `windowMaxWidth`, and never past the right margin. */
    width: mmToPx(Math.min(geometry.windowMaxWidth, contentRightMm - geometry.windowLeft)),
    /** Six lines: the place-and-date line starts below this, however short the address. */
    height: SWISS_LETTER_WINDOW_MAX_LINES * lineHeightPx,
  }),
})

/** The space above `kind`, in CSS pixels (`SWISS_LETTER_SPACE_BEFORE_LINES`). */
export function swissLetterSpaceBeforePx(kind: SwissLetterPartKind): number {
  return SWISS_LETTER_SPACE_BEFORE_LINES[kind] * lineHeightPx
}

/** The fields a Swiss letter prints, besides the sender details. */
export type SwissLetterFields = Pick<
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
  | 'annexes'
>

export interface SwissLetterOptions {
  /** The sender details as printed: `effectiveSenderDetails(letter, contact)`. */
  senderDetails: CoverLetterSenderDetails
  /** The date, formatted in `language` (`formatCoverLetterDate`). */
  date: string
  /** The letter's display language (`coverLetterLanguage`). */
  language: CoverLetterLanguage
}

/** A plain-text field with something other than whitespace in it. */
function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

const LEADING_POSTCODE = /^\d{4}(?:\s+|$)/

/**
 * FR-3: the place of the place-and-date line, from the sender's postcode and
 * locality: a leading four-digit postcode (NPA) and the space after it are
 * removed ("1003 Lausanne" → "Lausanne"). `null` when nothing remains.
 */
export function swissLetterPlace(postalLocality: string | null | undefined): string | null {
  if (!hasText(postalLocality)) return null
  const place = postalLocality.trim().replace(LEADING_POSTCODE, '').trim()
  return place === '' ? null : place
}

/**
 * The parts of a Swiss letter, top to bottom: sender block; recipient block
 * (in the window zone); place-and-date line; subject; greeting; opening; each
 * body paragraph; closing; sign-off; signature (the sender's name, below the
 * signature space); Annexes block.
 *
 * What the user wrote is printed as written. A sender or recipient line is
 * left out when it has no text (whitespace only counts as none); the sender
 * and recipient blocks are left out when none of their lines is left. The
 * subject exists with a job title; an empty body paragraph is left out. The
 * greeting and sign-off fall back to the language's defaults. The annexes:
 * `null` (never set) prints the default list in the letter's language, the
 * empty string (cleared on purpose) prints no Annexes block, and any other
 * value is printed as stored.
 */
export function swissLetterParts(letter: SwissLetterFields, options: SwissLetterOptions): SwissLetterPart[] {
  const { senderDetails, date, language } = options
  const wording = COVER_LETTER_WORDING[language]
  const parts: SwissLetterPart[] = []

  const senderLines = [
    letter.sender_name,
    senderDetails.sender_street,
    senderDetails.sender_postal_locality,
    senderDetails.sender_phone,
    senderDetails.sender_email,
  ].filter(hasText)
  if (senderLines.length > 0) parts.push({ kind: 'sender', lines: senderLines })

  const recipientLines = [
    { text: letter.recipient_name, multiline: false },
    { text: letter.recipient_title, multiline: false },
    { text: letter.company_name, multiline: false },
    { text: letter.company_address, multiline: true },
  ].filter((line): line is CoverLetterRecipientLine => hasText(line.text))
  if (recipientLines.length > 0) parts.push({ kind: 'recipient', lines: recipientLines })

  parts.push({
    kind: 'placeDate',
    text: wording.placeDate(swissLetterPlace(senderDetails.sender_postal_locality), date),
  })

  if (letter.job_title) parts.push({ kind: 'subject', text: wording.subject(letter.job_title) })
  parts.push({ kind: 'greeting', text: letter.greeting || wording.defaultGreeting })

  if (letter.opening_paragraph) parts.push({ kind: 'opening', html: letter.opening_paragraph })
  for (const paragraph of coverLetterBodyParagraphs(letter.body_paragraphs)) {
    if (paragraph.trim() !== '') parts.push({ kind: 'body', html: paragraph })
  }
  if (letter.closing_paragraph) parts.push({ kind: 'closing', html: letter.closing_paragraph })

  parts.push({ kind: 'signOff', text: letter.sign_off || wording.defaultSignOff })
  if (hasText(letter.sender_name)) parts.push({ kind: 'signature', text: letter.sender_name })

  // `normalizeAnnexes` only classifies the stored value (whitespace only reads
  // as never set, as the editor stores it); a list is printed as stored.
  const storedAnnexes = letter.annexes ?? null
  if (storedAnnexes === null || normalizeAnnexes(storedAnnexes) === null) {
    parts.push({ kind: 'annexes', label: wording.annexesLabel, text: wording.defaultAnnexes })
  } else if (storedAnnexes !== COVER_LETTER_NO_ANNEXES) {
    parts.push({ kind: 'annexes', label: wording.annexesLabel, text: storedAnnexes })
  }

  return parts
}
