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
import { SwissItTemplate } from '@/components/dashboard/resume-templates/swiss-it-template'
import { SWISS_IT_CARD_TEXT_WIDTH, SWISS_IT_GEOMETRY, SWISS_IT_SIZES, swissItHeading, swissItLinkParts } from '@/lib/swiss-it-template'
import { interTextWidthPx } from '@/test/inter-advance-widths'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { CONSOLAS_ADVANCE_EM, SWISS_IT_LINK_SAFETY_PX, generateSwissItDocx, roundPhoto, swissItContactRunText, swissItProjectLinkText } from './docx-swiss-it'
import { interLinkWidthPx } from '@/lib/inter-link-widths'

/**
 * The swissIt Word export against its contract, the Preview: the same sections
 * in the same fixed order, the same hidden content left out, the same
 * localized words, the tags and the project cards, and the photo drawn only
 * when there is one and it is ticked (FR-2, FR-5, FR-6, FR-7, FR-10, FR-14).
 *
 * The fixture's summary and descriptions are plain text: rich text renders
 * empty outside a browser, so the text comparisons with the Preview would not
 * see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
const PALETTE = DOCX_PALETTE.swissIt
const G = SWISS_IT_GEOMETRY

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-it',
    user_id: 'u1',
    title: 'Full-stack developer',
    template: 'swissIt',
    contact: {
      name: 'Aline Berset',
      email: 'aline@berset.test',
      phone: '+41 00 000 00 07',
      location: 'Oxbridge',
      linkedin: 'in/aline-berset',
      github: 'github.test/aline',
      website: 'aline.test',
    },
    summary: 'Developer of public web applications.',
    skills: [
      { category: 'Languages', items: [], skillsHtml: 'TypeScript, Java, Spring Boot', visible: true },
      { category: 'Tools', items: ['Docker'], visible: true },
      { category: 'Hidden category', items: ['Hidden skill'], visible: false },
      { category: 'Empty category', items: [], visible: true },
    ],
    experience: [
      {
        company: 'Swiss Digital Services',
        position: 'Full-stack developer',
        location: 'Oxbridge',
        startDate: '2021-01',
        current: true,
        achievements: ['Rebuilt the citizen portal.', 'Added end-to-end tests.'],
        visible: true,
      },
      { company: 'Hidden Employer', position: 'Hidden Position', startDate: '2016-01', endDate: '2018-12', achievements: ['Hidden achievement.'], visible: false },
      { company: 'Aare Payments', position: 'Apprentice developer', startDate: '2016-08', endDate: '2020-12', current: false, description: 'Maintained Java apps.', visible: true },
    ],
    projects: [
      { name: 'Booking tool', description: 'Rooms for clubs.', technologies: ['Next.js', 'Supabase'], url: 'example.test/booking', visible: true },
      { name: 'Hidden project', description: 'Hidden project description.', visible: false },
      { name: '', description: 'A project with no name.', technologies: ['Python', 'Grafana'], visible: true },
      { name: 'Third project', description: 'Alone on its row.', visible: true },
      { name: ' ', description: '', technologies: [], url: '', visible: true },
    ],
    education: [
      { school: 'BFH', degree: 'Bachelor in computer science', field: 'Biel', startDate: '2018-09', endDate: '2021-06', visible: true },
      { school: 'Trade school', degree: '', startDate: '2012-08', endDate: '2016-06', description: 'Apprenticeship.', visible: true },
      { school: 'Hidden School', degree: 'Hidden degree', visible: false },
    ],
    languages: [
      { language: 'Esperanto', level: 'Native', visible: true },
      { language: 'Interlingua', level: 'Professional', visible: true },
      { language: 'Volapuk', level: 'Basic', visible: false },
    ],
    certifications: [
      { name: 'Cloud Developer', issuer: 'Example Cloud', date: '2023-05', visible: true },
      { name: 'Scrum basics', issuer: '', date: '', visible: true },
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
  const zip = await JSZip.loadAsync(await generateSwissItDocx(row, settingsFor(row, locale, extra)))
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
  // A `<wbr>` is a line-break opportunity, not text: the browser reads the
  // text on both sides of it as one (swissIt marks its links' boundaries so).
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
    summary: swissItHeading(t.summary, locale),
    skills: swissItHeading(t.skills, locale),
    experience: swissItHeading(t.experience, locale),
    projects: swissItHeading(t.projects, locale),
    education: swissItHeading(t.education, locale),
    languagesAndCertifications: swissItHeading(`${t.languages} & ${t.training}`, locale),
    languages: swissItHeading(t.languages, locale),
    certifications: swissItHeading(t.training, locale),
  }
  const nodes = text.split('|')
  return Object.entries(labels)
    .map(([key, label]) => ({ key, at: nodes.indexOf(label) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const ALL_SECTIONS = ['summary', 'skills', 'experience', 'projects', 'education', 'languagesAndCertifications']

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

describe('swissIt: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the sections in the mockup order under the existing headings and the new projects label (FR-6)', async () => {
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
        `Esperanto — ${dict.resumes.editor.levels.native} \u00B7 Interlingua — ${dict.resumes.editor.levels.professional}`,
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
          'Aline Berset|> Full-stack developer|Oxbridge \u00B7|+41 00 000 00 07 \u00B7|aline@berset.test|in/aline-berset \u00B7|github.test/aline \u00B7|aline.test',
          'Developer of public web applications.',
          'Languages:|TypeScript|Java|Spring Boot|Tools:|Docker',
          `Full-stack developer|01.2021 – ${dict.resumes.template.present}|Swiss Digital Services, Oxbridge`,
          'Rebuilt the citizen portal.',
          'Apprentice developer|08.2016 – 12.2020|Aare Payments|Maintained Java apps.',
          // A card: its name, its description, its link, its tags; a card with no name; the odd card.
          'Booking tool|Rooms for clubs.|example.test/booking|Next.js|Supabase|A project with no name.|Python|Grafana|Third project|Alone on its row.',
          'Bachelor in computer science|09.2018 – 06.2021|BFH, Biel',
          'Trade school|08.2012 – 06.2016|Apprenticeship.',
          'Cloud Developer – Example Cloud (05.2023) \u00B7 Scrum basics',
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
      expect(headingOrder(text, 'en')).toEqual(['experience', 'education'])
      expect(text).not.toContain('Blank')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('heads the last section with the one part it draws, on both outputs', async () => {
    const languagesOnly = resumeRow({ layout_settings: { hiddenSidebarSections: ['training'] } })
    const certificationsOnly = resumeRow({ languages: [] })
    for (const text of [previewOf(languagesOnly, 'fr'), await wordText(languagesOnly, 'fr')]) {
      expect(headingOrder(text, 'fr').at(-1)).toBe('languages')
      expect(text).not.toContain('Cloud Developer')
    }
    for (const text of [previewOf(certificationsOnly, 'fr'), await wordText(certificationsOnly, 'fr')]) {
      expect(headingOrder(text, 'fr').at(-1)).toBe('certifications')
    }
    expect(withoutBullets(await wordText(languagesOnly, 'fr'))).toBe(previewOf(languagesOnly, 'fr'))
    expect(withoutBullets(await wordText(certificationsOnly, 'fr'))).toBe(previewOf(certificationsOnly, 'fr'))
  })

  it('leaves out the sections the layout hides, through either panel, heading included, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['education', 'summary'], hiddenSidebarSections: ['keyAchievements', 'skills'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'languagesAndCertifications'])
      expect(text).not.toContain('BFH')
      expect(text).not.toContain('Booking tool')
      expect(text).not.toContain('TypeScript')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('draws the employer or the school as the first line when the position or degree is empty, once, on both outputs', async () => {
    const row = resumeRow({
      experience: [{ company: 'Swiss Digital Services', position: '', location: 'Oxbridge', startDate: '2021-01', current: true, visible: true }],
    })
    const preview = previewOf(row, 'en')
    expect(withoutBullets(await wordText(row, 'en'))).toBe(preview)
    expect(preview).toContain(`Swiss Digital Services, Oxbridge|01.2021 – ${en.resumes.template.present}`)
    expect(preview.split('Swiss Digital Services').length - 1).toBe(1)
  })

  it('leaves out each unticked contact detail and the CV title on both outputs, and keeps the ticked ones (FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'github', 'website', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).not.toContain('aline@berset.test')
      expect(text).not.toContain('github.test/aline')
      expect(text).not.toContain('aline.test')
      expect(text).not.toContain('Full-stack developer|Oxbridge')
      // No dangling dot after the last value a line keeps.
      expect(text).toContain('Aline Berset|Oxbridge \u00B7|+41 00 000 00 07|in/aline-berset|')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })
})

describe('swissIt: the photo (FR-5, FR-14)', () => {
  const previewMarkup = (row: Row, photoUrl?: string) => {
    const layout = resolveResumeLayout(row, null)
    return renderToStaticMarkup(
      createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en, photoUrl, hiddenContactFields: layout.hiddenContactFields }),
    )
  }

  const photoDrawing = (xml: string) => /<w:drawing>[\s\S]*?<\/w:drawing>/.exec(xml)?.[0]

  it('draws the photo round, in its green ring and fill, in the band’s last cell, on both outputs', async () => {
    const preview = previewMarkup(resumeRow(), PHOTO)
    expect(preview).toContain(`src="${PHOTO}"`)
    expect(preview).toContain('class="swiss-it-photo shrink-0 overflow-hidden"')

    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const drawing = photoDrawing(xml)
    expect(drawing).toBeDefined()
    expect(drawing).toContain('<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>')
    expect(drawing).toContain(`<a:solidFill><a:srgbClr val="${PALETTE.photoFill}"/></a:solidFill>`)
    expect(drawing).toMatch(new RegExp(`<a:ln w="${G.photoRing * 9525}"><a:solidFill><a:srgbClr val="${PALETTE.photoRing}"/>`))
    expect(drawing).toContain(`<wp:extent cx="${G.photo * 9525}" cy="${G.photo * 9525}"/>`)
    // In the band, after its contact lines and before the first heading.
    expect(xml.indexOf(drawing!)).toBeGreaterThan(xml.indexOf('>aline.test<'))
    expect(xml.indexOf(drawing!)).toBeLessThan(xml.indexOf(`>${swissItHeading(en.resumes.template.summary, 'en')}<`))
    const band = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml)![0]
    const cells = [...band.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    expect(cells).toHaveLength(2)
    expect(cells[1]).toContain('<w:drawing>')
    expect(xml.split('<w:drawing>').length - 1).toBe(1)
  })

  it('lays the photo in a paragraph of auto line spacing, so Word does not clip it to a text line', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const holder = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes('<wp:inline'))
    expect(holder).toMatch(/<w:spacing [^>]*w:line="240" w:lineRule="auto"\/>/)
  })

  it('embeds the photo only when there is one', async () => {
    const media = async (extra: Partial<DocxGeneratorSettings>) => {
      const zip = await JSZip.loadAsync(await generateSwissItDocx(resumeRow(), settingsFor(resumeRow(), 'en', extra)))
      return Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    }
    expect(await media({})).toHaveLength(0)
    expect(await media({ photoBase64: PHOTO })).toHaveLength(1)
  })

  it('draws no photo frame on either output when there is none, or the data is not an image it can embed', async () => {
    const preview = previewMarkup(resumeRow())
    expect(preview).not.toContain('<img')
    expect(preview).not.toContain('swiss-it-photo')
    const xml = await documentXml(resumeRow(), 'en')
    expect(photoDrawing(xml)).toBeUndefined()
    // No photo: the band is one cell, the full page wide.
    const band = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml)![0]
    expect([...band.matchAll(/<w:tc>/g)]).toHaveLength(1)
    expect(photoDrawing(await documentXml(resumeRow(), 'en', { photoBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }))).toBeUndefined()
  })

  it('draws no photo on either output when the photo is unticked, and draws it again when ticked', async () => {
    const hidden = resumeRow({ layout_settings: { hiddenContactFields: ['photo'] } })
    expect(previewMarkup(hidden, PHOTO)).toBe(previewMarkup(resumeRow()))
    expect(photoDrawing(await documentXml(hidden, 'en', { photoBase64: PHOTO }))).toBeUndefined()
    expect(photoDrawing(await documentXml(hidden, 'en', { photoBase64: PHOTO, hiddenContactFields: [] }))).toBeDefined()
  })

  it('draws no upload box in the CV: the photo is uploaded from the Contact tab', () => {
    const html = renderToStaticMarkup(createElement(SwissItTemplate, { resume: resumeRow() as unknown as Resume, locale: 'fr', dict: fr }))
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
  })

  it('refuses to ship a square photo when the drawing is not in the shape docx writes', () => {
    expect(() => roundPhoto('<w:document/>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no inline drawing/)
    expect(() => roundPhoto('<wp:inline></wp:inline>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no rectangular picture geometry/)
    expect(() => roundPhoto('<wp:inline><a:prstGeom prst="rect"/></wp:inline>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no effect extent/)
  })
})

describe('swissIt: Word layout (FR-10)', () => {
  const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p)

  /** The page's width in twips, as the document states it. */
  const pageWidth = (xml: string) => Number(/<w:pgSz [^>]*w:w="(\d+)"/.exec(xml)?.[1])

  /** Each paragraph's runs, in order, as their text and whether they are bold. */
  const paragraphRuns = (paragraph: string) =>
    [...paragraph.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => ({
      text: [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map(([tag, t]) => (tag === '<w:tab/>' ? '\t' : t)).join(''),
      bold: /<w:b\/>/.test(inner),
      raw: inner,
    }))

  /** The innermost table holding `needle`. */
  const tableHolding = (xml: string, needle: string) =>
    [...xml.matchAll(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g)].map(([table]) => table).find((table) => table.includes(needle))

  /** A table's floating position, `w:tblpPr`, as its attributes. */
  const floatOf = (table: string) =>
    Object.fromEntries([...(/<w:tblpPr\b([^>]*?)\/?>/.exec(table)?.[1] ?? '').matchAll(/w:(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))

  it('floats the band at the page’s origin, the page’s width, shaded the band’s colour, so it meets the paper’s top and side edges', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const band = tableHolding(xml, '>Aline Berset<')!
    expect(band).toContain(`<w:tblW w:type="dxa" w:w="${pageWidth(xml)}"/>`)
    expect(band).toMatch(new RegExp(`<w:shd [^>]*w:fill="${PALETTE.ink}"`))
    expect(band).not.toContain('<w:tblInd')
    expect(floatOf(band)).toEqual({
      horzAnchor: 'page',
      vertAnchor: 'page',
      tblpX: '0',
      tblpY: '0',
      topFromText: '0',
      leftFromText: '0',
      rightFromText: '0',
      bottomFromText: String(pxToTwips(G.bandGap)),
    })
    expect(band).toContain('<w:tblOverlap w:val="never"/>')
    // The band is the document's first block, and the only floating table.
    expect(xml.indexOf(band)).toBe(xml.indexOf('<w:tbl>'))
    expect(xml.split('<w:tblpPr').length - 1).toBe(1)
  })

  it('gives every page the PDF’s top and foot margins, so page 2 does not start at the paper’s edge and both break pages alike', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const marginX = pxToTwips(G.paddingX)
    expect(G.pageTop).toBe(48)
    expect(G.pageBottom).toBe(48)
    expect(xml).toMatch(
      new RegExp(`<w:pgMar w:top="${pxToTwips(G.pageTop)}" w:right="${marginX}" w:bottom="${pxToTwips(G.pageBottom)}" w:left="${marginX}" w:header="0" w:footer="0"`),
    )
    // One section, so one set of margins for every page; no page has a top margin of 0.
    expect(xml.split('<w:pgMar').length - 1).toBe(1)
    expect(xml).not.toMatch(/<w:pgMar w:top="0"/)
  })

  it('marks a link’s boundaries with zero-width spaces, so Word wraps a long link after a "/" or before a ".", never at a letter', async () => {
    const ZWSP = String.fromCharCode(0x200b)
    const url = 'https://github.com/alineberset/energieverbrauchsueberwachungsplattform-backend-service'
    const xml = await documentXml(resumeRow({ projects: [{ name: 'Energy', url, visible: true }] }), 'en')
    const expected = ['https://', 'github', '.com/', 'alineberset/', 'energieverbrauchsueberwachungsplattform', '-backend', '-service'].join(ZWSP)
    expect(xml).toContain(`>${expected}<`)
    // A contact link that fits the band stays whole, so Word moves it as the Preview does.
    expect(xml).toContain(`>github.test/aline${String.fromCharCode(0xa0)}${String.fromCharCode(0xb7)} <`)
    // A plain sentence carries none.
    expect(xml).toContain('>Developer of public web applications.<')
  })

  it('keeps a contact value that fits the band whole, so an overflowing line moves it to the next line, and breaks only a value wider than the band', async () => {
    const ZWSP = String.fromCharCode(0x200b)
    const NBSP = String.fromCharCode(0xa0)
    const DOT = String.fromCharCode(0xb7)
    const linkedin = 'linkedin.com/in/aline-berset-full-stack-developer-bern'
    const github = 'github.com/alineberset/energy-dashboards-and-monitoring'
    const website = `https://aline-berset.dev/${'portfolio/'.repeat(9)}index`
    const row = resumeRow({ contact: { name: 'Aline Berset', linkedin, github, website } })
    for (const photoBase64 of [undefined, PHOTO]) {
      const xml = await documentXml(row, 'en', { photoBase64 })
      const runs = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text)
      // Together the three overflow the band's line: the line must wrap.
      const lineTwips = pageWidth(xml) - 2 * pxToTwips(G.paddingX) - (photoBase64 ? pxToTwips(G.photoGap + G.photo) : 0)
      const advance = (pxToHalfPoints(SWISS_IT_SIZES.contact) / 2) * 20 * (1126 / 2048)
      expect((linkedin.length + github.length + 6) * advance).toBeGreaterThan(lineTwips)
      // The two that fit stay whole: no break opportunity inside either.
      expect(runs).toContain(`${linkedin}${NBSP}${DOT} `)
      expect(runs).toContain(`${github}${NBSP}${DOT} `)
      // The one wider than the whole line breaks only at its link boundaries.
      expect(website.length * advance).toBeGreaterThan(lineTwips)
      const long = runs.find((text) => text.replaceAll(ZWSP, '') === website)
      expect(long, 'the website run').toBeDefined()
      expect(long!.split(ZWSP)).toEqual(swissItLinkParts(website))
    }
  })

  it('writes the evidence sample’s email and links exactly as stored, with nothing inserted, so they copy and parse whole', async () => {
    const ZWSP = String.fromCharCode(0x200b)
    const row = resumeRow({
      contact: { name: 'Aline Berset', email: 'aline.berset@exemple.ch', phone: '+41 79 789 01 23', location: 'Berne', github: 'github.com/alineberset', website: 'aline-berset.dev' },
      projects: [{ name: 'Outil de réservation', description: 'Salles pour associations.', url: 'github.com/alineberset/reservation', technologies: ['Next.js'], visible: true }],
    })
    for (const photoBase64 of [undefined, PHOTO]) {
      const xml = await documentXml(row, 'fr', { photoBase64 })
      const runs = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text)
      for (const value of ['aline.berset@exemple.ch', 'github.com/alineberset', 'aline-berset.dev', 'github.com/alineberset/reservation']) {
        const run = runs.find((text) => text.includes(value))
        expect(run, value).toBeDefined()
        expect(run, value).not.toContain(ZWSP)
      }
    }
  })

  it('never inserts a break opportunity into an email address, even one wider than the band', async () => {
    const email = `${'firstname.lastname.'.repeat(6)}longer@ingenieurbuero-halvorsen.example.test`
    const xml = await documentXml(resumeRow({ contact: { name: 'Aline Berset', email } }), 'en')
    const advance = (pxToHalfPoints(SWISS_IT_SIZES.contact) / 2) * 20 * CONSOLAS_ADVANCE_EM
    expect(email.length * advance).toBeGreaterThan(pageWidth(xml) - 2 * pxToTwips(G.paddingX))
    expect(xml).toContain(`>${email}<`)
  })

  it('breaks a project link only when it is wider than its card’s line in Inter, with a safety margin', () => {
    const ZWSP = String.fromCharCode(0x200b)
    const halfPoints = pxToHalfPoints(SWISS_IT_SIZES.body)
    expect(swissItProjectLinkText('github.com/alineberset/reservation', halfPoints)).toBe('github.com/alineberset/reservation')
    const long = 'https://github.com/alineberset/energieverbrauchsueberwachungsplattform-backend-service'
    expect(swissItProjectLinkText(long, halfPoints)).toBe(swissItLinkParts(long).join(ZWSP))
    // The threshold: the card's line less the margin, at Word's size.
    const room = SWISS_IT_CARD_TEXT_WIDTH - SWISS_IT_LINK_SAFETY_PX
    const justFits = 'a'.repeat(Math.floor(room / interLinkWidthPx('a', halfPoints / 1.5)) - 4) + '.test'
    expect(interLinkWidthPx(justFits, halfPoints / 1.5)).toBeLessThanOrEqual(room)
    expect(swissItProjectLinkText(justFits, halfPoints)).toBe(justFits)
    const tooWide = `${justFits}.example`
    expect(interLinkWidthPx(tooWide, halfPoints / 1.5)).toBeGreaterThan(room)
    expect(swissItProjectLinkText(tooWide, halfPoints)).toContain(ZWSP)
  })

  it('measures a contact value in Consolas’s exact advance', () => {
    expect(CONSOLAS_ADVANCE_EM).toBe(1126 / 2048)
    const lineTwips = 1000
    // At 9pt a glyph is 98.96 twips: 10 fit in 1000 twips, 11 do not.
    const room = Math.floor(lineTwips / ((18 / 2) * 20 * CONSOLAS_ADVANCE_EM))
    expect(room).toBe(10)
    const ZWSP = String.fromCharCode(0x200b)
    expect(swissItContactRunText(`${'a'.repeat(room - 2)}.b`, lineTwips, 18, false)).toBe(`${'a'.repeat(room - 2)}.b`)
    expect(swissItContactRunText(`${'a'.repeat(room - 1)}.b`, lineTwips, 18, false)).toBe(`${'a'.repeat(room - 1)}${ZWSP}.b`)
  })

  it('starts the first section right under the band, at the band’s bottom distance; later sections at the section gap', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const headingOf = (label: string) => paragraphs(xml).find((p) => p.includes(`>${swissItHeading(label, 'en')}<`))!
    const before = (paragraph: string) => /<w:spacing [^>]*w:before="(\d+)"/.exec(paragraph)?.[1]
    expect(before(headingOf(en.resumes.template.summary))).toBe('0')
    expect(before(headingOf(en.resumes.template.skills))).toBe(String(pxToTwips(G.sectionGap)))
  })

  it('draws the band’s name in white Inter, the title and contact lines in Consolas, title green, contact grey', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const all = paragraphs(xml).map(paragraphRuns)
    const runOf = (text: string) => all.flat().find((r) => r.text === text)
    expect(runOf('Aline Berset')?.raw).toContain(`<w:color w:val="${PALETTE.name}"/>`)
    expect(runOf('Aline Berset')?.raw).toMatch(/w:ascii="Inter"/)
    const title = runOf('&gt; Full-stack developer')
    expect(title?.raw).toMatch(/w:ascii="Consolas"/)
    expect(title?.raw).toContain(`<w:color w:val="${PALETTE.prompt}"/>`)
    // One run per value, held together by no-break spaces; the space after a dot is breakable.
    const phone = runOf('+41\u00A000\u00A0000\u00A000\u00A007\u00A0\u00B7 ')
    expect(phone, 'the phone held together').toBeDefined()
    expect(phone?.raw).toMatch(/w:ascii="Consolas"/)
    expect(phone?.raw).toContain(`<w:color w:val="${PALETTE.contact}"/>`)
  })

  it('draws every heading in bold green Consolas, kept with what follows', async () => {
    const xml = await documentXml(resumeRow(), 'de')
    for (const label of [de.resumes.template.summary, de.resumes.template.projects, de.resumes.template.education]) {
      const text = swissItHeading(label, 'de')
      const heading = paragraphs(xml).find((p) => p.includes(`>${text}<`))
      expect(heading, text).toBeDefined()
      const [runInfo] = paragraphRuns(heading!)
      expect(runInfo.bold).toBe(true)
      expect(runInfo.raw).toMatch(/w:ascii="Consolas"/)
      expect(runInfo.raw).toContain(`<w:color w:val="${PALETTE.heading}"/>`)
      expect(runInfo.raw).toContain(`<w:sz w:val="${pxToHalfPoints(SWISS_IT_SIZES.heading)}"/>`)
      expect(heading).toContain('<w:keepNext/>')
    }
  })

  it('draws a skill category as its bold label, then its tags as shaded, outlined runs parted by a break opportunity', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const row = paragraphs(xml).find((p) => p.includes('>Languages:<'))!
    const runs = paragraphRuns(row)
    expect(runs[0].bold).toBe(true)
    expect(runs[0].raw).toContain(`<w:color w:val="${PALETTE.ink}"/>`)
    const tags = runs.filter((r) => /<w:shd\b/.test(r.raw))
    expect(tags.map((r) => r.text)).toEqual(['\u00A0TypeScript\u00A0', '\u00A0Java\u00A0', '\u00A0Spring\u00A0Boot\u00A0'])
    for (const tag of tags) {
      expect(tag.raw).toMatch(new RegExp(`<w:shd [^>]*w:fill="${PALETTE.tagFill}"`))
      expect(tag.raw).toMatch(new RegExp(`<w:bdr [^>]*w:val="single"[^>]*w:color="${PALETTE.tagBorder}"|<w:bdr [^>]*w:color="${PALETTE.tagBorder}"[^>]*w:val="single"`))
      expect(tag.raw).toContain(`<w:color w:val="${PALETTE.tagText}"/>`)
      // A tag never breaks inside: no breakable space in its text.
      expect(tag.text).not.toMatch(/ /)
    }
    // Before every tag: a widened space and a zero-width space, the only places the row may break.
    expect(runs.filter((r) => r.text === '\u200B')).toHaveLength(3)
    expect(row).toContain('w:lineRule="auto"')
  })

  it('lays each row of project cards as a table of two bordered cells and a gap, an odd last card alone at the left', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const first = tableHolding(xml, '>Booking tool<')!
    const second = tableHolding(xml, '>Third project<')!
    expect(first).not.toBe(second)
    const cardWidth = Math.round((pageWidth(xml) - 2 * pxToTwips(G.paddingX) - pxToTwips(G.cardGap)) / 2)
    for (const table of [first, second]) {
      expect(table).toContain(`<w:gridCol w:w="${cardWidth}"/><w:gridCol w:w="${pxToTwips(G.cardGap)}"/>`)
      expect(table).toContain('<w:cantSplit/>')
    }
    const cells = (table: string) => [...table.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    const bordered = (cell: string) => new RegExp(`<w:top w:val="single" w:color="${PALETTE.cardBorder}"`).test(cell)
    expect(cells(first).map(bordered)).toEqual([true, false, true])
    expect(cells(second).map(bordered)).toEqual([true, false, false])
    expect(cells(second)[0]).toContain('>Third project<')
    // The card's content, in order: bold name, description, link in grey, tags.
    const texts = paragraphs(cells(first)[0]).map((p) => paragraphRuns(p))
    expect(texts.map((runs) => runs.map((r) => r.text).join('').replace(/\u200B/g, ''))).toEqual([
      'Booking tool',
      'Rooms for clubs.',
      'example.test/booking',
      '\u00A0Next.js\u00A0 \u00A0Supabase\u00A0',
    ])
    expect(texts[0][0].bold).toBe(true)
    expect(texts[2][0].raw).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
  })

  it('leaves a card’s text the same width as the Preview’s: its cell less the border and padding', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const card = [...tableHolding(xml, '>Booking tool<')!.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)][0][0]
    const width = Number(/<w:tcW w:type="dxa" w:w="(\d+)"\/>/.exec(card)?.[1])
    const left = Number(/<w:tcMar>[\s\S]*?<w:(?:left|start) w:type="dxa" w:w="(\d+)"\/>/.exec(card)?.[1])
    const right = Number(/<w:tcMar>[\s\S]*?<w:(?:right|end) w:type="dxa" w:w="(\d+)"\/>/.exec(card)?.[1])
    expect(Math.abs((width - left - right) / 15 - SWISS_IT_CARD_TEXT_WIDTH)).toBeLessThan(0.5)
  })

  it('keeps a long word and a long tag whole in a card: each one run Word wraps around, never inside', async () => {
    const name = 'Reservierungsplattform für Vereine'
    const tag = 'Kubernetes Operator SDK'
    const xml = await documentXml(resumeRow({ projects: [{ name, description: 'Verwaltungsdigitalisierung.', technologies: [tag], visible: true }] }), 'de')
    expect(xml).toContain(`>${name}<`)
    expect(xml).toContain(`>\u00A0${tag.replace(/ /g, '\u00A0')}\u00A0<`)
    const wordPx = pxToHalfPoints(SWISS_IT_SIZES.body) / 1.5
    expect(interTextWidthPx('Reservierungsplattform', 700, wordPx)).toBeLessThanOrEqual(SWISS_IT_CARD_TEXT_WIDTH)
    expect(interTextWidthPx(tag, 400, pxToHalfPoints(SWISS_IT_SIZES.tag) / 1.5) + 2 * (G.tagPaddingX + G.tagBorder)).toBeLessThanOrEqual(SWISS_IT_CARD_TEXT_WIDTH)
  })

  it('draws an entry’s first line as its bold lead, then its dates in grey Consolas at a right tab stop', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const first = paragraphs(xml).find((p) => p.includes('>Apprentice developer<'))!
    const runs = paragraphRuns(first)
    expect(runs.map((r) => r.text)).toEqual(['Apprentice developer', '\t', '08.2016 – 12.2020'])
    expect(runs[0].bold).toBe(true)
    expect(runs[2].raw).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
    expect(runs[2].raw).toMatch(/w:ascii="Consolas"/)
    expect(first).toMatch(new RegExp(`<w:tab w:val="right" w:pos="${pageWidth(xml) - 2 * pxToTwips(G.paddingX)}"/>`))
  })

  it('writes every run at a whole number of half-points', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    for (const [, value] of xml.matchAll(/<w:sz w:val="([^"]+)"\/>/g)) expect(Number.isInteger(Number(value)), value).toBe(true)
  })

  it('ignores the stored font family and scale (FR-4)', async () => {
    const nameSize = (xml: string) =>
      /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>Aline Berset<\/w:t>/.exec(xml)?.[1]
    const styled = await documentXml(resumeRow(), 'en', { fontScale: 1.3, fontFamily: 'Georgia, serif' })
    expect(Number(nameSize(styled))).toBe(pxToHalfPoints(SWISS_IT_SIZES.name))
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
