import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'

/**
 * The compact template picker cards (compact-template-picker, US-001).
 *
 * Measures the shared picker on both surfaces that use it: the create page
 * (/[locale]/dashboard/resumes/new) and the "Create CV from Job" modal on
 * /[locale]/dashboard/jobs. Every locale is measured, because the de and fr
 * descriptions are the longest and must wrap inside the card without growing
 * it past the ceiling or overflowing it.
 *
 * Each page's own HTTP status is asserted and console errors are collected from
 * before navigation, as in the other picker specs: the thumbnails are drawn by
 * the resume templates, and a server-render failure would otherwise be hidden
 * by the client re-render.
 *
 * Nothing leaves the machine: the Job Search page's job list and external fetch
 * are answered by `page.route`.
 */

type TestLocale = 'fr' | 'en' | 'de' | 'it'

const LOCALES: readonly TestLocale[] = ['fr', 'en', 'de', 'it']

/** The job detail panel's "Create CV" button, from `jobs.json -> createCV.button`. */
const CREATE_CV_BUTTON: Record<TestLocale, string> = {
  fr: 'Créer un CV',
  en: 'Create CV',
  de: 'Lebenslauf erstellen',
  it: 'Crea un CV',
}

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
} as const

/**
 * At 768px the create page gives each of the two columns too little width for
 * text beside the thumbnail, so the text goes below it: a taller card, under
 * the height the cards had before this story.
 */
const TABLET = { width: 768, height: 1024 } as const
const TABLET_CARD_MAX_HEIGHT = 340

const CARD_MAX_HEIGHT = 200
const PAGE_GROUP_MAX_HEIGHT_AT_375 = 1100
const MODAL_GROUP_MAX_HEIGHT_AT_1440 = 650
const THUMBNAIL_MIN_WIDTH = 96
const THUMBNAIL_MAX_WIDTH = 128

const JOB = {
  id: 'e2e-template-picker-compact',
  title: 'Product Designer',
  company: 'Listing Company SA',
  location_city: 'Lausanne',
  location_country: 'CH',
  employment_type: 'full-time',
  description: 'Listing description for the compact template picker spec.',
  posted_date: '2026-01-15',
  application_url: 'https://jobs.example.test/offers/product-designer',
  is_saved: false,
}

const FETCHED = {
  jobTitle: 'Senior Product Designer',
  company: 'Northwind Systems',
  jobDescription: 'Northwind Systems is hiring a Senior Product Designer in Lausanne.',
}

const FORBIDDEN_CONSOLE = [
  /document is not defined/i,
  /hydrat/i,
  /Minified React error/i,
  /react/i,
]

function watchConsole(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (FORBIDDEN_CONSOLE.some((pattern) => pattern.test(text))) problems.push(`console: ${text}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror ${error.name}: ${error.message}`))
  return problems
}

async function stubJobSearch(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/jobs',
    (route) => route.fulfill({ json: { jobs: [JOB], total: 1, source: 'mock' } })
  )
  await page.route(
    (url) => url.pathname === '/api/jobs/fetch-external',
    (route) => route.fulfill({ json: { success: true, ...FETCHED } })
  )
}

const group = (page: Page): Locator => page.getByRole('radiogroup')
const radios = (page: Page): Locator => group(page).getByRole('radio')
const drawnThumbnails = (page: Page): Locator =>
  page.locator('[data-testid="template-thumbnail"] [data-testid="resume-document"]')

interface CardMeasure {
  template: string | null
  width: number
  height: number
  thumbnailWidth: number
  thumbnailRatio: number
  /** The thumbnail's top-left corner is the card content box's top-left corner. */
  thumbnailLeading: boolean
  /** Where the name and description sit relative to the thumbnail. */
  layout: 'beside' | 'below' | 'other'
  /** Horizontal pixels any text element overflows its own box or the card's content box by. */
  textOverflow: number
  /** Words of the name or description laid out over more than one line. */
  brokenWords: string[]
}

interface PickerMeasure {
  groupHeight: number
  cards: CardMeasure[]
}

/** Layout boxes of the radiogroup and each card, read in one pass. */
async function measurePicker(page: Page): Promise<PickerMeasure> {
  return group(page).evaluate((element) => {
    const cards = Array.from(element.querySelectorAll<HTMLElement>('[role="radio"]')).map((card) => {
      const cardBox = card.getBoundingClientRect()
      const thumbnail = card.querySelector<HTMLElement>('[data-testid="template-thumbnail"]')
      if (!thumbnail) throw new Error('A card has no thumbnail')
      const thumbnailBox = thumbnail.getBoundingClientRect()
      const style = getComputedStyle(card)
      const contentLeft = cardBox.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
      const contentTop = cardBox.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)
      const contentRight = cardBox.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)

      const name = card.querySelector<HTMLElement>(`#${CSS.escape(card.getAttribute('aria-labelledby') ?? '')}`)
      const description = card.querySelector<HTMLElement>(`#${CSS.escape(card.getAttribute('aria-describedby') ?? '')}`)
      if (!name || !description) throw new Error('A card has no name or description')
      const texts = [name, description]

      const textOverflow = Math.max(
        ...texts.flatMap((text) => {
          const box = text.getBoundingClientRect()
          return [text.scrollWidth - text.clientWidth, box.right - contentRight]
        })
      )

      // A word split across lines, by overflow-wrap or by hyphenation, has
      // more than one line box.
      const brokenWords = texts.flatMap((text) => {
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
        const broken: string[] = []
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
            const range = document.createRange()
            range.setStart(node, match.index)
            range.setEnd(node, match.index + match[0].length)
            const lines = Array.from(range.getClientRects()).filter((rect) => rect.width > 0)
            if (lines.length > 1) broken.push(match[0])
          }
        }
        return broken
      })

      const boxes = texts.map((text) => text.getBoundingClientRect())
      const layout = boxes.every((box) => box.left >= thumbnailBox.right)
        ? 'beside'
        : boxes.every((box) => box.top >= thumbnailBox.bottom)
          ? 'below'
          : 'other'

      return {
        template: card.getAttribute('data-template'),
        width: cardBox.width,
        height: cardBox.height,
        thumbnailWidth: thumbnailBox.width,
        thumbnailRatio: thumbnailBox.height / thumbnailBox.width,
        thumbnailLeading:
          Math.abs(thumbnailBox.left - contentLeft) <= 1 && Math.abs(thumbnailBox.top - contentTop) <= 1,
        layout,
        textOverflow,
        brokenWords,
      } satisfies CardMeasure
    })
    return { groupHeight: element.getBoundingClientRect().height, cards }
  })
}

/** What every card must satisfy, wherever its text sits. */
function expectReadableCards(measure: PickerMeasure, maxCardHeight: number): void {
  expect(measure.cards).toHaveLength(5)
  for (const card of measure.cards) {
    expect(card.height, `${card.template} card height`).toBeLessThanOrEqual(maxCardHeight)
    expect(card.thumbnailWidth, `${card.template} thumbnail width`).toBeGreaterThanOrEqual(THUMBNAIL_MIN_WIDTH)
    expect(card.thumbnailWidth, `${card.template} thumbnail width`).toBeLessThanOrEqual(THUMBNAIL_MAX_WIDTH)
    expect(Math.abs(card.thumbnailRatio - 297 / 210), `${card.template} thumbnail ratio`).toBeLessThan(0.01)
    expect(card.thumbnailLeading, `${card.template} thumbnail on the leading side`).toBe(true)
    expect(card.layout, `${card.template} text beside or below the thumbnail`).not.toBe('other')
    expect(card.textOverflow, `${card.template} text overflow`).toBeLessThanOrEqual(0)
    expect(card.brokenWords, `${card.template} words split across lines`).toEqual([])
  }
}

/** The compact card: text beside the thumbnail, within the height ceiling. */
function expectCompactCards(measure: PickerMeasure): void {
  expectReadableCards(measure, CARD_MAX_HEIGHT)
  for (const card of measure.cards) {
    expect(card.layout, `${card.template} text beside the thumbnail`).toBe('beside')
  }
}

/**
 * The measurements, printed for the story's evidence record, as
 * job-cv-template-picker.spec.ts prints its timing. One line per test.
 */
function logMeasure(surface: string, locale: TestLocale, viewport: { width: number }, measure: PickerMeasure): void {
  const cards = measure.cards
    .map((card) => `${card.template}=${card.height.toFixed(1)}(${card.layout},w${card.width.toFixed(0)})`)
    .join(' ')
  console.log(
    `[template-picker-compact] ${surface} ${locale} @${viewport.width}: group=${measure.groupHeight.toFixed(1)} ` +
      `thumb=${measure.cards[0].thumbnailWidth.toFixed(1)} cards: ${cards}`
  )
}

for (const locale of LOCALES) {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`create page, ${locale} at ${viewport.width}px: compact cards`, async ({ page, authedUser }) => {
      expect(authedUser.id).toBeTruthy()
      const problems = watchConsole(page)
      await page.setViewportSize(viewport)

      const response = await page.goto(`/${locale}/dashboard/resumes/new`)
      expect(response?.status()).toBe(200)
      await expect(group(page)).toBeVisible()
      await expect(drawnThumbnails(page)).toHaveCount(5)

      const measure = await measurePicker(page)
      logMeasure('page', locale, viewport, measure)
      expectCompactCards(measure)
      if (name === 'mobile') {
        expect(measure.groupHeight).toBeLessThanOrEqual(PAGE_GROUP_MAX_HEIGHT_AT_375)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
      }

      expect(problems).toEqual([])
    })
  }

  test(`create page, ${locale} at 768px: no word is split and cards stay bounded`, async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const problems = watchConsole(page)
    await page.setViewportSize(TABLET)

    const response = await page.goto(`/${locale}/dashboard/resumes/new`)
    expect(response?.status()).toBe(200)
    await expect(group(page)).toBeVisible()
    await expect(drawnThumbnails(page)).toHaveCount(5)

    const measure = await measurePicker(page)
    logMeasure('page', locale, TABLET, measure)
    expectReadableCards(measure, TABLET_CARD_MAX_HEIGHT)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    expect(problems).toEqual([])
  })

  test(`"Create CV from Job" modal, ${locale} at 1440px: compact cards`, async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const problems = watchConsole(page)
    await stubJobSearch(page)
    await page.setViewportSize(VIEWPORTS.desktop)

    const response = await page.goto(`/${locale}/dashboard/jobs`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 2, name: JOB.title, exact: true })).toBeVisible()

    await page.getByRole('button', { name: CREATE_CV_BUTTON[locale], exact: true }).click()
    await expect(group(page)).toBeVisible()
    await expect(drawnThumbnails(page)).toHaveCount(5)
    await expect(radios(page)).toHaveCount(5)

    const measure = await measurePicker(page)
    logMeasure('modal', locale, VIEWPORTS.desktop, measure)
    expectCompactCards(measure)
    expect(measure.groupHeight).toBeLessThanOrEqual(MODAL_GROUP_MAX_HEIGHT_AT_1440)

    expect(problems).toEqual([])
  })

  // The modal's narrowest text column: overlay padding and body padding both
  // come out of 375px. No radiogroup ceiling applies at this size.
  test(`"Create CV from Job" modal, ${locale} at 375px: compact cards`, async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const problems = watchConsole(page)
    await stubJobSearch(page)
    await page.setViewportSize(VIEWPORTS.mobile)

    const response = await page.goto(`/${locale}/dashboard/jobs`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 3, name: JOB.title, exact: true })).toBeVisible()

    // Below md the job detail panel, and with it the "Create CV" button and the
    // modal it owns, is hidden (`hidden md:block`). Its wrapper is revealed, as
    // in job-cv-template-picker.spec.ts, after checking that it would not become
    // the containing block of the fixed modal: the geometry measured is then
    // the viewport's alone, which is what a phone would show.
    // A CSS locator, because role locators leave out elements that are not displayed.
    const label = CREATE_CV_BUTTON[locale]
    const createButton = page.locator('button', { hasText: new RegExp(`^\\s*${label}\\s*$`) })
    await expect(createButton).toHaveCount(1)
    await expect(createButton).toBeHidden()
    await createButton.evaluate((button) => {
      const wrapper = button.closest('.hidden')
      if (!(wrapper instanceof HTMLElement)) throw new Error('The job detail wrapper was not found')
      const style = getComputedStyle(wrapper)
      if (style.transform !== 'none' || style.filter !== 'none' || style.contain !== 'none') {
        throw new Error('The wrapper would become the containing block of the fixed modal')
      }
      wrapper.style.display = 'block'
    })

    await createButton.click()
    await expect(group(page)).toBeVisible()
    await expect(drawnThumbnails(page)).toHaveCount(5)
    await expect(radios(page)).toHaveCount(5)

    const measure = await measurePicker(page)
    logMeasure('modal', locale, VIEWPORTS.mobile, measure)
    expectCompactCards(measure)

    expect(problems).toEqual([])
  })
}
