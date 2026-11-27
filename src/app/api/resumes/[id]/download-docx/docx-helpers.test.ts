import { AlignmentType, Document, NoBreakHyphen, Packer, Paragraph } from 'docx'
import JSZip from 'jszip'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { formatText } from '@/lib/format-text'
import {
  CONTACT_FIT_SAFETY_PX,
  KEEP_LINES,
  KEEP_WITH_NEXT,
  contactValueChildren,
  exactLineSpacing,
  keepAt,
  noBreakHyphenChildren,
  NO_TEXT_LINE,
  extractAlignment,
  formatDateRange,
  isHtmlList,
  isPlainTextList,
  parseHtmlToDocxRuns,
  parsePlainTextBlocks,
  parsePlainTextListToParagraphs,
  type PlainTextBlock,
  pxToHalfPoints,
  pxToTwips,
  renderInlineBullets,
  stripHtml,
  type DocxTextRunOptions,
} from './docx-helpers'

/**
 * These helpers are shared by every DOCX generator, so a regression here
 * changes every export at once. They are pure, which makes them the highest
 * value unit-test target in the export path.
 */

describe('pxToHalfPoints', () => {
  it('converts px to half-points at 96 DPI (1px = 1.5 half-points)', () => {
    expect(pxToHalfPoints(16)).toBe(24)
    expect(pxToHalfPoints(10)).toBe(15)
    expect(pxToHalfPoints(0)).toBe(0)
  })

  it('rounds to an integer, since DOCX cannot express fractional half-points', () => {
    expect(pxToHalfPoints(11)).toBe(17) // 16.5 rounds up
    expect(Number.isInteger(pxToHalfPoints(7))).toBe(true)
  })

  it('scales linearly', () => {
    expect(pxToHalfPoints(20)).toBe(pxToHalfPoints(10) * 2)
  })
})

describe('pxToTwips', () => {
  it('converts px to twips at 96 DPI (1px = 15 twips)', () => {
    expect(pxToTwips(1)).toBe(15)
    expect(pxToTwips(16)).toBe(240)
    expect(pxToTwips(0)).toBe(0)
  })

  it('maps one inch to 1440 twips', () => {
    expect(pxToTwips(96)).toBe(1440)
  })

  it('always returns an integer', () => {
    expect(Number.isInteger(pxToTwips(3.7))).toBe(true)
  })
})

describe('stripHtml', () => {
  it('removes tags but keeps the text', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('returns an empty string for null, undefined and empty input', () => {
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
    expect(stripHtml('')).toBe('')
  })

  it('trims the result', () => {
    expect(stripHtml('  <p> padded </p>  ')).toBe('padded')
  })

  it('handles attributes and self-closing tags', () => {
    expect(stripHtml('<a href="https://example.com">link</a><br/>')).toBe('link')
  })

  it('leaves plain text untouched', () => {
    expect(stripHtml('no markup here')).toBe('no markup here')
  })
})

describe('isHtmlList', () => {
  it('detects unordered and ordered lists', () => {
    expect(isHtmlList('<ul><li>a</li></ul>')).toBe(true)
    expect(isHtmlList('<ol><li>a</li></ol>')).toBe(true)
  })

  it('is case insensitive and tolerates attributes', () => {
    expect(isHtmlList('<UL><LI>a</LI></UL>')).toBe(true)
    expect(isHtmlList('<ul class="bullets"><li>a</li></ul>')).toBe(true)
  })

  it('is false for non-list markup and for empty input', () => {
    expect(isHtmlList('<p>not a list</p>')).toBe(false)
    expect(isHtmlList('plain text')).toBe(false)
    expect(isHtmlList(null)).toBe(false)
    expect(isHtmlList(undefined)).toBe(false)
  })

  it('does not match a bare list item without its container', () => {
    expect(isHtmlList('<li>orphan</li>')).toBe(false)
  })
})

describe('parsePlainTextBlocks', () => {
  it('turns bullet lines marked with •, - or * into one bullet list', () => {
    expect(parsePlainTextBlocks('• one\n- two\n* three')).toEqual([
      { type: 'bullet', items: ['one', 'two', 'three'] },
    ])
  })

  it('turns numbered lines into a numbered list, dropping the source numbers', () => {
    expect(parsePlainTextBlocks('1. first\n2. second\n10. tenth')).toEqual([
      { type: 'numbered', items: ['first', 'second', 'tenth'] },
    ])
  })

  it('prefers bullets when a paragraph mixes bullet and numbered lines', () => {
    expect(parsePlainTextBlocks('1. numbered\n- bullet')).toEqual([
      { type: 'bullet', items: ['bullet'] },
    ])
  })

  it('drops non-marker lines inside a list paragraph, as the Preview does', () => {
    expect(parsePlainTextBlocks('Intro line\n- a\ncontinuation\n- b')).toEqual([
      { type: 'bullet', items: ['a', 'b'] },
    ])
  })

  it('keeps a text paragraph and a list paragraph as separate blocks', () => {
    expect(parsePlainTextBlocks('Intro\nsecond line\n\n\n- a\n- b')).toEqual([
      { type: 'text', lines: ['Intro', 'second line'] },
      { type: 'bullet', items: ['a', 'b'] },
    ])
  })

  it('accepts leading whitespace before a marker and trims item text', () => {
    expect(parsePlainTextBlocks('  - indented  \n\t2. tabbed ')).toEqual([
      { type: 'bullet', items: ['indented'] },
    ])
    expect(parsePlainTextBlocks('\t2. tabbed ')).toEqual([
      { type: 'numbered', items: ['tabbed'] },
    ])
  })

  it('does not treat marker-like text without the required spacing as a list', () => {
    expect(parsePlainTextBlocks('-foo\n1.5 years\n*bold*')).toEqual([
      { type: 'text', lines: ['-foo', '1.5 years', '*bold*'] },
    ])
  })

  it('returns no blocks for empty input', () => {
    expect(parsePlainTextBlocks('')).toEqual([])
    expect(parsePlainTextBlocks(null)).toEqual([])
    expect(parsePlainTextBlocks(undefined)).toEqual([])
  })
})

describe('isPlainTextList', () => {
  it('is true for plain text containing a bullet or numbered list', () => {
    expect(isPlainTextList('- a\n- b')).toBe(true)
    expect(isPlainTextList('1. a\n2. b')).toBe(true)
    expect(isPlainTextList('Summary\n\n* a')).toBe(true)
  })

  it('is false for plain text without list markers', () => {
    expect(isPlainTextList('line one\nline two')).toBe(false)
    expect(isPlainTextList('-foo')).toBe(false)
    expect(isPlainTextList('1.5 years of experience')).toBe(false)
  })

  it('is false for HTML, even when its text looks like a list', () => {
    expect(isPlainTextList('<p>- a</p>\n<p>- b</p>')).toBe(false)
    expect(isPlainTextList('<ul><li>a</li></ul>')).toBe(false)
  })

  it('is false for empty input', () => {
    expect(isPlainTextList('')).toBe(false)
    expect(isPlainTextList(null)).toBe(false)
    expect(isPlainTextList(undefined)).toBe(false)
  })
})

/**
 * Reads formatText's element tree back into PlainTextBlocks. formatText is what
 * the Preview renders, so comparing against it keeps the DOCX rules from
 * silently drifting away from the Preview.
 */
function toNodeArray(node: ReactNode): ReactNode[] {
  return Array.isArray(node) ? node : [node]
}

function asElement(node: ReactNode): ReactElement<{ children?: ReactNode }> {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    throw new Error(`Expected a React element, got ${JSON.stringify(node)}`)
  }
  return node
}

function previewBlocks(text: string): PlainTextBlock[] {
  return toNodeArray(formatText(text)).map((node): PlainTextBlock => {
    const element = asElement(node)

    if (element.type === 'ul' || element.type === 'ol') {
      const items = toNodeArray(element.props.children).map(child => {
        const li = asElement(child)
        expect(li.type).toBe('li')
        return li.props.children as string
      })
      return { type: element.type === 'ul' ? 'bullet' : 'numbered', items }
    }

    expect(element.type).toBe('div')
    // Each line is a Fragment of [lineText, <br /> | false].
    const lines = toNodeArray(element.props.children).map(child => {
      const [line] = toNodeArray(asElement(child).props.children)
      return line as string
    })
    return { type: 'text', lines }
  })
}

describe('plain-text list parity with the Preview (formatText)', () => {
  const corpus = [
    '- a\n- b',
    '• a\n• b',
    '* a\n* b',
    '1. a\n2. b',
    '1. numbered\n- bullet',
    'Intro\n- a\ntail\n- b',
    'Intro\nsecond\n\n- a\n- b\n\n1. c\n2. d\n\nOutro',
    '  - indented  \n\t- tabbed',
    '-foo\n1.5 years\n*bold*',
    'plain line\nanother line',
    '- \n- a',
    '\n\n- a\n\n\n',
    '- a\r\n- b\r\n',
    '&amp; - not a marker\n- &lt;b&gt; literal',
  ]

  it.each(corpus)('matches formatText for %j', text => {
    expect(parsePlainTextBlocks(text)).toEqual(previewBlocks(text))
  })
})

describe('parseHtmlToDocxRuns inline formatting', () => {
  interface RunFormat {
    text: string
    bold: boolean
    italic: boolean
    underline: boolean
    strike: boolean
  }

  /** Pack the runs into a real document and read back each text run's formatting. */
  async function renderRuns(html: string): Promise<RunFormat[]> {
    const runs = parseHtmlToDocxRuns(html, { size: 20, color: '333333', font: 'Arial' })
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: runs })] }] })
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
    const body = await zip.file('word/document.xml')!.async('string')
    return (body.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? [])
      .filter(run => run.includes('<w:t'))
      .map(run => ({
        text: (run.match(/<w:t[^>]*>([^<]*)<\/w:t>/) ?? [])[1] ?? '',
        bold: /<w:b\/>/.test(run),
        italic: /<w:i\/>/.test(run),
        underline: /<w:u /.test(run),
        strike: /<w:strike\/>/.test(run),
      }))
  }

  it('matches tag names exactly, so <strong> is bold like the Preview draws it, not stripped as strikethrough', async () => {
    const runs = await renderRuns(
      '<p>a <strong>bold</strong> <b>b</b> <s>struck</s> <strike>x</strike> <del>y</del> <em>i</em> <u>u</u></p>'
    )
    const format = (text: string) => runs.find(run => run.text === text)
    expect(format('bold')).toMatchObject({ bold: true, italic: false, underline: false, strike: false })
    expect(format('b')).toMatchObject({ bold: true, italic: false, underline: false, strike: false })
    expect(format('i')).toMatchObject({ bold: false, italic: true, underline: false, strike: false })
    expect(format('u')).toMatchObject({ bold: false, italic: false, underline: true, strike: false })
    // The Preview's sanitizer unwraps <s>/<strike>/<del> to plain text, so their text survives unformatted
    for (const run of runs.filter(r => !['bold', 'b', 'i', 'u'].includes(r.text))) {
      expect(run).toMatchObject({ bold: false, italic: false, underline: false, strike: false })
    }
    expect(runs.map(run => run.text).join('')).toBe('a bold b struck x y i u')
  })

  /** Each run's text, with a line break written as "\n". */
  async function renderText(html: string): Promise<string> {
    const runs = parseHtmlToDocxRuns(html, { size: 20, color: '333333', font: 'Arial' })
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: runs })] }] })
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
    const body = await zip.file('word/document.xml')!.async('string')
    return (body.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:br\/>/g) ?? [])
      .map(token => (token === '<w:br/>' ? '\n' : token.replace(/<[^>]+>/g, '')))
      .join('')
  }

  it('keeps a space that sits alone between two formatted words', async () => {
    expect(await renderText('<p><b>A</b> <em>B</em></p>')).toBe('A B')
    expect(await renderText('<p><strong>A</strong> <u>B</u></p>')).toBe('A B')
  })

  it('keeps the break between two paragraphs that are wholly formatted', async () => {
    expect(await renderText('<p><strong>Title</strong></p><p><strong>Next</strong></p>')).toBe('Title\nNext')
    expect(await renderText('<p>x <em>A</em></p><p>y</p>')).toBe('x A\ny')
  })

  it('writes no break or space after the last line', async () => {
    expect(await renderText('<p><b>A</b></p><p> </p><p></p>')).toBe('A')
  })

  /** The text Word shows: `renderText`, with the XML escaping of `<w:t>` undone in one pass. */
  async function visibleText(html: string): Promise<string> {
    const xmlEscapes: Readonly<Record<string, string>> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }
    return (await renderText(html)).replace(/&(?:lt|gt|amp|quot|apos);/g, entity => xmlEscapes[entity])
  }

  // The Preview sets rich HTML as innerHTML: the browser decodes each entity
  // once into a text node, and the sanitizer keeps text nodes as they are.
  it('keeps text typed as a tag, as the Preview shows it, rather than taking it for a tag (swiss-templates-only-page-fidelity US-004)', async () => {
    expect(await visibleText('<p>A &lt;script&gt; &amp; B</p>')).toBe('A <script> & B')
    expect(await visibleText('<p>Le mot &lt;mot&gt; reste</p>')).toBe('Le mot <mot> reste')
    expect(await visibleText('<p>&quot;cité&quot; &#39;x&#x27;</p>')).toBe('"cité" \'x\'')
  })

  it('decodes each entity once: an escaped ampersand stays text (US-004)', async () => {
    expect(await visibleText('<p>&amp;lt;x&amp;gt;</p>')).toBe('&lt;x&gt;')
    expect(await visibleText('<p>&amp;amp; &amp;nbsp;</p>')).toBe('&amp; &nbsp;')
  })

  it('writes decoded text only through escaped runs, so it never becomes markup (US-004)', async () => {
    const runs = parseHtmlToDocxRuns('<p>&lt;/w:t&gt;&lt;w:t&gt;x &lt;script&gt;</p>', { size: 20, color: '333333', font: 'Arial' })
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: runs })] }] })
    const body = await (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml')!.async('string')
    expect(body).toContain('&lt;/w:t&gt;&lt;w:t&gt;x &lt;script&gt;')
    expect(body).not.toContain('<script')
    expect((body.match(/<w:t[ >]/g) ?? []).length).toBe(1)
  })

  it('keeps an encoded tag inside formatting as text, formatted (US-004)', async () => {
    const runs = await renderRuns('<p><strong>&lt;b&gt;</strong> after</p>')
    expect(runs.map(run => run.text)).toEqual(['&lt;b&gt;', ' after'])
    expect(runs[0].bold).toBe(true)
    expect(runs[1].bold).toBe(false)
  })

  it('keeps a list item that is an encoded tag, and still skips one that is only a no-break space (US-004)', async () => {
    expect(await visibleText('<ul><li>&lt;a&gt;</li><li>&nbsp;</li><li>b</li></ul>')).toBe('• <a>\n• b')
    expect(await visibleText('<ol><li>&nbsp;</li><li>&lt;x&gt;</li></ol>')).toBe('1. <x>')
  })

  // rich-text-single-line-entities: the decoder Word shares with the Preview
  // must not decode an `&nbsp;` that only forms once a tag inside it is gone.
  it('keeps an &nbsp; split by a tag as text, as before the decoder was shared', async () => {
    expect(await visibleText('<p>&nb<a>sp;</a>x</p>')).toBe('&nbsp;x')
  })

  it('keeps a list item whose &nbsp; is split by a tag, as before the decoder was shared', async () => {
    // `• &nb`, `sp;` (bold) and `• y`, as `<w:t>` holds them: XML-escaped.
    expect((await renderRuns('<ul><li>&nb<b>sp;</b></li><li>y</li></ul>')).map(run => run.text)).toEqual(['• &amp;nb', 'sp;', '• y'])
  })

  it('still removes the real tags of rich text (US-004)', async () => {
    expect(await visibleText('<p>a<span style="color: red">b</span><img src="x">c</p>')).toBe('abc')
  })

  it('keeps tagless text whole, decoded once, instead of taking a decoded `<` for a tag (US-004)', async () => {
    // Decoded before the tag test, `<mot>` made the text look like HTML and was stripped as a tag.
    expect(await visibleText('&lt;mot&gt; R&amp;D &amp;lt;')).toBe('<mot> R&D &lt;')
  })
})

describe('noBreakHyphenChildren', () => {
  it('writes each hyphen as a non-breaking hyphen between the text around it', () => {
    const children = noBreakHyphenChildren('in/sophie-marchand-keller')
    expect(children.map((child) => (child instanceof NoBreakHyphen ? 'NBH' : child))).toEqual(['in/sophie', 'NBH', 'marchand', 'NBH', 'keller'])
  })

  it('keeps text without a hyphen as one string, and writes no empty text around a hyphen at either end', () => {
    expect(noBreakHyphenChildren('Lausanne')).toEqual(['Lausanne'])
    expect(noBreakHyphenChildren('-a-').map((child) => (child instanceof NoBreakHyphen ? 'NBH' : child))).toEqual(['NBH', 'a', 'NBH'])
  })
})

describe('contactValueChildren', () => {
  const asText = (children: ReturnType<typeof contactValueChildren>) => children.map((child) => (child instanceof NoBreakHyphen ? '[NBH]' : child)).join('')
  const SIZE = 18 // half-points: 9pt, 12px

  it('holds a value that fits its line together at its hyphens', () => {
    const children = contactValueChildren('linkedin.com/in/sophie-marchand', 600, SIZE)
    expect(asText(children)).toBe('linkedin.com/in/sophie[NBH]marchand')
  })

  it('keeps the spaces a value was typed with: plain U+0020, so the stored text is in the file as typed', () => {
    const children = contactValueChildren('+41 21 555-0142', 600, SIZE)
    expect(asText(children)).toBe('+41 21 555[NBH]0142')
    expect(asText(children)).not.toContain(' ')
    expect(contactValueChildren('+41 21 555 0142', 600, SIZE)).toEqual(['+41 21 555 0142'])
  })

  it('writes a value wider than its line as stored, as the Preview wraps it inside', () => {
    expect(contactValueChildren('linkedin.com/in/sophie-marchand', 60, SIZE)).toEqual(['linkedin.com/in/sophie-marchand'])
    // Within the safety margin of the line is too wide as well.
    expect(CONTACT_FIT_SAFETY_PX).toBeGreaterThan(0)
  })

  it('writes an e-mail address as stored, whatever its width', () => {
    expect(contactValueChildren('sophie.marchand-keller@exemple.ch', 600, SIZE, true)).toEqual(['sophie.marchand-keller@exemple.ch'])
  })

  it('trims the value as the Preview draws it', () => {
    expect(contactValueChildren('  Lausanne ', 600, SIZE)).toEqual(['Lausanne'])
  })
})

describe('keepAt', () => {
  it('keeps every paragraph of a kept block with the next, and gives the last the rules it is given', () => {
    expect([0, 1, 2].map((index) => keepAt(KEEP_LINES, index, 3))).toEqual([KEEP_WITH_NEXT, KEEP_WITH_NEXT, KEEP_LINES])
    expect([0, 1].map((index) => keepAt(KEEP_WITH_NEXT, index, 2))).toEqual([KEEP_WITH_NEXT, KEEP_WITH_NEXT])
  })

  it('gives no rules outside a kept block', () => {
    expect(keepAt(undefined, 0, 1)).toEqual({})
  })
})

describe('parsePlainTextListToParagraphs', () => {
  const runOptions = { size: 20, color: '333333', font: 'Arial' }
  const layout = { spacingAfterItem: 60, spacingAfterLast: 480, lineSpacing: exactLineSpacing([1.5, 20]) }

  /** Pack the paragraphs into a real document and read back each paragraph's text. */
  async function renderParagraphs(text: string): Promise<{ texts: string[]; xml: string }> {
    const doc = new Document({
      sections: [{ children: parsePlainTextListToParagraphs(text, runOptions, layout) }],
    })
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
    const body = await zip.file('word/document.xml')!.async('string')
    const paragraphs = body.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g) ?? []
    const texts = paragraphs.map(p =>
      (p.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:br\/>/g) ?? [])
        .map(token => (token === '<w:br/>' ? '\n' : token.replace(/<[^>]+>/g, '')))
        .join('')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    )
    return { texts, xml: body }
  }

  it('inside a kept block, keeps every paragraph with the next but the last, which takes the rules it is given', async () => {
    const doc = new Document({
      sections: [{ children: parsePlainTextListToParagraphs('Intro\n\n- a\n- b', runOptions, { ...layout, keep: KEEP_LINES }) }],
    })
    const body = await (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml')!.async('string')
    const pPrs = (body.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g) ?? []).map((p) => /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p)?.[1] ?? '')
    expect(pPrs.map((pPr) => [pPr.includes('<w:keepNext/>'), pPr.includes('<w:keepLines/>')])).toEqual([
      [true, true],
      [true, true],
      [false, true],
    ])
  })

  it('outside a kept block, writes no keep rule', async () => {
    const doc = new Document({ sections: [{ children: parsePlainTextListToParagraphs('Intro\n\n- a', runOptions, layout) }] })
    const body = await (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml')!.async('string')
    expect(body).not.toMatch(/<w:keep(Next|Lines)/)
  })

  it('emits one paragraph per list item and per text block', () => {
    expect(parsePlainTextListToParagraphs('Intro\n\n- a\n- b', runOptions, layout)).toHaveLength(3)
    expect(parsePlainTextListToParagraphs('1. a\n2. b\n3. c', runOptions, layout)).toHaveLength(3)
  })

  it('skips blank paragraphs that the Preview renders with no height', () => {
    expect(parsePlainTextListToParagraphs('\n\n- a\n\n\n', runOptions, layout)).toHaveLength(1)
  })

  it('gives every run — text, list prefix and line break — the width scale and raise it is given, and none otherwise', async () => {
    const runsOf = async (options: DocxTextRunOptions) => {
      const doc = new Document({
        sections: [{ children: parsePlainTextListToParagraphs('Intro\nline two\n\n- a\n- b\n\n1. c', options, layout) }],
      })
      const body = await (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml')!.async('string')
      return [...body.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map(([, run]) => /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? '')
    }
    const scaled = await runsOf({ ...runOptions, scale: 97, position: '1.5pt' })
    // Intro, break, line two; then a prefix and its text for each of the three items.
    expect(scaled).toHaveLength(9)
    for (const properties of scaled) {
      expect(properties).toContain('<w:w w:val="97"/>')
      expect(properties).toContain('<w:position w:val="1.5pt"/>')
    }
    for (const properties of await runsOf(runOptions)) {
      expect(properties).not.toMatch(/<w:w |<w:position /)
    }
  })

  it('prefixes items like parseHtmlListToParagraphs and restarts numbering per list', async () => {
    const { texts } = await renderParagraphs('Intro\nline two\n\n- a\n* b\n\n5. c\n9. d')
    expect(texts).toEqual(['Intro\nline two', '• a', '• b', '1. c', '2. d'])
  })

  it('keeps item text literal rather than decoding entities', async () => {
    const { texts } = await renderParagraphs('- &amp; stays\n- <b> is text')
    expect(texts).toEqual(['• &amp; stays', '• <b> is text'])
  })

  it('drops a trailing blank line, which the Preview does not render', async () => {
    const { texts } = await renderParagraphs('- a\n\nText\n')
    expect(texts).toEqual(['• a', 'Text'])
  })

  it('applies item spacing between paragraphs and the last spacing after the final one', async () => {
    const { xml } = await renderParagraphs('Intro\n\n- a\n- b')
    const spacings = xml.match(/<w:spacing [^>]*\/>/g) ?? []
    expect(spacings.map(s => s.match(/w:after="(\d+)"/)?.[1])).toEqual(['60', '60', '480'])
  })

  it('writes the given exact line spacing on every paragraph', async () => {
    const { xml } = await renderParagraphs('Intro\n\n- a\n- b')
    const spacings = xml.match(/<w:spacing [^>]*\/>/g) ?? []
    expect(spacings).toHaveLength(3)
    for (const spacing of spacings) {
      expect(spacing).toMatch(/w:line="300"/)
      expect(spacing).toMatch(/w:lineRule="exact"/)
    }
  })
})

describe('exactLineSpacing (Part 3 US-004)', () => {
  it('is the CSS line-height times the run size, in twips, as Word exact spacing', () => {
    // 1.35 × 11px: the run is pxToHalfPoints(11) = 17 half-points = 8.5pt, so 11.475pt = 229.5 twips.
    expect(exactLineSpacing([1.35, 17])).toEqual({ line: 230, lineRule: 'exact' })
    expect(exactLineSpacing([1.5, 21])).toEqual({ line: 315, lineRule: 'exact' })
  })

  it('takes the tallest line box when one paragraph stands for several side by side', () => {
    expect(exactLineSpacing([1.2, 20], [1.35, 17])).toEqual({ line: 240, lineRule: 'exact' })
    expect(exactLineSpacing([1.35, 17], [1.2, 20])).toEqual({ line: 240, lineRule: 'exact' })
  })

  it('refuses to write a line with no line box to measure', () => {
    expect(() => exactLineSpacing()).toThrow()
  })

  it('writes a 1-twip exact line for a paragraph that stands for no text', () => {
    expect(NO_TEXT_LINE).toEqual({ line: 1, lineRule: 'exact' })
  })
})

describe('renderInlineBullets', () => {
  it('joins HTML list items with a bullet separator', () => {
    expect(renderInlineBullets('<ul><li>One</li><li>Two</li></ul>')).toBe('One • Two')
  })

  it('strips nested markup inside list items', () => {
    expect(renderInlineBullets('<ul><li><strong>One</strong></li><li>Two</li></ul>')).toBe(
      'One • Two',
    )
  })

  it('falls back to stripped text for HTML without list items', () => {
    expect(renderInlineBullets('<p>Just a paragraph</p>')).toBe('Just a paragraph')
  })

  it('joins plain-text bullet lines, accepting bullet, dash or asterisk markers', () => {
    expect(renderInlineBullets('- One\n- Two')).toBe('One • Two')
    expect(renderInlineBullets('• One\n• Two')).toBe('One • Two')
    expect(renderInlineBullets('* One\n* Two')).toBe('One • Two')
  })

  it('flattens newlines to spaces when there are no bullet markers', () => {
    expect(renderInlineBullets('Plain text\nwith newline')).toBe('Plain text with newline')
  })

  it('returns an empty string for null, undefined and empty input', () => {
    expect(renderInlineBullets(null)).toBe('')
    expect(renderInlineBullets(undefined)).toBe('')
    expect(renderInlineBullets('')).toBe('')
  })
})

describe('extractAlignment', () => {
  it('maps each CSS alignment to its DOCX counterpart', () => {
    expect(extractAlignment('<p style="text-align: left">x</p>')).toBe(AlignmentType.LEFT)
    expect(extractAlignment('<p style="text-align: center">x</p>')).toBe(AlignmentType.CENTER)
    expect(extractAlignment('<p style="text-align: right">x</p>')).toBe(AlignmentType.RIGHT)
    expect(extractAlignment('<p style="text-align: justify">x</p>')).toBe(AlignmentType.JUSTIFIED)
  })

  it('uses the last declaration, which is the innermost element', () => {
    const nested =
      '<div style="text-align: left"><p style="text-align: right">x</p></div>'
    expect(extractAlignment(nested)).toBe(AlignmentType.RIGHT)
  })

  it('is case insensitive and tolerates missing whitespace', () => {
    expect(extractAlignment('<p style="TEXT-ALIGN:CENTER">x</p>')).toBe(AlignmentType.CENTER)
  })

  it('returns undefined when no alignment is present', () => {
    expect(extractAlignment('<p>x</p>')).toBeUndefined()
    expect(extractAlignment(null)).toBeUndefined()
    expect(extractAlignment(undefined)).toBeUndefined()
  })

  it('ignores an unsupported alignment value', () => {
    expect(extractAlignment('<p style="text-align: inherit">x</p>')).toBeUndefined()
  })
})

describe('formatDateRange', () => {
  const noDict = {}

  it('formats a closed range', () => {
    expect(formatDateRange('2020-01', '2022-06', false, 'en', noDict)).toBe('01/2020 - 06/2022')
  })

  it('uses the Present fallback for a current role', () => {
    expect(formatDateRange('2020-01', null, true, 'en', noDict)).toBe('01/2020 - Present')
  })

  it('uses the Present fallback when the end date is missing', () => {
    expect(formatDateRange('2020-01', null, false, 'en', noDict)).toBe('01/2020 - Present')
  })

  it('prefers the localized Present label from the dictionary', () => {
    const dict = { resumes: { template: { present: 'Aktuell' } } }
    expect(formatDateRange('2020-01', null, true, 'de', dict)).toBe('01/2020 - Aktuell')
  })

  it('returns an empty string without a start date', () => {
    expect(formatDateRange(null, '2022-06', false, 'en', noDict)).toBe('')
    expect(formatDateRange(null, null, true, 'en', noDict)).toBe('')
  })

  it('produces a month/year pair per side for every supported locale', () => {
    // Asserted structurally rather than as fixed strings: the separator comes
    // from CLDR data and is not ours to pin across ICU versions.
    for (const locale of ['en', 'fr', 'de', 'it'] as const) {
      const result = formatDateRange('2020-01', '2022-06', false, locale, noDict)
      expect(result, locale).toMatch(/^\d{2}\D\d{4} - \d{2}\D\d{4}$/)
    }
  })

  it('keeps a zero-padded two-digit month', () => {
    expect(formatDateRange('2020-09', '2020-12', false, 'en', noDict)).toBe('09/2020 - 12/2020')
  })
})

