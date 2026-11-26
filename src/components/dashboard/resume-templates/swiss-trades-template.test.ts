import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import type { Resume } from '@/types/database'
import { PREVIEW_PALETTE } from '@/lib/resume-palette'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { SWISS_TRADES_GEOMETRY } from '@/lib/swiss-trades-template'
import { readGlobalsCss, ruleDeclarations } from '@/test/print-css'
import { SwissTradesTemplate } from './swiss-trades-template'

/**
 * `swiss-trades-template.tsx`: the server render the Preview and the PDF
 * depend on (FR-9), and the print and layout rules pinned in its source, as
 * `swiss-commerce-template.test.ts` pins its own. A page break or a printed
 * radius is only observable in a browser's print; each assertion names the
 * rule it holds, and `e2e/swiss-trades-template.spec.ts` checks the browser.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-trades-template.tsx'),
  'utf8',
)

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Kilnwright',
    template: 'swissTrades',
    contact: { name: 'Robin Halvorsen', email: 'robin@halvorsen.test', phone: '+41 00 000 00 07', location: 'Oxbridge' },
    summary: '<p>Kilnwright of <strong>glass</strong>.</p>',
    experience: [
      {
        company: 'Tessellate Freight',
        position: 'Kilnwright',
        location: 'Oxbridge',
        startDate: '2019-01',
        current: true,
        achievements: ['Fired the kilns.'],
        visible: true,
      },
    ],
    education: [{ school: 'Halvorsen Institute', degree: 'Magister', startDate: '2012-09', endDate: '2016-06', visible: true }],
    skills: [{ category: 'Workshop', items: [], skillsHtml: '<p>Glazing, Firing</p>', visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    certifications: [{ name: 'Kiln licence', issuer: 'Guild', date: '2021-05', visible: true }],
    projects: [],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

const render = (row: Resume, dict: typeof en = en, props: Record<string, unknown> = {}) =>
  renderToString(createElement(SwissTradesTemplate, { resume: row, locale: 'en', dict, ...props }))

describe('swissTrades renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = render(resume(), fr)
    expect(html).toContain('Robin Halvorsen')
    expect(html).toContain(`Esperanto — ${fr.resumes.editor.levels.native}`)
    // The stored markup is never printed as text.
    expect(html).not.toContain('&lt;p&gt;')
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading at all for a CV with no content', () => {
    const empty = resume({ contact: {}, summary: '', experience: [], education: [], skills: [], languages: [], certifications: [] })
    expect(render(empty)).not.toContain('<h2')
  })
})

describe('swissTrades draws the mockup’s two columns', () => {
  it('draws contact, skills, certificates and languages in the dark column, in that order', () => {
    const html = render(resume())
    const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
    const order = [
      en.resumes.editor.sections.contact,
      'robin@halvorsen.test',
      en.resumes.template.skills,
      'Glazing',
      en.resumes.template.training,
      'Kiln licence',
      en.resumes.template.languages,
      'Esperanto',
    ].map((text) => sidebar.indexOf(text))
    expect(order.every((at) => at >= 0), 'every sidebar item is in the dark column').toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('draws the name, the title, then summary, experience and education in the main column', () => {
    const html = render(resume())
    const mainColumn = html.slice(html.indexOf('<main'))
    const order = ['Robin Halvorsen', 'Kilnwright', en.resumes.template.summary, en.resumes.template.experience, en.resumes.template.education].map(
      (text) => mainColumn.indexOf(text),
    )
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('draws each skill as a tag, under its category caption, each tag ending in its own separator', () => {
    const html = render(resume())
    expect(html).toContain('Workshop </p>')
    expect(html).toMatch(/class="swiss-trades-tag[^"]*"[^>]*>Glazing <\/span>/)
    expect(html).toMatch(/class="swiss-trades-tag[^"]*"[^>]*>Firing <\/span>/)
  })

  it('draws formatted skills through the sanitizer, and no caption for a category with no name', () => {
    const html = render(resume({ skills: [{ category: '', items: [], skillsHtml: '<ul><li>Glazing</li></ul>', visible: true }] }))
    expect(html).not.toContain('swiss-trades-tag')
    const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
    expect(sidebar).toContain('class="formatted-content"')
    expect(sidebar).not.toContain('font-semibold')
  })

  it('draws the dates of an entry at the right of its first line, in MM.YYYY', () => {
    const html = render(resume())
    expect(html).toContain(`01.2019 – ${en.resumes.template.present}`)
    expect(html).toContain('09.2012 – 06.2016')
    expect(html).toContain('Tessellate Freight, Oxbridge')
  })

  it('draws a certificate as its bold name, then its issuer and month', () => {
    const html = render(resume())
    expect(html).toContain('<span class="font-bold">Kiln licence</span> · Guild, 05.2021')
  })

  it('leaves no empty line for an empty degree, and draws the school as the bold first line beside the dates', () => {
    const html = render(resume({ education: [{ school: 'Halvorsen Institute', degree: '', startDate: '2012-09', endDate: '2016-06', visible: true }] }))
    expect(html).not.toMatch(/<p class="min-w-0 break-words font-bold"[^>]*><\/p>/)
    expect(html).toMatch(
      /<p class="min-w-0 break-words font-bold" style="color:#0f172a">Halvorsen Institute <\/p><p[^>]*>09\.2012 – 06\.2016<\/p>/,
    )
  })

  it('draws the company as the bold first line of an experience with no position', () => {
    const html = render(
      resume({ experience: [{ company: 'Tessellate Freight', position: '', location: 'Oxbridge', startDate: '2019-01', current: true, visible: true }] }),
    )
    expect(html).toMatch(/<p class="min-w-0 break-words font-bold" style="color:#0f172a">Tessellate Freight, Oxbridge <\/p>/)
    // Drawn once: not repeated as a grey line under it.
    expect(html.split('Tessellate Freight').length - 1).toBe(1)
  })

  it('draws the title and the dates in the accent orange that meets WCAG AA on white', () => {
    const html = render(resume())
    expect(html).toMatch(/style="color:#c2410c;[^"]*">Kilnwright<\/p>/)
    expect(html).toMatch(/style="color:#c2410c;[^"]*">01\.2019 – /)
  })

  it('justifies no text: every rich-text call is ragged-right, as the mockup', () => {
    const calls = [...SOURCE.matchAll(/renderFormattedText\(([^)]*)\)/g)].map(([, args]) => args)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((args) => !args.includes('justify: false'))).toEqual([])
  })
})

describe('swissTrades keeps its rounded tags and its dark column in print', () => {
  // globals.css resets every border radius in print; the PDF prints the Preview
  // under print media. The browser check is e2e/swiss-trades-template.spec.ts.
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const printBlock = globals.slice(globals.indexOf('@media print'))

  it('restores the tag radius, scoped to this template', () => {
    const rule = /\.swiss-trades-template \.swiss-trades-tag\s*\{\s*border-radius:\s*([^;!]+?)\s*!important;/.exec(printBlock)?.[1]
    expect(rule).toBe(`${SWISS_TRADES_GEOMETRY.tagRadius}px`)
    expect(SOURCE).toContain('borderRadius: `${GEOMETRY.tagRadius}px`')
  })

  it('paints the dark column on every printed page, in its own colour and width', () => {
    const band = /html:has\(\.swiss-trades-template\)\s*\{([\s\S]*?)\}/.exec(printBlock)?.[1] ?? ''
    // One solid layer the column's width, repeated down every page, from where
    // the centred document of PAGE_WIDTH_PX starts: max(0px, 50% - 397px) of the canvas,
    // a position's 50% being half of the canvas less the layer's width.
    const colour = PREVIEW_PALETTE.swissTrades.sidebar.css
    const width = SWISS_TRADES_GEOMETRY.sidebarWidth
    expect(band.trim()).toBe(
      `background: linear-gradient(${colour}, ${colour}) max(0px, 50% - ${PAGE_WIDTH_PX / 2 - width / 2}px) 0 / ${width}px 100% repeat-y, white !important;`,
    )
    expect(SOURCE).toContain(`backgroundColor: '${PREVIEW_PALETTE.swissTrades.sidebar.css}'`)
  })

  it('marks the photo frame and the tags with the classes the print rules and the e2e select', () => {
    expect(SOURCE).toContain('className="swiss-trades-photo mx-auto overflow-hidden"')
    expect(SOURCE).toContain('className="swiss-trades-tag max-w-full break-words"')
  })
})

describe('swissTrades draws the photo only when there is one (FR-5)', () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

  it('draws the photo in a square-cornered portrait frame at the top of the dark column', () => {
    const html = render(resume(), en, { photoUrl: PHOTO })
    const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
    expect(sidebar.indexOf(`src="${PHOTO}"`)).toBeGreaterThanOrEqual(0)
    expect(sidebar.indexOf(`src="${PHOTO}"`)).toBeLessThan(sidebar.indexOf(en.resumes.editor.sections.contact))
    expect(sidebar).toContain(`width:${SWISS_TRADES_GEOMETRY.photoWidth}px;height:${SWISS_TRADES_GEOMETRY.photoHeight}px`)
  })

  it('draws no frame without a photo or with the photo unticked', () => {
    expect(render(resume())).not.toContain('swiss-trades-photo')
    expect(render(resume(), en, { photoUrl: PHOTO, hiddenContactFields: ['photo'] })).toBe(render(resume()))
  })
})

describe('swissTrades prints a top and a foot margin on every page (swiss-templates-only-page-fidelity US-002)', () => {
  const css = readGlobalsCss()
  const G = SWISS_TRADES_GEOMETRY

  it('repeats SWISS_TRADES_GEOMETRY.pageTop and .pageBottom as the document’s padding on every printed page, as Word’s page margins', () => {
    expect(ruleDeclarations(css.print, '.swiss-trades-template')).toEqual([
      'min-height: 0 !important',
      `padding-top: ${G.pageTop}px !important`,
      `padding-bottom: ${G.pageBottom}px !important`,
      '-webkit-box-decoration-break: clone',
      'box-decoration-break: clone',
    ])
    expect(ruleDeclarations(css.print, '.swiss-trades-template > aside, .swiss-trades-template > main')).toEqual([
      'padding-top: 0 !important',
      'padding-bottom: 0 !important',
    ])
    // No `@page` margin: Chromium paints nothing into it, and the dark column,
    // the root's background, reaches the paper's top and foot.
    expect(css.print).not.toMatch(/page:\s*swiss-trades|@page swiss-trades/)
    expect(css.screen).not.toMatch(/swiss-trades/)
  })

  it('prints page 1 as the screen draws it: the main column at its padding, the dark column’s text higher by its own', () => {
    expect(G.pageTop).toBe(G.mainPaddingTop)
    expect(G.pageBottom).toBe(G.mainPaddingBottom)
    expect(ruleDeclarations(css.print, '.swiss-trades-template > aside')).toEqual([`margin-top: ${G.sidebarPaddingTop - G.pageTop}px !important`])
    // The dark column and the main column are the document's two children, in that order.
    expect(SOURCE).toMatch(/className="swiss-trades-template [^"]*"[\s\S]*?>\s*<aside\b[\s\S]*<\/aside>\s*<main\b/)
  })
})
