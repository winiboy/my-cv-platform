import { readFileSync } from 'node:fs'
import path from 'node:path'
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
import { SwissVocationalTemplate } from '@/components/dashboard/resume-templates/swiss-vocational-template'
import { SWISS_VOCATIONAL_SIZES } from '@/lib/swiss-vocational-template'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_VOCATIONAL_LINE_HEIGHT } from '@/lib/resume-line-height'
import { solidColourPng } from './docx-disc'
import { pxToHalfPoints, trackingSpacing, type DocxGeneratorSettings } from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { generateSwissVocationalDocx } from './docx-swiss-vocational'

/**
 * The swissVocational Word export against its contract, the Preview: the same
 * sections in the same fixed order, the same hidden content left out, the same
 * localized words, and the photo drawn only when there is one (FR-2, FR-5,
 * FR-6, FR-7, FR-10).
 *
 * The fixture is plain text: rich text renders empty outside a browser, so the
 * text comparisons with the Preview would not see it.
 */

const DICTS: Record<Locale, typeof en> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'swiss-vocational',
    user_id: 'u1',
    title: 'Kilnwright CFC',
    template: 'swissVocational',
    contact: {
      name: 'Robin Halvorsen',
      email: 'robin@halvorsen.test',
      phone: '+41 00 000 00 07',
      location: 'Oxbridge',
      linkedin: 'in/robin-halvorsen',
    },
    summary: 'Kilnwright of documentation toolchains.',
    experience: [
      {
        company: 'Tessellate Freight',
        position: 'Kilnwright',
        location: 'Oxbridge',
        startDate: '2021-03',
        current: true,
        achievements: ['Tessellated the export pipeline.'],
        visible: true,
      },
      {
        company: 'Hidden Employer',
        position: 'Hidden Position',
        startDate: '2018-01',
        endDate: '2020-12',
        current: false,
        achievements: ['Hidden achievement.'],
        visible: false,
      },
      {
        company: 'Quillmark',
        position: 'Apprentice',
        startDate: '2017-08',
        endDate: '2020-07',
        current: false,
        description: 'Rotated through three departments.',
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Magister', field: 'Chromatics', startDate: '2019-09', endDate: '2022-06', visible: true },
    ],
    certifications: [{ name: 'Glazing permit', issuer: 'Kiln Guild', date: '2024-05', visible: true }],
    skills: [{ category: 'Toolchain', items: ['Zanzibarscript', 'Quillwork'], visible: true }],
    languages: [
      { language: 'Esperanto', level: 'Native', visible: true },
      { language: 'Interlingua', level: 'Professional', visible: true },
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
    ...extra,
  }
}

function decode(text: string): string {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

async function documentXml(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const zip = await JSZip.loadAsync(await generateSwissVocationalDocx(row, settingsFor(row, locale, extra)))
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error('The artifact has no word/document.xml')
  return part.async('string')
}

/** The document's text, run by run, in document order. */
async function wordText(row: Row, locale: Locale, extra: Partial<DocxGeneratorSettings> = {}): Promise<string> {
  const xml = await documentXml(row, locale, extra)
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, text]) => decode(text)).join('|')
}

/** The Preview's text, node by node, in document order, rendered as the preview page renders it. */
function previewText(row: Row, locale: Locale, props: Record<string, unknown> = {}): string {
  const markup = renderToStaticMarkup(
    createElement(ResumePreview, { resume: row as unknown as Resume, locale, dict: DICTS[locale], ...props }),
  )
  return markup
    .split(/<[^>]*>/)
    .map(decode)
    .filter((node) => node !== '')
    .join('|')
}

/** The headings, in the order they appear in `text`. */
function headingOrder(text: string, locale: Locale): string[] {
  const labels = DICTS[locale].resumes.template
  const keys = ['summary', 'experience', 'education', 'training', 'skills', 'languages'] as const
  return keys
    .map((key) => ({ key, at: text.split('|').indexOf(labels[key]) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ key }) => key)
}

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

describe('swissVocational: Preview and Word draw the same document', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    const dict = DICTS[locale]

    it('draws the sections in the fixed order, under the existing headings', async () => {
      const row = resumeRow()
      const order = ['summary', 'experience', 'education', 'training', 'skills', 'languages']
      expect(headingOrder(previewText(row, locale), locale)).toEqual(order)
      expect(headingOrder(await wordText(row, locale), locale)).toEqual(order)
    })

    it('draws the same localized words: present, contact labels and language levels', async () => {
      const row = resumeRow()
      const preview = previewText(row, locale)
      const word = await wordText(row, locale)
      const words = [
        dict.resumes.template.present,
        dict.resumes.editor.location,
        dict.resumes.editor.phone,
        dict.resumes.editor.email,
        dict.resumes.editor.linkedin,
        dict.resumes.editor.levels.native,
        dict.resumes.editor.levels.professional,
      ]
      for (const text of words) {
        expect(preview, `Preview draws "${text}"`).toContain(text)
        expect(word, `Word draws "${text}"`).toContain(text)
      }
    })

    it('draws every visible item and leaves out the hidden ones', async () => {
      const row = resumeRow()
      for (const text of [previewText(row, locale), await wordText(row, locale)]) {
        for (const visible of ['Robin Halvorsen', 'Kilnwright CFC', 'Tessellate Freight', 'Quillmark', 'Rotated through three departments.', 'Halvorsen Institute', 'Glazing permit', 'Kiln Guild', 'Zanzibarscript, Quillwork', 'Interlingua']) {
          expect(text, visible).toContain(visible)
        }
        for (const hidden of ['Hidden Employer', 'Hidden Position', 'Hidden achievement.', 'Volapuk', dict.resumes.editor.levels.basic]) {
          expect(text, hidden).not.toContain(hidden)
        }
        // Projects are not part of this template, on either output.
        expect(text).not.toContain('Undrawn project')
      }
    })
  })

  it('leaves out a section the layout hides, heading included, on both outputs', async () => {
    const row = resumeRow({ layout_settings: { hiddenMainSections: ['education', 'summary'] } })
    const layout = resolveResumeLayout(row, null)
    expect(layout.hiddenMainSections).toEqual(['education', 'summary'])

    const preview = previewText(row, 'en', { hiddenMainSections: layout.hiddenMainSections })
    const word = await wordText(row, 'en')
    for (const text of [preview, word]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'training', 'skills', 'languages'])
      expect(text).not.toContain('Halvorsen Institute')
      expect(text).not.toContain('Kilnwright of documentation toolchains.')
    }
  })

  it('leaves out training, skills and languages hidden as sidebar sections, on both outputs', async () => {
    // A CV made from another template's CV can carry these hidden: they are
    // sidebar ids in the layout model although this template has no sidebar.
    const row = resumeRow({ layout_settings: { hiddenSidebarSections: ['skills', 'training'] } })
    const layout = resolveResumeLayout(row, null)
    expect(layout.hiddenSidebarSections).toEqual(['skills', 'training'])

    const preview = previewText(row, 'en', { hiddenSidebarSections: layout.hiddenSidebarSections })
    const word = await wordText(row, 'en')
    for (const text of [preview, word]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'experience', 'education', 'languages'])
      expect(text).not.toContain('Zanzibarscript')
      expect(text).not.toContain('Glazing permit')
      expect(text).toContain('Interlingua')
    }

    const both = resumeRow({ layout_settings: { hiddenSidebarSections: ['skills', 'languages'] } })
    const bothLayout = resolveResumeLayout(both, null)
    for (const text of [
      previewText(both, 'en', { hiddenSidebarSections: bothLayout.hiddenSidebarSections }),
      await wordText(both, 'en'),
    ]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'experience', 'education', 'training'])
      expect(text).not.toContain('Interlingua')
    }
  })

  it('draws no heading for a section whose items are all hidden or empty', async () => {
    const row = resumeRow({
      certifications: [{ name: 'Glazing permit', issuer: 'Kiln Guild', date: '2024-05', visible: false }],
      skills: [],
      summary: '',
    })
    for (const text of [previewText(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['experience', 'education', 'languages'])
    }
  })
})

describe('swissVocational: the photo', () => {
  it('draws the photo top right on both outputs when there is one', async () => {
    const row = resumeRow()
    const preview = renderToStaticMarkup(
      createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en, photoUrl: PHOTO }),
    )
    expect(preview).toContain(`src="${PHOTO}"`)

    const xml = await documentXml(row, 'en', { photoBase64: PHOTO })
    expect(xml.match(/<w:drawing>/g) ?? []).toHaveLength(1)
    expect(xml).toMatch(/<wp:anchor\b[^>]*\slayoutInCell="1"/)
  })

  it('draws no photo frame on either output when there is none', async () => {
    const row = resumeRow()
    const preview = renderToStaticMarkup(createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en }))
    expect(preview).not.toContain('<img')
    expect(preview).not.toContain('<button')

    const xml = await documentXml(row, 'en')
    expect(xml).not.toContain('<w:drawing>')
  })

  it('draws no frame for data that is not an image it can embed', async () => {
    const xml = await documentXml(resumeRow(), 'en', { photoBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
    expect(xml).not.toContain('<w:drawing>')
  })

  it('draws no upload box in the CV: the photo is uploaded from the Contact tab (FR-5)', () => {
    const html = renderToStaticMarkup(
      createElement(SwissVocationalTemplate, { resume: resumeRow() as unknown as Resume, locale: 'fr', dict: fr }),
    )
    expect(html).not.toContain(fr.resumes.editor.uploadPhoto)
    expect(html).not.toMatch(/<input[^>]*type="file"/)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('border-dashed')
  })

  it('draws no photo on either output when the photo is unticked, and keeps it when ticked (FR-14)', async () => {
    const hidden = resumeRow({ layout_settings: { hiddenContactFields: ['photo'] } })
    const layout = resolveResumeLayout(hidden, null)
    expect(layout.hiddenContactFields).toEqual(['photo'])

    const preview = renderToStaticMarkup(
      createElement(ResumePreview, {
        resume: hidden as unknown as Resume,
        locale: 'en',
        dict: en,
        photoUrl: PHOTO,
        hiddenContactFields: layout.hiddenContactFields,
      }),
    )
    expect(preview).not.toContain('<img')
    expect(await documentXml(hidden, 'en', { photoBase64: PHOTO, hiddenContactFields: layout.hiddenContactFields })).not.toContain('<w:drawing>')

    // Ticked again: drawn again, from the same stored photo.
    expect(await documentXml(hidden, 'en', { photoBase64: PHOTO, hiddenContactFields: [] })).toContain('<w:drawing>')
  })
})

describe('swissVocational: Word layout', () => {
  it('draws the red strip as a left page border on every page', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const borders = /<w:pgBorders\b[^>]*>([\s\S]*?)<\/w:pgBorders>/.exec(xml)
    expect(borders?.[0]).toMatch(/w:offsetFrom="page"/)
    expect(borders?.[1]).toMatch(new RegExp(`<w:left\\b[^>]*w:val="single"[^>]*w:color="${DOCX_PALETTE.swissVocational['red-700']}"`, 'i'))
  })

  it('ignores the stored font scale: every size is its own design (FR-4)', async () => {
    const row = resumeRow()
    const nameRun = (xml: string) => /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>Robin Halvorsen<\/w:t>/.exec(xml)?.[1]
    expect(Number(nameRun(await documentXml(row, 'en')))).toBe(pxToHalfPoints(SWISS_VOCATIONAL_SIZES.name))
    expect(Number(nameRun(await documentXml(row, 'en', { fontScale: 1.2 })))).toBe(pxToHalfPoints(SWISS_VOCATIONAL_SIZES.name))
  })

  it('writes Inter whatever font is stored (FR-4)', async () => {
    const row = resumeRow()
    expect(await documentXml(row, 'en')).toMatch(/w:ascii="Inter"/)
    const georgia = await documentXml(row, 'en', { fontFamily: 'Georgia, serif' })
    expect(georgia).toMatch(/w:ascii="Inter"/)
    expect(georgia).not.toMatch(/Georgia/)
  })

  it('draws the same Preview whatever font and scale are stored (FR-4)', () => {
    const plain = resumeRow()
    const styled = resumeRow({ layout_settings: { fontScale: 1.3, fontFamily: 'Georgia, serif' } })
    const layout = resolveResumeLayout(styled, null)
    const render = (row: Row, props: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(ResumePreview, { resume: row as unknown as Resume, locale: 'en', dict: en, ...props }))
    expect(render(styled, { fontScale: layout.fontScale, fontFamily: layout.fontFamily })).toBe(render(plain, {}))
  })

  it('puts the dates in a left column beside each dated entry', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(([row]) => row)
    const experienceRow = rows.find((row) => row.includes('Tessellate Freight') && !row.includes('<w:tbl>'))
    expect(experienceRow).toBeDefined()
    const cells = [...experienceRow!.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => cell)
    expect(cells).toHaveLength(2)
    expect(cells[0]).toContain(`03.2021 – ${en.resumes.template.present}`)
    expect(cells[1]).toContain('Kilnwright')
  })
})

// ---------------------------------------------------------------------------
// Per element: colour, letter spacing and line height, against the registries
// the Preview draws from (resume-palette.ts, resume-letter-spacing.ts,
// resume-line-height.ts), as the per-element suites check the five original
// templates.
// ---------------------------------------------------------------------------

const PALETTE = DOCX_PALETTE.swissVocational
const TRACKING = PREVIEW_TRACKING.swissVocational
const LH = SWISS_VOCATIONAL_LINE_HEIGHT

/** Every paragraph of the document body. */
const paragraphsOf = (xml: string) => [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([paragraph]) => paragraph)
/** Every run of a paragraph. */
const runsOf = (xml: string) => [...xml.matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map(([r]) => r)
const textOf = (run: string) => decode([...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, t]) => t).join(''))

interface DrawnRun {
  colour: string | undefined
  size: number | undefined
  spacing: number | undefined
  caps: boolean
  bold: boolean
  /** The exact line, in twips, of the paragraph the run is in. */
  line: number | undefined
}

/** The first run whose text is exactly `text`, with its paragraph's line. */
function runNamed(xml: string, text: string): DrawnRun {
  for (const paragraph of paragraphsOf(xml)) {
    const run = runsOf(paragraph).find((r) => textOf(r) === text)
    if (!run) continue
    const properties = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? ''
    const paragraphProperties = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraph)?.[1] ?? ''
    const number = (pattern: RegExp, source: string) => {
      const match = pattern.exec(source)
      return match ? Number(match[1]) : undefined
    }
    return {
      colour: /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(properties)?.[1]?.toUpperCase(),
      size: number(/<w:sz w:val="(\d+)"/, properties),
      spacing: number(/<w:spacing w:val="(-?\d+)"/, properties),
      caps: /<w:caps\/>|<w:caps w:val="(?:true|1)"\/>/.test(properties),
      bold: /<w:b\/>|<w:b w:val="(?:true|1)"\/>/.test(properties),
      line: number(/<w:spacing\b[^>]*\sw:line="(\d+)"/, paragraphProperties),
    }
  }
  throw new Error(`No run reads "${text}"`)
}

/**
 * Word's exact line for a CSS line height at a size in px: line-height x the
 * unrounded size in half-points x 10, the arithmetic `exactLineSpacing` states.
 */
const lineTwips = (lineHeight: number, px: number) => Math.round(lineHeight * (px * 1.5) * 10)

describe('swissVocational: each DOCX element as the Preview draws it', () => {
  const row = resumeRow()
  // The stored scale, which the template ignores (FR-4): each size below is its design size at both.
  const xmlAt = (fontScale: number) => documentXml(row, 'en', { fontScale })

  it.each([1, 1.3])('the name at stored font scale %s: slate-900, bold, at the name line height', async (scale) => {
    const name = runNamed(await xmlAt(scale), 'Robin Halvorsen')
    expect(name).toMatchObject({ colour: PALETTE['slate-900'], bold: true, caps: false, spacing: undefined })
    expect(name.size).toBe(pxToHalfPoints(SWISS_VOCATIONAL_SIZES.name))
    expect(name.line).toBe(lineTwips(LH.name, SWISS_VOCATIONAL_SIZES.name))
  })

  it.each([1, 1.3])('the CV title at stored font scale %s: red-700, capitals, tracking-widest, compact line', async (scale) => {
    const title = runNamed(await xmlAt(scale), 'Kilnwright CFC')
    const size = pxToHalfPoints(SWISS_VOCATIONAL_SIZES.title)
    expect(title).toMatchObject({ colour: PALETTE['red-700'], caps: true, size })
    expect(title.spacing).toBe(trackingSpacing(TRACKING.caps, size))
    expect(title.line).toBe(lineTwips(LH.compact, SWISS_VOCATIONAL_SIZES.title))
  })

  it.each([1, 1.3])('every section heading at stored font scale %s: slate-900, bold capitals, tracking-widest, compact line', async (scale) => {
    const xml = await xmlAt(scale)
    const size = pxToHalfPoints(SWISS_VOCATIONAL_SIZES.heading)
    for (const key of ['summary', 'experience', 'education', 'training', 'skills', 'languages'] as const) {
      const heading = runNamed(xml, en.resumes.template[key])
      expect(heading, key).toMatchObject({ colour: PALETTE['slate-900'], bold: true, caps: true, size })
      expect(heading.spacing, key).toBe(trackingSpacing(TRACKING.caps, size))
      expect(heading.line, key).toBe(lineTwips(LH.compact, SWISS_VOCATIONAL_SIZES.heading))
    }
  })

  it('draws the heading rule in slate-300 and the header rule in slate-800', async () => {
    const xml = await xmlAt(1)
    const headingParagraph = paragraphsOf(xml).find((p) => runsOf(p).some((r) => textOf(r) === en.resumes.template.summary))
    expect(headingParagraph).toMatch(new RegExp(`<w:bottom\\b[^>]*w:color="${PALETTE['slate-300']}"`, 'i'))
    expect(xml).toMatch(new RegExp(`<w:bottom\\b[^>]*w:color="${PALETTE['slate-800']}"`, 'i'))
  })

  it.each([1, 1.3])('dates, entries and body text at stored font scale %s, at the text line height', async (scale) => {
    const xml = await xmlAt(scale)
    const size = pxToHalfPoints(SWISS_VOCATIONAL_SIZES.body)
    const line = lineTwips(LH.text, SWISS_VOCATIONAL_SIZES.body)
    const expected: [string, string, boolean][] = [
      [`03.2021 – ${en.resumes.template.present}`, PALETTE['slate-600'], false],
      ['Kilnwright', PALETTE['slate-900'], true],
      [' · Tessellate Freight, Oxbridge', PALETTE['slate-600'], false],
      ['Kilnwright of documentation toolchains.', PALETTE['slate-700'], false],
      ['Magister', PALETTE['slate-900'], true],
      ['Halvorsen Institute · Chromatics', PALETTE['slate-600'], false],
      ['Glazing permit', PALETTE['slate-900'], true],
      ['Toolchain: ', PALETTE['slate-900'], true],
      ['Zanzibarscript, Quillwork', PALETTE['slate-700'], false],
      ['Esperanto', PALETTE['slate-900'], false],
      [en.resumes.editor.levels.native, PALETTE['slate-600'], false],
    ]
    for (const [text, colour, bold] of expected) {
      const drawn = runNamed(xml, text)
      expect(drawn, text).toMatchObject({ colour, bold, size, caps: false, spacing: undefined })
      expect(drawn.line, text).toBe(line)
    }
  })

  it('keeps the date column and the contact label column at their design widths, whatever the stored scale (FR-4)', async () => {
    const firstColumns = async (scale: number) => {
      const xml = await xmlAt(scale)
      return [...xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)].map(([, grid]) => Number(/w:w="(\d+)"/.exec(grid)?.[1]))
    }
    // pxToTwips: 15 twips a px.
    expect(await firstColumns(1)).toEqual(expect.arrayContaining([128 * 15, (80 + 12) * 15]))
    expect(await firstColumns(1.3)).toEqual(await firstColumns(1))
  })
})

describe('swissVocational: a skill row reads on one line, whatever its storage', () => {
  const skills = [
    { category: 'Bureautique', items: [], skillsHtml: '<p><strong>Word</strong>, Excel</p>', visible: true },
    { category: 'Logiciels', items: [], skillsHtml: 'Abacus, SAP', visible: true },
    { category: 'Administration', items: ['Facturation', 'Archivage'], visible: true },
    { category: 'Vide', items: [], skillsHtml: '<p><br></p>', visible: true },
  ]

  it('writes the label and its content in one paragraph, and leaves out an empty row', async () => {
    const xml = await documentXml(resumeRow({ skills }), 'fr')
    const texts = paragraphsOf(xml).map((p) => runsOf(p).map(textOf).join(''))
    expect(texts).toContain('Bureautique: Word, Excel')
    expect(texts).toContain('Logiciels: Abacus, SAP')
    expect(texts).toContain('Administration: Facturation, Archivage')
    expect(texts.join('|')).not.toContain('Vide')
  })

  it('leaves out the skills heading when every row is empty, on both outputs', async () => {
    const empty = resumeRow({ skills: [{ category: 'Vide', items: [], skillsHtml: '<p>&nbsp;</p>', visible: true }] })
    for (const text of [previewText(empty, 'en'), await wordText(empty, 'en')]) {
      expect(headingOrder(text, 'en')).toEqual(['summary', 'experience', 'education', 'training', 'languages'])
    }
  })

  it('draws the Preview row with one structure for every storage: the label, then a content block', () => {
    const html = renderToStaticMarkup(
      createElement(SwissVocationalTemplate, { resume: resumeRow({ skills }) as unknown as Resume, locale: 'fr', dict: fr }),
    )
    const labels = [
      ...html.matchAll(/<span class="shrink-0 font-bold text-slate-900">([^<]*)<\/span><div class="min-w-0 flex-1 text-slate-700">/g),
    ].map(([, label]) => label)
    expect(labels).toEqual(['Bureautique:\u00A0', 'Logiciels:\u00A0', 'Administration:\u00A0'])
  })
})

describe('swissVocational: an emptied summary draws no heading (FR-2)', () => {
  it.each(['<p></p>', '<p><br></p>', '   '])('%j', async (summary) => {
    const row = resumeRow({ summary })
    for (const text of [previewText(row, 'en'), await wordText(row, 'en')]) {
      expect(headingOrder(text, 'en')[0]).toBe('experience')
    }
  })
})

describe('swissVocational: words in side-by-side columns stay separate in the text', () => {
  /**
   * The text a PDF's text layer carries for the Preview: its characters in
   * order, with nothing added between boxes, which is how two columns on one
   * line come out of a printed page. Whitespace, the no-break space included,
   * is normalised to one space.
   */
  const textLayer = (markup: string) => decode(markup.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ')

  it('separates label | value, pair | pair, date | entry, skill label | skills and language | level on the Preview', () => {
    const markup = renderToStaticMarkup(
      createElement(ResumePreview, { resume: resumeRow() as unknown as Resume, locale: 'en', dict: en }),
    )
    const text = textLayer(markup)
    for (const separated of [
      `${en.resumes.editor.location} Oxbridge`,
      `Oxbridge ${en.resumes.editor.phone}`,
      `${en.resumes.editor.email} robin@halvorsen.test`,
      `03.2021 – ${en.resumes.template.present} Kilnwright`,
      '05.2024 Glazing permit',
      'Toolchain: Zanzibarscript',
      `Esperanto ${en.resumes.editor.levels.native}`,
    ]) {
      expect(text, separated).toContain(separated)
    }
  })

  it('keeps each column in its own paragraph or run in Word', async () => {
    const xml = await documentXml(resumeRow(), 'en')
    const texts = paragraphsOf(xml).map((p) => runsOf(p).map(textOf).join(''))
    for (const own of [en.resumes.editor.location, 'Oxbridge', `03.2021 – ${en.resumes.template.present}`, 'Esperanto', en.resumes.editor.levels.native]) {
      expect(texts, own).toContain(own)
    }
    expect(texts).toContain('Toolchain: Zanzibarscript, Quillwork')
  })
})

describe('swissVocational: the column separator is written in the same text node as its text', () => {
  /**
   * Measured on the server's PDF: a no-break space written as its own JSX child
   * becomes its own text node on the client, Chromium leaves it out of the PDF
   * at the end of a line, and the columns' words run together again. A server
   * render cannot see that (it merges adjacent text), so the source is held to
   * the one form that works: the separator interpolated into its text's string.
   */
  it('uses COLUMN_BREAK only inside a template string, never as a JSX child of its own', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/components/dashboard/resume-templates/swiss-vocational-template.tsx'), 'utf8')
    const uses = [...source.matchAll(/COLUMN_BREAK/g)].length
    const interpolated = [...source.matchAll(/\$\{COLUMN_BREAK\}`/g)].length
    // One declaration, and every other use closes a template string.
    expect(uses - 1).toBe(interpolated)
    expect(interpolated).toBe(5)
    expect(source).not.toMatch(/\{COLUMN_BREAK\}(?!`)/)
  })
})
