import type { ResumeContentLanguage } from './sample-values'

/**
 * Deterministic detection of a job offer's language among the four languages a
 * resume can be written in (PRD `tasks/prds/cv-from-job-complete.md`, US-002).
 *
 * WHY A WORD-FREQUENCY HEURISTIC, AND WHY BEFORE THE AI
 * The language is decided once, before any AI call, and then given to the AI
 * as the language to write in. The AI text and the sample values that fill its
 * gaps are therefore always in the same language, whether or not the AI is
 * used, fails, or is rate-limited - a language the AI reported about its own
 * reply could disagree with the sample set, or be missing when it fails.
 * No dependency is added (FR-6): job offers are long, running prose, in which
 * the short grammatical words below are the most frequent tokens, so counting
 * them separates the languages reliably. When the text is too short, in another
 * language or too mixed to call, the caller falls back to the UI locale (AC:
 * "otherwise the UI locale").
 *
 * Each in-scope list holds function words that are frequent in its language
 * and absent, or rare in running text, in the other three: words shared
 * between them ("a", "in", "le", "la", "des", "per", German "an" and "du",
 * French "on") and English loanwords common in other offers ("team",
 * "skills", "AI") are left out so they cannot vote for the wrong language.
 *
 * WHY LANGUAGES THAT ARE NOT SUPPORTED ALSO VOTE
 * Spanish and Portuguese share many function words with Italian and French
 * ("con", "del", "una", "que", "para"), and Dutch with German ("die"). If only
 * fr, en, de and it were counted, a Spanish offer would be read as Italian. So
 * Spanish, Portuguese and Dutch are counted too, a word in two lists votes for
 * both, and the offer gets a language only when an in-scope one clearly leads
 * every other, supported or not. Words of those three languages that are
 * common in fr, en, de or it ("de", "en", "es", "un", "su", "tu", "y", "das",
 * "um", "à", "je", "als") are left out of their lists.
 */
type CountedLanguage = ResumeContentLanguage | 'es' | 'pt' | 'nl'

const FUNCTION_WORDS: Readonly<Record<CountedLanguage, readonly string[]>> = {
  en: [
    'the', 'and', 'of', 'to', 'with', 'for', 'you', 'your', 'our', 'we', 'will', 'are', 'is',
    'be', 'this', 'that', 'have', 'or', 'as', 'at', 'from', 'who', 'all', 'can', 'about',
    'which', 'their', 'they', 'by',
  ],
  fr: [
    'les', 'et', 'une', 'pour', 'avec', 'vous', 'nous', 'est', 'dans', 'sur', 'au', 'aux',
    'votre', 'notre', 'vos', 'nos', 'qui', 'que', 'sont', 'ou', 'être', 'êtes', 'ce', 'cette',
    'ces', 'par', 'leur', 'équipe', 'expérience', 'poste',
  ],
  de: [
    'der', 'die', 'das', 'und', 'mit', 'für', 'wir', 'ist', 'ein', 'eine', 'einen', 'den', 'dem',
    'von', 'zu', 'auf', 'bei', 'ihre', 'ihr', 'ihren', 'unser', 'unsere', 'oder', 'nicht', 'sich',
    'werden', 'sind', 'als', 'auch', 'im', 'zur', 'zum', 'erfahrung', 'aufgaben',
  ],
  it: [
    'il', 'lo', 'gli', 'della', 'delle', 'dei', 'degli', 'del', 'con', 'di', 'che', 'una', 'sono',
    'nel', 'nella', 'alla', 'al', 'è', 'siamo', 'cerchiamo', 'tua', 'tuo', 'nostro', 'nostra',
    'essere', 'anche', 'sulla', 'dal', 'dalla', 'esperienza', 'competenze',
  ],
  es: [
    'el', 'los', 'las', 'para', 'por', 'con', 'del', 'al', 'una', 'que', 'sus', 'nuestro',
    'nuestra', 'nuestros', 'nuestras', 'como', 'más', 'muy', 'experiencia', 'equipo', 'buscamos',
    'trabajo', 'empresa', 'ofrecemos', 'serás', 'tus', 'puesto', 'conocimientos',
  ],
  pt: [
    'uma', 'com', 'os', 'não', 'para', 'por', 'que', 'sua', 'seu', 'suas', 'seus', 'nossa',
    'nosso', 'você', 'são', 'ao', 'aos', 'dos', 'em', 'experiência', 'equipe', 'trabalho',
    'empresa', 'mais', 'oferecemos', 'procuramos', 'conhecimentos', 'vaga',
  ],
  nl: [
    'het', 'een', 'van', 'voor', 'met', 'wij', 'jij', 'jouw', 'onze', 'zijn', 'ook', 'naar',
    'op', 'te', 'deze', 'dat', 'die', 'om', 'bij', 'bent', 'heb', 'hebt', 'kun', 'wordt',
    'worden', 'ervaring', 'werk', 'functie',
  ],
}

const COUNTED_LANGUAGES = Object.keys(FUNCTION_WORDS) as CountedLanguage[]

const IN_SCOPE: ReadonlySet<CountedLanguage> = new Set<CountedLanguage>(['fr', 'en', 'de', 'it'])

function isInScope(language: CountedLanguage): language is ResumeContentLanguage {
  return IN_SCOPE.has(language)
}

/** Each word and every language it votes for. */
const WORD_TO_LANGUAGES: ReadonlyMap<string, readonly CountedLanguage[]> = (() => {
  const map = new Map<string, CountedLanguage[]>()
  for (const language of COUNTED_LANGUAGES) {
    for (const word of FUNCTION_WORDS[language]) {
      map.set(word, [...(map.get(word) ?? []), language])
    }
  }
  return map
})()

/**
 * Below this many function-word hits the text is too short to call: a title or
 * a two-line note does not carry enough grammar.
 */
export const MIN_FUNCTION_WORD_HITS = 8

/**
 * The leading language must have at least this many times the hits of the
 * runner-up, supported or not. Offers that mix two languages in similar measure
 * (a German offer with an English benefits block of the same size) are left
 * undecided rather than guessed.
 */
export const MIN_LEAD_RATIO = 2

/**
 * Only the beginning of a long offer is read: the language is settled long
 * before this, and the scan stays linear and cheap whatever the input size.
 */
export const MAX_SCANNED_CHARACTERS = 20_000

const WORD_PATTERN = /[\p{L}]+/gu

/** Function-word votes per counted language, in-scope or not. */
export function countLanguageVotes(text: string): Record<CountedLanguage, number> {
  const counts: Record<CountedLanguage, number> = { fr: 0, en: 0, de: 0, it: 0, es: 0, pt: 0, nl: 0 }
  for (const [word] of text.slice(0, MAX_SCANNED_CHARACTERS).toLowerCase().matchAll(WORD_PATTERN)) {
    for (const language of WORD_TO_LANGUAGES.get(word) ?? []) counts[language] += 1
  }
  return counts
}

/**
 * The offer's language when it is clearly fr, en, de or it, otherwise `null`:
 * too short, in another language (Spanish, Portuguese, Dutch or any other), or
 * too mixed to call.
 */
export function detectOfferLanguage(text: unknown): ResumeContentLanguage | null {
  if (typeof text !== 'string') return null

  const counts = countLanguageVotes(text)
  const [first, second] = [...COUNTED_LANGUAGES].sort((a, b) => counts[b] - counts[a])
  if (!isInScope(first)) return null
  if (counts[first] < MIN_FUNCTION_WORD_HITS) return null
  if (counts[first] < counts[second] * MIN_LEAD_RATIO) return null
  return first
}
