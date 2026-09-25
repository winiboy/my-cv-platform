import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RESUME_LAYOUT } from './layout-settings'
import {
  PAGE_HEIGHT_CSS,
  PAGE_HEIGHT_INCHES,
  PAGE_HEIGHT_MM,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_CSS,
  PAGE_WIDTH_INCHES,
  PAGE_WIDTH_MM,
  PAGE_WIDTH_PX,
} from './resume-page-size'

/**
 * Part 3 US-008 put the page in one module. Two things can still drift away
 * from it, and this file is what catches them:
 *
 * - The rounded units. Inches and CSS px are each a rounding of the
 *   millimetre definition, so each is bounded against it here rather than
 *   trusted as a second declaration of the page.
 * - The CSS. `globals.css` declares the print page size and draws
 *   professional's print sidebar in px measured from the page edge, and a
 *   stylesheet cannot import a TypeScript module. The same arrangement guards
 *   the line heights that live only in CSS (`resume-line-height.test.ts`).
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf-8')

const globals = read('src/app/globals.css')
const MM_PER_INCH = 25.4
const CSS_PX_PER_INCH = 96

describe('the units are one page written three ways', () => {
  it('A4 is 210 × 297 mm', () => {
    expect([PAGE_WIDTH_MM, PAGE_HEIGHT_MM]).toEqual([210, 297])
  })

  it('the inches are the millimetres, to the two decimals a DOCX section declares', () => {
    expect(PAGE_WIDTH_INCHES).toBeCloseTo(PAGE_WIDTH_MM / MM_PER_INCH, 2)
    expect(PAGE_HEIGHT_INCHES).toBeCloseTo(PAGE_HEIGHT_MM / MM_PER_INCH, 2)
  })

  it('the CSS px are the millimetres at 96 dpi, to whole px', () => {
    const px = (mm: number) => (mm / MM_PER_INCH) * CSS_PX_PER_INCH
    expect(Math.abs(PAGE_WIDTH_PX - px(PAGE_WIDTH_MM))).toBeLessThanOrEqual(0.5)
    expect(Math.abs(PAGE_HEIGHT_PX - px(PAGE_HEIGHT_MM))).toBeLessThanOrEqual(0.5)
  })

  it('the CSS lengths are those px', () => {
    expect([PAGE_WIDTH_CSS, PAGE_HEIGHT_CSS]).toEqual([`${PAGE_WIDTH_PX}px`, `${PAGE_HEIGHT_PX}px`])
  })

  it('the width rounds to the 8.27in the parity check reads off all three surfaces', () => {
    expect((PAGE_WIDTH_PX / CSS_PX_PER_INCH).toFixed(2)).toBe(PAGE_WIDTH_INCHES.toFixed(2))
  })
})

describe('globals.css prints the same page', () => {
  const printBlock = /@media print\s*\{([\s\S]*)\n\}/.exec(globals)?.[1]

  it('@page is A4 portrait', () => {
    expect(printBlock).toBeDefined()
    const size = /@page\s*\{[\s\S]*?size:\s*([^;]+);/.exec(printBlock ?? '')?.[1].trim()
    expect(size).toBe('A4 portrait')
  })

  it('the professional print sidebar is drawn from the edges of that page', () => {
    // The gradient paints the sidebar band the template's own background cannot
    // reach in print: from the page's left edge, across the default sidebar
    // share of the page width.
    const offsets = [...(printBlock ?? '').matchAll(/calc\(50% - ([\d.]+)px(?: \+ ([\d.]+)px)?\)/g)]
    expect(offsets.length).toBeGreaterThan(0)
    const bandStart = PAGE_WIDTH_PX / 2
    const bandWidth = PAGE_WIDTH_PX * (DEFAULT_RESUME_LAYOUT.sidebarWidth / 100)
    for (const [, half, width] of offsets) {
      expect(Number(half)).toBeCloseTo(bandStart, 0)
      if (width !== undefined) expect(Number(width)).toBeCloseTo(bandWidth, 0)
    }
  })
})

describe('no surface keeps a page of its own', () => {
  const TEMPLATES = ['professional', 'modern', 'classic', 'minimal', 'creative'] as const

  it.each(TEMPLATES)('%s-template.tsx pins the shared width', (name) => {
    const source = read(`src/components/dashboard/resume-templates/${name}-template.tsx`)
    expect(source).toMatch(/width: PAGE_WIDTH_CSS/)
    expect(source).not.toMatch(/816px|8\.5in|1056px/)
  })

  it.each(TEMPLATES)('docx-%s.ts declares the shared page size', (name) => {
    const source = read(`src/app/api/resumes/[id]/download-docx/docx-${name}.ts`)
    expect(source).toMatch(/convertInchesToTwip\(PAGE_WIDTH_INCHES\)/)
    expect(source).toMatch(/convertInchesToTwip\(PAGE_HEIGHT_INCHES\)/)
    expect(source).not.toMatch(/convertInchesToTwip\((?:8\.5|11|8\.27|11\.69)\)/)
  })

  it('the editor scales the preview against the shared width', () => {
    const source = read('src/components/dashboard/resume-editor.tsx')
    expect(source).not.toMatch(/816/)
  })
})
