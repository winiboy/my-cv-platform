import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import type { ResumeContact, ResumeLanguage } from '@/types/database'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { interLinkWidthPx } from '@/lib/inter-link-widths'

/**
 * What the "Premier emploi" template (`swissFirstJob`) draws, stated once for
 * its two outputs: `swiss-first-job-template.tsx`, which the Editor, the
 * Preview and the PDF render, and `docx-swiss-first-job.ts`, the Word export.
 * Each imports its sizes, its geometry, its section sequences, its language
 * dots and its joined text from here, so the two cannot drift apart.
 *
 * The words it draws that are not resume content (headings, dates, level
 * names), the entry lines, the skill content and the link boundaries are read
 * from the earlier Swiss templates' helpers, not restated.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The type sizes, in CSS px at page scale.
 *
 * No size setting applies to this template: no per-property size
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissFirstJob`) and not the layout model's font
 * scale, which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_FIRST_JOB_SIZES = {
  name: 34,
  /** The CV title, under the name. */
  title: 17,
  /** A heading of the main column, beside its circle. */
  heading: 16,
  /** The main column's running text and entries. */
  body: 13,
  /** The date line above an entry. */
  date: 12,
  /** A heading of the sidebar, in spaced capitals. */
  sidebarHeading: 12,
  /** Every line of the sidebar: contact, skills, languages, certificates. */
  sidebar: 12,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_FIRST_JOB_GEOMETRY = {
  /**
   * The sidebar down the left of the page: its width (32.7% of the page, a
   * little wider than the mockup's 30% so the long words of every locale fit
   * its lines whole), and its padding across.
   */
  sidebarWidth: 260,
  sidebarPaddingX: 24,
  /** Both columns' padding at the top and the foot of the page, on screen. */
  paddingTop: 48,
  paddingBottom: 48,
  /**
   * The printed text's margins, top and foot, on every page: in the PDF the
   * document's padding repeated on each page (`box-decoration-break: clone`
   * in globals.css), in Word the section's margins, so both break their pages
   * at the same place. The sidebar's fill is drawn behind the whole page,
   * margins included, so it still runs from the paper's top edge to its foot.
   * In print the columns' own padding gives way to these margins.
   */
  pageTop: 48,
  pageBottom: 48,
  /** The main column's padding: left and right. */
  mainPaddingLeft: 40,
  mainPaddingRight: 40,
  /** The round photo's diameter and its light ring's width. */
  photo: 140,
  photoRing: 2,
  /** Space under the photo, and between two sections of the sidebar. */
  photoGap: 28,
  sidebarSectionGap: 24,
  /** Space between a sidebar heading and its first line, and between two lines of the sidebar. */
  sidebarHeadingGap: 10,
  sidebarRowGap: 6,
  /** Space between a skill category's caption and its skills, and between two categories. */
  skillCaptionGap: 2,
  skillCategoryGap: 8,
  /** A skill's check mark: the width it hangs in. */
  checkIndent: 14,
  /** Space between a language's name and its dots; a dot's diameter; space between two dots. */
  dotsLead: 7,
  dot: 7,
  dotsGap: 4,
  /** Space under the name, and between the CV title and the first section. */
  nameGap: 4,
  titleGap: 26,
  /** Space between two sections of the main column, and between a heading and its first line. */
  sectionGap: 22,
  headingGap: 10,
  /** A main heading's filled circle: its diameter and the gap to the heading text. */
  headingCircle: 22,
  headingCircleGap: 10,
  /** Space between two entries, and above an entry's bullets or description; the bullets' hanging indent. */
  entryGap: 14,
  detailGap: 4,
  bulletIndent: 20,
} as const

/**
 * The width the sidebar leaves for text, in CSS px: its width less the padding
 * on each side. Every word of a sidebar line is drawn whole when it is no
 * wider than this (`swiss-first-job-template.test.ts` measures the long words
 * of each locale against it).
 */
export const SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH = SWISS_FIRST_JOB_GEOMETRY.sidebarWidth - 2 * SWISS_FIRST_JOB_GEOMETRY.sidebarPaddingX

/** The width the main column leaves for text, in CSS px. */
export const SWISS_FIRST_JOB_MAIN_TEXT_WIDTH =
  PAGE_WIDTH_PX - SWISS_FIRST_JOB_GEOMETRY.sidebarWidth - SWISS_FIRST_JOB_GEOMETRY.mainPaddingLeft - SWISS_FIRST_JOB_GEOMETRY.mainPaddingRight

/** The main column's sections, top to bottom, as `t10-premier-emploi.png` draws them. */
export const SWISS_FIRST_JOB_MAIN_COLUMN = ['summary', 'experience', 'education'] as const

/**
 * The sidebar's sections under the photo and the contact details, top to
 * bottom, as the mockup draws them. `training` is the model's id for the
 * certifications. The mockup draws no projects, so none are drawn.
 */
export const SWISS_FIRST_JOB_SIDEBAR_COLUMN = ['skills', 'languages', 'training'] as const

export type SwissFirstJobMainSectionId = (typeof SWISS_FIRST_JOB_MAIN_COLUMN)[number]
export type SwissFirstJobSidebarSectionId = (typeof SWISS_FIRST_JOB_SIDEBAR_COLUMN)[number]

/** The sections the editor's main-content panel can hide on this template, in the order it draws them. */
export const SWISS_FIRST_JOB_MAIN_SECTIONS = SWISS_FIRST_JOB_MAIN_COLUMN satisfies readonly EditorMainId[]

/** The sections the editor's sidebar panel can hide on this template, in the order it draws them. */
export const SWISS_FIRST_JOB_SIDEBAR_SECTIONS = SWISS_FIRST_JOB_SIDEBAR_COLUMN satisfies readonly EditorSidebarId[]

/**
 * The sections drawn in each column, in the template's fixed order, less those
 * the layout model hides (FR-2): summary, experience and education through
 * `hiddenMainSections`; skills, languages and certifications through
 * `hiddenSidebarSections`, whatever template hid them. These are the rows the
 * editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissFirstJob`), so the stored ORDER is not read.
 */
export function swissFirstJobSections(
  hiddenMainSections: readonly string[],
  hiddenSidebarSections: readonly string[],
): { main: SwissFirstJobMainSectionId[]; sidebar: SwissFirstJobSidebarSectionId[] } {
  return {
    main: SWISS_FIRST_JOB_MAIN_COLUMN.filter((sectionId) => !hiddenMainSections.includes(sectionId)),
    sidebar: SWISS_FIRST_JOB_SIDEBAR_COLUMN.filter((sectionId) => !hiddenSidebarSections.includes(sectionId)),
  }
}

/** How many of a language's five dots are filled (FR-7). */
const FILLED_DOTS: Readonly<Record<ResumeLanguage['level'], number>> = {
  Native: 5,
  Fluent: 4,
  Professional: 3,
  Intermediate: 2,
  Basic: 1,
}

/** A language's dots in all. */
export const SWISS_FIRST_JOB_DOT_COUNT = 5

/**
 * A language's dots, as PRD FR-7 maps the existing levels: Native 5,
 * Fluent 4, Professional 3, Intermediate 2, Basic 1 filled, of five. A
 * value outside the five levels fills none.
 */
export function swissFirstJobLanguageDots(level: string | undefined): { filled: number; empty: number } {
  const filled = level !== undefined && Object.hasOwn(FILLED_DOTS, level) ? FILLED_DOTS[level as ResumeLanguage['level']] : 0
  return { filled, empty: SWISS_FIRST_JOB_DOT_COUNT - filled }
}

/**
 * How much narrower than the sidebar's text an email must measure in Inter to
 * be drawn whole: a margin for what an unkerned sum and a browser's or Word's
 * own layout may differ by, in CSS px (as `SWISS_EXECUTIVE_SAFETY_PX`).
 */
export const SWISS_FIRST_JOB_EMAIL_SAFETY_PX = 4

/** The sidebar's size in Word's half-points: the size an email that fits is drawn at. */
const EMAIL_NORMAL_HALF_POINTS = Math.round(SWISS_FIRST_JOB_SIZES.sidebar * 1.5)

/** The smallest size an email is shrunk to, in half-points: 7pt. */
export const SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS = 14

/** Where an email may wrap below the smallest size: after its "@", and before a "." or a "-". */
const EMAIL_BREAK = /(?<=@)|(?<=.)(?=[.-])/

/**
 * The widest an email may be drawn at a requested `px`: its Inter width at
 * that size rounded up to a whole pixel.
 *
 * Chromium on Linux, which also renders the production PDFs, lays small text
 * out at a whole-pixel size. Evidence: PR #130's Linux CI (run 45562287430)
 * measured 216px for `maximilian.mustermann-gomes@hotmail.com` requested at
 * 9.33px (7pt). Its exact Inter width at 9.33px is 201.3px — what Windows
 * draws — and summing its advances each rounded to the nearest pixel gives
 * 201px, but its exact width at 10px is 215.7px: the 10px layout. Measuring at
 * the size rounded up bounds both platforms; at a whole-pixel size it is the
 * exact width.
 */
export function swissFirstJobEmailWidthPx(email: string, px: number): number {
  return interLinkWidthPx(email, Math.ceil(px - 1e-9))
}

/** The size an email of the sidebar is drawn at, and the parts it is drawn in. */
export interface SwissFirstJobEmailFit {
  /** Its size in Word's half-points, a whole number. */
  halfPoints: number
  /** The same size in CSS px, for the Preview. */
  px: number
  /** The email, whole as one part; cut at its boundaries only below the smallest size. */
  parts: string[]
}

/**
 * How the sidebar draws an email: never altered, on one line.
 *
 * One that fits the sidebar's text (`SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH`, with
 * `SWISS_FIRST_JOB_EMAIL_SAFETY_PX` to spare, measured in Inter at the size
 * rounded up to a whole pixel: `swissFirstJobEmailWidthPx`) at the sidebar's
 * size keeps it. One wider is drawn at the largest size that fits, stepped in
 * Word's whole half-points so the Preview and Word draw it at the same size,
 * down to 7pt (`SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS`). In both, the email is
 * one part: its text is the stored address, character for character, so it is
 * copied and parsed as stored.
 *
 * Only an email too wide even at 7pt (from some 37 characters, by its letters) is cut
 * after its "@" and before each "." and "-" (`EMAIL_BREAK`), for the Preview
 * to mark with a `<wbr>`, a break opportunity that draws nothing, so it wraps
 * at one of its own boundaries, never at a letter. Word writes that email
 * whole at 7pt, compressed onto one line (`w:fitText`), and never inserts a
 * character into it: a recorded difference between the two.
 */
export function swissFirstJobEmailFit(email: string): SwissFirstJobEmailFit {
  const room = SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH - SWISS_FIRST_JOB_EMAIL_SAFETY_PX
  for (let halfPoints = EMAIL_NORMAL_HALF_POINTS; halfPoints >= SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS; halfPoints--) {
    if (swissFirstJobEmailWidthPx(email, halfPoints / 1.5) <= room) return { halfPoints, px: halfPoints / 1.5, parts: [email] }
  }
  const halfPoints = SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS
  return { halfPoints, px: halfPoints / 1.5, parts: email.split(EMAIL_BREAK).filter((part) => part !== '') }
}

/** A skill's check mark, as the mockup's "✓". */
export const SWISS_FIRST_JOB_CHECK = '✓'

/** The contact details the sidebar lists, one per line, in its reading order. */
const CONTACT_FIELDS: readonly (keyof ResumeContact)[] = ['location', 'phone', 'email', 'linkedin', 'github', 'website']

/** The sidebar's contact lines: the filled details, one per line, in the mockup's order, GitHub and website after LinkedIn. */
export function swissFirstJobContactLines(contact: ResumeContact): { key: keyof ResumeContact; value: string }[] {
  return CONTACT_FIELDS.flatMap((key) => {
    const value = contact[key]
    return typeof value === 'string' && value.trim() !== '' ? [{ key, value: value.trim() }] : []
  })
}

/** What joins the parts of a certificate's line: " · ", as the mockup's "Permis cariste R1 · 2024". */
export const SWISS_FIRST_JOB_SEPARATOR = ' \u00B7 '

/**
 * A certificate's line, as the mockup's "Permis cariste R1 · 2024": its name,
 * its issuer and its month (`MM.YYYY`, as every Swiss template prints a
 * stored month), each only when stored, joined by " · ". Empty when nothing
 * is stored.
 */
export function swissFirstJobCertificate(name: string | undefined, issuer: string | undefined, month: string): string {
  return [name?.trim(), issuer?.trim(), month].filter((part): part is string => Boolean(part)).join(SWISS_FIRST_JOB_SEPARATOR)
}
