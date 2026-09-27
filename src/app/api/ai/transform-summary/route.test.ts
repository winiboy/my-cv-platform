import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

/**
 * Unit coverage for `POST /api/ai/transform-summary`, standing in for the
 * authenticated `/api/ai/*` family.
 *
 * These routes validate imperatively rather than with a schema, so their
 * ceilings go through `findOversizedField` instead of `.max()`. That is the path
 * this file covers: the same two properties as the public tools — over the
 * ceiling is refused before the provider is reached, and a normal request is
 * unaffected — plus the one thing that differs, that the budget is keyed by the
 * authenticated user rather than by address.
 */

const transformSummary = vi.fn()
const getUser = vi.fn()
const enforceAiRateLimit = vi.fn<
  (request: NextRequest, caller: unknown) => Promise<NextResponse | null>
>(async () => null)

const USER_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('@/lib/ai/transformations', () => ({
  transformSummary: (...args: unknown[]) => transformSummary(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: () => getUser() } }),
}))

vi.mock('@/lib/api/ai-rate-limit', () => ({
  enforceAiRateLimit: (request: NextRequest, caller: unknown) =>
    enforceAiRateLimit(request, caller),
}))

const { POST } = await import('./route')

function transformRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/ai/transform-summary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function signedIn(): void {
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
}

describe('POST /api/ai/transform-summary', () => {
  it('transforms an ordinary summary exactly as before', async () => {
    signedIn()
    transformSummary.mockResolvedValueOnce({
      transformedSummary: 'Polished summary.',
      wordCount: 2,
      tokensUsed: 120,
    })

    const response = await POST(
      transformRequest({
        rawSummary: 'ten years building web apps, looking for a senior role',
        currentRole: 'Senior Engineer',
        yearsOfExperience: 10,
        topSkills: ['TypeScript', 'PostgreSQL'],
        locale: 'en',
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      transformedSummary: 'Polished summary.',
    })
    expect(transformSummary).toHaveBeenCalledTimes(1)
  })

  it('refuses a summary over the ceiling without calling the provider', async () => {
    signedIn()

    const response = await POST(transformRequest({ rawSummary: 'x'.repeat(5_001) }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'rawSummary must be at most 5000 characters (received 5001)',
    })
    expect(transformSummary).not.toHaveBeenCalled()
  })

  it('refuses an oversized skills list without calling the provider', async () => {
    signedIn()

    const response = await POST(
      transformRequest({
        rawSummary: 'ten years building web apps',
        topSkills: Array.from({ length: 51 }, () => 'TypeScript'),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'topSkills must be at most 50 entries (received 51)',
    })
    expect(transformSummary).not.toHaveBeenCalled()
  })

  it('bounds a numeric field that arrives as a string', async () => {
    signedIn()

    // yearsOfExperience is declared as a number in the prompt builder, which is
    // a compile-time claim about an untrusted parsed body. A string sent there
    // is interpolated into the prompt like any other value.
    const response = await POST(
      transformRequest({
        rawSummary: 'ten years building web apps',
        yearsOfExperience: 'z'.repeat(201),
      })
    )

    expect(response.status).toBe(400)
    expect(transformSummary).not.toHaveBeenCalled()
  })

  it('counts the request against the authenticated user budget', async () => {
    signedIn()
    transformSummary.mockResolvedValueOnce({
      transformedSummary: 'Polished summary.',
      wordCount: 2,
      tokensUsed: 120,
    })

    await POST(transformRequest({ rawSummary: 'ten years building web apps' }))

    expect(enforceAiRateLimit).toHaveBeenCalledWith(expect.anything(), {
      kind: 'user',
      userId: USER_ID,
    })
  })

  it('returns the rate limiter refusal unchanged and never reaches the provider', async () => {
    signedIn()
    enforceAiRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    )

    const response = await POST(transformRequest({ rawSummary: 'ten years building web apps' }))

    expect(response.status).toBe(429)
    expect(transformSummary).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller before counting a budget', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await POST(transformRequest({ rawSummary: 'ten years building web apps' }))

    expect(response.status).toBe(401)
    // The budget is keyed by user id, so there is nothing to count until the
    // identity is known.
    expect(enforceAiRateLimit).not.toHaveBeenCalled()
    expect(transformSummary).not.toHaveBeenCalled()
  })
})
