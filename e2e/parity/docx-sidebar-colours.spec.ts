import { test, expect } from '@playwright/test'
import { readDocxSidebarColours, readParagraphs, type SidebarColourDepths } from './surfaces'

/**
 * How the DOCX reader finds the sidebar background and the accent, shown on
 * synthetic `word/document.xml` fragments. Collected by `pnpm test:parity`
 * only: `playwright.config.ts` ignores `e2e/parity`, and the visual suite
 * reads `e2e/visual`. Pure functions, no browser and no server.
 *
 * The shapes are the ones `docx-modern.ts` writes since PR #88: the sidebar
 * heading is a one-cell table whose cell shading (`w:val="clear"`, `w:fill`) is
 * the accent, nested in the sidebar column's cell, whose shading is the
 * sidebar colour.
 */

const SIDEBAR = '1E293B'
const ACCENT = '0D9488'
const HEADING = 'CONTACT'

const MODERN: SidebarColourDepths = { sidebarBackgroundDepth: 2, accentDepth: 1 }
const PROFESSIONAL: SidebarColourDepths = { sidebarBackgroundDepth: 1, accentDepth: null }

const shading = (fill: string) => `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`

const cell = (cellShading: string | null, children: string) =>
  `<w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/>${cellShading ?? ''}</w:tcPr>${children}</w:tc>`

const table = (...cells: string[]) => `<w:tbl><w:tr>${cells.join('')}</w:tr></w:tbl>`

const paragraph = (text: string, paragraphShading: string | null = null) =>
  `<w:p>${paragraphShading ? `<w:pPr>${paragraphShading}</w:pPr>` : ''}` +
  `<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`

/** The two-column page: the sidebar cell holding `sidebar`, and a main cell. */
const page = (sidebar: string) =>
  `<w:document><w:body>${table(cell(shading(SIDEBAR), sidebar), cell(null, paragraph('Main column')))}</w:body></w:document>`

/** The banner #88 writes: a one-cell table around the heading paragraph. */
const banner = (bannerShading: string | null) =>
  table(cell(bannerShading, paragraph(HEADING))) + paragraph('')

const read = (xml: string, depths: SidebarColourDepths) =>
  readDocxSidebarColours(
    xml,
    readParagraphs(xml).find((p) => p.text === HEADING),
    depths,
  )

test('the Modern accent is the banner cell, the sidebar background the cell around it', () => {
  const colours = read(page(banner(shading(ACCENT)) + paragraph('Email')), MODERN)
  expect(colours.accent).toEqual({ hex: `#${ACCENT}`, alpha: 255 })
  expect(colours.sidebarBackground).toEqual({ hex: `#${SIDEBAR}`, alpha: 255 })
  // The defect the accent throw used to hide: the innermost cell is the banner,
  // so a reader taking it for the sidebar would report the accent twice.
  expect(colours.sidebarBackground?.hex).not.toBe(colours.accent?.hex)
})

test('a sidebar heading whose banner cell carries no shading still raises', () => {
  // Counting unshaded cells too is what keeps this from falling through to the
  // sidebar cell and reporting the sidebar colour as the accent.
  expect(() => read(page(banner(null)), MODERN)).toThrow('The DOCX accent has no shading')
})

test('the pre-#88 shape, a paragraph shaded itself, is rejected', () => {
  // Decision: rejected, not read. No generator writes this shape since #88, and
  // reading it would let a return to it measure as parity. It is rejected even
  // though the sidebar cell around it is shaded, so it cannot be mistaken for
  // the banner's accent.
  const xml = page(paragraph(HEADING, shading(ACCENT)) + paragraph('Email'))
  expect(() => read(xml, MODERN)).toThrow('carries its own shading (#0D9488), the layout before PR #88')
})

test('a Modern heading with no banner cell around it raises rather than reading the sidebar as the accent', () => {
  expect(() => read(page(paragraph(HEADING)), MODERN)).toThrow(
    'The DOCX sidebar background is the table cell 2 level(s) out from the sidebar heading, but the heading sits in 1 cell(s)',
  )
})

test('Professional reads its sidebar background from the cell its heading sits in, and no accent', () => {
  const colours = read(page(paragraph(HEADING) + paragraph('Skills')), PROFESSIONAL)
  expect(colours).toEqual({ sidebarBackground: { hex: `#${SIDEBAR}`, alpha: 255 }, accent: null })
})

test('no sidebar heading in the document raises for each colour the template draws', () => {
  const xml = page(paragraph('Email'))
  expect(() => read(xml, MODERN)).toThrow('No sidebar section in the DOCX to read the sidebar background from')
  expect(read(xml, { sidebarBackgroundDepth: null, accentDepth: null })).toEqual({
    sidebarBackground: null,
    accent: null,
  })
})
