import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * Job Search below the md breakpoint (job-search-mobile-detail, US-001): the
 * list comes first, tapping a job shows its detail in place of the list, and
 * both the "back to results" control and the browser back action return to
 * the same results.
 *
 * Nothing leaves the machine. `/api/jobs` is answered by `page.route` with a
 * paginated result set larger than one page, so infinite scroll really loads
 * a second page. The external job fetch is stubbed, both AI routes fail the
 * test if they are reached, and the employer site "Postuler" opens is
 * answered by the browser context. Saving a job goes to the local stack, and
 * the resume the "Adapter mon CV" flow needs is created through the
 * service-role client.
 *
 * Each page's own HTTP status is asserted and console errors are collected from
 * before navigation, so a server render that failed cannot be hidden by the
 * client re-render.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E job search mobile spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const PHONE = { width: 375, height: 812 } as const
const TABLET = { width: 768, height: 1024 } as const
const DESKTOP = { width: 1440, height: 900 } as const

const STRINGS = {
  fr: {
    backToResults: 'Retour aux résultats',
    apply: 'Postuler',
    save: 'Enregistrer',
    saved: 'Enregistré',
    adaptCV: 'Adapter mon CV',
    createCV: 'Créer un CV',
    adaptTitle: "Adapter le CV à l'offre",
    createTitle: "Créer un CV à partir de l'offre",
    close: 'Fermer',
  },
  de: {
    backToResults: 'Zurück zu den Ergebnissen',
    apply: 'Bewerben',
    save: 'Speichern',
    saved: 'Gespeichert',
    adaptCV: 'Meinen Lebenslauf anpassen',
    createCV: 'Lebenslauf erstellen',
    adaptTitle: 'Lebenslauf an Stelle anpassen',
    createTitle: 'Lebenslauf aus Stelle erstellen',
    close: 'Schließen',
  },
  en: {
    backToResults: 'Back to results',
    apply: 'Apply',
    save: 'Save',
    saved: 'Saved',
    adaptCV: 'Adapt My CV',
    createCV: 'Create CV',
    adaptTitle: 'Adapt CV to Job',
    createTitle: 'Create CV from Job',
    close: 'Close',
  },
} as const

type TestLocale = keyof typeof STRINGS

const PAGE_SIZE = 20
const TOTAL_JOBS = 50
const EMPLOYER_ORIGIN = 'https://jobs.example.test'

function jobTitle(index: number): string {
  return `Product Designer ${String(index + 1).padStart(2, '0')}`
}

function job(index: number) {
  return {
    id: `e2e-job-search-mobile-${index + 1}`,
    title: jobTitle(index),
    company: `Listing Company ${index + 1} SA`,
    location_city: 'Lausanne',
    location_country: 'CH',
    employment_type: 'full-time',
    description:
      'Listing description. You will design product flows for a Swiss software company and work with engineering and research teams every day.',
    posted_date: '2026-01-15',
    application_url: `${EMPLOYER_ORIGIN}/offers/${index + 1}`,
    is_saved: false,
  }
}

const FETCHED = {
  jobTitle: 'Senior Product Designer',
  company: 'Northwind Systems',
  jobDescription:
    'Northwind Systems is hiring a Senior Product Designer in Lausanne. You will own end-to-end design of our scheduling product, ' +
    'run user research, build and maintain the design system, and work closely with product managers and engineers.',
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

async function createResume(userId: string, title: string): Promise<string> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({ user_id: userId, title, template: 'professional' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not create a resume for the test user: ${error?.message ?? 'no row'}`)
  return data.id as string
}

interface JobsRequest {
  page: number
  query: string | null
  employmentType: string | null
}

interface JobSearchStub {
  /** The `/api/jobs` requests, in the order they were made. */
  requests: JobsRequest[]
  /** Pathnames of AI routes the page reached; every test asserts this stays empty. */
  aiCalls: string[]
}

/**
 * Stub every network dependency of the page. Registered before navigation so
 * the page's first `/api/jobs` call is answered.
 */
async function stubJobSearch(page: Page): Promise<JobSearchStub> {
  const requests: JobsRequest[] = []
  const aiCalls: string[] = []

  await page.route(
    (url) => url.pathname === '/api/jobs',
    (route) => {
      const url = new URL(route.request().url())
      const pageNumber = Number(url.searchParams.get('page') ?? '1')
      requests.push({
        page: pageNumber,
        query: url.searchParams.get('query'),
        employmentType: url.searchParams.get('employmentType'),
      })
      const start = (pageNumber - 1) * PAGE_SIZE
      const end = Math.min(start + PAGE_SIZE, TOTAL_JOBS)
      const jobs = Array.from({ length: Math.max(end - start, 0) }, (_, offset) => job(start + offset))
      return route.fulfill({ json: { jobs, total: TOTAL_JOBS, source: 'mock' } })
    }
  )

  await page.route(
    (url) => url.pathname === '/api/jobs/fetch-external',
    (route) => route.fulfill({ json: { success: true, ...FETCHED } })
  )

  // The modals are opened but never submitted here; a call would mean the spec
  // reached a real AI route. A throw inside a route handler does not reliably
  // fail the test, so the call is recorded, aborted and asserted on instead.
  for (const pathname of ['/api/ai/adapt-resume-to-job', '/api/ai/generate-from-job-description']) {
    await page.route(
      (url) => url.pathname === pathname,
      (route) => {
        aiCalls.push(pathname)
        return route.abort()
      }
    )
  }

  // "Postuler" opens the employer's site in a new tab.
  await page.context().route(`${EMPLOYER_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Employer</title><p>Offer</p>' })
  )

  return { requests, aiCalls }
}

async function openJobSearch(page: Page, locale: TestLocale): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/jobs`)
  expect(response?.status()).toBe(200)
  await expect(cardHeading(page, 0)).toBeVisible()
}

const cardHeading = (page: Page, index: number): Locator =>
  page.getByRole('heading', { level: 3, name: jobTitle(index), exact: true })
const detailHeading = (page: Page, index: number): Locator =>
  page.getByRole('heading', { level: 2, name: jobTitle(index), exact: true })
const anyDetailHeading = (page: Page): Locator =>
  page.getByRole('heading', { level: 2, name: /^Product Designer \d{2}$/ })
const backControl = (page: Page, locale: TestLocale): Locator =>
  page.getByRole('button', { name: STRINGS[locale].backToResults, exact: true })
/** The filters' search box: the only text input on the page while no modal is open. */
const searchInput = (page: Page): Locator => page.locator('input[type="text"]')
const employmentSelect = (page: Page): Locator =>
  page.locator('select', { has: page.locator('option[value="full-time"]') })

/** The list's own scroll container (`job-list.tsx`), found from its first card. */
const listScroller = (page: Page): Locator =>
  cardHeading(page, 0).locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]')
const listedCards = (page: Page): Locator => listScroller(page).locator('h3')
const highlightedCards = (page: Page): Locator => listScroller(page).locator('.border-l-teal-500')

async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

/** Let any IntersectionObserver callback that a layout change queued run. */
async function settleObservers(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 200))))
  )
}

interface ListState {
  query: string
  employmentType: string
  cards: number
  highlighted: string | null
  scrollTop: number
}

async function readListState(page: Page): Promise<ListState> {
  const highlighted = highlightedCards(page)
  await expect(highlighted).toHaveCount(1)
  return {
    query: await searchInput(page).inputValue(),
    employmentType: await employmentSelect(page).inputValue(),
    cards: await listedCards(page).count(),
    highlighted: await highlighted.locator('h3').textContent(),
    scrollTop: await listScroller(page).evaluate((element) => element.scrollTop),
  }
}

async function expectListStateEquals(page: Page, before: ListState): Promise<void> {
  await expect(listScroller(page)).toBeVisible()
  const after = await readListState(page)
  expect(after.query).toBe(before.query)
  expect(after.employmentType).toBe(before.employmentType)
  expect(after.cards).toBe(before.cards)
  expect(after.highlighted).toBe(before.highlighted)
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(1)
}

/**
 * Filter, then scroll the list to its end so infinite scroll appends the
 * second page. Leaves 40 of the 50 results loaded, so the scroll sentinel is
 * still mounted and a spurious load would show up as an extra request.
 */
async function filterAndLoadSecondPage(page: Page, requests: JobsRequest[]): Promise<void> {
  await searchInput(page).fill('Designer')
  await employmentSelect(page).selectOption('full-time')
  await expect.poll(() => requests.some((request) => request.employmentType === 'full-time' && request.page === 1)).toBe(true)
  await expect(listedCards(page)).toHaveCount(PAGE_SIZE)

  await listScroller(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(listedCards(page)).toHaveCount(PAGE_SIZE * 2)
  expect(requests.at(-1)).toEqual({ page: 2, query: 'Designer', employmentType: 'full-time' })
}

/** The detail fills the content width, the list is gone, nothing overflows. */
async function expectDetailInPlaceOfList(page: Page, index: number): Promise<void> {
  await expect(detailHeading(page, index)).toBeVisible()
  await expect(listScroller(page)).toBeHidden()
  await expect(searchInput(page)).toBeHidden()
  expect(await documentOverflow(page)).toBeLessThanOrEqual(0)

  // Full width: the panel spans main's content box, which is main's client
  // width (its stable scrollbar gutter excluded) minus its padding.
  const panel = await detailPanel(page).boundingBox()
  const content = await page.locator('main').evaluate((main) => {
    const style = getComputedStyle(main)
    const left = main.getBoundingClientRect().left + main.clientLeft + parseFloat(style.paddingLeft)
    return { left, width: main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) }
  })
  if (!panel) throw new Error('The detail panel has no layout box')
  expect(Math.abs(panel.x - content.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(panel.width - content.width)).toBeLessThanOrEqual(1)
}

/** The panel's root (`job-detail-panel.tsx`), its single scroll container. */
const detailPanel = (page: Page): Locator =>
  anyDetailHeading(page).locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]')

/** No ancestor of the panel may become the containing block of its fixed modals (FR-3). */
async function expectNoContainingBlockAncestor(page: Page): Promise<void> {
  const offenders = await detailPanel(page).evaluate((panel) => {
    const found: string[] = []
    for (let element = panel.parentElement; element; element = element.parentElement) {
      const style = getComputedStyle(element)
      if (style.transform !== 'none' || style.filter !== 'none' || style.contain !== 'none') {
        found.push(`${element.tagName.toLowerCase()}.${element.className}`)
      }
    }
    return found
  })
  expect(offenders).toEqual([])
}

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The control has no layout box')
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
}

/** The modal panel, found from its heading. */
function modal(page: Page, title: string): Locator {
  return page
    .getByRole('heading', { level: 2, name: title, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "shadow-xl")][1]')
}

/** The modal sits inside the viewport and neither it nor its overlay overflows horizontally. */
async function expectModalInViewport(page: Page, panel: Locator): Promise<void> {
  const overflow = await panel.evaluate((element) => {
    const overlay = element.closest('.fixed.inset-0')
    return {
      panel: element.scrollWidth - element.clientWidth,
      overlay: overlay ? overlay.scrollWidth - overlay.clientWidth : null,
    }
  })
  expect(overflow.panel).toBeLessThanOrEqual(0)
  expect(overflow.overlay).not.toBeNull()
  expect(overflow.overlay as number).toBeLessThanOrEqual(0)

  const box = await panel.boundingBox()
  if (!box) throw new Error('The modal has no layout box')
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height)
}

/** Every template option can be scrolled fully into view inside the modal's scrolling body. */
async function expectEveryTemplateReachable(page: Page): Promise<void> {
  const radios = page.getByRole('radiogroup').getByRole('radio')
  await expect(radios).toHaveCount(5)
  const body = await page
    .getByRole('radiogroup')
    .locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]')
    .boundingBox()
  if (!body) throw new Error('The modal body has no layout box')
  // A 1px tolerance: scrolling lands on fractional offsets.
  for (const option of await radios.all()) {
    await option.scrollIntoViewIfNeeded()
    const box = await option.boundingBox()
    if (!box) throw new Error('An option has no layout box')
    expect(box.x).toBeGreaterThanOrEqual(body.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(body.x + body.width + 1)
    expect(box.y).toBeGreaterThanOrEqual(body.y - 1)
    expect(box.y + box.height).toBeLessThanOrEqual(body.y + body.height + 1)
  }
}

test.describe('at 375px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE)
  })

  test('fr: list first, a tapped job replaces it, and the control and browser back both return to the same results', async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const problems = watchConsole(page)
    const { requests, aiCalls } = await stubJobSearch(page)

    // A page before Job Search, so the second back action has somewhere to go.
    const dashboard = await page.goto('/fr/dashboard')
    expect(dashboard?.status()).toBe(200)
    await openJobSearch(page, 'fr')

    // The list first: no detail, no back control.
    await expect(listScroller(page)).toBeVisible()
    await expect(anyDetailHeading(page)).toBeHidden()
    await expect(backControl(page, 'fr')).toHaveCount(0)
    expect(await documentOverflow(page)).toBeLessThanOrEqual(0)

    await filterAndLoadSecondPage(page, requests)

    // A job from the second page, scrolled to inside the list. The tap selects
    // it, so the list comes back with the opened job highlighted and
    // everything else as it was before the tap.
    const target = 29
    await cardHeading(page, target).scrollIntoViewIfNeeded()
    const beforeTap = await readListState(page)
    expect(beforeTap).toMatchObject({ query: 'Designer', employmentType: 'full-time', cards: 40 })
    expect(beforeTap.scrollTop).toBeGreaterThan(0)
    const before = { ...beforeTap, highlighted: jobTitle(target) }
    const historyLength = await page.evaluate(() => window.history.length)
    const requestCount = requests.length

    // Back control, by pointer.
    await cardHeading(page, target).click()
    await expectDetailInPlaceOfList(page, target)
    expect(page.url()).toMatch(/\/fr\/dashboard\/jobs$/)
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength + 1)
    await backControl(page, 'fr').click()
    await expect(anyDetailHeading(page)).toBeHidden()
    await expectListStateEquals(page, before)

    // Back control, by keyboard.
    await cardHeading(page, target).click()
    await expectDetailInPlaceOfList(page, target)
    await expectNoContainingBlockAncestor(page)

    const back = backControl(page, 'fr')
    await expect(back).toBeVisible()
    await expect(back).toHaveText(STRINGS.fr.backToResults)
    await expectTouchTarget(back)
    const backBox = await back.boundingBox()
    const titleBox = await detailHeading(page, target).boundingBox()
    if (!backBox || !titleBox) throw new Error('The back control or the detail title has no layout box')
    expect(backBox.y).toBeLessThan(titleBox.y)
    await expect(back).toBeFocused()
    await page.keyboard.press('Enter')
    // Focus lands on the results, not on <body>.
    await expect(listScroller(page)).toBeFocused()

    await expectListStateEquals(page, before)
    await expect(backControl(page, 'fr')).toHaveCount(0)
    expect(page.url()).toMatch(/\/fr\/dashboard\/jobs$/)

    // Browser back from a different job's detail.
    const other = 27
    await cardHeading(page, other).scrollIntoViewIfNeeded()
    const beforeOther = await readListState(page)
    await cardHeading(page, other).click()
    await expectDetailInPlaceOfList(page, other)
    const afterTap = { ...beforeOther, highlighted: jobTitle(other) }

    await page.goBack()
    await expect(anyDetailHeading(page)).toBeHidden()
    expect(page.url()).toMatch(/\/fr\/dashboard\/jobs$/)
    await expectListStateEquals(page, afterTap)

    // Hiding and showing the list loaded nothing.
    await settleObservers(page)
    expect(requests).toHaveLength(requestCount)

    // The second back leaves Job Search for the page before it.
    await page.goBack()
    await page.waitForURL(/\/fr\/dashboard$/)

    expect(aiCalls).toEqual([])
    expect(problems).toEqual([])
  })

  test('fr: every action of the detail works, and both modals fit and close back to the detail', async ({ page, authedUser }) => {
    const problems = watchConsole(page)
    const { aiCalls } = await stubJobSearch(page)
    // One CV, so "Adapter mon CV" opens its modal directly, without the selector.
    await createResume(authedUser.id, 'Job search mobile, adapt')
    const s = STRINGS.fr

    await openJobSearch(page, 'fr')
    await cardHeading(page, 1).click()
    await expectDetailInPlaceOfList(page, 1)

    for (const name of [s.apply, s.save, s.adaptCV, s.createCV]) {
      await expect(page.getByRole('button', { name, exact: true })).toBeInViewport()
    }

    // "Postuler" opens the offer on the employer's site.
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: s.apply, exact: true }).click()
    const popup = await popupPromise
    await popup.waitForLoadState()
    expect(popup.url()).toBe(`${EMPLOYER_ORIGIN}/offers/2`)
    await popup.close()

    // "Enregistrer" saves the job to the user's applications.
    await page.getByRole('button', { name: s.save, exact: true }).click()
    await expect(page.getByRole('button', { name: s.saved, exact: true })).toBeDisabled()

    // "Adapter mon CV".
    await page.getByRole('button', { name: s.adaptCV, exact: true }).click()
    const adaptPanel = modal(page, s.adaptTitle)
    await expect(adaptPanel).toBeVisible()
    await expectModalInViewport(page, adaptPanel)
    await adaptPanel.getByRole('button', { name: s.close, exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: s.adaptTitle, exact: true })).toHaveCount(0)
    await expectDetailInPlaceOfList(page, 1)

    // "Créer un CV", with every template option reachable.
    await page.getByRole('button', { name: s.createCV, exact: true }).click()
    const createPanel = modal(page, s.createTitle)
    await expect(createPanel).toBeVisible()
    await expectModalInViewport(page, createPanel)
    await expectEveryTemplateReachable(page)
    await createPanel.getByRole('button', { name: s.close, exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: s.createTitle, exact: true })).toHaveCount(0)
    await expectDetailInPlaceOfList(page, 1)
    await expect(backControl(page, 'fr')).toBeVisible()

    expect(aiCalls).toEqual([])
    expect(problems).toEqual([])
  })

  test('en: the back control is in English and returns to the list', async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const problems = watchConsole(page)
    const { aiCalls } = await stubJobSearch(page)

    await openJobSearch(page, 'en')
    await expect(anyDetailHeading(page)).toBeHidden()
    await cardHeading(page, 2).click()
    await expectDetailInPlaceOfList(page, 2)

    const back = backControl(page, 'en')
    await expect(back).toBeVisible()
    await expectTouchTarget(back)
    await back.click()
    await expect(listScroller(page)).toBeVisible()
    await expect(anyDetailHeading(page)).toBeHidden()
    await expect(highlightedCards(page).locator('h3')).toHaveText(jobTitle(2))

    expect(aiCalls).toEqual([])
    expect(problems).toEqual([])
  })

  for (const locale of ['fr', 'de'] as const) {
    test(`${locale}: the four action labels are shown in full`, async ({ page, authedUser }) => {
      expect(authedUser.id).toBeTruthy()
      const problems = watchConsole(page)
      const { aiCalls } = await stubJobSearch(page)
      const s = STRINGS[locale]

      await openJobSearch(page, locale)
      await cardHeading(page, 0).click()
      await expectDetailInPlaceOfList(page, 0)

      for (const name of [s.apply, s.save, s.adaptCV, s.createCV]) {
        const button = page.getByRole('button', { name, exact: true })
        await expect(button).toBeInViewport({ ratio: 1 })
        const label = button.locator('span')
        await expect(label).toHaveText(name)
        const fit = await label.evaluate((element) => {
          const own = element.getBoundingClientRect()
          const parent = element.parentElement?.getBoundingClientRect()
          return {
            clipped: element.scrollWidth - element.clientWidth,
            insideButton: parent !== undefined && own.left >= parent.left - 0.5 && own.right <= parent.right + 0.5,
          }
        })
        expect(fit.clipped, `"${name}" is truncated`).toBeLessThanOrEqual(0)
        expect(fit.insideButton, `"${name}" overflows its button`).toBe(true)
      }
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0)

      expect(aiCalls).toEqual([])
      expect(problems).toEqual([])
    })
  }
})

for (const viewport of [TABLET, DESKTOP]) {
  test(`at ${viewport.width}px: list and detail side by side, the first job selected, no back control`, async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const problems = watchConsole(page)
    const { aiCalls } = await stubJobSearch(page)
    await page.setViewportSize(viewport)

    await openJobSearch(page, 'fr')
    await expect(detailHeading(page, 0)).toBeVisible()
    await expect(highlightedCards(page).locator('h3')).toHaveText(jobTitle(0))
    await expect(backControl(page, 'fr')).toHaveCount(0)

    // The phone-only markup stays out: the list is not a focus target, and the
    // long actions keep their original classes and truncating labels.
    await expect(listScroller(page)).not.toHaveAttribute('tabindex')
    for (const name of [STRINGS.fr.adaptCV, STRINGS.fr.createCV]) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).not.toHaveClass(/col-span-2/)
      await expect(button.locator('span')).toHaveClass('truncate')
    }

    const list = await listScroller(page).boundingBox()
    const detail = await detailPanel(page).boundingBox()
    if (!list || !detail) throw new Error('The list or the detail has no layout box')
    expect(detail.x).toBeGreaterThan(list.x + list.width)
    expect(Math.abs(detail.y - list.y)).toBeLessThanOrEqual(1)
    expect(await documentOverflow(page)).toBeLessThanOrEqual(0)

    // Selecting another job changes the detail in place and adds no history entry.
    const historyLength = await page.evaluate(() => window.history.length)
    await cardHeading(page, 1).click()
    await expect(detailHeading(page, 1)).toBeVisible()
    await expect(listScroller(page)).toBeVisible()
    await expect(backControl(page, 'fr')).toHaveCount(0)
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength)

    expect(aiCalls).toEqual([])
    expect(problems).toEqual([])
  })
}
