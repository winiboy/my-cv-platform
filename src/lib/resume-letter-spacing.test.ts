import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResumeTemplate } from '@/types/database'
import { templateComponentFile } from '@/test/resume-template-files'
import { RESUME_TEMPLATES } from './resume-templates'
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
 * - A letter spacing a template writes inline is imported by the template;
 *   this test fails if the template gives `letterSpacing` any value other than
 *   one of those constants, which would be a second copy.
 * - Every `tracking-*` utility any template uses, arbitrary values
 *   (`tracking-[0.2em]`) included, must be one this module declares FOR THAT
 *   TEMPLATE, so a template cannot start drawing at a letter spacing the
 *   generators do not know.
 *
 * Not covered: WHICH element uses which value. Moving swissFinance's
 * `tracking-widest` from its name to another element passes here, because the
 * value is still one the module declares for swissFinance. Each Swiss
 * generator's own test pins the runs it writes; any other element is guarded
 * only by review, as US-003 recorded for which element a colour sits on.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf-8')

const tailwindTheme = read('node_modules/tailwindcss/theme.css')
const tailwindPreflight = read('node_modules/tailwindcss/preflight.css')
const globals = read('src/app/globals.css')

const TEMPLATES: readonly ResumeTemplate[] = RESUME_TEMPLATES
const template = (name: ResumeTemplate) => read(templateComponentFile(name))

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
  it.each(['swissVocational', 'swissCommerce', 'swissTrades', 'swissHealth', 'swissIt'] as const)('%s writes no letter spacing inline', (name) => {
    expect(template(name)).not.toMatch(/letterSpacing/)
  })

  it('swissFinance gives letterSpacing only the heading constant it imports', () => {
    const source = template('swissFinance')
    expect(source).toMatch(/const TRACKING = PREVIEW_TRACKING\.swissFinance/)
    const values = [...source.matchAll(/letterSpacing\s*[:=]\s*([^\n]+)/g)].map((m) => m[1].trim().replace(/,$/, ''))
    expect(values).toEqual(['`${TRACKING.heading}em`'])
    // The name's spacing is the `tracking-widest` utility, read by the test below.
    expect(source).toContain('uppercase tracking-widest')
  })

  it.each(TEMPLATES)('%s uses only tracking utilities this module declares for it', (name) => {
    const declared: readonly number[] = Object.values(PREVIEW_TRACKING[name])
    // Any tracking utility, arbitrary values included: `tracking-wide`, `tracking-[0.2em]`.
    const used = new Set(
      [...template(name).matchAll(/(?<![\w-])(tracking-(?:\[[^\]]*\]|\([^)]*\)|[\w-]+))/g)].map((m) => m[1]),
    )
    if (declared.length === 0) {
      // A template that declares no letter spacing draws none.
      expect([...used], `${name} declares no letter spacing`).toEqual([])
      return
    }
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
      swissVocational: { caps: 0.1 },
      swissCommerce: { caps: 0.1 },
      swissTrades: { caps: 0.1 },
      swissHealth: { caps: 0.1 },
      swissFinance: { name: 0.1, heading: 0.25 },
      swissEngineering: { caps: 0.1 },
      swissIt: {},
      swissExecutive: { caps: 0.1 },
      swissAcademic: { caps: 0.1 },
      swissFirstJob: { caps: 0.1 },
    })
  })
})
