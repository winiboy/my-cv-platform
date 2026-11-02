/**
 * The browser's half of translating a cover letter into a new copy
 * (`POST /api/cover-letters/[id]/translate`, cover-letter-export-translate,
 * US-003), and how the answer is read.
 *
 * Pure apart from `fetch` and the timer, `fetch` being passed in, so every
 * branch is unit-tested without a browser. Navigation and the UI state belong
 * to the caller.
 */

export type CoverLetterTranslationLanguage = 'en' | 'fr' | 'de' | 'it'

/** What a translation request came to. Only `created` means a letter exists. */
export type CoverLetterTranslationResult =
  | { kind: 'created'; coverLetterId: string }
  | { kind: 'rate-limited' }
  | { kind: 'too-large' }
  | { kind: 'empty' }
  | { kind: 'failed' }

/**
 * How long the browser waits for the new letter before giving up.
 *
 * The route's work is one AI completion of up to 6,000 tokens inside a 60 s
 * function (`maxDuration` on the route). The PDF downloads wait 45 s, under
 * their own 60 s function, because a render past 30 s is abandoned by the
 * server; a translation has no such inner limit, so this waits PAST the
 * function's budget: giving up while the server can still insert the copy
 * would tell the user nothing was created and then create it.
 */
export const COVER_LETTER_TRANSLATE_TIMEOUT_MS = 65_000

/** The route's 422 body code for a letter with no text to translate. */
const EMPTY_LETTER = 'empty'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** A body's `key` when the body is an object holding a string there. */
function stringField(body: unknown, key: string): string | undefined {
  const value = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined
  return typeof value === 'string' ? value : undefined
}

/**
 * Ask the server to translate the SAVED letter into `targetLanguage`. Never
 * throws: a network failure or a request past `timeoutMs` is `failed`, like
 * any answer that is not a created letter with a well-formed id, which is the
 * only id the caller navigates to.
 */
export async function requestCoverLetterTranslation(
  coverLetterId: string,
  targetLanguage: CoverLetterTranslationLanguage,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = COVER_LETTER_TRANSLATE_TIMEOUT_MS,
): Promise<CoverLetterTranslationResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`/api/cover-letters/${encodeURIComponent(coverLetterId)}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage }),
      signal: controller.signal,
    })

    if (response.status === 429) return { kind: 'rate-limited' }
    if (response.status === 422) {
      return stringField(await readJson(response), 'error') === EMPTY_LETTER ? { kind: 'empty' } : { kind: 'too-large' }
    }
    if (response.status !== 201) return { kind: 'failed' }

    const id = stringField(await readJson(response), 'coverLetterId')
    return id !== undefined && UUID.test(id) ? { kind: 'created', coverLetterId: id } : { kind: 'failed' }
  } catch {
    // A network failure, or the abort above.
    return { kind: 'failed' }
  } finally {
    clearTimeout(timeout)
  }
}
