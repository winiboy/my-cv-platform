import { defaultLocale, toLocale, type Locale } from '@/lib/i18n'
import { detectOfferLanguage } from '@/lib/resume-from-job/detect-offer-language'

/**
 * The language a cover letter's date line, subject line and default greeting
 * and sign-off are printed in (PRD
 * `tasks/prds/cover-letter-template-language.md`, FR-1 and FR-2).
 *
 * No column stores a letter's language, so it is detected from the letter's
 * own paragraphs, with the page's language as the fallback: a German letter
 * opened under `/fr` still gets a German date and subject.
 *
 * Imports nothing server-only, so the editor preview can use the same rules
 * as the PDF and Word exports.
 */
export type CoverLetterLanguage = Locale

export interface CoverLetterWording {
  /** `Intl.DateTimeFormat` locale of the date line. */
  dateLocale: string
  /** The subject line, from the letter's job title. */
  subject: (jobTitle: string) => string
  /** Printed when the letter has no greeting. */
  defaultGreeting: string
  /** Printed when the letter has no sign-off. */
  defaultSignOff: string
}

/**
 * Each language's business-letter wording. The date locales are the
 * languages' main-country ones (fr-FR, de-DE, it-IT): for a long date they
 * print the same as the Swiss variants, and do not depend on a regional
 * convention the letter's reader may not share. English stays en-US, the
 * format every letter export has printed so far.
 */
export const COVER_LETTER_WORDING: Readonly<Record<CoverLetterLanguage, CoverLetterWording>> = Object.freeze({
  en: {
    dateLocale: 'en-US',
    subject: (jobTitle: string) => `Re: Application for ${jobTitle}`,
    defaultGreeting: 'Dear Hiring Manager,',
    defaultSignOff: 'Sincerely,',
  },
  fr: {
    dateLocale: 'fr-FR',
    subject: (jobTitle: string) => `Objet : Candidature au poste de ${jobTitle}`,
    defaultGreeting: 'Madame, Monsieur,',
    defaultSignOff: 'Veuillez agréer mes salutations distinguées,',
  },
  de: {
    dateLocale: 'de-DE',
    subject: (jobTitle: string) => `Betreff: Bewerbung als ${jobTitle}`,
    defaultGreeting: 'Sehr geehrte Damen und Herren,',
    defaultSignOff: 'Mit freundlichen Grüßen,',
  },
  it: {
    dateLocale: 'it-IT',
    subject: (jobTitle: string) => `Oggetto: Candidatura per la posizione di ${jobTitle}`,
    defaultGreeting: 'Gentili Signore e Signori,',
    defaultSignOff: 'Cordiali saluti,',
  },
})

/**
 * The page language an export request names in its JSON body's `locale`.
 * Untrusted, so only one of the app's locales is taken as is; anything else,
 * or no `locale`, is the app's `defaultLocale`, as for a route segment
 * (`toLocale`). It only chooses wording, never what is read or who may read it.
 */
export function coverLetterRequestLanguage(body: unknown): CoverLetterLanguage {
  const locale = typeof body === 'object' && body !== null ? (body as { locale?: unknown }).locale : undefined
  return typeof locale === 'string' ? toLocale(locale) : defaultLocale
}

/**
 * The date line in the letter's language, long month, e.g. "November 2, 2026"
 * or "2. November 2026". In the runtime's time zone, as the date line has
 * always been formatted.
 */
export function formatCoverLetterDate(date: Date, language: CoverLetterLanguage): string {
  return new Intl.DateTimeFormat(COVER_LETTER_WORDING[language].dateLocale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

/**
 * A rich-text paragraph's words, its markup and entities replaced by spaces so
 * neither tag names nor `&nbsp;` vote for a language. `[^<>]` keeps the scan
 * linear even on a stray `<` with no closing `>`.
 */
function richTextWords(html: string): string {
  return html.replace(/<[^<>]*>/g, ' ').replace(/&[#\w]{1,32};/g, ' ')
}

/**
 * The display language of a letter whose paragraphs (opening, body, closing,
 * as stored rich text) are given: the language detected from their text, or
 * `fallback`, the page's language, when it cannot be told.
 */
export function resolveCoverLetterLanguage(
  paragraphsHtml: readonly string[],
  fallback: CoverLetterLanguage,
): CoverLetterLanguage {
  return detectOfferLanguage(paragraphsHtml.map(richTextWords).join(' ')) ?? fallback
}
