import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { swissHeading } from '@/lib/swiss-vocational-template'
import { parseSfnt } from '@/test/font-tables'
import { TRUETYPE_SFNT_VERSION } from '@/lib/pdf/sfnt'
import type { DocxGeneratorSettings } from './docx-helpers'
import { interDocxFonts } from './docx-fonts'
import { generateSwissAcademicDocx } from './docx-swiss-academic'
import { generateSwissCommerceDocx } from './docx-swiss-commerce'
import { generateSwissEngineeringDocx } from './docx-swiss-engineering'
import { generateSwissExecutiveDocx } from './docx-swiss-executive'
import { generateSwissFinanceDocx } from './docx-swiss-finance'
import { generateSwissFirstJobDocx } from './docx-swiss-first-job'
import { generateSwissHealthDocx } from './docx-swiss-health'
import { generateSwissItDocx } from './docx-swiss-it'
import { generateSwissTradesDocx } from './docx-swiss-trades'
import { generateSwissVocationalDocx } from './docx-swiss-vocational'

/**
 * What every Swiss template's Word file needs to break its pages where the
 * PDF does (swiss-templates-only-page-fidelity US-005): Inter embedded where
 * the template draws it, and the entries print keeps whole kept whole.
 */

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

const GENERATORS: Record<string, Generator> = {
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

/** The templates drawn in Georgia (and Arial) only: standard system fonts, nothing embedded. */
const SYSTEM_FONT_TEMPLATES = ['swissFinance', 'swissAcademic']
const INTER_TEMPLATES = Object.keys(GENERATORS).filter((template) => !SYSTEM_FONT_TEMPLATES.includes(template))

/**
 * The templates whose entries Word keeps whole by their paragraphs' keep
 * rules: paragraphs in the flow or in a column, or (vocational, commerce) a
 * one-row table per entry that may split, so an entry taller than a page is
 * broken rather than clipped. In the others each entry is a table row that
 * does not split (`cantSplit`).
 */
const PARAGRAPH_ENTRY_TEMPLATES = [
  'swissVocational',
  'swissCommerce',
  'swissTrades',
  'swissEngineering',
  'swissIt',
  'swissExecutive',
  'swissFirstJob',
  'swissFinance',
]
const ROW_ENTRY_TEMPLATES = ['swissHealth', 'swissAcademic']

const BULLETS = ['Planned the weekly supply runs.', 'Cut stock-outs by a third.', 'Trained four new colleagues.']

function resumeRow(template: string) {
  return {
    id: `fidelity-${template}`,
    user_id: 'u1',
    template,
    title: 'Logistics lead',
    contact: {
      name: 'Lea Brunner',
      email: 'lea@brunner.test',
      phone: '+41 00 000 00 00',
      location: 'Thun',
      linkedin: 'linkedin.com/in/lea-brunner',
    },
    summary: 'Logistics lead with ten years in distribution.',
    experience: [
      { company: 'Aare Logistik', position: 'Supply planner', location: 'Thun', startDate: '2020-01', current: true, achievements: BULLETS, visible: true },
      { company: 'Berner Handel', position: 'Stock clerk', location: 'Bern', startDate: '2016-01', endDate: '2019-12', description: 'Kept the stock records.', visible: true },
    ],
    education: [{ school: 'HF Logistik', degree: 'Diploma in logistics', field: 'Supply chain', startDate: '2012-09', endDate: '2015-06', visible: true }],
    skills: [{ category: 'Tools', items: ['SAP', 'Excel'], visible: true }],
    languages: [{ language: 'German', level: 'Native', visible: true }],
    certifications: [{ name: 'Forklift licence', issuer: 'SUVA', date: '2014-03', visible: true }],
    projects: [{ name: 'Warehouse move', description: 'Moved two sites into one.', technologies: ['SAP'], visible: true }],
    layout_settings: null,
    custom_sections: null,
  }
}

function settingsFor(row: ReturnType<typeof resumeRow>): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row as never, null)
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
    hiddenContactFields: layout.hiddenContactFields,
  }
}

const packages = new Map<string, Promise<JSZip>>()
function packageOf(template: string): Promise<JSZip> {
  let zip = packages.get(template)
  if (!zip) {
    const row = resumeRow(template)
    zip = GENERATORS[template](row, settingsFor(row)).then((buffer) => JSZip.loadAsync(buffer))
    packages.set(template, zip)
  }
  return zip
}

async function partOf(template: string, name: string): Promise<string> {
  const file = (await packageOf(template)).file(name)
  if (!file) throw new Error(`${template}: no ${name}`)
  return file.async('string')
}

/** The OOXML deobfuscation: the first 32 bytes XORed with the font key's bytes, read backwards (ECMA-376 Part 1, 17.8.1). */
function deobfuscate(odttf: Buffer, fontKey: string): Buffer {
  const key = fontKey.replace(/[{}-]/g, '')
  const keyBytes = (key.match(/../g) as string[]).map((hex) => parseInt(hex, 16)).reverse()
  const font = Buffer.from(odttf)
  for (let index = 0; index < 32; index++) font[index] ^= keyBytes[index % keyBytes.length]
  return font
}

describe('Inter, embedded where the template draws it', () => {
  it.each(INTER_TEMPLATES)('%s: one Inter font entry with its regular and bold faces, keyed for obfuscation', async (template) => {
    const fontTable = await partOf(template, 'word/fontTable.xml')
    const entries = fontTable.match(/<w:font w:name="Inter">[\s\S]*?<\/w:font>/g) ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatch(/<w:embedRegular r:id="rId1" w:fontKey="\{[0-9a-f-]{36}\}"\/><w:embedBold r:id="rId2" w:fontKey="\{[0-9a-f-]{36}\}"\/><\/w:font>$/)
  })

  it.each(INTER_TEMPLATES)('%s: the faces are the package parts the font table names, as Word reads them', async (template) => {
    const zip = await packageOf(template)
    const fontTable = await partOf(template, 'word/fontTable.xml')
    const rels = await partOf(template, 'word/_rels/fontTable.xml.rels')
    const contentTypes = await partOf(template, '[Content_Types].xml')
    expect(contentTypes).toContain('<Default ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont" Extension="odttf"/>')
    const expected = await interDocxFonts()
    for (const [index, face] of [['rId1', 'embedRegular'], ['rId2', 'embedBold']].entries()) {
      const [id, element] = face
      const key = (new RegExp(`<w:${element} r:id="${id}" w:fontKey="(\\{[^}]+\\})"`).exec(fontTable) as RegExpExecArray)[1]
      const target = (new RegExp(`Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="([^"]+)"`).exec(rels) as RegExpExecArray)[1]
      const odttf = await (zip.file(`word/${target}`) as JSZip.JSZipObject).async('nodebuffer')
      expect(odttf.subarray(0, 32).equals(expected[index].data.subarray(0, 32)), 'stored obfuscated').toBe(false)
      const font = deobfuscate(odttf, key)
      expect(font.equals(expected[index].data)).toBe(true)
      const sfnt = parseSfnt(font)
      expect(sfnt.sfntVersion).toBe(TRUETYPE_SFNT_VERSION)
      expect(sfnt.tables.some(({ tag }) => tag === 'glyf')).toBe(true)
    }
  })

  it.each(INTER_TEMPLATES)('%s: draws regular and bold runs in Inter, the two faces embedded', async (template) => {
    const document = await partOf(template, 'word/document.xml')
    const styles = await partOf(template, 'word/styles.xml')
    expect(styles).toMatch(/<w:rPrDefault><w:rPr><w:rFonts w:ascii="Inter"/)
    expect(document).toMatch(/<w:b\/>/)
  })

  it.each(INTER_TEMPLATES)('%s: tells Word to keep the whole faces in the file when it is saved', async (template) => {
    const settings = await partOf(template, 'word/settings.xml')
    expect(settings.match(/<w:embedTrueTypeFonts\/>/g)).toHaveLength(1)
    expect(settings).not.toContain('saveSubsetFonts')
  })

  it.each(SYSTEM_FONT_TEMPLATES)('%s: drawn in standard system fonts, embeds nothing', async (template) => {
    const zip = await packageOf(template)
    expect(Object.keys(zip.files).filter((name) => name.startsWith('word/fonts/'))).toEqual([])
    expect(await partOf(template, 'word/fontTable.xml')).not.toMatch(/<w:embed/)
    expect(await partOf(template, 'word/document.xml')).not.toContain('w:ascii="Inter"')
    expect(await partOf(template, 'word/settings.xml')).not.toContain('embedTrueTypeFonts')
  })
})

interface WordParagraph {
  text: string
  keepNext: boolean
  keepLines: boolean
  /** Inside a table row. */
  inRow: boolean
  /** Inside a table row that does not split. */
  inUnsplitRow: boolean
}

/** The body's paragraphs in document order, with their text and keep rules. */
function paragraphsOf(document: string): WordParagraph[] {
  const paragraphs: WordParagraph[] = []
  const rowStarts: { cantSplit: boolean }[] = []
  for (const match of document.matchAll(/<w:tr\b[^>]*>(?:<w:trPr>([\s\S]*?)<\/w:trPr>)?|<\/w:tr>|<w:p\b(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    const token = match[0]
    if (token.startsWith('<w:tr')) rowStarts.push({ cantSplit: /<w:cantSplit\/>/.test(match[1] ?? '') })
    else if (token === '</w:tr>') rowStarts.pop()
    else {
      const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(token)?.[1] ?? ''
      paragraphs.push({
        text: [...token.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''),
        keepNext: /<w:keepNext\/>/.test(pPr),
        keepLines: /<w:keepLines\/>/.test(pPr),
        inRow: rowStarts.length > 0,
        inUnsplitRow: rowStarts.some((row) => row.cantSplit),
      })
    }
  }
  return paragraphs
}

const indexOfText = (paragraphs: WordParagraph[], text: string, from = 0) => {
  const index = paragraphs.findIndex((paragraph, at) => at >= from && paragraph.text.includes(text))
  if (index < 0) throw new Error(`No paragraph with "${text}"`)
  return index
}

describe('the entries print keeps whole, kept whole in Word', () => {
  it.each(PARAGRAPH_ENTRY_TEMPLATES)('%s: an entry keeps its lines together and every paragraph with the next, but its last', async (template) => {
    const paragraphs = paragraphsOf(await partOf(template, 'word/document.xml'))
    const first = indexOfText(paragraphs, 'Supply planner')
    const last = indexOfText(paragraphs, BULLETS[2], first)
    const entry = paragraphs.slice(first, last + 1)
    expect(entry.length).toBeGreaterThanOrEqual(BULLETS.length + 1)
    for (const paragraph of entry) expect(paragraph.keepLines, paragraph.text).toBe(true)
    for (const paragraph of entry.slice(0, -1)) expect(paragraph.keepNext, paragraph.text).toBe(true)
    expect(entry[entry.length - 1].keepNext).toBe(false)
  })

  it.each(PARAGRAPH_ENTRY_TEMPLATES)('%s: a page may break between two entries', async (template) => {
    const paragraphs = paragraphsOf(await partOf(template, 'word/document.xml'))
    const lastBullet = indexOfText(paragraphs, BULLETS[2])
    const next = indexOfText(paragraphs, 'Stock clerk', lastBullet)
    expect(paragraphs.slice(lastBullet, next).some(({ keepNext }) => !keepNext)).toBe(true)
  })

  it.each(ROW_ENTRY_TEMPLATES)('%s: an entry is a row that does not split, and keeps no row with the next', async (template) => {
    const paragraphs = paragraphsOf(await partOf(template, 'word/document.xml'))
    const first = indexOfText(paragraphs, 'Supply planner')
    const last = indexOfText(paragraphs, BULLETS[2], first)
    for (const paragraph of paragraphs.slice(first, last + 1)) {
      expect(paragraph.inUnsplitRow, paragraph.text).toBe(true)
      expect(paragraph.keepNext, paragraph.text).toBe(false)
    }
  })

  /** Each section the fixture fills, the text of its first entry, and the headings a template may give it. */
  const SECTIONS = [
    { section: 'summary', first: 'Logistics lead with ten years', headings: [swissHeading(en, 'summary')] },
    { section: 'experience', first: 'Supply planner', headings: [swissHeading(en, 'experience')] },
    { section: 'education', first: 'Diploma in logistics', headings: [swissHeading(en, 'education')] },
    { section: 'projects', first: 'Warehouse move', headings: ['keyAchievements', 'projects', 'publications'].map((key) => swissHeading(en, key as never)) },
  ]

  /** The swissExecutive summary is a box with no heading (FR-6); the templates without projects draw none. */
  const sectionCases = Object.keys(GENERATORS).flatMap((template) =>
    SECTIONS.filter(
      ({ section }) =>
        !(template === 'swissExecutive' && section === 'summary') &&
        !(section === 'projects' && ['swissVocational', 'swissCommerce', 'swissTrades', 'swissHealth', 'swissFinance', 'swissFirstJob'].includes(template)),
    ).map(({ section, first, headings }) => [template, section, first, headings] as const),
  )

  it.each(sectionCases)('%s: the %s heading is kept with its first entry', async (template, _section, first, headings) => {
    const paragraphs = paragraphsOf(await partOf(template, 'word/document.xml'))
    const entry = indexOfText(paragraphs, first)
    const isHeading = ({ text }: WordParagraph) => headings.some((label) => text.toLowerCase().includes(label.toLowerCase()))
    const heading = paragraphs.map(isHeading).lastIndexOf(true, entry)
    expect(heading, 'the heading').toBeGreaterThanOrEqual(0)
    expect(paragraphs[heading].keepNext, paragraphs[heading].text).toBe(true)
    // Every paragraph between them in the flow (spacers, a date line) is kept
    // with the next too; a dated row's date cell is part of the entry.
    for (const paragraph of paragraphs.slice(heading + 1, entry).filter(({ inRow }) => !inRow)) {
      expect(paragraph.keepNext, paragraph.text || '(spacer)').toBe(true)
    }
  })

  // A row that cannot split is clipped by Word at the page's foot when it is
  // taller than a page; print breaks it. One language is one line, so its row
  // stays whole.
  it.each([
    ['swissVocational', ['Supply planner', BULLETS[2], 'Diploma in logistics', 'Tools']],
    ['swissCommerce', ['Supply planner', BULLETS[2], 'Diploma in logistics']],
  ] as const)('%s: an entry row (and the skills row) may split, so Word never clips one taller than a page', async (template, texts) => {
    const paragraphs = paragraphsOf(await partOf(template, 'word/document.xml'))
    for (const text of texts) {
      const paragraph = paragraphs[indexOfText(paragraphs, text)]
      expect(paragraph.inRow, text).toBe(true)
      expect(paragraph.inUnsplitRow, text).toBe(false)
    }
  })

  it.each(Object.keys(GENERATORS))('%s: the summary is kept whole with its heading', async (template) => {
    const paragraphs = paragraphsOf(await partOf(template, 'word/document.xml'))
    const summary = paragraphs[indexOfText(paragraphs, 'Logistics lead with ten years')]
    expect(summary.keepLines || summary.inUnsplitRow).toBe(true)
  })
})

describe('contact values held whole', () => {
  /**
   * swissFinance draws its contact details as one line of plain text, which
   * the Preview wraps at its spaces and after its hyphens as Word does; every
   * other template draws each value as an item a line moves whole. swissIt
   * writes its values in Consolas by its own rule (`swissItContactRunText`),
   * left as it was.
   */
  const HELD_TEMPLATES = Object.keys(GENERATORS).filter((template) => template !== 'swissFinance' && template !== 'swissIt')

  it.each(HELD_TEMPLATES)('%s: a hyphenated link is written with non-breaking hyphens, so Word never breaks it after "lea-"', async (template) => {
    const document = await partOf(template, 'word/document.xml')
    const runs = document.match(/<w:r>[\s\S]*?<\/w:r>|<w:r [^>]*>[\s\S]*?<\/w:r>/g) ?? []
    const link = runs.filter((run) => run.includes('linkedin.com/in/lea'))
    expect(link).toHaveLength(1)
    expect(link[0]).toContain('<w:noBreakHyphen/>')
    const text = [...link[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, t]) => t).join('')
    expect(text).toContain('linkedin.com/in/lea')
    expect(text).not.toContain('-')
  })
})
