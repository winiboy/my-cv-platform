import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import { resolveResumeLayout } from '@/lib/layout-settings'
import {
  FORMATTED_CONTENT_LINE_HEIGHT,
  MODERN_LINE_HEIGHT,
  PREFLIGHT_LINE_HEIGHT,
  PROFESSIONAL_LINE_HEIGHT,
  TAILWIND_LEADING,
} from '@/lib/resume-line-height'
import type { ResumeTemplate } from '@/types/database'
import { generateClassicDocx } from './docx-classic'
import { generateCreativeDocx } from './docx-creative'
import type { DocxGeneratorSettings } from './docx-helpers'
import { generateMinimalDocx } from './docx-minimal'
import { generateModernDocx } from './docx-modern'
import { generateProfessionalDocx } from './docx-professional'

/**
 * Part 3 US-004: every generator writes the leading the Preview draws.
 *
 * CSS gives leading as a multiple of the font size. The expected spacing of an
 * element is therefore its Preview line height — the ratio its template draws
 * it with, from `resume-line-height.ts` — times the size of the run the
 * generator writes for it, in twips, as Word `exact` spacing. A Word `auto`
 * multiple scales the font's single-line height instead and fails here, as
 * does a ratio the Preview does not draw.
 *
 * The size is read from the run in the document, not recomputed, so these
 * tests pin the leading to whatever size the generator writes (US-011 owns
 * whether that size is right). Each case is checked at the default font scale
 * and at a non-default one, where the run size and the spacing must both move.
 */

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

const GENERATORS: Readonly<Record<ResumeTemplate, Generator>> = {
  professional: generateProfessionalDocx,
  modern: generateModernDocx,
  classic: generateClassicDocx,
  minimal: generateMinimalDocx,
  creative: generateCreativeDocx,
}

const MARK = {
  title: 'Leading Fidelity Title',
  name: 'Robin Leading',
  summary: 'Quillwright summary',
  position: 'Kilnwright Engineer',
  company: 'Tessellate Freight',
  achievement: 'Tessellated achievement',
  htmlAchievement: 'Formatted achievement',
  description: 'Harbourline description',
} as const

const SECTIONS = en.resumes.editor.sections
const MAIN = en.resumes.template

function resumeRow() {
  return {
    title: MARK.title,
    contact: { name: MARK.name, email: 'robin@leading.test', phone: '+41 00 000 0002', location: 'Leadville' },
    summary: `<p>${MARK.summary} builds document tooling.</p>`,
    experience: [
      {
        company: MARK.company,
        position: MARK.position,
        location: 'Oxbridge',
        startDate: '2011-03',
        current: true,
        achievements: [
          `${MARK.achievement} shipped the export pipeline.`,
          `<p>${MARK.htmlAchievement} <strong>halved</strong> the build.</p>`,
        ],
        visible: true,
      },
      {
        company: 'Harbourline Studio',
        position: 'Loomcaster Developer',
        startDate: '2005-01',
        endDate: '2008-12',
        description: `<p>${MARK.description} of the typesetting service.</p>`,
        achievements: [],
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Magister', field: 'Chromatics', startDate: '1997-09', endDate: '1999-06', visible: true },
    ],
    skills: [{ category: 'Toolchain', items: ['Zanzibarscript', 'Rust'], visible: true }],
    projects: [{ name: 'Orbital Mapper', description: '<p>Orbital project.</p>', technologies: ['Go'], visible: true }],
    languages: [{ language: 'Esperanto', level: 'Fluent', visible: true }],
    certifications: [{ name: 'Typesetting Cert', issuer: 'Guild of Printers', date: '2003-05', visible: true }],
    custom_sections: {},
    layout_settings: null,
  }
}

/** The generator settings `route.ts` builds from the resolved (default) layout, at a chosen font scale. */
function settingsFor(row: ReturnType<typeof resumeRow>, fontScale: number): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  return {
    fontFamily: layout.fontFamily,
    fontScale,
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

interface Artifact {
  document: string
  styles: string
}

const artifacts = new Map<string, Promise<Artifact>>()

function artifact(template: ResumeTemplate, fontScale: number): Promise<Artifact> {
  const key = `${template}@${fontScale}`
  let found = artifacts.get(key)
  if (!found) {
    found = (async () => {
      const row = resumeRow()
      const zip = await JSZip.loadAsync(await GENERATORS[template](row, settingsFor(row, fontScale)))
      const read = async (name: string) => {
        const part = zip.file(name)
        if (part === null) throw new Error(`The ${template} artifact has no ${name}`)
        return part.async('string')
      }
      return { document: await read('word/document.xml'), styles: await read('word/styles.xml') }
    })()
    artifacts.set(key, found)
  }
  return found
}

interface Paragraph {
  text: string
  /** `w:spacing w:line`, or null when the paragraph writes none. */
  line: number | null
  lineRule: string | null
  before: number | null
  after: number | null
  /** `w:sz` of every run that carries text, in order. */
  runSizes: { text: string; halfPoints: number | null }[]
}

const textOf = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text).join('')
const attribute = (fragment: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(fragment)?.[1] ?? null

function paragraphsOf(documentXml: string): Paragraph[] {
  return [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(([, content]) => {
    // The paragraph mark's own run properties sit inside pPr and are not paragraph spacing.
    const properties = (/^<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(content)?.[1] ?? '').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '')
    const spacing = /<w:spacing\b[^>]*\/?>/.exec(properties)?.[0] ?? ''
    const line = attribute(spacing, 'w:line')
    return {
      text: textOf(content),
      line: line === null ? null : Number(line),
      lineRule: attribute(spacing, 'w:lineRule'),
      before: Number(attribute(spacing, 'w:before') ?? NaN) || null,
      after: Number(attribute(spacing, 'w:after') ?? NaN) || null,
      runSizes: [...content.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].flatMap(([, run]) => {
        const text = textOf(run)
        if (text === '') return []
        const size = /<w:sz w:val="(\d+)"\/>/.exec(run)?.[1]
        return [{ text, halfPoints: size === undefined ? null : Number(size) }]
      }),
    }
  })
}

const lower = (text: string) => text.toLowerCase()

interface Case {
  label: string
  /** Picks the element's paragraph: exactly one must match. */
  matches: (paragraph: Paragraph) => boolean
  /** Picks the run whose size the leading scales with. */
  run: (text: string) => boolean
  lineHeight: number
  /** Vertical padding of the element's own box, top plus bottom, in CSS px: it is filled, so it is in the line. */
  paddingPx?: number
  /**
   * A box drawn beside the text in the same row (creative's heading bar), in CSS px.
   * The row is at least this tall, and `items-center` centres the text in it, so the
   * paragraph keeps the text's leading and carries the rest as space above and below.
   */
  rowMinimumPx?: number
}

/** Twips the paragraph must write for a case, at the size of its run. */
function expectedLine(c: Case, halfPoints: number): number {
  return Math.round(c.lineHeight * halfPoints * 10 + (c.paddingPx ?? 0) * 15)
}

/** Twips of space the row's other box adds above the line, and again below it. */
function expectedRowPadding(c: Case, halfPoints: number): number {
  return Math.round(Math.max(0, (c.rowMinimumPx ?? 0) * 15 - expectedLine(c, halfPoints)) / 2)
}

const containing = (label: string, text: string, lineHeight: number, box: Pick<Case, 'paddingPx'> = {}): Case => ({
  label,
  matches: (p) => lower(p.text).includes(lower(text)),
  run: (run) => lower(run).includes(lower(text)),
  lineHeight,
  ...box,
})

/** Creative writes a "|" run before each heading, standing in for its bar. */
const headingText = (text: string) => lower(text.replace(/^[\s|]+/, '')).trim()

const heading = (title: string, lineHeight: number, rowMinimumPx?: number): Case => ({
  label: `heading "${title}"`,
  matches: (p) => headingText(p.text) === lower(title),
  run: (run) => lower(run).trim() === lower(title),
  lineHeight,
  ...(rowMinimumPx === undefined ? {} : { rowMinimumPx }),
})

const headings = (titles: readonly string[], lineHeight: number, rowMinimumPx?: number) =>
  titles.map((title) => heading(title, lineHeight, rowMinimumPx))

/** Creative's heading bars: `h-8` (32px) in the right column, `h-6` (24px) in the left. */
const CREATIVE_MAIN_BAR_PX = 32
const CREATIVE_SIDEBAR_BAR_PX = 24

const RELAXED = TAILWIND_LEADING['leading-relaxed']
const FORMATTED = FORMATTED_CONTENT_LINE_HEIGHT

/**
 * Per template, the title, headings and body text, each with the line height
 * its Preview element draws. Formatted (HTML) body text draws at
 * `.formatted-content`'s height on the two templates that render it there.
 */
const CASES: Readonly<Record<ResumeTemplate, readonly Case[]>> = {
  professional: [
    containing('title', MARK.title, PROFESSIONAL_LINE_HEIGHT.heading),
    containing('name', MARK.name, PROFESSIONAL_LINE_HEIGHT.heading),
    ...headings(
      [MAIN.summary, MAIN.experience, MAIN.education, MAIN.keyAchievements, MAIN.skills, MAIN.languages, MAIN.training],
      PROFESSIONAL_LINE_HEIGHT.heading,
    ),
    containing('plain achievement', MARK.achievement, PROFESSIONAL_LINE_HEIGHT.body),
    containing('formatted achievement', MARK.htmlAchievement, FORMATTED),
    containing('formatted summary', MARK.summary, FORMATTED),
    containing('formatted description', MARK.description, FORMATTED),
  ],
  modern: [
    containing('name (the document title)', MARK.name, MODERN_LINE_HEIGHT.title),
    // The accent bar: its inherited 1.5 line plus `padding: 4px 12px` above and below.
    containing('job title bar', MARK.title, PREFLIGHT_LINE_HEIGHT, { paddingPx: 8 }),
    ...headings(
      [SECTIONS.summary, SECTIONS.experience, SECTIONS.projects, SECTIONS.education, SECTIONS.skills, SECTIONS.languages],
      MODERN_LINE_HEIGHT.compact,
    ),
    containing('plain achievement', MARK.achievement, MODERN_LINE_HEIGHT.text),
    containing('formatted achievement', MARK.htmlAchievement, FORMATTED),
    containing('formatted summary', MARK.summary, FORMATTED),
    containing('formatted description', MARK.description, FORMATTED),
  ],
  classic: [
    containing('title', MARK.title, PREFLIGHT_LINE_HEIGHT),
    ...headings(
      [SECTIONS.summary, SECTIONS.experience, SECTIONS.education, SECTIONS.skills, SECTIONS.projects, SECTIONS.languages, SECTIONS.certifications],
      PREFLIGHT_LINE_HEIGHT,
    ),
    containing('achievement', MARK.achievement, PREFLIGHT_LINE_HEIGHT),
    containing('summary', MARK.summary, RELAXED),
    containing('description', MARK.description, RELAXED),
  ],
  minimal: [
    containing('title', MARK.title, PREFLIGHT_LINE_HEIGHT),
    ...headings(
      [SECTIONS.summary, SECTIONS.experience, SECTIONS.education, SECTIONS.skills, SECTIONS.projects, SECTIONS.languages, SECTIONS.certifications],
      PREFLIGHT_LINE_HEIGHT,
    ),
    containing('achievement', MARK.achievement, RELAXED),
    containing('summary', MARK.summary, RELAXED),
    containing('description', MARK.description, RELAXED),
  ],
  creative: [
    containing('title', MARK.title, PREFLIGHT_LINE_HEIGHT),
    ...headings([SECTIONS.experience, SECTIONS.projects, SECTIONS.education], PREFLIGHT_LINE_HEIGHT, CREATIVE_MAIN_BAR_PX),
    ...headings([SECTIONS.skills, SECTIONS.languages, SECTIONS.certifications], PREFLIGHT_LINE_HEIGHT, CREATIVE_SIDEBAR_BAR_PX),
    containing('achievement', MARK.achievement, PREFLIGHT_LINE_HEIGHT),
    containing('summary', MARK.summary, RELAXED),
    containing('description', MARK.description, RELAXED),
  ],
}

const TEMPLATES = Object.keys(CASES) as ResumeTemplate[]
/** 0.8 makes creative's headings smaller than 16px, where even the `h-6` bar is taller than the text line. */
const SCALES = [0.8, 1, 1.2] as const

describe.each(TEMPLATES)('%s DOCX line spacing', (template) => {
  describe.each(SCALES)('at font scale %s', (fontScale) => {
    it.each(CASES[template].map((c) => [c.label, c] as const))('%s is exact spacing at its Preview line height', async (_label, c) => {
      const paragraphs = paragraphsOf((await artifact(template, fontScale)).document).filter(c.matches)
      expect(paragraphs, `${c.label}: paragraphs matched`).toHaveLength(1)
      const [paragraph] = paragraphs
      const run = paragraph.runSizes.find((r) => c.run(r.text))
      expect(run?.halfPoints, `${c.label}: the run carries an explicit size`).toEqual(expect.any(Number))
      expect({ line: paragraph.line, lineRule: paragraph.lineRule }).toEqual({
        line: expectedLine(c, run?.halfPoints ?? 0),
        lineRule: 'exact',
      })
      if (c.rowMinimumPx !== undefined) {
        const padding = expectedRowPadding(c, run?.halfPoints ?? 0)
        expect({ before: paragraph.before ?? 0, after: paragraph.after }).toEqual({
          before: padding,
          // Whatever gap the section keeps below the heading, plus the row's own padding.
          after: expect.any(Number),
        })
        expect(paragraph.after ?? 0, `${c.label}: space after includes the row padding`).toBeGreaterThanOrEqual(padding)
      }
    })
  })

  it('scales the leading with the font scale', async () => {
    const [base, scaled] = await Promise.all([1, 1.2].map(async (s) => paragraphsOf((await artifact(template, s)).document)))
    // A row held open by a fixed-height bar does not grow with the text until the text is taller.
    for (const c of CASES[template].filter((x) => x.rowMinimumPx === undefined)) {
      const [a] = base.filter(c.matches)
      const [b] = scaled.filter(c.matches)
      expect(b.line ?? 0, `${c.label}: spacing at 1.2 against 1`).toBeGreaterThan(a.line ?? Infinity)
    }
  })

  it('ends a body that ends with a table on a 1-twip paragraph of its own', async () => {
    const { document } = await artifact(template, 1)
    const body = /<w:body>([\s\S]*)<w:sectPr\b/.exec(document)?.[1] ?? ''
    // The body's top-level children, in order: tables at depth 0, paragraphs outside any table.
    const children: { kind: 'tbl' | 'p'; xml: string }[] = []
    let depth = 0
    let tableStart = 0
    for (const token of body.matchAll(/<w:tbl>|<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) {
      if (token[0] === '<w:tbl>') {
        if (depth === 0) tableStart = token.index ?? 0
        depth += 1
      } else if (token[0] === '</w:tbl>') {
        depth -= 1
        if (depth === 0) children.push({ kind: 'tbl', xml: body.slice(tableStart, (token.index ?? 0) + 8) })
      } else if (depth === 0) {
        children.push({ kind: 'p', xml: token[0] })
      }
    }
    const lastTable = children.map((c) => c.kind).lastIndexOf('tbl')
    if (lastTable === -1) return
    const after = children.slice(lastTable + 1)
    expect(after.length, 'the body must not end with a table, or Word appends a paragraph at the default line').toBeGreaterThan(0)
    if (after.every((c) => !/<w:t[ >]/.test(c.xml))) {
      // Only empty paragraphs follow the last table: each must be the 1-twip trailing line.
      for (const c of after) {
        expect(c.xml).toMatch(/w:line="1"/)
        expect(c.xml).toMatch(/w:lineRule="exact"/)
      }
    }
  })

  it.each(SCALES)('leaves no paragraph, and no default, on a Word auto multiple (scale %s)', async (fontScale) => {
    const { document, styles } = await artifact(template, fontScale)
    for (const paragraph of paragraphsOf(document)) {
      // Text never relies on the document default; every paragraph that writes a
      // line writes its rule, because an omitted w:lineRule means auto.
      if (paragraph.text !== '') expect(paragraph.lineRule, `"${paragraph.text}"`).toBe('exact')
      if (paragraph.line !== null) expect(paragraph.lineRule, `"${paragraph.text}"`).toBe('exact')
    }
    expect(document).not.toMatch(/w:lineRule="auto"/)
    // No paragraph names a style, so no named style can supply a spacing of its own.
    expect(document).not.toMatch(/<w:pStyle\b/)
    const defaults = /<w:pPrDefault>([\s\S]*?)<\/w:pPrDefault>/.exec(styles)?.[1] ?? ''
    expect(attribute(/<w:spacing\b[^>]*\/?>/.exec(defaults)?.[0] ?? '', 'w:lineRule'), 'document default').toBe('exact')
  })
})
