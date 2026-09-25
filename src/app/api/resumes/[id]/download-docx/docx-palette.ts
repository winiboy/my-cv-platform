import { PREVIEW_PALETTE } from '@/lib/resume-palette'

/**
 * The Preview's palette as DOCX colours (bare uppercase `RRGGBB`): run colours,
 * paragraph borders and shading.
 *
 * Converted once, when this module loads, from the CSS `resume-palette.ts`
 * declares; see the DECISION there. A value this converter does not understand
 * throws on import, so a generator can never start with a colour it guessed.
 */

const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+|none)\s*\)$/i
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

/** Linear-light sRGB to the gamma-encoded transfer function (IEC 61966-2-1). */
function gammaEncode(linear: number): number {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
}

const toHexByte = (unit: number) => Math.round(clampUnit(unit) * 255).toString(16).padStart(2, '0')

/**
 * OKLCH to sRGB, by Björn Ottosson's published OKLab matrices: polar to
 * rectangular, OKLab to cone response (cubed), cone response to linear sRGB.
 * Out-of-gamut channels are clipped, as a browser clips them for display.
 */
function oklchToRgb(lightness: number, chroma: number, hueDegrees: number): [number, number, number] {
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((linear) => gammaEncode(clampUnit(linear))) as [number, number, number]
}

/**
 * Converts an opaque CSS colour in either form the Preview palette uses —
 * `oklch(L C H)` or `#rgb` / `#rrggbb` — to a DOCX run colour.
 *
 * @throws on any other form, including alpha, rather than approximating it.
 */
export function cssColourToDocxHex(css: string): string {
  const text = css.trim()

  const hex = HEX.exec(text)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1]
    return digits.toUpperCase()
  }

  const oklch = OKLCH.exec(text)
  if (oklch) {
    const lightness = parseFloat(oklch[1]) / (oklch[2] === '%' ? 100 : 1)
    const hue = oklch[4].toLowerCase() === 'none' ? 0 : parseFloat(oklch[4])
    return oklchToRgb(lightness, parseFloat(oklch[3]), hue).map(toHexByte).join('').toUpperCase()
  }

  throw new Error(`Cannot convert the Preview colour "${css}" to a DOCX run colour`)
}

type Palette = typeof PREVIEW_PALETTE

export type DocxPalette = {
  readonly [Template in keyof Palette]: { readonly [Element in keyof Palette[Template]]: string }
}

export const DOCX_PALETTE = Object.fromEntries(
  Object.entries(PREVIEW_PALETTE).map(([template, elements]) => [
    template,
    Object.fromEntries(Object.entries(elements).map(([element, colour]) => [element, cssColourToDocxHex(colour.css)])),
  ]),
) as DocxPalette
