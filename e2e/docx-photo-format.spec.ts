import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page, Request } from '@playwright/test'
import JSZip from 'jszip'
import { test, expect } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import { layoutCacheKey } from '../src/lib/resume-layout-store'
import enCommon from '../src/locales/en/common.json'

/**
 * The Word download embeds the photo the Preview shows, whatever image type the
 * upload stored.
 *
 * WHY THIS FILE EXISTS
 *
 * The photo lives in this browser under `resume_photo_${id}`, as the data URL
 * the uploaded file produced. The Word route can embed only JPEG, PNG, GIF and
 * BMP, and drops anything else without an error, so a WebP photo — shown by the
 * Preview and the browser-drawn PDF — was missing from the Word file alone,
 * behind an HTTP 200. The button now re-encodes such a photo before it sends it
 * (`src/lib/photo-for-docx.ts`): scaled to a 1024 px long edge at most, as JPEG
 * when opaque and PNG when it has transparency. A supported photo is sent byte
 * for byte, and the stored value is never changed.
 *
 * WHAT IS EXERCISED
 *
 * The product path end to end: the Preview page's own "Download Word" button,
 * the request it sends, and the .docx it saves. `swissHealth` draws the photo
 * as the document's only image, so `word/media/` holds exactly one file with a
 * photo and none without.
 *
 * The WebPs are encoded by the page's own Chromium, as an upload would have
 * produced them; each test checks it really is WebP first, so it cannot pass on
 * a browser that silently fell back to PNG. The large one is a full-resolution
 * phone photo's size (3000 × 4000) with per-pixel noise, under the 2 MB upload
 * limit: re-encoded losslessly at its natural size it would be far over the
 * route's size bound, which is how the first fix still lost such a photo.
 */

const JPEG = readFileSync(path.join(__dirname, 'fixtures', 'photo-portrait.jpg'))
const JPEG_DATA_URL = `data:image/jpeg;base64,${JPEG.toString('base64')}`
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024

const photoKey = (resumeId: string) => `resume_photo_${resumeId}`

/** The decoded size of a base64 data URL's payload, in bytes. */
const dataUrlBytes = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')

/** A JPEG's pixel size, read from its first start-of-frame marker. */
function jpegSize(jpeg: Buffer): { width: number; height: number } {
  expect(jpeg.readUInt16BE(0), 'a JPEG starts with SOI').toBe(0xffd8)
  let offset = 2
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) throw new Error(`No JPEG marker at byte ${offset}`)
    const marker = jpeg[offset + 1]
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) }
    }
    offset += 2 + jpeg.readUInt16BE(offset + 2)
  }
  throw new Error('No start-of-frame marker in the JPEG')
}

/** A PNG's pixel size and whether its colour type carries alpha, from IHDR. */
function pngHeader(png: Buffer): { width: number; height: number; alpha: boolean } {
  expect(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), 'a PNG signature').toBe(true)
  const colourType = png[25]
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), alpha: colourType === 4 || colourType === 6 }
}

/** Every request the page sends to the Word route, from now on. */
function recordDocxRequests(page: Page): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/download-docx')) requests.push(request)
  })
  return requests
}

/**
 * Open the Preview with `photo` stored for the resume, settled as a user finds
 * it: hydrated, so the button's handler is attached, and the layout loaded.
 */
async function openPreviewWithPhoto(page: Page, resumeId: string, photo: string): Promise<void> {
  await page.goto('/en/dashboard/resumes')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [photoKey(resumeId), photo] as const)
  const response = await page.goto(`/en/dashboard/resumes/${resumeId}/preview`)
  expect(response?.status()).toBe(200)
  await page.waitForFunction((cacheKey) => {
    const root = document.querySelector('[data-testid="resume-document"]')
    const hydrated = !!root && Object.keys(root).some((key) => key.startsWith('__reactFiber$'))
    return hydrated && window.localStorage.getItem(cacheKey) !== null
  }, layoutCacheKey(resumeId))
}

/** Click "Download Word"; return the photo the request sent and the images the file holds. */
async function downloadWord(page: Page): Promise<{ sentPhoto: string; media: Buffer[] }> {
  const requests = recordDocxRequests(page)
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: enCommon.resumes.downloadWord, exact: true }).click()
  const file = await (await download).path()

  expect(requests, 'one request to the Word route').toHaveLength(1)
  const request = requests[0]
  expect(request.method()).toBe('POST')
  const sentPhoto = (request.postDataJSON() as { photoBase64?: unknown } | null)?.photoBase64
  expect(typeof sentPhoto, 'a photo is sent').toBe('string')

  const zip = await JSZip.loadAsync(readFileSync(file))
  const names = Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
  const media = await Promise.all(names.map((name) => zip.file(name)!.async('nodebuffer')))
  return { sentPhoto: sentPhoto as string, media }
}

test('a full-resolution WebP photo is sent to Word as a 1024 px JPEG and embedded', async ({ page, authedUser }) => {
  // Encoding a 12-megapixel canvas in the page takes a few seconds.
  test.slow()
  const resume = await seedFixtureResume(authedUser.id, 'swissHealth')

  await page.goto('/en/dashboard/resumes')
  const webp = await page.evaluate((limit) => {
    const width = 3000
    const height = 4000
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    const image = context.createImageData(width, height)
    const pixels = image.data
    // A seeded generator, so every run draws the same photo.
    let seed = 0x2f6e2b1
    const noise = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return (seed >>> 24) / 255 - 0.5
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        pixels[i] = 40 + (180 * x) / width + 24 * noise()
        pixels[i + 1] = 90 + (120 * y) / height + 24 * noise()
        pixels[i + 2] = 150 + 24 * noise()
        pixels[i + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
    // The highest quality that fits the upload limit, as a camera export would.
    for (const quality of [0.8, 0.6, 0.4, 0.2]) {
      const dataUrl = canvas.toDataURL('image/webp', quality)
      if (atob(dataUrl.slice(dataUrl.indexOf(',') + 1)).length < limit) return dataUrl
    }
    return null
  }, UPLOAD_LIMIT_BYTES)

  expect(webp, 'a 3000 × 4000 WebP under the upload limit').not.toBeNull()
  expect(webp!.startsWith('data:image/webp;base64,'), 'Chromium encoded a real WebP').toBe(true)
  expect(dataUrlBytes(webp!).length).toBeLessThan(UPLOAD_LIMIT_BYTES)

  await openPreviewWithPhoto(page, resume.id, webp!)
  const { sentPhoto, media } = await downloadWord(page)

  expect(sentPhoto.startsWith('data:image/jpeg;base64,'), 'an opaque photo is sent as JPEG').toBe(true)
  expect(jpegSize(dataUrlBytes(sentPhoto)), 'scaled to a 1024 px long edge, aspect kept').toEqual({ width: 768, height: 1024 })

  expect(media, 'the .docx holds exactly one image').toHaveLength(1)
  expect(media[0].equals(dataUrlBytes(sentPhoto)), 'the image embedded is the one sent').toBe(true)

  // The conversion is per download, on a copy.
  expect(await page.evaluate((key) => window.localStorage.getItem(key), photoKey(resume.id))).toBe(webp)
})

test('a WebP photo with transparency is sent to Word as PNG at its own size and embedded', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissHealth')

  await page.goto('/en/dashboard/resumes')
  const webp = await page.evaluate(() => {
    // A background-removed portrait: a figure on a transparent ground.
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 400
    const context = canvas.getContext('2d')!
    context.fillStyle = '#0f766e'
    context.beginPath()
    context.ellipse(150, 220, 110, 160, 0, 0, Math.PI * 2)
    context.fill()
    return canvas.toDataURL('image/webp')
  })
  expect(webp.startsWith('data:image/webp;base64,'), 'Chromium encoded a real WebP').toBe(true)

  await openPreviewWithPhoto(page, resume.id, webp)
  const { sentPhoto, media } = await downloadWord(page)

  expect(sentPhoto.startsWith('data:image/png;base64,'), 'a transparent photo is sent as PNG').toBe(true)
  expect(pngHeader(dataUrlBytes(sentPhoto)), 'never scaled up, transparency kept').toEqual({ width: 300, height: 400, alpha: true })

  expect(media, 'the .docx holds exactly one image').toHaveLength(1)
  expect(media[0].equals(dataUrlBytes(sentPhoto)), 'the image embedded is the one sent').toBe(true)
  expect(await page.evaluate((key) => window.localStorage.getItem(key), photoKey(resume.id))).toBe(webp)
})

test('a JPEG photo is sent to Word unchanged and embedded byte for byte', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissHealth')

  await openPreviewWithPhoto(page, resume.id, JPEG_DATA_URL)
  const { sentPhoto, media } = await downloadWord(page)

  expect(sentPhoto, 'the JPEG is sent exactly as stored').toBe(JPEG_DATA_URL)
  expect(media, 'the .docx holds exactly one image').toHaveLength(1)
  expect(media[0].equals(JPEG), 'the embedded image is the stored JPEG').toBe(true)
})
