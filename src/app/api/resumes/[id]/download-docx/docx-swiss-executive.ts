import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  LineRuleType,
  NoBreakHyphen,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
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
import JSZip from 'jszip'
import type {
  ResumeCertification,
  ResumeContact,
  ResumeEducation,
  ResumeExperience,
  ResumeLanguage,
  ResumeProject,
} from '@/types/database'
import { PAGE_HEIGHT_TWIPS, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { interLinkWidthPx } from '@/lib/inter-link-widths'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_EXECUTIVE_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import { formatSwissMonth, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import { swissEngineeringProject } from '@/lib/swiss-engineering-template'
import {
  SWISS_IT_CONTACT_DOT,
  swissItCardRows,
  swissItCertificationsLine,
  swissItDates,
  swissItEntryLines,
  swissItLanguagesLine,
  swissItLinkParts,
  swissItUnbreakable,
} from '@/lib/swiss-it-template'
import {
  SWISS_EXECUTIVE_CARD_TEXT_WIDTH,
  SWISS_EXECUTIVE_GEOMETRY as GEOMETRY,
  SWISS_EXECUTIVE_SERIF_DOCX as SERIF,
  SWISS_EXECUTIVE_SIZES as SIZES,
  swissExecutiveCertificate,
  swissExecutiveContactValues,
  swissExecutiveLastHeading,
  swissExecutiveVisibility,
  type SwissExecutiveSectionId,
} from '@/lib/swiss-executive-template'
import { visibleContactDetails } from '@/lib/contact-visibility'
import {
  APP_BODY_FONT,
  NO_TEXT_LINE,
  exactLineSpacing,
  extractAlignment,
  parseHtmlToDocxRuns,
  parsePlainTextListToParagraphs,
  pxToHalfPoints,
  pxToTwips,
  trackingSpacing,
  type DocxGeneratorSettings,
} from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { FORMATTED_LIST_INDENT_PX, FORMATTED_LIST_MARKER_EM, bareInlineFormatTags, formattedBlocks } from './docx-preview-metrics'
import { TAG_BREAK } from './docx-swiss-trades'
import {
  EXIF_ORIENTATION_NONE,
  EXIF_PHOTO_TRANSFORMS,
  calculateCoverCropPercents,
  detectImageType,
  extractBase64Data,
  parseImageDimensions,
  readJpegOrientation,
} from './docx-photo'

/** The stored columns this generator reads, typed as the application writes them. */
interface StoredResume {
  title?: string | null
  summary?: string | null
  contact?: ResumeContact | null
  experience?: ResumeExperience[] | null
  education?: ResumeEducation[] | null
  certifications?: ResumeCertification[] | null
  languages?: ResumeLanguage[] | null
  projects?: ResumeProject[] | null
}

/** Every run, border and fill, in the colour the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissExecutive

/** The letter spacing the Preview's `tracking-widest` draws on the CV title, in em. */
const TRACKING = PREVIEW_TRACKING.swissExecutive

const LINE_HEIGHT = SWISS_EXECUTIVE_LINE_HEIGHT

/** Word's single line spacing, in 240ths of a line. */
const AUTO_SINGLE_LINE = 240

/** DrawingML lengths are in EMU: 9525 to the CSS px. */
const EMU_PER_PX = 9525

/** A border OOXML draws as nothing. */
const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
const NO_CELL_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const NO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 }

/** A CSS px border width as a Word border width, in eighths of a point. */
const pxToEighths = (px: number) => Math.round(px * 0.75 * 8)

/** The paragraph a table cell or the end of the body needs, drawing no text. */
const emptyParagraph = () => new Paragraph({ children: [], spacing: { before: 0, after: 0, ...NO_TEXT_LINE } })

/** A paragraph drawing no text that carries a vertical gap of `twips`. */
const spacer = (twips: number) => new Paragraph({ children: [], spacing: { before: 0, after: twips, ...NO_TEXT_LINE } })

/**
 * How much narrower than its line a link or a date must measure in Inter to be
 * held to fit: a margin for what an unkerned sum and Word's own layout may
 * differ by, in CSS px.
 */
export const SWISS_EXECUTIVE_SAFETY_PX = 4

/**
 * A link or a contact value written for Word, as a run's children.
 *
 * One that fits `linePx` in Inter at Word's size (whole half-points), with
 * `SWISS_EXECUTIVE_SAFETY_PX` to spare, moves as one unit, as the Preview's
 * flex item does: its characters as stored, each hyphen a Word non-breaking
 * hyphen (`w:noBreakHyphen`, which Word draws as the hyphen glyph of the run's
 * font), since Word otherwise breaks after a hyphen ("catherine-" / "imhof.ch").
 *
 * One wider than the line on its own gets a zero-width space at each of its
 * boundaries (`swissItLinkParts`), so Word wraps it after a "/" or before a "."
 * rather than at a letter, as the Preview wraps it at its `<wbr>`s. An email
 * address that wide is written as stored, never given a break opportunity:
 * copied or parsed, it must be the stored address (it breaks where Word
 * decides, a recorded FR-10 limit).
 */
export function swissExecutiveLinkChildren(text: string, linePx: number, halfPoints: number, isEmail = false): (string | NoBreakHyphen)[] {
  if (interLinkWidthPx(text, halfPoints / 1.5) > linePx - SWISS_EXECUTIVE_SAFETY_PX) {
    return [isEmail ? text : swissItLinkParts(text).join(TAG_BREAK)]
  }
  return text.split('-').flatMap((part, index) => [...(index > 0 ? [new NoBreakHyphen()] : []), ...(part ? [part] : [])])
}

/**
 * The width of an entry's date column in Word, in twips: the widest of the
 * section's dates in Inter at Word's size, with `SWISS_EXECUTIVE_SAFETY_PX` to
 * spare, so no date wraps — the Preview's date column is as wide as its date.
 * A character outside printable ASCII is measured as Inter's widest glyph, so
 * the column can only come out wider than the date.
 */
export function swissExecutiveDateColumnTwips(dates: readonly string[], halfPoints: number): number {
  const widest = Math.max(0, ...dates.map((date) => interLinkWidthPx(date, halfPoints / 1.5)))
  return pxToTwips(Math.ceil(widest + SWISS_EXECUTIVE_SAFETY_PX))
}

/**
 * Generate the Word export of the "Cadre & direction" template.
 *
 * The Preview (`swiss-executive-template.tsx`) is the contract: the same
 * sections in the same fixed order, the same visibility, headings, dates,
 * level names and cards, read from `@/lib/swiss-executive-template` and the
 * shared Swiss helpers.
 *
 * Layout in Word: every page has the printed Preview's top and foot margins;
 * the header is a borderless table, the round photo in its last cell, over a
 * gold rule drawn as a paragraph border; the summary is a one-cell table
 * shaded cream with the gold bar as its left border, its runs italic; each row
 * of achievement cards is a table of two cells under a gold top border; an
 * entry's first line is a two-cell table whose date cell is as wide as the
 * section's widest date. The name and the headings are Georgia, the rest Inter.
 */
export async function generateSwissExecutiveDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does (FR-4).
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields, photoBase64 } = settings
  const visibility = swissExecutiveVisibility(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = APP_BODY_FONT

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads. An entry that
  // stores nothing the template draws is not an entry (FR-2), as on the Preview.
  const row = (resume ?? {}) as StoredResume
  const { contact, title, photoVisible } = visibleContactDetails(row, hiddenContactFields)
  const projects = (row.projects || []).flatMap((project) => {
    const drawn = project.visible === false ? null : swissEngineeringProject(project)
    return drawn ? [drawn] : []
  })
  const experiences = (row.experience || []).flatMap((exp) => {
    if (exp.visible === false) return []
    const lines = swissItEntryLines(exp.position, [exp.company, exp.location])
    const dates = swissItDates(exp.startDate, exp.endDate, exp.current, dict)
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return lines.lead || dates || achievements.length > 0 || description ? [{ ...lines, dates, achievements, description }] : []
  })
  const education = (row.education || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const lines = swissItEntryLines(edu.degree, [edu.school, edu.field])
    const dates = swissItDates(edu.startDate, edu.endDate, false, dict)
    const description = swissHasText(edu.description) ? edu.description : null
    return lines.lead || dates || description ? [{ ...lines, dates, description }] : []
  })
  const languages = visibility.languages
    ? (row.languages || []).flatMap((lang) =>
        lang.visible !== false && lang.language?.trim() ? [{ language: lang.language, level: swissLanguageLevel(dict, lang.level) }] : [],
      )
    : []
  const certificates = visibility.certifications
    ? (row.certifications || []).flatMap((cert) => {
        if (cert.visible === false) return []
        const line = swissExecutiveCertificate(cert.name, cert.issuer, cert.date ? formatSwissMonth(cert.date) : '')
        return line ? [line] : []
      })
    : []

  // Run sizes in whole half-points; line pitches from the unrounded px.
  const size = {
    name: pxToHalfPoints(SIZES.name),
    title: pxToHalfPoints(SIZES.title),
    contact: pxToHalfPoints(SIZES.contact),
    heading: pxToHalfPoints(SIZES.heading),
    summary: pxToHalfPoints(SIZES.summary),
    body: pxToHalfPoints(SIZES.body),
    date: pxToHalfPoints(SIZES.date),
  }
  const line = {
    name: SIZES.name * 1.5,
    title: SIZES.title * 1.5,
    contact: SIZES.contact * 1.5,
    heading: SIZES.heading * 1.5,
    summary: SIZES.summary * 1.5,
    body: SIZES.body * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const marginX = pxToTwips(GEOMETRY.paddingX)
  const contentWidth = pageWidthTwips - 2 * marginX

  const run = (text: string, color: string, options: { bold?: boolean; size?: number } = {}) =>
    new TextRun({ text, color, font, size: options.size ?? size.body, bold: options.bold })

  /**
   * Rich text (summary, descriptions) as the Preview's `renderFormattedText`
   * draws it. HTML: one paragraph per block the browser draws
   * (`formattedBlocks`), in order, each with its inline formatting, a list
   * item's marker hanging at the list's indent. Plain text: `formatText`'s
   * rules — its lists as items, its other blocks as paragraphs. As
   * `docx-swiss-engineering.ts` draws it.
   */
  const richParagraphs = (text: string, color: string, options: { size: number; line: number; spacingBefore?: number }): Paragraph[] => {
    const runOptions = { size: options.size, color, font }
    const lineSpacing = exactLineSpacing([formattedTextLineHeight(text, LINE_HEIGHT.text), options.line])
    const alignment = extractAlignment(text)
    const markerHang = pxToTwips(FORMATTED_LIST_MARKER_EM * (options.size / 1.5))
    const paragraphs = !rendersAsFormattedContent(text)
      ? parsePlainTextListToParagraphs(text, runOptions, { spacingAfterItem: 0, spacingAfterLast: 0, alignment, lineSpacing })
      : formattedBlocks(text).map(
          (block) =>
            new Paragraph({
              children: [
                ...(block.marker === null ? [] : [new TextRun({ ...runOptions, text: `${block.marker}\t` })]),
                ...parseHtmlToDocxRuns(bareInlineFormatTags(block.html), runOptions),
              ],
              alignment: block.alignment ?? alignment,
              indent:
                block.depth === 0
                  ? undefined
                  : { left: pxToTwips(FORMATTED_LIST_INDENT_PX * block.depth), hanging: block.marker === null ? 0 : markerHang },
              spacing: { after: 0, ...lineSpacing },
            }),
        )
    if (options.spacingBefore && paragraphs.length > 0) paragraphs.unshift(spacer(options.spacingBefore))
    return paragraphs
  }

  /** A section heading: burgundy Georgia, kept with what follows. */
  const heading = (label: string) =>
    new Paragraph({
      children: [new TextRun({ text: label, font: SERIF, size: size.heading, color: PALETTE.accent })],
      spacing: { before: 0, after: pxToTwips(GEOMETRY.headingGap), ...exactLineSpacing([LINE_HEIGHT.compact, line.heading]) },
      keepNext: true,
    })

  const textLine = (text: string, color: string, before = 0) =>
    new Paragraph({ children: [run(text, color)], spacing: { before, after: 0, ...bodyLine } })

  /**
   * An entry's first line: its bold title in a cell taking the rest of the
   * line, the dates in grey in a right-aligned cell as wide as the section's
   * widest date, so a date never wraps and a long title wraps at its spaces
   * beside it, as on the Preview. With no dates, the title alone.
   */
  const firstLine = (lead: string, dates: string, dateColumn: number): Paragraph | Table => {
    const leadParagraph = new Paragraph({ children: lead ? [run(lead, PALETTE.ink, { bold: true })] : [], spacing: { after: 0, ...bodyLine } })
    if (!dates) return leadParagraph
    const leadWidth = contentWidth - dateColumn
    return new Table({
      width: { size: contentWidth, type: WidthType.DXA },
      columnWidths: [leadWidth, dateColumn],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: leadWidth, type: WidthType.DXA },
              margins: { ...NO_MARGINS, right: pxToTwips(GEOMETRY.dateGap) },
              borders: NO_CELL_BORDERS,
              verticalAlign: VerticalAlign.TOP,
              children: [leadParagraph],
            }),
            new TableCell({
              width: { size: dateColumn, type: WidthType.DXA },
              margins: NO_MARGINS,
              borders: NO_CELL_BORDERS,
              verticalAlign: VerticalAlign.TOP,
              children: [
                new Paragraph({
                  children: [run(dates, PALETTE.muted, { size: size.date })],
                  alignment: AlignmentType.RIGHT,
                  spacing: { after: 0, ...bodyLine },
                }),
              ],
            }),
          ],
        }),
      ],
    })
  }

  const children: (Paragraph | Table)[] = []

  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------
  const photo = photoVisible && photoBase64 ? photoRun(photoBase64) : null
  const contactValues = swissExecutiveContactValues(contact)
  const photoCellWidth = pxToTwips(GEOMETRY.photoGap + GEOMETRY.photo)
  const headerTextWidth = contentWidth - (photo ? photoCellWidth : 0)

  const headerText: Paragraph[] = []
  if (contact.name) {
    headerText.push(
      new Paragraph({
        children: [new TextRun({ text: contact.name, font: SERIF, size: size.name, color: PALETTE.ink })],
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.name, line.name]) },
      }),
    )
  }
  if (title) {
    headerText.push(
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            font,
            size: size.title,
            allCaps: true,
            color: PALETTE.accent,
            characterSpacing: trackingSpacing(TRACKING.caps, size.title),
          }),
        ],
        spacing: { before: contact.name ? pxToTwips(GEOMETRY.nameGap) : 0, after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, line.title]) },
      }),
    )
  }
  if (contactValues.length > 0) {
    // Each value is held together — no-break spaces, non-breaking hyphens — so
    // the line wraps at the breakable space after a dot and moves a value that
    // does not fit whole, as the Preview's row wraps between two values; a
    // value wider than the whole line on its own wraps at its link boundaries,
    // an email never.
    const email = contact.email?.trim()
    const runs = contactValues.map((value, index) => {
      const stored = value.endsWith(SWISS_IT_CONTACT_DOT) ? value.slice(0, -SWISS_IT_CONTACT_DOT.length) : value
      const children = swissExecutiveLinkChildren(swissItUnbreakable(value), headerTextWidth / 15, size.contact, stored === email)
      return new TextRun({
        children: index < contactValues.length - 1 ? [...children, ' '] : children,
        color: PALETTE.muted,
        font,
        size: size.contact,
      })
    })
    headerText.push(
      new Paragraph({
        children: runs,
        spacing: {
          before: contact.name || title ? pxToTwips(GEOMETRY.titleGap) : 0,
          after: 0,
          ...exactLineSpacing([LINE_HEIGHT.compact, line.contact]),
        },
      }),
    )
  }

  const hasHeader = headerText.length > 0 || photo !== null
  // Page 1 starts where it does on screen: the page's top margin, then the
  // document's own top padding less that margin.
  children.push(spacer(pxToTwips(GEOMETRY.paddingTop - GEOMETRY.pageTop)))
  if (hasHeader) {
    if (headerText.length === 0) headerText.push(emptyParagraph())
    const cells: TableCell[] = [
      new TableCell({
        width: { size: headerTextWidth, type: WidthType.DXA },
        margins: NO_MARGINS,
        borders: NO_CELL_BORDERS,
        verticalAlign: VerticalAlign.CENTER,
        children: headerText,
      }),
    ]
    if (photo) {
      cells.push(
        new TableCell({
          width: { size: photoCellWidth, type: WidthType.DXA },
          // The drawing's effect extent (see `roundPhoto`) adds the ring's width on
          // each side; the side margins give it up so the circle stays in place.
          margins: { ...NO_MARGINS, left: pxToTwips(GEOMETRY.photoGap - GEOMETRY.photoRing), right: 0 },
          borders: NO_CELL_BORDERS,
          verticalAlign: VerticalAlign.CENTER,
          // Single (auto) spacing: under the document's default exact line,
          // Word clips the inline drawing to one text line's height.
          children: [
            new Paragraph({
              children: [photo.image],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 0, after: 0, line: AUTO_SINGLE_LINE, lineRule: LineRuleType.AUTO },
            }),
          ],
        }),
      )
    }
    children.push(
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: photo ? [headerTextWidth, photoCellWidth] : [headerTextWidth],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [new TableRow({ cantSplit: true, children: cells })],
      }),
    )
    // The gold rule under the header: an empty paragraph's bottom border.
    children.push(
      new Paragraph({
        children: [],
        spacing: { before: pxToTwips(GEOMETRY.headerRuleGap), after: 0, ...NO_TEXT_LINE },
        border: { bottom: { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.headerRule), color: PALETTE.gold, space: 0 } },
      }),
    )
  }

  // ----------------------------------------------------------
  // SECTIONS, in the template's fixed order
  // ----------------------------------------------------------

  /** A row of achievement cards: two cells under a gold top border and the gap between them; an odd last card stays left. */
  const cardRow = (cards: [ReturnType<typeof swissEngineeringProject>, ReturnType<typeof swissEngineeringProject>]) => {
    const gap = pxToTwips(GEOMETRY.cardGap)
    const cardWidth = Math.round((contentWidth - gap) / 2)
    const widths = [cardWidth, gap, contentWidth - cardWidth - gap]
    const rule: IBorderOptions = { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.cardRule), color: PALETTE.gold }
    const cardCell = (project: ReturnType<typeof swissEngineeringProject>, width: number) => {
      if (!project) return new TableCell({ width: { size: width, type: WidthType.DXA }, borders: NO_CELL_BORDERS, children: [emptyParagraph()] })
      const content: Paragraph[] = []
      if (project.name) content.push(new Paragraph({ children: [run(project.name, PALETTE.ink, { bold: true })], spacing: { after: 0, ...bodyLine } }))
      if (project.description) content.push(...richParagraphs(project.description, PALETTE.body, { size: size.body, line: line.body }))
      if (project.technologies) content.push(textLine(project.technologies, PALETTE.muted))
      if (project.url) {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                children: swissExecutiveLinkChildren(project.url, SWISS_EXECUTIVE_CARD_TEXT_WIDTH, size.body),
                color: PALETTE.muted,
                font,
                size: size.body,
              }),
            ],
            spacing: { after: 0, ...bodyLine },
          }),
        )
      }
      return new TableCell({
        width: { size: width, type: WidthType.DXA },
        margins: { ...NO_MARGINS, top: pxToTwips(GEOMETRY.cardRuleGap) },
        borders: { top: rule, right: NONE, bottom: NONE, left: NONE },
        verticalAlign: VerticalAlign.TOP,
        children: content.length > 0 ? content : [emptyParagraph()],
      })
    }
    return new Table({
      width: { size: contentWidth, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cardCell(cards[0], widths[0]),
            new TableCell({ width: { size: widths[1], type: WidthType.DXA }, borders: NO_CELL_BORDERS, children: [emptyParagraph()] }),
            cardCell(cards[1], widths[2]),
          ],
        }),
      ],
    })
  }

  /** An entry's details: its achievements as bullets, or else its description. */
  const details = (achievements: readonly string[], description: string | null): Paragraph[] => {
    if (achievements.length > 0) {
      const indent = pxToTwips(GEOMETRY.bulletIndent)
      return achievements.map(
        (achievement, i) =>
          new Paragraph({
            children: [run('•\t', PALETTE.body), ...parseHtmlToDocxRuns(achievement, { size: size.body, color: PALETTE.body, font })],
            indent: { left: indent, hanging: indent },
            tabStops: [{ type: TabStopType.LEFT, position: indent }],
            spacing: {
              before: i === 0 ? pxToTwips(GEOMETRY.detailGap) : 0,
              after: 0,
              ...exactLineSpacing([formattedTextLineHeight(achievement, LINE_HEIGHT.text), line.body]),
            },
          }),
      )
    }
    return description ? richParagraphs(description, PALETTE.body, { size: size.body, line: line.body, spacingBefore: pxToTwips(GEOMETRY.detailGap) }) : []
  }

  const sectionBlocks = (sectionId: SwissExecutiveSectionId): (Paragraph | Table)[] => {
    switch (sectionId) {
      case 'summary': {
        if (!swissHasText(row.summary)) return []
        // The cream box behind the gold bar, with no heading (it is the summary, FR-6).
        const padY = pxToTwips(GEOMETRY.summaryPaddingY)
        return [
          new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [contentWidth],
            layout: TableLayoutType.FIXED,
            borders: NO_BORDERS,
            rows: [
              new TableRow({
                cantSplit: true,
                children: [
                  new TableCell({
                    width: { size: contentWidth, type: WidthType.DXA },
                    margins: {
                      top: padY,
                      bottom: padY,
                      left: pxToTwips(GEOMETRY.summaryBar + GEOMETRY.summaryPaddingX),
                      right: pxToTwips(GEOMETRY.summaryPaddingX),
                    },
                    borders: {
                      top: NONE,
                      right: NONE,
                      bottom: NONE,
                      left: { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.summaryBar), color: PALETTE.gold },
                    },
                    shading: { type: ShadingType.CLEAR, fill: PALETTE.cream, color: 'auto' },
                    verticalAlign: VerticalAlign.TOP,
                    children: richParagraphs(row.summary, PALETTE.body, { size: size.summary, line: line.summary }),
                  }),
                ],
              }),
            ],
          }),
        ]
      }

      case 'keyAchievements': {
        if (projects.length === 0) return []
        const blocks: (Paragraph | Table)[] = [heading(swissHeading(dict, 'keyAchievements'))]
        swissItCardRows(projects).forEach((cards, index) => {
          // The gap between two rows; it also keeps Word from merging the two tables.
          if (index > 0) blocks.push(spacer(pxToTwips(GEOMETRY.cardRowGap)))
          blocks.push(cardRow(cards))
        })
        return blocks
      }

      case 'experience': {
        if (experiences.length === 0) return []
        const dateColumn = swissExecutiveDateColumnTwips(
          experiences.map((exp) => exp.dates),
          size.date,
        )
        const blocks: (Paragraph | Table)[] = [heading(swissHeading(dict, 'experience'))]
        experiences.forEach((exp, index) => {
          // The space between two entries: a spacer, since a built paragraph's spacing cannot be changed.
          if (index > 0) blocks.push(spacer(pxToTwips(GEOMETRY.entryGap)))
          if (exp.lead || exp.dates) blocks.push(firstLine(exp.lead, exp.dates, dateColumn))
          if (exp.detail) blocks.push(textLine(exp.detail, PALETTE.muted))
          blocks.push(...details(exp.achievements, exp.description))
        })
        return blocks
      }

      case 'education': {
        if (education.length === 0) return []
        const dateColumn = swissExecutiveDateColumnTwips(
          education.map((edu) => edu.dates),
          size.date,
        )
        const blocks: (Paragraph | Table)[] = [heading(swissHeading(dict, 'education'))]
        education.forEach((edu, index) => {
          if (index > 0) blocks.push(spacer(pxToTwips(GEOMETRY.entryGap)))
          if (edu.lead || edu.dates) blocks.push(firstLine(edu.lead, edu.dates, dateColumn))
          if (edu.detail) blocks.push(textLine(edu.detail, PALETTE.muted))
          if (edu.description) {
            blocks.push(...richParagraphs(edu.description, PALETTE.body, { size: size.body, line: line.body, spacingBefore: pxToTwips(GEOMETRY.detailGap) }))
          }
        })
        return blocks
      }

      case 'languagesAndCertifications': {
        if (languages.length === 0 && certificates.length === 0) return []
        const label = swissExecutiveLastHeading(
          swissHeading(dict, 'languages'),
          swissHeading(dict, 'training'),
          languages.length > 0,
          certificates.length > 0,
        )
        const blocks: (Paragraph | Table)[] = [heading(label)]
        if (languages.length > 0) blocks.push(textLine(swissItLanguagesLine(languages), PALETTE.body))
        if (certificates.length > 0) {
          blocks.push(textLine(swissItCertificationsLine(certificates), PALETTE.body, languages.length > 0 ? pxToTwips(GEOMETRY.lastRowGap) : 0))
        }
        return blocks
      }
    }
  }

  let drawnSections = 0
  for (const sectionId of visibility.sections) {
    const blocks = sectionBlocks(sectionId)
    if (blocks.length === 0) continue
    // The space above a section: under the header's rule for the first, the
    // section gap for the others; none for a first section with no header.
    const gap = drawnSections === 0 ? (hasHeader ? GEOMETRY.ruleGap : 0) : GEOMETRY.sectionGap
    if (gap > 0) children.push(spacer(pxToTwips(gap)))
    children.push(...blocks)
    drawnSections += 1
  }

  // ----------------------------------------------------------
  // ASSEMBLE
  // ----------------------------------------------------------
  const doc = new Document({
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
            // The printed Preview's page margins (`@page swiss-executive`), so
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

  const buffer = (await Packer.toBuffer(doc)) as Buffer
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('The generated swissExecutive document has no word/document.xml')
  let xml = await file.async('string')
  // The summary is set in italics, as on the Preview: every run of its box.
  xml = italicSummary(xml, PALETTE.cream)
  // `docx` writes the photo as a rectangle with no outline or fill and has no
  // API for either, so its geometry is set to an ellipse — Word's own "crop to
  // shape" — with the Preview's gold ring and fill, and the object-fit: cover
  // crop is written from `calculateCoverCropPercents` (`docx-photo.ts`).
  if (photo) xml = roundPhoto(xml, photo.crop, PALETTE.gold, PALETTE.photoFill)
  zip.file('word/document.xml', xml)
  return (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
}

/**
 * Every run of the table shaded `creamHex` — the summary's box — set in
 * italics, as the Preview sets the box. The shared rich-text helper writes an
 * explicit "not italic" on each run it does not italicise, which would win
 * over any paragraph or table style, so the run properties themselves are set:
 * `w:i` and `w:iCs` in their schema place, after `w:b`/`w:bCs`, replacing any
 * the run had. A document without the box is returned unchanged.
 */
export function italicSummary(xml: string, creamHex: string): string {
  const tables = [...xml.matchAll(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g)]
  const box = tables.find(([table]) => table.includes(`w:fill="${creamHex}"`))
  if (!box) return xml
  const italic = box[0]
    .replace(/<w:r>(?!<w:rPr>)/g, '<w:r><w:rPr></w:rPr>')
    .replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (_, inner: string) => {
      const cleaned = inner.replace(/<w:iCs\b[^>]*\/>|<w:i\b[^>]*\/>/g, '')
      const anchor = /<w:bCs\b[^>]*\/>|<w:b\b[^>]*\/>|<w:rFonts\b[^>]*\/>|<w:rStyle\b[^>]*\/>/g
      let at = 0
      for (const match of cleaned.matchAll(anchor)) at = (match.index ?? 0) + match[0].length
      return `<w:rPr>${cleaned.slice(0, at)}<w:i/><w:iCs/>${cleaned.slice(at)}</w:rPr>`
    })
  return xml.slice(0, box.index) + italic + xml.slice((box.index ?? 0) + box[0].length)
}

/**
 * The photo's drawing — the document's one drawing — made round: its preset
 * geometry an ellipse, filled in `fillHex` where the photo is transparent,
 * outlined in `ringHex` at the Preview's ring width, and cropped to cover its
 * square.
 *
 * @throws when the drawing is not in the shape `docx` writes it, rather than
 * shipping a square photo that the Preview draws round.
 */
export function roundPhoto(
  xml: string,
  crop: { l: number; t: number; r: number; b: number } | null,
  ringHex: string,
  fillHex: string,
): string {
  const inline = /<wp:inline\b[\s\S]*?<\/wp:inline>/.exec(xml)
  if (!inline) throw new Error('swissExecutive photo: no inline drawing')
  let drawing = inline[0]

  const geometry = /<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="rect"\/>/
  if (!geometry.test(drawing)) throw new Error('swissExecutive photo: no rectangular picture geometry to round')
  const ringEmu = GEOMETRY.photoRing * EMU_PER_PX
  drawing = drawing.replace(
    geometry,
    `<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>` +
      `<a:ln w="${ringEmu}"><a:solidFill><a:srgbClr val="${ringHex}"/></a:solidFill></a:ln>`,
  )
  // The ring is stroked on the ellipse's edge, so part of it falls outside the
  // picture's extent; the effect extent reserves that room, or Word clips the
  // ring flat at the top and bottom of the drawing (measured for swissCommerce).
  const effectExtent = /<wp:effectExtent t="0" r="0" b="0" l="0"\/>/
  if (!effectExtent.test(drawing)) throw new Error('swissExecutive photo: no effect extent to widen for the ring')
  drawing = drawing.replace(effectExtent, `<wp:effectExtent t="${ringEmu}" r="${ringEmu}" b="${ringEmu}" l="${ringEmu}"/>`)
  if (crop) {
    const srcRect = /<a:srcRect\/>|<a:srcRect><\/a:srcRect>/
    if (!srcRect.test(drawing)) throw new Error('swissExecutive photo: no source rectangle to crop')
    drawing = drawing.replace(srcRect, `<a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/>`)
  }
  return xml.slice(0, inline.index) + drawing + xml.slice(inline.index + inline[0].length)
}

/**
 * The photo as an inline drawing that fills the Preview's round box with
 * `object-fit: cover`, upright per its EXIF orientation, or null when the data
 * is not an image this route can embed — in which case no frame is drawn
 * either, as on the Preview without a photo.
 */
function photoRun(photoBase64: string): { image: ImageRun; crop: { l: number; t: number; r: number; b: number } | null } | null {
  const imageType = detectImageType(photoBase64)
  if (!imageType) return null
  const data = Buffer.from(extractBase64Data(photoBase64), 'base64')
  if (data.length === 0) return null

  const box = GEOMETRY.photo
  const orientation = imageType === 'jpg' ? readJpegOrientation(data) : EXIF_ORIENTATION_NONE
  const transform = EXIF_PHOTO_TRANSFORMS[orientation] ?? null
  const swapsAxes = transform?.swapsAxes === true

  let crop: { l: number; t: number; r: number; b: number } | null = null
  const dimensions = parseImageDimensions(data, imageType)
  if (dimensions) {
    const displayed = swapsAxes ? { width: dimensions.height, height: dimensions.width } : dimensions
    const displayedCrop = calculateCoverCropPercents(displayed.width, displayed.height, box, box)
    // srcRect is in the stored image's axes, which a 90° turn swaps; the cover
    // crop is centred, so the mapping is the one `EXIF_PHOTO_TRANSFORMS` (`docx-photo.ts`) documents.
    const stored = swapsAxes
      ? { l: displayedCrop.t, r: displayedCrop.b, t: displayedCrop.l, b: displayedCrop.r }
      : displayedCrop
    crop = stored.l === 0 && stored.t === 0 && stored.r === 0 && stored.b === 0 ? null : stored
  }

  // The box is square, so a picture turned 90° occupies the same box and needs no offset.
  const image = new ImageRun({
    type: imageType,
    data,
    transformation: { width: box, height: box, ...transform?.picture },
  })
  return { image, crop }
}
