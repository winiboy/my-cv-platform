import type { ResumeTemplate } from '@/types/database'

/**
 * The graphics the resume Preview draws that carry no text of their own — bars,
 * pills, chips, rules and decorative shapes — the geometry each is drawn with,
 * and the form the DOCX draws it in.
 *
 * DECISION (Part 3 US-007): a graphic the Preview draws is drawn in the DOCX
 * with the nearest thing OOXML has — a row of shaded table cells, a shaded run,
 * a paragraph border, a shaded cell, a floating raster — and anything not drawn
 * is recorded here as `not-drawn` saying WHICH reason applies, never left out in
 * silence.
 *
 * `not-drawn` is not a claim that OOXML cannot: every one of these was built and
 * rendered through Word before it was recorded, and where the render worked and
 * the graphic is still not drawn, the entry says who decided that and why.
 *
 * Why this shape, and not the alternatives:
 * - The values live here, not in the generators, for the reason US-003 gave for
 *   the palette: a value copied into a generator drifts the moment the template
 *   changes. `resume-graphics.test.ts` reads the template sources and fails if
 *   any declaration here stops matching what the Preview draws.
 * - The templates are NOT changed to import these constants: several of the
 *   values are written in the templates as Tailwind class names inside
 *   template literals, which the palette scan reads as string literals and
 *   could no longer read as colours if they became interpolations. The
 *   declare-and-drift-test shape keeps the Preview and its visual baselines
 *   provably untouched.
 * - Which colour each graphic is drawn in is NOT declared here. Colour has one
 *   home, `resume-palette.ts`, and each of these graphics resolves to an entry
 *   of it.
 */

/** What the DOCX draws for a Preview graphic. */
export type DocxGraphicForm =
  /** A run with `w:shd`: the DOCX pill or chip. */
  | 'shaded-run'
  /** A `w:tcBorders` edge down one side of a table cell: the DOCX rule as tall as its row. */
  | 'cell-border'
  /** `w:pBdr` along the bottom of one paragraph: the DOCX horizontal rule. */
  | 'paragraph-bottom-border'
  /** A nested single-cell table carrying a fill, a border and its padding: the DOCX card. */
  | 'shaded-cell'
  /** A floating `w:drawing` of a PNG: a fill that must reach the paper's edges on every page. */
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

// ---------------------------------------------------------------------------
// What the DOCX draws for each
// ---------------------------------------------------------------------------

export const PREVIEW_GRAPHICS = {
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
        'header row, so the column runs to the foot of every page ' +
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
  swissExecutive: {
    headerRule: {
      element: 'the gold rule under the header (`SWISS_EXECUTIVE_GEOMETRY.headerRule` thick)',
      form: 'paragraph-bottom-border',
      approximation:
        'The bottom border of an empty paragraph after the header, in the gold, its width rounded to Word’s ' +
        'eighths of a point, spanning the text width as the Preview’s rule does.',
    },
    summaryBox: {
      element: 'the summary’s cream box with its gold bar down the left (`summaryBar` wide, `summaryPadding*` padding)',
      form: 'shaded-cell',
      approximation:
        'A one-cell table the text width, shaded cream, with a single left border of the bar’s width in the ' +
        'gold and none elsewhere, the box’s padding as the cell margins; its runs are italic, as the Preview ' +
        'sets the box in italics.',
    },
    cardRule: {
      element: 'the gold rule along the top of each achievement card (`cardRule` thick), two cards to a row',
      form: 'cell-border',
      approximation:
        'One table per row of cards: two cells the card’s width with a single top border of the rule’s width ' +
        'in the gold and none elsewhere, the space under the rule as the cell’s top margin, and an unbordered ' +
        'cell between them for the gap; an odd last card stays in the left column.',
    },
  },
  swissAcademic: {
    headingRule: {
      element: 'the thin rule under every section heading (`SWISS_ACADEMIC_GEOMETRY.headingRule` thick, `headingRuleGap` below the text)',
      form: 'paragraph-bottom-border',
      approximation:
        'The heading paragraph’s bottom border in the rule’s colour, its width rounded to Word’s eighths of a point and its ' +
        'gap to the text rounded to whole points, spanning the text width as the Preview’s border does.',
    },
  },
  swissFirstJob: {
    sidebar: {
      element: 'the light violet sidebar down the left of every page (`SWISS_FIRST_JOB_GEOMETRY.sidebarWidth` wide)',
      form: 'floating-raster',
      approximation:
        'A solid PNG the sidebar’s width and the page’s height, anchored to the page behind the text in the first cell ' +
        'of a 1-twip repeated header row, as `docx-swiss-engineering.ts` draws its light column, so the sidebar runs ' +
        'from the paper’s top edge to its foot on every page, its margins included, as the printed Preview’s does. ' +
        'The sidebar’s cell carries no shading: Word paints a cell’s shading over drawings behind the text.',
    },
  },
} as const satisfies Readonly<Record<ResumeTemplate, Readonly<Record<string, PreviewGraphic>>>>
