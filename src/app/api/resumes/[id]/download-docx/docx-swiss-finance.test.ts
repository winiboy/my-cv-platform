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
import { SwissFinanceTemplate } from '@/components/dashboard/resume-templates/swiss-finance-template'
import {
  SWISS_FINANCE_GEOMETRY,
  SWISS_FINANCE_LABEL_MAX_PX,
  SWISS_FINANCE_MIN_VALUE_PX,
  SWISS_FINANCE_SIZES,
  SWISS_FINANCE_TEXT_WIDTH,
  swissFinanceLabelColumnPx,
} from '@/lib/swiss-finance-template'
import { georgiaTextWidthPx } from '@/lib/georgia-advance-widths'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, pxToTwips, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { SWISS_FINANCE_WORD_FONT, WORD_LABEL_SLACK_PX, framePhoto, generateSwissFinanceDocx } from './docx-swiss-finance'

/**
 * The swissFinance Word export against its contract, the Preview: the same
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
const PALETTE = DOCX_PALETTE.swissFinance

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-finance',
    user_id: 'u1',
    title: 'Credit analyst',
    template: 'swissFinance',
    contact: {
      name: 'Robin Halvorsen',
      email: 'robin@halvorsen.test',
      phone: '+41 00 000 00 07',
      location: 'Oxbridge',
      linkedin: 'in/robin-halvorsen',
      github: 'gh/halvorsen',
      website: 'halvorsen.test',
    },
    summary: 'Analyst in commercial banking.',
    experience: [
      {
        company: 'Tessellate Bank',
        position: 'Senior credit analyst',
        location: 'Oxbridge',
        startDate: '2019-01',
        current: true,
        achievements: ['Rated the SME portfolio.', 'Trained two interns.'],
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
        company: 'Saltmarsh Savings',
        position: 'Client adviser',
        startDate: '2014-06',
        endDate: '2018-12',
        current: false,
        description: 'Advised the business clients.',
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Finance diploma', field: 'Controlling', startDate: '2010-09', endDate: '2014-06', visible: true },
      { school: 'Hidden School', degree: 'Hidden degree', startDate: '2008-09', endDate: '2010-06', visible: false },
    ],
    certifications: [
      { name: 'Wealth advisor', issuer: 'Guild of Advisers', date: '2021-05', visible: true },
      { name: 'Risk licence', issuer: '', date: '2016-03', visible: true },
      { name: 'Hidden licence', issuer: 'Nobody', date: '2020-01', visible: false },
    ],
    skills: [
      { category: 'Analysis', items: [], skillsHtml: 'Balance sheets, Cash flow, Ratings', visible: true },
      { category: 'Tools', items: ['Avaloq'], visible: true },
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
  const zip = await JSZip.loadAsync(await generateSwissFinanceDocx(row, settingsFor(row, locale, extra)))
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

type HeadingKey = 'summary' | 'experience' | 'education' | 'training' | 'table' | 'skillsAlone' | 'languagesAlone'

/** The headings each output draws, in the order they appear in `text`. */
function headingOrder(text: string, locale: Locale): HeadingKey[] {
  const t = DICTS[locale].resumes.template
  const labels: Record<HeadingKey, string> = {
    summary: t.summary,
    experience: t.experience,
    education: t.education,
    training: t.training,
    table: `${t.skills} & ${t.languages}`,
    skillsAlone: t.skills,
    // The languages row's label is the languages label too; only a node that
    // opens the table, the one before the first row, is its heading.
    languagesAlone: `${t.languages}|${t.languages}`,
  }
  return (Object.entries(labels) as [HeadingKey, string][])
    .map(([key, label]) => ({ key, at: `|${text}|`.indexOf(`|${label}|`) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const ALL_SECTIONS: HeadingKey[] = ['summary', 'experience', 'education', 'training', 'table']

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

/** The size, in px, Word draws the body at: a whole half-point, never smaller than the Preview's. */
const WORD_BODY_PX = Math.max(SWISS_FINANCE_SIZES.body, pxToHalfPoints(SWISS_FINANCE_SIZES.body) / 1.5)

/** The Word label cell for `labels`: their column by the Preview's rule, and the gap the cell's margin carries. */
const labelCellTwips = (labels: readonly string[]) =>
  pxToTwips(Math.min(SWISS_FINANCE_LABEL_MAX_PX, swissFinanceLabelColumnPx(labels, WORD_BODY_PX) + WORD_LABEL_SLACK_PX)) +
  pxToTwips(SWISS_FINANCE_GEOMETRY.labelGap)

/** The Preview's bullets are list markers, not text; Word writes them as a glyph. */
const withoutBullets = (text: string) =>
  text
    .split('|')
    .filter((node) => node !== '•')
    .join('|')

describe('swissFinance: Preview and Word draw the same document', () => {
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
      const languages = `Esperanto (${dict.resumes.editor.levels.native}), Interlingua (${dict.resumes.editor.levels.fluent})`
      for (const text of [dict.resumes.template.present, `${dict.resumes.template.languages}|${languages}`]) {
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
          'Credit analyst',
          'Oxbridge · +41 00 000 00 07 · robin@halvorsen.test · in/robin-halvorsen · gh/halvorsen · halvorsen.test',
          'Analyst in commercial banking.',
          `Senior credit analyst|, Tessellate Bank, Oxbridge|01.2019 – ${dict.resumes.template.present}`,
          'Rated the SME portfolio.',
          'Trained two interns.',
          'Client adviser|, Saltmarsh Savings|06.2014 – 12.2018',
          'Advised the business clients.',
          'Finance diploma|09.2010 – 06.2014|Halvorsen Institute, Controlling',
          'Wealth advisor|, Guild of Advisers|05.2021',
          'Risk licence|03.2016',
          'Analysis|Balance sheets, Cash flow, Ratings',
          'Tools|Avaloq',
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

  it('leaves out main sections the layout hides, heading included, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['education', 'summary'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'training', 'table'])
      expect(text).not.toContain('Halvorsen Institute')
      expect(text).not.toContain('Analyst in commercial banking.')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('leaves out certifications and skills hidden as sidebar sections, titling the table with the languages alone', async () => {
    const row = resumeRow({ layout_settings: { hiddenSidebarSections: ['skills', 'training'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'experience', 'education', 'languagesAlone'])
      expect(text).not.toContain('Balance sheets')
      expect(text).not.toContain('Wealth advisor')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('leaves out the languages row when the languages are hidden, titling the table with the skills alone', async () => {
    const row = resumeRow({ layout_settings: { hiddenSidebarSections: ['languages'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'experience', 'education', 'training', 'skillsAlone'])
      expect(text).not.toContain('Esperanto')
      expect(text.split('|')).not.toContain(en.resumes.template.languages)
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('draws no table and no heading for it when there are no skills and no languages', async () => {
    const row = resumeRow({ skills: [{ category: 'Blank', items: ['  '], visible: true }], languages: [{ language: ' ', level: 'Native', visible: true }] })
    const xml = await documentXml(row, 'en')
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'experience', 'education', 'training'])
      expect(text).not.toContain('Blank')
    }
    // Only the dated entries are tables: two experiences, one education, two certificates.
    expect(xml.split('<w:tbl>').length - 1).toBe(5)
  })

  it('draws no heading for a section whose items are all hidden or empty', async () => {
    const row = resumeRow({
      certifications: [
        { name: 'Wealth advisor', issuer: 'Guild of Advisers', date: '2021-05', visible: false },
        { name: '', issuer: '', date: '', visible: true },
      ],
      experience: [{ company: 'Hidden Employer', position: 'Hidden Position', startDate: '2016-01', visible: false }],
      summary: '<p></p>',
    })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['education', 'table'])
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('leads with the school or the employer when the degree or position is empty, with no dangling comma, on both outputs', async () => {
    const row = resumeRow({
      education: [{ school: 'Halvorsen Institute', degree: '', startDate: '2010-09', endDate: '2014-06', visible: true }],
      experience: [{ company: 'Tessellate Bank', position: '', location: 'Oxbridge', startDate: '2019-01', current: true, visible: true }],
      certifications: [{ name: '', issuer: 'Guild of Advisers', date: '2021-05', visible: true }],
    })
    const preview = previewOf(row, 'en')
    expect(await wordText(row, 'en')).toBe(preview)
    expect(preview).toContain('|Halvorsen Institute|09.2010 – 06.2014|')
    expect(preview).toContain(`|Tessellate Bank|, Oxbridge|01.2019 – ${en.resumes.template.present}|`)
    expect(preview).toContain('|Guild of Advisers|05.2021|')
    expect(preview.split('Halvorsen Institute').length - 1).toBe(1)
    expect(preview.split('|').filter((node) => node.startsWith(',') && node.trim() === ',')).toEqual([])
  })

  it('leaves out each unticked contact detail on both outputs, and keeps the ticked ones (FR-14)', async () => {
    const row = resumeRow({ layout_settings: { hiddenContactFields: ['email', 'github', 'title'] } })
    for (const text of [previewOf(row, 'en'), await wordText(row, 'en')]) {
      expect(text).not.toContain('robin@halvorsen.test')
      expect(text).not.toContain('gh/halvorsen')
      expect(text).not.toContain('Credit analyst|')
      expect(text).toContain('Oxbridge · +41 00 000 00 07 · in/robin-halvorsen · halvorsen.test')
      expect(text).toContain('Robin Halvorsen')
    }
    expect(withoutBullets(await wordText(row, 'en'))).toBe(previewOf(row, 'en'))
  })

  it('keeps the same text with a formatted skill, a summary list and a skill category with no name', async () => {
    const row = resumeRow({
      skills: [
        { category: '', items: ['Avaloq'], visible: true },
        { category: 'Analysis', items: [], skillsHtml: 'Balance sheets\nRatings', visible: true },
      ],
    })
    expect(withoutBullets(await wordText(row, 'fr'))).toBe(previewOf(row, 'fr'))
  })
})

describe('swissFinance: the photo (FR-5, FR-14)', () => {
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

  it('draws the photo rectangular, in its thin border and fill, after the name block, on both outputs', async () => {
    const preview = previewMarkup(resumeRow(), PHOTO)
    expect(preview).toContain(`src="${PHOTO}"`)
    expect(preview).toContain('class="swiss-finance-photo shrink-0 overflow-hidden"')

    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    const drawing = photoDrawing(xml)
    expect(drawing).toBeDefined()
    expect(drawing).toContain('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>')
    expect(drawing).not.toContain('ellipse')
    expect(drawing).toContain(`<a:solidFill><a:srgbClr val="${PALETTE.photoFill}"/></a:solidFill>`)
    expect(drawing).toContain(`<a:ln w="${SWISS_FINANCE_GEOMETRY.photoBorder * 9525}"><a:solidFill><a:srgbClr val="${PALETTE.rule}"/>`)
    expect(drawing).toContain(
      `<wp:extent cx="${SWISS_FINANCE_GEOMETRY.photoWidth * 9525}" cy="${SWISS_FINANCE_GEOMETRY.photoHeight * 9525}"/>`,
    )
    // Floating in its own cell, which the photo's line reserves room for: never clipped to a text line.
    expect(drawing).toMatch(/<wp:anchor\b[^>]*layoutInCell="1"/)
    expect(xml.indexOf(drawing!)).toBeGreaterThan(xml.indexOf('>Robin Halvorsen<'))
    const holder = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p).find((p) => p.includes('<w:drawing>'))
    expect(holder).toMatch(new RegExp(`<w:spacing [^>]*w:line="${pxToTwips(SWISS_FINANCE_GEOMETRY.photoHeight)}" w:lineRule="exact"`))
  })

  it('embeds exactly one image with a photo and none without', async () => {
    const media = async (extra: Partial<DocxGeneratorSettings>) => {
      const zip = await JSZip.loadAsync(await generateSwissFinanceDocx(resumeRow(), settingsFor(resumeRow(), 'en', extra)))
      return Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    }
    expect(await media({ photoBase64: PHOTO })).toHaveLength(1)
    expect(await media({})).toHaveLength(0)
  })

  it('draws no photo frame on either output when there is none', async () => {
    const preview = previewMarkup(resumeRow())
    expect(preview).not.toContain('<img')
    expect(preview).not.toContain('swiss-finance-photo')
    const xml = await documentXml(resumeRow(), 'en')
    expect(photoDrawing(xml)).toBeUndefined()
    // No photo: the name block is not put in a table at all.
    expect(xml.indexOf('>Robin Halvorsen<')).toBeLessThan(xml.indexOf('<w:tbl>'))
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
    const html = renderToStaticMarkup(createElement(SwissFinanceTemplate, { resume: resumeRow() as unknown as Resume, locale: 'fr', dict: fr }))
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('border-dashed')
  })

  it('refuses to ship an unframed photo when the drawing is not in the shape docx writes', () => {
    expect(() => framePhoto('<w:document/>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no rectangular picture geometry/)
    expect(() => framePhoto('<a:prstGeom prst="rect"/>', null, 'FFFFFF', 'FFFFFF')).toThrow(/no effect extent/)
  })
})

describe('swissFinance: Word layout (FR-10)', () => {
  const paragraphs = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([p]) => p)

  /** Each paragraph's runs, in order, as their text and whether they are bold. */
  const paragraphRuns = (paragraph: string) =>
    [...paragraph.matchAll(/<w:r>((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/g)].map(([, inner]) => ({
      text: [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map(([tag, t]) => (tag === '<w:tab/>' ? '\t' : decode(t))).join(''),
      bold: /<w:b\/>/.test(inner),
      italic: /<w:i\/>/.test(inner),
      raw: inner,
    }))

  /** The innermost table holding `needle`. */
  const tableHolding = (xml: string, needle: string) =>
    [...xml.matchAll(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g)].map(([table]) => table).find((table) => table.includes(needle))

  /** A paragraph's bottom border, as its attributes. */
  const bottomBorder = (paragraph: string) => {
    const tag = /<w:pBdr>[\s\S]*?(<w:bottom\b[^>]*\/>)[\s\S]*?<\/w:pBdr>/.exec(paragraph)?.[1]
    if (!tag) return null
    return Object.fromEntries([...tag.matchAll(/w:(\w+)="([^"]*)"/g)].map(([, name, value]) => [name, value]))
  }

  it('writes every run in Georgia, whatever font and scale are stored (FR-4)', async () => {
    const styled = await documentXml(resumeRow(), 'en', { fontScale: 1.3, fontFamily: 'Inter, sans-serif' })
    expect(SWISS_FINANCE_WORD_FONT).toBe('Georgia')
    expect(styled).toMatch(/w:ascii="Georgia"/)
    expect(styled).not.toMatch(/w:ascii="(?!Georgia")/)
    const nameSize = /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>Robin Halvorsen<\/w:t>/.exec(styled)?.[1]
    expect(Number(nameSize)).toBe(pxToHalfPoints(SWISS_FINANCE_SIZES.name))
  })

  it('draws the same Preview whatever font and scale are stored (FR-4)', () => {
    const plain = resumeRow()
    const styled = resumeRow({ layout_settings: { fontScale: 1.3, fontFamily: 'Inter, sans-serif' } })
    const layout = resolveResumeLayout(styled, null)
    const render = (row: Row, props: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en, ...props }))
    expect(render(styled, { fontScale: layout.fontScale, fontFamily: layout.fontFamily })).toBe(render(plain, {}))
  })

  it('draws the name in spaced capitals, the title in green italics, the contact line in grey', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const name = paragraphRuns(paragraphs(xml).find((p) => p.includes('>Robin Halvorsen<'))!)[0]
    expect(name.raw).toContain('<w:caps/>')
    expect(name.raw).toContain(`<w:color w:val="${PALETTE.ink}"/>`)
    expect(name.raw).toContain(`<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissFinance.name, pxToHalfPoints(SWISS_FINANCE_SIZES.name))}"/>`)
    expect(name.bold).toBe(false)
    const title = paragraphRuns(paragraphs(xml).find((p) => p.includes('>Credit analyst<'))!)[0]
    expect(title.italic).toBe(true)
    expect(title.raw).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
    expect(paragraphs(xml).find((p) => p.includes('robin@halvorsen.test'))).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
  })

  it('draws the double green rule under the header, as a paragraph border drawing no text', async () => {
    for (const extra of [{}, { photoBase64: PHOTO }]) {
      const xml = await documentXml(resumeRow(), 'en', extra)
      const rules = paragraphs(xml).filter((p) => bottomBorder(p)?.val === 'double')
      expect(rules).toHaveLength(1)
      expect(bottomBorder(rules[0])).toMatchObject({ color: PALETTE.accent, sz: '6' })
      expect(paragraphRuns(rules[0])).toEqual([])
      // Under the header and above the first heading.
      expect(xml.indexOf(rules[0])).toBeGreaterThan(xml.indexOf('robin@halvorsen.test'))
      expect(xml.indexOf(rules[0])).toBeLessThan(xml.indexOf(`>${en.resumes.template.summary}<`))
    }
  })

  it('draws no header rule when there is no header', async () => {
    const xml = await documentXml(resumeRow({ contact: {}, title: '' }), 'en')
    expect(paragraphs(xml).filter((p) => bottomBorder(p)?.val === 'double')).toEqual([])
  })

  it('draws every heading in green spaced capitals over a thin grey rule', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const t = en.resumes.template
    for (const label of [t.summary, t.experience, t.education, t.training, `${t.skills} & ${t.languages}`]) {
      const heading = paragraphs(xml).find((p) => p.includes(`>${label.replace(/&/g, '&amp;')}<`))
      expect(heading, label).toBeDefined()
      const [text] = paragraphRuns(heading!)
      expect(text.raw).toContain('<w:caps/>')
      expect(text.raw).toContain(`<w:color w:val="${PALETTE.accent}"/>`)
      expect(text.raw).toContain(
        `<w:spacing w:val="${trackingSpacing(PREVIEW_TRACKING.swissFinance.heading, pxToHalfPoints(SWISS_FINANCE_SIZES.heading))}"/>`,
      )
      expect(bottomBorder(heading!)).toMatchObject({
        val: 'single',
        color: PALETTE.rule,
        sz: String(Math.round(SWISS_FINANCE_GEOMETRY.headingRule * 0.75 * 8)),
        space: String(SWISS_FINANCE_GEOMETRY.headingRuleGap * 0.75),
      })
      expect(heading).toContain('<w:keepNext/>')
    }
  })

  it('draws a dated entry’s first line as a table: bold lead and the rest left, the dates right in grey italics', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const entry = tableHolding(xml, '>Senior credit analyst<')
    expect(entry).toBeDefined()
    const cells = [...entry!.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    expect(cells).toHaveLength(2)
    const [line, dates] = cells
    const runs = paragraphRuns(line)
    expect(runs.map((r) => r.text)).toEqual(['Senior credit analyst', ', Tessellate Bank, Oxbridge'])
    expect(runs.map((r) => r.bold)).toEqual([true, false])
    expect(runs[0].raw).toContain(`<w:color w:val="${PALETTE.ink}"/>`)
    expect(runs[1].raw).toContain(`<w:color w:val="${PALETTE.body}"/>`)
    const [date] = paragraphRuns(dates)
    expect(date.text).toBe(`01.2019 – ${en.resumes.template.present}`)
    expect(date.italic).toBe(true)
    expect(date.raw).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
    expect(dates).toContain('<w:jc w:val="right"/>')
    expect(entry).toContain(`<w:gridCol w:w="${pxToTwips(SWISS_FINANCE_GEOMETRY.dateColumn)}"/>`)
    // The bullets follow the table at the full width, not inside its cell.
    expect(entry).not.toContain('Rated the SME portfolio.')
  })

  it('draws the school under a degree on its own line in grey', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const school = paragraphRuns(paragraphs(xml).find((p) => p.includes('>Halvorsen Institute, Controlling<'))!)
    expect(school).toHaveLength(1)
    expect(school[0].raw).toContain(`<w:color w:val="${PALETTE.muted}"/>`)
    expect(tableHolding(xml, '>Halvorsen Institute, Controlling<')).toBeUndefined()
  })

  it('draws skills and languages as one two-column table: bold labels, then the values', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const table = tableHolding(xml, '>Analysis<')
    expect(table).toBeDefined()
    expect(table).toContain(`<w:gridCol w:w="${labelCellTwips(['Analysis', 'Tools', en.resumes.template.languages])}"/>`)
    const rows = [...table!.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(([tr]) =>
      [...tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => paragraphRuns(cell)),
    )
    expect(rows.map((cells) => cells.map((runs) => runs.map((r) => r.text).join('')))).toEqual([
      ['Analysis', 'Balance sheets, Cash flow, Ratings'],
      ['Tools', 'Avaloq'],
      [en.resumes.template.languages, `Esperanto (${en.resumes.editor.levels.native}), Interlingua (${en.resumes.editor.levels.fluent})`],
    ])
    for (const [label] of rows) expect(label[0].bold).toBe(true)
    for (const [, value] of rows) expect(value[0].bold).toBe(false)
    expect(table).not.toMatch(/<w:(?:top|left|bottom|right|insideH|insideV) w:val="(?!none)/)
  })

  it('draws formatted skills as rich text in the value cell, keeping a plain-text line break', async () => {
    const xml = await documentXml(resumeRow({ skills: [{ category: 'Analysis', items: [], skillsHtml: 'Balance sheets\nRatings', visible: true }] }), 'en')
    const holder = paragraphs(xml).find((p) => p.includes('>Balance sheets<'))
    expect(holder).toMatch(/Balance sheets<\/w:t>[\s\S]*<w:br\/>[\s\S]*Ratings/)
  })

  it('keeps a rich-text paragraph beside a list, in order and with its bold run', async () => {
    const skillsHtml = '<p>Analyse <strong>financière</strong></p><ul><li>Notation</li></ul>'
    const xml = await documentXml(resumeRow({ skills: [{ category: 'Pratique', items: [], skillsHtml, visible: true }] }), 'fr')
    const all = paragraphs(xml)
    const first = all.findIndex((p) => p.includes('>Analyse <') || p.includes('>Analyse<'))
    expect(first, 'the paragraph before the list is drawn').toBeGreaterThanOrEqual(0)
    const runs = paragraphRuns(all[first])
    expect(runs.map((r) => r.text).join('')).toBe('Analyse financière')
    expect(runs.find((r) => r.text.includes('financière'))?.bold).toBe(true)
    expect(paragraphRuns(all[first + 1]).map((r) => r.text).join('')).toBe('•\tNotation')
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

  it('gives every page the PDF’s top and foot margins, the Preview’s padding, so both break pages alike (swiss-templates-only-page-fidelity US-002)', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const g = SWISS_FINANCE_GEOMETRY
    expect(g.pageTop).toBe(g.paddingTop)
    expect(g.pageBottom).toBe(g.paddingBottom)
    expect(xml).toMatch(
      new RegExp(
        `<w:pgMar w:top="${pxToTwips(g.pageTop)}" w:right="${pxToTwips(g.paddingX)}" w:bottom="${pxToTwips(g.pageBottom)}" w:left="${pxToTwips(g.paddingX)}" w:header="0" w:footer="0"`,
      ),
    )
    expect(xml.split('<w:pgMar').length - 1).toBe(1)
  })

  it('writes run positions and border distances only in whole units Word keeps', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: PHOTO })
    for (const [, value] of xml.matchAll(/<w:position w:val="([^"]+)"/g)) expect(value).toMatch(/^-?\d+(?:\.5)?pt$|^-?\d+$/)
    for (const [, value] of xml.matchAll(/w:space="([^"]+)"/g)) expect(value).toMatch(/^\d+$/)
  })
})

/**
 * The owner's rule: a word is never cut, whatever the language. Word splits a
 * word wider than its cell, so every cell holding user text is at least as
 * wide as the widest word it can hold — measured with Georgia's own advance
 * widths at the size Word draws.
 */
describe('swissFinance: Word never splits a word in a cell', () => {
  /** The label cell's width, in CSS px, less the gap its right margin carries, for a table holding `labels`. */
  async function labelColumnPx(labels: readonly string[]): Promise<number> {
    const row = resumeRow({ skills: labels.map((category) => ({ category, items: ['x'], visible: true })), languages: [] })
    const xml = await documentXml(row, 'de')
    const needle = `>${labels[0].replace(/&/g, '&amp;')}<`
    const table = [...xml.matchAll(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g)].map(([t]) => t).find((t) => t.includes(needle))
    const twips = Number(/<w:gridCol w:w="(\d+)"\/>/.exec(table ?? '')?.[1])
    expect(twips, 'the label column').toBeGreaterThan(0)
    return (twips - pxToTwips(SWISS_FINANCE_GEOMETRY.labelGap)) / 15
  }

  const bold = (text: string) => georgiaTextWidthPx(text, 'bold', WORD_BODY_PX)
  const cap = SWISS_FINANCE_GEOMETRY.labelMaxFraction * SWISS_FINANCE_TEXT_WIDTH

  it.each([
    ['de', ['HR Fachkenntnisse', 'Kommunikationsfähigkeiten', 'Tools & Systeme', 'Soft Skills']],
    ['fr', ['Compétences linguistiques', 'Gestion de projet', 'Outils']],
    ['it', ['Competenze informatiche', 'Lingue']],
    ['en', ['Stakeholder management', 'Tools']],
  ])('%s: the label column holds every label on one line when it fits under the cap', async (_locale, labels) => {
    const column = await labelColumnPx(labels)
    for (const label of labels) {
      expect(bold(label), `${label} fits under the cap`).toBeLessThanOrEqual(cap)
      expect(column, `"${label}" is on one line`).toBeGreaterThanOrEqual(bold(label))
    }
    // As wide as the widest label, and no wider than that by more than the slack and the rounding.
    expect(column).toBeLessThan(Math.max(...labels.map(bold)) + WORD_LABEL_SLACK_PX + 2)
  })

  it('wraps a label wider than the cap only at its spaces: the column stops at the cap but holds its widest word', async () => {
    const label = 'Kenntnisse der Rechnungslegung nach internationalen Standards'
    const column = await labelColumnPx([label])
    expect(bold(label)).toBeGreaterThan(cap)
    expect(column).toBeLessThanOrEqual(Math.ceil(cap) + WORD_LABEL_SLACK_PX)
    for (const word of label.split(' ')) expect(column, word).toBeGreaterThanOrEqual(bold(word))
  })

  it('grows past the cap for one word wider than it, rather than splitting the word', async () => {
    const word = 'Finanzdienstleistungsaufsichtskompetenz'
    expect(bold(word)).toBeGreaterThan(cap)
    expect(await labelColumnPx([word, 'Tools'])).toBeGreaterThanOrEqual(bold(word))
  })

  it('gives every label its width plus the slack for twip rounding', async () => {
    expect(await labelColumnPx(['Kommunikationsfähigkeiten'])).toBeGreaterThanOrEqual(bold('Kommunikationsfähigkeiten') + WORD_LABEL_SLACK_PX - 1 / 15)
  })

  it('stops at the hard maximum for a word wider than it, keeping every table width positive and the values readable', async () => {
    const label = 'SAP/Avaloq/Bloomberg/Finnova/Abacus/Excel/PowerBI/Tableau/Python/SQL/VBA/Murex/Calypso/Summit/Kondor/Reuters/FactSet/Morningstar'
    expect(label.length).toBeGreaterThanOrEqual(120)
    expect(bold(label)).toBeGreaterThan(SWISS_FINANCE_LABEL_MAX_PX)
    expect(await labelColumnPx([label])).toBe(SWISS_FINANCE_LABEL_MAX_PX)

    const xml = await documentXml(resumeRow({ skills: [{ category: label, items: ['Avaloq'], visible: true }] }), 'de')
    for (const [, w] of xml.matchAll(/<w:(?:gridCol|tcW|tblW) w:w="(-?\d+)"/g)) expect(Number(w), 'a table width').toBeGreaterThan(0)
    const table = [...xml.matchAll(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g)].map(([t]) => t).find((t) => t.includes('>Avaloq<'))
    const [labelCol, valueCol] = [...(table ?? '').matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(([, w]) => Number(w))
    expect(labelCol).toBe(pxToTwips(SWISS_FINANCE_LABEL_MAX_PX) + pxToTwips(SWISS_FINANCE_GEOMETRY.labelGap))
    expect(valueCol / 15).toBeGreaterThanOrEqual(SWISS_FINANCE_MIN_VALUE_PX - 1)
    // The label is kept whole as text: Word breaks it in its cell, as the Preview does.
    expect(xml).toContain(`>${label}<`)
  })

  it('holds the widest date of every locale on one line in the date column', () => {
    const italic = (text: string) => georgiaTextWidthPx(text, 'italic', WORD_BODY_PX)
    const digit = [...'0123456789'].reduce((a, b) => (italic(b) > italic(a) ? b : a))
    const month = `${digit}${digit}.${digit}${digit}${digit}${digit}`
    const room = SWISS_FINANCE_GEOMETRY.dateColumn - SWISS_FINANCE_GEOMETRY.dateGap
    for (const dict of Object.values(DICTS)) {
      for (const dates of [`${month} – ${month}`, `${month} – ${dict.resumes.template.present}`]) {
        expect(italic(dates), dates).toBeLessThanOrEqual(room)
      }
    }
  })
})
