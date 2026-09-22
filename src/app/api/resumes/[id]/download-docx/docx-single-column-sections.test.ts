import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { generateClassicDocx } from './docx-classic'
import type { DocxGeneratorSettings } from './docx-helpers'
import { generateMinimalDocx } from './docx-minimal'

/**
 * Part 3 US-002: the classic and minimal DOCX stop dropping sections.
 *
 * Both generators carried `skills` and `projects` branches that could not run:
 * the section list came from the editor's main-content order, which the stored
 * layout's parse filters to summary, experience and education. Both Previews
 * render both sections.
 *
 * Every assertion reads the unzipped `word/document.xml`. The layout goes
 * through `resolveResumeLayout` exactly as `route.ts` resolves it — the stored
 * blob is the untrusted input, and the fix must hold for what a real row
 * resolves to rather than for a hand-built list.
 */

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

const GENERATORS: Readonly<Record<'classic' | 'minimal', Generator>> = {
  classic: generateClassicDocx,
  minimal: generateMinimalDocx,
}

/** One string per section, unique to it in the document. */
const MARK = {
  summary: 'Quillwright',
  experience: 'Tessellate Freight',
  education: 'Halvorsen Institute',
  skills: 'Zanzibarscript',
  projects: 'Orbital Mapper',
  languages: 'Esperanto',
} as const

/** A skill category and a project every hidden-item case turns off. */
const HIDDEN_SKILL = 'Obsidianql'
const HIDDEN_PROJECT = 'Umbral Ledger'

/** A visible category with no items, exactly as `addCategory` creates one. */
const EMPTY_CATEGORY = 'Ghostwriting'

interface ResumeOverrides {
  skills?: unknown[]
  projects?: unknown[]
}

function resumeRow(layoutSettings: unknown, overrides: ResumeOverrides = {}) {
  return {
    title: 'Single-column sections',
    contact: { name: 'Sam Doe', email: 'sam@example.test' },
    summary: `<p>${MARK.summary} builds document tooling.</p>`,
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
      { school: MARK.education, degree: 'MSc', field: 'CS', startDate: '2014-09', endDate: '2016-06', visible: true },
    ],
    skills: overrides.skills ?? [
      { category: 'Languages', items: [MARK.skills, 'Rust'], visible: true },
      { category: 'Retired', items: [HIDDEN_SKILL], visible: false },
    ],
    projects: overrides.projects ?? [
      { name: MARK.projects, description: '<p>Maps orbits.</p>', technologies: ['Go'], visible: true },
      { name: HIDDEN_PROJECT, description: '<p>Hidden.</p>', visible: false },
    ],
    languages: [{ language: MARK.languages, level: 'Fluent', visible: true }],
    certifications: [],
    custom_sections: {},
    layout_settings: layoutSettings,
  }
}

/** The generator settings `route.ts` builds from the resolved layout. */
function settingsFor(row: ReturnType<typeof resumeRow>): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  return {
    fontFamily: layout.fontFamily,
    fontScale: layout.fontScale,
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
async function documentText(template: 'classic' | 'minimal', row: ReturnType<typeof resumeRow>): Promise<string> {
  const buffer = await GENERATORS[template](row, settingsFor(row))
  const zip = await JSZip.loadAsync(buffer)
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error(`The ${template} artifact has no word/document.xml`)
  const xml = await part.async('string')
  return (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []).map((run) => run.replace(/<[^>]+>/g, '')).join('\n')
}

/** Where each marker sits, failing loudly on one that is absent. */
function positions(text: string, keys: readonly (keyof typeof MARK)[]): number[] {
  return keys.map((key) => {
    const at = text.indexOf(MARK[key])
    expect(at, `${key} (${MARK[key]}) is missing from word/document.xml`).toBeGreaterThanOrEqual(0)
    return at
  })
}

const ascending = (values: readonly number[]) => values.every((v, i) => i === 0 || values[i - 1] < v)

/**
 * The order each Preview draws its sections in: `classic-template.tsx` and
 * `minimal-template.tsx`, read from their JSX.
 */
const PREVIEW_ORDER: Readonly<Record<'classic' | 'minimal', readonly (keyof typeof MARK)[]>> = {
  classic: ['summary', 'experience', 'education', 'skills', 'projects', 'languages'],
  minimal: ['summary', 'experience', 'projects', 'education', 'skills', 'languages'],
}

describe.each(['classic', 'minimal'] as const)('the %s DOCX', (template) => {
  it('contains the skills and projects sections of a resume that carries them', async () => {
    const text = await documentText(template, resumeRow(null))
    expect(text).toContain(MARK.skills)
    expect(text).toContain('Rust')
    expect(text).toContain(MARK.projects)
    expect(text).toContain('Maps orbits.')
    // Section headings, as the Preview labels them (en dictionary).
    expect(text.toUpperCase()).toContain('SKILLS')
    expect(text.toUpperCase()).toContain('KEY ACHIEVEMENTS')
  })

  it("draws every section in its Preview's order when the layout is the default", async () => {
    const text = await documentText(template, resumeRow(null))
    expect(ascending(positions(text, PREVIEW_ORDER[template]))).toBe(true)
  })

  it('keeps a main section the user hid hidden, while showing skills and projects', async () => {
    const text = await documentText(
      template,
      resumeRow({ mainContentOrder: ['experience', 'summary', 'education'], hiddenMainSections: ['education'] }),
    )
    expect(text).not.toContain(MARK.education)
    expect(text).toContain(MARK.skills)
    expect(text).toContain(MARK.projects)
    // The user's order still applies to the sections the editor can order.
    const [experience, summary] = positions(text, ['experience', 'summary'])
    expect(experience).toBeLessThan(summary)
  })

  it('keeps hidden skill categories and projects hidden, as the Preview does', async () => {
    const text = await documentText(template, resumeRow(null))
    expect(text).not.toContain(HIDDEN_SKILL)
    expect(text).not.toContain(HIDDEN_PROJECT)
  })

  it('omits the whole section, heading included, when every item in it is hidden', async () => {
    const text = await documentText(
      template,
      resumeRow(null, {
        skills: [{ category: 'Retired', items: [HIDDEN_SKILL], visible: false }],
        projects: [{ name: HIDDEN_PROJECT, visible: false }],
      }),
    )
    expect(text).not.toContain(HIDDEN_SKILL)
    expect(text).not.toContain(HIDDEN_PROJECT)
    expect(text.toUpperCase()).not.toContain('SKILLS')
    expect(text.toUpperCase()).not.toContain('KEY ACHIEVEMENTS')
    // The rest of the document is still there.
    positions(text, ['summary', 'experience', 'education', 'languages'])
  })

  /**
   * `addCategory` in `skills-section.tsx` creates `{ category, items: [],
   * visible: true }`, so a named category with no items is two clicks away and
   * is saved. Both Previews render its label — `classic-template.tsx:345`,
   * `minimal-template.tsx:346` — and the SKILLS heading is guarded only on
   * there being a visible category, so a generator that drew nothing for it
   * would emit a heading above nothing.
   */
  it('draws a visible skill category that has no items, rather than a heading above nothing', async () => {
    const text = await documentText(
      template,
      resumeRow(null, { skills: [{ category: EMPTY_CATEGORY, items: [], visible: true }] }),
    )
    expect(text.toUpperCase()).toContain('SKILLS')
    expect(text).toContain(EMPTY_CATEGORY)
  })

  it('draws a category with no items alongside one that has them', async () => {
    const text = await documentText(
      template,
      resumeRow(null, {
        skills: [
          { category: 'Languages', items: [MARK.skills], visible: true },
          { category: EMPTY_CATEGORY, items: [], visible: true },
        ],
      }),
    )
    expect(text).toContain(MARK.skills)
    expect(text).toContain(EMPTY_CATEGORY)
  })

  it('draws nothing for skills and projects on a resume that has none', async () => {
    const text = await documentText(template, resumeRow(null, { skills: [], projects: [] }))
    expect(text.toUpperCase()).not.toContain('SKILLS')
    expect(text.toUpperCase()).not.toContain('KEY ACHIEVEMENTS')
  })

  it('exports a stored layout written before the fix, and an out-of-vocabulary one, without error', async () => {
    // As the column holds it today: every property, main order permuted.
    const stored = JSON.stringify({
      mainContentOrder: ['education', 'experience', 'summary'],
      hiddenMainSections: [],
      sidebarOrder: ['skills', 'keyAchievements', 'languages', 'training'],
      fontScale: 1.1,
    })
    const text = await documentText(template, resumeRow(stored))
    positions(text, ['education', 'experience', 'summary', 'skills', 'projects', 'languages'])

    // Ids no writer produces are filtered at the parse, as before; the export
    // still renders rather than failing.
    const odd = await documentText(
      template,
      resumeRow({ mainContentOrder: ['skills', 'projects', 'bogus'], hiddenMainSections: ['skills'] }),
    )
    positions(odd, ['summary', 'experience', 'education', 'skills', 'projects', 'languages'])
  })
})
