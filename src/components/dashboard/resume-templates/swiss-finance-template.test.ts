import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import type { Resume } from '@/types/database'
import {
  SWISS_FINANCE_GEOMETRY,
  SWISS_FINANCE_LABEL_MAX_PX,
  SWISS_FINANCE_LABEL_TRACK,
  SWISS_FINANCE_MIN_VALUE_PX,
  SWISS_FINANCE_SIZES,
  SWISS_FINANCE_TEXT_WIDTH,
} from '@/lib/swiss-finance-template'
import { readGlobalsCss, ruleDeclarations } from '@/test/print-css'
import { SwissFinanceTemplate } from './swiss-finance-template'

/**
 * `swiss-finance-template.tsx`: the server render the Preview and the PDF
 * depend on (FR-9), and the print and layout rules pinned in its source, as
 * `swiss-health-template.test.ts` pins its own. `e2e/swiss-finance-template.spec.ts`
 * checks the browser.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-finance-template.tsx'),
  'utf8',
)

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Credit analyst',
    template: 'swissFinance',
    contact: { name: 'Robin Halvorsen', email: 'robin@halvorsen.test', phone: '+41 00 000 00 07', location: 'Oxbridge' },
    summary: '<p>Analyst of <strong>credit</strong>.</p>',
    experience: [
      {
        company: 'Tessellate Bank',
        position: 'Credit analyst',
        location: 'Oxbridge',
        startDate: '2019-01',
        current: true,
        achievements: ['Rated the portfolio.'],
        visible: true,
      },
    ],
    education: [{ school: 'Halvorsen Institute', degree: 'Finance diploma', startDate: '2012-09', endDate: '2016-06', visible: true }],
    skills: [{ category: 'Analysis', items: [], skillsHtml: '<p>Balance sheets, Cash flow</p>', visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    certifications: [{ name: 'Wealth advisor', issuer: 'Guild', date: '2021-05', visible: true }],
    projects: [],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

const render = (row: Resume, dict: typeof en = en, props: Record<string, unknown> = {}) =>
  renderToString(createElement(SwissFinanceTemplate, { resume: row, locale: 'en', dict, ...props }))

const VOID_ELEMENTS = new Set(['img', 'br', 'input'])

/**
 * Every text node of `html`, with the font size its nearest ancestor sets
 * inline (`font-size:…`), or null when none does: a walk of the server
 * markup, whose elements are well-formed.
 */
function textSizes(html: string): { text: string; fontSize: string | null }[] {
  const stack: (string | null)[] = []
  const out: { text: string; fontSize: string | null }[] = []
  for (const [, closing, tag, attributes, text] of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/g)) {
    if (text !== undefined) {
      const trimmed = text.replace(/ /g, ' ').trim()
      if (trimmed !== '') out.push({ text: trimmed, fontSize: [...stack].reverse().find((size) => size !== null) ?? null })
    } else if (closing) {
      stack.pop()
    } else if (!VOID_ELEMENTS.has(tag) && !attributes.endsWith('/')) {
      stack.push(/font-size:([^;"]+)/.exec(attributes)?.[1] ?? null)
    }
  }
  return out
}

/** The text of every `<h2>`, in document order. */
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, text]) => text.replace(/&amp;/g, '&'))

describe('swissFinance renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = render(resume(), fr)
    expect(html).toContain('Robin Halvorsen')
    expect(html).toContain(`Esperanto (${fr.resumes.editor.levels.native})`)
    expect(html).not.toContain('&lt;p&gt;')
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading and no header at all for a CV with no content', () => {
    const empty = resume({ contact: {}, title: '', summary: '', experience: [], education: [], skills: [], languages: [], certifications: [] })
    expect(render(empty)).not.toContain('<h2')
    expect(render(empty)).not.toContain('<header')
  })
})

describe('swissFinance draws the mockup’s one column', () => {
  it('draws its headings in the mockup order, skills and languages under one joined heading', () => {
    expect(headings(render(resume()))).toEqual([
      en.resumes.template.summary,
      en.resumes.template.experience,
      en.resumes.template.education,
      en.resumes.template.training,
      `${en.resumes.template.skills} & ${en.resumes.template.languages}`,
    ])
  })

  it('draws every heading in green spaced capitals over a thin grey rule', () => {
    const html = render(resume())
    const tags = [...html.matchAll(/<h2([^>]*)>/g)].map(([, attributes]) => attributes)
    expect(tags).toHaveLength(5)
    for (const tag of tags) {
      expect(tag).toContain('class="break-words font-normal uppercase"')
      expect(tag).toContain('color:#166534')
      expect(tag).toContain('letter-spacing:0.25em')
      expect(tag).toContain('border-bottom-width:1px;border-bottom-style:solid;border-bottom-color:#cbd5e1')
    }
  })

  it('draws the name in spaced capitals, the title in green italics, then the contact details joined by " · "', () => {
    const html = render(resume())
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    expect(header).toMatch(/<h1 class="break-words font-normal uppercase tracking-widest" style="color:#0f172a;[^"]*">Robin Halvorsen<\/h1>/)
    expect(header).toMatch(/<p class="break-words italic" style="color:#166534;[^"]*">Credit analyst<\/p>/)
    expect(header).toContain('>Oxbridge · +41 00 000 00 07 · robin@halvorsen.test</p>')
  })

  it('draws a double green rule under the header', () => {
    const html = render(resume())
    expect(html).toMatch(/<header [^>]*border-bottom-width:3px;border-bottom-style:double;border-bottom-color:#166534/)
  })

  it('draws an experience as "**Position**, Company, Location", its dates right-aligned in grey italics', () => {
    const html = render(resume())
    expect(html).toContain('<span class="font-bold" style="color:#0f172a">Credit analyst</span><span style="color:#1e293b">, Tessellate Bank, Oxbridge </span>')
    expect(html).toMatch(new RegExp(`<p class="whitespace-nowrap text-right italic" style="color:#475569;[^"]*">01\\.2019 – ${en.resumes.template.present}</p>`))
    expect(html).toContain(`grid-template-columns:minmax(0, 1fr) ${SWISS_FINANCE_GEOMETRY.dateColumn}px`)
  })

  it('draws an education as its bold degree, then its school on the next line in grey', () => {
    const html = render(resume())
    expect(html).toContain('<span class="font-bold" style="color:#0f172a">Finance diploma </span>')
    expect(html).toContain('<p style="color:#475569">Halvorsen Institute</p>')
  })

  it('draws a certificate as "**Name**, Issuer" with its date at the right', () => {
    const html = render(resume())
    expect(html).toContain('<span class="font-bold" style="color:#0f172a">Wealth advisor</span><span style="color:#1e293b">, Guild </span>')
    expect(html).toMatch(/italic"[^>]*>05\.2021<\/p>/)
  })

  it('leads with the school or the employer when the degree or position is empty, once, with no dangling comma', () => {
    const html = render(
      resume({
        education: [{ school: 'Halvorsen Institute', degree: '', startDate: '2012-09', endDate: '2016-06', visible: true }],
        experience: [{ company: 'Tessellate Bank', position: '', location: '', startDate: '2019-01', current: true, visible: true }],
        certifications: [],
      }),
    )
    expect(html).toContain('<span class="font-bold" style="color:#0f172a">Halvorsen Institute </span>')
    expect(html.split('Halvorsen Institute').length - 1).toBe(1)
    expect(html).toContain('<span class="font-bold" style="color:#0f172a">Tessellate Bank </span></p>')
    expect(html).not.toMatch(/>, /)
  })

  it('draws skills and languages as rows of one table: bold label, value joined by ", "', () => {
    const html = render(resume({ languages: [{ language: 'Esperanto', level: 'Native', visible: true }, { language: 'Ido', level: 'Fluent', visible: true }] }))
    expect(html).toMatch(/<p class="break-inside-avoid font-bold" style="color:#0f172a;[^"]*">Analysis <\/p><div [^>]*><p>Balance sheets, Cash flow<\/p><\/div>/)
    expect(html).toMatch(
      new RegExp(`>${en.resumes.template.languages} </p><div [^>]*><p>Esperanto \\(${en.resumes.editor.levels.native}\\), Ido \\(${en.resumes.editor.levels.fluent}\\)</p>`),
    )
    expect(html).toContain(`grid-template-columns:${SWISS_FINANCE_LABEL_TRACK} minmax(0, 1fr)`)
  })

  it('draws formatted skills through the sanitizer, and an empty label for a category with no name', () => {
    const html = render(resume({ skills: [{ category: '', items: [], skillsHtml: '<ul><li>Balance sheets</li></ul>', visible: true }] }))
    expect(html).toMatch(/<p class="break-inside-avoid font-bold" style="[^"]*"><\/p>/)
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(1)
  })

  it('titles the table with the one label it holds when the other part is empty or hidden', () => {
    expect(headings(render(resume({ languages: [] }))).at(-1)).toBe(en.resumes.template.skills)
    expect(headings(render(resume({ skills: [] }))).at(-1)).toBe(en.resumes.template.languages)
    expect(headings(render(resume(), en, { hiddenSidebarSections: ['skills'] })).at(-1)).toBe(en.resumes.template.languages)
    const none = render(resume({ skills: [], languages: [] }))
    expect(headings(none)).toHaveLength(4)
    expect(none).not.toContain(SWISS_FINANCE_LABEL_TRACK)
  })

  it('leaves out a hidden language, and the languages row when none is visible', () => {
    const html = render(resume({ languages: [{ language: 'Esperanto', level: 'Native', visible: false }] }))
    expect(html).not.toContain('Esperanto')
    expect(html).not.toContain(`>${en.resumes.template.languages} </p>`)
  })

  it('sizes every text it draws itself', () => {
    // The root sets no font size, so text without a sized ancestor would fall
    // back to the browser's 16px while the Word export draws it at its size.
    const sizes = textSizes(render(resume({ summary: 'Analyst of credit.' })))
    expect(sizes.filter(({ fontSize }) => fontSize === null).map(({ text }) => text)).toEqual([])
    const sizeOf = (text: string) => sizes.find((entry) => entry.text === text)?.fontSize
    const body = `${SWISS_FINANCE_SIZES.body}px`
    expect(sizeOf('Analyst of credit.')).toBe(body)
    expect(sizeOf('Balance sheets, Cash flow')).toBe(body)
    expect(sizeOf(`Esperanto (${en.resumes.editor.levels.native})`)).toBe(body)
    expect(sizeOf('Robin Halvorsen')).toBe(`${SWISS_FINANCE_SIZES.name}px`)
  })

  it('justifies no text: every rich-text call is ragged-right, as the mockup', () => {
    const calls = [...SOURCE.matchAll(/renderFormattedText\(([^)]*)\)/g)].map(([, args]) => args)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((args) => !args.includes('justify: false'))).toEqual([])
  })

  it('draws in the serif stack classic’s headings draw in, and no other family', () => {
    expect(SOURCE).toContain('className="swiss-finance-template relative mx-auto bg-white font-serif shadow-lg print:shadow-none"')
    expect(SOURCE).not.toMatch(/fontFamily/)
  })
})

describe('swissFinance in print', () => {
  const css = readGlobalsCss()
  const G = SWISS_FINANCE_GEOMETRY

  it('needs no radius exception: its photo and rules are square, as the print reset draws them', () => {
    expect(css.print).not.toMatch(/swiss-finance[^{]*\{[^}]*border-radius/)
    expect(css.screen).not.toMatch(/swiss-finance/)
    expect(SOURCE).not.toMatch(/borderRadius|rounded/)
  })

  it('prints every page with SWISS_FINANCE_GEOMETRY.pageTop and .pageBottom, the screen’s padding, as Word’s page margins (swiss-templates-only-page-fidelity US-002)', () => {
    // The document's own padding, which the margins equal, repeated on every printed page.
    expect(ruleDeclarations(css.print, '.swiss-finance-template')).toEqual(['-webkit-box-decoration-break: clone', 'box-decoration-break: clone'])
    expect(SOURCE).toContain('padding: `${GEOMETRY.paddingTop}px ${GEOMETRY.paddingX}px ${GEOMETRY.paddingBottom}px`')
    // No `@page` margin of its own: the default `@page { margin: 0 }` holds.
    expect(css.print).not.toMatch(/page:\s*swiss-finance|@page swiss-finance/)
    expect(G.pageTop).toBe(G.paddingTop)
    expect(G.pageBottom).toBe(G.paddingBottom)
  })
})

describe('swissFinance draws the photo only when there is one (FR-5)', () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

  it('draws the photo rectangular, in its thin border, after the name block', () => {
    const html = render(resume(), en, { photoUrl: PHOTO })
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    expect(header.indexOf(`src="${PHOTO}"`)).toBeGreaterThan(header.indexOf('Robin Halvorsen'))
    expect(header).toContain(
      `width:${SWISS_FINANCE_GEOMETRY.photoWidth}px;height:${SWISS_FINANCE_GEOMETRY.photoHeight}px;border-width:${SWISS_FINANCE_GEOMETRY.photoBorder}px;border-style:solid;border-color:#cbd5e1;background-color:#f8fafc`,
    )
  })

  it('draws no frame without a photo or with the photo unticked', () => {
    expect(render(resume())).not.toContain('swiss-finance-photo')
    expect(render(resume(), en, { photoUrl: PHOTO, hiddenContactFields: ['photo'] })).toBe(render(resume()))
  })

  it('draws no CV title and no unticked contact detail (FR-14)', () => {
    const html = render(resume(), en, { hiddenContactFields: ['title', 'email'] })
    expect(html).not.toContain('>Credit analyst</p>')
    expect(html).not.toContain('robin@halvorsen.test')
    expect(html).toContain('>Oxbridge · +41 00 000 00 07</p>')
  })
})

/** The attributes of every element open around the first text node equal to `text`, outermost first. */
function ancestorsOf(html: string, text: string): string[] {
  const stack: string[] = []
  for (const [, closing, tag, attributes, node] of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/g)) {
    if (node !== undefined) {
      if (node.trim() === text) return [...stack]
    } else if (closing) {
      stack.pop()
    } else if (!VOID_ELEMENTS.has(tag) && !attributes.endsWith('/')) {
      stack.push(attributes)
    }
  }
  throw new Error(`No text node "${text}"`)
}

/** Any class or style on these elements that lets the browser break inside a word. */
const WORD_BREAKING =
  /\bbreak-words\b|\bbreak-all\b|\bwrap-anywhere\b|\bhyphens-auto\b|overflow-wrap:(?:break-word|anywhere)|word-break:break-all|hyphens:auto/

describe('swissFinance never cuts a word (owner rule, any language)', () => {
  const LABELS = ['HR Fachkenntnisse', 'Kommunikationsfähigkeiten', 'Compétences linguistiques', 'Competenze informatiche']
  const html = render(resume({ skills: LABELS.map((category) => ({ category, items: ['x'], visible: true })) }))

  it('sizes the label column to its widest label, up to the cap, as one grid all the rows share', () => {
    expect(SWISS_FINANCE_LABEL_TRACK).toBe(`fit-content(${SWISS_FINANCE_GEOMETRY.labelMaxFraction * 100}%)`)
    expect(html.split(`grid-template-columns:${SWISS_FINANCE_LABEL_TRACK} minmax(0, 1fr)`).length - 1).toBe(1)
  })

  it.each(LABELS)('lets nothing around "%s" break a word, and bounds the label so only a word wider than the bound breaks', (label) => {
    const chain = ancestorsOf(html, label)
    expect(chain.slice(0, -1).filter((attributes) => WORD_BREAKING.test(attributes))).toEqual([])
    // On the label itself: `break-word` acts only on a word wider than its max width, and the
    // label's column is at least as wide as its widest word below that bound.
    expect(chain.at(-1)).toContain(`max-width:${SWISS_FINANCE_LABEL_MAX_PX}px;overflow-wrap:break-word;word-break:normal`)
    expect(chain.at(-1)).not.toMatch(/overflow-wrap:anywhere|word-break:break-all|hyphens:auto|break-words/)
  })

  it('bounds the label column at the hard maximum, leaving the values at least their minimum width', () => {
    expect(SWISS_FINANCE_LABEL_MAX_PX).toBe(Math.floor(SWISS_FINANCE_GEOMETRY.labelHardMaxFraction * SWISS_FINANCE_TEXT_WIDTH))
    expect(SWISS_FINANCE_MIN_VALUE_PX).toBeGreaterThanOrEqual(300)
    const long = render(resume({ skills: [{ category: 'SAP/Avaloq/Bloomberg/Finnova/Abacus/Excel/PowerBI/Tableau/Python/SQL/VBA/Murex/Calypso/Summit/Kondor/Reuters/FactSet/Morningstar', items: ['Avaloq'], visible: true }] }))
    const chain = ancestorsOf(long, 'SAP/Avaloq/Bloomberg/Finnova/Abacus/Excel/PowerBI/Tableau/Python/SQL/VBA/Murex/Calypso/Summit/Kondor/Reuters/FactSet/Morningstar')
    expect(chain.at(-1)).toContain(`max-width:${SWISS_FINANCE_LABEL_MAX_PX}px`)
    // The grid is the text width; a label bounded at the maximum leaves the value track this much.
    expect(SWISS_FINANCE_TEXT_WIDTH - SWISS_FINANCE_LABEL_MAX_PX - SWISS_FINANCE_GEOMETRY.labelGap).toBe(SWISS_FINANCE_MIN_VALUE_PX)
  })

  it('keeps every date on one line, with nothing breaking inside it', () => {
    const chain = ancestorsOf(html, `01.2019 – ${en.resumes.template.present}`)
    expect(chain.filter((attributes) => WORD_BREAKING.test(attributes))).toEqual([])
    expect(chain.at(-1)).toContain('whitespace-nowrap')
  })
})
