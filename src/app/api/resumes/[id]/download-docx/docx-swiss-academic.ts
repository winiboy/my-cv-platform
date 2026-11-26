import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  NoBreakHyphen,
  Packer,
  PageOrientation,
  Paragraph,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertInchesToTwip,
  type IBorderOptions,
} from 'docx'
import type {
  ResumeCertification,
  ResumeContact,
  ResumeEducation,
  ResumeExperience,
  ResumeLanguage,
  ResumeProject,
  ResumeSkillCategory,
} from '@/types/database'
import { PAGE_HEIGHT_TWIPS, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { georgiaTextWidthPx } from '@/lib/georgia-advance-widths'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_ACADEMIC_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import { formatSwissMonth, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import { swissEngineeringProject } from '@/lib/swiss-engineering-template'
import { swissFinanceSkillContent } from '@/lib/swiss-finance-template'
import { SWISS_IT_CONTACT_DOT, swissItDates, swissItLinkParts, swissItUnbreakable } from '@/lib/swiss-it-template'
import {
  SWISS_ACADEMIC_CONTENT_WIDTH,
  SWISS_ACADEMIC_GEOMETRY as GEOMETRY,
  SWISS_ACADEMIC_SERIF_DOCX as SERIF,
  SWISS_ACADEMIC_SIZES as SIZES,
  swissAcademicContactValues,
  swissAcademicDate,
  swissAcademicDateColumnPx,
  swissAcademicEntryLine,
  swissAcademicLanguagesText,
  swissAcademicLastHeading,
  swissAcademicSkillLabel,
  swissAcademicVisibility,
  type SwissAcademicSectionId,
} from '@/lib/swiss-academic-template'
import { visibleContactDetails } from '@/lib/contact-visibility'
import {
  KEEP_LINES,
  KEEP_WITH_NEXT,
  NO_TEXT_LINE,
  exactLineSpacing,
  extractAlignment,
  keepAt,
  noBreakHyphenChildren,
  parseHtmlToDocxRuns,
  parsePlainTextBlocks,
  parsePlainTextListToParagraphs,
  pxToHalfPoints,
  pxToTwips,
  trackingSpacing,
  type DocxGeneratorSettings,
  type ParagraphKeep,
} from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { FORMATTED_LIST_INDENT_PX, FORMATTED_LIST_MARKER_EM, bareInlineFormatTags, formattedBlocks } from './docx-preview-metrics'
import { TAG_BREAK } from './docx-swiss-trades'

/** The stored columns this generator reads, typed as the application writes them. */
interface StoredResume {
  title?: string | null
  summary?: string | null
  contact?: ResumeContact | null
  experience?: ResumeExperience[] | null
  education?: ResumeEducation[] | null
  certifications?: ResumeCertification[] | null
  skills?: ResumeSkillCategory[] | null
  languages?: ResumeLanguage[] | null
  projects?: ResumeProject[] | null
}

/** Every run and border, in the colour the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissAcademic

/** The letter spacing the Preview's `tracking-widest` draws on the headings, in em. */
const TRACKING = PREVIEW_TRACKING.swissAcademic

const LINE_HEIGHT = SWISS_ACADEMIC_LINE_HEIGHT

/** The numbering definition of the publications: Word's own decimal list, "1.", "2.", "3.". */
export const SWISS_ACADEMIC_PUBLICATIONS_NUMBERING = 'swiss-academic-publications'

/** A border OOXML draws as nothing. */
const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
const NO_CELL_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const NO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 }

/** A CSS px border width as a Word border width, in eighths of a point. */
const pxToEighths = (px: number) => Math.round(px * 0.75 * 8)

/** A CSS px gap as a Word border's `space`, in whole points. */
const pxToPoints = (px: number) => Math.round(px * 0.75)

/** The paragraph a table cell or the end of the body needs, drawing no text. */
const emptyParagraph = () => new Paragraph({ children: [], spacing: { before: 0, after: 0, ...NO_TEXT_LINE } })

/** A paragraph drawing no text that carries a vertical gap of `twips`. */
const spacer = (twips: number, keep?: ParagraphKeep) => new Paragraph({ children: [], spacing: { before: 0, after: twips, ...NO_TEXT_LINE }, ...keep })

/**
 * How much narrower than its line a link must measure in Georgia to be held to
 * fit: a margin for what an unkerned sum and Word's own layout may differ by,
 * in CSS px.
 */
export const SWISS_ACADEMIC_SAFETY_PX = 4

/**
 * A link or a contact value written for Word, as a run's children, by the rule
 * `swissExecutive` writes its own (measured here in Georgia, the face this
 * template draws it in). One that fits `linePx` at Word's size, with
 * `SWISS_ACADEMIC_SAFETY_PX` to spare, moves as one unit: its characters as
 * stored, each hyphen a Word non-breaking hyphen (`w:noBreakHyphen`), which
 * Word draws as the run font's hyphen. One wider than the line on its own gets
 * a zero-width space at each of its boundaries (`swissItLinkParts`), so Word
 * wraps it after a "/" or before a "."; an email address that wide is written
 * as stored, never given a break opportunity (a recorded FR-10 limit).
 */
export function swissAcademicLinkChildren(text: string, linePx: number, halfPoints: number, isEmail = false): (string | NoBreakHyphen)[] {
  if (georgiaTextWidthPx(text, 'regular', halfPoints / 1.5) > linePx - SWISS_ACADEMIC_SAFETY_PX) {
    return [isEmail ? text : swissItLinkParts(text).join(TAG_BREAK)]
  }
  return noBreakHyphenChildren(text)
}

/**
 * Generate the Word export of the "Académique & recherche" template.
 *
 * The Preview (`swiss-academic-template.tsx`) is the contract: the same
 * sections in the same fixed order, the same visibility, headings, dates,
 * level names and numbered publications, read from
 * `@/lib/swiss-academic-template` and the shared Swiss helpers. It draws no
 * photo, whatever the route hands it (PRD FR-5 exception).
 *
 * Layout in Word: Georgia throughout; every page has the printed Preview's
 * top and foot margins; headings are bold small capitals with the thin rule
 * as the paragraph's bottom border; each dated section is a borderless table
 * whose date column is the Preview's (`swissAcademicDateColumnPx`); the
 * publications are a real Word numbered list (decimal, "1.").
 */
export async function generateSwissAcademicDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does
  // (FR-4). `photoBase64` is not read: the template draws no photo.
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields } = settings
  const visibility = swissAcademicVisibility(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = SERIF

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads. An entry that
  // stores nothing the template draws is not an entry (FR-2), as on the Preview.
  const row = (resume ?? {}) as StoredResume
  const { contact, title } = visibleContactDetails(row, hiddenContactFields)
  const education = (row.education || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const line = swissAcademicEntryLine(edu.degree, [edu.school])
    const field = edu.field?.trim() ?? ''
    const dates = swissAcademicDate(swissItDates(edu.startDate, edu.endDate, false, dict))
    const description = swissHasText(edu.description) ? edu.description : null
    return line.lead || line.rest || field || dates || description ? [{ ...line, field, dates, description }] : []
  })
  const experiences = (row.experience || []).flatMap((exp) => {
    if (exp.visible === false) return []
    const line = swissAcademicEntryLine(exp.position, [exp.company, exp.location])
    const dates = swissAcademicDate(swissItDates(exp.startDate, exp.endDate, exp.current, dict))
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return line.lead || line.rest || dates || achievements.length > 0 || description ? [{ ...line, dates, achievements, description }] : []
  })
  const projects = (row.projects || []).flatMap((project) => {
    const drawn = project.visible === false ? null : swissEngineeringProject(project)
    return drawn ? [drawn] : []
  })
  const distinctions = (row.certifications || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const line = swissAcademicEntryLine(cert.name, [cert.issuer])
    const dates = cert.date?.trim() ? swissAcademicDate(formatSwissMonth(cert.date)) : ''
    return line.lead || line.rest || dates ? [{ ...line, dates }] : []
  })
  const skills = visibility.skills
    ? (row.skills || []).flatMap((skill) => {
        const content = skill.visible === false ? null : swissFinanceSkillContent(skill)
        return content ? [{ category: skill.category?.trim() ?? '', content }] : []
      })
    : []
  const languages = visibility.languages
    ? (row.languages || []).flatMap((lang) =>
        lang.visible !== false && lang.language?.trim() ? [{ language: lang.language, level: swissLanguageLevel(dict, lang.level) }] : [],
      )
    : []

  const sectionShown = (sectionId: SwissAcademicSectionId) => visibility.sections.includes(sectionId)
  // The Preview's one date column, from the same dates.
  const dateColumnPx = swissAcademicDateColumnPx([
    ...(sectionShown('education') ? education.map((edu) => edu.dates) : []),
    ...(sectionShown('experience') ? experiences.map((exp) => exp.dates) : []),
    ...(sectionShown('training') ? distinctions.map((cert) => cert.dates) : []),
  ])

  // Run sizes in whole half-points; line pitches from the unrounded px.
  const size = {
    name: pxToHalfPoints(SIZES.name),
    title: pxToHalfPoints(SIZES.title),
    contact: pxToHalfPoints(SIZES.contact),
    heading: pxToHalfPoints(SIZES.heading),
    body: pxToHalfPoints(SIZES.body),
    date: pxToHalfPoints(SIZES.date),
  }
  const line = {
    name: SIZES.name * 1.5,
    title: SIZES.title * 1.5,
    contact: SIZES.contact * 1.5,
    heading: SIZES.heading * 1.5,
    body: SIZES.body * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const marginX = pxToTwips(GEOMETRY.paddingX)
  const contentWidth = pageWidthTwips - 2 * marginX
  const numberIndent = pxToTwips(GEOMETRY.numberIndent)
  /** A list marker's hang: its measured width before the text, as the Preview's list draws it. */
  const markerHang = pxToTwips(FORMATTED_LIST_MARKER_EM * (size.body / 1.5))

  const run = (text: string, color: string, options: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
    new TextRun({ text, color, font, size: options.size ?? size.body, bold: options.bold, italics: options.italics })

  /**
   * Rich text (summary, descriptions, `skillsHtml`) as the Preview's
   * `renderFormattedText` draws it, as `docx-swiss-engineering.ts` draws it:
   * HTML as one paragraph per block the browser draws (`formattedBlocks`),
   * plain text by `formatText`'s rules. `indent` moves every paragraph in by
   * that many twips (a publication's text, under its number), and `numbered`
   * puts the publication's number on the first paragraph. `keep`: the keep
   * rules of the last paragraph, inside a block print keeps whole (`keepAt`).
   */
  const richParagraphs = (
    text: string,
    color: string,
    options: { spacingBefore?: number; indent?: number; numbered?: boolean; keep?: ParagraphKeep } = {},
  ): Paragraph[] => {
    const { keep } = options
    /** A paragraph more of the text follows. */
    const keepInside = keep ? KEEP_WITH_NEXT : {}
    const runOptions = { size: size.body, color, font }
    const lineSpacing = exactLineSpacing([formattedTextLineHeight(text, LINE_HEIGHT.text), line.body])
    const alignment = extractAlignment(text)
    const left = options.indent ?? 0
    const numbering = { reference: SWISS_ACADEMIC_PUBLICATIONS_NUMBERING, level: 0 }
    /**
     * The number of an item whose text opens with a list: a paragraph of its
     * own, holding the number alone, so a list item never carries both the
     * number and its own marker, and every item is numbered.
     */
    const numberLead = () =>
      new Paragraph({
        children: [],
        numbering,
        indent: { left, hanging: left },
        alignment,
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.text, line.body]) },
        ...keepInside,
      })
    let paragraphs: Paragraph[]
    if (rendersAsFormattedContent(text)) {
      const blocks = formattedBlocks(text)
      // Numbered, the first block carries the number only when it is plain text.
      const numberFirst = options.numbered === true && blocks[0]?.marker === null && blocks[0]?.depth === 0
      paragraphs = blocks.map((block, index) => {
        const listLeft = left + pxToTwips(FORMATTED_LIST_INDENT_PX * block.depth)
        return new Paragraph({
          children: [
            ...(block.marker === null ? [] : [new TextRun({ ...runOptions, text: `${block.marker}\t` })]),
            ...parseHtmlToDocxRuns(bareInlineFormatTags(block.html), runOptions),
          ],
          alignment: block.alignment ?? alignment,
          ...(numberFirst && index === 0 ? { numbering } : {}),
          indent:
            block.depth === 0
              ? left > 0
                ? { left, hanging: numberFirst && index === 0 ? left : 0 }
                : undefined
              : { left: listLeft, hanging: block.marker === null ? 0 : markerHang },
          // The same tab stop as an experience's bullets: the marker's tab lands on the text.
          ...(block.marker === null ? {} : { tabStops: [{ type: TabStopType.LEFT, position: listLeft }] }),
          spacing: { after: 0, ...lineSpacing },
          ...keepAt(keep, index, blocks.length),
        })
      })
      if (options.numbered && !numberFirst && paragraphs.length > 0) paragraphs.unshift(numberLead())
    } else {
      // Plain text: its first block of text carries the number when it is
      // numbered, built here as `parsePlainTextListToParagraphs` builds a text
      // block; the rest is the shared helper's, indented under the number. A
      // text that opens with a list has the number on a paragraph of its own.
      const [first, ...rest] = options.numbered ? parsePlainTextBlocks(text) : []
      if (options.numbered && first !== undefined && first.type !== 'text') {
        paragraphs = [
          numberLead(),
          ...parsePlainTextListToParagraphs(text, runOptions, { spacingAfterItem: 0, spacingAfterLast: 0, alignment, lineSpacing, indent: { left }, keep }),
        ]
      } else if (options.numbered && first?.type === 'text') {
        const lines = first.lines.length > 1 && first.lines[first.lines.length - 1].trim() === '' ? first.lines.slice(0, -1) : first.lines
        const runs: TextRun[] = []
        lines.forEach((textLine, index) => {
          if (index > 0) runs.push(new TextRun({ break: 1, ...runOptions }))
          if (textLine) runs.push(new TextRun({ text: textLine, ...runOptions }))
        })
        const tail = text.split(/\n\n+/).slice(1).join('\n\n')
        const tailParagraphs =
          tail && rest.length > 0
            ? parsePlainTextListToParagraphs(tail, runOptions, { spacingAfterItem: 0, spacingAfterLast: 0, alignment, lineSpacing, indent: { left }, keep })
            : []
        paragraphs = [
          new Paragraph({
            children: runs,
            numbering,
            indent: { left, hanging: left },
            alignment,
            spacing: { after: 0, ...lineSpacing },
            ...(tailParagraphs.length > 0 ? keepInside : keep),
          }),
          ...tailParagraphs,
        ]
      } else {
        paragraphs = parsePlainTextListToParagraphs(text, runOptions, {
          spacingAfterItem: 0,
          spacingAfterLast: 0,
          alignment,
          lineSpacing,
          indent: left > 0 ? { left } : undefined,
          keep,
        })
      }
    }
    if (options.spacingBefore && paragraphs.length > 0) paragraphs.unshift(spacer(options.spacingBefore, keep ? KEEP_WITH_NEXT : undefined))
    return paragraphs
  }

  /** A section heading: bold letter-spaced small capitals, the thin rule its bottom border, kept with what follows. */
  const heading = (label: string) =>
    new Paragraph({
      children: [
        new TextRun({
          text: label,
          font,
          size: size.heading,
          bold: true,
          smallCaps: true,
          color: PALETTE.ink,
          characterSpacing: trackingSpacing(TRACKING.caps, size.heading),
        }),
      ],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.headingRule), color: PALETTE.rule, space: pxToPoints(GEOMETRY.headingRuleGap) },
      },
      spacing: { before: 0, after: pxToTwips(GEOMETRY.headingGap), ...exactLineSpacing([LINE_HEIGHT.compact, line.heading]) },
      keepNext: true,
    })

  /**
   * The keep rules of a dated entry's paragraphs. With a date column each
   * entry is a table row that does not split, and a paragraph kept with the
   * next one would keep its row with the next row, so there are none. Without
   * one, an entry is paragraphs, kept whole as print keeps it: `more` when
   * more of the entry follows the paragraph.
   */
  const entryKeep = (more: boolean): ParagraphKeep | undefined => (dateColumnPx === 0 ? (more ? KEEP_WITH_NEXT : KEEP_LINES) : undefined)

  /** An entry's line: its lead (bold when `bold`), then " — " and its place. */
  const entryLine = (lead: string, rest: string, bold: boolean, keep?: ParagraphKeep): Paragraph[] => {
    if (!lead && !rest) return []
    // Not bold, the line is one run, as the Preview's one text node.
    const runs: TextRun[] = bold ? [] : [run(`${lead}${rest}`, PALETTE.body)]
    if (bold && lead) runs.push(run(lead, PALETTE.ink, { bold }))
    if (bold && rest) runs.push(run(rest, PALETTE.body))
    return [new Paragraph({ children: runs, spacing: { after: 0, ...bodyLine }, ...keep })]
  }

  /**
   * One borderless table of dated entries: the dates in the left column, as
   * wide as the Preview's (`swissAcademicDateColumnPx`), the content beside
   * them after the gap; each entry a row that does not split. With no date
   * column, the entries' content alone.
   */
  const datedRows = (entries: { dates: string; content: Paragraph[] }[]): (Paragraph | Table)[] => {
    if (dateColumnPx === 0) {
      return entries.flatMap(({ content }, index) => [...(index > 0 ? [spacer(pxToTwips(GEOMETRY.entryGap))] : []), ...content])
    }
    const dateWidth = pxToTwips(dateColumnPx)
    const contentCell = contentWidth - dateWidth
    return [
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [dateWidth, contentCell],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        // No default cell margins: the date cell's text is its whole width.
        margins: NO_MARGINS,
        rows: entries.map(
          ({ dates, content }, index) =>
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: dateWidth, type: WidthType.DXA },
                  margins: { ...NO_MARGINS, top: index === 0 ? 0 : pxToTwips(GEOMETRY.entryGap) },
                  borders: NO_CELL_BORDERS,
                  verticalAlign: VerticalAlign.TOP,
                  children: [new Paragraph({ children: dates ? [run(dates, PALETTE.muted, { size: size.date })] : [], spacing: { after: 0, ...bodyLine } })],
                }),
                new TableCell({
                  width: { size: contentCell, type: WidthType.DXA },
                  margins: { ...NO_MARGINS, top: index === 0 ? 0 : pxToTwips(GEOMETRY.entryGap), left: pxToTwips(GEOMETRY.dateGap) },
                  borders: NO_CELL_BORDERS,
                  verticalAlign: VerticalAlign.TOP,
                  children: content.length > 0 ? content : [emptyParagraph()],
                }),
              ],
            }),
        ),
      }),
    ]
  }

  const children: (Paragraph | Table)[] = []

  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------
  // Page 1 starts where it does on screen: the page's top margin, then the
  // document's own top padding less that margin.
  children.push(spacer(pxToTwips(GEOMETRY.paddingTop - GEOMETRY.pageTop)))
  const header: Paragraph[] = []
  if (contact.name) {
    header.push(
      new Paragraph({
        children: [run(contact.name, PALETTE.ink, { bold: true, size: size.name })],
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.name, line.name]) },
      }),
    )
  }
  if (title) {
    header.push(
      new Paragraph({
        children: [run(title, PALETTE.muted, { size: size.title })],
        spacing: { before: contact.name ? pxToTwips(GEOMETRY.nameGap) : 0, after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, line.title]) },
      }),
    )
  }
  const contactValues = swissAcademicContactValues(contact)
  if (contactValues.length > 0) {
    // Each value is held together — no-break spaces, non-breaking hyphens — so
    // the line wraps at the breakable space after a dot and moves a value that
    // does not fit whole, as the Preview's row wraps between two values; a
    // value wider than the whole line on its own wraps at its link boundaries,
    // an email never.
    const email = contact.email?.trim()
    const runs = contactValues.map((value, index) => {
      const stored = value.endsWith(SWISS_IT_CONTACT_DOT) ? value.slice(0, -SWISS_IT_CONTACT_DOT.length) : value
      const valueChildren = swissAcademicLinkChildren(swissItUnbreakable(value), SWISS_ACADEMIC_CONTENT_WIDTH, size.contact, stored === email)
      return new TextRun({ children: index < contactValues.length - 1 ? [...valueChildren, ' '] : valueChildren, color: PALETTE.muted, font, size: size.contact })
    })
    header.push(
      new Paragraph({
        children: runs,
        spacing: { before: contact.name || title ? pxToTwips(GEOMETRY.titleGap) : 0, after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, line.contact]) },
      }),
    )
  }
  children.push(...header)
  const hasHeader = header.length > 0

  // ----------------------------------------------------------
  // SECTIONS, in the template's fixed order
  // ----------------------------------------------------------
  const sectionBlocks = (sectionId: SwissAcademicSectionId): (Paragraph | Table)[] => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return []
        // Kept whole with its heading, as print keeps the section.
        return [heading(swissHeading(dict, 'summary')), ...richParagraphs(row.summary, PALETTE.body, { keep: KEEP_LINES })]

      case 'education':
        if (education.length === 0) return []
        return [
          heading(swissHeading(dict, 'education')),
          ...datedRows(
            education.map((edu) => ({
              dates: edu.dates,
              content: [
                ...entryLine(edu.lead, edu.rest, true, entryKeep(Boolean(edu.field || edu.description))),
                // The field of study, as the mockup's thesis line: stored text, italic, grey.
                ...(edu.field
                  ? [
                      new Paragraph({
                        children: [run(edu.field, PALETTE.muted, { italics: true })],
                        spacing: { after: 0, ...bodyLine },
                        ...entryKeep(Boolean(edu.description)),
                      }),
                    ]
                  : []),
                ...(edu.description
                  ? richParagraphs(edu.description, PALETTE.body, { spacingBefore: pxToTwips(GEOMETRY.detailGap), keep: entryKeep(false) })
                  : []),
              ],
            })),
          ),
        ]

      case 'experience':
        if (experiences.length === 0) return []
        return [
          heading(swissHeading(dict, 'experience')),
          ...datedRows(
            experiences.map((exp) => {
              const content: Paragraph[] = [...entryLine(exp.lead, exp.rest, true, entryKeep(exp.achievements.length > 0 || Boolean(exp.description)))]
              if (exp.achievements.length > 0) {
                // The same bullet geometry as a description's list (`richParagraphs`).
                const indent = pxToTwips(FORMATTED_LIST_INDENT_PX)
                exp.achievements.forEach((achievement, i) => {
                  content.push(
                    new Paragraph({
                      children: [run('•\t', PALETTE.body), ...parseHtmlToDocxRuns(achievement, { size: size.body, color: PALETTE.body, font })],
                      indent: { left: indent, hanging: markerHang },
                      tabStops: [{ type: TabStopType.LEFT, position: indent }],
                      spacing: {
                        before: i === 0 ? pxToTwips(GEOMETRY.detailGap) : 0,
                        after: 0,
                        ...exactLineSpacing([formattedTextLineHeight(achievement, LINE_HEIGHT.text), line.body]),
                      },
                      ...keepAt(entryKeep(false), i, exp.achievements.length),
                    }),
                  )
                })
              } else if (exp.description) {
                content.push(...richParagraphs(exp.description, PALETTE.body, { spacingBefore: pxToTwips(GEOMETRY.detailGap), keep: entryKeep(false) }))
              }
              return { dates: exp.dates, content }
            }),
          ),
        ]

      case 'keyAchievements': {
        if (projects.length === 0) return []
        const blocks: (Paragraph | Table)[] = [heading(swissHeading(dict, 'publications'))]
        projects.forEach((project, index) => {
          if (index > 0) blocks.push(spacer(pxToTwips(GEOMETRY.publicationGap)))
          // The number on the item's first paragraph — its name, or else its
          // description — and every further paragraph under it. The item is
          // kept whole, as print keeps it.
          const extras: { children: (string | NoBreakHyphen)[] }[] = []
          if (project.technologies) extras.push({ children: [project.technologies] })
          if (project.url) extras.push({ children: swissAcademicLinkChildren(project.url, SWISS_ACADEMIC_CONTENT_WIDTH - GEOMETRY.numberIndent, size.body) })
          if (project.name) {
            blocks.push(
              new Paragraph({
                children: [run(project.name, PALETTE.ink, { bold: true })],
                numbering: { reference: SWISS_ACADEMIC_PUBLICATIONS_NUMBERING, level: 0 },
                indent: { left: numberIndent, hanging: numberIndent },
                spacing: { after: 0, ...bodyLine },
                ...(project.description || extras.length > 0 ? KEEP_WITH_NEXT : KEEP_LINES),
              }),
            )
          }
          if (project.description) {
            blocks.push(
              ...richParagraphs(project.description, PALETTE.body, {
                indent: numberIndent,
                numbered: !project.name,
                keep: extras.length > 0 ? KEEP_WITH_NEXT : KEEP_LINES,
              }),
            )
          }
          extras.forEach(({ children: runChildren }, extraIndex) => {
            const numbered = !project.name && !project.description && extraIndex === 0
            blocks.push(
              new Paragraph({
                children: [new TextRun({ children: runChildren, color: PALETTE.muted, font, size: size.body })],
                ...(numbered ? { numbering: { reference: SWISS_ACADEMIC_PUBLICATIONS_NUMBERING, level: 0 } } : {}),
                indent: { left: numberIndent, hanging: numbered ? numberIndent : 0 },
                spacing: { after: 0, ...bodyLine },
                ...keepAt(KEEP_LINES, extraIndex, extras.length),
              }),
            )
          })
        })
        return blocks
      }

      case 'training':
        if (distinctions.length === 0) return []
        return [
          heading(swissHeading(dict, 'distinctions')),
          ...datedRows(distinctions.map((cert) => ({ dates: cert.dates, content: entryLine(cert.lead, cert.rest, false, entryKeep(false)) }))),
        ]

      case 'skillsAndLanguages': {
        if (skills.length === 0 && languages.length === 0) return []
        const blocks: (Paragraph | Table)[] = [
          heading(swissAcademicLastHeading(swissHeading(dict, 'skills'), swissHeading(dict, 'languages'), skills.length > 0, languages.length > 0)),
        ]
        // The section is kept whole with its heading, as print keeps it.
        skills.forEach((skill, index) => {
          const before = index === 0 ? 0 : pxToTwips(GEOMETRY.lastRowGap)
          const keep = index === skills.length - 1 && languages.length === 0 ? KEEP_LINES : KEEP_WITH_NEXT
          const label = skill.category ? run(swissAcademicSkillLabel(skill.category), PALETTE.ink, { bold: true }) : null
          if (skill.content.kind === 'text') {
            blocks.push(
              new Paragraph({
                children: [...(label ? [label, run('\u00A0', PALETTE.body)] : []), run(skill.content.text, PALETTE.body)],
                spacing: { before, after: 0, ...bodyLine },
                ...keep,
              }),
            )
            return
          }
          // Rich text that is not a list of skills stands under its label.
          if (label) blocks.push(new Paragraph({ children: [label], spacing: { before, after: 0, ...bodyLine }, ...KEEP_WITH_NEXT }))
          blocks.push(...richParagraphs(skill.content.html, PALETTE.body, { spacingBefore: label ? 0 : before, keep }))
        })
        if (languages.length > 0) {
          blocks.push(
            new Paragraph({
              children: [
                run(swissAcademicSkillLabel(swissHeading(dict, 'languages')), PALETTE.ink, { bold: true }),
                run('\u00A0', PALETTE.body),
                run(swissAcademicLanguagesText(languages), PALETTE.body),
              ],
              spacing: { before: skills.length > 0 ? pxToTwips(GEOMETRY.lastRowGap) : 0, after: 0, ...bodyLine },
              ...KEEP_LINES,
            }),
          )
        }
        return blocks
      }
    }
  }

  let drawnSections = 0
  for (const sectionId of visibility.sections) {
    const blocks = sectionBlocks(sectionId)
    if (blocks.length === 0) continue
    // The space above a section: under the header for the first, the section
    // gap for the others; none for a first section with no header.
    const gap = drawnSections === 0 ? (hasHeader ? GEOMETRY.headerGap : 0) : GEOMETRY.sectionGap
    if (gap > 0) children.push(spacer(pxToTwips(gap)))
    children.push(...blocks)
    drawnSections += 1
  }

  // ----------------------------------------------------------
  // ASSEMBLE
  // ----------------------------------------------------------
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: SWISS_ACADEMIC_PUBLICATIONS_NUMBERING,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: numberIndent, hanging: numberIndent } },
                run: { font, size: size.body, color: PALETTE.body },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font, size: size.body },
          paragraph: { spacing: { before: 0, after: 0, ...bodyLine } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: pageWidthTwips, height: PAGE_HEIGHT_TWIPS, orientation: PageOrientation.PORTRAIT },
            // The printed Preview's page margins (`@page swiss-academic`), so
            // both break their pages at the same place.
            margin: {
              top: pxToTwips(GEOMETRY.pageTop),
              right: marginX,
              bottom: pxToTwips(GEOMETRY.pageBottom),
              left: marginX,
              header: 0,
              footer: 0,
            },
          },
        },
        // OOXML ends a body with a paragraph; after a table it carries no line.
        children: children[children.length - 1] instanceof Table ? [...children, emptyParagraph()] : children,
      },
    ],
  })

  return (await Packer.toBuffer(doc)) as Buffer
}
