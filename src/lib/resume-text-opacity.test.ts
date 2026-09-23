import { describe, expect, it } from 'vitest'
import { compositeOver, convertCssColour } from '../../e2e/parity/colour'
import { compositeOverOpaque, PREVIEW_TEXT_ALPHA, type PreviewAlpha } from './resume-text-opacity'

/**
 * Part 3 US-006: the alphas the DOCX generators composite with, and the
 * compositing itself.
 *
 * That each alpha is the one its template actually draws — written the way the
 * template writes it, on no more and no fewer elements — is checked by
 * `resume-palette.test.ts`, which already reads every template's source and
 * fails closed on a form it cannot read. This file pins the values themselves,
 * the backdrop each template composites against, and the arithmetic.
 */

const alphaOf = (entry: PreviewAlpha) => entry.alpha

describe('PREVIEW_TEXT_ALPHA', () => {
  it('holds the translucency each template draws', () => {
    expect(
      Object.fromEntries(
        Object.entries(PREVIEW_TEXT_ALPHA).map(([template, elements]) => [
          template,
          Object.fromEntries(
            Object.entries(elements as Readonly<Record<string, PreviewAlpha>>).map(([name, entry]) => [
              name,
              alphaOf(entry),
            ]),
          ),
        ]),
      ),
    ).toEqual({
      professional: { sidebarSecondary: 0.8 },
      modern: { contactLabel: 0.6, educationSchool: 0.8, languageLevel: 0.7, certIssuer: 0.7, certDate: 0.6 },
      classic: {},
      minimal: {},
      creative: { headerSummary: 0.9, headerLinks: 0.8 },
    })
  })

  it('declares nothing opaque and nothing invisible', () => {
    for (const [template, elements] of Object.entries(PREVIEW_TEXT_ALPHA)) {
      for (const [name, entry] of Object.entries(elements as Readonly<Record<string, PreviewAlpha>>)) {
        expect(entry.alpha, `${template} ${name}`).toBeGreaterThan(0)
        expect(entry.alpha, `${template} ${name}`).toBeLessThan(1)
      }
    }
  })

  it('spells each entry in the form its template writes it', () => {
    for (const [template, elements] of Object.entries(PREVIEW_TEXT_ALPHA)) {
      for (const [name, entry] of Object.entries(elements as Readonly<Record<string, PreviewAlpha>>)) {
        const where = `${template} ${name}`
        if (entry.source === 'inline') {
          expect(entry.css, where).toBe(`rgba(255,255,255,${entry.alpha})`)
        } else {
          // A Tailwind opacity number is the percentage, so the utility carries the value.
          expect(Number(/(\d{1,3})$/.exec(entry.utility)?.[1]), where).toBe(entry.alpha * 100)
        }
      }
    }
  })
})

describe('compositeOverOpaque', () => {
  it('returns bare uppercase six-digit hex', () => {
    expect(compositeOverOpaque('#FFFFFF', 0.8, '#1F7A4D')).toMatch(/^[0-9A-F]{6}$/)
  })

  it('accepts either hex spelling on either side', () => {
    expect(compositeOverOpaque('FFFFFF', 0.7, '1F7A4D')).toBe(compositeOverOpaque('#ffffff', 0.7, '#1f7a4d'))
  })

  it('returns the foreground at full alpha and the backdrop at none', () => {
    expect(compositeOverOpaque('#FFFFFF', 1, '#1F7A4D')).toBe('FFFFFF')
    expect(compositeOverOpaque('#FFFFFF', 0, '#1F7A4D')).toBe('1F7A4D')
  })

  /**
   * The browser blends the sRGB values it stores, without linearising them.
   * Linear-light compositing of the same three inputs is much lighter — this
   * pins the difference so the space cannot be changed unnoticed.
   */
  it('composites in sRGB as encoded, not in linear light', () => {
    const srgb = compositeOverOpaque('#FFFFFF', 0.6, '#1F7A4D')
    expect(srgb).toBe('A5CAB8')

    const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
    const linear = [0x1f, 0x7a, 0x4d]
      .map((back) => 0.6 * toLinear(1) + 0.4 * toLinear(back / 255))
      .map((v) => Math.round(toSrgb(v) * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    expect(linear).not.toBe(srgb)
  })

  /**
   * The two sides of a parity row must not disagree over rounding: the DOCX run
   * is written here, and the Preview's own computed colour is composited by
   * `e2e/parity/colour.ts`. Both quantise the alpha to eight bits first.
   */
  it.each(
    Object.values(PREVIEW_TEXT_ALPHA).flatMap((elements) =>
      Object.values(elements as Readonly<Record<string, PreviewAlpha>>).map(alphaOf),
    ),
  )('at alpha %s agrees with the parity check, channel for channel', (alpha) => {
    for (const backdrop of ['#1F7A4D', '#E86E30', '#06327A', '#693AD4', '#000000', '#FFFFFF']) {
      const parity = compositeOver(
        { hex: '#FFFFFF', alpha: Math.round(alpha * 255) },
        { hex: backdrop, alpha: 255 },
      )
      expect(`#${compositeOverOpaque('#FFFFFF', alpha, backdrop)}`, `${alpha} over ${backdrop}`).toBe(parity.hex)
    }
  })

  /**
   * A Tailwind opacity modifier is `color-mix(in oklab, …, transparent)`, and
   * Chromium computes it to `oklab()`. These are the exact strings it gave for
   * creative's `text-white/90` and `text-white/80` in a measured probe; the
   * parity check's converter must read them as white at that alpha, or the
   * creative rows compare the wrong colour.
   */
  it.each([
    ['oklab(0.999994 0.0000455678 0.0000200868 / 0.9)', 230],
    ['oklab(0.999994 0.0000455677 0.0000200868 / 0.8)', 204],
  ])('composites %s, which is how Chromium computes a Tailwind opacity modifier', (css, alpha) => {
    const computed = convertCssColour(css)
    expect(computed.hex).toBe('#FFFFFF')
    expect(computed.alpha).toBe(alpha)
    expect(`#${compositeOverOpaque(computed.hex, alpha / 255, '#693AD4')}`).toBe(
      compositeOver(computed, { hex: '#693AD4', alpha: 255 }).hex,
    )
  })

  it('rejects an alpha outside 0 to 1 and a colour that is not six hex digits', () => {
    expect(() => compositeOverOpaque('#FFFFFF', 1.5, '#000000')).toThrow(/not a fraction/)
    expect(() => compositeOverOpaque('#FFFFFF', Number.NaN, '#000000')).toThrow(/not a fraction/)
    expect(() => compositeOverOpaque('#FFF', 0.5, '#000000')).toThrow(/foreground colour/)
    expect(() => compositeOverOpaque('#FFFFFF', 0.5, 'hsl(150, 60%, 30%)')).toThrow(/backdrop colour/)
  })
})
