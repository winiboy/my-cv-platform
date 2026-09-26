import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import type { Resume } from '@/types/database'
import {
  mapEditorOrderToClassic,
  mapEditorOrderToMinimal,
  resolveResumeLayout,
  type SingleColumnMainId,
} from '@/lib/layout-settings'
import { ClassicTemplate } from '@/components/dashboard/resume-templates/classic-template'
import { MinimalTemplate } from '@/components/dashboard/resume-templates/minimal-template'
import { generateClassicDocx } from '@/app/api/resumes/[id]/download-docx/docx-classic'
import { generateMinimalDocx } from '@/app/api/resumes/[id]/download-docx/docx-minimal'
import type { DocxGeneratorSettings } from '@/app/api/resumes/[id]/download-docx/docx-helpers'

/**
 * Part 3 US-009: the classic and minimal Previews honour section order and
 * visibility, and honour them the way their exports do.
 *
 * Both Previews used to draw their sections in the order they were written in
 * the JSX, whatever the layout model said, while both generators mapped the
 * stored order through `mapEditorOrderToClassic` / `mapEditorOrderToMinimal`.
 * The two surfaces are therefore compared against EACH OTHER here, not only
 * against an expected list: a mapping that changed would have to change both
 * readings at once to keep these green.
 *
 * Sections are located by a content marker unique to each, rather than by its
 * heading, because the two surfaces label and case their headings differently
 * while the content is the same words in both. Every marker is plain text: the
 * Preview routes stored HTML through the sanitiser, which emits an empty
 * wrapper on the server (see `rich-text.test.ts`), so an HTML marker would be
 * absent from this render for a reason that has nothing to do with order.
 */

type Template = 'classic' | 'minimal'

const TEMPLATES: Readonly<Record<Template, ComponentType<never>>> = {
  classic: ClassicTemplate as ComponentType<never>,
  minimal: MinimalTemplate as ComponentType<never>,
}

const GENERATORS: Readonly<
  Record<Template, (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>>
> = {
  classic: generateClassicDocx,
  minimal: generateMinimalDocx,
}

const MAPPERS: Readonly<Record<Template, (order: readonly string[]) => SingleColumnMainId[]>> = {
  classic: mapEditorOrderToClassic,
  minimal: mapEditorOrderToMinimal,
}

/** One plain-text string per section, unique to it on both surfaces. */
const MARK: Readonly<Record<SingleColumnMainId, string>> = {
  summary: 'Quillwright',
  experience: 'Tessellate Freight',
  education: 'Halvorsen Institute',
  skills: 'Zanzibarscript',
  projects: 'Orbital Mapper',
  languagesAndCerts: 'Esperanto',
}

const SECTION_IDS = Object.keys(MARK) as SingleColumnMainId[]

const RESUME = {
  id: 'r1',
  user_id: 'u1',
  title: 'Section order',
  template: 'classic',
  contact: { fullName: 'Sam Doe', email: 'sam@example.test' },
  summary: `${MARK.summary} builds document tooling.`,
  experience: [
    {
      company: MARK.experience,
      position: 'Engineer',
      startDate: '2020-01',
      current: true,
      achievements: ['Shipped the export pipeline.'],
      visible: true,
    },
  ],
  education: [
    {
      school: MARK.education,
      degree: 'MSc',
      field: 'CS',
      startDate: '2014-09',
      endDate: '2016-06',
      visible: true,
    },
  ],
  skills: [{ category: 'Languages', items: [MARK.skills, 'Rust'], visible: true }],
  projects: [{ name: MARK.projects, technologies: ['Go'], visible: true }],
  languages: [{ language: MARK.languagesAndCerts, level: 'Fluent', visible: true }],
  certifications: [],
  custom_sections: {},
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
} as unknown as Resume

/** A stored layout blob, resolved exactly as every surface resolves one. */
function layoutFor(stored: unknown) {
  return resolveResumeLayout({ layout_settings: stored, custom_sections: null }, null)
}

function previewText(template: Template, stored: unknown): string {
  const layout = layoutFor(stored)
  return renderToString(
    createElement(TEMPLATES[template] as ComponentType<Record<string, unknown>>, {
      resume: RESUME,
      locale: 'en',
      dict: en,
      mainContentOrder: layout.mainContentOrder,
      hiddenMainSections: layout.hiddenMainSections,
    }),
  )
}

async function docxText(template: Template, stored: unknown): Promise<string> {
  const layout = layoutFor(stored)
  const settings: DocxGeneratorSettings = {
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
  const zip = await JSZip.loadAsync(await GENERATORS[template](RESUME, settings))
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error(`The ${template} artifact has no word/document.xml`)
  const xml = await part.async('string')
  return (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []).map((run) => run.replace(/<[^>]+>/g, '')).join('\n')
}

/** The sections a surface drew, in the order it drew them. */
function sequenceOf(text: string): SingleColumnMainId[] {
  return SECTION_IDS.filter((id) => text.includes(MARK[id])).sort(
    (a, b) => text.indexOf(MARK[a]) - text.indexOf(MARK[b]),
  )
}

/** What the shared mapping says the template should draw for this stored blob. */
function expectedSequence(template: Template, stored: unknown): SingleColumnMainId[] {
  const layout = layoutFor(stored)
  const hidden: readonly string[] = layout.hiddenMainSections
  return MAPPERS[template](layout.mainContentOrder).filter((id) => !hidden.includes(id))
}

/** The default layout, a reordered one, and one that also hides a section. */
const CASES = {
  default: null,
  reordered: { mainContentOrder: ['education', 'summary', 'experience'], hiddenMainSections: [] },
  'reordered and partly hidden': {
    mainContentOrder: ['experience', 'summary', 'education'],
    hiddenMainSections: ['education'],
  },
} as const

/**
 * The order each template draws, pinned literally, because it is US-009's
 * recorded decision rather than a derivation: `projects` keeps the slot its own
 * template draws it in — fifth on classic, third on minimal — however the user
 * reorders the sections the editor can position. A change of mind about that
 * decision has to edit these lists.
 */
const PINNED: Readonly<Record<Template, Readonly<Record<keyof typeof CASES, readonly SingleColumnMainId[]>>>> = {
  classic: {
    default: ['summary', 'experience', 'education', 'skills', 'projects', 'languagesAndCerts'],
    reordered: ['education', 'summary', 'experience', 'skills', 'projects', 'languagesAndCerts'],
    'reordered and partly hidden': ['experience', 'summary', 'skills', 'projects', 'languagesAndCerts'],
  },
  minimal: {
    default: ['summary', 'experience', 'projects', 'education', 'skills', 'languagesAndCerts'],
    reordered: ['education', 'summary', 'projects', 'experience', 'skills', 'languagesAndCerts'],
    'reordered and partly hidden': ['experience', 'summary', 'projects', 'skills', 'languagesAndCerts'],
  },
}

const CASE_IDS = Object.keys(CASES) as (keyof typeof CASES)[]

describe.each(['classic', 'minimal'] as const)('the %s Preview', (template) => {
  it.each(CASE_IDS)('draws its sections in the mapped order (%s layout)', (caseId) => {
    const sequence = sequenceOf(previewText(template, CASES[caseId]))
    expect(sequence).toEqual([...PINNED[template][caseId]])
    // The literal above and the shared mapping must say the same thing.
    expect(sequence).toEqual(expectedSequence(template, CASES[caseId]))
  })

  it('omits a section the owner hid, and nothing else', () => {
    const text = previewText(template, CASES['reordered and partly hidden'])
    expect(text).not.toContain(MARK.education)
    for (const id of SECTION_IDS.filter((section) => section !== 'education')) {
      expect(text, `${id} is missing from the Preview`).toContain(MARK[id])
    }
  })

  it.each(CASE_IDS)('draws what the DOCX draws, in the same order (%s layout)', async (caseId) => {
    const preview = sequenceOf(previewText(template, CASES[caseId]))
    const docx = sequenceOf(await docxText(template, CASES[caseId]))
    expect(preview.length, 'the Preview drew no sections').toBeGreaterThan(0)
    expect(docx).toEqual(preview)
  })
})
