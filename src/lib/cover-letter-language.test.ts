import { describe, expect, it } from 'vitest'
import { linearCeiling, measureScaling } from '@/test/linear-time'
import {
  COVER_LETTER_WORDING,
  coverLetterRequestLanguage,
  formatCoverLetterDate,
  resolveCoverLetterLanguage,
  type CoverLetterLanguage,
} from './cover-letter-language'

/** Typical letter paragraphs, as the editor stores them, one per language. */
const LETTER_PARAGRAPHS: Readonly<Record<CoverLetterLanguage, readonly string[]>> = {
  fr: [
    "<p>Je vous écris pour vous présenter ma candidature au poste de développeur. Avec cinq ans d'expérience dans une équipe agile, je suis convaincu que mon profil correspond à vos besoins et à votre entreprise.</p>",
  ],
  de: [
    '<p>Mit großem Interesse habe ich Ihre Anzeige gelesen und bewerbe mich für die Stelle als Entwickler. In meiner bisherigen Erfahrung bei einer Firma habe ich die Aufgaben im Team mit Freude übernommen und bin sicher, dass ich auch Ihre Erwartungen erfülle.</p>',
  ],
  it: [
    '<p>Con la presente desidero candidarmi per la posizione di sviluppatore presso la vostra azienda. Ho maturato una solida esperienza nel settore e sono convinto che le mie competenze siano utili al vostro team, anche grazie alla mia capacità di lavorare con gli altri.</p>',
  ],
  en: [
    '<p>I am writing to apply for the position of developer at your company. With five years of experience in the field, I am confident that my skills and my work will be an asset to your team and to the people you serve.</p>',
  ],
}

const LANGUAGES: readonly CoverLetterLanguage[] = ['fr', 'en', 'de', 'it']

/** A date built in local time, as `formatCoverLetterDate` formats in local time. */
const NOVEMBER_2_2026 = new Date(2026, 10, 2)

describe('resolveCoverLetterLanguage', () => {
  it.each(LANGUAGES)('detects a %s letter, whatever the page language', (language) => {
    for (const page of LANGUAGES) {
      expect(resolveCoverLetterLanguage(LETTER_PARAGRAPHS[language], page)).toBe(language)
    }
  })

  it('reads the opening, the body and the closing together', () => {
    const [sentence] = LETTER_PARAGRAPHS.de
    const thirds = sentence.split('. ')
    expect(resolveCoverLetterLanguage(thirds, 'fr')).toBe('de')
  })

  it.each(LANGUAGES)('falls back to the page language %s for a letter too short to tell', (page) => {
    expect(resolveCoverLetterLanguage(['<p>Bonjour.</p>'], page)).toBe(page)
    expect(resolveCoverLetterLanguage([], page)).toBe(page)
    expect(resolveCoverLetterLanguage(['', ''], page)).toBe(page)
  })

  it('ignores markup: tag names, attributes and entities do not vote', () => {
    const englishMarkup = '<p class="the and of to with for you your our we will are is be this that">'
    expect(resolveCoverLetterLanguage([`${englishMarkup}Hallo&nbsp;</p>`], 'it')).toBe('it')
    expect(resolveCoverLetterLanguage([`${englishMarkup}${LETTER_PARAGRAPHS.de[0]}</p>`], 'en')).toBe('de')
    expect(resolveCoverLetterLanguage(['<ul><li><strong>Mit</strong>&nbsp;Freude und</li></ul>'], 'fr')).toBe('fr')
  })

  it('reads words split only by markup as separate words', () => {
    const glued = LETTER_PARAGRAPHS.fr[0].replace(/ /g, '</span><span>')
    expect(resolveCoverLetterLanguage([glued], 'en')).toBe('fr')
  })

  it('stays linear on a stray "<" with no closing ">"', () => {
    // Growth, not a wall-clock budget (see `measureScaling`): 8 times the
    // stray "<" costs about 8x if linear, 64x if quadratic.
    const growth = 8
    const hostile = (strays: number) => '<'.repeat(strays) + LETTER_PARAGRAPHS.it[0]
    const base = hostile(25_000)
    const scaled = hostile(25_000 * growth)
    const { ratio } = measureScaling(
      () => resolveCoverLetterLanguage([base], 'en'),
      () => resolveCoverLetterLanguage([scaled], 'en'),
    )
    expect(ratio).toBeLessThan(linearCeiling(growth))
    expect(resolveCoverLetterLanguage([scaled], 'en')).toBe('en')
  })

  it('cannot tell the language of the Word export e2e letter, so it follows the page', () => {
    // A copy of FULL_LETTER's paragraphs in
    // `e2e/cover-letter-docx-export.spec.ts`, which expects the page's date and
    // subject under each locale: a detector change that starts telling this
    // letter's language fails here first.
    const e2eDocxLetter = [
      '<p>Je postule avec <strong>une conviction forte</strong> et <em>un réel intérêt</em> « sincère ».</p>' +
        '<ol><li>Première raison</li><li>Deuxième raison</li></ol>',
      '<p>Corps un : j’ai livré des logiciels en production pendant des années.</p>',
      '<p>Körper zwei: Ich verantworte die Exportkette, Größe und Maße inklusive.</p>',
      '<p>Body three: I care about accessibility, localization and the details users notice.</p>',
      '<p>Merci pour votre temps et votre considération.</p>',
    ]
    for (const page of LANGUAGES) {
      expect(resolveCoverLetterLanguage(e2eDocxLetter, page)).toBe(page)
    }
  })
})

describe('formatCoverLetterDate', () => {
  it('prints the long date in each language, with no leading zero', () => {
    expect(formatCoverLetterDate(NOVEMBER_2_2026, 'en')).toBe('2 November 2026')
    expect(formatCoverLetterDate(NOVEMBER_2_2026, 'fr')).toBe('2 novembre 2026')
    expect(formatCoverLetterDate(NOVEMBER_2_2026, 'de')).toBe('2. November 2026')
    expect(formatCoverLetterDate(NOVEMBER_2_2026, 'it')).toBe('2 novembre 2026')
  })

  it('prints English day before month, as a Swiss letter is dated', () => {
    for (const date of [NOVEMBER_2_2026, new Date(2026, 0, 1), new Date(2027, 8, 30, 23, 59)]) {
      expect(formatCoverLetterDate(date, 'en')).toBe(
        date.toLocaleDateString('en-GB', { month: 'long', day: 'numeric', year: 'numeric' }),
      )
    }
  })
})

describe('COVER_LETTER_WORDING', () => {
  it('has the English Swiss-letter wording, the greeting unchanged', () => {
    expect(COVER_LETTER_WORDING.en.subject('Engineer')).toBe('Application for Engineer')
    expect(COVER_LETTER_WORDING.en.defaultGreeting).toBe('Dear Hiring Manager,')
    expect(COVER_LETTER_WORDING.en.defaultSignOff).toBe('Kind regards')
  })

  it('has the French, German and Italian Swiss-letter wording, the greetings unchanged', () => {
    expect(COVER_LETTER_WORDING.fr.subject('Développeur')).toBe('Candidature au poste de Développeur')
    expect(COVER_LETTER_WORDING.fr.defaultGreeting).toBe('Madame, Monsieur,')
    expect(COVER_LETTER_WORDING.fr.defaultSignOff).toBe('Meilleures salutations')

    expect(COVER_LETTER_WORDING.de.subject('Entwickler')).toBe('Bewerbung als Entwickler')
    expect(COVER_LETTER_WORDING.de.defaultGreeting).toBe('Sehr geehrte Damen und Herren,')
    expect(COVER_LETTER_WORDING.de.defaultSignOff).toBe('Freundliche Grüsse')

    expect(COVER_LETTER_WORDING.it.subject('Sviluppatore')).toBe('Candidatura per la posizione di Sviluppatore')
    expect(COVER_LETTER_WORDING.it.defaultGreeting).toBe('Gentili Signore e Signori,')
    expect(COVER_LETTER_WORDING.it.defaultSignOff).toBe('Distinti saluti')
  })

  it('has one entry per supported language, and no other', () => {
    expect(Object.keys(COVER_LETTER_WORDING).sort()).toEqual([...LANGUAGES].sort())
  })
})

describe('coverLetterRequestLanguage', () => {
  it.each(LANGUAGES)('takes the supported locale %s from the body', (language) => {
    expect(coverLetterRequestLanguage({ locale: language })).toBe(language)
  })

  it('falls back to the default, English, for anything else', () => {
    for (const body of [
      {},
      { locale: 'es' },
      { locale: 'FR' },
      { locale: 'fr-CH' },
      { locale: ' fr' },
      { locale: '__proto__' },
      { locale: 'toString' },
      { locale: ['fr'] },
      { locale: { toString: () => 'fr' } },
      null,
      'fr',
      ['fr'],
      42,
    ]) {
      expect(coverLetterRequestLanguage(body)).toBe('en')
    }
  })
})
