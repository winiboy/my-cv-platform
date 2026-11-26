import { PAGE_HEIGHT_PX } from './resume-page-size'

/**
 * The A4 sheets the Preview and the Editor's live preview draw a resume on
 * (swiss-templates-only-page-fidelity US-003), as arithmetic only: no React,
 * no DOM. `resume-sheet-pagination.ts` measures the rendered document and asks
 * `placeBlock` where each block goes; this module decides.
 *
 * THE PRINTED PDF IS THE AUTHORITY (FR-4). The rules below reproduce how
 * Chromium fragments a template printed with `globals.css`, in the screen's
 * coordinates: unscaled CSS px from the top of the document, which on screen
 * is the top of sheet 1.
 *
 *   - Every printed page is `PAGE_HEIGHT_PX` tall. Its text ends `pageBottom`
 *     above its foot, and on every page after the first it starts `pageTop`
 *     below its top: the template's page margins (`ResumePageMargins`, FR-3).
 *   - A block that print keeps whole (`break-inside: avoid`, an image, a
 *     table) and that would cross the foot of a page moves whole to the next
 *     page, where it starts at that page's top margin: the margin above it is
 *     truncated at the break, as CSS Fragmentation requires. It moves even
 *     when it is taller than a page's text area, and print then breaks inside
 *     it on the next page: Chromium prefers the break before it, between
 *     siblings, to one that violates `break-inside: avoid`. Only a block that
 *     nothing of its flow precedes on its page (`leading`) has no such break
 *     before it, and is broken where it stands.
 *   - A paragraph is broken between its lines, as print breaks it, with
 *     Chromium's default `orphans` and `widows` (neither `globals.css` nor a
 *     template sets them): at least `PRINT_ORPHANS` of its lines stay on the
 *     page and at least `PRINT_WIDOWS` move, or the whole paragraph moves
 *     (`breakLines`).
 *   - A block that starts below a page's foot margin starts the next page.
 *
 * These rules were checked against Chromium's own fragmentation, in a
 * fixed-height multi-column container, which LayoutNG fragments as it
 * fragments a printed page (2026-11-26): a tall `break-inside: avoid` block
 * after a sibling moves to the next column and is broken there, one at a
 * column's top is broken in place, and paragraphs break with orphans 2 and
 * widows 2.
 *
 * On screen the sheets are laid out one under the other, `SHEET_GAP_PX` apart,
 * so sheet k (0-based) starts at k × `SHEET_PITCH_PX`. A block moved to sheet
 * k + 1 is pushed down to that sheet's top margin; the gap and the margins are
 * the push's empty space. Nothing here is stored: it is derived from the
 * rendered document every time it changes, and print never sees it (FR-5).
 */

/** A template's printed page margins, in CSS px: its `*_GEOMETRY.pageTop` and `.pageBottom`. */
export interface ResumePageMargins {
  /** Space above the text on every page after the first. */
  pageTop: number
  /** Space below the text on every page. */
  pageBottom: number
}

/** The visible gap between two sheets on screen, unscaled. */
export const SHEET_GAP_PX = 24

/** From the top of one sheet to the top of the next, on screen. */
export const SHEET_PITCH_PX = PAGE_HEIGHT_PX + SHEET_GAP_PX

/**
 * How far a block may pass a page's foot and still fit. Chromium lays out in
 * 1/64 px units; a position measured through the Editor's scaling transform
 * and divided back carries floating-point noise well below this.
 */
export const SHEET_FIT_EPSILON_PX = 0.05

/** The y where sheet `index` (0-based) starts. */
export function sheetTop(index: number): number {
  return index * SHEET_PITCH_PX
}

/** The y where the text of sheet `index` may start: the sheet's top on page 1, its top margin after. */
export function sheetContentTop(index: number, margins: ResumePageMargins): number {
  return index === 0 ? 0 : sheetTop(index) + margins.pageTop
}

/** The y where the text of sheet `index` must end: above its foot margin. */
export function sheetContentBottom(index: number, margins: ResumePageMargins): number {
  return sheetTop(index) + PAGE_HEIGHT_PX - margins.pageBottom
}

/** The height of a page's text area after the first page: the most a block kept whole can be. */
export function sheetContentHeight(margins: ResumePageMargins): number {
  return PAGE_HEIGHT_PX - margins.pageTop - margins.pageBottom
}

/** The sheet a y falls on, or in the gap below. */
export function sheetIndexAt(y: number): number {
  return Math.max(0, Math.floor(y / SHEET_PITCH_PX))
}

/** The height `count` sheets and the gaps between them take on screen. */
export function sheetsHeight(count: number): number {
  return count * SHEET_PITCH_PX - SHEET_GAP_PX
}

/**
 * How many sheets a document whose lowest block ends at `contentBottom` is
 * drawn on: at least one.
 */
export function sheetCountFor(contentBottom: number): number {
  if (!Number.isFinite(contentBottom)) {
    throw new RangeError(`Invalid content bottom: ${contentBottom}`)
  }
  if (contentBottom <= 0) return 1
  return sheetIndexAt(contentBottom - SHEET_FIT_EPSILON_PX) + 1
}

/** A block of the document as laid out, in unscaled px from the document's top. */
export interface SheetBlock {
  top: number
  bottom: number
  /**
   * `keep`: print moves it whole to the next page rather than break inside it.
   * `split`: print may break inside it, between its children.
   */
  kind: 'keep' | 'split'
  /**
   * Nothing of the block's flow precedes it on its sheet: it was moved to the
   * sheet's top, or it is the first child of a block that starts the sheet.
   * Print has no break before such a block, so never moves it to the next
   * page. A block at its sheet's text top is leading whatever this says.
   */
  leading?: boolean
}

/** Where a block goes. */
export type SheetPlacement =
  /** It fits where it is. */
  | { action: 'stay' }
  /** It is pushed down so that its top is at `top`; place it again from there. */
  | { action: 'move'; top: number }
  /** It crosses a sheet's foot and print breaks inside it: place its children. */
  | { action: 'split' }

/**
 * Where `block` goes on the sheets.
 *
 * @throws RangeError when a coordinate is not finite or the block ends above
 *   its top: a measurement like that is a bug upstream, not a layout.
 */
export function placeBlock(block: SheetBlock, margins: ResumePageMargins): SheetPlacement {
  if (!Number.isFinite(block.top) || !Number.isFinite(block.bottom) || block.bottom < block.top) {
    throw new RangeError(`Invalid block: top ${block.top}, bottom ${block.bottom}`)
  }

  const index = sheetIndexAt(block.top)
  const contentTop = sheetContentTop(index, margins)
  const contentBottom = sheetContentBottom(index, margins)

  // Below this sheet's text area, in its foot margin or the gap: the block
  // starts the next sheet.
  if (block.top >= contentBottom - SHEET_FIT_EPSILON_PX) {
    return { action: 'move', top: sheetContentTop(index + 1, margins) }
  }
  // In this sheet's top margin: the text starts below it.
  if (block.top < contentTop - SHEET_FIT_EPSILON_PX) {
    return { action: 'move', top: contentTop }
  }
  if (block.bottom <= contentBottom + SHEET_FIT_EPSILON_PX) {
    return { action: 'stay' }
  }

  const leading = block.leading === true || block.top <= contentTop + SHEET_FIT_EPSILON_PX
  if (block.kind === 'keep' && !leading) {
    return { action: 'move', top: sheetContentTop(index + 1, margins) }
  }
  return { action: 'split' }
}

/** Chromium's default `orphans`: lines of a paragraph kept at the foot of a page. */
export const PRINT_ORPHANS = 2

/** Chromium's default `widows`: lines of a paragraph carried to the top of the next page. */
export const PRINT_WIDOWS = 2

/** One line box of a paragraph, in unscaled px from the document's top. */
export interface SheetLine {
  top: number
  bottom: number
}

/** Where the lines of a paragraph go. */
export type SheetLinePlacement =
  /** Every line fits where it is. */
  | { action: 'stay' }
  /**
   * Line `line` and every line after it move down so that line `line`'s box
   * starts at `top`. `line` 0 moves the whole paragraph.
   */
  | { action: 'break'; line: number; top: number }

/**
 * Where print breaks the paragraph whose lines, from the first on its sheet,
 * are `lines`: after the last line that fits above the sheet's foot margin,
 * moved up as `orphans` and `widows` require.
 *
 *   - Fewer than `PRINT_WIDOWS` lines past the foot: lines are pulled back
 *     until `PRINT_WIDOWS` move.
 *   - Then fewer than `PRINT_ORPHANS` lines left on the sheet: the whole
 *     paragraph moves.
 *   - A `leading` paragraph (nothing of its flow before it on the sheet, as
 *     a paragraph's own continuation always is) cannot move whole: print
 *     breaks it at the first line that does not fit, whatever the rules ask.
 *     A first line that alone does not fit stays where it is.
 *
 * A paragraph longer than a sheet is broken again: call this with the lines
 * from the break on, `leading`.
 *
 * @throws RangeError when a line is not a box: a measurement bug upstream.
 */
export function breakLines(
  lines: readonly SheetLine[],
  margins: ResumePageMargins,
  leading: boolean,
): SheetLinePlacement {
  for (const line of lines) {
    if (!Number.isFinite(line.top) || !Number.isFinite(line.bottom) || line.bottom < line.top) {
      throw new RangeError(`Invalid line: top ${line.top}, bottom ${line.bottom}`)
    }
  }
  if (lines.length === 0) return { action: 'stay' }

  const index = sheetIndexAt(lines[0].top)
  const contentBottom = sheetContentBottom(index, margins)
  const overflow = lines.findIndex((line) => line.bottom > contentBottom + SHEET_FIT_EPSILON_PX)
  if (overflow < 0) return { action: 'stay' }

  let line = overflow
  if (lines.length - line < PRINT_WIDOWS) line = lines.length - PRINT_WIDOWS
  if (line < PRINT_ORPHANS) line = 0
  const startsSheet = leading || lines[0].top <= sheetContentTop(index, margins) + SHEET_FIT_EPSILON_PX
  if (line === 0 && startsSheet) {
    if (overflow === 0) return { action: 'stay' }
    line = overflow
  }
  return { action: 'break', line, top: sheetContentTop(index + 1, margins) }
}

/**
 * A block of the rendered document, as `paginateBlocks` sees it. The DOM
 * adapter (`resume-sheet-pagination.ts`) builds these from elements; a unit
 * test builds them from plain numbers.
 */
export interface SheetLayoutNode {
  /** Whether print moves it whole rather than break inside it. */
  readonly keep: boolean
  /** Its box now, in unscaled px from the document's top. Re-read after every move. */
  measure(): { top: number; bottom: number }
  /**
   * The blocks print may break between, in flow order; empty for a block that
   * cannot be broken between blocks (a paragraph, an image, a grid row).
   */
  children(): readonly SheetLayoutNode[]
  /**
   * Whether its children stand side by side (the columns of a two-column
   * template), each the start of its own flow, rather than one under another.
   */
  readonly sideBySide?: boolean
  /** For a paragraph, which print breaks between its lines: its lines. */
  readonly lines?: SheetLineFlow
  /** Push it down so that its top is at `top`; everything after it in its flow follows. */
  moveTo(top: number): void
}

/** The lines of a paragraph, as `paginateBlocks` sees them. */
export interface SheetLineFlow {
  /** Its line boxes now, in order, in unscaled px from the document's top. Re-read after every break. */
  measure(): readonly SheetLine[]
  /**
   * Push line `index` and every line after it down so that line `index`'s box
   * starts at `top`; the lines before it, and the paragraph's top, stay.
   */
  breakBefore(index: number, top: number): void
}

/**
 * The most times one block is moved: to the next sheet's top margin, and once
 * more when it starts in a top margin. A further move would mean the layout
 * does not follow the pushes, and the block is left where it is rather than
 * looping.
 */
const MAX_MOVES_PER_BLOCK = 4

/**
 * Lay `blocks`, the document's top-level blocks, out on the sheets: every
 * block that would cross a sheet's foot and that print keeps whole is moved to
 * the next sheet, every paragraph that crosses is broken between its lines,
 * and every other block that crosses is broken between its children. Blocks
 * side by side (the columns of a two-column template) are separate flows:
 * moving one never moves the other.
 *
 * @returns The y where the lowest placed block ends; `sheetCountFor` turns it
 *   into a sheet count.
 */
export function paginateBlocks(blocks: readonly SheetLayoutNode[], margins: ResumePageMargins): number {
  const placed: SheetLayoutNode[] = []

  /**
   * Break the paragraph `flow` as print breaks it, as often as it crosses a
   * sheet's foot. Returns the y to move the whole paragraph to instead, or
   * `null` once its lines are placed.
   */
  const placeLines = (flow: SheetLineFlow, leading: boolean): number | null => {
    let start = 0
    let fragmentLeading = leading
    // Every break moves `start` down by at least one line, so a paragraph of n
    // lines breaks at most n − 1 times; the bound only guards against a layout
    // that does not follow the breaks.
    for (let breaks = 0; ; breaks++) {
      const lines = flow.measure()
      if (start >= lines.length || breaks >= lines.length) return null
      const placement = breakLines(lines.slice(start), margins, fragmentLeading)
      if (placement.action === 'stay') return null
      if (start + placement.line === 0) return placement.top
      start += placement.line
      flow.breakBefore(start, placement.top)
      // The rest of the paragraph starts the next sheet.
      fragmentLeading = true
    }
  }

  const place = (node: SheetLayoutNode, leading: boolean): void => {
    let isLeading = leading
    for (let moves = 0; moves <= MAX_MOVES_PER_BLOCK; moves++) {
      const { top, bottom } = node.measure()
      const placement = placeBlock({ top, bottom, kind: node.keep ? 'keep' : 'split', leading: isLeading }, margins)
      if (placement.action === 'move' && moves < MAX_MOVES_PER_BLOCK) {
        node.moveTo(placement.top)
        isLeading = true
        continue
      }
      if (placement.action === 'split') {
        if (node.lines) {
          const wholeTo = placeLines(node.lines, isLeading)
          if (wholeTo !== null && moves < MAX_MOVES_PER_BLOCK) {
            node.moveTo(wholeTo)
            isLeading = true
            continue
          }
          placed.push(node)
          return
        }
        const children = node.children()
        if (children.length > 0) {
          const parentLeading = isLeading
          children.forEach((child, index) => place(child, parentLeading && (node.sideBySide === true || index === 0)))
          return
        }
      }
      // It fits, or it cannot be broken inside: it stays, crossing the edge
      // only where print would cross it too.
      placed.push(node)
      return
    }
  }

  // A top-level block is leading only by its position: at the top of sheet 1.
  blocks.forEach((block) => place(block, false))
  // Measured once everything has moved: a block's own later siblings never
  // move it, but reading every bottom after the last move costs one layout.
  return placed.reduce((lowest, node) => Math.max(lowest, node.measure().bottom), 0)
}
