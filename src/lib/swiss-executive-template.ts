import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import type { ResumeContact } from '@/types/database'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { swissFinanceSkillsHeading } from '@/lib/swiss-finance-template'
import { SWISS_IT_CONTACT_DOT } from '@/lib/swiss-it-template'

/**
 * What the "Cadre & direction" template (`swissExecutive`) draws, stated once
 * for its two outputs: `swiss-executive-template.tsx`, which the Editor, the
 * Preview and the PDF render, and `docx-swiss-executive.ts`, the Word export.
 * Each imports its sizes, its geometry, its section sequence and its joined
 * text from here, so the two cannot drift apart.
 *
 * The words it draws that are not resume content (headings, dates, level
 * names), the entry lines, the project content, the link boundaries and the
 * languages line are read from the earlier Swiss templates' helpers, not
 * restated.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The type sizes, in CSS px at page scale.
 *
 * No size setting applies to this template: no per-property size
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissExecutive`) and not the layout model's font
 * scale, which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_EXECUTIVE_SIZES = {
  /** The name, in the serif face. */
  name: 34,
  /** The CV title, in spaced capitals. */
  title: 13,
  /** The contact line. */
  contact: 12,
  /** Every section heading, in the serif face. */
  heading: 20,
  /** The summary in its box, in italics. */
  summary: 14,
  /** Running text, entry lines, the achievement cards and the last section's lines. */
  body: 13,
  /** The dates at the right of an entry's first line. */
  date: 12,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_EXECUTIVE_GEOMETRY = {
  /** The page's padding, left and right. */
  paddingX: 64,
  /** The page's padding at its top and foot, on screen. */
  paddingTop: 56,
  paddingBottom: 48,
  /**
   * The printed page's margins, top and foot, in the PDF (`@page
   * swiss-executive` in globals.css) and in Word (the section's margins), so
   * both break their pages at the same place: every page keeps `pageBottom`
   * at its foot and `pageTop` at its top. In print the document's own top
   * padding gives up `pageTop`, so page 1 starts where it does on screen, and
   * its foot padding gives way to the page's foot margin.
   */
  pageTop: 48,
  pageBottom: 48,
  /** The round photo's diameter and its gold ring's width. */
  photo: 110,
  photoRing: 2,
  /** The gap between the header's text and the photo at its right. */
  photoGap: 24,
  /** Space under the name, and under the CV title. */
  nameGap: 6,
  titleGap: 10,
  /** The gold rule under the header: its thickness, the space above it and the space below it. */
  headerRule: 2,
  headerRuleGap: 20,
  ruleGap: 20,
  /** The summary's box: its gold bar down the left edge, and its padding across and down. */
  summaryBar: 4,
  summaryPaddingX: 20,
  summaryPaddingY: 16,
  /** Space between two sections. */
  sectionGap: 24,
  /** Space between a heading and its first line. */
  headingGap: 12,
  /**
   * An achievement card: its gold rule along the top, the space under the
   * rule, and the gaps between two cards, across and down.
   */
  cardRule: 3,
  cardRuleGap: 8,
  cardGap: 20,
  cardRowGap: 14,
  /** Space between two entries of the experience or the education. */
  entryGap: 12,
  /** The gap between an entry's first line and its dates. */
  dateGap: 16,
  /** The space above an entry's bullets or description, and the bullets' hanging indent. */
  detailGap: 4,
  bulletIndent: 20,
  /** Space between the languages line and the certifications line of the last section. */
  lastRowGap: 2,
} as const

/**
 * The serif face of the name and the headings: Tailwind's `font-serif` stack on
 * the Preview, whose first face a reader is given is Georgia, and Georgia in
 * Word, as `swissFinance` draws it. Everything else is the app's Inter.
 */
export const SWISS_EXECUTIVE_SERIF_DOCX = 'Georgia'

/** The width of the page's content between its paddings, in CSS px. */
export const SWISS_EXECUTIVE_CONTENT_WIDTH = PAGE_WIDTH_PX - 2 * SWISS_EXECUTIVE_GEOMETRY.paddingX

/**
 * The width an achievement card leaves for text: half the content less half
 * the gap between the two columns; a card has no side padding or border, only
 * its rule along the top. Every word of a card is drawn whole when it is no
 * wider than this (`swiss-executive-template.test.ts` measures the long words of
 * each locale against it).
 */
export const SWISS_EXECUTIVE_CARD_TEXT_WIDTH = (SWISS_EXECUTIVE_CONTENT_WIDTH - SWISS_EXECUTIVE_GEOMETRY.cardGap) / 2

/**
 * The template's sections, top to bottom, as `t8-cadre-direction.png` draws
 * them. The summary sits in its box with no heading (it is the summary, FR-6);
 * `keyAchievements` is the model's id for the projects, drawn as cards under
 * the existing "Key achievements" heading; `languagesAndCertifications` is the
 * one section that closes the page. The mockup draws no skills, so none are
 * drawn and the skills row is not offered (FR-3).
 */
export const SWISS_EXECUTIVE_SECTIONS = ['summary', 'keyAchievements', 'experience', 'education', 'languagesAndCertifications'] as const

export type SwissExecutiveSectionId = (typeof SWISS_EXECUTIVE_SECTIONS)[number]

/** The sections the editor's main-content panel can hide on this template, in the order it draws them. */
export const SWISS_EXECUTIVE_MAIN_SECTIONS = ['summary', 'experience', 'education'] as const satisfies readonly EditorMainId[]

/** The sections the editor's sidebar panel can hide on this template, in the order it draws them. Skills are not drawn, so not listed. */
export const SWISS_EXECUTIVE_SIDEBAR_SECTIONS = ['keyAchievements', 'languages', 'training'] as const satisfies readonly EditorSidebarId[]

const HIDEABLE_MAIN: readonly string[] = SWISS_EXECUTIVE_MAIN_SECTIONS

/** What the template draws, after the layout model's section visibility. */
export interface SwissExecutiveVisibility {
  /** The sections drawn, in the template's fixed order. */
  sections: SwissExecutiveSectionId[]
  /** Whether the last section draws the languages. */
  languages: boolean
  /** Whether the last section draws the certifications. */
  certifications: boolean
}

/**
 * The sections drawn, in the template's fixed order, less those the layout
 * model hides (FR-2): summary, experience and education through
 * `hiddenMainSections`; the projects (`keyAchievements`), the languages and the
 * certifications (`training`), which are SIDEBAR ids in the model, through
 * `hiddenSidebarSections`, whatever template hid them. These are the rows the
 * editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissExecutive`), so the stored ORDER is not read.
 * The last section is dropped only when both of its parts are hidden.
 *
 * Whether a drawn section has any content is each output's own test on the
 * same visible items, and an empty one draws no heading.
 */
export function swissExecutiveVisibility(hiddenMainSections: readonly string[], hiddenSidebarSections: readonly string[]): SwissExecutiveVisibility {
  const languages = !hiddenSidebarSections.includes('languages' satisfies EditorSidebarId)
  const certifications = !hiddenSidebarSections.includes('training' satisfies EditorSidebarId)
  const sections = SWISS_EXECUTIVE_SECTIONS.filter((sectionId) => {
    if (sectionId === 'languagesAndCertifications') return languages || certifications
    return HIDEABLE_MAIN.includes(sectionId) ? !hiddenMainSections.includes(sectionId) : !hiddenSidebarSections.includes(sectionId)
  })
  return { sections, languages, certifications }
}

/** The contact details the header's line shows, in its reading order. */
const CONTACT_FIELDS: readonly (keyof ResumeContact)[] = ['location', 'phone', 'email', 'linkedin', 'github', 'website']

/**
 * The header's contact line: the filled details in the mockup's order —
 * location, phone, email, LinkedIn, then GitHub and website when filled —
 * every one but the last ending in the " ·" `swissIt` ends its values with.
 * Each value is drawn whole: the line wraps between two values, never inside
 * one. Empty when no detail is filled (FR-2).
 */
export function swissExecutiveContactValues(contact: ResumeContact): string[] {
  const values = CONTACT_FIELDS.flatMap((key) => {
    const value = contact[key]
    return typeof value === 'string' && value.trim() !== '' ? [value.trim()] : []
  })
  return values.map((value, index) => (index < values.length - 1 ? `${value}${SWISS_IT_CONTACT_DOT}` : value))
}

/**
 * A certificate as the last section draws it, as the mockup's
 * "Administratrice indépendante, Association romande medtech (2020)": its
 * name and issuer joined by ", ", then its month in brackets, in the
 * `MM.YYYY` every Swiss template prints. A part not stored is left out with
 * its separator or brackets; a certificate with a month alone draws the
 * month. Empty when nothing is stored.
 */
export function swissExecutiveCertificate(name: string | undefined, issuer: string | undefined, month: string): string {
  const text = [name?.trim(), issuer?.trim()].filter((part): part is string => Boolean(part)).join(', ')
  if (!month) return text
  return text ? `${text} (${month})` : month
}

/**
 * The last section's heading, from the existing labels only (FR-6): the
 * languages and certifications labels joined by " & " when it holds both, as
 * the mockup's "Langues & mandats", or the one it holds alone.
 */
export function swissExecutiveLastHeading(languagesLabel: string, trainingLabel: string, hasLanguages: boolean, hasCertifications: boolean): string {
  return swissFinanceSkillsHeading(languagesLabel, trainingLabel, hasLanguages, hasCertifications)
}
