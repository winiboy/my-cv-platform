import { PAGE_HEIGHT_PX } from './resume-page-size'

/**
 * Where the printed A4 sheets of a resume begin and end, derived from the
 * document's measured height. The editor's live preview and the Preview page
 * both draw their page-break indicators from this one computation, so the two
 * surfaces cannot disagree on the count or the positions.
 *
 * The result is derived state only: it is recomputed from the rendered DOM and
 * never stored in the resume, its layout model or an export.
 */

/**
 * How far a document may exceed a whole number of pages and still count as
 * that number: FR-2's "exactly one page tall (± 1 px) counts as one page".
 * The rule is inclusive, so a height h is k pages when
 * (k − 1) × `PAGE_HEIGHT_PX` + 1 < h ≤ k × `PAGE_HEIGHT_PX` + 1.
 *
 * The editor measures the document with `offsetHeight`, which is rounded to a
 * whole px, so the heights this rule actually sees are integers: one page
 * + 1 px is still one page, one page + 2 px is two. The tolerance absorbs the
 * rounding of that measurement and the sub-pixel layout beneath it; it matters
 * most for `professional` and `modern`, whose `min-height: PAGE_HEIGHT_PX`
 * puts a short CV exactly on the edge.
 *
 * The printed PDF is the authority on this rule: US-003 compares the count
 * against the PDF's page count for every template, and if they disagree on a
 * fixture, the rule is wrong.
 */
export const PAGE_EDGE_TOLERANCE_PX = 1

export interface PageBreakLayout {
  /** Number of A4 sheets the document prints on; at least 1. */
  pageCount: number
  /**
   * Unscaled y of each edge between two consecutive sheets, top to bottom:
   * k × `PAGE_HEIGHT_PX` for k = 1 … `pageCount` − 1. Empty for one page.
   */
  boundaries: number[]
}

/**
 * Compute the page count and the sheet edges for a document.
 *
 * @param documentHeight The document's unscaled height in CSS px, or `null`
 *   while it has not been measured yet. Both `null` and 0 yield one page and
 *   no boundary, so nothing is drawn before the first measurement.
 * @throws RangeError when the height is negative or not a finite number; a
 *   measurement like that is a bug upstream, not a page count.
 */
export function computePageBreaks(documentHeight: number | null): PageBreakLayout {
  if (documentHeight === null) {
    return { pageCount: 1, boundaries: [] }
  }
  if (!Number.isFinite(documentHeight) || documentHeight < 0) {
    throw new RangeError(`Invalid document height: ${documentHeight}`)
  }

  const pageCount = Math.max(
    1,
    Math.ceil((documentHeight - PAGE_EDGE_TOLERANCE_PX) / PAGE_HEIGHT_PX)
  )
  const boundaries = Array.from({ length: pageCount - 1 }, (_, index) => (index + 1) * PAGE_HEIGHT_PX)

  return { pageCount, boundaries }
}
