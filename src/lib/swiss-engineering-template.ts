import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import type { ResumeProject } from '@/types/database'
import { formatSwissDateRange, swissHasText } from '@/lib/swiss-vocational-template'
import { swissTradesSkillContent } from '@/lib/swiss-trades-template'

/**
 * What the "Ingénierie & technique" template (`swissEngineering`) draws, stated
 * once for its two outputs: `swiss-engineering-template.tsx`, which the Editor,
 * the Preview and the PDF render, and `docx-swiss-engineering.ts`, the Word
 * export. Each imports its sizes, its geometry, its section sequences and its
 * joined text from here, so the two cannot drift apart.
 *
 * The words it draws that are not resume content (headings, dates, level
 * names) and the content tests it shares with the other Swiss templates are
 * read from `@/lib/swiss-vocational-template` and `@/lib/swiss-trades-template`,
 * not restated.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The type sizes, in CSS px at page scale.
 *
 * No size setting applies to this template: no per-property size
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissEngineering` is empty) and not the layout
 * model's font scale, which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_ENGINEERING_SIZES = {
  name: 30,
  title: 15,
  /** Every section heading, in both columns. */
  heading: 13,
  /** The main column's running text, entry lines and project cards. */
  body: 13,
  /** The dates at the right of an experience's first line. */
  date: 12,
  /** Every line of the light column: contact, education, skills, languages, certifications. */
  column: 12,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_ENGINEERING_GEOMETRY = {
  /**
   * The light column down the right of the page: its width, the blue bar on
   * its left edge included — 31.5% of the page, a little wider than the
   * mockup's 30% so the long words of every locale fit its lines whole.
   */
  columnWidth: 250,
  columnBar: 4,
  /** The light column's padding: left and right (inside the bar), then at its top and foot. */
  columnPaddingX: 22,
  columnPaddingTop: 44,
  columnPaddingBottom: 44,
  /** The round photo's diameter and its light ring's width. */
  photo: 120,
  photoRing: 2,
  /** Space between the photo and the first section of the light column. */
  photoGap: 28,
  /** Space between two sections of the light column. */
  columnSectionGap: 22,
  /** Space between two entries of a list in the light column (education, skill categories). */
  columnEntryGap: 8,
  /** Space between two lines of a list in the light column (contact, skills, languages, certifications). */
  columnRowGap: 3,
  /** Space between a skill category's caption and its skills. */
  skillCaptionGap: 2,
  /** The main column's padding: left, right, then at its top and foot. */
  mainPaddingLeft: 48,
  mainPaddingRight: 32,
  mainPaddingTop: 48,
  mainPaddingBottom: 48,
  /**
   * The printed page's margins, top and foot, in the PDF and in Word (the
   * section's margins), so both break their pages at the same place: every
   * page keeps `pageTop` above its text and `pageBottom` below it. In print
   * they are the document's own padding repeated on every page
   * (`box-decoration-break: clone` in globals.css), not `@page` margins,
   * which Chromium paints no background into and so would cut the light
   * column and its bar short of the paper's edges; the columns' own top and
   * foot padding gives way to them. They equal the main column's padding, so
   * page 1's main column prints as the screen draws it; the light column
   * keeps its higher start (`columnPaddingTop`) on page 1 by a negative top
   * margin.
   */
  pageTop: 48,
  pageBottom: 48,
  /** Space under the name, and between the CV title and the first section. */
  nameGap: 4,
  titleGap: 26,
  /** Space between two sections of the main column. */
  sectionGap: 24,
  /** Space between a heading and its first line, in either column. */
  headingGap: 10,
  /**
   * A project card: its thin border, the thick bar on its left edge, its
   * padding across (inside the bar) and down, its corner radius, and the space
   * between two cards.
   */
  cardBorder: 1,
  cardBar: 4,
  cardPaddingX: 14,
  cardPaddingY: 9,
  cardRadius: 4,
  cardGap: 8,
  /** Space between two entries of the experience. */
  entryGap: 12,
  /** The gap between an entry's first line and the dates at its right. */
  dateGap: 16,
  /** The space above an entry's bullets or description, and the bullets' hanging indent. */
  detailGap: 4,
  bulletIndent: 20,
} as const

/**
 * The width the light column leaves for text, in CSS px: its width less the
 * bar and the padding on each side. Every word of a line in that column is
 * drawn whole when it is no wider than this (`swiss-engineering-template.test.ts`
 * measures the long words of each locale against it).
 */
export const SWISS_ENGINEERING_COLUMN_TEXT_WIDTH =
  SWISS_ENGINEERING_GEOMETRY.columnWidth - SWISS_ENGINEERING_GEOMETRY.columnBar - 2 * SWISS_ENGINEERING_GEOMETRY.columnPaddingX

/**
 * The main column's sections, top to bottom, as `t6-ingenierie.png` draws them.
 * `keyAchievements` is the model's id for the projects, drawn as cards under
 * the existing "Key achievements" heading (FR-6).
 */
export const SWISS_ENGINEERING_MAIN_COLUMN = ['summary', 'keyAchievements', 'experience'] as const

/**
 * The light column's sections under the photo and the contact details, top to
 * bottom, as the mockup draws them. `training` is the model's id for the
 * certifications.
 */
export const SWISS_ENGINEERING_SIDE_COLUMN = ['education', 'skills', 'languages', 'training'] as const

export type SwissEngineeringMainSectionId = (typeof SWISS_ENGINEERING_MAIN_COLUMN)[number]
export type SwissEngineeringSideSectionId = (typeof SWISS_ENGINEERING_SIDE_COLUMN)[number]

/** The sections the editor's main-content panel can hide on this template, in the order it draws them. */
export const SWISS_ENGINEERING_MAIN_SECTIONS = ['summary', 'experience', 'education'] as const satisfies readonly EditorMainId[]

/** The sections the editor's sidebar panel can hide on this template, in the order it draws them. */
export const SWISS_ENGINEERING_SIDEBAR_SECTIONS = ['keyAchievements', 'skills', 'languages', 'training'] as const satisfies readonly EditorSidebarId[]

const HIDEABLE_MAIN: readonly string[] = SWISS_ENGINEERING_MAIN_SECTIONS

/**
 * The sections drawn in each column, in the template's fixed order, less those
 * the layout model hides (FR-2): summary, experience and education through
 * `hiddenMainSections`; the projects (`keyAchievements`), skills, languages and
 * certifications, which are SIDEBAR ids in the model, through
 * `hiddenSidebarSections`, whatever template hid them. These are the rows the
 * editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissEngineering`), so the stored ORDER is not read.
 *
 * Whether a drawn section has any content is each output's own test on the
 * same visible items, and an empty one draws no heading.
 */
export function swissEngineeringSections(
  hiddenMainSections: readonly string[],
  hiddenSidebarSections: readonly string[],
): { main: SwissEngineeringMainSectionId[]; side: SwissEngineeringSideSectionId[] } {
  const shown = (sectionId: string) =>
    HIDEABLE_MAIN.includes(sectionId) ? !hiddenMainSections.includes(sectionId) : !hiddenSidebarSections.includes(sectionId)
  return {
    main: SWISS_ENGINEERING_MAIN_COLUMN.filter(shown),
    side: SWISS_ENGINEERING_SIDE_COLUMN.filter(shown),
  }
}

/** What joins the parts of an education's or a certificate's line, and a project's technologies, as the mockup joins them. */
export const SWISS_ENGINEERING_SEPARATOR = ', '

/**
 * An entry's dates as `MM.YYYY – MM.YYYY`, or "MM.YYYY – present" while it is
 * current, through the Swiss helper every Swiss template uses; empty when the
 * entry stores no date at all and is not current, so an undated entry is not
 * labelled "present" (FR-1: nothing is drawn that is not stored).
 */
export function swissEngineeringDates(
  startDate: string | undefined,
  endDate: string | undefined,
  current: boolean,
  dict: unknown,
): string {
  if (!startDate?.trim() && !endDate?.trim() && !current) return ''
  return formatSwissDateRange(startDate?.trim() || undefined, endDate?.trim() || undefined, current, dict)
}

/**
 * An education's two lines in the light column, as the mockup draws them: the
 * degree in bold, then "school, field, dates" below. With no degree, the school
 * (and field) is the bold line and the dates the line below, so the entry still
 * opens with a heading of its own. A part that is not stored leaves no empty
 * line and no dangling separator (FR-2); both are empty when nothing is stored.
 */
export function swissEngineeringEducationLines(parts: {
  degree?: string
  school?: string
  field?: string
  dates: string
}): { lead: string; detail: string } {
  const degree = parts.degree?.trim() ?? ''
  const school = [parts.school?.trim(), parts.field?.trim()].filter((part): part is string => Boolean(part))
  if (degree) {
    return { lead: degree, detail: [...school, parts.dates].filter(Boolean).join(SWISS_ENGINEERING_SEPARATOR) }
  }
  return { lead: school.join(SWISS_ENGINEERING_SEPARATOR), detail: parts.dates }
}

/**
 * A certificate's line, as the mockup draws it ("Registre REG A, 2022"): its
 * name, issuer and month, each only when stored, joined by ", ". Empty when
 * none is stored.
 */
export function swissEngineeringCertificateLine(name: string | undefined, issuer: string | undefined, month: string): string {
  return [name?.trim(), issuer?.trim(), month].filter((part): part is string => Boolean(part)).join(SWISS_ENGINEERING_SEPARATOR)
}

/**
 * What a project's card draws, or null when it draws nothing and has no card
 * (FR-2): its name in bold; its description, rich text; its technologies on one
 * muted line joined by ", "; its link on a muted line. The mockup draws the
 * name and the description; the technologies and the link are stored content
 * the editor's Projects tab collects, so they are drawn rather than dropped
 * (FR-1). The project's dates are not drawn: no template of the platform draws
 * them, and the mockup's card has none.
 */
export function swissEngineeringProject(project: Pick<ResumeProject, 'name' | 'description' | 'url' | 'technologies'>): {
  name: string
  description: string | null
  technologies: string
  url: string
} | null {
  const name = project.name?.trim() ?? ''
  const description = swissHasText(project.description) ? project.description : null
  const technologies = (project.technologies ?? [])
    .map((technology) => (typeof technology === 'string' ? technology.trim() : ''))
    .filter((technology) => technology !== '')
    .join(SWISS_ENGINEERING_SEPARATOR)
  const url = project.url?.trim() ?? ''
  if (!name && !description && !technologies && !url) return null
  return { name, description, technologies, url }
}

/**
 * What a skill category draws under its caption in the light column, or null
 * when it draws nothing and is left out (FR-2):
 * - `lines`: its skills one per line, as the mockup lists them — its legacy
 *   `items` when it has no rich text, or its rich text when that is a plain
 *   comma-separated list, read exactly as `swissTrades` reads it into tags;
 * - `html`: any other rich text, drawn through each output's sanitizing
 *   rich-text helpers so no formatting or line break is lost (FR-9).
 *
 * The mockup draws a level bar under each skill; the platform stores no level
 * per skill, so none is drawn (PRD out of scope). The stored rich text wins
 * over `items`, as on every template.
 */
export function swissEngineeringSkillContent(skill: {
  items?: readonly string[]
  skillsHtml?: string
}): { kind: 'lines'; lines: string[] } | { kind: 'html'; html: string } | null {
  const content = swissTradesSkillContent(skill)
  if (content === null) return null
  if (content.kind === 'html') return content
  return { kind: 'lines', lines: content.tags }
}
