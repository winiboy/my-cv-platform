import { describe, expect, it } from 'vitest'
import { sanitizeRichHtml } from '@/lib/rich-html-sanitizer'
import {
  ALLOWED_TAGS,
  MAX_NESTING_DEPTH,
  RichTextTooLargeError,
  decodeHtmlEntities,
  richTextToBlocks,
  type RichBlock,
  type RichInline,
} from './rich-text-blocks'

/**
 * `richTextToBlocks`: a stored rich-text field as paragraphs, list items and
 * formatted runs, read with the editor sanitizer's allowlist and laid out as
 * the PDF lays it out (cover-letter-export-translate, US-002).
 */

/** A block's text, line breaks as "\n". */
const text = (block: RichBlock): string =>
  block.inlines.map((inline) => (inline.type === 'break' ? '\n' : inline.text)).join('')

const texts = (html: string): string[] => richTextToBlocks(html).map(text)

const runs = (html: string): Extract<RichInline, { type: 'text' }>[] =>
  richTextToBlocks(html).flatMap((block) => block.inlines.filter((inline) => inline.type === 'text'))

describe('paragraphs', () => {
  it('makes each p and div a paragraph of its own', () => {
    expect(texts('<p>One</p><p>Two</p><div>Three</div>')).toEqual(['One', 'Two', 'Three'])
  })

  it("reads the editor's div-per-line markup as lines, and an empty line as an empty paragraph", () => {
    const blocks = richTextToBlocks('<div>First</div><div><br></div><div>Third</div>')
    expect(blocks.map(text)).toEqual(['First', '', 'Third'])
    expect(blocks.every((block) => block.type === 'paragraph')).toBe(true)
  })

  it('keeps a line break inside a paragraph, but not a trailing one', () => {
    expect(texts('<p>Line one<br>Line two<br></p>')).toEqual(['Line one\nLine two'])
  })

  it('reads text with no markup as one paragraph, its whitespace collapsed as the PDF shows it', () => {
    expect(texts('Plain   text\n\nstill one line')).toEqual(['Plain text still one line'])
  })

  it('collapses whitespace across runs and trims each line', () => {
    expect(texts('<p>  A <strong> bold </strong>  word  </p>')).toEqual(['A bold word'])
  })

  it('keeps a no-break space, which HTML does not collapse', () => {
    expect(texts('<p>A&nbsp;&nbsp;B</p>')).toEqual(['A  B'])
  })

  it('gives no block for a field with no visible text', () => {
    expect(richTextToBlocks('')).toEqual([])
    expect(richTextToBlocks('<p> </p><div></div>')).toEqual([])
  })

  it('reads text around blocks as paragraphs of their own, in order', () => {
    expect(texts('Before<p>Inside</p>After')).toEqual(['Before', 'Inside', 'After'])
  })

  it('closes an open p when a block starts, as the HTML parser does', () => {
    expect(texts('<p>One<p>Two')).toEqual(['One', 'Two'])
  })

  it('reads text-align on a paragraph', () => {
    const [centered, plain] = richTextToBlocks('<div style="text-align: center;">C</div><p>P</p>')
    expect(centered.alignment).toBe('center')
    expect(plain.alignment).toBeUndefined()
  })
})

describe('inline formatting', () => {
  it('keeps bold, italic and underline, nested or not', () => {
    const [plain, bold, both, italic, underline] = runs(
      '<p>a<strong>b<em>c</em></strong><i>d</i><u>e</u></p>',
    )
    expect(plain).toMatchObject({ text: 'a', format: { bold: false, italic: false, underline: false } })
    expect(bold).toMatchObject({ text: 'b', format: { bold: true, italic: false } })
    expect(both).toMatchObject({ text: 'c', format: { bold: true, italic: true } })
    expect(italic).toMatchObject({ text: 'd', format: { bold: false, italic: true } })
    expect(underline).toMatchObject({ text: 'e', format: { underline: true } })
  })

  it('reads <b> and <i> as the sanitizer does, as strong and em', () => {
    const [bold, italic] = runs('<b>B</b><i>I</i>')
    expect(bold.format.bold).toBe(true)
    expect(italic.format.italic).toBe(true)
  })

  it("reads the editor's inline font size and family", () => {
    const [sized, family, face] = runs(
      '<p><span style="font-size: 18px;">S</span><span style="font-family: &quot;Times New Roman&quot;, serif;">F</span><font face="Arial">A</font></p>',
    )
    expect(sized.format.fontSizePx).toBe(18)
    expect(family.format.fontFamily).toBe('Times New Roman')
    expect(face.format.fontFamily).toBe('Arial')
  })

  it('reads a size in pt as px, and ignores units it cannot place', () => {
    const [pt, em] = runs('<span style="font-size: 12pt">P</span><span style="font-size: 2em">E</span>')
    expect(pt.format.fontSizePx).toBe(16)
    expect(em.format.fontSizePx).toBeUndefined()
  })

  it('ignores a stray closing tag', () => {
    expect(runs('<p>a</strong>b</p>').map((run) => [run.text, run.format.bold])).toEqual([
      ['a', false],
      ['b', false],
    ])
  })
})

describe('lists', () => {
  it('makes each li a list item, ordered or not, and each list its own', () => {
    const blocks = richTextToBlocks('<ol><li>One</li><li>Two</li></ol><p>Between</p><ul><li>Dot</li></ul><ol><li>Again</li></ol>')
    expect(blocks.map((block) => [block.type, text(block)])).toEqual([
      ['listItem', 'One'],
      ['listItem', 'Two'],
      ['paragraph', 'Between'],
      ['listItem', 'Dot'],
      ['listItem', 'Again'],
    ])
    const items = blocks.filter((block) => block.type === 'listItem')
    expect(items.map((item) => [item.ordered, item.list, item.level])).toEqual([
      [true, 0, 0],
      [true, 0, 0],
      [false, 1, 0],
      [true, 2, 0],
    ])
  })

  it('keeps formatting inside an item', () => {
    const [item] = richTextToBlocks('<ul><li>Plain <strong>bold</strong></li></ul>')
    expect(item.inlines).toMatchObject([
      { type: 'text', text: 'Plain ', format: { bold: false } },
      { type: 'text', text: 'bold', format: { bold: true } },
    ])
  })

  it('writes a nested list after its parent item, one level deeper', () => {
    const blocks = richTextToBlocks('<ul><li>Parent<ul><li>Child</li></ul></li><li>Sibling</li></ul>')
    expect(blocks.map((block) => [text(block), block.type === 'listItem' ? block.level : -1])).toEqual([
      ['Parent', 0],
      ['Child', 1],
      ['Sibling', 0],
    ])
  })

  it('closes an open item when the next one starts, as the HTML parser does', () => {
    expect(texts('<ul><li>One<li>Two</ul>')).toEqual(['One', 'Two'])
  })

  it('makes a paragraph inside an item a line of that item', () => {
    expect(texts('<ol><li><div>Line one</div><div>Line two</div></li></ol>')).toEqual(['Line one\nLine two'])
  })

  it('leaves out an item with no text', () => {
    expect(texts('<ul><li>One</li><li> </li><li><br></li></ul>')).toEqual(['One'])
  })
})

describe('the editor sanitizer allowlist, applied without a DOM', () => {
  it('replaces any other element by its text, with no formatting of its own', () => {
    expect(runs('<p><a href="https://x.test"><strong>Link</strong></a> text</p>').map((run) => [run.text, run.format.bold])).toEqual([
      ['Link', false],
      [' text', false],
    ])
  })

  it('drops elements with no text, such as images, and their attributes', () => {
    expect(texts('<p>Before<img src="https://x.test/a.png" onerror="alert(1)">After</p>')).toEqual(['BeforeAfter'])
  })

  it("keeps a script or style element's content as text, as textContent does, never as markup", () => {
    expect(texts('<p>A<script>if (a < b) { x("<b>y</b>") }</script>B</p>')).toEqual(['Aif (a < b) { x("<b>y</b>") }B'])
    expect(runs('<style>p { color: red }</style>').every((run) => !run.format.bold)).toBe(true)
  })

  it('skips comments and doctypes', () => {
    expect(texts('<!doctype html><!-- hidden --><p>Shown</p>')).toEqual(['Shown'])
  })

  it('prints escaped markup as the text a user typed, as the PDF does', () => {
    const [run] = runs('<p>&lt;b&gt;not bold&lt;/b&gt;</p>')
    expect(run).toMatchObject({ text: '<b>not bold</b>', format: { bold: false } })
  })

  it('keeps unclosed and malformed markup as text rather than losing it', () => {
    expect(texts('<p>Kept <strong>bold')).toEqual(['Kept bold'])
    expect(texts('3 < 4 and <3')).toEqual(['3 < 4 and <3'])
  })
})

describe('the allowlist matches sanitizeRichHtml', () => {
  it('keeps exactly the elements the editor sanitizer keeps', () => {
    // The sanitizer is self-contained by contract (it is shipped to a page as
    // its source text), so its allowlist is readable from that text.
    const source = sanitizeRichHtml.toString()
    const list = /allowedTags\s*=\s*\[([^\]]*)\]/.exec(source)
    expect(list, 'sanitizeRichHtml no longer declares allowedTags as an array literal').not.toBeNull()
    const sanitizerTags = [...list![1].matchAll(/['"`]([A-Za-z0-9]+)['"`]/g)].map((match) => match[1].toLowerCase()).sort()
    expect(sanitizerTags.length).toBeGreaterThan(0)
    expect([...ALLOWED_TAGS].sort()).toEqual(sanitizerTags)
  })
})

describe('bounded work (SEC-016)', () => {
  it('follows elements only to MAX_NESTING_DEPTH, keeping the text of deeper ones', () => {
    const deep = '<span>'.repeat(5_000) + 'deep text' + '</span>'.repeat(5_000) + '<p>after</p>'
    const started = performance.now()
    expect(texts(deep)).toEqual(['deep text', 'after'])
    expect(performance.now() - started).toBeLessThan(100)
  })

  it('ignores formatting opened beyond the depth limit, and its closing tags close nothing above it', () => {
    const html =
      '<em>' + '<span>'.repeat(MAX_NESTING_DEPTH) + '<strong>x</strong>y' + '</span>'.repeat(MAX_NESTING_DEPTH) + 'z</em>'
    expect(runs(html).map((run) => [run.text, run.format.bold, run.format.italic])).toEqual([
      ['x', false, true],
      ['y', false, true],
      ['z', false, true],
    ])
  })

  it('reads deeply nested lists and disallowed elements in linear time', () => {
    for (const html of ['<ul><li>'.repeat(2_500) + 'x', '<div>'.repeat(4_000) + 'x', '<a>'.repeat(6_000) + 'x']) {
      const started = performance.now()
      expect(texts(html).join('')).toContain('x')
      expect(performance.now() - started).toBeLessThan(100)
    }
  })

  it('caps list levels at the depth it follows', () => {
    const levels = richTextToBlocks('<ul><li>'.repeat(100) + 'x').map((block) => (block.type === 'listItem' ? block.level : -1))
    expect(Math.max(...levels)).toBeLessThan(MAX_NESTING_DEPTH)
  })

  it('stops as soon as the field holds more than maxBlocks blocks', () => {
    expect(() => richTextToBlocks('<p>x'.repeat(5_000), { maxBlocks: 1_000 })).toThrow(RichTextTooLargeError)
    expect(() => richTextToBlocks('<ul>' + '<li>x'.repeat(1_001), { maxBlocks: 1_000 })).toThrow(RichTextTooLargeError)
    expect(richTextToBlocks('<p>x'.repeat(1_000), { maxBlocks: 1_000 })).toHaveLength(1_000)
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes a reference to a character XML cannot carry to nothing (SEC-017)', () => {
    expect(decodeHtmlEntities('a&#1;b&#x1F;c&#xFFFE;d&#xffff;e&#8;f&#x0C;g')).toBe('abcdefg')
    expect(texts('<p>a &#1; b</p>')).toEqual(['a b'])
  })

  it('keeps tab, line feed and carriage return references', () => {
    expect(decodeHtmlEntities('&#9;&#10;&#13;')).toBe('\t\n\r')
  })

  it('reads 0x80 to 0x9F as windows-1252, as the HTML parser does', () => {
    expect(decodeHtmlEntities('&#146;&#147;&#148;&#128;&#x96;')).toBe('’“”€–')
  })

  it('decodes numeric references and the Latin-1 and typographic names', () => {
    expect(decodeHtmlEntities('&eacute;&uuml;&szlig;&rsquo;&laquo;&raquo;&euro;&#233;&#xFC;&amp;')).toBe('éüß’«»€éü&')
  })

  it('leaves an unknown name as written', () => {
    expect(decodeHtmlEntities('&notanentity;')).toBe('&notanentity;')
  })

  it('replaces a reference to no character, as the parser does', () => {
    expect(decodeHtmlEntities('&#0;&#xD800;&#x110000;')).toBe('���')
  })

  it('reaches accented text that is stored as characters unchanged', () => {
    expect(texts('<p>é ü ß ’ « »</p>')).toEqual(['é ü ß ’ « »'])
  })
})
