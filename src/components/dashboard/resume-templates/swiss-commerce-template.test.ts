import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import type { Resume } from '@/types/database'
import { SWISS_COMMERCE_GEOMETRY } from '@/lib/swiss-commerce-template'
import { SwissCommerceTemplate } from './swiss-commerce-template'

/**
 * `swiss-commerce-template.tsx`: the server render the Preview and the PDF
 * depend on (FR-9), and the print and layout rules pinned in its source, as
 * `swiss-vocational-template.test.ts` pins its own. A page break, a wrap or an
 * alignment is only observable in a browser's print; each assertion names the
 * rule it holds.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-commerce-template.tsx'),
  'utf8',
)

/** The body of the `case '<id>':` branch of the section switch, up to the next case. */
function sectionCase(id: string): string {
  const start = SOURCE.indexOf(`case '${id}': {`)
  if (start < 0) throw new Error(`No case '${id}' in the template`)
  const next = SOURCE.indexOf('\n      case ', start + 1)
  return SOURCE.slice(start, next < 0 ? undefined : next)
}

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Ledger steward',
    template: 'swissCommerce',
    contact: { name: 'Morgan Aldervane', email: 'morgan@aldervane.test', location: 'Brightwater' },
    summary: '<p>Steward of <strong>ledgers</strong>.</p>',
    experience: [
      {
        company: 'Copperline',
        position: 'Steward',
        startDate: '2019-01',
        current: true,
        achievements: ['<p>Balanced the ledgers.</p>'],
        visible: true,
      },
    ],
    education: [{ school: 'Aldervane College', degree: 'Diploma', startDate: '2020-09', endDate: '2021-06', description: '<p>Honours.</p>', visible: true }],
    skills: [{ category: 'Office', items: [], skillsHtml: '<p>Spreadsheets</p>', visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    certifications: [{ name: 'Project basics', issuer: 'Guild', date: '2023-05', visible: true }],
    projects: [],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

describe('swissCommerce renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = renderToString(createElement(SwissCommerceTemplate, { resume: resume(), locale: 'fr', dict: fr }))
    expect(html).toContain('Morgan Aldervane')
    expect(html).toContain('Office:')
    expect(html).toContain(`Esperanto — ${fr.resumes.editor.levels.native}`)
    // The stored markup is never printed as text.
    expect(html).not.toContain('&lt;p&gt;')
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading at all for a CV with no content', () => {
    const empty = resume({ summary: '', experience: [], education: [], skills: [], languages: [], certifications: [] })
    const html = renderToString(createElement(SwissCommerceTemplate, { resume: empty, locale: 'en', dict: en }))
    expect(html).not.toContain('<h2')
  })
})

describe('swissCommerce keeps its sections together on a printed page', () => {
  it('keeps each dated entry on one page when it fits', () => {
    expect(SOURCE).toMatch(/const datedRow = [\s\S]*?className="grid break-inside-avoid"/)
  })

  it('keeps each entry heading with its first entry', () => {
    for (const id of ['experience', 'education', 'training']) {
      expect(sectionCase(id), id).toContain(`entrySection(\n          swissHeading(dict, '${id}'),`)
    }
  })

  it('keeps the summary, the skills and the languages each in one unbreakable block', () => {
    for (const id of ['summary', 'skills', 'languages']) {
      expect(sectionCase(id), id).toMatch(new RegExp(`<section className="break-inside-avoid">\\s*\\{heading\\(swissHeading\\(dict, '${id}'\\)\\)\\}`))
    }
  })
})

describe('swissCommerce lays its skills and languages out as the mockup does', () => {
  it('draws the skills in two columns, each label leading its skills in the same text flow', () => {
    const skills = sectionCase('skills')
    expect(skills).toContain('className="grid grid-cols-2"')
    // Rich text's first paragraph runs on from the label; it is not a block of its own.
    expect(skills).toContain('[&>span+div]:inline [&>span+div>p:first-child]:inline')
    // The label's gap is in the label's own text node, so the PDF's text layer keeps it.
    expect(skills).toContain('{`${swissCommerceSkillLabel(skill.category)}${COLUMN_BREAK}`}')
  })

  it('ends each pill with its own separator, so adjacent pills extract as separate words', () => {
    expect(sectionCase('languages')).toContain(
      '{`${swissCommerceLanguagePill(lang.language, swissLanguageLevel(dict, lang.level))}${COLUMN_BREAK}`}',
    )
    // The separator's width comes out of the right padding.
    expect(sectionCase('languages')).toContain('calc(${GEOMETRY.pillPaddingX}px - ${COLUMN_BREAK_EM}em)')
    expect(SOURCE).toContain(String.raw`const COLUMN_BREAK = '\u00A0'`)
  })

  it('separates the label from its skills by a no-break space in the rendered text', () => {
    const html = renderToString(createElement(SwissCommerceTemplate, { resume: resume({ skills: [{ category: 'Office', items: ['Ledgers'], visible: true }] }), locale: 'en', dict: en }))
    expect(html).toContain('Office:\u00A0</span>')
    expect(html).toContain(`Esperanto — ${en.resumes.editor.levels.native}\u00A0</span>`)
  })

  it('draws the languages as pills that never break inside', () => {
    expect(sectionCase('languages')).toContain('className="swiss-commerce-pill inline-block whitespace-nowrap border-blue-200 bg-blue-50 text-slate-800"')
  })

  it('justifies no text: every rich-text call is ragged-right, as the mockup', () => {
    const calls = [...SOURCE.matchAll(/renderFormattedText\(([^)]*)\)/g)].map(([, args]) => args)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((args) => !args.includes('justify: false'))).toEqual([])
  })
})

describe('swissCommerce keeps its round photo and rounded pills in print', () => {
  // globals.css resets every border radius in print; the PDF prints the Preview
  // under print media. The browser check is e2e/swiss-commerce-template.spec.ts.
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const printBlock = globals.slice(globals.indexOf('@media print'))
  const rule = (selector: string) =>
    new RegExp(String.raw`\.swiss-commerce-template \.${selector}\s*\{\s*border-radius:\s*([^;!]+?)\s*!important;`).exec(printBlock)?.[1]

  it('restores the photo circle and the pill radius, scoped to this template', () => {
    expect(rule('swiss-commerce-photo')).toBe('50%')
    expect(rule('swiss-commerce-pill')).toBe(`${SWISS_COMMERCE_GEOMETRY.pillRadius}px`)
  })

  it('marks the photo frame and the pills with the classes the print rules select', () => {
    expect(SOURCE).toContain('className="swiss-commerce-photo shrink-0 overflow-hidden rounded-full border-blue-300"')
    expect(sectionCase('languages')).toContain('swiss-commerce-pill')
  })
})

/**
 * A skill cell as the server renders it: its class list, and the opening tag
 * and markup of the block that follows the label span.
 */
function skillCell(skillsHtml: string): { cellClass: string; after: string } {
  const html = renderToString(
    createElement(SwissCommerceTemplate, {
      resume: resume({ skills: [{ category: 'Office', items: [], skillsHtml, visible: true }] }),
      locale: 'en',
      dict: en,
    }),
  )
  const label = html.indexOf('Office:')
  const cellStart = html.lastIndexOf('<div class="', label)
  const cellClass = (/<div class="([^"]*)"/.exec(html.slice(cellStart))?.[1] ?? '').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  const after = html.slice(html.indexOf('</span>', label) + '</span>'.length)
  return { cellClass, after }
}

/**
 * Whether the block right after the label is drawn on the label's line: the
 * cell's arbitrary variants make it inline. Read from the class list and the
 * block's tag, since the unit suite has no CSS: `[&>span+div]:inline` selects a
 * div after the label, `[&>.formatted-content]:inline` only the rich-text wrapper.
 */
function runsOnFromLabel({ cellClass, after }: { cellClass: string; after: string }): boolean {
  const tag = /^<(\w+)([^>]*)>/.exec(after)
  if (!tag) return true // bare text, the legacy items path
  const isDiv = tag[1] === 'div'
  const isWrapper = /class="formatted-content"/.test(tag[2])
  return (isDiv && cellClass.includes('[&>span+div]:inline')) || (isWrapper && cellClass.includes('[&>.formatted-content]:inline'))
}

describe('swissCommerce draws plain-text skills on the label line, as Word does', () => {
  it('runs a single-line plain-text skillsHtml on from its label', () => {
    const cell = skillCell('Excel, Word')
    expect(cell.after).toMatch(/^<div>Excel, Word<\/div>/)
    expect(runsOnFromLabel(cell)).toBe(true)
  })

  it('runs the first line of multi-line plain text on from its label and keeps the line break', () => {
    const cell = skillCell('Excel\nWord')
    expect(cell.after).toMatch(/^<div>Excel<br\/>Word<\/div>/)
    expect(runsOnFromLabel(cell)).toBe(true)
  })

  it('starts a plain-text list on the line below its label', () => {
    const cell = skillCell('- Excel\n- Word')
    expect(cell.after).toMatch(/^<ul /)
    expect(runsOnFromLabel(cell)).toBe(false)
  })

  it('keeps the rich-text wrapper on the label line', () => {
    const cell = skillCell('<p>Excel</p>')
    expect(cell.after).toMatch(/^<div class="formatted-content">/)
    expect(runsOnFromLabel(cell)).toBe(true)
  })
})

describe('swissCommerce draws no empty degree line', () => {
  it('leaves out the degree paragraph when the degree is empty, as Word does', () => {
    const html = renderToString(
      createElement(SwissCommerceTemplate, {
        resume: resume({ education: [{ school: 'Aldervane College', degree: '', startDate: '2020-09', endDate: '2021-06', visible: true }] }),
        locale: 'en',
        dict: en,
      }),
    )
    expect(html).toContain('Aldervane College')
    expect(html).not.toMatch(/<p class="font-bold text-slate-900"><\/p>/)
  })
})
