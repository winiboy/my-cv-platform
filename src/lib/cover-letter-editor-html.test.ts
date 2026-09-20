import { describe, expect, it } from 'vitest'
import {
  joinEditorParagraphs,
  plainTextToEditorHtml,
  splitPlainTextIntoParagraphs,
} from './cover-letter-editor-html'

/**
 * A letter in the canonical form the generator produces: blank lines between
 * paragraphs, and a single newline where an address block breaks a line inside
 * one paragraph.
 */
const LETTER = 'Dear Hiring Manager,\nAcme GmbH\n\nI am applying for the role.\n\nSincerely,\nAda'

describe('splitPlainTextIntoParagraphs', () => {
  it('splits on a blank line', () => {
    expect(splitPlainTextIntoParagraphs('First.\n\nSecond.')).toEqual(['First.', 'Second.'])
  })

  it('treats a run of blank lines as one separator', () => {
    expect(splitPlainTextIntoParagraphs('First.\n\n\n\nSecond.')).toEqual(['First.', 'Second.'])
  })

  it('keeps a single newline inside the paragraph it belongs to', () => {
    expect(splitPlainTextIntoParagraphs('Line one\nLine two\n\nNext.')).toEqual([
      'Line one\nLine two',
      'Next.',
    ])
  })

  it('drops whitespace-only paragraphs', () => {
    expect(splitPlainTextIntoParagraphs('First.\n\n   \n\nSecond.')).toEqual(['First.', 'Second.'])
  })

  it('returns nothing for empty text', () => {
    expect(splitPlainTextIntoParagraphs('')).toEqual([])
  })
})

describe('joinEditorParagraphs', () => {
  it('separates paragraphs with a blank line', () => {
    expect(joinEditorParagraphs(['First.', 'Second.'], '')).toBe('First.\n\nSecond.')
  })

  it('preserves a line break inside a paragraph', () => {
    expect(joinEditorParagraphs(['Line one\nLine two'], '')).toBe('Line one\nLine two')
  })

  it('drops empty paragraphs the editor leaves behind', () => {
    expect(joinEditorParagraphs(['First.', '', '  ', 'Second.'], '')).toBe('First.\n\nSecond.')
  })

  it('falls back to the raw text when the editor holds no paragraph', () => {
    expect(joinEditorParagraphs([], 'typed straight in')).toBe('typed straight in')
  })
})

describe('text -> paragraphs -> text round trip', () => {
  it('returns the letter unchanged, single newlines included', () => {
    expect(joinEditorParagraphs(splitPlainTextIntoParagraphs(LETTER), '')).toBe(LETTER)
  })

  it('is stable when applied twice', () => {
    const once = joinEditorParagraphs(splitPlainTextIntoParagraphs(LETTER), '')
    expect(joinEditorParagraphs(splitPlainTextIntoParagraphs(once), '')).toBe(LETTER)
  })
})

describe('plainTextToEditorHtml', () => {
  it('wraps each paragraph in its own element', () => {
    expect(plainTextToEditorHtml('First.\n\nSecond.')).toBe('<p>First.</p><p>Second.</p>')
  })

  it('emits a single newline verbatim rather than as markup', () => {
    // `white-space: pre-line` renders this newline as a line break while
    // `textContent` still reads it back, which a <br> would not.
    expect(plainTextToEditorHtml('Line one\nLine two')).toBe('<p>Line one\nLine two</p>')
  })

  it('produces nothing for empty text', () => {
    expect(plainTextToEditorHtml('')).toBe('')
  })

  it('escapes an injected image tag instead of emitting live markup', () => {
    const html = plainTextToEditorHtml('<img src=x onerror=alert(1)>')

    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
    expect(html).not.toContain('<img')
  })

  it('escapes an injected script tag instead of emitting live markup', () => {
    const html = plainTextToEditorHtml('Regards,\n<script>alert(1)</script>')

    expect(html).toBe('<p>Regards,\n&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(html).not.toContain('<script')
  })

  it('escapes ampersands', () => {
    expect(plainTextToEditorHtml('Smith & Sons')).toBe('<p>Smith &amp; Sons</p>')
  })

  it('escapes an ampersand once, so the text is not double-encoded', () => {
    // Escaping `<` before `&` would turn this into `&amp;lt;`, which renders as
    // the literal text "&lt;" instead of "<".
    expect(plainTextToEditorHtml('&lt;b&gt;')).toBe('<p>&amp;lt;b&amp;gt;</p>')
  })
})
