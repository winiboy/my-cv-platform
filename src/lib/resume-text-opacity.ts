import type { ResumeTemplate } from '@/types/database'

/**
 * The translucency the resume Preview draws its secondary white text with, as
 * the source that sets it declares it, and the compositing a DOCX run needs to
 * show the same tint.
 *
 * DECISION (Part 3 US-006): a DOCX run carries no alpha, so every run whose
 * Preview counterpart is translucent is written in the opaque colour that
 * translucency composites to over the colour the DOCX itself draws behind it —
 * the user's sidebar fill on professional and modern, the header fill on
 * creative. The generators previously wrote all of them as opaque white, which
 * is the one colour the Preview never shows there.
 *
 * Why this shape, and not the alternatives:
 * - Three templates spell their translucency three ways: professional as the
 *   Tailwind utility `opacity-80` on the element, creative as the colour
 *   modifiers `text-white/90` and `text-white/80`, modern as inline
 *   `rgba(255,255,255,…)` text colours. None of the three can be imported by a
 *   TypeScript module in the form the browser resolves it, so each is declared
 *   here in the form its source writes it, and `resume-text-opacity.test.ts`
 *   reads the template files and fails if any of them drifts, in either
 *   direction. Reading the templates at request time was rejected for the
 *   reason US-003 rejected reading `globals.css` (`resume-palette.ts`).
 * - Modern's alphas are NOT turned into imported constants the way its line
 *   heights (`resume-line-height.ts`) and letter spacings
 *   (`resume-letter-spacing.ts`) were. They sit inside complete colour strings
 *   that `resume-palette.test.ts` scans as literals; interpolating a constant
 *   into `rgba(255,255,255,${…})` would turn every one of those five colours
 *   into an expression that scan can no longer read as a colour, weakening the
 *   palette guard to close this one. The template files are therefore not
 *   touched by this story at all, which is also what keeps the Preview and its
 *   visual baselines provably unchanged.
 * - Which element an alpha sits on is not something the drift test can see.
 *   That is guarded by the per-element DOCX test (`docx-text-opacity.test.ts`)
 *   and by `pnpm test:parity`, which composites the alpha the browser actually
 *   computes for each sampled element over the backdrop it measures and
 *   compares that with the DOCX run.
 *
 * Classic and minimal draw no translucent text; their empty records are the
 * statement that they draw none, and the drift test holds them to it.
 */

/** How the Preview's source spells one element's translucency. */
export type PreviewAlpha =
  /** A Tailwind opacity utility on the element itself (`opacity-80`). */
  | { readonly source: 'opacity-utility'; readonly utility: string; readonly alpha: number }
  /** A Tailwind colour opacity modifier on a text colour (`text-white/90`). */
  | { readonly source: 'colour-modifier'; readonly utility: string; readonly alpha: number }
  /** An inline `rgba()` text colour in the template component. */
  | { readonly source: 'inline'; readonly css: string; readonly alpha: number }

/**
 * A Tailwind opacity number is a percentage: `opacity-80` is `opacity: 0.8`,
 * `text-white/90` is white at 90%. Neither resolves through a theme token, so
 * there is no CSS file to read the value out of — the utility's own number is
 * the value, and the drift test checks that the utility in the template is the
 * one named here.
 */
const percent = (utility: string, source: 'opacity-utility' | 'colour-modifier'): PreviewAlpha => {
  const match = /(?:^opacity-|\/)(\d{1,3})$/.exec(utility)
  if (!match) throw new Error(`"${utility}" is not a Tailwind opacity utility or modifier`)
  const percentage = Number(match[1])
  if (percentage > 100) throw new Error(`"${utility}" asks for more than full opacity`)
  return { source, utility, alpha: percentage / 100 }
}

/** `opacity-80` on the element: it composites its whole rendering over the backdrop. */
const opacityUtility = (utility: string): PreviewAlpha => percent(utility, 'opacity-utility')

/** `text-white/90`: the text colour itself carries the alpha. */
const colourModifier = (utility: string): PreviewAlpha => percent(utility, 'colour-modifier')

/** An inline `rgba(255,255,255,a)` text colour, as the template writes it. */
const inlineWhite = (alpha: number): PreviewAlpha => ({
  source: 'inline',
  css: `rgba(255,255,255,${alpha})`,
  alpha,
})

/**
 * Each template's entries are keyed by the Preview's own name for the element.
 * Elements the Preview draws at one alpha share an entry, so they can only be
 * written alike.
 */
export const PREVIEW_TEXT_ALPHA = {
  professional: {
    /**
     * Key-achievement descriptions, skill items and language levels: one
     * `opacity-80` div or span each, inside the `text-white` sidebar.
     */
    sidebarSecondary: opacityUtility('opacity-80'),
  },
  modern: {
    /** The uppercase label above each sidebar contact value. */
    contactLabel: inlineWhite(0.6),
    /** The school and year line under each sidebar education entry. */
    educationSchool: inlineWhite(0.8),
    /** The level beside each sidebar language. */
    languageLevel: inlineWhite(0.7),
    /** The issuer of each sidebar certification. */
    certIssuer: inlineWhite(0.7),
    /** The date of each sidebar certification. */
    certDate: inlineWhite(0.6),
  },
  classic: {},
  minimal: {},
  creative: {
    /** The summary in the header. */
    headerSummary: colourModifier('text-white/90'),
    /** The second header contact row: LinkedIn, GitHub and website. */
    headerLinks: colourModifier('text-white/80'),
  },
} as const satisfies Readonly<Record<ResumeTemplate, Readonly<Record<string, PreviewAlpha>>>>

/**
 * The templates that draw translucent text at all.
 *
 * What each composites against is not declared here, because nothing here
 * could hold a generator to it: the backdrop is not a constant. On professional
 * and modern it is the user's sidebar colour, resolved per request from the
 * layout model; on creative it is the solid fill its header paragraphs carry,
 * which since US-003 is the gradient's first stop (purple-600). Each generator
 * passes its own, and that it passes the right one is checked where it can be —
 * on generated documents, by `docx-text-opacity.test.ts` at two sidebar
 * colours, and against the browser by `pnpm test:parity`.
 */
export type TranslucentTemplate = 'professional' | 'modern' | 'creative'

const HEX = /^#?([0-9a-f]{6})$/i

function channels(hex: string, role: string): [number, number, number] {
  const match = HEX.exec(hex.trim())
  if (!match) throw new Error(`The ${role} "${hex}" is not a six-digit hex colour`)
  const digits = match[1]
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as [number, number, number]
}

/**
 * A translucent colour as it is seen: composited source-over onto the opaque
 * colour drawn behind it. Both arguments and the result are six-digit hex,
 * with or without a leading `#`; the result is returned without one, which is
 * the form a DOCX run colour takes.
 *
 * COMPOSITING SPACE: gamma-encoded sRGB, not linear light. That is what the
 * browser draws. CSS compositing happens in the destination's colour space,
 * which for these documents is plain sRGB, and Skia blends the 8-bit sRGB
 * values it stores without linearising them first; the browser only works in
 * linear light where a colour space asks for it, which nothing here does.
 * Linear-light compositing would give a visibly different, lighter tint — on
 * modern's 0.6 label over a dark sidebar it is tens of levels per channel —
 * and would not be the colour the Preview shows.
 *
 * ALPHA QUANTISATION: the alpha is rounded to eight bits before it is applied.
 * This is NOT what any one Chromium path does. Measured on painted pixels, an
 * `opacity` layer and an `rgba()` fill both come out a level low against this
 * arithmetic (white at 0.8 over `#0D0DA5` paints `#CECEED` where this writes
 * `CFCFED`, and at 0.7 `#B6B6E4` against `B7B7E4`), while the
 * `color-mix(in oklab, …)` a Tailwind opacity modifier compiles to comes out
 * exact there and a level high elsewhere (0.9 over `#693AD4` paints `#F0EBFB`
 * against `F0ECFB`). Every path measured is within one level per channel, which
 * is the parity check's declared tolerance, and no single rounding rule matches
 * them all. Eight-bit rounding is chosen because it is what `compositeOver` in
 * `e2e/parity/colour.ts` does to the browser's own computed colour, so the two
 * sides of a parity row are the same arithmetic and can only disagree if the
 * colours themselves do.
 */
export function compositeOverOpaque(foreground: string, alpha: number, backdrop: string): string {
  if (!(alpha >= 0 && alpha <= 1)) throw new Error(`An alpha of ${alpha} is not a fraction between 0 and 1`)
  const front = channels(foreground, 'foreground colour')
  const back = channels(backdrop, 'backdrop colour')
  const a = Math.round(alpha * 255) / 255
  return front
    .map((value, index) => Math.round(value * a + back[index] * (1 - a)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
