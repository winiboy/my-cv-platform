import { AI_TEXT_LIMITS } from '@/lib/api/ai-input-limits'
import { sanitizeUntrustedPlainText } from '@/lib/resume-from-job/untrusted-text'
import { SWITZERLAND, formatPostalAddressParts, postalAddressParts } from './offer-page-address'

/**
 * The company's postal address read from an offer's stored text
 * (PRD `tasks/prds/cover-letter-recipient-address-from-offer.md`, US-002).
 *
 * The AI reads the address while it writes the letter, in the same single
 * call (FR-5). What it answers is untrusted and may be invented or may carry
 * a name, a department or a second address, so it is used only when the
 * offer's text itself writes it as one address block. Otherwise the letter
 * gets no address: nothing is ever guessed or completed.
 *
 * THE RULE: WHOLE SEGMENTS OF THE TEXT
 * The decision rests on the TEXT's structure, never on how the AI split its
 * answer. The text the AI was given (its first `AI_TEXT_LIMITS.JOB_DESCRIPTION`
 * characters) is cut into segments at every hard boundary, BEFORE any
 * whitespace is collapsed: line breaks (also as `&#10;`/`&#13;` entities),
 * block and line tags (`<br>`, `<p>`, `<div>`, `<li>`, `<td>`, headings...),
 * tabs, a zero-width space, the separators comma, semicolon, colon (ASCII or
 * full-width), `|`, `/`, middle dot and bullet, and a hyphen, en dash, em dash
 * or minus sign between spaces (a hyphen inside "Rond-point", "12-14" or
 * "CH-1201" does not cut). Each segment is then cleaned as plain text and made
 * comparable (NFC, lower case, whitespace collapsed, Markdown `**`/`__`
 * markers, a leading bullet dash or list number and a trailing full stop
 * dropped).
 *
 * The answer is accepted only when, at some place in the text:
 * - one segment IS the street, exactly;
 * - the next segment IS "postcode locality", exactly, optionally with a
 *   country prefix on the postcode ("CH-1201 Geneve" for postcode "1201");
 *   one P.O. box segment may come between them ("Bahnhofstrasse 1, Postfach
 *   1234, 8001 Zurich"), as Swiss addresses often write it;
 * - a non-Swiss country is kept only when the segment right after is that
 *   country and it is one of `KNOWN_COUNTRIES`; otherwise its line is dropped
 *   (never invented). A Swiss country prints no line, as on the page (US-001).
 * Because the street must be a whole segment, a name or department on the
 * line before it, a label before a colon, anything after it on its line and a
 * second address can never become part of it.
 *
 * THE PARTS THEMSELVES
 * Each part is cleaned as US-001 cleans it, without Markdown markers, and
 * must be one segment on its own (a part the AI wrote over two lines is
 * refused). The postcode is 4 or 5 digits, optionally after a country prefix.
 * The street must PROVE it is a street: it holds a house number and a street
 * type word (`STREET_TYPE_WORDS`, `STREET_TYPE_SUFFIXES`); it holds no P.O.
 * box, floor, building or department word anywhere (`NOT_A_STREET_WORDS`) and
 * no second number-bearing token (a range or a "bis"/"ter"/letter suffix is
 * one house number); and it does not hold the postcode, the stored company
 * name or a legal form, and is not only words of that name.
 *
 * The locality must PROVE it is only a locality: a letter and no digit; no
 * legal form, bracket, sentence end (". " before more words, unless after an
 * abbreviated particle such as "St.") or trailing country; at most
 * `MAX_LOCALITY_TOKENS` tokens, a hyphenated compound counting as one; no
 * label, title, department, conjunction or call-to-action word
 * (`NOT_A_LOCALITY_WORDS`); every token after the first capitalised as the AI
 * wrote it, or a place-name particle (`LOCALITY_PARTICLES`); not the company
 * name, and no word shared with it unless all its words are from it (a
 * company named after its town).
 *
 * KNOWN LIMITS
 * False accepts (an answer stored that is not only the address), each narrow:
 * - A segment written right before "postcode locality" that is not a street
 *   but holds one house number and a word that is a listed whole type word or
 *   ends in a listed German type suffix: "Engineering 2" ("ring"), "Hotel
 *   Seehof 3" ("hof"), "Technopark 2" and "Business Park 2" ("park"),
 *   "Karriereweg 2" ("weg").
 * - A locality whose extra capitalised words are not in the refusal list,
 *   written by the text as its own segment after the postcode: "4053 Basel
 *   Coop" for a company not named Coop, or a hyphenated form ("Basel-Coop"),
 *   which is one token and shares no whole token with the name.
 * - A name the offer itself writes in the same segment as the street, with no
 *   separator ("Migros Zurich Pfingstweidstrasse 101, 8005 Zurich"): that
 *   segment is the street the text gives; it is refused only when the stored
 *   name or a legal form appears in it.
 * False rejects (the field stays empty, failing safe):
 * - Any street with no listed type word or suffix: "Steinenvorstadt 30",
 *   "Schipfe 2", "Bollwerk 4", "Viadukt 1", "Muehlebach 2", "Riedtli 4".
 * - Any street holding a refused word as a whole word ("Via al Piano 3", "Rue
 *   du Service 3", "Haus-Strasse 3") or a second number ("Route 66 1").
 * - Any street or locality a range written " - " would join: the text cuts
 *   there, so "Rue de la Gare 1 - 3" is never one segment.
 * - Any locality with more than four tokens, a lower-case word that is not a
 *   listed particle, a refused word ("Frankfurt a. M." holds "m"), a bracket,
 *   or a canton suffix read as a legal form ("Muri AG").
 * - Any address the text does not write as listed: a segment other than one
 *   P.O. box between the street and the postcode ("Rue du Lac 5, 2e etage,
 *   1201 Geneve"), a postcode and town on separate lines, "1201Geneve" without
 *   a space, text after the locality in its segment, or a street holding a
 *   "/" ("10/12").
 * - A street made only of the company name's words ("Rue du Commerce 5" for
 *   "Rue du Commerce SA"), and real streets `LEGAL_FORM` matches.
 */

/**
 * The one character every hard boundary becomes before the text is cleaned.
 * It is one of `SEPARATOR`'s characters, so it cuts like the others, and it
 * cannot join a preceding `&name` into an entity.
 */
const BOUNDARY = '|'

/**
 * What marks a hard boundary in the raw text: a tag (only block and line tags
 * cut, see `BLOCK_TAG`; matched as a whole so a line break inside a tag stays
 * part of it), a line break, tab or zero-width space character, or an entity
 * for one. Named entities for a separator are matched too, so they cut once
 * decoded.
 *
 * A tag match ends at its `>` or at the end of the text, so an unclosed `<a`
 * is consumed once, never rescanned: linear time.
 */
const RAW_BOUNDARY =
  /<[a-zA-Z/!?][^>]*>?|\r\n|[\n\v\f\r\t\u0085\u200B\u2028\u2029]|&#0*(?:9|1[0-3]|133|8203|8232|8233);|&#x0*(?:9|a|b|c|d|85|200b|2028|2029);|&(?:newline|tab|middot|centerdot|bull|bullet|vert|verbar|sol|comma|semi|colon|minus|ndash|mdash|zerowidthspace);/giu

/** The characters named separator entities stand for. */
const SEPARATOR_ENTITIES: Readonly<Record<string, string>> = {
  middot: '\u00B7',
  centerdot: '\u00B7',
  bull: '\u2022',
  bullet: '\u2022',
  vert: '|',
  verbar: '|',
  sol: '/',
  comma: ',',
  semi: ';',
  colon: ':',
  minus: '\u2212',
  ndash: '\u2013',
  mdash: '\u2014',
}

/** A tag that starts a new line when shown: it cuts the text. */
const BLOCK_TAG =
  /^<\/?(?:br|hr|p|div|li|ul|ol|dl|dt|dd|tr|td|th|table|thead|tbody|tfoot|caption|h[1-6]|address|section|article|header|footer|main|nav|aside|figure|figcaption|center|details|summary|menu|fieldset|legend|option|blockquote|pre)(?=[\s/>]|$)/i

/**
 * What cuts the cleaned text (whitespace already collapsed to single spaces):
 * a separator, ASCII or full-width, or a dash between spaces.
 */
const SEPARATOR = /[|,;:/\u00B7\u2022\uFF0C\uFF1B\uFF1A]| [-\u2013\u2014\u2212] /u

/** Markdown bold or underline markers, which a text or an answer may wrap a line in. */
const MARKDOWN_MARKERS = /\*\*|__/gu

/**
 * A bullet dash or star, or a list number ("2. ", "2) "), at the start of a
 * segment ("- Rue du Lac 5", "2. Rue du Lac 5"). No nested quantifier.
 */
const LEADING_BULLET = /^[-\u2013\u2014\u2212*\s]*(?:\p{N}{1,2}[.)]\s+)?[-\u2013\u2014\u2212*\s]*/u

/** Whitespace, one character at a time. */
const WHITESPACE_CHARACTER = /^\s$/u

/**
 * A postcode as the AI may answer it once cleaned: 4 or 5 digits, optionally
 * after a 1- or 2-letter country prefix and a hyphen ("1201", "CH-1208",
 * "D-80331", "75001").
 */
const POSTCODE = /^(?:[A-Za-z]{1,2}-)?\d{4,5}$/

/** A comparable segment that starts with a postcode's country prefix. */
const COUNTRY_PREFIX = /^([a-z]{1,2})-(?=\d)/

/** A letter in any script. */
const LETTER = /\p{L}/u

/** A word made only of letters, in any script. */
const LETTERS_ONLY = /^\p{L}+$/u

/** A digit in any script. */
const DIGIT = /\p{N}/u

/** What separates two words when names are compared word by word. */
const NON_WORD = /[^\p{L}\p{N}]+/u

/** Punctuation at either end of a space-separated token ("St." is "st"). */
const TOKEN_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

/**
 * A house number standing alone: digits, optionally "bis", "ter", one letter
 * or a range ("12", "12bis", "12a", "12-14"). "12 bis" is accepted too.
 */
const HOUSE_NUMBER = /(?<![\p{L}\p{N}])\p{N}+(?:bis|ter|\p{L}|-\p{N}+)?(?![\p{L}\p{N}])/u

/** The words of a P.O. box (comparable): Postfach, case postale, casella postale, CP or PO box. */
const PO_BOX_WORDS = String.raw`(?:postfach|case postale|casella postale|c\.? ?p|p\.? ?o\.? box)`

/** A P.O. box segment (comparable), optionally with its number. */
const PO_BOX = new RegExp(String.raw`^${PO_BOX_WORDS}(?: (?:nr\.? ?|no\.? ?)?\p{N}{1,6})?$`, 'u')

/** A P.O. box anywhere in a comparable string, as whole words. */
const PO_BOX_ANYWHERE = new RegExp(String.raw`(?<![\p{L}\p{N}])${PO_BOX_WORDS}(?![\p{L}\p{N}])`, 'u')

/**
 * Words naming a floor, a building or a department (comparable), refused as a
 * whole word of a street: "Rue du Lac 5 2e etage" or "Bahnhofstrasse 1
 * Personalabteilung" is a street with more on its line. Only whole words, so
 * "Rathausgasse" holds no "haus".
 */
const NOT_A_STREET_WORDS: ReadonlySet<string> = new Set([
  'etage', '\u00E9tage', 'og', 'eg', 'ug', 'stock', 'stockwerk', 'geschoss', 'geb\u00E4ude', 'gebaeude',
  'b\u00E2timent', 'batiment', 'haus', 'bureau', 'b\u00FCro', 'buero', 'piano', 'edificio', 'floor', 'building',
  'suite', 'personalabteilung', 'abteilung', 'service',
])

/**
 * A house-number range written with spaces around its dash ("1 - 3"), joined
 * before the number-bearing tokens of a street are counted.
 */
const SPACED_NUMBER_RANGE = /(\p{N}) ?[-\u2013] ?(?=\p{N})/gu

/**
 * The words that make a segment a street, in French, Italian, English and
 * German (comparable form), matched as a whole word of the street. A number
 * next to any other word ("2e etage", "3. OG", "Bureau 3", "Ref. 4711",
 * "Radio 24", "20 Minuten") is a floor, a department, a reference or a
 * company, not a street. Short abbreviations ("ch", "au") are only ever
 * whole words: as a suffix they would match "Bureau" or "Gebaeude". "St" and
 * "Dr" are not listed: they are as often "Saint" and "Doktor" ("Klinik St.
 * Anna 3", "Dr. Muster 3"). "rond-point" is matched as a whole hyphenated token.
 */
const STREET_TYPE_WORDS: ReadonlySet<string> = new Set([
  // French
  'rue', 'ruelle', 'avenue', 'av', 'boulevard', 'bd', 'bld', 'chemin', 'ch', 'route', 'rte', 'place', 'pl',
  'quai', 'impasse', 'all\u00E9e', 'allee', 'passage', 'sentier', 'esplanade', 'promenade', 'cours', 'faubourg',
  'square', 'rampe', 'mont\u00E9e', 'montee', 'traverse', 'clos', 'cit\u00E9', 'cite', 'parc', 'port',
  'rond-point', 'escaliers',
  // Italian
  'via', 'viale', 'piazza', 'piazzale', 'piazzetta', 'corso', 'vicolo', 'largo', 'contrada', 'strada', 'salita',
  'lungolago', 'riva', 'sentiero',
  // English
  'street', 'road', 'rd', 'ave', 'lane', 'ln', 'drive', 'way', 'court', 'ct', 'blvd', 'terrace',
  'crescent', 'close', 'row', 'parkway', 'highway', 'hwy',
  // German, too short to be a suffix
  'au',
])

/**
 * German street types, matched as a whole word or as the end of one: German
 * writes a street as one compound ("Bahnhofstrasse", "Thiersteinerallee",
 * "Bahnhofstr."). None of them ends "Personalabteilung", "Gebaeude",
 * "Postfach" or "Minuten".
 */
const STREET_TYPE_SUFFIXES: readonly string[] = [
  'strasse', 'stra\u00DFe', 'str', 'weg', 'gasse', 'g\u00E4ssli', 'gaessli', 'g\u00E4sslein', 'gaesslein', 'platz', 'allee', 'ring', 'rain',
  'halde', 'matt', 'matte', 'graben', 'steig', 'stieg', 'hof', 'quai', 'damm', 'ufer', 'berg', 'feld', 'acker',
  'rank', 'stutz', 'br\u00FCcke', 'bruecke', 'markt', 'park', 'pfad', 'zelg',
]

/**
 * Company legal forms, each written as its letters (alternatives for one
 * letter separated by `|`). A street or locality holding one as a whole word
 * names a company: the AI often answers the company's full legal name ("UBS
 * Switzerland AG") where the stored name is shorter or in another language, so
 * the exact-name check alone misses it. Each letter may be followed by a dot
 * and a space, so "S.a r.l.", "Sarl" and "SARL" all match. "Co. KG" is
 * covered by "KG".
 *
 * Known limit, failing safe: real names are refused too when a token reads as
 * one - single-letter initials ("Rue A. G. Dupont 3"), an abbreviation ("Bv.
 * Carl-Vogt 2"), a token joined by a hyphen or apostrophe ("Pre-Sa 4"), a US
 * street ending in "SE", or a locality with the canton "AG" ("Muri AG").
 */
const LEGAL_FORMS: readonly (readonly string[])[] = [
  ['a', 'g'],
  ['s', 'a'],
  ['g', 'm', 'b', 'h'],
  ['s', '\u00E0|a', 'r', 'l'],
  ['s', 'a', 'g', 'l'],
  ['s', 'r', 'l'],
  ['s', 'p', 'a'],
  ['l', 't', 'd'],
  ['i', 'n', 'c'],
  ['k', 'g'],
  ['l', 'l', 'c'],
  ['p', 'l', 'c'],
  ['b', 'v'],
  ['n', 'v'],
  ['s', 'e'],
]

/**
 * Any legal form of `LEGAL_FORMS`, or "& Co", standing alone in a comparable
 * string. Only letters, optional dots and single spaces: no nested
 * quantifier, so it cannot backtrack beyond a few steps per position.
 */
const LEGAL_FORM_SOURCE = `(?<![\\p{L}\\p{N}])(?:${LEGAL_FORMS.map((letters) =>
  letters.map((letter) => `(?:${letter})`).join('\\.? ?')
).join('|')}|& ?co)\\.?(?![\\p{L}\\p{N}])`

const LEGAL_FORM = new RegExp(LEGAL_FORM_SOURCE, 'u')

/** Every legal form in a string, to strip them from the company's name. */
const LEGAL_FORMS_ALL = new RegExp(LEGAL_FORM_SOURCE, 'gu')

/**
 * Countries other than Switzerland whose name or ISO code may print as the
 * address's last line, in English, French, German and Italian (comparable
 * form). A country outside this list is dropped, never printed: a free word
 * after the locality ("Beispiel SA") is not a country.
 */
const KNOWN_COUNTRIES: ReadonlySet<string> = new Set([
  'germany', 'deutschland', 'allemagne', 'germania', 'de', 'deu',
  'france', 'frankreich', 'francia', 'fr', 'fra',
  'italy', 'italie', 'italien', 'italia', 'it', 'ita',
  'austria', '\u00F6sterreich', 'autriche', 'at', 'aut',
  'liechtenstein', 'li', 'lie',
  'united kingdom', 'royaume-uni', 'vereinigtes k\u00F6nigreich', 'regno unito', 'uk', 'gb', 'gbr',
  'united states', '\u00E9tats-unis', 'vereinigte staaten', 'stati uniti', 'usa', 'us',
  'spain', 'espagne', 'spanien', 'spagna', 'es', 'esp',
  'netherlands', 'pays-bas', 'niederlande', 'paesi bassi', 'nl', 'nld',
  'belgium', 'belgique', 'belgien', 'belgio', 'be', 'bel',
  'luxembourg', 'luxemburg', 'lussemburgo', 'lu', 'lux',
])

/**
 * Words shorter than this are ignored when a locality is checked for sharing
 * a word with the company name: articles ("la", "le") and abbreviations
 * ("St.") are shared by company names and towns alike.
 */
const MIN_SHARED_WORD_LENGTH = 3

/**
 * The most tokens a locality has: a hyphenated compound ("La Chaux-de-Fonds")
 * is one token, so "Le Mont-sur-Lausanne" is two and "Stein am Rhein" three.
 */
const MAX_LOCALITY_TOKENS = 4

/** A bracket in a locality: "8001 Zurich (Schweiz)" adds a note to the town. */
const BRACKET = /[()[\]{}]/u

/** An upper-case letter starting a token, as a place name's words are written. */
const CAPITALISED = /^\p{Lu}/u

/**
 * Small words of place names (comparable, without their full stop), which a
 * locality may hold in lower case after its first token ("Stein am Rhein",
 * "Muri bei Bern", "St. Gallen"). Each may also be followed by a full stop
 * inside a locality, as an abbreviation, not as the end of a sentence.
 */
const LOCALITY_PARTICLES: ReadonlySet<string> = new Set([
  'am', 'an', 'der', 'die', 'das', 'im', 'bei', 'ob', 'sur', 'sous', 'la', 'le', 'les', 'l', 'de', 'du', 'des',
  'di', 'del', 'della', 'st', 'ste', 'saint', 'sainte', 'san', 'sankt', 'bad', 'en', 'a', 'b', 'z',
])

/**
 * Words that are never part of a locality (comparable, without edge
 * punctuation): a title, a department or a label ("8001 Zurich Herr Muster",
 * "1201 Geneve Service RH"), a P.O. box, a conjunction ("Zurich oder
 * Homeoffice"), a thank-you or a call to action ("Jetzt bewerben"), or a
 * working mode. Matched as a whole token and as a word of one ("l'attention").
 */
const NOT_A_LOCALITY_WORDS: ReadonlySet<string> = new Set([
  'herr', 'frau', 'mme', 'mlle', 'm', 'mr', 'mrs', 'ms', 'dr',
  'service', 'rh', 'hr', 'personal', 'personalabteilung', 'abteilung', 'd\u00E9partement', 'departement',
  'bureau', 'b\u00FCro', 'buero',
  'postfach', 'case', 'postale', 'casella', 'cp',
  'oder', 'ou', 'und', 'et', 'e', 'o', 'or', 'and',
  'attention', 'attn', 'z.hd', 'zhd',
  'merci', 'danke', 'grazie', 'thanks', 'jetzt', 'bewerben', 'postuler', 'apply',
  'homeoffice', 'remote', 't\u00E9l\u00E9travail', 'teletravail',
])

/** Text without Markdown bold or underline markers. */
function withoutMarkdown(text: string): string {
  return text.replace(MARKDOWN_MARKERS, '')
}

/**
 * A string's comparable form: NFC, lower case, whitespace collapsed, without
 * Markdown markers, a leading bullet dash or list number, or trailing full
 * stops.
 */
function comparable(text: string): string {
  return withoutTrailingFullStops(
    withoutMarkdown(text).normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').replace(LEADING_BULLET, '')
  )
}

/**
 * A string without its trailing full stops and whitespace: the end of a
 * sentence, not part of the address. A backward loop, not an end-anchored
 * pattern, which would rescan a long run of ". " from every position: linear
 * time.
 */
function withoutTrailingFullStops(text: string): string {
  let end = text.length
  while (end > 0 && (text[end - 1] === '.' || WHITESPACE_CHARACTER.test(text[end - 1]))) end -= 1
  return text.slice(0, end)
}

/**
 * The comparable segments of untrusted text, in order, without empty ones.
 * Hard boundaries are marked on the raw text, then the whole text is cleaned
 * once (so `script` content is still dropped with its element), then cut.
 */
function segmentsOf(raw: string): string[] {
  const marked = raw.replace(RAW_BOUNDARY, (match) => {
    if (match.startsWith('<')) return BLOCK_TAG.test(match) ? BOUNDARY : match
    if (match.startsWith('&')) {
      const name = match.slice(1, -1).toLowerCase()
      return SEPARATOR_ENTITIES[name] ?? BOUNDARY
    }
    return BOUNDARY
  })
  // The cap is the text's own length: marking never lengthens it.
  return sanitizeUntrustedPlainText(marked, marked.length)
    .split(SEPARATOR)
    .map(comparable)
    .filter((segment) => segment.length > 0)
}

/** The words of a comparable string, without punctuation. */
function wordsOf(text: string): string[] {
  return text.split(NON_WORD).filter((word) => word.length > 0)
}

/**
 * The space-separated tokens of a comparable string, without punctuation at
 * their ends: a hyphenated place name ("rapperswil-jona") stays one token.
 */
function tokensOf(text: string): string[] {
  return text
    .split(' ')
    .map((token) => token.replace(TOKEN_EDGE_PUNCTUATION, ''))
    .filter((token) => token.length > 0)
}

/** Whether all of `name`'s words occur in `text`, consecutively and in order. */
function containsName(text: string, name: string): boolean {
  const nameWords = wordsOf(name)
  if (nameWords.length === 0) return false
  const textWords = wordsOf(text)
  for (let start = 0; start + nameWords.length <= textWords.length; start += 1) {
    if (nameWords.every((word, offset) => textWords[start + offset] === word)) return true
  }
  return false
}

/**
 * Whether every address part the AI gave as a string is a single segment: a
 * part written over two lines or with a separator inside it is refused even
 * when cleaning would join it into one line.
 */
function isOneSegmentEach(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null) return false
  const node = candidate as Record<string, unknown>
  return [node.streetAddress, node.postalCode, node.addressLocality, node.addressCountry].every(
    (value) => typeof value !== 'string' || segmentsOf(value).length <= 1
  )
}

/** Whether a comparable street holds a street type word, whole or as a German compound's end. */
function hasStreetType(street: string): boolean {
  return (
    tokensOf(street).some((token) => STREET_TYPE_WORDS.has(token)) ||
    wordsOf(street).some(
      (word) => STREET_TYPE_WORDS.has(word) || STREET_TYPE_SUFFIXES.some((suffix) => word.endsWith(suffix))
    )
  )
}

/**
 * Whether a comparable street holds more than its street: a P.O. box, or a
 * floor, building or department word anywhere in it ("Rue du Lac 5 Case
 * postale 12", "Rue du Lac 5 2e etage"), or a second number-bearing token
 * ("Bahnhofstrasse 1 2. OG"). One house number may be a range ("12-14", "1 -
 * 3") or carry "bis", "ter" or a letter, in one token or as the next word.
 */
function holdsMoreThanAStreet(street: string): boolean {
  if (PO_BOX_ANYWHERE.test(street)) return true
  if (wordsOf(street).some((word) => NOT_A_STREET_WORDS.has(word))) return true
  const numberTokens = street.replace(SPACED_NUMBER_RANGE, '$1-').split(' ').filter((token) => DIGIT.test(token))
  return numberTokens.length > 1
}

/**
 * Whether every letter word of a comparable street is a word of the company's
 * name without its legal form ("20 Minuten" for "20 Minuten AG"): the name of
 * a company with a number, not a street.
 */
function isOnlyNameWords(street: string, companyName: string): boolean {
  const nameWords = new Set(wordsOf(companyName.replace(LEGAL_FORMS_ALL, ' ')))
  if (nameWords.size === 0) return false
  const letterWords = wordsOf(street).filter((word) => LETTERS_ONLY.test(word))
  return letterWords.every((word) => nameWords.has(word))
}

/** Whether a comparable street is only a street. */
function isOnlyAStreet(street: string, postcodeDigits: string, companyName: string): boolean {
  if (!LETTER.test(street) || !HOUSE_NUMBER.test(street) || !hasStreetType(street)) return false
  if (holdsMoreThanAStreet(street) || wordsOf(street).includes(postcodeDigits)) return false
  if (companyName && (containsName(street, companyName) || isOnlyNameWords(street, companyName))) return false
  return !LEGAL_FORM.test(street)
}

/** Whether a comparable locality ends with a country after another word ("zurich schweiz"). */
function endsWithCountry(locality: string): boolean {
  for (let index = locality.indexOf(' '); index !== -1; index = locality.indexOf(' ', index + 1)) {
    const rest = locality.slice(index + 1)
    if (SWITZERLAND.has(rest) || KNOWN_COUNTRIES.has(rest)) return true
  }
  return false
}

/**
 * Whether a comparable locality holds a full stop ending a sentence ("geneve.
 * merci de votre interet"): a token ending in a full stop with more after it,
 * unless it is an abbreviated particle ("st. gallen").
 */
function holdsSentenceEnd(locality: string): boolean {
  const rawTokens = locality.split(' ')
  return rawTokens.some(
    (token, index) =>
      index < rawTokens.length - 1 &&
      token.endsWith('.') &&
      !LOCALITY_PARTICLES.has(token.replace(TOKEN_EDGE_PUNCTUATION, ''))
  )
}

/**
 * Whether a locality's words are only a place name's: at most
 * `MAX_LOCALITY_TOKENS` tokens, none of `NOT_A_LOCALITY_WORDS`, and every
 * token after the first capitalised as the AI wrote it ("Stein am Rhein": a
 * particle may stay lower case). `locality` is comparable; `written` is the
 * same part before it was lower-cased.
 */
function hasOnlyPlaceNameWords(locality: string, written: string): boolean {
  const tokens = tokensOf(locality)
  if (tokens.length > MAX_LOCALITY_TOKENS) return false
  if (tokens.some((token) => NOT_A_LOCALITY_WORDS.has(token) || wordsOf(token).some((word) => NOT_A_LOCALITY_WORDS.has(word)))) {
    return false
  }
  const writtenTokens = tokensOf(written.normalize('NFC').replace(/\s+/gu, ' ').trim())
  // A token count that differs once lower-cased cannot be compared: fail safe.
  if (writtenTokens.length !== tokens.length) return false
  return tokens.every(
    (token, index) => index === 0 || LOCALITY_PARTICLES.has(token) || CAPITALISED.test(writtenTokens[index])
  )
}

/**
 * Whether a comparable locality is only a locality: a letter and no digit, no
 * legal form, bracket, sentence end or trailing country (read without
 * punctuation, so "Zurich (Schweiz)" ends with one), only a place name's
 * words (`hasOnlyPlaceNameWords`), not the company's name, and no token shared
 * with that name unless every token of it is ("Zurich" for "Migros Zurich",
 * "St. Gallen" for "Kantonsspital St. Gallen", not "Basel Coop" for "Coop
 * Genossenschaft"). Tokens shorter than `MIN_SHARED_WORD_LENGTH` are ignored
 * on both sides.
 *
 * @param locality The locality, comparable.
 * @param written The locality as the AI wrote it, cleaned but not lower-cased.
 * @param companyName The company name, comparable.
 */
function isOnlyALocality(locality: string, written: string, companyName: string): boolean {
  if (!LETTER.test(locality) || DIGIT.test(locality) || LEGAL_FORM.test(locality)) return false
  if (BRACKET.test(locality) || holdsSentenceEnd(locality)) return false
  if (endsWithCountry(tokensOf(locality).join(' '))) return false
  if (!hasOnlyPlaceNameWords(locality, written)) return false
  if (!companyName) return true
  if (containsName(locality, companyName)) return false
  // The name's hyphenated tokens count whole and by their parts, so a name
  // "Coop-Genossenschaft" still shares "coop" with "Basel Coop".
  const nameTokens = new Set(
    tokensOf(companyName)
      .flatMap((token) => [token, ...wordsOf(token)])
      .filter((token) => token.length >= MIN_SHARED_WORD_LENGTH)
  )
  const localityTokens = tokensOf(locality).filter((token) => token.length >= MIN_SHARED_WORD_LENGTH)
  const shared = localityTokens.some((token) => nameTokens.has(token))
  return !shared || localityTokens.every((token) => nameTokens.has(token))
}

/**
 * Whether a segment is the postcode and the locality. A country prefix in the
 * segment is accepted; a prefix in the answer must be the segment's own.
 */
function isPostcodeLocality(segment: string | undefined, postcode: string, locality: string): boolean {
  if (segment === undefined) return false
  const answerPrefix = COUNTRY_PREFIX.exec(postcode)?.[1]
  const digits = answerPrefix ? postcode.slice(answerPrefix.length + 1) : postcode
  const segmentPrefix = COUNTRY_PREFIX.exec(segment)?.[1]
  if (answerPrefix && answerPrefix !== segmentPrefix) return false
  const rest = segmentPrefix ? segment.slice(segmentPrefix.length + 1) : segment
  return rest === `${digits} ${locality}`
}

/**
 * The street as it is stored: without Markdown markers, a leading bullet or a
 * list number, which decorate a line and are not part of the address.
 */
function storedStreet(street: string): string {
  return withoutMarkdown(street).replace(LEADING_BULLET, '').trim()
}

/**
 * The address to store from the AI's answer, as `company_address` stores it
 * (the same shape and cleaning as US-001), or `null` when the answer is not a
 * complete address, is not only an address, or is not written as one address
 * block in `offerText`. Never throws.
 *
 * @param candidate The AI's `companyAddress`: untrusted, any shape.
 * @param offerText The offer text the AI was given; only its first `AI_TEXT_LIMITS.JOB_DESCRIPTION` characters are read.
 * @param companyName The company name stored with the letter, already cleaned; `''` when there is none.
 */
export function companyAddressFromOfferText(
  candidate: unknown,
  offerText: string,
  companyName: string
): string | null {
  const given = postalAddressParts(candidate)
  if (!given || !isOneSegmentEach(candidate)) return null
  const parts = {
    street: storedStreet(given.street),
    postcode: withoutMarkdown(given.postcode).trim(),
    locality: withoutMarkdown(given.locality).trim(),
    country: given.country === null ? null : withoutMarkdown(given.country).trim() || null,
  }
  if (!parts.street || !parts.locality || !POSTCODE.test(parts.postcode)) return null

  const street = comparable(parts.street)
  const postcode = comparable(parts.postcode)
  const locality = comparable(parts.locality)
  const company = comparable(companyName)
  const postcodeDigits = postcode.replace(COUNTRY_PREFIX, '')
  if (!isOnlyAStreet(street, postcodeDigits, company) || !isOnlyALocality(locality, parts.locality, company)) return null

  const segments = segmentsOf(offerText.slice(0, AI_TEXT_LIMITS.JOB_DESCRIPTION))
  const country = parts.country ? comparable(parts.country) : null

  let found = false
  let countryFound = false
  // An address may be repeated in the text: every place it is written counts.
  segments.forEach((segment, index) => {
    if (segment !== street) return
    let next = index + 1
    if (!isPostcodeLocality(segments[next], postcode, locality)) {
      if (!PO_BOX.test(segments[next] ?? '')) return
      next += 1
      if (!isPostcodeLocality(segments[next], postcode, locality)) return
    }
    found = true
    if (country !== null && KNOWN_COUNTRIES.has(country) && segments[next + 1] === country) countryFound = true
  })
  if (!found) return null

  return formatPostalAddressParts({ ...parts, country: countryFound ? parts.country : null })
}
