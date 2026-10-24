import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeTables, type Row } from '@/test/fake-supabase-tables'

/**
 * `POST /api/job-applications/[id]/link-resume`, "Lier un CV existant" on a
 * Kanban card (job-cv-linking US-002). Supabase is the in-memory fake, which
 * applies only the code's own filters and no RLS, so ownership is proven by
 * the route and its helper.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'

const state: { user: { id: string } | null; db: FakeTables } = { user: null, db: new FakeTables() }

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: (table: string) => state.db.from(table),
  }),
}))

const { POST } = await import('./route')

function call(applicationId: string, body: unknown) {
  const request = new NextRequest(`http://localhost:3000/api/job-applications/${applicationId}/link-resume`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return POST(request, { params: Promise.resolve({ id: applicationId }) })
}

function seedApplication(fields: Row = {}): Row {
  return state.db.seed('job_applications', { id: crypto.randomUUID(), user_id: USER_ID, resume_id: null, ...fields })
}

function seedResume(fields: Row = {}): Row {
  return state.db.seed('resumes', {
    id: crypto.randomUUID(),
    user_id: USER_ID,
    title: 'My CV',
    template: 'classic',
    job_application_id: null,
    ...fields,
  })
}

function snapshot(): string {
  return JSON.stringify(state.db.rows)
}

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.user = { id: USER_ID }
  state.db = new FakeTables()
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/job-applications/[id]/link-resume', () => {
  it('links the CV both ways and answers with it', async () => {
    const application = seedApplication()
    const resume = seedResume({ title: 'Data CV', template: 'modern' })

    const response = await call(application.id as string, { resumeId: resume.id })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      resume: { id: resume.id, title: 'Data CV', template: 'modern' },
    })
    expect(application.resume_id).toBe(resume.id)
    expect(resume.job_application_id).toBe(application.id)
  })

  it('replaces the linked CV and clears the old one, which is kept', async () => {
    const application = seedApplication()
    const old = seedResume({ title: 'Old CV', job_application_id: application.id })
    application.resume_id = old.id
    const resume = seedResume()

    const response = await call(application.id as string, { resumeId: resume.id })

    expect(response.status).toBe(200)
    expect(application.resume_id).toBe(resume.id)
    expect(old).toMatchObject({ title: 'Old CV', job_application_id: null })
  })

  it('moves a CV from another application, whose resume_id is cleared', async () => {
    const previous = seedApplication()
    const application = seedApplication()
    const resume = seedResume({ job_application_id: previous.id })
    previous.resume_id = resume.id

    const response = await call(application.id as string, { resumeId: resume.id })

    expect(response.status).toBe(200)
    expect(resume.job_application_id).toBe(application.id)
    expect(application.resume_id).toBe(resume.id)
    expect(previous.resume_id).toBeNull()
  })

  it("answers 404 for another user's CV and changes nothing", async () => {
    const application = seedApplication()
    const foreign = seedResume({ user_id: OTHER_USER_ID })
    const before = snapshot()

    const response = await call(application.id as string, { resumeId: foreign.id })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Resume not found' })
    expect(snapshot()).toBe(before)
    expect(state.db.writes()).toEqual([])
  })

  it("answers 404 for another user's application and changes nothing", async () => {
    const foreign = seedApplication({ user_id: OTHER_USER_ID })
    const resume = seedResume()
    const before = snapshot()

    const response = await call(foreign.id as string, { resumeId: resume.id })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Job application not found' })
    expect(snapshot()).toBe(before)
    expect(state.db.writes()).toEqual([])
  })

  it('answers 404 for ids that do not exist', async () => {
    const application = seedApplication()
    const resume = seedResume()

    expect((await call(crypto.randomUUID(), { resumeId: resume.id })).status).toBe(404)
    expect((await call(application.id as string, { resumeId: crypto.randomUUID() })).status).toBe(404)
    expect(state.db.writes()).toEqual([])
  })

  it.each([
    ['an application id that is not a UUID', 'not-a-uuid', { resumeId: '22222222-2222-4222-8222-222222222222' }],
    ['a resume id that is not a UUID', '33333333-3333-4333-8333-333333333333', { resumeId: 'nope' }],
    ['no resume id', '33333333-3333-4333-8333-333333333333', {}],
    ['a resume id that is not a string', '33333333-3333-4333-8333-333333333333', { resumeId: 42 }],
    ['a body that is not JSON', '33333333-3333-4333-8333-333333333333', '{oops'],
  ])('answers 400 for %s, before any query', async (_label, applicationId, body) => {
    const response = await call(applicationId, body)

    expect(response.status).toBe(400)
    expect(state.db.log).toEqual([])
  })

  it('answers 401 without a session', async () => {
    state.user = null

    const response = await call(crypto.randomUUID(), { resumeId: crypto.randomUUID() })

    expect(response.status).toBe(401)
    expect(state.db.log).toEqual([])
  })

  describe('a link that cannot be written answers 500 and changes nothing', () => {
    it('when the CV cannot be linked', async () => {
      const application = seedApplication()
      const resume = seedResume()
      state.db.failOn('resumes', 'update')
      const before = snapshot()

      const response = await call(application.id as string, { resumeId: resume.id })

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({ error: 'Failed to link resume' })
      expect(snapshot()).toBe(before)
    })

    it('when the application cannot be linked back: the CV keeps its previous link', async () => {
      const previous = seedApplication()
      const application = seedApplication()
      const resume = seedResume({ job_application_id: previous.id })
      previous.resume_id = resume.id
      state.db.failOn('job_applications', 'update')
      const before = snapshot()

      const response = await call(application.id as string, { resumeId: resume.id })

      expect(response.status).toBe(500)
      expect(snapshot()).toBe(before)
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Link failed'), 'link_application', 'XX000')
    })

    it('when a lookup fails in the database', async () => {
      const application = seedApplication()
      const resume = seedResume()
      state.db.failOn('job_applications', 'select')

      const response = await call(application.id as string, { resumeId: resume.id })

      expect(response.status).toBe(500)
      expect(state.db.writes()).toEqual([])
    })
  })

  it('answers 200 when only clearing a previous link failed, and logs the step', async () => {
    const previous = seedApplication()
    const application = seedApplication()
    const resume = seedResume({ job_application_id: previous.id })
    previous.resume_id = resume.id
    state.db.failOn('job_applications', 'update', {
      when: (query) => query.filters.some(([, , operator]) => operator === 'neq'),
    })

    const response = await call(application.id as string, { resumeId: resume.id })

    expect(response.status).toBe(200)
    expect(application.resume_id).toBe(resume.id)
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('previous link could not be cleared'),
      'clear_previous_applications',
      'XX000'
    )
  })

  it('logs step names and codes only, never CV content', async () => {
    const application = seedApplication()
    const resume = seedResume({ title: 'Secret CV title' })
    state.db.failOn('resumes', 'update')

    await call(application.id as string, { resumeId: resume.id })

    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('Secret CV title')
  })
})
