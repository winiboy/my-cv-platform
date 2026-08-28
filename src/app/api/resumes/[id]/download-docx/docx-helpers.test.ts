import { AlignmentType } from 'docx'
import { describe, expect, it } from 'vitest'
import {
  COLORS,
  extractAlignment,
  extractPrimaryFont,
  formatDateRange,
  hslToHex,
  isHtmlList,
  oklchToHex,
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
