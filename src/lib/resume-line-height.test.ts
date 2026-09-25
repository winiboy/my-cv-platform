import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderFormattedText } from '@/lib/format-text'
import type { ResumeTemplate } from '@/types/database'
import {
  CREATIVE_HEADING_BAR_STEP,
  FORMATTED_CONTENT_LINE_HEIGHT,
  MODERN_LINE_HEIGHT,
  MODERN_TITLE_BAR_PADDING_Y_PX,
  TAILWIND_SPACING_PX,
  tailwindHeightPx,
  PREFLIGHT_LINE_HEIGHT,
  PROFESSIONAL_LINE_HEIGHT,
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
 * - Professional's and modern's line heights are imported by their templates;
 *   this test fails if either template gives `lineHeight` any value other than
 *   one of those constants — a number, a string, another identifier — which
 *   would be a second copy. (Modern's Remove BG button, an editor control that
 *   is never part of the document, is the one pinned exception.)
 * - Classic, minimal and creative set no `lineHeight` at all, and every `text-*`
 *   and `leading-*` utility any template uses, arbitrary values (`leading-[1.3]`)
 *   and size/line-height modifiers (`text-sm/6`) included, must be one this
 *   module declares, so a template cannot start drawing at a line height the
 *   generators do not know.
 * - The spacing unit behind creative's heading bars is read from Tailwind's
 *   theme, and the bars' `h-6` / `h-8` are counted in the template.
 *
 * Not covered: WHICH element uses which value. Moving one of modern's elements
 * from `compact` to `text`, or giving a classic element a `leading-relaxed` it
 * did not have, passes here, because the value is still one the module
 * declares. The title, headings and body text are pinned per element by
 * `docx-line-spacing.test.ts`, and the sampled elements are compared with the
 * browser's computed style by `pnpm test:parity`; any other element is guarded
 * only by review, as US-003 recorded for which element a colour sits on.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf-8')

const tailwindTheme = read('node_modules/tailwindcss/theme.css')
const tailwindPreflight = read('node_modules/tailwindcss/preflight.css')
const globals = read('src/app/globals.css')

const TEMPLATES: readonly ResumeTemplate[] = ['professional', 'modern', 'classic', 'minimal', 'creative']
const template = (name: ResumeTemplate) => read(`src/components/dashboard/resume-templates/${name}-template.tsx`)

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

/** A theme length in CSS px at the 16px root: `0.25rem` → 4. */
function themeLength(name: string): number {
  const match = new RegExp(`${name}:\\s*([\\d.]+)(rem|px);`).exec(tailwindTheme)
  if (!match) throw new Error(`tailwindcss/theme.css declares no ${name} in rem or px`)
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1)
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

  it('professional gives lineHeight only the constants it imports', () => {
    const source = template('professional')
    expect(source).toMatch(/const BODY_LINE_HEIGHT = PROFESSIONAL_LINE_HEIGHT\.body/)
    expect(source).toMatch(/const HEADING_LINE_HEIGHT = PROFESSIONAL_LINE_HEIGHT\.heading/)
    const values = lineHeightValues(source)
    expect(values.length).toBeGreaterThan(0)
    for (const { value } of values) expect(['BODY_LINE_HEIGHT', 'HEADING_LINE_HEIGHT'], value).toContain(value)
    expect(PROFESSIONAL_LINE_HEIGHT).toEqual({ heading: 1.2, body: 1.35 })
  })

  it('modern gives lineHeight only the constants it imports, bar one editor control', () => {
    const source = template('modern')
    const values = lineHeightValues(source)
    const others = values.filter(({ value }) => !/^MODERN_LINE_HEIGHT\.(title|compact|text)$/.test(value))
    expect(others.map((o) => o.value)).toEqual(['1.4'])
    // The Remove BG button: print:hidden, never part of the document.
    const button = source.slice(source.lastIndexOf('<button', others[0].index), others[0].index)
    expect(button).toMatch(/aria-label="Remove photo background"/)
    expect(button).toMatch(/print:hidden/)
    for (const key of ['title', 'compact', 'text']) expect(source).toContain(`MODERN_LINE_HEIGHT.${key}`)
    expect(MODERN_LINE_HEIGHT).toEqual({ title: 1.2, compact: 1.4, text: 1.5 })
  })

  it('modern draws its job-title bar with the padding the DOCX adds to its line', () => {
    expect(template('modern')).toMatch(/padding: `\$\{MODERN_TITLE_BAR_PADDING_Y_PX\}px 12px`/)
    expect(MODERN_TITLE_BAR_PADDING_Y_PX).toBe(4)
  })

  it.each(['classic', 'minimal', 'creative'] as const)('%s writes no line height inline', (name) => {
    expect(template(name)).not.toMatch(/lineHeight/)
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

  it('creative’s heading bars are the h-6 and h-8 the DOCX row heights take', () => {
    expect(themeLength('--spacing')).toBe(TAILWIND_SPACING_PX)
    const source = template('creative')
    const bars = (step: number) =>
      source.match(new RegExp(`<h2 [^>]*>\\s*<div className="h-${step.toString().replace('.', '\\.')} w-[\\d.]+ bg-gradient-to-b`, 'g')) ?? []
    expect(bars(CREATIVE_HEADING_BAR_STEP.sidebar), 'left-column heading bars').toHaveLength(3)
    expect(bars(CREATIVE_HEADING_BAR_STEP.main), 'right-column heading bars').toHaveLength(3)
    expect(tailwindHeightPx(CREATIVE_HEADING_BAR_STEP.sidebar)).toBe(24)
    expect(tailwindHeightPx(CREATIVE_HEADING_BAR_STEP.main)).toBe(32)
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
