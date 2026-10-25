import { describe, expect, it } from 'vitest'
import { linearCeiling, measureScaling } from './linear-time'

/**
 * The thresholds the complexity tests rely on, checked against operations
 * whose growth is known by construction, at the growth factor those tests use:
 * at 8x the input, constant cost stays below 2, linear below `linearCeiling(8)`
 * (≈ 22.6) and quadratic above it.
 *
 * The operations are string scans, like the sanitizers and the language
 * detector these thresholds guard: their cost is in the scan itself, not in a
 * JavaScript micro-loop whose JIT tier could differ between the two sides.
 */

const GROWTH = 8

/** A character the texts below never contain, so every search reads to the end. */
const ABSENT = '\u0000'

const textOf = (length: number): string => 'x'.repeat(length)

/** Reads the first 10,000 characters, whatever the length of the text. */
const scanPrefix = (text: string): number => text.slice(0, 10_000).indexOf(ABSENT)

/** Reads the whole text once. */
const scanAll = (text: string): number => text.indexOf(ABSENT)

/** Reads the rest of the text from every position: the defect the tests catch. */
function rescanFromEveryPosition(text: string): number {
  let found = 0
  for (let index = 0; index < text.length; index += 1) {
    found += text.indexOf(ABSENT, index)
  }
  return found
}

describe('measureScaling', () => {
  it('measures a constant-cost operation below 2', () => {
    const small = textOf(25_000)
    const large = textOf(25_000 * GROWTH)
    const { ratio } = measureScaling(
      () => scanPrefix(small),
      () => scanPrefix(large)
    )
    expect(ratio).toBeLessThan(2)
  })

  it('measures a linear operation above 2 and below the linear ceiling', () => {
    const small = textOf(125_000)
    const large = textOf(125_000 * GROWTH)
    const { ratio } = measureScaling(
      () => scanAll(small),
      () => scanAll(large)
    )
    expect(ratio).toBeGreaterThan(2)
    expect(ratio).toBeLessThan(linearCeiling(GROWTH))
  })

  it('measures a quadratic operation above the linear ceiling', () => {
    const small = textOf(4_000)
    const large = textOf(4_000 * GROWTH)
    const { ratio } = measureScaling(
      () => rescanFromEveryPosition(small),
      () => rescanFromEveryPosition(large)
    )
    expect(ratio).toBeGreaterThan(linearCeiling(GROWTH))
  })
})
