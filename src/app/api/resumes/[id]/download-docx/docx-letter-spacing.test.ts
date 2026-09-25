import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import type { ResumeTemplate } from '@/types/database'
import { generateClassicDocx } from './docx-classic'
import { generateCreativeDocx } from './docx-creative'
import type { DocxGeneratorSettings } from './docx-helpers'
import { generateMinimalDocx } from './docx-minimal'
import { generateModernDocx } from './docx-modern'
import { generateProfessionalDocx } from './docx-professional'

/**
 * Part 3 US-005: every generator writes the letter spacing the Preview draws.
 *
 * CSS gives letter spacing as a multiple of the font size. The expected
 * character spacing of a run is therefore its Preview letter spacing — the em
 * its template draws it with, from `resume-letter-spacing.ts` — times the size
 * of that run, in twentieths of a point. The size is read from the run in the
 * document, not recomputed, so these tests pin the spacing to whatever size the
 * generator writes (US-011 owns whether that size is right), and each case runs
 * at the default font scale and at two others, where the size and the spacing
 * must move together.
 *
 * The check is exhaustive in both directions: a run a case claims must carry
 * exactly that spacing, and a run no case claims must carry none, so a
 * generator can neither drop a spacing the Preview draws nor invent one it does
 * not.
 */

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

const GENERATORS: Readonly<Record<ResumeTemplate, Generator>> = {
  professional: generateProfessionalDocx,
  modern: generateModernDocx,
  classic: generateClassicDocx,
  minimal: generateMinimalDocx,
  creative: generateCreativeDocx,
}

const MARK = {
  title: 'Tracking Fidelity Title',
  name: 'Robin Tracking',
  skillCategory: 'Toolchain',
  secondSkillCategory: 'Kilnwork',
} as const

/** The section headings the generators draw, as the dictionary spells them. */
const SECTION_TITLES: ReadonlySet<string> = new Set(
  [
    ...(['keyAchievements', 'skills', 'languages', 'training', 'summary', 'experience', 'education'] as const).map(
      (key) => en.resumes.template[key],
    ),
    ...(['contact', 'summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'projects'] as const).map(
      (key) => en.resumes.editor.sections[key],
    ),
  ].map((title) => title.toLowerCase()),
)

/** `docx-modern.ts` labels each sidebar contact entry with one of these. */
const MODERN_CONTACT_LABELS: readonly string[] = ['Phone', 'Email', 'Website', 'LinkedIn', 'GitHub', 'Location']

function resumeRow() {
  return {
    title: MARK.title,
    contact: {
      name: MARK.name,
      email: 'robin@tracking.test',
      phone: '+41 00 000 0005',
      location: 'Trackville',
      linkedin: 'in/robin-tracking',
      github: 'robin-tracking',
      website: 'https://tracking.test',
    },
    summary: '<p>Quillwright overview of a documentation toolchain.</p>',
    experience: [
      {
        company: 'Tessellate Freight',
        position: 'Kilnwright Engineer',
        location: 'Oxbridge',
        startDate: '2011-03',
        current: true,
        achievements: ['Tessellated the export pipeline.'],
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Magister', field: 'Chromatics', startDate: '1997-09', endDate: '1999-06', visible: true },
    ],
    skills: [
      { category: MARK.skillCategory, items: ['Zanzibarscript', 'Rust'], visible: true },
      { category: MARK.secondSkillCategory, items: ['Typesetting'], visible: true },
    ],
    projects: [{ name: 'Orbital Mapper', description: '<p>Orbital survey.</p>', technologies: ['Go'], visible: true }],
    languages: [{ language: 'Esperanto', level: 'Fluent', visible: true }],
    certifications: [{ name: 'Typesetting Cert', issuer: 'Guild of Printers', date: '2003-05', visible: true }],
    custom_sections: {},
    layout_settings: null,
  }
}

/** The generator settings `route.ts` builds from the resolved (default) layout, at a chosen font scale. */
function settingsFor(row: ReturnType<typeof resumeRow>, fontScale: number): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  return {
    fontFamily: layout.fontFamily,
    fontScale,
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

interface Run {
  text: string
  /** `w:sz` of the run, or of the document default when it sets none. */
  halfPoints: number
  /** `w:spacing w:val` in the run properties, `null` when the run writes none. */
  spacing: number | null
}

const documents = new Map<string, Promise<Run[]>>()

const textOf = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text).join('')
const attribute = (fragment: string, element: string, name: string) =>
  new RegExp(`<${element}\\b[^>]*\\s${name}="([^"]*)"`).exec(fragment)?.[1] ?? null
const numberOrNull = (value: string | null) => (value === null ? null : Number(value))

/** Every run that carries text, with the size and character spacing it resolves to. */
function runsOf(template: ResumeTemplate, fontScale: number): Promise<Run[]> {
  const key = `${template}@${fontScale}`
  let found = documents.get(key)
  if (!found) {
    found = (async () => {
      const row = resumeRow()
      const zip = await JSZip.loadAsync(await GENERATORS[template](row, settingsFor(row, fontScale)))
      const read = async (name: string) => {
        const part = zip.file(name)
        if (part === null) throw new Error(`The ${template} artifact has no ${name}`)
        return part.async('string')
      }
      const styles = await read('word/styles.xml')
      const runDefaults = /<w:rPrDefault>([\s\S]*?)<\/w:rPrDefault>/.exec(styles)?.[1] ?? ''
      const defaultSize = numberOrNull(attribute(runDefaults, 'w:sz', 'w:val'))
      // A default character spacing would space every run the generators leave alone.
      expect(attribute(runDefaults, 'w:spacing', 'w:val'), `${template}: document default character spacing`).toBeNull()
      return [...(await read('word/document.xml')).matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)].flatMap(([, run]) => {
        const text = textOf(run)
        if (text.trim() === '') return []
        const properties = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? ''
        const halfPoints = numberOrNull(attribute(properties, 'w:sz', 'w:val')) ?? defaultSize
        if (halfPoints === null) throw new Error(`${template}: run "${text}" has no resolvable size`)
        return [{ text, halfPoints, spacing: numberOrNull(attribute(properties, 'w:spacing', 'w:val')) }]
      })
    })()
    documents.set(key, found)
  }
  return found
}

interface Case {
  label: string
  /** The Preview letter spacing of the element, in em. */
  em: number
  /** Every run the element is drawn with. */
  matches: (text: string) => boolean
}

const fold = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()
const exactly = (label: string, text: string, em: number): Case => ({ label, em, matches: (run) => fold(run) === fold(text) })
const anyOf = (label: string, texts: readonly string[], em: number): Case => ({
  label,
  em,
  matches: (run) => texts.some((text) => fold(run) === fold(text)),
})
/** Creative writes a "|" run before each heading, standing in for its bar; it is not the heading. */
const headings = (em: number): Case => ({ label: 'section headings', em, matches: (run) => SECTION_TITLES.has(fold(run)) })

/**
 * Per template, every element the Preview gives a letter spacing, and no
 * others. An element absent here draws none on both surfaces.
 */
const CASES: Readonly<Record<ResumeTemplate, readonly Case[]>> = {
  professional: [
    exactly('professional title', MARK.title, PREVIEW_TRACKING.professional.title),
    headings(PREVIEW_TRACKING.professional.heading),
  ],
  modern: [
    exactly('name', MARK.name, PREVIEW_TRACKING.modern.name),
    exactly('job title bar', MARK.title, PREVIEW_TRACKING.modern.jobTitleBar),
    headings(PREVIEW_TRACKING.modern.sectionHeading),
    anyOf('contact labels', MODERN_CONTACT_LABELS, PREVIEW_TRACKING.modern.contactLabel),
    anyOf('skill categories', [MARK.skillCategory, MARK.secondSkillCategory], PREVIEW_TRACKING.modern.skillCategory),
  ],
  classic: [exactly('CV title', MARK.title, PREVIEW_TRACKING.classic.title)],
  minimal: [
    exactly('CV title', MARK.title, PREVIEW_TRACKING.minimal.title),
    headings(PREVIEW_TRACKING.minimal.heading),
  ],
  creative: [exactly('header title', MARK.title, PREVIEW_TRACKING.creative.title)],
}

/**
 * The twips a run must carry for a Preview letter spacing: em times the run's
 * font size, in twentieths of a point. The size is in half-points, and a
 * half-point is ten twentieths of a point (a CSS px is halfPoints / 1.5, worth
 * px x 0.75 x 20 twips, the same number).
 */
const expectedSpacing = (em: number, halfPoints: number) => Math.round(em * halfPoints * 10)

const TEMPLATES = Object.keys(CASES) as ResumeTemplate[]
const SCALES = [0.8, 1, 1.2] as const

describe.each(TEMPLATES)('%s DOCX letter spacing', (template) => {
  describe.each(SCALES)('at font scale %s', (fontScale) => {
    it('gives every spaced element the Preview letter spacing at its own run size', async () => {
      const runs = await runsOf(template, fontScale)
      const seen = new Set<string>()
      for (const run of runs) {
        const claims = CASES[template].filter((c) => c.matches(run.text))
        expect(claims.length, `"${run.text}" is claimed by ${claims.map((c) => c.label).join(' and ')}`).toBeLessThanOrEqual(1)
        if (claims.length === 0) {
          expect(run.spacing, `"${run.text}" draws no letter spacing in the Preview`).toBeNull()
          continue
        }
        seen.add(claims[0].label)
        expect(run.spacing, `${claims[0].label}: "${run.text}" at ${run.halfPoints} half-points`).toBe(
          expectedSpacing(claims[0].em, run.halfPoints),
        )
      }
      expect([...seen].sort(), 'every element this template spaces was found in the document').toEqual(
        CASES[template].map((c) => c.label).sort(),
      )
    })
  })

  it('scales the letter spacing with the font scale', async () => {
    const [base, scaled] = await Promise.all([1, 1.2].map((scale) => runsOf(template, scale)))
    for (const c of CASES[template]) {
      const spacingOf = (runs: readonly Run[]) => {
        const run = runs.find((r) => c.matches(r.text))
        if (!run) throw new Error(`${template}: no run for ${c.label}`)
        return run.spacing ?? 0
      }
      const [a, b] = [spacingOf(base), spacingOf(scaled)]
      if (c.em === 0) continue
      expect(Math.abs(b), `${c.label}: spacing at 1.2 against 1`).toBeGreaterThan(Math.abs(a))
      expect(Math.sign(b), `${c.label}: sign of the spacing`).toBe(Math.sign(c.em))
    }
  })
})
