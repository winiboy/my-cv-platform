import { test, expect } from './fixtures/auth'
import { AUDIT_LONG_SUMMARY, AUDIT_PHOTO, seedAuditResume } from './fixtures/audit-resume'
import { readPdf } from './fixtures/pdf'
import { RESUME_PAGE_MARGINS } from '../src/lib/resume-page-margins'
import { PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from '../src/lib/resume-page-size'
import { RESUME_TEMPLATES } from '../src/lib/resume-templates'
import { layoutCacheKey } from '../src/lib/resume-layout-store'
import type { Page } from '@playwright/test'
import type { ResumeTemplate } from '../src/types/database'

/**
 * swiss-templates-only-page-fidelity US-003, FR-4: the Preview's sheets are
 * the PDF's pages.
 *
 * For each of the ten templates, in fr and de, the audit fixture (a two-page
 * resume with a photo) is opened on the Preview page and in the Editor's live
 * preview, and printed through the real PDF route. The PDF is the authority:
 *
 *   - the Preview draws as many sheets as the PDF has pages, and the Editor as
 *     many as the Preview;
 *   - the first text of each sheet is the first text of the same PDF page, and
 *     every text drawn on a sheet is printed on the same PDF page, so a
 *     column that continues on the next sheet (a two-column template's
 *     sidebar) continues there in the PDF too;
 *   - no line of text is cut by a sheet's edge, and none is drawn in a sheet's
 *     top or foot margin;
 *   - every sheet after the first starts its text at the template's top
 *     margin, as every PDF page after the first does.
 *
 * A second fixture, the audit with a summary taller than a page
 * (`AUDIT_LONG_SUMMARY`), is checked the same way in a single-column and a
 * two-column template: print breaks that paragraph between its lines, with
 * orphans and widows, and the Preview must break it at the same line.
 *
 * Both the Preview and the PDF are laid out by this run's Chromium, with the
 * same fonts, so the comparison holds on any machine, the Linux CI included.
 */

const LOCALES = ['fr', 'de'] as const

/**
 * CI runs these tests as their own required job, "Parity (required)", and
 * leaves them out of the "E2E (required)" job (`--grep-invert @parity`), so
 * they run once. `pnpm test:e2e` runs them with the rest.
 */
const PARITY_TAG = '@parity'

/** Wide enough for the Preview's gutter and the Editor's split view. */
const VIEWPORT = { width: 1280, height: 900 }

/**
 * How far a line's glyph box may reach into a margin. A line's text box is
 * its font's ascent and descent, which reach a px or two past a compact line
 * box; a line moved to a sheet's top starts its line box exactly at the margin.
 */
const GLYPH_OVERHANG_PX = 4

/** Characters of the first text compared: enough to name an entry, short of where a line could wrap. */
const COMPARED_CHARACTERS = 24

/** Characters of every other text looked up on its PDF page: enough to tell items apart. */
const LOOKED_UP_CHARACTERS = 16

/**
 * One text in the form a Preview text node and a PDF page are compared in:
 * case folded (templates upper-case headings in CSS), whitespace removed (the
 * PDF's items split lines and letter-spaced words arbitrarily), list bullets
 * and hyphens removed (the PDF draws markers as glyphs and may hyphenate a
 * line the DOM text does not show hyphenated), apostrophes made one (pdf.js
 * reads Inter's typographic apostrophe back as U+02BC).
 */
const comparable = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s\u00ad\u200b\u2022\u2010\u2011-]/g, '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")

/**
 * Where the text of a sheet after the first may start, in unscaled px, around
 * its top margin. The first line of such a sheet is either
 *
 *   - in a block that starts the sheet: the pagination pushes that block's top
 *     to the margin to within 0.01 px (PUSH_PRECISION_PX); 0.1 px leaves room
 *     for the Editor's scaling transform, whose rects are divided back; or
 *   - a paragraph's continuation: Chromium lays a line out below the gap the
 *     pagination opens in steps of whole px (measured), so the line box lands
 *     within half a px of the margin, plus the same 0.1 px.
 *
 * Below the margin (a positive offset) is bounded as tightly as above it: a
 * sheet that starts lower than its PDF page's text does not match it either.
 */
const BLOCK_START_TOLERANCE_PX = 0.1
const LINE_START_TOLERANCE_PX = 0.5 + BLOCK_START_TOLERANCE_PX

/** One text node's text on one sheet. */
interface SheetPiece {
  /** 0-based sheet index. */
  sheet: number
  text: string
}

interface SheetReading {
  /** Sheets drawn, in order. */
  sheets: number
  /** The sheet count the frame reports. */
  reportedSheets: number
  /** The first text of each sheet, in document order: a text node, or the part of one that continues there. */
  firstTexts: string[]
  /** Every text of each sheet, in document order. */
  sheetTexts: string[][]
  /** The text nodes drawn across more than one sheet, cut where each sheet starts. */
  splitTexts: SheetPiece[][]
  /** Lines that cross a sheet's edge or lie in a margin, described for the failure message. */
  misplacedLines: string[]
  /** Sheets after the first whose text does not start at the top margin, described for the failure message. */
  misplacedStarts: string[]
}

/**
 * Read the sheets the surface draws, the first text on each, and every line
 * drawn outside its sheet's text area. Lengths are compared in the sheets'
 * own on-screen units, so the Editor's scaling needs no special case.
 *
 * A text node whose lines are drawn on several sheets (a paragraph broken
 * between its lines, as print breaks it) is cut at the first character drawn
 * on each sheet, and each part counts as a text of its sheet.
 */
async function readSheets(page: Page, margins: { pageTop: number; pageBottom: number }): Promise<SheetReading> {
  return page.evaluate(
    ({ margins, pageWidth, pageHeight, overhang, blockTolerance, lineTolerance }) => {
      const documentElement = document.querySelector<HTMLElement>('[data-testid="resume-document"]')
      const frame = documentElement?.parentElement
      if (!documentElement || !frame) throw new Error('Resume document not rendered')
      const scale = documentElement.getBoundingClientRect().width / pageWidth
      const sheets = Array.from(frame.querySelectorAll<HTMLElement>('[data-testid="resume-sheet"]')).map((sheet) =>
        sheet.getBoundingClientRect(),
      )
      for (const sheet of sheets) {
        if (Math.abs(sheet.height / scale - pageHeight) > 0.5) throw new Error(`A sheet is ${sheet.height / scale}px tall`)
      }

      const sheetOf = (rect: DOMRect) => sheets.findIndex((sheet) => rect.top < sheet.bottom && rect.bottom > sheet.top)
      const drawn = (rects: DOMRectList) => Array.from(rects).filter((rect) => rect.height > 0 && rect.width > 0)

      /**
       * The parts of `node`'s text drawn on each sheet, in order: cut at the
       * first character drawn on each sheet after the first.
       */
      const piecesOf = (node: Text, text: string, lineSheets: number[]): { sheet: number; start: number }[] => {
        const first = lineSheets.find((index) => index >= 0)
        if (first === undefined) return []
        if (lineSheets.every((index) => index === first || index < 0)) return [{ sheet: first, start: 0 }]
        const starts = [{ sheet: first, start: 0 }]
        const range = document.createRange()
        for (let offset = 0; offset < text.length; offset++) {
          range.setStart(node, offset)
          range.setEnd(node, offset + 1)
          const rect = drawn(range.getClientRects())[0]
          if (!rect) continue
          const index = sheetOf(rect)
          if (index > starts[starts.length - 1].sheet) starts.push({ sheet: index, start: offset })
        }
        return starts
      }

      const firstTexts: string[] = []
      const sheetTexts: string[][] = sheets.map(() => [])
      const splitTexts: { sheet: number; text: string }[][] = []
      const misplacedLines: string[] = []
      /** The first line drawn on each sheet, in document order, with the text node that draws it. */
      const firstLines: ({ node: Text; rect: DOMRect } | undefined)[] = sheets.map(() => undefined)
      const walker = document.createTreeWalker(documentElement, NodeFilter.SHOW_TEXT)
      for (let current = walker.nextNode(); current; current = walker.nextNode()) {
        const node = current as Text
        const text = node.textContent ?? ''
        if (text.trim() === '' || !node.parentElement?.checkVisibility()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        const lines = drawn(range.getClientRects())
        const lineSheets = lines.map(sheetOf)
        lines.forEach((line, lineIndex) => {
          const index = lineSheets[lineIndex]
          const describe = `"${text.trim().slice(0, 40)}" line ${lineIndex + 1}`
          if (index < 0) {
            misplacedLines.push(`${describe}: in a gap between sheets`)
            return
          }
          firstLines[index] ??= { node, rect: line }
          const sheet = sheets[index]
          const textTop = sheet.top + (index === 0 ? 0 : margins.pageTop - overhang) * scale
          const textBottom = sheet.bottom - (margins.pageBottom - overhang) * scale
          if (line.top < sheet.top || line.bottom > sheet.bottom) {
            misplacedLines.push(`${describe}: cut by the edge of sheet ${index + 1}`)
          } else if (line.top < textTop || line.bottom > textBottom) {
            misplacedLines.push(`${describe}: in a margin of sheet ${index + 1}`)
          }
        })

        const starts = piecesOf(node, text, lineSheets)
        const pieces = starts.map(({ sheet, start }, index) => ({
          sheet,
          text: text.slice(start, index + 1 < starts.length ? starts[index + 1].start : text.length),
        }))
        for (const piece of pieces) {
          if (firstTexts[piece.sheet] === undefined) firstTexts[piece.sheet] = piece.text
          sheetTexts[piece.sheet].push(piece.text)
        }
        if (pieces.length > 1) splitTexts.push(pieces)
      }

      // Every sheet after the first starts its text at the top margin: the
      // block its first line belongs to starts there, or, for a paragraph
      // continued from the sheet before, that line's own line box does.
      const misplacedStarts: string[] = []
      firstLines.forEach((first, index) => {
        if (index === 0 || !first) return
        const sheetTop = sheets[index].top
        // The outermost block of the line's ancestors (inside the document)
        // that starts on this sheet: block ancestors' tops only rise going up.
        // An inline box is part of its block's lines, and `display: contents`
        // draws no box of its own.
        let startsHere: Element | null = null
        for (let element = first.node.parentElement; element && element !== documentElement; element = element.parentElement) {
          const display = getComputedStyle(element).display
          if (display.startsWith('inline') || display === 'contents') continue
          if (element.getBoundingClientRect().top < sheetTop) break
          startsHere = element
        }
        let offset: number
        let tolerance: number
        let what: string
        if (startsHere) {
          offset = (startsHere.getBoundingClientRect().top - sheetTop) / scale
          tolerance = blockTolerance
          what = `its first block <${startsHere.tagName.toLowerCase()}>`
        } else {
          // The line box above the glyphs: Chromium puts floor(half the
          // leading), snapped to its 1/64 px layout unit, above them.
          const parent = first.node.parentElement
          const lineHeight = parent ? parseFloat(getComputedStyle(parent).lineHeight) : Number.NaN
          const glyphHeight = first.rect.height / scale
          const leading = Number.isFinite(lineHeight) ? Math.floor(Math.round(((lineHeight - glyphHeight) / 2) * 64) / 64) : 0
          offset = (first.rect.top - sheetTop) / scale - leading
          tolerance = lineTolerance
          what = 'its first line, a paragraph continued from the sheet before,'
        }
        if (Math.abs(offset - margins.pageTop) > tolerance) {
          misplacedStarts.push(
            `sheet ${index + 1}: ${what} starts ${offset.toFixed(2)}px below the sheet's top, not at the ${margins.pageTop}px margin (± ${tolerance}px), with "${(first.node.textContent ?? '').trim().slice(0, 40)}"`,
          )
        }
      })

      return {
        sheets: sheets.length,
        reportedSheets: Number(frame.dataset.sheetCount),
        firstTexts,
        sheetTexts,
        splitTexts,
        misplacedLines,
        misplacedStarts,
      }
    },
    {
      margins,
      pageWidth: PAGE_WIDTH_PX,
      pageHeight: PAGE_HEIGHT_PX,
      overhang: GLYPH_OVERHANG_PX,
      blockTolerance: BLOCK_START_TOLERANCE_PX,
      lineTolerance: LINE_START_TOLERANCE_PX,
    },
  )
}

/**
 * Wait until the surface shows what it will keep showing: hydrated, the
 * layout applied (its cache written), fonts and images loaded, and the
 * sheets settled over two readings a frame apart.
 */
async function settledSheets(
  page: Page,
  resumeId: string,
  margins: { pageTop: number; pageBottom: number },
): Promise<SheetReading> {
  await page.waitForFunction((cacheKey) => {
    const root = document.querySelector('[data-testid="resume-document"]')
    const hydrated = !!root && Object.keys(root).some((key) => key.startsWith('__reactFiber$'))
    return hydrated && window.localStorage.getItem(cacheKey) !== null
  }, layoutCacheKey(resumeId))
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => undefined)))
  })

  let previous = ''
  let reading: SheetReading | null = null
  await expect
    .poll(async () => {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      reading = await readSheets(page, margins)
      const current = JSON.stringify(reading)
      const stable = current === previous && reading.sheets === reading.reportedSheets
      previous = current
      return stable
    })
    .toBe(true)
  if (!reading) throw new Error('No reading')
  return reading
}

interface SurfaceReading {
  name: 'Preview' | 'Editor'
  reading: SheetReading
}

/**
 * Print `resumeId` through the real PDF route, open it on the Preview page and
 * in the Editor, and assert that each surface's sheets are the PDF's pages.
 *
 * @returns Each PDF page's text in comparable form, and each surface's reading.
 */
async function expectSheetsArePdfPages(
  page: Page,
  resumeId: string,
  template: ResumeTemplate,
  locale: string,
): Promise<{ pdfPages: string[]; surfaces: SurfaceReading[] }> {
  const margins = RESUME_PAGE_MARGINS[template]
  await page.setViewportSize(VIEWPORT)

  // The photo is browser-local; any page of the app's origin stores it.
  await page.goto(`/${locale}/dashboard/resumes`)
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    `resume_photo_${resumeId}`,
    AUDIT_PHOTO,
  ] as const)

  // The PDF, through the real route, as the download button requests it.
  const response = await page.request.post(`/api/resumes/${resumeId}/download-pdf?locale=${locale}`, {
    data: { photoBase64: AUDIT_PHOTO },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120_000,
  })
  expect(response.status()).toBe(200)
  const pdf = await readPdf(await response.body())
  const pdfPages = pdf.pages.map((pdfPage) => comparable(pdfPage.text))
  test.info().annotations.push({ type: 'pdf', description: JSON.stringify({ pages: pdfPages.length }) })
  // swissAcademic draws no photo (swiss-cv-templates FR-5 exception); every other template prints it.
  if (template !== 'swissAcademic') expect(pdf.images, 'the photo is printed').toBeGreaterThan(0)

  const surfaces: SurfaceReading[] = []
  const paths = [
    { name: 'Preview', path: `/${locale}/dashboard/resumes/${resumeId}/preview` },
    { name: 'Editor', path: `/${locale}/dashboard/resumes/${resumeId}/edit` },
  ] as const
  for (const surface of paths) {
    const loaded = await page.goto(surface.path)
    expect(loaded?.status()).toBe(200)
    await expect(page.getByTestId('resume-document')).toBeVisible()
    const reading = await settledSheets(page, resumeId, margins)
    test.info().annotations.push({
      type: surface.name,
      description: JSON.stringify({ sheets: reading.sheets, firstTexts: reading.firstTexts }),
    })

    expect(reading.misplacedLines, `${surface.name}: lines outside their sheet's text area`).toEqual([])
    expect(reading.misplacedStarts, `${surface.name}: sheets whose text does not start at the top margin`).toEqual([])
    expect(reading.sheets, `${surface.name} sheets vs PDF pages`).toBe(pdfPages.length)
    expect(reading.firstTexts, `${surface.name}: a sheet without text`).toHaveLength(reading.sheets)
    reading.firstTexts.forEach((text, index) => {
      const first = comparable(text).slice(0, COMPARED_CHARACTERS)
      expect(first.length, `${surface.name} sheet ${index + 1}: comparable text`).toBeGreaterThan(0)
      expect(
        pdfPages[index].startsWith(first),
        `${surface.name} sheet ${index + 1} starts with "${text.trim().slice(0, 60)}"; PDF page ${index + 1} starts with "${pdf.pages[index].text.slice(0, 60)}"`,
      ).toBe(true)
    })
    const elsewhere = reading.sheetTexts.flatMap((texts, index) =>
      texts
        .filter((text) => !pdfPages[index].includes(comparable(text).slice(0, LOOKED_UP_CHARACTERS)))
        .map((text) => `sheet ${index + 1}: "${text.trim().slice(0, 60)}"`),
    )
    expect(elsewhere, `${surface.name}: texts not printed on their sheet's PDF page`).toEqual([])
    surfaces.push({ name: surface.name, reading })
  }
  return { pdfPages, surfaces }
}

for (const template of RESUME_TEMPLATES) {
  for (const locale of LOCALES) {
    test(`${template}, ${locale}: the Preview's sheets and the Editor's are the PDF's pages`, { tag: PARITY_TAG }, async ({
      page,
      authedUser,
    }) => {
      test.setTimeout(180_000)
      const resume = await seedAuditResume(authedUser.id, template)
      await expectSheetsArePdfPages(page, resume.id, template, locale)
    })
  }
}

/**
 * A single-column and a two-column template: print breaks the long summary
 * between its lines in both, in a column the width of the page and in one
 * beside a sidebar.
 */
const LINE_BREAK_TEMPLATES: readonly ResumeTemplate[] = ['swissCommerce', 'swissTrades']

for (const template of LINE_BREAK_TEMPLATES) {
  test(`${template}, fr: a paragraph print breaks between its lines breaks at the same line on the sheets`, { tag: PARITY_TAG }, async ({
    page,
    authedUser,
  }) => {
    test.setTimeout(180_000)
    const resume = await seedAuditResume(authedUser.id, template, { summary: AUDIT_LONG_SUMMARY })
    const { pdfPages, surfaces } = await expectSheetsArePdfPages(page, resume.id, template, 'fr')

    // The summary's one text node, from its first sentence.
    const opening = comparable(AUDIT_LONG_SUMMARY.replace(/<[^>]+>/g, '')).slice(0, COMPARED_CHARACTERS)
    for (const { name, reading } of surfaces) {
      const summary = reading.splitTexts.find((pieces) => comparable(pieces[0].text).startsWith(opening))
      // Not a vacuous pass: the fixture must make print break the paragraph,
      // and the sheets must break it rather than move it whole.
      expect(summary, `${name}: the summary is drawn across more than one sheet`).toBeDefined()
      if (!summary) return
      expect(summary.length).toBeGreaterThanOrEqual(2)

      // The parts cut the summary at every sheet's first character, so each
      // part printed whole on its sheet's PDF page puts every break at the
      // line where print breaks: a line the sheets kept that print moves on
      // would leave the part's end on the next page, and a line they moved
      // that print keeps would leave the next part's start on the page before.
      // Whole parts, hundreds of characters long, are found on one page only.
      summary.forEach((piece, index) => {
        const next = summary[index + 1]
        if (next) expect(next.sheet, `${name}: the summary continues on the next sheet`).toBe(piece.sheet + 1)
        expect(
          pdfPages[piece.sheet].includes(comparable(piece.text)),
          `${name}: the summary's part on sheet ${piece.sheet + 1}, "${piece.text.slice(0, 40)}" … "${piece.text.slice(-40)}", is not printed whole on PDF page ${piece.sheet + 1}`,
        ).toBe(true)
      })
    }
  })
}
