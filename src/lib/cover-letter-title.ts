import type { CoverLetter } from '@/types/database'
import type { CoverLetterLanguage } from './cover-letter-language'
import { coverLetterLanguage } from './cover-letter-pdf-html'

/**
 * A cover letter's default title, one pattern per letter language (PRD
 * `tasks/prds/cover-letter-preview-and-card-language.md`, FR-5).
 *
 * These are code constants, not dictionary strings: the pattern follows the
 * language the LETTER is written in, which is independent of the page's
 * locale, exactly like `COVER_LETTER_WORDING`.
 */
export const COVER_LETTER_DEFAULT_TITLES: Readonly<
  Record<CoverLetterLanguage, (jobTitle: string, company: string) => string>
> = Object.freeze({
  en: (jobTitle: string, company: string) => `Cover Letter - ${jobTitle} at ${company}`,
  fr: (jobTitle: string, company: string) => `Lettre de motivation - ${jobTitle} chez ${company}`,
  de: (jobTitle: string, company: string) => `Anschreiben - ${jobTitle} bei ${company}`,
  it: (jobTitle: string, company: string) => `Lettera di presentazione - ${jobTitle} presso ${company}`,
})

/** The languages tried, in a fixed order, so a match is deterministic. */
const TITLE_LANGUAGES: readonly CoverLetterLanguage[] = ['en', 'fr', 'de', 'it']

/** The translate route's suffix, e.g. ` (DE)` (`translatedTitle`). */
const TRANSLATION_SUFFIX = /^([\s\S]*) \((EN|FR|DE|IT)\)$/

/** The default title of a letter in `language`, from its job title and company. */
export function buildDefaultCoverLetterTitle(
  language: CoverLetterLanguage,
  jobTitle: string,
  company: string,
): string {
  return COVER_LETTER_DEFAULT_TITLES[language](jobTitle, company)
}

export interface DefaultCoverLetterTitleMatch {
  /** The language of the pattern the title is written in. */
  language: CoverLetterLanguage
  /** The language of the ` (XX)` translation suffix, or null when there is none. */
  suffix: CoverLetterLanguage | null
}

/**
 * Whether `title` is a default title of the letter whose job title and company
 * are given (FR-6), and in which language.
 *
 * The comparison is strict and deterministic: the title must EQUAL one of the
 * FR-5 patterns built from the letter's own job title and company, exactly as
 * stored - same case, same whitespace, nothing trimmed - optionally followed
 * by exactly one ` (EN|FR|DE|IT)` suffix (one space, upper case). Both the job
 * title and the company must hold a non-blank value. Anything else is a title
 * the user wrote, and returns null so it is never rewritten.
 */
export function matchDefaultCoverLetterTitle(
  title: string,
  jobTitle: string | null | undefined,
  company: string | null | undefined,
): DefaultCoverLetterTitleMatch | null {
  if (!jobTitle?.trim() || !company?.trim()) return null

  const suffixed = TRANSLATION_SUFFIX.exec(title)
  const candidates: ReadonlyArray<{ base: string; suffix: CoverLetterLanguage | null }> = suffixed
    ? [
        { base: title, suffix: null },
        { base: suffixed[1], suffix: suffixed[2].toLowerCase() as CoverLetterLanguage },
      ]
    : [{ base: title, suffix: null }]

  for (const { base, suffix } of candidates) {
    for (const language of TITLE_LANGUAGES) {
      if (base === buildDefaultCoverLetterTitle(language, jobTitle, company)) {
        return { language, suffix }
      }
    }
  }
  return null
}

/** The fields a card's displayed title is derived from. */
export type CoverLetterTitleFields = Pick<
  CoverLetter,
  'title' | 'job_title' | 'company_name' | 'opening_paragraph' | 'body_paragraphs' | 'closing_paragraph'
>

/**
 * The title a cover-letter card shows. A default title (FR-6) is shown in the
 * letter's language, without any translation suffix; the language is
 * `coverLetterLanguage`, the same resolver the PDF and Word exports and the
 * editor preview use, with the page's locale as the fallback. Any other title
 * is returned exactly as stored. Display only: nothing is written back.
 */
export function displayCoverLetterTitle(
  letter: CoverLetterTitleFields,
  fallbackLocale: CoverLetterLanguage,
): string {
  const { title, job_title: jobTitle, company_name: company } = letter
  if (!jobTitle || !company) return title
  // Language detection runs only for a default title; a user title needs none.
  if (!matchDefaultCoverLetterTitle(title, jobTitle, company)) return title
  return buildDefaultCoverLetterTitle(coverLetterLanguage(letter, fallbackLocale), jobTitle, company)
}
