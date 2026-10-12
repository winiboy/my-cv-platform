import { describe, expect, it } from 'vitest'
import { computePageBreaks, PAGE_EDGE_TOLERANCE_PX } from './resume-page-breaks'
import { PAGE_HEIGHT_PX } from './resume-page-size'

const ONE_PAGE = { pageCount: 1, boundaries: [] }
const TWO_PAGES = { pageCount: 2, boundaries: [PAGE_HEIGHT_PX] }

describe('computePageBreaks', () => {
  it('uses the 1 px tolerance FR-2 states', () => {
    expect(PAGE_EDGE_TOLERANCE_PX).toBe(1)
  })

  it('reports one page and no boundary before the document is measured', () => {
    expect(computePageBreaks(null)).toEqual(ONE_PAGE)
  })

  it('reports one page and no boundary for a height of 0', () => {
    expect(computePageBreaks(0)).toEqual(ONE_PAGE)
  })

  it('reports one page for a document one px shorter than a page', () => {
    expect(computePageBreaks(PAGE_HEIGHT_PX - 1)).toEqual(ONE_PAGE)
  })

  it('reports one page for a document exactly one page tall', () => {
    expect(computePageBreaks(PAGE_HEIGHT_PX)).toEqual(ONE_PAGE)
  })

  it('reports one page for a document one px taller than a page (FR-2: ± 1 px)', () => {
    expect(computePageBreaks(PAGE_HEIGHT_PX + 1)).toEqual(ONE_PAGE)
  })

  it('reports two pages for a document two px taller than a page', () => {
    expect(computePageBreaks(PAGE_HEIGHT_PX + 2)).toEqual(TWO_PAGES)
  })

  it('reports two pages for a document exactly two pages tall', () => {
    expect(computePageBreaks(2 * PAGE_HEIGHT_PX)).toEqual(TWO_PAGES)
  })

  it('reports two pages for a document one px taller than two pages', () => {
    expect(computePageBreaks(2 * PAGE_HEIGHT_PX + 1)).toEqual(TWO_PAGES)
  })

  it('places one boundary at each sheet edge, top to bottom', () => {
    expect(computePageBreaks(3 * PAGE_HEIGHT_PX + 2)).toEqual({
      pageCount: 4,
      boundaries: [PAGE_HEIGHT_PX, 2 * PAGE_HEIGHT_PX, 3 * PAGE_HEIGHT_PX],
    })
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects an invalid height (%s)', (height) => {
    expect(() => computePageBreaks(height)).toThrow(RangeError)
  })
})
