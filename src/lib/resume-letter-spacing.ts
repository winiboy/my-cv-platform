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
 * count holds at one font size only: modern's title was written as 15 twips
 * where its 0.15em over a 36px name draws 81.
 *
 * Why this shape, and not the alternatives:
 * - Four templates spell their letter spacing as Tailwind `tracking-*`
 *   utilities, which resolve through a CSS custom property a TypeScript module
 *   cannot import. Those are declared here in the form `tailwindcss/theme.css`
 *   writes them, and `resume-letter-spacing.test.ts` reads that file and fails
 *   if any of them drifts. Reading the CSS at request time was rejected for the
 *   reason US-003 rejected it for colour (`resume-palette.ts`).
 * - Modern's letter spacing is inline styles its template owns. The template
 *   imports them from here, so there is one copy, as `resume-line-height.ts`
 *   does for modern's and professional's line heights.
 * - `resume-letter-spacing.test.ts` guards this copy in both directions: every
 *   utility here must equal what Tailwind's theme declares, and every
 *   `tracking-*` utility and inline `letterSpacing` a template writes must be a
 *   value this module holds for that template, so a template cannot start
 *   drawing at a letter spacing the generators do not know.
 * - Which element a value sits on is not something that test can see. That is
 *   guarded by the per-element DOCX test (`docx-letter-spacing.test.ts`) and by
 *   `pnpm test:parity`, which compares the DOCX against the letter spacing the
 *   browser actually computes for each sampled element.
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
  professional: {
    /** The professional title, the document's `h1`. */
    title: TAILWIND_TRACKING['tracking-tight'],
    /** Every section heading `h2`, in the sidebar and in the main column. */
    heading: TAILWIND_TRACKING['tracking-wide'],
  },
  modern: {
    /** The name, the document's `h1`. */
    name: 0.15,
    /** The job title drawn on the accent bar. */
    jobTitleBar: TAILWIND_TRACKING['tracking-wide'],
    /** Both section headers: the sidebar's accent banner and the main column's ruled heading. */
    sectionHeading: 0.08,
    /** The uppercase label above each sidebar contact value. */
    contactLabel: 0.05,
    /** The uppercase name of each sidebar skill category. */
    skillCategory: 0.03,
  },
  classic: {
    /** The CV title, the document's `h1`. Classic's headings draw none. */
    title: TAILWIND_TRACKING['tracking-wide'],
  },
  minimal: {
    /** The CV title, the document's `h1`. */
    title: TAILWIND_TRACKING['tracking-tight'],
    /** Every section heading `h2`. */
    heading: TAILWIND_TRACKING['tracking-widest'],
  },
  creative: {
    /** The header title, the document's `h1`. Creative's headings draw none. */
    title: TAILWIND_TRACKING['tracking-tight'],
  },
} as const satisfies Readonly<Record<ResumeTemplate, Readonly<Record<string, number>>>>
