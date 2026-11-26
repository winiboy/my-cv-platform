import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import { swissTradesSkillContent } from '@/lib/swiss-trades-template'

/**
 * What the "Santé & social" template (`swissHealth`) draws, stated once for its
 * two outputs: `swiss-health-template.tsx`, which the Editor, the Preview and
 * the PDF render, and `docx-swiss-health.ts`, the Word export. Each imports its
 * sizes, its geometry, its section sequence and its skill text from here, so
 * the two cannot drift apart.
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
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissHealth` is empty) and not the layout
 * model's font scale, which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_HEALTH_SIZES = {
  name: 30,
  title: 15,
  contact: 12,
  /** A section heading's text, inside its pill. */
  pill: 12,
  body: 13,
  /** The dates in an entry's left column. */
  date: 12,
  /** A skill category's caption above its skills. */
  skillCaption: 12,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_HEALTH_GEOMETRY = {
  /** The page's padding: left and right, then at its top and foot. */
  paddingX: 52,
  paddingTop: 44,
  paddingBottom: 48,
  /**
   * The printed page's margins, top and foot, in the PDF (globals.css) and in
   * Word (the section's margins), so both break their pages at the same
   * place: every page keeps `pageBottom` at its foot, and every page but the
   * first keeps `pageTop` at its top. Page 1's top stays `paddingTop`, as the
   * screen draws it: in Word the header floats there. In the PDF the
   * document's own padding is repeated on every page (`paddingBottom` equals
   * `pageBottom`), and every page but the first adds a page margin of
   * `pageTop - paddingTop` above it (`@page swiss-health`).
   */
  pageTop: 48,
  pageBottom: 48,
  /** The round photo's diameter and its light ring's width. */
  photo: 112,
  photoRing: 2,
  /** The gap between the photo and the name block beside it. */
  photoGap: 24,
  /** Space under the name, and under the CV title. */
  nameGap: 4,
  titleGap: 10,
  /** The gap between two contact details on their line. */
  contactGap: 16,
  /** Space between the header and the first section. */
  headerGap: 30,
  /** Space between two sections. */
  sectionGap: 20,
  /** A heading pill: its padding, across and down, and the space under it. */
  pillPaddingX: 12,
  pillPaddingY: 6,
  headingGap: 12,
  /**
   * A heading pill's corner radius: larger than any pill is tall, so its ends
   * are half-circles at every height, as the mockup draws them.
   */
  pillRadius: 9999,
  /**
   * The left column of an entry, holding its dates: its width from the bar's
   * outer edge, the bar's width, and the space between the bar and the dates.
   */
  dateColumn: 138,
  entryBar: 2,
  datePaddingLeft: 12,
  /** Space between two entries of a section. */
  entryGap: 10,
  /** The space above an entry's bullets or description, and the bullets' hanging indent. */
  detailGap: 4,
  bulletIndent: 20,
  /** The gap between the skills and the languages columns. */
  columnGap: 30,
  /** Space between two skill categories, and between a category's caption and its skills. */
  skillCategoryGap: 8,
  skillCaptionGap: 2,
} as const

/**
 * The template's sections, top to bottom, as `t4-sante-social.png` draws them.
 * `training` is the model's id for the certifications, which the mockup calls
 * continuing education. `skills` and `languages` are drawn side by side.
 */
export const SWISS_HEALTH_SECTIONS = ['summary', 'education', 'experience', 'training', 'skills', 'languages'] as const

export type SwissHealthSectionId = (typeof SWISS_HEALTH_SECTIONS)[number]

/** The sections the editor's main-content panel can hide on this template, in the order it draws them. */
export const SWISS_HEALTH_MAIN_SECTIONS = ['summary', 'education', 'experience'] as const satisfies readonly EditorMainId[]

/** The sections the editor's sidebar panel can hide on this template, in the order it draws them. */
export const SWISS_HEALTH_SIDEBAR_SECTIONS = ['training', 'skills', 'languages'] as const satisfies readonly EditorSidebarId[]

const HIDEABLE_MAIN: readonly SwissHealthSectionId[] = SWISS_HEALTH_MAIN_SECTIONS
const HIDEABLE_SIDEBAR: readonly SwissHealthSectionId[] = SWISS_HEALTH_SIDEBAR_SECTIONS

/**
 * The sections drawn, in the template's fixed order, less those the layout
 * model hides (FR-2): summary, education and experience through
 * `hiddenMainSections`; certifications, skills and languages, which are
 * SIDEBAR ids in the model, through `hiddenSidebarSections`, whatever template
 * hid them. These are the rows the editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissHealth`), so the stored ORDER is not read.
 *
 * Whether a drawn section has any content is each output's own test on the
 * same visible items, and an empty one draws no heading.
 */
export function swissHealthSections(
  hiddenMainSections: readonly string[],
  hiddenSidebarSections: readonly string[],
): SwissHealthSectionId[] {
  return SWISS_HEALTH_SECTIONS.filter((sectionId) => {
    if (HIDEABLE_MAIN.includes(sectionId)) return !hiddenMainSections.includes(sectionId)
    if (HIDEABLE_SIDEBAR.includes(sectionId)) return !hiddenSidebarSections.includes(sectionId)
    return true
  })
}

/**
 * A language line: the language, then its level in the locale's words (FR-7),
 * as the mockup draws it. Both outputs draw exactly this string.
 */
export function swissHealthLanguageLine(language: string, level: string): string {
  return `${language} — ${level}`
}

/** What joins two skills, and an experience's title to its employer, as the mockup joins them. */
export const SWISS_HEALTH_SEPARATOR = ' · '

/**
 * What a skill category draws under its caption, or null when it draws
 * nothing and is left out (FR-2):
 * - `text`: its skills as one line of running text joined by " · " — its
 *   legacy `items` when it has no rich text, or its rich text when that is a
 *   plain comma-separated list, read exactly as `swissTrades` reads it into tags;
 * - `html`: any other rich text, drawn through each output's sanitizing
 *   rich-text helpers so no formatting or line break is lost (FR-9).
 *
 * The stored rich text wins over `items`, as on every template.
 */
export function swissHealthSkillContent(skill: {
  items?: readonly string[]
  skillsHtml?: string
}): { kind: 'text'; text: string } | { kind: 'html'; html: string } | null {
  const content = swissTradesSkillContent(skill)
  if (content === null) return null
  if (content.kind === 'html') return content
  return { kind: 'text', text: content.tags.join(SWISS_HEALTH_SEPARATOR) }
}
