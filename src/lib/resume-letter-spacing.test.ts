import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResumeTemplate } from '@/types/database'
import { PREVIEW_TRACKING, TAILWIND_TRACKING, type TailwindTrackingUtility } from './resume-letter-spacing'

/**
 * Part 3 US-005: the letter spacing the DOCX generators write may not drift
 * from the CSS and templates the Preview draws with.
 *
 * - The Tailwind `tracking-*` values a module cannot import are read from
 *   `tailwindcss/theme.css` here and compared.
 * - Nothing else may give resume text a letter spacing behind the templates'
 *   back: Tailwind's `--text-*` sizes carry no tracking, its preflight sets
 *   `letter-spacing` only on form controls, and `globals.css` declares none.
 *   So an element absent from `PREVIEW_TRACKING` draws `normal`, which is 0.
 * - Modern's letter spacing is imported by its template; this test fails if
 *   the template gives `letterSpacing` any value other than one of those
 *   constants, which would be a second copy.
 * - Every `tracking-*` utility any template uses, arbitrary values
 *   (`tracking-[0.2em]`) included, must be one this module declares FOR THAT
 *   TEMPLATE, so a template cannot start drawing at a letter spacing the
 *   generators do not know.
 *
 * Not covered: WHICH element uses which value. Moving minimal's
 * `tracking-widest` from its headings to its title passes here, because the
 * value is still one the module declares for minimal. The title, headings and
 * every other spaced run are pinned per element by
 * `docx-letter-spacing.test.ts`, and the sampled elements are compared with the
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

/** A theme letter spacing, in em: `--tracking-wide: 0.025em`. */
function themeTracking(utility: TailwindTrackingUtility): number {
  const match = new RegExp(`--${utility}:\\s*(-?[\\d.]+)em;`).exec(tailwindTheme)
  if (!match) throw new Error(`tailwindcss/theme.css declares no --${utility} in em`)
  return Number(match[1])
}

describe('letter spacing read from CSS', () => {
  it.each(Object.entries(TAILWIND_TRACKING))('%s equals tailwindcss/theme.css', (utility, em) => {
    expect(em).toBe(themeTracking(utility as TailwindTrackingUtility))
  })

  it('no Tailwind text size carries a letter spacing of its own', () => {
    expect(tailwindTheme.match(/--text-[\w-]*--letter-spacing/g) ?? []).toEqual([])
  })

  it('preflight sets letter-spacing on form controls only, so document text inherits none', () => {
    const declarations = [...tailwindPreflight.matchAll(/letter-spacing:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(declarations.length).toBeGreaterThan(0)
    for (const value of declarations) expect(value).toBe('inherit')
  })

  it('globals.css declares no letter-spacing', () => {
    expect(globals).not.toMatch(/letter-spacing/)
  })
})

describe('the templates draw with these letter spacings and no others', () => {
  it('modern gives letterSpacing only the constants it imports', () => {
    const source = template('modern')
    expect(source).toMatch(/const TRACKING = PREVIEW_TRACKING\.modern/)
    // To the end of the line, less a trailing comma: a template literal holds braces of its own.
    const values = [...source.matchAll(/letterSpacing\s*[:=]\s*([^\n]+)/g)].map((m) => m[1].trim().replace(/,$/, ''))
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      expect(value, 'an inline letter spacing that is not one of the module constants').toMatch(
        /^`\$\{TRACKING\.(name|jobTitleBar|sectionHeading|contactLabel|skillCategory)\}em`$/,
      )
    }
    for (const key of Object.keys(PREVIEW_TRACKING.modern)) {
      // jobTitleBar is a utility class, not an inline style; the others are inline.
      if (key === 'jobTitleBar') continue
      expect(source, `modern uses TRACKING.${key}`).toContain(`TRACKING.${key}`)
    }
  })

  it.each(['professional', 'classic', 'minimal', 'creative'] as const)('%s writes no letter spacing inline', (name) => {
    expect(template(name)).not.toMatch(/letterSpacing/)
  })

  it.each(TEMPLATES)('%s uses only tracking utilities this module declares for it', (name) => {
    const declared: readonly number[] = Object.values(PREVIEW_TRACKING[name])
    // Any tracking utility, arbitrary values included: `tracking-wide`, `tracking-[0.2em]`.
    const used = new Set(
      [...template(name).matchAll(/(?<![\w-])(tracking-(?:\[[^\]]*\]|\([^)]*\)|[\w-]+))/g)].map((m) => m[1]),
    )
    expect(used.size, `${name} uses no tracking utility`).toBeGreaterThan(0)
    for (const utility of used) {
      expect(Object.keys(TAILWIND_TRACKING), utility).toContain(utility)
      expect(declared, `${utility} is not a letter spacing ${name} declares`).toContain(
        TAILWIND_TRACKING[utility as TailwindTrackingUtility],
      )
    }
  })
})

describe('the values themselves', () => {
  it('are the ems each template draws', () => {
    expect(PREVIEW_TRACKING).toEqual({
      professional: { title: -0.025, heading: 0.025 },
      modern: { name: 0.15, jobTitleBar: 0.025, sectionHeading: 0.08, contactLabel: 0.05, skillCategory: 0.03 },
      classic: { title: 0.025 },
      minimal: { title: -0.025, heading: 0.1 },
      creative: { title: -0.025 },
    })
  })
})
