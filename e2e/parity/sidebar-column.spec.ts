import { test, expect } from '@playwright/test'
import { coloursAgree, convertCssColour, isBlendOf } from './colour'
import { summariseSidebarColumn, type ColumnPage } from './surfaces'

/**
 * The rules `summariseSidebarColumn` applies to the print sidebar column,
 * demonstrated on synthetic columns. Collected by `pnpm test:parity` only:
 * `playwright.config.ts` ignores `e2e/parity`, and the visual suite reads
 * `e2e/visual`.
 *
 * The first shape is what a real two-page professional print produced: the
 * sidebar fill ends mid-page, one anti-aliased row blends it into paper, and
 * paper follows. That single row must not read as a second colour, and nothing
 * that is actually painted — a band of any height, a colour that is not a blend
 * of its neighbours, paper inside the document — may be excused as an edge.
 */

const SIDEBAR = '#1E7A4C'
const PAPER = '#FFFFFF'
const BAND = convertCssColour('oklch(0.25 0.05 240)').hex
const EDGE = '#8EBCA5'

const opaque = (hex: string) => ({ hex, alpha: 255 })

/** Page 1 fully covered; page 2 as given, with the last text baseline at 234.6pt. */
const column = (secondPage: ColumnPage['runs'], lastTextPt = 234.6) =>
  summariseSidebarColumn(
    [
      { height: 792, runs: [{ hex: SIDEBAR, from: 0, to: 791 }] },
      { height: 792, runs: secondPage },
    ],
    lastTextPt,
  )

test('the measured edge pixel is a blend of the sidebar fill and paper, not the globals.css band', () => {
  expect(BAND).toBe('#062437')
  expect(coloursAgree(opaque(EDGE), opaque(BAND))).toBe(false)
  expect(isBlendOf(opaque(EDGE), opaque(SIDEBAR), opaque(PAPER))).toBe(true)
  expect(isBlendOf(opaque(EDGE), opaque(SIDEBAR), opaque(BAND))).toBe(false)
})

const CASES: { name: string; runs: ColumnPage['runs']; lastTextPt?: number; colours: string[] }[] = [
  {
    name: 'a one-row blend between the fill and paper is an edge',
    runs: [
      { hex: SIDEBAR, from: 0, to: 255 },
      { hex: EDGE, from: 256, to: 256 },
      { hex: PAPER, from: 257, to: 791 },
    ],
    colours: [SIDEBAR],
  },
  {
    name: 'a band painted below the document counts',
    runs: [
      { hex: SIDEBAR, from: 0, to: 255 },
      { hex: BAND, from: 256, to: 295 },
      { hex: PAPER, from: 296, to: 791 },
    ],
    colours: [SIDEBAR, BAND],
  },
  {
    name: 'a blended colour two rows tall is painted, not an edge',
    runs: [
      { hex: SIDEBAR, from: 0, to: 255 },
      { hex: EDGE, from: 256, to: 257 },
      { hex: PAPER, from: 258, to: 791 },
    ],
    colours: [SIDEBAR, EDGE],
  },
  {
    name: 'a one-row colour that is not a blend of its neighbours counts',
    runs: [
      { hex: SIDEBAR, from: 0, to: 255 },
      { hex: '#FF0000', from: 256, to: 256 },
      { hex: PAPER, from: 257, to: 791 },
    ],
    colours: [SIDEBAR, '#FF0000'],
  },
  {
    name: 'a one-row band inside the sidebar fill counts',
    runs: [
      { hex: SIDEBAR, from: 0, to: 100 },
      { hex: BAND, from: 101, to: 101 },
      { hex: SIDEBAR, from: 102, to: 255 },
      { hex: PAPER, from: 256, to: 791 },
    ],
    colours: [SIDEBAR, BAND],
  },
  {
    name: 'paper inside the document counts',
    lastTextPt: 600,
    runs: [
      { hex: SIDEBAR, from: 0, to: 255 },
      { hex: PAPER, from: 256, to: 791 },
    ],
    colours: [SIDEBAR, PAPER],
  },
]

for (const c of CASES) {
  test(`sidebar column: ${c.name}`, () => {
    const reading = column(c.runs, c.lastTextPt)
    expect(reading.rowsRead).toBe(792 * 2)
    expect(reading.colours.map((colour) => colour.hex)).toEqual(c.colours)
  })
}
