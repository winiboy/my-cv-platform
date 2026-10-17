import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page, Route } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'
import en from '../src/locales/en/jobs.json'
import fr from '../src/locales/fr/jobs.json'
import de from '../src/locales/de/jobs.json'
import it_ from '../src/locales/it/jobs.json'
import enCommon from '../src/locales/en/common.json'
import frCommon from '../src/locales/fr/common.json'
import deCommon from '../src/locales/de/common.json'
import itCommon from '../src/locales/it/common.json'

/**
 * Job Search speaks the page's language in fr, de and it, and is unchanged in
 * en (fill-translation-gaps, US-002).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * `getTranslations` does not merge en into the other locales, and the Job
 * Search components fall back to hard-coded English when a key is missing. A
 * missing key fails no build: the page just renders English. Only the rendered
 * page shows which text won.
 *
 * WHAT IS ASSERTED
 *
 * In fr, de and it, every state the page goes through - loading, the list, the
 * "all loaded" end of the list, the detail with its preview label, full-details
 * note and actions, saving, both save toasts, "view in applications", the
 * resume selector, and the error notice - contains none of the English strings
 * listed in `ENGLISH`, and does contain the locale's own strings. Dates on the
 * card and in the detail are in the locale's format. The scan reads text nodes
 * and the placeholder, tooltip and accessible-name attributes of `main` and of
 * the resume selector; a control test shows it does catch an English string.
 * An en run checks the English text did not move.
 *
 * WHAT IS STUBBED
 *
 * `/api/jobs` is answered by `page.route`, with responses held until the
 * loading states have been read. The external job fetch is stubbed. Saving a
 * job goes to the local stack (held once so "Saving" can be read), and the two
 * resumes the selector lists are real rows created through the service-role
 * client. The job data is neutral text, so any English found is the UI's.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E job search i18n spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Dates are stored at midnight UTC; a fixed zone keeps the calendar day fixed.
test.use({ timezoneId: 'Europe/Zurich', viewport: { width: 1440, height: 900 } })

type JobsDict = typeof en
type TestLocale = 'fr' | 'de' | 'it' | 'en'

const JOBS: Record<TestLocale, JobsDict> = { fr, de, it: it_, en }
const TEMPLATE_NAMES: Record<TestLocale, { professional: string; modern: string }> = {
  fr: frCommon.resumes.templates,
  de: deCommon.resumes.templates,
  it: itCommon.resumes.templates,
  en: enCommon.resumes.templates,
}

/** The posted date of every listing, and how each locale must show it. */
const POSTED_DATE = '2026-01-15'
const POSTED_DATE_SHOWN: Record<TestLocale, RegExp> = {
  en: /^15\/01\/2026$/,
  fr: /^15\/01\/2026$/,
  de: /^15\.1\.2026$/,
  // Day and month padding for `it` differs between ICU versions.
  it: /^15\/0?1\/2026$/,
}

/** The resumes' last update, midday UTC so the day is the 15th in Zurich. */
const RESUME_UPDATED_AT = '2026-01-15T12:00:00Z'

/**
 * English the page rendered in every locale before this story, copied from the
 * components' fallbacks and literals rather than read from en/jobs.json: what
 * has to be absent is the text the components render when a key is missing.
 * Substrings, so "All 25 jobs loaded" and "Lausanne, Switzerland" are caught.
 */
const ENGLISH: readonly (string | RegExp)[] = [
  'Live Data',
  'Notice',
  'All Cantons',
  'Loading',
  /All [\d,.\s]+ jobs loaded/,
  'Preview',
  "available on the employer's website",
  'View Full Job Details',
  'View in Applications',
  'Saving',
  'Job saved to your applications',
  'already in your saved applications',
  'Failed to save job',
  'Switzerland',
  'Updated',
  / template\b/,
  'Failed to load',
  'An error occurred',
  'API error occurred',
  'Posted on',
]

function matches(text: string, pattern: string | RegExp): boolean {
  return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)
}

/** Every rendered string of `root`: text nodes, plus placeholder, title and aria-label. */
async function renderedStrings(root: Locator): Promise<string[]> {
  return root.evaluate((element) => {
    const strings: string[] = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      if (text) strings.push(text)
    }
    for (const child of [element, ...Array.from(element.querySelectorAll('*'))]) {
      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        const value = child.getAttribute(attribute)
        if (value) strings.push(value)
      }
    }
    return strings
  })
}

async function englishIn(root: Locator): Promise<string[]> {
  const strings = await renderedStrings(root)
  return strings.filter((text) => ENGLISH.some((pattern) => matches(text, pattern)))
}

async function expectNoEnglish(root: Locator, where: string): Promise<void> {
  expect(await englishIn(root), `English in ${where}`).toEqual([])
}

const PAGE_SIZE = 20
const TOTAL_JOBS = 25
const EMPLOYER_ORIGIN = 'https://jobs.example.test'

function jobTitle(index: number): string {
  return `Product Designer ${String(index + 1).padStart(2, '0')}`
}

function job(index: number) {
  return {
    id: `e2e-job-search-i18n-${index + 1}`,
    title: jobTitle(index),
    company: `Listing Company ${index + 1} SA`,
    location_city: 'Lausanne',
    location_country: 'CH',
    employment_type: 'full-time',
    description:
      'Listing description. You will design product flows for a software company and work with engineering and research teams every day.',
    posted_date: POSTED_DATE,
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

/** A response held until the test releases it. */
interface Gate {
  /** Resolves once the request has reached the route handler. */
  reached: Promise<void>
  release: () => void
}

function gate(): Gate & { wait: () => Promise<void>; arrive: () => void } {
  let arrive!: () => void
  let release!: () => void
  const reached = new Promise<void>((resolve) => (arrive = resolve))
  const released = new Promise<void>((resolve) => (release = resolve))
  return { reached, release, arrive, wait: () => released }
}

interface Stub {
  firstPage: Gate
  secondPage: Gate
  save: Gate
}

/**
 * Stub the page's network: `/api/jobs` serves 25 jobs over two pages, each
 * page held once until released; the first save request is held once too.
 */
async function stubJobSearch(page: Page): Promise<Stub> {
  const first = gate()
  const second = gate()
  const save = gate()
  let heldFirst = false
  let heldSecond = false
  let heldSave = false

  await page.route(
    (url) => url.pathname === '/api/jobs',
    async (route) => {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get('page') ?? '1')
      if (pageNumber === 1 && !heldFirst) {
        heldFirst = true
        first.arrive()
        await first.wait()
      }
      if (pageNumber === 2 && !heldSecond) {
        heldSecond = true
        second.arrive()
        await second.wait()
      }
      const start = (pageNumber - 1) * PAGE_SIZE
      const end = Math.min(start + PAGE_SIZE, TOTAL_JOBS)
      const jobs = Array.from({ length: Math.max(end - start, 0) }, (_, offset) => job(start + offset))
      await route.fulfill({ json: { jobs, total: TOTAL_JOBS, source: 'mock' } })
    },
  )

  await page.route(
    (url) => url.pathname === '/api/jobs/fetch-external',
    (route) => route.fulfill({ json: { success: true, ...FETCHED } }),
  )

  await page.route(
    (url) => url.pathname === '/api/job-applications',
    async (route: Route) => {
      if (route.request().method() === 'POST' && !heldSave) {
        heldSave = true
        save.arrive()
        await save.wait()
      }
      await route.continue()
    },
  )

  return { firstPage: first, secondPage: second, save }
}

async function createResume(userId: string, title: string, template: 'professional' | 'modern'): Promise<void> {
  const { error } = await admin()
    .from('resumes')
    .insert({ user_id: userId, title, template, updated_at: RESUME_UPDATED_AT, created_at: RESUME_UPDATED_AT })
  if (error) throw new Error(`Could not create a resume for the test user: ${error.message}`)
}

async function savedLocation(userId: string): Promise<string | null> {
  const { data, error } = await admin()
    .from('job_applications')
    .select('location')
    .eq('user_id', userId)
    .single()
  if (error) throw new Error(`Could not read the saved job: ${error.message}`)
  return (data as { location: string | null }).location
}

const main = (page: Page): Locator => page.locator('main')
const cardHeading = (page: Page, index: number): Locator =>
  page.getByRole('heading', { level: 3, name: jobTitle(index), exact: true })
const detailHeading = (page: Page, index: number): Locator =>
  page.getByRole('heading', { level: 2, name: jobTitle(index), exact: true })
/** The list's own scroll container (`job-list.tsx`), found from its first card. */
const listScroller = (page: Page): Locator =>
  cardHeading(page, 0).locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]')
/** The detail panel's root (`job-detail-panel.tsx`). */
const detailPanel = (page: Page): Locator =>
  detailHeading(page, 0).locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]')
const toast = (page: Page, text: string): Locator => page.getByRole('alert').filter({ hasText: text })

/**
 * Walk the page through every state the story covers and return what was
 * read, so the localized and the en runs assert on the same journey.
 */
async function walkJobSearch(page: Page, locale: TestLocale, userId: string): Promise<void> {
  const t = JOBS[locale]
  const stub = await stubJobSearch(page)
  await createResume(userId, 'Job search i18n, one', 'professional')
  await createResume(userId, 'Job search i18n, two', 'modern')

  // Loading: the first page is held, so the loading state stays on screen.
  const response = await page.goto(`/${locale}/dashboard/jobs`)
  expect(response?.status()).toBe(200)
  await stub.firstPage.reached
  await expect(main(page).getByText(t.loading, { exact: true })).toBeVisible()
  await expect(main(page).getByText(t.liveData, { exact: true })).toBeVisible()
  if (locale !== 'en') await expectNoEnglish(main(page), `${locale} loading state`)
  stub.firstPage.release()

  // The list and the first job's detail.
  await expect(cardHeading(page, 0)).toBeVisible()
  await expect(detailHeading(page, 0)).toBeVisible()
  await expect(page.locator('select option[value=""]').first()).toHaveText(t.filters.allCantons)

  const card = cardHeading(page, 0).locator('xpath=ancestor::div[contains(@class, "cursor-pointer")][1]')
  const location = t.locationInSwitzerland.replace('{city}', 'Lausanne')
  await expect(card.getByText(location, { exact: true })).toBeVisible()
  const cardDate = (await card.getByText(t.postedOn).textContent())?.replace(t.postedOn, '').trim() ?? ''
  expect(cardDate).toMatch(POSTED_DATE_SHOWN[locale])

  const panel = detailPanel(page)
  await expect(panel.getByText(location, { exact: true })).toBeVisible()
  await expect(panel.getByText(POSTED_DATE_SHOWN[locale])).toBeVisible()
  await expect(panel.getByText(t.preview, { exact: true })).toBeVisible()
  await expect(panel.getByText(t.fullDetailsNote, { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: t.viewFullDetails, exact: true })).toBeVisible()
  if (locale !== 'en') await expectNoEnglish(main(page), `${locale} list and detail`)

  // Infinite scroll: the second page is held ("loading more"), then the list
  // ends with "all N loaded".
  await listScroller(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await stub.secondPage.reached
  await expect(main(page).getByText(t.loadingMore, { exact: true })).toBeVisible()
  if (locale !== 'en') await expectNoEnglish(main(page), `${locale} loading more`)
  stub.secondPage.release()
  const allLoaded = t.allJobsLoaded.replace('{count}', String(TOTAL_JOBS))
  await expect(main(page).getByText(allLoaded, { exact: true })).toBeVisible()
  await expect(cardHeading(page, TOTAL_JOBS - 1)).toBeAttached()
  if (locale !== 'en') await expectNoEnglish(main(page), `${locale} end of list`)

  // Save: held once, so "Saving" is on screen; then the success toast and
  // "view in applications".
  await panel.getByRole('button', { name: t.save, exact: true }).click()
  await stub.save.reached
  await expect(panel.getByRole('button', { name: t.saving, exact: true })).toBeDisabled()
  if (locale !== 'en') await expectNoEnglish(main(page), `${locale} saving`)
  stub.save.release()
  await expect(toast(page, t.jobSavedSuccess)).toBeVisible()
  await expect(panel.getByRole('button', { name: t.viewInApplications, exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: t.saved, exact: true })).toBeDisabled()
  if (locale !== 'en') {
    await expectNoEnglish(main(page), `${locale} saved`)
    await expectNoEnglish(toast(page, t.jobSavedSuccess).locator('p'), `${locale} success toast`)
  }
  // The saved row's location is written in the page language too.
  expect(await savedLocation(userId)).toBe(location)

  // Already saved: a fresh page does not know, so the API answers 409.
  await page.reload()
  await expect(detailHeading(page, 0)).toBeVisible()
  await detailPanel(page).getByRole('button', { name: t.save, exact: true }).click()
  await expect(toast(page, t.jobAlreadySaved)).toBeVisible()
  await expect(detailPanel(page).getByRole('button', { name: t.saved, exact: true })).toBeDisabled()
  if (locale !== 'en') {
    await expectNoEnglish(toast(page, t.jobAlreadySaved).locator('p'), `${locale} already-saved toast`)
  }

  // The resume selector: two resumes, so "Adapt my CV" lists them.
  await detailPanel(page).getByRole('button', { name: t.cvAdaptation.adaptCV, exact: true }).click()
  const selector = page
    .getByRole('heading', { level: 2, name: t.createCV.selectResumeTitleWithCreate, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "shadow-xl")][1]')
  await expect(selector).toBeVisible()
  const names = TEMPLATE_NAMES[locale]
  for (const name of [names.professional, names.modern]) {
    await expect(
      selector.getByText(t.resumeSelector.templateLabel.replace('{template}', name), { exact: true }),
    ).toBeVisible()
  }
  const updated = selector.getByText(t.resumeSelector.updatedOn.replace('{date}', ''))
  await expect(updated).toHaveCount(2)
  // en keeps the browser's default date format, as before this story; the
  // other locales use the page locale.
  const browserDefaultDate = await page.evaluate((iso) => new Date(iso).toLocaleDateString(), RESUME_UPDATED_AT)
  for (const text of await updated.allTextContents()) {
    const shown = text.replace(t.resumeSelector.updatedOn.replace('{date}', ''), '').trim()
    if (locale === 'en') expect(shown).toBe(browserDefaultDate)
    else expect(shown).toMatch(POSTED_DATE_SHOWN[locale])
  }
  if (locale !== 'en') await expectNoEnglish(selector, `${locale} resume selector`)
}

for (const locale of ['fr', 'de', 'it'] as const) {
  test(`${locale}: Job Search shows no English, and dates follow the locale`, async ({ page, authedUser }) => {
    await walkJobSearch(page, locale, authedUser.id)
  })

  test(`${locale}: the error notice is localized`, async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const t = JOBS[locale]

    // A failed request: the client's own message.
    await page.route((url) => url.pathname === '/api/jobs', (route) => route.abort())
    const response = await page.goto(`/${locale}/dashboard/jobs`)
    expect(response?.status()).toBe(200)
    await expect(main(page).getByText(t.loadJobsError, { exact: true })).toBeVisible()
    await expect(main(page).getByText(t.notice, { exact: true })).toBeVisible()
    await expectNoEnglish(main(page), `${locale} failed request`)

    // A flagged response without a server message: the client's fallback.
    await page.unroute((url) => url.pathname === '/api/jobs')
    await page.route(
      (url) => url.pathname === '/api/jobs',
      (route) => route.fulfill({ json: { jobs: [], total: 0, source: 'adzuna', error: true } }),
    )
    await page.reload()
    await expect(main(page).getByText(t.apiError, { exact: true })).toBeVisible()
    await expect(main(page).getByText(t.notice, { exact: true })).toBeVisible()
    await expectNoEnglish(main(page), `${locale} flagged response`)
  })
}

/**
 * The Save button sits in a half-width cell at 375px, and its label truncates.
 * The in-progress label must fit whole in every translated locale.
 */
for (const locale of ['fr', 'de', 'it'] as const) {
  test(`${locale}: at 375px the in-progress save label is not cut`, async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const t = JOBS[locale]
    await page.setViewportSize({ width: 375, height: 812 })
    const stub = await stubJobSearch(page)
    stub.firstPage.release()

    const response = await page.goto(`/${locale}/dashboard/jobs`)
    expect(response?.status()).toBe(200)
    await cardHeading(page, 0).click()
    await expect(detailHeading(page, 0)).toBeVisible()

    await detailPanel(page).getByRole('button', { name: t.save, exact: true }).click()
    await stub.save.reached
    const saving = detailPanel(page).getByRole('button', { name: t.saving, exact: true })
    await expect(saving).toBeDisabled()
    const label = saving.locator('span')
    const fit = await label.evaluate((span) => ({
      text: span.textContent,
      scrollWidth: span.scrollWidth,
      clientWidth: span.clientWidth,
    }))
    expect(fit.text).toBe(t.saving)
    expect(fit.scrollWidth, `"${fit.text}" is ${fit.scrollWidth}px in ${fit.clientWidth}px`).toBeLessThanOrEqual(
      fit.clientWidth,
    )
    stub.save.release()
    await expect(detailPanel(page).getByRole('button', { name: t.saved, exact: true })).toBeDisabled()
  })
}

test('en: Job Search text is unchanged', async ({ page, authedUser }) => {
  // The en values must equal the English the page rendered before the story.
  expect(en.loading).toBe('Loading jobs...')
  expect(en.loadingMore).toBe('Loading more jobs...')
  expect(en.allJobsLoaded.replace('{count}', '25')).toBe('All 25 jobs loaded')
  expect(en.liveData).toBe('Live Data')
  expect(en.notice).toBe('Notice')
  expect(en.preview).toBe('Preview')
  expect(en.fullDetailsNote).toBe("The complete job description with all details is available on the employer's website.")
  expect(en.viewFullDetails).toBe('View Full Job Details')
  expect(en.viewInApplications).toBe('View in Applications')
  expect(en.saving).toBe('Saving...')
  expect(en.jobSavedSuccess).toBe('Job saved to your applications!')
  expect(en.jobAlreadySaved).toBe('This job is already in your saved applications.')
  expect(en.filters.allCantons).toBe('All Cantons')
  expect(en.locationInSwitzerland.replace('{city}', 'Lausanne')).toBe('Lausanne, Switzerland')

  await walkJobSearch(page, 'en', authedUser.id)

  // The selector's template label still reads "Professional Template" on
  // screen: the row is capitalized by CSS, as before.
  const selector = page
    .getByRole('heading', { level: 2, name: en.createCV.selectResumeTitleWithCreate, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "shadow-xl")][1]')
  await expect(selector.getByText('Professional template', { exact: true })).toHaveText('Professional Template', {
    useInnerText: true,
  })
})

test('control: the scan catches English text and English attributes', async ({ page, authedUser }) => {
  expect(authedUser.id).toBeTruthy()
  await page.route(
    (url) => url.pathname === '/api/jobs',
    (route) => route.fulfill({ json: { jobs: [job(0)], total: 1, source: 'mock' } }),
  )
  const response = await page.goto('/fr/dashboard/jobs')
  expect(response?.status()).toBe(200)
  await expect(cardHeading(page, 0)).toBeVisible()
  await expectNoEnglish(main(page), 'fr before the control')

  // What the card rendered before this story, and an English tooltip.
  await main(page).evaluate((element) => {
    const probe = document.createElement('div')
    probe.id = 'english-probe'
    probe.textContent = 'Lausanne, Switzerland'
    const button = document.createElement('button')
    button.title = 'View Full Job Details'
    probe.appendChild(button)
    element.appendChild(probe)
  })
  expect(await englishIn(main(page))).toEqual(['Lausanne, Switzerland', 'View Full Job Details'])
})
