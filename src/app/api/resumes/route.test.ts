import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeTables } from '@/test/fake-supabase-tables'

/**
 * `GET /api/resumes`, the CV list of "Lier un CV existant" (job-cv-linking
 * US-002): the caller's own CVs only, most recently updated first, with only
 * the fields the picker shows. The fake applies no RLS, so the route's own
 * `user_id` filter is what keeps other users' CVs out.
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

const { GET } = await import('./route')

beforeEach(() => {
  state.user = { id: USER_ID }
  state.db = new FakeTables()
})

describe('GET /api/resumes', () => {
  it("lists the caller's CVs, most recently updated first, and nobody else's", async () => {
    state.db.seed('resumes', { id: 'old', user_id: USER_ID, title: 'Old', updated_at: '2026-01-01T00:00:00Z', summary: 'x' })
    state.db.seed('resumes', { id: 'foreign', user_id: OTHER_USER_ID, title: 'Foreign', updated_at: '2026-12-01T00:00:00Z' })
    state.db.seed('resumes', { id: 'new', user_id: USER_ID, title: 'New', updated_at: '2026-10-01T00:00:00Z' })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      resumes: [
        { id: 'new', title: 'New', updated_at: '2026-10-01T00:00:00Z' },
        { id: 'old', title: 'Old', updated_at: '2026-01-01T00:00:00Z' },
      ],
    })
  })

  it('answers an empty list for a user without CVs', async () => {
    const response = await GET()
    await expect(response.json()).resolves.toEqual({ resumes: [] })
  })

  it('answers 401 without a session, before any query', async () => {
    state.user = null
    const response = await GET()
    expect(response.status).toBe(401)
    expect(state.db.log).toEqual([])
  })

  it('answers 500 when the query fails', async () => {
    state.db.failOn('resumes', 'select')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await GET()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to load resumes' })
  })
})
