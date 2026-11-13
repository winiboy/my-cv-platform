import { NextRequest, type NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

/**
 * The editor's Generate button (`POST /api/ai/generate-cover-letter`) shares
 * the cover-letter prompt with the letter created from a job application, which
 * may ask the AI for the company's address
 * (cover-letter-recipient-address-from-offer, US-002). This route must never
 * ask: its prompt stays the one it always sent, whatever the client posts.
 *
 * It also keeps the generated letter on one page (cover-letter-one-page,
 * US-002): measured inside the stored header of the letter being edited, and
 * shortened by one more call, within the same rate-limit unit.
 *
 * Only the session, the database, the rate limit, the page count and the
 * provider call are replaced; the prompts are built by the real builders.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'
const COVER_LETTER_ID = '44444444-4444-4444-8444-444444444444'

const generateCompletion = vi.fn<(prompt: string, options: unknown, request?: unknown) => Promise<{ text: string }>>()
const enforceAiRateLimit = vi.fn<() => Promise<NextResponse | null>>()

type Row = Record<string, unknown>
interface RecordedRead {
  table: string
  columns?: string
  filters: Array<[string, unknown]>
}

/** The stored letters and CVs, by table; `null` until a test seeds one. */
const db: { letter: Row | null; resume: Row | null; reads: RecordedRead[]; failLetterRead: boolean } = {
  letter: null,
  resume: null,
  reads: [],
  failLetterRead: false,
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from(table: string) {
      if (table !== 'cover_letters' && table !== 'resumes') throw new Error(`no ${table} read expected`)
      const read: RecordedRead = { table, filters: [] }
      db.reads.push(read)
      const builder = {
        select(columns: string) {
          read.columns = columns
          return builder
        },
        eq(column: string, value: unknown) {
          read.filters.push([column, value])
          return builder
        },
        async maybeSingle() {
          if (table === 'cover_letters' && db.failLetterRead) return { data: null, error: { code: 'XX000' } }
          // Mirrors RLS plus the route's filters: another user's row is invisible.
          const row = table === 'cover_letters' ? db.letter : db.resume
          const visible = row && read.filters.every(([column, value]) => row[column] === value)
          return { data: visible ? row : null, error: null }
        },
      }
      return builder
    },
  }),
}))
vi.mock('@/lib/ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/client')>()),
  // Every argument passed on, so a test sees the shortening call's per-request limits.
  generateCompletion: (...args: [string, unknown, unknown?]) => generateCompletion(...args),
}))
vi.mock('@/lib/api/ai-rate-limit', () => ({
  enforceAiRateLimit: () => enforceAiRateLimit(),
}))

// The measurement itself is checked against the PDF in
// `src/lib/pdf/measure-cover-letter.integration.test.ts` and end to end.
type CountPages = typeof import('@/lib/pdf/cover-letter-page-count').countCoverLetterPages
const countCoverLetterPages = vi.fn<CountPages>()
vi.mock('@/lib/pdf/cover-letter-page-count', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdf/cover-letter-page-count')>()),
  countCoverLetterPages: (...args: Parameters<CountPages>) => countCoverLetterPages(...args),
}))

const { POST } = await import('./route')
const { buildCoverLetterGenerationPrompt, buildCoverLetterShorteningPrompt } = await import('@/lib/ai/prompts')
const { AiCompletionError, MODELS } = await import('@/lib/ai/client')
const {
  COVER_LETTER_MEASUREMENT_TIMEOUT_MS,
  COVER_LETTER_MIN_SHORTENING_TIME_MS,
  COVER_LETTER_REQUEST_BUDGET_MS,
} = await import('@/lib/ai/cover-letter-one-page')

const OFFER = 'Nous recherchons un ingénieur. Envoyez votre dossier à Rue du Lac 5, 1201 Genève.'

const FIRST_LETTER = {
  greeting: 'Madame, Monsieur,',
  openingParagraph: 'Ouverture.',
  bodyParagraphs: ['Corps.'],
  closingParagraph: 'Conclusion.',
  signOff: 'Salutations,',
}

const SHORTER_LETTER = {
  greeting: 'Madame, Monsieur,',
  openingParagraph: 'Ouverture courte.',
  bodyParagraphs: ['Corps court.'],
  closingParagraph: 'Conclusion courte.',
  signOff: 'Salutations,',
}

const REQUEST = { jobDescription: OFFER, jobTitle: 'Ingénieur', companyName: 'Beispiel SA', locale: 'fr' }

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ai/generate-cover-letter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function reply(letter: unknown): { text: string } {
  return { text: JSON.stringify(letter) }
}

let consoleInfo: MockInstance

beforeEach(() => {
  generateCompletion.mockReset()
  generateCompletion.mockResolvedValue(reply(FIRST_LETTER))
  enforceAiRateLimit.mockReset()
  enforceAiRateLimit.mockResolvedValue(null)
  countCoverLetterPages.mockReset()
  countCoverLetterPages.mockResolvedValue(1)
  db.letter = null
  db.resume = null
  db.reads = []
  db.failLetterRead = false
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
})

afterEach(() => {
  consoleInfo.mockRestore()
})

describe('POST /api/ai/generate-cover-letter - the company address', () => {
  it('never asks the AI for an address, even when the client posts the opt-in', async () => {
    const response = await POST(
      createRequest({
        jobDescription: OFFER,
        jobTitle: 'Ingénieur',
        companyName: 'Beispiel SA',
        locale: 'fr',
        askCompanyAddress: true,
      })
    )

    expect(response.status).toBe(200)
    expect(generateCompletion).toHaveBeenCalledTimes(1)
    const [prompt] = generateCompletion.mock.calls[0]
    expect(prompt).toBe(
      buildCoverLetterGenerationPrompt({
        jobDescription: OFFER,
        jobTitle: 'Ingénieur',
        companyName: 'Beispiel SA',
        locale: 'fr',
      })
    )
    expect(prompt).not.toContain('companyAddress')
  })

  it('never asks for an address in the shortening call either', async () => {
    countCoverLetterPages.mockResolvedValue(2)
    generateCompletion.mockResolvedValueOnce(reply(FIRST_LETTER)).mockResolvedValueOnce(reply(SHORTER_LETTER))

    await POST(createRequest({ ...REQUEST, askCompanyAddress: true }))

    expect(generateCompletion).toHaveBeenCalledTimes(2)
    expect(generateCompletion.mock.calls[1][0]).not.toContain('companyAddress')
  })
})

describe('POST /api/ai/generate-cover-letter - one page (cover-letter-one-page, US-002)', () => {
  it('answers a letter that fits with one AI call and one rate-limit unit, as it always answered', async () => {
    const response = await POST(createRequest(REQUEST))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, coverLetter: FIRST_LETTER })
    expect(generateCompletion).toHaveBeenCalledTimes(1)
    // The model settings and the monitoring name this route always had.
    expect(generateCompletion.mock.calls[0][1]).toEqual({
      model: MODELS.BALANCED,
      temperature: 0.7,
      maxTokens: 1500,
      operation: 'generateCompletion',
    })
    expect(enforceAiRateLimit).toHaveBeenCalledTimes(1)
    expect(countCoverLetterPages).toHaveBeenCalledTimes(1)
    expect(consoleInfo).toHaveBeenCalledWith('[ai/generate-cover-letter] One-page check:', 'fits')
  })

  it('keeps the defaults it always gave an empty greeting or sign-off', async () => {
    generateCompletion.mockResolvedValue(reply({ ...FIRST_LETTER, greeting: '', signOff: '' }))

    const response = await POST(createRequest(REQUEST))

    const { coverLetter } = await response.json()
    expect(coverLetter.greeting).toBe('Dear Hiring Manager,')
    expect(coverLetter.signOff).toBe('Sincerely,')
  })

  it('answers a reply that is not a letter as it always did', async () => {
    generateCompletion.mockResolvedValue({ text: 'Voici votre lettre.' })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(createRequest(REQUEST))
    errors.mockRestore()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to parse AI response' })
    expect(countCoverLetterPages).not.toHaveBeenCalled()
  })

  it('shortens a letter that runs over with exactly one more call, and answers the shorter one', async () => {
    countCoverLetterPages.mockResolvedValue(2)
    generateCompletion.mockResolvedValueOnce(reply(FIRST_LETTER)).mockResolvedValueOnce(reply(SHORTER_LETTER))

    const response = await POST(createRequest(REQUEST))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, coverLetter: SHORTER_LETTER })
    expect(generateCompletion).toHaveBeenCalledTimes(2)
    expect(generateCompletion.mock.calls[1][0]).toBe(
      buildCoverLetterShorteningPrompt({ letter: FIRST_LETTER, locale: 'fr' })
    )
    expect(enforceAiRateLimit).toHaveBeenCalledTimes(1)
    expect(countCoverLetterPages).toHaveBeenCalledTimes(1)
    expect(consoleInfo).toHaveBeenCalledWith('[ai/generate-cover-letter] One-page check:', 'shortened')
  })

  it('answers the shorter letter as it is when it still runs over', async () => {
    countCoverLetterPages.mockResolvedValue(3)
    const stillLong = { ...SHORTER_LETTER, bodyParagraphs: ['Un.', 'Deux.', 'Trois.', 'Quatre.'] }
    generateCompletion.mockResolvedValueOnce(reply(FIRST_LETTER)).mockResolvedValueOnce(reply(stillLong))

    const response = await POST(createRequest(REQUEST))

    await expect(response.json()).resolves.toEqual({ success: true, coverLetter: stillLong })
    expect(generateCompletion).toHaveBeenCalledTimes(2)
    expect(countCoverLetterPages).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['the provider fails', () => Promise.reject(new AiCompletionError('provider_error', 'test-model', 500))],
    ['the reply is not JSON', () => Promise.resolve({ text: 'Plus court.' })],
    ['the reply has no body', () => Promise.resolve(reply({ ...SHORTER_LETTER, bodyParagraphs: [] }))],
    ['the reply has a blank opening', () => Promise.resolve(reply({ ...SHORTER_LETTER, openingParagraph: '  ' }))],
  ])('answers the first letter when %s on the shortening call', async (_case, shortening) => {
    countCoverLetterPages.mockResolvedValue(2)
    generateCompletion.mockResolvedValueOnce(reply(FIRST_LETTER)).mockImplementationOnce(shortening)

    const response = await POST(createRequest(REQUEST))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, coverLetter: FIRST_LETTER })
    expect(generateCompletion).toHaveBeenCalledTimes(2)
    expect(enforceAiRateLimit).toHaveBeenCalledTimes(1)
  })

  it('answers the first letter, with no second call, when the measurement fails', async () => {
    countCoverLetterPages.mockRejectedValue(new Error('no browser'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(createRequest(REQUEST))
    errors.mockRestore()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, coverLetter: FIRST_LETTER })
    expect(generateCompletion).toHaveBeenCalledTimes(1)
    expect(consoleInfo).toHaveBeenCalledWith('[ai/generate-cover-letter] One-page check:', 'unmeasured')
  })

  describe('within the time budget (60 s maxDuration, 50 s for the AI and the check)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('answers the first letter, unmeasured, when the measurement overruns its 10 s', async () => {
      vi.useFakeTimers()
      countCoverLetterPages.mockReturnValue(new Promise<number>(() => undefined))

      const responding = POST(createRequest(REQUEST))
      await vi.advanceTimersByTimeAsync(COVER_LETTER_MEASUREMENT_TIMEOUT_MS)
      const response = await responding

      await expect(response.json()).resolves.toEqual({ success: true, coverLetter: FIRST_LETTER })
      expect(generateCompletion).toHaveBeenCalledTimes(1)
      expect(enforceAiRateLimit).toHaveBeenCalledTimes(1)
      expect(countCoverLetterPages.mock.calls[0][3]).toBe(COVER_LETTER_MEASUREMENT_TIMEOUT_MS)
      expect(consoleInfo).toHaveBeenCalledWith('[ai/generate-cover-letter] One-page check:', 'unmeasured')
    })

    it('answers the first letter without a second call when too little time is left to shorten', async () => {
      vi.useFakeTimers()
      countCoverLetterPages.mockResolvedValue(2)
      generateCompletion.mockImplementationOnce(async () => {
        vi.advanceTimersByTime(COVER_LETTER_REQUEST_BUDGET_MS - COVER_LETTER_MIN_SHORTENING_TIME_MS + 1_000)
        return reply(FIRST_LETTER)
      })

      const response = await POST(createRequest(REQUEST))

      await expect(response.json()).resolves.toEqual({ success: true, coverLetter: FIRST_LETTER })
      expect(generateCompletion).toHaveBeenCalledTimes(1)
      expect(enforceAiRateLimit).toHaveBeenCalledTimes(1)
      expect(consoleInfo).toHaveBeenCalledWith('[ai/generate-cover-letter] One-page check:', 'no-time')
    })

    it('answers the first letter when the shortening call overruns the time left, which it was given with no retry', async () => {
      vi.useFakeTimers()
      countCoverLetterPages.mockResolvedValue(2)
      generateCompletion
        .mockResolvedValueOnce(reply(FIRST_LETTER))
        .mockReturnValueOnce(new Promise<{ text: string }>(() => undefined))

      const responding = POST(createRequest(REQUEST))
      await vi.advanceTimersByTimeAsync(COVER_LETTER_REQUEST_BUDGET_MS)
      const response = await responding

      await expect(response.json()).resolves.toEqual({ success: true, coverLetter: FIRST_LETTER })
      expect(generateCompletion).toHaveBeenCalledTimes(2)
      expect(enforceAiRateLimit).toHaveBeenCalledTimes(1)
      const limits = generateCompletion.mock.calls[1][2] as { timeoutMs: number; maxRetries: number }
      expect(limits.maxRetries).toBe(0)
      expect(limits.timeoutMs).toBeGreaterThanOrEqual(COVER_LETTER_MIN_SHORTENING_TIME_MS)
      expect(limits.timeoutMs).toBeLessThanOrEqual(COVER_LETTER_REQUEST_BUDGET_MS)
      expect(consoleInfo).toHaveBeenCalledWith('[ai/generate-cover-letter] One-page check:', 'shortening-failed')
    })

    it('makes the first call as before: no per-request limit on it', async () => {
      await POST(createRequest(REQUEST))
      expect(generateCompletion.mock.calls[0]).toHaveLength(2)
    })
  })

  it('keeps the greeting and sign-off of the first letter in the shorter one', async () => {
    countCoverLetterPages.mockResolvedValue(2)
    generateCompletion
      .mockResolvedValueOnce(reply(FIRST_LETTER))
      .mockResolvedValueOnce(reply({ ...SHORTER_LETTER, greeting: undefined, signOff: 'Bien à vous,' }))

    const response = await POST(createRequest(REQUEST))

    const { coverLetter } = await response.json()
    expect(coverLetter).toEqual({ ...SHORTER_LETTER, greeting: FIRST_LETTER.greeting, signOff: FIRST_LETTER.signOff })
  })

  it('spends no AI call and no measurement when the rate limit refuses', async () => {
    enforceAiRateLimit.mockResolvedValue(new Response(null, { status: 429 }) as NextResponse)

    const response = await POST(createRequest(REQUEST))

    expect(response.status).toBe(429)
    expect(generateCompletion).not.toHaveBeenCalled()
    expect(countCoverLetterPages).not.toHaveBeenCalled()
  })

  describe('the header the letter is measured in', () => {
    const STORED = {
      id: COVER_LETTER_ID,
      user_id: USER_ID,
      title: 'Lettre',
      resume_id: null,
      sender_name: 'Zoë Lovelace',
      sender_street: 'Rue de Bourg 12',
      sender_postal_locality: '1003 Lausanne',
      sender_phone: null,
      sender_email: 'zoe@example.ch',
      recipient_name: 'Madame Claire Dupont',
      recipient_title: null,
      company_name: 'Acme SA',
      company_address: 'Avenue de la Gare 10\n1000 Lausanne',
      job_title: 'Ingénieur',
      greeting: 'Ancienne salutation,',
      opening_paragraph: '<p>Ancienne ouverture.</p>',
      body_paragraphs: ['<p>Ancien corps.</p>'],
      closing_paragraph: '<p>Ancienne conclusion.</p>',
      sign_off: 'Ancienne formule,',
      annexes: 'CV',
    }

    const EMPTY_HEADER = {
      sender_name: null,
      sender_street: null,
      sender_postal_locality: null,
      sender_phone: null,
      sender_email: null,
      recipient_name: null,
      recipient_title: null,
      company_name: null,
      company_address: null,
      job_title: null,
      annexes: null,
    }

    const GENERATED_FIELDS = {
      greeting: 'Madame, Monsieur,',
      opening_paragraph: 'Ouverture.',
      body_paragraphs: ['Corps.'],
      closing_paragraph: 'Conclusion.',
      sign_off: 'Salutations,',
    }

    it("is the stored letter's, read with the caller's owner filter, with the generated text in place of its own", async () => {
      db.letter = STORED

      await POST(createRequest({ ...REQUEST, coverLetterId: COVER_LETTER_ID }))

      const read = db.reads.find((entry) => entry.table === 'cover_letters')
      expect(read?.filters).toEqual([
        ['id', COVER_LETTER_ID],
        ['user_id', USER_ID],
      ])
      const [fields, senderDetails, language] = countCoverLetterPages.mock.calls[0]
      expect(fields).toEqual({
        sender_name: 'Zoë Lovelace',
        sender_street: 'Rue de Bourg 12',
        sender_postal_locality: '1003 Lausanne',
        sender_phone: null,
        sender_email: 'zoe@example.ch',
        recipient_name: 'Madame Claire Dupont',
        recipient_title: null,
        company_name: 'Acme SA',
        company_address: 'Avenue de la Gare 10\n1000 Lausanne',
        job_title: 'Ingénieur',
        annexes: 'CV',
        ...GENERATED_FIELDS,
      })
      expect(senderDetails).toEqual({
        sender_street: 'Rue de Bourg 12',
        sender_postal_locality: '1003 Lausanne',
        sender_phone: null,
        sender_email: 'zoe@example.ch',
      })
      expect(language).toBe('fr')
    })

    it("is an empty letter's for another user's letter: nothing of it is measured", async () => {
      db.letter = { ...STORED, user_id: OTHER_USER_ID }

      await POST(createRequest({ ...REQUEST, coverLetterId: COVER_LETTER_ID }))

      expect(countCoverLetterPages.mock.calls[0][0]).toEqual({ ...EMPTY_HEADER, ...GENERATED_FIELDS })
    })

    it("is an empty letter's without an id, and nothing is read", async () => {
      await POST(createRequest(REQUEST))

      expect(db.reads).toEqual([])
      expect(countCoverLetterPages.mock.calls[0][0]).toEqual({ ...EMPTY_HEADER, ...GENERATED_FIELDS })
    })

    it("is an empty letter's for an id that is not a letter id, and nothing is read", async () => {
      await POST(createRequest({ ...REQUEST, coverLetterId: "' OR 1=1 --" }))

      expect(db.reads).toEqual([])
      expect(countCoverLetterPages.mock.calls[0][0]).toEqual({ ...EMPTY_HEADER, ...GENERATED_FIELDS })
    })

    it("is an empty letter's when the letter cannot be read, and the generation still succeeds", async () => {
      db.letter = STORED
      db.failLetterRead = true
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const response = await POST(createRequest({ ...REQUEST, coverLetterId: COVER_LETTER_ID }))
      errors.mockRestore()

      expect(response.status).toBe(200)
      expect(countCoverLetterPages.mock.calls[0][0]).toEqual({ ...EMPTY_HEADER, ...GENERATED_FIELDS })
    })

    it('refuses an oversized id before any AI call', async () => {
      const response = await POST(createRequest({ ...REQUEST, coverLetterId: 'x'.repeat(10_000) }))

      expect(response.status).toBe(400)
      expect(generateCompletion).not.toHaveBeenCalled()
    })
  })
})
