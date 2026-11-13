import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COVER_LETTER_MEASUREMENT_TIMEOUT_MS,
  COVER_LETTER_MIN_SHORTENING_TIME_MS,
  COVER_LETTER_REQUEST_BUDGET_MS,
  coverLetterOnePageDeadline,
  keepCoverLetterOnOnePage,
} from './cover-letter-one-page'

/** The decision both AI routes share (cover-letter-one-page, US-002). */

const FIRST = 'first letter'
const SHORTER = 'shorter letter'
const START = 1_000_000

/** Never settles: work that overruns every limit it was given. */
const never = <T>() => new Promise<T>(() => undefined)

function check(
  overrides: {
    pages?: () => Promise<number>
    shorten?: () => Promise<string>
    usable?: boolean
    /** Milliseconds already spent when the check starts. */
    spent?: number
    /** Milliseconds the measurement takes, on the injected clock. */
    measurementTakes?: number
  } = {},
) {
  let clock = START + (overrides.spent ?? 0)
  const countPages = vi.fn<(letter: string, timeoutMs: number) => Promise<number>>(async () => {
    clock += overrides.measurementTakes ?? 0
    return (overrides.pages ?? (async () => 1))()
  })
  const shorten = vi.fn<(letter: string, timeoutMs: number) => Promise<string>>(() =>
    (overrides.shorten ?? (async () => SHORTER))(),
  )
  const isUsable = vi.fn(() => overrides.usable ?? true)
  return {
    args: { letter: FIRST, deadline: coverLetterOnePageDeadline(START), countPages, shorten, isUsable, now: () => clock },
    countPages,
    shorten,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('keepCoverLetterOnOnePage', () => {
  it('keeps a letter that fits, and asks for nothing more', async () => {
    const { args, countPages, shorten } = check({ pages: async () => 1 })
    expect(await keepCoverLetterOnOnePage(args)).toEqual({ letter: FIRST, outcome: 'fits' })
    expect(countPages).toHaveBeenCalledTimes(1)
    expect(countPages).toHaveBeenCalledWith(FIRST, COVER_LETTER_MEASUREMENT_TIMEOUT_MS)
    expect(shorten).not.toHaveBeenCalled()
  })

  it('shortens a letter that runs over, once, and keeps the shorter one without measuring it again', async () => {
    const { args, countPages, shorten } = check({ pages: async () => 2 })
    expect(await keepCoverLetterOnOnePage(args)).toEqual({ letter: SHORTER, outcome: 'shortened' })
    expect(countPages).toHaveBeenCalledTimes(1)
    expect(shorten).toHaveBeenCalledTimes(1)
    expect(shorten).toHaveBeenCalledWith(FIRST, COVER_LETTER_REQUEST_BUDGET_MS)
  })

  it('keeps the first letter when the measurement fails, and does not shorten', async () => {
    const { args, shorten } = check({
      pages: async () => {
        throw new Error('no browser')
      },
    })
    expect(await keepCoverLetterOnOnePage(args)).toEqual({ letter: FIRST, outcome: 'unmeasured' })
    expect(shorten).not.toHaveBeenCalled()
  })

  it('keeps the first letter when the shortening call fails', async () => {
    const { args } = check({
      pages: async () => 3,
      shorten: async () => {
        throw new Error('provider down')
      },
    })
    expect(await keepCoverLetterOnOnePage(args)).toEqual({ letter: FIRST, outcome: 'shortening-failed' })
  })

  it('keeps the first letter when the shortened one is not usable', async () => {
    const { args } = check({ pages: async () => 2, usable: false })
    expect(await keepCoverLetterOnOnePage(args)).toEqual({ letter: FIRST, outcome: 'shortening-unusable' })
  })

  describe('the time budget', () => {
    it('leaves the request ten seconds of its 60 s maximum to store the letter and answer', () => {
      expect(COVER_LETTER_REQUEST_BUDGET_MS).toBe(50_000)
      expect(coverLetterOnePageDeadline(START)).toBe(START + 50_000)
    })

    it('gives the measurement 10 s at most, and never more than the time left', async () => {
      const plenty = check()
      await keepCoverLetterOnOnePage(plenty.args)
      expect(plenty.countPages).toHaveBeenCalledWith(FIRST, 10_000)

      const late = check({ spent: COVER_LETTER_REQUEST_BUDGET_MS - 4_000 })
      await keepCoverLetterOnOnePage(late.args)
      expect(late.countPages).toHaveBeenCalledWith(FIRST, 4_000)
    })

    it('keeps the first letter, unmeasured, when the measurement overruns its limit', async () => {
      vi.useFakeTimers()
      const { args, shorten } = check({ pages: never })

      const result = keepCoverLetterOnOnePage(args)
      await vi.advanceTimersByTimeAsync(COVER_LETTER_MEASUREMENT_TIMEOUT_MS)

      await expect(result).resolves.toEqual({ letter: FIRST, outcome: 'unmeasured' })
      expect(shorten).not.toHaveBeenCalled()
    })

    it('measures nothing and keeps the first letter when no time is left at all', async () => {
      const { args, countPages, shorten } = check({ spent: COVER_LETTER_REQUEST_BUDGET_MS })
      expect(await keepCoverLetterOnOnePage(args)).toEqual({ letter: FIRST, outcome: 'no-time' })
      expect(countPages).not.toHaveBeenCalled()
      expect(shorten).not.toHaveBeenCalled()
    })

    it('does not shorten, and keeps the first letter, when too little time is left after measuring', async () => {
      // The first call took most of the budget; the measurement takes 1 s more.
      const spent = COVER_LETTER_REQUEST_BUDGET_MS - COVER_LETTER_MIN_SHORTENING_TIME_MS
      const { args, shorten } = check({ pages: async () => 2, spent, measurementTakes: 1_000 })

      expect(await keepCoverLetterOnOnePage(args)).toEqual({ letter: FIRST, outcome: 'no-time' })
      expect(shorten).not.toHaveBeenCalled()
    })

    it('shortens with exactly the time left before the deadline', async () => {
      const spent = COVER_LETTER_REQUEST_BUDGET_MS - 20_000
      const { args, shorten } = check({ pages: async () => 2, spent, measurementTakes: 2_000 })

      await keepCoverLetterOnOnePage(args)

      expect(shorten).toHaveBeenCalledWith(FIRST, 18_000)
    })

    it('keeps the first letter when the shortening call overruns the time left', async () => {
      vi.useFakeTimers()
      const spent = COVER_LETTER_REQUEST_BUDGET_MS - 20_000
      const { args } = check({ pages: async () => 2, spent, shorten: never })

      const result = keepCoverLetterOnOnePage(args)
      await vi.advanceTimersByTimeAsync(20_000)

      await expect(result).resolves.toEqual({ letter: FIRST, outcome: 'shortening-failed' })
    })
  })
})
