import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoverLetterTranslationPrompt, buildTranslationPrompt, TRANSLATION_LANGUAGES } from './prompts'

/**
 * The cover-letter translation core (cover-letter-export-translate, US-003,
 * FR-5): the prompt shares the summary translation's language table, the
 * request uses its model settings, and only one translation per segment is
 * accepted back.
 */

const generateCompletion = vi.fn<(prompt: string, options: unknown) => Promise<{ text: string }>>()

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  generateCompletion: (prompt: string, options: unknown) => generateCompletion(prompt, options),
}))

const {
  COVER_LETTER_TRANSLATION_COMPLETION_OPTIONS,
  CoverLetterTranslationReplyError,
  toSegmentTranslations,
  translateCoverLetterSegments,
} = await import('./cover-letter-translation')

const SEGMENTS = ['Madame, Monsieur,', 'Je postule avec <b>conviction</b> &amp; envie.']

beforeEach(() => {
  generateCompletion.mockReset()
})

describe('buildCoverLetterTranslationPrompt', () => {
  it('names the target language from the translation table and carries the segments as a JSON array', () => {
    const prompt = buildCoverLetterTranslationPrompt({ segments: SEGMENTS, targetLanguage: 'de' })
    expect(prompt).toContain('to German.')
    expect(prompt).toContain('Use professional German business language.')
    expect(prompt).toContain(JSON.stringify(SEGMENTS))
    expect(prompt).toContain('Return exactly 2 translations')
  })

  it('shares its languages with the summary translation, whose prompt is unchanged', () => {
    expect(TRANSLATION_LANGUAGES).toEqual(['fr', 'de', 'en', 'it'])
    const summary = buildTranslationPrompt({ summary: 'Résumé.', targetLanguage: 'it' })
    expect(summary).toContain('Translate the following resume summary to Italian.')
    expect(summary).toContain('Use professional Italian business language. Maintain formal tone.')
    expect(summary).toContain('**Translated Summary (Italian):**')
  })
})

describe('toSegmentTranslations', () => {
  it('accepts exactly one string per segment', () => {
    expect(toSegmentTranslations({ translations: ['a', 'b'] }, 2)).toEqual(['a', 'b'])
  })

  it.each([
    ['not an object', 'a'],
    ['an array', ['a', 'b']],
    ['null', null],
    ['no translations', { text: ['a', 'b'] }],
    ['too few', { translations: ['a'] }],
    ['too many', { translations: ['a', 'b', 'c'] }],
    ['a non-string', { translations: ['a', 2] }],
  ])('refuses %s', (_label, reply) => {
    expect(() => toSegmentTranslations(reply, 2)).toThrow(CoverLetterTranslationReplyError)
  })
})

describe('translateCoverLetterSegments', () => {
  it("uses the summary translation's model and temperature, and reads a fenced JSON reply", async () => {
    generateCompletion.mockResolvedValueOnce({
      text: '```json\n{"translations": ["Sehr geehrte Damen und Herren,", "Ich bewerbe mich mit <b>Überzeugung</b>."]}\n```',
    })

    await expect(translateCoverLetterSegments({ segments: SEGMENTS, targetLanguage: 'de' })).resolves.toEqual([
      'Sehr geehrte Damen und Herren,',
      'Ich bewerbe mich mit <b>Überzeugung</b>.',
    ])
    expect(COVER_LETTER_TRANSLATION_COMPLETION_OPTIONS.temperature).toBe(0.3)
    expect(generateCompletion).toHaveBeenCalledWith(
      buildCoverLetterTranslationPrompt({ segments: SEGMENTS, targetLanguage: 'de' }),
      { ...COVER_LETTER_TRANSLATION_COMPLETION_OPTIONS, operation: 'translateCoverLetter' }
    )
  })

  it('refuses a reply that is not JSON or does not translate every segment', async () => {
    generateCompletion.mockResolvedValueOnce({ text: 'Sehr geehrte Damen und Herren,' })
    await expect(translateCoverLetterSegments({ segments: SEGMENTS, targetLanguage: 'de' })).rejects.toBeInstanceOf(
      CoverLetterTranslationReplyError
    )

    generateCompletion.mockResolvedValueOnce({ text: '{"translations": ["Nur eins"]}' })
    await expect(translateCoverLetterSegments({ segments: SEGMENTS, targetLanguage: 'de' })).rejects.toBeInstanceOf(
      CoverLetterTranslationReplyError
    )
  })

  it('lets a provider failure through to the caller', async () => {
    const failure = new Error('provider down')
    generateCompletion.mockRejectedValueOnce(failure)
    await expect(translateCoverLetterSegments({ segments: SEGMENTS, targetLanguage: 'fr' })).rejects.toBe(failure)
  })
})
