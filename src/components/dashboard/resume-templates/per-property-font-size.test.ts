import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import type { Resume, ResumeTemplate } from '@/types/database'
import {
  DEFAULT_RESUME_LAYOUT,
  LAYOUT_CONTROL_KEYS,
  TEMPLATE_APPLIED_SIZE_KEYS,
  resolveResumeLayout,
  type PerPropertySizeKey,
} from '@/lib/layout-settings'
import { ClassicTemplate } from '@/components/dashboard/resume-templates/classic-template'
import { CreativeTemplate } from '@/components/dashboard/resume-templates/creative-template'
import { MinimalTemplate } from '@/components/dashboard/resume-templates/minimal-template'
import { ModernTemplate } from '@/components/dashboard/resume-templates/modern-template'
import { generateClassicDocx } from '@/app/api/resumes/[id]/download-docx/docx-classic'
import { generateCreativeDocx } from '@/app/api/resumes/[id]/download-docx/docx-creative'
import { generateMinimalDocx } from '@/app/api/resumes/[id]/download-docx/docx-minimal'
import { generateModernDocx } from '@/app/api/resumes/[id]/download-docx/docx-modern'
import { generateProfessionalDocx } from '@/app/api/resumes/[id]/download-docx/docx-professional'
import { pxToHalfPoints, type DocxGeneratorSettings } from '@/app/api/resumes/[id]/download-docx/docx-helpers'

/**
 * Part 3 US-011: the font scale and the four per-property sizes reach every
 * surface of every template that draws them.
 *
 * `TEMPLATE_APPLIED_SIZE_KEYS` (US-014) is the contract both halves are held
 * to, and it is read here rather than restated: a template that applies a key
 * must apply it on the Preview AND in the DOCX, and a template that does not
 * must apply it on neither. Widening that map without widening a generator —
 * or the other way round — fails these tests instead of shipping a Preview and
 * an export that disagree about a size the owner chose.
 *
 * The sizes are compared as the DOCX writes them, in half-points, against the
 * px the Preview writes, so a generator that scaled a stock constant instead
 * of the stored value cannot pass by responding to the wrong number.
 */

const SCALE = 1.5

/** Distinct, in range, and not equal to any default, so nothing agrees by accident. */
const CHOSEN: Readonly<Record<PerPropertySizeKey, number>> = {
  titleFontSize: 34,
  contactFontSize: 16,
  sectionTitleFontSize: 22,
  sectionDescFontSize: 11,
}

/** A second value for each, for the response tests. */
const BUMPED: Readonly<Record<PerPropertySizeKey, number>> = {
  titleFontSize: 40,
  contactFontSize: 17,
  sectionTitleFontSize: 23,
  sectionDescFontSize: 15,
}

const SIZE_KEYS = LAYOUT_CONTROL_KEYS.perPropertySize as readonly PerPropertySizeKey[]

const TEMPLATES: readonly ResumeTemplate[] = ['classic', 'minimal', 'creative', 'modern', 'professional']

const PREVIEWS: Readonly<Partial<Record<ResumeTemplate, ComponentType<never>>>> = {
  classic: ClassicTemplate as ComponentType<never>,
  minimal: MinimalTemplate as ComponentType<never>,
  creative: CreativeTemplate as ComponentType<never>,
  modern: ModernTemplate as ComponentType<never>,
}

const GENERATORS: Readonly<
  Record<ResumeTemplate, (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>>
> = {
  classic: generateClassicDocx,
  minimal: generateMinimalDocx,
  creative: generateCreativeDocx,
  modern: generateModernDocx,
  professional: generateProfessionalDocx,
}

const RESUME = {
  id: 'r1',
  user_id: 'u1',
  title: 'Font sizes',
  template: 'classic',
  contact: {
    fullName: 'Sam Doe',
    name: 'Sam Doe',
    email: 'sam@example.test',
    phone: '+41 00 000 00 00',
    location: 'Lausanne',
  },
  summary: 'Builds document tooling.',
  experience: [
    {
      company: 'Tessellate Freight',
      position: 'Engineer',
      location: 'Lausanne',
      startDate: '2020-01',
      current: true,
      achievements: ['Shipped the export pipeline.'],
      visible: true,
    },
  ],
  education: [
    { school: 'Halvorsen Institute', degree: 'MSc', field: 'CS', startDate: '2014-09', endDate: '2016-06', visible: true },
  ],
  skills: [{ category: 'Languages', items: ['Rust', 'Go'], visible: true }],
  projects: [{ name: 'Orbital Mapper', description: 'Survey.', technologies: ['Go'], visible: true }],
  languages: [{ language: 'Esperanto', level: 'Fluent', visible: true }],
  certifications: [{ name: 'Typesetting', issuer: 'Guild', date: '2003-05', visible: true }],
  custom_sections: {},
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
} as unknown as Resume

/** The model every surface reads, resolved exactly as the app resolves one. */
function layoutFor(overrides: Partial<Record<PerPropertySizeKey | 'fontScale', number>>) {
  return resolveResumeLayout({ layout_settings: { ...CHOSEN, ...overrides }, custom_sections: null }, null)
}

type Layout = ReturnType<typeof layoutFor>

function settingsFor(layout: Layout): DocxGeneratorSettings {
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
  }
}

/** Every inline font size the Preview writes, in px, in document order. */
function previewSizes(template: ResumeTemplate, layout: Layout): number[] {
  const component = PREVIEWS[template]
  if (!component) throw new Error(`${template} has no Preview in this suite`)
  const html = renderToString(
    createElement(component as ComponentType<Record<string, unknown>>, {
      resume: RESUME,
      locale: 'en',
      dict: en,
      sidebarColor: 'hsl(240, 85%, 35%)',
      titleFontSize: layout.titleFontSize,
      contactFontSize: layout.contactFontSize,
      sectionTitleFontSize: layout.sectionTitleFontSize,
      sectionDescFontSize: layout.sectionDescFontSize,
      fontScale: layout.fontScale,
    }),
  )
  return [...html.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]))
}

/** Every run size the DOCX writes, in half-points, in document order. */
async function docxSizes(template: ResumeTemplate, layout: Layout): Promise<number[]> {
  const buffer = await GENERATORS[template](RESUME, settingsFor(layout))
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')!.async('string')
  return [...xml.matchAll(/<w:sz w:val="(\d+)"\/>/g)].map((match) => Number(match[1]))
}

const count = (sizes: readonly number[], value: number) => sizes.filter((size) => size === value).length

describe('the per-property sizes each template applies', () => {
  it('is the same question for the Preview and the DOCX', () => {
    // Guards the premise of every test below: the suite covers all five
    // templates and all four keys, so a key added to the model cannot slip
    // past unexercised.
    expect(Object.keys(TEMPLATE_APPLIED_SIZE_KEYS).sort()).toEqual([...TEMPLATES].sort())
    expect(SIZE_KEYS).toHaveLength(4)
  })

  describe.each(TEMPLATES.filter((template) => PREVIEWS[template]))('%s Preview', (template) => {
    const applied = TEMPLATE_APPLIED_SIZE_KEYS[template]

    it.each(applied)('draws %s at the stored size times the model scale', (key) => {
      const unscaled = previewSizes(template, layoutFor({ fontScale: 1 }))
      const scaled = previewSizes(template, layoutFor({ fontScale: SCALE }))
      expect(unscaled).toContain(CHOSEN[key])
      expect(scaled).toContain(CHOSEN[key] * SCALE)
      // Not merely present: the unscaled size is gone at the larger scale, so
      // a template that drew both sizes somewhere would not pass.
      expect(count(scaled, CHOSEN[key])).toBe(0)
    })

    it('is unmoved by a size the map says it does not apply', () => {
      // By response rather than by absence: a stock size the template draws
      // may coincide with an unapplied stored one (modern's 16px section
      // heading is 24px at this scale, and so is contactFontSize), and a
      // coincidence is not an application.
      const base = previewSizes(template, layoutFor({ fontScale: SCALE }))
      for (const key of SIZE_KEYS) {
        if (applied.includes(key)) continue
        expect(previewSizes(template, layoutFor({ fontScale: SCALE, [key]: BUMPED[key] }))).toEqual(base)
      }
    })
  })

  describe.each(TEMPLATES)('%s DOCX', (template: ResumeTemplate) => {
    const applied = TEMPLATE_APPLIED_SIZE_KEYS[template]

    it.each(SIZE_KEYS)('%s reaches it exactly where the map says it does', async (key: PerPropertySizeKey) => {
      const base = await docxSizes(template, layoutFor({}))
      const moved = await docxSizes(template, layoutFor({ [key]: BUMPED[key] }))
      if (!applied.includes(key)) {
        expect(moved).toEqual(base)
        return
      }
      expect(moved).not.toEqual(base)
      // The value itself, not just a reaction to it: more runs are written at
      // the new size than before, which a generator scaling its own stock
      // constant could not produce.
      const written = pxToHalfPoints(BUMPED[key] * DEFAULT_RESUME_LAYOUT.fontScale)
      expect(count(moved, written)).toBeGreaterThan(count(base, written))
    })

    it.each(applied)('writes %s at the model scale, as the Preview draws it', async (key) => {
      const sizes = await docxSizes(template, layoutFor({ fontScale: SCALE }))
      expect(sizes).toContain(pxToHalfPoints(CHOSEN[key] * SCALE))
    })
  })
})
