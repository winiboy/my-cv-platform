import type { BuiltResumeTemplate } from '@/types/database'
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
  /** A `w:tcBorders` edge down one side of a table cell: the DOCX rule as tall as its row. */
  | 'cell-border'
  /** `w:pBdr` along the bottom of one paragraph: the DOCX horizontal rule. */
  | 'paragraph-bottom-border'
  /** A nested single-cell table carrying a fill, a border and its padding: the DOCX card. */
  | 'shaded-cell'
  /** A floating `w:drawing` of a PNG with an alpha channel: the DOCX translucent shape. */
  | 'floating-raster'
  /** A `w:pgBorders` edge, drawn on every page: the DOCX full-height page strip. */
  | 'page-border'
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

/**
 * `swiss-vocational-template.tsx`: the accent strip down the page's left edge
 * and the square before each section heading, both sized inline from here, in
 * CSS px at page scale.
 */
export const SWISS_VOCATIONAL_ACCENT = {
  stripPx: 8,
  squarePx: 10,
  /** The gap between the square and the heading text. */
  squareGapPx: 14,
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
  swissVocational: {
    accentStrip: {
      element: 'the red strip down the left edge of the page (`bg-red-700`, `SWISS_VOCATIONAL_ACCENT.stripPx` wide)',
      form: 'page-border',
      approximation:
        'A left page border (`w:pgBorders`) of red-700, measured from the page edge with no gap and as wide as ' +
        'the strip, so it runs the full height of every page as the Preview’s strip does in print. Word takes ' +
        'a border width in eighths of a point, so the strip’s width is rounded to the nearest eighth.',
    },
    headingSquare: {
      element: 'the red square before each section heading (`bg-red-700`, `SWISS_VOCATIONAL_ACCENT.squarePx` square)',
      form: 'shaded-run',
      approximation:
        'A red-700 shaded run holding one no-break space at the heading’s line, widened by character spacing ' +
        'to the square’s width, and followed by an unshaded spacer run for the gap. A run’s shading is as tall ' +
        'as its line rather than the square’s side, so the DOCX block is taller than it is wide. No glyph is ' +
        'written, so the heading text an ATS reads is the heading alone.',
    },
  },
  swissCommerce: {
    headerBand: {
      element: 'the navy band across the top of the page holding the photo, name, title and contact row',
      form: 'shaded-cell',
      approximation:
        'A full-width single-row table whose cells are shaded navy with no borders, the band’s padding as ' +
        'the cell margins and the page’s top and side margins set to zero so the band meets the paper’s ' +
        'edges as it does in the Preview. The body below keeps its own inset through the table and paragraph ' +
        'indents. The band is drawn on the first page only, as in the Preview.',
    },
    languagePill: {
      element: 'each language pill (`border-blue-200 bg-blue-50`, `SWISS_COMMERCE_GEOMETRY.pillRadius` corners)',
      form: 'shaded-run',
      approximation:
        'One run per pill, shaded blue-50 and bordered blue-200 (`w:bdr`), padded with a no-break space each ' +
        'side and with no-break spaces between its words so a pill is never split across lines; pills are ' +
        'separated by unshaded spaces and wrap as the Preview’s row does. Square corners where the Preview ' +
        'rounds them 4px, and the padding is a space wide rather than the Preview’s 11px: a run has no ' +
        'padding or corner radius.',
    },
  },
  swissTrades: {
    sidebar: {
      element: 'the dark column down the left of every page (`SWISS_TRADES_GEOMETRY.sidebarWidth` wide)',
      form: 'floating-raster',
      approximation:
        'The left cell of the two-column body table is shaded the column’s colour, and a solid PNG of the ' +
        'column’s width and the page’s height is anchored to the page behind the text in a 1-twip repeated ' +
        'header row, as `docx-modern.ts` draws its sidebar, so the column runs to the foot of every page ' +
        'as the printed Preview’s does rather than ending with the cell.',
    },
    skillTag: {
      element: 'each skill tag (`SWISS_TRADES_GEOMETRY.tagRadius` corners, `tagPaddingX` padding)',
      form: 'shaded-run',
      approximation:
        'One run per tag, shaded the tag colour and padded with a no-break space each side; tags are ' +
        'separated by unshaded spaces and wrap as the Preview’s row does. Square corners where the Preview ' +
        'rounds them 4px, the padding is a space wide rather than the Preview’s 8px, and the shading is the ' +
        'height of the line rather than the tag’s box: a run has no padding or corner radius.',
    },
  },
  swissHealth: {
    headingPill: {
      element: 'each section heading’s pill (`SWISS_HEALTH_GEOMETRY.pillRadius` corners, `pillPaddingX` × `pillPaddingY` padding)',
      form: 'shaded-run',
      approximation:
        'The heading’s spaced capitals and a no-break space each side, widened by character spacing to the ' +
        'pill’s horizontal padding, all shaded the pill colour, on an exact line as tall as the pill (its ' +
        'text line plus its vertical padding): under an exact line Word shades a run the full height of its ' +
        'line, so the shading is the pill’s box. The text is raised by half the vertical padding, since Word ' +
        'lays the extra height of an exact line above the glyphs. Square ends where the Preview draws ' +
        'half-circles: a run has no corner radius.',
    },
    entryBar: {
      element: 'the thin bar down the left of each dated entry (`SWISS_HEALTH_GEOMETRY.entryBar` wide)',
      form: 'cell-border',
      approximation:
        'Each entry is a one-row borderless table whose date cell has a single left border of the bar’s ' +
        'colour and width, rounded to Word’s eighths of a point, so the bar runs the full height of the entry ' +
        'as the Preview’s does. One table per entry, so the gap between two entries carries no bar.',
    },
  },
  swissFinance: {
    headerRule: {
      element: 'the double green rule under the header (`SWISS_FINANCE_GEOMETRY.headerRule` wide, CSS `double`)',
      form: 'paragraph-bottom-border',
      approximation:
        'A `double` bottom border of the accent colour on a paragraph drawing no text, placed the rule’s gap ' +
        'below the header, spanning the text width as the Preview’s does. Word sizes each of a double border’s ' +
        'two lines in eighths of a point and sets its own gap between them, where CSS divides the declared ' +
        'width into thirds: the two lines are 1px each, the gap is Word’s.',
    },
    headingRule: {
      element: 'the thin grey rule under each section heading (`SWISS_FINANCE_GEOMETRY.headingRule` wide)',
      form: 'paragraph-bottom-border',
      approximation:
        'A `single` bottom border of the rule colour on the heading’s own paragraph, its width rounded to ' +
        'Word’s eighths of a point and its distance from the text (`headingRuleGap`) in whole points, so it ' +
        'spans the text width under the heading as the Preview’s border does.',
    },
  },
  swissEngineering: {
    column: {
      element:
        'the light column down the right of every page (`SWISS_ENGINEERING_GEOMETRY.columnWidth` wide) and the blue ' +
        'bar on its left edge (`columnBar` wide)',
      form: 'floating-raster',
      approximation:
        'Two solid PNGs, the bar’s width at the column’s left edge and the rest of the column’s width beside it, ' +
        'each the page’s height, are anchored to the page behind the text in the first cell of a 1-twip ' +
        'repeated header row, as `docx-swiss-trades.ts` draws its dark column, the bar stacked in front of the ' +
        'fill, so the column and its bar run from the top to the foot of every page as the printed Preview’s ' +
        'do. The right cell of the body table carries no shading and no border: Word paints both over drawings ' +
        'behind the text, which hid the page-high bar under a shorter cell border.',
    },
    projectCard: {
      element:
        'each project card (`SWISS_ENGINEERING_GEOMETRY.cardBorder` border, `cardBar` left edge, `cardRadius` corners)',
      form: 'shaded-cell',
      approximation:
        'A one-cell table per project, shaded the card colour, with single top, right and bottom borders of the ' +
        'card’s border colour and a thick left border of the bar colour, each rounded to Word’s eighths of a ' +
        'point, the card’s padding as the cell margins, and a spacer paragraph between two cards for their gap. ' +
        'Square corners where the Preview rounds them 4px: a table cell has no corner radius.',
    },
  },
  swissIt: {
    headerBand: {
      element: 'the dark band across the top of the page holding the name, the CV title, the contact lines and the photo',
      form: 'shaded-cell',
      approximation:
        'A full-width single-row table whose cells are shaded the band’s colour with no borders, floating at ' +
        'the page’s origin so it meets the paper’s top and side edges while the section keeps the top margin ' +
        'every later page needs, the body flowing below it at the Preview’s gap; the band’s padding as the ' +
        'cell margins, the round photo in its last cell. The band is drawn on the first page only, as in the ' +
        'Preview.',
    },
    tag: {
      element:
        'each skill and technology tag (`SWISS_IT_GEOMETRY.tagBorder` outline, `tagRadius` pill corners, `tagPaddingX` padding)',
      form: 'shaded-run',
      approximation:
        'One run per tag, shaded the tag’s fill and outlined in the tag’s border colour (`w:bdr`), padded with ' +
        'a no-break space each side and with no-break spaces between its words, so a tag is never split; ' +
        'two tags are parted by a widened space and a zero-width space, the break opportunity, as ' +
        '`docx-swiss-trades.ts` parts its tags. Square ends where the Preview draws a pill, and the padding is ' +
        'a space wide rather than the Preview’s 10px: a run has no padding or corner radius.',
    },
    projectCard: {
      element: 'each project card (`SWISS_IT_GEOMETRY.cardBorder` border, `cardRadius` corners), two to a row',
      form: 'cell-border',
      approximation:
        'One table per row of cards: two cells the card’s width with single borders of the card’s border ' +
        'colour on all four sides, rounded to Word’s eighths of a point, the card’s padding as the cell ' +
        'margins, and an unbordered cell between them for the gap; the cards of a row share its height as ' +
        'the Preview’s grid does, an odd last card stays in the left column, and a spacer paragraph parts ' +
        'two rows. Square corners where the Preview rounds them 6px: a table cell has no corner radius.',
    },
  },
} as const satisfies Readonly<Record<BuiltResumeTemplate, Readonly<Record<string, PreviewGraphic>>>>

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
