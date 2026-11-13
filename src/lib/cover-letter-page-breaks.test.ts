import { describe, expect, it } from 'vitest'
import {
  COVER_LETTER_CONTINUATION_PAGE_PX,
  COVER_LETTER_FIRST_PAGE_BOTTOM_PX,
  COVER_LETTER_PAGE_EDGE_TOLERANCE_PX,
  computeCoverLetterPageBreaks,
  type CoverLetterLineBox,
} from './cover-letter-page-breaks'
import { SWISS_LETTER_LAYOUT_PX, SWISS_LETTER_PAGE_PX, mmToPx } from './cover-letter-swiss-letter'

const FIRST = COVER_LETTER_FIRST_PAGE_BOTTOM_PX
const CONT = COVER_LETTER_CONTINUATION_PAGE_PX
const L = SWISS_LETTER_LAYOUT_PX.lineHeight

/** `count` consecutive lines of one paragraph, the first at `top`. */
function paragraph(block: number, top: number, count: number): CoverLetterLineBox[] {
  return Array.from({ length: count }, (_, index) => ({ block, top: top + index * L, bottom: top + (index + 1) * L }))
}

/** Lines and a content bottom at the last line's bottom. */
function layout(lines: CoverLetterLineBox[]) {
  return { lines, contentBottom: Math.max(0, ...lines.map((line) => line.bottom)) }
}

describe('computeCoverLetterPageBreaks', () => {
  it('derives the page areas from the print margins in whole px, as Chromium prints them', () => {
    // 18 mm = 68.03 px → 68, 15 mm = 56.69 px → 57, on a 1123 px page; no top margin on page 1.
    expect(Math.round(mmToPx(18))).toBe(68)
    expect(Math.round(mmToPx(15))).toBe(57)
    expect(FIRST).toBe(SWISS_LETTER_PAGE_PX.height - 57)
    expect(FIRST).toBe(1066)
    expect(CONT).toBe(998)
  })

  it('treats a letter not measured yet, or with nothing in it, as one page', () => {
    expect(computeCoverLetterPageBreaks(null)).toEqual({ pageCount: 1, boundaries: [] })
    expect(computeCoverLetterPageBreaks({ lines: [], contentBottom: 0 })).toEqual({ pageCount: 1, boundaries: [] })
  })

  it('keeps a letter whose lines all fit page 1 on one page', () => {
    expect(computeCoverLetterPageBreaks(layout(paragraph(0, 100, 20)))).toEqual({ pageCount: 1, boundaries: [] })
  })

  it('keeps a short letter at its min-height on one page: its content bottom is 0.31 px past page 1', () => {
    const contentBottom = SWISS_LETTER_PAGE_PX.height - SWISS_LETTER_LAYOUT_PX.padding.bottom
    expect(contentBottom).toBeGreaterThan(FIRST)
    expect(contentBottom).toBeLessThanOrEqual(FIRST + COVER_LETTER_PAGE_EDGE_TOLERANCE_PX)
    expect(computeCoverLetterPageBreaks({ lines: paragraph(0, 100, 10), contentBottom }).pageCount).toBe(1)
  })

  it('keeps a paragraph ending exactly at the edge on page 1, and starts page 2 at the next part, its margin dropped', () => {
    const first = paragraph(0, FIRST - 10 * L, 10)
    expect(first.at(-1)!.bottom).toBeCloseTo(FIRST, 10)
    // One line of margin above the next paragraph.
    const second = paragraph(1, FIRST + L, 3)
    expect(computeCoverLetterPageBreaks(layout([...first, ...second]))).toEqual({
      pageCount: 2,
      boundaries: [second[0].top],
    })
  })

  it('moves a line straddling the edge to the next page, which then ends one page area below that line', () => {
    // Page 1 ends 5 px into line 33 of one long paragraph.
    const top = FIRST + 5 - 33 * L
    const lines = paragraph(0, top, 100)
    const straddling = lines[32]
    expect(straddling.top).toBeLessThan(FIRST)
    expect(straddling.bottom).toBeGreaterThan(FIRST)

    const { pageCount, boundaries } = computeCoverLetterPageBreaks(layout(lines))
    expect(pageCount).toBe(3)
    expect(boundaries[0]).toBe(straddling.top)
    // Page 2 holds every line ending within CONT of its first line's top.
    const secondEnd = straddling.top + CONT
    const firstOnPage3 = lines.find((line) => line.bottom > secondEnd)!
    expect(boundaries[1]).toBe(firstOnPage3.top)
    // Not the height-only edge: the slack of page 1 carries over.
    expect(boundaries[1]).not.toBeCloseTo(FIRST + CONT, 0)
  })

  it('orphans: moves a paragraph whose first line alone would fit', () => {
    const before = paragraph(0, FIRST - 10 * L, 9)
    // Its first line ends at the edge, its second does not fit.
    const orphaned = paragraph(1, FIRST - L, 3)
    const { boundaries } = computeCoverLetterPageBreaks(layout([...before, ...orphaned]))
    expect(boundaries).toEqual([orphaned[0].top])
  })

  it('widows: moves a second line along with a last line that does not fit', () => {
    const lines = paragraph(0, FIRST - 3 * L, 4)
    // Lines 1–3 fit; line 4 alone would be a widow.
    const { boundaries } = computeCoverLetterPageBreaks(layout(lines))
    expect(boundaries).toEqual([lines[2].top])
  })

  it('moves the whole paragraph when keeping its widows would leave an orphan', () => {
    const before = paragraph(0, 200, 5)
    const lines = paragraph(1, FIRST - 2 * L, 3)
    // Lines 1–2 fit; moving line 2 for the widow would leave line 1 alone.
    const { boundaries } = computeCoverLetterPageBreaks(layout([...before, ...lines]))
    expect(boundaries).toEqual([lines[0].top])
  })

  it('moves a two-line paragraph whole when only its first line fits', () => {
    const before = paragraph(0, 200, 5)
    const lines = paragraph(1, FIRST - L, 2)
    expect(computeCoverLetterPageBreaks(layout([...before, ...lines])).boundaries).toEqual([lines[0].top])
  })

  it('applies the widow rule on a continuation page, from that page\'s own end', () => {
    // One paragraph from the top of page 2 to past its end, ending in a widow.
    const page1 = paragraph(0, FIRST - L, 1)
    const long = paragraph(1, FIRST + 10, Math.floor(CONT / L) + 1)
    expect(long.at(-2)!.bottom).toBeLessThanOrEqual(long[0].top + CONT)
    expect(long.at(-1)!.bottom).toBeGreaterThan(long[0].top + CONT)
    const { boundaries } = computeCoverLetterPageBreaks(layout([...page1, ...long]))
    expect(boundaries[0]).toBe(long[0].top)
    expect(boundaries[1]).toBe(long.at(-2)!.top)
  })

  it('breaks at the overflowing line when the rules would leave the page empty', () => {
    // A paragraph opening page 2 whose second line does not fit it: keeping
    // two lines together would move the paragraph onto a page of its own again.
    const page1 = paragraph(0, FIRST - L, 1)
    const half = CONT / 2 + 10
    const tallLines = [0, 1, 2].map((index) => ({
      block: 1,
      top: FIRST + 10 + index * half,
      bottom: FIRST + 10 + (index + 1) * half,
    }))
    const { boundaries } = computeCoverLetterPageBreaks(layout([...page1, ...tallLines]))
    expect(boundaries).toEqual([tallLines[0].top, tallLines[1].top, tallLines[2].top])
  })

  it('keeps a line taller than a page where it starts', () => {
    const tall = { block: 1, top: FIRST + 10, bottom: FIRST + 10 + CONT + 50 }
    const lines = [...paragraph(0, FIRST - L, 1), tall]
    expect(computeCoverLetterPageBreaks({ lines, contentBottom: tall.bottom }).boundaries[0]).toBe(tall.top)
  })

  it('moves an empty line straddling the edge, and starts the next page with it', () => {
    // An empty line (a bare <br>) is a line box like any other: the marker is
    // at its top, not at the text line below it.
    const lines = paragraph(0, FIRST + 0.5 - 33 * L, 45)
    const blank = lines[32]
    expect(blank.top).toBeLessThan(FIRST)
    expect(blank.bottom).toBeGreaterThan(FIRST)
    expect(computeCoverLetterPageBreaks(layout(lines)).boundaries).toEqual([blank.top])
  })

  it('counts an empty line of a paragraph toward its orphans', () => {
    // "line<br><br>line…": the text line fits, the empty one does not, and one
    // line alone would be an orphan.
    const before = paragraph(0, 200, 5)
    const lines = paragraph(1, FIRST - L, 4)
    expect(computeCoverLetterPageBreaks(layout([...before, ...lines])).boundaries).toEqual([lines[0].top])
  })

  it('breaks a header crossing page 1 inside the recipient block, whatever the sender column beside it', () => {
    // The sender (5 lines at the top margin) and the recipient (a 60-line
    // address in the window zone) share one grid cell: their lines interleave.
    const sender = paragraph(0, 68, 5)
    const recipient = paragraph(1, 189, 60)
    const body = paragraph(2, recipient.at(-1)!.bottom + L, 3)
    const firstOut = recipient.find((line) => line.bottom > FIRST)!
    expect(computeCoverLetterPageBreaks(layout([...sender, ...recipient, ...body]))).toEqual({
      pageCount: 2,
      boundaries: [firstOut.top],
    })
  })

  it('reads the lines in flow order whatever order they are given in', () => {
    const lines = paragraph(0, FIRST + 5 - 33 * L, 40)
    expect(computeCoverLetterPageBreaks(layout([...lines].reverse()))).toEqual(
      computeCoverLetterPageBreaks(layout(lines)),
    )
  })

  it('breaks content without lines at each page end', () => {
    const { pageCount, boundaries } = computeCoverLetterPageBreaks({ lines: [], contentBottom: FIRST + CONT + 200 })
    expect(pageCount).toBe(3)
    expect(boundaries).toEqual([FIRST, FIRST + CONT])
    expect(computeCoverLetterPageBreaks({ lines: [], contentBottom: FIRST + COVER_LETTER_PAGE_EDGE_TOLERANCE_PX }).pageCount).toBe(1)
  })

  it.each([
    { lines: [], contentBottom: Number.NaN },
    { lines: [], contentBottom: Number.POSITIVE_INFINITY },
    { lines: [{ block: 0, top: Number.NaN, bottom: 10 }], contentBottom: 10 },
    { lines: [{ block: 0, top: 10, bottom: Number.NEGATIVE_INFINITY }], contentBottom: 10 },
    { lines: [{ block: 0, top: 20, bottom: 10 }], contentBottom: 20 },
  ])('refuses an invalid measurement (%#)', (input) => {
    expect(() => computeCoverLetterPageBreaks(input)).toThrow(RangeError)
  })
})
