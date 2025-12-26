/**
 * Utility functions for formatting text in CV templates
 * Preserves line breaks, bullet points, and numbered lists
 */

import React from 'react'

/**
 * Formats text content for CV display, preserving structure
 * - Converts line breaks to <br /> tags
 * - Converts bullet points (•, -, *) to HTML lists
 * - Converts numbered lists to HTML ordered lists
 */
export function formatText(text: string | null | undefined): React.ReactNode {
  if (!text) return null

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
        <ul key={pIndex} className="list-disc space-y-1 pl-5 text-justify">
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
        <ol key={pIndex} className="list-decimal space-y-1 pl-5 text-justify">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      )
    }

    // Regular paragraph with line breaks
    return (
      <div key={pIndex} className="text-justify">
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
