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
import { SWISS_FIRST_JOB_GEOMETRY, SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH, SWISS_FIRST_JOB_SIZES, swissFirstJobEmailFit } from '@/lib/swiss-first-job-template'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import {
  FIT_EMAIL_MARKER,
  SWISS_FIRST_JOB_DOT_GLYPH,
  SWISS_FIRST_JOB_HEADING_CIRCLE,
  fitEmail,
  generateSwissFirstJobDocx,
  roundPhoto,
} from './docx-swiss-first-job'

/**
 * The swissFirstJob Word export against its contract, the Preview: the same
 * sections in the same fixed order in the same column, the same hidden content
 * left out, the same localized words, the language dots in their colours, and the photo
 * drawn only when there is one and it is ticked (FR-2, FR-5, FR-6, FR-7,
 * FR-10, FR-14).
 *
 * The fixture's summary and descriptions are plain text: rich text renders
 * empty outside a browser, so the text comparisons with the Preview would not
 * see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
const PALETTE = DOCX_PALETTE.swissFirstJob
const G = SWISS_FIRST_JOB_GEOMETRY

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-first-job',
    user_id: 'u1',
    title: 'Logistics assistant',
    template: 'swissFirstJob',
    contact: {
      name: 'Kevin Gomes',
      email: 'kevin@gomes.test',
      phone: '+41 00 000 00 10',
      location: 'Yverdon-les-Bains',
      linkedin: '',
      github: 'github.test/kevin',
      website: 'kevin-gomes.test',
    },
    summary: 'Motivated logistics assistant.',
    experience: [
      { company: 'Northern Distribution', position: 'Order picker', location: 'Oxbridge', startDate: '2024-01', current: true, achievements: ['Prepared 150 parcels a day.', 'Loaded the lorries.'], visible: true },
      { company: 'Hidden Employer', position: 'Hidden Position', startDate: '2020-01', endDate: '2020-12', visible: false },
      { company: 'Lake Restaurant', position: 'Kitchen help', startDate: '2022-06', endDate: '2022-08', current: false, description: 'Summer job.', visible: true },
    ],
    education: [
      { school: 'Vocational School', degree: 'Logistics certificate', field: 'Oxbridge', startDate: '2022-08', endDate: '2024-06', visible: true },
      { school: 'Secondary School', degree: '', startDate: '2019-08', endDate: '2022-06', visible: true },
      { school: 'Hidden School', degree: 'Hidden degree', visible: false },
    ],
    skills: [
      { category: '', items: ['Handling and carrying', 'Order preparation'], visible: true },
      { category: 'Tools', items: [], skillsHtml: 'Handheld scanner, Forklift', visible: true },
      { category: 'Hidden category', items: ['Hidden skill'], visible: false },
      { category: 'Empty category', items: [], visible: true },
    ],
    languages: [
      { language: 'French', level: 'Native', visible: true },
      { language: 'English', level: 'Basic', visible: true },
      { language: 'Volapuk', level: 'Fluent', visible: false },
    ],
    certifications: [
      { name: 'Forklift licence R1', issuer: '', date: '2024-05', visible: true },
      { name: 'Driving licence B', issuer: 'SAN', date: '', visible: true },
      { name: 'Hidden licence', issuer: 'Nobody', date: '2020-01', visible: false },
    ],
    projects: [{ name: 'Never drawn project', visible: true }],
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
  return JSZip.loadAsync(await generateSwissFirstJobDocx(row, settingsFor(row, locale, extra)))
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

/** The Preview's text, node by node, in document order, with the layout settings it stores applied. */
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

/** Markers Word writes as glyphs where the Preview draws a list marker or a round box: bullets, heading circles, a language's dots. */
const withoutMarkers = (text: string) =>
  text
    .split('|')
    .filter((node) => node !== '•' && node !== SWISS_FIRST_JOB_HEADING_CIRCLE && !/^\u25CF+$/.test(node))
    .join('|')

/** The headings each output draws, in the order they appear in `text`. */
function headingOrder(text: string, locale: Locale): string[] {
  const dict = DICTS[locale]
  const labels: Record<string, string> = {
    contact: dict.resumes.editor.sections.contact,
    skills: dict.resumes.template.skills,
    languages: dict.resumes.template.languages,
    training: dict.resumes.template.training,
    summary: dict.resumes.template.summary,
    experience: dict.resumes.template.experience,
    education: dict.resumes.template.education,
  }
  const nodes = text.split('|')
  return Object.entries(labels)
    .map(([key, label]) => ({ key, at: nodes.indexOf(label) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const ALL_SECTIONS = ['contact', 'skills', 'languages', 'training', 'summary', 'experience', 'education']

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

describe('swissFirstJob: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the sections in the mockup order, sidebar then main column, under the existing labels (FR-6)', async () => {
      const row = resumeRow()
      expect(headingOrder(previewOf(row, locale), locale)).toEqual(ALL_SECTIONS)
      expect(headingOrder(await wordText(row, locale), locale)).toEqual(ALL_SECTIONS)
    })

    it('draws the same text in the same order on both outputs (FR-10)', async () => {
      const row = resumeRow()
      expect(withoutMarkers(await wordText(row, locale))).toBe(previewOf(row, locale))
    })

    it('draws every visible item and leaves out the hidden and empty ones (FR-2)', async () => {
      const row = resumeRow()
      for (const text of [previewOf(row, locale), withoutMarkers(await wordText(row, locale))]) {
        for (const visible of [
          'Yverdon-les-Bains|+41 00 000 00 10|kevin@gomes.test|github.test/kevin|kevin-gomes.test',
          '✓|Handling and carrying|✓|Order preparation|Tools|✓|Handheld scanner|✓|Forklift',
          'Forklift licence R1 \u00B7 05.2024|Driving licence B \u00B7 SAN',
          `${dict.resumes.template.languages}|French|English|`,
          'Kevin Gomes|Logistics assistant',
          `01.2024 – ${dict.resumes.template.present}|Order picker|Northern Distribution, Oxbridge`,
          '06.2022 – 08.2022|Kitchen help|Lake Restaurant|Summer job.',
          '08.2022 – 06.2024|Logistics certificate|Vocational School, Oxbridge',
          '08.2019 – 06.2022|Secondary School',
        ]) {
          expect(text, visible).toContain(visible)
        }
        for (const hidden of ['Hidden Employer', 'Hidden Position', 'Hidden School', 'Hidden licence', 'Hidden category', 'Hidden skill', 'Empty category', 'Volapuk', 'Never drawn project']) {
          expect(text, hidden).not.toContain(hidden)
        }
      }
    })
  })

  it('leaves out the sections the layout hides and the unticked details, on both outputs (FR-2, FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['summary'], hiddenSidebarSections: ['languages'], hiddenContactFields: ['email', 'website', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['contact', 'skills', 'training', 'experience', 'education'])
      expect(text).not.toContain('kevin@gomes.test')
      expect(text).not.toContain('kevin-gomes.test')
      expect(text).not.toContain('Logistics assistant')
    }
    expect(withoutMarkers(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })
})

describe('swissFirstJob: the photo (FR-5, FR-14)', () => {
  const photoDrawing = (xml: string) => /<w:drawing>(?:(?!<\/w:drawing>)[\s\S])*?<wp:inline\b[\s\S]*?<\/w:drawing>/.exec(xml)?.[0]

  it('draws the photo round, in its light ring and fill, centred at the top of the sidebar', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const drawing = photoDrawing(xml)!
    expect(drawing).toContain('<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>')
    expect(drawing).toContain(`<a:solidFill><a:srgbClr val="${PALETTE.photoFill}"/></a:solidFill>`)
    expect(drawing).toMatch(new RegExp(`<a:ln w="${G.photoRing * 9525}"><a:solidFill><a:srgbClr val="${PALETTE.soft}"/>`))
    expect(drawing).toContain(`<wp:extent cx="${G.photo * 9525}" cy="${G.photo * 9525}"/>`)
    expect(xml.indexOf(drawing)).toBeLessThan(xml.indexOf(`>${en.resumes.editor.sections.contact}<`))
  })

  it('draws no photo without one, unticked, or not an image it can embed', async () => {
    expect(photoDrawing(await documentXml(resumeRow(), 'en'))).toBeUndefined()
    expect(photoDrawing(await documentXml(resumeRow({ layout_settings: { hiddenContactFields: ['photo'] } }), 'en', { photoBase64: PHOTO }))).toBeUndefined()
    expect(photoDrawing(await documentXml(resumeRow(), 'en', { photoBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }))).toBeUndefined()
  })

  it('refuses to ship a square photo when the drawing is not in the shape docx writes', () => {
    expect(() => roundPhoto('<w:document/>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no inline drawing/)
  })
})

describe('swissFirstJob: Word layout (FR-10)', () => {
  const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p)
  const runs = (xml: string) =>
    [...xml.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => ({
      text: [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, t]) => t).join(''),
      raw: inner,
    }))
  const runOf = (xml: string, text: string) => runs(xml).find((r) => r.text === text)

  it('paints the sidebar on every page from the paper’s top edge to its foot: a page-high fill anchored to the page, in the repeated header', async () => {
    const zip = await artifact(resumeRow(), 'en')
    const documentPart = await zip.file('word/document.xml')!.async('string')
    const headerName = Object.keys(zip.files).find((name) => /^word\/header\d*\.xml$/.test(name))!
    const header = await zip.file(headerName)!.async('string')
    const anchors = [...header.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)].map(([a]) => a)
    expect(anchors).toHaveLength(1)
    const [fill] = anchors
    expect(fill).toContain('behindDoc="1"')
    expect(fill).toContain('<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>')
    expect(fill).toContain('<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>')
    const pageHeight = Number(/<w:pgSz [^>]*w:h="(\d+)"/.exec(documentPart)?.[1])
    expect(Number(/<wp:extent cx="(\d+)"/.exec(fill)?.[1]) / 9525).toBe(G.sidebarWidth)
    expect(Math.abs(Number(/<wp:extent cx="\d+" cy="(\d+)"/.exec(fill)?.[1]) - pageHeight * 635)).toBeLessThanOrEqual(5)
    // The header is the section's default one: every page has it.
    expect(documentPart).toMatch(/<w:headerReference w:type="default"/)
    // The body draws no fill of its own: no shading on the sidebar's cell.
    expect(documentPart).not.toMatch(/<w:shd\b/)
  })

  it('gives every page the PDF’s top and foot margins and no side margin', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    expect(xml).toMatch(new RegExp(`<w:pgMar w:top="${pxToTwips(G.pageTop)}" w:right="0" w:bottom="${pxToTwips(G.pageBottom)}" w:left="0" w:header="0" w:footer="0"`))
  })

  it('lays the sidebar out in a cell 260px wide, its text 212px wide, as the Preview', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    expect(xml).toContain(`<w:gridCol w:w="${pxToTwips(G.sidebarWidth)}"/>`)
    const sidebar = /<w:tc>[\s\S]*?<\/w:tc>/.exec(xml)![0]
    const left = Number(/<w:tcMar>[\s\S]*?<w:(?:left|start) w:type="dxa" w:w="(\d+)"\/>/.exec(sidebar)?.[1])
    const right = Number(/<w:tcMar>[\s\S]*?<w:(?:right|end) w:type="dxa" w:w="(\d+)"\/>/.exec(sidebar)?.[1])
    expect((pxToTwips(G.sidebarWidth) - left - right) / 15).toBe(SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH)
  })

  it('heads the sidebar in violet bold spaced capitals, and the main column after the violet circle', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const skills = runOf(xml, en.resumes.template.skills)!
    expect(skills.raw).toContain('<w:caps/>')
    expect(skills.raw).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
    expect(skills.raw).toContain(`<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissFirstJob.caps, pxToHalfPoints(SWISS_FIRST_JOB_SIZES.sidebarHeading))}"/>`)
    const experience = paragraphs(xml).find((p) => p.includes(`>${en.resumes.template.experience}<`))!
    // The circle and the tab to the label share one run: the tab takes the circle's size.
    expect(runs(experience)[0].text).toBe(`${SWISS_FIRST_JOB_HEADING_CIRCLE}\t`)
    expect(runs(experience)[0].raw).toContain(`<w:color w:val="${PALETTE.mark}"/>`)
  })

  it('writes a language’s five dots as one glyph in one font at one size, violet when filled and light violet when empty, after a space (FR-7)', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const english = paragraphs(xml).find((p) => p.includes('>English<'))!
    const [name, lead, filled, empty] = runs(english)
    expect(name.text).toBe('English')
    expect([lead.text, filled.text, empty.text]).toEqual(['\u00A0', SWISS_FIRST_JOB_DOT_GLYPH, SWISS_FIRST_JOB_DOT_GLYPH.repeat(4)])
    for (const dot of [lead, filled, empty]) {
      expect(dot.raw).toContain('<w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>')
      expect(dot.raw).toContain('<w:sz w:val="24"/>')
    }
    expect(filled.raw).toContain(`<w:color w:val="${PALETTE.mark}"/>`)
    expect(empty.raw).toContain(`<w:color w:val="${PALETTE.emptyDot}"/>`)
    // Arial's circle at 12pt is 6.9px of ink: the Preview's 7px dot. The spacing leaves its 4px gaps and the 7px lead.
    expect(24 / 1.5 * 0.43).toBeCloseTo(SWISS_FIRST_JOB_GEOMETRY.dot, 0)
    expect(filled.raw).toContain(`<w:spacing w:val="${pxToTwips(SWISS_FIRST_JOB_GEOMETRY.dotsGap - 2 * 0.087 * 16)}"/>`)
    expect(lead.raw).toContain(`<w:spacing w:val="${pxToTwips(SWISS_FIRST_JOB_GEOMETRY.dotsLead - (0.278 + 0.087) * 16)}"/>`)
    // The level is told by colour only in Word: a native speaker's five dots are all violet.
    const french = runs(paragraphs(xml).find((p) => p.includes('>French<'))!)
    expect(french.map((r) => r.text)).toEqual(['French', '\u00A0', SWISS_FIRST_JOB_DOT_GLYPH.repeat(5)])
  })

  it('writes an email wider than the sidebar as the stored address, byte for byte, in one run at the size that fits it', async () => {
    const email = 'maximilian.mustermann-gomes@hotmail.com'
    expect(email).toHaveLength(39)
    const fit = swissFirstJobEmailFit(email)
    const xml = await rawDocumentXml(resumeRow({ contact: { name: 'Max', email } }), 'en')
    // The text Word extracts, run by run, holds the exact address: no hidden character, no non-breaking hyphen.
    const texts = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text)
    expect(texts).toContain(email)
    expect(xml).not.toContain(String.fromCharCode(0x200b))
    const run = runOf(xml, email)!
    expect(run.raw).not.toContain('noBreakHyphen')
    expect(run.raw).toContain(`<w:sz w:val="${fit.halfPoints}"/>`)
    expect(fit.halfPoints).toBeLessThan(pxToHalfPoints(SWISS_FIRST_JOB_SIZES.sidebar))
  })

  describe('writes the email as the stored address, byte for byte, whatever its width', () => {
    const ZWSP = String.fromCharCode(0x200b)
    const emailParagraph = (xml: string, email: string) => paragraphs(xml).find((p) => p.includes(email))
    it.each([
      ['fitting', 'kevin.gomes-lab@exemple.test', pxToHalfPoints(SWISS_FIRST_JOB_SIZES.sidebar)],
      ['shrunk', 'maximilian.mustermann-gomes@hotmail.com', 14],
      ['too wide even at 7pt', 'maximilian-alexander.mustermann-gomes@hotmail-example.com', 14],
    ] as const)('%s: %s', async (_case, email, halfPoints) => {
      const xml = await rawDocumentXml(resumeRow({ contact: { name: 'Max', email } }), 'en')
      const paragraph = emailParagraph(xml, email)!
      const texts = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text)
      expect(texts).toEqual([email])
      expect(paragraph).not.toContain(ZWSP)
      expect(paragraph).not.toContain('noBreakHyphen')
      expect(runOf(xml, email)?.raw).toContain(`<w:sz w:val="${halfPoints}"/>`)
      // The marker run style never reaches Word.
      expect(xml).not.toContain(FIT_EMAIL_MARKER)
    })

    it('compresses only the email too wide even at 7pt onto one line, with w:fitText of the sidebar’s text width', async () => {
      const wide = 'maximilian-alexander.mustermann-gomes@hotmail-example.com'
      expect(wide).toHaveLength(57)
      expect(swissFirstJobEmailFit(wide).parts.length).toBeGreaterThan(1)
      const xml = await rawDocumentXml(resumeRow({ contact: { name: 'Max', email: wide } }), 'en')
      const fits = [...xml.matchAll(/<w:fitText\b[^>]*\/>/g)].map(([fit]) => fit)
      expect(fits).toEqual([`<w:fitText w:val="${pxToTwips(SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH)}" w:id="1"/>`])
      expect(runOf(xml, wide)?.raw).toContain(fits[0])
      // In the schema's place: after the size, before the language.
      const properties = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(runOf(xml, wide)!.raw)![1]
      expect(properties.indexOf('<w:fitText')).toBeGreaterThan(properties.indexOf('<w:sz '))
      if (properties.includes('<w:lang')) expect(properties.indexOf('<w:fitText')).toBeLessThan(properties.indexOf('<w:lang'))
      for (const email of ['kevin.gomes-lab@exemple.test', 'maximilian.mustermann-gomes@hotmail.com']) {
        expect(await rawDocumentXml(resumeRow({ contact: { name: 'Max', email } }), 'en')).not.toContain('w:fitText')
      }
    })

    it('refuses to ship when the email run cannot be found', () => {
      expect(() => fitEmail('<w:document/>', 3180)).toThrow(/one email run/)
    })
  })

  it('writes a fitting email as stored at the sidebar’s size, and holds a fitting hyphenated link as one unit', async () => {
    const xml = await rawDocumentXml(resumeRow({ contact: { name: 'Kevin', email: 'kevin.gomes-lab@exemple.test', website: 'kevin-gomes.test' } }), 'en')
    expect(xml).toMatch(/>kevin<\/w:t><w:noBreakHyphen\/><w:t xml:space="preserve">gomes\.test<\/w:t>/)
    expect(runOf(xml, 'kevin.gomes-lab@exemple.test')?.raw).toContain(`<w:sz w:val="${pxToHalfPoints(SWISS_FIRST_JOB_SIZES.sidebar)}"/>`)
    expect(xml).not.toContain(String.fromCharCode(0x200b))
  })

  it('writes every date as one unbreakable run', async () => {
    const xml = await documentXml(resumeRow(), 'de')
    const date = runOf(xml, `01.2024\u00A0–\u00A0${de.resumes.template.present}`)
    expect(date?.raw).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
  })

  it('writes every run at a whole number of half-points, and ignores the stored font and scale (FR-4)', async () => {
    const xml = await documentXml(resumeRow(), 'en', { fontScale: 1.3, fontFamily: 'Georgia, serif', photoBase64: PHOTO })
    for (const [, value] of xml.matchAll(/<w:sz w:val="([^"]+)"\/>/g)) expect(Number.isInteger(Number(value)), value).toBe(true)
    expect(runOf(xml, 'Kevin Gomes')?.raw).toContain(`<w:sz w:val="${pxToHalfPoints(SWISS_FIRST_JOB_SIZES.name)}"/>`)
    expect(xml).not.toMatch(/Georgia/)
  })
})
