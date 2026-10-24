import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCompletionError } from '@/lib/ai/client'

/**
 * Unit coverage for `POST /api/cover-letters/from-job-application`
 * (cover-letter-from-job, US-001): authentication, ownership of the
 * application and of the CV, the CV in the prompt, the letter's language, the
 * missing description, every AI failure, sanitizing and the stored row.
 *
 * Supabase is replaced by a recorder that answers each query from the test's
 * state and keeps every call, so a test can assert both what was written and
 * that nothing was written. Only the provider call (`generateCompletion`) is
 * mocked: the prompt, the reply parsing and the sanitizing are the real ones.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222'
const RESUME_ID = '33333333-3333-4333-8333-333333333333'
const COVER_LETTER_ID = '44444444-4444-4444-8444-444444444444'

const GERMAN_DESCRIPTION = `Wir suchen eine Data Engineer (m/w/d) für unser Team in Zürich. Sie sind für die
  Konzeption der Datenpipelines verantwortlich und arbeiten eng mit den Produktteams zusammen. Ihr Profil:
  mindestens 3 Jahre Erfahrung in einer ähnlichen Position und sehr gute Python-Kenntnisse. Wir bieten Ihnen ein
  dynamisches Umfeld und ein motiviertes Team an unserem Standort.`

interface RecordedCall {
  table: string
  operation: 'select' | 'insert' | 'update'
  payload?: Record<string, unknown>
  columns?: string
  filters: Array<[string, unknown]>
}

type Row = Record<string, unknown>

const state: {
  user: { id: string } | null
  application: Row | null
  resume: Row | null
  applicationError: { code: string } | null
  resumeError: { code: string } | null
  insertError: { code: string } | null
  linkError: { code: string } | null
  calls: RecordedCall[]
} = {
  user: null,
  application: null,
  resume: null,
  applicationError: null,
  resumeError: null,
  insertError: null,
  linkError: null,
  calls: [],
}

function fakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from(table: string) {
      const call: RecordedCall = { table, operation: 'select', filters: [] }
      state.calls.push(call)
      const builder = {
        select(columns: string) {
          call.columns = columns
          return builder
        },
        insert(payload: Record<string, unknown>) {
          call.operation = 'insert'
          call.payload = payload
          return builder
        },
        update(payload: Record<string, unknown>) {
          call.operation = 'update'
          call.payload = payload
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value])
          return builder
        },
        async maybeSingle() {
          // Mirrors RLS plus the route's filters: another user's row is invisible.
          const row = table === 'job_applications' ? state.application : state.resume
          const error = table === 'job_applications' ? state.applicationError : state.resumeError
          const visible = row && call.filters.every(([column, value]) => row[column] === value)
          return { data: visible ? row : null, error }
        },
        async single() {
          return state.insertError
            ? { data: null, error: state.insertError }
            : { data: { id: COVER_LETTER_ID }, error: null }
        },
        then(resolve: (value: { error: { code: string } | null }) => unknown) {
          return Promise.resolve({ error: state.linkError }).then(resolve)
        },
      }
      return builder
    },
  }
}

const generateCompletion = vi.fn<(prompt: string, options: unknown) => Promise<{ text: string }>>()
const enforceAiRateLimit = vi.fn<(request: NextRequest, caller: unknown) => Promise<NextResponse | null>>()

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeSupabase() }))
vi.mock('@/lib/ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/client')>()),
  generateCompletion: (prompt: string, options: unknown) => generateCompletion(prompt, options),
}))
vi.mock('@/lib/api/ai-rate-limit', () => ({
  enforceAiRateLimit: (request: NextRequest, caller: unknown) => enforceAiRateLimit(request, caller),
}))

// The offer-page check (US-002) runs the real `safeFetch`; only DNS and the
// network underneath it are replaced, so no test reaches a real job board.
const dnsLookup = vi.fn<(hostname: string, options: unknown) => Promise<Array<{ address: string; family: number }>>>()
const pageFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()

vi.mock('node:dns/promises', () => ({
  lookup: (hostname: string, options: unknown) => dnsLookup(hostname, options),
}))

const { POST } = await import('./route')

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/cover-letters/from-job-application', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const VALID_BODY = {
  jobApplicationId: APPLICATION_ID,
  title: 'Anschreiben Data Engineer',
  companyName: 'Beispiel AG',
  jobTitle: 'Data Engineer',
  resumeId: RESUME_ID,
  locale: 'fr',
}

const GERMAN_LETTER = {
  greeting: 'Sehr geehrte Damen und Herren,',
  openingParagraph: 'Mit großem Interesse bewerbe ich mich als Data Engineer.',
  bodyParagraphs: ['Ich habe acht Jahre Erfahrung mit Datenpipelines.', 'Python und SQL sind meine Werkzeuge.'],
  closingParagraph: 'Ich freue mich auf ein Gespräch.',
  signOff: 'Mit freundlichen Grüßen',
}

function reply(letter: unknown): { text: string } {
  return { text: JSON.stringify(letter) }
}

function writes(): RecordedCall[] {
  return state.calls.filter((call) => call.operation !== 'select')
}

function insertedLetter(): Record<string, unknown> {
  const insert = state.calls.find((call) => call.table === 'cover_letters' && call.operation === 'insert')
  if (!insert?.payload) throw new Error('no cover letter was inserted')
  return insert.payload
}

function sentPrompt(): string {
  const [prompt] = generateCompletion.mock.calls[0] ?? []
  if (typeof prompt !== 'string') throw new Error('the AI was not called')
  return prompt
}

beforeEach(() => {
  state.user = { id: USER_ID }
  state.application = {
    id: APPLICATION_ID,
    user_id: USER_ID,
    job_title: 'Data Engineer',
    company_name: 'Beispiel AG',
    job_description: GERMAN_DESCRIPTION,
  }
  state.resume = {
    id: RESUME_ID,
    user_id: USER_ID,
    summary: 'Datenexpertin mit acht Jahren Erfahrung.',
    experience: [
      { position: 'Senior Data Engineer', company: 'Acme', description: '<p>Pipelines gebaut.</p>' },
      { position: 'Data Analyst', company: 'Globex' },
      { position: 'Analyst', company: 'Initech' },
      { position: 'Praktikantin', company: 'Umbrella' },
    ],
    skills: [{ category: 'Daten', items: ['Python', 'SQL'] }],
    contact: { name: 'Anna Muster', email: 'anna@example.com' },
  }
  state.applicationError = null
  state.resumeError = null
  state.insertError = null
  state.linkError = null
  state.calls = []
  generateCompletion.mockReset()
  generateCompletion.mockResolvedValue(reply(GERMAN_LETTER))
  enforceAiRateLimit.mockReset()
  enforceAiRateLimit.mockResolvedValue(null)
  dnsLookup.mockReset()
  dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  pageFetch.mockReset()
  pageFetch.mockRejectedValue(new Error('no page fetch expected'))
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => pageFetch(url, init))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('POST /api/cover-letters/from-job-application', () => {
  it('stores a letter written by the AI from the offer and the CV, and links the application to it', async () => {
    const response = await POST(createRequest(VALID_BODY))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ coverLetterId: COVER_LETTER_ID })

    expect(enforceAiRateLimit).toHaveBeenCalledWith(expect.anything(), { kind: 'user', userId: USER_ID })
    // The token budget and model settings of the editor's modal.
    expect(generateCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTokens: 1500, temperature: 0.7 })
    )

    expect(insertedLetter()).toEqual({
      user_id: USER_ID,
      title: 'Anschreiben Data Engineer',
      resume_id: RESUME_ID,
      job_application_id: APPLICATION_ID,
      company_name: 'Beispiel AG',
      job_title: 'Data Engineer',
      job_description: GERMAN_DESCRIPTION,
      greeting: 'Sehr geehrte Damen und Herren,',
      opening_paragraph: '<p>Mit großem Interesse bewerbe ich mich als Data Engineer.</p>',
      body_paragraphs: [
        '<p>Ich habe acht Jahre Erfahrung mit Datenpipelines.</p>',
        '<p>Python und SQL sind meine Werkzeuge.</p>',
      ],
      closing_paragraph: '<p>Ich freue mich auf ein Gespräch.</p>',
      sign_off: 'Mit freundlichen Grüßen',
      sender_name: 'Anna Muster',
      template: 'modern',
    })

    const link = state.calls.find((call) => call.table === 'job_applications' && call.operation === 'update')
    expect(link?.payload).toMatchObject({ cover_letter_id: COVER_LETTER_ID })
    expect(link?.filters).toEqual([
      ['id', APPLICATION_ID],
      ['user_id', USER_ID],
    ])
  })

  it('reads the application and the CV with explicit user_id filters', async () => {
    await POST(createRequest(VALID_BODY))

    const reads = state.calls.filter((call) => call.operation === 'select')
    expect(reads.map((call) => [call.table, call.filters])).toEqual([
      ['job_applications', [['id', APPLICATION_ID], ['user_id', USER_ID]]],
      ['resumes', [['id', RESUME_ID], ['user_id', USER_ID]]],
    ])
  })

  describe('the CV', () => {
    it('puts its summary, first three experiences and skills in the prompt', async () => {
      await POST(createRequest(VALID_BODY))

      const prompt = sentPrompt()
      expect(prompt).toContain('Summary: Datenexpertin mit acht Jahren Erfahrung.')
      expect(prompt).toContain('- Senior Data Engineer at Acme: <p>Pipelines gebaut.</p>')
      expect(prompt).toContain('- Data Analyst at Globex')
      expect(prompt).toContain('- Analyst at Initech')
      expect(prompt).not.toContain('Umbrella')
      expect(prompt).toContain('Skills: Python, SQL')
    })

    it('bounds what an oversized CV puts in the prompt', async () => {
      state.resume = { ...state.resume, summary: 'x'.repeat(6_000) }

      await POST(createRequest(VALID_BODY))

      expect(sentPrompt()).toContain(`Summary: ${'x'.repeat(5_000)}\n`)
    })

    it('generates from the offer alone when no CV is selected, and stores no resume_id', async () => {
      const response = await POST(createRequest({ ...VALID_BODY, resumeId: null }))

      expect(response.status).toBe(201)
      expect(state.calls.some((call) => call.table === 'resumes')).toBe(false)
      const prompt = sentPrompt()
      expect(prompt).toContain('Summary: Not provided')
      expect(prompt).toContain('Skills: Not provided')
      expect(insertedLetter()).toMatchObject({ resume_id: null, sender_name: null })
    })

    it('leaves sender_name empty when the CV has no contact name', async () => {
      state.resume = { ...state.resume, contact: { name: '   ', email: 'anna@example.com' } }

      await POST(createRequest(VALID_BODY))

      expect(insertedLetter()).toMatchObject({ sender_name: null, resume_id: RESUME_ID })
    })

    it('stores the contact name as plain text', async () => {
      state.resume = { ...state.resume, contact: { name: '<img src=x onerror=alert(1)>Anna <b>Muster</b>' } }

      await POST(createRequest(VALID_BODY))

      expect(insertedLetter()).toMatchObject({ sender_name: 'Anna Muster' })
    })
  })

  describe('the language', () => {
    it('writes a German offer opened under /fr in German', async () => {
      await POST(createRequest({ ...VALID_BODY, locale: 'fr' }))

      expect(sentPrompt()).toContain('Write the ENTIRE cover letter in German')
    })

    it('falls back to the page language when the offer language cannot be detected', async () => {
      state.application = { ...state.application, job_description: 'Data Engineer, Python, SQL, Kafka, Zürich.' }

      await POST(createRequest({ ...VALID_BODY, locale: 'it' }))

      expect(sentPrompt()).toContain('Write the ENTIRE cover letter in Italian')
    })
  })

  it('generates from the job title, the company and the CV when the application has no description', async () => {
    state.application = { ...state.application, job_description: null }

    const response = await POST(createRequest({ ...VALID_BODY, locale: 'de' }))

    expect(response.status).toBe(201)
    const prompt = sentPrompt()
    expect(prompt).toContain('Position: Data Engineer')
    expect(prompt).toContain('Company: Beispiel AG')
    expect(prompt).toContain('"""\nNot provided\n"""')
    expect(prompt).toContain('Summary: Datenexpertin mit acht Jahren Erfahrung.')
    expect(prompt).toContain('Write the ENTIRE cover letter in German')
    expect(insertedLetter()).toMatchObject({ job_description: null })
  })

  it("names the job with the form's values, and falls back to the application's when a field is cleared", async () => {
    await POST(createRequest({ ...VALID_BODY, companyName: '', jobTitle: 'Lead Data Engineer' }))

    const prompt = sentPrompt()
    expect(prompt).toContain('Position: Lead Data Engineer')
    expect(prompt).toContain('Company: Beispiel AG')
    expect(insertedLetter()).toMatchObject({ job_title: 'Lead Data Engineer', company_name: 'Beispiel AG' })
  })

  describe('sanitizing the AI output', () => {
    it('stores plain text, escaped in the rich-text paragraphs', async () => {
      generateCompletion.mockResolvedValueOnce(
        reply({
          greeting: '<b>Sehr geehrte</b> Damen und Herren,',
          openingParagraph: 'Ich bewerbe mich<script>alert(1)</script> bei R&amp;D <img src=x onerror=alert(1)>.',
          bodyParagraphs: ['<a href="javascript:alert(1)">Erfahrung</a> & Wissen', '   ', 42],
          closingParagraph: 'Bis bald <iframe src="https://evil.example"></iframe>',
          signOff: '<em>Mit freundlichen Grüßen</em>',
        })
      )

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(201)
      expect(insertedLetter()).toMatchObject({
        greeting: 'Sehr geehrte Damen und Herren,',
        opening_paragraph: '<p>Ich bewerbe mich bei R&amp;D .</p>',
        body_paragraphs: ['<p>Erfahrung &amp; Wissen</p>'],
        closing_paragraph: '<p>Bis bald</p>',
        sign_off: 'Mit freundlichen Grüßen',
      })
    })

    it('keeps at most ten body paragraphs', async () => {
      const bodyParagraphs = Array.from({ length: 12 }, (_, index) => `Absatz ${index + 1}`)
      generateCompletion.mockResolvedValueOnce(reply({ ...GERMAN_LETTER, bodyParagraphs }))

      await POST(createRequest(VALID_BODY))

      expect(insertedLetter().body_paragraphs).toHaveLength(10)
    })

    it('reads a reply wrapped in a Markdown code fence', async () => {
      generateCompletion.mockResolvedValueOnce({ text: `\`\`\`json\n${JSON.stringify(GERMAN_LETTER)}\n\`\`\`` })

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(201)
    })
  })

  describe('when the AI fails, nothing is stored or linked', () => {
    const cases: Array<[string, () => void, number]> = [
      [
        'a provider error',
        () => generateCompletion.mockRejectedValueOnce(new AiCompletionError('provider_error', 'model', 500)),
        502,
      ],
      [
        'a provider rate limit',
        () => generateCompletion.mockRejectedValueOnce(new AiCompletionError('rate_limited', 'model', 429)),
        429,
      ],
      [
        'a network error',
        () => generateCompletion.mockRejectedValueOnce(new AiCompletionError('network_error', 'model')),
        502,
      ],
      ['an unparsable reply', () => generateCompletion.mockResolvedValueOnce({ text: 'Sehr geehrte Damen…' }), 502],
      ['a reply that is not an object', () => generateCompletion.mockResolvedValueOnce({ text: '["a"]' }), 502],
      [
        'a reply without a closing',
        () => generateCompletion.mockResolvedValueOnce(reply({ ...GERMAN_LETTER, closingParagraph: '' })),
        502,
      ],
      [
        'a reply without body paragraphs',
        () => generateCompletion.mockResolvedValueOnce(reply({ ...GERMAN_LETTER, bodyParagraphs: ['<p></p>'] })),
        502,
      ],
      [
        'a reply whose opening is only markup',
        () => generateCompletion.mockResolvedValueOnce(reply({ ...GERMAN_LETTER, openingParagraph: '<script>x</script>' })),
        502,
      ],
      [
        'a reply without a greeting or sign-off',
        () => generateCompletion.mockResolvedValueOnce(reply({ ...GERMAN_LETTER, greeting: undefined, signOff: '' })),
        502,
      ],
    ]

    for (const [label, arrange, status] of cases) {
      it(`answers ${status} for ${label}`, async () => {
        arrange()
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        const response = await POST(createRequest(VALID_BODY))

        expect(response.status).toBe(status)
        await expect(response.json()).resolves.toEqual({ error: 'The cover letter could not be generated' })
        expect(writes()).toEqual([])
        // FR-4: the reply and the CV are never logged.
        const logged = JSON.stringify(errorLog.mock.calls)
        expect(logged).not.toContain('Sehr geehrte')
        expect(logged).not.toContain('Datenexpertin')
        errorLog.mockRestore()
      })
    }

    it('answers with our own rate limit before calling the AI', async () => {
      enforceAiRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }))

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(429)
      expect(generateCompletion).not.toHaveBeenCalled()
      expect(writes()).toEqual([])
    })
  })

  describe('ownership', () => {
    it("refuses another user's application with the same 404 as a missing one, before the AI", async () => {
      state.application = { ...state.application, user_id: OTHER_USER_ID }
      const foreign = await POST(createRequest(VALID_BODY))

      state.application = null
      const missing = await POST(createRequest(VALID_BODY))

      for (const response of [foreign, missing]) {
        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({ error: 'Job application not found' })
      }
      expect(generateCompletion).not.toHaveBeenCalled()
      expect(enforceAiRateLimit).not.toHaveBeenCalled()
      expect(writes()).toEqual([])
    })

    it("refuses another user's CV with the same 404 as a missing one, before the AI", async () => {
      state.resume = { ...state.resume, user_id: OTHER_USER_ID }
      const foreign = await POST(createRequest(VALID_BODY))

      state.resume = null
      const missing = await POST(createRequest(VALID_BODY))

      for (const response of [foreign, missing]) {
        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({ error: 'Resume not found' })
      }
      expect(generateCompletion).not.toHaveBeenCalled()
      expect(writes()).toEqual([])
    })

    it('ignores any user id the client sends', async () => {
      await POST(createRequest({ ...VALID_BODY, user_id: OTHER_USER_ID }))

      expect(insertedLetter()).toMatchObject({ user_id: USER_ID })
    })
  })

  describe('requests it refuses', () => {
    it('answers 401 without a session and touches nothing', async () => {
      state.user = null

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(401)
      expect(state.calls).toEqual([])
      expect(generateCompletion).not.toHaveBeenCalled()
    })

    it.each([
      ['an invalid application id', { ...VALID_BODY, jobApplicationId: 'not-a-uuid' }],
      ['an invalid CV id', { ...VALID_BODY, resumeId: 'not-a-uuid' }],
      ['an unknown locale', { ...VALID_BODY, locale: 'es' }],
      ['a missing resumeId', { ...VALID_BODY, resumeId: undefined }],
      ['a title that is only markup', { ...VALID_BODY, title: '<b></b>' }],
    ])('answers 400 for %s', async (_label, body) => {
      const response = await POST(createRequest(body))

      expect(response.status).toBe(400)
      expect(state.calls).toEqual([])
    })

    it('answers 400 for a body that is not JSON', async () => {
      const response = await POST(createRequest('{not json'))

      expect(response.status).toBe(400)
    })
  })

  describe('storage failures', () => {
    it('answers 500 when the letter cannot be inserted, and links nothing', async () => {
      state.insertError = { code: '23503' }
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(500)
      expect(state.calls.some((call) => call.operation === 'update')).toBe(false)
      errorLog.mockRestore()
    })

    it('still answers 201 when only the link fails: the letter carries its own job_application_id', async () => {
      state.linkError = { code: '42501' }
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(201)
      expect(insertedLetter()).toMatchObject({ job_application_id: APPLICATION_ID })
      errorLog.mockRestore()
    })
  })
})

describe('POST /api/cover-letters/from-job-application - a closed offer (US-002)', () => {
  /** 2026-10-24 12:00 UTC: "today" for every deadline test. */
  const NOW = new Date('2026-10-24T12:00:00Z')
  const JOB_URL = 'https://www.jobs.ch/de/stellenangebote/detail/123/?ref=secret-token'

  function withOffer(fields: { deadline?: string | null; job_url?: string | null }) {
    state.application = { ...state.application, deadline: null, job_url: null, ...fields }
  }

  function pageAnswers(status: number) {
    pageFetch.mockResolvedValue(new Response(status === 204 ? null : 'page body', { status }))
  }

  function expectNothingDone() {
    expect(generateCompletion).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  describe('the deadline, in UTC', () => {
    it('refuses a deadline before today with 409 deadline_passed, and fetches nothing', async () => {
      withOffer({ deadline: '2026-10-23', job_url: JOB_URL })
      pageAnswers(200)
      const infoLog = vi.spyOn(console, 'info').mockImplementation(() => undefined)

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({ error: 'offer_closed', reason: 'deadline_passed' })
      expect(pageFetch).not.toHaveBeenCalled()
      expect(dnsLookup).not.toHaveBeenCalled()
      // Checked before the rate limit: a closed offer spends no AI budget.
      expect(enforceAiRateLimit).not.toHaveBeenCalled()
      expectNothingDone()
      infoLog.mockRestore()
    })

    it('uses the UTC date, not the server-local one', async () => {
      // 23:30 UTC on the 23rd is already the 24th in Zurich; the 23rd is still open.
      vi.setSystemTime(new Date('2026-10-23T23:30:00Z'))
      withOffer({ deadline: '2026-10-23' })

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(201)
    })

    it.each([
      ['today', '2026-10-24'],
      ['in the future', '2026-12-31'],
      ['missing', null],
      ['malformed', '24.10.2025'],
    ])('creates the letter when the deadline is %s', async (_label, deadline) => {
      withOffer({ deadline })

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(201)
      expect(insertedLetter()).toMatchObject({ job_application_id: APPLICATION_ID })
    })
  })

  describe('the offer page on an allowed job board', () => {
    it.each([404, 410])('refuses a page answering %i with 409 page_unavailable', async (status) => {
      withOffer({ deadline: '2026-12-31', job_url: JOB_URL })
      pageAnswers(status)
      const infoLog = vi.spyOn(console, 'info').mockImplementation(() => undefined)

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({ error: 'offer_closed', reason: 'page_unavailable' })
      expect(pageFetch).toHaveBeenCalledTimes(1)
      const [url, init] = pageFetch.mock.calls[0]
      expect(url).toBe(JOB_URL)
      expect(init).toMatchObject({ redirect: 'manual' })
      // The page is fetched only after the rate limit has counted the request.
      expect(enforceAiRateLimit).toHaveBeenCalledWith(expect.anything(), { kind: 'user', userId: USER_ID })
      expect(enforceAiRateLimit.mock.invocationCallOrder[0]).toBeLessThan(pageFetch.mock.invocationCallOrder[0])
      expectNothingDone()
      // FR-4: the reason and status are logged, never the URL or its query.
      const logged = JSON.stringify(infoLog.mock.calls)
      expect(logged).toContain('page_unavailable')
      expect(logged).not.toContain('secret-token')
      expect(logged).not.toContain('jobs.ch')
      infoLog.mockRestore()
    })

    it('refuses a rate-limited user before fetching the page', async () => {
      withOffer({ deadline: '2026-12-31', job_url: JOB_URL })
      pageAnswers(404)
      enforceAiRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }))

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(429)
      expect(pageFetch).not.toHaveBeenCalled()
      expect(dnsLookup).not.toHaveBeenCalled()
      expectNothingDone()
    })

    it('follows a redirect to a removed page and refuses it', async () => {
      withOffer({ job_url: JOB_URL })
      pageFetch
        .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://www.jobs.ch/expired' } }))
        .mockResolvedValueOnce(new Response('gone', { status: 410 }))
      const infoLog = vi.spyOn(console, 'info').mockImplementation(() => undefined)

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(409)
      expect(pageFetch.mock.calls.map(([url]) => url)).toEqual([JOB_URL, 'https://www.jobs.ch/expired'])
      expectNothingDone()
      infoLog.mockRestore()
    })

    it.each([200, 204, 401, 403, 429, 500, 503])('creates the letter when the page answers %i', async (status) => {
      withOffer({ job_url: JOB_URL })
      pageAnswers(status)

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(201)
      expect(generateCompletion).toHaveBeenCalledTimes(1)
    })

    it('cancels the page body without reading it', async () => {
      withOffer({ job_url: JOB_URL })
      let cancelled = false
      const page = new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        }),
        { status: 200 }
      )
      const reads = [vi.spyOn(page, 'text'), vi.spyOn(page, 'arrayBuffer'), vi.spyOn(page, 'json')]
      pageFetch.mockResolvedValue(page)

      const response = await POST(createRequest(VALID_BODY))

      expect(response.status).toBe(201)
      expect(cancelled).toBe(true)
      for (const read of reads) expect(read).not.toHaveBeenCalled()
    })
  })

  describe('a page that cannot be checked leaves the offer open', () => {
    const cases: Array<[string, () => void]> = [
      ['no job_url', () => withOffer({ job_url: null })],
      ['an empty job_url', () => withOffer({ job_url: '   ' })],
      ['a host outside the allowlist', () => withOffer({ job_url: 'https://careers.example.com/job/1' })],
      ['a non-http scheme', () => withOffer({ job_url: 'file:///etc/passwd' })],
      ['an invalid URL', () => withOffer({ job_url: 'not a url' })],
      [
        'an allowed host resolving to a private address',
        () => {
          withOffer({ job_url: JOB_URL })
          dnsLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }])
        },
      ],
      [
        'a redirect to a host outside the allowlist',
        () => {
          withOffer({ job_url: JOB_URL })
          pageFetch.mockResolvedValueOnce(
            new Response(null, { status: 302, headers: { location: 'https://evil.example/404' } })
          )
        },
      ],
      [
        'too many redirects',
        () => {
          withOffer({ job_url: JOB_URL })
          pageFetch.mockImplementation(async () => new Response(null, { status: 301, headers: { location: JOB_URL } }))
        },
      ],
      [
        'a timeout',
        () => {
          withOffer({ job_url: JOB_URL })
          pageFetch.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'))
        },
      ],
      [
        'a network error',
        () => {
          withOffer({ job_url: JOB_URL })
          pageFetch.mockRejectedValue(new TypeError('fetch failed'))
        },
      ],
      [
        'an unresolvable host',
        () => {
          withOffer({ job_url: JOB_URL })
          dnsLookup.mockRejectedValue(new Error('ENOTFOUND'))
        },
      ],
    ]

    for (const [label, arrange] of cases) {
      it(`creates the letter for ${label}`, async () => {
        arrange()

        const response = await POST(createRequest(VALID_BODY))

        expect(response.status).toBe(201)
        expect(generateCompletion).toHaveBeenCalledTimes(1)
        expect(insertedLetter()).toMatchObject({ job_application_id: APPLICATION_ID })
      })
    }

    it('never contacts a private address or a host outside the allowlist', async () => {
      withOffer({ job_url: 'https://careers.example.com/job/1' })
      await POST(createRequest(VALID_BODY))
      expect(pageFetch).not.toHaveBeenCalled()

      withOffer({ job_url: JOB_URL })
      dnsLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
      await POST(createRequest(VALID_BODY))
      expect(pageFetch).not.toHaveBeenCalled()
    })
  })

  it("checks the offer only after ownership: another user's application is 404 and nothing is fetched", async () => {
    withOffer({ deadline: '2020-01-01', job_url: JOB_URL })
    state.application = { ...state.application, user_id: OTHER_USER_ID }

    const response = await POST(createRequest(VALID_BODY))

    expect(response.status).toBe(404)
    expect(pageFetch).not.toHaveBeenCalled()
  })
})
