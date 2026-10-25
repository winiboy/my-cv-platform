import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeTables } from '@/test/fake-supabase-tables'

/**
 * `POST /api/job-applications`, the Job Search "Save" button and the Kanban
 * quick-add. Its insert and its `user_id` + `job_url` duplicate check were
 * moved into `createJobApplicationWithDedupe` so that "Créer un CV" shares them
 * (job-cv-linking FR-2); these tests pin that nothing it stores or answers
 * changed, the 409 contract included.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'

const state: { user: { id: string; email: string } | null; db: FakeTables } = {
  user: null,
  db: new FakeTables(),
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: (table: string) => state.db.from(table),
  }),
}))

const { POST } = await import('./route')

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/job-applications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** The body the detail panel's Save sends. */
const SAVE_BODY = {
  job_title: 'Data Engineer',
  company_name: 'Beispiel AG',
  location: 'Zürich, Suisse',
  salary_min: 90000,
  salary_max: 110000,
  job_url: 'https://jobs.example.test/offers/data-engineer',
  job_description: 'Listing description.',
  source: 'Adzuna',
}

const chf = (value: number) => value.toLocaleString('de-CH')

beforeEach(() => {
  state.user = { id: USER_ID, email: 'user@example.test' }
  state.db = new FakeTables()
  state.db.seed('profiles', { id: USER_ID })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('POST /api/job-applications', () => {
  it('stores the offer with the fields of before and answers 201', async () => {
    const response = await POST(createRequest(SAVE_BODY))

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['jobApplication', 'message'])
    expect(body.message).toBe('Job saved successfully')

    const applications = state.db.table('job_applications')
    expect(applications).toHaveLength(1)
    const { id, ...stored } = applications[0]
    expect(stored).toEqual({
      user_id: USER_ID,
      job_title: 'Data Engineer',
      company_name: 'Beispiel AG',
      location: 'Zürich, Suisse',
      salary_range: `${chf(90000)} - ${chf(110000)} CHF`,
      job_url: SAVE_BODY.job_url,
      job_description: 'Listing description.',
      status: 'saved',
      priority: 'medium',
      notes: 'Source: Adzuna',
      contacts: [],
      documents: [],
      interviews: [],
      is_archived: false,
    })
    expect(body.jobApplication).toEqual({ id, ...stored })
  })

  it.each([
    ['only a minimum', { salary_min: 90000, salary_max: null }, `From ${chf(90000)} CHF`],
    ['only a maximum', { salary_min: null, salary_max: 110000 }, `Up to ${chf(110000)} CHF`],
    ['no salary', { salary_min: null, salary_max: null }, null],
  ])('formats the salary range with %s', async (_label, salary, expected) => {
    await POST(createRequest({ ...SAVE_BODY, ...salary }))
    expect(state.db.table('job_applications')[0].salary_range).toBe(expected)
  })

  it('stores null for empty optional fields and no source', async () => {
    await POST(createRequest({ job_title: 'Data Engineer', company_name: 'Beispiel AG', location: '', job_url: null }))
    expect(state.db.table('job_applications')[0]).toMatchObject({
      location: null,
      job_url: null,
      job_description: null,
      notes: null,
    })
  })

  it('answers 409 with the existing id for a URL the user already saved, and stores nothing', async () => {
    const existing = state.db.seed('job_applications', {
      id: crypto.randomUUID(),
      user_id: USER_ID,
      job_url: SAVE_BODY.job_url,
      job_title: 'Seeded',
    })

    const response = await POST(createRequest(SAVE_BODY))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Job already saved',
      jobApplication: { id: existing.id },
      isDuplicate: true,
    })
    expect(state.db.table('job_applications')).toEqual([existing])
  })

  it("saves an offer another user already saved: the duplicate check is the caller's own", async () => {
    state.db.seed('job_applications', { id: crypto.randomUUID(), user_id: OTHER_USER_ID, job_url: SAVE_BODY.job_url })

    const response = await POST(createRequest(SAVE_BODY))

    expect(response.status).toBe(201)
    expect(state.db.table('job_applications').filter((row) => row.user_id === USER_ID)).toHaveLength(1)
  })

  it('saves every offer without a URL: there is nothing to match on', async () => {
    const noUrl = { ...SAVE_BODY, job_url: null }
    await POST(createRequest(noUrl))
    const response = await POST(createRequest(noUrl))

    expect(response.status).toBe(201)
    expect(state.db.table('job_applications')).toHaveLength(2)
  })

  it('keeps the quick-add status', async () => {
    await POST(createRequest({ job_title: 'Data Engineer', company_name: 'Beispiel AG', status: 'interviewing' }))
    expect(state.db.table('job_applications')[0].status).toBe('interviewing')
  })

  it.each([
    ['no title', { job_title: '' }],
    ['a title over 255 characters', { job_title: 'T'.repeat(256) }],
    ['a URL that is not one', { job_url: 'not a url' }],
    ['an unknown status', { status: 'archived' }],
  ])('answers 400 for %s', async (_label, override) => {
    const response = await POST(createRequest({ ...SAVE_BODY, ...override }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Validation failed')
    expect(state.db.table('job_applications')).toEqual([])
  })

  it('answers 500 with the database message when the insert fails', async () => {
    state.db.failOn('job_applications', 'insert')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(createRequest(SAVE_BODY))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to save job application',
      details: 'injected insert failure on job_applications',
    })
  })

  it('answers 401 without a session', async () => {
    state.user = null
    const response = await POST(createRequest(SAVE_BODY))
    expect(response.status).toBe(401)
    expect(state.db.log).toEqual([])
  })
})
