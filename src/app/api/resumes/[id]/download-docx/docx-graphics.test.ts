import { inflateSync } from 'node:zlib'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { PREVIEW_GRAPHICS, type DocxGraphicForm } from '@/lib/resume-graphics'
import { RESUME_TEMPLATES } from '@/lib/resume-templates'
import type { ResumeTemplate } from '@/types/database'
import { solidColourPng } from './docx-disc'
import type { DocxGeneratorSettings } from './docx-helpers'
import { generateSwissVocationalDocx } from './docx-swiss-vocational'
import { generateSwissCommerceDocx } from './docx-swiss-commerce'
import { generateSwissTradesDocx } from './docx-swiss-trades'
import { generateSwissHealthDocx } from './docx-swiss-health'
import { generateSwissFinanceDocx } from './docx-swiss-finance'
import { generateSwissEngineeringDocx } from './docx-swiss-engineering'
import { generateSwissItDocx } from './docx-swiss-it'
import { generateSwissExecutiveDocx } from './docx-swiss-executive'
import { generateSwissAcademicDocx } from './docx-swiss-academic'
import { generateSwissFirstJobDocx } from './docx-swiss-first-job'

/**
 * Part 3 US-007: the bars, pills, chips, rules and markers the Preview draws
 * appear in the DOCX, in the form `resume-graphics.ts` records, in the colour
 * `resume-palette.ts` holds, and carrying the value the Preview shows.
 *
 * Everything is asserted on the unzipped `word/document.xml` of a generated
 * document, never on the generator's inputs: a bar that carried the right level
 * in a variable and wrote the wrong widths would pass a unit test of the helper
 * and fail here.
 *
 * Each Swiss generator's own test pins the colours of what it draws; this one
 * holds every recorded form to the OOXML the generator actually writes.
 */

/** One string per element, unique to it in the document it is read from. */
const MARK = {
  skillA: 'Zanzibarscript',
  skillB: 'Quuxlang',
  project: 'Orbital Mapper',
  technologies: ['Kiln', 'Tessellate'],
  position: 'Kilnwright Engineer',
  achievement: 'Tessellated achievement shipped the export pipeline.',
} as const

const LANGUAGES = [
  { language: 'Esperanto', level: 'Fluent', visible: true },
  { language: 'Volapuk', level: 'Basic', visible: true },
  { language: 'Interlingua', level: 'Native', visible: true },
  // Not one of the five the Preview recognises: it draws an empty bar, so the
  // DOCX draws an empty bar. The union in `types/database.ts` forbids this, but
  // stored rows are not typed.
  { language: 'Lojban', level: 'C2 - Proficient', visible: true },
]

function resumeRow() {
  return {
    title: 'Graphics Fidelity Title',
    contact: { name: 'Robin Graphics', email: 'robin@graphics.test' },
    summary: 'Quillwright graphics summary.',
    experience: [
      {
        company: 'Tessellate Freight',
        position: MARK.position,
        location: 'Kiln, CH',
        startDate: '2011-03',
        current: true,
        achievements: [MARK.achievement],
        visible: true,
      },
    ],
    education: [{ school: 'Halvorsen Institute', degree: 'Magister', startDate: '1997-09', endDate: '1999-06', visible: true }],
    skills: [{ category: 'Toolchain', items: [MARK.skillA, MARK.skillB], visible: true }],
    projects: [{ name: MARK.project, description: 'Orbital project description.', technologies: [...MARK.technologies], visible: true }],
    languages: LANGUAGES,
    certifications: [{ name: 'Typesetting Cert', issuer: 'Guild of Printers', date: '2003-05', visible: true }],
    custom_sections: {},
    layout_settings: null,
  }
}

/** The generator settings `route.ts` builds. */
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

// ---------------------------------------------------------------------------
// Reading the document
// ---------------------------------------------------------------------------

/**
 * Every `<tag>…</tag>` span, innermost first, counted by depth. A lazy regex
 * cannot do this: these documents nest tables inside table cells, so
 * `<w:tbl>[\s\S]*?</w:tbl>` would pair an outer opening tag with an inner
 * closing one.
 */
function elements(xml: string, tag: string): string[] {
  const token = new RegExp(`<${tag}(?:\\s[^>]*)?(/?)>|</${tag}>`, 'g')
  const open: number[] = []
  const found: { start: number; text: string }[] = []
  for (const match of xml.matchAll(token)) {
    const at = match.index ?? 0
    if (match[0].startsWith(`</`)) {
      const start = open.pop()
      if (start !== undefined) found.push({ start, text: xml.slice(start, at + match[0].length) })
    } else if (match[1] !== '/') {
      open.push(at)
    }
  }
  return found.sort((a, b) => a.start - b.start).map((entry) => entry.text)
}

const attribute = (fragment: string, element: string, name: string): string | null =>
  new RegExp(`<${element}\\b[^>]*\\s${name}="([^"]*)"`).exec(fragment)?.[1] ?? null

interface Run {
  text: string
  colour: string | null
  /** The `w:fill` of the run's own shading, uppercased, or null. */
  shading: string | null
}

interface Paragraph {
  text: string
  runs: Run[]
}

function paragraphs(xml: string): Paragraph[] {
  return elements(xml, 'w:p').map((paragraph) => {
    const runs = elements(paragraph, 'w:r').map((run) => ({
      text: [...run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, part]) => part).join(''),
      colour: /<w:color w:val="([0-9A-Fa-f]{6})"\/>/.exec(run)?.[1]?.toUpperCase() ?? null,
      shading: attribute(/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? '', 'w:shd', 'w:fill')?.toUpperCase() ?? null,
    }))
    return {
      text: runs.map((run) => run.text).join(''),
      runs,
    }
  })
}

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

const GENERATORS: Readonly<Record<ResumeTemplate, Generator>> = {
  swissVocational: generateSwissVocationalDocx,
  swissCommerce: generateSwissCommerceDocx,
  swissTrades: generateSwissTradesDocx,
  swissHealth: generateSwissHealthDocx,
  swissFinance: generateSwissFinanceDocx,
  swissEngineering: generateSwissEngineeringDocx,
  swissIt: generateSwissItDocx,
  swissExecutive: generateSwissExecutiveDocx,
  swissAcademic: generateSwissAcademicDocx,
  swissFirstJob: generateSwissFirstJobDocx,
}

const documents = new Map<string, Promise<string>>()

function documentXml(key: string, generate: Generator): Promise<string> {
  let cached = documents.get(key)
  if (!cached) {
    cached = (async () => {
      const row = resumeRow()
      const zip = await JSZip.loadAsync(await generate(row, settingsFor(row)))
      const part = zip.file('word/document.xml')
      if (part === null) throw new Error(`The ${key} artifact has no word/document.xml`)
      // A header's drawings are drawn on every page too (swissFirstJob's sidebar
      // fill), so the header parts are read with the body.
      const headers = await Promise.all(zip.file(/^word\/header\d*\.xml$/).map((header) => header.async('string')))
      return [await part.async('string'), ...headers].join('')
    })()
    documents.set(key, cached)
  }
  return cached
}

// ---------------------------------------------------------------------------
// The page-high fills
// ---------------------------------------------------------------------------

describe('a solid fill drawn as a raster', () => {
  it('draws a solid fill as an opaque PNG of exactly that colour, the same bytes every time', () => {
    const png = solidColourPng('#0D0DA4')
    expect(png.equals(solidColourPng('0d0da4'))).toBe(true)
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    // Larger than 1 × 1, which Word does not draw at all (measured).
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)]
    expect(width).toBeGreaterThan(1)
    // IDAT is the chunk after IHDR (8 signature + 25 IHDR bytes): every pixel 0D0DA4, alpha 255.
    const raw = inflateSync(png.subarray(33 + 8, 33 + 8 + png.readUInt32BE(33)))
    expect(raw.length).toBe((width * 4 + 1) * height)
    for (let y = 0; y < height; y += 1) {
      const line = raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1))
      for (let x = 0; x < width; x += 1) expect([...line.subarray(x * 4, x * 4 + 4)]).toEqual([0x0d, 0x0d, 0xa4, 255])
    }
  })
})

/**
 * `PREVIEW_GRAPHICS` says what form each graphic takes. Prose cannot be trusted
 * to stay true — the first version of this story recorded the project card as
 * paragraph shading while the generator emitted a table, and recorded the header
 * circles as undrawable while they were drawable — so every form is checked
 * here against the OOXML the generator actually writes.
 */
describe('every recorded form is the shape the generator emits', () => {
  /** What has to be present in the document for a form to be honestly claimed. */
  const EVIDENCE: Readonly<Record<DocxGraphicForm, (xml: string) => boolean>> = {
    'shaded-run': (xml) => paragraphs(xml).some((p) => p.runs.some((run) => run.shading !== null)),
    'cell-border': (xml) => elements(xml, 'w:tcBorders').some((borders) => /<w:left\b[^>]*w:val="single"/.test(borders)),
    'paragraph-bottom-border': (xml) =>
      elements(xml, 'w:p').some((p) => /<w:pBdr>(?:(?!<\/w:pBdr>)[\s\S])*?<w:bottom\b[^>]*w:val="(?:single|double)"/.test(p)),
    'shaded-cell': (xml) => elements(xml, 'w:tcPr').some((cell) => /<w:tcBorders>/.test(cell) && /<w:shd\b/.test(cell)),
    'floating-raster': (xml) => elements(xml, 'w:drawing').length > 0,
    'page-border': (xml) => /<w:pgBorders\b[\s\S]*?<w:left\b[^>]*w:val="single"/.test(xml),
    'not-drawn': () => true,
  }

  it.each(RESUME_TEMPLATES)('%s emits the shape it records for each of its graphics', async (template) => {
    const xml = await documentXml(template, GENERATORS[template])
    const graphics = PREVIEW_GRAPHICS[template]
    expect(Object.keys(graphics).length, `${template} records no graphics`).toBeGreaterThan(0)
    for (const [key, graphic] of Object.entries(graphics)) {
      expect(EVIDENCE[graphic.form as DocxGraphicForm], `${template}.${key}: "${graphic.form}" is not a known form`).toBeDefined()
      expect(
        EVIDENCE[graphic.form as DocxGraphicForm](xml),
        `${template}.${key} records form "${graphic.form}", which is not in the document it generates`,
      ).toBe(true)
    }
  })

  it('names a form the generators actually use, and no form they do not', () => {
    const recorded = new Set(
      RESUME_TEMPLATES.flatMap((template) =>
        Object.values(PREVIEW_GRAPHICS[template]).map((graphic) => graphic.form as string),
      ),
    )
    // Every form the union offers is either used by a graphic or gone from it;
    // `not-drawn` is the one form kept unused, for a graphic a story decides not
    // to draw.
    expect([...recorded].sort()).toEqual(
      ['cell-border', 'floating-raster', 'page-border', 'paragraph-bottom-border', 'shaded-cell', 'shaded-run'],
    )
  })
})
