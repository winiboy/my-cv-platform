import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The output budget of `generateResumeFromJobDescription`: Job Search keeps its
 * 2000 tokens, and only a caller that passes `maxTokens` gets another one
 * (cv-from-job-complete, US-002).
 */

const generateCompletion = vi.fn()

vi.mock('./client', () => ({
  MODELS: { BALANCED: 'balanced-model' },
  generateCompletion: (...args: unknown[]) => generateCompletion(...args),
}))

const { generateResumeFromJobDescription } = await import('./transformations')

const REPLY = { text: '{"summary":"<p>x</p>","experience":[],"skills":[],"projects":[]}', usage: { total_tokens: 1 } }

beforeEach(() => {
  generateCompletion.mockReset()
  generateCompletion.mockResolvedValue(REPLY)
})

describe('generateResumeFromJobDescription', () => {
  it('keeps the 2000-token budget for existing callers', async () => {
    await generateResumeFromJobDescription({ jobDescription: 'An offer.', locale: 'en' })
    expect(generateCompletion).toHaveBeenCalledWith(expect.any(String), {
      model: 'balanced-model',
      temperature: 0.7,
      maxTokens: 2000,
    })
  })

  it('uses the budget a caller passes', async () => {
    await generateResumeFromJobDescription({ jobDescription: 'An offer.', targetJobTitle: 'Engineer' }, { maxTokens: 4000 })
    expect(generateCompletion).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxTokens: 4000 }))
  })
})
