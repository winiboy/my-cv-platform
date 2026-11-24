import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import type { Locale } from '@/lib/i18n'
import type { Resume } from '@/types/database'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { ResumePreview } from '@/components/dashboard/resume-preview'
import { SWISS_ACADEMIC_CONTENT_WIDTH, SWISS_ACADEMIC_GEOMETRY, SWISS_ACADEMIC_SIZES, swissAcademicDateColumnPx } from '@/lib/swiss-academic-template'
import { swissItLinkParts } from '@/lib/swiss-it-template'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { georgiaTextWidthPx } from '@/lib/georgia-advance-widths'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { SWISS_ACADEMIC_PUBLICATIONS_NUMBERING, generateSwissAcademicDocx, swissAcademicLinkChildren } from './docx-swiss-academic'

/**
 * The swissAcademic Word export against its contract, the Preview: the same
 * sections in the same fixed order, the same hidden content left out, the same
 * localized words, the numbered publications, and no photo, whatever the
 * route hands it (FR-2, FR-6, FR-7, FR-10, FR-14, the PRD's FR-5 exception).
 *
 * The fixture's summary and descriptions are plain text: rich text renders
 * empty outside a browser, so the text comparisons with the Preview would not
 * see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
const PALETTE = DOCX_PALETTE.swissAcademic
const G = SWISS_ACADEMIC_GEOMETRY
const ZWSP = String.fromCharCode(0x200b)

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-academic',
    user_id: 'u1',
    title: 'Postdoctoral researcher in neuroscience',
    template: 'swissAcademic',
    contact: {
      name: 'Elena Rossi',
      email: 'elena@rossi.test',
      phone: '+41 00 000 00 09',
      location: 'Oxbridge',
      linkedin: '',
      github: '',
      website: 'orcid.test/0000-0001',
    },
    summary: 'Neuroscientist working on synaptic plasticity.',
    education: [
      { school: 'University of Oxbridge', degree: 'Doctorate in neuroscience', field: 'Thesis: dendritic spines', startDate: '2015-09', endDate: '2019-06', visible: true },
      { school: 'Polytechnic', degree: '', startDate: '2010-09', endDate: '2013-06', description: 'Biology.', visible: true },
      { school: 'Hidden School', degree: 'Hidden degree', visible: false },
    ],
    experience: [
      { company: 'Biozentrum', position: 'Postdoctoral researcher', location: 'Oxbridge', startDate: '2020-01', current: true, achievements: ['Led a funded project.', 'Supervised three students.'], visible: true },
      { company: 'Hidden Lab', position: 'Hidden Position', startDate: '2014-01', endDate: '2014-12', visible: false },
      { company: 'University of Oxbridge', position: 'Doctoral assistant', startDate: '2015-09', endDate: '2019-06', current: false, description: 'Taught neurobiology.', visible: true },
    ],
    projects: [
      { name: 'Rossi E., et al.', description: 'Motor learning reshapes dendritic spines.', technologies: ['Two-photon imaging'], url: 'doi.test/10.1000/xyz', visible: true },
      { name: 'Hidden paper', description: 'Hidden.', visible: false },
      { name: '', description: 'A project with no name.', visible: true },
      { name: ' ', description: '', technologies: [], url: '', visible: true },
    ],
    certifications: [
      { name: 'Ambizione grant', issuer: 'National science fund', date: '2023-05', visible: true },
      { name: 'Thesis prize', issuer: '', date: '', visible: true },
      { name: 'Hidden prize', issuer: 'Nobody', date: '2020-01', visible: false },
    ],
    skills: [
      { category: 'Methods', items: [], skillsHtml: 'Two-photon microscopy, MATLAB', visible: true },
      { category: 'Hidden category', items: ['Hidden skill'], visible: false },
    ],
    languages: [
      { language: 'Italian', level: 'Native', visible: true },
      { language: 'English', level: 'Fluent', visible: true },
      { language: 'Volapuk', level: 'Basic', visible: false },
    ],
    custom_sections: {},
    layout_settings: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  }
}

function settingsFor(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  return {
    fontFamily: layout.fontFamily,
    fontScale: layout.fontScale,
    titleFontSize: layout.titleFontSize,
    contactFontSize: layout.contactFontSize,
    sectionTitleFontSize: layout.sectionTitleFontSize,
    sectionDescFontSize: layout.sectionDescFontSize,
    locale,
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
    hiddenContactFields: [...layout.hiddenContactFields],
    ...extra,
  }
}

/** Entities decoded, no-break spaces read as the spaces they stand for, and zero-width break opportunities dropped. */
function decode(text: string): string {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
}

async function artifact(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<JSZip> {
  return JSZip.loadAsync(await generateSwissAcademicDocx(row, settingsFor(row, locale, extra)))
}

/** The document part as written, non-breaking hyphens as their elements. */
async function rawDocumentXml(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  return (await artifact(row, locale, extra)).file('word/document.xml')!.async('string')
}

/** The document part with each non-breaking hyphen read back into its text node, as a hyphen of the text. */
async function documentXml(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  return (await rawDocumentXml(row, locale, extra)).replace(/<\/w:t><w:noBreakHyphen\/><w:t xml:space="preserve">/g, '-')
}

/** The document's text, run by run, in document order. */
async function wordText(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const xml = await documentXml(row, locale, extra)
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(([, text]) => decode(text).trim())
    .filter((text) => text !== '')
    .join('|')
}

/** The Preview's text, node by node, in document order, with the layout settings it stores applied, as the Preview page applies them. */
function previewOf(row: Row, locale: Locale, props: Record<string, unknown> = {}): string {
  const layout = resolveResumeLayout(row, null)
  const markup = renderToStaticMarkup(
    createElement(ResumePreview, {
      resume: row as unknown as Resume,
      locale,
      dict: DICTS[locale],
      hiddenMainSections: layout.hiddenMainSections,
      hiddenSidebarSections: layout.hiddenSidebarSections,
      hiddenContactFields: layout.hiddenContactFields,
      ...props,
    }),
  )
  // A `<wbr>` is a line-break opportunity, not text.
  return markup
    .replace(/<wbr\/?>/g, '')
    .split(/<[^>]*>/)
    .map((node) => decode(node).trim())
    .filter((node) => node !== '')
    .join('|')
}

/** The Preview's bullets are list markers, not text; Word writes them as a glyph. */
const withoutBullets = (text: string) =>
  text
    .split('|')
    .filter((node) => node !== '•')
    .join('|')

/** The section headings each output draws, in the order they appear in `text`. */
function headingOrder(text: string, locale: Locale): string[] {
  const t = DICTS[locale].resumes.template
  const labels: Record<string, string> = {
    summary: t.summary,
    education: t.education,
    experience: t.experience,
    publications: t.publications,
    distinctions: t.distinctions,
    skillsAndLanguages: `${t.skills} & ${t.languages}`,
  }
  const nodes = text.split('|')
  return Object.entries(labels)
    .map(([key, label]) => ({ key, at: nodes.indexOf(label) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const ALL_SECTIONS = ['summary', 'education', 'experience', 'publications', 'distinctions', 'skillsAndLanguages']

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

describe('swissAcademic: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the sections in the mockup order, under the existing and the two new labels (FR-6)', async () => {
      const row = resumeRow()
      expect(headingOrder(previewOf(row, locale), locale)).toEqual(ALL_SECTIONS)
      expect(headingOrder(await wordText(row, locale), locale)).toEqual(ALL_SECTIONS)
    })

    it('draws the same text in the same order on both outputs (FR-10)', async () => {
      const row = resumeRow()
      expect(withoutBullets(await wordText(row, locale))).toBe(previewOf(row, locale))
    })

    it('draws every visible item and leaves out the hidden and empty ones (FR-2)', async () => {
      const row = resumeRow()
      for (const text of [previewOf(row, locale), await wordText(row, locale)]) {
        for (const visible of [
          'Elena Rossi|Postdoctoral researcher in neuroscience|Oxbridge \u00B7|+41 00 000 00 09 \u00B7|elena@rossi.test \u00B7|orcid.test/0000-0001',
          '09.2015 – 06.2019|Doctorate in neuroscience|— University of Oxbridge|Thesis: dendritic spines',
          '09.2010 – 06.2013|Polytechnic|Biology.',
          `01.2020 – ${dict.resumes.template.present}|Postdoctoral researcher|— Biozentrum, Oxbridge`,
          'Rossi E., et al.|Motor learning reshapes dendritic spines.|Two-photon imaging|doi.test/10.1000/xyz|A project with no name.',
          '05.2023|Ambizione grant — National science fund|Thesis prize',
          'Methods:|Two-photon microscopy, MATLAB',
          `Italian (${dict.resumes.editor.levels.native}), English (${dict.resumes.editor.levels.fluent})`,
        ]) {
          expect(text, visible).toContain(visible)
        }
        for (const hidden of ['Hidden School', 'Hidden degree', 'Hidden Lab', 'Hidden paper', 'Hidden prize', 'Hidden category', 'Hidden skill', 'Volapuk']) {
          expect(text, hidden).not.toContain(hidden)
        }
      }
    })
  })

  it('draws no heading for a section whose items are all hidden or empty, on both outputs', async () => {
    const row = resumeRow({
      projects: [{ name: 'Hidden paper', visible: false }, { name: '', description: '<p></p>', visible: true }],
      certifications: [{ name: '', issuer: '', date: '', visible: true }],
      skills: [{ category: 'Blank', items: ['  '], visible: true }],
      languages: [{ language: ' ', level: 'Native', visible: true }],
      summary: '<p></p>',
    })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['education', 'experience'])
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('leaves out the sections the layout hides, through either panel, heading included, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['summary', 'education'], hiddenSidebarSections: ['keyAchievements', 'skills'] } })
    for (const text of [previewOf(row, 'de'), await wordText(row, 'de')]) {
      expect(headingOrder(text, 'de')).toEqual(['experience', 'distinctions'])
      expect(text).toContain(de.resumes.template.languages)
      expect(text).not.toContain('Methods')
      expect(text).not.toContain('Rossi E.')
    }
    expect(withoutBullets(await wordText(row, 'de'))).toBe(previewOf(row, 'de'))
  })

  it('leaves out each unticked contact detail and the CV title on both outputs (FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'website', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).not.toContain('elena@rossi.test')
      expect(text).not.toContain('orcid.test')
      expect(text).toContain('Elena Rossi|Oxbridge \u00B7|+41 00 000 00 09|')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })
})

describe('swissAcademic: no photo, ever (PRD FR-5 exception)', () => {
  it('embeds no image and draws no drawing in Word, with a stored photo and the tick on, as the Preview draws none', async () => {
    const zip = await artifact(resumeRow(), 'en', { photoBase64: PHOTO, hiddenContactFields: [] })
    expect(Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))).toEqual([])
    expect(await zip.file('word/document.xml')!.async('string')).not.toContain('<w:drawing>')
    const preview = renderToStaticMarkup(
      createElement(ResumePreview, { resume: resumeRow() as unknown as Resume, locale: 'en', dict: en, photoUrl: PHOTO, hiddenContactFields: [] }),
    )
    expect(preview).not.toContain('<img')
  })
})

describe('swissAcademic: Word layout (FR-10)', () => {
  const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p)
  const runs = (xml: string) =>
    [...xml.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => ({
      text: [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, t]) => t).join(''),
      raw: inner,
    }))
  const runOf = (xml: string, text: string) => runs(xml).find((r) => r.text === text)

  it('sets every run in Georgia', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const fonts = new Set([...xml.matchAll(/w:ascii="([^"]+)"/g)].map(([, name]) => name))
    expect([...fonts]).toEqual(['Georgia'])
  })

  it('draws every heading in bold letter-spaced small capitals, the thin rule its bottom border, kept with what follows', async () => {
    const xml = await documentXml(resumeRow(), 'fr')
    for (const label of [fr.resumes.template.summary, fr.resumes.template.publications, fr.resumes.template.distinctions]) {
      const heading = paragraphs(xml).find((p) => p.includes(`>${label}<`))!
      expect(heading, label).toContain('<w:smallCaps/>')
      expect(heading).toContain('<w:b/>')
      expect(heading).toContain(`<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissAcademic.caps, pxToHalfPoints(SWISS_ACADEMIC_SIZES.heading))}"/>`)
      expect(heading).toMatch(new RegExp(`<w:bottom w:val="single" w:color="${PALETTE.rule}" w:sz="${Math.round(G.headingRule * 6)}" w:space="${Math.round(G.headingRuleGap * 0.75)}"/>`))
      expect(heading).toContain('<w:keepNext/>')
    }
  })

  it('lays the dated entries in a table whose date column is the Preview’s', async () => {
    const xml = await documentXml(resumeRow(), 'de')
    const column = swissAcademicDateColumnPx([
      '09.2015 – 06.2019',
      '09.2010 – 06.2013',
      `01.2020 – ${de.resumes.template.present}`,
      '09.2015 – 06.2019',
      '05.2023',
    ])
    const contentWidth = Number(/<w:pgSz [^>]*w:w="(\d+)"/.exec(xml)?.[1]) - 2 * pxToTwips(G.paddingX)
    expect(xml.split(`<w:gridCol w:w="${pxToTwips(column)}"/><w:gridCol w:w="${contentWidth - pxToTwips(column)}"/>`).length - 1).toBe(3)
    // The date in grey, the field of study in grey italics.
    expect(runOf(xml, '09.2015\u00A0–\u00A006.2019')?.raw).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
    expect(runOf(xml, 'Thesis: dendritic spines')?.raw).toContain('<w:i/>')
  })

  it('never wraps a date: every date cell is the same fixed width, with no margins, and holds each date drawn at Word’s size', async () => {
    for (const locale of LOCALES) {
      const xml = await documentXml(resumeRow(), locale)
      const tables = [...xml.matchAll(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g)].map(([table]) => table)
      const dated = tables.filter((table) => /<w:gridCol w:w="\d+"\/><w:gridCol w:w="\d+"\/><\/w:tblGrid>/.test(table))
      expect(dated.length, locale).toBe(3)
      const widths = new Set<number>()
      const dateTexts: string[] = []
      for (const table of dated) {
        expect(table).toContain('<w:tblLayout w:type="fixed"/>')
        // No default cell margins on the table.
        expect(table).toMatch(/<w:tblCellMar>(?:(?!<\/w:tblCellMar>)[\s\S])*?<w:left w:type="dxa" w:w="0"\/>/)
        const gridDate = Number(/<w:gridCol w:w="(\d+)"\/>/.exec(table)?.[1])
        for (const [cell] of table.matchAll(/<w:tr>[\s\S]*?<\/w:tc>/g)) {
          const tcW = Number(/<w:tcW w:type="dxa" w:w="(\d+)"\/>/.exec(cell)?.[1])
          const left = Number(/<w:tcMar>[\s\S]*?<w:(?:left|start) w:type="dxa" w:w="(\d+)"\/>/.exec(cell)?.[1] ?? 0)
          const right = Number(/<w:tcMar>[\s\S]*?<w:(?:right|end) w:type="dxa" w:w="(\d+)"\/>/.exec(cell)?.[1] ?? 0)
          expect(tcW).toBe(gridDate)
          widths.add(tcW - left - right)
          const text = [...cell.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, t]) => t).join('')
          if (text) dateTexts.push(text)
        }
      }
      // One width for every row of every section.
      expect(widths.size, locale).toBe(1)
      const textTwips = [...widths][0]
      const wordPx = pxToHalfPoints(SWISS_ACADEMIC_SIZES.date) / 1.5
      expect(dateTexts).toContain('09.2010\u00A0–\u00A006.2013')
      for (const date of dateTexts) {
        // Each date is one unit: its spaces are no-break spaces.
        expect(date, date).not.toMatch(/ /)
        expect(georgiaTextWidthPx(date, 'regular', wordPx) * 15, `${locale}: ${date}`).toBeLessThanOrEqual(textTwips)
      }
    }
  })

  it('numbers the publications with a real Word decimal list, the number on each item’s first paragraph', async () => {
    const zip = await artifact(resumeRow(), 'en')
    const numbering = await zip.file('word/numbering.xml')!.async('string')
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>')
    expect(numbering).toContain('<w:lvlText w:val="%1."/>')
    const xml = await zip.file('word/document.xml')!.async('string')
    const numbered = paragraphs(xml).filter((p) => p.includes('<w:numPr>'))
    expect(numbered.map((p) => runs(p).map((r) => r.text).join(''))).toEqual(['Rossi E., et al.', 'A project with no name.'])
    // Further paragraphs of an item sit under its number.
    const description = paragraphs(xml).find((p) => p.includes('>Motor learning reshapes dendritic spines.<'))!
    expect(description).not.toContain('<w:numPr>')
    expect(description).toMatch(new RegExp(`<w:ind w:left="${pxToTwips(G.numberIndent)}"`))
    expect(SWISS_ACADEMIC_PUBLICATIONS_NUMBERING).toBe('swiss-academic-publications')
  })

  it('moves a hyphenated contact value that fits its line as one unit, and breaks one wider than the line only at its boundaries', async () => {
    const xml = await rawDocumentXml(resumeRow(), 'en')
    expect(xml).toMatch(/>orcid\.test\/0000<\/w:t><w:noBreakHyphen\/><w:t xml:space="preserve">0001<\/w:t>/)
    const halfPoints = pxToHalfPoints(SWISS_ACADEMIC_SIZES.contact)
    const wide = `https://orcid.test/${'0000-'.repeat(30)}0001`
    expect(swissAcademicLinkChildren(wide, SWISS_ACADEMIC_CONTENT_WIDTH, halfPoints)).toEqual([swissItLinkParts(wide).join(ZWSP)])
    const email = `${'firstname.lastname.'.repeat(8)}longer-name@example.test`
    expect(swissAcademicLinkChildren(email, SWISS_ACADEMIC_CONTENT_WIDTH, halfPoints, true)).toEqual([email])
  })

  it('numbers every publication, also one whose text opens with a list, plain or HTML: 1, 2, 3 as the Preview', async () => {
    const row = resumeRow({
      projects: [
        { name: '', description: '- first finding\n- second finding', visible: true },
        { name: '', description: '<ul><li>a listed result</li><li>another</li></ul>', visible: true },
        { name: 'Third paper', description: 'Plain text.', visible: true },
      ],
    })
    const preview = renderToStaticMarkup(createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en }))
    // The ordered list's own items: each publication is one (a list inside its text is not).
    const previewItems = preview.split('<li class="break-inside-avoid"').length - 1
    expect(previewItems).toBe(3)
    const xml = await rawDocumentXml(row, 'en')
    const numbered = paragraphs(xml).filter((p) => p.includes('<w:numPr>'))
    // One numbered paragraph per item, all in the one list, so Word counts 1, 2, 3.
    expect(numbered).toHaveLength(previewItems)
    expect(new Set(numbered.map((p) => /<w:numId w:val="(\d+)"\/>/.exec(p)?.[1])).size).toBe(1)
    expect(numbered.every((p) => p.includes('<w:ilvl w:val="0"/>'))).toBe(true)
    // A list-first item: its number on a paragraph of its own, never beside a list marker.
    expect(numbered.map((p) => runs(p).map((r) => r.text).join(''))).toEqual(['', '', 'Third paper'])
    for (const p of numbered) expect(p).not.toContain('•')
    // Its list items follow, under the number, with their own markers.
    const firstIndex = xml.indexOf(numbered[0])
    expect(xml.indexOf('first finding')).toBeGreaterThan(firstIndex)
    expect(xml.indexOf('a listed result')).toBeGreaterThan(xml.indexOf(numbered[1]))
  })

  it('grows the date column for a free-text date wider than 160px, the same on both outputs, the date one unbreakable run', async () => {
    const freeText = 'Semestre d’hiver 2019 à été 2021'
    const row = resumeRow({ certifications: [{ name: 'Ambizione grant', issuer: 'National science fund', date: freeText, visible: true }] })
    const column = swissAcademicDateColumnPx([
      '09.2015 – 06.2019',
      '09.2010 – 06.2013',
      `01.2020 – ${en.resumes.template.present}`,
      '09.2015 – 06.2019',
      freeText,
    ])
    expect(column).toBeGreaterThan(160)
    const xml = await rawDocumentXml(row, 'en')
    expect(xml).toContain(`<w:gridCol w:w="${pxToTwips(column)}"/>`)
    const date = runs(xml).find((r) => r.text.startsWith('Semestre'))!
    expect(date.text).toBe(freeText.replace(/ /g, '\u00A0').replace(/’/g, '&apos;').replace(/&apos;/g, '’'))
    expect(date.text).not.toMatch(/ /)
    const preview = renderToStaticMarkup(createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en }))
    expect(preview).toContain(`grid-template-columns:${column}px minmax(0, 1fr)`)
  })

  it('writes a no-break space after the "Category:" and "Languages:" labels, and before the dash of an entry line', async () => {
    const xml = await rawDocumentXml(resumeRow(), 'en')
    const skillLine = paragraphs(xml).find((p) => p.includes('>Methods:<'))!
    expect(runs(skillLine).map((r) => r.text)).toEqual(['Methods:', '\u00A0', 'Two-photon microscopy, MATLAB'])
    const languagesLine = paragraphs(xml).find((p) => p.includes(`>${en.resumes.template.languages}:<`))!
    expect(runs(languagesLine)[1].text).toBe('\u00A0')
    expect(runOf(xml, '\u00A0— University of Oxbridge')).toBeDefined()
    expect(xml).not.toContain('> — University')
  })

  it('draws an experience’s bullets and a description’s list with one geometry: the list indent, the marker’s hang, a tab stop at the text', async () => {
    const row = resumeRow({
      experience: [
        { company: 'Lab', position: 'Fellow', startDate: '2020-01', current: true, achievements: ['An achievement.'], visible: true },
        { company: 'Lab', position: 'Assistant', startDate: '2015-01', endDate: '2019-12', description: '<ul><li>A listed duty.</li></ul>', visible: true },
      ],
    })
    const xml = await rawDocumentXml(row, 'en')
    const bullet = paragraphs(xml).find((p) => p.includes('>An achievement.<'))!
    const listed = paragraphs(xml).find((p) => p.includes('>A listed duty.<'))!
    const geometry = (p: string) => [/<w:ind [^>]*\/>/.exec(p)?.[0], /<w:tabs>[\s\S]*?<\/w:tabs>/.exec(p)?.[0]]
    expect(geometry(bullet)).toEqual(geometry(listed))
    expect(geometry(bullet)[0]).toContain('w:left="300"')
  })

  it('gives every page the PDF’s top and foot margins, and starts page 1 where the Preview does', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const marginX = pxToTwips(G.paddingX)
    expect(xml).toMatch(
      new RegExp(`<w:pgMar w:top="${pxToTwips(G.pageTop)}" w:right="${marginX}" w:bottom="${pxToTwips(G.pageBottom)}" w:left="${marginX}" w:header="0" w:footer="0"`),
    )
    const first = /<w:body>(<w:p>[\s\S]*?<\/w:p>)/.exec(xml)?.[1] ?? ''
    expect(first).toContain(`w:after="${pxToTwips(G.paddingTop - G.pageTop)}"`)
  })

  it('writes every run at a whole number of half-points, and ignores the stored font and scale (FR-4)', async () => {
    const xml = await documentXml(resumeRow(), 'en', { fontScale: 1.3, fontFamily: 'Courier New, monospace' })
    for (const [, value] of xml.matchAll(/<w:sz w:val="([^"]+)"\/>/g)) expect(Number.isInteger(Number(value)), value).toBe(true)
    expect(runOf(xml, 'Elena Rossi')?.raw).toContain(`<w:sz w:val="${pxToHalfPoints(SWISS_ACADEMIC_SIZES.name)}"/>`)
    expect(xml).not.toMatch(/Courier/)
  })
})
