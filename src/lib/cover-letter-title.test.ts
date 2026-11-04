import { describe, expect, it } from 'vitest'
import type { CoverLetterLanguage } from './cover-letter-language'
import { COVER_LETTER_FIELD_LIMITS } from './cover-letter-limits'
import { coverLetterLanguage } from './cover-letter-pdf-html'
import {
  COVER_LETTER_DEFAULT_TITLES,
  buildDefaultCoverLetterTitle,
  buildNewDefaultCoverLetterTitle,
  coverLetterCardLanguage,
  displayCoverLetterTitle,
  matchDefaultCoverLetterTitle,
  type CoverLetterTitleFields,
} from './cover-letter-title'

const LANGUAGES: readonly CoverLetterLanguage[] = ['fr', 'en', 'de', 'it']
const JOB = 'Software Engineer'
const COMPANY = 'Acme SA'

/** The FR-5 wording, spelled out so a change to the constants fails here. */
const EXPECTED: Readonly<Record<CoverLetterLanguage, string>> = {
  en: 'Cover Letter - Software Engineer at Acme SA',
  fr: 'Lettre de motivation - Software Engineer chez Acme SA',
  de: 'Anschreiben - Software Engineer bei Acme SA',
  it: 'Lettera di presentazione - Software Engineer presso Acme SA',
}

/** One unmistakable paragraph per language, as the editor stores them. */
const PARAGRAPH: Readonly<Record<CoverLetterLanguage, string>> = {
  fr: "<p>Je vous écris pour vous présenter ma candidature au poste de développeur. Avec cinq ans d'expérience dans une équipe agile, je suis convaincu que mon profil correspond à vos besoins et à votre entreprise.</p>",
  de: '<p>Mit großem Interesse habe ich Ihre Anzeige gelesen und bewerbe mich für die Stelle als Entwickler. In meiner bisherigen Erfahrung bei einer Firma habe ich die Aufgaben im Team mit Freude übernommen und bin sicher, dass ich auch Ihre Erwartungen erfülle.</p>',
  it: '<p>Con la presente desidero candidarmi per la posizione di sviluppatore presso la vostra azienda. Ho maturato una solida esperienza nel settore e sono convinto che le mie competenze siano utili al vostro team, anche grazie alla mia capacità di lavorare con gli altri.</p>',
  en: '<p>I am writing to apply for the position of developer at your company. With five years of experience in the field, I am confident that my skills and my work will be an asset to your team and to the people you serve.</p>',
}

function letter(overrides: Partial<CoverLetterTitleFields>): CoverLetterTitleFields {
  return {
    title: EXPECTED.en,
    job_title: JOB,
    company_name: COMPANY,
    opening_paragraph: null,
    body_paragraphs: [],
    closing_paragraph: null,
    ...overrides,
  }
}

/** The title a card shows: its language resolved once, as the card does. */
function cardTitle(input: CoverLetterTitleFields, page: CoverLetterLanguage): string {
  return displayCoverLetterTitle(input, coverLetterCardLanguage(input, page))
}

describe('coverLetterCardLanguage', () => {
  it.each(LANGUAGES)('resolves a %s letter to its language, whatever the page locale', (language) => {
    for (const page of LANGUAGES) {
      expect(coverLetterCardLanguage(letter({ opening_paragraph: PARAGRAPH[language] }), page)).toBe(language)
    }
  })

  it('reads the body and the closing too', () => {
    expect(coverLetterCardLanguage(letter({ body_paragraphs: [PARAGRAPH.de] }), 'fr')).toBe('de')
    expect(coverLetterCardLanguage(letter({ closing_paragraph: PARAGRAPH.it }), 'en')).toBe('it')
  })

  it.each(LANGUAGES)("falls back to the %s page's locale when the letter has no text", (page) => {
    expect(coverLetterCardLanguage(letter({}), page)).toBe(page)
  })

  it('is the language the PDF and Word exports use', () => {
    for (const language of LANGUAGES) {
      for (const page of LANGUAGES) {
        for (const input of [letter({ opening_paragraph: PARAGRAPH[language] }), letter({})]) {
          expect(coverLetterCardLanguage(input, page)).toBe(coverLetterLanguage(input, page))
        }
      }
    }
  })

  it('does not depend on the title, so a user title gets a flag too', () => {
    const input = letter({ title: 'Meine Bewerbung', opening_paragraph: PARAGRAPH.de })
    expect(coverLetterCardLanguage(input, 'en')).toBe('de')
  })
})

describe('displayCoverLetterTitle with a resolved language', () => {
  it.each(LANGUAGES)('builds a default title in the %s language it is given', (language) => {
    expect(displayCoverLetterTitle(letter({ title: `${EXPECTED.en} (DE)` }), language)).toBe(EXPECTED[language])
  })

  it('returns a user title as stored, whatever the language', () => {
    for (const language of LANGUAGES) {
      expect(displayCoverLetterTitle(letter({ title: 'My letter' }), language)).toBe('My letter')
    }
  })
})

describe('buildDefaultCoverLetterTitle', () => {
  it.each(LANGUAGES)('builds the FR-5 pattern in %s', (language) => {
    expect(buildDefaultCoverLetterTitle(language, JOB, COMPANY)).toBe(EXPECTED[language])
    expect(COVER_LETTER_DEFAULT_TITLES[language](JOB, COMPANY)).toBe(EXPECTED[language])
  })
})

describe('matchDefaultCoverLetterTitle', () => {
  it.each(LANGUAGES)('matches the %s pattern without a suffix', (language) => {
    expect(matchDefaultCoverLetterTitle(EXPECTED[language], JOB, COMPANY)).toEqual({ language, suffix: null })
  })

  it.each(LANGUAGES.flatMap((language) => LANGUAGES.map((suffix) => [language, suffix] as const)))(
    'matches the %s pattern with the (%s) suffix',
    (language, suffix) => {
      const title = `${EXPECTED[language]} (${suffix.toUpperCase()})`
      expect(matchDefaultCoverLetterTitle(title, JOB, COMPANY)).toEqual({ language, suffix })
    },
  )

  it('leaves a user title unmatched', () => {
    expect(matchDefaultCoverLetterTitle('My letter for Acme', JOB, COMPANY)).toBeNull()
  })

  it('needs both a job title and a company', () => {
    for (const [job, company] of [
      [null, COMPANY],
      [JOB, null],
      ['', COMPANY],
      [JOB, ''],
      ['   ', COMPANY],
      [JOB, '  '],
      [undefined, undefined],
    ] as const) {
      expect(matchDefaultCoverLetterTitle(EXPECTED.en, job, company)).toBeNull()
    }
    expect(matchDefaultCoverLetterTitle('Cover Letter -  at ', '', '')).toBeNull()
  })

  it("does not match a pattern built from another letter's job title or company", () => {
    expect(matchDefaultCoverLetterTitle(EXPECTED.en, 'Designer', COMPANY)).toBeNull()
    expect(matchDefaultCoverLetterTitle(EXPECTED.en, JOB, 'Globex')).toBeNull()
  })

  it('compares exactly: case and whitespace are not normalised', () => {
    for (const title of [
      'cover letter - Software Engineer at Acme SA',
      'Cover Letter - software engineer at Acme SA',
      ' Cover Letter - Software Engineer at Acme SA',
      'Cover Letter - Software Engineer at Acme SA ',
      'Cover Letter -  Software Engineer at Acme SA',
      'Cover Letter - Software Engineer  at Acme SA',
      'Cover Letter – Software Engineer at Acme SA',
    ]) {
      expect(matchDefaultCoverLetterTitle(title, JOB, COMPANY)).toBeNull()
    }
  })

  it('accepts exactly one well-formed translation suffix', () => {
    for (const title of [
      `${EXPECTED.en} (DE) (FR)`,
      `${EXPECTED.en} (de)`,
      `${EXPECTED.en}(DE)`,
      `${EXPECTED.en}  (DE)`,
      `${EXPECTED.en} (ES)`,
      `${EXPECTED.en} (DE) `,
      `${EXPECTED.en} (Copy)`,
    ]) {
      expect(matchDefaultCoverLetterTitle(title, JOB, COMPANY)).toBeNull()
    }
  })

  it('reads a company that itself ends in "(XX)" as part of the pattern', () => {
    const company = 'Acme (DE)'
    expect(matchDefaultCoverLetterTitle(`Cover Letter - ${JOB} at ${company}`, JOB, company)).toEqual({
      language: 'en',
      suffix: null,
    })
    expect(matchDefaultCoverLetterTitle(`Cover Letter - ${JOB} at ${company} (IT)`, JOB, company)).toEqual({
      language: 'en',
      suffix: 'it',
    })
  })

  it('treats job titles and companies as literal text, not patterns', () => {
    expect(matchDefaultCoverLetterTitle('Cover Letter - C++ Dev at A.B (Ltd)', 'C++ Dev', 'A.B (Ltd)')).toEqual({
      language: 'en',
      suffix: null,
    })
    expect(matchDefaultCoverLetterTitle('Cover Letter - CXX Dev at AxB (Ltd)', 'C++ Dev', 'A.B (Ltd)')).toBeNull()
  })
})

describe('displayCoverLetterTitle', () => {
  it.each(LANGUAGES)('shows the English default title of a %s letter in that language', (language) => {
    for (const page of LANGUAGES) {
      expect(cardTitle(letter({ opening_paragraph: PARAGRAPH[language] }), page)).toBe(
        EXPECTED[language],
      )
    }
  })

  it.each(LANGUAGES)('drops a translation suffix from a %s letter', (language) => {
    const title = `${EXPECTED.en} (${language.toUpperCase()})`
    expect(cardTitle(letter({ title, body_paragraphs: [PARAGRAPH[language]] }), 'en')).toBe(
      EXPECTED[language],
    )
  })

  it.each(LANGUAGES)('keeps a default title already in the %s letter language', (language) => {
    const shown = cardTitle(
      letter({ title: EXPECTED[language], closing_paragraph: PARAGRAPH[language] }),
      'en',
    )
    expect(shown).toBe(EXPECTED[language])
  })

  it('reads the opening, the body and the closing, as the PDF does', () => {
    expect(cardTitle(letter({ body_paragraphs: [PARAGRAPH.de] }), 'fr')).toBe(EXPECTED.de)
    expect(cardTitle(letter({ closing_paragraph: PARAGRAPH.it }), 'fr')).toBe(EXPECTED.it)
  })

  it.each(LANGUAGES)("falls back to the %s page's locale when the letter has no text", (page) => {
    expect(cardTitle(letter({}), page)).toBe(EXPECTED[page])
  })

  it.each(LANGUAGES)('shows a user title exactly as stored, for a %s letter', (language) => {
    for (const title of ['Ma lettre pour Acme', `${EXPECTED.en} `, `${EXPECTED.en} (Copy)`, '']) {
      expect(cardTitle(letter({ title, opening_paragraph: PARAGRAPH[language] }), 'en')).toBe(title)
    }
  })

  it('shows the stored title when the job title or company is missing', () => {
    expect(
      cardTitle(letter({ job_title: null, opening_paragraph: PARAGRAPH.de }), 'en'),
    ).toBe(EXPECTED.en)
    expect(
      cardTitle(letter({ company_name: '', opening_paragraph: PARAGRAPH.de }), 'en'),
    ).toBe(EXPECTED.en)
  })

  it('does not change the letter it is given', () => {
    const input = letter({ title: `${EXPECTED.en} (DE)`, opening_paragraph: PARAGRAPH.de })
    const snapshot = structuredClone(input)
    cardTitle(input, 'en')
    expect(input).toEqual(snapshot)
  })
})

describe('buildNewDefaultCoverLetterTitle', () => {
  const LIMIT = COVER_LETTER_FIELD_LIMITS.title

  it.each(LANGUAGES)('builds the %s pattern unchanged when it fits the title limit', (language) => {
    expect(buildNewDefaultCoverLetterTitle(language, JOB, COMPANY)).toBe(EXPECTED[language])
  })

  it.each(LANGUAGES)('a built %s title is a default title of its own letter (FR-6)', (language) => {
    expect(matchDefaultCoverLetterTitle(buildNewDefaultCoverLetterTitle(language, JOB, COMPANY), JOB, COMPANY)).toEqual({
      language,
      suffix: null,
    })
  })

  it('keeps a pattern exactly at the limit whole', () => {
    // `Anschreiben - ` + job + ` bei ` + company, sized to LIMIT exactly.
    const company = 'C'.repeat(LIMIT - 'Anschreiben - J bei '.length)
    const title = buildNewDefaultCoverLetterTitle('de', 'J', company)
    expect(title).toHaveLength(LIMIT)
    expect(matchDefaultCoverLetterTitle(title, 'J', company)).toEqual({ language: 'de', suffix: null })
  })

  it.each(LANGUAGES)('cuts a %s pattern over the limit to the limit, and it is then a user title', (language) => {
    const job = 'J'.repeat(COVER_LETTER_FIELD_LIMITS.job_title)
    const company = 'C'.repeat(COVER_LETTER_FIELD_LIMITS.company_name)
    const title = buildNewDefaultCoverLetterTitle(language, job, company)
    expect(title).toBe(buildDefaultCoverLetterTitle(language, job, company).slice(0, LIMIT))
    expect(matchDefaultCoverLetterTitle(title, job, company)).toBeNull()
  })

  it('never splits a surrogate pair at the cut, and drops the whitespace the cut exposes', () => {
    const prefix = 'Cover Letter - '
    // The emoji's high surrogate lands on the last allowed code unit.
    const job = `${'j'.repeat(LIMIT - prefix.length - 1)}😀`
    const cut = buildNewDefaultCoverLetterTitle('en', job, 'Acme')
    expect(cut).toBe(`${prefix}${'j'.repeat(LIMIT - prefix.length - 1)}`)
    expect(cut).toHaveLength(LIMIT - 1)

    // The cut falls just before " at ".
    const spaced = buildNewDefaultCoverLetterTitle('en', 'j'.repeat(LIMIT - prefix.length), 'Acme')
    expect(spaced).toBe(`${prefix}${'j'.repeat(LIMIT - prefix.length)}`)
    // The cut ends on a space of the job title: it is trimmed away.
    const endsOnSpace = buildNewDefaultCoverLetterTitle('en', `${'j'.repeat(LIMIT - prefix.length - 1)} `, 'Acme')
    expect(endsOnSpace).toBe(`${prefix}${'j'.repeat(LIMIT - prefix.length - 1)}`)
  })
})
