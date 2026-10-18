import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * The CV adaptation modal is a keyboard-accessible dialog
 * (adaptation-modal-polish, US-002).
 *
 * From each opener (the resume editor's "Adapter à l'offre", and Job Search's
 * "Adapter mon CV" and "Créer un CV"), at desktop width and at 375px, the
 * modal is opened from the keyboard and must: expose dialog semantics, take
 * focus, keep Tab and Shift+Tab inside, close on Escape from the input stage
 * and (for the adapt flows) from the preview stage, and hand focus back to the
 * opener. Every Tab stop must show an opaque focus indicator with at least
 * 3:1 against what it touches, and in the preview stage the contrast of
 * "No content" and of the close icon is computed from the rendered colours.
 *
 * Nothing leaves the machine: `/api/jobs`, `/api/jobs/fetch-external` and
 * `/api/ai/adapt-resume-to-job` are answered by `page.route`, and the
 * create-from-job route is recorded and aborted, since it must never be
 * reached. The resumes are real rows created through the service-role client.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E adaptation modal keyboard spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const PHONE = { width: 375, height: 812 } as const
const DESKTOP = { width: 1440, height: 900 } as const

const S = {
  editorButton: "Adapter à l'offre",
  adaptCV: 'Adapter mon CV',
  createCV: 'Créer un CV',
  title: "Adapter le CV à l'offre",
  createTitle: "Créer un CV à partir de l'offre",
  analyze: "Analyser et générer l'adaptation",
  close: 'Fermer',
  noContent: 'Aucun contenu',
  // Playwright's text matching folds the U+00A0 before the colon into a space.
  matchScore: /^Score de correspondance\s:$/,
} as const

const DESCRIPTION =
  'Northwind Systems recrute un Product Designer à Lausanne. Vous concevez des parcours, menez la recherche ' +
  'utilisateur et faites vivre le design system avec les équipes produit et ingénierie.'
const JOB_TITLE = 'Product Designer'

const JOB = {
  id: 'e2e-adaptation-modal-keyboard',
  title: 'Product Designer',
  company: 'Northwind Systems',
  location_city: 'Lausanne',
  location_country: 'CH',
  employment_type: 'full-time',
  description: DESCRIPTION,
  posted_date: '2026-01-15',
  application_url: 'https://jobs.example.test/offers/product-designer',
  is_saved: false,
}

const FETCHED = { jobTitle: JOB_TITLE, company: JOB.company, jobDescription: DESCRIPTION }

/** The summary has no original text, so the diff viewer shows "No content". */
const PATCH = {
  jobTitle: JOB_TITLE,
  company: JOB.company,
  jobDescription: DESCRIPTION,
  createdAt: '2026-10-17T00:00:00.000Z',
  locale: 'fr',
  patches: {
    summary: { original: '', proposed: 'Product Designer, Lausanne.', confidence: 'high', reasoning: 'R-1' },
    skillsToAdd: [{ category: 'Design', items: ['Figma'], confidence: 'low', reasoning: 'R-2' }],
  },
  analysis: { matchScore: 72, keyGaps: ['Figma'], strengths: ['Recherche'] },
}

const FORBIDDEN_CONSOLE = [/document is not defined/i, /hydrat/i, /Minified React error/i, /react/i]

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

interface NetworkStub {
  adaptCalls: () => number
  /** Hold the next adaptation response until the returned function is called. */
  holdNextAdaptation: () => () => void
  /** The create-from-job route was reached; every test asserts it was not. */
  generateCalls: () => number
}

async function stubNetwork(page: Page): Promise<NetworkStub> {
  await page.route(
    (url) => url.pathname === '/api/jobs',
    (route) => route.fulfill({ json: { jobs: [JOB], total: 1, source: 'mock' } })
  )
  await page.route(
    (url) => url.pathname === '/api/jobs/fetch-external',
    (route) => route.fulfill({ json: { success: true, ...FETCHED } })
  )

  let adaptCount = 0
  let gate: Promise<void> | null = null
  await page.route(
    (url) => url.pathname === '/api/ai/adapt-resume-to-job',
    async (route) => {
      adaptCount += 1
      const held = gate
      gate = null
      if (held) await held
      await route.fulfill({ json: { success: true, patch: PATCH } })
    }
  )

  let generateCount = 0
  await page.route(
    (url) => url.pathname === '/api/ai/generate-from-job-description',
    (route) => {
      generateCount += 1
      return route.abort()
    }
  )

  return {
    adaptCalls: () => adaptCount,
    holdNextAdaptation: () => {
      let release: () => void = () => undefined
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
      return () => release()
    },
    generateCalls: () => generateCount,
  }
}

const dialogNamed = (page: Page, title: string): Locator => page.getByRole('dialog', { name: title, exact: true })

/** Open the modal from the keyboard, the way a keyboard user does. */
async function openWithKeyboard(page: Page, opener: Locator, title: string): Promise<Locator> {
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = dialogNamed(page, title)
  await expect(dialog).toBeVisible()
  return dialog
}

/** role, aria-modal, and an aria-labelledby that resolves to the visible title. */
async function expectDialogSemantics(dialog: Locator, title: string): Promise<void> {
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  const labelledBy = await dialog.getAttribute('aria-labelledby')
  expect(labelledBy).toBeTruthy()
  const label = await dialog.evaluate(
    (element, id) => {
      const target = element.ownerDocument.getElementById(id)
      return target ? { tag: target.tagName, text: target.textContent, inside: element.contains(target) } : null
    },
    labelledBy as string
  )
  expect(label).toEqual({ tag: 'H2', text: title, inside: true })
}

/** The focused element's position among the dialog's descendants; -1 when focus is outside it. */
async function focusPosition(dialog: Locator): Promise<number> {
  return dialog.evaluate((element) =>
    Array.prototype.indexOf.call(element.querySelectorAll('*'), element.ownerDocument.activeElement)
  )
}

/**
 * Press `key` until focus is back where it started, asserting it never leaves
 * the dialog. Returns the positions visited, ending with the start.
 */
async function walkFocus(
  page: Page,
  dialog: Locator,
  key: 'Tab' | 'Shift+Tab',
  onStop?: () => Promise<void>
): Promise<number[]> {
  const start = await focusPosition(dialog)
  expect(start, 'focus starts inside the dialog').toBeGreaterThanOrEqual(0)
  const visited: number[] = []
  for (let press = 0; press < 60; press += 1) {
    await page.keyboard.press(key)
    const position = await focusPosition(dialog)
    expect(position, `${key} #${press + 1} keeps focus inside the dialog`).toBeGreaterThanOrEqual(0)
    await onStop?.()
    visited.push(position)
    if (position === start) return visited
  }
  throw new Error(`${key} never brought focus back to where it started: ${visited.join(', ')}`)
}

/**
 * Tab cycles forward, Shift+Tab visits the same stops in reverse, and neither
 * leaves the dialog. Every stop of the forward cycle shows a visible focus
 * indicator.
 */
async function expectFocusTrapped(page: Page, dialog: Locator, where: string): Promise<void> {
  const forward = await walkFocus(page, dialog, 'Tab', () => expectFocusIndicator(page, where))
  const backward = await walkFocus(page, dialog, 'Shift+Tab')
  expect(forward.length, 'the cycle has several stops').toBeGreaterThanOrEqual(3)
  expect(backward.slice(0, -1)).toEqual(forward.slice(0, -1).reverse())
}

async function expectFocusOnClose(dialog: Locator): Promise<void> {
  await expect(dialog.getByRole('button', { name: S.close, exact: true })).toBeFocused()
}

async function escapeAndExpectFocusBack(page: Page, dialog: Locator, opener: Locator): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
}

type Rgba = [number, number, number, number]

interface Contrast {
  ratio: number
  foreground: string
  background: string
}

interface FocusIndicator {
  label: string
  focusVisible: boolean
  kind: 'ring' | 'outline' | 'none'
  /** The indicator's colour, `null` when there is none. */
  color: string | null
  opaque: boolean
  /** The indicator's contrast with each colour it touches: its ring offset, if any, and the background around the control. */
  against: { name: 'offset' | 'background'; color: string; ratio: number }[]
  raw: { boxShadow: string; outline: string }
}

/**
 * Runs in the page. Computed colours are resolved to sRGB bytes by painting
 * them on a 1x1 canvas, since Tailwind v4 serialises them as `oklch()`, and
 * contrast is the WCAG ratio against the first opaque background behind.
 *
 * `text`: the element's text colour against the background it sits on.
 * `focus`: the focused element's keyboard focus indicator - the widest opaque
 * box-shadow spread (a Tailwind ring) or else a drawn outline - against its
 * ring offset and the background around the control.
 */
function inspectColors(element: Element, mode: 'text' | 'focus'): Contrast | FocusIndicator {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('No 2D canvas context')
  const toRgba = (color: string): Rgba => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = '#00000000'
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    return [r ?? 0, g ?? 0, b ?? 0, a ?? 0]
  }
  const luminance = ([r, g, b]: Rgba): number => {
    const channel = (value: number) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const ratio = (a: Rgba, b: Rgba): number => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
    return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
  }
  const hex = ([r, g, b]: Rgba) => `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
  const backgroundFrom = (start: Element | null): Rgba => {
    for (let node = start; node; node = node.parentElement) {
      const candidate = toRgba(getComputedStyle(node).backgroundColor)
      if (candidate[3] === 0) continue
      if (candidate[3] !== 255) throw new Error(`A translucent background sits behind the element: ${candidate.join(',')}`)
      return candidate
    }
    throw new Error('No opaque background behind the element')
  }

  if (mode === 'text') {
    const foreground = toRgba(getComputedStyle(element).color)
    if (foreground[3] !== 255) throw new Error(`The foreground is not opaque: ${foreground.join(',')}`)
    const background = backgroundFrom(element)
    return { ratio: ratio(foreground, background), foreground: hex(foreground), background: hex(background) }
  }

  const style = getComputedStyle(element)
  const checkboxLabel =
    element instanceof HTMLInputElement && element.type === 'checkbox'
      ? `checkbox "${element.closest('label')?.textContent?.trim() ?? ''}"`
      : null
  const labelledBy = element.getAttribute('aria-labelledby')
  const referencedLabel = labelledBy
    ? labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
    : null
  const label =
    element.getAttribute('aria-label') ??
    referencedLabel ??
    checkboxLabel ??
    (element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40) ||
      `${element.tagName.toLowerCase()}${element instanceof HTMLInputElement ? `[${element.type}]` : ''}`)

  // Split the box-shadow list on its top-level commas; each layer starts with its colour.
  const layers: string[] = []
  let depth = 0
  let current = ''
  for (const character of style.boxShadow === 'none' ? '' : style.boxShadow) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      layers.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }
  if (current.trim()) layers.push(current.trim())
  const spreads = layers
    .filter((layer) => !/\binset\b/.test(layer))
    .map((layer) => {
      const match = /^((?:[a-z-]+\([^)]*\))|#[0-9a-f]+|[a-z]+)\s+(.*)$/i.exec(layer)
      if (!match) throw new Error(`Unparsed box-shadow layer: ${layer}`)
      const lengths = (match[2] ?? '').split(/\s+/).map((length) => parseFloat(length))
      return { color: toRgba(match[1] ?? ''), spread: lengths[3] ?? 0 }
    })
    .filter((layer) => layer.spread > 0 && layer.color[3] > 0)
    .sort((a, b) => a.spread - b.spread)

  const ring = spreads[spreads.length - 1]
  const background = backgroundFrom(element.parentElement)
  let kind: FocusIndicator['kind'] = 'none'
  let color: Rgba | null = null
  let offset: Rgba | null = null
  if (ring) {
    kind = 'ring'
    color = ring.color
    offset = spreads.length > 1 ? (spreads[spreads.length - 2]?.color ?? null) : null
  } else if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) {
    kind = 'outline'
    color = toRgba(style.outlineColor)
  }
  const against: FocusIndicator['against'] = []
  if (color && offset) against.push({ name: 'offset', color: hex(offset), ratio: ratio(color, offset) })
  if (color) against.push({ name: 'background', color: hex(background), ratio: ratio(color, background) })
  return {
    label,
    focusVisible: element.matches(':focus-visible'),
    kind,
    color: color ? hex(color) : null,
    opaque: color?.[3] === 255,
    against,
    raw: { boxShadow: style.boxShadow, outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}` },
  }
}

async function renderedContrast(target: Locator): Promise<Contrast> {
  return (await target.evaluate(inspectColors, 'text' as const)) as Contrast
}

/** Contrast of "No content" (>= 4.5:1) and of the close icon (>= 3:1), recorded on the test. */
async function expectReadableContrast(dialog: Locator, where: string): Promise<void> {
  const noContent = await renderedContrast(dialog.getByText(S.noContent, { exact: true }))
  const closeIcon = await renderedContrast(dialog.getByRole('button', { name: S.close, exact: true }).locator('svg'))
  for (const [name, measured] of [['no-content', noContent], ['close-icon', closeIcon]] as const) {
    const description = `${where}: ${measured.ratio}:1 (${measured.foreground} on ${measured.background})`
    test.info().annotations.push({ type: `contrast ${name}`, description })
    console.log(`contrast ${name} ${description}`)
  }
  expect(noContent.ratio).toBeGreaterThanOrEqual(4.5)
  expect(closeIcon.ratio).toBeGreaterThanOrEqual(3)
}

/**
 * The focused control, reached by the keyboard, matches :focus-visible and
 * draws an opaque ring or solid outline - not the global `outline-ring/50`
 * default at 50% alpha - with at least 3:1 against everything it touches.
 */
async function expectFocusIndicator(page: Page, where: string): Promise<void> {
  const focused = page.locator(':focus')
  // A control with `transition-all` animates its ring in; read the settled ring.
  await focused.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
  const indicator = (await focused.evaluate(inspectColors, 'focus' as const)) as FocusIndicator
  const measured = indicator.against.map((entry) => `${entry.ratio}:1 vs ${entry.name} ${entry.color}`).join(', ')
  const description = `${where} ${indicator.label}: ${indicator.kind} ${indicator.color ?? '-'} (${measured || 'nothing drawn'})`
  test.info().annotations.push({ type: 'focus indicator', description })
  console.log(`focus ${description}`)
  const detail = JSON.stringify(indicator)
  expect(indicator.focusVisible, `${indicator.label} matches :focus-visible: ${detail}`).toBe(true)
  expect(indicator.kind, `${indicator.label} draws a ring or an outline: ${detail}`).not.toBe('none')
  expect(indicator.opaque, `${indicator.label}'s indicator is opaque: ${detail}`).toBe(true)
  for (const entry of indicator.against) {
    expect(entry.ratio, `${indicator.label} indicator vs ${entry.name}: ${detail}`).toBeGreaterThanOrEqual(3)
  }
}

async function submitForPreview(dialog: Locator): Promise<void> {
  await dialog.locator('textarea').fill(DESCRIPTION)
  await dialog.locator('input[type="text"]').nth(0).fill(JOB_TITLE)
  await dialog.getByRole('button', { name: S.analyze, exact: true }).click()
  await expect(dialog.getByText(S.matchScore)).toBeVisible()
}

/** The adapt flow's full keyboard walk: input stage, then preview stage, each left with Escape. */
async function exerciseAdaptFlow(page: Page, opener: Locator, where: string): Promise<void> {
  // Input stage.
  const dialog = await openWithKeyboard(page, opener, S.title)
  await expectDialogSemantics(dialog, S.title)
  await expectFocusOnClose(dialog)
  await expectFocusTrapped(page, dialog, `${where} input`)
  await escapeAndExpectFocusBack(page, dialog, opener)

  // Preview stage.
  await openWithKeyboard(page, opener, S.title)
  await submitForPreview(dialog)
  // The submit button is gone; focus is back on the close button, inside.
  await expectFocusOnClose(dialog)
  // The cycle ends where it started, on the close button, reached by Tab.
  await expectFocusTrapped(page, dialog, `${where} preview`)
  await expectFocusOnClose(dialog)
  await expectReadableContrast(dialog, where)
  await escapeAndExpectFocusBack(page, dialog, opener)
}

async function exerciseCreateFlow(page: Page, opener: Locator, where: string): Promise<void> {
  const dialog = await openWithKeyboard(page, opener, S.createTitle)
  await expectDialogSemantics(dialog, S.createTitle)
  await expectFocusOnClose(dialog)
  // The template picker is one tab stop (roving tabindex) inside the cycle.
  await expect(dialog.getByRole('radiogroup')).toBeVisible()
  await expectFocusTrapped(page, dialog, `${where} create`)
  await escapeAndExpectFocusBack(page, dialog, opener)
}

async function openEditor(page: Page, resumeId: string): Promise<Locator> {
  const response = await page.goto(`/fr/dashboard/resumes/${resumeId}/edit`)
  expect(response?.status()).toBe(200)
  const opener = page.getByRole('button', { name: S.editorButton, exact: true })
  await expect(opener).toBeVisible()
  return opener
}

async function openJobDetail(page: Page, phone: boolean): Promise<void> {
  const response = await page.goto('/fr/dashboard/jobs')
  expect(response?.status()).toBe(200)
  const detail = page.getByRole('heading', { level: 2, name: JOB.title, exact: true })
  if (phone) {
    // Below md the list comes first; tapping the card shows the detail in its place.
    await page.getByRole('heading', { level: 3, name: JOB.title, exact: true }).click()
  }
  await expect(detail).toBeVisible()
}

for (const [label, viewport] of [['desktop', DESKTOP], ['375px', PHONE]] as const) {
  const phone = viewport === PHONE

  test.describe(`at ${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport)
    })

    test('resume editor: the adaptation modal is a keyboard-accessible dialog', async ({ page, authedUser }) => {
      const problems = watchConsole(page)
      const stub = await stubNetwork(page)
      const resumeId = await createResume(authedUser.id, `Adaptation modal keyboard, editor ${label}`)

      const opener = await openEditor(page, resumeId)
      await exerciseAdaptFlow(page, opener, `editor ${label}`)

      expect(stub.adaptCalls()).toBe(1)
      expect(stub.generateCalls()).toBe(0)
      expect(problems).toEqual([])
    })

    test('Job Search: "Adapter mon CV" and "Créer un CV" open keyboard-accessible dialogs', async ({ page, authedUser }) => {
      const problems = watchConsole(page)
      const stub = await stubNetwork(page)
      // One CV, so "Adapter mon CV" opens the modal without the resume selector.
      await createResume(authedUser.id, `Adaptation modal keyboard, job search ${label}`)

      await openJobDetail(page, phone)
      await exerciseAdaptFlow(page, page.getByRole('button', { name: S.adaptCV, exact: true }), `job search ${label}`)
      await exerciseCreateFlow(page, page.getByRole('button', { name: S.createCV, exact: true }), `job search ${label}`)
      // Closing the modals left the phone on the job detail.
      await expect(page.getByRole('heading', { level: 2, name: JOB.title, exact: true })).toBeVisible()

      expect(stub.adaptCalls()).toBe(1)
      expect(stub.generateCalls()).toBe(0)
      expect(problems).toEqual([])
    })
  })
}

test('Escape during the adaptation request closes the modal as the close button does', async ({ page, authedUser }) => {
  await page.setViewportSize(DESKTOP)
  const problems = watchConsole(page)
  const stub = await stubNetwork(page)
  const resumeId = await createResume(authedUser.id, 'Adaptation modal keyboard, in flight')

  const opener = await openEditor(page, resumeId)
  const dialog = await openWithKeyboard(page, opener, S.title)
  const release = stub.holdNextAdaptation()
  await dialog.locator('textarea').fill(DESCRIPTION)
  await dialog.locator('input[type="text"]').nth(0).fill(JOB_TITLE)
  await dialog.getByRole('button', { name: S.analyze, exact: true }).click()
  await expect.poll(() => stub.adaptCalls()).toBe(1)
  // Processing: the spinner replaced the form, and focus stayed in the dialog.
  await expect(dialog.locator('textarea')).toHaveCount(0)
  await expectFocusOnClose(dialog)

  await escapeAndExpectFocusBack(page, dialog, opener)

  // The request settles after the modal closed: nothing reopens, and the next
  // opening starts again from the input stage.
  const settled = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/ai/adapt-resume-to-job')
  release()
  await settled
  // Give React the turn in which it handles the response.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)))
  await expect(dialogNamed(page, S.title)).toHaveCount(0)
  await openWithKeyboard(page, opener, S.title)
  await expect(dialog.locator('textarea')).toBeVisible()
  await escapeAndExpectFocusBack(page, dialog, opener)

  expect(stub.generateCalls()).toBe(0)
  expect(problems).toEqual([])
})
