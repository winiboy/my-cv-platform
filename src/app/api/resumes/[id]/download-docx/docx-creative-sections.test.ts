import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { CreativeTemplate } from '@/components/dashboard/resume-templates/creative-template'
import { mapEditorOrderToCreative, resolveResumeLayout } from '@/lib/layout-settings'
import type { Resume } from '@/types/database'
import { generateCreativeDocx } from './docx-creative'
import type { DocxGeneratorSettings } from './docx-helpers'

/**
 * Part 3 US-015: creative's section controls stop being a silent no-op.
 *
 * Both surfaces are exercised from ONE stored layout blob, resolved through
 * `resolveResumeLayout` exactly as `route.ts` resolves it, and the two orders
 * are compared with each other rather than each against a written-down
 * expectation. That is criterion 5: a test that asserted a list per surface
 * would pass while the two surfaces disagreed with the same list in different
 * places.
 *
 * The DOCX side reads the unzipped `word/document.xml` (criterion 4). The
 * Preview side renders the real component to static markup; its rich-text
 * wrapper renders empty outside a browser by design (`sanitized-html.tsx`), so
 * every marker below is PLAIN text, which both surfaces draw.
 */

/** One string per section, unique to it on both surfaces. */
const MARK = {
  summary: 'Quillwright',
  skills: 'Zanzibarscript',
  languages: 'Esperanto',
  certifications: 'Cartwheel Certified',
  experience: 'Tessellate Freight',
  projects: 'Orbital Mapper',
  education: 'Halvorsen Institute',
} as const

type SectionKey = keyof typeof MARK

const SIDEBAR_KEYS: readonly SectionKey[] = ['skills', 'languages', 'certifications']
const MAIN_KEYS: readonly SectionKey[] = ['experience', 'projects', 'education']

function resumeRow(layoutSettings: unknown) {
  return {
    title: 'Creative sections',
    template: 'creative',
    contact: { name: 'Sam Doe', email: 'sam@example.test' },
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
    languages: [{ language: MARK.languages, level: 'Fluent', visible: true }],
    certifications: [{ name: MARK.certifications, issuer: 'Cartwheel', date: '2021-05', visible: true }],
    projects: [{ name: MARK.projects, description: 'Maps orbits.', technologies: ['Go'], visible: true }],
    custom_sections: {},
    layout_settings: layoutSettings,
  }
}

type ResumeRow = ReturnType<typeof resumeRow>

/** The generator settings `route.ts` builds from the resolved layout. */
function settingsFor(row: ResumeRow): DocxGeneratorSettings {
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
  }
}

/** The document's text, in document order, read from the unzipped artifact. */
async function docxText(row: ResumeRow): Promise<string> {
  const buffer = await generateCreativeDocx(row, settingsFor(row))
  const zip = await JSZip.loadAsync(buffer)
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error('The creative artifact has no word/document.xml')
  const xml = await part.async('string')
  return (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []).map((run) => run.replace(/<[^>]+>/g, '')).join('\n')
}

/**
 * The Preview's markup, built the way `resume-preview.tsx` builds it: the
 * stored blob resolved, then mapped by the shared vocabulary. Nothing here
 * re-derives creative's rendering.
 */
function previewMarkup(row: ResumeRow): string {
  const layout = resolveResumeLayout(row, null)
  const creative = mapEditorOrderToCreative(
    layout.sidebarOrder,
    layout.mainContentOrder,
    layout.hiddenSidebarSections,
    layout.hiddenMainSections,
  )
  return renderToStaticMarkup(
    createElement(CreativeTemplate, {
      resume: row as unknown as Resume,
      locale: 'en',
      dict: {},
      sidebarOrder: creative.creativeSidebarOrder,
      mainContentOrder: creative.creativeMainOrder,
      hiddenSidebarSections: creative.hiddenCreativeSidebar,
      hiddenMainSections: creative.hiddenCreativeMain,
      summaryHidden: creative.summaryHidden,
    }),
  )
}

/** The keys present in `text`, in the order their markers appear in it. */
function seenOrder(text: string, keys: readonly SectionKey[]): SectionKey[] {
  return keys
    .map((key) => [key, text.indexOf(MARK[key])] as const)
    .filter(([, at]) => at >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key)
}

/** Both surfaces' section order for one stored layout, ready to compare. */
async function bothSurfaces(layoutSettings: unknown) {
  const row = resumeRow(layoutSettings)
  const preview = previewMarkup(row)
  const docx = await docxText(row)
  return {
    preview: {
      sidebar: seenOrder(preview, SIDEBAR_KEYS),
      main: seenOrder(preview, MAIN_KEYS),
      summary: preview.includes(MARK.summary),
    },
    docx: {
      sidebar: seenOrder(docx, SIDEBAR_KEYS),
      main: seenOrder(docx, MAIN_KEYS),
      summary: docx.includes(MARK.summary),
    },
  }
}

describe('the creative surfaces read one section vocabulary', () => {
  it('draws the template sequence on both surfaces when the layout is the default', async () => {
    const { preview, docx } = await bothSurfaces(null)
    expect(preview.sidebar).toEqual(['skills', 'languages', 'certifications'])
    expect(preview.main).toEqual(['experience', 'projects', 'education'])
    expect(preview).toEqual(docx)
  })

  it('reorders both surfaces together, and identically', async () => {
    const { preview, docx } = await bothSurfaces({
      sidebarOrder: ['languages', 'skills', 'training', 'keyAchievements'],
      mainContentOrder: ['education', 'experience', 'summary'],
    })
    // The user's order, with the two sections no editor id names keeping their slots.
    expect(preview.sidebar).toEqual(['languages', 'skills', 'certifications'])
    expect(preview.main).toEqual(['education', 'projects', 'experience'])
    expect(preview).toEqual(docx)
  })

  it('removes a hidden section from both surfaces', async () => {
    const { preview, docx } = await bothSurfaces({
      hiddenSidebarSections: ['languages'],
      hiddenMainSections: ['education'],
    })
    expect(preview.sidebar).toEqual(['skills', 'certifications'])
    expect(preview.main).toEqual(['experience', 'projects'])
    expect(preview).toEqual(docx)
  })

  it('hides the header summary on both surfaces, without moving it', async () => {
    const shown = await bothSurfaces(null)
    expect(shown.preview.summary).toBe(true)
    expect(shown.docx.summary).toBe(true)

    const { preview, docx } = await bothSurfaces({ hiddenMainSections: ['summary'] })
    expect(preview.summary).toBe(false)
    expect(docx.summary).toBe(false)
    // Its neighbours are untouched: the summary is fixed, so hiding it is the
    // only thing the model can do to it.
    expect(preview.main).toEqual(['experience', 'projects', 'education'])
    expect(preview).toEqual(docx)
  })

  it('ignores the ids creative does not render on either surface', async () => {
    const { preview, docx } = await bothSurfaces({
      sidebarOrder: ['training', 'keyAchievements', 'skills', 'languages'],
      hiddenSidebarSections: ['training', 'keyAchievements'],
    })
    expect(preview.sidebar).toEqual(['skills', 'languages', 'certifications'])
    expect(preview).toEqual(docx)
  })

  it('agrees on a stored order that positions almost nothing creative renders', async () => {
    const { preview, docx } = await bothSurfaces({
      sidebarOrder: ['keyAchievements'],
      mainContentOrder: ['summary'],
    })
    // The store rebuilds an unusable sidebar order into the full default list
    // (`migrateSidebarOrder`), so the left column keeps both its editor
    // sections, in that rebuilt order. The main order carries no creative
    // section at all, so only the slot no editor id names survives — which is
    // what keeps an unusable order from producing an empty column.
    expect(preview.sidebar).toEqual(['languages', 'skills', 'certifications'])
    expect(preview.main).toEqual(['projects'])
    expect(preview).toEqual(docx)
  })
})

describe('a creative resume at its layout defaults', () => {
  it('produces the same document.xml however the default is expressed', async () => {
    // Absent, the complete default blob and the default written back after a
    // load must all be one document: criterion 8's tripwire, on the artifact.
    const absent = await docxText(resumeRow(null))
    const explicit = await docxText(
      resumeRow({
        sidebarOrder: ['keyAchievements', 'skills', 'languages', 'training'],
        mainContentOrder: ['summary', 'experience', 'education'],
        hiddenSidebarSections: [],
        hiddenMainSections: [],
      }),
    )
    expect(explicit).toBe(absent)
  })
})
