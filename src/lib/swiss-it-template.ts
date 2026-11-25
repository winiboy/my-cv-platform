import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import type { ResumeContact, ResumeProject } from '@/types/database'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { swissHasText } from '@/lib/swiss-vocational-template'
import { swissTradesLanguageLine, swissTradesSkillContent } from '@/lib/swiss-trades-template'
import { swissFinanceSkillsHeading } from '@/lib/swiss-finance-template'
import { swissEngineeringDates } from '@/lib/swiss-engineering-template'
import { swissCommerceSkillLabel } from '@/lib/swiss-commerce-template'

/**
 * What the "Informatique & IT" template (`swissIt`) draws, stated once for its
 * two outputs: `swiss-it-template.tsx`, which the Editor, the Preview and the
 * PDF render, and `docx-swiss-it.ts`, the Word export. Each imports its sizes,
 * its geometry, its section sequence and its joined text from here, so the two
 * cannot drift apart.
 *
 * The words it draws that are not resume content (headings, dates, level
 * names) and the content tests it shares with the other Swiss templates are
 * read from the shared Swiss helpers, not restated.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The type sizes, in CSS px at page scale.
 *
 * No size setting applies to this template: no per-property size
 * (`TEMPLATE_APPLIED_SIZE_KEYS.swissIt`) and not the layout model's font scale,
 * which a Swiss template ignores in every output (FR-4).
 */
export const SWISS_IT_SIZES = {
  name: 30,
  /** The CV title, in the monospace face, under the name. */
  title: 14,
  /** The contact lines of the band, in the monospace face. */
  contact: 12,
  /** Every section heading, in the monospace face. */
  heading: 14,
  /** Running text, entry lines, project cards and the last section's lines. */
  body: 13,
  /** The dates at the right of an entry's first line, in the monospace face. */
  date: 12,
  /** A tag's text: a skill or a project's technology. */
  tag: 12,
} as const

/** Page geometry, in CSS px at page scale. */
export const SWISS_IT_GEOMETRY = {
  /** The body's padding, left and right; the band's content uses the same inset. */
  paddingX: 48,
  /** The band's padding, top and bottom. */
  bandPaddingY: 40,
  /** Space between the band and the first section. */
  bandGap: 32,
  /** The document's padding at its foot, on screen. */
  paddingBottom: 48,
  /**
   * The printed page's margins, top and foot, in the PDF (`@page swiss-it` in
   * globals.css) and in Word (the section's margins), so both break their
   * pages at the same place: every page keeps `pageBottom` at its foot, and
   * every page but the first keeps `pageTop` at its top. Page 1 has no top
   * margin, so the band meets the paper's top edge. In print the document
   * drops its own foot padding (`paddingBottom`), which the page's foot margin
   * replaces; on screen it keeps it.
   */
  pageTop: 48,
  pageBottom: 48,
  /** The round photo's diameter and its green ring's width. */
  photo: 100,
  photoRing: 2,
  /** The gap between the band's text and the photo at its right. */
  photoGap: 24,
  /** Space under the name, and between the CV title and the contact lines. */
  nameGap: 8,
  titleGap: 14,
  /** Space between the two contact lines. */
  contactRowGap: 4,
  /** Space between two sections. */
  sectionGap: 22,
  /** Space between a heading and its first line. */
  headingGap: 10,
  /** Space between two entries of the experience or the education. */
  entryGap: 12,
  /** The gap between an entry's first line and the dates at its right. */
  dateGap: 16,
  /** The space above an entry's bullets or description, and the bullets' hanging indent. */
  detailGap: 4,
  bulletIndent: 20,
  /** Space between two skill categories. */
  skillRowGap: 6,
  /**
   * A tag: its padding across and down, its border, its pill radius, and the
   * gap to the next tag, across and down.
   */
  tagPaddingX: 10,
  tagPaddingY: 1,
  tagBorder: 1,
  tagRadius: 9999,
  tagGap: 6,
  /**
   * A project card: its thin border, its padding across and down, its corner
   * radius, and the gap between two cards, across and down.
   */
  cardBorder: 1,
  cardPaddingX: 14,
  cardPaddingY: 12,
  cardRadius: 6,
  cardGap: 12,
  /** The space above a card's tags. */
  cardTagGap: 6,
  /** Space between the languages line and the certifications line of the last section. */
  lastRowGap: 2,
} as const

/**
 * The monospace face of the band's title and contact lines, the headings and
 * the dates: the platform's system stack, so no font is downloaded. Each
 * system draws the first face it has; the Word export names Consolas, the
 * face this stack resolves to on Windows (`SWISS_IT_MONO_FONT_DOCX`).
 */
export const SWISS_IT_MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

/** The monospace face the Word export names: Consolas, installed with Windows and Office. */
export const SWISS_IT_MONO_FONT_DOCX = 'Consolas'

/** The width of the page's content between the body's paddings, in CSS px. */
export const SWISS_IT_CONTENT_WIDTH = PAGE_WIDTH_PX - 2 * SWISS_IT_GEOMETRY.paddingX

/** One project card's outer width: half the content less half the gap between the two columns. */
export const SWISS_IT_CARD_WIDTH = (SWISS_IT_CONTENT_WIDTH - SWISS_IT_GEOMETRY.cardGap) / 2

/**
 * The width a project card leaves for text: its width less the border and the
 * padding on each side. Every word of a card is drawn whole when it is no wider
 * than this (`swiss-it-template.test.ts` measures the long words of each locale
 * against it).
 */
export const SWISS_IT_CARD_TEXT_WIDTH = SWISS_IT_CARD_WIDTH - 2 * (SWISS_IT_GEOMETRY.cardBorder + SWISS_IT_GEOMETRY.cardPaddingX)

/**
 * The template's sections, top to bottom, as `t7-informatique.png` draws them.
 * `keyAchievements` is the model's id for the projects, drawn as cards under
 * the new `projects` heading (FR-6); `languagesAndCertifications` is the one
 * section that closes the page.
 */
export const SWISS_IT_SECTIONS = ['summary', 'skills', 'experience', 'keyAchievements', 'education', 'languagesAndCertifications'] as const

export type SwissItSectionId = (typeof SWISS_IT_SECTIONS)[number]

/** The sections the editor's main-content panel can hide on this template, in the order it draws them. */
export const SWISS_IT_MAIN_SECTIONS = ['summary', 'experience', 'education'] as const satisfies readonly EditorMainId[]

/** The sections the editor's sidebar panel can hide on this template, in the order it draws them. */
export const SWISS_IT_SIDEBAR_SECTIONS = ['skills', 'keyAchievements', 'languages', 'training'] as const satisfies readonly EditorSidebarId[]

const HIDEABLE_MAIN: readonly string[] = SWISS_IT_MAIN_SECTIONS

/** What the template draws, after the layout model's section visibility. */
export interface SwissItVisibility {
  /** The sections drawn, in the template's fixed order. */
  sections: SwissItSectionId[]
  /** Whether the last section draws the languages. */
  languages: boolean
  /** Whether the last section draws the certifications. */
  certifications: boolean
}

/**
 * The sections drawn, in the template's fixed order, less those the layout
 * model hides (FR-2): summary, experience and education through
 * `hiddenMainSections`; the skills, the projects (`keyAchievements`), the
 * languages and the certifications (`training`), which are SIDEBAR ids in the
 * model, through `hiddenSidebarSections`, whatever template hid them. These are
 * the rows the editor lists for this template, all fixed
 * (`TEMPLATE_EDITOR_SECTIONS.swissIt`), so the stored ORDER is not read. The
 * last section is dropped only when both of its parts are hidden.
 *
 * Whether a drawn section has any content is each output's own test on the
 * same visible items, and an empty one draws no heading.
 */
export function swissItVisibility(hiddenMainSections: readonly string[], hiddenSidebarSections: readonly string[]): SwissItVisibility {
  const languages = !hiddenSidebarSections.includes('languages' satisfies EditorSidebarId)
  const certifications = !hiddenSidebarSections.includes('training' satisfies EditorSidebarId)
  const sections = SWISS_IT_SECTIONS.filter((sectionId) => {
    if (sectionId === 'languagesAndCertifications') return languages || certifications
    return HIDEABLE_MAIN.includes(sectionId) ? !hiddenMainSections.includes(sectionId) : !hiddenSidebarSections.includes(sectionId)
  })
  return { sections, languages, certifications }
}

/**
 * A section heading as the mockup draws it: `// ` and the existing label in
 * lower case ("// expérience"). Lower-cased here, in the locale's own rules,
 * rather than by a CSS `text-transform` on the Preview alone: Word has no
 * lower-case run property, so one string is the only way the four outputs —
 * the PDF's text layer included — read the same words.
 */
export function swissItHeading(label: string, locale: string): string {
  return `// ${label.toLocaleLowerCase(locale)}`
}

/** The CV title as the band draws it, behind a terminal prompt: `> title`. */
export function swissItTitle(title: string): string {
  return `> ${title}`
}

/** The no-break space: it holds two words together on one line. */
const NBSP = '\u00A0'

/**
 * What joins the languages, and the certifications, of the last section:
 * " · ", its first space a no-break space, so a line that wraps breaks after a
 * dot, never before one.
 */
export const SWISS_IT_SEPARATOR = `${NBSP}\u00B7 `

/**
 * What ends every contact value of a line but its last: the separator's
 * no-break space and dot. The space after the dot is each output's own: the
 * Preview's flex gap and text-layer separator, Word's breakable space.
 */
export const SWISS_IT_CONTACT_DOT = `${NBSP}\u00B7`

/**
 * `text` with every space a no-break space: one unit a Word line never breaks
 * inside. The Preview needs none: it draws each tag and each contact value as
 * a flex item, which a line wraps as a whole.
 */
export function swissItUnbreakable(text: string): string {
  return text.trim().replace(/ +/g, NBSP)
}

/** Where a link, an address or another token may wrap: after a "/" not followed by another, and before ".", "-", "?", "#" or "=". */
const LINK_BREAK = /(?<=\/)(?!\/)|(?<=.)(?=[.\-?#=])/

/**
 * `text` cut at the places a link may wrap (`LINK_BREAK`), in order; joined
 * back, the parts are `text`. Each output marks the cuts with a break
 * opportunity that draws nothing — `<wbr>` on the Preview, a zero-width space
 * in Word — so a link wider than its line wraps at one of its own boundaries,
 * never at an arbitrary letter (the owner's rule). Browsers and Word also
 * break after a hyphen on their own, which is the same boundary's other side.
 * A text with no such boundary is one part, and wraps as before.
 */
export function swissItLinkParts(text: string): string[] {
  return text.split(LINK_BREAK).filter((part) => part !== '')
}

/** The band's two contact lines, as the mockup draws them: where to reach the person, then their links. */
const CONTACT_LINES: readonly (readonly (keyof ResumeContact)[])[] = [
  ['location', 'phone', 'email'],
  ['linkedin', 'github', 'website'],
]

/**
 * The band's contact lines: the location, phone and email on the first, the
 * LinkedIn, GitHub and website on the second, each the filled values in that
 * order, every one but the last ending in `SWISS_IT_CONTACT_DOT`. Each value is
 * drawn whole — a line wraps between two values, never inside one, so a phone
 * number stays on one line. A line with no filled value is not drawn, and the
 * other one is then the only line (FR-2).
 */
export function swissItContactLines(contact: ResumeContact): string[][] {
  return CONTACT_LINES.flatMap((keys) => {
    const values = keys.flatMap((key) => {
      const value = contact[key]
      return typeof value === 'string' && value.trim() !== '' ? [value.trim()] : []
    })
    return values.length > 0 ? [values.map((value, index) => (index < values.length - 1 ? `${value}${SWISS_IT_CONTACT_DOT}` : value))] : []
  })
}

/**
 * An entry's dates as `MM.YYYY – MM.YYYY`, or "MM.YYYY – present" while it is
 * current; empty when the entry stores no date and is not current (FR-1).
 * The same rule `swissEngineering` draws its dates by.
 */
export const swissItDates = swissEngineeringDates

/**
 * An experience's or an education's two lines, as the mockup draws them: the
 * position (or degree) in bold, then the company and location (or school and
 * field) in grey below. With no position (or degree), the second line's text
 * is the bold line and there is no second line, so the entry still opens with
 * a heading of its own. A part that is not stored leaves no empty line and no
 * dangling separator (FR-2).
 */
export function swissItEntryLines(lead: string | undefined, details: readonly (string | undefined)[]): { lead: string; detail: string } {
  const title = lead?.trim() ?? ''
  const detail = details
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(', ')
  return title ? { lead: title, detail } : { lead: detail, detail: '' }
}

/**
 * A skill category's label as it leads its tags on the same line: the stored
 * category and a colon, as `swissCommerce` labels its skills, in every locale.
 */
export const swissItSkillLabel = swissCommerceSkillLabel

/**
 * What a skill category draws after its label, or null when it draws nothing
 * and is left out (FR-2): its skills as tags — its legacy `items`, or its rich
 * text when that is a plain comma-separated list, read exactly as
 * `swissTrades` reads it — or any other rich text, drawn through each output's
 * sanitizing helpers (FR-9). The stored rich text wins over `items`.
 */
export const swissItSkillContent = swissTradesSkillContent


/**
 * What a project's card draws, or null when it draws nothing and has no card
 * (FR-2): its name in bold; its description, rich text; its link; its
 * technologies as tags. The mockup draws the name, the description and the
 * tags; the link is stored content the editor's Projects tab collects, so it is
 * drawn rather than dropped (FR-1), as `swissEngineering` draws it. The
 * project's dates are not drawn: no template of the platform draws them.
 */
export function swissItProject(project: Pick<ResumeProject, 'name' | 'description' | 'url' | 'technologies'>): {
  name: string
  description: string | null
  url: string
  technologies: string[]
} | null {
  const name = project.name?.trim() ?? ''
  const description = swissHasText(project.description) ? project.description : null
  const technologies = (project.technologies ?? [])
    .map((technology) => (typeof technology === 'string' ? technology.trim() : ''))
    .filter((technology) => technology !== '')
  const url = project.url?.trim() ?? ''
  if (!name && !description && technologies.length === 0 && !url) return null
  return { name, description, url, technologies }
}

/** The project cards, two to a row, in order; an odd last card is alone in the left column. */
export function swissItCardRows<T>(cards: readonly T[]): [T, T | null][] {
  const rows: [T, T | null][] = []
  for (let index = 0; index < cards.length; index += 2) rows.push([cards[index], cards[index + 1] ?? null])
  return rows
}

/** The last section's languages line: each visible language with its level, as "language — level", joined. */
export function swissItLanguagesLine(languages: readonly { language: string; level: string }[]): string {
  return languages.map(({ language, level }) => swissTradesLanguageLine(language.trim(), level)).join(SWISS_IT_SEPARATOR)
}

/**
 * A certificate as the last section draws it, as the mockup's
 * "AWS Certified Developer – Associate (2023)": its name and issuer joined by
 * " – ", then its month in brackets, in the `MM.YYYY` every Swiss template
 * prints. A part not stored is left out with its separator or brackets; a
 * certificate with a month alone draws the month. Empty when nothing is stored.
 */
export function swissItCertificate(name: string | undefined, issuer: string | undefined, month: string): string {
  const text = [name?.trim(), issuer?.trim()].filter((part): part is string => Boolean(part)).join(' \u2013 ')
  if (!month) return text
  return text ? `${text} (${month})` : month
}

/** The last section's certifications line: every visible certificate, joined. */
export function swissItCertificationsLine(certificates: readonly string[]): string {
  return certificates.join(SWISS_IT_SEPARATOR)
}

/**
 * The last section's heading, from the existing labels only (FR-6): the
 * languages and certifications labels joined by " & " when it holds both, as
 * the mockup's "langues & certifications", or the one it holds alone, then
 * drawn as every heading of the template is (`swissItHeading`).
 */
export function swissItLastHeading(
  languagesLabel: string,
  trainingLabel: string,
  hasLanguages: boolean,
  hasCertifications: boolean,
  locale: string,
): string {
  return swissItHeading(swissFinanceSkillsHeading(languagesLabel, trainingLabel, hasLanguages, hasCertifications), locale)
}
