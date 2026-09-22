import { createElement, Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { formatText, renderFormattedText } from './format-text'

/**
 * `sanitizeHtml` parses through `document`, which this suite's node
 * environment does not provide. It is replaced by a pass-through, so the HTML
 * cases below cover what `renderFormattedText` does with sanitized output
 * (wrapper, no alignment override), not the sanitizer's own attribute
 * filtering.
 */
vi.mock('./html-utils', () => ({
  sanitizeHtml: (html: string) => html,
  migrateTextToHtml: (text: string) => text,
}))

function render(node: ReactNode): string {
  return renderToStaticMarkup(createElement(Fragment, null, node))
}

const PARAGRAPH = 'First line\nSecond line'
const BULLETS = '- One\n- Two'
const NUMBERED = '1. One\n2. Two'

describe('formatText', () => {
  it('justifies a paragraph, a bullet list and a numbered list by default', () => {
    expect(render(formatText(PARAGRAPH))).toBe(
      '<div class="text-justify">First line<br/>Second line</div>'
    )
    expect(render(formatText(BULLETS))).toBe(
      '<ul class="list-disc space-y-1 pl-5 text-justify"><li>One</li><li>Two</li></ul>'
    )
    expect(render(formatText(NUMBERED))).toBe(
      '<ol class="list-decimal space-y-1 pl-5 text-justify"><li>One</li><li>Two</li></ol>'
    )
  })

  it('renders the same markup for an explicit justify: true as for the default', () => {
    for (const text of [PARAGRAPH, BULLETS, NUMBERED]) {
      expect(render(formatText(text, { justify: true }))).toBe(render(formatText(text)))
    }
  })

  it('omits text-justify with justify: false and keeps the other classes', () => {
    expect(render(formatText(PARAGRAPH, { justify: false }))).toBe(
      '<div>First line<br/>Second line</div>'
    )
    expect(render(formatText(BULLETS, { justify: false }))).toBe(
      '<ul class="list-disc space-y-1 pl-5"><li>One</li><li>Two</li></ul>'
    )
    expect(render(formatText(NUMBERED, { justify: false }))).toBe(
      '<ol class="list-decimal space-y-1 pl-5"><li>One</li><li>Two</li></ol>'
    )
  })

  it('returns null for empty input regardless of the option', () => {
    expect(formatText('', { justify: false })).toBeNull()
    expect(formatText(null)).toBeNull()
  })
})

describe('renderFormattedText', () => {
  it('passes the option through to formatText for plain text', () => {
    for (const text of [PARAGRAPH, BULLETS, NUMBERED]) {
      expect(render(renderFormattedText(text))).toBe(render(formatText(text)))
      expect(render(renderFormattedText(text, { justify: false }))).toBe(
        render(formatText(text, { justify: false }))
      )
    }
    expect(render(renderFormattedText(BULLETS))).toContain('text-justify')
    expect(render(renderFormattedText(BULLETS, { justify: false }))).not.toContain('text-justify')
  })

  it('renders HTML into .formatted-content unaffected by the option, keeping inline text-align', () => {
    const html = '<p style="text-align: justify;">Led the team</p>'
    const expected = `<div class="formatted-content">${html}</div>`

    expect(render(renderFormattedText(html))).toBe(expected)
    expect(render(renderFormattedText(html, { justify: true }))).toBe(expected)
    expect(render(renderFormattedText(html, { justify: false }))).toBe(expected)
  })
})
