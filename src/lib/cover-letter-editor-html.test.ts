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

/** Removes the only tags the helper is allowed to emit. */
function stripParagraphTags(html: string): string {
  return html.replace(/<\/?p>/g, '')
}

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

  it('wraps each benign paragraph in <p> exactly as before', () => {
    const text = 'Dear Hiring Manager,\n\nI am applying for the role.\n\nKind regards,\nJane Doe'
    expect(plainTextToEditorHtml(text)).toBe(
      '<p>Dear Hiring Manager,</p><p>I am applying for the role.</p><p>Kind regards,\nJane Doe</p>'
    )
  })

  it('treats multiple blank lines as one separator and drops whitespace-only paragraphs', () => {
    const text = '  First  \n\n\n\nSecond\n\n   \n\n\t\n\nThird'
    expect(plainTextToEditorHtml(text)).toBe('<p>First</p><p>Second</p><p>Third</p>')
  })

  it('emits a single newline verbatim rather than as markup', () => {
    // `white-space: pre-line` renders this newline as a line break while
    // `textContent` still reads it back, which a <br> would not.
    expect(plainTextToEditorHtml('Line one\nLine two')).toBe('<p>Line one\nLine two</p>')
  })

  it('returns an empty string for empty or blank input', () => {
    expect(plainTextToEditorHtml('')).toBe('')
    expect(plainTextToEditorHtml('\n\n   \n\n')).toBe('')
  })

  it('escapes ampersands', () => {
    expect(plainTextToEditorHtml('Smith & Sons')).toBe('<p>Smith &amp; Sons</p>')
  })

  it('escapes an ampersand once, so the text is not double-encoded', () => {
    // Escaping `<` before `&` would turn this into `&amp;lt;`, which renders as
    // the literal text "&lt;" instead of "<".
    expect(plainTextToEditorHtml('&lt;b&gt;')).toBe('<p>&amp;lt;b&amp;gt;</p>')
  })

  it('escapes quotes and apostrophes, which are ordinary letter text', () => {
    expect(plainTextToEditorHtml('I\'m "keen" to join.')).toBe(
      '<p>I&#39;m &quot;keen&quot; to join.</p>'
    )
  })

  describe('untrusted markup', () => {
    it('escapes an <img onerror> payload', () => {
      const html = plainTextToEditorHtml('<img src=x onerror=alert(1)>')
      expect(html).not.toContain('<img')
      expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
    })

    it('escapes a <script> payload', () => {
      const html = plainTextToEditorHtml('<script>alert(1)</script>')
      expect(html).not.toContain('<script')
      expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    })

    it('escapes a <script> payload that follows a line break inside a paragraph', () => {
      const html = plainTextToEditorHtml('Regards,\n<script>alert(1)</script>')

      expect(html).toBe('<p>Regards,\n&lt;script&gt;alert(1)&lt;/script&gt;</p>')
      expect(html).not.toContain('<script')
    })

    it('emits only <p> tags when a payload spans paragraph breaks', () => {
      const html = plainTextToEditorHtml(
        'Hello <b\n\nonmouseover="alert(1)">\n\n</p><img src=x onerror=alert(1)><p>'
      )
      expect(stripParagraphTags(html)).not.toContain('<')
      expect(html).toBe(
        '<p>Hello &lt;b</p><p>onmouseover=&quot;alert(1)&quot;&gt;</p><p>&lt;/p&gt;&lt;img src=x onerror=alert(1)&gt;&lt;p&gt;</p>'
      )
    })
  })
})
