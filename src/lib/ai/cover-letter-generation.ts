import { generateCompletion, MODELS } from './client'
import {
  buildCoverLetterGenerationPrompt,
  buildCoverLetterShorteningPrompt,
  type CoverLetterGenerationInput,
  type CoverLetterParts,
  type CoverLetterShorteningInput,
} from './prompts'

/**
 * Cover-letter generation shared by the editor's generation modal
 * (`POST /api/ai/generate-cover-letter`) and the letter created from a job
 * application (`POST /api/cover-letters/from-job-application`).
 *
 * Both send the same prompt (`buildCoverLetterGenerationPrompt`), with the same
 * model settings, and read the same JSON reply shape. Both may ask once for a
 * shorter version of the letter the AI just wrote (`shortenCoverLetter`), read
 * the same way (cover-letter-one-page, US-002).
 */

/** The model settings both callers use. 1500 tokens fits a one-page letter in JSON, with room to spare. */
export const COVER_LETTER_COMPLETION_OPTIONS = {
  model: MODELS.BALANCED,
  temperature: 0.7,
  maxTokens: 1500,
} as const

/**
 * Extra output tokens when the prompt also asks for the company's address
 * (`askCompanyAddress`): its JSON object comes after the letter, so without
 * room for it a long letter would be cut and the reply would not parse.
 */
export const COMPANY_ADDRESS_MAX_TOKENS_MARGIN = 200
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

/**
 * The hiring company's address as the AI read it from the job description,
 * when the prompt asked for it (`askCompanyAddress`). Only string parts are
 * kept. Untrusted and possibly invented: the caller checks it against the
 * offer's text before using it.
 */
export interface GeneratedCompanyAddress {
  streetAddress?: string
  postalCode?: string
  addressLocality?: string
  addressCountry?: string
}

/** A letter as the AI wrote it. Untrusted text: the caller sanitizes it before storage. */
export interface GeneratedCoverLetter {
  greeting: string
  openingParagraph: string
  bodyParagraphs: string[]
  closingParagraph: string
  signOff: string
  /** Present only when the reply has an address object with at least one string part. */
  companyAddress?: GeneratedCompanyAddress
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

const COMPANY_ADDRESS_PARTS = ['streetAddress', 'postalCode', 'addressLocality', 'addressCountry'] as const

/**
 * The string parts of a reply's `companyAddress`, or `undefined` when it is
 * missing, not an object or has none. Never throws: an address is optional,
 * and a malformed one must not turn a good letter into an error.
 */
function companyAddressOf(value: unknown): GeneratedCompanyAddress | undefined {
  if (!isRecord(value)) return undefined
  const address: GeneratedCompanyAddress = {}
  for (const part of COMPANY_ADDRESS_PARTS) {
    const partValue = value[part]
    if (typeof partValue === 'string') address[part] = partValue
  }
  return Object.keys(address).length > 0 ? address : undefined
}

/**
 * The letter in a parsed reply, keeping only string fields and string body
 * paragraphs, and the string parts of a `companyAddress` when there is one.
 * Emptiness is judged by the caller, after sanitizing.
 *
 * @throws CoverLetterReplyError when the reply is not an object.
 */
export function toGeneratedCoverLetter(reply: unknown): GeneratedCoverLetter {
  if (!isRecord(reply)) throw new CoverLetterReplyError()
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  const companyAddress = companyAddressOf(reply.companyAddress)
  return {
    greeting: text(reply.greeting),
    openingParagraph: text(reply.openingParagraph),
    bodyParagraphs: Array.isArray(reply.bodyParagraphs)
      ? reply.bodyParagraphs.filter((paragraph): paragraph is string => typeof paragraph === 'string')
      : [],
    closingParagraph: text(reply.closingParagraph),
    signOff: text(reply.signOff),
    ...(companyAddress ? { companyAddress } : {}),
  }
}

/** How a caller's AI calls are named in the provider client's monitoring. */
export interface CoverLetterCallOptions {
  operation?: string
}

/** Writes a letter with the AI provider. */
export type CoverLetterGenerator = (
  input: CoverLetterGenerationInput,
  options?: CoverLetterCallOptions,
) => Promise<GeneratedCoverLetter>

/** The letter in a reply's text, read the one way both prompts' replies are read. */
function generatedCoverLetterFromReply(replyText: string): GeneratedCoverLetter {
  let reply: unknown
  try {
    reply = parseCoverLetterJson(replyText)
  } catch {
    throw new CoverLetterReplyError()
  }
  return toGeneratedCoverLetter(reply)
}

/**
 * The real generator: the shared prompt, the shared model settings, the shared
 * reply parsing. Never logs the reply: it is derived from the offer and the CV.
 *
 * @throws AiCompletionError when the provider fails or rate-limits.
 * @throws CoverLetterReplyError when the reply is not a JSON letter.
 */
export const generateCoverLetter: CoverLetterGenerator = async (input, options = {}) => {
  const result = await generateCompletion(buildCoverLetterGenerationPrompt(input), {
    ...COVER_LETTER_COMPLETION_OPTIONS,
    ...(input.askCompanyAddress
      ? { maxTokens: COVER_LETTER_COMPLETION_OPTIONS.maxTokens + COMPANY_ADDRESS_MAX_TOKENS_MARGIN }
      : {}),
    operation: options.operation ?? 'generateCoverLetterFromJobApplication',
  })
  return generatedCoverLetterFromReply(result.text)
}

/** The shortening call's limits: it must be over before the request's own deadline. */
export interface CoverLetterShorteningOptions {
  /** The longest the call may take, the provider's answer included. */
  timeoutMs: number
}

/**
 * Asks for a shorter version of a letter the AI just wrote (cover-letter-one-page,
 * US-002). Only ever given the AI's own letter, never a user's text.
 */
export type CoverLetterShortener = (
  input: CoverLetterShorteningInput,
  options: CoverLetterShorteningOptions,
) => Promise<GeneratedCoverLetter>

/**
 * The real shortener: the shortening prompt, the generation's model settings,
 * and the generation's reply parsing, so the shorter letter is read, cleaned
 * and bounded exactly as the first. One attempt, within `timeoutMs`: no SDK
 * retry, which could outlast the request.
 *
 * The greeting and the sign-off are the first letter's, as the prompt asks:
 * taken from it here rather than from the reply, so they are the same whatever
 * the AI answers. Any `companyAddress` in the reply is dropped: the address
 * belongs to the first reply. Never logs the reply.
 *
 * @throws AiCompletionError when the provider fails, rate-limits or times out.
 * @throws CoverLetterReplyError when the reply is not a JSON letter.
 */
export const shortenCoverLetter: CoverLetterShortener = async (input, options) => {
  const result = await generateCompletion(
    buildCoverLetterShorteningPrompt(input),
    { ...COVER_LETTER_COMPLETION_OPTIONS, operation: 'shortenCoverLetter' },
    { timeoutMs: options.timeoutMs, maxRetries: 0 },
  )
  const shortened = generatedCoverLetterFromReply(result.text)
  return {
    greeting: input.letter.greeting,
    openingParagraph: shortened.openingParagraph,
    bodyParagraphs: shortened.bodyParagraphs,
    closingParagraph: shortened.closingParagraph,
    signOff: input.letter.signOff,
  }
}

/**
 * The letter's own text, and nothing else: what the shortening call is given
 * (FR-7). The company address read from the offer is not part of it.
 */
export function coverLetterPartsOf(letter: GeneratedCoverLetter): CoverLetterParts {
  return {
    greeting: letter.greeting,
    openingParagraph: letter.openingParagraph,
    bodyParagraphs: [...letter.bodyParagraphs],
    closingParagraph: letter.closingParagraph,
    signOff: letter.signOff,
  }
}

/**
 * Every part a letter needs has text: a greeting, an opening, at least one
 * body paragraph, a closing and a sign-off. Whitespace is no text.
 */
export function isCompleteGeneratedCoverLetter(letter: GeneratedCoverLetter): boolean {
  const hasText = (value: string) => value.trim() !== ''
  return (
    hasText(letter.greeting) &&
    hasText(letter.openingParagraph) &&
    letter.bodyParagraphs.some(hasText) &&
    hasText(letter.closingParagraph) &&
    hasText(letter.signOff)
  )
}
