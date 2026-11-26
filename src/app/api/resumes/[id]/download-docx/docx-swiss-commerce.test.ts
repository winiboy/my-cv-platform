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
import { SwissCommerceTemplate } from '@/components/dashboard/resume-templates/swiss-commerce-template'
import { SWISS_COMMERCE_GEOMETRY, SWISS_COMMERCE_SIZES } from '@/lib/swiss-commerce-template'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { generateSwissCommerceDocx, roundPhoto } from './docx-swiss-commerce'

/**
 * The swissCommerce Word export against its contract, the Preview: the same
 * sections in the same fixed order, the same hidden content left out, the same
 * localized words, and the photo drawn only when there is one and it is
 * ticked (FR-2, FR-5, FR-6, FR-7, FR-10, FR-14).
 *
 * The fixture is plain text: rich text renders empty outside a browser, so the
 * text comparisons with the Preview would not see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
const PALETTE = DOCX_PALETTE.swissCommerce

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-commerce',
    user_id: 'u1',
    title: 'Ledger steward',
    template: 'swissCommerce',
    contact: {
      name: 'Morgan Aldervane',
      email: 'morgan@aldervane.test',
      phone: '+41 00 000 00 08',
      location: 'Brightwater',
      linkedin: 'in/morgan-aldervane',
      github: 'gh/aldervane',
      website: 'aldervane.test',
    },
    summary: 'Steward of ledgers and agendas.',
    experience: [
      {
        company: 'Copperline Holdings',
        position: 'Office steward',
        location: 'Brightwater',
        startDate: '2019-01',
        current: true,
        achievements: ['Balanced the quarterly ledgers.', 'Prepared the board files.'],
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
        company: 'Saltmarsh Trust',
        position: 'Clerk',
        startDate: '2014-06',
        endDate: '2018-12',
        current: false,
        description: 'Kept the correspondence in two languages.',
        visible: true,
      },
    ],
    education: [
      { school: 'Aldervane College', degree: 'Federal diploma', field: 'Administration', startDate: '2020-09', endDate: '2021-06', visible: true },
    ],
    certifications: [{ name: 'Project basics', issuer: 'Guild of Clerks', date: '2023-05', visible: true }],
    skills: [
      { category: 'Office', items: ['Spreadsheets', 'Shared drives'], visible: true },
      { category: 'Software', items: ['Ledgerly'], visible: true },
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
    .replace(/\u00A0/g, ' ')
}

async function documentXml(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const zip = await JSZip.loadAsync(await generateSwissCommerceDocx(row, settingsFor(row, locale, extra)))
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error('The artifact has no word/document.xml')
  // A non-breaking hyphen is a hyphen of the text, written as an element of its
  // own between two text nodes: read it back into its text node.
  return (await part.async('string')).replace(/<\/w:t><w:noBreakHyphen\/><w:t xml:space="preserve">/g, '-')
}

/** The document's text, run by run, in document order. */
async function wordText(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const xml = await documentXml(row, locale, extra)
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, text]) => decode(text).trim()).join('|')
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

const SECTION_KEYS = ['summary', 'experience', 'education', 'skills', 'languages', 'training'] as const

/** The headings, in the order they appear in `text`. */
function headingOrder(text: string, locale: Locale): string[] {
  const labels = DICTS[locale].resumes.template
  const nodes = text.split('|')
  return SECTION_KEYS.map((key) => ({ key, at: nodes.indexOf(labels[key]) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

describe('swissCommerce: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the sections in the mockup order, under the existing headings (FR-6)', async () => {
      const row = resumeRow()
      expect(headingOrder(previewOf(row, locale), locale)).toEqual([...SECTION_KEYS])
      expect(headingOrder(await wordText(row, locale), locale)).toEqual([...SECTION_KEYS])
    })

    it('draws the same localized words: present and the language pills (FR-7)', async () => {
      const row = resumeRow()
      const preview = previewOf(row, locale)
      const word = await wordText(row, locale)
      const words = [
        dict.resumes.template.present,
        `Esperanto — ${dict.resumes.editor.levels.native}`,
        `Interlingua — ${dict.resumes.editor.levels.fluent}`,
      ]
      for (const text of words) {
        expect(preview, `Preview draws "${text}"`).toContain(text)
        expect(word, `Word draws "${text}"`).toContain(text)
      }
    })

    it('draws every visible item and leaves out the hidden and empty ones (FR-2)', async () => {
      const row = resumeRow()
      for (const text of [previewOf(row, locale), await wordText(row, locale)]) {
        for (const visible of [
          'Morgan Aldervane',
          'Ledger steward',
          'Brightwater',
          '+41 00 000 00 08',
          'morgan@aldervane.test',
          'in/morgan-aldervane',
          'gh/aldervane',
          'aldervane.test',
          'Copperline Holdings',
          'Balanced the quarterly ledgers.',
          'Saltmarsh Trust',
          'Kept the correspondence in two languages.',
          'Federal diploma',
          'Aldervane College · Administration',
          'Project basics',
          'Guild of Clerks',
          'Office:',
          'Spreadsheets, Shared drives',
          'Software:',
          'Ledgerly',
        ]) {
          expect(text, visible).toContain(visible)
        }
        for (const hidden of [
          'Hidden Employer',
          'Hidden Position',
          'Hidden achievement.',
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
      expect(text).toContain('09.2020 – 06.2021')
      expect(text).toContain('05.2023')
    }
  })

  it('leaves out main sections the layout hides, heading included, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['education', 'summary'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'skills', 'languages', 'training'])
      expect(text).not.toContain('Aldervane College')
      expect(text).not.toContain('Steward of ledgers and agendas.')
    }
  })

  it('leaves out skills, languages and training hidden as sidebar sections, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenSidebarSections: ['skills', 'training'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'experience', 'education', 'languages'])
      expect(text).not.toContain('Spreadsheets')
      expect(text).not.toContain('Project basics')
    }
    const languagesHidden = resumeRow({ layout_settings: { hiddenSidebarSections: ['languages'] } })
    for (const text of [previewOf(languagesHidden, 'en'), await wordText(languagesHidden, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'experience', 'education', 'skills', 'training'])
      expect(text).not.toContain('Esperanto')
    }
  })

  it('draws no heading for a section whose items are all hidden or empty', async () => {
    const row = resumeRow({
      certifications: [{ name: 'Project basics', issuer: 'Guild of Clerks', date: '2023-05', visible: false }],
      skills: [{ category: 'Hidden category', items: ['Hidden skill'], visible: false }, { category: 'Blank', items: ['  '], visible: true }],
      languages: [],
      summary: '<p></p>',
    })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'education'])
      expect(text).not.toContain('Blank')
    }
  })

  it('leaves out each unticked contact detail on both outputs, and keeps the ticked ones (FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'github', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).not.toContain('morgan@aldervane.test')
      expect(text).not.toContain('gh/aldervane')
      expect(text).not.toContain('Ledger steward')
      expect(text).toContain('+41 00 000 00 08')
      expect(text).toContain('in/morgan-aldervane')
      expect(text).toContain('Morgan Aldervane')
    }
  })
})

describe('swissCommerce: the photo (FR-5, FR-14)', () => {
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

  it('draws the photo round in the band on both outputs when there is one', async () => {
    const preview = previewMarkup(resumeRow(), PHOTO)
    expect(preview).toContain(`src="${PHOTO}"`)
    expect(preview).toMatch(/class="swiss-commerce-photo shrink-0 overflow-hidden rounded-full border-blue-300"/)

    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    expect(xml.match(/<w:drawing>/g) ?? []).toHaveLength(1)
    expect(xml).toContain('<wp:inline')
    expect(xml).toContain('<a:prstGeom prst="ellipse">')
    expect(xml).not.toContain('<a:prstGeom prst="rect">')
    expect(xml).toMatch(new RegExp(`<a:ln w="${SWISS_COMMERCE_GEOMETRY.photoRing * 9525}"><a:solidFill><a:srgbClr val="${PALETTE['blue-300']}"/>`))
  })

  it('lays the whole round photo inside the band in Word, the ring included', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    // The paragraph holding the drawing is single-spaced: under the document's
    // default exact line, Word clipped the picture to one text line.
    const holder = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes('<w:drawing>'))
    expect(holder).toMatch(/<w:spacing [^>]*w:line="240"[^>]*w:lineRule="auto"/)
    // Room for the ring outside the picture's extent, so Word does not clip it flat.
    const ring = SWISS_COMMERCE_GEOMETRY.photoRing * 9525
    expect(xml).toContain(`<wp:effectExtent t="${ring}" r="${ring}" b="${ring}" l="${ring}"/>`)
    // The drawing sits in the band: the first table, shaded navy.
    const band = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml)?.[0] ?? ''
    expect(band).toContain('<w:drawing>')
    expect(band).toContain('Morgan Aldervane')
  })

  it('embeds the photo once', async () => {
    const zip = await JSZip.loadAsync(await generateSwissCommerceDocx(resumeRow(), settingsFor(resumeRow(), 'en', { photoBase64: PHOTO })))
    // `word/media/` is a folder entry the docx package writes; the photo is the one file in it.
    expect(Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)).toHaveLength(1)
  })

  it('draws no photo frame on either output when there is none', async () => {
    const preview = previewMarkup(resumeRow())
    expect(preview).not.toContain('<img')
    expect(preview).not.toContain('rounded-full')
    expect(await documentXml(resumeRow(), 'en')).not.toContain('<w:drawing>')
  })

  it('draws no frame for data that is not an image it can embed', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
    expect(xml).not.toContain('<w:drawing>')
  })

  it('draws no photo on either output when the photo is unticked, and draws it again when ticked', async () => {
    const hidden = resumeRow({ layout_settings: { hiddenContactFields: ['photo'] } })
    expect(previewMarkup(hidden, PHOTO)).not.toContain('<img')
    expect(previewMarkup(hidden, PHOTO)).toBe(previewMarkup(resumeRow()))
    expect(await documentXml(hidden, 'en', { photoBase64: PHOTO })).not.toContain('<w:drawing>')
    expect(await documentXml(hidden, 'en', { photoBase64: PHOTO, hiddenContactFields: [] })).toContain('<w:drawing>')
  })

  it('draws no upload box in the CV: the photo is uploaded from the Contact tab', () => {
    const html = renderToStaticMarkup(
      createElement(SwissCommerceTemplate, { resume: resumeRow() as unknown as Resume, locale: 'fr', dict: fr }),
    )
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('border-dashed')
  })

  it('refuses to ship a square photo when the drawing is not in the shape docx writes', () => {
    expect(() => roundPhoto('<w:document/>', null, 'FFFFFF')).toThrow(/no rectangular picture geometry/)
    expect(() => roundPhoto('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', null, 'FFFFFF')).toThrow(/no effect extent/)
  })
})

describe('swissCommerce: Word layout (FR-10)', () => {
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

  /** A table's floating position, `w:tblpPr`, as its attributes. */
  const floatOf = (table: string) =>
    Object.fromEntries([...(/<w:tblpPr\b([^>]*?)\/?>/.exec(table)?.[1] ?? '').matchAll(/w:(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))

  it('draws the band as the first table, floating at the page’s origin, navy from paper edge to paper edge, holding the name', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const band = tables(xml)[0]
    expect(band).toContain('Morgan Aldervane')
    expect(band).toContain(`<w:tblW w:type="dxa" w:w="${/<w:pgSz w:w="(\d+)"/.exec(xml)?.[1]}"/>`)
    expect(band).toMatch(new RegExp(`<w:shd [^>]*w:fill="${PALETTE.navy}"`))
    expect(band).not.toContain('<w:tblInd')
    // At the paper's top-left corner whatever the top margin, with the Preview's gap under it.
    expect(floatOf(band)).toEqual({
      horzAnchor: 'page',
      vertAnchor: 'page',
      tblpX: '0',
      tblpY: '0',
      topFromText: '0',
      leftFromText: '0',
      rightFromText: '0',
      bottomFromText: String(pxToTwips(SWISS_COMMERCE_GEOMETRY.bandGap)),
    })
    expect(band).toContain('<w:tblOverlap w:val="never"/>')
    // The band is the only floating table, and the first section's heading adds no gap of its own under it.
    expect(xml.split('<w:tblpPr').length - 1).toBe(1)
    const afterBand = xml.slice(xml.indexOf(band) + band.length)
    const firstHeading = new RegExp(`<w:p\\b(?:(?!</w:p>)[\\s\\S])*?>${en.resumes.template.summary}</w:t>`).exec(afterBand)?.[0] ?? ''
    expect(firstHeading).toMatch(/<w:spacing [^>]*w:before="0"/)
  })

  it('gives every page the PDF’s top and foot margins, so page 2 does not start at the paper’s edge and both break pages alike (swiss-templates-only-page-fidelity US-002)', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const G = SWISS_COMMERCE_GEOMETRY
    const marginX = pxToTwips(G.paddingX)
    expect(xml).toMatch(
      new RegExp(`<w:pgMar w:top="${pxToTwips(G.pageTop)}" w:right="${marginX}" w:bottom="${pxToTwips(G.pageBottom)}" w:left="${marginX}" w:header="0" w:footer="0"`),
    )
    // One section, so one set of margins for every page; no page has a top margin of 0.
    expect(xml.split('<w:pgMar').length - 1).toBe(1)
    expect(xml).not.toMatch(/<w:pgMar w:top="0"/)
  })

  it('puts the dates in a left column beside each dated entry', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(([row]) => row)
    const experienceRow = rows.find((row) => row.includes('Copperline Holdings'))
    const cells = [...experienceRow!.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    expect(cells).toHaveLength(2)
    expect(cells[0]).toContain(`01.2019 – ${en.resumes.template.present}`)
    expect(cells[1]).toContain('Office steward')
  })

  it('draws the skills two to a row, each label leading its skills in one paragraph', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const row = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(([r]) => r).find((r) => r.includes('Office:'))
    expect(row).toBeDefined()
    expect(row).toContain('Software:')
    const paragraph = [...row!.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes('Office:'))
    expect(paragraph).toContain('Spreadsheets, Shared drives')
    expect(paragraph).toMatch(new RegExp(`<w:color w:val="${PALETTE.navy}"/>[\\s\\S]*?Office:`))
  })

  it('draws each language as a shaded, bordered pill run', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const pill = [...xml.matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map(([r]) => r).find((r) => r.includes('Esperanto'))
    expect(pill).toMatch(new RegExp(`<w:bdr [^>]*w:color="${PALETTE['blue-200']}"`))
    expect(pill).toMatch(new RegExp(`<w:shd [^>]*w:fill="${PALETTE['blue-50']}"`))
    // Single-spaced: under an exact line Word paints the shading the full line
    // high but the border round the glyphs, so the fill sat above the border.
    const paragraph = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes('Esperanto'))
    expect(paragraph).toMatch(/<w:spacing [^>]*w:line="240"[^>]*w:lineRule="auto"/)
  })

  it('draws headings in navy spaced capitals over a navy rule', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const paragraph = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes(`>${en.resumes.template.experience}<`))
    expect(paragraph).toMatch(new RegExp(`<w:bottom [^>]*w:color="${PALETTE.navy}"`))
    expect(paragraph).toContain('<w:caps/>')
    expect(paragraph).toContain(`<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissCommerce.caps, pxToHalfPoints(SWISS_COMMERCE_SIZES.heading))}"/>`)
  })

  it('ignores the stored font family and scale (FR-4)', async () => {
    const row = resumeRow()
    const nameSize = (xml: string) =>
      /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>Morgan Aldervane<\/w:t>/.exec(xml)?.[1]
    const styled = await documentXml(row, 'en', { fontScale: 1.3, fontFamily: 'Georgia, serif' })
    expect(Number(nameSize(styled))).toBe(pxToHalfPoints(SWISS_COMMERCE_SIZES.name))
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

describe('swissCommerce: plain-text skills and an empty degree in Word, as the Preview draws them', () => {
  /** The body paragraphs, in order, each as its text with `\n` for a line break. */
  const paragraphTexts = (xml: string) =>
    [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([paragraph]) =>
      [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\/>/g)].map(([tag, text]) => (tag === '<w:br/>' ? '\n' : decode(text))).join(''),
    )
  const skillParagraphs = async (skillsHtml: string) => {
    const texts = paragraphTexts(await documentXml(resumeRow({ skills: [{ category: 'Office', items: [], skillsHtml, visible: true }] }), 'en'))
    const at = texts.findIndex((text) => text.startsWith('Office:'))
    expect(at, 'the label is drawn').toBeGreaterThanOrEqual(0)
    return texts.slice(at, at + 3)
  }

  it('runs a single-line plain-text skillsHtml on from its label', async () => {
    expect((await skillParagraphs('Excel, Word'))[0]).toBe('Office: Excel, Word')
  })

  it('runs multi-line plain text on from its label and keeps its line break', async () => {
    expect((await skillParagraphs('Excel\nWord'))[0]).toBe('Office: Excel\nWord')
  })

  it('starts a plain-text list on the paragraph below its label', async () => {
    const [label, first, second] = await skillParagraphs('- Excel\n- Word')
    expect(label).toBe('Office:')
    expect(first).toBe('• Excel')
    expect(second).toBe('• Word')
  })

  it('draws no empty degree paragraph, and keeps the school', async () => {
    const xml = await documentXml(
      resumeRow({ education: [{ school: 'Aldervane College', degree: '', startDate: '2020-09', endDate: '2021-06', visible: true }] }),
      'en',
    )
    const cell = [...xml.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([c]) => c).find((c) => c.includes('Aldervane College'))
    expect(cell).toBeDefined()
    // The school is the cell's first paragraph: no empty bold line above it.
    expect(paragraphTexts(cell!)[0]).toBe('Aldervane College')
  })
})

describe('swissCommerce: a description paragraph beside its list is kept, in the Preview’s order (swiss-templates-only-page-fidelity US-004)', () => {
  // The audit fixture's entry: Word dropped its paragraph and kept only the list.
  const MIXED = '<p>Gestion des commandes de matériel <strong>médical</strong> et suivi des stocks.</p><ul><li>Inventaires trimestriels</li><li>Relations avec les fournisseurs</li></ul>'
  const PARAGRAPH = 'Gestion des commandes de matériel médical et suivi des stocks.'
  // A description's list items, as the shared list helper has always written them.
  const ITEMS = ['• Inventaires trimestriels', '• Relations avec les fournisseurs']
  // An experience's achievements, as the template writes them.
  const BULLETS = ['•\tInventaires trimestriels', '•\tRelations avec les fournisseurs']

  const allParagraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p)
  const runsIn = (paragraph: string) =>
    [...paragraph.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => ({
      text: [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map(([tag, t]) => (tag === '<w:tab/>' ? '\t' : decode(t))).join(''),
      bold: /<w:b\/>/.test(inner),
    }))
  const textIn = (paragraph: string) => runsIn(paragraph).map((r) => r.text).join('')
  /** The paragraphs that draw text, with their text, in document order. */
  const drawn = async (overrides: Partial<Row>) =>
    allParagraphs(await documentXml(resumeRow(overrides), 'fr'))
      .map((xml) => ({ xml, text: textIn(xml) }))
      .filter(({ text }) => text !== '')
  const experience = (fields: Record<string, unknown>) => ({
    experience: [{ company: 'Clinique du Lac', position: 'Acheteuse', startDate: '2008-01', endDate: '2010-06', current: false, visible: true, ...fields }],
  })

  it('draws an experience’s paragraph, then its list, under its title, with the paragraph’s bold run', async () => {
    const paragraphs = await drawn(experience({ achievements: [], description: MIXED }))
    const at = paragraphs.findIndex(({ text }) => text === PARAGRAPH)
    expect(at, 'the paragraph is drawn').toBeGreaterThanOrEqual(0)
    expect(paragraphs.findIndex(({ text }) => text.startsWith('Acheteuse'))).toBeLessThan(at)
    expect(paragraphs.slice(at, at + 3).map(({ text }) => text)).toEqual([PARAGRAPH, ...ITEMS])
    expect(runsIn(paragraphs[at].xml).find((r) => r.text === 'médical')?.bold).toBe(true)
    // The items keep the list helper's form, and the paragraph sits at the same edge.
    for (const { xml } of paragraphs.slice(at, at + 3)) expect(xml).not.toContain('<w:ind ')
  })

  it('draws an education’s paragraph, then its list', async () => {
    const paragraphs = await drawn({
      education: [{ school: 'HEG Genève', degree: 'Bachelor', field: 'Gestion', startDate: '2007-09', endDate: '2010-06', description: MIXED, visible: true }],
    })
    const at = paragraphs.findIndex(({ text }) => text === PARAGRAPH)
    expect(at, 'the paragraph is drawn').toBeGreaterThanOrEqual(0)
    expect(paragraphs.slice(at, at + 3).map(({ text }) => text)).toEqual([PARAGRAPH, ...ITEMS])
  })

  it('keeps a paragraph after the list after it, and every paragraph of a longer description', async () => {
    const description = '<p>Avant.</p><ul><li>Un</li><li>Deux</li></ul><p>Après.</p><p>Fin.</p>'
    const texts = (await drawn(experience({ achievements: [], description }))).map(({ text }) => text)
    const at = texts.indexOf('Avant.')
    expect(texts.slice(at, at + 5)).toEqual(['Avant.', '• Un', '• Deux', 'Après.', 'Fin.'])
  })

  it('leaves an entry with only a description paragraph as one paragraph of formatted runs', async () => {
    const paragraphs = await drawn(experience({ achievements: [], description: `<p>${PARAGRAPH}</p>` }))
    const matches = paragraphs.filter(({ text }) => text.includes('Gestion des commandes'))
    expect(matches.map(({ text }) => text)).toEqual([PARAGRAPH])
    expect(matches[0].xml).not.toContain('<w:ind ')
  })

  it('leaves an entry with only a list as its items, with no paragraph added', async () => {
    const description = '<ul><li>Inventaires trimestriels</li><li>Relations avec les fournisseurs</li></ul>'
    const texts = (await drawn(experience({ achievements: [], description }))).map(({ text }) => text)
    const at = texts.indexOf(ITEMS[0])
    expect(texts[at - 1]).toMatch(/^Acheteuse/)
    expect(texts.slice(at, at + 2)).toEqual(ITEMS)
  })

  it('draws a summary’s paragraph, then its list', async () => {
    const texts = (await drawn({ summary: MIXED })).map(({ text }) => text)
    const at = texts.indexOf(PARAGRAPH)
    expect(at, 'the paragraph is drawn').toBeGreaterThanOrEqual(0)
    expect(texts.slice(at, at + 3)).toEqual([PARAGRAPH, ...ITEMS])
  })

  it('draws an HTML skill row’s paragraph, then its list, under its label', async () => {
    const skillsHtml = '<p>Outils <strong>ERP</strong></p><ul><li>SAP</li><li>Abacus</li></ul>'
    const paragraphs = await drawn({ skills: [{ category: 'Logistique', items: [], skillsHtml, visible: true }] })
    const at = paragraphs.findIndex(({ text }) => text === 'Outils ERP')
    expect(at, 'the paragraph is drawn').toBeGreaterThanOrEqual(0)
    expect(paragraphs[at - 1].text).toMatch(/^Logistique/)
    expect(paragraphs.slice(at, at + 3).map(({ text }) => text)).toEqual(['Outils ERP', '• SAP', '• Abacus'])
    expect(runsIn(paragraphs[at].xml).find((r) => r.text === 'ERP')?.bold).toBe(true)
  })

  it('leaves an entry with only achievements as its bullets, unchanged', async () => {
    const paragraphs = await drawn(experience({ achievements: ['Inventaires trimestriels', 'Relations avec les fournisseurs'] }))
    const at = paragraphs.findIndex(({ text }) => text === BULLETS[0])
    expect(paragraphs.slice(at, at + 2).map(({ text }) => text)).toEqual(BULLETS)
    expect(paragraphs[at].xml).toContain(`<w:ind w:left="${pxToTwips(20)}" w:hanging="${pxToTwips(20)}"/>`)
  })
})
