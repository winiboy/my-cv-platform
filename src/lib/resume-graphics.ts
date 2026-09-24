import type { ResumeTemplate } from '@/types/database'
import { TAILWIND_SPACING_PX } from '@/lib/resume-line-height'
import { compositeOverOpaque } from '@/lib/resume-text-opacity'

/**
 * The graphics the resume Preview draws that carry no text of their own — bars,
 * pills, chips, rules and decorative shapes — the geometry each is drawn with,
 * and the form the DOCX draws it in.
 *
 * DECISION (Part 3 US-007): a graphic the Preview draws is drawn in the DOCX
 * with the nearest thing OOXML has — a row of shaded table cells, a shaded run,
 * a paragraph border, a shaded cell, a floating raster — and anything not drawn
 * is recorded here as `not-drawn` saying WHICH reason applies, never left out in
 * silence. The generators previously wrote text in place of most of these
 * (creative's level bars became "Fluent (4/5)", its pills became a bold purple
 * line) or nothing at all.
 *
 * `not-drawn` is not a claim that OOXML cannot: every one of these was built and
 * rendered through Word before it was recorded, and where the render worked and
 * the graphic is still not drawn, the entry says who decided that and why. The
 * first draft of this module claimed the header circles were inexpressible; they
 * were not, and they are drawn.
 *
 * Why this shape, and not the alternatives:
 * - The values live here, not in the generators, for the reason US-003 gave for
 *   the palette: a value copied into a generator drifts the moment the template
 *   changes. `resume-graphics.test.ts` reads the template sources and fails if
 *   any declaration here stops matching what the Preview draws.
 * - The templates are NOT changed to import these constants, for the reason
 *   US-006 gave (`resume-text-opacity.ts`): several of the values are written in
 *   the templates as Tailwind class names inside template literals, which the
 *   palette scan reads as string literals and could no longer read as colours if
 *   they became interpolations. The declare-and-drift-test shape is the one
 *   `CREATIVE_HEADING_BAR_STEP` in `resume-line-height.ts` already uses, and it
 *   is what keeps the Preview and its visual baselines provably untouched.
 * - Which colour each graphic is drawn in is NOT declared here. Colour has one
 *   home, `resume-palette.ts`, and each of these graphics resolves to an entry
 *   of it except the two the Preview draws translucent, which are not opaque
 *   colours: modern's skill-bar track, written as the composite over the
 *   sidebar, and creative's header circles, drawn with a real alpha channel.
 *   Both take their tint from the alpha declared here and their colour from the
 *   template's own white.
 *
 * Classic, minimal and professional draw no graphic of this kind; their empty
 * records are the statement that they draw none, and the drift test holds them
 * to it.
 */

/** What the DOCX draws for a Preview graphic. */
export type DocxGraphicForm =
  /** A nested one-row table whose cells carry the fill: the DOCX bar. */
  | 'shaded-cells'
  /** A run with `w:shd`: the DOCX pill or chip. */
  | 'shaded-run'
  /** `w:pBdr` down the left of consecutive paragraphs: the DOCX rule. */
  | 'paragraph-border'
  /** A nested single-cell table carrying a fill, a border and its padding: the DOCX card. */
  | 'shaded-cell'
  /** A floating `w:drawing` of a PNG with an alpha channel: the DOCX translucent shape. */
  | 'floating-raster'
  /** Nothing OOXML has draws it, or drawing it was rejected. `approximation` says which, and why. */
  | 'not-drawn'

export interface PreviewGraphic {
  /** The element the Preview draws, named as its template names it. */
  readonly element: string
  readonly form: DocxGraphicForm
  /** How the DOCX approximates it, or — for `not-drawn` — why it cannot. */
  readonly approximation: string
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * `modern-template.tsx`: the proficiency bar under every skill item. The track
 * is a 6px-tall rounded box filled `rgba(255,255,255,0.2)` over the sidebar, and
 * the fill is the user's accent colour across `levelPercent` of it.
 *
 * `levelPercent` is a constant in the Preview (`const level = 70`), not a stored
 * per-skill value: every bar is drawn at the same length. The DOCX draws the
 * same length, so the two agree; if the Preview ever reads a real level, this
 * constant and its drift test are where that lands.
 */
export const MODERN_SKILL_BAR = {
  levelPercent: 70,
  heightPx: 6,
  /** The track's alpha, from the template's `rgba(255,255,255,0.2)`. */
  trackAlpha: 0.2,
  /** How the template writes the track colour, for the drift test. */
  trackCss: 'rgba(255,255,255,0.2)',
} as const

/**
 * `creative-template.tsx`: each language's proficiency as five equal segments
 * with a 4px gap (`gap-1`), each `h-1.5` tall, filled or empty by level.
 */
export const CREATIVE_LANGUAGE_BAR = {
  segments: 5,
  heightStep: 1.5,
  gapStep: 1,
} as const

/**
 * How many of the five segments each level fills, exactly as the Preview's
 * conditions read. A level the Preview does not recognise fills none — which is
 * what it draws for one, and therefore what the DOCX draws for one too.
 */
export const CREATIVE_LANGUAGE_LEVEL_SEGMENTS: Readonly<Record<string, number>> = {
  Native: 5,
  Fluent: 4,
  Professional: 3,
  Intermediate: 2,
  Basic: 1,
}

/** The number of filled segments the Preview draws for a stored level. */
export function creativeLanguageBarSegments(level: string | null | undefined): number {
  return CREATIVE_LANGUAGE_LEVEL_SEGMENTS[level ?? ''] ?? 0
}

/**
 * `creative-template.tsx`: each experience entry is `pl-6` with a 12px dot at
 * `left-0 top-1` and a 2px line at `left-[5px] top-4` running down behind it.
 */
export const CREATIVE_TIMELINE = {
  gutterPx: 6 * TAILWIND_SPACING_PX,
  dotStep: 3,
  lineWidthPx: 2,
  lineLeftPx: 5,
} as const

/**
 * `creative-template.tsx`: each project sits in a `rounded-lg border-l-4 p-4`
 * card.
 */
export const CREATIVE_PROJECT_CARD = {
  rulePx: 4,
  paddingPx: 4 * TAILWIND_SPACING_PX,
} as const

/**
 * `creative-template.tsx`: the two `bg-white/10 rounded-full` discs the header
 * draws over its gradient, each positioned so part of it hangs outside the
 * header box and is clipped by its `overflow-hidden`.
 *
 * The offsets are measured from the header's own edges, so they are given here
 * as the Tailwind utilities write them: `-right-20 -top-20` on the 256px disc
 * and `-bottom-10 -left-10` on the 192px one, both outside the header's `p-10`.
 */
export const CREATIVE_HEADER_CIRCLES = {
  alpha: 0.1,
  /** The header's `p-10`, which both offsets are measured across. */
  paddingPx: 10 * TAILWIND_SPACING_PX,
  /** `absolute -right-20 -top-20 h-64 w-64` */
  topRight: { sizePx: 64 * TAILWIND_SPACING_PX, overhangPx: 20 * TAILWIND_SPACING_PX },
  /** `absolute -bottom-10 -left-10 h-48 w-48` */
  bottomLeft: { sizePx: 48 * TAILWIND_SPACING_PX, overhangPx: 10 * TAILWIND_SPACING_PX },
} as const

/** The height of a Tailwind `h-N` utility, in CSS px. */
export function graphicHeightPx(step: number): number {
  return step * TAILWIND_SPACING_PX
}

// ---------------------------------------------------------------------------
// What the DOCX draws for each
// ---------------------------------------------------------------------------

export const PREVIEW_GRAPHICS = {
  professional: {},
  modern: {
    skillBar: {
      element: 'the proficiency bar under each sidebar skill item',
      form: 'shaded-cells',
      approximation:
        'A one-row two-cell table the width of the sidebar text column, the first cell the accent colour ' +
        'across MODERN_SKILL_BAR.levelPercent of it and the second the track, at the bar’s own height. The ' +
        'track is translucent white over the sidebar fill, so it is written as the composite. Square corners: ' +
        'the Preview rounds the bar 3px and OOXML has no cell corner radius.',
    },
    technologyChip: {
      element: 'each project technology chip (`rounded bg-slate-100 px-2 py-1`)',
      form: 'shaded-run',
      approximation:
        'One shaded run per technology, slate-100 behind slate-700 text, each padded with one no-break space ' +
        'a side and separated by unshaded spaces. The padding is a space wide, not the Preview’s 8px: a run ' +
        'has no padding property. Square corners, and the 4px vertical padding is not drawn either — a run’s ' +
        'shading is exactly as tall as its line.',
    },
  },
  classic: {},
  minimal: {},
  creative: {
    languageBar: {
      element: 'the five-segment proficiency bar under each language',
      form: 'shaded-cells',
      approximation:
        'A one-row table of five shaded cells separated by four unshaded gap cells, purple-500 for a filled ' +
        'segment and slate-200 for an empty one, at the bar’s own height. A filled segment is a ' +
        'purple-500-to-pink-500 gradient in the Preview and takes the first stop, as every other gradient in ' +
        'this document does. Square corners.',
    },
    technologyPill: {
      element: 'each project technology pill (`rounded-full bg-gradient-to-r px-3 py-1`)',
      form: 'shaded-run',
      approximation:
        'One shaded run per technology, purple-500 behind bold white text, each padded with one no-break space ' +
        'a side and separated by unshaded spaces. The fill is the gradient’s first stop. The padding is a ' +
        'space wide, not the Preview’s 12px, the ends are square where the Preview draws a full radius, and ' +
        'the 4px vertical padding is not drawn — a run’s shading is exactly as tall as its line.',
    },
    timelineLine: {
      element: 'the vertical line down each experience entry',
      form: 'paragraph-border',
      approximation:
        'A left border on every paragraph of the entry, 2px of purple-300 held CREATIVE_TIMELINE.lineLeftPx ' +
        'from the entry’s left edge by the paragraph indent. Solid, where the Preview fades it to transparent: ' +
        'a border has one colour. It runs the whole entry, where the Preview starts it below the dot.',
    },
    timelineDot: {
      element: 'the round marker at the top of each experience entry',
      form: 'not-drawn',
      approximation:
        'NOT DRAWN, by an owner decision, and not for want of a way. A "●" run at the head of the entry was ' +
        'built and rendered, and it looked right; it was rejected because the head of that entry is the job ' +
        'title, and a run there puts "●  " into the text an ATS reads as the title. Writing characters to stand ' +
        'for a shape is also the inverse of what the rest of this story does: the level bars carry no text ' +
        'because the Preview draws none. The floating-raster route the header circles take is open — the dot is ' +
        'a disc too — but it is anchored per experience entry rather than once per document, and it was not ' +
        'taken. What remains is the timeline rule, which already marks where each entry begins.',
    },
    projectCard: {
      element: 'the card each project sits in (`rounded-lg border-l-4 border-purple-500 bg-slate-50 p-4`)',
      form: 'shaded-cell',
      approximation:
        'A nested single-cell table: the cell’s shading is the slate-50 fill, its left border the 4px purple-500 ' +
        'rule and its margins the 16px padding on all four sides. Paragraph shading was measured first and ' +
        'rejected: Word paints it from the paragraph’s left INDENT to the right text margin, so the card can ' +
        'have the padding or the fill over it but not both, and it ignores the right indent entirely. A cell is ' +
        'the only thing in this format that carries a fill and its own padding. Square corners: OOXML has no ' +
        'cell corner radius.',
    },
    headerCircles: {
      element: 'the two `bg-white/10` circles over the header gradient',
      form: 'floating-raster',
      approximation:
        'A floating `w:drawing` each, anchored inside the header cell as `docx-modern.ts` already anchors the ' +
        'photo, holding a PNG disc whose alpha channel carries the Preview’s 10% white (`docx-disc.ts`). ' +
        '`behindDocument` is false: measured in Word 16, true puts the drawing behind the cell’s own fill, ' +
        'where it cannot be seen. Word clips each drawing to the cell, which is the Preview’s ' +
        '`overflow-hidden`, so the parts that hang outside the header are cut exactly as they are there. ' +
        'The top disc is anchored in the header’s first paragraph and the bottom one in a zero-height ' +
        'paragraph after the last, so it is placed from the header’s BOTTOM edge and does not drift when the ' +
        'summary wraps to more lines. TWO DIFFERENCES REMAIN. The Preview stacks the circles under the header ' +
        'text (`relative z-10` on the content) and OOXML has no layer between a cell’s fill and its text, so ' +
        'the DOCX draws them over it. The header text is white or near-white, so the wash moves it by ' +
        '0.1 × (255 − v) a channel: nothing at all on the opaque white title, and at most 3.9 — four levels ' +
        'once rounded — on the darkest of them, the green of the composited `text-white/80` links row. And ' +
        'the disc is a raster scaled to size, where the Preview draws a vector — the `docx` package exposes ' +
        'no shape primitive.',
    },
  },
} as const satisfies Readonly<Record<ResumeTemplate, Readonly<Record<string, PreviewGraphic>>>>

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * The colour modern's skill-bar track is drawn in: the Preview's translucent
 * white composited over the sidebar fill the DOCX itself draws behind it.
 *
 * The backdrop is the user's sidebar colour, resolved per request from the
 * layout model, so it is the caller's to supply — the same shape, and the same
 * `compositeOverOpaque`, US-006 gave translucent text. A fill and a run tint are
 * the same arithmetic; giving the fill a second implementation would be a second
 * answer to one question.
 */
export function modernSkillBarTrack(whiteHex: string, sidebarHex: string): string {
  return compositeOverOpaque(whiteHex, MODERN_SKILL_BAR.trackAlpha, sidebarHex)
}
