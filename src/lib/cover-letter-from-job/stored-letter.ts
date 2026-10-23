import { AI_LIST_LIMITS, AI_TEXT_LIMITS } from '@/lib/api/ai-input-limits'
import type { CoverLetterResumeProfile, GeneratedCoverLetter } from '@/lib/ai/cover-letter-generation'
import { escapeHtml } from '@/lib/escape-html'
import { sanitizeUntrustedPlainText } from '@/lib/resume-from-job/untrusted-text'

/**
 * Turning untrusted input into what a letter created from a job application
 * sends to the AI and stores (PRD `tasks/prds/cover-letter-from-job.md`, FR-4).
 */

/** The letter columns the AI fills, ready to insert. */
export interface StoredCoverLetterContent {
  greeting: string
  opening_paragraph: string
  body_paragraphs: string[]
  closing_paragraph: string
  sign_off: string
}

/**
 * A paragraph as the cover-letter editor stores it: rich-text HTML, which the
 * editor, the templates and the PDF export all render as HTML. The AI's text is
 * reduced to plain text first, then escaped, so the stored markup is exactly one
 * `<p>` written here and nothing from the reply can become an element.
 */
function toParagraphHtml(text: unknown): string {
  const plain = sanitizeUntrustedPlainText(text, AI_TEXT_LIMITS.COVER_LETTER_PARAGRAPH)
  return plain ? `<p>${escapeHtml(plain)}</p>` : ''
}

/**
 * The AI's letter, sanitized and bounded for storage, or `null` when any part
 * the letter needs is empty once sanitized: a greeting, an opening, at least
 * one body paragraph, a closing and a sign-off.
 *
 * Greeting and sign-off are plain-text columns, escaped wherever they are
 * rendered, so they are stored as plain text.
 */
export function toStoredCoverLetterContent(letter: GeneratedCoverLetter): StoredCoverLetterContent | null {
  const content: StoredCoverLetterContent = {
    greeting: sanitizeUntrustedPlainText(letter.greeting, AI_TEXT_LIMITS.SHORT_LABEL),
    opening_paragraph: toParagraphHtml(letter.openingParagraph),
    body_paragraphs: letter.bodyParagraphs
      .slice(0, AI_LIST_LIMITS.COVER_LETTER_PARAGRAPHS)
      .map(toParagraphHtml)
      .filter((paragraph) => paragraph !== ''),
    closing_paragraph: toParagraphHtml(letter.closingParagraph),
    sign_off: sanitizeUntrustedPlainText(letter.signOff, AI_TEXT_LIMITS.SHORT_LABEL),
  }

  const complete =
    content.greeting !== '' &&
    content.opening_paragraph !== '' &&
    content.body_paragraphs.length > 0 &&
    content.closing_paragraph !== '' &&
    content.sign_off !== ''
  return complete ? content : null
}

function cut(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

/**
 * A CV profile with every field the prompt carries bounded by the AI input
 * limits. The profile is read from the caller's own stored CV, whose fields
 * the editor does not cap, so one oversized CV cannot inflate the prompt.
 */
export function boundCoverLetterResumeProfile(profile: CoverLetterResumeProfile): CoverLetterResumeProfile {
  return {
    resumeSummary: profile.resumeSummary ? cut(profile.resumeSummary, AI_TEXT_LIMITS.SUMMARY) : undefined,
    resumeExperience: profile.resumeExperience?.map((experience) => ({
      position: cut(experience.position, AI_TEXT_LIMITS.SHORT_LABEL),
      company: cut(experience.company, AI_TEXT_LIMITS.SHORT_LABEL),
      description: typeof experience.description === 'string'
        ? cut(experience.description, AI_TEXT_LIMITS.DESCRIPTION)
        : undefined,
    })),
    resumeSkills: profile.resumeSkills
      ?.filter((skill): skill is string => typeof skill === 'string')
      .slice(0, AI_LIST_LIMITS.SKILLS)
      .map((skill) => cut(skill, AI_TEXT_LIMITS.SKILL)),
  }
}
