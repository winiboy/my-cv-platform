'use client'

import type { CoverLetter } from '@/types/database'
import { sanitizeHtml } from '@/lib/html-utils'

interface ModernLetterTemplateProps {
  coverLetter: CoverLetter
  senderName?: string
}

export function ModernLetterTemplate({ coverLetter, senderName }: ModernLetterTemplateProps) {
  const bodyParagraphs = Array.isArray(coverLetter.body_paragraphs)
    ? coverLetter.body_paragraphs as string[]
    : []

  // Format date
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

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
        {currentDate}
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
      {coverLetter.job_title && (
        <div className="mb-6">
          <strong>Re: Application for {coverLetter.job_title}</strong>
        </div>
      )}

      {/* Greeting */}
      <div className="mb-4">
        {coverLetter.greeting || 'Dear Hiring Manager,'}
      </div>

      {/* Opening paragraph */}
      {coverLetter.opening_paragraph && (
        <div
          className="mb-4 text-justify"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(coverLetter.opening_paragraph) }}
        />
      )}

      {/* Body paragraphs */}
      {bodyParagraphs.map((paragraph, index) => (
        <div
          key={index}
          className="mb-4 text-justify"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(paragraph) }}
        />
      ))}

      {/* Closing paragraph */}
      {coverLetter.closing_paragraph && (
        <div
          className="mb-6 text-justify"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(coverLetter.closing_paragraph) }}
        />
      )}

      {/* Sign-off */}
      <div className="mt-8">
        <div className="mb-8">{coverLetter.sign_off || 'Sincerely,'}</div>
        {(coverLetter.sender_name || senderName) && (
          <div className="font-semibold">
            {coverLetter.sender_name || senderName}
          </div>
        )}
      </div>
    </div>
  )
}
