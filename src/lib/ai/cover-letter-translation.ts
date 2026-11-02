import { generateCompletion, MODELS } from './client'
import { parseCoverLetterJson } from './cover-letter-generation'
import { buildCoverLetterTranslationPrompt, type CoverLetterTranslationInput } from './prompts'

/**
 * Translating a cover letter's text with the AI provider
 * (cover-letter-export-translate, US-003, FR-5).
 *
 * The core of the existing translation path (`POST /api/ai/translate`,
 * `translateSummary`): the same language table and tone rules
 * (`buildCoverLetterTranslationPrompt` shares them with
 * `buildTranslationPrompt`), the same model and the same low temperature. What
 * differs is the unit: a letter is translated as one request of ordered
 * segments, so its parts are translated in context and cost one AI call, and
 * the reply is matched back to them one to one.
 */

/**
 * The completion settings. 0.3 and the balanced model are `translateSummary`'s.
 * 6,000 tokens covers the largest accepted input
 * (`COVER_LETTER_TRANSLATION_LIMITS` in the translate route) in a longer
 * target language, JSON-escaped.
 */
export const COVER_LETTER_TRANSLATION_COMPLETION_OPTIONS = {
  model: MODELS.BALANCED,
  temperature: 0.3,
  maxTokens: 6_000,
} as const

/** Translates a letter's segments. Untrusted output: the caller sanitizes it. */
export type CoverLetterTranslator = (input: CoverLetterTranslationInput) => Promise<string[]>

/** The AI answered, but not with one translation per segment. */
export class CoverLetterTranslationReplyError extends Error {
  constructor() {
    super('The AI reply is not a translation of every segment')
    this.name = 'CoverLetterTranslationReplyError'
  }
}

/**
 * The translations in a parsed reply: an object whose `translations` is an
 * array of exactly `expected` strings.
 *
 * @throws CoverLetterTranslationReplyError for any other shape.
 */
export function toSegmentTranslations(reply: unknown, expected: number): string[] {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    throw new CoverLetterTranslationReplyError()
  }
  const translations = (reply as Record<string, unknown>).translations
  if (
    !Array.isArray(translations) ||
    translations.length !== expected ||
    !translations.every((translation): translation is string => typeof translation === 'string')
  ) {
    throw new CoverLetterTranslationReplyError()
  }
  return translations
}

/**
 * The real translator. Never logs the reply or the prompt: both carry the
 * letter.
 *
 * @throws AiCompletionError when the provider fails or rate-limits.
 * @throws CoverLetterTranslationReplyError when the reply is not one translation per segment.
 */
export const translateCoverLetterSegments: CoverLetterTranslator = async (input) => {
  const result = await generateCompletion(buildCoverLetterTranslationPrompt(input), {
    ...COVER_LETTER_TRANSLATION_COMPLETION_OPTIONS,
    operation: 'translateCoverLetter',
  })

  let reply: unknown
  try {
    reply = parseCoverLetterJson(result.text)
  } catch {
    throw new CoverLetterTranslationReplyError()
  }
  return toSegmentTranslations(reply, input.segments.length)
}
