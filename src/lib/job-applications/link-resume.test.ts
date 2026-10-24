import { beforeEach, describe, expect, it } from 'vitest'
import { FakeTables, type Row } from '@/test/fake-supabase-tables'
import type { createServerSupabaseClient } from '@/lib/supabase/server'
import { linkResumeToJobApplication } from './link-resume'

/**
 * `linkResumeToJobApplication`, the two-way link written by "Créer un CV" from
 * Job Search (job-cv-linking US-001) and reused by US-002. The fake applies
 * only the helper's own filters, no RLS, so ownership is proven here, not
 * borrowed from a policy.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

let db: FakeTables

function client(): ServerSupabaseClient {
  // The fake implements the subset of the builder the helper calls.
  return { from: (table: string) => db.from(table) } as unknown as ServerSupabaseClient
}

function seedApplication(fields: Row = {}): Row {
  return db.seed('job_applications', { id: crypto.randomUUID(), user_id: USER_ID, resume_id: null, ...fields })
}

function seedResume(fields: Row = {}): Row {
  return db.seed('resumes', { id: crypto.randomUUID(), user_id: USER_ID, job_application_id: null, ...fields })
}

function link(resume: Row, application: Row) {
  return linkResumeToJobApplication(client(), {
    userId: USER_ID,
    resumeId: resume.id as string,
    jobApplicationId: application.id as string,
  })
}

function snapshot(): string {
  return JSON.stringify(db.rows)
}

beforeEach(() => {
  db = new FakeTables()
})

describe('linkResumeToJobApplication', () => {
  it('links the CV and the application both ways', async () => {
    const application = seedApplication()
    const resume = seedResume()

    await expect(link(resume, application)).resolves.toEqual({ ok: true })

    expect(resume.job_application_id).toBe(application.id)
    expect(application.resume_id).toBe(resume.id)
  })

  it('clears every other CV of the user still pointing to the application, and keeps them', async () => {
    const application = seedApplication()
    const named = seedResume({ job_application_id: application.id })
    const stray = seedResume({ job_application_id: application.id })
    application.resume_id = named.id
    const resume = seedResume()

    await expect(link(resume, application)).resolves.toEqual({ ok: true })

    expect(application.resume_id).toBe(resume.id)
    expect(resume.job_application_id).toBe(application.id)
    expect(named.job_application_id).toBeNull()
    expect(stray.job_application_id).toBeNull()
    expect(db.table('resumes')).toHaveLength(3)
  })

  it('leaves an old CV that now points to another application untouched', async () => {
    const application = seedApplication()
    const elsewhere = seedApplication()
    const moved = seedResume({ job_application_id: elsewhere.id })
    application.resume_id = moved.id
    const resume = seedResume()

    await expect(link(resume, application)).resolves.toEqual({ ok: true })

    expect(moved.job_application_id).toBe(elsewhere.id)
  })

  it("never clears another user's CV, even one pointing to the application", async () => {
    const application = seedApplication()
    const foreign = seedResume({ user_id: OTHER_USER_ID, job_application_id: application.id })

    await expect(link(seedResume(), application)).resolves.toEqual({ ok: true })

    expect(foreign.job_application_id).toBe(application.id)
  })

  it("refuses another user's CV and writes nothing", async () => {
    const application = seedApplication()
    const foreign = seedResume({ user_id: OTHER_USER_ID })
    const before = snapshot()

    await expect(link(foreign, application)).resolves.toEqual({ ok: false, step: 'load_resume', code: null })

    expect(snapshot()).toBe(before)
    expect(db.writes()).toEqual([])
  })

  it("refuses another user's application and writes nothing", async () => {
    const foreign = seedApplication({ user_id: OTHER_USER_ID })
    const resume = seedResume()
    const before = snapshot()

    await expect(link(resume, foreign)).resolves.toEqual({ ok: false, step: 'load_application', code: null })

    expect(snapshot()).toBe(before)
    expect(db.writes()).toEqual([])
  })

  it('reports a failed clear and keeps the new link', async () => {
    const application = seedApplication()
    const old = seedResume({ job_application_id: application.id })
    application.resume_id = old.id
    const resume = seedResume()
    // The clear is the only update filtered with `neq`.
    db.failOn('resumes', 'update', { when: (query) => query.filters.some(([, , operator]) => operator === 'neq') })

    await expect(link(resume, application)).resolves.toEqual({
      ok: false,
      step: 'clear_previous_resumes',
      code: 'XX000',
    })

    expect(resume.job_application_id).toBe(application.id)
    expect(application.resume_id).toBe(resume.id)
    expect(old.job_application_id).toBe(application.id)
  })

  it('undoes the CV link, back to its previous application, when the application cannot be linked', async () => {
    const previous = seedApplication()
    const application = seedApplication()
    const resume = seedResume({ job_application_id: previous.id })
    db.failOn('job_applications', 'update')

    await expect(link(resume, application)).resolves.toEqual({ ok: false, step: 'link_application', code: 'XX000' })

    expect(resume.job_application_id).toBe(previous.id)
    expect(application.resume_id).toBeNull()
  })

  it('reports a failed undo as its own step', async () => {
    const application = seedApplication()
    const resume = seedResume()
    db.failOn('job_applications', 'update')
    // The first update on resumes is the link; the second is the undo.
    db.failOn('resumes', 'update', { nth: 2 })

    await expect(link(resume, application)).resolves.toEqual({
      ok: false,
      step: 'rollback_link_resume',
      code: 'XX000',
    })

    expect(resume.job_application_id).toBe(application.id)
    expect(application.resume_id).toBeNull()
  })

  it('reports a failed CV link and writes nothing else', async () => {
    const application = seedApplication()
    const resume = seedResume()
    db.failOn('resumes', 'update')

    await expect(link(resume, application)).resolves.toEqual({ ok: false, step: 'link_resume', code: 'XX000' })

    expect(application.resume_id).toBeNull()
    expect(db.writes()).toHaveLength(1)
  })
})
