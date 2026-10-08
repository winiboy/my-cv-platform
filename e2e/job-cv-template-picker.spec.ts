import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page, Route } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * The template picker in the "Create CV from Job" modal on
 * /[locale]/dashboard/jobs (US-002).
 *
 * Nothing leaves the machine. The job list (`/api/jobs`), the external job
 * fetch (`/api/jobs/fetch-external`) and the AI generation
 * (`/api/ai/generate-from-job-description`) are answered by `page.route`. The
 * generation stub records the request body, which is what the modal is
 * accountable for, and answers with the id of a resume row this spec created
 * for the signed-in user through the service-role client, so the redirect
 * lands on an editor that really loads instead of a 404 whose console output
 * would muddy the console gate.
 *
 * The page itself is loaded with `page.goto` and its HTTP status asserted:
 * the modal's thumbnails are drawn by the resume templates, and a server
 * render that failed would be hidden by the client re-render.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E job CV template picker spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const ORDER = ['modern', 'classic', 'minimal', 'creative', 'professional']

const STRINGS = {
  fr: {
    createCV: 'Créer un CV',
    adaptCV: 'Adapter mon CV',
    newCV: 'Nouveau CV',
    selectCV: 'Sélectionner le CV',
    submit: 'Analyser et générer un nouveau CV',
    analyze: "Analyser et générer l'adaptation",
    creating: 'Création de votre CV...',
    groupLabel: 'Choisir un modèle',
    names: ['Moderne', 'Classique', 'Minimaliste', 'Créatif', 'Professionnel'],
    educationHeading: 'Formation',
  },
  en: {
    createCV: 'Create CV',
    adaptCV: 'Adapt My CV',
    newCV: 'New CV',
    selectCV: 'Select CV',
    submit: 'Analyze and generate new CV',
    analyze: 'Analyze & Generate Adaptation',
    creating: 'Creating your CV...',
    groupLabel: 'Choose Template',
    names: ['Modern', 'Classic', 'Minimal', 'Creative', 'Professional'],
    educationHeading: 'Education',
  },
} as const

type TestLocale = keyof typeof STRINGS

/** The one job the stubbed `/api/jobs` lists. */
const JOB = {
  id: 'e2e-job-cv-template-picker',
  title: 'Product Designer',
  company: 'Listing Company SA',
  location_city: 'Lausanne',
  location_country: 'CH',
  employment_type: 'full-time',
  description:
    'Listing description. You will design product flows for a Swiss software company and work with engineering and research teams every day.',
  posted_date: '2026-01-15',
  application_url: 'https://jobs.example.test/offers/product-designer',
  is_saved: false,
}

/** What the stubbed external fetch returns; the modal is prefilled from it. */
const FETCHED = {
  jobTitle: 'Senior Product Designer',
  company: 'Northwind Systems',
  jobDescription:
    'Northwind Systems is hiring a Senior Product Designer in Lausanne. You will own end-to-end design of our scheduling product, ' +
    'run user research, build and maintain the design system, and work closely with product managers and engineers.',
}

/** The request body the modal sent before this story, minus `template`. */
function expectedRequestFields(locale: TestLocale) {
  return {
    jobDescription: FETCHED.jobDescription,
    title: `CV - ${FETCHED.company}`,
    locale,
  }
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

interface GenerationStub {
  /** Every JSON body POSTed to the generation endpoint, in order. */
  bodies: Record<string, unknown>[]
  /** The resume id the next successful response carries. */
  respondWith: (resumeId: string) => void
  /** Hold the next response until `release` is called. */
  hold: () => { release: () => void }
}

/**
 * Stub the three network dependencies of the Job Search page. Registered
 * before navigation so that the page's first `/api/jobs` call is answered.
 */
async function stubJobSearch(page: Page): Promise<GenerationStub> {
  await page.route(
    (url) => url.pathname === '/api/jobs',
    (route) => route.fulfill({ json: { jobs: [JOB], total: 1, source: 'mock' } })
  )

  await page.route(
    (url) => url.pathname === '/api/jobs/fetch-external',
    (route) => route.fulfill({ json: { success: true, ...FETCHED } })
  )

  const bodies: Record<string, unknown>[] = []
  let resumeId: string | null = null
  let gate: Promise<void> | null = null

  await page.route(
    (url) => url.pathname === '/api/ai/generate-from-job-description',
    async (route: Route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>)
      if (gate) await gate
      if (resumeId === null) throw new Error('The generation stub was called before a resume id was set')
      await route.fulfill({ json: { success: true, resumeId } })
    }
  )

  return {
    bodies,
    respondWith: (id) => {
      resumeId = id
    },
    hold: () => {
      let release: () => void = () => {}
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null
          resolve()
        }
      })
      return { release }
    },
  }
}

async function openJobSearch(page: Page, locale: TestLocale): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/jobs`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 2, name: JOB.title, exact: true })).toBeVisible()
}

const radios = (page: Page): Locator => page.getByRole('radiogroup').getByRole('radio')
const thumbnails = (page: Page): Locator => page.getByTestId('template-thumbnail')
const drawnThumbnails = (page: Page): Locator =>
  page.locator('[data-testid="template-thumbnail"] [data-testid="resume-document"]')

/** The modal's scrolling body: the nearest scroll container of the picker. */
const modalBody = (page: Page): Locator =>
  page.getByRole('radiogroup').locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]')

async function checkedTemplates(page: Page): Promise<(string | null)[]> {
  return radios(page).evaluateAll((elements) =>
    elements
      .filter((element) => element.getAttribute('aria-checked') === 'true')
      .map((element) => element.getAttribute('data-template'))
  )
}

/** Open the modal from "Créer un CV" and wait until all five thumbnails are drawn. */
async function openFromCreateCV(page: Page, locale: TestLocale): Promise<number> {
  const started = Date.now()
  await page.getByRole('button', { name: STRINGS[locale].createCV, exact: true }).click()
  await expect(page.getByRole('radiogroup')).toBeVisible()
  await expect(drawnThumbnails(page)).toHaveCount(5)
  return Date.now() - started
}

async function submitAndExpectEditor(page: Page, locale: TestLocale, resumeId: string): Promise<void> {
  await page.getByRole('button', { name: STRINGS[locale].submit, exact: true }).click()
  await page.waitForURL(new RegExp(`/${locale}/dashboard/resumes/${resumeId}/edit$`), { timeout: 30_000 })
}

test('fr "Créer un CV": the picker defaults to Professional, is frozen while creating, and posts it', async ({ page, authedUser }) => {
  const problems = watchConsole(page)
  const stub = await stubJobSearch(page)
  const resumeId = await createResume(authedUser.id, 'Job CV template picker, default')
  stub.respondWith(resumeId)

  await openJobSearch(page, 'fr')
  const openMs = await openFromCreateCV(page, 'fr')
  console.log(`[job-cv-template-picker] "Créer un CV" click to five thumbnails drawn: ${openMs} ms`)
  expect(openMs).toBeLessThan(10_000)

  // The group carries its visible, localized label.
  await expect(page.getByRole('radiogroup', { name: STRINGS.fr.groupLabel })).toBeVisible()

  // Five options in order, named in French; Professional is the default.
  await expect(radios(page)).toHaveCount(5)
  expect(await radios(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-template')))).toEqual(ORDER)
  for (const [index, name] of STRINGS.fr.names.entries()) {
    await expect(radios(page).nth(index)).toHaveAccessibleName(name)
  }
  expect(await checkedTemplates(page)).toEqual(['professional'])

  // Each thumbnail draws its own option's template with French headings.
  expect(await thumbnails(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-template')))).toEqual(ORDER)
  for (const thumbnail of await thumbnails(page).all()) {
    await expect(thumbnail).toHaveAttribute('aria-hidden', 'true')
    await expect(thumbnail).toContainText(STRINGS.fr.educationHeading)
  }

  // The picker sits between the company field and the submit button.
  const order = await page.evaluate((submitLabel) => {
    const group = document.querySelector('[role="radiogroup"]')
    const company = document.querySelector('input[placeholder="ex. : Google"]')
    const submit = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === submitLabel)
    if (!group || !company || !submit) return null
    return {
      afterCompany: Boolean(company.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforeSubmit: Boolean(group.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING),
    }
  }, STRINGS.fr.submit)
  expect(order).toEqual({ afterCompany: true, beforeSubmit: true })

  // Prefill is unchanged.
  await expect(page.locator('textarea')).toHaveValue(FETCHED.jobDescription)

  // While the request is pending the input stage, picker included, gives way
  // to the progress message: the selection cannot be changed.
  const { release } = stub.hold()
  await page.getByRole('button', { name: STRINGS.fr.submit, exact: true }).click()
  await expect(page.getByText(STRINGS.fr.creating, { exact: true })).toBeVisible()
  await expect(page.getByRole('radiogroup')).toHaveCount(0)
  expect(stub.bodies).toHaveLength(1)
  release()

  await page.waitForURL(new RegExp(`/fr/dashboard/resumes/${resumeId}/edit$`), { timeout: 30_000 })
  expect(stub.bodies).toEqual([{ ...expectedRequestFields('fr'), template: 'professional' }])

  expect(problems).toEqual([])
})

test('fr "Créer un CV": each other template, chosen by pointer or keyboard, is the one posted', async ({ page, authedUser }) => {
  const problems = watchConsole(page)
  const stub = await stubJobSearch(page)

  const choices: { template: string; choose: () => Promise<void> }[] = [
    { template: 'modern', choose: () => radios(page).nth(0).click() },
    {
      template: 'classic',
      choose: async () => {
        // Home jumps to the first option, ArrowRight moves to the next.
        await radios(page).nth(4).focus()
        await page.keyboard.press('Home')
        await page.keyboard.press('ArrowRight')
      },
    },
    { template: 'minimal', choose: () => radios(page).nth(2).click() },
    {
      template: 'creative',
      choose: async () => {
        // From the default Professional, ArrowLeft moves to the previous option.
        await radios(page).nth(4).focus()
        await page.keyboard.press('ArrowLeft')
      },
    },
  ]

  for (const [index, { template, choose }] of choices.entries()) {
    const resumeId = await createResume(authedUser.id, `Job CV template picker, ${template}`)
    stub.respondWith(resumeId)

    await openJobSearch(page, 'fr')
    await openFromCreateCV(page, 'fr')
    expect(await checkedTemplates(page)).toEqual(['professional'])

    await choose()
    expect(await checkedTemplates(page)).toEqual([template])

    await submitAndExpectEditor(page, 'fr', resumeId)
    expect(stub.bodies[index]).toEqual({ ...expectedRequestFields('fr'), template })
  }

  expect(stub.bodies).toHaveLength(choices.length)
  expect(problems).toEqual([])
})

test('fr "Adapter mon CV": "Nouveau CV" shows the picker, adapting an existing CV does not', async ({ page, authedUser }) => {
  const problems = watchConsole(page)
  const stub = await stubJobSearch(page)
  // Two CVs, so "Adapter mon CV" opens the selector instead of going straight
  // to adapting the only one.
  const existingId = await createResume(authedUser.id, 'Existing CV A')
  await createResume(authedUser.id, 'Existing CV B')
  const createdId = await createResume(authedUser.id, 'Job CV template picker, from selector')
  stub.respondWith(createdId)

  await openJobSearch(page, 'fr')

  // Adapt an existing CV: the purple adapt modal, with no picker.
  await page.getByRole('button', { name: STRINGS.fr.adaptCV, exact: true }).click()
  await page.locator(`input[type="radio"][value="${existingId}"]`).check()
  await page.getByRole('button', { name: STRINGS.fr.selectCV, exact: true }).click()
  await expect(page.getByRole('button', { name: STRINGS.fr.analyze, exact: true })).toBeVisible()
  await expect(page.getByRole('radiogroup')).toHaveCount(0)
  await expect(thumbnails(page)).toHaveCount(0)
  await openJobSearch(page, 'fr')

  // "Nouveau CV" from the selector: the create modal, with the picker.
  await page.getByRole('button', { name: STRINGS.fr.adaptCV, exact: true }).click()
  await page.locator('input[type="radio"][value="new"]').check()
  await page.getByRole('button', { name: STRINGS.fr.newCV, exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: STRINGS.fr.groupLabel })).toBeVisible()
  await expect(drawnThumbnails(page)).toHaveCount(5)
  expect(await checkedTemplates(page)).toEqual(['professional'])

  await radios(page).nth(2).click()
  await submitAndExpectEditor(page, 'fr', createdId)
  expect(stub.bodies).toEqual([{ ...expectedRequestFields('fr'), template: 'minimal' }])

  expect(problems).toEqual([])
})

test('en: the label, the five names and the thumbnail headings are in English', async ({ page, authedUser }) => {
  expect(authedUser.id).toBeTruthy()
  const problems = watchConsole(page)
  await stubJobSearch(page)

  await openJobSearch(page, 'en')
  await openFromCreateCV(page, 'en')

  await expect(page.getByRole('radiogroup', { name: STRINGS.en.groupLabel })).toBeVisible()
  for (const [index, name] of STRINGS.en.names.entries()) {
    await expect(radios(page).nth(index)).toHaveAccessibleName(name)
  }
  expect(await checkedTemplates(page)).toEqual(['professional'])
  for (const thumbnail of await thumbnails(page).all()) {
    await expect(thumbnail).toContainText(STRINGS.en.educationHeading)
  }

  expect(problems).toEqual([])
})

/** No horizontal overflow in the modal, and every option can be scrolled fully into view. */
async function expectModalFits(page: Page): Promise<void> {
  const overflow = await modalBody(page).evaluate((body) => ({
    body: body.scrollWidth - body.clientWidth,
    overlay: (() => {
      const overlay = body.closest('.fixed.inset-0')
      return overlay ? overlay.scrollWidth - overlay.clientWidth : null
    })(),
  }))
  expect(overflow.body).toBeLessThanOrEqual(0)
  expect(overflow.overlay).not.toBeNull()
  expect(overflow.overlay as number).toBeLessThanOrEqual(0)

  // Fully visible means inside the modal body's visible box once scrolled to.
  // Edges are compared with a 1px tolerance: scrolling lands on fractional
  // offsets, which `toBeInViewport({ ratio: 1 })` reports as 0.9995.
  const body = await modalBody(page).boundingBox()
  const viewport = page.viewportSize()
  if (!body || !viewport) throw new Error('The modal body or the viewport has no size')
  expect(body.x).toBeGreaterThanOrEqual(0)
  expect(body.x + body.width).toBeLessThanOrEqual(viewport.width)
  expect(body.y).toBeGreaterThanOrEqual(0)
  expect(body.y + body.height).toBeLessThanOrEqual(viewport.height)

  for (const option of await radios(page).all()) {
    await option.scrollIntoViewIfNeeded()
    const box = await option.boundingBox()
    if (!box) throw new Error('An option has no layout box')
    expect(box.x).toBeGreaterThanOrEqual(body.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(body.x + body.width + 1)
    expect(box.y).toBeGreaterThanOrEqual(body.y - 1)
    expect(box.y + box.height).toBeLessThanOrEqual(body.y + body.height + 1)
  }
}

test('at 768px, the narrowest width the job detail panel is shown, the modal does not overflow', async ({ page, authedUser }) => {
  expect(authedUser.id).toBeTruthy()
  const problems = watchConsole(page)
  await stubJobSearch(page)
  await page.setViewportSize({ width: 768, height: 1024 })

  await openJobSearch(page, 'fr')
  await openFromCreateCV(page, 'fr')

  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(documentOverflow).toBeLessThanOrEqual(0)
  await expectModalFits(page)

  expect(problems).toEqual([])
})

test('at 375px the modal does not overflow and every option can be scrolled fully into view', async ({ page, authedUser }) => {
  expect(authedUser.id).toBeTruthy()
  const problems = watchConsole(page)
  await stubJobSearch(page)
  await page.setViewportSize({ width: 375, height: 812 })

  const response = await page.goto('/fr/dashboard/jobs')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 3, name: JOB.title, exact: true })).toBeVisible()

  // Below md the existing layout hides the job detail panel, and with it the
  // "Créer un CV" button and the modal it owns (`hidden md:block`, unchanged
  // by this story). The panel's wrapper is revealed so the modal can be opened
  // at this width. The modal is `position: fixed` and its wrapper has no
  // transform, filter or containment, so its geometry depends on the viewport
  // alone: what is measured here is what a phone would show.
  // A CSS locator, because role locators leave out elements that are not displayed.
  const createButton = page.locator('button', { hasText: new RegExp(`^\\s*${STRINGS.fr.createCV}\\s*$`) })
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

  await openFromCreateCV(page, 'fr')
  await expectModalFits(page)

  expect(problems).toEqual([])
})
