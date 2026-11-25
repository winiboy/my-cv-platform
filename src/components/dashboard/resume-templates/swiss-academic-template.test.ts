import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import type { Resume } from '@/types/database'
import { PREVIEW_PALETTE } from '@/lib/resume-palette'
import { ResumePreview } from '@/components/dashboard/resume-preview'
import { SWISS_ACADEMIC_GEOMETRY, SWISS_ACADEMIC_SIZES, swissAcademicDateColumnPx } from '@/lib/swiss-academic-template'
import { SwissAcademicTemplate } from './swiss-academic-template'

/**
 * `swiss-academic-template.tsx`: the server render the Preview and the PDF
 * depend on (FR-9), the absence of any photo (the PRD's FR-5 exception), and
 * the print, layout and word-wrapping rules pinned in its source. A printed
 * page margin is only observable in a browser's print; each assertion names
 * the rule it holds, and `e2e/swiss-academic-template.spec.ts` checks the browser.
 */

const SOURCE = readFileSync(path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-academic-template.tsx'), 'utf8')

const PALETTE = PREVIEW_PALETTE.swissAcademic
const G = SWISS_ACADEMIC_GEOMETRY

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Postdoctoral researcher in neuroscience',
    template: 'swissAcademic',
    contact: { name: 'Elena Rossi', email: 'elena@rossi.test', phone: '+41 00 000 00 09', location: 'Oxbridge', website: 'orcid.test/0000-0000' },
    summary: 'Neuroscientist working on synaptic plasticity.',
    education: [
      { school: 'University of Oxbridge', degree: 'Doctorate in neuroscience', field: 'Thesis: dendritic spines', startDate: '2015-09', endDate: '2019-06', visible: true },
      { school: 'Hidden School', degree: 'Hidden degree', visible: false },
    ],
    experience: [
      { company: 'Biozentrum', position: 'Postdoctoral researcher', location: 'Oxbridge', startDate: '2020-01', current: true, achievements: ['Led a funded project.'], visible: true },
    ],
    projects: [
      { name: 'Rossi E., et al.', description: 'Motor learning reshapes dendritic spines.', technologies: ['Two-photon imaging'], url: 'doi.test/10.1000/xyz', visible: true },
      { name: '', description: 'A project with no name.', visible: true },
      { name: 'Hidden paper', visible: false },
    ],
    certifications: [{ name: 'Ambizione grant', issuer: 'National science fund', date: '2023-05', visible: true }],
    skills: [{ category: 'Methods', items: ['Two-photon microscopy', 'MATLAB'], visible: true }],
    languages: [
      { language: 'Italian', level: 'Native', visible: true },
      { language: 'English', level: 'Fluent', visible: true },
    ],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

const render = (row: Resume, dict: typeof en = en, props: Record<string, unknown> = {}) =>
  renderToString(createElement(SwissAcademicTemplate, { resume: row, locale: 'en', dict, ...props }))

const VOID_ELEMENTS = new Set(['img', 'br', 'input', 'wbr'])

/** Entities decoded, and no-break spaces read as spaces. */
const decode = (text: string) =>
  text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/\u00A0/g, ' ')

/** `html` without its `<wbr>`s: a line-break opportunity, not text. */
const withoutWbr = (html: string) => html.replace(/<wbr\/?>/g, '')

/** Every text node of `html`, with the font size its nearest ancestor sets inline, or null when none does. */
function textSizes(html: string): { text: string; fontSize: string | null }[] {
  const stack: (string | null)[] = []
  const out: { text: string; fontSize: string | null }[] = []
  for (const [, closing, tag, attributes, text] of withoutWbr(html).matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/g)) {
    if (text !== undefined) {
      const trimmed = decode(text).trim()
      if (trimmed !== '') out.push({ text: trimmed, fontSize: [...stack].reverse().find((size) => size !== null) ?? null })
    } else if (closing) {
      stack.pop()
    } else if (!VOID_ELEMENTS.has(tag) && !attributes.endsWith('/')) {
      stack.push(/font-size:([^;"]+)/.exec(attributes)?.[1] ?? null)
    }
  }
  return out
}

/** The attributes of every element open around the first text node equal to `text`, outermost first. */
function ancestorsOf(html: string, text: string): string[] {
  const stack: string[] = []
  for (const [, closing, tag, attributes, node] of withoutWbr(html).matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/g)) {
    if (node !== undefined) {
      if (decode(node).trim() === text) return [...stack]
    } else if (closing) {
      stack.pop()
    } else if (!VOID_ELEMENTS.has(tag) && !attributes.endsWith('/')) {
      stack.push(attributes)
    }
  }
  throw new Error(`No text node "${text}"`)
}

/** The text of every `<h2>`, in document order. */
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, text]) => decode(text))

describe('swissAcademic renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = render(resume({ summary: '<p>Neuroscientist of <strong>synapses</strong>.</p>' }))
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading and no header for a CV with no content', () => {
    const empty = { contact: {}, title: '', summary: '', skills: [], experience: [], projects: [], education: [], languages: [], certifications: [] }
    const html = render(resume(empty))
    expect(headings(html)).toEqual([])
    expect(html).not.toContain('<header')
  })
})

describe('swissAcademic draws no photo, ever (PRD FR-5 exception)', () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

  it('draws no image and no frame from the Preview, with a stored and ticked photo', () => {
    const html = renderToString(createElement(ResumePreview, { resume: resume(), locale: 'en', dict: en, photoUrl: PHOTO, hiddenContactFields: [] }))
    expect(html).toContain('swiss-academic-template')
    expect(html).not.toContain('<img')
    expect(html).not.toContain(PHOTO)
    expect(html).not.toMatch(/class="[^"]*photo/)
  })

  it('takes no photo at all: its props have none', () => {
    expect(SOURCE).not.toMatch(/photoUrl/)
    expect(SOURCE).not.toMatch(/<img/)
  })
})

describe('swissAcademic draws the mockup', () => {
  it('draws the sections in the mockup order, under the existing labels and the two new ones (FR-6)', () => {
    const t = en.resumes.template
    expect(headings(render(resume()))).toEqual([t.summary, t.education, t.experience, t.publications, t.distinctions, `${t.skills} & ${t.languages}`])
  })

  it.each([
    ['fr', fr],
    ['de', de],
  ] as const)('heads the sections in %s with that locale’s labels', (locale, dict) => {
    const t = dict.resumes.template
    expect(headings(render(resume(), dict as typeof en, { locale }))).toEqual([t.summary, t.education, t.experience, t.publications, t.distinctions, `${t.skills} & ${t.languages}`])
  })

  it('draws every heading in letter-spaced bold small capitals over the thin rule', () => {
    const html = render(resume())
    const heading = `<h2 class="font-bold tracking-widest" style="color:${PALETTE.ink.css};font-variant:small-caps;font-size:${SWISS_ACADEMIC_SIZES.heading}px;line-height:1.4;border-bottom-width:${G.headingRule}px;border-bottom-style:solid;border-bottom-color:${PALETTE.rule.css};padding-bottom:${G.headingRuleGap}px`
    expect(html.split(heading).length - 1).toBe(6)
  })

  it('sets the whole page in the serif face', () => {
    expect(render(resume())).toMatch(/^<div data-testid="resume-document" class="swiss-academic-template relative mx-auto bg-white font-serif /)
  })

  it('draws the header: the name in bold, the title and the contact line in grey', () => {
    const html = withoutWbr(render(resume()))
    expect(html).toContain(`<h1 class="font-bold" style="color:${PALETTE.ink.css};font-size:${SWISS_ACADEMIC_SIZES.name}px`)
    expect(html).toContain(`<p style="color:${PALETTE.muted.css};font-size:${SWISS_ACADEMIC_SIZES.title}px;line-height:1.4;margin-top:${G.nameGap}px">Postdoctoral researcher in neuroscience</p>`)
    const values = [...html.matchAll(/<span class="max-w-full">([^<]*)<\/span>/g)].map(([, text]) => decode(text).trim())
    expect(values).toEqual(['Oxbridge \u00B7', '+41 00 000 00 09 \u00B7', 'elena@rossi.test \u00B7', 'orcid.test/0000-0000'])
  })

  it('puts every dated entry’s dates in one left column as wide as the widest date, never wrapped', () => {
    const html = render(resume())
    const column = swissAcademicDateColumnPx([`09.2015 – 06.2019`, `01.2020 – ${en.resumes.template.present}`, '05.2023'])
    expect(column).toBeGreaterThan(0)
    expect(html.split(`grid-template-columns:${column}px minmax(0, 1fr);column-gap:${G.dateGap}px`).length - 1).toBe(3)
    expect(decode(html)).toContain(`<p class="whitespace-nowrap" style="color:${PALETTE.muted.css};font-size:${SWISS_ACADEMIC_SIZES.date}px">09.2015 – 06.2019 </p>`)
  })

  it('draws an education as "degree — school", then the field of study in grey italics', () => {
    const html = decode(render(resume()))
    expect(html).toContain(`<strong style="color:${PALETTE.ink.css}">Doctorate in neuroscience</strong> — University of Oxbridge</p>`)
    expect(html).toContain(`<p class="italic" style="color:${PALETTE.muted.css}">Thesis: dendritic spines</p>`)
    expect(html).not.toContain('Hidden degree')
  })

  it('draws an experience as "position — company, location", then its bullets', () => {
    const html = decode(render(resume()))
    expect(html).toContain('<strong style="color:#0f172a">Postdoctoral researcher</strong> — Biozentrum, Oxbridge</p>')
    expect(html).toContain('Led a funded project.')
  })

  it('numbers the publications as a real ordered list: name, description, then technologies and link in grey', () => {
    const html = withoutWbr(render(resume()))
    const list = /<ol class="list-decimal"[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? ''
    expect(list.split('<li').length - 1).toBe(2)
    const at = ['Rossi E., et al.', 'Motor learning reshapes', 'Two-photon imaging', 'doi.test/10.1000/xyz', 'A project with no name.'].map((text) => list.indexOf(text))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).not.toContain('Hidden paper')
  })

  it('draws a distinction as its date, then "name — issuer"', () => {
    const html = decode(render(resume()))
    expect(html).toContain('05.2023 </p><div class="min-w-0"><p style="color:#1e293b">Ambizione grant — National science fund</p>')
  })

  it('draws "Category: skills" and "Languages: language (level), …" in the last section', () => {
    const html = decode(render(resume()))
    expect(html).toContain(`<strong style="color:${PALETTE.ink.css}">Methods: </strong>Two-photon microscopy, MATLAB</p>`)
    expect(html).toContain(
      `<strong style="color:${PALETTE.ink.css}">${en.resumes.template.languages}: </strong>Italian (${en.resumes.editor.levels.native}), English (${en.resumes.editor.levels.fluent})</p>`,
    )
  })

  it('heads the last section with the one label it holds, and leaves out hidden sections, heading included', () => {
    const t = en.resumes.template
    expect(headings(render(resume(), en, { hiddenSidebarSections: ['skills'] })).at(-1)).toBe(t.languages)
    const html = render(resume(), en, { hiddenMainSections: ['summary'], hiddenSidebarSections: ['keyAchievements', 'training', 'skills', 'languages'] })
    expect(headings(html)).toEqual([t.education, t.experience])
    expect(html).not.toContain('Ambizione')
  })

  it('sizes every text it draws: nothing inherits an unset size', () => {
    const sizes = textSizes(render(resume()))
    expect(sizes.filter(({ fontSize }) => fontSize === null).map(({ text }) => text)).toEqual([])
    const sizeOf = (text: string) => sizes.find((entry) => entry.text === text)?.fontSize
    expect(sizeOf('Elena Rossi')).toBe(`${SWISS_ACADEMIC_SIZES.name}px`)
    expect(sizeOf('orcid.test/0000-0000')).toBe(`${SWISS_ACADEMIC_SIZES.contact}px`)
    expect(sizeOf('Rossi E., et al.')).toBe(`${SWISS_ACADEMIC_SIZES.body}px`)
  })

  it('justifies no text: every rich-text call is ragged-right', () => {
    const calls = [...SOURCE.matchAll(/renderFormattedText\(([^)]*)\)/g)].map(([, args]) => args)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((args) => !args.includes('justify: false'))).toEqual([])
  })

  it('draws the email whole, with no break opportunity, as Word does; the other links keep theirs', () => {
    const html = render(resume({ contact: { name: 'Elena Rossi', email: 'elena.rossi-lab@exemple.ch', website: 'orcid.test/0000-0001' } }))
    expect(html).toContain('<span class="max-w-full">elena.rossi-lab@exemple.ch\u00A0\u00B7\u00A0</span>')
    expect(html).toContain('orcid<wbr/>.test/<wbr/>0000<wbr/>-0001')
  })

  it('never breaks before the dash of an entry line: a no-break space before it', () => {
    expect(render(resume())).toContain('</strong>\u00A0\u2014 University of Oxbridge</p>')
  })

  it('draws no CV title and no unticked contact detail (FR-14)', () => {
    const html = withoutWbr(render(resume(), en, { hiddenContactFields: ['title', 'email', 'website'] }))
    expect(html).not.toContain('Postdoctoral researcher in neuroscience')
    expect(html).not.toContain('elena@rossi.test')
    expect(html).not.toContain('orcid.test')
    expect(decode(html)).toContain('<span class="max-w-full">+41 00 000 00 09</span></p>')
  })
})

/** Any class or style that lets the browser break inside a word. */
const WORD_BREAKING =
  /\bbreak-words\b|\bbreak-all\b|\bwrap-anywhere\b|\bhyphens-auto\b|overflow-wrap:(?:break-word|anywhere)|word-break:break-all|hyphens:auto/

describe('swissAcademic never cuts a word (owner rule, any language)', () => {
  const html = render(
    resume({ education: [{ school: 'ETH', degree: 'Doktorat in Neurowissenschaften und Kommunikationsfähigkeiten', startDate: '2015-09', endDate: '2019-06', visible: true }] }),
    de as typeof en,
    { locale: 'de' },
  )

  it('lets nothing around a long German title break a word, but the document’s last resort', () => {
    const breaking = ancestorsOf(html, 'Doktorat in Neurowissenschaften und Kommunikationsfähigkeiten').filter((attributes) => WORD_BREAKING.test(attributes))
    expect(breaking).toHaveLength(1)
    expect(breaking[0]).toContain('overflow-wrap:break-word;word-break:normal')
    expect(SOURCE.split("overflowWrap: 'break-word'").length - 1).toBe(1)
  })

  it('marks a link’s boundaries with <wbr>, and keeps every date on one line', () => {
    expect(render(resume())).toContain('doi<wbr/>.test/<wbr/>10<wbr/>.1000/<wbr/>xyz</p>')
    expect(ancestorsOf(html, '09.2015 – 06.2019').at(-1)).toContain('whitespace-nowrap')
  })
})

describe('swissAcademic in print', () => {
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const printBlock = globals.slice(globals.indexOf('@media print'))

  it('prints every page with SWISS_ACADEMIC_GEOMETRY.pageTop and .pageBottom, page 1 starting where it does on screen', () => {
    expect(printBlock).toMatch(/html:has\(\.swiss-academic-template\),\s*body:has\(\.swiss-academic-template\)\s*\{\s*page:\s*swiss-academic;\s*\}/)
    const rule = /@page swiss-academic\s*\{([^}]*)\}/.exec(printBlock)?.[1].trim()
    expect(rule?.split(/\s*;\s*/).filter(Boolean)).toEqual([`margin-top: ${G.pageTop}px`, `margin-bottom: ${G.pageBottom}px`])
    const padding = /\.swiss-academic-template\s*\{([^}]*)\}/.exec(printBlock)?.[1].trim()
    expect(padding?.split(/\s*;\s*/).filter(Boolean)).toEqual([`padding-top: ${G.paddingTop - G.pageTop}px !important`, 'padding-bottom: 0 !important'])
    expect(globals.slice(0, globals.indexOf('@media print'))).not.toMatch(/swiss-academic/)
  })
})
