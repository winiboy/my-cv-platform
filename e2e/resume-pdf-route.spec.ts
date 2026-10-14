import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import type { APIResponse, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { test, expect, createTestUser, deleteTestUser } from './fixtures/auth'
import { FIXTURE_CONTACT, FIXTURE_SUMMARY, seedFixtureResume, type FixtureContentOverrides } from './fixtures/resume'
import { LONG_EXPERIENCE } from './fixtures/page-breaks'
import { A4_PT, rasteriseColumns, readPdf, type ReadPdf, type Rgb } from './fixtures/pdf'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { resolveLayoutModel } from '../src/lib/layout-settings'
import { layoutCacheKey } from '../src/lib/resume-layout-store'
import { PAGE_WIDTH_PX } from '../src/lib/resume-page-size'
import { MAX_DRAFT_LENGTH, MAX_PDF_REQUEST_BYTES, MAX_PHOTO_LENGTH } from '../src/lib/pdf/payload'
import enCommon from '../src/locales/en/common.json'
import type { ResumeTemplate } from '../src/types/database'

/**
 * US-001 (resume-pdf-direct-download): the server returns the resume PDF the
 * Preview shows.
 *
 * THE REFERENCE. Every fidelity case compares the route's PDF with the PDF the
 * Preview page prints in this test's own browser — print media, the page's
 * `@page` size, the controls toggle in its shipped state — which is how the
 * parity and print suites reproduce a user's print. Page count, page size and
 * the text of every page must be identical.
 *
 * WHAT IS NOT MOCKED. Two real users, the real login, the real route, the real
 * headless Chromium behind it, the real local Supabase stack.
 *
 * Timings of the route are attached to each test as annotations.
 */

const TEMPLATES: readonly ResumeTemplate[] = ['professional', 'modern', 'classic', 'minimal', 'creative']

/**
 * A layout no default produces, in properties every template draws: a picker
 * font served by Google Fonts (so the renderer's one network exception is
 * exercised), a larger type scale and a sidebar colour and width.
 */
const NON_DEFAULT_LAYOUT = {
  fontFamily: "'Roboto', sans-serif",
  fontScale: 1.1,
  sidebarWidth: 38,
  sidebarHue: 150,
  sidebarSaturation: 60,
  sidebarBrightness: 28,
}

const LAYOUT_CASES: readonly { name: string; layout: Record<string, unknown> | null; content: FixtureContentOverrides }[] = [
  { name: 'default layout', layout: null, content: {} },
  { name: 'non-default layout, multi-page', layout: NON_DEFAULT_LAYOUT, content: { experience: LONG_EXPERIENCE } },
]

const PHOTO = `data:image/jpeg;base64,${readFileSync(path.join(__dirname, 'fixtures', 'photo-portrait.jpg')).toString('base64')}`

let service: SupabaseClient | null = null
function admin(): SupabaseClient {
  const url = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
  const key = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY
  assertLocalSupabase(url, 'The resume PDF route spec')
  if (!service) service = createClient(url, key, { auth: { persistSession: false } })
  return service
}

async function updateResume(resumeId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await admin().from('resumes').update(fields).eq('id', resumeId)
  if (error) throw new Error(`Could not update the resume: ${error.message}`)
}

async function storedRow(resumeId: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin().from('resumes').select('*').eq('id', resumeId).single()
  if (error || !data) throw new Error(`Could not read the resume: ${error?.message ?? 'no row'}`)
  return data
}

const pdfUrl = (resumeId: string) => `/api/resumes/${resumeId}/download-pdf?locale=en`

/** POST to the route with the page's own session, timing the call. */
async function requestPdf(page: Page, resumeId: string, data: Record<string, unknown> | string = {}): Promise<APIResponse> {
  const started = Date.now()
  const response = await page.request.post(pdfUrl(resumeId), {
    data,
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  test.info().annotations.push({ type: 'route', description: `${response.status()} in ${Date.now() - started} ms` })
  return response
}

/**
 * Print the Preview page in this test's browser, as a user does, after the
 * same settling the route waits for: hydrated, the mount effects applied (the
 * layout cache written), fonts loaded and images decoded. `storage` is what
 * the user's browser holds for this resume — a draft, a photo.
 */
async function printPreview(page: Page, resumeId: string, storage: Record<string, string> = {}): Promise<Buffer> {
  if (Object.keys(storage).length > 0) {
    // Any page of the app's origin, so the entries land in its localStorage.
    await page.goto('/en/dashboard/resumes')
    await page.evaluate((entries) => {
      for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value)
    }, storage)
  }
  const response = await page.goto(`/en/dashboard/resumes/${resumeId}/preview`)
  expect(response?.status()).toBe(200)
  await page.waitForFunction((cacheKey) => {
    const root = document.querySelector('[data-testid="resume-document"]')
    const hydrated = !!root && Object.keys(root).some((key) => key.startsWith('__reactFiber$'))
    return hydrated && window.localStorage.getItem(cacheKey) !== null
  }, layoutCacheKey(resumeId))
  await page.evaluate(async () => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await frame()
    await frame()
    await document.fonts.ready
    await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => undefined)))
  })
  await expect(page.getByTestId('controls-toggle')).toBeChecked()
  await page.emulateMedia({ media: 'print' })
  const pdf = await page.pdf({ preferCSSPageSize: true })
  await page.emulateMedia({ media: 'screen' })
  return pdf
}

/**
 * A document's text with all whitespace removed and case folded, for "does the
 * PDF say this" checks: pdf.js splits a line into runs wherever the PDF
 * positions glyphs separately (`SOFTW ARE`), and templates may upper-case a
 * heading. Page-by-page equality between two PDFs is still exact.
 */
const flat = (text: string) => text.replace(/\s+/g, '').toLowerCase()
const pdfText = (pdf: ReadPdf) => flat(pdf.pages.map((p) => p.text).join(''))

/**
 * Image XObjects in the Preview's own print of the stored resume, with nothing
 * in localStorage: what the template embeds without any photo (Modern draws
 * some of its print as images). A photo is one image more than this.
 */
async function imagesWithoutPhoto(page: Page, resumeId: string): Promise<number> {
  return (await readPdf(await printPreview(page, resumeId))).images
}

async function okPdf(response: APIResponse): Promise<Buffer> {
  expect(response.status(), await response.text().catch(() => '')).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
  const body = await response.body()
  expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  return body
}

/** Same pages, same page size (A4), same text on every page. */
function expectSamePdf(route: ReadPdf, preview: ReadPdf): void {
  expect(route.pages.length, 'page count: route vs Preview print').toBe(preview.pages.length)
  route.pages.forEach((routePage, index) => {
    const previewPage = preview.pages[index]
    expect(routePage.text, `page ${index + 1} text: route vs Preview print`).toBe(previewPage.text)
    expect([routePage.widthPt, routePage.heightPt], `page ${index + 1} size: route vs Preview print`).toEqual([
      previewPage.widthPt,
      previewPage.heightPt,
    ])
    expect(Math.abs(routePage.widthPt - A4_PT.width), `page ${index + 1} width is A4`).toBeLessThanOrEqual(1)
    expect(Math.abs(routePage.heightPt - A4_PT.height), `page ${index + 1} height is A4`).toBeLessThanOrEqual(1)
  })
}

/** No browser header or footer: no URL, no page title, no date on any page. */
function expectNoPrintChrome(pdf: ReadPdf): void {
  pdf.pages.forEach((p, index) => {
    for (const forbidden of ['127.0.0.1', 'localhost', '/dashboard/', '/api/', 'http://', enCommon.meta.title]) {
      expect(p.text, `page ${index + 1} carries "${forbidden}"`).not.toContain(forbidden)
    }
    expect(p.text, `page ${index + 1} carries a printed date`).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)
  })
}

// ---------------------------------------------------------------------------
// Modern: the band reaches the bottom of every page
// ---------------------------------------------------------------------------

const PT_PER_PX = 0.75
const PAPER: Rgb = [255, 255, 255]
const CHANNEL_TOLERANCE = 3
const agrees = (a: Rgb, b: Rgb) => a.every((v, i) => Math.abs(v - b[i]) <= CHANNEL_TOLERANCE)

/** CSS `hsl()` to sRGB, per CSS Color 4, written independently of the app. */
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const s = saturation / 100
  const l = lightness / 100
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

/**
 * The checks `e2e/modern-print-sidebar-full-page.spec.ts` makes, on the
 * route's PDF: inside the band (2pt from the left edge, 4pt inside its right
 * edge) no row of any page is paper, and below the last page's text both
 * columns are exactly the stored colour to the last row while 4pt past the
 * band is paper.
 */
async function expectModernBand(page: Page, pdf: Buffer, layout: Record<string, unknown> | null): Promise<void> {
  const model = resolveLayoutModel(layout)
  const colour = hslToRgb(model.sidebarHue, model.sidebarSaturation, model.sidebarBrightness)
  const bandPt = (model.sidebarWidth / 100) * PAGE_WIDTH_PX * PT_PER_PX
  const pages = await rasteriseColumns(page, pdf, [2, bandPt - 4, bandPt + 4])

  expect(pages.length, 'the Modern case prints several pages').toBeGreaterThanOrEqual(2)
  pages.forEach((p, index) => {
    for (const [label, column] of [['inside left', p.columns[0]], ['inside right', p.columns[1]]] as const) {
      const paperRows = column.filter((rgb) => agrees(rgb, PAPER)).length
      expect(paperRows, `page ${index + 1}, ${label}: paper rows in the band`).toBe(0)
    }
  })

  const last = pages[pages.length - 1]
  expect(last.lowestTextPt, 'the last page carries text').not.toBeNull()
  const from = Math.ceil((last.lowestTextPt ?? 0) + 20)
  expect(last.height - from, 'the last page is only partly filled').toBeGreaterThan(100)
  for (const [label, column, expected] of [
    ['inside left', last.columns[0], colour],
    ['inside right', last.columns[1], colour],
    ['outside', last.columns[2], PAPER],
  ] as const) {
    const wrong = column.slice(from).filter((rgb) => !agrees(rgb, expected)).length
    expect(wrong, `last page below the content, ${label}: rows not ${expected.join(',')}`).toBe(0)
  }
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

test.describe('resume PDF route: access', () => {
  test('401 without a session, and with a forged one', async ({ page, authedUser, playwright, baseURL }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    const anonymous = await playwright.request.newContext({ baseURL })
    try {
      const response = await anonymous.post(pdfUrl(resume.id), { data: {} })
      expect(response.status()).toBe(401)
      expect(response.headers()['content-type']).toContain('application/json')

      const forged = await anonymous.post(pdfUrl(resume.id), {
        data: {},
        headers: { Cookie: 'sb-127-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJmb3JnZWQifQ' },
      })
      expect(forged.status()).toBe(401)
    } finally {
      await anonymous.dispose()
    }
    // The signed-in owner, for contrast, is served.
    await okPdf(await requestPdf(page, resume.id))
  })

  test("404 for another real user's resume, a resume that does not exist and a malformed id", async ({
    page,
    authedUser,
  }) => {
    const other = await createTestUser()
    try {
      const theirs = await seedFixtureResume(other.id, 'modern')
      const response = await requestPdf(page, theirs.id)
      expect(response.status()).toBe(404)
      expect(await response.json()).toEqual({ error: 'Resume not found' })

      expect((await requestPdf(page, '00000000-0000-4000-8000-000000000000')).status()).toBe(404)
      expect((await requestPdf(page, 'not-a-uuid')).status()).toBe(404)

      // A draft naming the other user's resume does not reach it either.
      const mine = await seedFixtureResume(authedUser.id, 'modern')
      const smuggled = await requestPdf(page, theirs.id, { draft: JSON.stringify({ id: mine.id }) })
      expect(smuggled.status()).toBe(404)
    } finally {
      await deleteTestUser(other.id)
    }
  })

  test('the draft is accepted only for the resume in the URL', async ({ page, authedUser }) => {
    const target = await seedFixtureResume(authedUser.id, 'classic')
    const another = await seedFixtureResume(authedUser.id, 'classic')
    const response = await requestPdf(page, target.id, {
      draft: JSON.stringify({ ...(await storedRow(another.id)), summary: 'Wrong resume' }),
    })
    expect(response.status()).toBe(400)

    const foreignOwner = await requestPdf(page, target.id, {
      draft: JSON.stringify({ ...(await storedRow(target.id)), user_id: '00000000-0000-4000-8000-000000000000' }),
    })
    expect(foreignOwner.status()).toBe(400)
  })

  test('415 for a body that is not JSON', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    const response = await page.request.post(pdfUrl(resume.id), {
      data: 'draft=x',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    expect(response.status()).toBe(415)
  })

  test('413 for an oversized body and an oversized draft', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')

    const oversizedBody = `{"draft":"${'x'.repeat(MAX_PDF_REQUEST_BYTES)}"}`
    expect((await requestPdf(page, resume.id, oversizedBody)).status()).toBe(413)

    const oversizedDraft = JSON.stringify({ ...(await storedRow(resume.id)), summary: 'x'.repeat(MAX_DRAFT_LENGTH) })
    expect(oversizedDraft.length).toBeLessThan(MAX_PDF_REQUEST_BYTES)
    expect((await requestPdf(page, resume.id, { draft: oversizedDraft })).status()).toBe(413)
  })
})

// ---------------------------------------------------------------------------
// Response metadata
// ---------------------------------------------------------------------------

test.describe('resume PDF route: the file', () => {
  /** The two filename parameters, decoded the way a browser reads them. */
  function filenames(disposition: string | undefined): { type: string; ascii: string; unicode: string } {
    const header = disposition ?? ''
    const encoded = /filename\*=UTF-8''([^;\s]+)/.exec(header)?.[1] ?? ''
    return {
      type: header.split(';')[0],
      ascii: /filename="([^"]*)"/.exec(header)?.[1] ?? '',
      unicode: decodeURIComponent(encoded),
    }
  }

  test('an attachment named after the title: non-ASCII encoded, quotes neutralized; private, no print chrome', async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    await updateResume(resume.id, { title: 'CV "Zoë" – Zürich' })

    const response = await requestPdf(page, resume.id)
    const pdf = await okPdf(response)
    const headers = response.headers()
    expect(headers['content-disposition']).toMatch(/^[\x20-\x7e]+$/)
    expect(filenames(headers['content-disposition'])).toEqual({
      type: 'attachment',
      ascii: 'CV _Zoe_ _ Zurich.pdf',
      unicode: 'CV _Zoë_ – Zürich.pdf',
    })
    expect(headers['cache-control']).toBe('private, no-store')
    expectNoPrintChrome(await readPdf(pdf))
  })

  test('an empty title gives resume.pdf', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'minimal')
    await updateResume(resume.id, { title: '' })

    const response = await requestPdf(page, resume.id)
    await okPdf(response)
    expect(response.headers()['content-disposition']).toBe(
      `attachment; filename="resume.pdf"; filename*=UTF-8''resume.pdf`,
    )
  })
})

// ---------------------------------------------------------------------------
// Fidelity
// ---------------------------------------------------------------------------

test.describe('resume PDF route: the PDF is the Preview print', () => {
  for (const template of TEMPLATES) {
    for (const layoutCase of LAYOUT_CASES) {
      test(`${template}, ${layoutCase.name}: same pages, page size and text as the Preview print`, async ({
        page,
        authedUser,
      }) => {
        const resume = await seedFixtureResume(authedUser.id, template, layoutCase.content)
        if (layoutCase.layout) await updateResume(resume.id, { layout_settings: layoutCase.layout })

        const routePdf = await okPdf(await requestPdf(page, resume.id))
        const route = await readPdf(routePdf)
        const preview = await readPdf(await printPreview(page, resume.id))
        test.info().annotations.push({ type: 'pages', description: `route ${route.pages.length}, Preview ${preview.pages.length}` })

        expectSamePdf(route, preview)
        expectNoPrintChrome(route)
        if (layoutCase.content.experience) {
          expect(route.pages.length, 'the long fixture prints several pages').toBeGreaterThanOrEqual(2)
        }
        if (template === 'modern') await expectModernBand(page, routePdf, layoutCase.layout)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// Draft and photo
// ---------------------------------------------------------------------------

test.describe('resume PDF route: the unsaved draft and the photo', () => {
  const DRAFT_SUMMARY = 'Draft summary that was never saved, shown as the Preview shows it.'
  const DRAFT_NAME = 'Draft Name Rivera'

  test('sent: the PDF shows the draft and the photo exactly as the Preview does, and nothing is stored', async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern')
    const before = await storedRow(resume.id)
    const draft = JSON.stringify({
      ...before,
      summary: DRAFT_SUMMARY,
      contact: { ...FIXTURE_CONTACT, name: DRAFT_NAME },
    })

    const withoutPhoto = await imagesWithoutPhoto(page, resume.id)
    const route = await readPdf(await okPdf(await requestPdf(page, resume.id, { draft, photoBase64: PHOTO })))
    const text = pdfText(route)
    expect(text).toContain(flat(DRAFT_SUMMARY))
    expect(text).toContain(flat(DRAFT_NAME))
    expect(text).not.toContain(flat(FIXTURE_SUMMARY))
    expect(route.images, 'the photo is embedded').toBe(withoutPhoto + 1)

    // Nothing the render saw was written back: the row is exactly as it was.
    expect(await storedRow(resume.id)).toEqual(before)

    const preview = await readPdf(
      await printPreview(page, resume.id, {
        [`resume_draft_${resume.id}`]: draft,
        [`resume_photo_${resume.id}`]: PHOTO,
      }),
    )
    expectSamePdf(route, preview)
    expect(route.images, 'images: route vs Preview print').toBe(preview.images)
  })

  test('not sent: the PDF shows the stored resume and no photo', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern')
    const route = await readPdf(await okPdf(await requestPdf(page, resume.id)))
    const text = pdfText(route)
    expect(text).toContain(flat(FIXTURE_SUMMARY))
    expect(text).toContain(flat(FIXTURE_CONTACT.name))
    const preview = await readPdf(await printPreview(page, resume.id))
    expectSamePdf(route, preview)
    expect(route.images, 'no photo: images as in the Preview print without one').toBe(preview.images)
  })

  test('an oversized photo is bounded: the PDF is produced without it', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern')
    const prefix = 'data:image/jpeg;base64,'
    const oversized = prefix + 'A'.repeat(MAX_PHOTO_LENGTH - prefix.length + 4)
    const route = await readPdf(await okPdf(await requestPdf(page, resume.id, { photoBase64: oversized })))
    expect(route.images, 'no photo').toBe(await imagesWithoutPhoto(page, resume.id))
  })
})

// ---------------------------------------------------------------------------
// Untrusted input
// ---------------------------------------------------------------------------

test.describe('resume PDF route: a malicious draft', () => {
  let listener: Server
  let hits: string[] = []
  let remote = ''

  test.beforeAll(async () => {
    listener = createServer((request, response) => {
      hits.push(`${request.method} ${request.url}`)
      response.writeHead(200, { 'Content-Type': 'image/png' })
      response.end()
    })
    await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
    remote = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`
  })

  test.afterAll(async () => {
    await new Promise<void>((resolve) => listener.close(() => resolve()))
  })

  test.beforeEach(() => {
    hits = []
  })

  test('script, iframe, remote image and file:// are neither run nor fetched; the text is sanitized as the Preview sanitizes it', async ({
    page,
    authedUser,
  }) => {
    // If any script ran, it would print this marker; its source spells it out
    // only as character codes, so the sanitized text alone cannot contain it.
    const RUN = "document.body.append(String.fromCharCode(80,87,78,69,68))"
    const hostile =
      '<p>Visible summary text.</p>' +
      `<script>${RUN}</script>` +
      `<img src="${remote}/summary.png" onerror="${RUN}">` +
      `<iframe src="${remote}/frame" onload="${RUN}"></iframe>` +
      '<iframe src="file:///C:/Windows/win.ini"></iframe>' +
      '<iframe src="file:///etc/passwd"></iframe>' +
      '<img src="file:///C:/Windows/win.ini">' +
      `<div style="background-image:url(${remote}/background.png)">Styled</div>` +
      `<svg onload="${RUN}"><image href="${remote}/svg.png"></image></svg>` +
      `<a href="javascript:${RUN}">link</a>`

    const resume = await seedFixtureResume(authedUser.id, 'modern')
    const stored = await storedRow(resume.id)
    const draft = JSON.stringify({
      ...stored,
      summary: hostile,
      experience: [{ ...LONG_EXPERIENCE[0], description: hostile, achievements: [hostile] }],
      contact: { ...FIXTURE_CONTACT, website: `${remote}/website` },
    })

    const response = await requestPdf(page, resume.id, { draft, photoBase64: `${remote}/photo.png` })
    const route = await readPdf(await okPdf(response))
    expect(hits, 'requests the renderer made to an external listener').toEqual([])

    const text = pdfText(route)
    expect(text).toContain(flat('Visible summary text.'))
    expect(text, 'a client script ran').not.toContain('pwned')
    for (const fileContent of ['[fonts]', 'for 16-bit app support', 'root:x:0']) {
      expect(text, `local file content "${fileContent}"`).not.toContain(flat(fileContent))
    }
    expect(await storedRow(resume.id)).toEqual(stored)

    // The Preview, given the same draft and no photo, sanitizes it to the same
    // text and embeds the same images: none came from the hostile URLs.
    const preview = await readPdf(await printPreview(page, resume.id, { [`resume_draft_${resume.id}`]: draft }))
    expectSamePdf(route, preview)
    expect(route.images, 'images: route vs Preview print without a photo').toBe(preview.images)
  })
})
