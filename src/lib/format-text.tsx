/**
 * Utility functions for formatting text in CV templates
 * Preserves line breaks, bullet points, and numbered lists
 * Supports both plain text and HTML formatted content
 */

import React from 'react'
import { SanitizedHtml } from '@/components/sanitized-html'
import { rendersAsFormattedContent } from '@/lib/resume-line-height'

export interface FormatTextOptions {
  /**
   * Justify plain-text blocks. Defaults to `true`. Narrow columns (e.g. a
   * sidebar) opt out because justification stretches short wrapped lines
   * with large word gaps.
   */
  justify?: boolean
}

/**
 * Formats text content for CV display, preserving structure
 * - Converts line breaks to <br /> tags
 * - Converts bullet points (•, -, *) to HTML lists
 * - Converts numbered lists to HTML ordered lists
 * - Justifies every block unless `options.justify` is `false`
 */
export function formatText(
  text: string | null | undefined,
  { justify = true }: FormatTextOptions = {}
): React.ReactNode {
  if (!text) return null

  const justifyClass = justify ? ' text-justify' : ''

  // Split by double line breaks to identify paragraphs
  const paragraphs = text.split(/\n\n+/)

  return paragraphs.map((paragraph, pIndex) => {
    const lines = paragraph.split('\n')

    // Check if this paragraph is a bullet list
    const isBulletList = lines.some(line => /^[\s]*[•\-*]\s+/.test(line))

    // Check if this paragraph is a numbered list
    const isNumberedList = lines.some(line => /^[\s]*\d+\.\s+/.test(line))

    if (isBulletList) {
      // Render as bullet list
      const items = lines
        .filter(line => /^[\s]*[•\-*]\s+/.test(line))
        .map(line => line.replace(/^[\s]*[•\-*]\s+/, '').trim())

      return (
        <ul key={pIndex} className={`list-disc space-y-1 pl-5${justifyClass}`}>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )
    }

    if (isNumberedList) {
      // Render as numbered list
      const items = lines
        .filter(line => /^[\s]*\d+\.\s+/.test(line))
        .map(line => line.replace(/^[\s]*\d+\.\s+/, '').trim())

      return (
        <ol key={pIndex} className={`list-decimal space-y-1 pl-5${justifyClass}`}>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      )
    }

    // Regular paragraph with line breaks
    return (
      <div key={pIndex} className={justify ? 'text-justify' : undefined}>
        {lines.map((line, lIndex) => (
          <React.Fragment key={lIndex}>
            {line}
            {lIndex < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </div>
    )
  })
}

/**
 * Simple version: just preserves line breaks without parsing lists
 * Use this for simpler text that doesn't need list parsing
 */
export function formatSimpleText(text: string | null | undefined): React.ReactNode {
  if (!text) return null

  return text.split('\n').map((line, index, array) => (
    <React.Fragment key={index}>
      {line}
      {index < array.length - 1 && <br />}
    </React.Fragment>
  ))
}

/**
 * Renders formatted text - supports both HTML and plain text
 * This is the main function to use in templates for all text content
 * - For HTML content: sanitizes and renders HTML; `options` does not apply,
 *   so alignment set inline in the HTML is kept as authored
 * - For plain text: uses formatText() with `options` for backward compatibility
 */
export function renderFormattedText(
  text: string | null | undefined,
  options: FormatTextOptions = {}
): React.ReactNode {
  if (!text) return null

  // Check if content is HTML (contains tags). The DOCX generators decide which
  // line height the text draws at with the same test (US-004).
  if (!rendersAsFormattedContent(text)) {
    // Legacy plain text - use existing formatText logic
    return formatText(text, options)
  }

  // HTML content - sanitized in the browser, see SanitizedHtml
  return <SanitizedHtml className="formatted-content" html={text} />
}
