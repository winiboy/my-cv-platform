import pdfParse from 'pdf-parse'
import { test, expect } from './fixtures/auth'
import { FIXTURE_SKILLS, seedFixtureResume } from './fixtures/resume'
import { PAGE_HEIGHT_PX } from '../src/lib/resume-page-size'

/**
 * Modern: a sidebar taller than one page keeps its background behind all of
 * its text, on screen and on every printed page.
 *
 * The sidebar used to be `position: absolute; top: 0; bottom: 0` inside the
 * document, so its box was as tall as the document - one page, or the main
 * column - and never as tall as its own content. Content past that box spilled
 * out of the document on screen and, in the PDF (`window.print()` over this
 * Preview), printed white on white on page 2.
 *
 * Three readings, each for a reason:
 *
 *   - GEOMETRY, screen and print media: the sidebar's border box, where its
 *     background is painted, contains the box of every one of its text lines,
 *     and the document contains the sidebar. This is the property the bug
 *     broke, measured directly.
 *   - PIXELS, print media: the colour actually painted in the sidebar's left
 *     padding beside every line that falls past the first page. Chromium
 *     prints by slicing this same print-media layout into A4 pages
 *     (`@page { margin: 0 }`, a document exactly one page wide), so a line
 *     below `PAGE_HEIGHT_PX` here is a line on page 2 there.
 *   - THE PDF: printed with `page.pdf()`, it has a second page and that page
 *     carries the sidebar's last line. This does not detect the bug - the
 *     white text was printed too - it proves the pixel reading is about text
 *     that really reaches page 2, rather than a layout that never paginates.
 *
 * The PDF itself is not rasterised: nothing in the toolchain renders a PDF to
 * pixels, and adding a dependency for it is out of scope.
 */

/**
 * Enough extra skill categories that the sidebar outgrows one page whatever
 * the shared fixture's own length; the test asserts that precondition rather
 * than assume it.
 */
const LONG_SIDEBAR_SKILLS = [
  ...FIXTURE_SKILLS,
  {
    category: 'Infrastructure',
    items: ['Kubernetes', 'Terraform', 'Message queues', 'Edge caching'],
    visible: true,
  },
  {
    category: 'Observability',
    items: ['Distributed tracing', 'Service level objectives', 'Load testing'],
    visible: true,
  },
]

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

interface SidebarReading {
  document: Rect
  sidebar: Rect
  /** `rgb(r, g, b)` as computed. */
  sidebarColour: string
  /**
   * `backdrop` is the background the line is drawn on: its nearest ancestor,
   * up to the sidebar, with an opaque background colour. That is the sidebar
   * colour for body text and the accent band for a section heading.
   */
  lines: (Rect & { text: string; backdrop: string })[]
}

/** Half a CSS pixel absorbs sub-pixel rounding without hiding a spilled line. */
const TOLERANCE_PX = 0.5

test('modern: a sidebar taller than one page keeps its background behind all its text', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'modern', { skills: LONG_SIDEBAR_SKILLS })
  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  expect(response?.status()).toBe(200)
  const controls = page.getByTestId('controls-toggle')
  const document = page.getByTestId('resume-document')
  await expect(document).toBeVisible()
  await page.evaluate(() => globalThis.document.fonts.ready)

  // Every rect relative to the document's top-left corner.
  const read = () =>
    document.evaluate((root): SidebarReading => {
      const origin = root.getBoundingClientRect()
      const rel = (r: DOMRect) => ({
        left: r.left - origin.left,
        top: r.top - origin.top,
        right: r.right - origin.left,
        bottom: r.bottom - origin.top,
      })
      const sidebar = root.firstElementChild as HTMLElement
      const lines: SidebarReading['lines'] = []
      const range = globalThis.document.createRange()
      const walker = globalThis.document.createTreeWalker(sidebar, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').trim()
        const style = getComputedStyle(node.parentElement as Element)
        if (!text || style.display === 'none' || style.visibility === 'hidden') continue
        range.selectNodeContents(node)
        let owner = node.parentElement as HTMLElement
        while (owner !== sidebar && !/^rgb\(/.test(getComputedStyle(owner).backgroundColor)) {
          owner = owner.parentElement as HTMLElement
        }
        const backdrop = getComputedStyle(owner).backgroundColor
        for (const r of range.getClientRects()) lines.push({ text, backdrop, ...rel(r) })
      }
      return {
        document: rel(root.getBoundingClientRect()),
        sidebar: rel(sidebar.getBoundingClientRect()),
        sidebarColour: getComputedStyle(sidebar).backgroundColor,
        lines,
      }
    })

  const expectBackgroundContainsText = (reading: SidebarReading, medium: string) => {
    // The first child must really be the sidebar, or the rest proves nothing.
    expect(reading.sidebarColour, `${medium}: sidebar colour`).toMatch(/^rgb\(/)
    expect(reading.sidebarColour, `${medium}: sidebar colour`).not.toBe('rgb(255, 255, 255)')
    // The precondition the bug needs: the sidebar's text outgrows one page.
    const textBottom = Math.max(...reading.lines.map((l) => l.bottom))
    expect(textBottom, `${medium}: sidebar text must exceed one page`).toBeGreaterThan(PAGE_HEIGHT_PX)

    const outside = reading.lines.filter(
      (l) =>
        l.top < reading.sidebar.top - TOLERANCE_PX ||
        l.bottom > reading.sidebar.bottom + TOLERANCE_PX ||
        l.left < reading.sidebar.left - TOLERANCE_PX ||
        l.right > reading.sidebar.right + TOLERANCE_PX
    )
    expect(outside.map((l) => `${l.text} @ ${l.bottom.toFixed(1)}`), `${medium}: lines outside the sidebar`).toEqual([])
    expect(reading.sidebar.bottom, `${medium}: sidebar inside the document`).toBeLessThanOrEqual(
      reading.document.bottom + TOLERANCE_PX
    )
  }

  // Screen: the Preview itself, controls off.
  await controls.uncheck({ force: true })
  await page.emulateMedia({ media: 'screen' })
  expectBackgroundContainsText(await read(), 'screen')

  // Print as shipped: the controls on, as when a user hits Download PDF.
  await controls.check({ force: true })
  await page.emulateMedia({ media: 'print' })
  const print = await read()
  expectBackgroundContainsText(print, 'print')

  // Pixels: decode a print-media capture of the document in the page, then
  // read the colour 8px inside the sidebar's left edge - inside its 32px
  // padding, so only background is there (a heading's accent band bleeds
  // across that padding) - beside every page-2 line.
  const pageTwoLines = print.lines.filter((l) => l.top >= PAGE_HEIGHT_PX)
  expect(pageTwoLines.length, 'sidebar lines past the first page').toBeGreaterThan(0)
  const capture = await document.screenshot({ scale: 'css', animations: 'disabled' })
  const samplePoints = pageTwoLines.map((l) => ({
    x: Math.round(print.sidebar.left + 8),
    y: Math.round((l.top + l.bottom) / 2),
  }))
  const sampled = await page.evaluate(
    async ({ png, points }) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
      context.drawImage(bitmap, 0, 0)
      return points.map(({ x, y }) => {
        const [r, g, b] = context.getImageData(x, y, 1, 1).data
        return `rgb(${r}, ${g}, ${b})`
      })
    },
    { png: capture.toString('base64'), points: samplePoints }
  )
  expect(sampled, 'colour behind every page-2 sidebar line').toEqual(pageTwoLines.map((l) => l.backdrop))
  // A white backdrop would make the pixel check vacuous: white text on white.
  expect(pageTwoLines.filter((l) => l.backdrop === 'rgb(255, 255, 255)')).toEqual([])

  // The PDF: a real second page carrying the sidebar's last line.
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  const pageTexts: string[] = []
  const parsed = await pdfParse(pdf, {
    pagerender: async (pageData: unknown) => {
      const content = await (
        pageData as { getTextContent(): Promise<{ items: { str: string }[] }> }
      ).getTextContent()
      const text = content.items.map((item) => item.str).join('')
      pageTexts.push(text)
      return text
    },
  })
  expect(parsed.numpages).toBeGreaterThanOrEqual(2)
  // Case and spacing are presentation (uppercase, letter-spacing); compare without them.
  const normalise = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const lastLine = print.lines.reduce((a, b) => (b.bottom > a.bottom ? b : a))
  expect(normalise(pageTexts[1] ?? '')).toContain(normalise(lastLine.text))
})
