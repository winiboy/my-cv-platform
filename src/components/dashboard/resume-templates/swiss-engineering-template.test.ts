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
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { SWISS_ENGINEERING_GEOMETRY, SWISS_ENGINEERING_SIZES } from '@/lib/swiss-engineering-template'
import { SwissEngineeringTemplate } from './swiss-engineering-template'

/**
 * `swiss-engineering-template.tsx`: the server render the Preview and the PDF
 * depend on (FR-9), and the print, layout and word-wrapping rules pinned in its
 * source, as `swiss-health-template.test.ts` pins its own. A printed radius or
 * band is only observable in a browser's print; each assertion names the rule
 * it holds, and `e2e/swiss-engineering-template.spec.ts` checks the browser.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-engineering-template.tsx'),
  'utf8',
)

const PALETTE = PREVIEW_PALETTE.swissEngineering

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Structural engineer',
    template: 'swissEngineering',
    contact: { name: 'Robin Halvorsen', email: 'robin@halvorsen.test', phone: '+41 00 000 00 07', location: 'Oxbridge' },
    summary: 'Engineer of bridges.',
    experience: [
      {
        company: 'Tessellate Structures',
        position: 'Project lead',
        location: 'Oxbridge',
        startDate: '2019-01',
        current: true,
        achievements: ['Led the works.'],
        visible: true,
      },
    ],
    education: [{ school: 'Halvorsen Institute', degree: 'Bachelor of Science', startDate: '2012-09', endDate: '2016-06', visible: true }],
    skills: [{ category: 'Design', items: [], skillsHtml: '<p>Load analysis, BIM</p>', visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    certifications: [{ name: 'Register A', issuer: '', date: '2022-05', visible: true }],
    projects: [
      { name: 'Broye bridge', description: 'Strengthened the deck.', technologies: ['SIA 262', 'Revit'], url: 'example.test/broye', visible: true },
      { name: 'Hidden project', description: 'Not drawn.', visible: false },
    ],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

const render = (row: Resume, dict: typeof en = en, props: Record<string, unknown> = {}) =>
  renderToString(createElement(SwissEngineeringTemplate, { resume: row, locale: 'en', dict, ...props }))

const VOID_ELEMENTS = new Set(['img', 'br', 'input'])

/** Every text node of `html`, with the font size its nearest ancestor sets inline, or null when none does. */
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

/** The text of every `<h2>`, in document order. */
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, text]) => text)

const mainOf = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>'))
const asideOf = (html: string) => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))

const inOrder = (haystack: string, needles: string[]) => {
  const at = needles.map((needle) => haystack.indexOf(needle))
  expect(at.every((index) => index >= 0), `every one of ${needles.join(', ')} is drawn`).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
}

describe('swissEngineering renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = render(resume({ summary: '<p>Engineer of <strong>bridges</strong>.</p>' }), fr)
    expect(html).toContain('Robin Halvorsen')
    expect(html).toContain(`Esperanto — ${fr.resumes.editor.levels.native}`)
    expect(html).not.toContain('&lt;p&gt;')
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading at all for a CV with no content', () => {
    const empty = resume({ contact: {}, title: '', summary: '', experience: [], education: [], skills: [], languages: [], certifications: [], projects: [] })
    expect(render(empty)).not.toContain('<h2')
    expect(render(empty)).not.toContain('<h1')
  })
})

describe('swissEngineering draws the mockup’s two columns', () => {
  it('draws the name, the title, then summary, key achievements and experience in the main column, which comes first', () => {
    const html = render(resume())
    expect(html.indexOf('<main')).toBeLessThan(html.indexOf('<aside'))
    inOrder(mainOf(html), [
      'Robin Halvorsen',
      'Structural engineer',
      en.resumes.template.summary,
      en.resumes.template.keyAchievements,
      'Broye bridge',
      en.resumes.template.experience,
      'Project lead',
    ])
  })

  it('draws contact, education, skills, languages and certifications in the light column, in that order', () => {
    const html = render(resume())
    inOrder(asideOf(html), [
      en.resumes.editor.sections.contact,
      'robin@halvorsen.test',
      en.resumes.template.education,
      'Bachelor of Science',
      en.resumes.template.skills,
      'Load analysis',
      en.resumes.template.languages,
      'Esperanto',
      en.resumes.template.training,
      'Register A, 05.2022',
    ])
  })

  it('draws each heading in blue spaced capitals, in both columns', () => {
    const html = render(resume())
    expect(headings(html)).toEqual([
      en.resumes.template.summary,
      en.resumes.template.keyAchievements,
      en.resumes.template.experience,
      en.resumes.editor.sections.contact,
      en.resumes.template.education,
      en.resumes.template.skills,
      en.resumes.template.languages,
      en.resumes.template.training,
    ])
    expect(html.split(`class="font-bold uppercase tracking-widest" style="color:${PALETTE.accent.css}`).length - 1).toBe(8)
  })

  it('draws the light column a fixed 250px down the right, behind the blue bar, in its own colour', () => {
    const aside = asideOf(render(resume()))
    expect(aside).toContain('class="shrink-0"')
    expect(aside).toContain(
      `width:${SWISS_ENGINEERING_GEOMETRY.columnWidth}px;background-color:${PALETTE.column.css};border-left-width:${SWISS_ENGINEERING_GEOMETRY.columnBar}px;border-left-style:solid;border-left-color:${PALETTE.bar.css}`,
    )
  })

  it('draws each project as a card: its bold name, its description, then its technologies and link in grey', () => {
    const html = render(resume())
    expect(html).toMatch(
      /class="swiss-engineering-card break-inside-avoid"[^>]*><p class="font-bold" style="color:#0f172a">Broye bridge<\/p><div style="color:#1e293b">[\s\S]*?Strengthened the deck\.[\s\S]*?<div style="color:#64748b"><p>SIA 262, Revit<\/p><p>example\.test\/broye<\/p><\/div><\/div>/,
    )
    expect(html).not.toContain('Hidden project')
    const card = /<div class="swiss-engineering-card[^"]*" style="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(card).toContain(`background-color:${PALETTE.card.css}`)
    expect(card).toContain(`border-width:${SWISS_ENGINEERING_GEOMETRY.cardBorder}px;border-style:solid;border-color:${PALETTE.cardBorder.css}`)
    expect(card).toContain(`border-left-width:${SWISS_ENGINEERING_GEOMETRY.cardBar}px;border-left-color:${PALETTE.bar.css}`)
    expect(card).toContain(`border-radius:${SWISS_ENGINEERING_GEOMETRY.cardRadius}px`)
  })

  it('draws a project with no name as its description alone, and no card or heading without a project', () => {
    const nameless = render(resume({ projects: [{ name: '', description: 'Strengthened the deck.', visible: true }] }))
    expect(nameless).toMatch(/class="swiss-engineering-card[^"]*"[^>]*><div style="color:#1e293b">/)
    for (const html of [
      render(resume({ projects: [] })),
      render(resume({ projects: [{ name: ' ', description: '', technologies: [], visible: true }] })),
      render(resume(), en, { hiddenSidebarSections: ['keyAchievements'] }),
    ]) {
      expect(html).not.toContain('swiss-engineering-card')
      expect(headings(html)).not.toContain(en.resumes.template.keyAchievements)
    }
  })

  it('draws an experience as its bold position with the dates at its right in grey, then the company line', () => {
    const html = render(resume())
    expect(html).toContain(
      `<p class="min-w-0 font-bold" style="color:#0f172a">Project lead </p><p class="shrink-0 whitespace-nowrap" style="color:#64748b;font-size:${SWISS_ENGINEERING_SIZES.date}px">01.2019 – ${en.resumes.template.present}</p>`,
    )
    expect(html).toContain('<p style="color:#64748b">Tessellate Structures, Oxbridge</p>')
  })

  it('draws the company as the bold first line of an experience with no position, once', () => {
    const html = render(
      resume({ experience: [{ company: 'Tessellate Structures', position: '', location: 'Oxbridge', startDate: '2019-01', current: true, visible: true }] }),
    )
    expect(html).toContain('<p class="min-w-0 font-bold" style="color:#0f172a">Tessellate Structures, Oxbridge </p>')
    expect(html.split('Tessellate Structures').length - 1).toBe(1)
  })

  it('draws an education as its bold degree, then "school, dates" below', () => {
    const aside = asideOf(render(resume()))
    expect(aside).toContain('<p class="font-bold" style="color:#0f172a">Bachelor of Science</p><p>Halvorsen Institute, 09.2012 – 06.2016</p>')
  })

  it('leads an education with its school when it has no degree, leaving no empty line', () => {
    const aside = asideOf(render(resume({ education: [{ school: 'Halvorsen Institute', degree: '', startDate: '2012-09', endDate: '2016-06', visible: true }] })))
    expect(aside).toContain('<p class="font-bold" style="color:#0f172a">Halvorsen Institute</p><p>09.2012 – 06.2016</p>')
    expect(aside).not.toMatch(/<p[^>]*><\/p>/)
  })

  it('lists skills one per line, without bars, under their category caption', () => {
    const aside = asideOf(render(resume()))
    // The category's block holds its caption and its lines, and nothing else: no level bar.
    expect(aside).toMatch(
      /<div class="break-inside-avoid" style="margin-top:0"><p class="font-semibold" style="color:#0f172a;[^"]*">Design<\/p><p style="margin-top:0">Load analysis<\/p><p style="margin-top:3px">BIM<\/p><\/div>/,
    )
  })

  it('draws formatted skills through the sanitizer, and no caption for a category with no name', () => {
    const aside = asideOf(render(resume({ skills: [{ category: '', items: [], skillsHtml: '<ul><li>BIM</li></ul>', visible: true }] })))
    expect(aside).toContain('class="formatted-content"')
    expect(aside).not.toContain('font-semibold')
  })

  it('draws a language as "language — level", in the locale’s words (FR-7)', () => {
    expect(render(resume(), de)).toContain(`Esperanto — ${de.resumes.editor.levels.native}`)
  })

  it('draws no undated "present" for an education stored without dates', () => {
    const aside = asideOf(render(resume({ education: [{ school: 'Halvorsen Institute', degree: 'Bachelor of Science', visible: true }] })))
    expect(aside).toContain('<p>Halvorsen Institute</p>')
    expect(aside).not.toContain(en.resumes.template.present)
  })

  it('sizes every text it draws itself: the main column at the body size, the light column at its own', () => {
    const sizes = textSizes(render(resume()))
    expect(sizes.filter(({ fontSize }) => fontSize === null).map(({ text }) => text)).toEqual([])
    const sizeOf = (text: string) => sizes.find((entry) => entry.text === text)?.fontSize
    const body = `${SWISS_ENGINEERING_SIZES.body}px`
    const column = `${SWISS_ENGINEERING_SIZES.column}px`
    expect(sizeOf('Engineer of bridges.')).toBe(body)
    expect(sizeOf('Broye bridge')).toBe(body)
    expect(sizeOf('SIA 262, Revit')).toBe(body)
    expect(sizeOf('Tessellate Structures, Oxbridge')).toBe(body)
    expect(sizeOf('robin@halvorsen.test')).toBe(column)
    expect(sizeOf('Bachelor of Science')).toBe(column)
    expect(sizeOf('Load analysis')).toBe(column)
    expect(sizeOf(`Esperanto — ${en.resumes.editor.levels.native}`)).toBe(column)
  })

  it('justifies no text: every rich-text call is ragged-right, as the mockup', () => {
    const calls = [...SOURCE.matchAll(/renderFormattedText\(([^)]*)\)/g)].map(([, args]) => args)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((args) => !args.includes('justify: false'))).toEqual([])
  })
})

/** Any class or style that lets the browser break inside a word. */
const WORD_BREAKING =
  /\bbreak-words\b|\bbreak-all\b|\bwrap-anywhere\b|\bhyphens-auto\b|overflow-wrap:(?:break-word|anywhere)|word-break:break-all|hyphens:auto/

/** The one declaration the columns carry: break a word only when it alone is wider than its line. */
const LAST_RESORT = 'overflow-wrap:break-word;word-break:normal'

describe('swissEngineering never cuts a word (owner rule, any language)', () => {
  const LONG = {
    category: 'Kommunikationsfähigkeiten',
    degree: 'Bachelor of Science in Bauingenieurwesen',
    skill: 'Projektleitungserfahrung',
    email: 'robin.halvorsen@ingenieurbuero.test',
  }
  const html = render(
    resume({
      contact: { name: 'Robin Halvorsen', email: LONG.email },
      education: [{ school: 'Halvorsen Institute', degree: LONG.degree, visible: true }],
      skills: [{ category: LONG.category, items: [LONG.skill], visible: true }],
    }),
    de,
  )

  it.each(Object.values(LONG))('lets nothing around "%s" break a word, but the columns’ last resort', (text) => {
    const chain = ancestorsOf(html, text)
    const breaking = chain.filter((attributes) => WORD_BREAKING.test(attributes))
    // Exactly one ancestor — the column — and only `break-word`, which acts on
    // a word alone wider than the column, never `anywhere` or `break-all`.
    expect(breaking).toHaveLength(1)
    expect(breaking[0]).toContain(LAST_RESORT)
    expect(breaking[0]).toMatch(/^ class="shrink-0" style="overflow-wrap:break-word;word-break:normal;width:250px;/)
  })

  it('sets the last resort on the two columns only, and nowhere else', () => {
    expect(SOURCE.split("overflowWrap: 'break-word'").length - 1).toBe(2)
    expect(SOURCE.split("wordBreak: 'normal'").length - 1).toBe(2)
    // No class or style anywhere else that breaks inside a word.
    expect(SOURCE).not.toMatch(/className="[^"]*(?:break-words|break-all|wrap-anywhere|hyphens-auto)/)
    expect(SOURCE).not.toMatch(/overflowWrap: 'anywhere'|wordBreak: 'break-all'|hyphens:/)
    expect(mainOf(html)).toMatch(/^<main class="min-w-0 flex-1" style="overflow-wrap:break-word;word-break:normal;/)
  })

  it('keeps every date on one line, with nothing breaking inside it', () => {
    const dates = `01.2019 – ${de.resumes.template.present}`
    const chain = ancestorsOf(render(resume(), de), dates)
    expect(chain.at(-1)).toContain('whitespace-nowrap')
  })
})

describe('swissEngineering keeps its round photo, its rounded cards and its light column in print', () => {
  // globals.css resets every border radius in print; the PDF prints the Preview
  // under print media. The browser check is e2e/swiss-engineering-template.spec.ts.
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const printBlock = globals.slice(globals.indexOf('@media print'))

  it('restores the photo’s and the cards’ radius, scoped to this template', () => {
    const photo = /\.swiss-engineering-template \.swiss-engineering-photo\s*\{\s*border-radius:\s*([^;!]+?)\s*!important;/.exec(printBlock)?.[1]
    expect(photo).toBe('50%')
    const card = /\.swiss-engineering-template \.swiss-engineering-card\s*\{\s*border-radius:\s*([^;!]+?)\s*!important;/.exec(printBlock)?.[1]
    expect(card).toBe(`${SWISS_ENGINEERING_GEOMETRY.cardRadius}px`)
    expect(SOURCE).toContain('borderRadius: `${GEOMETRY.cardRadius}px`')
    expect(SOURCE).toContain("borderRadius: '50%'")
  })

  it('paints the light column and its bar on every printed page, in their own colours and widths', () => {
    const band = /html:has\(\.swiss-engineering-template\)\s*\{([\s\S]*?)\}/.exec(printBlock)?.[1] ?? ''
    const columnStart = PAGE_WIDTH_PX - SWISS_ENGINEERING_GEOMETRY.columnWidth
    const barEnd = columnStart + SWISS_ENGINEERING_GEOMETRY.columnBar
    const at = (px: number) => `calc(max(0px, 50% - ${PAGE_WIDTH_PX / 2}px) + ${px}px)`
    for (const stop of [
      `white ${at(columnStart)}`,
      `${PALETTE.bar.css} ${at(columnStart)}`,
      `${PALETTE.bar.css} ${at(barEnd)}`,
      `${PALETTE.column.css} ${at(barEnd)}`,
      `${PALETTE.column.css} ${at(PAGE_WIDTH_PX)}`,
      `white ${at(PAGE_WIDTH_PX)}`,
    ]) {
      expect(band, stop).toContain(stop)
    }
  })

  it('marks the photo frame and the cards with the classes the print rules and the e2e select', () => {
    expect(SOURCE).toContain('className="swiss-engineering-photo shrink-0 overflow-hidden"')
    expect(SOURCE).toContain('className="swiss-engineering-card break-inside-avoid"')
    // The print reset makes every `.mx-auto` transparent; the photo is centred without it.
    expect(SOURCE).not.toMatch(/swiss-engineering-photo[^"]*mx-auto/)
  })
})

describe('swissEngineering draws the photo only when there is one (FR-5, FR-14)', () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

  it('draws the photo round, in its light ring, at the top of the light column', () => {
    const aside = asideOf(render(resume(), en, { photoUrl: PHOTO }))
    expect(aside.indexOf(`src="${PHOTO}"`)).toBeGreaterThanOrEqual(0)
    expect(aside.indexOf(`src="${PHOTO}"`)).toBeLessThan(aside.indexOf(en.resumes.editor.sections.contact))
    expect(aside).toContain(
      `width:${SWISS_ENGINEERING_GEOMETRY.photo}px;height:${SWISS_ENGINEERING_GEOMETRY.photo}px;border-radius:50%;border-width:${SWISS_ENGINEERING_GEOMETRY.photoRing}px;border-style:solid;border-color:${PALETTE.photoRing.css};background-color:${PALETTE.photoFill.css}`,
    )
  })

  it('draws no frame without a photo or with the photo unticked', () => {
    expect(render(resume())).not.toContain('swiss-engineering-photo')
    expect(render(resume(), en, { photoUrl: PHOTO, hiddenContactFields: ['photo'] })).toBe(render(resume()))
  })

  it('draws no CV title and no unticked contact detail', () => {
    const html = render(resume(), en, { hiddenContactFields: ['title', 'email'] })
    expect(html).not.toContain('>Structural engineer</p>')
    expect(html).not.toContain('robin@halvorsen.test')
    expect(html).toContain('+41 00 000 00 07')
  })
})
