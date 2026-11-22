import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import { georgiaTextWidthPx } from '@/lib/georgia-advance-widths'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { swissTradesSkillContent } from '@/lib/swiss-trades-template'

/**
 * What the "Banque, finance & assurance" template (`swissFinance`) draws,
 * stated once for its two outputs: `swiss-finance-template.tsx`, which the
 * Editor, the Preview and the PDF render, and `docx-swiss-finance.ts`, the Word
 * export. Each imports its sizes, its geometry, its section sequence and its
 * joined text from here, so the two cannot drift apart.
 *
 * The words it draws that are not resume content (headings, dates, level
 * names) and the content tests it shares with the other Swiss templates are
 * read from `@/lib/swiss-vocational-template`, not restated.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The type sizes, in CSS px at page scale.
 *
 * No size setting applies to this template: no per-property size
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissFinance` is empty) and not the layout
 * model's font scale, which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_FINANCE_SIZES = {
  name: 32,
  title: 16,
  contact: 12,
  /** A section heading's spaced capitals. */
  heading: 13,
  body: 13,
  /** The dates at the right of a dated entry. */
  date: 13,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_FINANCE_GEOMETRY = {
  /** The page's padding: left and right, then at its top and foot. */
  paddingX: 60,
  paddingTop: 50,
  paddingBottom: 50,
  /** The rectangular photo at the right of the header, and its thin border. */
  photoWidth: 96,
  photoHeight: 120,
  photoBorder: 1,
  /** The gap between the name block and the photo. */
  photoGap: 24,
  /** Space under the name, and under the CV title. */
  nameGap: 6,
  titleGap: 10,
  /**
   * The double rule under the header: its total width (two lines and the gap
   * between them, as CSS `double` divides it), and the space above it.
   */
  headerRule: 3,
  headerRuleGap: 16,
  /** Space between the header's rule and the first section. */
  headerGap: 24,
  /** Space between two sections. */
  sectionGap: 22,
  /** A heading's thin rule: its width, the space between the text and it, and the space under it. */
  headingRule: 1,
  headingRuleGap: 4,
  headingGap: 10,
  /** The right column of a dated entry, holding its dates; its left padding is the gap before them. */
  dateColumn: 150,
  dateGap: 16,
  /** Space between two entries of a section. */
  entryGap: 10,
  /** The space above an entry's bullets or description, and the bullets' hanging indent. */
  detailGap: 4,
  bulletIndent: 20,
  /**
   * The label column of the skills and languages table sizes to its labels
   * (`swissFinanceLabelColumnPx`), up to this share of the text width so the
   * values keep room; `labelGap` separates it from the values.
   */
  labelMaxFraction: 0.38,
  /**
   * The share of the text width the label column never exceeds, whatever it
   * holds: a single word wider than `labelMaxFraction` widens the column up
   * to here, and only a word wider than this is broken, so the value column
   * keeps at least `SWISS_FINANCE_MIN_VALUE_PX`.
   */
  labelHardMaxFraction: 0.5,
  labelGap: 16,
  /** Space between two rows of that table. */
  rowGap: 4,
} as const

/** The width the page's padding leaves for text, in CSS px. */
export const SWISS_FINANCE_TEXT_WIDTH = PAGE_WIDTH_PX - 2 * SWISS_FINANCE_GEOMETRY.paddingX

/** The widest the label column ever is, in CSS px: `labelHardMaxFraction` of the text width. */
export const SWISS_FINANCE_LABEL_MAX_PX = Math.floor(SWISS_FINANCE_GEOMETRY.labelHardMaxFraction * SWISS_FINANCE_TEXT_WIDTH)

/** The narrowest the value column ever is, in CSS px: what the widest label column and the gap leave. */
export const SWISS_FINANCE_MIN_VALUE_PX = SWISS_FINANCE_TEXT_WIDTH - SWISS_FINANCE_LABEL_MAX_PX - SWISS_FINANCE_GEOMETRY.labelGap

/**
 * The CSS track the Preview gives the label column: `fit-content` of the cap,
 * which CSS resolves to max(min-content, min(cap, max-content)) — as wide as
 * the widest label, no wider than the cap unless one word alone is wider, in
 * which case the column takes that word's width. Each label is at most
 * `SWISS_FINANCE_LABEL_MAX_PX` wide, which bounds both contributions, so the
 * track never passes it.
 */
export const SWISS_FINANCE_LABEL_TRACK = `fit-content(${SWISS_FINANCE_GEOMETRY.labelMaxFraction * 100}%)`

/**
 * Where a label may wrap: at ASCII whitespace only, as CSS wraps. A no-break
 * space (U+00A0) holds its two words together, so it is not one of these.
 */
const LABEL_BREAK = /[ \t\n\r\f]+/

/**
 * The width, in CSS px, of the label column holding `labels` set bold at
 * `px`: the rule `SWISS_FINANCE_LABEL_TRACK` gives the Preview, computed from
 * Georgia's advance widths for an output that cannot lay text out itself, and
 * bounded by `SWISS_FINANCE_LABEL_MAX_PX` as the Preview's labels are.
 * Word splits a word wider than its cell, so the Word export sizes the cell
 * with this. The widths are unkerned, so below the bound the result is never
 * narrower than the browser's column; it is rounded up to a whole px.
 */
export function swissFinanceLabelColumnPx(labels: readonly string[], px: number): number {
  const width = (text: string) => georgiaTextWidthPx(text, 'bold', px)
  const maxContent = Math.max(0, ...labels.map(width))
  const minContent = Math.max(0, ...labels.flatMap((label) => label.split(LABEL_BREAK)).map(width))
  const cap = SWISS_FINANCE_GEOMETRY.labelMaxFraction * SWISS_FINANCE_TEXT_WIDTH
  return Math.min(SWISS_FINANCE_LABEL_MAX_PX, Math.ceil(Math.max(minContent, Math.min(cap, maxContent))))
}

/**
 * The template's sections, top to bottom, as `t5-finance.png` draws them.
 * `training` is the model's id for the certifications. `skills` and
 * `languages` are drawn together, as the rows of one table under one heading.
 */
export const SWISS_FINANCE_SECTIONS = ['summary', 'experience', 'education', 'training', 'skills', 'languages'] as const

export type SwissFinanceSectionId = (typeof SWISS_FINANCE_SECTIONS)[number]

/** The sections the editor's main-content panel can hide on this template, in the order it draws them. */
export const SWISS_FINANCE_MAIN_SECTIONS = ['summary', 'experience', 'education'] as const satisfies readonly EditorMainId[]

/** The sections the editor's sidebar panel can hide on this template, in the order it draws them. */
export const SWISS_FINANCE_SIDEBAR_SECTIONS = ['training', 'skills', 'languages'] as const satisfies readonly EditorSidebarId[]

const HIDEABLE_SIDEBAR: readonly SwissFinanceSectionId[] = SWISS_FINANCE_SIDEBAR_SECTIONS

/**
 * The sections drawn, in the template's fixed order, less those the layout
 * model hides (FR-2): summary, experience and education through
 * `hiddenMainSections`; certifications, skills and languages, which are
 * SIDEBAR ids in the model, through `hiddenSidebarSections`, whatever template
 * hid them. These are the rows the editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissFinance`), so the stored ORDER is not read.
 *
 * Whether a drawn section has any content is each output's own test on the
 * same visible items, and an empty one draws no heading.
 */
export function swissFinanceSections(
  hiddenMainSections: readonly string[],
  hiddenSidebarSections: readonly string[],
): SwissFinanceSectionId[] {
  return SWISS_FINANCE_SECTIONS.filter((sectionId) =>
    HIDEABLE_SIDEBAR.includes(sectionId) ? !hiddenSidebarSections.includes(sectionId) : !hiddenMainSections.includes(sectionId),
  )
}

/** What joins the parts of an entry's first line, the skills of a category, and the languages, as the mockup joins them. */
export const SWISS_FINANCE_SEPARATOR = ', '

/** What joins the contact details on their line, as the mockup joins them. */
export const SWISS_FINANCE_CONTACT_SEPARATOR = ' · '

/** What joins the skills and languages labels into the heading of their shared table. */
export const SWISS_FINANCE_HEADING_JOIN = ' & '

/**
 * An entry's first line: its stored parts that are not empty, the first drawn
 * bold and the rest after it joined by ", " — so an entry with no position or
 * degree opens with its employer or school in bold, and no empty part leaves a
 * dangling comma (FR-2). `rest` is empty when there is one part, and both are
 * empty when there is none.
 */
export function swissFinanceFirstLine(parts: readonly (string | null | undefined)[]): { lead: string; rest: string } {
  const filled = parts.map((part) => part?.trim() ?? '').filter((part) => part !== '')
  if (filled.length === 0) return { lead: '', rest: '' }
  return { lead: filled[0], rest: filled.slice(1).map((part) => `${SWISS_FINANCE_SEPARATOR}${part}`).join('') }
}

/** A language with its level in the locale's words (FR-7), as the mockup draws it: "Allemand (Langue maternelle)". */
export function swissFinanceLanguage(language: string, level: string): string {
  return `${language} (${level})`
}

/** The languages row's value: every visible language with its level, joined by ", ". */
export function swissFinanceLanguagesLine(languages: readonly { language: string; level: string }[]): string {
  return languages.map(({ language, level }) => swissFinanceLanguage(language, level)).join(SWISS_FINANCE_SEPARATOR)
}

/**
 * The heading of the skills and languages table, from the existing labels
 * only (FR-6): both joined by " & " when the table holds both, as the mockup's
 * "Compétences & Langues", or the one it holds alone.
 */
export function swissFinanceSkillsHeading(skillsLabel: string, languagesLabel: string, hasSkills: boolean, hasLanguages: boolean): string {
  return [hasSkills ? skillsLabel : null, hasLanguages ? languagesLabel : null].filter((label) => label !== null).join(SWISS_FINANCE_HEADING_JOIN)
}

/**
 * What a skill category draws in the value cell of its row, or null when it
 * draws nothing and has no row (FR-2):
 * - `text`: its skills as one line joined by ", " — its legacy `items` when it
 *   has no rich text, or its rich text when that is a plain comma-separated
 *   list, read exactly as `swissTrades` reads it;
 * - `html`: any other rich text, drawn through each output's sanitizing
 *   rich-text helpers so no formatting or line break is lost (FR-9).
 *
 * The stored rich text wins over `items`, as on every template.
 */
export function swissFinanceSkillContent(skill: {
  items?: readonly string[]
  skillsHtml?: string
}): { kind: 'text'; text: string } | { kind: 'html'; html: string } | null {
  const content = swissTradesSkillContent(skill)
  if (content === null) return null
  if (content.kind === 'html') return content
  return { kind: 'text', text: content.tags.join(SWISS_FINANCE_SEPARATOR) }
}
