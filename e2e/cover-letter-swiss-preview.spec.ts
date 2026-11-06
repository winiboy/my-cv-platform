import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import {
  SWISS_LETTER_GEOMETRY_MM,
  SWISS_LETTER_LAYOUT_PX,
  SWISS_LETTER_PAGE_PX,
  mmToPx,
} from '../src/lib/cover-letter-swiss-letter'
import { FRENCH_PARAGRAPHS, GERMAN_OPENING } from './fixtures/swiss-letter'

/**
 * The editor preview shows the letter in the Swiss format on A4
 * (cover-letter-swiss-format, US-002).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * Where the blocks land is layout: the unit tests prove the styles the
 * template writes, only a browser proves where they put the text.
 *
 * WHAT IS ASSERTED, in the editor's preview pane at 1440x900, in fr and de
 *
 *   - The page is A4: 794 px wide unscaled, its height at least 1123 px.
 *   - Top to bottom: the sender block at the top margin, left (25 mm, 18 mm);
 *     the recipient block in the window zone, its left edge 110 mm from the
 *     page's left edge and its top 50 mm from the page's top, at most 85 mm
 *     wide; the place-and-date line at the left margin, below the window
 *     zone; the subject in bold without a label; the greeting; the
 *     paragraphs, left-aligned at 11 pt; the sign-off; the sender's name;
 *     the Annexes block, last.
 *   - The place-and-date line uses the sender's locality without its
 *     postcode, in the letter's language.
 *   - A letter whose details were never set shows its linked CV's phone,
 *     e-mail and locality.
 *   - Annexes never set print the default list; cleared, no Annexes block.
 *   - A typical letter (the default greeting, a three-paragraph body of about
 *     250 words, the sign-off, the sender's name and the Annexes block) fits
 *     one page.
 *
 * Positions are measured on screen and divided by the preview's scale (the
 * page's rendered width over 794), so they are page pixels: 1 mm is
 * 96 / 25.4 px.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter Swiss preview')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Sub-pixel layout and rounding, in page pixels. */
const TOLERANCE = 1.5

const SENDER_NAME = 'Zoë Lovelace'

const geometry = SWISS_LETTER_GEOMETRY_MM
const layout = SWISS_LETTER_LAYOUT_PX

/** The bottom of the window zone, in page pixels from the page's top. */
const WINDOW_ZONE_BOTTOM = mmToPx(geometry.windowTop) + layout.window.height

const STORED_DETAILS = {
  sender_street: 'Rue de Bourg 12',
  sender_postal_locality: '1003 Lausanne',
  sender_phone: '+41 21 555 01 42',
  sender_email: 'zoe@example.ch',
}

const RECIPIENT = {
  recipient_name: 'Madame Claire Dupont',
  recipient_title: 'Responsable des ressources humaines',
  company_name: 'Acme SA',
  company_address: 'Avenue de la Gare 10\n1003 Lausanne',
}

async function insertLetter(userId: string, fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({ user_id: userId, title: 'Lettre suisse', sender_name: SENDER_NAME, greeting: '', sign_off: '', ...fields })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

async function insertResume(userId: string, contact: Record<string, string>): Promise<string> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({ user_id: userId, title: 'CV suisse', template: 'modern', contact })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

/** The date line in `dateLocale`, formatted as the template formats it: same machine, same time zone. */
const dateLine = (dateLocale: string, date: Date) =>
  new Intl.DateTimeFormat(dateLocale, { month: 'long', day: 'numeric', year: 'numeric' }).format(date)

interface PageBox {
  left: number
  top: number
  /** The preview's scale: rendered width over the unscaled 794 px. */
  scale: number
  /** The page element's unscaled height (a transform leaves the layout box as it is). */
  unscaledHeight: number
}

/** A part's box in page pixels, from the page's top-left corner. */
interface PartBox {
  left: number
  top: number
  right: number
  bottom: number
  width: number
}

async function openPreview(page: Page, locale: 'fr' | 'de', letterId: string): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 900 })
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  const letterPage = page.getByTestId('cover-letter-preview-pane').getByTestId('cover-letter-preview-page')
  await expect(letterPage).toBeVisible()
  // The paragraphs are filled in after hydration (`SanitizedHtml`).
  await expect(letterPage.locator('[data-letter-part="greeting"]')).toBeVisible()
  return letterPage
}

async function pageBox(letterPage: Locator): Promise<PageBox> {
  return letterPage.evaluate((element, unscaledWidth) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      scale: rect.width / unscaledWidth,
      unscaledHeight: (element as HTMLElement).offsetHeight,
    }
  }, SWISS_LETTER_PAGE_PX.width)
}

async function partBox(letterPage: Locator, kind: string, box: PageBox): Promise<PartBox> {
  const part = letterPage.locator(`[data-letter-part="${kind}"]`)
  await expect(part, `${kind} is drawn once`).toHaveCount(1)
  const rect = await part.evaluate((element) => {
    const { left, top, right, bottom } = element.getBoundingClientRect()
    return { left, top, right, bottom }
  })
  const toPage = (x: number, origin: number) => (x - origin) / box.scale
  return {
    left: toPage(rect.left, box.left),
    top: toPage(rect.top, box.top),
    right: toPage(rect.right, box.left),
    bottom: toPage(rect.bottom, box.top),
    width: (rect.right - rect.left) / box.scale,
  }
}

/** `actual` within TOLERANCE of `expected`, page pixels. */
function expectNear(actual: number, expected: number, message: string): void {
  expect(Math.abs(actual - expected), `${message}: ${actual} vs ${expected}`).toBeLessThanOrEqual(TOLERANCE)
}

/** The `data-letter-part` names in document order. */
async function partOrder(letterPage: Locator): Promise<string[]> {
  return letterPage
    .locator('[data-letter-part]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-letter-part') ?? ''))
}

async function expectSwissLayout(letterPage: Locator, expected: { placeDate: string[]; subject: string }) {
  const box = await pageBox(letterPage)
  expect(box.scale, 'the page is drawn scaled, but whole').toBeGreaterThan(0.25)
  expect(box.unscaledHeight, 'A4 page height').toBeGreaterThanOrEqual(SWISS_LETTER_PAGE_PX.height)

  expect(await partOrder(letterPage)).toEqual([
    'sender',
    'recipient',
    'placeDate',
    'subject',
    'greeting',
    'opening',
    'body',
    'closing',
    'signOff',
    'signature',
    'annexes',
  ])

  const sender = await partBox(letterPage, 'sender', box)
  expectNear(sender.left, mmToPx(geometry.marginLeft), 'sender at the left margin')
  expectNear(sender.top, mmToPx(geometry.marginTop), 'sender at the top margin')

  const recipient = await partBox(letterPage, 'recipient', box)
  expectNear(recipient.left, mmToPx(geometry.windowLeft), 'recipient 110 mm from the left')
  expectNear(recipient.top, mmToPx(geometry.windowTop), 'recipient 50 mm from the top')
  expect(recipient.width, 'window zone at most 85 mm wide').toBeLessThanOrEqual(mmToPx(geometry.windowMaxWidth) + TOLERANCE)
  expect(recipient.right, 'recipient inside the right margin').toBeLessThanOrEqual(
    mmToPx(geometry.pageWidth - geometry.marginRight) + TOLERANCE,
  )
  expect(recipient.bottom, 'recipient within the six lines of the window zone').toBeLessThanOrEqual(
    WINDOW_ZONE_BOTTOM + TOLERANCE,
  )
  expect(sender.bottom, 'the sender block ends above the window zone').toBeLessThan(recipient.top)

  const placeDate = await partBox(letterPage, 'placeDate', box)
  expectNear(placeDate.left, mmToPx(geometry.marginLeft), 'place and date at the left margin')
  expect(placeDate.top, 'place and date below the window zone').toBeGreaterThanOrEqual(WINDOW_ZONE_BOTTOM - TOLERANCE)
  const placeDateText = (await letterPage.locator('[data-letter-part="placeDate"]').innerText()).trim()
  expect(expected.placeDate).toContain(placeDateText)

  const subject = letterPage.locator('[data-letter-part="subject"]')
  await expect(subject).toHaveText(expected.subject)
  expect(Number(await subject.locator('strong').evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(
    600,
  )

  for (const kind of ['opening', 'body', 'closing'] as const) {
    const style = await letterPage
      .locator(`[data-letter-part="${kind}"] > div`)
      .evaluate((element) => ({ align: getComputedStyle(element).textAlign, size: getComputedStyle(element).fontSize }))
    expect(['left', 'start'], `${kind} is left-aligned`).toContain(style.align)
    expect(parseFloat(style.size), `${kind} at 11 pt`).toBeCloseTo((11 * 96) / 72, 1)
    const paragraph = await partBox(letterPage, kind, box)
    expectNear(paragraph.left, mmToPx(geometry.marginLeft), `${kind} at the left margin`)
    expect(paragraph.right, `${kind} inside the right margin`).toBeLessThanOrEqual(
      mmToPx(geometry.pageWidth - geometry.marginRight) + TOLERANCE,
    )
  }

  // Top to bottom, each part below the one before it.
  const tops: number[] = []
  for (const kind of ['placeDate', 'subject', 'greeting', 'opening', 'body', 'closing', 'signOff', 'signature', 'annexes']) {
    tops.push((await partBox(letterPage, kind, box)).top)
  }
  expect([...tops].sort((a, b) => a - b)).toEqual(tops)

  return box
}

const paragraphs = (texts: readonly string[]) => ({
  opening_paragraph: `<p>${texts[0]}</p>`,
  body_paragraphs: [`<p>${texts[1]}</p>`],
  closing_paragraph: `<p>${texts[2]}</p>`,
})

test('fr: the Swiss blocks sit at their A4 positions, and a typical letter fits one page', async ({
  page,
  authedUser,
}) => {
  const words = FRENCH_PARAGRAPHS.join(' ').split(/\s+/).length
  expect(words, 'a body of about 250 words').toBeGreaterThanOrEqual(240)
  expect(words).toBeLessThanOrEqual(270)

  const startedAt = new Date()
  const letterId = await insertLetter(authedUser.id, {
    ...STORED_DETAILS,
    ...RECIPIENT,
    job_title: 'Ingénieur logiciel',
    annexes: null,
    ...paragraphs(FRENCH_PARAGRAPHS),
  })
  const letterPage = await openPreview(page, 'fr', letterId)
  await expect(letterPage.locator('[data-letter-part="opening"]')).toContainText('Je vous adresse')

  const box = await expectSwissLayout(letterPage, {
    placeDate: [startedAt, new Date()].map((date) => `Lausanne, le ${dateLine('fr-FR', date)}`),
    subject: 'Candidature au poste de Ingénieur logiciel',
  })

  await expect(letterPage.locator('[data-letter-part="sender"]')).toHaveText(
    [SENDER_NAME, 'Rue de Bourg 12', '1003 Lausanne', '+41 21 555 01 42', 'zoe@example.ch'].join(''),
    { useInnerText: false },
  )
  await expect(letterPage.locator('[data-letter-part="greeting"]')).toHaveText('Madame, Monsieur,')
  await expect(letterPage.locator('[data-letter-part="signOff"]')).toHaveText('Meilleures salutations')
  await expect(letterPage.locator('[data-letter-part="signature"]')).toHaveText(SENDER_NAME)
  await expect(letterPage.locator('[data-letter-part="annexes"]')).toHaveText(
    'AnnexesCV, certificats de travail, diplômes',
  )

  // One page: the page keeps its A4 height, and the Annexes block ends above the bottom margin.
  expect(box.unscaledHeight, 'the typical letter does not grow the page').toBe(SWISS_LETTER_PAGE_PX.height)
  const annexes = await partBox(letterPage, 'annexes', box)
  expect(annexes.bottom, 'the Annexes block ends on the first page').toBeLessThanOrEqual(
    SWISS_LETTER_PAGE_PX.height - layout.padding.bottom + TOLERANCE,
  )
  test.info().annotations.push({
    type: 'one-page slack',
    description: `${(SWISS_LETTER_PAGE_PX.height - layout.padding.bottom - annexes.bottom).toFixed(1)} px above the bottom margin`,
  })
})

test('de: the linked CV fills the details never set, and the blocks sit at their A4 positions', async ({
  page,
  authedUser,
}) => {
  const startedAt = new Date()
  const resumeId = await insertResume(authedUser.id, {
    name: SENDER_NAME,
    email: 'zoe.cv@example.ch',
    phone: '+41 44 555 01 99',
    location: '8001 Zürich',
  })
  const letterId = await insertLetter(authedUser.id, {
    resume_id: resumeId,
    sender_street: 'Bahnhofstrasse 1',
    sender_postal_locality: null,
    sender_phone: null,
    sender_email: null,
    recipient_name: 'Herr Jonas Keller',
    company_name: 'Muster AG',
    company_address: 'Limmatquai 5\n8001 Zürich',
    job_title: 'Softwareentwickler',
    annexes: null,
    opening_paragraph: GERMAN_OPENING,
    body_paragraphs: ['<p>In meinem Team verantworte ich die Exporte und die Tests.</p>'],
    closing_paragraph: '<p>Ich freue mich auf ein persönliches Gespräch.</p>',
  })
  const letterPage = await openPreview(page, 'de', letterId)

  await expectSwissLayout(letterPage, {
    placeDate: [startedAt, new Date()].map((date) => `Zürich, ${dateLine('de-DE', date)}`),
    subject: 'Bewerbung als Softwareentwickler',
  })

  await expect(letterPage.locator('[data-letter-part="sender"]')).toHaveText(
    [SENDER_NAME, 'Bahnhofstrasse 1', '8001 Zürich', '+41 44 555 01 99', 'zoe.cv@example.ch'].join(''),
    { useInnerText: false },
  )
  await expect(letterPage.locator('[data-letter-part="greeting"]')).toHaveText('Sehr geehrte Damen und Herren,')
  await expect(letterPage.locator('[data-letter-part="signOff"]')).toHaveText('Freundliche Grüsse')
  await expect(letterPage.locator('[data-letter-part="annexes"]')).toHaveText(
    'BeilagenLebenslauf, Arbeitszeugnisse, Diplome',
  )
  await expect(letterPage).not.toContainText('ß')
  await expect(letterPage).not.toContainText('Betreff')
})

test('annexes cleared print no Annexes block; a stored list prints as written', async ({ page, authedUser }) => {
  const cleared = await insertLetter(authedUser.id, { ...STORED_DETAILS, annexes: '', opening_paragraph: `<p>${FRENCH_PARAGRAPHS[0]}</p>` })
  let letterPage = await openPreview(page, 'fr', cleared)
  await expect(letterPage.locator('[data-letter-part="signature"]')).toHaveText(SENDER_NAME)
  await expect(letterPage.locator('[data-letter-part="annexes"]')).toHaveCount(0)

  const stored = await insertLetter(authedUser.id, {
    ...STORED_DETAILS,
    annexes: 'CV\nDiplôme EPFL',
    opening_paragraph: `<p>${FRENCH_PARAGRAPHS[0]}</p>`,
  })
  letterPage = await openPreview(page, 'fr', stored)
  const annexes = letterPage.locator('[data-letter-part="annexes"]')
  await expect(annexes).toHaveCount(1)
  expect((await annexes.innerText()).split('\n').map((line) => line.trim())).toEqual(['Annexes', 'CV', 'Diplôme EPFL'])
  expect((await partOrder(letterPage)).at(-1)).toBe('annexes')
})
