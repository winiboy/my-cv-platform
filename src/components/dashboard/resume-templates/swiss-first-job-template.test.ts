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
import { SWISS_FIRST_JOB_GEOMETRY, SWISS_FIRST_JOB_MAIN_TEXT_WIDTH, SWISS_FIRST_JOB_SIZES, swissFirstJobEmailFit } from '@/lib/swiss-first-job-template'
import { SwissFirstJobTemplate } from './swiss-first-job-template'

/**
 * `swiss-first-job-template.tsx`: the server render the Preview and the PDF
 * depend on (FR-9), and the print, layout and word-wrapping rules pinned in its
 * source. A printed radius, page margin or sidebar band is only observable in a
 * browser's print; each assertion names the rule it holds, and
 * `e2e/swiss-first-job-template.spec.ts` checks the browser.
 */

const SOURCE = readFileSync(path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-first-job-template.tsx'), 'utf8')

const PALETTE = PREVIEW_PALETTE.swissFirstJob
const G = SWISS_FIRST_JOB_GEOMETRY

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Logistics assistant',
    template: 'swissFirstJob',
    contact: { name: 'Kevin Gomes', email: 'kevin@gomes.test', phone: '+41 00 000 00 10', location: 'Oxbridge', github: 'github.test/kevin' },
    summary: 'Motivated logistics assistant.',
    experience: [
      { company: 'Northern Distribution', position: 'Order picker', location: 'Oxbridge', startDate: '2024-01', current: true, achievements: ['Prepared 150 parcels a day.'], visible: true },
    ],
    education: [{ school: 'Vocational School', degree: 'Logistics certificate', field: 'Oxbridge', startDate: '2022-08', endDate: '2024-06', visible: true }],
    skills: [
      { category: '', items: ['Handling and carrying', 'Order preparation'], visible: true },
      { category: 'Hidden', items: ['Hidden skill'], visible: false },
    ],
    languages: [
      { language: 'French', level: 'Native', visible: true },
      { language: 'English', level: 'Intermediate', visible: true },
    ],
    certifications: [{ name: 'Forklift licence R1', issuer: '', date: '2024-05', visible: true }],
    projects: [{ name: 'Never drawn project', visible: true }],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

const render = (row: Resume, dict: typeof en = en, props: Record<string, unknown> = {}) =>
  renderToString(createElement(SwissFirstJobTemplate, { resume: row, locale: 'en', dict, ...props }))

const VOID_ELEMENTS = new Set(['img', 'br', 'input', 'wbr'])

/** Entities decoded, and no-break spaces read as spaces. */
const decode = (text: string) =>
  text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/\u00A0/g, ' ')

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
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(([, inner]) => decode(inner.replace(/<[^>]*>/g, '')).trim())

const asideOf = (html: string) => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
const mainOf = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>'))

describe('swissFirstJob renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = render(resume({ summary: '<p>Motivated <strong>assistant</strong>.</p>' }))
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading for a CV with no content', () => {
    const empty = { contact: {}, title: '', summary: '', skills: [], experience: [], projects: [], education: [], languages: [], certifications: [] }
    expect(headings(render(resume(empty)))).toEqual([])
  })
})

describe('swissFirstJob draws the mockup’s two columns', () => {
  it('draws the sidebar first, down the left, in its violet tint: contact, skills, languages, certificates', () => {
    const html = render(resume())
    expect(html.indexOf('<aside')).toBeLessThan(html.indexOf('<main'))
    expect(asideOf(html)).toContain(`width:${G.sidebarWidth}px;background-color:${PALETTE.sidebar.css}`)
    const t = en.resumes.template
    expect(headings(asideOf(html))).toEqual([en.resumes.editor.sections.contact, t.skills, t.languages, t.training])
  })

  it('draws the main column’s name, title, then summary, experience, education under the existing labels', () => {
    const html = render(resume())
    const main = mainOf(html)
    expect(main).toContain(`<h1 class="font-bold" style="color:${PALETTE.name.css};font-size:${SWISS_FIRST_JOB_SIZES.name}px`)
    expect(main).toContain(`style="color:${PALETTE.accent.css};font-size:${SWISS_FIRST_JOB_SIZES.title}px`)
    const t = en.resumes.template
    expect(headings(main)).toEqual([t.summary, t.experience, t.education])
    expect(html).not.toContain('Never drawn project')
  })

  it.each([
    ['fr', fr],
    ['de', de],
  ] as const)('heads both columns in %s with that locale’s labels', (locale, dict) => {
    const html = render(resume(), dict as typeof en, { locale })
    const t = dict.resumes.template
    expect(headings(html)).toEqual([dict.resumes.editor.sections.contact, t.skills, t.languages, t.training, t.summary, t.experience, t.education])
  })

  it('heads the main sections after a filled violet circle, and the sidebar in violet spaced capitals', () => {
    const html = render(resume())
    expect(html.split(`class="swiss-first-job-circle shrink-0" style="width:${G.headingCircle}px;height:${G.headingCircle}px;border-radius:50%;background-color:${PALETTE.mark.css}"`).length - 1).toBe(3)
    expect(html.split(`<h2 class="font-bold uppercase tracking-widest" style="color:${PALETTE.accent.css};font-size:${SWISS_FIRST_JOB_SIZES.sidebarHeading}px`).length - 1).toBe(4)
  })

  it('lists the contact details one per line, and each skill behind a check mark', () => {
    const aside = withoutWbr(asideOf(render(resume())))
    for (const value of ['Oxbridge', '+41 00 000 00 10', 'kevin@gomes.test', 'github.test/kevin']) expect(aside).toContain(`>${value}</p>`)
    expect(aside).toContain('<span aria-hidden="true" class="shrink-0" style="width:14px">✓</span><span class="min-w-0">Handling and carrying</span>')
    expect(aside).not.toContain('Hidden skill')
  })

  it('draws a language’s level as five equal round dots after the name, named in words for assistive technology', () => {
    const html = render(resume())
    const dot = (colour: string) =>
      `<span class="swiss-first-job-dot inline-block shrink-0" style="width:${G.dot}px;height:${G.dot}px;border-radius:50%;background-color:${colour}"></span>`
    const level = (name: string) =>
      `<span role="img" aria-label="${name}" class="inline-flex whitespace-nowrap align-middle" style="margin-left:${G.dotsLead}px;column-gap:${G.dotsGap}px">`
    expect(html).toContain(`French${level(en.resumes.editor.levels.native)}${dot(PALETTE.mark.css).repeat(5)}</span>`)
    expect(html).toContain(`English${level(en.resumes.editor.levels.intermediate)}${dot(PALETTE.mark.css).repeat(2)}${dot(PALETTE.emptyDot.css).repeat(3)}</span>`)
    expect([G.dot, G.dotsGap]).toEqual([7, 4])
  })

  it('draws a certificate as "name \u00B7 MM.YYYY"', () => {
    expect(decode(render(resume()))).toContain('>Forklift licence R1 \u00B7 05.2024</p>')
  })

  it('draws an entry as its violet date line, its bold title, its grey second line', () => {
    const html = decode(render(resume()))
    expect(html).toContain(
      `<p class="whitespace-nowrap" style="color:${PALETTE.accent.css};font-size:${SWISS_FIRST_JOB_SIZES.date}px">01.2024 – ${en.resumes.template.present}</p><p class="font-bold" style="color:${PALETTE.ink.css}">Order picker</p><p style="color:${PALETTE.muted.css}">Northern Distribution, Oxbridge</p>`,
    )
  })

  it('leaves out the sections the layout hides, through either panel, heading included', () => {
    const html = render(resume(), en, { hiddenMainSections: ['summary'], hiddenSidebarSections: ['skills', 'languages'] })
    expect(headings(html)).toEqual([en.resumes.editor.sections.contact, en.resumes.template.training, en.resumes.template.experience, en.resumes.template.education])
  })

  it('sizes every text it draws: nothing inherits an unset size', () => {
    const sizes = textSizes(render(resume(), en, { photoUrl: 'data:image/png;base64,iVBORw0KGgo=' }))
    expect(sizes.filter(({ fontSize }) => fontSize === null).map(({ text }) => text)).toEqual([])
    const sizeOf = (text: string) => sizes.find((entry) => entry.text === text)?.fontSize
    expect(sizeOf('Kevin Gomes')).toBe(`${SWISS_FIRST_JOB_SIZES.name}px`)
    expect(sizeOf('kevin@gomes.test')).toBe(`${SWISS_FIRST_JOB_SIZES.sidebar}px`)
    expect(sizeOf('Order picker')).toBe(`${SWISS_FIRST_JOB_SIZES.body}px`)
  })

  it('justifies no text: every rich-text call is ragged-right', () => {
    const calls = [...SOURCE.matchAll(/renderFormattedText\(([^)]*)\)/g)].map(([, args]) => args)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((args) => !args.includes('justify: false'))).toEqual([])
  })
})

/** Any class or style that lets the browser break inside a word. */
const WORD_BREAKING =
  /\bbreak-words\b|\bbreak-all\b|\bwrap-anywhere\b|\bhyphens-auto\b|overflow-wrap:(?:break-word|anywhere)|word-break:break-all|hyphens:auto/

describe('swissFirstJob never cuts a word (owner rule, any language)', () => {
  const html = render(
    resume({ skills: [{ category: 'Kommunikationsfähigkeiten', items: ['Lagerbewirtschaftung und Kommissionierung'], visible: true }] }),
    de as typeof en,
    { locale: 'de' },
  )

  it('lets nothing around a long German skill break a word, but its column’s last resort', () => {
    const breaking = ancestorsOf(html, 'Lagerbewirtschaftung und Kommissionierung').filter((attributes) => WORD_BREAKING.test(attributes))
    expect(breaking).toHaveLength(1)
    expect(breaking[0]).toMatch(/^ class="swiss-first-job-column shrink-0" style="overflow-wrap:break-word;word-break:normal;/)
    expect(SOURCE.split("overflowWrap: 'break-word'").length - 1).toBe(2)
  })

  it('draws an email wider than the sidebar as stored, with no <wbr>, shrunk to the size that fits it', () => {
    const email = 'maximilian.mustermann-gomes@hotmail.com'
    const fit = swissFirstJobEmailFit(email)
    expect(fit.px).toBeLessThan(SWISS_FIRST_JOB_SIZES.sidebar)
    const html = render(resume({ contact: { name: 'Max', email } }))
    expect(html).toContain(`<p style="margin-top:0"><span style="font-size:${fit.px}px">${email}</span></p>`)
  })

  it('draws a fitting email whole and marks a link’s boundaries with <wbr>; keeps every date on one line', () => {
    const plain = render(resume())
    expect(plain).toContain('>kevin@gomes.test</p>')
    expect(plain).toContain('github<wbr/>.test/<wbr/>kevin')
    expect(ancestorsOf(html, `01.2024 – ${de.resumes.template.present}`).at(-1)).toContain('whitespace-nowrap')
  })
})

describe('swissFirstJob in print', () => {
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const printBlock = globals.slice(globals.indexOf('@media print'))

  it('restores the photo’s, the circles’ and the dots’ radius, scoped to this template', () => {
    expect(printBlock).toMatch(
      /\.swiss-first-job-template \.swiss-first-job-photo,\s*\.swiss-first-job-template \.swiss-first-job-circle,\s*\.swiss-first-job-template \.swiss-first-job-dot\s*\{\s*border-radius:\s*50% !important;/,
    )
  })

  it('paints the sidebar on every page from the paper’s top edge to its foot: no page margin, the root’s band, nothing over it', () => {
    // A page margin would cut the band off: no named page, so the default `@page { margin: 0 }` holds.
    expect(printBlock).not.toMatch(/swiss-first-job\s*;|@page swiss-first-job/)
    const root = /html:has\(\.swiss-first-job-template\)\s*\{([\s\S]*?)\}/.exec(printBlock)?.[1] ?? ''
    // Anchored at the page's left edge, where the page-wide document starts.
    expect(root.trim()).toBe(`background: linear-gradient(to right, ${PALETTE.sidebar.css} ${G.sidebarWidth}px, white ${G.sidebarWidth}px) !important;`)
    expect(G.sidebarWidth + G.mainPaddingLeft + SWISS_FIRST_JOB_MAIN_TEXT_WIDTH + G.mainPaddingRight).toBe(PAGE_WIDTH_PX)
    expect(printBlock).toMatch(
      /body:has\(\.swiss-first-job-template\),\s*body :has\(\.swiss-first-job-template\),\s*\.swiss-first-job-template,\s*\.swiss-first-job-template > aside\.swiss-first-job-column\s*\{\s*background: transparent !important;\s*\}/,
    )
    // The sidebar is the root's first child, the column the band lies under.
    expect(render(resume())).toMatch(/^<div [^>]*class="swiss-first-job-template [^"]*"[^>]*><aside class="swiss-first-job-column shrink-0"/)
  })

  it('keeps SWISS_FIRST_JOB_GEOMETRY.pageTop and .pageBottom above and below the text of every page, as Word’s page margins', () => {
    const rule = /\.swiss-first-job-template\s*\{([^}]*)\}/.exec(printBlock)?.[1] ?? ''
    expect(rule.split(/\s*;\s*/).map((declaration) => declaration.trim()).filter(Boolean)).toEqual([
      'min-height: 0 !important',
      `padding-top: ${G.pageTop}px !important`,
      `padding-bottom: ${G.pageBottom}px !important`,
      '-webkit-box-decoration-break: clone',
      'box-decoration-break: clone',
    ])
    expect(printBlock).toMatch(/\.swiss-first-job-template \.swiss-first-job-column\s*\{\s*padding-top: 0 !important;\s*padding-bottom: 0 !important;\s*\}/)
    expect(G.paddingTop).toBe(G.pageTop)
    expect(globals.slice(0, globals.indexOf('@media print'))).not.toMatch(/swiss-first-job/)
  })
})

describe('swissFirstJob draws the photo only when there is one (FR-5, FR-14)', () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

  it('draws the photo round, in its light ring, at the top of the sidebar', () => {
    const aside = asideOf(render(resume(), en, { photoUrl: PHOTO }))
    expect(aside.indexOf(`src="${PHOTO}"`)).toBeGreaterThanOrEqual(0)
    expect(aside.indexOf(`src="${PHOTO}"`)).toBeLessThan(aside.indexOf(en.resumes.editor.sections.contact))
    expect(aside).toContain(
      `width:${G.photo}px;height:${G.photo}px;border-radius:50%;border-width:${G.photoRing}px;border-style:solid;border-color:${PALETTE.soft.css};background-color:${PALETTE.photoFill.css}`,
    )
  })

  it('draws no frame without a photo or with the photo unticked, and no unticked detail', () => {
    expect(render(resume())).not.toContain('swiss-first-job-photo')
    expect(render(resume(), en, { photoUrl: PHOTO, hiddenContactFields: ['photo'] })).toBe(render(resume()))
    const html = withoutWbr(render(resume(), en, { hiddenContactFields: ['title', 'email', 'github'] }))
    expect(html).not.toContain('Logistics assistant')
    expect(html).not.toContain('kevin@gomes.test')
    expect(html).not.toContain('github.test')
  })
})
