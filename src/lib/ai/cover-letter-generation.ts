import { generateCompletion, MODELS } from './client'
import { buildCoverLetterGenerationPrompt, type CoverLetterGenerationInput } from './prompts'

/**
 * Cover-letter generation shared by the editor's generation modal
 * (`POST /api/ai/generate-cover-letter`) and the letter created from a job
 * application (`POST /api/cover-letters/from-job-application`).
 *
 * Both send the same prompt (`buildCoverLetterGenerationPrompt`), with the same
 * model settings, and read the same JSON reply shape.
 */

/** The model settings both callers use. 1500 tokens fits a 250-400 word letter in JSON. */
export const COVER_LETTER_COMPLETION_OPTIONS = {
  model: MODELS.BALANCED,
  temperature: 0.7,
  maxTokens: 1500,
} as const

/** The resume columns a cover-letter prompt reads. */
export interface CoverLetterResumeRow {
  summary: string | null
  experience: unknown
  skills: unknown
}

/** The candidate part of `CoverLetterGenerationInput`. */
export type CoverLetterResumeProfile = Pick<
  CoverLetterGenerationInput,
  'resumeSummary' | 'resumeExperience' | 'resumeSkills'
>

/**
 * The candidate profile a resume contributes to the prompt: its summary, its
 * first three experiences and every skill of every category.
 */
export function coverLetterProfileFromResume(resume: CoverLetterResumeRow): CoverLetterResumeProfile {
  const profile: CoverLetterResumeProfile = { resumeSummary: resume.summary || undefined }

  const experience = resume.experience as { position: string; company: string; description?: string }[] | null
  if (Array.isArray(experience)) {
    profile.resumeExperience = experience.slice(0, 3).map((exp) => ({
      position: exp.position,
      company: exp.company,
      description: exp.description,
    }))
  }

  const skills = resume.skills as { items?: string[]; skillsHtml?: string }[] | null
  if (Array.isArray(skills)) {
    profile.resumeSkills = skills.flatMap((cat) => cat.items || [])
  }

  return profile
}

/**
 * The JSON value in an AI reply, with or without a Markdown code fence.
 *
 * @throws SyntaxError when the reply holds no JSON.
 */
export function parseCoverLetterJson(replyText: string): unknown {
  const text = replyText.trim()
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const jsonText = jsonMatch ? jsonMatch[1] : text
  return JSON.parse(jsonText)
}

/** A letter as the AI wrote it. Untrusted text: the caller sanitizes it before storage. */
export interface GeneratedCoverLetter {
  greeting: string
  openingParagraph: string
  bodyParagraphs: string[]
  closingParagraph: string
  signOff: string
}

/** The AI answered, but not with a letter in the requested shape. */
export class CoverLetterReplyError extends Error {
  constructor() {
    super('The AI reply is not a cover letter')
    this.name = 'CoverLetterReplyError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The letter in a parsed reply, keeping only string fields and string body
 * paragraphs. Emptiness is judged by the caller, after sanitizing.
 *
 * @throws CoverLetterReplyError when the reply is not an object.
 */
export function toGeneratedCoverLetter(reply: unknown): GeneratedCoverLetter {
  if (!isRecord(reply)) throw new CoverLetterReplyError()
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  return {
    greeting: text(reply.greeting),
    openingParagraph: text(reply.openingParagraph),
    bodyParagraphs: Array.isArray(reply.bodyParagraphs)
      ? reply.bodyParagraphs.filter((paragraph): paragraph is string => typeof paragraph === 'string')
      : [],
    closingParagraph: text(reply.closingParagraph),
    signOff: text(reply.signOff),
  }
}

/** Writes a letter with the AI provider. */
export type CoverLetterGenerator = (input: CoverLetterGenerationInput) => Promise<GeneratedCoverLetter>

/**
 * The real generator: the shared prompt, the shared model settings, the shared
 * reply parsing. Never logs the reply: it is derived from the offer and the CV.
 *
 * @throws AiCompletionError when the provider fails or rate-limits.
 * @throws CoverLetterReplyError when the reply is not a JSON letter.
 */
export const generateCoverLetter: CoverLetterGenerator = async (input) => {
  const result = await generateCompletion(buildCoverLetterGenerationPrompt(input), {
    ...COVER_LETTER_COMPLETION_OPTIONS,
    operation: 'generateCoverLetterFromJobApplication',
  })

  let reply: unknown
  try {
    reply = parseCoverLetterJson(result.text)
  } catch {
    throw new CoverLetterReplyError()
  }
  return toGeneratedCoverLetter(reply)
}
