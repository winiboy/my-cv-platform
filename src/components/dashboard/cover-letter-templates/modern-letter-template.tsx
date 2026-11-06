'use client'

import { useMemo, type CSSProperties } from 'react'
import type { CoverLetter } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { SanitizedHtml } from '@/components/sanitized-html'
import { formatCoverLetterDate } from '@/lib/cover-letter-language'
import { coverLetterLanguage } from '@/lib/cover-letter-pdf-html'
import type { CoverLetterSenderDetails } from '@/lib/cover-letter-sender'
import {
  SWISS_LETTER_FONT_FAMILY,
  SWISS_LETTER_LAYOUT_PX,
  swissLetterParts,
  swissLetterSpaceBeforePx,
  type SwissLetterPart,
} from '@/lib/cover-letter-swiss-letter'

interface ModernLetterTemplateProps {
  coverLetter: CoverLetter
  /** The sender details as printed: `effectiveSenderDetails(letter, linked CV contact)`. */
  senderDetails: CoverLetterSenderDetails
  /** The page's locale: the letter's language when its text cannot tell. */
  locale: Locale
}

const layout = SWISS_LETTER_LAYOUT_PX

const PAGE_STYLE: CSSProperties = {
  width: layout.page.width,
  minHeight: layout.page.height,
  padding: `${layout.padding.top}px ${layout.padding.right}px ${layout.padding.bottom}px ${layout.padding.left}px`,
  fontFamily: SWISS_LETTER_FONT_FAMILY,
  fontSize: layout.fontSize,
  lineHeight: `${layout.lineHeight}px`,
}

/**
 * The sender block and the window zone share one grid cell, so the
 * place-and-date line starts below whichever ends lower: the window zone
 * (`window.top + window.height`), or a recipient block longer than it.
 */
const HEADER_STYLE: CSSProperties = { display: 'grid', minHeight: layout.window.top + layout.window.height }

const SENDER_STYLE: CSSProperties = { gridArea: '1 / 1', alignSelf: 'start', width: layout.senderWidth }

const RECIPIENT_STYLE: CSSProperties = {
  gridArea: '1 / 1',
  alignSelf: 'start',
  marginTop: layout.window.top,
  marginLeft: layout.window.left,
  width: layout.window.width,
}

type FlowPart = Exclude<SwissLetterPart, { kind: 'sender' | 'recipient' }>

function FlowPartView({ part }: { part: FlowPart }) {
  const style: CSSProperties = { marginTop: swissLetterSpaceBeforePx(part.kind) }
  switch (part.kind) {
    case 'opening':
    case 'body':
    case 'closing':
      return (
        <div data-letter-part={part.kind} style={style}>
          <SanitizedHtml className="text-left" html={part.html} />
        </div>
      )
    case 'annexes':
      return (
        <div data-letter-part="annexes" style={style}>
          <div>{part.label}</div>
          <div className="whitespace-pre-line">{part.text}</div>
        </div>
      )
    case 'subject':
      return (
        <div data-letter-part="subject" style={style}>
          <strong>{part.text}</strong>
        </div>
      )
    default:
      return (
        <div data-letter-part={part.kind} style={style}>
          {part.text}
        </div>
      )
  }
}

/**
 * The editor preview's letter: an A4 page drawn from the Swiss letter's
 * canonical description (`swissLetterParts`, `SWISS_LETTER_LAYOUT_PX`), the
 * one the PDF and Word exports print, in the letter's language.
 */
export function ModernLetterTemplate({ coverLetter, senderDetails, locale }: ModernLetterTemplateProps) {
  // Only the language detection is memoized, on the paragraphs and the page;
  // the date is formatted on each render, so a preview left open past
  // midnight is dated like the PDF.
  const { opening_paragraph, body_paragraphs, closing_paragraph } = coverLetter
  const language = useMemo(
    () => coverLetterLanguage({ opening_paragraph, body_paragraphs, closing_paragraph }, locale),
    [opening_paragraph, body_paragraphs, closing_paragraph, locale],
  )
  const parts = swissLetterParts(coverLetter, {
    senderDetails,
    date: formatCoverLetterDate(new Date(), language),
    language,
  })

  let sender: Extract<SwissLetterPart, { kind: 'sender' }> | undefined
  let recipient: Extract<SwissLetterPart, { kind: 'recipient' }> | undefined
  const flow: FlowPart[] = []
  for (const part of parts) {
    if (part.kind === 'sender') sender = part
    else if (part.kind === 'recipient') recipient = part
    else flow.push(part)
  }

  return (
    <div className="bg-white text-left text-gray-800" style={PAGE_STYLE}>
      <div style={HEADER_STYLE}>
        {sender && (
          <div data-letter-part="sender" className="break-words" style={SENDER_STYLE}>
            {sender.lines.map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        )}
        {recipient && (
          <div data-letter-part="recipient" className="break-words" style={RECIPIENT_STYLE}>
            {recipient.lines.map((line, index) => (
              <div key={index} className={line.multiline ? 'whitespace-pre-line' : undefined}>
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {flow.map((part, index) => (
        <FlowPartView key={`${part.kind}-${index}`} part={part} />
      ))}
    </div>
  )
}
