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
import { SwissHealthTemplate } from '@/components/dashboard/resume-templates/swiss-health-template'
import { SWISS_HEALTH_GEOMETRY, SWISS_HEALTH_SIZES } from '@/lib/swiss-health-template'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { PILL_TEXT_RAISE, generateSwissHealthDocx, roundPhoto } from './docx-swiss-health'

/**
 * The swissHealth Word export against its contract, the Preview: the same
 * sections in the same fixed order, the same hidden content left out, the
 * same localized words, and the photo drawn only when there is one and it is
 * ticked (FR-2, FR-5, FR-6, FR-7, FR-10, FR-14).
 *
 * The fixture's summary and descriptions are plain text: rich text renders
 * empty outside a browser, so the text comparisons with the Preview would not
 * see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
const PALETTE = DOCX_PALETTE.swissHealth

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-health',
    user_id: 'u1',
    title: 'Registered nurse',
    template: 'swissHealth',
    contact: {
      name: 'Robin Halvorsen',
      email: 'robin@halvorsen.test',
      phone: '+41 00 000 00 07',
      location: 'Oxbridge',
      linkedin: 'in/robin-halvorsen',
      github: 'gh/halvorsen',
      website: 'halvorsen.test',
    },
    summary: 'Nurse in acute and geriatric care.',
    experience: [
      {
        company: 'Tessellate Clinic',
        position: 'Ward nurse',
        location: 'Oxbridge',
        startDate: '2019-01',
        current: true,
        achievements: ['Ran the night ward.', 'Trained two interns.'],
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
        company: 'Saltmarsh Home',
        position: 'Care nurse',
        startDate: '2014-06',
        endDate: '2018-12',
        current: false,
        description: 'Cared for the residents.',
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Nursing diploma', field: 'Acute care', startDate: '2010-09', endDate: '2014-06', visible: true },
      { school: 'Hidden School', degree: 'Hidden degree', startDate: '2008-09', endDate: '2010-06', visible: false },
    ],
    certifications: [
      { name: 'BLS licence', issuer: 'Guild of Rescuers', date: '2021-05', visible: true },
      { name: 'Wound care', issuer: '', date: '2016-03', visible: true },
      { name: 'Hidden licence', issuer: 'Nobody', date: '2020-01', visible: false },
    ],
    skills: [
      { category: 'Care', items: [], skillsHtml: 'Acute care, Geriatrics, Wound dressing', visible: true },
      { category: 'Records', items: ['Patient file'], visible: true },
      { category: 'Hidden category', items: ['Hidden skill'], visible: false },
      { category: 'Empty category', items: [], visible: true },
    ],
    languages: [
      { language: 'Esperanto', level: 'Native', visible: true },
      { language: 'Interlingua', level: 'Fluent', visible: true },
      { language: 'Volapuk', level: 'Basic', visible: false },
    ],
    projects: [{ name: 'Undrawn project', description: 'Not in this template.', visible: true }],
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
  const zip = await JSZip.loadAsync(await generateSwissHealthDocx(row, settingsFor(row, locale, extra)))
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error('The artifact has no word/document.xml')
  return part.async('string')
}

/** The document's text, run by run, in document order. */
async function wordText(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const xml = await documentXml(row, locale, extra)
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(([, text]) => decode(text).trim())
    .filter((text) => text !== '')
    .join('|')
}

/** The Preview's text, node by node, in document order, rendered as the preview page renders it. */
function previewText(row: Row, locale: Locale, props: Record<string, unknown> = {}): string {
  const markup = renderToStaticMarkup(
    createElement(ResumePreview, { resume: row as unknown as Resume, locale, dict: DICTS[locale], ...props }),
  )
  return markup
    .split(/<[^>]*>/)
    .map((node) => decode(node).trim())
    .filter((node) => node !== '')
    .join('|')
}

/** The previewText of `row` with the layout settings it stores applied, as the Preview page applies them. */
function previewOf(row: Row, locale: Locale, props: Record<string, unknown> = {}): string {
  const layout = resolveResumeLayout(row, null)
  return previewText(row, locale, {
    hiddenMainSections: layout.hiddenMainSections,
    hiddenSidebarSections: layout.hiddenSidebarSections,
    hiddenContactFields: layout.hiddenContactFields,
    ...props,
  })
}

/** The headings each output draws, in the order they appear in `text`. */
function headingOrder(text: string, locale: Locale): string[] {
  const dict = DICTS[locale]
  const labels: Record<string, string> = {
    summary: dict.resumes.template.summary,
    education: dict.resumes.template.education,
    experience: dict.resumes.template.experience,
    training: dict.resumes.template.training,
    skills: dict.resumes.template.skills,
    languages: dict.resumes.template.languages,
  }
  const nodes = text.split('|')
  return Object.entries(labels)
    .map(([key, label]) => ({ key, at: nodes.indexOf(label) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const ALL_SECTIONS = ['summary', 'education', 'experience', 'training', 'skills', 'languages']

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

/** The Preview's bullets are list markers, not text; Word writes them as a glyph. */
const withoutBullets = (text: string) =>
  text
    .split('|')
    .filter((node) => node !== '•')
    .join('|')

describe('swissHealth: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the sections in the mockup order, under the existing headings (FR-6)', async () => {
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
        `Interlingua — ${dict.resumes.editor.levels.fluent}`,
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
          'Robin Halvorsen',
          'Registered nurse',
          'Oxbridge',
          '+41 00 000 00 07',
          'robin@halvorsen.test',
          'in/robin-halvorsen',
          'gh/halvorsen',
          'halvorsen.test',
          'Nurse in acute and geriatric care.',
          'Ward nurse|· Tessellate Clinic, Oxbridge',
          'Ran the night ward.',
          'Trained two interns.',
          'Care nurse|· Saltmarsh Home',
          'Cared for the residents.',
          'Nursing diploma|Halvorsen Institute, Acute care',
          '05.2021|BLS licence|· Guild of Rescuers',
          '03.2016|Wound care',
          'Care|Acute care · Geriatrics · Wound dressing',
          'Records|Patient file',
        ]) {
          expect(text, visible).toContain(visible)
        }
        for (const hidden of [
          'Hidden Employer',
          'Hidden Position',
          'Hidden achievement.',
          'Hidden School',
          'Hidden licence',
          'Hidden category',
          'Hidden skill',
          'Empty category',
          'Volapuk',
          'Undrawn project',
        ]) {
          expect(text, hidden).not.toContain(hidden)
        }
      }
    })
  })

  it('draws the dates as MM.YYYY, the current one ending in "present"', async () => {
    const row = resumeRow()
    for (const text of [previewOf(row, 'fr'), await wordText(row, 'fr')]) {
      expect(text).toContain(`01.2019 – ${fr.resumes.template.present}`)
      expect(text).toContain('06.2014 – 12.2018')
      expect(text).toContain('09.2010 – 06.2014')
    }
  })

  it('leaves out main sections the layout hides, heading included, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['education', 'summary'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'training', 'skills', 'languages'])
      expect(text).not.toContain('Halvorsen Institute')
      expect(text).not.toContain('Nurse in acute and geriatric care.')
    }
  })

  it('leaves out certifications, skills and languages hidden as sidebar sections, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenSidebarSections: ['skills', 'training'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'education', 'experience', 'languages'])
      expect(text).not.toContain('Geriatrics')
      expect(text).not.toContain('BLS licence')
    }
    const languagesHidden = resumeRow({ layout_settings: { hiddenSidebarSections: ['languages'] } })
    for (const text of [previewOf(languagesHidden, 'en'), await wordText(languagesHidden, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'education', 'experience', 'training', 'skills'])
      expect(text).not.toContain('Esperanto')
    }
  })

  it('draws no heading for a section whose items are all hidden or empty', async () => {
    const row = resumeRow({
      certifications: [
        { name: 'BLS licence', issuer: 'Guild of Rescuers', date: '2021-05', visible: false },
        { name: '', issuer: '', date: '', visible: true },
      ],
      skills: [{ category: 'Hidden category', items: ['Hidden skill'], visible: false }, { category: 'Blank', items: ['  '], visible: true }],
      languages: [{ language: ' ', level: 'Native', visible: true }],
      summary: '<p></p>',
    })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['education', 'experience'])
      expect(text).not.toContain('Blank')
    }
  })

  it('draws the school or the employer as the first line when the degree or position is empty, once, on both outputs', async () => {
    const row = resumeRow({
      education: [{ school: 'Halvorsen Institute', degree: '', startDate: '2010-09', endDate: '2014-06', visible: true }],
      experience: [{ company: 'Tessellate Clinic', position: '', location: 'Oxbridge', startDate: '2019-01', current: true, visible: true }],
    })
    const preview = previewOf(row, 'en')
    expect(await wordText(row, 'en')).toBe(preview)
    expect(preview).toContain('09.2010 – 06.2014|Halvorsen Institute|')
    expect(preview).toContain(`01.2019 – ${en.resumes.template.present}|Tessellate Clinic, Oxbridge|`)
    expect(preview.split('Tessellate Clinic').length - 1).toBe(1)
  })

  it('leaves out each unticked contact detail on both outputs, and keeps the ticked ones (FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'github', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).not.toContain('robin@halvorsen.test')
      expect(text).not.toContain('gh/halvorsen')
      expect(text).not.toContain('Registered nurse')
      expect(text).toContain('+41 00 000 00 07')
      expect(text).toContain('in/robin-halvorsen')
      expect(text).toContain('Robin Halvorsen')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('draws the skills or the languages alone when the other is empty, with the same text on both outputs', async () => {
    for (const row of [resumeRow({ languages: [] }), resumeRow({ skills: [] })]) {
      const preview = previewOf(row, 'en')
      expect(withoutBullets(await wordText(row, 'en'))).toBe(preview)
      expect(headingOrder(preview, 'en')).toHaveLength(5)
    }
  })
})

describe('swissHealth: the photo (FR-5, FR-14)', () => {
  const previewMarkup = (row: Row, photoUrl?: string) => {
    const layout = resolveResumeLayout(row, null)
    return renderToStaticMarkup(
      createElement(ResumePreview, {
        resume: row as unknown as Resume,
        locale: 'en',
        dict: en,
        photoUrl,
        hiddenContactFields: layout.hiddenContactFields,
      }),
    )
  }

  const photoDrawing = (xml: string) => /<w:drawing>[\s\S]*?<\/w:drawing>/.exec(xml)?.[0]

  it('draws the photo round, in its light-teal ring and fill, before the name, on both outputs', async () => {
    const preview = previewMarkup(resumeRow(), PHOTO)
    expect(preview).toContain(`src="${PHOTO}"`)
    expect(preview).toContain('class="swiss-health-photo shrink-0 overflow-hidden"')

    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const drawing = photoDrawing(xml)
    expect(drawing).toBeDefined()
    expect(drawing).toContain('<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>')
    expect(drawing).toContain(`<a:solidFill><a:srgbClr val="${PALETTE.photoFill}"/></a:solidFill>`)
    expect(drawing).toMatch(new RegExp(`<a:ln w="${SWISS_HEALTH_GEOMETRY.photoRing * 9525}"><a:solidFill><a:srgbClr val="${PALETTE.rule}"/>`))
    expect(drawing).toContain(`<wp:extent cx="${SWISS_HEALTH_GEOMETRY.photo * 9525}" cy="${SWISS_HEALTH_GEOMETRY.photo * 9525}"/>`)
    expect(xml.indexOf(drawing!)).toBeLessThan(xml.indexOf('>Robin Halvorsen<'))
  })

  it('lays the photo in a paragraph of auto line spacing, so Word does not clip it to a text line', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const holder = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes('<w:drawing>'))
    expect(holder).toMatch(/<w:spacing [^>]*w:line="240" w:lineRule="auto"\/>/)
  })

  it('embeds exactly one image with a photo and none without', async () => {
    const media = async (extra: Partial<DocxGeneratorSettings>) => {
      const zip = await JSZip.loadAsync(await generateSwissHealthDocx(resumeRow(), settingsFor(resumeRow(), 'en', extra)))
      return Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    }
    expect(await media({ photoBase64: PHOTO })).toHaveLength(1)
    expect(await media({})).toHaveLength(0)
  })

  it('draws no photo frame on either output when there is none', async () => {
    const preview = previewMarkup(resumeRow())
    expect(preview).not.toContain('<img')
    expect(preview).not.toContain('swiss-health-photo')
    const xml = await documentXml(resumeRow(), 'en')
    expect(photoDrawing(xml)).toBeUndefined()
    // No photo: the name block alone is the header, a one-cell table, so it floats as the photo's row does.
    const header = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'))
    expect(header).toContain('>Robin Halvorsen<')
    expect(header).toContain('<w:tblpPr')
    expect(header.match(/<w:tc>/g)).toHaveLength(1)
  })

  it('draws no frame for data that is not an image it can embed', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
    expect(photoDrawing(xml)).toBeUndefined()
  })

  it('draws no photo on either output when the photo is unticked, and draws it again when ticked', async () => {
    const hidden = resumeRow({ layout_settings: { hiddenContactFields: ['photo'] } })
    expect(previewMarkup(hidden, PHOTO)).not.toContain('<img')
    expect(previewMarkup(hidden, PHOTO)).toBe(previewMarkup(resumeRow()))
    expect(photoDrawing(await documentXml(hidden, 'en', { photoBase64: PHOTO }))).toBeUndefined()
    expect(photoDrawing(await documentXml(hidden, 'en', { photoBase64: PHOTO, hiddenContactFields: [] }))).toBeDefined()
  })

  it('draws no upload box in the CV: the photo is uploaded from the Contact tab', () => {
    const html = renderToStaticMarkup(createElement(SwissHealthTemplate, { resume: resumeRow() as unknown as Resume, locale: 'fr', dict: fr }))
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('border-dashed')
  })

  it('refuses to ship a square photo when the drawing is not in the shape docx writes', () => {
    expect(() => roundPhoto('<w:document/>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no rectangular picture geometry/)
    expect(() => roundPhoto('<a:prstGeom prst="rect"/>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no effect extent/)
  })
})

describe('swissHealth: Word layout (FR-10)', () => {
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

  it('draws every heading as a pill: dark-teal spaced capitals in runs shaded the pill colour, on a line as tall as the pill', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const pillLine = Math.round(1.4 * SWISS_HEALTH_SIZES.pill * 1.5 * 10 + 2 * SWISS_HEALTH_GEOMETRY.pillPaddingY * 15)
    for (const label of [en.resumes.template.summary, en.resumes.template.education, en.resumes.template.skills, en.resumes.template.languages]) {
      const heading = paragraphs(xml).find((p) => p.includes(`>${label}<`))
      expect(heading, label).toBeDefined()
      const runs = paragraphRuns(heading!)
      // The padding is a no-break space, which decode() reads as a space.
      expect(runs.map((r) => r.text)).toEqual([' ', label, ' '])
      for (const r of runs) expect(r.raw).toMatch(new RegExp(`<w:shd [^>]*w:fill="${PALETTE.pill}"`))
      const text = runs[1].raw
      expect(text).toContain('<w:caps/>')
      expect(text).toContain(`<w:color w:val="${PALETTE.heading}"/>`)
      expect(text).toContain(`<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissHealth.caps, pxToHalfPoints(SWISS_HEALTH_SIZES.pill))}"/>`)
      expect(heading).toMatch(new RegExp(`<w:spacing [^>]*w:line="${pillLine}" w:lineRule="exact"`))
      expect(heading).toContain('<w:keepNext/>')
      // Raised by half the vertical padding, to the middle of its shading; the padding runs are not raised.
      expect(text).toContain(`<w:position w:val="${(SWISS_HEALTH_GEOMETRY.pillPaddingY / 2) * 0.75}pt"/>`)
      expect(runs[0].raw).not.toContain('<w:position')
    }
    expect(PILL_TEXT_RAISE).toBe('2.25pt')
  })

  it('draws each dated entry as a table: the dates in teal in a left cell barred light teal, the content on the right', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const entry = tableHolding(xml, '>Ward nurse<')
    expect(entry).toBeDefined()
    const cells = [...entry!.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    expect(cells).toHaveLength(2)
    const [dates, content] = cells
    expect(dates).toMatch(new RegExp(`<w:left w:val="single" w:color="${PALETTE.rule}" w:sz="${Math.round(SWISS_HEALTH_GEOMETRY.entryBar * 0.75 * 8)}"`))
    expect(dates).toMatch(new RegExp(`<w:color w:val="${PALETTE.accent}"/>[\\s\\S]*?01\\.2019 – ${en.resumes.template.present}`))
    expect(content).toContain('>Ward nurse<')
    expect(entry).toContain(`<w:gridCol w:w="${pxToTwips(SWISS_HEALTH_GEOMETRY.dateColumn)}"/>`)
    // One table per entry: the next entry is a table of its own, so the gap between them is not barred.
    expect(tableHolding(xml, '>Care nurse<')).not.toBe(entry)
  })

  it('draws an experience’s first line as its bold position, then its employer in grey after " · "', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const first = paragraphs(xml).find((p) => p.includes('>Ward nurse<'))
    const runs = paragraphRuns(first!)
    expect(runs.map((r) => r.text)).toEqual(['Ward nurse', ' · Tessellate Clinic, Oxbridge'])
    expect(runs[0].bold).toBe(true)
    expect(runs[0].raw).toContain(`<w:color w:val="${PALETTE.ink}"/>`)
    expect(runs[1].bold).toBe(false)
    expect(runs[1].raw).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
  })

  it('draws the title and the dates in the teal that meets WCAG AA on white, and the name in dark teal', async () => {
    expect(PALETTE.accent).toBe('0F766E')
    expect(PALETTE.heading).toBe('134E4A')
    const xml = await documentXml(resumeRow(), 'en')
    expect(paragraphs(xml).find((p) => p.includes('>Registered nurse<'))).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
    expect(paragraphs(xml).find((p) => p.includes('>Robin Halvorsen<'))).toContain(`<w:color w:val="${PALETTE.heading}"/>`)
  })

  it('draws the contact details on one line, in order, in the contact grey', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const holder = paragraphs(xml).find((p) => p.includes('>robin@halvorsen.test<'))
    const values = paragraphRuns(holder!).map((r) => r.text).filter((text) => text.trim() !== '')
    expect(values).toEqual(['Oxbridge', '+41 00 000 00 07', 'robin@halvorsen.test', 'in/robin-halvorsen', 'gh/halvorsen', 'halvorsen.test'])
    expect(holder).toContain(`<w:color w:val="${PALETTE.contact}"/>`)
  })

  it('draws skills and languages side by side in a two-column table, and alone without one', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const columns = tableHolding(xml, `>${en.resumes.template.languages}<`)
    expect(columns).toBeDefined()
    expect(columns).toContain(`>${en.resumes.template.skills}<`)
    const cells = [...columns!.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    expect(cells).toHaveLength(3)
    expect(cells[0]).toContain('Acute care · Geriatrics · Wound dressing')
    expect(cells[2]).toContain(`Esperanto — ${en.resumes.editor.levels.native}`)

    const alone = await documentXml(resumeRow({ languages: [] }), 'en')
    expect(tableHolding(alone, 'Geriatrics')).toBeUndefined()
  })

  it('draws a skill category’s caption above its skills, in bold dark teal', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const texts = paragraphs(xml).map((p) => paragraphRuns(p).map((r) => r.text).join(''))
    const caption = texts.indexOf('Care')
    expect(caption).toBeGreaterThanOrEqual(0)
    expect(texts[caption + 1]).toBe('Acute care · Geriatrics · Wound dressing')
    const run = paragraphRuns(paragraphs(xml)[caption])[0]
    expect(run.bold).toBe(true)
    expect(run.raw).toContain(`<w:color w:val="${PALETTE.heading}"/>`)
  })

  it('draws formatted skills as rich text, keeping a plain-text line break', async () => {
    const xml = await documentXml(resumeRow({ skills: [{ category: 'Care', items: [], skillsHtml: 'Acute care\nGeriatrics', visible: true }] }), 'en')
    const holder = paragraphs(xml).find((p) => p.includes('>Acute care<'))
    expect(holder).toMatch(/Acute care<\/w:t>[\s\S]*<w:br\/>[\s\S]*Geriatrics/)
  })

  it('keeps a rich-text paragraph beside a list, in order and with its bold run', async () => {
    const skillsHtml = '<p>Soins <strong>aigus</strong></p><ul><li>Gériatrie</li></ul>'
    const xml = await documentXml(resumeRow({ skills: [{ category: 'Pratique', items: [], skillsHtml, visible: true }] }), 'fr')
    const all = paragraphs(xml)
    const first = all.findIndex((p) => p.includes('>Soins <') || p.includes('>Soins<'))
    expect(first, 'the paragraph before the list is drawn').toBeGreaterThanOrEqual(0)
    const runs = paragraphRuns(all[first])
    expect(runs.map((r) => r.text).join('')).toBe('Soins aigus')
    expect(runs.find((r) => r.text.includes('aigus'))?.bold).toBe(true)
    expect(paragraphRuns(all[first + 1]).map((r) => r.text).join('')).toBe('•\tGériatrie')
  })

  it('keeps every paragraph and list item of a mixed summary, in order', async () => {
    const summary = '<p>First paragraph.</p><ul><li>One</li><li>Two</li></ul><p>Last paragraph.</p>'
    const texts = paragraphs(await documentXml(resumeRow({ summary }), 'en')).map((p) =>
      paragraphRuns(p)
        .map((r) => r.text)
        .join(''),
    )
    const at = texts.indexOf('First paragraph.')
    expect(texts.slice(at, at + 4)).toEqual(['First paragraph.', '•\tOne', '•\tTwo', 'Last paragraph.'])
  })

  it('gives every page the PDF’s top and foot margins, so page 2 does not start at the paper’s edge and both break pages alike (swiss-templates-only-page-fidelity US-002)', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const g = SWISS_HEALTH_GEOMETRY
    expect(xml).toMatch(
      new RegExp(
        `<w:pgMar w:top="${pxToTwips(g.pageTop)}" w:right="${pxToTwips(g.paddingX)}" w:bottom="${pxToTwips(g.pageBottom)}" w:left="${pxToTwips(g.paddingX)}" w:header="0" w:footer="0"`,
      ),
    )
    // One section, so one set of margins for every page.
    expect(xml.split('<w:pgMar').length - 1).toBe(1)
  })

  /** A table's floating position, `w:tblpPr`, as its attributes. */
  const floatOf = (table: string) =>
    Object.fromEntries([...(/<w:tblpPr\b([^>]*?)\/?>/.exec(table)?.[1] ?? '').matchAll(/w:(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))

  it('starts page 1 at the Preview’s top padding: the header floats there, with the Preview’s gap under it, above the later pages’ top margin', async () => {
    const g = SWISS_HEALTH_GEOMETRY
    for (const photoBase64 of [undefined, PHOTO]) {
      const xml = await documentXml(resumeRow(), 'en', { photoBase64 })
      const header = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'))
      expect(header).toContain('>Robin Halvorsen<')
      expect(floatOf(header)).toEqual({
        horzAnchor: 'margin',
        vertAnchor: 'page',
        tblpX: '0',
        tblpY: String(pxToTwips(g.paddingTop)),
        topFromText: '0',
        leftFromText: '0',
        rightFromText: '0',
        bottomFromText: String(pxToTwips(g.headerGap)),
      })
      expect(header).toContain('<w:tblOverlap w:val="never"/>')
      // The header is the only floating table: the sections flow below it.
      expect(xml.split('<w:tblpPr').length - 1).toBe(1)
    }
    expect(g.paddingTop).toBeLessThan(g.pageTop)
  })

  it('ignores the stored font family and scale (FR-4)', async () => {
    const nameSize = (xml: string) =>
      /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>Robin Halvorsen<\/w:t>/.exec(xml)?.[1]
    const styled = await documentXml(resumeRow(), 'en', { fontScale: 1.3, fontFamily: 'Georgia, serif' })
    expect(Number(nameSize(styled))).toBe(pxToHalfPoints(SWISS_HEALTH_SIZES.name))
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
