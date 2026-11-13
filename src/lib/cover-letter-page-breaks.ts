import { SWISS_LETTER_GEOMETRY_MM, SWISS_LETTER_PAGE_PX, mmToPx } from './cover-letter-swiss-letter'

/**
 * Where the printed pages of a cover letter break, derived from the letter's
 * laid-out lines (cover-letter-one-page, FR-1). The editor pane and the
 * preview window draw their page-break markers from this one computation, so
 * they cannot disagree on the count or the positions.
 *
 * Pure: no React, no DOM, nothing server-only. The input is plain data, so a
 * caller that estimates the lines instead of measuring them uses it as is.
 *
 * THE PRINTED PDF IS THE AUTHORITY (FR-2). This reproduces how Chromium
 * fragments the letter printed with `COVER_LETTER_PRINT_CSS`, in the
 * preview's coordinates (CSS px from the top of the letter, unscaled):
 *
 *   - the page and its margins are laid out in whole CSS px (see
 *     `printedMarginPx`);
 *   - `@page :first` has no top margin (the markup's top padding is the
 *     page's top margin), so page 1's content area ends at the page height −
 *     the bottom margin (`COVER_LETTER_FIRST_PAGE_BOTTOM_PX`);
 *   - a line whose bottom passes the current page's end does not fit, and it
 *     starts the next page, whose content area then ends
 *     `COVER_LETTER_CONTINUATION_PAGE_PX` below that line's top (a part's
 *     margin is dropped where it starts a page);
 *   - the letter sets no `orphans`, `widows` or `break-*`, so Chromium's
 *     defaults apply: a break inside a paragraph leaves at least
 *     `COVER_LETTER_ORPHANS` of its lines on the page before and moves at least
 *     `COVER_LETTER_WIDOWS` to the page after, moving the break up, or the
 *     whole paragraph, to keep them;
 *   - the print lifts the template's `min-height` and bottom padding, so
 *     nothing below the content bottom can start a page.
 *
 * Each break is reported at the top of the first line moved to the next page:
 * the y where the printed page's content ends.
 *
 * The result is derived state only: never stored, never exported.
 */

const geometry = SWISS_LETTER_GEOMETRY_MM

/** Chromium's default `orphans`: lines of a paragraph kept at the bottom of a page. */
export const COVER_LETTER_ORPHANS = 2

/** Chromium's default `widows`: lines of a paragraph carried to the top of the next page. */
export const COVER_LETTER_WIDOWS = 2

/**
 * How far a line may pass a page's end and still fit: Chromium lays out in
 * 1/64 px units, and a measured line converted from a scaled preview carries
 * floating-point noise far below that.
 */
const LINE_FIT_EPSILON_PX = 1 / 64

/**
 * How far content without lines may pass a page's end and still fit. A
 * height measured with `offsetHeight` is rounded to a whole px: a short
 * letter's `min-height` (the 1123 px page, less its 56.69 px bottom padding)
 * puts its content bottom 0.31 px past page 1's end, and it still prints on
 * one page.
 */
export const COVER_LETTER_PAGE_EDGE_TOLERANCE_PX = 1

/**
 * A print margin as Chromium lays it out: in whole CSS px. Chromium prints
 * the A4 page as 1123 px (`SWISS_LETTER_PAGE_PX`, not 1122.52), each margin
 * rounded to a whole px, so every page area is a whole number of px.
 * Measured on the PDF route's own `page.pdf` call for several margins: page 1
 * fits a line ending at 1066.00 px (not 1065.83), and a continuation page
 * holds 998 px (not 997.80).
 */
const printedMarginPx = (mm: number) => Math.round(mmToPx(mm))

/** Unscaled preview y where the first printed page's content area ends. */
export const COVER_LETTER_FIRST_PAGE_BOTTOM_PX = SWISS_LETTER_PAGE_PX.height - printedMarginPx(geometry.marginBottom)

/** Height of a continuation page's content area, between its top and bottom margins. */
export const COVER_LETTER_CONTINUATION_PAGE_PX =
  SWISS_LETTER_PAGE_PX.height - printedMarginPx(geometry.marginTop) - printedMarginPx(geometry.marginBottom)

/** One line box of the letter, in unscaled preview px. */
export interface CoverLetterLineBox {
  top: number
  bottom: number
  /**
   * The block (paragraph) the line belongs to: lines with the same value are
   * one paragraph, for `orphans` and `widows`. Any value, compared with `===`.
   */
  block: number
}

/** The letter as laid out, in unscaled preview px. */
export interface CoverLetterLayout {
  /** Every line box of the letter, in any order. */
  lines: readonly CoverLetterLineBox[]
  /** Where the letter's content ends: its height less the template's bottom padding. */
  contentBottom: number
}

export interface CoverLetterPageBreaks {
  /** Number of pages the letter prints on; at least 1. */
  pageCount: number
  /**
   * For each page but the last, top to bottom, the unscaled preview y where
   * the next page's content starts: the top of the first line moved to it.
   * Empty for one page.
   */
  boundaries: number[]
}

function assertFinite(value: number, what: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Invalid cover letter ${what}: ${value}`)
  }
}

/**
 * Where to break when `lines[overflow]` is the first line that does not fit
 * the page starting at `lines[pageStart]`: moved up as `orphans` and `widows`
 * require. Never at `pageStart`, which would leave the page empty; where the
 * rules cannot be met without that, Chromium breaks at the overflowing line.
 */
function breakIndex(lines: readonly CoverLetterLineBox[], pageStart: number, overflow: number): number {
  const block = lines[overflow].block
  const blockIndexes: number[] = []
  lines.forEach((line, index) => {
    if (line.block === block) blockIndexes.push(index)
  })
  const onPageBefore = (index: number) =>
    blockIndexes.filter((candidate) => candidate >= pageStart && candidate < index).length
  const firstOnPage = blockIndexes.find((index) => index >= pageStart) ?? overflow

  let index = overflow
  // The break falls inside the paragraph only when some of it is on this page.
  if (onPageBefore(overflow) > 0) {
    const after = blockIndexes.filter((candidate) => candidate >= overflow).length
    if (after < COVER_LETTER_WIDOWS) {
      const widowsStart = blockIndexes[blockIndexes.length - COVER_LETTER_WIDOWS]
      index = widowsStart !== undefined && onPageBefore(widowsStart) >= COVER_LETTER_ORPHANS ? widowsStart : firstOnPage
    } else if (onPageBefore(overflow) < COVER_LETTER_ORPHANS) {
      index = firstOnPage
    }
  }
  return index > pageStart ? index : overflow
}

/**
 * Compute the printed page count and page breaks of a cover letter.
 *
 * @param layout The letter's line boxes and content bottom, or `null` while it
 *   has not been measured yet (one page, no break).
 * @throws RangeError when a coordinate is not a finite number or a line ends
 *   above its top; a measurement like that is a bug upstream, not a page count.
 */
export function computeCoverLetterPageBreaks(layout: CoverLetterLayout | null): CoverLetterPageBreaks {
  if (layout === null) {
    return { pageCount: 1, boundaries: [] }
  }
  assertFinite(layout.contentBottom, 'content bottom')
  for (const line of layout.lines) {
    assertFinite(line.top, 'line top')
    assertFinite(line.bottom, 'line bottom')
    if (line.bottom < line.top) {
      throw new RangeError(`Invalid cover letter line: bottom ${line.bottom} above top ${line.top}`)
    }
  }

  // Flow order. `sort` is stable, so lines at the same top keep their order.
  //
  // The letter's header lays the sender and recipient blocks side by side in
  // one grid cell, so their lines interleave here. `orphans` and `widows`
  // count the lines of the overflowing line's own block only, and move the
  // break up to one of that block's lines, never to a line of the other
  // column. This is exact while one column alone reaches the page's end: the
  // sender block is at most five lines at the top of page 1, so only a very
  // long recipient address can, and it then crosses the page by itself.
  const lines = [...layout.lines].sort((a, b) => a.top - b.top)
  const boundaries: number[] = []
  let pageEnd = COVER_LETTER_FIRST_PAGE_BOTTOM_PX
  let pageStart = 0

  for (let index = 0; index < lines.length; index++) {
    // A line taller than a whole page stays where it starts, as in the print.
    if (index === pageStart || lines[index].bottom <= pageEnd + LINE_FIT_EPSILON_PX) continue
    pageStart = breakIndex(lines, pageStart, index)
    const nextPageTop = lines[pageStart].top
    boundaries.push(nextPageTop)
    pageEnd = nextPageTop + COVER_LETTER_CONTINUATION_PAGE_PX
    index = pageStart
  }

  // Content below the last line, without lines of its own, breaks where the page ends.
  while (layout.contentBottom > pageEnd + COVER_LETTER_PAGE_EDGE_TOLERANCE_PX) {
    boundaries.push(pageEnd)
    pageEnd += COVER_LETTER_CONTINUATION_PAGE_PX
  }

  return { pageCount: boundaries.length + 1, boundaries }
}
