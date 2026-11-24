import { describe, expect, it } from 'vitest'
import { interTextWidthPx } from '@/test/inter-advance-widths'
import { INTER_REGULAR_ASCII_ADVANCES, interLinkWidthPx } from './inter-link-widths'

describe('interLinkWidthPx', () => {
  it('holds every printable ASCII advance equal to the font file’s own', () => {
    expect(INTER_REGULAR_ASCII_ADVANCES).toHaveLength(0x7e - 0x20 + 1)
    INTER_REGULAR_ASCII_ADVANCES.forEach((advance, index) => {
      const char = String.fromCharCode(0x20 + index)
      expect(advance, char).toBeCloseTo(interTextWidthPx(char, 400, 2048), 6)
    })
  })

  it('measures a link as the font file does', () => {
    const link = 'https://github.com/alineberset/reservation?tab=readme#install'
    expect(interLinkWidthPx(link, 13)).toBeCloseTo(interTextWidthPx(link, 400, 13), 6)
  })

  it('measures a character outside the table as the widest glyph, never as nothing', () => {
    expect(interLinkWidthPx('é', 2048)).toBe(Math.max(...INTER_REGULAR_ASCII_ADVANCES))
  })
})
