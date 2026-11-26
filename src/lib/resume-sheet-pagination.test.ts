import { describe, expect, it } from 'vitest'
import {
  breaksBetweenLines,
  lineBandsShape,
  paginateOrFallBack,
  type LineBoxCandidate,
  type SheetLineBand,
} from './resume-sheet-pagination'

/**
 * The pushes a pagination writes, held as `createSheetStyles` holds them, so a
 * test can see what is left once it is done.
 */
function recordingStyles() {
  const pushes = new Map<string, number>()
  const gaps = new Map<string, readonly SheetLineBand[]>()
  let fill: number | null = null
  return {
    pushes,
    gaps,
    fill: () => fill,
    push: (element: string, marginTop: number) => pushes.set(element, marginTop),
    breakLines: (element: string, bands: readonly SheetLineBand[]) => gaps.set(element, bands),
    setFill: (height: number) => {
      fill = height
    },
    reset() {
      pushes.clear()
      gaps.clear()
      fill = null
    },
  }
}

describe('paginateOrFallBack', () => {
  it('returns the sheet count a pagination that succeeds draws', () => {
    const styles = recordingStyles()
    const reports: unknown[] = []
    const count = paginateOrFallBack(
      () => {
        styles.push('entry', 120)
        styles.setFill(2 * 1147 - 24)
        return 2
      },
      styles,
      (error) => reports.push(error),
    )
    expect(count).toBe(2)
    expect(styles.pushes.size).toBe(1)
    expect(reports).toEqual([])
  })

  it('removes every half-applied push and gap, reports, and draws one continuous sheet when a measurement throws', () => {
    const styles = recordingStyles()
    const reports: unknown[] = []
    const failure = new RangeError('Invalid line: top NaN, bottom 5')
    const count = paginateOrFallBack(
      () => {
        styles.push('entry', 120)
        styles.breakLines('summary', [{ start: 10, end: 90 }])
        // A measurement that is not a layout, as the arithmetic rejects it.
        throw failure
      },
      styles,
      (error) => reports.push(error),
    )
    expect(count).toBe(1)
    expect(styles.pushes.size).toBe(0)
    expect(styles.gaps.size).toBe(0)
    expect(styles.fill()).toBeNull()
    expect(reports).toEqual([failure])
  })
})

describe('breaksBetweenLines', () => {
  const paragraph: LineBoxCandidate = {
    display: 'block',
    listStylePosition: 'outside',
    beforeContent: 'none',
    replaced: false,
    hasText: true,
    descendants: [{ display: 'inline', replaced: false }],
  }

  it('accepts a block or a list item of plain inline text', () => {
    expect(breaksBetweenLines(paragraph)).toBe(true)
    expect(breaksBetweenLines({ ...paragraph, display: 'list-item' })).toBe(true)
    expect(breaksBetweenLines({ ...paragraph, beforeContent: 'normal', descendants: [] })).toBe(true)
  })

  it('moves whole a list item whose marker sits inside its first line', () => {
    expect(breaksBetweenLines({ ...paragraph, display: 'list-item', listStylePosition: 'inside' })).toBe(false)
  })

  it('moves whole a block whose ::before is taken, or whose content is not plain inline text', () => {
    expect(breaksBetweenLines({ ...paragraph, beforeContent: '"•"' })).toBe(false)
    expect(breaksBetweenLines({ ...paragraph, descendants: [{ display: 'inline-block', replaced: false }] })).toBe(false)
    expect(breaksBetweenLines({ ...paragraph, descendants: [{ display: 'inline', replaced: true }] })).toBe(false)
    expect(breaksBetweenLines({ ...paragraph, display: 'flex' })).toBe(false)
    expect(breaksBetweenLines({ ...paragraph, hasText: false })).toBe(false)
    expect(breaksBetweenLines({ ...paragraph, replaced: true })).toBe(false)
  })
})

describe('lineBandsShape', () => {
  it('excludes one band the float’s full width, and nothing above it', () => {
    expect(lineBandsShape([{ start: 30, end: 90 }])).toBe('polygon(0px 30px, 100% 30px, 100% 90px, 0px 90px)')
  })

  it('joins several bands along the left edge, where a segment of no width excludes nothing', () => {
    expect(lineBandsShape([{ start: 30, end: 90 }, { start: 150.5, end: 300.25 }])).toBe(
      'polygon(0px 30px, 100% 30px, 100% 90px, 0px 90px, 0px 150.5px, 100% 150.5px, 100% 300.25px, 0px 300.25px)',
    )
  })

  it('rejects bands that are empty, overlapping, out of order or not finite', () => {
    expect(() => lineBandsShape([])).toThrow(RangeError)
    expect(() => lineBandsShape([{ start: 30, end: 30 }])).toThrow(RangeError)
    expect(() => lineBandsShape([{ start: 30, end: 90 }, { start: 80, end: 120 }])).toThrow(RangeError)
    expect(() => lineBandsShape([{ start: -1, end: 10 }])).toThrow(RangeError)
    expect(() => lineBandsShape([{ start: 0, end: Number.NaN }])).toThrow(RangeError)
  })
})
