import { defaultLocale, toLocale, type Locale } from '@/lib/i18n'
import { detectOfferLanguage } from '@/lib/resume-from-job/detect-offer-language'

/**
 * The language a cover letter's date line, subject line, default greeting and
 * sign-off and Annexes block are printed in (PRD
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
  /**
   * The place-and-date line: the sender's locality, then the formatted date
   * (`formatCoverLetterDate`). Without a place, the date alone.
   */
  placeDate: (place: string | null, date: string) => string
  /** The subject line, from the letter's job title. Swiss letters print it bold, without a label. */
  subject: (jobTitle: string) => string
  /** Printed when the letter has no greeting. */
  defaultGreeting: string
  /** Printed when the letter has no sign-off. */
  defaultSignOff: string
  /** The heading of the Annexes block. */
  annexesLabel: string
  /** The Annexes block's list when the letter has never set one (`annexes` is `null`). */
  defaultAnnexes: string
  /**
   * The editor's placeholder for the sender's street and number, a neutral
   * example in the letter's language. Never stored or printed.
   */
  streetExample: string
  /**
   * The editor's placeholder for the sender's postcode and locality, a
   * neutral example in the letter's language. Never stored or printed.
   */
  postalLocalityExample: string
}

/** "Place, date", the comma-separated form German, Italian and English letters use. */
const placeCommaDate = (place: string | null, date: string) => (place ? `${place}, ${date}` : date)

/**
 * Each language's Swiss business-letter wording (cover-letter-swiss-format,
 * FR-4): subjects without a label, Swiss closing formulas without a trailing
 * comma, and Swiss German spelling, so no default contains "ß".
 *
 * The date locales are the languages' main-country ones (fr-FR, de-DE,
 * it-IT): for a long date they print the same as the Swiss variants. English
 * is en-GB, day before month ("5 November 2026"), as a Swiss letter is dated.
 */
export const COVER_LETTER_WORDING: Readonly<Record<CoverLetterLanguage, CoverLetterWording>> = Object.freeze({
  en: {
    dateLocale: 'en-GB',
    placeDate: placeCommaDate,
    subject: (jobTitle: string) => `Application for ${jobTitle}`,
    defaultGreeting: 'Dear Hiring Manager,',
    defaultSignOff: 'Kind regards',
    annexesLabel: 'Enclosures',
    defaultAnnexes: 'CV, references, diplomas',
    streetExample: '12 Main Street',
    postalLocalityExample: '1234 My town',
  },
  fr: {
    dateLocale: 'fr-FR',
    placeDate: (place: string | null, date: string) => (place ? `${place}, le ${date}` : date),
    subject: (jobTitle: string) => `Candidature au poste de ${jobTitle}`,
    defaultGreeting: 'Madame, Monsieur,',
    defaultSignOff: 'Meilleures salutations',
    annexesLabel: 'Annexes',
    defaultAnnexes: 'CV, certificats de travail, diplômes',
    streetExample: 'Rue du Bourg 12',
    postalLocalityExample: '1234 Ma ville',
  },
  de: {
    dateLocale: 'de-DE',
    placeDate: placeCommaDate,
    subject: (jobTitle: string) => `Bewerbung als ${jobTitle}`,
    defaultGreeting: 'Sehr geehrte Damen und Herren,',
    defaultSignOff: 'Freundliche Grüsse',
    annexesLabel: 'Beilagen',
    defaultAnnexes: 'Lebenslauf, Arbeitszeugnisse, Diplome',
    streetExample: 'Dorfstrasse 12',
    postalLocalityExample: '1234 Mein Ort',
  },
  it: {
    dateLocale: 'it-IT',
    placeDate: placeCommaDate,
    subject: (jobTitle: string) => `Candidatura per la posizione di ${jobTitle}`,
    defaultGreeting: 'Gentili Signore e Signori,',
    defaultSignOff: 'Distinti saluti',
    annexesLabel: 'Allegati',
    defaultAnnexes: 'CV, certificati di lavoro, diplomi',
    streetExample: 'Via del Borgo 12',
    postalLocalityExample: '1234 La mia città',
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
 * The date line in the letter's language, long month, e.g. "2 November 2026"
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
