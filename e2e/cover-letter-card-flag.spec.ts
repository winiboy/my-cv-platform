import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { admin, rect } from './fixtures/cover-letter-preview'

/**
 * Each cover-letter card shows a flag of the letter's language at its
 * bottom-right (cover-letter-preview-and-card-language, US-005).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The flag's language comes from the stored letter's paragraphs with the
 * page's locale as the fallback, its SVG must be the translation buttons'
 * own, and "overlaps nothing" is a property of the laid-out card at the
 * dashboard grid's widths. Only the rendered page shows all three.
 *
 * WHAT IS ASSERTED, under /fr, /en, /de and /it
 *
 *   - A letter in each of fr, en, de and it, and one with no text: exactly one
 *     flag per card, `data-language` naming the letter's language (the page's
 *     for the empty letter), and the same language as the card's title.
 *   - A user title on a German letter: the DE flag, title untouched.
 *   - The flag's SVG is byte-for-byte the editor's translation button flag of
 *     the same code; the GB flag carries its `#012169` field.
 *   - Its accessible name and tooltip name the language in the page's locale.
 *   - At 1440, 1024, 768 and 375 px: it sits in the card's bottom-right
 *     corner, inside the padding, and intersects neither the title, the
 *     badges row, the "Updated" date nor the kebab button.
 *   - The kebab menu, when open, still covers the flag, and Escape closes it.
 */

type Language = 'fr' | 'en' | 'de' | 'it'

const LOCALES: readonly Language[] = ['fr', 'en', 'de', 'it']

/** The translation buttons' order, `LANGUAGE_FLAG_OPTIONS`. */
const FLAG_ORDER: readonly Language[] = ['en', 'fr', 'de', 'it']

const JOB = 'Software Engineer'
const COMPANY = 'Acme SA'

/** The FR-5 patterns, spelled out so the spec does not trust the code under test. */
const DEFAULT_TITLE: Readonly<Record<Language, string>> = {
  en: `Cover Letter - ${JOB} at ${COMPANY}`,
  fr: `Lettre de motivation - ${JOB} chez ${COMPANY}`,
  de: `Anschreiben - ${JOB} bei ${COMPANY}`,
  it: `Lettera di presentazione - ${JOB} presso ${COMPANY}`,
}

/** The flag's accessible name: [page locale][letter language]. */
const FLAG_LABEL: Readonly<Record<Language, Readonly<Record<Language, string>>>> = {
  en: { en: 'Language: English', fr: 'Language: French', de: 'Language: German', it: 'Language: Italian' },
  fr: { en: 'Langue : anglais', fr: 'Langue : français', de: 'Langue : allemand', it: 'Langue : italien' },
  de: { en: 'Sprache: Englisch', fr: 'Sprache: Französisch', de: 'Sprache: Deutsch', it: 'Sprache: Italienisch' },
  it: { en: 'Lingua: inglese', fr: 'Lingua: francese', de: 'Lingua: tedesco', it: 'Lingua: italiano' },
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
  /** The letter's language under the page's locale. */
  language: (page: Language) => Language
  /** The heading the card shows under the page's locale. */
  title: (page: Language) => string
}

const CASES: readonly CardCase[] = [
  // A score gives this card a badges row, so the flag is checked against one.
  ...(['fr', 'en', 'de', 'it'] as const).map(
    (language): CardCase => ({
      name: `${language} letter`,
      row: { title: DEFAULT_TITLE.en, analysis_score: language === 'fr' ? 85 : null, ...PARAGRAPHS[language] },
      language: () => language,
      title: () => DEFAULT_TITLE[language],
    }),
  ),
  {
    name: 'letter with no text',
    row: { title: DEFAULT_TITLE.en, ...NO_TEXT },
    language: (page) => page,
    title: (page) => DEFAULT_TITLE[page],
  },
  {
    name: 'user title on a German letter',
    row: { title: 'Meine Bewerbung bei Acme', ...PARAGRAPHS.de },
    language: () => 'de',
    title: () => 'Meine Bewerbung bei Acme',
  },
]

/** The dashboard grid's card widths: three, two and one column. */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 900 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
] as const

type Box = Awaited<ReturnType<typeof rect>>

/** The rectangle of the element's rendered text, not of its (full-width) box. */
async function textRect(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const { top, bottom, left, right, width, height } = range.getBoundingClientRect()
    return { top, bottom, left, right, width, height }
  })
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/** The translation buttons' flag SVGs, by language, from the editor of `letterId`. */
async function translationFlags(page: Page, locale: Language, letterId: string): Promise<Record<Language, string>> {
  await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  const svgs = page.locator('[role="group"][aria-labelledby="cover-letter-translate-label"] button svg')
  await expect(svgs).toHaveCount(FLAG_ORDER.length)
  const html = await svgs.evaluateAll((elements) => elements.map((element) => element.outerHTML))
  return Object.fromEntries(FLAG_ORDER.map((code, index) => [code, html[index]])) as Record<Language, string>
}

function cardOf(page: Page, locale: Language, id: string): { card: Locator; titleLink: Locator } {
  const titleLink = page.locator(`a[href="/${locale}/dashboard/cover-letters/${id}/edit"]:has(h3)`)
  return { card: titleLink.locator('xpath=..'), titleLink }
}

for (const locale of LOCALES) {
  test(`cards under /${locale} show one flag of each letter's language at the bottom-right`, async ({
    page,
    authedUser,
  }) => {
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
      .select('id')
    expect(error, error?.message).toBeNull()
    const seeded = data as { id: string }[]
    expect(seeded).toHaveLength(CASES.length)

    const translationSvg = await translationFlags(page, locale, seeded[0].id)
    expect(translationSvg.en).toContain('#012169')

    await page.setViewportSize(VIEWPORTS[0])
    const response = await page.goto(`/${locale}/dashboard/cover-letters`)
    expect(response?.status()).toBe(200)

    // Every card on the page has exactly one flag.
    await expect(page.getByTestId('cover-letter-card-flag')).toHaveCount(CASES.length)

    for (const [index, { name, language, title }] of CASES.entries()) {
      const { card, titleLink } = cardOf(page, locale, seeded[index].id)
      const expected = language(locale)
      const flags = card.getByTestId('cover-letter-card-flag')
      await expect(flags, name).toHaveCount(1)
      const flag = flags.first()

      await expect(titleLink.locator('h3'), name).toHaveText(title(locale), { useInnerText: true })
      await expect(flag, name).toHaveAttribute('data-language', expected)
      await expect(flag, name).toHaveAttribute('role', 'img')
      await expect(flag, name).toHaveAttribute('aria-label', FLAG_LABEL[locale][expected])
      await expect(flag, name).toHaveAttribute('title', FLAG_LABEL[locale][expected])
      await expect(card.getByRole('img', { name: FLAG_LABEL[locale][expected], exact: true }), name).toHaveCount(1)

      const svg = flag.locator('svg')
      await expect(svg, name).toHaveCount(1)
      await expect(svg, name).toHaveAttribute('aria-hidden', 'true')
      expect(await svg.evaluate((element) => element.outerHTML), name).toBe(translationSvg[expected])
    }

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport)
      for (const [index, { name }] of CASES.entries()) {
        const where = `${name} at ${viewport.width}px`
        const { card, titleLink } = cardOf(page, locale, seeded[index].id)
        const flag = card.getByTestId('cover-letter-card-flag')
        await flag.scrollIntoViewIfNeeded()

        const cardBox = await rect(card)
        const flagBox = await rect(flag)
        // p-6 (24 px) plus the 1 px border, with a pixel of rounding.
        expect(cardBox.right - flagBox.right, where).toBeGreaterThanOrEqual(23)
        expect(cardBox.right - flagBox.right, where).toBeLessThanOrEqual(26)
        expect(cardBox.bottom - flagBox.bottom, where).toBeGreaterThanOrEqual(23)
        expect(cardBox.bottom - flagBox.bottom, where).toBeLessThanOrEqual(30)

        // The card's last content row, "Updated {date}", is a full-width
        // block: its text, not its box, is what the flag must not cover.
        const date = card.locator(':scope > div:last-of-type')
        await expect(date, where).toContainText(/\d{4}/)
        const others: [string, Locator, (locator: Locator) => Promise<Box>][] = [
          ['title', titleLink, rect],
          ['date', date, textRect],
          ['kebab button', card.locator('button').first(), rect],
        ]
        if (CASES[index].row.analysis_score !== null && CASES[index].row.analysis_score !== undefined) {
          others.push(['badges row', card.locator('div.flex-wrap'), rect])
        }
        for (const [label, other, measure] of others) {
          await expect(other, `${where}: ${label}`).toHaveCount(1)
          expect(intersects(flagBox, await measure(other)), `${where}: flag overlaps the ${label}`).toBe(false)
        }
      }
    }

    // The open kebab menu still lies above the flag, and Escape still closes it.
    await page.setViewportSize(VIEWPORTS[0])
    const { card } = cardOf(page, locale, seeded[0].id)
    const flag = card.getByTestId('cover-letter-card-flag')
    const kebab = card.locator('button').first()
    await kebab.click()
    const menu = kebab.locator('xpath=following-sibling::div[1]')
    await expect(menu).toBeVisible()
    const flagBox = await rect(flag)
    const topmostIsMenu = await menu.evaluate(
      (element, { x, y }) => element.contains(document.elementFromPoint(x, y)),
      { x: (flagBox.left + flagBox.right) / 2, y: (flagBox.top + flagBox.bottom) / 2 },
    )
    expect(topmostIsMenu, 'the open menu covers the flag').toBe(true)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(kebab).toBeFocused()
  })
}
