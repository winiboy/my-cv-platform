import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { admin, rect } from './fixtures/cover-letter-preview'
import { readPdfTextItems, type PdfTextItem } from './fixtures/pdf'
import {
  COVER_LETTER_CONTINUATION_PAGE_PX,
  COVER_LETTER_FIRST_PAGE_BOTTOM_PX,
} from '../src/lib/cover-letter-page-breaks'
import {
  SWISS_LETTER_FONT_SIZE_PT,
  SWISS_LETTER_GEOMETRY_MM,
  SWISS_LETTER_PAGE_PX,
  mmToPx,
} from '../src/lib/cover-letter-swiss-letter'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/**
 * The letter preview marks where each printed page ends
 * (cover-letter-one-page, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * Where a marker lands depends on where the letter's lines are laid out, and
 * whether it lands where the PDF breaks can only be told against the PDF the
 * server prints. Whether a label fits beside the scaled sheet, and whether it
 * adds a horizontal scrollbar, are layout outcomes.
 *
 * WHAT IS ASSERTED
 *
 *   - For each fixture (1, 2 and 3 pages; a line straddling page 2's end;
 *     `orphans` and `widows` inside a paragraph; an empty line straddling
 *     page 1's end; a 24 px span opening page 2; a wrapped paragraph and a
 *     list across page 1's end; a recipient address running past page 1):
 *     n − 1 markers in the editor pane and in the preview window, at the same
 *     places, marker k labelled with page k + 1.
 *   - The PDF is the authority, for every marker: the PDF's page count is
 *     markers + 1; marker k lies below the last line PDF page k prints and
 *     above the first line PDF page k + 1 prints; and it is within 2 px of
 *     where the PDF's page k + 1 starts, read from the PDF alone (see
 *     `pdfBreaks`). The gaps are recorded as annotations.
 *   - Labels per interface locale, for a letter written in English.
 *   - Markers follow typing and zoom without a reload, at the same place in
 *     the letter; the line is one screen px thick at every zoom.
 *   - No room beside the sheet: no label, the line still drawn, no
 *     horizontal scroll (the pane fitted to its width, the pane on a phone).
 *   - The overlay is aria-hidden, takes no pointer events, and is hidden in
 *     print media.
 */

const editorDict = en.coverLetters.editor
const PAGE_WIDTH = SWISS_LETTER_PAGE_PX.width
/** AC-3: a marker within 2 px of the printed break. */
const EDGE_TOLERANCE = 2
const PX_PER_PT = 96 / 72
/**
 * A continuation page's content starts below its top margin, which Chromium
 * prints in whole CSS px: 18 mm = 68.03 px is laid out as 68. Established by
 * bisecting page counts of `page.pdf` for several margins, independently of
 * the preview.
 */
const PAGE_TOP_MARGIN_PX = Math.round(mmToPx(SWISS_LETTER_GEOMETRY_MM.marginTop))

/**
 * Lines with a unique token each (`A001`, `B001`, …), short enough never to
 * wrap. A token starts every printed line, so a PDF text item names its line.
 */
const lines = (prefix: string, count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(from + index).padStart(3, '0')} I build reliable software with care.`)
const TOKEN = /^\s*([A-Z]\d{3})/
/** A paragraph of lines separated by `<br>`. */
const brParagraph = (paragraphLines: string[]) => `<p>${paragraphLines.join('<br>')}</p>`

interface PdfLine {
  token: string
  baseline: number
  x: number
  fontSize: number
}

interface FixtureContext {
  pdfPages: PdfLine[][]
  glyph: (token: string) => Promise<{ top: number; bottom: number }>
  markers: number[]
}

interface Fixture {
  name: string
  body: string[]
  fields?: Record<string, unknown>
  pageCount: number
  /** What the fixture was built to show, asserted on top of the markers. */
  check?: (context: FixtureContext) => Promise<void>
}

const firstToken = (page: PdfLine[]) => page[0].token
const lastToken = (page: PdfLine[]) => page.at(-1)!.token

/**
 * The body's first line ends 32 lines above page 1's end (455 px from the
 * top, line height 19.07 px, page 1 ends at 1065.83 px): line 32 is page 1's
 * last full line, and line 33 straddles its end by 0.5 px.
 */
const FIXTURES: Fixture[] = [
  { name: 'one page', body: [brParagraph(lines('A', 10))], pageCount: 1 },
  { name: 'two pages', body: [brParagraph(lines('A', 45))], pageCount: 2 },
  {
    name: 'three pages, a line straddling page 2\'s end',
    body: [brParagraph(lines('A', 100))],
    pageCount: 3,
    // A085 starts above page 2's end but does not fit it: the print moves it.
    check: async ({ pdfPages, glyph, markers }) => {
      expect(firstToken(pdfPages[2])).toBe('A085')
      expect((await glyph('A085')).top).toBeLessThan(markers[0] + COVER_LETTER_CONTINUATION_PAGE_PX)
    },
  },
  {
    name: 'orphans',
    // B001 alone fits page 1: an orphan, so all of B moves.
    body: [brParagraph(lines('A', 30)), brParagraph(lines('B', 3))],
    pageCount: 2,
    check: async ({ pdfPages, glyph }) => {
      expect((await glyph('B001')).bottom).toBeLessThan(COVER_LETTER_FIRST_PAGE_BOTTOM_PX)
      expect(lastToken(pdfPages[0])).toBe('A030')
      expect(firstToken(pdfPages[1])).toBe('B001')
    },
  },
  {
    name: 'widows',
    // B001–B003 fit page 1 and B004 does not: a widow, so B003 moves with it.
    body: [brParagraph(lines('A', 28)), brParagraph(lines('B', 4))],
    pageCount: 2,
    check: async ({ pdfPages, glyph }) => {
      expect((await glyph('B003')).bottom).toBeLessThan(COVER_LETTER_FIRST_PAGE_BOTTOM_PX)
      expect(lastToken(pdfPages[0])).toBe('B002')
      expect(firstToken(pdfPages[1])).toBe('B003')
    },
  },
  {
    name: 'an empty line straddling page 1\'s end',
    // "A032<br><br>A033": the empty line is line 33 and moves; page 2 opens with it.
    body: [brParagraph([...lines('A', 32), '', ...lines('A', 13, 33)])],
    pageCount: 2,
    check: async ({ pdfPages, glyph, markers }) => {
      expect(lastToken(pdfPages[0])).toBe('A032')
      expect(firstToken(pdfPages[1])).toBe('A033')
      // The marker is a whole line above A033: at the empty line.
      expect((await glyph('A033')).top - markers[0]).toBeGreaterThan(15)
    },
  },
  {
    name: 'a 24 px span opening page 2',
    body: [
      brParagraph([
        ...lines('A', 32),
        '<span style="font-size: 24px">A033 A larger line.</span>',
        ...lines('A', 12, 34),
      ]),
    ],
    pageCount: 2,
    check: async ({ pdfPages }) => {
      expect(firstToken(pdfPages[1])).toBe('A033')
      expect(pdfPages[1][0].fontSize).toBeCloseTo(18, 0)
    },
  },
  {
    name: 'a wrapped paragraph across page 1\'s end',
    body: [
      brParagraph(lines('A', 20)),
      `<p>${Array.from({ length: 400 }, (_, index) => `W${String(index + 1).padStart(3, '0')}`).join(' ')}</p>`,
    ],
    pageCount: 2,
    check: async ({ pdfPages }) => {
      expect(lastToken(pdfPages[0])).toMatch(/^W/)
      expect(firstToken(pdfPages[1])).toMatch(/^W/)
    },
  },
  {
    name: 'a list across page 1\'s end',
    body: [brParagraph(lines('A', 20)), `<ul>${lines('B', 30).map((line) => `<li>${line}</li>`).join('')}</ul>`],
    pageCount: 2,
    check: async ({ pdfPages }) => {
      expect(lastToken(pdfPages[0])).toMatch(/^B/)
      expect(firstToken(pdfPages[1])).toMatch(/^B/)
    },
  },
  {
    name: 'a recipient address running past page 1',
    body: [brParagraph(lines('A', 10))],
    // The sender block and this address share the header's grid cell.
    // Short lines: the address field holds at most 1,000 characters.
    fields: { company_address: Array.from({ length: 60 }, (_, index) => `H${String(index + 1).padStart(3, '0')} Rue`).join('\n') },
    pageCount: 2,
    check: async ({ pdfPages }) => {
      expect(lastToken(pdfPages[0])).toMatch(/^H/)
      expect(firstToken(pdfPages[1])).toMatch(/^H/)
    },
  },
]

async function insertLetter(userId: string, body: string[], fields: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'Page breaks',
      sender_name: 'Zoë Lovelace',
      company_name: 'Acme SA',
      job_title: 'Software Engineer',
      greeting: 'Dear Hiring Manager,',
      body_paragraphs: body,
      sign_off: 'Sincerely,',
      annexes: '',
      ...fields,
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

/** A plain letter of `count` body lines. */
const plainBody = (count: number) => [brParagraph(lines('A', count))]

const pane = (page: Page) => page.getByTestId('cover-letter-preview-pane')

async function openEditor(page: Page, letterId: string, locale = 'en') {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  // The paragraphs are filled in after hydration (`SanitizedHtml`).
  await expect(pane(page).locator('[data-letter-part="body"]').first()).not.toBeEmpty()
}

async function openWindow(page: Page, dict: typeof editorDict = editorDict): Promise<Locator> {
  await page.getByRole('button', { name: dict.preview, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: dict.previewTitle, exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-letter-part="body"]').first()).not.toBeEmpty()
  return dialog
}

const markers = (scope: Locator) => scope.getByTestId('page-break-indicator')
const labels = (scope: Locator) => scope.getByTestId('page-break-label')
const scrollArea = (scope: Locator) => scope.getByTestId('cover-letter-preview-scroll-area')
const sheet = (scope: Locator) => scope.getByTestId('cover-letter-preview-page')

/** Each marker's y in the unscaled sheet, read from where it is drawn. */
async function markerOffsets(scope: Locator): Promise<number[]> {
  const page = await rect(sheet(scope))
  const scale = page.width / PAGE_WIDTH
  const tops = await markers(scope).evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top),
  )
  return tops.map((top) => (top - page.top) / scale)
}

/** n − 1 markers, numbered 2 … n. */
async function expectMarkers(scope: Locator, pageCount: number, name: string) {
  await expect(markers(scope), `${name}: markers`).toHaveCount(pageCount - 1)
  for (let k = 1; k < pageCount; k++) {
    await expect(markers(scope).nth(k - 1)).toHaveAttribute('data-page', String(k + 1))
  }
}

/** The glyphs of `token` in the preview's letter: unscaled top and bottom. */
function glyphOf(scope: Locator) {
  return (token: string) =>
    sheet(scope).evaluate(
      (element, { token: wanted, pageWidth }) => {
        const page = element.getBoundingClientRect()
        const scale = page.width / pageWidth
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = node.textContent?.indexOf(wanted) ?? -1
          if (at < 0) continue
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + wanted.length)
          const box = range.getBoundingClientRect()
          return { top: (box.top - page.top) / scale, bottom: (box.bottom - page.top) / scale }
        }
        throw new Error(`No ${wanted} in the preview`)
      },
      { token, pageWidth: PAGE_WIDTH },
    )
}

/** Each PDF page's lines that start with a token, top to bottom, left to right. */
function pdfLines(pages: PdfTextItem[][]): PdfLine[][] {
  return pages.map((items) =>
    items
      .flatMap((item) => {
        const token = TOKEN.exec(item.str)?.[1]
        return token ? [{ token, baseline: item.baseline * PX_PER_PT, x: item.x, fontSize: item.fontSize }] : []
      })
      .sort((a, b) => a.baseline - b.baseline || a.x - b.x),
  )
}

const atLetterSize = (line: PdfLine) => Math.abs(line.fontSize - SWISS_LETTER_FONT_SIZE_PT) < 0.5

/**
 * Where each PDF page k + 1 starts, in the preview's unscaled coordinates,
 * read from the PDF alone.
 *
 * Page 1 prints from the sheet's top, so its lines give the PDF's scale (the
 * PDF page is 841.92 pt, not exactly the 1123 px it was laid out on) and the
 * distance from a line's glyph top to its baseline at the letter's size: two
 * lines' PDF baselines against their glyph tops in the preview. On page
 * k + 1, a line at the letter's size then sits `baseline / scale − distance`
 * below the page's top, so `… − top margin` below where the page's content
 * starts; the page starts at the line's preview glyph top less that.
 */
async function pdfBreaks(pages: PdfLine[][], glyph: FixtureContext['glyph']): Promise<number[]> {
  const onPage1 = pages[0].filter(atLetterSize)
  expect(onPage1.length, 'lines at the letter\'s size on PDF page 1').toBeGreaterThan(1)
  const [a, b] = [onPage1[0], onPage1.at(-1)!]
  const [glyphA, glyphB] = [await glyph(a.token), await glyph(b.token)]
  const scale = (b.baseline - a.baseline) / (glyphB.top - glyphA.top)
  const glyphToBaseline = a.baseline / scale - glyphA.top
  test.info().annotations.push({ type: 'PDF scale', description: `${scale.toFixed(6)} PDF px per layout px` })
  const breaks: number[] = []
  for (const next of pages.slice(1)) {
    const line = next.find(atLetterSize)
    expect(line, 'a line at the letter\'s size on each page').toBeDefined()
    breaks.push((await glyph(line!.token)).top - (line!.baseline / scale - glyphToBaseline - PAGE_TOP_MARGIN_PX))
  }
  return breaks
}

async function downloadPdf(page: Page, letterId: string, name: string): Promise<Buffer> {
  const response = await page.request.post(`/api/cover-letters/${letterId}/download-pdf`, {
    data: { locale: 'en' },
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(response.status()).toBe(200)
  const pdf = await response.body()
  await test.info().attach(name, { body: pdf, contentType: 'application/pdf' })
  return pdf
}

/** No horizontal scroll in the area. */
async function expectNoSideScroll(scope: Locator, name: string) {
  const { scrollWidth, clientWidth } = await scrollArea(scope).evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  expect(scrollWidth, `${name}: horizontal scroll`).toBeLessThanOrEqual(clientWidth)
}

for (const fixture of FIXTURES) {
  test(`${fixture.name}: ${fixture.pageCount - 1} markers in both previews, each where the PDF breaks`, async ({
    page,
    authedUser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const letterId = await insertLetter(authedUser.id, fixture.body, fixture.fields)

    // The PDF first: it is the authority.
    const pdf = await downloadPdf(page, letterId, `${fixture.name}.pdf`)
    const pdfPages = pdfLines(await readPdfTextItems(pdf))
    expect(pdfPages, 'the PDF page count').toHaveLength(fixture.pageCount)

    await openEditor(page, letterId)
    await expectMarkers(pane(page), fixture.pageCount, 'pane')
    // The pane is fitted to its width: no room for a label.
    await expect(labels(pane(page))).toHaveCount(0)
    await expectNoSideScroll(pane(page), 'pane')

    const glyph = glyphOf(pane(page))
    const paneOffsets = await markerOffsets(pane(page))
    const breaks = await pdfBreaks(pdfPages, glyph)
    for (let k = 1; k < fixture.pageCount; k++) {
      const marker = paneOffsets[k - 1]
      // Lines at the letter's size: a larger font's glyphs reach above its
      // line box, and so above the break (the 24 px fixture checks its own).
      const last = pdfPages[k - 1].filter(atLetterSize).at(-1)!.token
      const first = pdfPages[k].find(atLetterSize)!.token
      const lastGlyph = await glyph(last)
      const firstGlyph = await glyph(first)
      // Recorded before the assertions, so a failing run still reports where the PDF broke.
      test.info().annotations.push({
        type: `${fixture.name}, marker ${k}`,
        description:
          `marker ${marker.toFixed(2)} px; PDF page ${k + 1} starts at ${breaks[k - 1].toFixed(2)} ` +
          `(gap ${(marker - breaks[k - 1]).toFixed(2)}); page ${k} ends with ${last} ` +
          `(glyphs end ${lastGlyph.bottom.toFixed(2)}), page ${k + 1} starts with ${first} ` +
          `(glyphs start ${firstGlyph.top.toFixed(2)})`,
      })
      expect(lastGlyph.bottom, `marker ${k} (${marker.toFixed(2)}) below ${last}`).toBeLessThanOrEqual(
        marker + EDGE_TOLERANCE,
      )
      expect(firstGlyph.top, `marker ${k} (${marker.toFixed(2)}) above ${first}`).toBeGreaterThanOrEqual(
        marker - EDGE_TOLERANCE,
      )
      expect(Math.abs(marker - breaks[k - 1]), `marker ${k} at the PDF's page ${k + 1} start`).toBeLessThanOrEqual(
        EDGE_TOLERANCE,
      )
    }
    await fixture.check?.({ pdfPages, glyph, markers: paneOffsets })

    const dialog = await openWindow(page)
    await expectMarkers(dialog, fixture.pageCount, 'window')
    const windowOffsets = await markerOffsets(dialog)
    windowOffsets.forEach((y, index) => {
      expect(Math.abs(y - paneOffsets[index]), `window marker ${index + 1} where the pane's is`).toBeLessThanOrEqual(1)
    })
    // "Show all" leaves room beside the sheet: every marker is labelled.
    await expect(labels(dialog)).toHaveText(
      Array.from({ length: fixture.pageCount - 1 }, (_, index) => `Page ${index + 2}`),
    )
    await expectNoSideScroll(dialog, 'window')
  })
}


test('the label follows the interface locale, not the letter\'s language', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // The letter is in English.
  const letterId = await insertLetter(authedUser.id, plainBody(45))

  for (const [locale, messages, expected] of [
    ['fr', fr, 'Page 2'],
    ['en', en, 'Page 2'],
    ['de', de, 'Seite 2'],
    ['it', it, 'Pagina 2'],
  ] as const) {
    await test.step(locale, async () => {
      await openEditor(page, letterId, locale)
      await expect(markers(pane(page))).toHaveCount(1)
      const dialog = await openWindow(page, messages.coverLetters.editor)
      await expect(labels(dialog)).toHaveText([expected])
    })
  }
})

test('the markers follow typing and zoom without a reload, at a constant on-screen thickness', async ({
  page,
  authedUser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const letterId = await insertLetter(authedUser.id, plainBody(10))
  await openEditor(page, letterId)
  const navigations: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url())
  })
  await expect(markers(pane(page))).toHaveCount(0)

  // Typing a long recipient address pushes the letter onto a second page.
  await page.getByRole('button', { name: editorDict.sections.recipient, exact: true }).click()
  const address = page.getByPlaceholder(editorDict.recipient.addressPlaceholder, { exact: true })
  const longAddress = Array.from({ length: 40 }, (_, index) => `Address line ${index + 1}`).join('\n')
  await address.fill(longAddress)
  await expectMarkers(pane(page), 2, 'pane after typing')
  await address.fill('Avenue de la Gare 10')
  await expect(markers(pane(page))).toHaveCount(0)
  await address.fill(longAddress)
  await expectMarkers(pane(page), 2, 'pane after typing again')

  // Zoom, in the pane: the marker stays at the same place in the letter and keeps its thickness.
  const scope = pane(page)
  const [atFit] = await markerOffsets(scope)
  const controls = scope.getByRole('group', { name: editorDict.zoomControls, exact: true })
  const thickness = () =>
    markers(scope)
      .first()
      .getByTestId('page-break-line')
      .evaluate((element) => element.getBoundingClientRect().height)
  await expect.poll(thickness, 'line thickness at the fitted width').toBeCloseTo(1, 2)
  const seen: string[] = []
  for (const press of ['zoomOut', 'zoomOut', 'zoomOut', 'zoomIn', 'zoomIn', 'zoomIn', 'zoomIn', 'zoomIn'] as const) {
    await controls.getByRole('button', { name: editorDict[press], exact: true }).click()
    const percent = (await controls.getByTestId('cover-letter-zoom-percent').textContent())?.trim() ?? ''
    await expectMarkers(scope, 2, `pane at ${percent}`)
    await expect
      .poll(async () => Math.abs((await markerOffsets(scope))[0] - atFit), `marker in place at ${percent}`)
      .toBeLessThanOrEqual(1)
    await expect.poll(thickness, `line thickness at ${percent}`).toBeCloseTo(1, 2)
    // A label only where the gutter has room, and never a horizontal scroll it adds.
    const { pageWidth, contentWidth } = await scrollArea(scope).evaluate((element) => {
      const style = window.getComputedStyle(element)
      const sheetBox = element.querySelector('[data-testid="cover-letter-preview-page"]')!.getBoundingClientRect()
      return {
        pageWidth: sheetBox.width,
        contentWidth: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      }
    })
    if (pageWidth <= contentWidth - 2 * 16) {
      await expect(labels(scope), `label at ${percent}`).toHaveCount(1)
      await expectNoSideScroll(scope, `pane at ${percent}`)
    } else if (pageWidth <= contentWidth) {
      await expect(labels(scope), `no label at ${percent}`).toHaveCount(0)
      await expectNoSideScroll(scope, `pane at ${percent}`)
    } else {
      await expect(labels(scope), `no label at ${percent}`).toHaveCount(0)
    }
    seen.push(`${percent}: ${(await thickness()).toFixed(3)} px`)
  }
  test.info().annotations.push({ type: 'line thickness', description: seen.join(', ') })
  expect(navigations, 'no reload').toEqual([])
})

test('with no room beside the sheet, the line is drawn without its label and nothing scrolls sideways', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id, plainBody(45))

  // The pane, fitted to its width.
  await page.setViewportSize({ width: 1440, height: 900 })
  await openEditor(page, letterId)
  await expect(markers(pane(page))).toHaveCount(1)
  await expect(labels(pane(page))).toHaveCount(0)
  await expectNoSideScroll(pane(page), 'pane')

  // At phone width the preview is the pane, shown by the editor's view switch, fitted to the screen.
  await page.setViewportSize({ width: 375, height: 812 })
  await openEditor(page, letterId)
  await page
    .getByRole('radiogroup', { name: editorDict.view.label, exact: true })
    .getByRole('radio', { name: editorDict.view.preview, exact: true })
    .click()
  await expect(pane(page)).toBeVisible()
  await expect(markers(pane(page))).toHaveCount(1)
  await expect(markers(pane(page)).getByTestId('page-break-line')).toBeVisible()
  await expect(labels(pane(page))).toHaveCount(0)
  await expectNoSideScroll(pane(page), 'phone-width pane')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    'the page scrolls sideways',
  ).toBe(true)
})

test('the overlay is decorative: aria-hidden, no pointer events, hidden in print', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const letterId = await insertLetter(authedUser.id, plainBody(45))
  await openEditor(page, letterId)
  const overlay = pane(page).getByTestId('page-break-indicators')
  await expect(overlay).toHaveAttribute('aria-hidden', 'true')
  const style = await overlay.evaluate((element) => {
    const computed = window.getComputedStyle(element)
    return { pointerEvents: computed.pointerEvents, userSelect: computed.userSelect, position: computed.position }
  })
  expect(style).toEqual({ pointerEvents: 'none', userSelect: 'none', position: 'absolute' })

  // A click on the line reaches the letter, not the marker.
  const marker = markers(pane(page)).first()
  await marker.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const line = await rect(marker.getByTestId('page-break-line'))
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y)
      return {
        found: element !== null,
        onOverlay: element?.closest('[data-testid="page-break-indicators"]') != null,
        onSheet: element?.closest('[data-testid="cover-letter-preview-page"]') != null,
      }
    },
    { x: line.left + line.width / 2, y: line.top + line.height / 2 },
  )
  expect(hit).toEqual({ found: true, onOverlay: false, onSheet: true })

  await page.emulateMedia({ media: 'print' })
  await expect(overlay).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
  await expect(overlay).toBeVisible()

  // Where the label is drawn, it stays out of the accessibility tree.
  const dialog = await openWindow(page)
  await expect(labels(dialog)).toHaveText(['Page 2'])
  expect(await scrollArea(dialog).ariaSnapshot()).not.toContain('Page 2')
})
