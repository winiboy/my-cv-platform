import { describe, expect, it } from 'vitest'
import { PAGE_HEIGHT_PX } from './resume-page-size'
import {
  PRINT_ORPHANS,
  PRINT_WIDOWS,
  SHEET_GAP_PX,
  SHEET_PITCH_PX,
  breakLines,
  paginateBlocks,
  placeBlock,
  sheetContentBottom,
  sheetContentHeight,
  sheetContentTop,
  sheetCountFor,
  sheetIndexAt,
  sheetTop,
  sheetsHeight,
  type ResumePageMargins,
  type SheetLayoutNode,
  type SheetLine,
} from './resume-sheets'

const MARGINS: ResumePageMargins = { pageTop: 48, pageBottom: 48 }
/** Where sheet 1's text must end, and where sheet 2's starts. */
const FOOT_1 = PAGE_HEIGHT_PX - 48
const TOP_2 = SHEET_PITCH_PX + 48

describe('sheet geometry', () => {
  it('draws A4 sheets a visible gap apart', () => {
    expect(SHEET_GAP_PX).toBeGreaterThan(0)
    expect(SHEET_PITCH_PX).toBe(PAGE_HEIGHT_PX + SHEET_GAP_PX)
    expect(sheetTop(0)).toBe(0)
    expect(sheetTop(2)).toBe(2 * SHEET_PITCH_PX)
  })

  it('starts the text of sheet 1 at its top and of every later sheet below the top margin', () => {
    expect(sheetContentTop(0, MARGINS)).toBe(0)
    expect(sheetContentTop(1, MARGINS)).toBe(TOP_2)
    expect(sheetContentTop(2, { pageTop: 50, pageBottom: 50 })).toBe(2 * SHEET_PITCH_PX + 50)
  })

  it('ends the text of every sheet above the foot margin', () => {
    expect(sheetContentBottom(0, MARGINS)).toBe(FOOT_1)
    expect(sheetContentBottom(1, MARGINS)).toBe(SHEET_PITCH_PX + FOOT_1)
    expect(sheetContentHeight(MARGINS)).toBe(PAGE_HEIGHT_PX - 96)
  })

  it('finds the sheet a y falls on, a y in the gap belonging to the sheet above', () => {
    expect(sheetIndexAt(-5)).toBe(0)
    expect(sheetIndexAt(PAGE_HEIGHT_PX + 1)).toBe(0)
    expect(sheetIndexAt(SHEET_PITCH_PX)).toBe(1)
  })

  it('sizes n sheets with n − 1 gaps, the last sheet full height', () => {
    expect(sheetsHeight(1)).toBe(PAGE_HEIGHT_PX)
    expect(sheetsHeight(3)).toBe(3 * PAGE_HEIGHT_PX + 2 * SHEET_GAP_PX)
  })

  it('counts the sheets the lowest block reaches, at least one', () => {
    expect(sheetCountFor(0)).toBe(1)
    expect(sheetCountFor(FOOT_1)).toBe(1)
    expect(sheetCountFor(PAGE_HEIGHT_PX)).toBe(1)
    expect(sheetCountFor(TOP_2 + 10)).toBe(2)
    expect(() => sheetCountFor(Number.NaN)).toThrow(RangeError)
  })
})

describe('placeBlock', () => {
  const keep = (top: number, bottom: number) => ({ top, bottom, kind: 'keep' as const })
  const split = (top: number, bottom: number) => ({ top, bottom, kind: 'split' as const })

  it('leaves a block that ends on or above the foot margin', () => {
    expect(placeBlock(keep(100, FOOT_1), MARGINS)).toEqual({ action: 'stay' })
    expect(placeBlock(split(100, FOOT_1 - 0.01), MARGINS)).toEqual({ action: 'stay' })
  })

  it('moves a kept block that crosses the foot margin to the next sheet, below its top margin', () => {
    expect(placeBlock(keep(1000, FOOT_1 + 1), MARGINS)).toEqual({ action: 'move', top: TOP_2 })
  })

  it('breaks inside a block print may break inside', () => {
    expect(placeBlock(split(1000, FOOT_1 + 1), MARGINS)).toEqual({ action: 'split' })
  })

  it('moves a kept block taller than a sheet’s text to the next sheet first, as print prefers the break before it', () => {
    expect(placeBlock(keep(200, 200 + sheetContentHeight(MARGINS) + 1), MARGINS)).toEqual({ action: 'move', top: TOP_2 })
  })

  it('breaks inside a kept block that nothing precedes on its sheet, which print has no break before', () => {
    const tall = { ...keep(200, 200 + sheetContentHeight(MARGINS) + 1), leading: true }
    expect(placeBlock(tall, MARGINS)).toEqual({ action: 'split' })
    expect(placeBlock({ ...keep(500, FOOT_1 + 1), leading: true }, MARGINS)).toEqual({ action: 'split' })
  })

  it('moves a block that starts in the foot margin or the gap to the next sheet', () => {
    expect(placeBlock(split(FOOT_1 + 2, FOOT_1 + 20), MARGINS)).toEqual({ action: 'move', top: TOP_2 })
    expect(placeBlock(keep(PAGE_HEIGHT_PX + 5, PAGE_HEIGHT_PX + 9), MARGINS)).toEqual({ action: 'move', top: TOP_2 })
  })

  it('moves a block that starts in a later sheet’s top margin down to its text', () => {
    expect(placeBlock(keep(SHEET_PITCH_PX + 10, SHEET_PITCH_PX + 40), MARGINS)).toEqual({ action: 'move', top: TOP_2 })
  })

  it('does not move a kept block already at the top of a sheet’s text', () => {
    expect(placeBlock(keep(TOP_2, TOP_2 + sheetContentHeight(MARGINS) + 30), MARGINS)).toEqual({ action: 'split' })
  })

  it('rejects a measurement that is not a box', () => {
    expect(() => placeBlock(keep(10, 5), MARGINS)).toThrow(RangeError)
    expect(() => placeBlock(keep(Number.NaN, 5), MARGINS)).toThrow(RangeError)
  })
})

/** `count` line boxes `height` tall, one under the other from `top`. */
const lineBoxes = (top: number, count: number, height = 20): SheetLine[] =>
  Array.from({ length: count }, (_, i) => ({ top: top + i * height, bottom: top + (i + 1) * height }))

describe('breakLines', () => {
  it('uses Chromium’s default orphans and widows', () => {
    expect(PRINT_ORPHANS).toBe(2)
    expect(PRINT_WIDOWS).toBe(2)
  })

  it('leaves a paragraph whose every line fits above the foot', () => {
    expect(breakLines(lineBoxes(FOOT_1 - 100, 5), MARGINS, false)).toEqual({ action: 'stay' })
    expect(breakLines([], MARGINS, false)).toEqual({ action: 'stay' })
  })

  it('breaks after the last line that fits when two or more lines stay and two or more move', () => {
    // Lines 0–2 end at FOOT_1 − 50, − 30, − 10; line 3 ends at FOOT_1 + 10.
    const lines = lineBoxes(FOOT_1 - 70, 6)
    expect(breakLines(lines, MARGINS, false)).toEqual({ action: 'break', line: 3, top: TOP_2 })
  })

  it('moves the whole paragraph when fewer than two of its lines would stay', () => {
    // Only line 0 fits.
    expect(breakLines(lineBoxes(FOOT_1 - 30, 6), MARGINS, false)).toEqual({ action: 'break', line: 0, top: TOP_2 })
    // Not even line 0 fits.
    expect(breakLines(lineBoxes(FOOT_1 - 10, 6), MARGINS, false)).toEqual({ action: 'break', line: 0, top: TOP_2 })
  })

  it('pulls a line back so that two move, when only one would', () => {
    // Lines 0–3 fit, line 4 (the last) does not: line 3 goes with it.
    expect(breakLines(lineBoxes(FOOT_1 - 90, 5), MARGINS, false)).toEqual({ action: 'break', line: 3, top: TOP_2 })
  })

  it('moves the whole paragraph when pulling a line back would leave fewer than two', () => {
    // Lines 0–1 fit, line 2 does not: widows take line 1, orphans then fail.
    expect(breakLines(lineBoxes(FOOT_1 - 50, 3), MARGINS, false)).toEqual({ action: 'break', line: 0, top: TOP_2 })
  })

  it('breaks a paragraph that starts its sheet at the first line that does not fit, whatever the rules ask', () => {
    const lines = lineBoxes(FOOT_1 - 30, 3)
    expect(breakLines(lines, MARGINS, true)).toEqual({ action: 'break', line: 1, top: TOP_2 })
    // At the sheet's text top it starts the sheet by its position: two lines
    // 600 px tall, the second past the foot, break between them.
    const atTop = lineBoxes(TOP_2, 2, 600)
    expect(breakLines(atTop, MARGINS, false)).toEqual({ action: 'break', line: 1, top: 2 * SHEET_PITCH_PX + 48 })
  })

  it('breaks a paragraph taller than a sheet’s text where the sheet ends, the rest left to the next call', () => {
    const lines = lineBoxes(0, 110)
    // 53 lines fit sheet 1: the 53rd ends at 1060 ≤ 1075.
    expect(breakLines(lines, MARGINS, false)).toEqual({ action: 'break', line: 53, top: TOP_2 })
  })

  it('leaves a first line that alone does not fit at a sheet’s top', () => {
    expect(breakLines([{ top: TOP_2, bottom: TOP_2 + 2000 }], MARGINS, true)).toEqual({ action: 'stay' })
  })

  it('rejects a measurement that is not a box', () => {
    expect(() => breakLines([{ top: 10, bottom: 5 }], MARGINS, false)).toThrow(RangeError)
    expect(() => breakLines([{ top: Number.NaN, bottom: 5 }], MARGINS, false)).toThrow(RangeError)
  })
})

/**
 * A block `spacerHeight` tall, then a paragraph of `lineCount` lines 20 px
 * tall under it, as block and inline layout lay them out: moving the
 * paragraph moves its lines, and a break pushes the lines from it on down.
 */
function paragraphAfter(spacerHeight: number, lineCount: number) {
  let top = spacerHeight
  const pushes = Array.from({ length: lineCount }, () => 0)
  const lineTops = () =>
    Array.from({ length: lineCount }, (_, i) => top + i * 20 + pushes.slice(0, i + 1).reduce((sum, p) => sum + p, 0))
  const spacer: SheetLayoutNode = {
    keep: true,
    measure: () => ({ top: 0, bottom: spacerHeight }),
    children: () => [],
    moveTo: () => {
      throw new Error('The spacer fits and is never moved')
    },
  }
  const node: SheetLayoutNode = {
    keep: false,
    measure: () => {
      const tops = lineTops()
      return { top, bottom: tops[lineCount - 1] + 20 }
    },
    children: () => [],
    lines: {
      measure: () => lineTops().map((lineTop) => ({ top: lineTop, bottom: lineTop + 20 })),
      breakBefore: (index, target) => {
        pushes[index] += target - lineTops()[index]
      },
    },
    moveTo: (target) => {
      top = target
    },
  }
  return { spacer, node, lineTops }
}

/**
 * A column of blocks laid out one under the other, as block flow lays them
 * out: moving a block moves every block after it by as much.
 */
function column(heights: readonly (number | { keep: boolean; children: number[] })[], gap = 0): SheetLayoutNode[] {
  const tops: number[] = []
  const sizes: number[] = []
  const nodes: SheetLayoutNode[] = []
  let y = 0
  const shiftFrom = (index: number, by: number) => {
    for (let i = index; i < tops.length; i++) tops[i] += by
  }
  heights.forEach((entry, index) => {
    const height = typeof entry === 'number' ? entry : entry.children.reduce((sum, h) => sum + h, 0)
    tops.push(y)
    sizes.push(height)
    y += height + gap
    let children: SheetLayoutNode[] | null = null
    const node: SheetLayoutNode = {
      keep: typeof entry === 'number' ? true : entry.keep,
      measure: () => ({ top: tops[index], bottom: tops[index] + sizes[index] }),
      // Built once, so the pushes it records survive between calls.
      children: () => (children ??= buildChildren()),
      moveTo: (top: number) => shiftFrom(index, top - tops[index]),
    }
    function buildChildren(): SheetLayoutNode[] {
      if (typeof entry === 'number') return []
      // Children stack inside this block; moving one grows the block and
      // moves the blocks after it.
      const offsets = entry.children.map((_, i) => entry.children.slice(0, i).reduce((sum, h) => sum + h, 0))
      const pushes = entry.children.map(() => 0)
      const childTop = (i: number) => tops[index] + offsets[i] + pushes.slice(0, i + 1).reduce((sum, p) => sum + p, 0)
      return entry.children.map((childHeight, i) => ({
        keep: true,
        measure: () => ({ top: childTop(i), bottom: childTop(i) + childHeight }),
        children: () => [],
        moveTo: (top: number) => {
          const by = top - childTop(i)
          pushes[i] += by
          sizes[index] += by
          shiftFrom(index + 1, by)
        },
      }))
    }
    nodes.push(node)
  })
  return nodes
}

describe('paginateBlocks', () => {
  it('keeps a document that fits on one sheet where it is', () => {
    const blocks = column([200, 300, 400])
    expect(paginateBlocks(blocks, MARGINS)).toBe(900)
    expect(blocks.map((block) => block.measure().top)).toEqual([0, 200, 500])
  })

  it('moves the block that would cross the foot to the top of sheet 2, and the rest after it', () => {
    const blocks = column([500, 500, 200])
    const bottom = paginateBlocks(blocks, MARGINS)
    expect(blocks.map((block) => block.measure().top)).toEqual([0, 500, TOP_2])
    expect(bottom).toBe(TOP_2 + 200)
    expect(sheetCountFor(bottom)).toBe(2)
  })

  it('breaks between the children of a block print may break inside', () => {
    const blocks = column([600, { keep: false, children: [300, 300, 300] }])
    paginateBlocks(blocks, MARGINS)
    const [, section] = blocks
    const children = section.children()
    // 600 + 300 = 900 fits; the next child would end at 1200 > 1075, so it moves.
    expect(children.map((child) => child.measure().top)).toEqual([600, TOP_2, TOP_2 + 300])
  })

  it('moves a block whole across several sheets when each page fills up', () => {
    const blocks = column(Array.from({ length: 6 }, () => 400))
    const bottom = paginateBlocks(blocks, MARGINS)
    const tops = blocks.map((block) => block.measure().top)
    expect(tops).toEqual([0, 400, TOP_2, TOP_2 + 400, 2 * SHEET_PITCH_PX + 48, 2 * SHEET_PITCH_PX + 448])
    expect(sheetCountFor(bottom)).toBe(3)
  })

  it('never cuts a kept block with a sheet edge or draws it in a margin', () => {
    const blocks = column([130, 250, 90, 410, 220, 360, 180, 300, 270], 12)
    paginateBlocks(blocks, MARGINS)
    for (const block of blocks) {
      const { top, bottom } = block.measure()
      const sheet = sheetIndexAt(top)
      expect(top).toBeGreaterThanOrEqual(sheetContentTop(sheet, MARGINS))
      expect(bottom).toBeLessThanOrEqual(sheetContentBottom(sheet, MARGINS))
    }
  })

  it('moves a kept block taller than a sheet’s text to the next sheet, and leaves it there when it cannot be broken', () => {
    const blocks = column([100, sheetContentHeight(MARGINS) + 200])
    const bottom = paginateBlocks(blocks, MARGINS)
    expect(blocks[1].measure().top).toBe(TOP_2)
    expect(sheetCountFor(bottom)).toBe(3)
  })

  it('breaks a kept block taller than a sheet’s text between its children once it starts a sheet', () => {
    const blocks = column([100, { keep: true, children: [600, 600] }])
    paginateBlocks(blocks, MARGINS)
    const [, tall] = blocks
    expect(tall.measure().top).toBe(TOP_2)
    // Its first child starts the sheet with it: never moved again.
    expect(tall.children().map((child) => child.measure().top)).toEqual([TOP_2, 2 * SHEET_PITCH_PX + 48])
  })

  it('breaks a paragraph that crosses the foot between its lines, the rest at the next sheet’s top margin', () => {
    // 15 lines fit above the foot from 760 (760 + 15 × 20 = 1060 ≤ 1075); 5 move.
    const paragraph = paragraphAfter(760, 20)
    const bottom = paginateBlocks([paragraph.spacer, paragraph.node], MARGINS)
    const tops = paragraph.lineTops()
    expect(tops[14]).toBe(1040)
    expect(tops[15]).toBe(TOP_2)
    expect(tops[19]).toBe(TOP_2 + 80)
    expect(paragraph.node.measure().top).toBe(760)
    expect(sheetCountFor(bottom)).toBe(2)
  })

  it('moves a paragraph whole when fewer than two of its lines would stay', () => {
    const paragraph = paragraphAfter(1040, 5)
    paginateBlocks([paragraph.spacer, paragraph.node], MARGINS)
    expect(paragraph.node.measure().top).toBe(TOP_2)
    expect(paragraph.lineTops()).toEqual([0, 1, 2, 3, 4].map((i) => TOP_2 + i * 20))
  })

  it('breaks a paragraph longer than a sheet as often as it crosses a foot', () => {
    // Starts the document: 53 lines on sheet 1 (53 × 20 = 1060), 51 on sheet 2, 6 on sheet 3.
    const paragraph = paragraphAfter(0, 110)
    const bottom = paginateBlocks([paragraph.node], MARGINS)
    const tops = paragraph.lineTops()
    expect(tops[52]).toBe(1040)
    expect(tops[53]).toBe(TOP_2)
    expect(tops[104]).toBe(2 * SHEET_PITCH_PX + 48)
    expect(sheetCountFor(bottom)).toBe(3)
  })

  it('places side-by-side columns independently', () => {
    const left = column([300, 300])
    const right = column([700, 500])
    paginateBlocks([...left, ...right], MARGINS)
    expect(left.map((block) => block.measure().top)).toEqual([0, 300])
    expect(right.map((block) => block.measure().top)).toEqual([0, TOP_2])
  })
})
