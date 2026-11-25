import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import type { ResumeContact } from '@/types/database'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { georgiaTextWidthPx } from '@/lib/georgia-advance-widths'
import { swissCommerceSkillLabel } from '@/lib/swiss-commerce-template'
import { swissFinanceSkillsHeading } from '@/lib/swiss-finance-template'
import { swissExecutiveContactValues } from '@/lib/swiss-executive-template'

/**
 * What the "Académique & recherche" template (`swissAcademic`) draws, stated
 * once for its two outputs: `swiss-academic-template.tsx`, which the Editor,
 * the Preview and the PDF render, and `docx-swiss-academic.ts`, the Word
 * export. Each imports its sizes, its geometry, its section sequence, its date
 * column and its joined text from here, so the two cannot drift apart.
 *
 * The words it draws that are not resume content (headings, dates, level
 * names), the entry lines, the project content, the link boundaries and the
 * contact line are read from the earlier Swiss templates' helpers, not
 * restated.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The type sizes, in CSS px at page scale.
 *
 * No size setting applies to this template: no per-property size
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissAcademic`) and not the layout model's font
 * scale, which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_ACADEMIC_SIZES = {
  name: 30,
  /** The CV title, a muted line under the name. */
  title: 15,
  /** The contact line. */
  contact: 12,
  /** Every section heading, in letter-spaced small capitals. */
  heading: 14,
  /** Running text, entries, publications, distinctions and the last section's lines. */
  body: 13,
  /** The dates in the left column. */
  date: 13,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_ACADEMIC_GEOMETRY = {
  /** The page's padding, left and right. */
  paddingX: 64,
  /** The page's padding at its top and foot, on screen. */
  paddingTop: 56,
  paddingBottom: 48,
  /**
   * The printed page's margins, top and foot, in the PDF (`@page
   * swiss-academic` in globals.css) and in Word (the section's margins), so
   * both break their pages at the same place, as `swissExecutive` prints. In
   * print the document's own top padding gives up `pageTop`, so page 1 starts
   * where it does on screen, and its foot padding gives way to `pageBottom`.
   */
  pageTop: 48,
  pageBottom: 48,
  /** Space under the name, and under the CV title. */
  nameGap: 6,
  titleGap: 8,
  /** Space between the header and the first section, and between two sections. */
  headerGap: 26,
  sectionGap: 22,
  /** The thin rule under a heading: its thickness, the space between the heading's text and it, and the space under it. */
  headingRule: 1,
  headingRuleGap: 4,
  headingGap: 10,
  /** Space between two entries of a dated section, and between two publications. */
  entryGap: 10,
  publicationGap: 6,
  /** The gap between the date column and the entries' text. */
  dateGap: 24,
  /**
   * The share of the content width the date column, with its gap, may take at
   * most, so the entries keep at least the rest (60%). A date — a stored
   * month, or free text stored as a date — is never wrapped: its spaces are
   * no-break spaces. One wider than this bound on its own is the documented
   * limit: it overflows its column, into the gap and the entry beside it.
   */
  dateColumnMaxShare: 0.4,
  /** The space above an entry's bullets, description or field line, and the bullets' hanging indent. */
  detailGap: 3,
  bulletIndent: 20,
  /** A publication's number: its hanging indent. */
  numberIndent: 24,
  /** Space between two lines of the last section. */
  lastRowGap: 2,
} as const

/**
 * The serif face of the whole page: Tailwind's `font-serif` stack on the
 * Preview, whose first face a reader is given is Georgia, and Georgia in
 * Word, as `swissFinance` draws it.
 */
export const SWISS_ACADEMIC_SERIF_DOCX = 'Georgia'

/** The width of the page's content between its paddings, in CSS px. */
export const SWISS_ACADEMIC_CONTENT_WIDTH = PAGE_WIDTH_PX - 2 * SWISS_ACADEMIC_GEOMETRY.paddingX

/**
 * The template's sections, top to bottom, as `t9-academique.png` draws them.
 * `keyAchievements` is the model's id for the projects, drawn as the numbered
 * "Publications and projects"; `training` is the model's id for the
 * certifications, drawn as "Distinctions"; `skillsAndLanguages` is the one
 * section that closes the page.
 */
export const SWISS_ACADEMIC_SECTIONS = ['summary', 'education', 'experience', 'keyAchievements', 'training', 'skillsAndLanguages'] as const

export type SwissAcademicSectionId = (typeof SWISS_ACADEMIC_SECTIONS)[number]

/** The sections the editor's main-content panel can hide on this template, in the order it draws them. */
export const SWISS_ACADEMIC_MAIN_SECTIONS = ['summary', 'education', 'experience'] as const satisfies readonly EditorMainId[]

/** The sections the editor's sidebar panel can hide on this template, in the order it draws them. */
export const SWISS_ACADEMIC_SIDEBAR_SECTIONS = ['keyAchievements', 'training', 'skills', 'languages'] as const satisfies readonly EditorSidebarId[]

const HIDEABLE_MAIN: readonly string[] = SWISS_ACADEMIC_MAIN_SECTIONS

/** What the template draws, after the layout model's section visibility. */
export interface SwissAcademicVisibility {
  /** The sections drawn, in the template's fixed order. */
  sections: SwissAcademicSectionId[]
  /** Whether the last section draws the skills. */
  skills: boolean
  /** Whether the last section draws the languages. */
  languages: boolean
}

/**
 * The sections drawn, in the template's fixed order, less those the layout
 * model hides (FR-2): summary, education and experience through
 * `hiddenMainSections`; the projects (`keyAchievements`), the certifications
 * (`training`), the skills and the languages, which are SIDEBAR ids in the
 * model, through `hiddenSidebarSections`, whatever template hid them. These
 * are the rows the editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissAcademic`), so the stored ORDER is not read.
 * The last section is dropped only when both of its parts are hidden.
 */
export function swissAcademicVisibility(hiddenMainSections: readonly string[], hiddenSidebarSections: readonly string[]): SwissAcademicVisibility {
  const skills = !hiddenSidebarSections.includes('skills' satisfies EditorSidebarId)
  const languages = !hiddenSidebarSections.includes('languages' satisfies EditorSidebarId)
  const sections = SWISS_ACADEMIC_SECTIONS.filter((sectionId) => {
    if (sectionId === 'skillsAndLanguages') return skills || languages
    return HIDEABLE_MAIN.includes(sectionId) ? !hiddenMainSections.includes(sectionId) : !hiddenSidebarSections.includes(sectionId)
  })
  return { sections, skills, languages }
}

/**
 * A date as the template draws it, in every output: the Swiss date range, or
 * a stored month, or free text stored as a date, with every space a no-break
 * space, so it is one unit a line never breaks inside.
 */
export function swissAcademicDate(dates: string): string {
  return dates.trim().replace(/\s+/g, '\u00A0')
}

/**
 * The widest the date column may be, in CSS px: the content width's
 * `dateColumnMaxShare` less the gap, so the entries keep at least 60% of the
 * line (242px).
 */
export const SWISS_ACADEMIC_DATE_COLUMN_MAX_PX = Math.floor(
  (PAGE_WIDTH_PX - 2 * SWISS_ACADEMIC_GEOMETRY.paddingX) * SWISS_ACADEMIC_GEOMETRY.dateColumnMaxShare - SWISS_ACADEMIC_GEOMETRY.dateGap,
)

/**
 * The size a date is measured at: Word's, which draws runs in whole
 * half-points (13px rounds up to 10pt, 13.33px), so the column is never
 * narrower than the date Word draws; the Preview draws it a little smaller.
 */
const DATE_MEASURE_PX = Math.max(SWISS_ACADEMIC_SIZES.date, Math.round(SWISS_ACADEMIC_SIZES.date * 1.5) / 1.5)

/** What the column keeps beyond its widest date: a margin for what an unkerned sum and a renderer's own layout may differ by, in CSS px. */
export const SWISS_ACADEMIC_DATE_SAFETY_PX = 4

/**
 * The width of the date column, in CSS px, the same on every output: the
 * widest of the CV's drawn dates (as `swissAcademicDate` writes them),
 * measured with Georgia's own advance widths at Word's size, plus
 * `SWISS_ACADEMIC_DATE_SAFETY_PX`, rounded up; 0 when no date is drawn. One
 * column for the whole page, as the mockup aligns every section's entries.
 * It grows with the widest date, free text included, up to
 * `SWISS_ACADEMIC_DATE_COLUMN_MAX_PX`; both outputs use this one value. A
 * date never wraps: its spaces are no-break spaces, so one wider than the
 * bound overflows its column (the documented limit).
 */
export function swissAcademicDateColumnPx(dates: readonly string[]): number {
  const drawn = dates.filter(Boolean)
  if (drawn.length === 0) return 0
  const widest = Math.max(...drawn.map((date) => georgiaTextWidthPx(swissAcademicDate(date), 'regular', DATE_MEASURE_PX)))
  return Math.min(SWISS_ACADEMIC_DATE_COLUMN_MAX_PX, Math.ceil(widest + SWISS_ACADEMIC_DATE_SAFETY_PX))
}

/**
 * The header's contact line: the filled details in the mockup's order —
 * location, phone, email, LinkedIn, then GitHub and website — each drawn whole,
 * as `swissExecutive` draws its line. The mockup's ORCID link is simply a
 * stored website or LinkedIn value.
 */
export const swissAcademicContactValues: (contact: ResumeContact) => string[] = swissExecutiveContactValues

/**
 * What joins the lead of an entry line and its place: " — ", as the
 * mockup's "Doctorat en neurosciences — Université de Genève", its first space
 * a no-break space, so a line never breaks before the dash.
 */
export const SWISS_ACADEMIC_DASH = '\u00A0\u2014 '

/**
 * An entry's line as the mockup draws it: the lead in bold, then " — " and its
 * place. With no lead, the place alone; with no place, the lead alone. A part
 * that is not stored leaves no dangling separator (FR-2).
 */
export function swissAcademicEntryLine(lead: string | undefined, place: readonly (string | undefined)[]): { lead: string; rest: string } {
  const title = lead?.trim() ?? ''
  const where = place
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(', ')
  if (!title) return { lead: '', rest: where }
  return { lead: title, rest: where ? `${SWISS_ACADEMIC_DASH}${where}` : '' }
}

/** A skill category's label as it leads its skills on the same line: the stored category and a colon, as `swissCommerce` labels its skills. */
export const swissAcademicSkillLabel = swissCommerceSkillLabel

/** The languages' line: each visible language with its level in brackets, joined by ", ", as the mockup's "italien (langue maternelle), anglais (courant)". */
export function swissAcademicLanguagesText(languages: readonly { language: string; level: string }[]): string {
  return languages.map(({ language, level }) => `${language.trim()} (${level})`).join(', ')
}

/**
 * The last section's heading, from the existing labels only (FR-6): the
 * skills and languages labels joined by " & " when it holds both, as the
 * mockup's "Compétences et langues", or the one it holds alone.
 */
export function swissAcademicLastHeading(skillsLabel: string, languagesLabel: string, hasSkills: boolean, hasLanguages: boolean): string {
  return swissFinanceSkillsHeading(skillsLabel, languagesLabel, hasSkills, hasLanguages)
}
