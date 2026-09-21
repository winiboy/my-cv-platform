import { describe, expect, it } from 'vitest'
import { plainTextToEditorHtml } from './cover-letter-editor-html'

/** Removes the only tags the helper is allowed to emit. */
function stripParagraphTags(html: string): string {
  return html.replace(/<\/?p>/g, '')
}

describe('plainTextToEditorHtml', () => {
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

  it('returns an empty string for empty or blank input', () => {
    expect(plainTextToEditorHtml('')).toBe('')
    expect(plainTextToEditorHtml('\n\n   \n\n')).toBe('')
  })

  it('keeps single newlines inside a paragraph', () => {
    expect(plainTextToEditorHtml('Line one\nLine two')).toBe('<p>Line one\nLine two</p>')
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
