import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import type { Resume } from '@/types/database'
import { SWISS_HEALTH_GEOMETRY, SWISS_HEALTH_SIZES } from '@/lib/swiss-health-template'
import { SwissHealthTemplate } from './swiss-health-template'

/**
 * `swiss-health-template.tsx`: the server render the Preview and the PDF
 * depend on (FR-9), and the print and layout rules pinned in its source, as
 * `swiss-trades-template.test.ts` pins its own. A printed radius is only
 * observable in a browser's print; each assertion names the rule it holds,
 * and `e2e/swiss-health-template.spec.ts` checks the browser.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-health-template.tsx'),
  'utf8',
)

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Ward nurse',
    template: 'swissHealth',
    contact: { name: 'Robin Halvorsen', email: 'robin@halvorsen.test', phone: '+41 00 000 00 07', location: 'Oxbridge' },
    summary: '<p>Nurse of <strong>wards</strong>.</p>',
    experience: [
      {
        company: 'Tessellate Clinic',
        position: 'Ward nurse',
        location: 'Oxbridge',
        startDate: '2019-01',
        current: true,
        achievements: ['Ran the ward.'],
        visible: true,
      },
    ],
    education: [{ school: 'Halvorsen Institute', degree: 'Nursing diploma', startDate: '2012-09', endDate: '2016-06', visible: true }],
    skills: [{ category: 'Care', items: [], skillsHtml: '<p>Wound care, Geriatrics</p>', visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    certifications: [{ name: 'BLS licence', issuer: 'Guild', date: '2021-05', visible: true }],
    projects: [],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

const render = (row: Resume, dict: typeof en = en, props: Record<string, unknown> = {}) =>
  renderToString(createElement(SwissHealthTemplate, { resume: row, locale: 'en', dict, ...props }))

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
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, text]) => text)

describe('swissHealth renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = render(resume(), fr)
    expect(html).toContain('Robin Halvorsen')
    expect(html).toContain(`Esperanto — ${fr.resumes.editor.levels.native}`)
    expect(html).not.toContain('&lt;p&gt;')
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading at all for a CV with no content', () => {
    const empty = resume({ contact: {}, title: '', summary: '', experience: [], education: [], skills: [], languages: [], certifications: [] })
    expect(render(empty)).not.toContain('<h2')
    expect(render(empty)).not.toContain('<header')
  })
})

describe('swissHealth draws the mockup’s one column', () => {
  it('draws its headings as pills in the mockup order: summary, education, experience, continuing education, skills, languages', () => {
    const html = render(resume())
    expect(headings(html)).toEqual([
      en.resumes.template.summary,
      en.resumes.template.education,
      en.resumes.template.experience,
      en.resumes.template.training,
      en.resumes.template.skills,
      en.resumes.template.languages,
    ])
    expect(html.split('class="swiss-health-pill').length - 1).toBe(6)
  })

  it('draws the name, the title in teal, then the contact details on one line, in the header', () => {
    const html = render(resume())
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    const order = ['Robin Halvorsen', 'Ward nurse', 'Oxbridge', '+41 00 000 00 07', 'robin@halvorsen.test'].map((text) => header.indexOf(text))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(header).toMatch(/style="color:#0f766e;[^"]*">Ward nurse<\/p>/)
  })

  it('draws the dates in the left column in teal MM.YYYY, beside a light-teal bar', () => {
    const html = render(resume())
    expect(html).toContain(`01.2019 – ${en.resumes.template.present}`)
    expect(html).toContain('09.2012 – 06.2016')
    expect(html).toMatch(/style="color:#0f766e;[^"]*">01\.2019 – /)
    expect(html).toContain('border-left-width:2px;border-left-style:solid;border-left-color:#99f6e4')
  })

  it('draws an experience as its bold position, then its employer after " · "', () => {
    const html = render(resume())
    expect(html).toContain('<span class="font-bold" style="color:#0f172a">Ward nurse</span><span style="color:#64748b"> · Tessellate Clinic, Oxbridge</span>')
  })

  it('draws an education as its bold degree, then its school below in grey', () => {
    const html = render(resume())
    expect(html).toContain('<p class="font-bold" style="color:#0f172a">Nursing diploma</p><p style="color:#64748b">Halvorsen Institute</p>')
  })

  it('draws a certificate as its date, then its bold name · issuer', () => {
    const html = render(resume())
    expect(html).toMatch(/>05\.2021 <\/p>/)
    expect(html).toContain('<span class="font-bold" style="color:#0f172a">BLS licence</span><span style="color:#64748b"> · Guild</span>')
  })

  it('draws the school as the bold first line when the degree is empty, leaving no empty line', () => {
    const html = render(resume({ education: [{ school: 'Halvorsen Institute', degree: '', startDate: '2012-09', endDate: '2016-06', visible: true }] }))
    expect(html).toContain('<p class="font-bold" style="color:#0f172a">Halvorsen Institute</p>')
    expect(html.split('Halvorsen Institute').length - 1).toBe(1)
  })

  it('draws the employer as the bold first line when the position is empty, once', () => {
    const html = render(
      resume({ experience: [{ company: 'Tessellate Clinic', position: '', location: 'Oxbridge', startDate: '2019-01', current: true, visible: true }] }),
    )
    expect(html).toContain('<span class="font-bold" style="color:#0f172a">Tessellate Clinic, Oxbridge</span></p>')
    expect(html.split('Tessellate Clinic').length - 1).toBe(1)
  })

  it('draws skills as one line joined by " · ", under their category caption', () => {
    const html = render(resume())
    expect(html).toMatch(/<p class="font-semibold" style="color:#134e4a;[^"]*">Care<\/p><p>Wound care · Geriatrics<\/p>/)
  })

  it('draws formatted skills through the sanitizer, and no caption for a category with no name', () => {
    const html = render(resume({ skills: [{ category: '', items: [], skillsHtml: '<ul><li>Wound care</li></ul>', visible: true }] }))
    expect(html).not.toContain('font-semibold')
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(1)
  })

  it('draws skills and languages side by side, and either one alone at full width', () => {
    expect(render(resume())).toContain('class="grid grid-cols-2 break-inside-avoid"')
    for (const alone of [render(resume({ languages: [] })), render(resume({ skills: [] }))]) {
      expect(alone).not.toContain('grid-cols-2')
      expect(headings(alone).length).toBe(5)
    }
    const hidden = render(resume(), en, { hiddenSidebarSections: ['languages'] })
    expect(hidden).not.toContain('grid-cols-2')
    expect(hidden).not.toContain('Esperanto')
  })

  it('sizes every text it draws itself, the skills and languages at the body size like the summary', () => {
    // The root sets no font size, so text without a sized ancestor would fall
    // back to the browser's 16px while the Word export draws it at the body size.
    const sizes = textSizes(render(resume({ summary: 'Nurse of wards.' })))
    const unsized = sizes.filter(({ fontSize }) => fontSize === null).map(({ text }) => text)
    expect(unsized).toEqual([])
    const sizeOf = (text: string) => sizes.find((entry) => entry.text === text)?.fontSize
    const body = `${SWISS_HEALTH_SIZES.body}px`
    expect(sizeOf('Nurse of wards.')).toBe(body)
    expect(sizeOf('Wound care · Geriatrics')).toBe(body)
    expect(sizeOf(`Esperanto — ${en.resumes.editor.levels.native}`)).toBe(body)
    // Alone at full width, too.
    expect(textSizes(render(resume({ skills: [] }))).find((entry) => entry.text.startsWith('Esperanto'))?.fontSize).toBe(body)
    expect(textSizes(render(resume({ languages: [] }))).find((entry) => entry.text === 'Wound care · Geriatrics')?.fontSize).toBe(body)
  })

  it('justifies no text: every rich-text call is ragged-right, as the mockup', () => {
    const calls = [...SOURCE.matchAll(/renderFormattedText\(([^)]*)\)/g)].map(([, args]) => args)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((args) => !args.includes('justify: false'))).toEqual([])
  })
})

describe('swissHealth keeps its round photo and its pills in print', () => {
  // globals.css resets every border radius in print; the PDF prints the Preview
  // under print media. The browser check is e2e/swiss-health-template.spec.ts.
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const printBlock = globals.slice(globals.indexOf('@media print'))

  it('restores the photo’s and the pills’ radius, scoped to this template', () => {
    const photo = /\.swiss-health-template \.swiss-health-photo\s*\{\s*border-radius:\s*([^;!]+?)\s*!important;/.exec(printBlock)?.[1]
    expect(photo).toBe('50%')
    const pill = /\.swiss-health-template \.swiss-health-pill\s*\{\s*border-radius:\s*([^;!]+?)\s*!important;/.exec(printBlock)?.[1]
    expect(pill).toBe(`${SWISS_HEALTH_GEOMETRY.pillRadius}px`)
    expect(SOURCE).toContain('borderRadius: `${GEOMETRY.pillRadius}px`')
    expect(SOURCE).toContain("borderRadius: '50%'")
  })

  it('marks the photo frame and the pills with the classes the print rules and the e2e select', () => {
    expect(SOURCE).toContain('className="swiss-health-photo shrink-0 overflow-hidden"')
    expect(SOURCE).toContain('className="swiss-health-pill w-fit max-w-full break-words font-bold uppercase tracking-widest"')
  })
})

describe('swissHealth draws the photo only when there is one (FR-5)', () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

  it('draws the photo round, in its light-teal ring, before the name', () => {
    const html = render(resume(), en, { photoUrl: PHOTO })
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    expect(header.indexOf(`src="${PHOTO}"`)).toBeGreaterThanOrEqual(0)
    expect(header.indexOf(`src="${PHOTO}"`)).toBeLessThan(header.indexOf('Robin Halvorsen'))
    expect(header).toContain(
      `width:${SWISS_HEALTH_GEOMETRY.photo}px;height:${SWISS_HEALTH_GEOMETRY.photo}px;border-radius:50%;border-width:${SWISS_HEALTH_GEOMETRY.photoRing}px;border-style:solid;border-color:#99f6e4;background-color:#f0fdfa`,
    )
  })

  it('draws no frame without a photo or with the photo unticked', () => {
    expect(render(resume())).not.toContain('swiss-health-photo')
    expect(render(resume(), en, { photoUrl: PHOTO, hiddenContactFields: ['photo'] })).toBe(render(resume()))
  })

  it('draws no CV title and no unticked contact detail (FR-14)', () => {
    const html = render(resume(), en, { hiddenContactFields: ['title', 'email'] })
    expect(html).not.toContain('Ward nurse</p>')
    expect(html).not.toContain('robin@halvorsen.test')
    expect(html).toContain('+41 00 000 00 07')
  })
})
