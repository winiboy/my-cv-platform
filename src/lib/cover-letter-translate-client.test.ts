import { afterEach, describe, expect, it, vi } from 'vitest'
import { COVER_LETTER_TRANSLATE_TIMEOUT_MS, requestCoverLetterTranslation } from './cover-letter-translate-client'

/**
 * The browser's half of translating a cover letter (cover-letter-export-translate,
 * US-003): the request it sends, and every answer read as an outcome the editor
 * can show. Only a 201 with a well-formed id is a created letter.
 */

const LETTER_ID = '44444444-4444-4444-8444-444444444444'
const COPY_ID = '55555555-5555-4555-8555-555555555555'

const answer = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('requestCoverLetterTranslation', () => {
  it('posts only the target language to the letter\'s translate route', async () => {
    const fetchImpl = answer(201, { coverLetterId: COPY_ID })
    await requestCoverLetterTranslation(LETTER_ID, 'de', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith(`/api/cover-letters/${LETTER_ID}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"targetLanguage":"de"}',
      signal: expect.any(AbortSignal),
    })
  })

  it('reads a 201 with an id as the created letter', async () => {
    expect(await requestCoverLetterTranslation(LETTER_ID, 'it', answer(201, { coverLetterId: COPY_ID }))).toEqual({
      kind: 'created',
      coverLetterId: COPY_ID,
    })
  })

  it.each([
    [429, {}, 'rate-limited'],
    [422, {}, 'too-large'],
    [422, { error: 'Cover letter too large to translate' }, 'too-large'],
    [422, { error: 'empty' }, 'empty'],
    [422, { error: ['empty'] }, 'too-large'],
    [502, { error: 'x' }, 'failed'],
    [500, {}, 'failed'],
    [404, {}, 'failed'],
    [401, {}, 'failed'],
    [200, { coverLetterId: COPY_ID }, 'failed'],
    [201, {}, 'failed'],
    [201, { coverLetterId: '../../admin' }, 'failed'],
    [201, null, 'failed'],
  ])('reads %s %j as %s', async (status, body, kind) => {
    expect(await requestCoverLetterTranslation(LETTER_ID, 'fr', answer(status, body))).toEqual({ kind })
  })

  it('reads a body that is not JSON, or a network failure, as failed', async () => {
    const notJson = vi.fn<typeof fetch>(async () => new Response('<html>', { status: 201 }))
    expect(await requestCoverLetterTranslation(LETTER_ID, 'en', notJson)).toEqual({ kind: 'failed' })
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await requestCoverLetterTranslation(LETTER_ID, 'en', offline)).toEqual({ kind: 'failed' })
  })

  describe('timeout', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    /** A server that never answers, but honours the abort as `fetch` does. */
    const hanging = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
    )

    it('gives up after the timeout and reads it as failed', async () => {
      vi.useFakeTimers()
      const result = requestCoverLetterTranslation(LETTER_ID, 'de', hanging)
      await vi.advanceTimersByTimeAsync(COVER_LETTER_TRANSLATE_TIMEOUT_MS - 1)
      let settled = false
      void result.then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await result).toEqual({ kind: 'failed' })
    })

    it("waits past the route's 60 s function budget, so it never abandons a copy the server can still create", () => {
      expect(COVER_LETTER_TRANSLATE_TIMEOUT_MS).toBeGreaterThan(60_000)
    })

    it('clears its timer once answered', async () => {
      vi.useFakeTimers()
      await requestCoverLetterTranslation(LETTER_ID, 'de', answer(201, { coverLetterId: COPY_ID }))
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
