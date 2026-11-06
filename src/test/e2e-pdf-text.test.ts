import { describe, expect, it } from 'vitest'
import { comparablePageText } from '../../e2e/fixtures/pdf-text'

/**
 * The page-text form `e2e/resume-pdf-route.spec.ts` compares the route's PDF
 * and the Preview print in. It must forgive how pdf.js splits glyphs into
 * items, and nothing else.
 */
const same = (a: string, b: string) => comparablePageText(a) === comparablePageText(b)

describe('comparablePageText', () => {
  it('equates a letter-spaced heading extracted glyph by glyph with the same heading extracted as words', () => {
    expect(
      same(
        'V I S U A L B A S E L I N E - C L A S S I C S u m m a r y Ten years of work.',
        'VISUAL BASELINE - CLASSIC Summary Ten years of work.',
      ),
    ).toBe(true)
  })

  it('equates texts whose only difference is the kind or amount of whitespace', () => {
    expect(same('Summary  Ten\tyears\nof work.', 'Summary Ten years of work.')).toBe(true)
  })

  it('tells apart texts that differ by one changed character', () => {
    expect(same('S u m m a r y Ten years of work.', 'Summary Ten yeers of work.')).toBe(false)
  })

  it('tells apart texts that differ by one added or one removed character', () => {
    expect(same('Summary Ten years of work.', 'Summary Ten years of work..')).toBe(false)
    expect(same('Summary Ten years of work.', 'Summary Ten year of work.')).toBe(false)
  })

  it('tells apart texts whose characters are reordered', () => {
    expect(same('Summary Ten years of work.', 'Summray Ten years of work.')).toBe(false)
  })

  it('tells apart texts with two words swapped', () => {
    expect(same('V I S U A L B A S E L I N E Classic', 'BASELINE VISUAL Classic')).toBe(false)
  })

  it('keeps case and punctuation, which are the document’s own characters', () => {
    expect(same('Summary', 'SUMMARY')).toBe(false)
    expect(same('2020 - 2024', '2020 – 2024')).toBe(false)
  })
})
