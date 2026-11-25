import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import { convertInchesToTwip } from 'docx'
import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import type { Locale } from '@/lib/i18n'
import type { Resume } from '@/types/database'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { ResumePreview } from '@/components/dashboard/resume-preview'
import { SwissTradesTemplate } from '@/components/dashboard/resume-templates/swiss-trades-template'
import { SWISS_TRADES_GEOMETRY, SWISS_TRADES_SIZES } from '@/lib/swiss-trades-template'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { framePhoto, generateSwissTradesDocx } from './docx-swiss-trades'

/**
 * The swissTrades Word export against its contract, the Preview: the same
 * sections in the same fixed order in the same column, the same hidden content
 * left out, the same localized words, and the photo drawn only when there is
 * one and it is ticked (FR-2, FR-5, FR-6, FR-7, FR-10, FR-14).
 *
 * The fixture's summary and descriptions are plain text: rich text renders
 * empty outside a browser, so the text comparisons with the Preview would not
 * see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
const PALETTE = DOCX_PALETTE.swissTrades

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-trades',
    user_id: 'u1',
    title: 'Kilnwright lead',
    template: 'swissTrades',
    contact: {
      name: 'Robin Halvorsen',
      email: 'robin@halvorsen.test',
      phone: '+41 00 000 00 07',
      location: 'Oxbridge',
      linkedin: 'in/robin-halvorsen',
      github: 'gh/halvorsen',
      website: 'halvorsen.test',
    },
    summary: 'Kilnwright of glass and ceramics.',
    experience: [
      {
        company: 'Tessellate Freight',
        position: 'Kilnwright',
        location: 'Oxbridge',
        startDate: '2019-01',
        current: true,
        achievements: ['Fired the kilns.', 'Trained two apprentices.'],
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
        company: 'Saltmarsh Works',
        position: 'Glazier',
        startDate: '2014-06',
        endDate: '2018-12',
        current: false,
        description: 'Glazed the harbour windows.',
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Federal diploma', field: 'Ceramics', startDate: '2010-09', endDate: '2014-06', visible: true },
    ],
    certifications: [
      { name: 'Kiln licence', issuer: 'Guild of Firers', date: '2021-05', visible: true },
      { name: 'Driving licence B', issuer: '', date: '2016-03', visible: true },
      { name: 'Hidden licence', issuer: 'Nobody', date: '2020-01', visible: false },
    ],
    skills: [
      { category: 'Workshop', items: [], skillsHtml: 'Glazing, Firing, Blueprint reading', visible: true },
      { category: 'Machines', items: ['Lathe'], visible: true },
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
    // The zero-width break between two skill tags draws nothing.
    .replace(/​/g, '')
}

async function documentXml(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const zip = await JSZip.loadAsync(await generateSwissTradesDocx(row, settingsFor(row, locale, extra)))
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

/** The headings each output draws, in the order they appear in `text`: the dark column's, then the main column's. */
function headingOrder(text: string, locale: Locale): string[] {
  const dict = DICTS[locale]
  const labels: Record<string, string> = {
    contact: dict.resumes.editor.sections.contact,
    skills: dict.resumes.template.skills,
    training: dict.resumes.template.training,
    languages: dict.resumes.template.languages,
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

const ALL_SECTIONS = ['contact', 'skills', 'training', 'languages', 'summary', 'experience', 'education']

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

describe('swissTrades: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the dark column, then the main column, each in the mockup order, under the existing headings (FR-6)', async () => {
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

    it('draws every visible item and leaves out the hidden and empty ones (FR-2)', async () => {
      const row = resumeRow()
      for (const text of [previewOf(row, locale), await wordText(row, locale)]) {
        for (const visible of [
          'Robin Halvorsen',
          'Kilnwright lead',
          'Oxbridge',
          '+41 00 000 00 07',
          'robin@halvorsen.test',
          'in/robin-halvorsen',
          'gh/halvorsen',
          'halvorsen.test',
          'Kilnwright of glass and ceramics.',
          'Tessellate Freight, Oxbridge',
          'Fired the kilns.',
          'Trained two apprentices.',
          'Saltmarsh Works',
          'Glazed the harbour windows.',
          'Federal diploma',
          'Halvorsen Institute, Ceramics',
          'Kiln licence',
          '· Guild of Firers, 05.2021',
          'Driving licence B',
          '· 03.2016',
          'Workshop',
          'Glazing',
          'Firing',
          'Blueprint reading',
          'Machines',
          'Lathe',
        ]) {
          expect(text, visible).toContain(visible)
        }
        for (const hidden of [
          'Hidden Employer',
          'Hidden Position',
          'Hidden achievement.',
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

  it('draws the same text in the same order on both outputs', async () => {
    const row = resumeRow()
    // The Preview's bullets are list markers, not text; Word writes them as a glyph.
    const word = (await wordText(row, 'fr'))
      .split('|')
      .filter((node) => node !== '•')
      .join('|')
    expect(word).toBe(previewOf(row, 'fr'))
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
      expect(headingOrder(text, 'en')).toEqual(['contact', 'skills', 'training', 'languages', 'experience'])
      expect(text).not.toContain('Halvorsen Institute')
      expect(text).not.toContain('Kilnwright of glass and ceramics.')
    }
  })

  it('leaves out skills, certificates and languages hidden as sidebar sections, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenSidebarSections: ['skills', 'training'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['contact', 'languages', 'summary', 'experience', 'education'])
      expect(text).not.toContain('Glazing')
      expect(text).not.toContain('Kiln licence')
    }
    const languagesHidden = resumeRow({ layout_settings: { hiddenSidebarSections: ['languages'] } })
    for (const text of [previewOf(languagesHidden, 'en'), await wordText(languagesHidden, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['contact', 'skills', 'training', 'summary', 'experience', 'education'])
      expect(text).not.toContain('Esperanto')
    }
  })

  it('draws no heading for a section whose items are all hidden or empty', async () => {
    const row = resumeRow({
      certifications: [
        { name: 'Kiln licence', issuer: 'Guild of Firers', date: '2021-05', visible: false },
        { name: '', issuer: '', date: '', visible: true },
      ],
      skills: [{ category: 'Hidden category', items: ['Hidden skill'], visible: false }, { category: 'Blank', items: ['  '], visible: true }],
      languages: [{ language: ' ', level: 'Native', visible: true }],
      summary: '<p></p>',
    })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['contact', 'experience', 'education'])
      expect(text).not.toContain('Blank')
    }
  })

  it('leaves out each unticked contact detail on both outputs, and keeps the ticked ones (FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'github', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).not.toContain('robin@halvorsen.test')
      expect(text).not.toContain('gh/halvorsen')
      expect(text).not.toContain('Kilnwright lead')
      expect(text).toContain('+41 00 000 00 07')
      expect(text).toContain('in/robin-halvorsen')
      expect(text).toContain('Robin Halvorsen')
    }
  })

  it('draws no Contact heading when every contact detail is unticked', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'phone', 'location', 'linkedin', 'github', 'website'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')[0]).toBe('skills')
    }
  })
})

describe('swissTrades: the photo (FR-5, FR-14)', () => {
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

  /** The photo's drawing: the one laid out in its cell, not the page-high column fill. */
  const photoDrawing = (xml: string) => /<wp:anchor\b[^>]*\slayoutInCell="1"[\s\S]*?<\/wp:anchor>/.exec(xml)?.[0]

  it('draws the photo in its frame at the top of the dark column on both outputs when there is one', async () => {
    const preview = previewMarkup(resumeRow(), PHOTO)
    expect(preview).toContain(`src="${PHOTO}"`)
    expect(preview).toContain('class="swiss-trades-photo mx-auto overflow-hidden"')

    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const drawing = photoDrawing(xml)
    expect(drawing).toBeDefined()
    expect(drawing).toContain('<a:prstGeom prst="rect">')
    expect(drawing).toMatch(new RegExp(`<a:ln w="${SWISS_TRADES_GEOMETRY.photoBorder * 9525}"><a:solidFill><a:srgbClr val="${PALETTE.muted}"/>`))
    expect(drawing).toContain(`<wp:extent cx="${SWISS_TRADES_GEOMETRY.photoWidth * 9525}" cy="${SWISS_TRADES_GEOMETRY.photoHeight * 9525}"/>`)
    // Before the Contact heading, in the dark column's cell.
    expect(xml.indexOf(drawing!)).toBeLessThan(xml.indexOf(`>${en.resumes.editor.sections.contact}<`))
  })

  it('reserves the photo’s height in its paragraph without clipping it', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const holder = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes('layoutInCell="1"'))
    expect(holder).toMatch(new RegExp(`<w:spacing [^>]*w:line="${pxToTwips(SWISS_TRADES_GEOMETRY.photoHeight)}"[^>]*w:lineRule="exact"`))
    // A floating drawing: an exact line does not clip it, as it clips an inline one.
    expect(holder).toContain('<wp:anchor')
    expect(holder).not.toContain('<wp:inline')
  })

  it('embeds the photo once, beside the column fill', async () => {
    const zip = await JSZip.loadAsync(await generateSwissTradesDocx(resumeRow(), settingsFor(resumeRow(), 'en', { photoBase64: PHOTO })))
    const withPhoto = Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    const plain = await JSZip.loadAsync(await generateSwissTradesDocx(resumeRow(), settingsFor(resumeRow(), 'en')))
    const without = Object.keys(plain.files).filter((name) => name.startsWith('word/media/') && !plain.files[name].dir)
    expect(withPhoto.length).toBe(without.length + 1)
  })

  it('draws no photo frame on either output when there is none', async () => {
    const preview = previewMarkup(resumeRow())
    expect(preview).not.toContain('<img')
    expect(preview).not.toContain('swiss-trades-photo')
    expect(photoDrawing(await documentXml(resumeRow(), 'en'))).toBeUndefined()
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
    const html = renderToStaticMarkup(
      createElement(SwissTradesTemplate, { resume: resumeRow() as unknown as Resume, locale: 'fr', dict: fr }),
    )
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('border-dashed')
  })

  it('refuses to ship a photo without its frame when the drawing is not in the shape docx writes', () => {
    expect(() => framePhoto('<w:document/>', null, 'FFFFFF')).toThrow(/no drawing laid out in its cell/)
    expect(() => framePhoto('<wp:anchor layoutInCell="1"></wp:anchor>', null, 'FFFFFF')).toThrow(/no rectangular picture geometry/)
    expect(() => framePhoto('<wp:anchor layoutInCell="1"><a:prstGeom prst="rect"/></wp:anchor>', null, 'FFFFFF')).toThrow(/no effect extent/)
  })
})

describe('swissTrades: Word layout (FR-10)', () => {
  /** Every top-level table of the body, in order. */
  const tables = (xml: string) => {
    const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? ''
    const out: string[] = []
    let depth = 0
    let start = -1
    for (const match of body.matchAll(/<w:tbl>|<\/w:tbl>/g)) {
      if (match[0] === '<w:tbl>') {
        if (depth === 0) start = match.index ?? 0
        depth += 1
      } else {
        depth -= 1
        if (depth === 0) out.push(body.slice(start, (match.index ?? 0) + match[0].length))
      }
    }
    return out
  }
  const cells = (row: string) => [...row.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
  const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p)

  it('lays the page out as one two-column table: the dark column, then the main column', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const all = tables(xml)
    expect(all).toHaveLength(1)
    const rows = [...all[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(([row]) => row)
    expect(rows).toHaveLength(2)
    const [sidebar, main] = cells(rows[1])
    expect(sidebar).toMatch(new RegExp(`<w:shd [^>]*w:fill="${PALETTE.sidebar}"`))
    expect(sidebar).toContain('robin@halvorsen.test')
    expect(sidebar).toContain('Kiln licence')
    expect(sidebar).not.toContain('Robin Halvorsen')
    expect(main).toContain('Robin Halvorsen')
    expect(main).toContain('Tessellate Freight, Oxbridge')
    expect(all[0]).toContain(`<w:gridCol w:w="${pxToTwips(SWISS_TRADES_GEOMETRY.sidebarWidth)}"/>`)
    expect(xml).toMatch(/<w:pgMar [^>]*w:top="0"[^>]*w:right="0"[^>]*w:bottom="0"[^>]*w:left="0"/)
  })

  it('paints the dark column the height of every page with a fill drawing repeated by a header row', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const fillRow = /<w:tr\b[\s\S]*?<\/w:tr>/.exec(tables(xml)[0])?.[0] ?? ''
    expect(fillRow).toContain('<w:tblHeader/>')
    expect(fillRow).toMatch(/<wp:anchor\b[^>]*behindDoc="1"[^>]*layoutInCell="0"/)
    expect(fillRow).toContain(`<wp:extent cx="${SWISS_TRADES_GEOMETRY.sidebarWidth * 9525}"`)
  })

  it('draws each skill as a run shaded the tag colour, under its category caption', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const runs = [...xml.matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map(([r]) => r)
    for (const tag of ['Glazing', 'Firing', 'Blueprint', 'Lathe']) {
      const tagRun = runs.find((r) => r.includes(tag))
      expect(tagRun, tag).toMatch(new RegExp(`<w:shd [^>]*w:fill="${PALETTE.tag}"`))
    }
    const texts = paragraphs(xml).map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, t]) => decode(t)).join(''))
    const caption = texts.indexOf('Workshop')
    expect(caption).toBeGreaterThanOrEqual(0)
    expect(texts[caption + 1]).toContain('Glazing')
    expect(texts[caption + 1]).toContain('Blueprint reading')
  })

  it('draws formatted skills as rich text, keeping a plain-text line break', async () => {
    const xml = await documentXml(resumeRow({ skills: [{ category: 'Workshop', items: [], skillsHtml: 'Glazing\nFiring', visible: true }] }), 'en')
    const holder = paragraphs(xml).find((p) => p.includes('>Glazing<'))
    expect(holder).toBeDefined()
    expect(holder).toMatch(/Glazing<\/w:t>[\s\S]*<w:br\/>[\s\S]*Firing/)
    expect(holder).not.toMatch(new RegExp(`w:fill="${PALETTE.tag}"`))
  })

  it('draws main headings in dark spaced capitals, the rule an underlined tab to the column edge', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const heading = paragraphs(xml).find((p) => p.includes(`>${en.resumes.template.experience}<`))
    expect(heading).toContain('<w:caps/>')
    expect(heading).toContain(`<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissTrades.caps, pxToHalfPoints(SWISS_TRADES_SIZES.heading))}"/>`)
    expect(heading).toMatch(new RegExp(`<w:u w:val="thick" w:color="${PALETTE.rule}"/>[\\s\\S]*?<w:tab/>`))
    const mainContentWidth = convertInchesToTwip(PAGE_WIDTH_INCHES) - pxToTwips(SWISS_TRADES_GEOMETRY.sidebarWidth) - 2 * pxToTwips(SWISS_TRADES_GEOMETRY.mainPaddingX)
    expect(heading).toMatch(new RegExp(`<w:tab w:val="right" w:pos="${mainContentWidth}"/>`))
  })

  it('draws the headings of the dark column in light orange', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const heading = paragraphs(xml).find((p) => p.includes(`>${en.resumes.template.languages}<`))
    expect(heading).toContain(`<w:color w:val="${PALETTE.sidebarHeading}"/>`)
    expect(heading).toContain('<w:caps/>')
  })

  it('puts the dates of an entry in orange at a right tab stop of its first line', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const first = paragraphs(xml).find((p) => p.includes('>Kilnwright<'))
    expect(first).toMatch(new RegExp(`<w:color w:val="${PALETTE.accent}"/>[\\s\\S]*?01\\.2019 – ${en.resumes.template.present}`))
    expect(first).toContain('<w:tab w:val="right"')
  })

  it('draws the school as the bold first line beside the dates when the degree is empty, leaving no empty line', async () => {
    const xml = await documentXml(
      resumeRow({ education: [{ school: 'Halvorsen Institute', degree: '', startDate: '2010-09', endDate: '2014-06', visible: true }] }),
      'en',
    )
    const first = paragraphs(xml).find((p) => p.includes('>Halvorsen Institute<'))
    expect(first).toContain('09.2010 – 06.2014')
    const school = paragraphRuns(first!).find((r) => r.text === 'Halvorsen Institute')
    expect(school?.bold).toBe(true)
    expect(school?.raw).toContain(`<w:color w:val="${PALETTE.ink}"/>`)
  })

  it('draws the company as the bold first line beside the dates when the position is empty, on both outputs', async () => {
    const row = resumeRow({
      experience: [{ company: 'Tessellate Freight', position: '', location: 'Oxbridge', startDate: '2019-01', current: true, visible: true }],
    })
    const xml = await documentXml(row, 'en')
    const first = paragraphs(xml).find((p) => p.includes('>Tessellate Freight, Oxbridge<'))
    expect(first).toContain(`01.2019 – ${en.resumes.template.present}`)
    const company = paragraphRuns(first!).find((r) => r.text === 'Tessellate Freight, Oxbridge')
    expect(company?.bold).toBe(true)
    expect(company?.raw).toContain(`<w:color w:val="${PALETTE.ink}"/>`)
    // The same text, once, on both outputs.
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text.split('Tessellate Freight, Oxbridge').length - 1).toBe(1)
    }
  })

  it('draws the title and the dates in the accent orange that meets WCAG AA on white', async () => {
    expect(PALETTE.accent).toBe('C2410C')
    const xml = await documentXml(resumeRow(), 'en')
    const title = paragraphs(xml).find((p) => p.includes('>Kilnwright lead<'))
    expect(title).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
  })

  it('spaces wrapped rows of tags apart: auto line spacing, so the shading stays the glyph box', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const holder = paragraphs(xml).find((p) => p.includes(`w:fill="${PALETTE.tag}"`))
    // The single line plus the Preview's gap between rows, over Word's glyph box (about 1.2em).
    const line = Math.round(240 * ((SWISS_TRADES_SIZES.tag * 1.2 + SWISS_TRADES_GEOMETRY.tagGap) / (SWISS_TRADES_SIZES.tag * 1.2)))
    expect(line).toBeGreaterThan(240)
    expect(holder).toMatch(new RegExp(`<w:spacing [^>]*w:line="${line}" w:lineRule="auto"/>`))
  })

  /** Each paragraph's runs, in order, as their text and whether they are bold. */
  const paragraphRuns = (paragraph: string) =>
    [...paragraph.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => ({
      text: [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map(([tag, t]) => (tag === '<w:tab/>' ? '\t' : decode(t))).join(''),
      bold: /<w:b\/>/.test(inner),
      raw: inner,
    }))

  it('keeps a rich-text paragraph beside a list, in order and with its bold run (FR-10)', async () => {
    const skillsHtml = '<p>Consignation <strong>électrique</strong></p><ul><li>Travail en hauteur</li></ul>'
    const xml = await documentXml(resumeRow({ skills: [{ category: 'Sécurité', items: [], skillsHtml, visible: true }] }), 'fr')
    const all = paragraphs(xml)
    const first = all.findIndex((p) => p.includes('Consignation'))
    expect(first, 'the paragraph before the list is drawn').toBeGreaterThanOrEqual(0)
    const runs = paragraphRuns(all[first])
    expect(runs.map((r) => r.text).join('')).toBe('Consignation électrique')
    expect(runs.find((r) => r.text.includes('électrique'))?.bold).toBe(true)
    expect(runs.find((r) => r.text.includes('Consignation'))?.bold).toBe(false)
    // The list item follows it, with its marker hanging at the list's indent.
    const item = all[first + 1]
    expect(paragraphRuns(item).map((r) => r.text).join('')).toBe('•\tTravail en hauteur')
    expect(item).toMatch(/<w:ind w:left="\d+" w:hanging="\d+"\/>/)
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

  it('never breaks a skill tag inside itself, and lets Word break between two tags', async () => {
    const xml = await documentXml(resumeRow({ skills: [{ category: 'Production', items: [], skillsHtml: 'Fraisage, Maintenance, Contrôle qualité', visible: true }] }), 'fr')
    const holder = paragraphs(xml).find((p) => p.includes('Contr'))
    const runs = paragraphRuns(holder!)
    const tags = runs.filter((r) => r.raw.includes(`w:fill="${PALETTE.tag}"`))
    expect(tags.map((r) => r.text.trim())).toEqual(['Fraisage', 'Maintenance', 'Contrôle qualité'])
    // Inside a tag every space is a no-break space: Word moves a tag that does
    // not fit to the next line whole rather than breaking it at a space.
    const rawTags = [...holder!.matchAll(/<w:shd [^>]*w:fill="475569"[^>]*\/><\/w:rPr><w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(([, t]) => t)
    expect(rawTags).toHaveLength(3)
    for (const text of rawTags) expect(text, text).not.toContain(' ')
    // Between two tags: the gap, then a zero-width space, the line-break
    // opportunity Word takes, so a row of tags is never one unbreakable word.
    const rawRuns = [...holder!.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => /<w:t[^>]*>([\s\S]*?)<\/w:t>/.exec(inner)?.[1] ?? '')
    const tagAt = rawRuns.map((t, i) => (rawTags.includes(t) ? i : -1)).filter((i) => i >= 0)
    for (const i of tagAt.slice(1)) {
      expect(rawRuns[i - 1], 'a zero-width break opens each later tag').toBe('​')
      expect(rawRuns[i - 2], 'after the gap').toBe(' ')
    }
  })

  it('draws the rule after every main heading identically, in the rule colour (FR-10)', async () => {
    const xml = await documentXml(resumeRow(), 'fr')
    const rules = [fr.resumes.template.summary, fr.resumes.template.experience, fr.resumes.template.education].map((label) => {
      const heading = paragraphs(xml).find((p) => p.includes(`>${label}<`))
      expect(heading, label).toBeDefined()
      const rule = paragraphRuns(heading!).find((r) => r.text === '\t')
      expect(rule, `${label} has its rule`).toBeDefined()
      return rule!.raw
    })
    expect(rules[0]).toContain(`<w:u w:val="thick" w:color="${PALETTE.rule}"/>`)
    expect(new Set(rules).size, 'the three rules are the same run').toBe(1)
  })

  it('ignores the stored font family and scale (FR-4)', async () => {
    const nameSize = (xml: string) =>
      /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>Robin Halvorsen<\/w:t>/.exec(xml)?.[1]
    const styled = await documentXml(resumeRow(), 'en', { fontScale: 1.3, fontFamily: 'Georgia, serif' })
    expect(Number(nameSize(styled))).toBe(pxToHalfPoints(SWISS_TRADES_SIZES.name))
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
