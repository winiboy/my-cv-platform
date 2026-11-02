'use client'

import { useMemo } from 'react'
import type { CoverLetter } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { SanitizedHtml } from '@/components/sanitized-html'
import { formatCoverLetterDate } from '@/lib/cover-letter-language'
import { coverLetterLanguage, coverLetterParts, type CoverLetterPart } from '@/lib/cover-letter-pdf-html'

interface ModernLetterTemplateProps {
  coverLetter: CoverLetter
  senderName?: string
  /** The page's locale: the letter's language when its text cannot tell. */
  locale: Locale
}

type TextPartKind = 'date' | 'subject' | 'greeting' | 'signOff'

/** The text of the letter's `kind` part, or `undefined` when the letter has none. */
function partText(parts: readonly CoverLetterPart[], kind: TextPartKind): string | undefined {
  for (const part of parts) {
    if (part.kind === kind && 'text' in part) return part.text
  }
  return undefined
}

export function ModernLetterTemplate({ coverLetter, senderName, locale }: ModernLetterTemplateProps) {
  const bodyParagraphs = Array.isArray(coverLetter.body_paragraphs)
    ? coverLetter.body_paragraphs as string[]
    : []

  // The date, subject, greeting and sign-off are read from the parts the PDF
  // and Word exports print, in the language they resolve, so the preview
  // cannot show other wording than the files. Only the language detection is
  // memoized, on the paragraphs and the page; the date is formatted on each
  // render, so a preview left open past midnight is dated like the PDF.
  const { opening_paragraph, body_paragraphs, closing_paragraph } = coverLetter
  const language = useMemo(
    () => coverLetterLanguage({ opening_paragraph, body_paragraphs, closing_paragraph }, locale),
    [opening_paragraph, body_paragraphs, closing_paragraph, locale],
  )
  const parts = coverLetterParts(coverLetter, formatCoverLetterDate(new Date(), language), language)
  const subject = partText(parts, 'subject')

  return (
    <div className="w-[816px] min-h-[1056px] bg-white p-16 font-serif text-[14px] leading-relaxed text-gray-800">
      {/* Header with sender info */}
      <div className="mb-8">
        {senderName && (
          <div className="text-xl font-semibold text-gray-900 mb-1">
            {senderName}
          </div>
        )}
      </div>

      {/* Date */}
      <div className="mb-6 text-gray-600">
        {partText(parts, 'date')}
      </div>

      {/* Recipient info */}
      {(coverLetter.recipient_name || coverLetter.company_name) && (
        <div className="mb-6">
          {coverLetter.recipient_name && (
            <div>{coverLetter.recipient_name}</div>
          )}
          {coverLetter.recipient_title && (
            <div>{coverLetter.recipient_title}</div>
          )}
          {coverLetter.company_name && (
            <div>{coverLetter.company_name}</div>
          )}
          {coverLetter.company_address && (
            <div className="whitespace-pre-line">{coverLetter.company_address}</div>
          )}
        </div>
      )}

      {/* Job reference */}
      {subject && (
        <div className="mb-6">
          <strong>{subject}</strong>
        </div>
      )}

      {/* Greeting */}
      <div className="mb-4">
        {partText(parts, 'greeting')}
      </div>

      {/* Opening paragraph */}
      {coverLetter.opening_paragraph && (
        <SanitizedHtml className="mb-4 text-justify" html={coverLetter.opening_paragraph} />
      )}

      {/* Body paragraphs */}
      {bodyParagraphs.map((paragraph, index) => (
        <SanitizedHtml key={index} className="mb-4 text-justify" html={paragraph} />
      ))}

      {/* Closing paragraph */}
      {coverLetter.closing_paragraph && (
        <SanitizedHtml className="mb-6 text-justify" html={coverLetter.closing_paragraph} />
      )}

      {/* Sign-off */}
      <div className="mt-8">
        <div className="mb-8">{partText(parts, 'signOff')}</div>
        {(coverLetter.sender_name || senderName) && (
          <div className="font-semibold">
            {coverLetter.sender_name || senderName}
          </div>
        )}
      </div>
    </div>
  )
}
