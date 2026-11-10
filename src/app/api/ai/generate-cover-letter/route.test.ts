import { NextRequest, type NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The editor's Generate button (`POST /api/ai/generate-cover-letter`) shares
 * the cover-letter prompt with the letter created from a job application, which
 * may ask the AI for the company's address
 * (cover-letter-recipient-address-from-offer, US-002). This route must never
 * ask: its prompt stays the one it always sent, whatever the client posts.
 *
 * Only the session, the rate limit and the provider call are replaced; the
 * prompt is built by the real builder.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'

const generateCompletion = vi.fn<(prompt: string, options: unknown) => Promise<{ text: string }>>()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from() {
      throw new Error('no database read expected')
    },
  }),
}))
vi.mock('@/lib/ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/client')>()),
  generateCompletion: (prompt: string, options: unknown) => generateCompletion(prompt, options),
}))
vi.mock('@/lib/api/ai-rate-limit', () => ({
  enforceAiRateLimit: async (): Promise<NextResponse | null> => null,
}))

const { POST } = await import('./route')
const { buildCoverLetterGenerationPrompt } = await import('@/lib/ai/prompts')

const OFFER = 'Nous recherchons un ingénieur. Envoyez votre dossier à Rue du Lac 5, 1201 Genève.'

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ai/generate-cover-letter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  generateCompletion.mockReset()
  generateCompletion.mockResolvedValue({
    text: JSON.stringify({
      greeting: 'Madame, Monsieur,',
      openingParagraph: 'Ouverture.',
      bodyParagraphs: ['Corps.'],
      closingParagraph: 'Conclusion.',
      signOff: 'Salutations,',
    }),
  })
})

describe('POST /api/ai/generate-cover-letter - the company address', () => {
  it('never asks the AI for an address, even when the client posts the opt-in', async () => {
    const response = await POST(
      createRequest({
        jobDescription: OFFER,
        jobTitle: 'Ingénieur',
        companyName: 'Beispiel SA',
        locale: 'fr',
        askCompanyAddress: true,
      })
    )

    expect(response.status).toBe(200)
    expect(generateCompletion).toHaveBeenCalledTimes(1)
    const [prompt] = generateCompletion.mock.calls[0]
    expect(prompt).toBe(
      buildCoverLetterGenerationPrompt({
        jobDescription: OFFER,
        jobTitle: 'Ingénieur',
        companyName: 'Beispiel SA',
        locale: 'fr',
      })
    )
    expect(prompt).not.toContain('companyAddress')
  })
})
