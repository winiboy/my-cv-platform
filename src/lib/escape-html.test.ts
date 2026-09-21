import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape-html'

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected)
  })

  it('escapes & before the other characters so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
    expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;')
  })

  it('escapes an existing entity again instead of assuming it is already encoded', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })

  it('returns an empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('leaves plain text unchanged', () => {
    const text = 'Dear Hiring Manager,\nI am applying for the role.'
    expect(escapeHtml(text)).toBe(text)
    expect(escapeHtml('')).toBe('')
  })
})
