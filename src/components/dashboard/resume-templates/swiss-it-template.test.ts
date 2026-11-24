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
import { SWISS_IT_GEOMETRY, SWISS_IT_MONO_FONT, SWISS_IT_SIZES, swissItHeading } from '@/lib/swiss-it-template'
import { SwissItTemplate } from './swiss-it-template'

/**
 * `swiss-it-template.tsx`: the server render the Preview and the PDF depend on
 * (FR-9), and the print, layout and word-wrapping rules pinned in its source,
 * as `swiss-engineering-template.test.ts` pins its own. A printed radius is
 * only observable in a browser's print; each assertion names the rule it
 * holds, and `e2e/swiss-it-template.spec.ts` checks the browser.
 */

const SOURCE = readFileSync(path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-it-template.tsx'), 'utf8')

const PALETTE = PREVIEW_PALETTE.swissIt

/** The monospace stack as React writes it into a style attribute. */
const MONO_STYLE = `font-family:${SWISS_IT_MONO_FONT.replace(/"/g, '&quot;')}`

function resume(overrides: Partial<Record<string, unknown>> = {}): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Full-stack developer',
    template: 'swissIt',
    contact: {
      name: 'Aline Berset',
      email: 'aline@berset.test',
      phone: '+41 00 000 00 07',
      location: 'Oxbridge',
      github: 'github.test/aline',
      website: 'aline.test',
    },
    summary: 'Developer of public web applications.',
    skills: [
      { category: 'Languages', items: [], skillsHtml: '<p>TypeScript, Spring Boot</p>', visible: true },
      { category: 'Hidden', items: ['Hidden skill'], visible: false },
    ],
    experience: [
      {
        company: 'Swiss Digital Services',
        position: 'Full-stack developer',
        location: 'Oxbridge',
        startDate: '2021-01',
        current: true,
        achievements: ['Rebuilt the citizen portal.'],
        visible: true,
      },
    ],
    projects: [
      { name: 'Booking tool', description: 'Rooms for clubs.', technologies: ['Next.js', 'Supabase'], url: 'example.test/booking', visible: true },
      { name: 'Energy dashboard', description: 'Live consumption.', technologies: ['Python'], visible: true },
      { name: 'Third project', description: 'Alone on its row.', visible: true },
      { name: 'Hidden project', description: 'Not drawn.', visible: false },
    ],
    education: [{ school: 'BFH', degree: 'Bachelor in computer science', field: 'Biel', startDate: '2018-09', endDate: '2021-06', visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    certifications: [{ name: 'Cloud Developer', issuer: 'Example Cloud', date: '2023-05', visible: true }],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

const render = (row: Resume, dict: typeof en = en, props: Record<string, unknown> = {}) =>
  renderToString(createElement(SwissItTemplate, { resume: row, locale: (props.locale as 'en' | undefined) ?? 'en', dict, ...props }))

const VOID_ELEMENTS = new Set(['img', 'br', 'input'])

/** Entities decoded, and no-break spaces read as spaces. */
const decode = (text: string) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/\u00A0/g, ' ')

/** `html` without its `<wbr>`s: a line-break opportunity, not text, so the text on both sides of one reads as one. */
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

describe('swissIt renders on the server (FR-9)', () => {
  it('renders rich text without touching the DOM, leaving the sanitiser wrappers to the browser', () => {
    const html = render(resume({ summary: '<p>Developer of <strong>public</strong> applications.</p>' }))
    expect(html.split('class="formatted-content"').length - 1).toBeGreaterThan(0)
  })

  it('draws no heading and no band at all for a CV with no content', () => {
    const empty = { contact: {}, title: '', summary: '', skills: [], experience: [], projects: [], education: [], languages: [], certifications: [] }
    const html = render(resume(empty))
    expect(headings(html)).toEqual([])
    expect(html).not.toContain('<header')
  })
})

describe('swissIt draws the mockup', () => {
  it('draws the sections in the mockup order, each "// label" in lower case', () => {
    const t = en.resumes.template
    expect(headings(render(resume()))).toEqual(
      [t.summary, t.skills, t.experience, t.projects, t.education, `${t.languages} & ${t.training}`].map((label) => swissItHeading(label, 'en')),
    )
  })

  it.each([
    ['fr', fr],
    ['de', de],
  ] as const)('heads the sections in %s with that locale’s labels, the projects under the new label (FR-6)', (locale, dict) => {
    const html = render(resume(), dict as typeof en, { locale })
    expect(headings(html)).toContain(`// ${dict.resumes.template.projects.toLocaleLowerCase(locale)}`)
    expect(headings(html)).toContain(`// ${dict.resumes.template.experience.toLocaleLowerCase(locale)}`)
  })

  it('draws every heading in bold green monospace', () => {
    const html = render(resume())
    const count = html.split(`<h2 class="font-bold" style="color:${PALETTE.heading.css};${MONO_STYLE};font-size:${SWISS_IT_SIZES.heading}px`).length - 1
    expect(count).toBe(6)
  })

  it('draws the band: name in white, the title behind its prompt in green monospace, the contact lines in grey monospace', () => {
    const header = withoutWbr(headerOf(render(resume())))
    expect(header).toContain(`style="background-color:${PALETTE.ink.css};padding:${SWISS_IT_GEOMETRY.bandPaddingY}px ${SWISS_IT_GEOMETRY.paddingX}px`)
    expect(header).toContain(`<h1 class="font-bold" style="color:${PALETTE.name.css};font-size:${SWISS_IT_SIZES.name}px`)
    expect(header).toContain(`<p style="color:${PALETTE.prompt.css};${MONO_STYLE};font-size:${SWISS_IT_SIZES.title}px`)
    expect(decode(header)).toContain('> Full-stack developer</p>')
    expect(header).toContain(`<div style="color:${PALETTE.contact.css};${MONO_STYLE};font-size:${SWISS_IT_SIZES.contact}px`)
    // Two lines: where to reach, then the links, GitHub and website included.
    const lines = [...header.matchAll(/<p class="flex flex-wrap"[^>]*>([\s\S]*?)<\/p>/g)].map(([, inner]) =>
      [...inner.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(([, text]) => decode(text).trim()),
    )
    expect(lines).toEqual([
      ['Oxbridge \u00B7', '+41 00 000 00 07 \u00B7', 'aline@berset.test'],
      ['github.test/aline \u00B7', 'aline.test'],
    ])
  })

  it('draws each skill category as its label then its skills as green outlined tags, on one wrapping row', () => {
    const html = render(resume())
    const row = /<div class="flex flex-wrap items-center break-inside-avoid"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''
    expect(decode(row)).toMatch(/^<span class="font-bold" style="color:#0f172a">Languages: <\/span>/)
    const tags = [...row.matchAll(/<span class="swiss-it-tag max-w-full" style="([^"]*)">([^<]*)<\/span>/g)]
    expect(tags.map(([, , text]) => decode(text).trim())).toEqual(['TypeScript', 'Spring Boot'])
    expect(tags[0][1]).toContain(
      `color:${PALETTE.tagText.css};background-color:${PALETTE.tagFill.css};border-width:${SWISS_IT_GEOMETRY.tagBorder}px;border-style:solid;border-color:${PALETTE.tagBorder.css};border-radius:${SWISS_IT_GEOMETRY.tagRadius}px`,
    )
    expect(html).not.toContain('Hidden skill')
  })

  it('stacks a category whose rich text is not a list of skills: its label, then the sanitized text', () => {
    const html = render(resume({ skills: [{ category: 'Tools', skillsHtml: '<ul><li>Docker</li></ul>', visible: true }] }))
    expect(html).toContain('<p class="font-bold" style="color:#0f172a">Tools:</p>')
    expect(html).toContain('class="formatted-content"')
  })

  it('lays the projects two to a row as bordered cards, an odd last card alone in the left column', () => {
    const html = render(resume())
    const rows = [...html.matchAll(/<div class="grid grid-cols-2"[^>]*>([\s\S]*?)(?=<div class="grid grid-cols-2"|<\/section>)/g)].map(([, inner]) => inner)
    expect(rows).toHaveLength(2)
    expect(rows[0].split('class="swiss-it-card').length - 1).toBe(2)
    expect(rows[1].split('class="swiss-it-card').length - 1).toBe(1)
    expect(html).toContain(
      `class="swiss-it-card min-w-0 break-inside-avoid" style="border-width:${SWISS_IT_GEOMETRY.cardBorder}px;border-style:solid;border-color:${PALETTE.cardBorder.css};border-radius:${SWISS_IT_GEOMETRY.cardRadius}px`,
    )
    // The card's content: bold name, description, link, then the technologies as tags.
    const card = withoutWbr(rows[0].slice(0, rows[0].indexOf('Energy dashboard')))
    const at = ['Booking tool', 'Rooms for clubs.', 'example.test/booking', '>Next.js', '>Supabase'].map((text) => card.indexOf(text))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).not.toContain('Hidden project')
  })

  it('draws a project with no name as its description alone, and no heading without a project', () => {
    const html = render(resume({ projects: [{ name: '', description: 'Only a description.', visible: true }] }))
    expect(html).toContain('Only a description.')
    expect(html).not.toMatch(/<p class="font-bold" style="color:#0f172a"><\/p>/)
    expect(headings(render(resume({ projects: [{ name: 'Hidden', visible: false }] })))).not.toContain(swissItHeading(en.resumes.template.projects, 'en'))
  })

  it('draws an experience as its bold position, the dates at its right in grey monospace, then the company line in grey', () => {
    const html = render(resume())
    expect(decode(html)).toContain(
      `<p class="min-w-0 font-bold" style="color:${PALETTE.ink.css}">Full-stack developer </p><p class="shrink-0 whitespace-nowrap" style="color:${PALETTE.muted.css};${decode(MONO_STYLE)};font-size:${SWISS_IT_SIZES.date}px">01.2021 – ${en.resumes.template.present}</p>`,
    )
    expect(html).toContain(`<p style="color:${PALETTE.muted.css}">Swiss Digital Services, Oxbridge</p>`)
  })

  it('draws the company as the bold first line of an experience with no position, once', () => {
    const html = render(resume({ experience: [{ company: 'Swiss Digital Services', position: '', startDate: '2021-01', current: true, visible: true }] }))
    expect(html.split('Swiss Digital Services').length - 1).toBe(1)
    expect(decode(html)).toContain('font-bold" style="color:#0f172a">Swiss Digital Services </p>')
  })

  it('draws an education as its bold degree, the dates at its right, then "school, field" in grey', () => {
    const html = render(resume())
    expect(decode(html)).toContain('Bachelor in computer science </p>')
    expect(html).toContain('09.2018 – 06.2021')
    expect(html).toContain(`<p style="color:${PALETTE.muted.css}">BFH, Biel</p>`)
  })

  it('draws the languages on one line and the certifications on the next, under one heading', () => {
    const html = render(resume())
    expect(html).toContain(`<p>Esperanto — ${en.resumes.editor.levels.native}</p>`)
    expect(html).toContain('Cloud Developer – Example Cloud (05.2023)</p>')
  })

  it('heads the last section with the one label it holds, and draws no heading without either', () => {
    const t = en.resumes.template
    expect(headings(render(resume({ certifications: [] }))).at(-1)).toBe(swissItHeading(t.languages, 'en'))
    expect(headings(render(resume({ languages: [] }))).at(-1)).toBe(swissItHeading(t.training, 'en'))
    const neither = headings(render(resume({ languages: [], certifications: [{ name: '', issuer: '', date: '', visible: true }] })))
    expect(neither.at(-1)).toBe(swissItHeading(t.education, 'en'))
    const hidden = headings(render(resume(), en, { hiddenSidebarSections: ['languages'] }))
    expect(hidden.at(-1)).toBe(swissItHeading(t.training, 'en'))
  })

  it('leaves out the sections the layout hides, through either panel, heading included', () => {
    const html = render(resume(), en, { hiddenMainSections: ['summary'], hiddenSidebarSections: ['keyAchievements', 'skills'] })
    expect(html).not.toContain('Developer of public web applications.')
    expect(html).not.toContain('Booking tool')
    expect(html).not.toContain('TypeScript')
    expect(headings(html)[0]).toBe(swissItHeading(en.resumes.template.experience, 'en'))
  })

  it('sizes every text it draws: nothing inherits an unset size', () => {
    const sizes = textSizes(render(resume(), en, { photoUrl: 'data:image/png;base64,iVBORw0KGgo=' }))
    expect(sizes.filter(({ fontSize }) => fontSize === null).map(({ text }) => text)).toEqual([])
    const sizeOf = (text: string) => sizes.find((entry) => entry.text === text)?.fontSize
    expect(sizeOf('Aline Berset')).toBe(`${SWISS_IT_SIZES.name}px`)
    expect(sizeOf('aline.test')).toBe(`${SWISS_IT_SIZES.contact}px`)
    expect(sizeOf('Developer of public web applications.')).toBe(`${SWISS_IT_SIZES.body}px`)
    expect(sizeOf('TypeScript')).toBe(`${SWISS_IT_SIZES.tag}px`)
    expect(sizeOf('Booking tool')).toBe(`${SWISS_IT_SIZES.body}px`)
    expect(sizeOf(`01.2021 – ${en.resumes.template.present}`)).toBe(`${SWISS_IT_SIZES.date}px`)
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

describe('swissIt never cuts a word (owner rule, any language)', () => {
  const LONG = {
    name: 'Reservierungsplattform für Vereine',
    tag: 'Kubernetes Operator SDK',
    category: 'Kommunikationsfähigkeiten',
    degree: 'Bachelor in Wirtschaftsinformatik',
  }
  const html = render(
    resume({
      projects: [{ name: LONG.name, description: 'Datenbankadministration.', technologies: [LONG.tag], visible: true }],
      education: [{ school: 'BFH', degree: LONG.degree, visible: true }],
      skills: [{ category: LONG.category, items: ['Softwareentwicklung'], visible: true }],
    }),
    de as typeof en,
    { locale: 'de' },
  )

  it.each(Object.values(LONG))('lets nothing around "%s" break a word, but the document’s last resort', (text) => {
    const target = text === LONG.category ? `${text}:` : text
    const chain = ancestorsOf(html, target)
    const breaking = chain.filter((attributes) => WORD_BREAKING.test(attributes))
    expect(breaking).toHaveLength(1)
    expect(breaking[0]).toContain(LAST_RESORT)
    expect(breaking[0]).toMatch(/^ data-testid="resume-document" class="swiss-it-template /)
  })

  it('sets the last resort on the document only, and nowhere else', () => {
    expect(SOURCE.split("overflowWrap: 'break-word'").length - 1).toBe(1)
    expect(SOURCE.split("wordBreak: 'normal'").length - 1).toBe(1)
    expect(SOURCE).not.toMatch(/className="[^"]*(?:break-words|break-all|wrap-anywhere|hyphens-auto)/)
    expect(SOURCE).not.toMatch(/overflowWrap: 'anywhere'|wordBreak: 'break-all'|hyphens:/)
  })

  it('draws every tag and every contact value as a flex item of a wrapping row, so a line breaks only between two', () => {
    // A tag's parent is its row; the row wraps its items whole.
    const tagChain = ancestorsOf(html, LONG.tag)
    expect(tagChain.at(-1)).toMatch(/^ class="swiss-it-tag max-w-full"/)
    expect(tagChain.at(-2)).toMatch(/^ class="flex flex-wrap"/)
    const valueChain = ancestorsOf(render(resume()), '+41 00 000 00 07 \u00B7')
    expect(valueChain.at(-1)).toBe(' class="max-w-full"')
    expect(valueChain.at(-2)).toMatch(/^ class="flex flex-wrap"/)
  })

  it('marks a link’s boundaries with <wbr>, so a long link wraps after a "/" or before a "." and never at a letter', () => {
    const url = 'https://github.com/alineberset/energieverbrauchsueberwachungsplattform-backend-service'
    const markup = render(resume({ projects: [{ name: 'Energy', url, visible: true }] }))
    expect(markup).toContain(
      'https://<wbr/>github<wbr/>.com/<wbr/>alineberset/<wbr/>energieverbrauchsueberwachungsplattform<wbr/>-backend<wbr/>-service</p>',
    )
    // The contact values too, their separator kept in the last part's own text node.
    expect(render(resume())).toContain('github<wbr/>.test/<wbr/>aline\u00A0\u00B7\u00A0</span>')
    // A plain word carries none.
    expect(render(resume())).toContain('>Booking tool</p>')
  })

  it('keeps every date on one line, with nothing breaking inside it', () => {
    const chain = ancestorsOf(render(resume(), de as typeof en, { locale: 'de' }), `01.2021 – ${de.resumes.template.present}`)
    expect(chain.at(-1)).toContain('whitespace-nowrap')
  })
})

describe('swissIt keeps its round photo, its pill tags and its rounded cards in print', () => {
  // globals.css resets every border radius in print; the PDF prints the Preview
  // under print media. The browser check is e2e/swiss-it-template.spec.ts.
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const printBlock = globals.slice(globals.indexOf('@media print'))
  const printed = (selector: string) =>
    new RegExp(`\\.swiss-it-template \\.${selector}\\s*\\{\\s*border-radius:\\s*([^;!]+?)\\s*!important;`).exec(printBlock)?.[1]

  it('restores the photo’s, the tags’ and the cards’ radius, scoped to this template', () => {
    expect(printed('swiss-it-photo')).toBe('50%')
    expect(printed('swiss-it-tag')).toBe(`${SWISS_IT_GEOMETRY.tagRadius}px`)
    expect(printed('swiss-it-card')).toBe(`${SWISS_IT_GEOMETRY.cardRadius}px`)
    expect(SOURCE).toContain("borderRadius: '50%'")
    expect(SOURCE).toContain('borderRadius: `${GEOMETRY.tagRadius}px`')
    expect(SOURCE).toContain('borderRadius: `${GEOMETRY.cardRadius}px`')
  })

  it('prints page 1 with no top margin, so the band meets the paper’s edge, and every later page with SWISS_IT_GEOMETRY.pageTop', () => {
    const named = /html:has\(\.swiss-it-template\),\s*body:has\(\.swiss-it-template\)\s*\{\s*page:\s*swiss-it;\s*\}/
    expect(printBlock).toMatch(named)
    const pageRule = (selector: string) => new RegExp(`@page ${selector}\\s*\\{([^}]*)\\}`).exec(printBlock)?.[1].trim()
    expect(pageRule('swiss-it')?.split(/\s*;\s*/).filter(Boolean)).toEqual([
      `margin-top: ${SWISS_IT_GEOMETRY.pageTop}px`,
      `margin-bottom: ${SWISS_IT_GEOMETRY.pageBottom}px`,
    ])
    // The first page drops only its top margin: its foot keeps the page's.
    expect(pageRule('swiss-it:first')).toBe('margin-top: 0;')
    // The page's foot margin replaces the document's own foot padding in print.
    expect(printBlock).toMatch(/\.swiss-it-template\s*\{\s*padding-bottom:\s*0 !important;\s*\}/)
    expect(SOURCE).toContain('paddingBottom: `${GEOMETRY.paddingBottom}px`')
    // Print only: nothing outside the print block names the page or sets its margins.
    const screen = globals.slice(0, globals.indexOf('@media print'))
    expect(screen).not.toMatch(/swiss-it/)
    // The generic page keeps its own zero margin for every other template.
    expect(/@page\s*\{\s*margin:\s*0;/.test(printBlock)).toBe(true)
  })

  it('marks the photo frame, the tags and the cards with the classes the print rules and the e2e select', () => {
    expect(SOURCE).toContain('className="swiss-it-photo shrink-0 overflow-hidden"')
    expect(SOURCE).toContain('className="swiss-it-tag max-w-full"')
    expect(SOURCE).toContain('className="swiss-it-card min-w-0 break-inside-avoid"')
  })

  it('draws the band inside the page-wide document, so it prints edge to edge', () => {
    const html = render(resume())
    expect(html).toMatch(/^<div data-testid="resume-document" class="swiss-it-template [^"]*" style="[^"]*width:794px;padding-bottom:48px"><header /)
  })
})

describe('swissIt draws the photo only when there is one (FR-5, FR-14)', () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

  it('draws the photo round, in its green ring, at the right of the band', () => {
    const header = headerOf(render(resume(), en, { photoUrl: PHOTO }))
    expect(header.indexOf(`src="${PHOTO}"`)).toBeGreaterThan(header.indexOf('aline.test'))
    expect(header).toContain(
      `width:${SWISS_IT_GEOMETRY.photo}px;height:${SWISS_IT_GEOMETRY.photo}px;border-radius:50%;border-width:${SWISS_IT_GEOMETRY.photoRing}px;border-style:solid;border-color:${PALETTE.photoRing.css};background-color:${PALETTE.photoFill.css}`,
    )
  })

  it('draws no frame without a photo or with the photo unticked', () => {
    expect(render(resume())).not.toContain('swiss-it-photo')
    expect(render(resume(), en, { photoUrl: PHOTO, hiddenContactFields: ['photo'] })).toBe(render(resume()))
  })

  it('draws no CV title and no unticked contact detail, GitHub and website included', () => {
    const html = render(resume(), en, { hiddenContactFields: ['title', 'email', 'github', 'website'] })
    expect(html).not.toContain('&gt; Full-stack developer')
    expect(html).not.toContain('aline@berset.test')
    expect(html).not.toContain('github.test/aline')
    expect(html).not.toContain('aline.test<')
    // The first line ends without a dangling dot; the second line is gone.
    expect(decode(html)).toContain('<span class="max-w-full">+41 00 000 00 07</span></p></div>')
  })

  it('draws no upload box in the CV: the photo is uploaded from the Contact tab', () => {
    const html = render(resume(), fr as typeof en, { locale: 'fr' })
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
    expect(html).not.toContain('<button')
  })
})
