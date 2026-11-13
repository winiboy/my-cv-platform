/**
 * Keeping a letter the AI wrote on one page (cover-letter-one-page, US-002).
 *
 * After the first AI call, the letter is laid out as the PDF prints it and its
 * pages counted. A letter that fits is kept as it is: one AI call, as before.
 * A letter that runs over gets exactly one more call, asking for a shorter
 * version of the same letter, which is kept whatever its length: it is never
 * cut, and the preview's page-break marker shows any overflow left. Whenever
 * the check or the shortening fails, or there is no time left for it, the
 * first letter is kept and the request goes on as it would have without the
 * check.
 *
 * TIME. Both routes run with `maxDuration = 60` (seconds), the repository's
 * limit for long routes. Each records `coverLetterOnePageDeadline` when it starts;
 * everything here finishes before that deadline, which leaves the rest of the
 * minute to store the letter and answer. Every wait is bounded twice: by the
 * limit handed to the work (the browser's render deadline, the AI call's
 * timeout), and by a timer here, so that work that overruns its own limit
 * cannot hold the request.
 *
 * The AI rate limit is counted once per request by the route, before the first
 * call; nothing here counts it again.
 */

/** The request's working time, from its start: `maxDuration` (60 s) less 10 s to store the letter and answer. */
export const COVER_LETTER_REQUEST_BUDGET_MS = 50_000

/**
 * The longest the measurement may take, browser launch included. A measurement
 * takes about 0.2 s on a warm local machine; a serverless cold start
 * (unpacking Chromium) a few seconds. One that takes longer leaves the letter
 * unmeasured and kept.
 */
export const COVER_LETTER_MEASUREMENT_TIMEOUT_MS = 10_000

/**
 * The least time left for the shortening call to be worth making: a one-page
 * letter's JSON takes the provider a few seconds. With less, the first letter
 * is kept without a second call.
 */
export const COVER_LETTER_MIN_SHORTENING_TIME_MS = 12_000

/** The deadline of a request that started at `startedAt` (ms since the epoch). */
export function coverLetterOnePageDeadline(startedAt: number): number {
  return startedAt + COVER_LETTER_REQUEST_BUDGET_MS
}

/** What the check did, for the route's log. Carries no letter text. */
export type OnePageOutcome =
  /** Measured at one page: the first letter, one AI call. */
  | 'fits'
  /** The measurement failed or timed out (no browser, no free slot): the first letter, one AI call. */
  | 'unmeasured'
  /** Too little time left to measure, or to shorten a letter found too long: the first letter, one AI call. */
  | 'no-time'
  /** Measured over one page and shortened: the shorter letter, two AI calls. */
  | 'shortened'
  /** The shortening call failed or timed out: the first letter, two AI calls. */
  | 'shortening-failed'
  /** The shortening call answered without a usable letter: the first letter, two AI calls. */
  | 'shortening-unusable'

export interface OnePageCheck<Letter> {
  /** The letter the AI just wrote. */
  letter: Letter
  /** When the work here must be over, in ms since the epoch (`coverLetterOnePageDeadline`). */
  deadline: number
  /** Pages the letter prints on, within `timeoutMs`. May throw: the letter is then kept as it is. */
  countPages: (letter: Letter, timeoutMs: number) => Promise<number>
  /** The one shortening call, within `timeoutMs`. May throw: the first letter is then kept. */
  shorten: (letter: Letter, timeoutMs: number) => Promise<Letter>
  /** Whether the shortened letter has every part a letter needs, once cleaned. */
  isUsable: (letter: Letter) => boolean
  /** The clock; `Date.now` unless a test replaces it. */
  now?: () => number
}

export interface OnePageResult<Letter> {
  letter: Letter
  outcome: OnePageOutcome
}

class OnePageTimeout extends Error {
  constructor() {
    super('The one-page check ran out of time')
    this.name = 'OnePageTimeout'
  }
}

/**
 * `work`, or a rejection once `timeoutMs` has passed, whichever comes first.
 * Work still running past it is left to finish on its own; its outcome is
 * ignored.
 */
function within<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  work.catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OnePageTimeout()), timeoutMs)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/**
 * The letter to keep. Calls `countPages` at most once, and `shorten` at most
 * once, only for a letter that runs over one page and only with at least
 * `COVER_LETTER_MIN_SHORTENING_TIME_MS` left before the deadline.
 */
export async function keepCoverLetterOnOnePage<Letter>(check: OnePageCheck<Letter>): Promise<OnePageResult<Letter>> {
  const now = check.now ?? Date.now
  const first: OnePageResult<Letter> = { letter: check.letter, outcome: 'unmeasured' }

  const measurementTime = Math.min(COVER_LETTER_MEASUREMENT_TIMEOUT_MS, check.deadline - now())
  if (measurementTime <= 0) return { ...first, outcome: 'no-time' }

  let pages: number
  try {
    pages = await within(check.countPages(check.letter, measurementTime), measurementTime)
  } catch {
    return first
  }
  if (pages <= 1) return { ...first, outcome: 'fits' }

  const shorteningTime = check.deadline - now()
  if (shorteningTime < COVER_LETTER_MIN_SHORTENING_TIME_MS) return { ...first, outcome: 'no-time' }

  let shortened: Letter
  try {
    shortened = await within(check.shorten(check.letter, shorteningTime), shorteningTime)
  } catch {
    return { ...first, outcome: 'shortening-failed' }
  }
  if (!check.isUsable(shortened)) return { ...first, outcome: 'shortening-unusable' }
  return { letter: shortened, outcome: 'shortened' }
}
