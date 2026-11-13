import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

/**
 * Unit coverage for the greeting and sign-off `POST /api/cover-letters`
 * stores (cover-letter-swiss-format, US-005). Supabase is replaced by a
 * recorder that keeps the inserted row, so a test asserts what was written.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state: { inserted: Record<string, unknown> | null } = { inserted: null }

function fakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from() {
      const builder = {
        insert(payload: Record<string, unknown>) {
          state.inserted = payload
          return builder
        },
        select() {
          return builder
        },
        async single() {
          return { data: { id: 'letter', ...state.inserted }, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeSupabase() }))

// cover-letter-one-page, US-002 (AC8): a blank letter is created without the AI
// and without the one-page check. Both are recorded, so a call would show.
const generateCompletion = vi.fn()
const countCoverLetterPages = vi.fn()
vi.mock('@/lib/ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/client')>()),
  generateCompletion: (...args: unknown[]) => generateCompletion(...args),
}))
vi.mock('@/lib/pdf/cover-letter-page-count', () => ({
  countCoverLetterPages: (...args: unknown[]) => countCoverLetterPages(...args),
}))

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/cover-letters', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/cover-letters greeting and sign-off', () => {
  beforeEach(() => {
    state.inserted = null
  })

  it('stores an empty greeting and sign-off when none is sent', async () => {
    const res = await POST(postRequest({ title: 'Lettre' }))

    expect(res.status).toBe(201)
    // Sent explicitly: omitting them would store the columns' English default.
    expect(state.inserted).toMatchObject({ greeting: '', sign_off: '' })
  })

  it('stores an empty greeting and sign-off sent as empty', async () => {
    const res = await POST(postRequest({ title: 'Lettre', greeting: '', sign_off: '' }))

    expect(res.status).toBe(201)
    expect(state.inserted).toMatchObject({ greeting: '', sign_off: '' })
  })

  it('stores a sent greeting and sign-off as written', async () => {
    const res = await POST(
      postRequest({ title: 'Brief', greeting: '  Liebe Frau Muster,', sign_off: 'Mit freundlichen Grüßen' }),
    )

    expect(res.status).toBe(201)
    expect(state.inserted).toMatchObject({ greeting: '  Liebe Frau Muster,', sign_off: 'Mit freundlichen Grüßen' })
  })
})

describe('POST /api/cover-letters - a blank letter (cover-letter-one-page, US-002)', () => {
  beforeEach(() => {
    state.inserted = null
    generateCompletion.mockReset()
    countCoverLetterPages.mockReset()
  })

  it('is created blank, with no AI call and no one-page check', async () => {
    const res = await POST(postRequest({ title: 'Lettre' }))

    expect(res.status).toBe(201)
    expect(state.inserted).toMatchObject({ greeting: '', sign_off: '' })
    expect(state.inserted?.opening_paragraph ?? null).toBeNull()
    expect(generateCompletion).not.toHaveBeenCalled()
    expect(countCoverLetterPages).not.toHaveBeenCalled()
  })
})
