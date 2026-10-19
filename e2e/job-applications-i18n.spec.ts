import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Dialog, Locator, Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'
import enCommon from '../src/locales/en/common.json'
import frCommon from '../src/locales/fr/common.json'
import deCommon from '../src/locales/de/common.json'
import itCommon from '../src/locales/it/common.json'
import enJobs from '../src/locales/en/jobs.json'
import frJobs from '../src/locales/fr/jobs.json'
import deJobs from '../src/locales/de/jobs.json'
import itJobs from '../src/locales/it/jobs.json'

/**
 * The job applications board and its quick add speak the page's language
 * (job-applications-i18n, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * `getTranslations` does not merge en into the other locales, and the board's
 * components fall back to hard-coded English when a key is missing; before this
 * story the column labels came from an English constant outright. Nothing in a
 * build or a unit test shows which text a page renders. Only the page does.
 *
 * WHAT IS ASSERTED
 *
 * In fr and de: every column's header, aria-label and quick-add label, and the
 * collapsed column's vertical label, use `jobs.statuses`; the quick-add badge
 * and its six validation messages; the failed status change and failed delete
 * toasts; the quick-add fallback errors (no server message, and a non-Error
 * rejection); the card's aria-label, the interview-type tooltip, the cover
 * letter badge, the status-filter pill, the list-view card menu, the "not
 * logged in" alert from the list-view card, and, at 375px, the short search
 * placeholder, the whole board and the mobile "close filters" button. Each state is scanned for the English the components
 * rendered before, over text nodes and the placeholder, title, aria-label and
 * aria-roledescription attributes. A control test shows the scan catches an
 * English status. An en run walks the same journey and checks the English did
 * not move.
 *
 * The detail page (US-002), in fr and de, with and without a linked CV and
 * cover letter: the 15 `jobApplications.detail.*` labels, the timeline colons
 * (raw textContent, since Playwright's text matchers fold U+00A0), the status
 * changer's menu and the "not logged in" alerts from the status changer and
 * the delete button. An en run checks the same strings did not move, and a
 * control test shows the detail scan catches one English fallback.
 *
 * The draggable card's `aria-roledescription="draggable"` is dnd-kit's default
 * and belongs to US-003; the scan skips that one attribute value until then.
 *
 * WHAT IS STUBBED
 *
 * The rows are real, created for the signed-in user through the service-role
 * client. The failures are stubbed with `page.route`: the PATCH and DELETE of
 * one application, the quick-add POST, and Supabase's `/auth/v1/user` for the
 * "not logged in" path. The non-Error quick-add rejection patches
 * `window.fetch` for that one request. Row data is neutral text, so any English
 * found is the UI's.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E job applications i18n spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

test.use({ timezoneId: 'Europe/Zurich', viewport: { width: 1440, height: 900 } })

type TestLocale = 'fr' | 'de' | 'en'
type CommonDict = typeof enCommon
type StatusesDict = typeof enJobs.statuses
type JobStatus = keyof StatusesDict

const COMMON: Record<TestLocale | 'it', CommonDict> = { en: enCommon, fr: frCommon, de: deCommon, it: itCommon }
const STATUSES: Record<TestLocale | 'it', StatusesDict> = {
  en: enJobs.statuses,
  fr: frJobs.statuses,
  de: deJobs.statuses,
  it: itJobs.statuses,
}
const JOB_STATUSES: readonly JobStatus[] = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'accepted', 'declined']

/** Collapsed through the board's own persisted state, so the vertical label renders. */
const COLLAPSED_STATUS: JobStatus = 'declined'

/**
 * English the board rendered in every locale before this story, copied from
 * the components' literals and fallbacks rather than read from en/common.json:
 * what has to be absent is the text the components render when a key is
 * missing. Status labels are whole words, so "Offer" does not match "Offre".
 */
const ENGLISH: readonly (string | RegExp)[] = [
  /\b(Saved|Applied|Interviewing|Offer|Rejected|Accepted|Declined)\b/,
  'Add job to',
  'Failed to update status',
  'Failed to delete application',
  'Failed to create job application',
  'An unexpected error occurred',
  'Job title is required',
  'Company name is required',
  'must be less than',
  'Please enter a valid URL',
  / at /,
  /Remove .* filter/,
  'Close filters',
  'Job application actions',
  'phone screen',
  'Cover Letter',
  'You must be logged in',
  // The header's short placeholder at 375px, "Search...".
  /\bSearch\b/,
]

/** dnd-kit's default role description: localized by US-003, not this story. */
const US003_ROLE_DESCRIPTION = 'draggable'

function matches(text: string, pattern: string | RegExp): boolean {
  return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)
}

/** Every rendered string of `root`: text nodes, plus placeholder, title, aria-label and aria-roledescription. */
async function renderedStrings(root: Locator): Promise<string[]> {
  return root.evaluate((element, skippedRoleDescription) => {
    const strings: string[] = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      if (text) strings.push(text)
    }
    for (const child of [element, ...Array.from(element.querySelectorAll('*'))]) {
      for (const attribute of ['placeholder', 'title', 'aria-label', 'aria-roledescription']) {
        const value = child.getAttribute(attribute)
        if (!value) continue
        if (attribute === 'aria-roledescription' && value === skippedRoleDescription) continue
        strings.push(value)
      }
    }
    return strings
  }, US003_ROLE_DESCRIPTION)
}

async function englishIn(root: Locator): Promise<string[]> {
  const strings = await renderedStrings(root)
  return strings.filter((text) => ENGLISH.some((pattern) => matches(text, pattern)))
}

async function expectNoEnglish(root: Locator, where: string): Promise<void> {
  expect(await englishIn(root), `English in ${where}`).toEqual([])
}

/** Neutral row data: no word of it is in `ENGLISH`. */
const ROWS = {
  first: { job_title: 'Produktdesigner Nord', company_name: 'Nordwind SA', status: 'saved' as JobStatus },
  second: { job_title: 'Datenanalyst Sued', company_name: 'Suedwind AG', status: 'applied' as JobStatus },
}
const COVER_LETTER_TITLE = 'Brief Nordwind'
/** Far enough ahead to stay the "next" interview. */
const INTERVIEW_DATE = '2099-03-10T14:00:00Z'

interface Seeded {
  firstId: string
  secondId: string
}

async function seed(userId: string): Promise<Seeded> {
  const db = admin()
  const { data: letter, error: letterError } = await db
    .from('cover_letters')
    .insert({ user_id: userId, title: COVER_LETTER_TITLE })
    .select('id')
    .single()
  if (letterError) throw new Error(`Could not create a cover letter: ${letterError.message}`)

  const { data, error } = await db
    .from('job_applications')
    .insert([
      {
        user_id: userId,
        ...ROWS.first,
        cover_letter_id: (letter as { id: string }).id,
        interviews: [{ date: INTERVIEW_DATE, type: 'phone_screen' }],
        updated_at: '2026-01-15T12:00:00Z',
      },
      { user_id: userId, ...ROWS.second, updated_at: '2026-01-14T12:00:00Z' },
    ])
    .select('id, job_title')
  if (error) throw new Error(`Could not create job applications: ${error.message}`)
  const rows = data as { id: string; job_title: string }[]
  const id = (title: string) => {
    const row = rows.find((candidate) => candidate.job_title === title)
    if (!row) throw new Error(`Seeded row "${title}" missing`)
    return row.id
  }
  return { firstId: id(ROWS.first.job_title), secondId: id(ROWS.second.job_title) }
}

async function statusOf(id: string): Promise<string> {
  const { data, error } = await admin().from('job_applications').select('status').eq('id', id).single()
  if (error) throw new Error(`Could not read the application: ${error.message}`)
  return (data as { status: string }).status
}

async function collapseColumn(page: Page, status: JobStatus): Promise<void> {
  await page.addInitScript((collapsed) => {
    window.localStorage.setItem('kanban_collapsed_columns', JSON.stringify({ [collapsed]: true }))
  }, status)
}

const main = (page: Page): Locator => page.locator('main')
const column = (page: Page, status: JobStatus): Locator => page.locator(`[role="group"][data-status="${status}"]`)
const toast = (page: Page, text: string): Locator => page.getByRole('alert').filter({ hasText: text })

function cardLabel(locale: TestLocale, row: { job_title: string; company_name: string }): string {
  return COMMON[locale].kanban.card.ariaLabel
    .replace('{title}', row.job_title)
    .replace('{company}', row.company_name)
}

async function gotoBoard(page: Page, locale: TestLocale, query = ''): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/job-applications${query}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('button', { name: cardLabel(locale, ROWS.first), exact: true })).toBeVisible()
}

/**
 * Open the card's hover preview and return it.
 *
 * Radix opens a tooltip on the first pointermove over its trigger and will not
 * open it again until the pointer has left the trigger; a click on the trigger
 * closes it. After the board steps the pointer can still rest on the card
 * (the delete menu sits inside it), so a plain `hover()` sends no fresh
 * enter and the tooltip stays shut. Leaving first, then entering the trigger
 * itself (the card element, `TooltipTrigger asChild`), gives Radix the
 * leave/enter pair it needs. The retry covers the 500ms open delay under load;
 * each attempt starts from outside the card again.
 */
async function openCardTooltip(page: Page, card: Locator): Promise<Locator> {
  const tooltip = page.getByRole('tooltip')
  await expect(async () => {
    await page.mouse.move(0, 0)
    await card.hover()
    await expect(tooltip).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  return tooltip
}

/** Answers every dialog, recording its message; confirm dialogs are accepted. */
function recordDialogs(page: Page): string[] {
  const messages: string[] = []
  page.on('dialog', (dialog: Dialog) => {
    messages.push(dialog.message())
    void dialog.accept()
  })
  return messages
}

/**
 * The board, the card, its tooltip and badge, the quick-add modal and both
 * toasts. Shared by the localized and the en runs, so both assert on the same
 * journey; `scan` is false for en.
 */
async function walkBoard(page: Page, locale: TestLocale, userId: string): Promise<void> {
  const c = COMMON[locale]
  const statuses = STATUSES[locale]
  const scan = locale !== 'en'
  const ids = await seed(userId)
  const dialogs = recordDialogs(page)
  await collapseColumn(page, COLLAPSED_STATUS)
  await gotoBoard(page, locale)

  // Columns: header, group label and quick-add label; the collapsed one's vertical label.
  for (const status of JOB_STATUSES) {
    const group = column(page, status)
    await expect(group).toHaveAttribute('aria-label', statuses[status])
    if (status === COLLAPSED_STATUS) {
      await expect(group).toHaveAttribute('data-collapsed', 'true')
      const vertical = group.getByRole('button', { name: `${c.kanban.column.expand}: ${statuses[status]}`, exact: true })
      await expect(vertical).toHaveText(statuses[status])
    } else {
      await expect(group.getByText(statuses[status], { exact: true }).first()).toBeVisible()
      await expect(
        group.getByRole('button', { name: c.kanban.quickAdd.addToColumn.replace('{status}', statuses[status]), exact: true }),
      ).toBeVisible()
    }
  }

  // Seven columns, seven different names.
  const columnLabels = await Promise.all(JOB_STATUSES.map((status) => column(page, status).getAttribute('aria-label')))
  expect(new Set(columnLabels).size, `column labels ${columnLabels.join(', ')}`).toBe(JOB_STATUSES.length)

  // The card: its label and its cover letter badge.
  const card = page.getByRole('button', { name: cardLabel(locale, ROWS.first), exact: true })
  await expect(card.getByText(`1 ${c.badges.coverLetterLabel}`, { exact: true })).toBeVisible()
  if (scan) await expectNoEnglish(main(page), `${locale} board`)

  // The tooltip names the interview type.
  const tooltip = await openCardTooltip(page, card)
  await expect(tooltip).toContainText(c.kanban.preview.interviewTypes.phone_screen)
  if (scan) await expectNoEnglish(tooltip, `${locale} card tooltip`)
  await page.mouse.move(0, 0)

  // Quick add: the badge, then each validation message.
  await column(page, 'saved')
    .getByRole('button', { name: c.kanban.quickAdd.addToColumn.replace('{status}', statuses.saved), exact: true })
    .click()
  const modal = page.getByRole('dialog', { name: c.kanban.quickAdd.title, exact: true })
  await expect(modal).toBeVisible()
  await expect(modal.getByText(statuses.saved, { exact: true })).toBeVisible()
  const title = modal.getByLabel(c.kanban.quickAdd.jobTitleLabel)
  const company = modal.getByLabel(c.kanban.quickAdd.companyLabel)
  const url = modal.getByLabel(c.kanban.quickAdd.jobUrlLabel)
  const save = modal.getByRole('button', { name: c.kanban.quickAdd.save, exact: true })

  await save.click()
  await expect(modal.getByText(c.kanban.quickAdd.jobTitleRequired, { exact: true })).toBeVisible()
  await expect(modal.getByText(c.kanban.quickAdd.companyRequired, { exact: true })).toBeVisible()
  if (scan) await expectNoEnglish(modal, `${locale} quick add, empty`)

  await title.fill('a'.repeat(256))
  await company.fill('b'.repeat(256))
  await url.fill(`https://example.test/${'c'.repeat(2000)}`)
  await save.click()
  await expect(modal.getByText(c.kanban.quickAdd.jobTitleTooLong, { exact: true })).toBeVisible()
  await expect(modal.getByText(c.kanban.quickAdd.companyTooLong, { exact: true })).toBeVisible()
  await expect(modal.getByText(c.kanban.quickAdd.urlTooLong, { exact: true })).toBeVisible()
  if (scan) await expectNoEnglish(modal, `${locale} quick add, too long`)

  // After a submit the form revalidates on change, which is how an invalid URL
  // reaches the schema: on submit, the browser's own check for type="url"
  // stops the form first.
  await url.fill('not a url')
  await expect(modal.getByText(c.kanban.quickAdd.invalidUrl, { exact: true })).toBeVisible()
  if (scan) await expectNoEnglish(modal, `${locale} quick add, invalid URL`)

  // A failure with no server message shows the client's fallback.
  await title.fill('Produktdesigner Ost')
  await company.fill('Ostwind SA')
  await url.fill('')
  await page.route(
    (u) => u.pathname === '/api/job-applications',
    (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, json: {} })
        : route.continue(),
  )
  await save.click()
  await expect(modal.getByRole('alert').filter({ hasText: c.kanban.quickAdd.createError })).toBeVisible()
  if (scan) await expectNoEnglish(modal, `${locale} quick add, failed`)
  await page.unroute((u) => u.pathname === '/api/job-applications')

  // A rejection that is not an Error has no message of its own.
  await page.evaluate(() => {
    const original = window.fetch
    window.fetch = (input, init) => {
      const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (target.endsWith('/api/job-applications') && init?.method === 'POST') {
        window.fetch = original
        return Promise.reject('offline')
      }
      return original(input, init)
    }
  })
  await title.fill('Produktdesigner West')
  await save.click()
  await expect(modal.getByRole('alert').filter({ hasText: c.kanban.quickAdd.unexpectedError })).toBeVisible()
  if (scan) await expectNoEnglish(modal, `${locale} quick add, unexpected error`)
  await modal.getByRole('button', { name: c.common.cancel, exact: true }).last().click()
  await expect(modal).toBeHidden()

  // A failed status change: drag the first card to "applied", the PATCH fails.
  await page.route(
    (u) => u.pathname === `/api/job-applications/${ids.firstId}`,
    (route) => {
      const method = route.request().method()
      return method === 'PATCH' || method === 'DELETE' ? route.fulfill({ status: 500, json: {} }) : route.continue()
    },
  )
  const handle = card.getByRole('button', { name: c.kanban.card.dragToMove, exact: true })
  const from = await handle.boundingBox()
  const to = await column(page, 'applied').boundingBox()
  if (!from || !to) throw new Error('Drag handle or target column has no box')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 12 })
  await page.mouse.up()
  await expect(toast(page, c.kanban.board.statusUpdateError)).toBeVisible()
  if (scan) await expectNoEnglish(toast(page, c.kanban.board.statusUpdateError).locator('p'), `${locale} status toast`)
  // Rolled back, and the row was not touched.
  await expect(column(page, 'saved').getByRole('button', { name: cardLabel(locale, ROWS.first), exact: true })).toBeVisible()
  expect(await statusOf(ids.firstId)).toBe('saved')

  // A failed delete: the menu, the confirm, then the DELETE fails.
  await card.getByRole('button', { name: c.kanban.card.moreActions, exact: true }).click()
  await page.getByRole('menu', { name: c.kanban.card.menuLabel, exact: true })
    .getByRole('menuitem', { name: c.kanban.card.delete, exact: true })
    .click()
  await expect(toast(page, c.kanban.board.deleteError)).toBeVisible()
  if (scan) await expectNoEnglish(toast(page, c.kanban.board.deleteError).locator('p'), `${locale} delete toast`)
  expect(dialogs).toEqual([c.kanban.card.confirmDelete])
  await expect(page.getByRole('button', { name: cardLabel(locale, ROWS.first), exact: true })).toBeVisible()
  expect(await statusOf(ids.firstId)).toBe('saved')
  expect(await statusOf(ids.secondId)).toBe('applied')
}

/** The status-filter pill and the list view, with its "not logged in" alert. */
async function walkFiltersAndList(page: Page, locale: TestLocale, userId: string): Promise<void> {
  const c = COMMON[locale]
  const statuses = STATUSES[locale]
  const scan = locale !== 'en'
  await seed(userId)
  const dialogs = recordDialogs(page)

  await gotoBoard(page, locale, '?status=saved,applied')
  for (const status of ['saved', 'applied'] as const) {
    await expect(
      page.getByRole('button', { name: c.kanban.filters.removeStatus.replace('{status}', statuses[status]), exact: true }),
    ).toBeVisible()
  }
  if (scan) await expectNoEnglish(main(page), `${locale} status pills`)

  const response = await page.goto(`/${locale}/dashboard/job-applications?view=list`)
  expect(response?.status()).toBe(200)
  const menuButtons = page.getByRole('button', { name: c.kanban.card.menuLabel, exact: true })
  await expect(menuButtons).toHaveCount(2)
  if (scan) await expectNoEnglish(main(page), `${locale} list view`)

  // The session is gone as far as the browser client can tell.
  await page.route(
    (u) => u.pathname === '/auth/v1/user',
    (route) => route.fulfill({ status: 401, json: { code: 401, error_code: 'no_authorization', msg: 'no session' } }),
  )
  await menuButtons.first().click()
  await page.getByRole('button', { name: enOrLocale(locale).delete, exact: true }).click()
  await expect.poll(() => dialogs.length).toBe(2)
  expect(dialogs[1]).toBe(c.common.notLoggedIn)
  if (scan) expect(ENGLISH.filter((pattern) => matches(dialogs.join('\n'), pattern))).toEqual([])
}

/** jobs.json strings the list-view card reads. */
function enOrLocale(locale: TestLocale): { delete: string } {
  return { delete: { en: enJobs, fr: frJobs, de: deJobs }[locale].delete }
}

/** At 375px the filters open as a bottom sheet with its own close button. */
async function walkMobileFilters(page: Page, locale: TestLocale, userId: string): Promise<void> {
  const c = COMMON[locale]
  await seed(userId)
  await page.setViewportSize({ width: 375, height: 812 })
  await gotoBoard(page, locale)

  // The mobile header swaps in the short search placeholder; the board at
  // 375px is scanned as a whole, placeholders included.
  await expect(page.getByPlaceholder(c.kanban.header.searchPlaceholderShort, { exact: true })).toBeVisible()
  if (locale === 'en') expect(c.kanban.header.searchPlaceholderShort).toBe('Search...')
  if (locale !== 'en') await expectNoEnglish(main(page), `${locale} board at 375px`)

  await page
    .locator('button[aria-haspopup="true"]')
    .filter({ has: page.locator('svg.lucide-sliders-horizontal') })
    .click()
  const sheet = page.getByRole('dialog', { name: c.kanban.filters.button, exact: true })
  await expect(sheet).toBeVisible()
  const close = sheet.getByRole('button', { name: c.kanban.filters.closeFilters, exact: true })
  await expect(close).toBeVisible()
  if (locale !== 'en') await expectNoEnglish(sheet, `${locale} mobile filters`)
  await close.click()
  await expect(sheet).toBeHidden()
}

for (const locale of ['fr', 'de'] as const) {
  test(`${locale}: the board, quick add and toasts show no English`, async ({ page, authedUser }) => {
    await walkBoard(page, locale, authedUser.id)
  })

  test(`${locale}: the filter pills, list view and "not logged in" alert show no English`, async ({ page, authedUser }) => {
    await walkFiltersAndList(page, locale, authedUser.id)
  })

  test(`${locale}: at 375px the close-filters button is localized`, async ({ page, authedUser }) => {
    await walkMobileFilters(page, locale, authedUser.id)
  })
}

test('fr: the status labels are the French ones', () => {
  expect(JOB_STATUSES.map((status) => STATUSES.fr[status])).toEqual([
    'Enregistré',
    'Postulé',
    'En entretien',
    'Offre',
    'Refusé',
    'Accepté',
    'Décliné',
  ])
})

test('en: the board, quick add and labels are unchanged', async ({ page, authedUser }) => {
  // The en values must equal the English the components rendered before.
  const c = COMMON.en
  expect(JOB_STATUSES.map((status) => STATUSES.en[status])).toEqual([
    'Saved',
    'Applied',
    'Interviewing',
    'Offer',
    'Rejected',
    'Accepted',
    'Declined',
  ])
  expect(c.kanban.quickAdd).toMatchObject({
    jobTitleRequired: 'Job title is required',
    jobTitleTooLong: 'Job title must be less than 255 characters',
    companyRequired: 'Company name is required',
    companyTooLong: 'Company name must be less than 255 characters',
    invalidUrl: 'Please enter a valid URL',
    urlTooLong: 'URL must be less than 2000 characters',
    createError: 'Failed to create job application. Please try again.',
    unexpectedError: 'An unexpected error occurred. Please try again.',
  })
  expect(c.kanban.board.statusUpdateError).toBe('Failed to update status. Please try again.')
  expect(c.kanban.board.deleteError).toBe('Failed to delete application. Please try again.')
  expect(cardLabel('en', ROWS.first)).toBe(`${ROWS.first.job_title} at ${ROWS.first.company_name}`)
  expect(c.kanban.filters.removeStatus.replace('{status}', 'Saved')).toBe('Remove Saved filter')
  expect(c.kanban.filters.closeFilters).toBe('Close filters')
  expect(c.kanban.card.menuLabel).toBe('Job application actions')
  expect(c.kanban.preview.interviewTypes).toEqual({
    phone_screen: 'phone screen',
    technical: 'technical',
    behavioral: 'behavioral',
    final: 'final',
    other: 'other',
  })
  expect(c.common.notLoggedIn).toBe('You must be logged in to perform this action')
  expect(c.badges.coverLetterLabel).toBe('Cover Letter')
  expect(c.badges.coverLetterLabelPlural).toBe('Cover Letters')

  await walkBoard(page, 'en', authedUser.id)

  // The tooltip's type still reads "Phone Screen" on screen: CSS capitalizes it, as before.
  const card = page.getByRole('button', { name: cardLabel('en', ROWS.first), exact: true })
  const tooltip = await openCardTooltip(page, card)
  await expect(tooltip.getByText('phone screen', { exact: true })).toHaveText('Phone Screen', {
    useInnerText: true,
  })
})

test('en: the filter pills, list view and "not logged in" alert are unchanged', async ({ page, authedUser }) => {
  await walkFiltersAndList(page, 'en', authedUser.id)
})

test('en: at 375px the close-filters button is unchanged', async ({ page, authedUser }) => {
  await walkMobileFilters(page, 'en', authedUser.id)
})

test('control: the scan catches an English status and an English attribute', async ({ page, authedUser }) => {
  await seed(authedUser.id)
  await gotoBoard(page, 'fr')
  await expectNoEnglish(main(page), 'fr before the control')

  // What the column header and its group label rendered before this story.
  await column(page, 'saved').evaluate((group) => {
    group.setAttribute('aria-label', 'Saved')
    const probe = document.createElement('span')
    probe.textContent = 'Interviewing'
    group.appendChild(probe)
  })
  // dnd-kit's role description is skipped; any other value is read.
  await main(page).evaluate((element) => {
    const probe = document.createElement('div')
    probe.setAttribute('aria-roledescription', 'Declined')
    element.appendChild(probe)
  })
  expect(await englishIn(main(page))).toEqual(['Interviewing', 'Saved', 'Declined'])
})

// ---------------------------------------------------------------------------
// The detail page (US-002)
// ---------------------------------------------------------------------------

type DetailDict = typeof enCommon.jobApplications.detail
type DetailKey = keyof DetailDict
type ScanLocale = 'fr' | 'de' | 'it'

/**
 * What the detail page rendered for each `jobApplications.detail.*` key before
 * US-002, when no locale had the key: the page's own fallbacks, copied from the
 * code. The timeline labels end with the ":" the JSX appended after them.
 */
const DETAIL_FALLBACKS: DetailDict = {
  backToList: 'Back to Job Applications',
  viewJobPosting: 'View Original Posting',
  linkedResume: 'Linked CV',
  editResume: 'Edit CV',
  noResumeLinked: 'No CV linked to this job application.',
  createResume: 'Create CV for this Job',
  linkedCoverLetter: 'Linked Cover Letter',
  editCoverLetter: 'Edit Cover Letter',
  noCoverLetterLinked: 'No cover letter linked to this job application.',
  createCoverLetter: 'Create Cover Letter for this Job',
  notes: 'Notes',
  timeline: 'Timeline',
  created: 'Created:',
  lastUpdated: 'Last Updated:',
  deadline: 'Deadline:',
}
const DETAIL_KEYS = Object.keys(DETAIL_FALLBACKS) as DetailKey[]

/**
 * Keys whose translation is spelled like the English: French "Notes" is the
 * French word, and the board's preview already uses it. The scan cannot tell
 * those apart from a fallback, so it skips them; the list is asserted, so a
 * new identical value is a decision, not an accident.
 */
const IDENTICAL_TO_ENGLISH: Record<ScanLocale, DetailKey[]> = { fr: ['notes'], de: [], it: [] }

/**
 * English the status changer and the delete button fall back to. Their keys
 * exist in every locale; the scan proves the page hands them the dictionary.
 */
const DETAIL_CHILD_ENGLISH: readonly (string | RegExp)[] = [
  'Change Status',
  'Are you sure you want to delete',
  'Failed to delete job application',
  /\bDelet(e|ing)\b/,
  'Job Description',
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A fallback as a whole-word pattern, colon dropped, so "Created" alone is caught too. */
function fallbackPattern(text: string): RegExp {
  return new RegExp(`(?<!\\p{L})${escapeRegExp(text.replace(/:$/, ''))}(?!\\p{L})`, 'u')
}

function detailEnglish(locale: ScanLocale): (string | RegExp)[] {
  const skipped = new Set(IDENTICAL_TO_ENGLISH[locale])
  return [
    ...ENGLISH,
    ...DETAIL_CHILD_ENGLISH,
    ...DETAIL_KEYS.filter((key) => !skipped.has(key)).map((key) => fallbackPattern(DETAIL_FALLBACKS[key])),
  ]
}

async function detailEnglishIn(root: Locator, locale: ScanLocale): Promise<string[]> {
  const patterns = detailEnglish(locale)
  const strings = await renderedStrings(root)
  return strings.filter((text) => patterns.some((pattern) => matches(text, pattern)))
}

async function expectNoDetailEnglish(root: Locator, locale: ScanLocale, where: string): Promise<void> {
  expect(await detailEnglishIn(root, locale), `English in ${where}`).toEqual([])
}

/** Every optional section renders: posting link, notes, description, deadline. Neutral text. */
const DETAIL_ROWS = {
  linked: {
    job_title: 'Produktdesigner Nord',
    company_name: 'Nordwind SA',
    status: 'interviewing' as JobStatus,
    job_url: 'https://example.test/stelle/nord',
    location: 'Lausanne',
    job_description: 'Kurzbeschreibung Nordwind',
    notes: 'Notiz Nordwind',
    applied_date: '2026-01-20',
    deadline: '2099-06-20',
    created_at: '2026-01-15T12:00:00Z',
    updated_at: '2026-02-16T12:00:00Z',
  },
  bare: {
    job_title: 'Datenanalyst Sued',
    company_name: 'Suedwind AG',
    status: 'saved' as JobStatus,
    job_url: 'https://example.test/stelle/sued',
    location: 'Genf',
    job_description: 'Kurzbeschreibung Suedwind',
    notes: 'Notiz Suedwind',
    applied_date: '2026-03-02',
    deadline: '2099-07-21',
    created_at: '2026-03-01T12:00:00Z',
    updated_at: '2026-04-02T12:00:00Z',
  },
}
type DetailRow = (typeof DETAIL_ROWS)[keyof typeof DETAIL_ROWS]
const DETAIL_RESUME_TITLE = 'Profil Nordwind'

async function seedDetail(userId: string): Promise<{ linkedId: string; bareId: string }> {
  const db = admin()
  const { data: resume, error: resumeError } = await db
    .from('resumes')
    .insert({ user_id: userId, title: DETAIL_RESUME_TITLE, template: 'professional' })
    .select('id')
    .single()
  if (resumeError || !resume) throw new Error(`Could not create a resume: ${resumeError?.message ?? 'no row'}`)
  const { data: letter, error: letterError } = await db
    .from('cover_letters')
    .insert({ user_id: userId, title: COVER_LETTER_TITLE })
    .select('id')
    .single()
  if (letterError || !letter) throw new Error(`Could not create a cover letter: ${letterError?.message ?? 'no row'}`)

  const insert = async (row: Record<string, unknown>): Promise<string> => {
    const { data, error } = await db.from('job_applications').insert({ user_id: userId, ...row }).select('id').single()
    if (error || !data) throw new Error(`Could not create a job application: ${error?.message ?? 'no row'}`)
    return (data as { id: string }).id
  }
  return {
    linkedId: await insert({
      ...DETAIL_ROWS.linked,
      resume_id: (resume as { id: string }).id,
      cover_letter_id: (letter as { id: string }).id,
    }),
    bareId: await insert(DETAIL_ROWS.bare),
  }
}

/**
 * The page's own date format, computed in this process: the dev server runs on
 * the same machine, so it formats in the same time zone.
 */
function pageDate(locale: TestLocale, value: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

/** jobs.json strings the status changer and delete button read. */
const JOBS = { en: enJobs, fr: frJobs, de: deJobs } as const

/**
 * One detail page: every label, the timeline's raw text, the status menu and
 * the two "not logged in" alerts. `labels` is the expected text per detail key:
 * the dictionary for fr/de, `DETAIL_FALLBACKS` for en, so the en run asserts
 * against what the page rendered before the keys existed.
 */
async function walkDetail(
  page: Page,
  locale: TestLocale,
  id: string,
  row: DetailRow,
  linked: boolean,
  labels: DetailDict,
): Promise<void> {
  const c = COMMON[locale]
  const jobs = JOBS[locale]
  const statuses = STATUSES[locale]
  const scanLocale = locale === 'en' ? null : locale
  const dialogs = recordDialogs(page)

  const response = await page.goto(`/${locale}/dashboard/job-applications/${id}`)
  expect(response?.status()).toBe(200)
  const content = main(page)
  await expect(content.getByRole('heading', { level: 1, name: row.job_title, exact: true })).toBeVisible()

  await expect(content.getByRole('link', { name: labels.backToList, exact: true })).toBeVisible()
  await expect(content.getByRole('link', { name: labels.viewJobPosting, exact: true })).toHaveAttribute('href', row.job_url)
  await expect(content.getByRole('heading', { name: labels.linkedResume, exact: true })).toBeVisible()
  await expect(content.getByRole('heading', { name: labels.linkedCoverLetter, exact: true })).toBeVisible()
  await expect(content.getByRole('heading', { name: labels.notes, exact: true })).toBeVisible()
  await expect(content.getByText(statuses[row.status], { exact: true })).toBeVisible()
  if (linked) {
    await expect(content.getByRole('link', { name: labels.editResume, exact: true })).toBeVisible()
    await expect(content.getByRole('link', { name: labels.editCoverLetter, exact: true })).toBeVisible()
    await expect(content.getByText(`${DETAIL_RESUME_TITLE} ${c.badges.linked}`, { exact: true })).toBeVisible()
    await expect(content.getByText(`1 ${c.badges.coverLetterLabel}`, { exact: true })).toBeVisible()
    await expect(content.getByText(labels.noResumeLinked, { exact: true })).toHaveCount(0)
  } else {
    await expect(content.getByText(labels.noResumeLinked, { exact: true })).toBeVisible()
    await expect(content.getByRole('link', { name: labels.createResume, exact: true })).toBeVisible()
    await expect(content.getByText(labels.noCoverLetterLinked, { exact: true })).toBeVisible()
    await expect(content.getByRole('link', { name: labels.createCoverLetter, exact: true })).toBeVisible()
    await expect(content.getByRole('link', { name: labels.editResume, exact: true })).toHaveCount(0)
  }

  // The timeline, on raw textContent: the label carries its own colon (fr with
  // U+00A0 before it), then the JSX's U+0020, then the date.
  const timeline = content.getByRole('heading', { name: labels.timeline, exact: true }).locator('..')
  const lines = await timeline.locator('p').evaluateAll((paragraphs) =>
    paragraphs.map((p) => ({ label: p.querySelector('span')?.textContent ?? '', text: p.textContent ?? '' })),
  )
  expect(lines).toEqual([
    { label: labels.created, text: `${labels.created} ${pageDate(locale, row.created_at)}` },
    { label: labels.lastUpdated, text: `${labels.lastUpdated} ${pageDate(locale, row.updated_at)}` },
    { label: labels.deadline, text: `${labels.deadline} ${pageDate(locale, row.deadline)}` },
  ])

  // The status menu lists every localized status.
  await content.getByRole('button', { name: jobs.changeStatus, exact: true }).click()
  for (const status of JOB_STATUSES) {
    await expect(content.getByRole('button', { name: statuses[status], exact: true })).toBeVisible()
  }
  if (scanLocale) await expectNoDetailEnglish(content, scanLocale, `${locale} detail page${linked ? '' : ' without links'}`)

  // The session is gone as far as the browser client can tell: both actions stop at their alert.
  await page.route(
    (u) => u.pathname === '/auth/v1/user',
    (route) => route.fulfill({ status: 401, json: { code: 401, error_code: 'no_authorization', msg: 'no session' } }),
  )
  const target: JobStatus = row.status === 'offer' ? 'applied' : 'offer'
  await content.getByRole('button', { name: statuses[target], exact: true }).click()
  await expect.poll(() => dialogs.length).toBe(1)
  await content.getByRole('button', { name: jobs.delete, exact: true }).click()
  await expect.poll(() => dialogs.length).toBe(3)
  expect(dialogs).toEqual([c.common.notLoggedIn, jobs.confirmDelete, c.common.notLoggedIn])
  if (scanLocale) expect(detailEnglish(scanLocale).filter((pattern) => matches(dialogs.join('\n'), pattern))).toEqual([])
  await page.unroute((u) => u.pathname === '/auth/v1/user')

  // Neither action reached the row, and the page stayed put.
  expect(await statusOf(id)).toBe(row.status)
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard/job-applications/${id}$`))
  await expect(content.getByRole('button', { name: jobs.delete, exact: true })).toBeEnabled()
  page.removeAllListeners('dialog')
}

for (const locale of ['fr', 'de'] as const) {
  test(`${locale}: the detail page, with a linked CV and cover letter, shows no English`, async ({ page, authedUser }) => {
    const ids = await seedDetail(authedUser.id)
    await walkDetail(page, locale, ids.linkedId, DETAIL_ROWS.linked, true, COMMON[locale].jobApplications.detail)
  })

  test(`${locale}: the detail page, with nothing linked, shows no English`, async ({ page, authedUser }) => {
    const ids = await seedDetail(authedUser.id)
    await walkDetail(page, locale, ids.bareId, DETAIL_ROWS.bare, false, COMMON[locale].jobApplications.detail)
  })
}

test('detail keys: en equals the old fallbacks; fr, de, it differ except the listed ones', () => {
  expect(COMMON.en.jobApplications.detail).toEqual(DETAIL_FALLBACKS)
  for (const locale of ['fr', 'de', 'it'] as const) {
    const detail = COMMON[locale].jobApplications.detail
    expect(Object.keys(detail).sort()).toEqual([...DETAIL_KEYS].sort())
    const identical = DETAIL_KEYS.filter((key) => detail[key] === DETAIL_FALLBACKS[key])
    expect(identical, `${locale} values spelled like the English`).toEqual(IDENTICAL_TO_ENGLISH[locale])
  }
  // fr: a non-breaking space before each colon; de and it: none.
  for (const key of ['created', 'lastUpdated', 'deadline'] as const) {
    expect(COMMON.fr.jobApplications.detail[key]).toMatch(/\S :$/)
    expect(COMMON.de.jobApplications.detail[key]).toMatch(/\S:$/)
    expect(COMMON.it.jobApplications.detail[key]).toMatch(/\S:$/)
  }
})

test('en: the detail page, with and without links, renders as before', async ({ page, authedUser }) => {
  const ids = await seedDetail(authedUser.id)
  await walkDetail(page, 'en', ids.linkedId, DETAIL_ROWS.linked, true, DETAIL_FALLBACKS)
  await walkDetail(page, 'en', ids.bareId, DETAIL_ROWS.bare, false, DETAIL_FALLBACKS)
  // Spelled out once: the label, then an ordinary space.
  const timeline = main(page).getByRole('heading', { name: 'Timeline', exact: true }).locator('..')
  expect(await timeline.locator('p').first().evaluate((p) => p.textContent)).toBe(
    `Created: ${pageDate('en', DETAIL_ROWS.bare.created_at)}`,
  )
})

test('control: the detail scan catches an English fallback', async ({ page, authedUser }) => {
  const ids = await seedDetail(authedUser.id)
  const response = await page.goto(`/fr/dashboard/job-applications/${ids.linkedId}`)
  expect(response?.status()).toBe(200)
  const content = main(page)
  await expect(content.getByRole('heading', { name: frCommon.jobApplications.detail.timeline, exact: true })).toBeVisible()
  await expectNoDetailEnglish(content, 'fr', 'fr detail before the control')

  // What the timeline label and the posting link rendered before this story.
  await content.evaluate((element) => {
    const label = document.createElement('span')
    label.textContent = 'Last Updated:'
    element.appendChild(label)
    const link = document.createElement('a')
    link.setAttribute('aria-label', 'View Original Posting')
    element.appendChild(link)
  })
  expect(await detailEnglishIn(content, 'fr')).toEqual(['Last Updated:', 'View Original Posting'])
})
