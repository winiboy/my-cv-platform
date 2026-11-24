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
import { SwissExecutiveTemplate } from '@/components/dashboard/resume-templates/swiss-executive-template'
import { SWISS_EXECUTIVE_CARD_TEXT_WIDTH, SWISS_EXECUTIVE_GEOMETRY, SWISS_EXECUTIVE_SIZES } from '@/lib/swiss-executive-template'
import { swissItLinkParts } from '@/lib/swiss-it-template'
import { interLinkWidthPx } from '@/lib/inter-link-widths'
import { interTextWidthPx } from '@/test/inter-advance-widths'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import {
  SWISS_EXECUTIVE_SAFETY_PX,
  generateSwissExecutiveDocx,
  italicSummary,
  roundPhoto,
  swissExecutiveDateColumnTwips,
  swissExecutiveLinkChildren,
} from './docx-swiss-executive'

/**
 * The swissExecutive Word export against its contract, the Preview: the same
 * sections in the same fixed order, the same hidden content left out, the same
 * localized words, the summary box, the achievement cards and the photo drawn
 * only when there is one and it is ticked (FR-2, FR-5, FR-6, FR-7, FR-10, FR-14).
 *
 * The fixture's summary and descriptions are plain text: rich text renders
 * empty outside a browser, so the text comparisons with the Preview would not
 * see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
const PALETTE = DOCX_PALETTE.swissExecutive
const G = SWISS_EXECUTIVE_GEOMETRY
const ZWSP = String.fromCharCode(0x200b)

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-executive',
    user_id: 'u1',
    title: 'Chief executive officer',
    template: 'swissExecutive',
    contact: {
      name: 'Catherine Imhof',
      email: 'catherine@imhof.test',
      phone: '+41 00 000 00 08',
      location: 'Oxbridge',
      linkedin: 'linkedin.test/in/imhof',
      github: 'github.test/imhof',
      website: 'imhof.test',
    },
    summary: 'Executive with twenty years in medical technology.',
    skills: [{ category: 'Leadership', items: ['Never drawn skill'], visible: true }],
    projects: [
      { name: 'Growth x2 in 5 years', description: 'Revenue doubled.', technologies: ['SAP', 'Salesforce'], url: 'example.test/growth', visible: true },
      { name: 'Hidden achievement', description: 'Hidden achievement description.', visible: false },
      { name: '', description: 'An achievement with no name.', visible: true },
      { name: 'Strategic acquisition', description: 'Alone on its row.', visible: true },
      { name: ' ', description: '', technologies: [], url: '', visible: true },
    ],
    experience: [
      {
        company: 'MedAlp Technologies',
        position: 'Chief executive officer',
        location: 'Oxbridge',
        startDate: '2017-01',
        current: true,
        achievements: ['Led four hundred people.', 'Reported to the board.'],
        visible: true,
      },
      { company: 'Hidden Employer', position: 'Hidden Position', startDate: '2010-01', endDate: '2011-12', achievements: ['Hidden duty.'], visible: false },
      { company: 'Rhenus Devices', position: 'Chief operating officer', startDate: '2011-01', endDate: '2016-12', current: false, description: 'Ran four plants.', visible: true },
    ],
    education: [
      { school: 'IMD', degree: 'Executive MBA', field: 'Lausanne', startDate: '2012-09', endDate: '2014-06', visible: true },
      { school: 'Polytechnic', degree: '', startDate: '2000-09', endDate: '2005-06', description: 'Biomedical engineering.', visible: true },
      { school: 'Hidden School', degree: 'Hidden degree', visible: false },
    ],
    languages: [
      { language: 'Esperanto', level: 'Native', visible: true },
      { language: 'Interlingua', level: 'Fluent', visible: true },
      { language: 'Volapuk', level: 'Basic', visible: false },
    ],
    certifications: [
      { name: 'Independent director', issuer: 'Medtech association', date: '2020-05', visible: true },
      { name: 'Board course', issuer: '', date: '', visible: true },
      { name: 'Hidden licence', issuer: 'Nobody', date: '2020-01', visible: false },
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

async function documentXml(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const zip = await JSZip.loadAsync(await generateSwissExecutiveDocx(row, settingsFor(row, locale, extra)))
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error('The artifact has no word/document.xml')
  // A non-breaking hyphen is a hyphen of the text, written as an element of its
  // own between two text nodes: read it back into its text node.
  return (await part.async('string')).replace(/<\/w:t><w:noBreakHyphen\/><w:t xml:space="preserve">/g, '-')
}

/** The document part as written, non-breaking hyphens as their elements. */
async function rawDocumentXml(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const zip = await JSZip.loadAsync(await generateSwissExecutiveDocx(row, settingsFor(row, locale, extra)))
  return zip.file('word/document.xml')!.async('string')
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
    keyAchievements: t.keyAchievements,
    experience: t.experience,
    education: t.education,
    languagesAndCertifications: `${t.languages} & ${t.training}`,
    languages: t.languages,
    certifications: t.training,
  }
  const nodes = text.split('|')
  return Object.entries(labels)
    .map(([key, label]) => ({ key, at: nodes.indexOf(label) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const ALL_SECTIONS = ['keyAchievements', 'experience', 'education', 'languagesAndCertifications']

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

describe('swissExecutive: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the sections in the mockup order under the existing headings, the summary first with none (FR-6)', async () => {
      const row = resumeRow()
      for (const text of [previewOf(row, locale), await wordText(row, locale)]) {
        expect(headingOrder(text, locale)).toEqual(ALL_SECTIONS)
        expect(text.indexOf('Executive with twenty years')).toBeLessThan(text.indexOf(dict.resumes.template.keyAchievements))
        expect(text.split('|')).not.toContain(dict.resumes.template.summary)
      }
    })

    it('draws the same text in the same order on both outputs (FR-10)', async () => {
      const row = resumeRow()
      expect(withoutBullets(await wordText(row, locale))).toBe(previewOf(row, locale))
    })

    it('draws every visible item, leaves out the hidden and empty ones, and draws no skills (FR-2)', async () => {
      const row = resumeRow()
      for (const text of [previewOf(row, locale), await wordText(row, locale)]) {
        for (const visible of [
          'Catherine Imhof|Chief executive officer|Oxbridge \u00B7|+41 00 000 00 08 \u00B7|catherine@imhof.test \u00B7|linkedin.test/in/imhof \u00B7|github.test/imhof \u00B7|imhof.test',
          'Executive with twenty years in medical technology.',
          'Growth x2 in 5 years|Revenue doubled.|SAP, Salesforce|example.test/growth|An achievement with no name.|Strategic acquisition|Alone on its row.',
          `Chief executive officer|01.2017 – ${dict.resumes.template.present}|MedAlp Technologies, Oxbridge`,
          'Led four hundred people.',
          'Chief operating officer|01.2011 – 12.2016|Rhenus Devices|Ran four plants.',
          'Executive MBA|09.2012 – 06.2014|IMD, Lausanne',
          'Polytechnic|09.2000 – 06.2005|Biomedical engineering.',
          `Esperanto — ${dict.resumes.editor.levels.native} \u00B7 Interlingua — ${dict.resumes.editor.levels.fluent}`,
          'Independent director, Medtech association (05.2020) \u00B7 Board course',
        ]) {
          expect(text, visible).toContain(visible)
        }
        for (const hidden of ['Hidden achievement', 'Hidden Employer', 'Hidden Position', 'Hidden duty.', 'Hidden School', 'Hidden licence', 'Volapuk', 'Leadership', 'Never drawn skill']) {
          expect(text, hidden).not.toContain(hidden)
        }
      }
    })
  })

  it('draws no heading for a section whose items are all hidden or empty, on both outputs', async () => {
    const row = resumeRow({
      projects: [{ name: 'Hidden achievement', description: 'x', visible: false }, { name: '', description: '<p></p>', visible: true }],
      certifications: [{ name: '', issuer: '', date: '', visible: true }],
      languages: [{ language: ' ', level: 'Native', visible: true }],
      summary: '<p></p>',
    })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'education'])
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('leaves out the sections the layout hides, through either panel, heading included, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['education', 'summary'], hiddenSidebarSections: ['keyAchievements', 'languages'] } })
    for (const text of [previewOf(row, 'fr'), await wordText(row, 'fr')]) {
      expect(headingOrder(text, 'fr')).toEqual(['experience', 'certifications'])
      expect(text).not.toContain('IMD')
      expect(text).not.toContain('Growth x2')
      expect(text).not.toContain('Executive with twenty years')
      expect(text).not.toContain('Esperanto')
    }
    expect(withoutBullets(await wordText(row, 'fr'))).toBe(previewOf(row, 'fr'))
  })

  it('leaves out each unticked contact detail and the CV title on both outputs, and keeps the ticked ones (FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'github', 'website', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).not.toContain('catherine@imhof.test')
      expect(text).not.toContain('github.test/imhof')
      expect(text).not.toContain('|imhof.test')
      expect(text).toContain('Catherine Imhof|Oxbridge \u00B7|+41 00 000 00 08 \u00B7|linkedin.test/in/imhof|')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })
})

describe('swissExecutive: the photo (FR-5, FR-14)', () => {
  const previewMarkup = (row: Row, photoUrl?: string) => {
    const layout = resolveResumeLayout(row, null)
    return renderToStaticMarkup(
      createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en, photoUrl, hiddenContactFields: layout.hiddenContactFields }),
    )
  }
  const photoDrawing = (xml: string) => /<w:drawing>[\s\S]*?<\/w:drawing>/.exec(xml)?.[0]

  it('draws the photo round, in its gold ring and fill, in the header’s last cell, on both outputs', async () => {
    expect(previewMarkup(resumeRow(), PHOTO)).toContain('class="swiss-executive-photo shrink-0 overflow-hidden"')
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const drawing = photoDrawing(xml)
    expect(drawing).toContain('<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>')
    expect(drawing).toContain(`<a:solidFill><a:srgbClr val="${PALETTE.photoFill}"/></a:solidFill>`)
    expect(drawing).toMatch(new RegExp(`<a:ln w="${G.photoRing * 9525}"><a:solidFill><a:srgbClr val="${PALETTE.gold}"/>`))
    expect(drawing).toContain(`<wp:extent cx="${G.photo * 9525}" cy="${G.photo * 9525}"/>`)
    const header = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml)![0]
    const cells = [...header.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    expect(cells).toHaveLength(2)
    expect(cells[0]).toContain('>Catherine Imhof<')
    expect(cells[1]).toContain('<w:drawing>')
  })

  it('embeds the photo only when there is one, and draws no frame when it is unticked or not an image', async () => {
    const media = async (row: Row, extra: Partial<DocxGeneratorSettings>) => {
      const zip = await JSZip.loadAsync(await generateSwissExecutiveDocx(row, settingsFor(row, 'en', extra)))
      return Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    }
    expect(await media(resumeRow(), {})).toHaveLength(0)
    expect(await media(resumeRow(), { photoBase64: PHOTO })).toHaveLength(1)
    const hidden = resumeRow({ layout_settings: { hiddenContactFields: ['photo'] } })
    expect(previewMarkup(hidden, PHOTO)).toBe(previewMarkup(resumeRow()))
    expect(photoDrawing(await documentXml(hidden, 'en', { photoBase64: PHOTO }))).toBeUndefined()
    expect(photoDrawing(await documentXml(resumeRow(), 'en', { photoBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }))).toBeUndefined()
  })

  it('draws no upload box in the CV: the photo is uploaded from the Contact tab', () => {
    const html = renderToStaticMarkup(createElement(SwissExecutiveTemplate, { resume: resumeRow() as unknown as Resume, locale: 'fr', dict: fr }))
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
  })

  it('refuses to ship a square photo when the drawing is not in the shape docx writes', () => {
    expect(() => roundPhoto('<w:document/>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no inline drawing/)
    expect(() => roundPhoto('<wp:inline></wp:inline>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no rectangular picture geometry/)
    expect(() => roundPhoto('<wp:inline><a:prstGeom prst="rect"/></wp:inline>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no effect extent/)
  })
})

describe('swissExecutive: Word layout (FR-10)', () => {
  const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p)
  const pageWidth = (xml: string) => Number(/<w:pgSz [^>]*w:w="(\d+)"/.exec(xml)?.[1])
  const runs = (xml: string) =>
    [...xml.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => ({
      text: [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, t]) => t).join(''),
      raw: inner,
    }))
  const runOf = (xml: string, text: string) => runs(xml).find((r) => r.text === text)
  /** The innermost table holding `needle`. */
  const tableHolding = (xml: string, needle: string) =>
    [...xml.matchAll(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g)].map(([table]) => table).find((table) => table.includes(needle))

  it('draws the name and the headings in Georgia, the title in burgundy spaced capitals, the rest in Inter', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    expect(runOf(xml, 'Catherine Imhof')?.raw).toMatch(/w:ascii="Georgia"/)
    expect(runOf(xml, 'Catherine Imhof')?.raw).toContain(`<w:sz w:val="${pxToHalfPoints(SWISS_EXECUTIVE_SIZES.name)}"/>`)
    const heading = runOf(xml, en.resumes.template.experience)
    expect(heading?.raw).toMatch(/w:ascii="Georgia"/)
    expect(heading?.raw).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
    const titleRun = runOf(xml, 'Chief executive officer')
    expect(titleRun?.raw).toContain('<w:caps/>')
    expect(titleRun?.raw).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
    expect(titleRun?.raw).toContain(`<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissExecutive.caps, pxToHalfPoints(SWISS_EXECUTIVE_SIZES.title))}"/>`)
    expect(runOf(xml, 'Ran four plants.')?.raw).toMatch(/w:ascii="Inter"/)
  })

  it('draws the gold rule under the header as a paragraph’s bottom border', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const rule = paragraphs(xml).find((p) => /<w:pBdr><w:bottom /.test(p))
    expect(rule).toMatch(new RegExp(`<w:bottom w:val="single" w:color="${PALETTE.gold}" w:sz="${Math.round(G.headerRule * 6)}"`))
  })

  it('draws the summary in a one-cell table shaded cream, its gold bar the left border, every run italic', async () => {
    const xml = await documentXml(resumeRow({ summary: '<p>Executive with <strong>twenty</strong> years.</p>' }), 'en')
    const box = tableHolding(xml, `w:fill="${PALETTE.cream}"`)!
    expect([...box.matchAll(/<w:tc>/g)]).toHaveLength(1)
    expect(box).toMatch(new RegExp(`<w:left w:val="single" w:color="${PALETTE.gold}" w:sz="${Math.round(G.summaryBar * 6)}"`))
    const boxRuns = runs(box).filter((r) => r.text !== '')
    expect(boxRuns.map((r) => r.text).join('')).toBe('Executive with twenty years.')
    for (const r of boxRuns) {
      expect(r.raw, r.text).toContain('<w:i/><w:iCs/>')
      expect(r.raw, r.text).not.toContain('w:val="false"/><w:iCs')
      expect(r.raw).not.toMatch(/<w:i w:val="false"\/>/)
    }
    // In schema order: after the bold, before the colour.
    const bold = boxRuns.find((r) => r.text === 'twenty')!
    expect(bold.raw.indexOf('<w:bCs/>')).toBeLessThan(bold.raw.indexOf('<w:i/>'))
    expect(bold.raw.indexOf('<w:i/>')).toBeLessThan(bold.raw.indexOf('<w:color'))
    // Nothing outside the box is set in italics.
    expect(xml.replace(box, '')).not.toContain('<w:i/>')
  })

  it('leaves a document without the summary box unchanged when setting italics', () => {
    expect(italicSummary('<w:body><w:p/></w:body>', 'FAF6EE')).toBe('<w:body><w:p/></w:body>')
  })

  it('lays each row of achievement cards as two cells under a gold top border, an odd last card alone at the left', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const first = tableHolding(xml, '>Growth x2 in 5 years<')!
    const second = tableHolding(xml, '>Strategic acquisition<')!
    expect(first).not.toBe(second)
    const cardWidth = Math.round((pageWidth(xml) - 2 * pxToTwips(G.paddingX) - pxToTwips(G.cardGap)) / 2)
    expect(first).toContain(`<w:gridCol w:w="${cardWidth}"/><w:gridCol w:w="${pxToTwips(G.cardGap)}"/>`)
    const cells = (table: string) => [...table.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    const ruled = (cell: string) => new RegExp(`<w:top w:val="single" w:color="${PALETTE.gold}" w:sz="${Math.round(G.cardRule * 6)}"`).test(cell)
    expect(cells(first).map(ruled)).toEqual([true, false, true])
    expect(cells(second).map(ruled)).toEqual([true, false, false])
    // A card's text is as wide as the Preview's: the cell, no side margins.
    expect(Math.abs(cardWidth / 15 - SWISS_EXECUTIVE_CARD_TEXT_WIDTH)).toBeLessThan(0.5)
  })

  it('draws an entry’s first line as a two-cell table: the title, and the dates right-aligned in a cell as wide as the widest date', async () => {
    const xml = await documentXml(resumeRow(), 'de')
    const table = tableHolding(xml, '>01.2017 ')!
    expect(table).toContain('>Chief executive officer<')
    const cells = [...table.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    expect(cells).toHaveLength(2)
    expect(cells[1]).toContain('<w:jc w:val="right"/>')
    const dateWidth = Number(/<w:tcW w:type="dxa" w:w="(\d+)"\/>/.exec(cells[1])?.[1])
    const dates = [`01.2017 – ${de.resumes.template.present}`, '01.2011 – 12.2016']
    expect(dateWidth).toBe(swissExecutiveDateColumnTwips(dates, pxToHalfPoints(SWISS_EXECUTIVE_SIZES.date)))
    // Each date fits its cell with room to spare, measured in Inter at Word's size.
    for (const date of dates) expect(interTextWidthPx(date, 400, pxToHalfPoints(SWISS_EXECUTIVE_SIZES.date) / 1.5) * 15).toBeLessThan(dateWidth)
  })

  it('keeps a long title whole beside its dates: each word fits the title cell', async () => {
    const title = 'Mitglied der Geschäftsleitung für Unternehmensentwicklung und Restrukturierungsprogramme'
    const row = resumeRow({ experience: [{ company: 'MedAlp', position: title, startDate: '2017-01', current: true, visible: true }] })
    const xml = await documentXml(row, 'de')
    const table = tableHolding(xml, `>${title}<`)!
    const leadWidth = Number(/<w:tcW w:type="dxa" w:w="(\d+)"\/>/.exec(table)?.[1]) - pxToTwips(G.dateGap)
    for (const word of title.split(' ')) expect(interTextWidthPx(word, 700, pxToHalfPoints(SWISS_EXECUTIVE_SIZES.body) / 1.5) * 15, word).toBeLessThan(leadWidth)
  })

  it('writes the email and links that fit their line exactly as stored, and breaks only a link wider than its line', async () => {
    const row = resumeRow({
      contact: { name: 'Catherine Imhof', email: 'catherine.imhof@exemple.ch', linkedin: 'linkedin.com/in/catherineimhof' },
      projects: [{ name: 'Growth', url: 'github.com/catherineimhof/growth', visible: true }],
    })
    const xml = await documentXml(row, 'fr', { photoBase64: PHOTO })
    for (const value of ['catherine.imhof@exemple.ch', 'linkedin.com/in/catherineimhof', 'github.com/catherineimhof/growth']) {
      const run = runs(xml).find((r) => r.text.includes(value))
      expect(run, value).toBeDefined()
      expect(run!.text, value).not.toContain(ZWSP)
    }
    const long = 'https://github.com/catherineimhof/unternehmensentwicklung-und-restrukturierungsprogramme'
    const halfPoints = pxToHalfPoints(SWISS_EXECUTIVE_SIZES.body)
    expect(interLinkWidthPx(long, halfPoints / 1.5)).toBeGreaterThan(SWISS_EXECUTIVE_CARD_TEXT_WIDTH - SWISS_EXECUTIVE_SAFETY_PX)
    expect(swissExecutiveLinkChildren(long, SWISS_EXECUTIVE_CARD_TEXT_WIDTH, halfPoints)).toEqual([swissItLinkParts(long).join(ZWSP)])
    // An email is never given a break opportunity, however long.
    const email = `${'firstname.lastname.'.repeat(8)}longer-name@example.test`
    expect(swissExecutiveLinkChildren(email, 100, halfPoints, true)).toEqual([email])
  })

  it('moves a hyphenated contact value that fits its line as one unit: each hyphen non-breaking, nothing breakable inside', async () => {
    const row = resumeRow({
      contact: { name: 'Catherine Imhof', location: 'Genève', phone: '+41 79 890 12 34', email: 'catherine.imhof@exemple.ch', linkedin: 'linkedin.com/in/catherineimhof', website: 'catherine-imhof.ch' },
      projects: [{ name: 'Growth', url: 'growth-report.example.test/2024', visible: true }],
    })
    for (const photoBase64 of [undefined, PHOTO]) {
      const xml = await rawDocumentXml(row, 'fr', { photoBase64 })
      // The website: two text nodes around a non-breaking hyphen, in one run, no ordinary hyphen and no zero-width space.
      const website = /<w:r>(?:(?!<\/w:r>)[\s\S])*?>catherine<\/w:t>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/.exec(xml)?.[0]
      expect(website, 'the website run').toBeDefined()
      expect(website).toMatch(/>catherine<\/w:t><w:noBreakHyphen\/><w:t xml:space="preserve">imhof.ch<\/w:t>/)
      expect(website).not.toContain(ZWSP)
      expect(xml).not.toContain('catherine-imhof')
      // The project link that fits its card: the same.
      expect(xml).toMatch(/>growth<\/w:t><w:noBreakHyphen\/><w:t xml:space="preserve">report.example.test\/2024<\/w:t>/)
    }
    // As text, the value reads as stored.
    expect(await wordText(row, 'fr')).toContain('catherine-imhof.ch')
  })

  it('breaks a hyphenated value wider than its line only at its boundaries, keeping ordinary hyphens there', () => {
    const halfPoints = pxToHalfPoints(SWISS_EXECUTIVE_SIZES.contact)
    const wide = 'https://catherine-imhof.ch/verwaltungsratsmandate-und-unternehmensentwicklung/restrukturierungsprogramme-2024'
    const children = swissExecutiveLinkChildren(wide, 300, halfPoints)
    expect(children).toEqual([swissItLinkParts(wide).join(ZWSP)])
    expect((children[0] as string).split(ZWSP)).toContain('-imhof')
    // Fitting, the same text holds together.
    expect(swissExecutiveLinkChildren('catherine-imhof.ch', 300, halfPoints).filter((child) => typeof child !== 'string')).toHaveLength(1)
  })

  it('gives every page the PDF’s top and foot margins, and starts page 1 where the Preview does', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const marginX = pxToTwips(G.paddingX)
    expect(xml).toMatch(
      new RegExp(`<w:pgMar w:top="${pxToTwips(G.pageTop)}" w:right="${marginX}" w:bottom="${pxToTwips(G.pageBottom)}" w:left="${marginX}" w:header="0" w:footer="0"`),
    )
    expect(xml.split('<w:pgMar').length - 1).toBe(1)
    // The first block: a spacer of the document's top padding less the page's top margin.
    const first = /<w:body>(<w:p>[\s\S]*?<\/w:p>)/.exec(xml)?.[1] ?? ''
    expect(first).toContain(`w:after="${pxToTwips(G.paddingTop - G.pageTop)}"`)
  })

  it('writes every run at a whole number of half-points', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    for (const [, value] of xml.matchAll(/<w:sz w:val="([^"]+)"\/>/g)) expect(Number.isInteger(Number(value)), value).toBe(true)
  })

  it('ignores the stored font family and scale (FR-4)', async () => {
    const styled = await documentXml(resumeRow(), 'en', { fontScale: 1.3, fontFamily: 'Courier New, monospace' })
    expect(runOf(styled, 'Catherine Imhof')?.raw).toContain(`<w:sz w:val="${pxToHalfPoints(SWISS_EXECUTIVE_SIZES.name)}"/>`)
    expect(styled).not.toMatch(/Courier/)
  })

  it('draws the same Preview whatever font and scale are stored (FR-4)', () => {
    const plain = resumeRow()
    const styled = resumeRow({ layout_settings: { fontScale: 1.3, fontFamily: 'Courier New, monospace' } })
    const layout = resolveResumeLayout(styled, null)
    const render = (row: Row, props: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en, ...props }))
    expect(render(styled, { fontScale: layout.fontScale, fontFamily: layout.fontFamily })).toBe(render(plain, {}))
  })
})
