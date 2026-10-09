import { test, expect } from '@playwright/test'
import { resolveLayoutModel } from '../../src/lib/layout-settings'
import { PROFILES } from './profiles'
import {
  summariseSidebarColumn,
  type ColourSample,
  type ColumnPage,
  type Observation,
  type SurfaceMeasurement,
} from './surfaces'
import { evaluateRow, formatRowLine, knownListFor, rowDefinitions } from './verdicts'

/**
 * The Linux-only known divergence `linux-print-sidebar-column`, shown on
 * synthetic pixel columns summarised by the real reader
 * (`summariseSidebarColumn`) and judged by the real row evaluation
 * (`evaluateRow`) with each platform's known list (`knownListFor`). Collected by
 * `pnpm test:parity` only: `playwright.config.ts` ignores `e2e/parity`, and the
 * visual suite reads `e2e/visual`. No browser and no server.
 *
 * The two reference columns are the ones measured on the two-page professional
 * print (observations/multi-page__professional.json). On ubuntu-latest
 * (https://github.com/winiboy/my-cv-platform/actions/runs/37892980945, draft
 * PR #99) the last page shows the sidebar colour to y242, then paper with one
 * #FDFEFD row painted at y245. On Windows the fill ends at y258, one
 * anti-aliased edge row follows, then paper. The fix is owed by
 * tasks/prds/linux-print-sidebar-column.md.
 */

const ROW_ID = 'multi-page · professional · colour:print-sidebar-column'
const KNOWN = 'linux-print-sidebar-column'

const SIDEBAR: ColourSample = { hex: '#1F7A4D', alpha: 255, css: 'hsl(150, 60%, 30%)' }
const PREVIEW_SIDEBAR: ColourSample = { hex: '#1F7A4D', alpha: 255, css: 'rgb(31, 122, 77)' }
const DOCX_SIDEBAR: ColourSample = { hex: '#1F7A4D', alpha: 255 }

const PRINTED = '#1E7A4C'
const PAPER = '#FFFFFF'
const SEAM = '#FDFEFD'
const EDGE = '#8EBCA5'
const HEIGHT = 842
/** Below every fill in these columns, so the rows after the fill are below the last text. */
const LAST_TEXT_PT = 234.6

type Runs = ColumnPage['runs']

const fullPage: Runs = [{ hex: PRINTED, from: 0, to: HEIGHT - 1 }]

/** The last page as the Linux trial printed it. */
const linuxLastPage: Runs = [
  { hex: PRINTED, from: 0, to: 242 },
  { hex: PAPER, from: 243, to: 244 },
  { hex: SEAM, from: 245, to: 245 },
  { hex: PAPER, from: 246, to: HEIGHT - 1 },
]

/** The last page as Windows prints it. */
const windowsLastPage: Runs = [
  { hex: PRINTED, from: 0, to: 258 },
  { hex: EDGE, from: 259, to: 259 },
  { hex: PAPER, from: 260, to: HEIGHT - 1 },
]

const surface = (sidebarBackground: ColourSample | null): SurfaceMeasurement => ({
  sequence: [],
  typography: null,
  extraColours: {},
  sidebarBackground,
  accent: null,
  pageWidthInches: 8.27,
})

/** The row evaluated on `platform`, with the PDF's sidebar column read from `pages`. */
function evaluateOn(platform: NodeJS.Platform, pages: readonly Runs[]) {
  const row = rowDefinitions().find((definition) => definition.id === ROW_ID)
  if (!row) throw new Error(`No row ${ROW_ID}`)
  const profile = PROFILES.find((candidate) => candidate.id === row.profile)
  if (!profile) throw new Error(`No profile ${row.profile}`)
  const observation: Observation = {
    profile: row.profile,
    template: row.template,
    model: resolveLayoutModel(profile.layout),
    modelColours: { sidebar: SIDEBAR, accent: SIDEBAR },
    surfaces: { preview: surface(PREVIEW_SIDEBAR), pdf: surface(null), docx: surface(DOCX_SIDEBAR) },
    colourChecks: [],
    printSidebarColumn: summariseSidebarColumn(
      pages.map((runs) => ({ height: HEIGHT, runs })),
      LAST_TEXT_PT,
    ),
    evidence: { preview: [], pdf: [], docx: [] },
    environment: { browserVersion: 'synthetic' },
  }
  return { observation, evaluated: evaluateRow(row, () => observation, knownListFor(platform)) }
}

test('the synthetic columns read as the trial runs did', () => {
  const linux = evaluateOn('linux', [fullPage, linuxLastPage]).observation.printSidebarColumn
  expect(linux?.runs).toEqual([
    'page 1 y0-841 #1E7A4C',
    'page 2 y0-242 #1E7A4C',
    'page 2 y243-244 #FFFFFF paper below the last text',
    'page 2 y245-245 #FDFEFD painted below the last text',
    'page 2 y246-841 #FFFFFF paper below the last text',
  ])
  expect(linux?.colours.map((colour) => colour.hex)).toEqual([PRINTED, SEAM])

  const windows = evaluateOn('win32', [fullPage, windowsLastPage]).observation.printSidebarColumn
  expect(windows?.runs).toEqual([
    'page 1 y0-841 #1E7A4C',
    'page 2 y0-258 #1E7A4C',
    'page 2 y259-259 #8EBCA5 edge between #1E7A4C and #FFFFFF',
    'page 2 y260-841 #FFFFFF paper below the last text',
  ])
  expect(windows?.colours.map((colour) => colour.hex)).toEqual([PRINTED])
})

test('the gate: the entry and its row are known on Linux and on no other platform', () => {
  const linux = knownListFor('linux')
  expect(linux.ids).toContain(KNOWN)
  expect(linux.expectations[ROW_ID]).toBe(KNOWN)
  expect(linux.signatures.map((signature) => signature.id)).toContain(KNOWN)

  for (const platform of ['win32', 'darwin'] as const) {
    const other = knownListFor(platform)
    expect(other.ids).not.toContain(KNOWN)
    expect(other.expectations[ROW_ID]).toBeUndefined()
    expect(other.signatures.map((signature) => signature.id)).not.toContain(KNOWN)
    // Only this entry is confined: the rest of the list is the same everywhere.
    expect(other.ids).toEqual(linux.ids.filter((id) => id !== KNOWN))
  }
})

test('the Linux shape is KNOWN on Linux', () => {
  const { evaluated } = evaluateOn('linux', [fullPage, linuxLastPage])
  expect(evaluated.verdict).toBe(`KNOWN: ${KNOWN}`)
  // The CI line, verdict and note aside.
  expect(formatRowLine({ ...evaluated, verdict: 'NEW', note: null })).toBe(
    `[NEW] ${ROW_ID} | model #1F7A4D (hsl(150, 60%, 30%)) | preview #1F7A4D (rgb(31, 122, 77)) | ` +
      'pdf #1E7A4C then #FDFEFD | docx #1F7A4D | agree model, preview, docx | diverge pdf',
  )
})

test('the Linux shape is NEW off Linux, not excused', () => {
  for (const platform of ['win32', 'darwin'] as const) {
    expect(evaluateOn(platform, [fullPage, linuxLastPage]).evaluated.verdict).toBe('NEW')
  }
})

test('the Windows shape is a MATCH on every platform', () => {
  for (const platform of ['linux', 'win32', 'darwin'] as const) {
    const { evaluated } = evaluateOn(platform, [fullPage, windowsLastPage])
    expect(evaluated.verdict).toBe('MATCH')
    expect(evaluated.note).toBeNull()
  }
})

const NOT_THIS_DEFECT: { name: string; pages: Runs[] }[] = [
  {
    name: 'near-white on page 1',
    pages: [
      [
        { hex: PRINTED, from: 0, to: 400 },
        { hex: SEAM, from: 401, to: HEIGHT - 1 },
      ],
      linuxLastPage,
    ],
  },
  {
    name: 'a near-white gap between two runs of the colour',
    pages: [
      fullPage,
      [
        { hex: PRINTED, from: 0, to: 100 },
        { hex: SEAM, from: 101, to: 110 },
        { hex: PRINTED, from: 111, to: 242 },
        { hex: PAPER, from: 243, to: HEIGHT - 1 },
      ],
    ],
  },
  {
    name: 'a painted near-white line 3 rows tall',
    pages: [
      fullPage,
      [
        { hex: PRINTED, from: 0, to: 242 },
        { hex: PAPER, from: 243, to: 244 },
        { hex: SEAM, from: 245, to: 247 },
        { hex: PAPER, from: 248, to: HEIGHT - 1 },
      ],
    ],
  },
  {
    name: 'a near-white line on a page that is not the last',
    pages: [
      fullPage,
      [
        { hex: PRINTED, from: 0, to: 500 },
        { hex: SEAM, from: 501, to: 501 },
        { hex: PRINTED, from: 502, to: HEIGHT - 1 },
      ],
      [
        { hex: PRINTED, from: 0, to: 242 },
        { hex: PAPER, from: 243, to: HEIGHT - 1 },
      ],
    ],
  },
  {
    name: 'the painted line directly under the colour, with no paper above it',
    pages: [
      fullPage,
      [
        { hex: PRINTED, from: 0, to: 242 },
        // Two rows, so it cannot read as an anti-aliased edge.
        { hex: SEAM, from: 243, to: 244 },
        { hex: PAPER, from: 245, to: HEIGHT - 1 },
      ],
    ],
  },
  {
    name: 'a painted line that is not near-white',
    pages: [
      fullPage,
      [
        { hex: PRINTED, from: 0, to: 242 },
        { hex: PAPER, from: 243, to: 244 },
        { hex: '#F0F0F0', from: 245, to: 245 },
        { hex: PAPER, from: 246, to: HEIGHT - 1 },
      ],
    ],
  },
  {
    name: 'two painted near-white lines',
    pages: [
      fullPage,
      [
        { hex: PRINTED, from: 0, to: 242 },
        { hex: PAPER, from: 243, to: 244 },
        { hex: SEAM, from: 245, to: 245 },
        { hex: PAPER, from: 246, to: 300 },
        { hex: SEAM, from: 301, to: 301 },
        { hex: PAPER, from: 302, to: HEIGHT - 1 },
      ],
    ],
  },
]

for (const c of NOT_THIS_DEFECT) {
  test(`on Linux, not this defect: ${c.name}`, () => {
    expect(evaluateOn('linux', c.pages).evaluated.verdict).toBe('NEW')
  })
}
