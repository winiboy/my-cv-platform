import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { templateComponentFile, templateDocxFile } from '@/test/resume-template-files'
import { RESUME_TEMPLATES } from './resume-templates'
import {
  PAGE_HEIGHT_CSS,
  PAGE_HEIGHT_INCHES,
  PAGE_HEIGHT_MM,
  PAGE_HEIGHT_PX,
  PAGE_HEIGHT_TWIPS,
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
 * - The CSS. `globals.css` declares the print page size and draws the Swiss
 *   templates' print columns in px measured from the page edge, and a
 *   stylesheet cannot import a TypeScript module. The same arrangement guards
 *   the line heights that live only in CSS (`resume-line-height.test.ts`).
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf-8')

const globals = read('src/app/globals.css')
const MM_PER_INCH = 25.4
const CSS_PX_PER_INCH = 96
const TWIPS_PER_INCH = 1440

describe('the units are one page written four ways', () => {
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

  it('the twips height is the millimetres, to the whole twip', () => {
    const twips = (PAGE_HEIGHT_MM / MM_PER_INCH) * TWIPS_PER_INCH
    expect(Number.isInteger(PAGE_HEIGHT_TWIPS)).toBe(true)
    expect(Math.abs(PAGE_HEIGHT_TWIPS - twips)).toBeLessThanOrEqual(0.5)
  })

  it('the CSS lengths are those px', () => {
    expect([PAGE_WIDTH_CSS, PAGE_HEIGHT_CSS]).toEqual([`${PAGE_WIDTH_PX}px`, `${PAGE_HEIGHT_PX}px`])
  })

  it('the width rounds to the 8.27in a DOCX section declares', () => {
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

  it('every print column is drawn from the left edge of that page, inside its width', () => {
    // A solid layer paints the column the template's own background cannot
    // reach in print: `max(<from>px, 50% ± <n>px) 0 / <width>px 100%`, `from`
    // px into the centred document of PAGE_WIDTH_PX. A background position's
    // 50% is half of the canvas less the layer's width, so the document's
    // left edge, half the canvas less half PAGE_WIDTH_PX, is reached by adding
    // half the layer's width back: n = from + width / 2 - PAGE_WIDTH_PX / 2.
    const layers = [...(printBlock ?? '').matchAll(/max\((\d+)px, 50% ([+-]) (\d+)px\) 0 \/ (\d+)px 100% repeat-y/g)]
    expect(layers.length).toBeGreaterThan(0)
    for (const [, from, sign, n, width] of layers) {
      expect((sign === '-' ? -1 : 1) * Number(n)).toBe(Number(from) + Number(width) / 2 - PAGE_WIDTH_PX / 2)
      expect(Number(from) + Number(width)).toBeLessThanOrEqual(PAGE_WIDTH_PX)
    }
  })
})

describe('no surface keeps a page of its own', () => {
  const TEMPLATES = RESUME_TEMPLATES

  it('swissVocational prints its accent strip from the edge of a document PAGE_WIDTH_PX wide', () => {
    // Tailwind reads class names statically, so the half width is written out
    // in the class; this holds it to the shared width.
    const source = read(templateComponentFile('swissVocational'))
    expect(source).toContain(`print:left-[max(0px,calc(50%-${PAGE_WIDTH_PX / 2}px))]`)
    expect(source.match(/calc\(50%-\d+px\)/g)).toEqual([`calc(50%-${PAGE_WIDTH_PX / 2}px)`])
  })

  it.each(TEMPLATES)('the %s template pins the shared width', (name) => {
    const source = read(templateComponentFile(name))
    expect(source).toMatch(/width: PAGE_WIDTH_CSS/)
    expect(source).not.toMatch(/816px|8\.5in|1056px/)
  })

  // The only ways a DOCX section may write each dimension: a value this module
  // exports, used as-is or through one local const.
  const SHARED_PAGE_SIZE = {
    width: ['convertInchesToTwip(PAGE_WIDTH_INCHES)'],
    height: ['convertInchesToTwip(PAGE_HEIGHT_INCHES)', 'PAGE_HEIGHT_TWIPS'],
  }

  /** Each `size: { width, height }` a section declares, local consts resolved. */
  const declaredPageSizes = (source: string) =>
    [...source.matchAll(/size:\s*\{\s*width:\s*([^,\n]+),\s*height:\s*([^,\n]+),/g)].map((m) => {
      const resolve = (expression: string) => {
        const trimmed = expression.trim()
        const local = new RegExp(`const ${trimmed} = ([^\\n]+)`).exec(source)
        return /^\w+$/.test(trimmed) && local ? local[1].trim() : trimmed
      }
      return { width: resolve(m[1]), height: resolve(m[2]) }
    })

  it.each(TEMPLATES)('the %s Word generator declares the shared page size', (name) => {
    const source = read(templateDocxFile(name))
    const sizes = declaredPageSizes(source)
    expect(sizes.length).toBeGreaterThan(0)
    for (const { width, height } of sizes) {
      expect(SHARED_PAGE_SIZE.width).toContain(width)
      expect(SHARED_PAGE_SIZE.height).toContain(height)
    }
    // The names it declares with are this module's, not local look-alikes.
    const imported = /import \{([^}]*)\} from '@\/lib\/resume-page-size'/.exec(source)?.[1] ?? ''
    for (const used of new Set(sizes.flatMap((s) => [s.width, s.height]).map((e) => /PAGE_\w+/.exec(e)?.[0]))) {
      expect(imported.split(',').map((n) => n.trim())).toContain(used)
    }
    expect(source).not.toMatch(/const PAGE_\w+\s*=/)
    expect(source).not.toMatch(/convertInchesToTwip\((?:8\.5|11|8\.27|11\.69)\)/)
    expect(source).not.toMatch(/\b(?:11906|11908|12240|15840|16833|16838)\b/)
  })

  it('the editor scales the preview against the shared width', () => {
    const source = read('src/components/dashboard/resume-editor.tsx')
    expect(source).not.toMatch(/816/)
  })
})
