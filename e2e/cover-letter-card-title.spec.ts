import { test, expect } from './fixtures/auth'
import type { Page } from '@playwright/test'
import { admin } from './fixtures/cover-letter-preview'

/**
 * A cover-letter card shows a default title in the letter's own language
 * (cover-letter-preview-and-card-language, US-003).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The card is rendered from the stored row on the cards page, and the
 * language comes from the letter's paragraphs with the page's locale as the
 * fallback. Only the rendered page under each locale shows both halves, and
 * only the browser's own traffic shows that viewing writes nothing back.
 *
 * WHAT IS ASSERTED, under /fr, /en, /de and /it
 *
 *   - An English default title, with or without a ` (XX)` suffix, on a
 *     French, German, Italian or English letter: the FR-5 pattern in the
 *     letter's language, same job title and company, no suffix.
 *   - A default title already in the letter's language: unchanged.
 *   - A letter with no text: the page's language's pattern.
 *   - A user title, including one in pattern form but naming another job
 *     title: exactly as stored. (Whitespace and case edge cases are unit
 *     tested; `toHaveText` normalises whitespace, so it cannot tell them.)
 *   - No write to `cover_letters` while the page is viewed, and every stored
 *     title unchanged afterwards.
 */

type Language = 'fr' | 'en' | 'de' | 'it'

const LOCALES: readonly Language[] = ['fr', 'en', 'de', 'it']

const JOB = 'Software Engineer'
const COMPANY = 'Acme SA'

/** The FR-5 patterns, spelled out so the spec does not trust the code under test. */
const DEFAULT_TITLE: Readonly<Record<Language, string>> = {
  en: `Cover Letter - ${JOB} at ${COMPANY}`,
  fr: `Lettre de motivation - ${JOB} chez ${COMPANY}`,
  de: `Anschreiben - ${JOB} bei ${COMPANY}`,
  it: `Lettera di presentazione - ${JOB} presso ${COMPANY}`,
}

/** Paragraphs the language detection reads unmistakably, one set per language. */
const PARAGRAPHS: Readonly<
  Record<Language, { opening_paragraph: string; body_paragraphs: string[]; closing_paragraph: string }>
> = {
  fr: {
    opening_paragraph:
      "<p>Je vous écris pour vous présenter ma candidature au poste d'ingénieur logiciel. Avec cinq ans d'expérience dans une équipe agile, je suis convaincu que mon profil correspond à vos besoins.</p>",
    body_paragraphs: ["<p>Au sein de mon équipe actuelle, je suis responsable de la chaîne d'export et des tests.</p>"],
    closing_paragraph: '<p>Je vous remercie pour votre attention et reste à votre disposition.</p>',
  },
  de: {
    opening_paragraph:
      '<p>Mit großem Interesse habe ich Ihre Anzeige gelesen und bewerbe mich für die Stelle als Softwareentwickler.</p>',
    body_paragraphs: [
      '<p>In meiner bisherigen Erfahrung bei einer Firma habe ich die Aufgaben im Team mit Freude übernommen.</p>',
    ],
    closing_paragraph: '<p>Ich bin sicher, dass ich auch Ihre Erwartungen erfülle, und freue mich auf ein Gespräch.</p>',
  },
  it: {
    opening_paragraph:
      '<p>Con la presente desidero candidarmi per la posizione di sviluppatore presso la vostra azienda. Ho maturato una solida esperienza nel settore, anche grazie alla mia capacità di lavorare con gli altri.</p>',
    body_paragraphs: [
      '<p>Ho maturato una solida esperienza nel settore e sono convinto che le mie competenze siano utili al vostro team.</p>',
    ],
    closing_paragraph: '<p>La ringrazio per la sua attenzione e resto a disposizione per un colloquio.</p>',
  },
  en: {
    opening_paragraph:
      '<p>I am writing to apply for the position of developer at your company. With five years of experience in the field, I am confident that my skills will be an asset to your team.</p>',
    body_paragraphs: ['<p>In my current team I am responsible for the export pipeline and its tests.</p>'],
    closing_paragraph: '<p>Thank you for your time and consideration. I look forward to hearing from you.</p>',
  },
}

const NO_TEXT = { opening_paragraph: null, body_paragraphs: [], closing_paragraph: null }

interface CardCase {
  name: string
  row: Record<string, unknown>
  /** The heading the card shows under the page's locale. */
  expected: (page: Language) => string
}

const CASES: readonly CardCase[] = [
  {
    name: 'English default on a French letter',
    row: { title: DEFAULT_TITLE.en, ...PARAGRAPHS.fr },
    expected: () => DEFAULT_TITLE.fr,
  },
  {
    name: 'English default with (DE) on a German letter',
    row: { title: `${DEFAULT_TITLE.en} (DE)`, ...PARAGRAPHS.de },
    expected: () => DEFAULT_TITLE.de,
  },
  {
    name: 'English default with (IT) on an Italian letter',
    row: { title: `${DEFAULT_TITLE.en} (IT)`, ...PARAGRAPHS.it },
    expected: () => DEFAULT_TITLE.it,
  },
  {
    name: 'English default with (EN) on an English letter',
    row: { title: `${DEFAULT_TITLE.en} (EN)`, ...PARAGRAPHS.en },
    expected: () => DEFAULT_TITLE.en,
  },
  {
    name: 'German default already on a German letter',
    row: { title: DEFAULT_TITLE.de, ...PARAGRAPHS.de },
    expected: () => DEFAULT_TITLE.de,
  },
  {
    name: 'English default on a letter with no text',
    row: { title: DEFAULT_TITLE.en, ...NO_TEXT },
    expected: (page) => DEFAULT_TITLE[page],
  },
  {
    name: 'user title on a German letter',
    row: { title: 'Meine Bewerbung bei Acme', ...PARAGRAPHS.de },
    expected: () => 'Meine Bewerbung bei Acme',
  },
  {
    name: 'pattern-shaped user title naming another job, on a French letter',
    row: { title: `Cover Letter - Designer at ${COMPANY}`, ...PARAGRAPHS.fr },
    expected: () => `Cover Letter - Designer at ${COMPANY}`,
  },
]

/** Every write the browser sends for a cover letter: viewing must send none. */
function recordLetterWrites(page: Page): string[] {
  const writes: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (request.method() !== 'GET' && (url.includes('/rest/v1/cover_letters') || url.includes('/api/cover-letters'))) {
      writes.push(`${request.method()} ${url}`)
    }
  })
  return writes
}

for (const locale of LOCALES) {
  test(`cards under /${locale} show default titles in each letter's language`, async ({ page, authedUser }) => {
    const { data, error } = await admin()
      .from('cover_letters')
      .insert(
        CASES.map(({ row }) => ({
          user_id: authedUser.id,
          job_title: JOB,
          company_name: COMPANY,
          sender_name: 'Zoë Lovelace',
          ...row,
        })),
      )
      .select('id, title')
    expect(error, error?.message).toBeNull()
    const seeded = data as { id: string; title: string }[]
    expect(seeded).toHaveLength(CASES.length)

    const writes = recordLetterWrites(page)
    const response = await page.goto(`/${locale}/dashboard/cover-letters`)
    expect(response?.status()).toBe(200)

    for (const [index, { name, expected }] of CASES.entries()) {
      const heading = page.locator(`a[href="/${locale}/dashboard/cover-letters/${seeded[index].id}/edit"] h3`)
      await expect(heading, name).toHaveText(expected(locale), { useInnerText: true })
    }

    expect(writes).toEqual([])

    const { data: stored, error: readError } = await admin()
      .from('cover_letters')
      .select('id, title')
      .eq('user_id', authedUser.id)
    expect(readError, readError?.message).toBeNull()
    const storedTitles = new Map((stored as { id: string; title: string }[]).map(({ id, title }) => [id, title]))
    for (const { id, title } of seeded) {
      expect(storedTitles.get(id)).toBe(title)
    }
  })
}
