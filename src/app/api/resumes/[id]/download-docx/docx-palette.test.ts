import { describe, expect, it } from 'vitest'
import { convertCssColour } from '../../../../../../e2e/parity/colour'
import { PREVIEW_PALETTE } from '@/lib/resume-palette'
import { cssColourToDocxHex, DOCX_PALETTE } from './docx-palette'

/**
 * Part 3 US-003: the generators' converter checked against the parity check's.
 *
 * `e2e/parity/colour.ts` is the converter `pnpm test:parity` uses to check the
 * browser's own conversion. It is a separate implementation, so agreeing with
 * it is evidence, not a tautology; the generators never import it.
 */

/**
 * The parity check's converter reads functional forms only, so a hex palette
 * entry is handed to it as the same colour in `rgb()`, as `verdicts.ts` does.
 */
function independent(css: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(css)
  const long = short ? `#${short.slice(1).map((digit) => digit + digit).join('')}` : css
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(long)
  const functional = hex ? `rgb(${hex.slice(1).map((pair) => parseInt(pair, 16)).join(', ')})` : css
  return convertCssColour(functional).hex.slice(1)
}

const entries = Object.entries(PREVIEW_PALETTE).flatMap(([template, elements]) =>
  Object.entries(elements).map(([element, colour]) => ({ template, element, css: colour.css })),
)

describe('cssColourToDocxHex', () => {
  it.each(entries)('$template $element ($css) converts as the parity check converts it', ({ css }) => {
    expect(cssColourToDocxHex(css)).toBe(independent(css))
  })

  it.each(['oklch(0 0 0)', 'oklch(1 0 0)', 'oklch(0.6 0.25 290)', 'oklch(0.65 0.2 145)', 'oklch(60% 0.2 240)'])(
    'converts %s as the parity check converts it, clipping out-of-gamut channels',
    (css) => {
      expect(cssColourToDocxHex(css)).toBe(independent(css))
    },
  )

  it('reads hex in either length, returning bare uppercase RRGGBB', () => {
    expect(cssColourToDocxHex('#374151')).toBe('374151')
    expect(cssColourToDocxHex('#1a1a1a')).toBe('1A1A1A')
    expect(cssColourToDocxHex('#fff')).toBe('FFFFFF')
  })

  it.each(['rgba(255, 255, 255, 0.6)', 'oklch(0.5 0 0 / 0.5)', 'white', '#12345', 'hsl(200 50% 50%)', ''])(
    'refuses %j rather than approximating it',
    (css) => {
      expect(() => cssColourToDocxHex(css)).toThrow(/Cannot convert/)
    },
  )
})

describe('DOCX_PALETTE', () => {
  it('holds every palette entry, converted', () => {
    for (const { template, element, css } of entries) {
      const converted = (DOCX_PALETTE as unknown as Record<string, Record<string, string>>)[template][element]
      expect(converted, `${template} ${element}`).toBe(independent(css))
    }
  })
})
