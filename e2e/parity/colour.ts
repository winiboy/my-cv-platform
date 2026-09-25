/**
 * Part 2 US-008: colour conversion done without the browser, to check the browser.
 *
 * The Preview's colours are read with `getComputedStyle` and converted to
 * 8-bit sRGB by drawing them on a canvas. A canvas that silently failed to
 * parse a colour, or read back in greyscale, would turn every comparison into
 * a comparison of the wrong numbers. So every CSS colour the check compares is
 * converted a second time here, from the same computed string, with the
 * published OKLab matrices, and the collect test fails if the two disagree.
 */

export interface ConvertedColour {
  hex: string
  alpha: number
}

/**
 * Two colours match when no 8-bit channel differs by more than one level.
 *
 * Fixed before the first run, not fitted to it. Each side is converted to
 * 8-bit sRGB independently and each conversion rounds once, so one level is
 * quantisation; two or more is a different colour.
 */
export const COLOUR_CHANNEL_TOLERANCE = 1

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))

export function coloursAgree(a: ConvertedColour, b: ConvertedColour): boolean {
  if (a.alpha !== b.alpha) return false
  const [x, y] = [channels(a.hex), channels(b.hex)]
  return x.every((channel, i) => Math.abs(channel - y[i]) <= COLOUR_CHANNEL_TOLERANCE)
}

/**
 * Whether `colour` is `a` and `b` mixed at a single coverage strictly between
 * them — the anti-aliased pixel a rasteriser draws where an edge between the
 * two crosses it — with every channel within the tolerance, and distinct from
 * both ends.
 */
export function isBlendOf(colour: ConvertedColour, a: ConvertedColour, b: ConvertedColour): boolean {
  if (coloursAgree(colour, a) || coloursAgree(colour, b)) return false
  const [c, x, y] = [channels(colour.hex), channels(a.hex), channels(b.hex)]
  const span = x.map((value, i) => y[i] - value)
  const length = span.reduce((sum, d) => sum + d * d, 0)
  if (length === 0) return false
  const coverage = c.reduce((sum, value, i) => sum + (value - x[i]) * span[i], 0) / length
  if (coverage <= 0 || coverage >= 1) return false
  return c.every((value, i) => Math.abs(value - (x[i] + coverage * span[i])) <= COLOUR_CHANNEL_TOLERANCE)
}

/**
 * A translucent colour as it is actually seen: composited over the opaque
 * backdrop it is drawn on (source-over, 8-bit). DOCX runs carry no alpha, so
 * this is the colour a DOCX run would have to use to look the same.
 */
export function compositeOver(foreground: ConvertedColour, backdrop: ConvertedColour): ConvertedColour {
  if (backdrop.alpha !== 255) throw new Error(`Cannot composite over a translucent backdrop ${backdrop.hex}`)
  if (foreground.alpha === 255) return { hex: foreground.hex, alpha: 255 }
  const a = foreground.alpha / 255
  const [fr, fg, fb] = channels(foreground.hex)
  const [br, bg, bb] = channels(backdrop.hex)
  const mix = (f: number, b: number) => Math.round(f * a + b * (1 - a))
  return { hex: hexOf(mix(fr, br), mix(fg, bg), mix(fb, bb)), alpha: 255 }
}

const toByte = (unit: number) => Math.round(Math.min(1, Math.max(0, unit)) * 255)
const hexOf = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`

function encodeSrgb(linear: number): number {
  const sign = linear < 0 ? -1 : 1
  const magnitude = Math.abs(linear)
  return sign * (magnitude <= 0.0031308 ? 12.92 * magnitude : 1.055 * Math.pow(magnitude, 1 / 2.4) - 0.055)
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 255
  const value = token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token)
  return toByte(value)
}

/**
 * OKLab to 8-bit sRGB, by Björn Ottosson's published matrices: OKLab to cone
 * response (cubed), cone response to linear sRGB, then the sRGB transfer
 * function. Out-of-gamut channels are clipped, as a browser clips them.
 */
function oklabToHex(lightness: number, labA: number, labB: number): string {
  const l = (lightness + 0.3963377774 * labA + 0.2158037573 * labB) ** 3
  const m = (lightness - 0.1055613458 * labA - 0.0638541728 * labB) ** 3
  const s = (lightness - 0.0894841775 * labA - 1.291485548 * labB) ** 3

  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  return hexOf(toByte(encodeSrgb(red)), toByte(encodeSrgb(green)), toByte(encodeSrgb(blue)))
}

/** OKLab and OKLCH lightness, which CSS also allows as a percentage of 1. */
function parseLightness(token: string): number {
  return token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token)
}

/**
 * Converts a CSS colour: `rgb()`, `rgba()`, `hsl()`, `oklch()`, `oklab()` or
 * `color(srgb ...)`.
 *
 * `oklab()` is here because Chromium computes a Tailwind opacity modifier to
 * it: `text-white/90` is `color-mix(in oklab, var(--color-white) 90%,
 * transparent)`, whose computed value serialises as
 * `oklab(0.999994 0.0000455678 0.0000200868 / 0.9)`.
 */
export function convertCssColour(css: string): ConvertedColour {
  const text = css.trim()

  const rgb = /^rgba?\(([^)]*)\)$/.exec(text)
  if (rgb) {
    const [r, g, b, a] = rgb[1].split(/[\s,/]+/).filter(Boolean)
    return { hex: hexOf(Math.round(+r), Math.round(+g), Math.round(+b)), alpha: parseAlpha(a) }
  }

  const hsl = /^hsla?\(([^)]*)\)$/.exec(text)
  if (hsl) {
    const [hToken, sToken, lToken, a] = hsl[1].split(/[\s,/]+/).filter(Boolean)
    const hue = (((parseFloat(hToken) % 360) + 360) % 360) / 60
    const saturation = parseFloat(sToken) / 100
    const light = parseFloat(lToken) / 100
    const c = (1 - Math.abs(2 * light - 1)) * saturation
    const x = c * (1 - Math.abs((hue % 2) - 1))
    const [r1, g1, b1] =
      hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x]
    const offset = light - c / 2
    return { hex: hexOf(toByte(r1 + offset), toByte(g1 + offset), toByte(b1 + offset)), alpha: parseAlpha(a) }
  }

  const srgb = /^color\(srgb\s+([^)]*)\)$/.exec(text)
  if (srgb) {
    const [r, g, b, a] = srgb[1].split(/[\s/]+/).filter(Boolean)
    return { hex: hexOf(toByte(+r), toByte(+g), toByte(+b)), alpha: parseAlpha(a) }
  }

  const oklch = /^oklch\(([^)]*)\)$/.exec(text)
  if (oklch) {
    const [lToken, cToken, hToken, a] = oklch[1].split(/[\s/]+/).filter(Boolean)
    const lightness = parseLightness(lToken)
    const chroma = parseFloat(cToken)
    const hue = hToken === 'none' ? 0 : (parseFloat(hToken) * Math.PI) / 180
    return {
      hex: oklabToHex(lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)),
      alpha: parseAlpha(a),
    }
  }

  const oklab = /^oklab\(([^)]*)\)$/.exec(text)
  if (oklab) {
    const [lToken, aToken, bToken, alpha] = oklab[1].split(/[\s/]+/).filter(Boolean)
    return {
      hex: oklabToHex(parseLightness(lToken), parseFloat(aToken), parseFloat(bToken)),
      alpha: parseAlpha(alpha),
    }
  }

  throw new Error(`Cannot independently convert the computed colour "${css}"`)
}
