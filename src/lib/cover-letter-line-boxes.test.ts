import { describe, expect, it } from 'vitest'
import { SWISS_LETTER_LAYOUT_PX } from '@/lib/cover-letter-swiss-letter'
import {
  coverLetterLineBoxModel,
  fragmentLineBox,
  mergeLineBoxes,
  sameLineBoxes,
  type FontMetrics,
  type LineFragment,
} from './cover-letter-line-boxes'

/**
 * The geometry is Chromium's, measured on Georgia at the letter's 11 pt
 * (14.67 px) and 19.07 px line height: ascent 13 px, descent 3 px, glyphs
 * 1 px below the line's top; a 24 px span (ascent 22, descent 5) on a line
 * whose box then runs from 4 px below its glyphs' top to the strut's bottom.
 */
const L = SWISS_LETTER_LAYOUT_PX.lineHeight
const GEORGIA_11PT: FontMetrics = { ascent: 13, descent: 3 }
const GEORGIA_24PX: FontMetrics = { ascent: 22, descent: 5 }
const STRUT = { lineHeight: L, metrics: GEORGIA_11PT }

function fragment(overrides: Partial<LineFragment>): LineFragment {
  return { block: 0, glyphTop: 100, glyphHeight: 16, lineHeight: L, metrics: GEORGIA_11PT, strut: STRUT, ...overrides }
}

describe('fragmentLineBox', () => {
  it('puts floor(leading / 2) above the glyphs of text in the paragraph font', () => {
    // (19.07 − 16) / 2 = 1.53: 1 px above, the rest below.
    const box = fragmentLineBox(fragment({ glyphTop: 9 }))
    expect(box.top).toBeCloseTo(8, 6)
    expect(box.bottom).toBeCloseTo(8 + L, 6)
  })

  it('measures an empty line from its <br> like a line of text', () => {
    // A <br> has a glyph-like rect in its paragraph's font (measured: br at
    // 28.06, its empty line's box from 27.06).
    const box = fragmentLineBox(fragment({ glyphTop: 28.06 }))
    expect(box.top).toBeCloseTo(27.06, 6)
    expect(box.bottom).toBeCloseTo(27.06 + L, 6)
  })

  it('gives a font taller than its line height a negative leading, and keeps the strut on the baseline', () => {
    // Measured in Chromium: glyphs 61.19–88.19, line box 65.19–88.26.
    const box = fragmentLineBox(fragment({ glyphTop: 61.19, glyphHeight: 27, metrics: GEORGIA_24PX }))
    expect(box.top).toBeCloseTo(65.19, 2)
    expect(box.bottom).toBeCloseTo(88.26, 2)
  })

  it('takes the content height for a `normal` line height', () => {
    const box = fragmentLineBox(fragment({ lineHeight: null, strut: { lineHeight: null, metrics: GEORGIA_11PT } }))
    expect(box).toEqual({ block: 0, top: 100, bottom: 116 })
  })

  it('keeps the fragment\'s block', () => {
    expect(fragmentLineBox(fragment({ block: 7 })).block).toBe(7)
  })
})

describe('mergeLineBoxes', () => {
  it('merges the overlapping fragments of one line into one box', () => {
    expect(
      mergeLineBoxes([
        { block: 0, top: 69.19, bottom: 88.26 },
        { block: 0, top: 65.19, bottom: 88.26 },
      ]),
    ).toEqual([{ block: 0, top: 65.19, bottom: 88.26 }])
  })

  it('keeps two lines that only touch, and lines of different blocks, apart', () => {
    const merged = mergeLineBoxes([
      { block: 1, top: 10, bottom: 29 },
      { block: 0, top: 29, bottom: 48 },
      { block: 0, top: 10, bottom: 29 },
    ])
    expect(merged).toEqual([
      { block: 0, top: 10, bottom: 29 },
      { block: 0, top: 29, bottom: 48 },
      { block: 1, top: 10, bottom: 29 },
    ])
  })

  it('does not change its input', () => {
    const input = [
      { block: 0, top: 0, bottom: 19 },
      { block: 0, top: 1, bottom: 20 },
    ]
    mergeLineBoxes(input)
    expect(input).toEqual([
      { block: 0, top: 0, bottom: 19 },
      { block: 0, top: 1, bottom: 20 },
    ])
  })
})

describe('coverLetterLineBoxModel', () => {
  it('works rebuilt from its own source text, as the server hands it to the measuring page', () => {
    // Nothing outside the factory's body is in scope here: a reference to a
    // module-level helper would throw.
    const rebuild = new Function(`return (${coverLetterLineBoxModel.toString()})`) as () => typeof coverLetterLineBoxModel
    const rebuilt = rebuild()()
    const fragments = [
      fragment({ glyphTop: 9 }),
      fragment({ glyphTop: 61.19, glyphHeight: 27, metrics: GEORGIA_24PX }),
      fragment({ glyphTop: 70.19 }),
    ]
    expect(fragments.map(rebuilt.fragmentLineBox)).toEqual(fragments.map(fragmentLineBox))
    const boxes = fragments.map(fragmentLineBox)
    expect(rebuilt.mergeLineBoxes(boxes)).toEqual(mergeLineBoxes(boxes))
  })
})

describe('sameLineBoxes', () => {
  const lines = [
    { block: 0, top: 10, bottom: 29 },
    { block: 1, top: 29, bottom: 48 },
  ]

  it('is false before a first measurement', () => {
    expect(sameLineBoxes(null, lines)).toBe(false)
  })

  it('ignores differences under a hundredth of a px', () => {
    expect(sameLineBoxes(lines, lines.map((line) => ({ ...line, top: line.top + 0.005 })))).toBe(true)
  })

  it('tells apart a moved line, another block, or another count', () => {
    expect(sameLineBoxes(lines, [lines[0], { ...lines[1], top: 30 }])).toBe(false)
    expect(sameLineBoxes(lines, [lines[0], { ...lines[1], block: 2 }])).toBe(false)
    expect(sameLineBoxes(lines, [lines[0]])).toBe(false)
  })
})
