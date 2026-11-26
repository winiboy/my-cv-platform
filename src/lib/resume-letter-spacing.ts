import type { ResumeTemplate } from '@/types/database'

/**
 * The letter spacing the resume Preview draws, as the source that sets it
 * declares it. Every value is a CSS `letter-spacing` in `em`: a multiple of the
 * font size of the element it applies to.
 *
 * DECISION (Part 3 US-005): the DOCX generators take the letter spacing of
 * every run from this module and write it as Word character spacing — the em
 * times the size of the run the generator writes (`trackingSpacing` in
 * `docx-helpers.ts`) — instead of as a fixed twip count of their own. A fixed
 * count holds at one font size only.
 *
 * Why this shape, and not the alternatives:
 * - Templates that spell their letter spacing as Tailwind `tracking-*`
 *   utilities resolve it through a CSS custom property a TypeScript module
 *   cannot import. Those are declared here in the form `tailwindcss/theme.css`
 *   writes them, and `resume-letter-spacing.test.ts` reads that file and fails
 *   if any of them drifts. Reading the CSS at request time was rejected for the
 *   reason US-003 rejected it for colour (`resume-palette.ts`).
 * - A letter spacing a template writes as an inline style is imported by the
 *   template from here, so there is one copy.
 * - `resume-letter-spacing.test.ts` guards this copy in both directions: every
 *   utility here must equal what Tailwind's theme declares, and every
 *   `tracking-*` utility and inline `letterSpacing` a template writes must be a
 *   value this module holds for that template, so a template cannot start
 *   drawing at a letter spacing the generators do not know.
 * - Which element a value sits on is not something that test can see. That is
 *   guarded by each Swiss generator's own test.
 *
 * An element absent from a template's record draws no letter spacing: CSS
 * `letter-spacing` initialises to `normal`, no resume rule sets it (neither
 * `globals.css` nor Tailwind's preflight declares one for document text), and
 * no Tailwind `--text-*` size carries a tracking of its own.
 */

/** Tailwind v4 `--tracking-*`, in em, as `tailwindcss/theme.css` declares them. */
export const TAILWIND_TRACKING = {
  'tracking-tighter': -0.05,
  'tracking-tight': -0.025,
  'tracking-normal': 0,
  'tracking-wide': 0.025,
  'tracking-wider': 0.05,
  'tracking-widest': 0.1,
} as const

export type TailwindTrackingUtility = keyof typeof TAILWIND_TRACKING

/**
 * Each template's entries are keyed by the Preview's own name for the element.
 * Two elements the Preview spaces alike share an entry, so they can only be
 * written alike.
 */
export const PREVIEW_TRACKING = {
  swissVocational: {
    /** The CV title under the name, and every section heading. */
    caps: TAILWIND_TRACKING['tracking-widest'],
  },
  swissCommerce: {
    /** The CV title in the header band, and every section heading. */
    caps: TAILWIND_TRACKING['tracking-widest'],
  },
  swissTrades: {
    /** The CV title under the name, and every heading of both columns. */
    caps: TAILWIND_TRACKING['tracking-widest'],
  },
  swissHealth: {
    /** The text of every heading pill. */
    caps: TAILWIND_TRACKING['tracking-widest'],
  },
  swissFinance: {
    /** The name, the document's `h1`, in spaced capitals. */
    name: TAILWIND_TRACKING['tracking-widest'],
    /**
     * Every section heading `h2`: the mockup spaces its capitals far wider
     * than any Tailwind `tracking-*` utility, so the template imports this
     * value and writes it inline.
     */
    heading: 0.25,
  },
  swissEngineering: {
    /** Every section heading of both columns. */
    caps: TAILWIND_TRACKING['tracking-widest'],
  },
  /** No letter spacing: its monospace headings are drawn as typed, lower case. */
  swissIt: {},
  swissExecutive: {
    /** The CV title's spaced capitals. */
    caps: TAILWIND_TRACKING['tracking-widest'],
  },
  swissAcademic: {
    /** Every section heading's letter-spaced small capitals. */
    caps: TAILWIND_TRACKING['tracking-widest'],
  },
  swissFirstJob: {
    /** Every heading of the sidebar, in spaced capitals. */
    caps: TAILWIND_TRACKING['tracking-widest'],
  },
} as const satisfies Readonly<Record<ResumeTemplate, Readonly<Record<string, number>>>>
