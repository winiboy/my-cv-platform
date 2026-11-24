import type { ResumeContact, ResumeLanguage } from '@/types/database'
import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import { contactLabel, presentLabel, type ContactLabelKey } from '@/lib/resume-template-strings'

/**
 * What the "Formation professionnelle (CFC)" template (`swissVocational`) draws,
 * stated once for its two outputs: `swiss-vocational-template.tsx`, which the
 * Editor, the Preview and the PDF render, and `docx-swiss-vocational.ts`, the
 * Word export. Each imports its sizes, its section sequence and every word it
 * draws that is not resume content from here, so the two cannot drift apart.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The type sizes, in CSS px at page scale.
 *
 * No size setting applies to this template: no per-property size
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissVocational` is empty) and not the layout
 * model's font scale, which a Swiss template ignores in every output (FR-4).
 * These are its design.
 */
export const SWISS_VOCATIONAL_SIZES = {
  name: 30,
  title: 15,
  contact: 12,
  heading: 13,
  body: 13,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_VOCATIONAL_GEOMETRY = {
  /** The page's padding, left and right. */
  paddingX: 56,
  /** The page's padding, top and bottom. */
  paddingY: 48,
  /** The left column that dated rows put their dates in. */
  dateColumn: 128,
  /** The contact grid: each label's column and the gap after it. */
  contactLabel: 80,
  contactLabelGap: 12,
  /** The gap between the two label and value pairs of a contact row. */
  contactPairGap: 24,
  /** The photo, top right of the header. */
  photoWidth: 110,
  photoHeight: 140,
  /** The gap between the header text and the photo. */
  photoGap: 24,
  /** The dark rule under the header. */
  headerRule: 2,
  /** Space between the header rule and the first section, and between sections. */
  sectionGap: 22,
  /** Space between a section heading's rule and its first entry. */
  headingGap: 12,
  /** Space between two entries of a section. */
  entryGap: 12,
  /** The gap between the skills and the languages columns. */
  columnGap: 40,
  /** Space between two skill categories: larger than `skillLabelGap`, so each label reads with its own skills. */
  skillGap: 10,
  /** Space between a skill category's label and the skills under it. */
  skillLabelGap: 2,
} as const

/**
 * The template's sections, top to bottom. `skillsAndLanguages` is the two-column
 * block that closes the page.
 */
export const SWISS_VOCATIONAL_SECTIONS = [
  'summary',
  'experience',
  'education',
  'training',
  'skillsAndLanguages',
] as const

export type SwissVocationalSectionId = (typeof SWISS_VOCATIONAL_SECTIONS)[number]

/** The sections the editor's main-content panel can hide on this template. */
const HIDEABLE_MAIN: readonly SwissVocationalSectionId[] = ['summary', 'experience', 'education'] satisfies readonly EditorMainId[]

/** What the template draws, after the layout model's section visibility. */
export interface SwissVocationalVisibility {
  /** The sections drawn, in the template's fixed order. */
  sections: SwissVocationalSectionId[]
  /** Whether the skills column of `skillsAndLanguages` is drawn. */
  skills: boolean
  /** Whether the languages column of `skillsAndLanguages` is drawn. */
  languages: boolean
}

/**
 * The sections drawn, in the template's fixed order, less those the layout
 * model hides (FR-2).
 *
 * Summary, experience and education are hidden through `hiddenMainSections`;
 * training, skills and languages are SIDEBAR ids in the model and are hidden
 * through `hiddenSidebarSections`, whatever template hid them. These are the
 * rows the editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissVocational`). The stored ORDER is not read,
 * because no control offers to reorder this template's sections. The skills
 * and languages block is dropped only when both of its columns are hidden.
 *
 * Whether a drawn section has any content is each output's own test on the
 * same visible items, and an empty one draws no heading.
 */
export function swissVocationalVisibility(
  hiddenMainSections: readonly string[],
  hiddenSidebarSections: readonly string[],
): SwissVocationalVisibility {
  const skills = !hiddenSidebarSections.includes('skills' satisfies EditorSidebarId)
  const languages = !hiddenSidebarSections.includes('languages' satisfies EditorSidebarId)
  const training = !hiddenSidebarSections.includes('training' satisfies EditorSidebarId)
  const sections = SWISS_VOCATIONAL_SECTIONS.filter((sectionId) => {
    if (HIDEABLE_MAIN.includes(sectionId)) return !hiddenMainSections.includes(sectionId)
    if (sectionId === 'training') return training
    return skills || languages
  })
  return { sections, skills, languages }
}

/** A stored month: `YYYY-MM`, optionally followed by a day, as the editor's month inputs store it. */
const STORED_MONTH = /^(\d{4})-(\d{2})(?:-\d{2})?$/

/**
 * A stored month as the template prints it: `MM.YYYY`, the Swiss convention the
 * mockup draws, in every locale.
 *
 * Read from the string rather than through `Date`, so no time zone can move it
 * to the previous month and the browser (Preview, PDF) and the server (Word)
 * cannot disagree. A value that is not a stored month is printed as stored,
 * rather than as "Invalid Date".
 */
export function formatSwissMonth(month: string): string {
  const match = STORED_MONTH.exec(month.trim())
  return match ? `${match[2]}.${match[1]}` : month
}

/**
 * The date column of a dated row: `start – end`, the end being the localized
 * "present" for a current entry or one with no end date, as every template
 * draws it. A row with no start date shows its end alone.
 */
export function formatSwissDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  current: boolean,
  dict: unknown,
): string {
  const end = current || !endDate ? presentLabel(dict) : formatSwissMonth(endDate)
  return startDate ? `${formatSwissMonth(startDate)} \u2013 ${end}` : end
}

/**
 * Whether stored text draws anything: rich text with no characters once its
 * markup and non-breaking spaces are gone — an emptied editor's `<p></p>` or
 * `<p><br></p>` — draws nothing, and must not leave a heading or a row label
 * with nothing beside it (FR-2). The test is the same for both outputs.
 */
export function swissHasText(value: string | null | undefined): value is string {
  if (!value) return false
  const text = value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;|\u00A0/gi, ' ')
    .trim()
  return text !== ''
}

/**
 * A language level in the locale's words (`resumes.editor.levels`), falling
 * back to the stored value exactly as the existing templates do.
 */
export function swissLanguageLevel(dict: unknown, level: ResumeLanguage['level']): string {
  const levels = (dict as { resumes?: { editor?: { levels?: Record<string, unknown> } } }).resumes?.editor?.levels
  const label = levels?.[level.toLowerCase()]
  return typeof label === 'string' && label !== '' ? label : level
}

/** The contact fields the header grid shows, in its reading order. */
const CONTACT_FIELDS: readonly ContactLabelKey[] = ['location', 'phone', 'email', 'linkedin', 'github', 'website']

export interface SwissContactEntry {
  key: ContactLabelKey
  label: string
  value: string
}

/** The filled contact fields, each with its localized label, in the grid's reading order. */
export function swissContactEntries(contact: ResumeContact, dict: unknown): SwissContactEntry[] {
  return CONTACT_FIELDS.flatMap((key) => {
    const value = contact[key]
    return typeof value === 'string' && value.trim() !== ''
      ? [{ key, label: contactLabel(dict, key), value }]
      : []
  })
}

/**
 * The section headings, from the existing `resumes.template` labels (FR-6). A
 * missing label is a translation defect, so it throws rather than falling back
 * to another language, as `presentLabel` does.
 */
export function swissHeading(
  dict: unknown,
  key: 'summary' | 'experience' | 'education' | 'training' | 'skills' | 'languages' | 'keyAchievements' | 'projects',
): string {
  const label = (dict as { resumes?: { template?: Record<string, unknown> } }).resumes?.template?.[key]
  if (typeof label !== 'string' || label === '') {
    throw new Error(`Missing translation common.json resumes.template.${key}`)
  }
  return label
}

/**
 * What a skill row draws under its category label, or null when it draws nothing
 * and the row is left out: its stored rich text when that has any text,
 * otherwise its legacy `items`, joined as every template joins them.
 */
export function swissSkillContent(skill: { items?: readonly string[]; skillsHtml?: string }):
  | { kind: 'html'; html: string }
  | { kind: 'items'; text: string }
  | null {
  if (swissHasText(skill.skillsHtml)) return { kind: 'html', html: skill.skillsHtml }
  const items = (skill.items ?? []).filter((item) => item.trim() !== '')
  return items.length > 0 ? { kind: 'items', text: items.join(', ') } : null
}
