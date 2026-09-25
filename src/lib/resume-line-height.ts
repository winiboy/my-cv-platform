/**
 * The line heights the resume Preview draws, as the source that sets them
 * declares them. Every value is a unitless CSS `line-height`: a multiple of
 * the font size of the element it applies to.
 *
 * DECISION (Part 3 US-004): the DOCX generators take the line height of every
 * paragraph from this module and write it as Word exact spacing — the ratio
 * times the size of the run the generator writes (`exactLineSpacing` in
 * `docx-helpers.ts`) — instead of as a Word `auto` multiple, which scales the
 * font's own single-line height rather than its size.
 *
 * Where each value lives, and why it is here:
 * - Professional's and modern's line heights are inline styles their templates
 *   own. The templates import them from here, so there is one copy.
 * - Everything else comes from CSS a TypeScript module cannot import: Tailwind's
 *   preflight (`html { line-height: 1.5 }`, inherited by every element that
 *   sets nothing), its `text-*` and `leading-*` utilities, and `globals.css`'s
 *   `.formatted-content`. Those are declared here in the form their source
 *   writes them (`calc(1.25 / 0.875)`), and `resume-line-height.test.ts` reads
 *   the CSS and fails if any of them drifts. Reading the CSS at request time was
 *   rejected for the reason US-003 rejected it for colour (`resume-palette.ts`).
 *
 * Which element uses which value is the template's structure; each generator
 * names, at each paragraph, the template element it stands for.
 */

/** Tailwind preflight: `html, :host { line-height: 1.5 }`, inherited wherever nothing else is set. */
export const PREFLIGHT_LINE_HEIGHT = 1.5

/** Tailwind v4 `--text-*--line-height`, as `tailwindcss/theme.css` declares them. */
export const TAILWIND_TEXT_LINE_HEIGHT = {
  'text-xs': 1 / 0.75,
  'text-sm': 1.25 / 0.875,
  'text-base': 1.5 / 1,
  'text-lg': 1.75 / 1.125,
  'text-xl': 1.75 / 1.25,
  'text-2xl': 2 / 1.5,
  'text-3xl': 2.25 / 1.875,
  'text-4xl': 2.5 / 2.25,
} as const

/** Tailwind v4 `--leading-*` the templates use, as `tailwindcss/theme.css` declares them. */
export const TAILWIND_LEADING = {
  'leading-relaxed': 1.625,
} as const

export type TailwindTextUtility = keyof typeof TAILWIND_TEXT_LINE_HEIGHT
export type TailwindLeadingUtility = keyof typeof TAILWIND_LEADING

/**
 * `globals.css`: `.formatted-content { line-height: 1.4 !important }`, which
 * every descendant inherits `!important`. Formatted (HTML) text is rendered in
 * that class by `renderFormattedText`, so it draws at this height whatever the
 * element around it declares.
 */
export const FORMATTED_CONTENT_LINE_HEIGHT = 1.4

/**
 * Tailwind v4's spacing unit, `--spacing: 0.25rem` in `tailwindcss/theme.css`,
 * in CSS px at the 16px root. A spacing utility `h-N` is N of these.
 */
export const TAILWIND_SPACING_PX = 0.25 * 16

/** The height of a Tailwind `h-N` utility, in CSS px. */
export function tailwindHeightPx(step: number): number {
  return step * TAILWIND_SPACING_PX
}

/**
 * `creative-template.tsx`: each section heading is a flex row of a gradient bar
 * and the title, so the row is as tall as the taller of the two. The bar is
 * `h-6` in the left column and `h-8` in the right.
 */
export const CREATIVE_HEADING_BAR_STEP = {
  sidebar: 6,
  main: 8,
} as const

/** `professional-template.tsx`: headings, the name and entry titles; everything else. */
export const PROFESSIONAL_LINE_HEIGHT = {
  heading: 1.2,
  body: 1.35,
} as const

/** `modern-template.tsx`: the name; headings, labels and entry lines; running text and secondary lines. */
export const MODERN_LINE_HEIGHT = {
  title: 1.2,
  compact: 1.4,
  text: 1.5,
} as const

/**
 * `modern-template.tsx`: the vertical padding, in CSS px, of the accent bar the
 * job title is drawn on (`padding: 4px 12px`). The bar's box is its text line
 * plus this padding above and below.
 */
export const MODERN_TITLE_BAR_PADDING_Y_PX = 4

/**
 * Whether `renderFormattedText` renders `text` as formatted HTML inside
 * `.formatted-content` rather than as plain text through `formatText`. Both the
 * Preview and the DOCX generators decide with this one test.
 */
export function rendersAsFormattedContent(text: string): boolean {
  return /<[^>]+>/.test(text)
}

/**
 * The line height text rendered through `renderFormattedText` draws at: the
 * formatted-content height for HTML, otherwise the height of the element it is
 * rendered into.
 */
export function formattedTextLineHeight(text: string | null | undefined, elementLineHeight: number): number {
  return text && rendersAsFormattedContent(text) ? FORMATTED_CONTENT_LINE_HEIGHT : elementLineHeight
}
