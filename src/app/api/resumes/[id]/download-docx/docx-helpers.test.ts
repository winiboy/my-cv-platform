import { AlignmentType, Document, Packer } from 'docx'
import JSZip from 'jszip'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { formatText } from '@/lib/format-text'
import {
  COLORS,
  extractAlignment,
  extractPrimaryFont,
  formatDateRange,
  hslToHex,
  isHtmlList,
  isPlainTextList,
  oklchToHex,
  parsePlainTextBlocks,
  parsePlainTextListToParagraphs,
  type PlainTextBlock,
  pxToHalfPoints,
  pxToTwips,
  renderInlineBullets,
  stripHtml,
} from './docx-helpers'

/**
 * These helpers are shared by all five DOCX generators, so a regression here
 * changes every export at once. They are pure, which makes them the highest
 * value unit-test target in the export path.
 */

const HEX_6 = /^[0-9A-F]{6}$/

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

describe('hslToHex', () => {
  it('converts the primary hues', () => {
    expect(hslToHex(0, 100, 50)).toBe('FF0000')
    expect(hslToHex(120, 100, 50)).toBe('00FF00')
    expect(hslToHex(240, 100, 50)).toBe('0000FF')
  })

  it('converts the secondary hues', () => {
    expect(hslToHex(60, 100, 50)).toBe('FFFF00')
    expect(hslToHex(180, 100, 50)).toBe('00FFFF')
    expect(hslToHex(300, 100, 50)).toBe('FF00FF')
  })

  it('renders zero saturation as grey regardless of hue', () => {
    for (const hue of [0, 90, 180, 270]) {
      const hex = hslToHex(hue, 0, 50)
      expect(hex.slice(0, 2)).toBe(hex.slice(2, 4))
      expect(hex.slice(2, 4)).toBe(hex.slice(4, 6))
    }
  })

  it('renders lightness extremes as black and white', () => {
    expect(hslToHex(200, 85, 0)).toBe('000000')
    expect(hslToHex(200, 85, 100)).toBe('FFFFFF')
  })

  it('returns bare uppercase 6-digit hex with no leading hash', () => {
    for (const [h, s, l] of [[240, 85, 35], [17, 42, 61], [300, 10, 5]]) {
      const hex = hslToHex(h, s, l)
      expect(hex).toMatch(HEX_6)
      expect(hex.startsWith('#')).toBe(false)
    }
  })

  it('pads single-digit channels to two characters', () => {
    expect(hslToHex(240, 85, 35)).toBe('0D0DA5')
  })

  // The sidebar hue slider is min="0" max="360", so 360 is a value the user can
  // actually select, and Preview renders it as red. Before hue normalization the
  // branch chain stopped at `h < 360`, leaving r/g/b at 0 and exporting a
  // near-black sidebar instead.
  it('treats hue 360 as red rather than black', () => {
    expect(hslToHex(360, 100, 50)).toBe('FF0000')
  })

  it('produces the same colour for hue 360 as for hue 0', () => {
    expect(hslToHex(360, 85, 35)).toBe(hslToHex(0, 85, 35))
  })

  it('wraps hues above 360 back into the circle', () => {
    expect(hslToHex(420, 100, 50)).toBe(hslToHex(60, 100, 50))
    expect(hslToHex(720, 100, 50)).toBe(hslToHex(0, 100, 50))
  })

  it('wraps negative hues back into the circle', () => {
    expect(hslToHex(-60, 100, 50)).toBe(hslToHex(300, 100, 50))
    expect(hslToHex(-360, 100, 50)).toBe(hslToHex(0, 100, 50))
  })
})

describe('oklchToHex', () => {
  it('returns a grey, with all three channels equal', () => {
    for (const l of [0.2, 0.3, 0.5, 0.8]) {
      const hex = oklchToHex(l)
      expect(hex.slice(0, 2)).toBe(hex.slice(2, 4))
      expect(hex.slice(2, 4)).toBe(hex.slice(4, 6))
    }
  })

  it('increases monotonically with lightness', () => {
    const values = [0.1, 0.3, 0.5, 0.7, 0.9].map((l) => parseInt(oklchToHex(l).slice(0, 2), 16))
    const sorted = [...values].sort((a, b) => a - b)
    expect(values).toEqual(sorted)
  })

  it('returns bare uppercase 6-digit hex', () => {
    expect(oklchToHex(0.2)).toMatch(HEX_6)
    expect(oklchToHex(0)).toMatch(HEX_6)
  })
})

describe('COLORS', () => {
  it('exposes every colour as bare uppercase 6-digit hex', () => {
    for (const [name, value] of Object.entries(COLORS)) {
      expect(value, name).toMatch(HEX_6)
    }
  })

  it('orders the greyscale ramp from darkest heading to lightest date text', () => {
    const luminance = (hex: string) => parseInt(hex.slice(0, 2), 16)
    expect(luminance(COLORS.DARK_HEADING)).toBeLessThan(luminance(COLORS.BODY_TEXT))
    expect(luminance(COLORS.BODY_TEXT)).toBeLessThan(luminance(COLORS.META_TEXT))
    expect(luminance(COLORS.META_TEXT)).toBeLessThan(luminance(COLORS.DATE_TEXT))
    expect(luminance(COLORS.DATE_TEXT)).toBeLessThan(luminance(COLORS.WHITE))
  })
})

describe('extractPrimaryFont', () => {
  it('takes the first font from a stack', () => {
    expect(extractPrimaryFont("'Arial', Helvetica, sans-serif")).toBe('Arial')
  })

  it('strips single and double quotes', () => {
    expect(extractPrimaryFont('"Times New Roman", serif')).toBe('Times New Roman')
    expect(extractPrimaryFont("'Courier New', monospace")).toBe('Courier New')
  })

  it('handles a bare single font', () => {
    expect(extractPrimaryFont('Georgia')).toBe('Georgia')
  })

  it('trims surrounding whitespace', () => {
    expect(extractPrimaryFont('  Verdana  , sans-serif')).toBe('Verdana')
  })

  it('preserves internal spaces in multi-word names', () => {
    expect(extractPrimaryFont('Noto Sans, sans-serif')).toBe('Noto Sans')
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

describe('parsePlainTextListToParagraphs', () => {
  const runOptions = { size: 20, color: '333333', font: 'Arial' }
  const layout = { spacingAfterItem: 60, spacingAfterLast: 480 }

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

  it('emits one paragraph per list item and per text block', () => {
    expect(parsePlainTextListToParagraphs('Intro\n\n- a\n- b', runOptions, layout)).toHaveLength(3)
    expect(parsePlainTextListToParagraphs('1. a\n2. b\n3. c', runOptions, layout)).toHaveLength(3)
  })

  it('skips blank paragraphs that the Preview renders with no height', () => {
    expect(parsePlainTextListToParagraphs('\n\n- a\n\n\n', runOptions, layout)).toHaveLength(1)
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
