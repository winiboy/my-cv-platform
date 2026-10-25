import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCompletionError } from '@/lib/ai/client'
import { FakeTables, type Row } from '@/test/fake-supabase-tables'

/**
 * Unit coverage for `POST /api/ai/generate-from-job-description`, the Job
 * Search "Créer un CV" route (cv-from-job-complete, US-003): the CV is filled
 * through the shared builder in the offer's language, an AI failure still
 * fails the request without creating anything, and the rate limit and the
 * response fields are those of before.
 *
 * job-cv-linking US-001: with the Job Search offer, the offer is saved as the
 * user's job application (or the one saved with the same URL is reused) once
 * the CV exists, and the two are linked both ways.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'

const GERMAN_DESCRIPTION = `Zur Verstärkung unseres Data-Teams in Zürich suchen wir eine erfahrene Data Engineer
  (m/w/d). Sie sind für die Konzeption und Wartung der Datenpipelines verantwortlich, die unsere Produkte
  versorgen. Ihre Aufgaben: Sie entwickeln zuverlässige Datenflüsse und arbeiten eng mit den Produktteams
  zusammen. Ihr Profil: mindestens drei Jahre Erfahrung in einer ähnlichen Position und sehr gute
  Python-Kenntnisse. Wir bieten Ihnen ein dynamisches Umfeld und ein motiviertes Team an unserem Standort.`

const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'

const state: { user: { id: string } | null; db: FakeTables } = { user: null, db: new FakeTables() }

function fakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: (table: string) => state.db.from(table),
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
  const resumes = state.db.table('resumes')
  expect(resumes).toHaveLength(1)
  return resumes[0]
}

beforeEach(() => {
  state.user = { id: USER_ID }
  state.db = new FakeTables()
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
    expect(body).toMatchObject({ success: true, resumeId: inserted().id, tokensUsed: 123 })
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
      expect(state.db.table('resumes')).toEqual([])
    })
  })

  it('keeps the rate limit: a throttled caller gets the 429 and nothing is generated or created', async () => {
    enforceAiRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }))

    const response = await POST(createRequest(MODAL_BODY))

    expect(response.status).toBe(429)
    expect(enforceAiRateLimit).toHaveBeenCalledWith(expect.anything(), { kind: 'user', userId: USER_ID })
    expect(generateResumeFromJobDescription).not.toHaveBeenCalled()
    expect(state.db.table('resumes')).toEqual([])
  })

  it('keeps its validation: a description under 50 characters is refused', async () => {
    const response = await POST(createRequest({ ...MODAL_BODY, jobDescription: 'Too short.' }))
    expect(response.status).toBe(400)
    expect(generateResumeFromJobDescription).not.toHaveBeenCalled()
  })

  it('answers 500 when the insert fails', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply())
    state.db.failOn('resumes', 'insert')

    const response = await POST(createRequest(MODAL_BODY))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to create resume in database' })
  })
})

describe('job-cv-linking US-001: the offer is saved and linked to the new CV', () => {
  /** What the panel's shared mapping sends for an Adzuna offer. */
  const OFFER = {
    job_title: 'Data Engineer',
    company_name: 'Beispiel AG',
    location: 'Zürich, Suisse',
    salary_min: 90000,
    salary_max: 110000,
    job_url: 'https://jobs.example.test/offers/data-engineer',
    job_description: 'Listing description of a data engineering role in Zürich.',
    source: 'Adzuna',
  }

  /** Offer and CV text that must never reach a log line. */
  const CONTENT_TEXTS = [OFFER.job_title, OFFER.company_name, OFFER.job_description, 'KI-']

  function seedApplication(fields: Row): Row {
    return state.db.seed('job_applications', {
      id: crypto.randomUUID(),
      user_id: USER_ID,
      job_title: 'Seeded',
      company_name: 'Seeded AG',
      job_url: null,
      resume_id: null,
      status: 'applied',
      ...fields,
    })
  }

  function seedResume(fields: Row): Row {
    return state.db.seed('resumes', { id: crypto.randomUUID(), user_id: USER_ID, title: 'Old CV', ...fields })
  }

  /** The CV this request created: the only resume row the test did not seed. */
  function newResume(seeded: Row[] = []): Row {
    const created = state.db.table('resumes').filter((row) => !seeded.includes(row))
    expect(created).toHaveLength(1)
    return created[0]
  }

  async function create(offer: unknown = OFFER) {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply())
    return POST(createRequest({ ...MODAL_BODY, offer }))
  }

  function silenceErrors() {
    return vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  function expectNoContentLogged(errorLog: ReturnType<typeof silenceErrors>) {
    const logged = JSON.stringify(errorLog.mock.calls)
    for (const text of CONTENT_TEXTS) expect(logged).not.toContain(text)
  }

  it('creates the application with the Save mapping and links it both ways', async () => {
    const response = await create()

    expect(response.status).toBe(200)
    const body = await response.json()
    // The response is the one of before: the link adds no field.
    expect(Object.keys(body).sort()).toEqual(['qualityAnalysis', 'resumeId', 'success', 'tokensUsed'])

    const applications = state.db.table('job_applications')
    expect(applications).toHaveLength(1)
    const [application] = applications
    expect(application).toEqual({
      id: expect.any(String),
      user_id: USER_ID,
      job_title: OFFER.job_title,
      company_name: OFFER.company_name,
      location: OFFER.location,
      salary_range: `${(90000).toLocaleString('de-CH')} - ${(110000).toLocaleString('de-CH')} CHF`,
      job_url: OFFER.job_url,
      job_description: OFFER.job_description,
      status: 'saved',
      priority: 'medium',
      notes: 'Source: Adzuna',
      contacts: [],
      documents: [],
      interviews: [],
      is_archived: false,
      resume_id: body.resumeId,
      updated_at: expect.any(String),
    })

    const resume = newResume()
    expect(resume.id).toBe(body.resumeId)
    expect(resume.job_application_id).toBe(application.id)
  })

  it('reuses the application already saved with the same URL', async () => {
    const existing = seedApplication({ job_url: OFFER.job_url })

    await create()

    expect(state.db.table('job_applications')).toEqual([existing])
    const resume = newResume()
    expect(existing.resume_id).toBe(resume.id)
    expect(resume.job_application_id).toBe(existing.id)
    // The application's own fields are kept: only the link changes.
    expect(existing).toMatchObject({ job_title: 'Seeded', status: 'applied' })
    expect(state.db.log.some((query) => query.table === 'job_applications' && query.operation === 'insert')).toBe(false)
  })

  it('replaces the CV the application was linked to and clears the old CV, which is kept', async () => {
    const existing = seedApplication({ job_url: OFFER.job_url })
    const oldResume = seedResume({ job_application_id: existing.id })
    existing.resume_id = oldResume.id

    await create()

    const resume = newResume([oldResume])
    expect(existing.resume_id).toBe(resume.id)
    expect(resume.job_application_id).toBe(existing.id)
    expect(state.db.find('resumes', oldResume.id)).toMatchObject({ title: 'Old CV', job_application_id: null })
  })

  it('clears every old CV still pointing to the application, not only the one it named', async () => {
    const existing = seedApplication({ job_url: OFFER.job_url })
    const named = seedResume({ job_application_id: existing.id })
    const stray = seedResume({ job_application_id: existing.id })
    existing.resume_id = named.id

    await create()

    const resume = newResume([named, stray])
    expect(existing.resume_id).toBe(resume.id)
    expect(named.job_application_id).toBeNull()
    expect(stray.job_application_id).toBeNull()
  })

  it('leaves the old CV alone when it already points to another application', async () => {
    const existing = seedApplication({ job_url: OFFER.job_url })
    const elsewhere = seedApplication({ job_url: 'https://jobs.example.test/elsewhere' })
    const oldResume = seedResume({ job_application_id: elsewhere.id })
    existing.resume_id = oldResume.id

    await create()

    expect(existing.resume_id).toBe(newResume([oldResume]).id)
    expect(oldResume.job_application_id).toBe(elsewhere.id)
  })

  it('creates a new application for an offer without a URL, even next to another without one', async () => {
    const withoutUrl = seedApplication({ job_url: null })

    await create({ ...OFFER, job_url: null })

    const applications = state.db.table('job_applications')
    expect(applications).toHaveLength(2)
    const created = applications.find((row) => row !== withoutUrl)
    expect(created).toMatchObject({ job_url: null, status: 'saved', job_title: OFFER.job_title })
    const resume = newResume()
    expect(created?.resume_id).toBe(resume.id)
    expect(resume.job_application_id).toBe(created?.id)
    expect(withoutUrl.resume_id).toBeNull()
  })

  it("never reuses or changes another user's application with the same URL", async () => {
    const foreign = seedApplication({ user_id: OTHER_USER_ID, job_url: OFFER.job_url })
    const foreignSnapshot = { ...foreign }

    await create()

    expect(foreign).toEqual(foreignSnapshot)
    const own = state.db.table('job_applications').filter((row) => row.user_id === USER_ID)
    expect(own).toHaveLength(1)
    expect(own[0].resume_id).toBe(newResume().id)
    // Every job_applications query of this request was scoped to the caller.
    for (const query of state.db.log.filter((entry) => entry.table === 'job_applications')) {
      const scoped =
        query.operation === 'insert'
          ? query.payload?.user_id === USER_ID
          : query.filters.some(([column, value]) => column === 'user_id' && value === USER_ID)
      expect(scoped, `${query.operation} on job_applications`).toBe(true)
    }
  })

  describe('a failed generation touches no application', () => {
    it.each([
      ['a provider error', new AiCompletionError('provider_error', 'model', 500)],
      ['a provider rate limit', new AiCompletionError('rate_limited', 'model', 429)],
    ])('on %s', async (_label, failure) => {
      const existing = seedApplication({ job_url: OFFER.job_url })
      const oldResume = seedResume({ job_application_id: existing.id })
      existing.resume_id = oldResume.id
      const before = JSON.stringify(state.db.rows)
      generateResumeFromJobDescription.mockRejectedValueOnce(failure)

      const response = await POST(createRequest({ ...MODAL_BODY, offer: OFFER }))

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({ error: 'Failed to generate resume', message: failure.message })
      expect(JSON.stringify(state.db.rows)).toBe(before)
      expect(state.db.log).toEqual([])
    })

    it('on our rate limit', async () => {
      enforceAiRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }))

      const response = await POST(createRequest({ ...MODAL_BODY, offer: OFFER }))

      expect(response.status).toBe(429)
      expect(state.db.log).toEqual([])
    })

    it('when the CV insert fails', async () => {
      state.db.failOn('resumes', 'insert')

      const response = await create()

      expect(response.status).toBe(500)
      expect(state.db.table('job_applications')).toEqual([])
    })
  })

  describe('a failed save or link keeps the CV and answers 200, logging no offer or CV content', () => {
    it('when the application cannot be saved', async () => {
      state.db.failOn('job_applications', 'insert')
      const errorLog = silenceErrors()

      const response = await create()

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(newResume().id).toBe(body.resumeId)
      expect(newResume().job_application_id).toBeUndefined()
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Could not save the offer'), 'XX000')
      expectNoContentLogged(errorLog)
      errorLog.mockRestore()
    })

    it('when the CV cannot be linked', async () => {
      const existing = seedApplication({ job_url: OFFER.job_url })
      state.db.failOn('resumes', 'update')
      const errorLog = silenceErrors()

      const response = await create()

      expect(response.status).toBe(200)
      expect(newResume().job_application_id).toBeUndefined()
      // Nothing points to a CV that does not point back.
      expect(existing.resume_id).toBeNull()
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Could not link'), 'link_resume', 'XX000')
      expectNoContentLogged(errorLog)
      errorLog.mockRestore()
    })

    it('when the application cannot be linked back: the CV link is undone', async () => {
      const existing = seedApplication({ job_url: OFFER.job_url })
      state.db.failOn('job_applications', 'update')
      const errorLog = silenceErrors()

      const response = await create()

      expect(response.status).toBe(200)
      expect(newResume().job_application_id).toBeNull()
      expect(existing.resume_id).toBeNull()
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Could not link'), 'link_application', 'XX000')
      expectNoContentLogged(errorLog)
      errorLog.mockRestore()
    })
  })

  describe('the offer is untrusted (FR-3)', () => {
    it.each([
      ['a title over 255 characters', { job_title: 'T'.repeat(256) }],
      ['an empty company', { company_name: '' }],
      ['a location over 500 characters', { location: 'L'.repeat(501) }],
      ['a description over 50,000 characters', { job_description: 'D'.repeat(50_001) }],
      ['a URL over 2,000 characters', { job_url: `https://jobs.example.test/${'u'.repeat(2000)}` }],
      ['a javascript: URL', { job_url: 'javascript:alert(1)' }],
      ['a data: URL', { job_url: 'data:text/html,<script>alert(1)</script>' }],
      ['a value that is not a URL', { job_url: 'not a url' }],
      ['a salary that is not a number', { salary_min: '90000' }],
    ])('ignores an offer with %s: the CV is created, no application', async (_label, override) => {
      const errorLog = silenceErrors()

      const response = await create({ ...OFFER, ...override })

      expect(response.status).toBe(200)
      expect(newResume().job_application_id).toBeUndefined()
      expect(state.db.table('job_applications')).toEqual([])
      expectNoContentLogged(errorLog)
      errorLog.mockRestore()
    })

    it.each([
      ['null', null],
      ['a string', 'offer'],
      ['an array', [OFFER]],
    ])('ignores an offer that is %s', async (_label, offer) => {
      const errorLog = silenceErrors()

      const response = await create(offer)

      expect(response.status).toBe(200)
      expect(state.db.table('job_applications')).toEqual([])
      errorLog.mockRestore()
    })

    it('accepts values at the limits', async () => {
      await create({ ...OFFER, job_title: 'T'.repeat(255), location: 'L'.repeat(500), job_description: 'D'.repeat(50_000) })

      expect(state.db.table('job_applications')).toHaveLength(1)
    })

    it('ignores a status, an owner or a link the client sends', async () => {
      await create({ ...OFFER, status: 'offer', user_id: OTHER_USER_ID, resume_id: crypto.randomUUID() })

      const [application] = state.db.table('job_applications')
      expect(application).toMatchObject({ status: 'saved', user_id: USER_ID, resume_id: newResume().id })
    })
  })

  it('links nothing without an offer, as before', async () => {
    generateResumeFromJobDescription.mockResolvedValueOnce(aiReply())
    await POST(createRequest(MODAL_BODY))

    expect(state.db.table('job_applications')).toEqual([])
    expect(newResume().job_application_id).toBeUndefined()
  })
})
