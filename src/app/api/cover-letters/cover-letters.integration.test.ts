/**
 * Integration tests for the cover-letters API routes.
 *
 * These call the real route handlers against the real local Supabase stack.
 * The only seam is `createServerSupabaseClient`, which is replaced so a test
 * can act as a chosen user without going through cookie and session plumbing.
 * Everything past that seam is real: Zod validation, the queries, RLS, and the
 * database.
 *
 * What this deliberately does NOT cover: the cookie/session translation itself,
 * and middleware. Those need a running server and belong to E2E (Phase 12).
 *
 * It also does not cover RLS, which is worth stating precisely because the
 * ownership tests below look like they do. Verified by experiment: disabling
 * RLS on `cover_letters` leaves all of these tests passing, because each route
 * also filters with `.eq('user_id', user.id)` and that alone satisfies every
 * assertion here.
 *
 * That is defense in depth working as intended — two independent layers, either
 * sufficient — but it means these tests cannot detect RLS being weakened. The
 * policy layer has its own evidence in supabase/tests/rls-audit.sql. Neither
 * suite substitutes for the other.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  assertStackReachable,
  createTestUser,
  deleteTestUser,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  type TestUser,
} from '@/test/integration/supabase'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { GET, POST } from './route'
import {
  GET as GET_BY_ID,
  PATCH as PATCH_BY_ID,
  DELETE as DELETE_BY_ID,
} from './[id]/route'

const asClient = vi.mocked(createServerSupabaseClient)

/** Act as this user for the next handler call. */
function actAs(user: TestUser) {
  asClient.mockResolvedValue(user.client as never)
}

/** Act as nobody: a client with no session, as an unauthenticated request has. */
function actAsAnonymous() {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  asClient.mockResolvedValue(anon as never)
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/cover-letters', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/cover-letters/x', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe('cover-letters API', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    await assertStackReachable()
    alice = await createTestUser()
    bob = await createTestUser()
  })

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id)
    if (bob) await deleteTestUser(bob.id)
  })

  describe('authentication', () => {
    it('rejects an unauthenticated list', async () => {
      actAsAnonymous()
      const res = await GET()
      expect(res.status).toBe(401)
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    })

    it('rejects an unauthenticated create', async () => {
      actAsAnonymous()
      const res = await POST(postRequest({ title: 'should not exist' }))
      expect(res.status).toBe(401)
    })

    it('rejects an unauthenticated read by id', async () => {
      actAsAnonymous()
      const res = await GET_BY_ID(
        new NextRequest('http://localhost/api/cover-letters/x'),
        ctx('00000000-0000-4000-8000-000000000001')
      )
      expect(res.status).toBe(401)
    })
  })

  describe('creation', () => {
    it('creates a letter owned by the caller and applies documented defaults', async () => {
      actAs(alice)
      const res = await POST(postRequest({ title: 'Alice letter' }))
      expect(res.status).toBe(201)

      const { coverLetter } = await res.json()
      expect(coverLetter.user_id).toBe(alice.id)
      expect(coverLetter.title).toBe('Alice letter')
      expect(coverLetter.greeting).toBe('Dear Hiring Manager,')
      expect(coverLetter.sign_off).toBe('Sincerely,')
      expect(coverLetter.template).toBe('modern')
      expect(coverLetter.body_paragraphs).toEqual([])
    })

    it('rejects a body that fails validation', async () => {
      actAs(alice)
      const res = await POST(postRequest({ title: '', template: 'not-modern' }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('Validation failed')
    })

    it('ignores a client-supplied user_id rather than trusting it', async () => {
      actAs(alice)
      const res = await POST(
        postRequest({ title: 'ownership probe', user_id: bob.id })
      )
      expect(res.status).toBe(201)
      const { coverLetter } = await res.json()
      // The route derives ownership from the session, not the payload.
      expect(coverLetter.user_id).toBe(alice.id)
    })
  })

  describe('ownership isolation', () => {
    let aliceLetterId: string

    beforeAll(async () => {
      actAs(alice)
      const res = await POST(postRequest({ title: 'Alice private' }))
      const { coverLetter } = await res.json()
      aliceLetterId = coverLetter.id
    })

    it("does not list another user's letters", async () => {
      actAs(bob)
      const res = await GET()
      expect(res.status).toBe(200)
      const { coverLetters } = await res.json()
      expect(coverLetters.every((c: { user_id: string }) => c.user_id === bob.id)).toBe(true)
      expect(coverLetters.map((c: { id: string }) => c.id)).not.toContain(aliceLetterId)
    })

    it("returns 404 reading another user's letter", async () => {
      actAs(bob)
      const res = await GET_BY_ID(
        new NextRequest('http://localhost/api/cover-letters/x'),
        ctx(aliceLetterId)
      )
      expect(res.status).toBe(404)
    })

    it("returns 404 updating another user's letter", async () => {
      actAs(bob)
      const res = await PATCH_BY_ID(patchRequest({ title: 'hijacked' }), ctx(aliceLetterId))
      expect(res.status).toBe(404)
    })

    it("does not delete another user's letter", async () => {
      actAs(bob)
      await DELETE_BY_ID(
        new NextRequest('http://localhost/api/cover-letters/x', { method: 'DELETE' }),
        ctx(aliceLetterId)
      )

      // The row must survive regardless of the status the route chose to return.
      actAs(alice)
      const check = await GET_BY_ID(
        new NextRequest('http://localhost/api/cover-letters/x'),
        ctx(aliceLetterId)
      )
      expect(check.status).toBe(200)
      const { coverLetter } = await check.json()
      expect(coverLetter.title).toBe('Alice private')
    })
  })

  describe('owner access', () => {
    it('reads, updates and deletes its own letter', async () => {
      actAs(alice)
      const created = await POST(postRequest({ title: 'lifecycle' }))
      const { coverLetter } = await created.json()
      const id = coverLetter.id

      const read = await GET_BY_ID(
        new NextRequest('http://localhost/api/cover-letters/x'),
        ctx(id)
      )
      expect(read.status).toBe(200)

      const patched = await PATCH_BY_ID(patchRequest({ title: 'renamed' }), ctx(id))
      expect(patched.status).toBe(200)
      expect((await patched.json()).coverLetter.title).toBe('renamed')

      const deleted = await DELETE_BY_ID(
        new NextRequest('http://localhost/api/cover-letters/x', { method: 'DELETE' }),
        ctx(id)
      )
      expect(deleted.status).toBe(200)

      const gone = await GET_BY_ID(
        new NextRequest('http://localhost/api/cover-letters/x'),
        ctx(id)
      )
      expect(gone.status).toBe(404)
    })
  })
})
