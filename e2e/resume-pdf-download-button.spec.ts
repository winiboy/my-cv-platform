import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Download, Page, Request } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from './fixtures/auth'
import { FIXTURE_CONTACT, FIXTURE_SUMMARY, seedFixtureResume } from './fixtures/resume'
import { readPdf, type ReadPdf } from './fixtures/pdf'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { layoutCacheKey } from '../src/lib/resume-layout-store'
import { PDF_DOWNLOAD_TIMEOUT_MS } from '../src/lib/pdf/download-client'
import deCommon from '../src/locales/de/common.json'
import enCommon from '../src/locales/en/common.json'
import frCommon from '../src/locales/fr/common.json'

/**
 * US-002 (resume-pdf-direct-download): "Télécharger PDF" downloads the file
 * instead of printing.
 *
 * The button on the Preview page, clicked as a user clicks it, against the real
 * US-001 route and its real headless Chromium. Only the failure and busy cases
 * intercept the request, to hold it, fail it or cut it; every downloaded PDF is
 * the route's own.
 *
 * `window.print` is replaced before any page script runs by a stub that counts
 * its calls, so a print attempt is recorded instead of opening a dialog.
 */

const PHOTO = `data:image/jpeg;base64,${readFileSync(path.join(__dirname, 'fixtures', 'photo-portrait.jpg')).toString('base64')}`

const PDF_ROUTE = '**/api/resumes/*/download-pdf**'
const DOCX_ROUTE = '**/api/resumes/*/download-docx**'

type Copy = typeof enCommon.resumes
const COPY: Record<'en' | 'fr' | 'de', Copy> = { en: enCommon.resumes, fr: frCommon.resumes, de: deCommon.resumes }

let service: SupabaseClient | null = null
function admin(): SupabaseClient {
  const url = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
  const key = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY
  assertLocalSupabase(url, 'The resume PDF download button spec')
  if (!service) service = createClient(url, key, { auth: { persistSession: false } })
  return service
}

async function storedRow(resumeId: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin().from('resumes').select('*').eq('id', resumeId).single()
  if (error || !data) throw new Error(`Could not read the resume: ${error?.message ?? 'no row'}`)
  return data
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const counted = window as Window & { __printCalls?: number }
    counted.__printCalls = 0
    window.print = () => {
      counted.__printCalls = (counted.__printCalls ?? 0) + 1
    }
  })
})

const printCalls = (page: Page) =>
  page.evaluate(() => (window as Window & { __printCalls?: number }).__printCalls ?? -1)

/** Every request the page sends to this export route, from now on. */
function recordRequests(page: Page, route: 'download-pdf' | 'download-docx'): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith(`/${route}`)) requests.push(request)
  })
  return requests
}

/**
 * Open the Preview page, settled as a user finds it: hydrated (so the button's
 * handler is attached) and the layout loaded. `storage` is what this browser
 * holds for the resume — a draft, a photo — written before the page loads.
 */
async function openPreview(
  page: Page,
  resumeId: string,
  locale: 'en' | 'fr' | 'de' = 'en',
  storage: Record<string, string> = {},
): Promise<void> {
  if (Object.keys(storage).length > 0) {
    await page.goto(`/${locale}/dashboard/resumes`)
    await page.evaluate((entries) => {
      for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value)
    }, storage)
  }
  const response = await page.goto(`/${locale}/dashboard/resumes/${resumeId}/preview`)
  expect(response?.status()).toBe(200)
  await page.waitForFunction((cacheKey) => {
    const root = document.querySelector('[data-testid="resume-document"]')
    const hydrated = !!root && Object.keys(root).some((key) => key.startsWith('__reactFiber$'))
    return hydrated && window.localStorage.getItem(cacheKey) !== null
  }, layoutCacheKey(resumeId))
}

const pdfButton = (page: Page, copy: Copy, busy = false) =>
  page.getByRole('button', { name: busy ? copy.generatingPDF : copy.downloadPDF, exact: true })

/** Click the PDF button and return the file it downloads. */
async function clickAndDownload(page: Page, copy: Copy = COPY.en): Promise<Download> {
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await pdfButton(page, copy).click()
  return download
}

async function downloadedBytes(download: Download): Promise<Buffer> {
  const file = await download.path()
  return readFile(file)
}

/** The US-001 route's PDF for this body, fetched with the page's session. */
async function routePdf(page: Page, resumeId: string, data: Record<string, string> = {}): Promise<Buffer> {
  const response = await page.request.post(`/api/resumes/${resumeId}/download-pdf?locale=en`, {
    data,
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(response.status()).toBe(200)
  return response.body()
}

/** Same page count, same page size and the same text on every page. */
function expectSamePdf(actual: ReadPdf, expected: ReadPdf): void {
  expect(actual.pages.length, 'page count').toBe(expected.pages.length)
  actual.pages.forEach((page, index) => {
    expect(page.text, `page ${index + 1} text`).toBe(expected.pages[index].text)
    expect([page.widthPt, page.heightPt], `page ${index + 1} size`).toEqual([
      expected.pages[index].widthPt,
      expected.pages[index].heightPt,
    ])
  })
  expect(actual.images, 'images').toBe(expected.images)
}

const flat = (text: string) => text.replace(/\s+/g, '').toLowerCase()
const pdfText = (pdf: ReadPdf) => flat(pdf.pages.map((p) => p.text).join(''))

/**
 * Hold every request to the PDF route until `release()`, then let it through to
 * the real route. While held, the button is in its busy state for as long as
 * the test needs to look at it.
 */
async function holdPdfRoute(page: Page): Promise<{ release: () => void }> {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(PDF_ROUTE, async (route) => {
    await released
    // The page may have given up on the request (the timeout case) by now.
    await route.continue().catch(() => undefined)
  })
  return { release }
}

async function expectIdle(page: Page, copy: Copy): Promise<void> {
  const button = pdfButton(page, copy)
  await expect(button).toBeEnabled()
  await expect(button).not.toHaveAttribute('aria-busy', 'true')
}

// ---------------------------------------------------------------------------
// The download
// ---------------------------------------------------------------------------

test.describe('PDF button: downloads the file', () => {
  test("downloads the route's PDF, named after the title, and never prints", async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern')
    await openPreview(page, resume.id)
    const requests = recordRequests(page, 'download-pdf')

    const download = await clickAndDownload(page)

    expect(download.suggestedFilename()).toBe('Visual baseline - modern.pdf')
    const bytes = await downloadedBytes(download)
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(await printCalls(page), 'window.print() calls').toBe(0)

    // One POST, JSON, the page's locale, nothing in the body: this browser
    // holds no draft and no photo.
    expect(requests).toHaveLength(1)
    expect(requests[0].method()).toBe('POST')
    expect(new URL(requests[0].url()).search).toBe('?locale=en')
    expect(requests[0].headers()['content-type']).toBe('application/json')
    expect(requests[0].postDataJSON()).toEqual({})

    // The file is the US-001 route's PDF for this resume.
    expectSamePdf(await readPdf(bytes), await readPdf(await routePdf(page, resume.id)))
    await expectIdle(page, COPY.en)
  })

  test('an unsaved draft and a photo in this browser are in the downloaded PDF', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern')
    const before = await storedRow(resume.id)
    const draftSummary = 'Unsaved summary from the download button test.'
    const draftName = 'Draft Name Okafor'
    const draft = JSON.stringify({ ...before, summary: draftSummary, contact: { ...FIXTURE_CONTACT, name: draftName } })

    // The same resume with nothing in this browser: the reference image count.
    await openPreview(page, resume.id)
    const plain = await readPdf(await downloadedBytes(await clickAndDownload(page)))

    await openPreview(page, resume.id, 'en', {
      [`resume_draft_${resume.id}`]: draft,
      [`resume_photo_${resume.id}`]: PHOTO,
    })
    const requests = recordRequests(page, 'download-pdf')
    const withBoth = await readPdf(await downloadedBytes(await clickAndDownload(page)))

    expect(requests[0].postDataJSON()).toEqual({ draft, photoBase64: PHOTO })
    const text = pdfText(withBoth)
    expect(text).toContain(flat(draftSummary))
    expect(text).toContain(flat(draftName))
    expect(text).not.toContain(flat(FIXTURE_SUMMARY))
    expect(withBoth.images, 'the photo is embedded').toBe(plain.images + 1)
    expectSamePdf(withBoth, await readPdf(await routePdf(page, resume.id, { draft, photoBase64: PHOTO })))

    // Nothing was saved to the account.
    expect(await storedRow(resume.id)).toEqual(before)
    expect(await printCalls(page)).toBe(0)
  })

  test('a WebP photo is in the downloaded PDF', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern')

    await openPreview(page, resume.id)
    const plain = await readPdf(await downloadedBytes(await clickAndDownload(page)))

    // The fixture photo re-encoded by this Chromium, as a browser that stores
    // a WebP upload would hold it.
    const webp = await page.evaluate(async (source) => {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      canvas.getContext('2d')?.drawImage(image, 0, 0)
      return canvas.toDataURL('image/webp', 0.9)
    }, PHOTO)
    expect(webp.startsWith('data:image/webp;base64,'), 'the photo is WebP').toBe(true)

    await openPreview(page, resume.id, 'en', { [`resume_photo_${resume.id}`]: webp })
    const requests = recordRequests(page, 'download-pdf')
    const withPhoto = await readPdf(await downloadedBytes(await clickAndDownload(page)))

    expect(requests[0].postDataJSON()).toEqual({ photoBase64: webp })
    expect(withPhoto.images, 'the WebP photo is embedded').toBe(plain.images + 1)
    expectSamePdf(withPhoto, await readPdf(await routePdf(page, resume.id, { photoBase64: webp })))
    expect(await printCalls(page)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Busy state
// ---------------------------------------------------------------------------

test.describe('PDF button: busy state', () => {
  test('while generating: disabled, a localized busy label, and one request however often it is clicked', async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    await openPreview(page, resume.id)
    const { release } = await holdPdfRoute(page)
    const requests = recordRequests(page, 'download-pdf')
    const download = page.waitForEvent('download', { timeout: 60_000 })

    // Two clicks in one task, before React can re-render the button disabled:
    // only the in-flight guard can stop the second.
    await pdfButton(page, COPY.en).evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })

    const busy = pdfButton(page, COPY.en, true)
    await expect(busy).toBeVisible()
    await expect(busy).toBeDisabled()
    await expect(busy).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('pdf-download-status')).toHaveText(COPY.en.generatingPDF)

    // A user's double click on the busy button starts nothing either.
    await busy.dblclick({ force: true })
    await expect.poll(() => requests.length).toBe(1)

    release()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
    await expectIdle(page, COPY.en)
    await expect(page.getByTestId('pdf-download-status')).toHaveText('')
    expect(requests).toHaveLength(1)
    expect(await printCalls(page)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

test.describe('PDF button: failures', () => {
  const errorMessage = (page: Page) => page.getByTestId('pdf-download-error')

  test('a route error shows the localized error and the button is usable again; a retry clears it', async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    await openPreview(page, resume.id)
    await page.route(PDF_ROUTE, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Failed to generate PDF"}' }),
    )

    await pdfButton(page, COPY.en).click()

    await expect(errorMessage(page)).toHaveText(COPY.en.pdfDownloadError)
    await expect(page.getByRole('alert').filter({ hasText: COPY.en.pdfDownloadError })).toBeVisible()
    await expectIdle(page, COPY.en)
    await expect(pdfButton(page, COPY.en)).toHaveAttribute('aria-describedby', 'pdf-download-error')

    // The real route answers the retry, and the error goes away.
    await page.unroute(PDF_ROUTE)
    const download = await clickAndDownload(page)
    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    await expect(errorMessage(page)).toHaveCount(0)
    expect(await printCalls(page)).toBe(0)
  })

  test('a network failure shows the localized error, the button is usable again and keeps keyboard focus', async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    await openPreview(page, resume.id)
    await page.route(PDF_ROUTE, (route) => route.abort('failed'))

    // From the keyboard: disabling the button drops its focus, and the button
    // takes it back once usable, so the user can retry with Enter.
    await pdfButton(page, COPY.en).focus()
    await page.keyboard.press('Enter')

    await expect(errorMessage(page)).toHaveText(COPY.en.pdfDownloadError)
    await expectIdle(page, COPY.en)
    await expect(pdfButton(page, COPY.en)).toBeFocused()
    expect(await printCalls(page)).toBe(0)
  })

  test('a response that never comes ends in the localized error after the client timeout', async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    // Fake timers that still flow in real time, so the page loads as usual and
    // the test can then jump past the timeout instead of waiting it out.
    await page.clock.install()
    await openPreview(page, resume.id)
    const { release } = await holdPdfRoute(page)

    await pdfButton(page, COPY.en).click()
    await expect(pdfButton(page, COPY.en, true)).toBeDisabled()

    await page.clock.fastForward(PDF_DOWNLOAD_TIMEOUT_MS - 1_000)
    await expect(pdfButton(page, COPY.en, true), 'still waiting just before the timeout').toBeDisabled()
    await expect(errorMessage(page)).toHaveCount(0)

    await page.clock.fastForward(2_000)
    await expect(errorMessage(page)).toHaveText(COPY.en.pdfDownloadError)
    await expectIdle(page, COPY.en)
    release()
    expect(await printCalls(page)).toBe(0)
  })

  test("the platform's 413 for a large photo, with its own non-JSON body, says the photo is too large", async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern')
    await openPreview(page, resume.id, 'en', { [`resume_photo_${resume.id}`]: PHOTO })
    // What Vercel answers for a body over 4.5 MB, before the route runs.
    await page.route(PDF_ROUTE, (route) =>
      route.fulfill({
        status: 413,
        contentType: 'text/plain; charset=utf-8',
        body: 'Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n',
      }),
    )

    await pdfButton(page, COPY.en).click()

    await expect(errorMessage(page)).toHaveText(COPY.en.pdfPhotoTooLarge)
    await expectIdle(page, COPY.en)
  })

  for (const locale of ['en', 'fr'] as const) {
    test(`${locale}: an SVG photo is not lost in silence: the localized message, no request, no file`, async ({
      page,
      authedUser,
    }) => {
      const copy = COPY[locale]
      const resume = await seedFixtureResume(authedUser.id, 'modern')
      const svg = `data:image/svg+xml;base64,${Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      ).toString('base64')}`
      await openPreview(page, resume.id, locale, { [`resume_photo_${resume.id}`]: svg })
      const requests = recordRequests(page, 'download-pdf')
      let downloads = 0
      page.on('download', () => {
        downloads++
      })

      await pdfButton(page, copy).click()

      await expect(errorMessage(page)).toHaveText(copy.pdfPhotoUnsupported)
      await expectIdle(page, copy)
      // Long enough for a request or a download to have shown up had one started.
      await page.waitForTimeout(1_000)
      expect(requests, 'no request to the PDF route').toHaveLength(0)
      expect(downloads, 'no file downloaded').toBe(0)
      expect(await printCalls(page)).toBe(0)
    })
  }
})

// ---------------------------------------------------------------------------
// Localized copy
// ---------------------------------------------------------------------------

test.describe('PDF button: localized copy', () => {
  for (const locale of ['fr', 'de'] as const) {
    test(`${locale}: the busy label and the error are translated`, async ({ page, authedUser }) => {
      const copy = COPY[locale]
      const resume = await seedFixtureResume(authedUser.id, 'classic')
      await openPreview(page, resume.id, locale)
      const requests = recordRequests(page, 'download-pdf')

      let release!: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route(PDF_ROUTE, async (route) => {
        await released
        await route.fulfill({ status: 504, contentType: 'application/json', body: '{"error":"Failed to generate PDF"}' })
      })

      await pdfButton(page, copy).click()
      await expect(pdfButton(page, copy, true)).toBeDisabled()
      await expect(page.getByTestId('pdf-download-status')).toHaveText(copy.generatingPDF)
      expect(new URL(requests[0].url()).search).toBe(`?locale=${locale}`)

      release()
      await expect(page.getByTestId('pdf-download-error')).toHaveText(copy.pdfDownloadError)
      await expectIdle(page, copy)
      expect(await printCalls(page)).toBe(0)
    })
  }
})

// ---------------------------------------------------------------------------
// The Word button, unchanged
// ---------------------------------------------------------------------------

test.describe('Word button: behaves exactly as before', () => {
  test('without a photo: a GET with the locale only, saved as resume.docx', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    await openPreview(page, resume.id, 'fr')
    const docx = recordRequests(page, 'download-docx')
    const pdf = recordRequests(page, 'download-pdf')

    const download = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: frCommon.resumes.downloadWord, exact: true }).click()
    const file = await download

    expect(file.suggestedFilename()).toBe('resume.docx')
    expect((await downloadedBytes(file)).subarray(0, 2).toString('latin1')).toBe('PK')
    expect(docx).toHaveLength(1)
    expect(docx[0].method()).toBe('GET')
    expect(new URL(docx[0].url()).pathname).toBe(`/api/resumes/${resume.id}/download-docx`)
    expect(new URL(docx[0].url()).search).toBe('?locale=fr')
    expect(docx[0].postData()).toBeNull()
    expect(pdf).toHaveLength(0)
    expect(await printCalls(page)).toBe(0)
  })

  test('with a photo: a POST of { photoBase64 } only, saved as resume.docx', async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'modern')
    await openPreview(page, resume.id, 'en', {
      [`resume_photo_${resume.id}`]: PHOTO,
      [`resume_draft_${resume.id}`]: JSON.stringify(await storedRow(resume.id)),
    })
    const docx = recordRequests(page, 'download-docx')

    const download = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: enCommon.resumes.downloadWord, exact: true }).click()
    const file = await download

    expect(file.suggestedFilename()).toBe('resume.docx')
    expect(docx).toHaveLength(1)
    expect(docx[0].method()).toBe('POST')
    expect(docx[0].headers()['content-type']).toBe('application/json')
    expect(new URL(docx[0].url()).search).toBe('?locale=en')
    // The draft is not sent to the Word route: it never was.
    expect(docx[0].postDataJSON()).toEqual({ photoBase64: PHOTO })
  })

  test('on failure: the same English alert as before, on a French page, and no inline PDF error', async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic')
    await openPreview(page, resume.id, 'fr')
    await page.route(DOCX_ROUTE, (route) => route.fulfill({ status: 500, body: 'x' }))

    // The alert is answered INSIDE the listener, registered before the click.
    // An alert blocks the page, and the click waits for the page to settle:
    // awaiting the dialog only after the click returned deadlocked whenever the
    // alert opened before the click finished (seen on Linux CI).
    const alert = new Promise<{ type: string; message: string }>((resolve) => {
      page.once('dialog', (dialog) => {
        resolve({ type: dialog.type(), message: dialog.message() })
        void dialog.accept()
      })
    })
    await page.getByRole('button', { name: frCommon.resumes.downloadWord, exact: true }).click()
    const shown = await alert
    expect(shown.type).toBe('alert')
    // The Preview passes the button no dictionary, so the Word error has always
    // been this fallback; giving the PDF button its copy did not change it.
    expect(shown.message).toBe('Failed to download Word document. Please try again.')
    await expect(page.getByTestId('pdf-download-error')).toHaveCount(0)
  })
})
