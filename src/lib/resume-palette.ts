import type { BuiltResumeTemplate } from '@/types/database'

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
  'red-700': 'oklch(50.5% 0.213 27.518)',
  'blue-50': 'oklch(97% 0.014 254.604)',
  'blue-100': 'oklch(93.2% 0.032 255.585)',
  'blue-200': 'oklch(88.2% 0.059 254.128)',
  'blue-300': 'oklch(80.9% 0.105 251.813)',
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
  swissVocational: {
    /** The accent strip at the left edge, the CV title and the square before each section heading. */
    'red-700': tailwind('red-700'),
    /** Name, contact labels, section headings, entry titles, skill categories, languages. */
    'slate-900': theme('slate-900'),
    /** The rule under the header. */
    'slate-800': theme('slate-800'),
    /** Contact values, summary, descriptions, achievements, skill items. */
    'slate-700': theme('slate-700'),
    /** Dates, companies, schools, issuers, language levels. */
    'slate-600': theme('slate-600'),
    /** Section heading rules and the dotted rule under each language. */
    'slate-300': theme('slate-300'),
  },
  swissCommerce: {
    /**
     * The header band, the section headings and their rules, and the skill
     * category labels. Inline: no Tailwind token is this navy, and the slate
     * tokens `globals.css` redefines are neutral greys.
     */
    navy: inline('#1f3a5f'),
    /** The name, on the band. */
    white: tailwind('white'),
    /** The CV title on the band, and the ring round the photo. */
    'blue-300': tailwind('blue-300'),
    /** The contact details on the band. */
    'blue-100': tailwind('blue-100'),
    /** A language pill's border. */
    'blue-200': tailwind('blue-200'),
    /** A language pill's fill. */
    'blue-50': tailwind('blue-50'),
    /** Positions, degrees, certification names. */
    'slate-900': theme('slate-900'),
    /** Summary, descriptions, achievements, skills, language pill text. */
    'slate-800': theme('slate-800'),
    /** Dates, companies, schools, issuers. */
    'slate-500': theme('slate-500'),
  },
  /**
   * Every colour is inline: the mockup's slate is blue-grey and its oranges
   * are fixed, and the slate tokens `globals.css` redefines are neutral greys.
   */
  swissTrades: {
    /** The dark column. */
    sidebar: inline('#334155'),
    /** A skill tag's fill. */
    tag: inline('#475569'),
    /** The photo's thin border; companies and schools under their entry's title. */
    muted: inline('#64748b'),
    /** Every line of the dark column: contact, captions, tags, certificates, languages. */
    sidebarText: inline('#f1f5f9'),
    /** The headings of the dark column. */
    sidebarHeading: inline('#fdba74'),
    /**
     * The CV title and the dates: orange-700, darker than the mockup's
     * orange-600 so small text on white meets WCAG AA (about 5.2:1).
     */
    accent: inline('#c2410c'),
    /** The rule that follows each main heading. */
    rule: inline('#fed7aa'),
    /** The name, the main headings, and each entry's bold first line. */
    ink: inline('#0f172a'),
    /** Summary, achievements and descriptions. */
    body: inline('#1e293b'),
  },
  /**
   * Every colour is inline: the mockup's teals are fixed, and the slate tokens
   * `globals.css` redefines are neutral greys where the mockup's are blue-grey.
   * Every text colour meets WCAG AA (4.5:1) on what it is drawn on.
   */
  swissHealth: {
    /** The name, the text of every heading pill, and the skill captions: teal-900, 9.5:1 on white, 8.4:1 on the pill. */
    heading: inline('#134e4a'),
    /**
     * The CV title and the dates: teal-700, darker than the mockup's teal
     * (about 3.1:1 on white) so small text meets WCAG AA (5.5:1).
     */
    accent: inline('#0f766e'),
    /** A heading pill's fill. */
    pill: inline('#ccfbf1'),
    /** The bar down the left of each entry, and the photo's ring. */
    rule: inline('#99f6e4'),
    /** The photo's fill, seen where the photo is transparent. */
    photoFill: inline('#f0fdfa'),
    /** Each entry's bold first line and a certificate's name: 17.9:1 on white. */
    ink: inline('#0f172a'),
    /** Schools, employers and issuers: 4.8:1 on white. */
    muted: inline('#64748b'),
    /** The contact line: 7.6:1 on white. */
    contact: inline('#475569'),
    /** Summary, achievements, descriptions, skills and languages: 14.6:1 on white. */
    body: inline('#1e293b'),
  },
  /**
   * Every colour is inline: the mockup's dark green is fixed, and the slate
   * tokens `globals.css` redefines are neutral greys where the mockup's are
   * blue-grey. Every text colour meets WCAG AA (4.5:1) on what it is drawn on.
   */
  swissFinance: {
    /** The CV title, every section heading, and the double rule under the header: green-800, 7.1:1 on white. */
    accent: inline('#166534'),
    /** The name, and the bold first part of an entry and of a table row: 17.9:1 on white. */
    ink: inline('#0f172a'),
    /** The contact line, the dates and the school under a degree: 7.6:1 on white. */
    muted: inline('#475569'),
    /** The summary, the rest of an entry's first line, achievements, descriptions, skills and languages: 14.6:1 on white. */
    body: inline('#1e293b'),
    /** The thin rule under each section heading, and the photo's border. */
    rule: inline('#cbd5e1'),
    /** The photo's fill, seen where the photo is transparent. */
    photoFill: inline('#f8fafc'),
  },
  /**
   * Every colour is inline: the mockup's blues are fixed, and the slate tokens
   * `globals.css` redefines are neutral greys where the mockup's are
   * blue-grey. Every text colour meets WCAG AA (4.5:1) on every background it
   * is drawn on: white, the light column, a project card.
   */
  swissEngineering: {
    /**
     * The CV title and every section heading: blue-700, the mockup's heading
     * blue, 6.7:1 on white and 6.1:1 on the light column. The mockup draws the
     * title a shade lighter (blue-600, 5.2:1 and 4.7:1); one accent serves both
     * with a wider margin over AA.
     */
    accent: inline('#1d4ed8'),
    /** The light column's bar down its left edge, and each project card's thick left edge: blue-600. */
    bar: inline('#2563eb'),
    /** The light column's fill. */
    column: inline('#f1f5f9'),
    /** A project card's fill. */
    card: inline('#f8fafc'),
    /** A project card's thin border. */
    cardBorder: inline('#bfdbfe'),
    /** The name, and the bold first line of an experience, a project, an education and a skill category: 17.9:1 on white, 16.3:1 on the column. */
    ink: inline('#0f172a'),
    /**
     * Dates, an experience's company line, and a project's technologies and
     * link: 4.8:1 on white, 4.6:1 on a card. Never drawn on the light column,
     * where it would fall under 4.5:1.
     */
    muted: inline('#64748b'),
    /** Running text, bullets, descriptions, and every plain line of the light column: 14.6:1 on white, 13.3:1 on the column. */
    body: inline('#1e293b'),
    /** The photo's light ring. */
    photoRing: inline('#cbd5e1'),
    /** The photo's fill, seen where the photo is transparent. */
    photoFill: inline('#e2e8f0'),
  },
} as const satisfies Readonly<Record<BuiltResumeTemplate, Readonly<Record<string, PreviewColour>>>>
