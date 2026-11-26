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
import { SwissEngineeringTemplate } from '@/components/dashboard/resume-templates/swiss-engineering-template'
import { SWISS_ENGINEERING_COLUMN_TEXT_WIDTH, SWISS_ENGINEERING_GEOMETRY, SWISS_ENGINEERING_SIZES } from '@/lib/swiss-engineering-template'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { interTextWidthPx } from '@/test/inter-advance-widths'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { generateSwissEngineeringDocx, roundPhoto } from './docx-swiss-engineering'

/**
 * The swissEngineering Word export against its contract, the Preview: the same
 * sections in the same fixed order in the same column, the same hidden content
 * left out, the same localized words, the project cards' content, and the
 * photo drawn only when there is one and it is ticked (FR-2, FR-5, FR-6, FR-7,
 * FR-10, FR-14).
 *
 * The fixture's summary and descriptions are plain text: rich text renders
 * empty outside a browser, so the text comparisons with the Preview would not
 * see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
const PALETTE = DOCX_PALETTE.swissEngineering
const G = SWISS_ENGINEERING_GEOMETRY

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-engineering',
    user_id: 'u1',
    title: 'Structural engineer',
    template: 'swissEngineering',
    contact: {
      name: 'Robin Halvorsen',
      email: 'robin@halvorsen.test',
      phone: '+41 00 000 00 07',
      location: 'Oxbridge',
      linkedin: 'in/robin-halvorsen',
      github: 'gh/halvorsen',
      website: 'halvorsen.test',
    },
    summary: 'Engineer of bridges and timber buildings.',
    projects: [
      { name: 'Broye bridge', description: 'Strengthened the deck ahead of time.', technologies: ['SIA 262', 'Revit'], url: 'example.test/broye', visible: true },
      { name: 'Hidden project', description: 'Hidden project description.', visible: false },
      { name: '', description: 'A project with no name.', visible: true },
      { name: ' ', description: '', technologies: [], url: '', visible: true },
    ],
    experience: [
      {
        company: 'Tessellate Structures',
        position: 'Project lead',
        location: 'Oxbridge',
        startDate: '2019-01',
        current: true,
        achievements: ['Led the works.', 'Trained two draughtsmen.'],
        visible: true,
      },
      {
        company: 'Hidden Employer',
        position: 'Hidden Position',
        startDate: '2016-01',
        endDate: '2018-12',
        current: false,
        achievements: ['Hidden achievement.'],
        visible: false,
      },
      {
        company: 'Saltmarsh Engineers',
        position: 'Engineer',
        startDate: '2014-06',
        endDate: '2018-12',
        current: false,
        description: 'Calculated the structures.',
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Bachelor of Science', field: 'Civil engineering', startDate: '2010-09', endDate: '2014-06', visible: true },
      { school: 'Oxbridge Trade School', degree: '', startDate: '2006-08', endDate: '2010-06', description: 'Draughtsman apprenticeship.', visible: true },
      { school: 'Hidden School', degree: 'Hidden degree', startDate: '2008-09', endDate: '2010-06', visible: false },
    ],
    skills: [
      { category: 'Design', items: [], skillsHtml: 'Load analysis, BIM, Finite elements', visible: true },
      { category: 'Tools', items: ['Revit'], visible: true },
      { category: 'Hidden category', items: ['Hidden skill'], visible: false },
      { category: 'Empty category', items: [], visible: true },
    ],
    languages: [
      { language: 'Esperanto', level: 'Native', visible: true },
      { language: 'Interlingua', level: 'Professional', visible: true },
      { language: 'Volapuk', level: 'Basic', visible: false },
    ],
    certifications: [
      { name: 'Register A', issuer: '', date: '2022-05', visible: true },
      { name: 'Timber design', issuer: 'Lignum', date: '', visible: true },
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

/** Entities decoded, and no-break spaces read as the spaces they stand for. */
function decode(text: string): string {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/ /g, ' ')
}

async function documentXml(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const zip = await JSZip.loadAsync(await generateSwissEngineeringDocx(row, settingsFor(row, locale, extra)))
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error('The artifact has no word/document.xml')
  // A non-breaking hyphen is a hyphen of the text, written as an element of its
  // own between two text nodes: read it back into its text node.
  return (await part.async('string')).replace(/<\/w:t><w:noBreakHyphen\/><w:t xml:space="preserve">/g, '-')
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
  return markup
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

/** The headings each output draws, in the order they appear in `text`. */
function headingOrder(text: string, locale: Locale): string[] {
  const dict = DICTS[locale]
  const labels: Record<string, string> = {
    summary: dict.resumes.template.summary,
    keyAchievements: dict.resumes.template.keyAchievements,
    experience: dict.resumes.template.experience,
    contact: dict.resumes.editor.sections.contact,
    education: dict.resumes.template.education,
    skills: dict.resumes.template.skills,
    languages: dict.resumes.template.languages,
    training: dict.resumes.template.training,
  }
  const nodes = text.split('|')
  return Object.entries(labels)
    .map(([key, label]) => ({ key, at: nodes.indexOf(label) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const ALL_SECTIONS = ['summary', 'keyAchievements', 'experience', 'contact', 'education', 'skills', 'languages', 'training']

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

describe('swissEngineering: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the sections in the mockup order, main column then light column, under the existing headings (FR-6)', async () => {
      const row = resumeRow()
      expect(headingOrder(previewOf(row, locale), locale)).toEqual(ALL_SECTIONS)
      expect(headingOrder(await wordText(row, locale), locale)).toEqual(ALL_SECTIONS)
    })

    it('draws the same localized words: present and the language levels (FR-7)', async () => {
      const row = resumeRow()
      const preview = previewOf(row, locale)
      const word = await wordText(row, locale)
      for (const text of [
        dict.resumes.template.present,
        `Esperanto — ${dict.resumes.editor.levels.native}`,
        `Interlingua — ${dict.resumes.editor.levels.professional}`,
      ]) {
        expect(preview, `Preview draws "${text}"`).toContain(text)
        expect(word, `Word draws "${text}"`).toContain(text)
      }
    })

    it('draws the same text in the same order on both outputs (FR-10)', async () => {
      const row = resumeRow()
      expect(withoutBullets(await wordText(row, locale))).toBe(previewOf(row, locale))
    })

    it('draws every visible item and leaves out the hidden and empty ones (FR-2)', async () => {
      const row = resumeRow()
      for (const text of [previewOf(row, locale), await wordText(row, locale)]) {
        for (const visible of [
          'Robin Halvorsen|Structural engineer',
          'Engineer of bridges and timber buildings.',
          // A card: its name, its description, its technologies, its link.
          'Broye bridge|Strengthened the deck ahead of time.|SIA 262, Revit|example.test/broye',
          // A project with no name: its description alone.
          `example.test/broye|A project with no name.|${dict.resumes.template.experience}`,
          `Project lead|01.2019 – ${dict.resumes.template.present}|Tessellate Structures, Oxbridge`,
          'Led the works.',
          'Trained two draughtsmen.',
          'Engineer|06.2014 – 12.2018|Saltmarsh Engineers|Calculated the structures.',
          'Oxbridge|+41 00 000 00 07|robin@halvorsen.test|in/robin-halvorsen|gh/halvorsen|halvorsen.test',
          'Bachelor of Science|Halvorsen Institute, Civil engineering, 09.2010 – 06.2014',
          'Oxbridge Trade School|08.2006 – 06.2010|Draughtsman apprenticeship.',
          'Design|Load analysis|BIM|Finite elements|Tools|Revit',
          'Register A, 05.2022|Timber design, Lignum',
        ]) {
          expect(text, visible).toContain(visible)
        }
        for (const hidden of [
          'Hidden project',
          'Hidden Employer',
          'Hidden Position',
          'Hidden achievement.',
          'Hidden School',
          'Hidden licence',
          'Hidden category',
          'Hidden skill',
          'Empty category',
          'Volapuk',
        ]) {
          expect(text, hidden).not.toContain(hidden)
        }
      }
    })
  })

  it('draws no heading for a section whose items are all hidden or empty, on both outputs', async () => {
    const row = resumeRow({
      projects: [{ name: 'Hidden project', description: 'x', visible: false }, { name: '', description: '<p></p>', visible: true }],
      certifications: [{ name: '', issuer: '', date: '', visible: true }],
      skills: [{ category: 'Blank', items: ['  '], visible: true }],
      languages: [{ language: ' ', level: 'Native', visible: true }],
      summary: '<p></p>',
    })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'contact', 'education'])
      expect(text).not.toContain('Blank')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('leaves out the sections the layout hides, through either panel, heading included, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['education', 'summary'], hiddenSidebarSections: ['keyAchievements', 'languages'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'contact', 'skills', 'training'])
      expect(text).not.toContain('Halvorsen Institute')
      expect(text).not.toContain('Broye bridge')
      expect(text).not.toContain('Esperanto')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('draws the employer or the school as the first line when the position or degree is empty, once, on both outputs', async () => {
    const row = resumeRow({
      experience: [{ company: 'Tessellate Structures', position: '', location: 'Oxbridge', startDate: '2019-01', current: true, visible: true }],
    })
    const preview = previewOf(row, 'en')
    expect(await wordText(row, 'en')).toBe(preview)
    expect(preview).toContain(`Tessellate Structures, Oxbridge|01.2019 – ${en.resumes.template.present}`)
    expect(preview.split('Tessellate Structures').length - 1).toBe(1)
  })

  it('draws no "present" for an entry stored without any date, on both outputs', async () => {
    const row = resumeRow({ education: [{ school: 'Halvorsen Institute', degree: 'Bachelor of Science', visible: true }], experience: [] })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).toContain('Bachelor of Science|Halvorsen Institute|')
      expect(text).not.toContain(en.resumes.template.present)
    }
  })

  it('leaves out each unticked contact detail and the CV title on both outputs, and keeps the ticked ones (FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'github', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).not.toContain('robin@halvorsen.test')
      expect(text).not.toContain('gh/halvorsen')
      expect(text).not.toContain('Structural engineer')
      expect(text).toContain('+41 00 000 00 07')
      expect(text).toContain('Robin Halvorsen')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })
})

describe('swissEngineering: the photo (FR-5, FR-14)', () => {
  const previewMarkup = (row: Row, photoUrl?: string) => {
    const layout = resolveResumeLayout(row, null)
    return renderToStaticMarkup(
      createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en, photoUrl, hiddenContactFields: layout.hiddenContactFields }),
    )
  }

  const photoDrawing = (xml: string) => /<w:drawing>(?:(?!<\/w:drawing>)[\s\S])*?<wp:inline\b[\s\S]*?<\/w:drawing>/.exec(xml)?.[0]

  it('draws the photo round, in its light ring and fill, at the top of the light column, on both outputs', async () => {
    const preview = previewMarkup(resumeRow(), PHOTO)
    expect(preview).toContain(`src="${PHOTO}"`)
    expect(preview).toContain('class="swiss-engineering-photo shrink-0 overflow-hidden"')

    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const drawing = photoDrawing(xml)
    expect(drawing).toBeDefined()
    expect(drawing).toContain('<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>')
    expect(drawing).toContain(`<a:solidFill><a:srgbClr val="${PALETTE.photoFill}"/></a:solidFill>`)
    expect(drawing).toMatch(new RegExp(`<a:ln w="${G.photoRing * 9525}"><a:solidFill><a:srgbClr val="${PALETTE.photoRing}"/>`))
    expect(drawing).toContain(`<wp:extent cx="${G.photo * 9525}" cy="${G.photo * 9525}"/>`)
    // In the light column, before its contact heading; after the main column.
    expect(xml.indexOf(drawing!)).toBeGreaterThan(xml.indexOf('>Led the works.<'))
    expect(xml.indexOf(drawing!)).toBeLessThan(xml.indexOf(`>${en.resumes.editor.sections.contact}<`))
    // The column fills stay rectangles: only the photo is made round.
    expect(xml.split('prst="ellipse"').length - 1).toBe(1)
  })

  it('lays the photo centred in a paragraph of auto line spacing, so Word does not clip it to a text line', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const holder = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes('<wp:inline'))
    expect(holder).toMatch(/<w:spacing [^>]*w:line="240" w:lineRule="auto"\/>/)
    expect(holder).toContain('<w:jc w:val="center"/>')
  })

  it('embeds the photo only when there is one: one more image than the two column fills', async () => {
    const media = async (extra: Partial<DocxGeneratorSettings>) => {
      const zip = await JSZip.loadAsync(await generateSwissEngineeringDocx(resumeRow(), settingsFor(resumeRow(), 'en', extra)))
      return Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    }
    expect(await media({})).toHaveLength(2)
    expect(await media({ photoBase64: PHOTO })).toHaveLength(3)
  })

  it('draws no photo frame on either output when there is none, or the data is not an image it can embed', async () => {
    const preview = previewMarkup(resumeRow())
    expect(preview).not.toContain('<img')
    expect(preview).not.toContain('swiss-engineering-photo')
    expect(photoDrawing(await documentXml(resumeRow(), 'en'))).toBeUndefined()
    expect(photoDrawing(await documentXml(resumeRow(), 'en', { photoBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }))).toBeUndefined()
  })

  it('draws no photo on either output when the photo is unticked, and draws it again when ticked', async () => {
    const hidden = resumeRow({ layout_settings: { hiddenContactFields: ['photo'] } })
    expect(previewMarkup(hidden, PHOTO)).toBe(previewMarkup(resumeRow()))
    expect(photoDrawing(await documentXml(hidden, 'en', { photoBase64: PHOTO }))).toBeUndefined()
    expect(photoDrawing(await documentXml(hidden, 'en', { photoBase64: PHOTO, hiddenContactFields: [] }))).toBeDefined()
  })

  it('draws no upload box in the CV: the photo is uploaded from the Contact tab', () => {
    const html = renderToStaticMarkup(createElement(SwissEngineeringTemplate, { resume: resumeRow() as unknown as Resume, locale: 'fr', dict: fr }))
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
    expect(html).not.toContain('<button')
  })

  it('refuses to ship a square photo when the drawing is not in the shape docx writes', () => {
    expect(() => roundPhoto('<w:document/>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no inline drawing/)
    expect(() => roundPhoto('<wp:inline></wp:inline>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no rectangular picture geometry/)
    expect(() => roundPhoto('<wp:inline><a:prstGeom prst="rect"/></wp:inline>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no effect extent/)
  })
})

describe('swissEngineering: Word layout (FR-10)', () => {
  const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p)

  /** Each paragraph's runs, in order, as their text and whether they are bold. */
  const paragraphRuns = (paragraph: string) =>
    [...paragraph.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => ({
      text: [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map(([tag, t]) => (tag === '<w:tab/>' ? '\t' : decode(t))).join(''),
      bold: /<w:b\/>/.test(inner),
      raw: inner,
    }))

  /** The innermost table holding `needle`. */
  const tableHolding = (xml: string, needle: string) =>
    [...xml.matchAll(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g)].map(([table]) => table).find((table) => table.includes(needle))

  /**
   * The light column's cell: the document's last cell, since the body table's
   * content row ends with it and every card table sits in the main column before it.
   */
  async function bodyCells(row = resumeRow()) {
    const xml = await documentXml(row, 'en')
    const side = xml.slice(xml.lastIndexOf('<w:tc>'), xml.lastIndexOf('</w:tc>'))
    expect(side, 'the light column’s cell').toContain(`>${en.resumes.editor.sections.contact}<`)
    expect(side).not.toContain('>Robin Halvorsen<')
    return { xml, side }
  }

  it('draws every heading in blue bold spaced capitals, kept with what follows', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    for (const label of [en.resumes.template.summary, en.resumes.template.keyAchievements, en.resumes.editor.sections.contact, en.resumes.template.training]) {
      const heading = paragraphs(xml).find((p) => p.includes(`>${label}<`))
      expect(heading, label).toBeDefined()
      const [text] = paragraphRuns(heading!)
      expect(text.bold).toBe(true)
      expect(text.raw).toContain('<w:caps/>')
      expect(text.raw).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
      expect(text.raw).toContain(`<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissEngineering.caps, pxToHalfPoints(SWISS_ENGINEERING_SIZES.heading))}"/>`)
      expect(heading).toContain('<w:keepNext/>')
    }
  })

  it('lays the light column out in a cell 250px wide, its text 202px wide, with no shading or border over the page fills', async () => {
    const { xml, side } = await bodyCells()
    expect(xml).toContain(`<w:gridCol w:w="${pxToTwips(G.columnWidth)}"/>`)
    expect(side).toContain(`<w:tcW w:type="dxa" w:w="${pxToTwips(G.columnWidth)}"/>`)
    // Word paints a cell's shading and borders over drawings behind the text:
    // the cell carries neither, so the one blue bar is the page drawing.
    const cellProperties = /<w:tcPr>[\s\S]*?<\/w:tcPr>/.exec(side)?.[0] ?? ''
    expect(cellProperties).toContain('<w:tcW')
    expect(cellProperties).not.toMatch(/<w:shd\b/)
    expect(cellProperties).not.toMatch(/w:val="single"/)
    const left = Number(/<w:tcMar>[\s\S]*?<w:left w:type="dxa" w:w="(\d+)"\/>/.exec(side)?.[1] ?? /<w:tcMar>[\s\S]*?<w:start w:type="dxa" w:w="(\d+)"\/>/.exec(side)?.[1])
    const right = Number(/<w:tcMar>[\s\S]*?<w:right w:type="dxa" w:w="(\d+)"\/>/.exec(side)?.[1] ?? /<w:tcMar>[\s\S]*?<w:end w:type="dxa" w:w="(\d+)"\/>/.exec(side)?.[1])
    expect((pxToTwips(G.columnWidth) - left - right) / 15).toBe(SWISS_ENGINEERING_COLUMN_TEXT_WIDTH)
  })

  /** The section's default header, where the page fills sit, and its relationships. */
  const headerPart = async (zip: JSZip) => {
    const name = Object.keys(zip.files).find((file) => /^word\/header\d*\.xml$/.test(file))!
    return {
      xml: await zip.file(name)!.async('string'),
      rels: await zip.file(name.replace(/^word\/(.*)$/, 'word/_rels/$1.rels'))!.async('string'),
    }
  }

  it('paints the light column and its one bar to the foot of every page: two page-high fills in the repeated header', async () => {
    const zip = await JSZip.loadAsync(await generateSwissEngineeringDocx(resumeRow(), settingsFor(resumeRow(), 'en')))
    const { xml, rels } = await headerPart(zip)
    /** The palette colour of the solid PNG a drawing shows. */
    const drawingColour = async (anchor: string) => {
      const id = /r:embed="([^"]+)"/.exec(anchor)?.[1]
      const relationship = [...rels.matchAll(/<Relationship\b[^>]*\/>/g)].map(([r]) => r).find((r) => r.includes(`Id="${id}"`))
      const target = /Target="([^"]+)"/.exec(relationship ?? '')?.[1]
      const png = await zip.file(`word/${target}`)!.async('nodebuffer')
      return Object.values(PALETTE).find((hex) => png.equals(solidColourPng(hex))) ?? 'unknown'
    }
    const anchors = [...xml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)].map(([a]) => a)
    expect(anchors).toHaveLength(2)
    // Exactly one blue drawing, then the grey fill.
    expect(await Promise.all(anchors.map(drawingColour))).toEqual([PALETTE.bar, PALETTE.column])
    // The bar's left edge is the column's, 544px from the page's left edge as on the Preview; the fill follows it.
    const columnLeftPx = PAGE_WIDTH_PX - G.columnWidth
    expect(columnLeftPx).toBe(544)
    const offsets = anchors.map((a) => Number(/<wp:positionH relativeFrom="page"><wp:posOffset>(\d+)<\/wp:posOffset>/.exec(a)?.[1]))
    expect(offsets).toEqual([columnLeftPx * 9525, (columnLeftPx + G.columnBar) * 9525])
    // The bar is stacked in front of the fill; both stay behind the text.
    const stack = anchors.map((a) => Number(/relativeHeight="(\d+)"/.exec(a)?.[1]))
    expect(stack[0]).toBeGreaterThan(stack[1])
    for (const anchor of anchors) {
      expect(anchor).toContain('behindDoc="1"')
      expect(anchor).toContain('layoutInCell="0"')
    }
    const widths = anchors.map((a) => Number(/<wp:extent cx="(\d+)"/.exec(a)?.[1]) / 9525)
    expect(widths).toEqual([G.columnBar, G.columnWidth - G.columnBar])
  })

  it('draws the bar and the fill from the page’s top edge to its foot: page-relative, offset 0, the A4 page’s height', async () => {
    const row = resumeRow()
    const zip = await JSZip.loadAsync(await generateSwissEngineeringDocx(row, settingsFor(row, 'de', { photoBase64: PHOTO })))
    const xml = await zip.file('word/document.xml')!.async('string')
    const pageHeightTwips = Number(/<w:pgSz [^>]*w:h="(\d+)"/.exec(xml)?.[1])
    expect(pageHeightTwips).toBe(16838)
    const anchors = [...(await headerPart(zip)).xml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)].map(([a]) => a)
    expect(anchors).toHaveLength(2)
    for (const anchor of anchors) {
      expect(anchor).toContain('<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>')
      expect(anchor).toMatch(/<wp:positionH relativeFrom="page">/)
      // The page's height, to the EMU rounding of a px extent (under 0.001px).
      const cy = Number(/<wp:extent cx="\d+" cy="(\d+)"\/>/.exec(anchor)?.[1])
      expect(Math.abs(cy - pageHeightTwips * 635)).toBeLessThanOrEqual(5)
    }
    // The bar and the fill share their top and their height.
    const [bar, fill] = anchors.map((a) => /<wp:extent cx="\d+" cy="(\d+)"\/>/.exec(a)?.[1])
    expect(bar).toBe(fill)
  })

  it('anchors both fills in the section’s default header, outside any table, so Word places them from the page whatever its top margin', async () => {
    const zip = await JSZip.loadAsync(await generateSwissEngineeringDocx(resumeRow(), settingsFor(resumeRow(), 'en')))
    const documentPart = await zip.file('word/document.xml')!.async('string')
    const { xml } = await headerPart(zip)
    expect(xml).not.toContain('<w:tbl>')
    expect(documentPart).toMatch(/<w:headerReference w:type="default"/)
    // The body repeats no header row and holds no page fill.
    expect(documentPart).not.toContain('<w:tblHeader/>')
    expect(documentPart).not.toMatch(/<wp:anchor\b[^>]*layoutInCell="0"/)
  })

  it('draws each project as a shaded one-cell table: thin border, thick blue left edge, its padding as margins', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const card = tableHolding(xml, '>Broye bridge<')
    expect(card).toBeDefined()
    expect([...card!.matchAll(/<w:tc>/g)]).toHaveLength(1)
    expect(card).toMatch(new RegExp(`<w:shd [^>]*w:fill="${PALETTE.card}"`))
    expect(card).toMatch(new RegExp(`<w:top w:val="single" w:color="${PALETTE.cardBorder}" w:sz="${Math.round(G.cardBorder * 6)}"`))
    expect(card).toMatch(new RegExp(`<w:left w:val="single" w:color="${PALETTE.bar}" w:sz="${Math.round(G.cardBar * 6)}"`))
    // The card's content, in order: bold name, description, technologies and link in grey.
    const texts = paragraphs(card!).map((p) => paragraphRuns(p))
    expect(texts.map((runs) => runs.map((r) => r.text).join(''))).toEqual(['Broye bridge', 'Strengthened the deck ahead of time.', 'SIA 262, Revit', 'example.test/broye'])
    expect(texts[0][0].bold).toBe(true)
    expect(texts[0][0].raw).toContain(`<w:color w:val="${PALETTE.ink}"/>`)
    for (const muted of [texts[2][0], texts[3][0]]) expect(muted.raw).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
    // Two cards are two tables with a gap between them, not one merged table.
    expect(tableHolding(xml, '>A project with no name.<')).not.toBe(card)
  })

  it('draws an experience’s first line as its bold position, then its dates in grey at a right tab stop', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const first = paragraphs(xml).find((p) => p.includes('>Project lead<'))
    const runs = paragraphRuns(first!)
    expect(runs.map((r) => r.text)).toEqual(['Project lead', '\t', `01.2019 – ${en.resumes.template.present}`])
    expect(runs[0].bold).toBe(true)
    expect(runs[2].raw).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
    expect(first).toMatch(/<w:tab w:val="right" w:pos="\d+"\/>/)
  })

  it('draws an education’s degree and a skill category’s caption bold, and every other line of the column in the body colour', async () => {
    const { side } = await bodyCells()
    const lines = paragraphs(side).map((p) => paragraphRuns(p)).filter((runs) => runs.length > 0)
    const byText = (text: string) => lines.find((runs) => runs.map((r) => r.text).join('') === text)?.[0]
    for (const bold of ['Bachelor of Science', 'Oxbridge Trade School', 'Design', 'Tools']) {
      expect(byText(bold)?.bold, bold).toBe(true)
      expect(byText(bold)?.raw, bold).toContain(`<w:color w:val="${PALETTE.ink}"/>`)
    }
    for (const plain of ['Halvorsen Institute, Civil engineering, 09.2010 – 06.2014', 'Load analysis', 'Register A, 05.2022', `Esperanto — ${en.resumes.editor.levels.native}`]) {
      expect(byText(plain)?.bold, plain).toBe(false)
      expect(byText(plain)?.raw, plain).toContain(`<w:color w:val="${PALETTE.body}"/>`)
      expect(byText(plain)?.raw, plain).toContain(`<w:sz w:val="${pxToHalfPoints(SWISS_ENGINEERING_SIZES.column)}"/>`)
    }
    // The muted grey, under 4.5:1 on the column, is never drawn there.
    expect(side).not.toContain(`<w:color w:val="${PALETTE.muted}"/>`)
  })

  it('keeps every long word of the light column whole: each fits the column’s text width at Word’s size', async () => {
    const words = ['Kommunikationsfähigkeiten', 'Projektleitungserfahrung', 'Bauingenieurwesen', 'Tragwerksplanung', 'Dimensionnement', 'Progettazione']
    const row = resumeRow({
      education: [{ school: 'Halvorsen Institute', degree: 'Bachelor of Science in Bauingenieurwesen', visible: true }],
      skills: [{ category: 'Kommunikationsfähigkeiten', items: ['Projektleitungserfahrung', 'Tragwerksplanung'], visible: true }],
    })
    const xml = await documentXml(row, 'de')
    const wordPx = pxToHalfPoints(SWISS_ENGINEERING_SIZES.column) / 1.5
    for (const word of words) expect(interTextWidthPx(word, 700, wordPx), word).toBeLessThanOrEqual(SWISS_ENGINEERING_COLUMN_TEXT_WIDTH)
    // Each is one run of its own, so Word wraps the line at its spaces only.
    expect(xml).toContain('>Kommunikationsfähigkeiten<')
    expect(xml).toContain('>Bachelor of Science in Bauingenieurwesen<')
  })

  it('keeps a token wider than the whole column as one run: Word breaks it at the edge, the Preview’s last resort', async () => {
    const email = 'firstname.lastname.longer@ingenieurbuero-halvorsen.test'
    expect(interTextWidthPx(email, 400, SWISS_ENGINEERING_SIZES.column)).toBeGreaterThan(SWISS_ENGINEERING_COLUMN_TEXT_WIDTH)
    const xml = await documentXml(resumeRow({ contact: { name: 'Robin Halvorsen', email } }), 'de')
    expect(xml).toContain(`>${email}<`)
  })

  it('gives every page the PDF’s top and foot margins and no side margin, so the light column meets the paper’s right edge (swiss-templates-only-page-fidelity US-002)', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    expect(xml).toMatch(new RegExp(`<w:pgMar w:top="${pxToTwips(G.pageTop)}" w:right="0" w:bottom="${pxToTwips(G.pageBottom)}" w:left="0" w:header="0" w:footer="0"`))
  })

  it('ignores the stored font family and scale (FR-4)', async () => {
    const nameSize = (xml: string) =>
      /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>Robin Halvorsen<\/w:t>/.exec(xml)?.[1]
    const styled = await documentXml(resumeRow(), 'en', { fontScale: 1.3, fontFamily: 'Georgia, serif' })
    expect(Number(nameSize(styled))).toBe(pxToHalfPoints(SWISS_ENGINEERING_SIZES.name))
    expect(styled).toMatch(/w:ascii="Inter"/)
    expect(styled).not.toMatch(/Georgia/)
  })

  it('draws the same Preview whatever font and scale are stored (FR-4)', () => {
    const plain = resumeRow()
    const styled = resumeRow({ layout_settings: { fontScale: 1.3, fontFamily: 'Georgia, serif' } })
    const layout = resolveResumeLayout(styled, null)
    const render = (row: Row, props: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en, ...props }))
    expect(render(styled, { fontScale: layout.fontScale, fontFamily: layout.fontFamily })).toBe(render(plain, {}))
  })
})
