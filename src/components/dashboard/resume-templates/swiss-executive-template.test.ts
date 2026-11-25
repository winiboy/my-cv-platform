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
import { SWISS_EXECUTIVE_GEOMETRY, SWISS_EXECUTIVE_SIZES } from '@/lib/swiss-executive-template'
import { SwissExecutiveTemplate } from './swiss-executive-template'

/**
 * `swiss-executive-template.tsx`: the server render the Preview and the PDF
 * depend on (FR-9), and the print, layout and word-wrapping rules pinned in its
 * source, as `swiss-it-template.test.ts` pins its own. A printed radius or page
 * margin is only observable in a browser's print; each assertion names the rule
 * it holds, and `e2e/swiss-executive-template.spec.ts` checks the browser.
 */

const SOURCE = readFileSync(path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-executive-template.tsx'), 'utf8')

const PALETTE = PREVIEW_PALETTE.swissExecutive
const G = SWISS_EXECUTIVE_GEOMETRY

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Chief executive officer',
    template: 'swissExecutive',
    contact: {
      name: 'Catherine Imhof',
      email: 'catherine@imhof.test',
      phone: '+41 00 000 00 08',
      location: 'Oxbridge',
      linkedin: 'linkedin.test/in/imhof',
      github: '',
      website: 'imhof.test',
    },
    summary: 'Executive with twenty years in medical technology.',
    skills: [{ category: 'Leadership', items: ['Hidden by design skill'], visible: true }],
    experience: [
      {
        company: 'MedAlp Technologies',
        position: 'Chief executive officer',
        location: 'Oxbridge',
        startDate: '2017-01',
        current: true,
        achievements: ['Led four hundred people.'],
        visible: true,
      },
    ],
    projects: [
      { name: 'Growth x2 in 5 years', description: 'Revenue doubled.', technologies: ['SAP'], url: 'example.test/growth', visible: true },
      { name: 'Digital transformation', description: 'A 12 million programme.', visible: true },
      { name: 'Strategic acquisition', description: 'Alone on its row.', visible: true },
      { name: 'Hidden achievement', description: 'Not drawn.', visible: false },
    ],
    education: [{ school: 'IMD', degree: 'Executive MBA', field: 'Lausanne', startDate: '2012-09', endDate: '2014-06', visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    certifications: [{ name: 'Independent director', issuer: 'Medtech association', date: '2020-05', visible: true }],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

const render = (row: Resume, dict: typeof en = en, props: Record<string, unknown> = {}) =>
  renderToString(createElement(SwissExecutiveTemplate, { resume: row, locale: 'en', dict, ...props }))

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

const headerOf = (html: string) => html.slice(html.indexOf('<header'), html.indexOf('</header>'))

describe('swissExecutive renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = render(resume({ summary: '<p>Executive with <strong>twenty</strong> years.</p>' }))
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading, no header and no rule for a CV with no content', () => {
    const empty = { contact: {}, title: '', summary: '', skills: [], experience: [], projects: [], education: [], languages: [], certifications: [] }
    const html = render(resume(empty))
    expect(headings(html)).toEqual([])
    expect(html).not.toContain('<header')
  })
})

describe('swissExecutive draws the mockup', () => {
  it('draws the sections in the mockup order, the summary with no heading, and no skills', () => {
    const t = en.resumes.template
    const html = render(resume())
    expect(headings(html)).toEqual([t.keyAchievements, t.experience, t.education, `${t.languages} & ${t.training}`])
    expect(html).not.toContain(t.summary)
    expect(html).not.toContain(t.skills)
    expect(html).not.toContain('Leadership')
    expect(html).not.toContain('Hidden by design skill')
    const at = ['Executive with twenty years', 'Growth x2 in 5 years', 'MedAlp Technologies', 'Executive MBA', 'Esperanto'].map((text) => html.indexOf(text))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it.each([
    ['fr', fr],
    ['de', de],
  ] as const)('heads the sections in %s with that locale’s existing labels (FR-6)', (locale, dict) => {
    const html = render(resume(), dict as typeof en, { locale })
    expect(headings(html)).toEqual([
      dict.resumes.template.keyAchievements,
      dict.resumes.template.experience,
      dict.resumes.template.education,
      `${dict.resumes.template.languages} & ${dict.resumes.template.training}`,
    ])
  })

  it('draws every heading in the burgundy serif', () => {
    const html = render(resume())
    expect(html.split(`<h2 class="font-serif font-normal" style="color:${PALETTE.accent.css};font-size:${SWISS_EXECUTIVE_SIZES.heading}px`).length - 1).toBe(4)
  })

  it('draws the header: serif name, title in burgundy spaced capitals, the contact line in grey, then the gold rule', () => {
    const header = withoutWbr(headerOf(render(resume())))
    expect(header).toContain(`<h1 class="font-serif font-normal" style="color:${PALETTE.ink.css};font-size:${SWISS_EXECUTIVE_SIZES.name}px`)
    expect(header).toContain(`<p class="uppercase tracking-widest" style="color:${PALETTE.accent.css};font-size:${SWISS_EXECUTIVE_SIZES.title}px`)
    expect(header).toContain('>Chief executive officer</p>')
    const values = [...header.matchAll(/<span class="max-w-full">([^<]*)<\/span>/g)].map(([, text]) => decode(text).trim())
    expect(values).toEqual(['Oxbridge \u00B7', '+41 00 000 00 08 \u00B7', 'catherine@imhof.test \u00B7', 'linkedin.test/in/imhof \u00B7', 'imhof.test'])
    expect(header).toContain(`<p class="flex flex-wrap" style="color:${PALETTE.muted.css};font-size:${SWISS_EXECUTIVE_SIZES.contact}px`)
    expect(header).toContain(`border-top-width:${G.headerRule}px;border-top-style:solid;border-top-color:${PALETTE.gold.css};margin-top:${G.headerRuleGap}px`)
  })

  it('draws the summary in its cream box behind the gold bar, in italics', () => {
    const html = render(resume())
    expect(html).toContain(
      `<section class="break-inside-avoid italic" style="color:${PALETTE.body.css};background-color:${PALETTE.cream.css};border-left-width:${G.summaryBar}px;border-left-style:solid;border-left-color:${PALETTE.gold.css};padding:${G.summaryPaddingY}px ${G.summaryPaddingX}px;font-size:${SWISS_EXECUTIVE_SIZES.summary}px`,
    )
  })

  it('lays the key achievements two to a row under gold rules, an odd last card alone in the left column', () => {
    const html = withoutWbr(render(resume()))
    const rows = [...html.matchAll(/<div class="grid grid-cols-2"[^>]*>([\s\S]*?)(?=<div class="grid grid-cols-2"|<\/section>)/g)].map(([, inner]) => inner)
    expect(rows).toHaveLength(2)
    expect(rows[0].split('class="swiss-executive-card').length - 1).toBe(2)
    expect(rows[1].split('class="swiss-executive-card').length - 1).toBe(1)
    expect(html).toContain(
      `class="swiss-executive-card min-w-0 break-inside-avoid" style="border-top-width:${G.cardRule}px;border-top-style:solid;border-top-color:${PALETTE.gold.css};padding-top:${G.cardRuleGap}px"`,
    )
    // A card: bold name, description, then its technologies and link, muted.
    const card = rows[0].slice(0, rows[0].indexOf('Digital transformation'))
    const at = ['Growth x2 in 5 years', 'Revenue doubled.', '>SAP<', 'example.test/growth'].map((text) => card.indexOf(text))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(card).toContain(`<div style="color:${PALETTE.muted.css}"><p>SAP</p>`)
    expect(html).not.toContain('Hidden achievement')
  })

  it('draws no key-achievements heading without a visible project', () => {
    expect(headings(render(resume({ projects: [{ name: 'Hidden', visible: false }] })))).not.toContain(en.resumes.template.keyAchievements)
  })

  it('draws an experience as its bold title, the dates at its right in grey, never wrapped, then the company line', () => {
    const html = decode(render(resume()))
    expect(html).toContain(
      `<p class="min-w-0 font-bold" style="color:${PALETTE.ink.css}">Chief executive officer </p><p class="shrink-0 whitespace-nowrap" style="color:${PALETTE.muted.css};font-size:${SWISS_EXECUTIVE_SIZES.date}px">01.2017 – ${en.resumes.template.present}</p>`,
    )
    expect(html).toContain(`<p style="color:${PALETTE.muted.css}">MedAlp Technologies, Oxbridge</p>`)
  })

  it('draws the languages on one line and the certifications on the next', () => {
    const html = render(resume())
    expect(decode(html)).toContain(`<p>Esperanto — ${en.resumes.editor.levels.native}</p>`)
    expect(html).toContain('Independent director, Medtech association (05.2020)</p>')
  })

  it('heads the last section with the one label it holds, and draws no heading without either', () => {
    const t = en.resumes.template
    expect(headings(render(resume({ certifications: [] }))).at(-1)).toBe(t.languages)
    expect(headings(render(resume({ languages: [] }))).at(-1)).toBe(t.training)
    expect(headings(render(resume({ languages: [], certifications: [] }))).at(-1)).toBe(t.education)
  })

  it('leaves out the sections the layout hides, through either panel, heading included', () => {
    const html = render(resume(), en, { hiddenMainSections: ['summary'], hiddenSidebarSections: ['keyAchievements', 'training'] })
    expect(html).not.toContain('Executive with twenty years')
    expect(html).not.toContain('Growth x2 in 5 years')
    expect(html).not.toContain('Independent director')
    expect(headings(html)).toEqual([en.resumes.template.experience, en.resumes.template.education, en.resumes.template.languages])
  })

  it('sizes every text it draws: nothing inherits an unset size', () => {
    const sizes = textSizes(render(resume(), en, { photoUrl: 'data:image/png;base64,iVBORw0KGgo=' }))
    expect(sizes.filter(({ fontSize }) => fontSize === null).map(({ text }) => text)).toEqual([])
    const sizeOf = (text: string) => sizes.find((entry) => entry.text === text)?.fontSize
    expect(sizeOf('Catherine Imhof')).toBe(`${SWISS_EXECUTIVE_SIZES.name}px`)
    expect(sizeOf('imhof.test')).toBe(`${SWISS_EXECUTIVE_SIZES.contact}px`)
    expect(sizeOf('Executive with twenty years in medical technology.')).toBe(`${SWISS_EXECUTIVE_SIZES.summary}px`)
    expect(sizeOf('Growth x2 in 5 years')).toBe(`${SWISS_EXECUTIVE_SIZES.body}px`)
    expect(sizeOf(`01.2017 – ${en.resumes.template.present}`)).toBe(`${SWISS_EXECUTIVE_SIZES.date}px`)
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

/** The one declaration the document carries: break a word only when it alone is wider than its line. */
const LAST_RESORT = 'overflow-wrap:break-word;word-break:normal'

describe('swissExecutive never cuts a word (owner rule, any language)', () => {
  const LONG = {
    name: 'Unternehmensentwicklung und Restrukturierungsprogramme',
    description: 'Kommunikationsfähigkeiten.',
    degree: 'Master in Betriebswirtschaft',
  }
  const html = render(
    resume({
      projects: [{ name: LONG.name, description: LONG.description, visible: true }],
      education: [{ school: 'HSG', degree: LONG.degree, visible: true }],
    }),
    de as typeof en,
    { locale: 'de' },
  )

  it.each([LONG.name, LONG.degree])('lets nothing around "%s" break a word, but the document’s last resort', (text) => {
    const breaking = ancestorsOf(html, text).filter((attributes) => WORD_BREAKING.test(attributes))
    expect(breaking).toHaveLength(1)
    expect(breaking[0]).toContain(LAST_RESORT)
    expect(breaking[0]).toMatch(/^ data-testid="resume-document" class="swiss-executive-template /)
  })

  it('sets the last resort on the document only, and nowhere else', () => {
    expect(SOURCE.split("overflowWrap: 'break-word'").length - 1).toBe(1)
    expect(SOURCE.split("wordBreak: 'normal'").length - 1).toBe(1)
    expect(SOURCE).not.toMatch(/className="[^"]*(?:break-words|break-all|wrap-anywhere|hyphens-auto)/)
    expect(SOURCE).not.toMatch(/overflowWrap: 'anywhere'|wordBreak: 'break-all'|hyphens:/)
  })

  it('draws every contact value as a flex item of a wrapping row, so the line breaks only between two', () => {
    const chain = ancestorsOf(render(resume()), '+41 00 000 00 08 \u00B7')
    expect(chain.at(-1)).toBe(' class="max-w-full"')
    expect(chain.at(-2)).toMatch(/^ class="flex flex-wrap"/)
  })

  it('marks a link’s boundaries with <wbr>, and a plain word with none', () => {
    const url = 'https://github.com/catherineimhof/unternehmensentwicklung-und-restrukturierungsprogramme'
    const markup = render(resume({ projects: [{ name: 'Growth', url, visible: true }] }))
    expect(markup).toContain('https://<wbr/>github<wbr/>.com/<wbr/>catherineimhof/<wbr/>unternehmensentwicklung<wbr/>-und<wbr/>-restrukturierungsprogramme</p>')
    expect(render(resume())).toContain('>Growth x2 in 5 years</p>')
  })

  it('keeps every date on one line, its column as wide as the date', () => {
    const chain = ancestorsOf(render(resume(), de as typeof en, { locale: 'de' }), `01.2017 – ${de.resumes.template.present}`)
    expect(chain.at(-1)).toContain('shrink-0 whitespace-nowrap')
  })
})

describe('swissExecutive in print', () => {
  // globals.css resets every border radius in print; the PDF prints the Preview
  // under print media. The browser check is e2e/swiss-executive-template.spec.ts.
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const printBlock = globals.slice(globals.indexOf('@media print'))

  it('restores the photo’s radius, scoped to this template', () => {
    expect(/\.swiss-executive-template \.swiss-executive-photo\s*\{\s*border-radius:\s*([^;!]+?)\s*!important;/.exec(printBlock)?.[1]).toBe('50%')
    expect(SOURCE).toContain("borderRadius: '50%'")
    expect(SOURCE).toContain('className="swiss-executive-photo shrink-0 overflow-hidden"')
  })

  it('prints every page with SWISS_EXECUTIVE_GEOMETRY.pageTop and .pageBottom, page 1 starting where it does on screen', () => {
    expect(printBlock).toMatch(/html:has\(\.swiss-executive-template\),\s*body:has\(\.swiss-executive-template\)\s*\{\s*page:\s*swiss-executive;\s*\}/)
    const rule = /@page swiss-executive\s*\{([^}]*)\}/.exec(printBlock)?.[1].trim()
    expect(rule?.split(/\s*;\s*/).filter(Boolean)).toEqual([`margin-top: ${G.pageTop}px`, `margin-bottom: ${G.pageBottom}px`])
    const padding = /\.swiss-executive-template\s*\{([^}]*)\}/.exec(printBlock)?.[1].trim()
    expect(padding?.split(/\s*;\s*/).filter(Boolean)).toEqual([`padding-top: ${G.paddingTop - G.pageTop}px !important`, 'padding-bottom: 0 !important'])
    expect(SOURCE).toContain('padding: `${GEOMETRY.paddingTop}px ${GEOMETRY.paddingX}px ${GEOMETRY.paddingBottom}px`')
    // Print only: nothing outside the print block names the page or sets its margins.
    expect(globals.slice(0, globals.indexOf('@media print'))).not.toMatch(/swiss-executive/)
  })
})

describe('swissExecutive draws the photo only when there is one (FR-5, FR-14)', () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

  it('draws the photo round, in its gold ring, at the right of the header', () => {
    const header = headerOf(render(resume(), en, { photoUrl: PHOTO }))
    expect(header.indexOf(`src="${PHOTO}"`)).toBeGreaterThan(header.indexOf('imhof.test'))
    expect(header).toContain(
      `width:${G.photo}px;height:${G.photo}px;border-radius:50%;border-width:${G.photoRing}px;border-style:solid;border-color:${PALETTE.gold.css};background-color:${PALETTE.photoFill.css}`,
    )
  })

  it('draws no frame without a photo or with the photo unticked', () => {
    expect(render(resume())).not.toContain('swiss-executive-photo')
    expect(render(resume(), en, { photoUrl: PHOTO, hiddenContactFields: ['photo'] })).toBe(render(resume()))
  })

  it('draws no CV title and no unticked contact detail', () => {
    const html = withoutWbr(render(resume(), en, { hiddenContactFields: ['title', 'email', 'website'] }))
    expect(html).not.toContain('tracking-widest')
    expect(html).not.toContain('catherine@imhof.test')
    expect(html).not.toContain('imhof.test<')
    // The line ends without a dangling dot.
    expect(decode(html)).toContain('<span class="max-w-full">linkedin.test/in/imhof</span></p>')
  })

  it('draws no upload box in the CV: the photo is uploaded from the Contact tab', () => {
    const html = render(resume(), fr as typeof en, { locale: 'fr' })
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
    expect(html).not.toContain('<button')
  })
})
