import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCompletionError } from '@/lib/ai/client'

/**
 * Unit coverage for `POST /api/resumes/from-job-application`
 * (cv-from-job-complete, US-002): authentication, ownership, the tailored and
 * fallback paths, the content language and the two-way link.
 *
 * Supabase is replaced by a recorder that answers each query from the test's
 * state and keeps every call, so a test can assert both what was written and
 * that nothing was written. RLS itself is exercised by the e2e spec against the
 * local stack; here the route's own filters are what is checked.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222'
const RESUME_ID = '33333333-3333-4333-8333-333333333333'

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

interface ApplicationRow {
  id: string
  user_id: string
  job_title: string
  company_name: string
  location: string | null
  job_description: string | null
}

const state: {
  user: { id: string } | null
  application: ApplicationRow | null
  applicationError: { code: string } | null
  insertError: { code: string } | null
  linkError: { code: string } | null
  calls: RecordedCall[]
} = {
  user: null,
  application: null,
  applicationError: null,
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
          const row = state.application
          const visible = row && call.filters.every(([column, value]) => row[column as keyof ApplicationRow] === value)
          return { data: visible ? row : null, error: state.applicationError }
        },
        async single() {
          return state.insertError ? { data: null, error: state.insertError } : { data: { id: RESUME_ID }, error: null }
        },
        then(resolve: (value: { error: { code: string } | null }) => unknown) {
          return Promise.resolve({ error: state.linkError }).then(resolve)
        },
      }
      return builder
    },
  }
}

const generateResumeFromJobDescription = vi.fn()
const enforceAiRateLimit = vi.fn<(request: NextRequest, caller: unknown) => Promise<NextResponse | null>>()

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeSupabase() }))
vi.mock('@/lib/ai/transformations', () => ({
  generateResumeFromJobDescription: (...args: unknown[]) => generateResumeFromJobDescription(...args),
}))
vi.mock('@/lib/api/ai-rate-limit', () => ({
  enforceAiRateLimit: (request: NextRequest, caller: unknown) => enforceAiRateLimit(request, caller),
}))

const { POST } = await import('./route')

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/resumes/from-job-application', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const VALID_BODY = { jobApplicationId: APPLICATION_ID, title: 'Mein Lebenslauf', template: 'classic', locale: 'fr' }

function aiReply(summary: string) {
  return {
    resumeData: {
      summary,
      experience: [
        {
          position: 'KI-Position',
          company: 'KI-Firma',
          startDate: '2020-01',
          endDate: '2023-01',
          current: false,
          description: '<p>KI-Beschreibung</p>',
          achievements: ['KI-Erfolg 1', 'KI-Erfolg 2'],
        },
      ],
      skills: [{ category: 'KI-Kompetenzen', items: ['Python'] }],
      projects: [{ name: 'KI-Projekt', description: '<p>KI-Projektbeschreibung</p>', technologies: ['Python'] }],
    },
    tokensUsed: 10,
  }
}

function writes(): RecordedCall[] {
  return state.calls.filter((call) => call.operation !== 'select')
}

function insertedResume(): Record<string, unknown> {
  const insert = state.calls.find((call) => call.table === 'resumes' && call.operation === 'insert')
  if (!insert?.payload) throw new Error('no resume was inserted')
  return insert.payload
}

beforeEach(() => {
  state.user = { id: USER_ID }
  state.application = {
    id: APPLICATION_ID,
    user_id: USER_ID,
    job_title: 'Data Engineer',
    company_name: 'Beispiel AG',
    location: 'Zürich',
    job_description: GERMAN_DESCRIPTION,
  }
  state.applicationError = null
  state.insertError = null
  state.linkError = null
  state.calls = []
  generateResumeFromJobDescription.mockReset()
  enforceAiRateLimit.mockReset()
  enforceAiRateLimit.mockResolvedValue(null)
})

describe('POST /api/resumes/from-job-application', () => {
  it('creates a tailored CV in the offer language and links it both ways', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply('<p>KI-Profil für Data Engineer</p>'))

    const response = await POST(createRequest(VALID_BODY))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ resumeId: RESUME_ID, tailored: true })

    // AC3: a German offer opened under /fr is written in German.
    // A complete-resume request gets twice Job Search's output budget.
    expect(generateResumeFromJobDescription).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'de', targetJobTitle: 'Data Engineer' }),
      { maxTokens: 4000 }
    )
    expect(enforceAiRateLimit).toHaveBeenCalledWith(expect.anything(), { kind: 'user', userId: USER_ID })

    const resume = insertedResume()
    expect(resume).toMatchObject({
      user_id: USER_ID,
      title: 'Mein Lebenslauf',
      template: 'classic',
      job_application_id: APPLICATION_ID,
      summary: '<p>KI-Profil für Data Engineer</p>',
    })
    // The AI's achievements are kept, so its text shows in every template.
    expect(resume.experience).toEqual([expect.objectContaining({ achievements: ['KI-Erfolg 1', 'KI-Erfolg 2'] })])
    // The gaps come from the German sample set; the location from the offer.
    expect(resume.contact).toMatchObject({ location: 'Zürich' })
    expect((resume.education as Array<{ school: string }>)[0].school).toMatch(/Schule|Hochschule/)

    const link = writes().find((call) => call.table === 'job_applications')
    expect(link?.operation).toBe('update')
    expect(link?.payload).toMatchObject({ resume_id: RESUME_ID })
    expect(link?.filters).toEqual([
      ['id', APPLICATION_ID],
      ['user_id', USER_ID],
    ])
  })

  it('reads the application with the user filter, and only the columns it needs', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply('<p>x</p>'))
    await POST(createRequest(VALID_BODY))
    const read = state.calls.find((call) => call.table === 'job_applications' && call.operation === 'select')
    expect(read?.filters).toEqual([
      ['id', APPLICATION_ID],
      ['user_id', USER_ID],
    ])
    expect(read?.columns).toBe('id, user_id, job_title, company_name, location, job_description')
  })

  it("refuses another user's application and writes nothing", async () => {
    state.application = { ...state.application!, user_id: '44444444-4444-4444-8444-444444444444' }

    const response = await POST(createRequest(VALID_BODY))

    expect(response.status).toBe(404)
    expect(writes()).toEqual([])
    expect(generateResumeFromJobDescription).not.toHaveBeenCalled()
    expect(enforceAiRateLimit).not.toHaveBeenCalled()
  })

  it('refuses a missing application with the same answer and writes nothing', async () => {
    state.application = null

    const response = await POST(createRequest(VALID_BODY))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Job application not found' })
    expect(writes()).toEqual([])
  })

  it('refuses an unauthenticated request before reading anything', async () => {
    state.user = null

    const response = await POST(createRequest(VALID_BODY))

    expect(response.status).toBe(401)
    expect(state.calls).toEqual([])
  })

  it.each([
    ['a non-uuid id', { ...VALID_BODY, jobApplicationId: 'not-a-uuid' }],
    ['an unknown template', { ...VALID_BODY, template: 'fancy' }],
    ['an unknown locale', { ...VALID_BODY, locale: 'es' }],
    ['a title that is not a string', { ...VALID_BODY, title: 42 }],
    ['a blank title', { ...VALID_BODY, title: '   ' }],
    ['malformed JSON', '{'],
  ])('refuses %s and writes nothing', async (_label, body) => {
    const response = await POST(createRequest(body))
    expect(response.status).toBe(400)
    expect(writes()).toEqual([])
  })

  it('ignores job content sent by the client', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply('<p>x</p>'))
    await POST(createRequest({ ...VALID_BODY, jobDescription: 'Injected', job_title: 'Injected' }))
    expect(generateResumeFromJobDescription).toHaveBeenCalledWith(
      expect.objectContaining({ jobDescription: GERMAN_DESCRIPTION.trim(), targetJobTitle: 'Data Engineer' }),
      expect.anything()
    )
  })

  it('cuts an over-long title to 200 characters instead of refusing it', async () => {
    // A job title may be 255 characters; the form pre-fills it.
    const longTitle = `${'T'.repeat(250)}12345`
    state.application = { ...state.application!, job_title: longTitle, job_description: null }

    const response = await POST(createRequest({ ...VALID_BODY, title: longTitle }))

    expect(response.status).toBe(201)
    expect(insertedResume().title).toBe('T'.repeat(200))
  })

  describe('falls back to a complete sample CV, tailored: false', () => {
    async function expectSampleCv(expectedLanguageSchool: RegExp) {
      const response = await POST(createRequest(VALID_BODY))
      expect(response.status).toBe(201)
      await expect(response.json()).resolves.toEqual({ resumeId: RESUME_ID, tailored: false })
      const resume = insertedResume()
      expect(resume.job_application_id).toBe(APPLICATION_ID)
      expect(resume.summary).toContain('Data Engineer')
      expect((resume.education as Array<{ school: string }>)[0].school).toMatch(expectedLanguageSchool)
      expect(writes().some((call) => call.table === 'job_applications' && call.operation === 'update')).toBe(true)
    }

    it('when the application has no description, in the page language, without calling the AI', async () => {
      state.application = { ...state.application!, job_description: null }
      await expectSampleCv(/école/)
      expect(generateResumeFromJobDescription).not.toHaveBeenCalled()
      expect(enforceAiRateLimit).not.toHaveBeenCalled()
    })

    it('when the description is too short to be usable', async () => {
      state.application = { ...state.application!, job_description: 'Data Engineer gesucht.' }
      await expectSampleCv(/école/)
      expect(generateResumeFromJobDescription).not.toHaveBeenCalled()
    })

    it('when the AI fails, still in the offer language', async () => {
      generateResumeFromJobDescription.mockRejectedValueOnce(new AiCompletionError('provider_error', 'model', 500))
      await expectSampleCv(/Schule|Hochschule/)
    })

    it('when the AI reply cannot be parsed', async () => {
      generateResumeFromJobDescription.mockRejectedValueOnce(new Error('Failed to parse AI response. Please try again.'))
      await expectSampleCv(/Schule|Hochschule/)
    })

    it('when the provider rate-limits', async () => {
      generateResumeFromJobDescription.mockRejectedValueOnce(new AiCompletionError('rate_limited', 'model', 429))
      await expectSampleCv(/Schule|Hochschule/)
    })

    it("when the caller's AI budget is spent, without calling the AI", async () => {
      enforceAiRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }))
      await expectSampleCv(/Schule|Hochschule/)
      expect(generateResumeFromJobDescription).not.toHaveBeenCalled()
    })
  })

  it('uses the page language for an offer in another language', async () => {
    state.application = {
      ...state.application!,
      // Spanish shares "con", "del", "al" and "una" with Italian: it must not be
      // read as Italian, and the page's French applies.
      job_description: `Para reforzar nuestro equipo de Datos en Madrid, buscamos un Ingeniero de Datos con
        experiencia. Bajo la dirección del responsable de la plataforma, serás responsable del diseño y del
        mantenimiento de los procesos de datos que alimentan nuestros productos. Tus funciones: diseñar flujos
        de ingesta fiables; trabajar con los equipos de producto para entender sus necesidades; garantizar la
        calidad de los datos. Tu perfil: al menos tres años de experiencia en un puesto similar, con buen
        dominio de Python y SQL. Ofrecemos un contrato indefinido y un equipo muy unido que se preocupa por la
        calidad de su trabajo.`,
    }
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply('<p>x</p>'))
    await POST(createRequest({ ...VALID_BODY, locale: 'fr' }))
    expect(generateResumeFromJobDescription).toHaveBeenCalledWith(expect.objectContaining({ locale: 'fr' }), expect.anything())
  })

  it('sanitizes AI output before storing it', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(
      aiReply('<p onclick="x()">Profil<script>alert(1)</script><img src=x onerror=alert(1)></p>')
    )
    await POST(createRequest(VALID_BODY))
    expect(insertedResume().summary).toBe('<p>Profil</p>')
  })

  it('answers 500 and links nothing when the insert fails', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply('<p>x</p>'))
    state.insertError = { code: '23514' }

    const response = await POST(createRequest(VALID_BODY))

    expect(response.status).toBe(500)
    expect(writes().some((call) => call.table === 'job_applications')).toBe(false)
  })

  it('keeps the created CV when only the back-link fails, as before', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply('<p>x</p>'))
    state.linkError = { code: '42501' }

    const response = await POST(createRequest(VALID_BODY))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ resumeId: RESUME_ID, tailored: true })
  })
})
