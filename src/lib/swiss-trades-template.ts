import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import { swissSkillContent } from '@/lib/swiss-vocational-template'

/**
 * What the "Métiers techniques & manuels" template (`swissTrades`) draws, stated
 * once for its two outputs: `swiss-trades-template.tsx`, which the Editor, the
 * Preview and the PDF render, and `docx-swiss-trades.ts`, the Word export. Each
 * imports its sizes, its geometry, its section sequences and its skill tags from
 * here, so the two cannot drift apart.
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
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissTrades` is empty) and not the layout model's
 * font scale, which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_TRADES_SIZES = {
  name: 30,
  title: 14,
  /** A heading of the dark column. */
  sidebarHeading: 12,
  /** Every line of the dark column: contact details, certificates, languages. */
  sidebar: 12,
  /** A skill tag's text. */
  tag: 12,
  /** A skill category's caption above its tags. */
  skillCaption: 11,
  /** A heading of the main column. */
  heading: 13,
  body: 13,
  /** The dates at the right of an entry's first line. */
  date: 12,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_TRADES_GEOMETRY = {
  /** The dark column's width: 31.5% of the page, as the mockup draws it. */
  sidebarWidth: 250,
  /** The dark column's padding: left and right, then at its top and foot. */
  sidebarPaddingX: 24,
  sidebarPaddingTop: 40,
  sidebarPaddingBottom: 40,
  /** The photo's frame, portrait, with square corners and a thin lighter border. */
  photoWidth: 130,
  photoHeight: 160,
  photoBorder: 1,
  /** Space between the photo and the first section of the dark column. */
  photoGap: 28,
  /** Space between two sections of the dark column. */
  sidebarSectionGap: 24,
  /** Space between a heading of the dark column and its first line. */
  sidebarHeadingGap: 8,
  /** Space between two lines of a list in the dark column (contact, certificates, languages). */
  sidebarRowGap: 3,
  /** A skill tag: its padding, corner radius, and the gap to the next tag, across and down. */
  tagPaddingX: 8,
  tagPaddingY: 2,
  tagRadius: 4,
  tagGap: 5,
  /** Space between two skill categories, and between a category's caption and its tags. */
  skillCategoryGap: 10,
  skillCaptionGap: 4,
  /** The main column's padding: left and right, then at its top and foot. */
  mainPaddingX: 36,
  mainPaddingTop: 48,
  mainPaddingBottom: 48,
  /**
   * The printed page's margins, top and foot, in the PDF and in Word (the
   * section's margins), so both break their pages at the same place: every
   * page keeps `pageTop` above its text and `pageBottom` below it. In print
   * they are the document's own padding repeated on every page
   * (`box-decoration-break: clone` in globals.css), not `@page` margins,
   * which Chromium paints no background into and so would cut the dark
   * column short of the paper's edges; the columns' own top and foot padding
   * gives way to them. They equal the main column's padding, so page 1's
   * main column prints as the screen draws it; the dark column keeps its
   * higher start (`sidebarPaddingTop`) on page 1 by a negative top margin.
   */
  pageTop: 48,
  pageBottom: 48,
  /** Space under the name, and between the CV title and the first section. */
  nameGap: 6,
  titleGap: 28,
  /** Space between two sections of the main column. */
  sectionGap: 24,
  /** The rule that follows a main heading on its line: its thickness, and its gap to the heading text. */
  headingRule: 2,
  headingRuleGap: 12,
  /** Space between a main heading and its first entry. */
  headingGap: 12,
  /** Space between two entries of a section. */
  entryGap: 14,
  /** The gap between an entry's first line and the dates at its right. */
  dateGap: 16,
  /** The space above an entry's bullets or description, and the bullets' hanging indent. */
  detailGap: 4,
  bulletIndent: 20,
} as const

/** The main column's sections, top to bottom, as `t3-technique-manuel.png` draws them. */
export const SWISS_TRADES_MAIN_SECTIONS = ['summary', 'experience', 'education'] as const satisfies readonly EditorMainId[]

/**
 * The dark column's sections under the photo and the contact details, top to
 * bottom, as the mockup draws them. `training` is the model's id for the
 * certifications.
 */
export const SWISS_TRADES_SIDEBAR_SECTIONS = ['skills', 'training', 'languages'] as const satisfies readonly EditorSidebarId[]

export type SwissTradesMainSectionId = (typeof SWISS_TRADES_MAIN_SECTIONS)[number]
export type SwissTradesSidebarSectionId = (typeof SWISS_TRADES_SIDEBAR_SECTIONS)[number]

/**
 * The sections drawn in each column, in the template's fixed order, less those
 * the layout model hides (FR-2): main ids through `hiddenMainSections`, the
 * dark column's through `hiddenSidebarSections`, whatever template hid them.
 * These are the rows the editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissTrades`), so the stored ORDER is not read.
 *
 * Whether a drawn section has any content is each output's own test on the
 * same visible items, and an empty one draws no heading.
 */
export function swissTradesSections(
  hiddenMainSections: readonly string[],
  hiddenSidebarSections: readonly string[],
): { main: SwissTradesMainSectionId[]; sidebar: SwissTradesSidebarSectionId[] } {
  return {
    main: SWISS_TRADES_MAIN_SECTIONS.filter((sectionId) => !hiddenMainSections.includes(sectionId)),
    sidebar: SWISS_TRADES_SIDEBAR_SECTIONS.filter((sectionId) => !hiddenSidebarSections.includes(sectionId)),
  }
}

/**
 * A language line: the language, then its level in the locale's words (FR-7),
 * as the mockup draws it. Both outputs draw exactly this string.
 */
export function swissTradesLanguageLine(language: string, level: string): string {
  return `${language} — ${level}`
}

/**
 * What a certificate's line draws after its bold name: the issuer and the
 * month, each only when stored, joined as the mockup joins them
 * ("SUVA, 05.2021"). Empty when neither is stored.
 */
export function swissTradesCertificateDetail(issuer: string | undefined, month: string): string {
  return [issuer?.trim(), month].filter((part): part is string => Boolean(part)).join(', ')
}

/**
 * The words a heading of the dark column reads that `resumes.template` has no
 * label for: "Contact", from the editor's own Contact tab name, as modern's
 * sidebar reads it. A missing label is a translation defect, so it throws, as
 * `swissHeading` does.
 */
export function swissTradesContactHeading(dict: unknown): string {
  const label = (dict as { resumes?: { editor?: { sections?: Record<string, unknown> } } }).resumes?.editor?.sections?.contact
  if (typeof label !== 'string' || label === '') {
    throw new Error('Missing translation common.json resumes.editor.sections.contact')
  }
  return label
}

/** The line-start markers `formatText` reads as a list; a line holding one is not a list of tags. */
const PLAIN_TEXT_LIST_MARKER = /^\s*(?:[•\-*]|\d+\.)\s+/

/** One paragraph of rich text holding nothing but text: `<p>…</p>` with no markup inside. */
const SINGLE_PLAIN_PARAGRAPH = /^<p>([^<>]*)<\/p>$/

/** The entities a browser decodes in a rich-text paragraph that the editor writes. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
  '&#160;': ' ',
}

/**
 * The tags a comma-separated list of skills draws as, or null when the text is
 * anything else: more than one line or paragraph, a list, or formatting. The
 * editor joins legacy `items` with ", " when it migrates them to `skillsHtml`,
 * and its placeholder asks for skills so, so this reads the stored value back
 * the way it was written. Plain text (no tags) is read literally, as
 * `formatText` draws it; a `<p>` paragraph has its entities decoded, as the
 * browser does.
 */
function commaSeparatedTags(stored: string): string[] | null {
  const text = stored.trim()
  if (text.includes('\n')) return null
  let line: string
  if (/<[^>]+>/.test(text)) {
    const paragraph = SINGLE_PLAIN_PARAGRAPH.exec(text)
    if (!paragraph) return null
    line = paragraph[1].replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27|#160);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
  } else {
    line = text
  }
  if (PLAIN_TEXT_LIST_MARKER.test(line)) return null
  const tags = line
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
  return tags.length > 0 ? tags : null
}

/**
 * What a skill category draws in the dark column, or null when it draws
 * nothing and is left out (FR-2):
 * - `tags`: its skills as tags — its legacy `items` when it has no rich text,
 *   or its rich text when that is a plain comma-separated list;
 * - `html`: any other rich text, drawn through each output's sanitizing
 *   rich-text helpers so no formatting or line break is lost (FR-9).
 *
 * The stored rich text wins over `items`, as on every template: the editor
 * keeps `items` after migrating them and edits the rich text alone, so `items`
 * beside rich text may be stale (`swissSkillContent`).
 */
export function swissTradesSkillContent(skill: {
  items?: readonly string[]
  skillsHtml?: string
}): { kind: 'tags'; tags: string[] } | { kind: 'html'; html: string } | null {
  const content = swissSkillContent(skill)
  if (content === null) return null
  if (content.kind === 'items') {
    return { kind: 'tags', tags: (skill.items ?? []).map((item) => item.trim()).filter((item) => item !== '') }
  }
  const tags = commaSeparatedTags(content.html)
  return tags ? { kind: 'tags', tags } : content
}
