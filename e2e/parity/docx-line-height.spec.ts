import { test, expect } from '@playwright/test'
import JSZip from 'jszip'
import { resolveLayoutModel } from '../../src/lib/layout-settings'
import { PROFILES } from './profiles'
import {
  comparedLineHeight,
  measureDocx,
  type Observation,
  type StyleSample,
  type SurfaceMeasurement,
  type SurfaceProbe,
  type TypographyElement,
} from './surfaces'
import { evaluateRow, rowDefinitions } from './verdicts'

/**
 * How a DOCX exact line spacing is compared with the Preview's line box, shown
 * on a synthetic Word document read by the real reader (`measureDocx`) and
 * judged by the real row evaluation (`evaluateRow`). Collected by
 * `pnpm test:parity` only: `playwright.config.ts` ignores `e2e/parity`, and the
 * visual suite reads `e2e/visual`. No browser and no server.
 *
 * The numbers are the professional body text of the `primary` profile: 11px at
 * fontScale 1.2 is 13.2px in the Preview, drawn at line-height 1.35, a
 * 17.82px line box. Since PR #88 `docx-professional.ts` writes that line from
 * the unrounded size, round(1.35 x 19.8 half-points x 10) = 267 twips, while
 * the run is rounded to `w:sz` 20 with a 99% `w:w` width scale.
 */

const ROW_ID = 'primary · professional · line-height:bodyText'
const TITLE = 'Jane Doe'
const HEADING = 'EXPERIENCE'
const BODY = 'Led the parity work'

const PREVIEW_BODY_PX = 13.2
const PREVIEW_BODY_RATIO = 1.35
const BODY_RUN_SIZE = 20
/** round(1.35 x 19.8 x 10): the exact line #88 writes for this body text. */
const BODY_LINE_TWIPS = 267

const PROBE: SurfaceProbe = {
  sections: [],
  titleText: TITLE,
  headingText: HEADING,
  bodyMarker: BODY,
  sidebarKeys: [],
  sidebarBackgroundDepth: null,
  accentDepth: null,
  extraColourSamples: [],
  sampleTypography: true,
  modelColourCss: { sidebar: 'hsl(0, 0%, 0%)', accent: 'hsl(0, 0%, 0%)' },
}

const exactParagraph = (text: string, size: number, lineTwips: number) =>
  `<w:p><w:pPr><w:spacing w:line="${lineTwips}" w:lineRule="exact"/></w:pPr>` +
  `<w:r><w:rPr><w:rFonts w:ascii="Verdana"/><w:w w:val="99"/><w:sz w:val="${size}"/></w:rPr>` +
  `<w:t>${text}</w:t></w:r></w:p>`

/** A Word document whose body paragraph has an exact line of `bodyLineTwips`. */
async function docx(bodyLineTwips: number): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    'word/document.xml',
    '<w:document><w:body>' +
      exactParagraph(TITLE, 40, 475) +
      exactParagraph(HEADING, 26, 313) +
      exactParagraph(BODY, BODY_RUN_SIZE, bodyLineTwips) +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>',
  )
  zip.file(
    'word/styles.xml',
    '<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="20"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:line="240" w:lineRule="exact"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults></w:styles>',
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

const previewSample = (text: string, px: number, ratio: number): StyleSample => ({
  text,
  px,
  halfPoints: Math.round(px * 1.5),
  colour: { hex: '#000000', alpha: 255 },
  backdrop: null,
  opacity: 1,
  fontFamily: 'Verdana',
  declaredFamily: 'Verdana',
  letterSpacingEm: 0,
  lineHeight: { kind: 'ratio', ratio },
})

/** The Preview (and the PDF, which takes its line height from the print) drawing the body at 13.2px x 1.35. */
const previewSurface = (): SurfaceMeasurement => {
  const typography: Record<TypographyElement, StyleSample> = {
    documentTitle: previewSample(TITLE, 26.4, 1.2),
    sectionHeading: previewSample(HEADING, 17.4, 1.2),
    bodyText: previewSample(BODY, PREVIEW_BODY_PX, PREVIEW_BODY_RATIO),
  }
  return {
    sequence: [],
    typography,
    extraColours: {},
    sidebarBackground: null,
    accent: null,
    pageWidthInches: 11906 / 1440,
  }
}

async function evaluateBody(bodyLineTwips: number) {
  const row = rowDefinitions().find((definition) => definition.id === ROW_ID)
  if (!row) throw new Error(`No row ${ROW_ID}`)
  const profile = PROFILES.find((candidate) => candidate.id === row.profile)
  if (!profile) throw new Error(`No profile ${row.profile}`)
  const docxSurface = await measureDocx(await docx(bodyLineTwips), PROBE)
  const observation: Observation = {
    profile: row.profile,
    template: row.template,
    model: resolveLayoutModel(profile.layout),
    modelColours: { sidebar: { hex: '#000000', alpha: 255 }, accent: { hex: '#000000', alpha: 255 } },
    surfaces: { preview: previewSurface(), pdf: previewSurface(), docx: docxSurface },
    colourChecks: [],
    printSidebarColumn: null,
    evidence: { preview: [], pdf: [], docx: [] },
    environment: { browserVersion: 'synthetic' },
  }
  return { docxSurface, evaluated: evaluateRow(row, () => observation) }
}

test('the reader keeps an exact spacing as the pitch Word draws, not as a ratio of the rounded run size', async () => {
  const { docxSurface } = await evaluateBody(BODY_LINE_TWIPS)
  const body = docxSurface.typography?.bodyText
  expect(body?.halfPoints).toBe(BODY_RUN_SIZE)
  // 267 twips at 15 per CSS px.
  expect(body?.lineHeight).toEqual({ kind: 'exact-pitch', px: BODY_LINE_TWIPS / 15 })
})

test('control: an exact line at the Preview line box is a MATCH', async () => {
  const { evaluated } = await evaluateBody(BODY_LINE_TWIPS)
  expect(evaluated.verdict).toBe('MATCH')
  expect(evaluated.docx).toBe('x1.348 font size')
  // The quantity before this story, the pitch over the rounded w:sz, reads
  // x1.335 for this same correct export: the NEW row #88 left behind.
  expect(Math.round((BODY_LINE_TWIPS / 20 / (BODY_RUN_SIZE / 2)) * 1000) / 1000).toBe(1.335)
})

test('an exact line 5% taller than the Preview line box is still a divergence', async () => {
  const fivePercentTaller = Math.round(PREVIEW_BODY_RATIO * PREVIEW_BODY_PX * 15 * 1.05)
  const { evaluated } = await evaluateBody(fivePercentTaller)
  expect(evaluated.verdict).toBe('NEW')
  expect(evaluated.docx).toBe('x1.419 font size')
})

test('an exact line 5% shorter than the Preview line box is still a divergence', async () => {
  const fivePercentShorter = Math.round(PREVIEW_BODY_RATIO * PREVIEW_BODY_PX * 15 * 0.95)
  const { evaluated } = await evaluateBody(fivePercentShorter)
  expect(evaluated.verdict).toBe('NEW')
  expect(evaluated.docx).toBe('x1.283 font size')
})

test('at a whole half-point size the Preview size and the run size give the same ratio', () => {
  // 18px is 27 half-points exactly: the classic, minimal and creative rows read as before #88.
  expect(comparedLineHeight({ kind: 'exact-pitch', px: 405 / 15 }, 18)).toEqual({ kind: 'ratio', ratio: 1.5 })
  expect(Math.round((405 / 20 / (27 / 2)) * 1000) / 1000).toBe(1.5)
})

test('kinds other than an exact pitch pass through unchanged', () => {
  expect(comparedLineHeight({ kind: 'at-least', ratio: 1.2 }, 13.2)).toEqual({ kind: 'at-least', ratio: 1.2 })
  expect(comparedLineHeight({ kind: 'auto-multiple', ratio: 1.15 }, 13.2)).toEqual({ kind: 'auto-multiple', ratio: 1.15 })
  expect(comparedLineHeight({ kind: 'normal' }, 13.2)).toEqual({ kind: 'normal' })
  expect(() => comparedLineHeight({ kind: 'exact-pitch', px: 18 }, 0)).toThrow('Preview size of 0px')
})
