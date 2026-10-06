import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * The shared template picker on /[locale]/dashboard/resumes/new (US-001).
 *
 * Each page is loaded directly with `page.goto` and its own HTTP status is
 * asserted: the thumbnails are drawn by the resume templates, and a template
 * that reached for `document` during the server render would answer 500 while
 * the client re-render hid it from anything that only looks at the screen.
 *
 * Console errors are collected from before the navigation, so a hydration
 * mismatch or a React error raised while the thumbnails mount fails the test.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E template picker spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const ORDER = ['modern', 'classic', 'minimal', 'creative', 'professional']

const NAMES = {
  fr: ['Moderne', 'Classique', 'Minimaliste', 'Créatif', 'Professionnel'],
  en: ['Modern', 'Classic', 'Minimal', 'Creative', 'Professional'],
  de: ['Modern', 'Klassisch', 'Minimal', 'Kreativ', 'Professionell'],
} as const

/** The fr `resumes.editor.sections.education` heading every template draws. */
const FR_EDUCATION_HEADING = 'Formation'

/**
 * Console output that fails the test: the server-render hazard, hydration
 * mismatches (named in development, minified as #418/#423/#425 in the
 * production build these tests run against) and any other React error.
 */
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

async function openPicker(page: Page, locale: string): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/resumes/new`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('radiogroup')).toBeVisible()
}

const radios = (page: Page): Locator => page.getByRole('radiogroup').getByRole('radio')
const thumbnails = (page: Page): Locator => page.getByTestId('template-thumbnail')

async function expectOnlyChecked(page: Page, template: string): Promise<void> {
  const checked = await radios(page).evaluateAll((elements) =>
    elements.filter((element) => element.getAttribute('aria-checked') === 'true').map((element) => element.getAttribute('data-template'))
  )
  expect(checked).toEqual([template])
}

/** Every thumbnail has drawn its template's page. */
async function expectThumbnailsDrawn(page: Page): Promise<void> {
  await expect(thumbnails(page)).toHaveCount(5)
  for (const thumbnail of await thumbnails(page).all()) {
    await expect(thumbnail.getByTestId('resume-document')).toHaveCount(1)
  }
}

test('fr: five live thumbnails, keyboard and pointer selection, and the CV is created with the chosen template', async ({ page, authedUser }) => {
  const problems = watchConsole(page)
  await openPicker(page, 'fr')

  // Five options, in order, named in French; Modern is the default.
  await expect(radios(page)).toHaveCount(5)
  expect(await radios(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-template')))).toEqual(ORDER)
  for (const [index, name] of NAMES.fr.entries()) {
    await expect(radios(page).nth(index)).toHaveAccessibleName(name)
  }
  await expectOnlyChecked(page, 'modern')

  // Five thumbnails, each drawing its own option's template with fr headings.
  await expectThumbnailsDrawn(page)
  expect(await thumbnails(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-template')))).toEqual(ORDER)
  for (const thumbnail of await thumbnails(page).all()) {
    await expect(thumbnail).toHaveAttribute('aria-hidden', 'true')
    await expect(thumbnail).toContainText(FR_EDUCATION_HEADING)
  }

  // Nothing inside a thumbnail can take focus, even when asked to directly.
  const focusableInside = await thumbnails(page).evaluateAll((elements) =>
    elements.flatMap((thumbnail) =>
      Array.from(thumbnail.querySelectorAll<HTMLElement>('*'))
        .filter((element) => {
          element.focus()
          return document.activeElement === element
        })
        .map((element) => element.outerHTML.slice(0, 80))
    )
  )
  expect(focusableInside).toEqual([])

  // Tab from the title lands on the selected option, then leaves the group.
  await page.locator('#title').focus()
  await page.keyboard.press('Tab')
  await expect(radios(page).nth(0)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('button[type="submit"]')).toBeFocused()

  // Arrow keys move the selection, and focus with it.
  await radios(page).nth(0).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(radios(page).nth(2)).toBeFocused()
  await expectOnlyChecked(page, 'minimal')
  await page.keyboard.press('ArrowLeft')
  await expectOnlyChecked(page, 'classic')

  // A click on the card selects it; the thumbnail does not swallow it.
  await radios(page).nth(3).click()
  await expectOnlyChecked(page, 'creative')

  // Create the CV and land in its editor.
  await page.fill('#title', 'Template picker e2e')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]
  expect(resumeId).toBeTruthy()

  const { data, error } = await admin()
    .from('resumes')
    .select('template, title, user_id')
    .eq('id', resumeId as string)
    .single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'creative', title: 'Template picker e2e', user_id: authedUser.id })

  expect(problems).toEqual([])
})

test('fr: without touching the picker the CV is created as modern', async ({ page, authedUser }) => {
  const problems = watchConsole(page)
  await openPicker(page, 'fr')
  await expectThumbnailsDrawn(page)

  await page.fill('#title', 'Template picker default')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]

  const { data, error } = await admin()
    .from('resumes')
    .select('template, user_id')
    .eq('id', resumeId as string)
    .single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'modern', user_id: authedUser.id })

  expect(problems).toEqual([])
})

for (const locale of ['en', 'de'] as const) {
  test(`${locale}: the five options carry their ${locale} names, Professional included`, async ({ page, authedUser }) => {
    expect(authedUser.id).toBeTruthy()
    const problems = watchConsole(page)
    await openPicker(page, locale)
    await expectThumbnailsDrawn(page)

    for (const [index, name] of NAMES[locale].entries()) {
      await expect(radios(page).nth(index)).toHaveAccessibleName(name)
    }

    expect(problems).toEqual([])
  })
}

test('at 375px the picker does not overflow and every option can be scrolled fully into view', async ({ page, authedUser }) => {
  expect(authedUser.id).toBeTruthy()
  const problems = watchConsole(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await openPicker(page, 'fr')
  await expectThumbnailsDrawn(page)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  for (const option of await radios(page).all()) {
    await option.scrollIntoViewIfNeeded()
    await expect(option).toBeInViewport({ ratio: 1 })

    const thumbnail = option.getByTestId('template-thumbnail')
    await expect(thumbnail).toBeInViewport({ ratio: 1 })

    // The window keeps A4's 210:297 proportion.
    const box = await thumbnail.boundingBox()
    if (!box) throw new Error('Thumbnail has no layout box')
    expect(Math.abs(box.height / box.width - 297 / 210)).toBeLessThan(0.01)
  }

  expect(problems).toEqual([])
})
