import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { convertCssColour } from '../../../../../../e2e/parity/colour'
import en from '@/locales/en/common.json'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { PREVIEW_PALETTE } from '@/lib/resume-palette'
import type { ResumeTemplate } from '@/types/database'
import { generateClassicDocx } from './docx-classic'
import { generateCreativeDocx } from './docx-creative'
import type { DocxGeneratorSettings } from './docx-helpers'
import { generateMinimalDocx } from './docx-minimal'
import { generateModernDocx } from './docx-modern'
import { generateProfessionalDocx } from './docx-professional'

/**
 * Part 3 US-003: every generator writes each text run in the colour the Preview
 * renders for that element.
 *
 * The expected colour of each element is the `PREVIEW_PALETTE` entry of
 * the class or inline style its template draws it with, converted by the parity
 * check's converter rather than the generators' own, so a generator that writes
 * any other hex — a stock Tailwind value, a rounded guess — fails here. Every
 * assertion reads the unzipped `word/document.xml`.
 *
 * Runs the Preview draws translucent over a backdrop (professional `opacity-80`,
 * modern `rgba(255,255,255,…)`, creative `text-white/90` and `/80`) and the text
 * that stands in for creative's level bars and pills have no palette colour and
 * are not pinned here.
 */

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

const GENERATORS: Readonly<Record<ResumeTemplate, Generator>> = {
  professional: generateProfessionalDocx,
  modern: generateModernDocx,
  classic: generateClassicDocx,
  minimal: generateMinimalDocx,
  creative: generateCreativeDocx,
}

/** One string per element, unique to it in the document. */
const MARK = {
  title: 'Palette Fidelity Title',
  name: 'Robin Palette',
  email: 'robin@palette.test',
  phone: '+41 00 000 0001',
  location: 'Palettetown',
  linkedin: 'linkedin.com/in/palette',
  summary: 'Quillwright summary',
  position: 'Kilnwright Engineer',
  company: 'Tessellate Freight',
  roleLocation: 'Oxbridge',
  roleYear: '2011',
  achievement: 'Tessellated achievement',
  secondPosition: 'Loomcaster Developer',
  description: 'Harbourline description',
  degree: 'Magister',
  field: 'Chromatics',
  school: 'Halvorsen Institute',
  schoolLocation: 'Umberton',
  educationYear: '1999',
  gpa: '3.9',
  educationDescription: 'Halvorsen thesis',
  skillCategory: 'Toolchain',
  skillItem: 'Zanzibarscript',
  project: 'Orbital Mapper',
  projectDescription: 'Orbital project description',
  technology: 'Quuxlang',
  language: 'Esperanto',
  level: 'Fluent',
  certificate: 'Typesetting Cert',
  issuer: 'Guild of Printers',
  certificateYear: '2003',
} as const

type Mark = keyof typeof MARK

const SECTION = en.resumes.editor.sections
const MAIN = en.resumes.template

function resumeRow() {
  return {
    title: MARK.title,
    contact: {
      name: MARK.name,
      email: MARK.email,
      phone: MARK.phone,
      location: MARK.location,
      linkedin: MARK.linkedin,
    },
    summary: `<p>${MARK.summary} builds document tooling.</p>`,
    experience: [
      {
        company: MARK.company,
        position: MARK.position,
        location: MARK.roleLocation,
        startDate: `${MARK.roleYear}-03`,
        current: true,
        achievements: [`${MARK.achievement} shipped the export pipeline.`],
        visible: true,
      },
      {
        company: 'Harbourline Studio',
        position: MARK.secondPosition,
        startDate: '2005-01',
        endDate: '2008-12',
        description: `<p>${MARK.description} of the typesetting service.</p>`,
        achievements: [],
        visible: true,
      },
    ],
    education: [
      {
        school: MARK.school,
        degree: MARK.degree,
        field: MARK.field,
        location: MARK.schoolLocation,
        startDate: '1997-09',
        endDate: `${MARK.educationYear}-06`,
        gpa: MARK.gpa,
        description: `${MARK.educationDescription} on layout engines.`,
        visible: true,
      },
    ],
    skills: [{ category: MARK.skillCategory, items: [MARK.skillItem, 'Rust'], visible: true }],
    projects: [
      {
        name: MARK.project,
        description: `<p>${MARK.projectDescription}.</p>`,
        technologies: [MARK.technology, 'Go'],
        visible: true,
      },
    ],
    languages: [{ language: MARK.language, level: MARK.level, visible: true }],
    certifications: [
      { name: MARK.certificate, issuer: MARK.issuer, date: `${MARK.certificateYear}-05`, visible: true },
    ],
    custom_sections: {},
    layout_settings: null,
  }
}

/** The generator settings `route.ts` builds from the resolved (here: default) layout. */
function settingsFor(row: ReturnType<typeof resumeRow>): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  return {
    fontFamily: layout.fontFamily,
    fontScale: layout.fontScale,
    titleFontSize: layout.titleFontSize,
    contactFontSize: layout.contactFontSize,
    sectionTitleFontSize: layout.sectionTitleFontSize,
    sectionDescFontSize: layout.sectionDescFontSize,
    locale: 'en',
    sidebarHue: layout.sidebarHue,
    sidebarSaturation: layout.sidebarSaturation,
    sidebarBrightness: layout.sidebarBrightness,
    sidebarWidth: layout.sidebarWidth,
    sidebarTopMargin: layout.sidebarTopMargin,
    mainContentTopMargin: layout.mainContentTopMargin,
    sidebarOrder: [...layout.sidebarOrder],
    mainContentOrder: [...layout.mainContentOrder],
    hiddenSidebarSections: [...layout.hiddenSidebarSections],
    hiddenMainSections: [...layout.hiddenMainSections],
  }
}

interface Shading {
  fill: string
  colour: string
}

interface Run {
  text: string
  colour: string | null
  shading: Shading | null
}

interface DocxParagraph {
  text: string
  /** Colours of the paragraph's borders (`w:pBdr`). */
  borders: string[]
  shading: Shading | null
}

const xmlByTemplate = new Map<ResumeTemplate, Promise<string>>()

/** The template's `word/document.xml`, generated once. */
function documentXml(template: ResumeTemplate): Promise<string> {
  let xml = xmlByTemplate.get(template)
  if (!xml) {
    xml = (async () => {
      const row = resumeRow()
      const zip = await JSZip.loadAsync(await GENERATORS[template](row, settingsFor(row)))
      const part = zip.file('word/document.xml')
      if (part === null) throw new Error(`The ${template} artifact has no word/document.xml`)
      return part.async('string')
    })()
    xmlByTemplate.set(template, xml)
  }
  return xml
}

const textOf = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text).join('')

function shadingOf(properties: string | undefined): Shading | null {
  const shd = properties ? /<w:shd ([^>]*)\/>/.exec(properties)?.[1] : undefined
  if (!shd) return null
  const attr = (name: string) => new RegExp(`w:${name}="([^"]*)"`).exec(shd)?.[1]?.toUpperCase() ?? ''
  return { fill: attr('fill'), colour: attr('color') }
}

/** Every text run of the document, in order, with its explicit colour and run shading. */
async function documentRuns(template: ResumeTemplate): Promise<Run[]> {
  const xml = await documentXml(template)
  return [...xml.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].flatMap(([, run]) => {
    const text = textOf(run)
    if (text === '') return []
    const properties = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1]
    return [{
      text,
      colour: /<w:color w:val="([0-9A-Fa-f]{6})"\/>/.exec(run)?.[1]?.toUpperCase() ?? null,
      shading: shadingOf(properties),
    }]
  })
}

/** Every paragraph of the document, with its borders and paragraph shading. */
async function documentParagraphs(template: ResumeTemplate): Promise<DocxParagraph[]> {
  const xml = await documentXml(template)
  return [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(([, paragraph]) => {
    const properties = /^<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraph)?.[1] ?? ''
    const borders = /<w:pBdr>([\s\S]*?)<\/w:pBdr>/.exec(properties)?.[1] ?? ''
    return {
      text: textOf(paragraph),
      borders: [...borders.matchAll(/w:color="([^"]*)"/g)].map(([, colour]) => colour.toUpperCase()),
      shading: shadingOf(properties.replace(/<w:pBdr>[\s\S]*?<\/w:pBdr>/, '')),
    }
  })
}

/** The shading of every table cell. */
async function cellShadings(template: ResumeTemplate): Promise<Shading[]> {
  const xml = await documentXml(template)
  return [...xml.matchAll(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/g)].flatMap(([, properties]) => {
    const shading = shadingOf(properties)
    return shading ? [shading] : []
  })
}

/**
 * The parity check's converter reads functional forms only, so a hex palette
 * entry is handed to it as the same colour in `rgb()`, as `verdicts.ts` does.
 */
function expected(css: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(css)
  const long = short ? `#${short.slice(1).map((digit) => digit + digit).join('')}` : css
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(long)
  const functional = hex ? `rgb(${hex.slice(1).map((pair) => parseInt(pair, 16)).join(', ')})` : css
  return convertCssColour(functional).hex.slice(1)
}

interface Case {
  /** What the case samples, for the failure message. */
  label: string
  /** Picks the element's runs. At least one must exist, and all must carry the colour. */
  matches: (run: Run) => boolean
  /** Which of the matching runs are the element's, where a string occurs in two elements. */
  occurrence: 'all' | 'first' | 'last'
  css: string
}

const lower = (text: string) => text.toLowerCase()
/** Case-insensitive: some templates upper-case titles, names and headings. */
const containing = (text: string) => (run: Run) => lower(run.text).includes(lower(text))
const exactly = (text: string) => (run: Run) => lower(run.text).trim() === lower(text)

type Palette = typeof PREVIEW_PALETTE

/** Case builders for one template, typed to that template's palette entries. */
function casesFor<T extends ResumeTemplate>(template: T) {
  const colour = (key: keyof Palette[T]) => (PREVIEW_PALETTE[template][key] as { css: string }).css
  return {
    has: (mark: Mark, key: keyof Palette[T], occurrence: Case['occurrence'] = 'all'): Case => ({
      label: mark,
      matches: containing(MARK[mark]),
      occurrence,
      css: colour(key),
    }),
    is: (label: string, text: string, key: keyof Palette[T], occurrence: Case['occurrence'] = 'all'): Case => ({
      label,
      matches: exactly(text),
      occurrence,
      css: colour(key),
    }),
    headings: (titles: readonly string[], key: keyof Palette[T]): Case[] =>
      titles.map((title) => ({ label: `heading "${title}"`, matches: exactly(title), occurrence: 'all', css: colour(key) })),
  }
}

const professional = casesFor('professional')
const modern = casesFor('modern')
const classic = casesFor('classic')
const minimal = casesFor('minimal')
const creative = casesFor('creative')

/** Per template, every text element the generator writes in a colour the Preview draws opaque. */
const CASES: Readonly<Record<ResumeTemplate, readonly Case[]>> = {
  professional: [
    // Sidebar, drawn by the sidebar's `text-white`. Key achievements are the projects.
    professional.has('name', 'white'),
    ...professional.headings([MAIN.keyAchievements, MAIN.skills, MAIN.languages, MAIN.training], 'white'),
    professional.has('project', 'white'),
    professional.is('skill category', `${MARK.skillCategory}:`, 'white'),
    professional.is('language', MARK.language, 'white'),
    professional.has('certificate', 'white'),
    professional.has('issuer', 'white'),
    professional.has('certificateYear', 'white'),
    // Main column, inline oklch colours.
    professional.has('title', 'heading'),
    ...professional.headings([MAIN.summary, MAIN.experience, MAIN.education], 'heading'),
    professional.has('position', 'heading'),
    professional.is('achievement bullet', '•', 'heading'),
    professional.has('degree', 'heading'),
    professional.has('field', 'heading'),
    professional.has('email', 'meta'),
    professional.has('company', 'meta'),
    professional.has('roleLocation', 'meta'),
    professional.has('school', 'meta'),
    professional.has('gpa', 'meta'),
    professional.has('roleYear', 'date'),
    professional.has('educationYear', 'date'),
    professional.has('schoolLocation', 'date'),
    professional.has('summary', 'body'),
    professional.has('achievement', 'body'),
    professional.has('description', 'body'),
  ],
  modern: [
    // Sidebar: the opaque `#FFFFFF` text; the translucent labels, school, level,
    // issuer and date are US-006's.
    ...modern.headings([SECTION.education, SECTION.skills, SECTION.languages, SECTION.certifications], 'white'),
    modern.is('contact email', MARK.email, 'white'),
    modern.is('contact location', MARK.location, 'white', 'first'),
    modern.has('degree', 'white'),
    modern.is('skill category', MARK.skillCategory, 'white'),
    modern.has('skillItem', 'white'),
    modern.is('language', MARK.language, 'white'),
    modern.has('certificate', 'white'),
    modern.has('title', 'white'),
    // Main column.
    modern.has('name', 'slate-900'),
    modern.is('project name', MARK.project, 'slate-900'),
    ...modern.headings([SECTION.summary, SECTION.experience, SECTION.projects], 'heading'),
    modern.has('position', 'heading'),
    modern.is('company', MARK.company, 'heading'),
    modern.is('header location', MARK.location, 'meta', 'last'),
    modern.has('roleYear', 'meta'),
    modern.is('role location', MARK.roleLocation, 'meta'),
    modern.has('summary', 'slate-700'),
    modern.has('projectDescription', 'slate-700'),
    modern.has('technology', 'slate-700'),
    modern.has('achievement', 'experienceBody'),
    modern.has('description', 'experienceBody'),
  ],
  classic: [
    classic.has('title', 'slate-900'),
    ...classic.headings(
      [SECTION.summary, SECTION.experience, SECTION.education, SECTION.skills, SECTION.projects, SECTION.languages, SECTION.certifications],
      'slate-900',
    ),
    classic.has('position', 'slate-900'),
    classic.has('degree', 'slate-900'),
    classic.has('skillCategory', 'slate-900'),
    classic.is('project name', MARK.project, 'slate-900'),
    classic.is('language', MARK.language, 'slate-900'),
    classic.has('certificate', 'slate-900'),
    classic.has('summary', 'slate-800'),
    classic.has('achievement', 'slate-800'),
    classic.is('achievement bullet', '•', 'slate-800'),
    classic.has('description', 'slate-800'),
    classic.has('educationDescription', 'slate-800'),
    classic.has('skillItem', 'slate-800'),
    classic.has('projectDescription', 'slate-800'),
    classic.has('email', 'slate-700'),
    classic.has('company', 'slate-700'),
    classic.has('school', 'slate-700'),
    classic.has('technology', 'slate-700'),
    classic.is('technologies label', 'Technologies:', 'slate-700'),
    classic.has('level', 'slate-700'),
    classic.has('issuer', 'slate-700'),
    classic.has('linkedin', 'slate-600'),
    classic.has('roleYear', 'slate-600'),
    classic.has('roleLocation', 'slate-600'),
    classic.has('educationYear', 'slate-600'),
    classic.has('gpa', 'slate-600'),
    classic.is('GPA label', 'GPA:', 'slate-600'),
    classic.has('certificateYear', 'slate-600'),
  ],
  minimal: [
    minimal.has('title', 'slate-900'),
    minimal.has('position', 'slate-900'),
    minimal.is('project name', MARK.project, 'slate-900'),
    minimal.has('degree', 'slate-900'),
    ...minimal.headings(
      [SECTION.summary, SECTION.experience, SECTION.education, SECTION.skills, SECTION.projects, SECTION.languages, SECTION.certifications],
      'slate-400',
    ),
    minimal.is('achievement bullet', '•', 'slate-400'),
    minimal.has('certificateYear', 'slate-400'),
    minimal.has('achievement', 'slate-700'),
    minimal.has('description', 'slate-700'),
    minimal.has('projectDescription', 'slate-700'),
    minimal.has('skillCategory', 'slate-700'),
    minimal.is('language', MARK.language, 'slate-700'),
    minimal.has('certificate', 'slate-700'),
    minimal.has('summary', 'slate-600'),
    minimal.has('skillItem', 'slate-600'),
    minimal.has('company', 'slate-600'),
    minimal.has('school', 'slate-600'),
    minimal.has('email', 'slate-500'),
    minimal.has('roleYear', 'slate-500'),
    minimal.has('technology', 'slate-500'),
    minimal.has('educationYear', 'slate-500'),
    minimal.has('gpa', 'slate-500'),
    minimal.has('level', 'slate-500'),
    minimal.has('issuer', 'slate-500'),
  ],
  creative: [
    creative.has('title', 'white'),
    creative.has('email', 'white'),
    ...creative.headings(
      [SECTION.skills, SECTION.languages, SECTION.certifications, SECTION.experience, SECTION.projects, SECTION.education],
      'purple-600',
    ),
    creative.is('company', MARK.company, 'purple-600'),
    creative.has('school', 'purple-600'),
    creative.has('roleYear', 'purple-700'),
    creative.has('educationYear', 'purple-700'),
    creative.is('achievement bullet', '▸', 'purple-500'),
    creative.has('position', 'slate-900'),
    creative.is('project name', MARK.project, 'slate-900'),
    creative.has('degree', 'slate-900'),
    creative.has('skillCategory', 'slate-800'),
    creative.is('language', MARK.language, 'slate-800'),
    creative.has('certificate', 'slate-800'),
    creative.has('achievement', 'slate-700'),
    creative.has('description', 'slate-700'),
    creative.has('projectDescription', 'slate-700'),
    creative.has('skillItem', 'slate-700'),
    creative.has('issuer', 'slate-600'),
    creative.is('role location', MARK.roleLocation, 'slate-600'),
    creative.has('gpa', 'slate-600'),
    creative.has('certificateYear', 'slate-500'),
  ],
}

function pick(runs: readonly Run[], occurrence: Case['occurrence']): readonly Run[] {
  if (occurrence === 'all' || runs.length === 0) return runs
  return occurrence === 'first' ? runs.slice(0, 1) : runs.slice(-1)
}

describe.each(Object.keys(CASES) as ResumeTemplate[])('%s DOCX text colour', (template) => {
  it.each(CASES[template].map((c) => [c.label, c] as const))('%s is the colour the Preview renders', async (_label, c) => {
    const matching = (await documentRuns(template)).filter(c.matches)
    expect(matching.length, `${template}: no run for ${c.label}`).toBeGreaterThan(0)
    if (c.occurrence !== 'all') {
      expect(matching.length, `${template}: ${c.label} is expected in exactly two elements`).toBe(2)
    }
    for (const run of pick(matching, c.occurrence)) {
      expect(run.colour, `${template} ${c.label}: "${run.text}"`).toBe(expected(c.css))
    }
  })
})

// ---------------------------------------------------------------------------
// Borders and fills
// ---------------------------------------------------------------------------

const hexOf = <T extends ResumeTemplate>(template: T, key: keyof Palette[T]) =>
  expected((PREVIEW_PALETTE[template][key] as { css: string }).css)

/** Each heading paragraph named carries a border, and every border it carries is the colour. */
async function expectHeadingRules(template: ResumeTemplate, titles: readonly string[], colour: string) {
  const paragraphs = await documentParagraphs(template)
  for (const title of titles) {
    const heading = paragraphs.filter((p) => p.text.trim().toLowerCase() === title.toLowerCase())
    expect(heading.length, `${template}: one heading paragraph "${title}"`).toBe(1)
    expect(heading[0].borders.length, `${template}: heading "${title}" has no rule`).toBeGreaterThan(0)
    for (const border of heading[0].borders) expect(border, `${template}: heading "${title}" rule`).toBe(colour)
  }
}

/** The header rule: the one bordered paragraph with no text. */
async function expectHeaderRule(template: ResumeTemplate, colour: string) {
  const rules = (await documentParagraphs(template)).filter((p) => p.text === '' && p.borders.length > 0)
  expect(rules.length, `${template}: one header rule`).toBe(1)
  for (const border of rules[0].borders) expect(border, `${template}: header rule`).toBe(colour)
}

describe('DOCX borders and fills', () => {
  it('professional: the main heading underlines are the headings’ oklch(0.2 0 0)', async () => {
    await expectHeadingRules('professional', [MAIN.summary, MAIN.experience, MAIN.education], hexOf('professional', 'heading'))
  })

  it('professional: the sidebar heading rules are the sidebar’s border-white', async () => {
    await expectHeadingRules(
      'professional',
      [MAIN.keyAchievements, MAIN.skills, MAIN.languages, MAIN.training],
      hexOf('professional', 'white'),
    )
  })

  it('classic: the heading rules are border-slate-400 and the header rule border-slate-900', async () => {
    await expectHeadingRules(
      'classic',
      [SECTION.summary, SECTION.experience, SECTION.education, SECTION.skills, SECTION.projects, SECTION.languages, SECTION.certifications],
      hexOf('classic', 'slate-400'),
    )
    await expectHeaderRule('classic', hexOf('classic', 'slate-900'))
  })

  it('minimal: the heading rules are border-slate-200 and the header rule border-slate-300', async () => {
    await expectHeadingRules(
      'minimal',
      [SECTION.summary, SECTION.experience, SECTION.education, SECTION.skills, SECTION.projects, SECTION.languages, SECTION.certifications],
      hexOf('minimal', 'slate-200'),
    )
    await expectHeaderRule('minimal', hexOf('minimal', 'slate-300'))
  })

  it('creative: the header, cell and paragraphs, is filled with its gradient’s first stop, purple-600', async () => {
    const purple = hexOf('creative', 'purple-600')
    // Every cell fill of the document: the header, and since US-007 one card
    // per project and one cell per language-bar segment — four filled and one
    // empty for the fixture's single Fluent language. A fill this test does not
    // name fails it.
    expect(
      (await cellShadings('creative')).map((cell) => cell.fill).sort(),
      'creative: the header, the project cards and the language bar segments are the only shaded cells',
    ).toEqual(
      [
        purple,
        hexOf('creative', 'slate-50'),
        ...Array(4).fill(hexOf('creative', 'purple-500')),
        hexOf('creative', 'slate-200'),
      ].sort(),
    )

    const shaded = (await documentParagraphs('creative')).filter((p) => p.shading !== null)
    expect(shaded.some((p) => p.text.includes(MARK.title.toUpperCase())), 'creative: the title paragraph is shaded').toBe(true)
    for (const paragraph of shaded) {
      expect(paragraph.shading, `creative header paragraph "${paragraph.text}"`).toEqual({ fill: purple, colour: purple })
    }
  })

  it('creative: the date badges are filled bg-purple-100 and the pills the gradient’s first stop', async () => {
    const lavender = hexOf('creative', 'purple-100')
    const pill = hexOf('creative', 'purple-500')
    const shaded = (await documentRuns('creative')).filter((run) => run.shading !== null)
    for (const year of [MARK.roleYear, MARK.educationYear]) {
      expect(shaded.some((run) => run.text.includes(year)), `creative: the ${year} badge is shaded`).toBe(true)
    }
    // Since US-007 a technology is a shaded run too; every other shaded run is
    // a date badge, and a third fill would fail here.
    const [pills, badges] = [
      shaded.filter((run) => run.text.includes(MARK.technology) || run.text.includes('Go')),
      shaded.filter((run) => !(run.text.includes(MARK.technology) || run.text.includes('Go'))),
    ]
    expect(pills.map((run) => run.text.trim()), 'creative: one shaded run per technology').toEqual([MARK.technology, 'Go'])
    for (const run of pills) expect(run.shading, `creative pill "${run.text}"`).toEqual({ fill: pill, colour: 'AUTO' })
    for (const run of badges) expect(run.shading, `creative badge "${run.text}"`).toEqual({ fill: lavender, colour: lavender })
  })
})
