import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGlobalsCss, ruleDeclarations } from '@/test/print-css'
import { SWISS_VOCATIONAL_GEOMETRY as G } from '@/lib/swiss-vocational-template'

/**
 * The print and alignment rules `swiss-vocational-template.tsx` was fixed to
 * hold (swiss-cv-templates US-001 review), pinned in its source.
 *
 * Source-level, as `resume-page-size.test.ts` pins the template's page width:
 * a page break and a text alignment are only observable in a browser's print,
 * which the unit suite does not have, and the PDF and visual suites only see
 * them for the fixtures they render. Each assertion names the rule it holds.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-vocational-template.tsx'),
  'utf8',
)

/** The body of the `case '<id>':` branch of the section switch, up to the next case. */
function sectionCase(id: string): string {
  const start = SOURCE.indexOf(`case '${id}': {`)
  if (start < 0) throw new Error(`No case '${id}' in the template`)
  const next = SOURCE.indexOf('\n      case ', start + 1)
  return SOURCE.slice(start, next < 0 ? undefined : next)
}

describe('swissVocational keeps its sections together on a printed page', () => {
  it('keeps each dated entry on one page when it fits', () => {
    expect(SOURCE).toMatch(/const datedRow = [\s\S]*?className="grid break-inside-avoid"/)
  })

  it('keeps each entry heading with its first entry, in one unbreakable block', () => {
    const helper = /const entrySection = [\s\S]*?<\/section>\n {2}\)/.exec(SOURCE)?.[0]
    expect(helper).toBeDefined()
    expect(helper).toMatch(/<div className="break-inside-avoid">\s*\{heading\(label\)\}\s*\{entries\[0\]\}\s*<\/div>\s*\{entries\.slice\(1\)\}/)
    for (const id of ['experience', 'education', 'training']) {
      expect(sectionCase(id), id).toContain(`entrySection(\n            swissHeading(dict, '${id}'),`)
      expect(sectionCase(id), id).not.toContain('{heading(')
    }
  })

  it('keeps the summary, the skills and the languages each in one unbreakable block', () => {
    expect(sectionCase('summary')).toMatch(/<section className="break-inside-avoid">\s*\{heading\(swissHeading\(dict, 'summary'\)\)\}/)
    const block = sectionCase('skillsAndLanguages')
    expect(block).toMatch(/<section className="break-inside-avoid">\s*\{heading\(swissHeading\(dict, 'skills'\)\)\}/)
    expect(block).toMatch(/<section className="break-inside-avoid">\s*\{heading\(swissHeading\(dict, 'languages'\)\)\}/)
  })
})

describe('swissVocational aligns its text as the mockup and the Word export do', () => {
  it('draws achievements, descriptions and skills ragged-right', () => {
    expect(sectionCase('experience')).toContain('renderFormattedText(achievement, { justify: false })')
    expect(sectionCase('experience')).toContain('renderFormattedText(exp.description, { justify: false })')
    expect(sectionCase('education')).toContain('renderFormattedText(edu.description, { justify: false })')
    expect(sectionCase('skillsAndLanguages')).toContain('renderFormattedText(skill.content.html, { justify: false })')
  })

  it('keeps the summary justified', () => {
    const summary = sectionCase('summary')
    expect(summary).toContain('className="text-justify text-slate-700"')
    expect(summary).toContain('renderFormattedText(resume.summary)')
  })

  it('justifies nothing else: every other rich-text call opts out', () => {
    const calls = [...SOURCE.matchAll(/renderFormattedText\(([^)]*)\)/g)].map(([, args]) => args)
    expect(calls.filter((args) => !args.includes('justify: false'))).toEqual(['resume.summary'])
  })
})

describe('swissVocational prints a top and a foot margin on every page (swiss-templates-only-page-fidelity US-002)', () => {
  const css = readGlobalsCss()

  it('repeats SWISS_VOCATIONAL_GEOMETRY.pageTop and .pageBottom as the document’s padding on every printed page, as Word’s page margins', () => {
    expect(ruleDeclarations(css.print, '.swiss-vocational-template')).toEqual([
      `padding-top: ${G.pageTop}px !important`,
      `padding-bottom: ${G.pageBottom}px !important`,
      '-webkit-box-decoration-break: clone',
      'box-decoration-break: clone',
    ])
    // No `@page` margin: Chromium paints nothing into it, and the red strip,
    // fixed to every printed page, reaches the paper's top and foot.
    expect(css.print).not.toMatch(/page:\s*swiss-vocational|@page swiss-vocational/)
    expect(SOURCE).toMatch(/className="absolute inset-y-0 left-0 bg-red-700 print:fixed /)
    // Page 1 starts where the screen draws it: the margins are the screen's padding.
    expect(G.pageTop).toBe(G.paddingY)
    expect(G.pageBottom).toBe(G.paddingY)
    expect(SOURCE).toContain('padding: `${GEOMETRY.paddingY}px ${GEOMETRY.paddingX}px`')
    // Print only.
    expect(css.screen).not.toMatch(/swiss-vocational/)
  })
})
