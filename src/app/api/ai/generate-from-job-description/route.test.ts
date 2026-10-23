import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCompletionError } from '@/lib/ai/client'

/**
 * Unit coverage for `POST /api/ai/generate-from-job-description`, the Job
 * Search "Créer un CV" route (cv-from-job-complete, US-003): the CV is filled
 * through the shared builder in the offer's language, an AI failure still
 * fails the request without creating anything, and the rate limit and the
 * response fields are those of before.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const RESUME_ID = '33333333-3333-4333-8333-333333333333'

const GERMAN_DESCRIPTION = `Zur Verstärkung unseres Data-Teams in Zürich suchen wir eine erfahrene Data Engineer
  (m/w/d). Sie sind für die Konzeption und Wartung der Datenpipelines verantwortlich, die unsere Produkte
  versorgen. Ihre Aufgaben: Sie entwickeln zuverlässige Datenflüsse und arbeiten eng mit den Produktteams
  zusammen. Ihr Profil: mindestens drei Jahre Erfahrung in einer ähnlichen Position und sehr gute
  Python-Kenntnisse. Wir bieten Ihnen ein dynamisches Umfeld und ein motiviertes Team an unserem Standort.`

const state: {
  user: { id: string } | null
  insertError: { code: string } | null
  inserts: Record<string, unknown>[]
} = { user: null, insertError: null, inserts: [] }

function fakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from(table: string) {
      if (table !== 'resumes') throw new Error(`unexpected table ${table}`)
      const builder = {
        insert(payload: Record<string, unknown>) {
          state.inserts.push(payload)
          return builder
        },
        select() {
          return builder
        },
        async single() {
          return state.insertError
            ? { data: null, error: state.insertError }
            : { data: { id: RESUME_ID }, error: null }
        },
      }
      return builder
    },
  }
}

const generateResumeFromJobDescription = vi.fn()
const extractJobRequirements = vi.fn()
const enforceAiRateLimit = vi.fn<(request: NextRequest, caller: unknown) => Promise<NextResponse | null>>()

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeSupabase() }))
vi.mock('@/lib/ai/transformations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/transformations')>()),
  generateResumeFromJobDescription: (...args: unknown[]) => generateResumeFromJobDescription(...args),
}))
vi.mock('@/lib/ai/job-requirements-extractor', () => ({
  extractJobRequirements: (...args: unknown[]) => extractJobRequirements(...args),
}))
vi.mock('@/lib/api/ai-rate-limit', () => ({
  enforceAiRateLimit: (request: NextRequest, caller: unknown) => enforceAiRateLimit(request, caller),
}))

const { POST } = await import('./route')

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/ai/generate-from-job-description', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** The request body the modal sends, unchanged by this story. */
const MODAL_BODY = { jobDescription: GERMAN_DESCRIPTION, title: 'CV - Beispiel AG', template: 'professional', locale: 'fr' }

function aiReply() {
  return {
    resumeData: {
      summary: '<p>KI-Profil als Data Engineer</p>',
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
      skills: [{ category: 'KI-Kompetenzen', items: ['Python', 'SQL'] }],
      projects: [{ name: 'KI-Projekt', description: '<p>KI-Projektbeschreibung</p>', technologies: ['Python'] }],
    },
    tokensUsed: 123,
  }
}

function inserted(): Record<string, unknown> {
  expect(state.inserts).toHaveLength(1)
  return state.inserts[0]
}

beforeEach(() => {
  state.user = { id: USER_ID }
  state.insertError = null
  state.inserts = []
  generateResumeFromJobDescription.mockReset()
  extractJobRequirements.mockReset()
  extractJobRequirements.mockResolvedValue({
    skills: ['Python'],
    responsibilities: [],
    qualifications: [],
    niceToHaves: [],
  })
  enforceAiRateLimit.mockReset()
  enforceAiRateLimit.mockResolvedValue(null)
})

describe('POST /api/ai/generate-from-job-description', () => {
  it('creates a complete CV from the AI content, gaps filled in the offer language', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply())

    const response = await POST(createRequest(MODAL_BODY))

    expect(response.status).toBe(200)
    const body = await response.json()
    // The response fields of before.
    expect(Object.keys(body).sort()).toEqual(['qualityAnalysis', 'resumeId', 'success', 'tokensUsed'])
    expect(body).toMatchObject({ success: true, resumeId: RESUME_ID, tokensUsed: 123 })
    expect(Object.keys(body.qualityAnalysis).sort()).toEqual(
      ['genericItems', 'isInsufficient', 'iteration', 'matchedItems', 'missingItems', 'score'].sort()
    )

    // AC2: a German offer from /fr is written in German; a complete-resume
    // request with twice the default budget.
    expect(generateResumeFromJobDescription).toHaveBeenCalledWith(
      { jobDescription: GERMAN_DESCRIPTION.trim(), locale: 'de', completeResume: true },
      { maxTokens: 4000 }
    )

    const resume = inserted()
    expect(resume).toMatchObject({
      user_id: USER_ID,
      title: 'CV - Beispiel AG',
      template: 'professional',
      summary: '<p>KI-Profil als Data Engineer</p>',
      custom_sections: [],
      is_default: false,
      is_public: false,
    })
    // AC1: the AI's content, achievements included...
    expect(resume.experience).toEqual([
      expect.objectContaining({ company: 'KI-Firma', achievements: ['KI-Erfolg 1', 'KI-Erfolg 2'] }),
    ])
    // ...and the fields the AI does not write, from the German sample set.
    const contact = resume.contact as Record<string, unknown>
    for (const key of ['name', 'email', 'phone', 'location', 'linkedin', 'github', 'website']) {
      expect(contact[key], key).toBeTruthy()
    }
    expect((resume.education as Array<{ school: string }>)[0].school).toMatch(/Schule|Hochschule/)
    expect((resume.languages as unknown[]).length).toBeGreaterThan(0)
    expect((resume.certifications as unknown[]).length).toBe(1)
  })

  it('sanitizes the AI content through the builder', async () => {
    const reply = aiReply()
    reply.resumeData.summary = '<p onclick="x()">Profil<script>alert(1)</script><img src=x onerror=alert(1)></p>'
    generateResumeFromJobDescription.mockResolvedValueOnce(reply)

    await POST(createRequest(MODAL_BODY))

    expect(inserted().summary).toBe('<p>Profil</p>')
  })

  it.each([
    ['an unsupported page locale', 'es', 'en'],
    ['no page locale', undefined, 'en'],
    ['an Italian page', 'it', 'it'],
  ])('writes in the page language for an offer it cannot call, with %s', async (_label, locale, expected) => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply())
    const offer = 'Data Engineer, Zürich. Python, SQL, Cloud. 80-100 %. Ab sofort. Kontakt: hr@example.com'
    await POST(createRequest({ ...MODAL_BODY, jobDescription: offer, locale }))
    expect(generateResumeFromJobDescription).toHaveBeenCalledWith(
      expect.objectContaining({ locale: expected }),
      expect.anything()
    )
  })

  describe('AI failure: the error is returned and no CV is created, as before', () => {
    it.each([
      ['a provider error', new AiCompletionError('provider_error', 'model', 500)],
      ['a provider rate limit', new AiCompletionError('rate_limited', 'model', 429)],
      ['an unparseable reply', new Error('Failed to parse AI response. Please try again.')],
    ])('on %s', async (_label, failure) => {
      generateResumeFromJobDescription.mockRejectedValueOnce(failure)

      const response = await POST(createRequest(MODAL_BODY))

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to generate resume',
        message: failure.message,
      })
      expect(state.inserts).toEqual([])
    })
  })

  it('keeps the rate limit: a throttled caller gets the 429 and nothing is generated or created', async () => {
    enforceAiRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }))

    const response = await POST(createRequest(MODAL_BODY))

    expect(response.status).toBe(429)
    expect(enforceAiRateLimit).toHaveBeenCalledWith(expect.anything(), { kind: 'user', userId: USER_ID })
    expect(generateResumeFromJobDescription).not.toHaveBeenCalled()
    expect(state.inserts).toEqual([])
  })

  it('keeps its validation: a description under 50 characters is refused', async () => {
    const response = await POST(createRequest({ ...MODAL_BODY, jobDescription: 'Too short.' }))
    expect(response.status).toBe(400)
    expect(generateResumeFromJobDescription).not.toHaveBeenCalled()
  })

  it('answers 500 when the insert fails', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply())
    state.insertError = { code: '23514' }

    const response = await POST(createRequest(MODAL_BODY))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to create resume in database' })
  })
})
