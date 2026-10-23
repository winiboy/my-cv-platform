import { describe, expect, it } from 'vitest'
import { sanitizeUntrustedPlainText, sanitizeUntrustedRichText } from './untrusted-text'

const LIMIT = 10_000
/** The label ceiling the builder uses (`AI_TEXT_LIMITS.SHORT_LABEL`). */
const AI_LABEL = 200

describe('sanitizeUntrustedRichText', () => {
  it('keeps the allowed formatting tags', () => {
    expect(sanitizeUntrustedRichText('<p>A <strong>bold</strong> and <em>soft</em> <u>line</u></p>', LIMIT)).toBe(
      '<p>A <strong>bold</strong> and <em>soft</em> <u>line</u></p>'
    )
    expect(sanitizeUntrustedRichText('<ul><li>One</li><li>Two</li></ul><ol><li>Three</li></ol>', LIMIT)).toBe(
      '<ul><li>One</li><li>Two</li></ul><ol><li>Three</li></ol>'
    )
  })

  it('normalizes b and i to strong and em, and br to a void tag', () => {
    expect(sanitizeUntrustedRichText('<p><b>x</b><i>y</i><br/>z<br></p>', LIMIT)).toBe(
      '<p><strong>x</strong><em>y</em><br>z<br></p>'
    )
  })

  it('removes scripts, event handlers and dangerous URLs', () => {
    const payload =
      '<p onclick="alert(1)">ok<img src=x onerror="alert(2)"><script>alert(3)</script>' +
      '<a href="javascript:alert(4)">link</a><style>p{}</style><iframe src="//x"></iframe></p>'
    const html = sanitizeUntrustedRichText(payload, LIMIT)

    expect(html).toBe('<p>oklink</p>')
    expect(html).not.toMatch(/onerror|onclick|script|javascript|alert|<img|<a|<iframe|<style/i)
  })

  it('drops every attribute of an allowed tag', () => {
    expect(sanitizeUntrustedRichText('<p style="color:red" class="x" data-y="1">t</p>', LIMIT)).toBe('<p>t</p>')
  })

  it('cannot be tricked into emitting markup by a quoted > or an unterminated tag', () => {
    const quoted = sanitizeUntrustedRichText('<p title=">"><img src=x onerror=alert(1)//</p>', LIMIT)
    // Whatever text survives is escaped: no tag but the ones this module writes.
    expect(quoted.replace(/<\/?(p|br|strong|em|u|ul|ol|li)>/g, '')).not.toMatch(/[<>]/)

    // An unclosed tag runs to the end of the input and is dropped, as a browser does.
    const unterminated = sanitizeUntrustedRichText('<p>text <img src=x onerror=alert(1)', LIMIT)
    expect(unterminated).toBe('<p>text </p>')
  })

  it('treats a tag name with odd characters as unknown, not as an allowed tag', () => {
    expect(sanitizeUntrustedRichText('<p_x onclick=1>t</p_x>', LIMIT)).toBe('t')
  })

  it('removes comments, doctypes and processing instructions', () => {
    expect(sanitizeUntrustedRichText('<!DOCTYPE html><!-- <script>x</script> --><?xml x?><p>t</p>', LIMIT)).toBe(
      '<p>t</p>'
    )
  })

  it('closes tags left open and ignores stray closing tags', () => {
    expect(sanitizeUntrustedRichText('<ul><li>one<li>two', LIMIT)).toBe('<ul><li>one<li>two</li></li></ul>')
    expect(sanitizeUntrustedRichText('</em><p>t</p></strong>', LIMIT)).toBe('<p>t</p>')
  })

  it('escapes stray characters but keeps well-formed entities', () => {
    expect(sanitizeUntrustedRichText('<p>R&amp;D & 5 < 6 "q"</p>', LIMIT)).toBe(
      '<p>R&amp;D &amp; 5 &lt; 6 &quot;q&quot;</p>'
    )
  })

  it('turns plain text into escaped paragraphs', () => {
    expect(sanitizeUntrustedRichText('First line\nsecond line\n\nNext: 5 < 6 > 4 & co', LIMIT)).toBe(
      '<p>First line<br>second line</p><p>Next: 5 &lt; 6 &gt; 4 &amp; co</p>'
    )
  })

  it('returns an empty string for missing, non-string or invisible input', () => {
    expect(sanitizeUntrustedRichText(undefined, LIMIT)).toBe('')
    expect(sanitizeUntrustedRichText(42, LIMIT)).toBe('')
    expect(sanitizeUntrustedRichText('   ', LIMIT)).toBe('')
    expect(sanitizeUntrustedRichText('<p> </p><script>x</script>', LIMIT)).toBe('')
    expect(sanitizeUntrustedRichText('<p>&nbsp;</p>', LIMIT)).toBe('')
  })

  it('cuts the input to the limit before sanitizing', () => {
    const html = sanitizeUntrustedRichText(`<p>${'a'.repeat(50)}</p>`, 10)
    expect(html).toBe('<p>aaaaaaa</p>')
  })
})

describe('sanitizeUntrustedPlainText', () => {
  it('strips markup, drops script content and collapses whitespace', () => {
    expect(sanitizeUntrustedPlainText('  <b>Senior</b>\n <script>alert(1)</script>Engineer  ', 200)).toBe(
      'Senior Engineer'
    )
  })

  it('separates words joined only by block tags', () => {
    expect(sanitizeUntrustedPlainText('<li>One</li><li>Two</li>', 200)).toBe('One Two')
  })

  it('decodes entities and removes any angle bracket left', () => {
    expect(sanitizeUntrustedPlainText('R&amp;D &lt;team&gt; &#233;t&#xE9;', 200)).toBe('R&D team été')
  })

  it('cuts to the limit after stripping', () => {
    expect(sanitizeUntrustedPlainText('<strong>abcdefghij</strong>', 4)).toBe('abcd')
  })

  it('returns an empty string for non-string input', () => {
    expect(sanitizeUntrustedPlainText(null, 200)).toBe('')
    expect(sanitizeUntrustedPlainText(['x'], 200)).toBe('')
  })
})

describe('adversarial input', () => {
  const SIZE = 256 * 1024
  /** Runs that made a backtracking pattern, a per-match slice or a stack search quadratic. */
  const RUNS = ['<a', '</a', '<a ', '<!--', '<!', '<?', '&', '&#1', '<p>', '</b>', '<script>', '\n \n', 'a<']

  describe.each(RUNS)('a 256k-character run of %j', (run) => {
    const input = run.repeat(Math.ceil(SIZE / run.length)).slice(0, SIZE)

    it('is sanitized as plain text in linear time and within the limit', () => {
      const started = performance.now()
      const text = sanitizeUntrustedPlainText(input, AI_LABEL)
      expect(performance.now() - started).toBeLessThan(100)
      expect(text.length).toBeLessThanOrEqual(AI_LABEL)
    })

    it('is sanitized as rich text in linear time', () => {
      const started = performance.now()
      const html = sanitizeUntrustedRichText(input, SIZE)
      expect(performance.now() - started).toBeLessThan(100)
      expect(html.replace(/<\/?(p|br|strong|em|u|ul|ol|li)>/g, '')).not.toMatch(/[<>]/)
    })
  })

  it('a deep stack of open tags with stray closes stays fast', () => {
    const input = '<p>'.repeat(40_000) + '</em>'.repeat(40_000)
    const started = performance.now()
    sanitizeUntrustedRichText(input, input.length)
    expect(performance.now() - started).toBeLessThan(100)
  })
})

describe('storable output', () => {
  const CONTROLS = '\u0000\u0001\u0008\u000B\u000C\u000E\u001F'

  it('removes NUL and other C0 controls but keeps tab, line feed and carriage return', () => {
    expect(sanitizeUntrustedPlainText(`a${CONTROLS}b`, 200)).toBe('ab')
    expect(sanitizeUntrustedRichText(`<p>a${CONTROLS}b</p>`, LIMIT)).toBe('<p>ab</p>')
    expect(sanitizeUntrustedRichText('a\tb\r\nc', LIMIT)).toBe('<p>a\tb<br>c</p>')
  })

  it('removes controls produced by decoding an entity', () => {
    expect(sanitizeUntrustedPlainText('a&#1;b&#x1F;c&#0;', 200)).toBe('abc&#0;')
  })

  it('removes unpaired surrogates and keeps valid pairs', () => {
    expect(sanitizeUntrustedPlainText('a\uD800b\uDC00c😀', 200)).toBe('abc😀')
    expect(sanitizeUntrustedRichText('<p>a\uDBFFb\uDFFF😀</p>', LIMIT)).toBe('<p>ab😀</p>')
  })

  it('never cuts a surrogate pair in half', () => {
    // '😀' is two UTF-16 units; a limit landing between them drops the whole character.
    expect(sanitizeUntrustedPlainText('ab😀', 3)).toBe('ab')
    expect(sanitizeUntrustedPlainText('ab😀', 4)).toBe('ab😀')
    expect(sanitizeUntrustedRichText('ab😀', 3)).toBe('<p>ab</p>')
  })
})
