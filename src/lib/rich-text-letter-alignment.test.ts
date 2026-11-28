import { describe, expect, it } from 'vitest'
import { richTextToBlocks } from '@/app/api/cover-letters/[id]/download-docx/rich-text-blocks'
import { TEXT_ALIGNMENTS } from '@/lib/rich-text-alignment'
import { alignRichText, hasAlignableText, sharedAlignment } from '@/lib/rich-text-letter-alignment'

/**
 * Whole-letter alignment (cover-letter-top-toolbar, US-002). Applying it from
 * the toolbar, and its effect on the previews, the PDF and the Word file, are
 * covered by `e2e/cover-letter-paragraph-alignment.spec.ts`.
 */

const J = 'text-align: justify;'

/** What the Word export reads from a field: each paragraph's text and alignment. */
const blocks = (html: string) =>
  richTextToBlocks(html).map((block) => ({
    text: block.inlines.map((inline) => (inline.type === 'text' ? inline.text : '\n')).join(''),
    alignment: block.alignment,
  }))

/** The field's text with every tag removed, in order. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

describe('alignRichText', () => {
  it('sets the alignment on every paragraph', () => {
    expect(alignRichText('<p>One.</p><p>Two.</p>', 'justify')).toBe(`<p style="${J}">One.</p><p style="${J}">Two.</p>`)
  })

  it('replaces an alignment a paragraph had, and writes left explicitly', () => {
    expect(alignRichText('<div style="text-align: center;">One.</div>', 'left')).toBe(
      '<div style="text-align: left;">One.</div>',
    )
  })

  it('keeps a paragraph\'s other styles', () => {
    expect(alignRichText('<p style="font-family: Georgia; text-align: right;">One.</p>', 'center')).toBe(
      '<p style="font-family: Georgia; text-align: center;">One.</p>',
    )
  })

  it('keeps the rest of the style byte for byte, entities holding ";" included', () => {
    expect(alignRichText('<p style="font-family: &quot;Times New Roman&quot;, serif">x</p>', 'justify')).toBe(
      `<p style="font-family: &quot;Times New Roman&quot;, serif; ${J}">x</p>`,
    )
    expect(
      alignRichText('<p style="font-family: &quot;Times New Roman&quot;, Times, serif; text-align: center;">x</p>', 'right'),
    ).toBe('<p style="font-family: &quot;Times New Roman&quot;, Times, serif; text-align: right;">x</p>')
    expect(alignRichText('<div style="text-align: center; font-size: 18px">x</div>', 'left')).toBe(
      '<div style="font-size: 18px; text-align: left;">x</div>',
    )
  })

  it('adds a separator after a last declaration that ends with an entity', () => {
    expect(alignRichText('<p style="text-align:center;font-family: &quot;A B&quot;">x</p>', 'left')).toBe(
      '<p style="font-family: &quot;A B&quot;; text-align: left;">x</p>',
    )
    expect(alignRichText('<p style="text-align:center;font-family: &#34;A B&#34;">x</p>', 'left')).toBe(
      '<p style="font-family: &#34;A B&#34;; text-align: left;">x</p>',
    )
    // A real separator after the entity is kept as the only one
    expect(alignRichText('<p style="font-family: &quot;A B&quot;;">x</p>', 'left')).toBe(
      '<p style="font-family: &quot;A B&quot;; text-align: left;">x</p>',
    )
  })

  it('leaves an inline element that holds a block unwrapped, so the markup stays balanced', () => {
    expect(alignRichText('<b>x<p>y</p>z</b>', 'justify')).toBe(`<b>x<p style="${J}">y</p>z</b>`)
  })

  it('wraps text with no block of its own in a paragraph carrying the alignment', () => {
    expect(alignRichText('Dear <b>reader</b>, hello', 'justify')).toBe(`<p style="${J}">Dear <b>reader</b>, hello</p>`)
    expect(alignRichText('<p>First.</p>Second<br>line', 'justify')).toBe(
      `<p style="${J}">First.</p><p style="${J}">Second<br>line</p>`,
    )
  })

  it('wraps a single typed line stored as its text node, entities as they are', () => {
    expect(alignRichText('R&amp;D &lt; 5%', 'center')).toBe('<p style="text-align: center;">R&amp;D &lt; 5%</p>')
  })

  it('aligns each list item and keeps the list as it is', () => {
    expect(alignRichText('<ul><li>One</li><li style="text-align: right;">Two</li></ul><ol><li>Three</li></ol>', 'justify')).toBe(
      `<ul><li style="${J}">One</li><li style="${J}">Two</li></ul><ol><li style="${J}">Three</li></ol>`,
    )
  })

  it('aligns nested blocks too, so none keeps an alignment of its own', () => {
    expect(alignRichText('<div style="text-align: center;"><p style="text-align: right;">One</p>tail</div>', 'left')).toBe(
      '<div style="text-align: left;"><p style="text-align: left;">One</p>tail</div>',
    )
  })

  it('aligns paragraphs whose end tags the parser implies', () => {
    expect(alignRichText('<p>One<p>Two', 'right')).toBe('<p style="text-align: right;">One<p style="text-align: right;">Two')
  })

  it('keeps inline formatting, fonts and sizes byte for byte', () => {
    const inline =
      '<strong>Bold</strong> <em>italic</em> <u>under</u> <b><i>both</i></b> ' +
      '<span style="font-family: &quot;Times New Roman&quot;, Times, serif;">font</span> ' +
      '<span style="font-size: 18px;">size</span>&nbsp;&amp; R&amp;D'
    expect(alignRichText(`<p>${inline}</p>`, 'justify')).toBe(`<p style="${J}">${inline}</p>`)
    expect(alignRichText(inline, 'justify')).toBe(`<p style="${J}">${inline}</p>`)
  })

  it('leaves whitespace and empty lines between paragraphs as they are', () => {
    expect(alignRichText('<p>One</p>\n<br>\n<p>Two</p>', 'center')).toBe(
      '<p style="text-align: center;">One</p>\n<br>\n<p style="text-align: center;">Two</p>',
    )
    expect(alignRichText('<p>One</p>&nbsp;', 'center')).toBe('<p style="text-align: center;">One</p>&nbsp;')
  })

  it('leaves an empty field empty', () => {
    expect(alignRichText('', 'justify')).toBe('')
    expect(alignRichText('  \n', 'justify')).toBe('  \n')
  })

  it('treats a "<" that opens no tag as text', () => {
    expect(alignRichText('a < b', 'right')).toBe('<p style="text-align: right;">a < b</p>')
  })

  it('is idempotent, and the last alignment applied is the one kept', () => {
    const html = '<p>One</p>bare<ul><li>item</li></ul><div style="font-size: 12px;">Two</div>'
    for (const alignment of TEXT_ALIGNMENTS) {
      const once = alignRichText(html, alignment)
      expect(alignRichText(once, alignment), alignment).toBe(once)
      for (const before of TEXT_ALIGNMENTS) {
        expect(alignRichText(alignRichText(html, before), alignment), `${before} then ${alignment}`).toBe(once)
      }
    }
  })

  it('loses and reorders no text, and every paragraph the Word export reads carries the alignment', () => {
    const html =
      'Intro <b>bold</b><p style="text-align: center;">Centered</p><div>Plain<br>two lines</div>' +
      '<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>tail'
    for (const alignment of TEXT_ALIGNMENTS) {
      const aligned = alignRichText(html, alignment)
      expect(textOf(aligned), alignment).toBe(textOf(html))
      expect(blocks(aligned).map((block) => block.text), alignment).toEqual(blocks(html).map((block) => block.text))
      expect(new Set(blocks(aligned).map((block) => block.alignment)), alignment).toEqual(new Set([alignment]))
    }
  })
})

describe('sharedAlignment', () => {
  it('is the alignment every paragraph of every field shares', () => {
    const justified = alignRichText('<p>One</p><p>Two</p>', 'justify')
    expect(sharedAlignment([justified, alignRichText('Body', 'justify'), justified])).toBe('justify')
  })

  it('counts a paragraph with no alignment of its own as left', () => {
    expect(sharedAlignment(['<p>One</p>', 'Two', '<p style="text-align: left;">Three</p>'])).toBe('left')
  })

  it('is null when two paragraphs differ, even in different fields', () => {
    expect(sharedAlignment(['<p style="text-align: center;">One</p>', '<p>Two</p>'])).toBeNull()
    expect(sharedAlignment(['<p style="text-align: right;">One</p><p style="text-align: center;">Two</p>'])).toBeNull()
  })

  it('ignores empty fields and empty paragraphs', () => {
    expect(sharedAlignment([null, '', `<p style="text-align: left;"><br></p>`, `<p style="${J}">Text</p>`])).toBe('justify')
  })

  it('is null when no field holds text', () => {
    expect(sharedAlignment([null, '', '<p><br></p>'])).toBeNull()
  })
})

describe('hasAlignableText', () => {
  it('is true when any field holds text', () => {
    expect(hasAlignableText([null, '', '<p>Text</p>'])).toBe(true)
    expect(hasAlignableText(['Bare text'])).toBe(true)
  })

  it('is false when every field is empty or holds only empty paragraphs', () => {
    expect(hasAlignableText([])).toBe(false)
    expect(hasAlignableText([null, undefined, '', '  ', '<p><br></p>', '<div>&nbsp;</div>'])).toBe(false)
  })
})
