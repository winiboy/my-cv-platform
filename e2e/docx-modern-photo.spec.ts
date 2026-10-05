import { readFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { test, expect } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'

/**
 * The Modern DOCX draws the profile photo where, and as large as, the Preview
 * draws it.
 *
 * WHY THIS FILE EXISTS
 *
 * Before PR #88 the DOCX sized the photo zone on an 8.5in page while the page
 * is A4, so Word drew the photo 7px wider than the sidebar, over the main
 * column. None of the Word parity fixtures carried a photo, so nothing compared
 * it with the Preview. This one does, end to end: the photo the download button
 * sends (read from the same localStorage key), the Preview's own layout of it,
 * and the DOCX the route builds from it.
 *
 * WHAT IS COMPARED
 *
 * The Preview is measured, not restated: the `<img>`'s box inside the resume
 * page, and its `object-fit: cover` crop from the image's natural size. The
 * DOCX is read off `word/document.xml`: the anchor's offsets and extent, and
 * the `a:srcRect` crop. Word places an anchor with `layoutInCell` at its
 * paragraph inside the cell, so an offset of 0 from the sidebar cell's first
 * paragraph is the sidebar's top-left; that Word draws it there was measured
 * in Word's own render (`docs/engineering/docx-word-parity.md`), which no test
 * here can run.
 *
 * WHAT MAKES IT ABLE TO FAIL
 *
 * The fixture photo is 3:4, so the cover crop is not a no-op: it trims the top
 * and bottom and keeps the full width. A generator that skipped the crop, that
 * cropped the wrong axis, or that sized the zone on another page width fails
 * an assertion below. 1px of tolerance covers the Preview's page width
 * (210mm in CSS px) against the DOCX's 11908-twip page.
 */

const PHOTO = readFileSync(path.join(__dirname, 'fixtures', 'photo-portrait.jpg'))
const PHOTO_DATA_URL = `data:image/jpeg;base64,${PHOTO.toString('base64')}`
const EMU_PER_PX = 9525
const EMU_PER_TWIP = 635

interface PreviewPhoto {
  left: number
  top: number
  width: number
  height: number
  sidebarWidth: number
  naturalWidth: number
  naturalHeight: number
  objectFit: string
}

/** The Preview's photo box, relative to the resume page it is drawn on. */
async function measurePreviewPhoto(page: import('@playwright/test').Page): Promise<PreviewPhoto> {
  const img = page.locator('img[alt="Profile"]')
  await expect(img).toBeVisible()
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true)
  return img.evaluate((el: HTMLImageElement) => {
    // img → photo zone → sidebar column → resume page.
    const sidebar = el.parentElement!.parentElement!
    const pageBox = sidebar.parentElement!.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return {
      left: box.left - pageBox.left,
      top: box.top - pageBox.top,
      width: box.width,
      height: box.height,
      sidebarWidth: sidebar.getBoundingClientRect().width,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      objectFit: getComputedStyle(el).objectFit,
    }
  })
}

const number = (fragment: string, re: RegExp, what: string) => {
  const found = re.exec(fragment)?.[1]
  if (found === undefined) throw new Error(`No ${what} in ${fragment.slice(0, 300)}`)
  return Number(found)
}

test('the Modern DOCX photo is the Preview photo: same box, same cover crop', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'modern')

  // Where the editor keeps the photo, and where both the Preview and the
  // download button read it from.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`resume_photo_${resume.id}`, PHOTO_DATA_URL] as const,
  )
  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  const preview = await measurePreviewPhoto(page)

  // The Preview's own claims, so the comparison below is against a zone
  // that is the sidebar's top-left, full width, cover-fitted.
  expect(preview.objectFit).toBe('cover')
  expect([preview.naturalWidth, preview.naturalHeight]).toEqual([300, 400])
  expect(preview.left).toBeCloseTo(0, 1)
  expect(preview.top).toBeCloseTo(0, 1)
  expect(preview.width).toBeCloseTo(preview.sidebarWidth, 1)

  // The request the download button makes when a photo is stored.
  const response = await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
    data: { photoBase64: PHOTO_DATA_URL },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(response.ok()).toBe(true)
  const zip = await JSZip.loadAsync(await response.body())
  const xml = await zip.file('word/document.xml')!.async('string')

  // The photo is the only drawing in the body; the sidebar fill is in the header.
  const anchors = xml.match(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g) ?? []
  expect(anchors).toHaveLength(1)
  const anchor = anchors[0] ?? ''

  // Anchored in the sidebar cell's first paragraph, at its top-left.
  const sidebarCell = xml.slice(xml.indexOf('<w:tc>'), xml.indexOf('</w:tc>'))
  const firstParagraph = sidebarCell.slice(sidebarCell.indexOf('<w:p>'), sidebarCell.indexOf('</w:p>'))
  expect(firstParagraph).toContain('<wp:anchor')
  expect(anchor).toContain('layoutInCell="1"')
  expect(anchor).toContain('<wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>')
  expect(anchor).toContain('<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>')

  // As wide as the Preview's photo, never wider than the sidebar cell, and as tall.
  const cx = number(anchor, /<wp:extent cx="(\d+)"/, 'extent cx')
  const cy = number(anchor, /<wp:extent cx="\d+" cy="(\d+)"/, 'extent cy')
  const cellTwips = number(sidebarCell, /<w:tcW w:type="dxa" w:w="(\d+)"\/>/, 'sidebar cell width')
  expect(Math.abs(cx / EMU_PER_PX - preview.width), `DOCX ${cx / EMU_PER_PX}px vs Preview ${preview.width}px`).toBeLessThanOrEqual(1)
  expect(cx).toBeLessThanOrEqual(cellTwips * EMU_PER_TWIP)
  expect(Math.abs(cy / EMU_PER_PX - preview.height)).toBeLessThanOrEqual(1)

  // The same part of the image: object-fit: cover scales to the larger ratio
  // and centres; srcRect keeps 1 − l − r of the width and 1 − t − b of the height.
  const scale = Math.max(preview.width / preview.naturalWidth, preview.height / preview.naturalHeight)
  const keptWidth = preview.width / scale / preview.naturalWidth
  const keptHeight = preview.height / scale / preview.naturalHeight
  const crop = /<a:srcRect l="(\d+)" t="(\d+)" r="(\d+)" b="(\d+)"\/>/.exec(anchor)
  expect(crop, 'a cover crop on the photo').not.toBeNull()
  const [l, t, r, b] = crop!.slice(1).map((v) => Number(v) / 100_000)
  expect(l).toBe(r)
  expect(t).toBe(b)
  expect(Math.abs(1 - l - r - keptWidth)).toBeLessThanOrEqual(0.005)
  expect(Math.abs(1 - t - b - keptHeight)).toBeLessThanOrEqual(0.005)
  expect(t, 'a 3:4 photo is trimmed top and bottom').toBeGreaterThan(0)
})
