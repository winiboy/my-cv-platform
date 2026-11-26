import { describe, expect, it } from 'vitest'
import { georgiaTextWidthPx } from './georgia-advance-widths'

/**
 * Spot checks of the advance-width table against the font files it was read
 * from (Georgia 2048 units per em): measured at 2048 px, a width is the glyph's
 * advance in font units.
 */
const units = (text: string, face: 'regular' | 'bold' | 'italic') => georgiaTextWidthPx(text, face, 2048)

describe('georgiaTextWidthPx', () => {
  it('reads the regular face', () => {
    expect(units(' ', 'regular')).toBe(494)
    expect(units('A', 'regular')).toBe(1374)
    expect(units('M', 'regular')).toBe(1899)
    expect(units('a', 'regular')).toBe(1032)
  })

  it('reads the bold face', () => {
    expect(units('A', 'bold')).toBe(1553)
    expect(units('M', 'bold')).toBe(2096)
    expect(units(' ', 'bold')).toBe(520)
  })

  it('reads the italic face, its old-style figures included', () => {
    expect(units('a', 'italic')).toBe(1173)
    expect(units('0', 'italic')).toBe(1257)
    expect(units('1', 'italic')).toBeLessThan(units('0', 'italic'))
  })

  it('covers the letters fr, de and it write, and the en dash the dates use', () => {
    for (const face of ['regular', 'bold', 'italic'] as const) {
      for (const character of 'éèàçÄÖÜäöüßìò–€') expect(units(character, face), `${character} ${face}`).toBeGreaterThan(0)
    }
  })

  it('sums the characters of a text, and adds letter spacing after each', () => {
    expect(units('AM', 'bold')).toBe(1553 + 2096)
    expect(georgiaTextWidthPx('AB', 'regular', 10, 0.1)).toBeCloseTo(georgiaTextWidthPx('AB', 'regular', 10) + 2, 10)
  })

  it('measures a character the table does not map as the face’s widest glyph, never narrower', () => {
    for (const face of ['regular', 'bold', 'italic'] as const) {
      const unmapped = units('一', face)
      expect(unmapped).toBeGreaterThanOrEqual(units('W', face))
      expect(unmapped).toBeGreaterThanOrEqual(units('M', face))
    }
  })
})
