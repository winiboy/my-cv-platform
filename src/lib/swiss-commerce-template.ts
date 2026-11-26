import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'

/**
 * What the "Commerce & administration" template (`swissCommerce`) draws, stated
 * once for its two outputs: `swiss-commerce-template.tsx`, which the Editor, the
 * Preview and the PDF render, and `docx-swiss-commerce.ts`, the Word export.
 * Each imports its sizes, its geometry and its section sequence from here, so
 * the two cannot drift apart.
 *
 * The words it draws that are not resume content (headings, dates, level
 * names) and the content tests it shares with `swissVocational` are read from
 * `@/lib/swiss-vocational-template`, not restated.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The type sizes, in CSS px at page scale.
 *
 * No size setting applies to this template: no per-property size
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissCommerce` is empty) and not the layout
 * model's font scale, which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_COMMERCE_SIZES = {
  name: 30,
  title: 14,
  contact: 12,
  heading: 13,
  body: 13,
  /** The language pills' text. */
  pill: 12,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_COMMERCE_GEOMETRY = {
  /** The body's padding, left and right; the header band's content uses the same inset. */
  paddingX: 52,
  /** The header band's padding, top and bottom. */
  bandPaddingY: 36,
  /** Space between the header band and the first section. */
  bandGap: 28,
  /** The body's padding at the foot of the page. */
  paddingBottom: 48,
  /**
   * The printed page's margins, top and foot, in the PDF (globals.css) and in
   * Word (the section's margins), so both break their pages at the same
   * place: every page keeps `pageBottom` at its foot, and every page but the
   * first keeps `pageTop` at its top. Page 1 has no top margin, so the band
   * meets the paper's top edge. In the PDF the top margin is the page's
   * (`@page swiss-commerce`) and the foot margin is the document's own foot
   * padding (`paddingBottom`, which it equals) repeated on every page.
   */
  pageTop: 48,
  pageBottom: 48,
  /** The round photo's diameter, and its ring's width. */
  photo: 104,
  photoRing: 2,
  /** The gap between the photo and the header text. */
  photoGap: 30,
  /** Space under the name, and under the CV title. */
  nameGap: 6,
  titleGap: 12,
  /** The gap between two contact details on the header row. */
  contactGap: 18,
  /** Space between two sections. */
  sectionGap: 22,
  /** The navy rule under a section heading, and the space between the heading text and it. */
  headingRule: 2,
  headingRuleGap: 6,
  /** Space between a section heading's rule and its first entry. */
  headingGap: 12,
  /** The left column that dated rows put their dates in. */
  dateColumn: 132,
  /** Space between two entries of a section. */
  entryGap: 12,
  /** The skills grid: the gap between its two columns, and between two rows. */
  skillColumnGap: 32,
  skillRowGap: 6,
  /** A language pill: its padding, border, corner radius, and the gap to the next pill. */
  pillPaddingX: 11,
  pillPaddingY: 3,
  pillBorder: 1,
  pillRadius: 4,
  pillGap: 10,
} as const

/** The template's sections, top to bottom, as `t2-commerce.png` draws them. */
export const SWISS_COMMERCE_SECTIONS = [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
  'training',
] as const

export type SwissCommerceSectionId = (typeof SWISS_COMMERCE_SECTIONS)[number]

/** The sections the editor's main-content panel can hide on this template. */
const HIDEABLE_MAIN: readonly SwissCommerceSectionId[] = ['summary', 'experience', 'education'] satisfies readonly EditorMainId[]

/** The sections the editor's sidebar panel can hide on this template. */
const HIDEABLE_SIDEBAR: readonly SwissCommerceSectionId[] = ['skills', 'languages', 'training'] satisfies readonly EditorSidebarId[]

/**
 * The sections drawn, in the template's fixed order, less those the layout
 * model hides (FR-2).
 *
 * Summary, experience and education are hidden through `hiddenMainSections`;
 * skills, languages and training are SIDEBAR ids in the model and are hidden
 * through `hiddenSidebarSections`, whatever template hid them. These are the
 * rows the editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissCommerce`), so the stored ORDER is not read.
 *
 * Whether a drawn section has any content is each output's own test on the
 * same visible items, and an empty one draws no heading.
 */
export function swissCommerceSections(
  hiddenMainSections: readonly string[],
  hiddenSidebarSections: readonly string[],
): SwissCommerceSectionId[] {
  return SWISS_COMMERCE_SECTIONS.filter((sectionId) => {
    if (HIDEABLE_MAIN.includes(sectionId)) return !hiddenMainSections.includes(sectionId)
    if (HIDEABLE_SIDEBAR.includes(sectionId)) return !hiddenSidebarSections.includes(sectionId)
    return true
  })
}

/**
 * A language pill's text: the language, then its level in the locale's words
 * (FR-7), as the mockup labels it. Both outputs draw exactly this string.
 */
export function swissCommerceLanguagePill(language: string, level: string): string {
  return `${language} \u2014 ${level}`
}

/**
 * A skill category's label as it leads its skills on the same line: the
 * stored category and a colon, the same in every locale.
 */
export function swissCommerceSkillLabel(category: string): string {
  return `${category}:`
}
