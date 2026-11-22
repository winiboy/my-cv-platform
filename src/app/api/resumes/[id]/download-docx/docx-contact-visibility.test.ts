import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import type { Resume } from '@/types/database'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { contactLabel } from '@/lib/resume-template-strings'
import type { ContactFieldId } from '@/lib/contact-visibility'
import { ResumePreview } from '@/components/dashboard/resume-preview'
import { ModernTemplate } from '@/components/dashboard/resume-templates/modern-template'
import { solidColourPng } from './docx-disc'
import type { DocxGeneratorSettings } from './docx-helpers'
import { SUPPORTED_TEMPLATES, type DocxTemplateId } from './docx-templates'
import { generateProfessionalDocx } from './docx-professional'
import { generateModernDocx } from './docx-modern'
import { generateClassicDocx } from './docx-classic'
import { generateMinimalDocx } from './docx-minimal'
import { generateCreativeDocx } from './docx-creative'
import { generateSwissVocationalDocx } from './docx-swiss-vocational'
import { generateSwissCommerceDocx } from './docx-swiss-commerce'
import { generateSwissTradesDocx } from './docx-swiss-trades'
import { generateSwissHealthDocx } from './docx-swiss-health'

/**
 * swiss-cv-templates FR-14: an unticked contact detail, CV title or photo is
 * drawn by neither the Preview (and so the PDF, which prints it) nor the Word
 * export of any template, its label and separator included; a ticked one is
 * drawn. Both outputs read the one stored `hiddenContactFields`, resolved
 * exactly as the route resolves it.
 *
 * The fixture is plain text: rich text renders empty outside a browser.
 */

const GENERATORS: Record<DocxTemplateId, (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>> = {
  professional: generateProfessionalDocx,
  modern: generateModernDocx,
  classic: generateClassicDocx,
  minimal: generateMinimalDocx,
  creative: generateCreativeDocx,
  swissVocational: generateSwissVocationalDocx,
  swissCommerce: generateSwissCommerceDocx,
  swissTrades: generateSwissTradesDocx,
  swissHealth: generateSwissHealthDocx,
}

const PHOTO = `data:image/png;base64,${solidColourPng('336699').toString('base64')}`

const EMAIL = 'robin@halvorsen.test'
const PHONE = '+41 00 000 00 07'
const TITLE = 'Kilnwright Lead'

type Row = Record<string, unknown> & { template: string; layout_settings: unknown; custom_sections: unknown }

function resumeRow(template: string, hidden?: readonly ContactFieldId[]): Row {
  return {
    id: 'contact-visibility',
    user_id: 'u1',
    title: TITLE,
    template,
    contact: {
      name: 'Robin Halvorsen',
      email: EMAIL,
      phone: PHONE,
      location: 'Oxbridge',
      linkedin: 'in/robin-halvorsen',
      github: 'gh/robin-halvorsen',
      website: 'halvorsen.test',
    },
    summary: 'Kilnwright of documentation toolchains.',
    experience: [
      { company: 'Tessellate Freight', position: 'Kilnwright', startDate: '2021-03', current: true, description: 'Fired kilns.', visible: true },
    ],
    education: [{ school: 'Halvorsen Institute', degree: 'Magister', field: 'Chromatics', startDate: '2019-09', endDate: '2022-06', visible: true }],
    certifications: [],
    skills: [{ category: 'Toolchain', items: ['Quillwork'], visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    projects: [],
    custom_sections: {},
    layout_settings: hidden === undefined ? null : { hiddenContactFields: [...hidden] },
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  }
}

/** The generator settings as `route.ts` builds them from the stored row. */
function settingsFor(row: Row, photoBase64?: string): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  return {
    fontFamily: layout.fontFamily,
    fontScale: layout.fontScale,
    titleFontSize: layout.titleFontSize,
    contactFontSize: layout.contactFontSize,
    sectionTitleFontSize: layout.sectionTitleFontSize,
    sectionDescFontSize: layout.sectionDescFontSize,
    locale: 'en',
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
    hiddenContactFields: layout.hiddenContactFields,
    photoBase64,
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
    // Word keeps some details whole with no-break spaces.
    .replace(/ /g, ' ')
}

async function documentXml(row: Row, photoBase64?: string): Promise<string> {
  const generate = GENERATORS[row.template as DocxTemplateId]
  const zip = await JSZip.loadAsync(await generate(row, settingsFor(row, photoBase64)))
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error('The artifact has no word/document.xml')
  return part.async('string')
}

/** Each Word paragraph's text, in document order. */
async function wordParagraphs(row: Row): Promise<string[]> {
  const xml = await documentXml(row)
  return [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([paragraph]) =>
    [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, text]) => decode(text)).join(''),
  )
}

function previewMarkup(row: Row, photoUrl?: string): string {
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

/** The Preview's text nodes, in document order. */
function previewNodes(row: Row): string[] {
  return previewMarkup(row)
    .split(/<[^>]*>/)
    .map(decode)
    .map((node) => node.trim())
    .filter((node) => node !== '')
}

const drawings = (xml: string) => (xml.match(/<w:drawing>/g) ?? []).length

describe.each(SUPPORTED_TEMPLATES)('%s: contact visibility on the Preview and in Word', (template) => {
  it('draws every detail and the title when nothing is hidden', async () => {
    const row = resumeRow(template)
    for (const text of [previewNodes(row).join('|'), (await wordParagraphs(row)).join('|')]) {
      expect(text).toContain(EMAIL)
      expect(text).toContain(PHONE)
      expect(text.toUpperCase()).toContain(TITLE.toUpperCase())
    }
  })

  it('leaves out an unticked e-mail with its label and separator, and keeps the stored value', async () => {
    const row = resumeRow(template, ['email'])
    const label = contactLabel(en, 'email')
    const preview = previewNodes(row)
    const word = await wordParagraphs(row)
    for (const nodes of [preview, word]) {
      const text = nodes.join('|')
      expect(text).not.toContain(EMAIL)
      expect(text).toContain(PHONE)
      // No label left beside nothing, on the templates that label their details.
      expect(nodes, 'label').not.toContain(label)
    }

    // Exactly what the template draws for a CV with no e-mail at all: the same
    // label, icon and separator handling, so nothing is left dangling.
    const withoutEmail = { ...resumeRow(template), contact: { ...(row.contact as object), email: '' } }
    expect(previewMarkup(row)).toBe(previewMarkup(withoutEmail))
    expect(word).toEqual(await wordParagraphs(withoutEmail))

    expect((row.contact as { email: string }).email).toBe(EMAIL)
  })

  it('leaves out an unticked CV title, placeholder included', async () => {
    const row = resumeRow(template, ['title'])
    for (const text of [previewNodes(row).join('|'), (await wordParagraphs(row)).join('|')]) {
      expect(text.toUpperCase()).not.toContain(TITLE.toUpperCase())
      expect(text).not.toContain('CV TITLE')
      expect(text).not.toContain('PROFESSIONAL TITLE')
      expect(text).toContain(EMAIL)
    }
  })

  it('draws a ticked detail again once it is shown', async () => {
    const row = resumeRow(template, [])
    expect(previewNodes(row).join('|')).toContain(EMAIL)
    expect((await wordParagraphs(row)).join('|')).toContain(EMAIL)
  })
})

describe.each(['modern', 'swissVocational', 'swissCommerce', 'swissTrades', 'swissHealth'] as const)('%s: the photo tick', (template) => {
  it('draws the stored photo when ticked and draws it as absent when unticked, on both outputs', async () => {
    const shown = resumeRow(template)
    const hidden = resumeRow(template, ['photo'])

    expect(previewMarkup(shown, PHOTO)).toContain(`src="${PHOTO}"`)
    expect(previewMarkup(hidden, PHOTO)).not.toContain(PHOTO)
    // On the Swiss template unticked is exactly "no photo"; modern also drops
    // its zone, which the describe below pins.
    if (template !== 'modern') expect(previewMarkup(hidden, PHOTO)).toBe(previewMarkup(shown))

    const withPhoto = drawings(await documentXml(shown, PHOTO))
    const withoutPhoto = drawings(await documentXml(shown))
    expect(withPhoto).toBe(withoutPhoto + 1)
    expect(drawings(await documentXml(hidden, PHOTO))).toBe(withoutPhoto)
  })
})

describe('modern: an unticked photo draws no photo zone at all (FR-5)', () => {
  /** Modern's photo zone: the 220px block at the top of the sidebar. */
  const PHOTO_ZONE = /height:220px;background-color:#444444/

  it('ticked with no photo stored keeps the placeholder zone, as before', () => {
    expect(previewMarkup(resumeRow('modern'))).toMatch(PHOTO_ZONE)
  })

  it.each([
    ['with a photo stored', PHOTO],
    ['with no photo stored', undefined],
  ])('unticked %s: no zone, no photo, no placeholder on the Preview', (_case, photo) => {
    const markup = previewMarkup(resumeRow('modern', ['photo']), photo)
    expect(markup).not.toMatch(PHOTO_ZONE)
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('<svg width="80" height="80"')
  })

  it('unticked: no zone and no upload overlay in the Editor live preview either', () => {
    const row = resumeRow('modern', ['photo'])
    const editor = renderToStaticMarkup(
      createElement(ModernTemplate, {
        resume: row as unknown as Resume,
        locale: 'en',
        dict: en,
        photoUrl: PHOTO,
        onPhotoChange: () => {},
        onRemoveBackground: () => {},
        hiddenContactFields: ['photo'],
      }),
    )
    expect(editor).not.toMatch(PHOTO_ZONE)
    expect(editor).not.toContain('Upload Photo')
    expect(editor).not.toMatch(/<input[^>]*type="file"/)
    expect(editor).not.toContain('<img')
  })

  it('unticked: Word drops the zone offset, with or without a stored photo', async () => {
    const unticked = resumeRow('modern', ['photo'])
    const withPhoto = await documentXml(unticked, PHOTO)
    const withoutPhoto = await documentXml(unticked)
    const ticked = await documentXml(resumeRow('modern'))
    // No picture beyond what a CV with no photo has.
    expect(drawings(withPhoto)).toBe(drawings(ticked))
    // The photo sent changes nothing once it is unticked.
    expect(withPhoto).toBe(withoutPhoto)

    // The sidebar's opening offset is 220px (3300 twips) shorter than with the
    // tick on, where the zone is kept even with no photo.
    const openingAfter = (xml: string) => Number(/<w:spacing w:after="(\d+)"/.exec(xml)?.[1])
    expect(openingAfter(ticked) - openingAfter(withoutPhoto)).toBe(220 * 15)
  })
})

describe('creative: the headline with the CV title unticked', () => {
  /**
   * Creative's headline is the CV title, else the name, else the existing
   * "Your Name" placeholder. Unticking the title leaves the name, which cannot
   * be hidden, so it falls back exactly as a CV with no title always has.
   */
  const headline = (markup: string) => decode(/<h1[^>]*>([^<]*)<\/h1>/.exec(markup)?.[1] ?? '')

  it('falls back to the name, on both outputs', async () => {
    const row = resumeRow('creative', ['title'])
    expect(headline(previewMarkup(row))).toBe('Robin Halvorsen')
    const word = await wordParagraphs(row)
    expect(word).toContain('ROBIN HALVORSEN')
    expect(word.join('|')).not.toContain(TITLE.toUpperCase())
  })

  it('falls back to the existing placeholder when there is no name either, on both outputs', async () => {
    const row = { ...resumeRow('creative', ['title']), contact: { email: EMAIL } }
    expect(headline(previewMarkup(row))).toBe('Your Name')
    expect(await wordParagraphs(row)).toContain('YOUR NAME')
  })
})

describe.each(SUPPORTED_TEMPLATES)('%s: every hideable field unticked', (template) => {
  const ALL_HIDDEN: readonly ContactFieldId[] = ['title', 'email', 'phone', 'location', 'linkedin', 'github', 'website', 'photo']
  const NAME = 'Robin Halvorsen'
  const STORED_VALUES = [EMAIL, PHONE, 'Oxbridge', 'in/robin-halvorsen', 'gh/robin-halvorsen', 'halvorsen.test']

  it('still draws the full name, which has no tick, on both outputs', async () => {
    const row = resumeRow(template, ALL_HIDDEN)
    for (const text of [previewNodes(row).join('|'), (await wordParagraphs(row)).join('|')]) {
      expect(text.toUpperCase()).toContain(NAME.toUpperCase())
      expect(text.toUpperCase()).not.toContain(TITLE.toUpperCase())
      for (const value of STORED_VALUES) expect(text, value).not.toContain(value)
    }
  })

  it('leaves no contact row, label or separator a CV with no contact details would not have', async () => {
    const row = resumeRow(template, ALL_HIDDEN)
    // The defined behaviour: hidden is empty. The same CV with no contact
    // details stored (and its title unticked too) is the reference.
    const noContact = { ...resumeRow(template, ['title', 'photo']), contact: { name: NAME } }
    expect(previewMarkup(row)).toBe(previewMarkup(noContact))
    expect(await wordParagraphs(row)).toEqual(await wordParagraphs(noContact))

    // And no separator stands alone anywhere.
    for (const nodes of [previewNodes(row), await wordParagraphs(row)]) {
      for (const node of nodes) expect(node, 'orphan separator').not.toMatch(/^[•|·]+$/)
    }
  })
})
