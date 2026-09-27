import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

/**
 * Unit coverage for `POST /api/tools/review-resume`, the largest of the five
 * public AI tools.
 *
 * What these tests are for: proving that the guards added for finding H3 stop a
 * request *before* it can spend the project's Groq account, and that they leave
 * an ordinary review untouched. The provider client is the assertion subject —
 * "rejected with 400" would be worth little without "and the provider was never
 * called", since the whole impact of the finding is provider spend.
 *
 * The rate limiter is mocked rather than exercised here: its own behaviour is
 * covered in `src/lib/api/rate-limit.test.ts`, and its real implementation
 * reaches a database. What this file asserts about it is the route's side of the
 * contract — that a refusal is returned as-is, before the body is read.
 */

const generateCompletion = vi.fn()
const enforceAiRateLimit = vi.fn<
  (request: NextRequest, caller: unknown) => Promise<NextResponse | null>
>(async () => null)

vi.mock('@/lib/ai/client', () => ({
  generateCompletion: (...args: unknown[]) => generateCompletion(...args),
  MODELS: { FAST: 'test-fast', BALANCED: 'test-balanced', QUALITY: 'test-quality' },
}))

vi.mock('@/lib/api/ai-rate-limit', () => ({
  ANONYMOUS_AI_CALLER: { kind: 'anonymous' },
  enforceAiRateLimit: (request: NextRequest, caller: unknown) =>
    enforceAiRateLimit(request, caller),
}))

const { POST } = await import('./route')

/** A well-formed analysis, so a passing request reaches a 200 for the right reason. */
const ANALYSIS = {
  overallScore: 72,
  categories: [
    { name: 'Impact', score: 70, feedback: ['Quantify more outcomes'] },
    { name: 'Brevity', score: 75, feedback: ['Tighten the third bullet'] },
    { name: 'Style', score: 80, feedback: ['Consistent tenses'] },
    { name: 'Sections', score: 65, feedback: ['Add a summary'] },
    { name: 'Skills', score: 70, feedback: ['List the tooling'] },
  ],
  suggestions: ['Quantify outcomes', 'Add a summary'],
  analyzedAt: '2026-09-27T00:00:00.000Z',
}

/** Long enough to clear the 100-character minimum, nothing like the ceiling. */
const REALISTIC_RESUME = 'Senior software engineer with ten years of experience. '.repeat(40)

function reviewRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/tools/review-resume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/tools/review-resume', () => {
  it('reviews an ordinary resume exactly as before', async () => {
    generateCompletion.mockResolvedValueOnce({
      text: JSON.stringify(ANALYSIS),
      usage: { total_tokens: 1200 },
    })

    const response = await POST(reviewRequest({ resumeText: REALISTIC_RESUME, locale: 'fr' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      overallScore: 72,
      suggestions: ANALYSIS.suggestions,
    })
    expect(generateCompletion).toHaveBeenCalledTimes(1)
  })

  it('refuses a resume over the ceiling without calling the provider', async () => {
    const response = await POST(
      reviewRequest({ resumeText: 'x'.repeat(30_001), locale: 'en' })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Validation failed',
      details: [{ field: 'resumeText', message: 'Resume text must be at most 30000 characters' }],
    })
    expect(generateCompletion).not.toHaveBeenCalled()
  })

  it('refuses a job description over the ceiling without calling the provider', async () => {
    const response = await POST(
      reviewRequest({
        resumeText: REALISTIC_RESUME,
        jobDescription: 'y'.repeat(15_001),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Validation failed' })
    expect(generateCompletion).not.toHaveBeenCalled()
  })

  it('still accepts a resume exactly at the ceiling', async () => {
    // The ceiling exists to bound cost, not to reject documents. A resume at the
    // limit is a legitimate request and must still be reviewed.
    generateCompletion.mockResolvedValueOnce({
      text: JSON.stringify(ANALYSIS),
      usage: { total_tokens: 4000 },
    })

    const response = await POST(reviewRequest({ resumeText: 'x'.repeat(30_000) }))

    expect(response.status).toBe(200)
    expect(generateCompletion).toHaveBeenCalledTimes(1)
  })

  it('returns the rate limiter refusal unchanged and never reaches the provider', async () => {
    enforceAiRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'Too many requests', retryAfter: 120 }, {
        status: 429,
        headers: { 'Retry-After': '120' },
      })
    )

    const response = await POST(reviewRequest({ resumeText: REALISTIC_RESUME }))

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('120')
    expect(generateCompletion).not.toHaveBeenCalled()
  })

  it('counts the request against an anonymous budget, not a user one', async () => {
    generateCompletion.mockResolvedValueOnce({
      text: JSON.stringify(ANALYSIS),
      usage: { total_tokens: 900 },
    })

    await POST(reviewRequest({ resumeText: REALISTIC_RESUME }))

    expect(enforceAiRateLimit).toHaveBeenCalledWith(expect.anything(), { kind: 'anonymous' })
  })
})
