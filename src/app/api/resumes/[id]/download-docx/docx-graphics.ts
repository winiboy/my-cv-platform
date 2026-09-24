import {
  BorderStyle,
  HeightRule,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
} from 'docx'
import { NO_TEXT_LINE, pxToTwips } from './docx-helpers'

/**
 * The OOXML shapes the generators draw the Preview's graphics with (US-007): a
 * row of shaded cells for a bar, a shaded run for a pill or a chip, and a single
 * border for a rule, whether it hangs off a paragraph or off a table cell.
 *
 * They live here rather than in a generator because modern and creative draw the
 * same shapes — a proficiency bar, a filled label — and two copies would be two
 * answers to one question. What differs between them is geometry and colour,
 * which each generator passes; `resume-graphics.ts` declares the geometry and
 * `resume-palette.ts` the colour.
 *
 * None of these has a corner radius: OOXML has none for a cell or a run, and
 * every one of these graphics is rounded in the Preview. That is recorded with
 * each approximation in `resume-graphics.ts`.
 *
 * Not here: the one graphic that is a shape rather than a box, creative's
 * translucent header discs, which are a raster (`docx-disc.ts`).
 */

/** No table border anywhere: these tables are fills, not rules. */
const NO_TABLE_BORDERS = {
  top: { style: BorderStyle.NONE },
  bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE },
  insideVertical: { style: BorderStyle.NONE },
} as const

const NO_CELL_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 } as const

/** One band of a bar: `fill` is null where the bar shows the paper through. */
export interface BarSegment {
  readonly widthTwips: number
  /** A DOCX colour (`RRGGBB`), or null for an unfilled gap. */
  readonly fill: string | null
}

/**
 * A bar, as a one-row table of shaded cells.
 *
 * The row is an EXACT height, so the bar is its Preview height whatever the
 * document's fonts do, and each cell holds one empty paragraph at
 * `NO_TEXT_LINE` — a table cell must end in a paragraph, and a paragraph with a
 * line height of one twip is the shortest that satisfies that without adding
 * height of its own (US-004: every paragraph carries exact spacing).
 *
 * The caller is responsible for what follows the bar: a table cannot carry
 * `spacing.after`, and the `docx` package appends an empty default-spaced
 * paragraph to any cell whose last child is a table, so a generator must always
 * put its own paragraph after the last bar in a cell.
 *
 * @param segments left to right; their widths are the bar's width.
 * @param heightTwips the bar's height, exactly.
 * @param indentTwips how far the bar sits from the containing cell's text edge.
 */
export function shadedCellBar(
  segments: readonly BarSegment[],
  heightTwips: number,
  indentTwips = 0,
): Table {
  if (segments.length === 0) throw new Error('A bar needs at least one segment')
  const widths = segments.map((segment) => segment.widthTwips)
  if (widths.some((width) => width <= 0)) throw new Error('Every bar segment needs a positive width')

  return new Table({
    rows: [
      new TableRow({
        height: { value: heightTwips, rule: HeightRule.EXACT },
        children: segments.map(
          (segment) =>
            new TableCell({
              children: [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
              width: { size: segment.widthTwips, type: WidthType.DXA },
              margins: NO_CELL_MARGINS,
              verticalAlign: VerticalAlign.TOP,
              ...(segment.fill
                ? { shading: { type: ShadingType.CLEAR, fill: segment.fill, color: 'auto' } }
                : {}),
            }),
        ),
      }),
    ],
    width: { size: widths.reduce((total, width) => total + width, 0), type: WidthType.DXA },
    columnWidths: [...widths],
    layout: TableLayoutType.FIXED,
    borders: NO_TABLE_BORDERS,
    ...(indentTwips > 0 ? { indent: { size: indentTwips, type: WidthType.DXA } } : {}),
  })
}

/**
 * The widths of a bar whose filled part is `filledPercent` of `widthTwips`, as
 * two segments. A bar at 0% or 100% is one segment, so the document never
 * carries a zero-width cell.
 */
export function proportionalBar(
  widthTwips: number,
  filledPercent: number,
  fill: string,
  track: string,
): BarSegment[] {
  const filled = Math.round((widthTwips * filledPercent) / 100)
  if (filled <= 0) return [{ widthTwips, fill: track }]
  if (filled >= widthTwips) return [{ widthTwips, fill }]
  return [
    { widthTwips: filled, fill },
    { widthTwips: widthTwips - filled, fill: track },
  ]
}

/**
 * A bar of `segments` equal bands separated by equal gaps, the first
 * `filledCount` of them filled.
 *
 * The bands divide what the gaps leave; the division's remainder is spread one
 * twip at a time over the leftmost bands, so the bar is exactly `widthTwips`
 * wide rather than up to `segments - 1` twips short of it.
 */
export function segmentedBar(
  widthTwips: number,
  segments: number,
  gapTwips: number,
  filledCount: number,
  fill: string,
  empty: string,
): BarSegment[] {
  const forBands = widthTwips - gapTwips * (segments - 1)
  const bandWidth = Math.floor(forBands / segments)
  let remainder = forBands - bandWidth * segments
  const bands: BarSegment[] = []
  for (let index = 0; index < segments; index += 1) {
    if (index > 0) bands.push({ widthTwips: gapTwips, fill: null })
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    bands.push({ widthTwips: bandWidth + extra, fill: index < filledCount ? fill : empty })
  }
  return bands
}

export interface PillRunOptions {
  readonly size: number
  readonly font: string
  readonly bold?: boolean
  /** The pill's text colour. */
  readonly color: string
  /** The pill's fill. */
  readonly fill: string
}

/**
 * A list of labels as shaded runs, with unshaded separators — the DOCX pill and
 * the DOCX chip.
 *
 * Each label is padded with one no-break space on each side. That stands in for
 * the Preview's horizontal padding without pretending to measure it: a space is
 * as wide as the font makes it, where the Preview's padding is 8px or 12px. The
 * Preview's vertical padding is not drawn at all — a run's shading is exactly as
 * tall as its line — and neither is its corner radius.
 */
export function pillRuns(labels: readonly string[], options: PillRunOptions): TextRun[] {
  const runs: TextRun[] = []
  labels.forEach((label, index) => {
    if (index > 0) {
      runs.push(new TextRun({ text: '  ', size: options.size, font: options.font }))
    }
    runs.push(
      new TextRun({
        text: ` ${label} `,
        bold: options.bold,
        size: options.size,
        color: options.color,
        font: options.font,
        shading: { type: ShadingType.CLEAR, fill: options.fill, color: 'auto' },
      }),
    )
  })
  return runs
}

/**
 * A single border standing in for a vertical rule the Preview draws: creative's
 * timeline line, as the left `w:pBdr` of every paragraph of an entry, and the
 * rule down its project card, as the left `w:tcBorders` of the card's cell.
 *
 * A paragraph border is drawn at the paragraph's left indent, offset `space`
 * points further left, and consecutive paragraphs carrying the same border are
 * drawn as one continuous rule; Word clamps `space` to 31 points. A cell border
 * is drawn at the cell's edge and ignores `space`, so a cell caller passes 0.
 *
 * @param widthPx the rule's width, converted to the eighths of a point OOXML takes.
 * @param spacePx how far left of the text the rule sits; 0 for a cell border.
 */
export function verticalRule(widthPx: number, colour: string, spacePx: number): IBorderOptions {
  return {
    style: BorderStyle.SINGLE,
    size: Math.max(2, Math.round((widthPx * 72 * 8) / 96)),
    color: colour,
    space: Math.min(31, Math.round((spacePx * 72) / 96)),
  }
}

/** A cell's or bar's height in twips, from the Preview's CSS px. */
export const graphicHeightTwips = (px: number): number => Math.max(1, pxToTwips(px))
