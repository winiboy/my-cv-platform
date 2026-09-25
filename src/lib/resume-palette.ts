import type { ResumeTemplate } from '@/types/database'

/**
 * The colours the resume Preview renders for text, borders and fills, as the
 * CSS its source declares.
 *
 * DECISION (Part 3 US-003): the DOCX generators take every colour that has a
 * Preview counterpart from this module, converted to hex when the generator
 * module loads (`docx-palette.ts`), instead of from hex tables of their own.
 * Those tables were copied from stock Tailwind v3 and drifted the moment
 * `globals.css` redefined the slate and purple tokens.
 *
 * Why this shape, and not the alternatives:
 * - Reading `globals.css` at request time would make every export depend on a
 *   source file being present next to a serverless function, which the build
 *   does not promise. Importing it as text needs a bundler rule the project
 *   does not have. Both were rejected.
 * - So the values are declared here once, in the form their source declares
 *   them (`oklch(...)`, `#374151`), never as pre-converted hex. Each entry says
 *   where the Preview gets it: a token a Tailwind utility resolves through —
 *   redefined in `globals.css`, or Tailwind's own default where `globals.css`
 *   leaves it alone — or a template's inline style.
 * - `resume-palette.test.ts` guards this copy in both directions: every value
 *   here must equal what `globals.css`, Tailwind's theme or the template
 *   declares, and every colour a template draws must be a palette entry or an
 *   exclusion naming its owner, with its number of uses pinned, so a new or
 *   recoloured element fails the test instead of drifting.
 * - Which element a colour sits on is not something that test can see. That
 *   is guarded by the per-element DOCX tests (`docx-text-palette.test.ts`) and
 *   by `pnpm test:parity`, which compares the DOCX against the colour the
 *   browser actually renders for each sampled element, converted by the
 *   browser and by its own converter, never by the one the generators use.
 *
 * Each template's entries are keyed by the Preview's own name for the colour:
 * the token for a utility class (`'slate-900'` for `text-slate-900` or
 * `border-slate-900`), a role name for an inline style. One Preview colour is
 * one entry, so two elements the Preview draws alike can only be written alike.
 *
 * A fill the Preview draws as a gradient takes the gradient's first stop:
 * creative's header is `from-purple-600 via-pink-500 to-orange-400` and the
 * DOCX fills it with purple-600, because DOCX shading is one solid colour. The
 * parity report records the gradient as a LIMITATION.
 *
 * Since US-007 the bars, pills, rules and markers the Preview draws are entries
 * here too; what each of them is DRAWN AS in the DOCX — a row of shaded cells, a
 * shaded run, a paragraph border, a glyph — is `resume-graphics.ts`, which holds
 * their geometry and nothing about colour.
 *
 * Not here: text the Preview draws translucent over a backdrop (US-006),
 * modern's skill-bar track, which is a translucent fill and therefore a
 * composite rather than a colour, and the user's sidebar and accent colours,
 * which come from the layout model.
 */

/** Tokens `globals.css` redefines in `@theme inline`. */
export const THEME_TOKENS = {
  'slate-50': 'oklch(0.98 0 0)',
  'slate-100': 'oklch(0.96 0 0)',
  'slate-200': 'oklch(0.92 0 0)',
  'slate-300': 'oklch(0.85 0 0)',
  'slate-400': 'oklch(0.65 0 0)',
  'slate-500': 'oklch(0.5 0 0)',
  'slate-600': 'oklch(0.35 0 0)',
  'slate-700': 'oklch(0.25 0 0)',
  'slate-800': 'oklch(0.15 0 0)',
  'slate-900': 'oklch(0.08 0 0)',
  'purple-500': 'oklch(0.6 0.25 290)',
  'purple-600': 'oklch(0.5 0.22 290)',
} as const

/** Tokens `globals.css` leaves to Tailwind's default theme (`tailwindcss/theme.css`). */
export const TAILWIND_DEFAULT_TOKENS = {
  white: '#fff',
  'purple-100': 'oklch(94.6% 0.033 307.174)',
  'purple-300': 'oklch(82.7% 0.119 306.383)',
  'purple-700': 'oklch(49.6% 0.265 301.924)',
} as const

export type ThemeToken = keyof typeof THEME_TOKENS
export type TailwindDefaultToken = keyof typeof TAILWIND_DEFAULT_TOKENS

export type PreviewColour =
  /** A Tailwind utility (`text-slate-900`, `border-slate-900`) resolving to a token `globals.css` redefines. */
  | { readonly source: 'theme'; readonly token: ThemeToken; readonly css: string }
  /** A Tailwind utility resolving to a token of Tailwind's default theme. */
  | { readonly source: 'tailwind'; readonly token: TailwindDefaultToken; readonly css: string }
  /** An inline style (`color`, `borderColor`) in the template component. */
  | { readonly source: 'inline'; readonly css: string }

const theme = (token: ThemeToken): PreviewColour => ({ source: 'theme', token, css: THEME_TOKENS[token] })
const tailwind = (token: TailwindDefaultToken): PreviewColour => ({
  source: 'tailwind',
  token,
  css: TAILWIND_DEFAULT_TOKENS[token],
})
const inline = (css: string): PreviewColour => ({ source: 'inline', css })

export const PREVIEW_PALETTE = {
  professional: {
    /** Title, main section headings and their underline, job and degree titles, achievement bullets. */
    heading: inline('oklch(0.2 0 0)'),
    /** Summary, achievements, role descriptions. */
    body: inline('oklch(0.3 0 0)'),
    /** Contact line, company and location, school, GPA. */
    meta: inline('oklch(0.4 0 0)'),
    /** Dates, school location. */
    date: inline('oklch(0.5 0 0)'),
    /** Sidebar text the sidebar's `text-white` draws opaque, and the sidebar heading rules. */
    white: tailwind('white'),
  },
  modern: {
    /** Name, project names. */
    'slate-900': theme('slate-900'),
    /** Summary, project descriptions, technologies. */
    'slate-700': theme('slate-700'),
    /** Main section headings, positions, companies. */
    heading: inline('#1a1a1a'),
    /** Header location, dates, role locations. */
    meta: inline('#6b7280'),
    /** Role descriptions and achievements. */
    experienceBody: inline('#374151'),
    /** Opaque sidebar text and icons, and the job title on the accent bar. */
    white: inline('#FFFFFF'),
    /** The project technology chips' fill (US-007). */
    'slate-100': theme('slate-100'),
  },
  classic: {
    /** Title, headings, names; the header rule. */
    'slate-900': theme('slate-900'),
    'slate-800': theme('slate-800'),
    'slate-700': theme('slate-700'),
    'slate-600': theme('slate-600'),
    /** Section heading rules. */
    'slate-400': theme('slate-400'),
  },
  minimal: {
    'slate-900': theme('slate-900'),
    'slate-700': theme('slate-700'),
    'slate-600': theme('slate-600'),
    'slate-500': theme('slate-500'),
    /** Section headings, certification dates, and the achievement bullet dot (`bg-slate-400`). */
    'slate-400': theme('slate-400'),
    /** Header rule. */
    'slate-300': theme('slate-300'),
    /** Section heading rules. */
    'slate-200': theme('slate-200'),
  },
  creative: {
    /** Title and first contact row in the header (`text-white`), and the dots between them (`bg-white`). */
    white: tailwind('white'),
    'purple-700': tailwind('purple-700'),
    /** Date badge fill. */
    'purple-100': tailwind('purple-100'),
    /** Headings, company and school names; the header fill (its gradient's first stop). */
    'purple-600': theme('purple-600'),
    /** Technology pills and language bar segments (their gradients' first stop), and the project card's rule (US-007). */
    'purple-500': theme('purple-500'),
    /** The experience timeline line (its gradient's first stop) (US-007). */
    'purple-300': tailwind('purple-300'),
    'slate-900': theme('slate-900'),
    'slate-800': theme('slate-800'),
    'slate-700': theme('slate-700'),
    'slate-600': theme('slate-600'),
    'slate-500': theme('slate-500'),
    /** A language bar's empty segments (US-007). */
    'slate-200': theme('slate-200'),
    /** The project card's fill (US-007). */
    'slate-50': theme('slate-50'),
  },
} as const satisfies Readonly<Record<ResumeTemplate, Readonly<Record<string, PreviewColour>>>>
