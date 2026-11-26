import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderFormattedText } from '@/lib/format-text'
import type { ResumeTemplate } from '@/types/database'
import { templateComponentFile } from '@/test/resume-template-files'
import { RESUME_TEMPLATES } from './resume-templates'
import {
  FORMATTED_CONTENT_LINE_HEIGHT,
  PREFLIGHT_LINE_HEIGHT,
  SWISS_COMMERCE_LINE_HEIGHT,
  SWISS_ENGINEERING_LINE_HEIGHT,
  SWISS_FINANCE_LINE_HEIGHT,
  SWISS_HEALTH_LINE_HEIGHT,
  SWISS_IT_LINE_HEIGHT,
  SWISS_EXECUTIVE_LINE_HEIGHT,
  SWISS_ACADEMIC_LINE_HEIGHT,
  SWISS_FIRST_JOB_LINE_HEIGHT,
  SWISS_TRADES_LINE_HEIGHT,
  SWISS_VOCATIONAL_LINE_HEIGHT,
  TAILWIND_LEADING,
  TAILWIND_TEXT_LINE_HEIGHT,
  formattedTextLineHeight,
  rendersAsFormattedContent,
} from './resume-line-height'

/**
 * Part 3 US-004: the line heights the DOCX generators write may not drift from
 * the CSS and templates the Preview draws with.
 *
 * - Values that come from CSS a module cannot import — Tailwind's preflight,
 *   `text-*` and `leading-*` utilities, and `globals.css`'s
 *   `.formatted-content` — are read from that CSS here and compared.
 * - Each Swiss template's line heights are imported by the template; this test
 *   fails if a template gives `lineHeight` any value other than one of its
 *   constants — a number, a string, another identifier — which would be a
 *   second copy.
 * - Every `text-*` and `leading-*` utility any template uses, arbitrary values
 *   (`leading-[1.3]`) and size/line-height modifiers (`text-sm/6`) included,
 *   must be one this module declares, so a template cannot start drawing at a
 *   line height the generators do not know.
 *
 * Not covered: WHICH element uses which value. Moving one element from
 * `compact` to `text` passes here, because the value is still one the module
 * declares. Each Swiss generator's own test pins the paragraphs it writes; any
 * other element is guarded only by review, as US-003 recorded for which element
 * a colour sits on.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf-8')

const tailwindTheme = read('node_modules/tailwindcss/theme.css')
const tailwindPreflight = read('node_modules/tailwindcss/preflight.css')
const globals = read('src/app/globals.css')

const TEMPLATES: readonly ResumeTemplate[] = RESUME_TEMPLATES
const template = (name: ResumeTemplate) => read(templateComponentFile(name))

/** A CSS number or `calc(a / b)`, as the Tailwind theme writes line heights. */
function cssNumber(value: string): number {
  const division = /^calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)$/.exec(value.trim())
  if (division) return Number(division[1]) / Number(division[2])
  const plain = Number(value.trim())
  if (Number.isNaN(plain)) throw new Error(`Not a CSS number this test reads: ${value}`)
  return plain
}

function themeVariable(name: string): number {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(tailwindTheme)
  if (!match) throw new Error(`tailwindcss/theme.css declares no ${name}`)
  return cssNumber(match[1])
}

/** The declarations of the first rule whose selector list is exactly `selector`. */
function ruleBody(css: string, selector: RegExp, label: string): string {
  const match = new RegExp(`(?:^|\\n)\\s*${selector.source}\\s*\\{([^}]*)\\}`).exec(css)
  if (!match) throw new Error(`${label} has no rule for ${selector.source}`)
  return match[1]
}

describe('line heights read from CSS', () => {
  it.each(Object.entries(TAILWIND_TEXT_LINE_HEIGHT))('%s equals tailwindcss/theme.css', (utility, value) => {
    expect(value).toBeCloseTo(themeVariable(`--${utility}--line-height`), 12)
  })

  it.each(Object.entries(TAILWIND_LEADING))('%s equals tailwindcss/theme.css', (utility, value) => {
    expect(value).toBe(themeVariable(`--${utility}`))
  })

  it('the inherited line height is preflight’s html line-height', () => {
    const html = ruleBody(tailwindPreflight, /html,\s*:host/, 'tailwindcss/preflight.css')
    expect(/line-height:\s*([\d.]+)/.exec(html)?.[1]).toBe(String(PREFLIGHT_LINE_HEIGHT))
  })

  it('the formatted-content height is globals.css’s, and every descendant inherits it', () => {
    const own = ruleBody(globals, /\.formatted-content/, 'globals.css')
    expect(/line-height:\s*([\d.]+)\s*!important/.exec(own)?.[1]).toBe(String(FORMATTED_CONTENT_LINE_HEIGHT))
    const descendants = /\.formatted-content \*,[^{]*\{([^}]*)\}/.exec(globals)?.[1] ?? ''
    expect(descendants).toMatch(/line-height:\s*inherit\s*!important/)
  })
})

describe('the templates draw with these line heights and no others', () => {
  /** Every `lineHeight` value in a style object or JSX attribute, as written, with its offset. */
  const lineHeightValues = (source: string) =>
    [...source.matchAll(/lineHeight\s*[:=]\s*([^,}\n]+)/g)].map((m) => ({ value: m[1].trim(), index: m.index ?? 0 }))

  it('swissVocational gives lineHeight only the constants it imports', () => {
    const source = template('swissVocational')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_VOCATIONAL_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_VOCATIONAL_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissCommerce gives lineHeight only the constants it imports', () => {
    const source = template('swissCommerce')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_COMMERCE_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_COMMERCE_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissTrades gives lineHeight only the constants it imports', () => {
    const source = template('swissTrades')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_TRADES_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_TRADES_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissHealth gives lineHeight only the constants it imports', () => {
    const source = template('swissHealth')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_HEALTH_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_HEALTH_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissFinance gives lineHeight only the constants it imports', () => {
    const source = template('swissFinance')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_FINANCE_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_FINANCE_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissEngineering gives lineHeight only the constants it imports', () => {
    const source = template('swissEngineering')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_ENGINEERING_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_ENGINEERING_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissIt gives lineHeight only the constants it imports', () => {
    const source = template('swissIt')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_IT_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_IT_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissExecutive gives lineHeight only the constants it imports', () => {
    const source = template('swissExecutive')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_EXECUTIVE_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_EXECUTIVE_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissAcademic gives lineHeight only the constants it imports', () => {
    const source = template('swissAcademic')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_ACADEMIC_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_ACADEMIC_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it('swissFirstJob gives lineHeight only the constants it imports', () => {
    const source = template('swissFirstJob')
    expect(source).toMatch(/const LINE_HEIGHT = SWISS_FIRST_JOB_LINE_HEIGHT/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(value).toMatch(/^LINE_HEIGHT\.(name|compact|text)$/)
    for (const key of ['name', 'compact', 'text']) expect(source).toContain(`LINE_HEIGHT.${key}`)
    expect(SWISS_FIRST_JOB_LINE_HEIGHT).toEqual({ name: 1.15, compact: 1.4, text: 1.5 })
  })

  it.each(TEMPLATES)('%s uses only text-* and leading-* utilities this module declares', (name) => {
    const source = template(name)
    const sizes = new Set([...source.matchAll(/(?<![\w-])(text-(?:xs|sm|base|lg|xl|[2-9]xl))(?![\w-])/g)].map((m) => m[1]))
    // Any leading utility, arbitrary values included: `leading-relaxed`, `leading-[1.3]`, `leading-(--x)`.
    const leadings = new Set([...source.matchAll(/(?<![\w-])(leading-(?:\[[^\]]*\]|\([^)]*\)|[\w-]+))/g)].map((m) => m[1]))
    for (const size of sizes) expect(Object.keys(TAILWIND_TEXT_LINE_HEIGHT), size).toContain(size)
    for (const leading of leadings) expect(Object.keys(TAILWIND_LEADING), leading).toContain(leading)
    // A size utility with a line-height modifier (`text-sm/6`, `text-[13px]/[1.3]`) sets its own line
    // height. A colour's opacity modifier (`text-white/80`) is not a size and is not matched.
    const sizeWithLeading = /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl|\[[^\]]*\])\/[\w[\].()-]+/g
    expect(source.match(sizeWithLeading) ?? [], 'text-*/<line-height> modifiers').toEqual([])
  })
})

describe('formatted content', () => {
  const HTML = ['<p>Shipped</p>', 'A <strong>bold</strong> claim', '<ul><li>One</li></ul>']
  // "a < b" alone is not a tag; "a < b and c > d" would be, to both surfaces.
  const PLAIN = ['Shipped the pipeline', '- one\n- two', 'a < b', '']

  it('renderFormattedText renders exactly the texts this module calls formatted into .formatted-content', () => {
    for (const text of [...HTML, ...PLAIN]) {
      const rendered = renderFormattedText(text)
      const inFormattedContent =
        isValidElement<{ className?: string }>(rendered) && rendered.props.className === 'formatted-content'
      expect(inFormattedContent, JSON.stringify(text)).toBe(text !== '' && rendersAsFormattedContent(text))
    }
  })

  it('formatted text draws at the formatted-content height, plain text at its element’s', () => {
    for (const text of HTML) expect(formattedTextLineHeight(text, 1.35)).toBe(FORMATTED_CONTENT_LINE_HEIGHT)
    for (const text of PLAIN) expect(formattedTextLineHeight(text, 1.35)).toBe(1.35)
    expect(formattedTextLineHeight(null, 1.5)).toBe(1.5)
  })
})
