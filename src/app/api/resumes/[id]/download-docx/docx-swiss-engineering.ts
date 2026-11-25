import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
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
  ResumeSkillCategory,
} from '@/types/database'
import { PAGE_HEIGHT_TWIPS, PAGE_WIDTH_INCHES, PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_ENGINEERING_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import { formatSwissMonth, swissContactEntries, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import { swissTradesContactHeading, swissTradesLanguageLine } from '@/lib/swiss-trades-template'
import {
  SWISS_ENGINEERING_GEOMETRY as GEOMETRY,
  SWISS_ENGINEERING_SIZES as SIZES,
  swissEngineeringCertificateLine,
  swissEngineeringDates,
  swissEngineeringEducationLines,
  swissEngineeringProject,
  swissEngineeringSections,
  swissEngineeringSkillContent,
  type SwissEngineeringMainSectionId,
  type SwissEngineeringSideSectionId,
} from '@/lib/swiss-engineering-template'
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
import { solidColourPng } from './docx-disc'
import {
  EXIF_ORIENTATION_NONE,
  EXIF_PHOTO_TRANSFORMS,
  calculateCoverCropPercents,
  detectImageType,
  extractBase64Data,
  parseImageDimensions,
  readJpegOrientation,
} from './docx-modern'

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

/** Every run, rule and fill, in the colour the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissEngineering

/** The letter spacing the Preview's `tracking-widest` draws, in em. */
const TRACKING = PREVIEW_TRACKING.swissEngineering

const LINE_HEIGHT = SWISS_ENGINEERING_LINE_HEIGHT

/** Word's single line spacing, in 240ths of a line. */
const AUTO_SINGLE_LINE = 240

/** DrawingML lengths are in EMU: 9525 to the CSS px. */
const EMU_PER_PX = 9525

/** Twips to the CSS px: a drawing's extent is given in px. */
const TWIPS_PER_PX = 15

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

/** The space above the next block of a column, which depends on what was drawn before it. */
interface Flow {
  before: number
}

/**
 * Generate the Word export of the "Ingénierie & technique" template.
 *
 * The Preview (`swiss-engineering-template.tsx`) is the contract: the same
 * sections in the same fixed order in the same column, the same visibility,
 * headings, dates, level names, project cards and skill lines, read from
 * `@/lib/swiss-engineering-template` and the shared Swiss helpers.
 *
 * Layout in Word: the page has no margin at the top or sides, as the printed
 * Preview has none; the body is one two-column table — the main column, then
 * the light column, its cell shaded the column's colour with the blue bar as
 * its left border. The column and its bar are also page-high rasters behind
 * the text, repeated on every page through a 1-twip header row, as
 * `docx-swiss-trades.ts` draws its dark column. The photo is a round inline
 * drawing centred at the top of the light column; each project is a shaded
 * one-cell table with a thick blue left border; dates sit at a right tab stop.
 */
export async function generateSwissEngineeringDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does (FR-4).
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields, photoBase64 } = settings
  const sections = swissEngineeringSections(hiddenMainSections, hiddenSidebarSections)
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
    const position = exp.position?.trim() ?? ''
    const meta = [exp.company?.trim(), exp.location?.trim()].filter(Boolean).join(', ')
    const dates = swissEngineeringDates(exp.startDate, exp.endDate, exp.current, dict)
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return position || meta || dates || achievements.length > 0 || description ? [{ position, meta, dates, achievements, description }] : []
  })
  const education = (row.education || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const lines = swissEngineeringEducationLines({
      degree: edu.degree,
      school: edu.school,
      field: edu.field,
      dates: swissEngineeringDates(edu.startDate, edu.endDate, false, dict),
    })
    const description = swissHasText(edu.description) ? edu.description : null
    return lines.lead || lines.detail || description ? [{ ...lines, description }] : []
  })
  const skills = (row.skills || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissEngineeringSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const languages = (row.languages || []).filter((lang) => lang.visible !== false && Boolean(lang.language?.trim()))
  const certifications = (row.certifications || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const line = swissEngineeringCertificateLine(cert.name, cert.issuer, cert.date ? formatSwissMonth(cert.date) : '')
    return line ? [line] : []
  })

  // Run sizes in whole half-points; line pitches from the unrounded px.
  const size = {
    name: pxToHalfPoints(SIZES.name),
    title: pxToHalfPoints(SIZES.title),
    heading: pxToHalfPoints(SIZES.heading),
    body: pxToHalfPoints(SIZES.body),
    date: pxToHalfPoints(SIZES.date),
    column: pxToHalfPoints(SIZES.column),
  }
  const line = {
    name: SIZES.name * 1.5,
    title: SIZES.title * 1.5,
    heading: SIZES.heading * 1.5,
    body: SIZES.body * 1.5,
    column: SIZES.column * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])
  const columnLine = exactLineSpacing([LINE_HEIGHT.text, line.column])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const pageHeightTwips = PAGE_HEIGHT_TWIPS
  const columnWidth = pxToTwips(GEOMETRY.columnWidth)
  const mainWidth = pageWidthTwips - columnWidth
  const mainPaddingLeft = pxToTwips(GEOMETRY.mainPaddingLeft)
  const mainPaddingRight = pxToTwips(GEOMETRY.mainPaddingRight)
  const mainContentWidth = mainWidth - mainPaddingLeft - mainPaddingRight

  const run = (text: string, color: string, options: { bold?: boolean; size?: number } = {}) =>
    new TextRun({ text, color, font, size: options.size ?? size.body, bold: options.bold })

  /**
   * Rich text (summary, descriptions, `skillsHtml`) as the Preview's
   * `renderFormattedText` draws it. HTML: one paragraph per block the browser
   * draws (`formattedBlocks`), in order — every `<p>` and every list item, so
   * a paragraph beside a list is kept, which the shared list helper drops —
   * each with its inline formatting, a list item's marker hanging at the
   * list's indent. Plain text: `formatText`'s rules — its lists as items, its
   * other blocks as paragraphs whose lines keep their breaks.
   */
  const richParagraphs = (
    text: string,
    color: string,
    options: { size: number; line: number; elementLineHeight: number; spacingBefore?: number },
  ): Paragraph[] => {
    const runOptions = { size: options.size, color, font }
    const lineSpacing = exactLineSpacing([formattedTextLineHeight(text, options.elementLineHeight), options.line])
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
              // A list item's marker hangs outside its text, which starts — and wraps — at the list's indent.
              indent:
                block.depth === 0
                  ? undefined
                  : { left: pxToTwips(FORMATTED_LIST_INDENT_PX * block.depth), hanging: block.marker === null ? 0 : markerHang },
              spacing: { after: 0, ...lineSpacing },
            }),
        )
    if (options.spacingBefore && paragraphs.length > 0) {
      // The Preview's top margin: a spacer, since a built paragraph's spacing cannot be changed.
      paragraphs.unshift(new Paragraph({ children: [], spacing: { before: 0, after: options.spacingBefore, ...NO_TEXT_LINE } }))
    }
    return paragraphs
  }

  /** A section heading, in either column: blue spaced capitals, kept with what follows. */
  const heading = (label: string, before: number) =>
    new Paragraph({
      children: [
        new TextRun({
          text: label,
          font,
          size: size.heading,
          bold: true,
          allCaps: true,
          color: PALETTE.accent,
          characterSpacing: trackingSpacing(TRACKING.caps, size.heading),
        }),
      ],
      spacing: {
        before,
        after: pxToTwips(GEOMETRY.headingGap),
        ...exactLineSpacing([LINE_HEIGHT.compact, line.heading]),
      },
      keepNext: true,
    })

  // ----------------------------------------------------------
  // THE MAIN COLUMN
  // ----------------------------------------------------------
  const main: (Paragraph | Table)[] = []
  const mainFlow: Flow = { before: 0 }

  if (contact.name) {
    main.push(
      new Paragraph({
        children: [run(contact.name, PALETTE.ink, { bold: true, size: size.name })],
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.name, line.name]) },
      }),
    )
  }
  if (title) {
    main.push(
      new Paragraph({
        children: [run(title, PALETTE.accent, { size: size.title })],
        spacing: {
          before: contact.name ? pxToTwips(GEOMETRY.nameGap) : 0,
          after: 0,
          ...exactLineSpacing([LINE_HEIGHT.compact, line.title]),
        },
      }),
    )
  }
  if (main.length > 0) mainFlow.before = pxToTwips(GEOMETRY.titleGap)

  /** A project's card: a shaded one-cell table, thin-bordered, its left edge the thick blue bar. */
  const card = (project: NonNullable<ReturnType<typeof swissEngineeringProject>>) => {
    const content: Paragraph[] = []
    if (project.name) content.push(new Paragraph({ children: [run(project.name, PALETTE.ink, { bold: true })], spacing: { after: 0, ...bodyLine } }))
    if (project.description) {
      content.push(...richParagraphs(project.description, PALETTE.body, { size: size.body, line: line.body, elementLineHeight: LINE_HEIGHT.text }))
    }
    for (const text of [project.technologies, project.url]) {
      if (text) content.push(new Paragraph({ children: [run(text, PALETTE.muted)], spacing: { after: 0, ...bodyLine } }))
    }
    const thin: IBorderOptions = { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.cardBorder), color: PALETTE.cardBorder }
    // The cell margins are the card's padding plus the border it sits inside,
    // so the text starts where the Preview's does.
    const inset = pxToTwips(GEOMETRY.cardBorder + GEOMETRY.cardPaddingY)
    return new Table({
      width: { size: mainContentWidth, type: WidthType.DXA },
      columnWidths: [mainContentWidth],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: mainContentWidth, type: WidthType.DXA },
              margins: {
                top: inset,
                bottom: inset,
                left: pxToTwips(GEOMETRY.cardBar + GEOMETRY.cardPaddingX),
                right: pxToTwips(GEOMETRY.cardBorder + GEOMETRY.cardPaddingX),
              },
              borders: {
                top: thin,
                right: thin,
                bottom: thin,
                left: { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.cardBar), color: PALETTE.bar },
              },
              shading: { type: ShadingType.CLEAR, fill: PALETTE.card, color: 'auto' },
              verticalAlign: VerticalAlign.TOP,
              children: content,
            }),
          ],
        }),
      ],
    })
  }

  const mainSection = (sectionId: SwissEngineeringMainSectionId): boolean => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return false
        main.push(heading(swissHeading(dict, 'summary'), mainFlow.before))
        main.push(...richParagraphs(row.summary, PALETTE.body, { size: size.body, line: line.body, elementLineHeight: LINE_HEIGHT.text }))
        return true

      case 'keyAchievements':
        if (projects.length === 0) return false
        main.push(heading(swissHeading(dict, 'keyAchievements'), mainFlow.before))
        projects.forEach((project, index) => {
          // The gap between two cards; it also keeps Word from merging the two tables.
          if (index > 0) main.push(spacer(pxToTwips(GEOMETRY.cardGap)))
          main.push(card(project))
        })
        return true

      case 'experience':
        if (experiences.length === 0) return false
        main.push(heading(swissHeading(dict, 'experience'), mainFlow.before))
        experiences.forEach((exp, index) => {
          const paragraphs: Paragraph[] = []
          const first = exp.position || exp.meta
          if (first || exp.dates) {
            const runs: TextRun[] = []
            if (first) runs.push(run(first, PALETTE.ink, { bold: true }))
            if (exp.dates) {
              runs.push(new TextRun({ children: [new Tab()], font, size: size.date }), run(exp.dates, PALETTE.muted, { size: size.date }))
            }
            paragraphs.push(
              new Paragraph({ children: runs, tabStops: [{ type: TabStopType.RIGHT, position: mainContentWidth }], spacing: { after: 0, ...bodyLine } }),
            )
          }
          if (exp.position && exp.meta) paragraphs.push(new Paragraph({ children: [run(exp.meta, PALETTE.muted)], spacing: { after: 0, ...bodyLine } }))
          if (exp.achievements.length > 0) {
            const indent = pxToTwips(GEOMETRY.bulletIndent)
            exp.achievements.forEach((achievement, i) => {
              paragraphs.push(
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
            })
          } else if (exp.description) {
            paragraphs.push(
              ...richParagraphs(exp.description, PALETTE.body, {
                size: size.body,
                line: line.body,
                elementLineHeight: LINE_HEIGHT.text,
                spacingBefore: pxToTwips(GEOMETRY.detailGap),
              }),
            )
          }
          // The space between two entries: a spacer, since a built paragraph's spacing cannot be changed.
          if (index > 0) main.push(spacer(pxToTwips(GEOMETRY.entryGap)))
          main.push(...paragraphs)
        })
        return true
    }
  }
  for (const sectionId of sections.main) {
    if (mainSection(sectionId)) mainFlow.before = pxToTwips(GEOMETRY.sectionGap)
  }
  // A cell ends with a paragraph, also after a card's table.
  if (main.length === 0 || main[main.length - 1] instanceof Table) main.push(emptyParagraph())

  // ----------------------------------------------------------
  // THE LIGHT COLUMN
  // ----------------------------------------------------------
  const side: Paragraph[] = []
  const sideFlow: Flow = { before: 0 }
  const photo = photoVisible && photoBase64 ? photoRun(photoBase64) : null
  const contactEntries = swissContactEntries(contact, dict)

  /** Lines of the light column, the space between two lines its row gap. */
  const columnLines = (lines: string[]) => {
    lines.forEach((text, index) => {
      side.push(
        new Paragraph({
          children: [run(text, PALETTE.body, { size: size.column })],
          spacing: { before: index === 0 ? 0 : pxToTwips(GEOMETRY.columnRowGap), after: 0, ...columnLine },
        }),
      )
    })
  }

  /** A bold line of the light column: an education's lead, a skill category's caption. */
  const columnLead = (text: string, before: number, after = 0) =>
    new Paragraph({ children: [run(text, PALETTE.ink, { bold: true, size: size.column })], spacing: { before, after, ...columnLine }, keepNext: true })

  if (photo) {
    // Single (auto) spacing: under the document's default exact line, Word
    // clips an inline drawing to one text line's height.
    side.push(
      new Paragraph({
        children: [photo.image],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: AUTO_SINGLE_LINE, lineRule: LineRuleType.AUTO },
      }),
    )
    sideFlow.before = pxToTwips(GEOMETRY.photoGap)
  }
  const markDrawn = () => {
    sideFlow.before = pxToTwips(GEOMETRY.columnSectionGap)
  }

  if (contactEntries.length > 0) {
    side.push(heading(swissTradesContactHeading(dict), sideFlow.before))
    // The mockup draws the values without labels.
    columnLines(contactEntries.map((entry) => entry.value))
    markDrawn()
  }

  const sideSection = (sectionId: SwissEngineeringSideSectionId) => {
    switch (sectionId) {
      case 'education': {
        if (education.length === 0) return
        side.push(heading(swissHeading(dict, 'education'), sideFlow.before))
        education.forEach((edu, index) => {
          const before = index === 0 ? 0 : pxToTwips(GEOMETRY.columnEntryGap)
          const paragraphs: Paragraph[] = []
          if (edu.lead) paragraphs.push(columnLead(edu.lead, 0))
          if (edu.detail) {
            paragraphs.push(new Paragraph({ children: [run(edu.detail, PALETTE.body, { size: size.column })], spacing: { after: 0, ...columnLine } }))
          }
          if (edu.description) {
            paragraphs.push(...richParagraphs(edu.description, PALETTE.body, { size: size.column, line: line.column, elementLineHeight: LINE_HEIGHT.text }))
          }
          if (before > 0) side.push(spacer(before))
          side.push(...paragraphs)
        })
        markDrawn()
        return
      }

      case 'skills': {
        if (skills.length === 0) return
        side.push(heading(swissHeading(dict, 'skills'), sideFlow.before))
        skills.forEach((skill, index) => {
          const before = index === 0 ? 0 : pxToTwips(GEOMETRY.columnEntryGap)
          // The mockup draws no category; the stored category is content, so it
          // is drawn as a caption on its own line above its skills (FR-1, FR-15).
          if (skill.category) side.push(columnLead(skill.category, before, pxToTwips(GEOMETRY.skillCaptionGap)))
          const contentBefore = skill.category ? 0 : before
          if (skill.content.kind === 'lines') {
            if (contentBefore > 0) side.push(spacer(contentBefore))
            columnLines(skill.content.lines)
          } else {
            side.push(
              ...richParagraphs(skill.content.html, PALETTE.body, {
                size: size.column,
                line: line.column,
                elementLineHeight: LINE_HEIGHT.text,
                spacingBefore: contentBefore,
              }),
            )
          }
        })
        markDrawn()
        return
      }

      case 'languages': {
        if (languages.length === 0) return
        side.push(heading(swissHeading(dict, 'languages'), sideFlow.before))
        columnLines(languages.map((lang) => swissTradesLanguageLine(lang.language, swissLanguageLevel(dict, lang.level))))
        markDrawn()
        return
      }

      case 'training': {
        if (certifications.length === 0) return
        side.push(heading(swissHeading(dict, 'training'), sideFlow.before))
        columnLines(certifications)
        markDrawn()
        return
      }
    }
  }
  for (const sectionId of sections.side) sideSection(sectionId)
  if (side.length === 0) side.push(emptyParagraph())

  // ----------------------------------------------------------
  // ASSEMBLE
  // ----------------------------------------------------------

  /**
   * A page-high solid fill anchored to the page behind the text, `fromPx` from
   * the page's left edge and `widthPx` wide, at stacking order `zIndex` (a
   * higher one is drawn in front; both stay behind the text). A cell's fill
   * ends where the row's part on a page ends, so the light column and its bar
   * are drawn this way only, held by a 1-twip header row that Word repeats on
   * every page the table spans — `docx-swiss-trades.ts`'s dark column.
   */
  const pageFill = (colourHex: string, fromPx: number, widthPx: number, id: string, zIndex: number) =>
    new ImageRun({
      type: 'png',
      data: solidColourPng(colourHex),
      transformation: { width: widthPx, height: pageHeightTwips / TWIPS_PER_PX },
      // A distinct id keeps every drawing's wp:docPr id unique; the photo's is 1.
      altText: { name: '', description: '', title: '', id },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: fromPx * EMU_PER_PX },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        wrap: { type: TextWrappingType.NONE },
        behindDocument: true,
        allowOverlap: true,
        // Positioned on the page, not clipped to this 1-twip cell.
        layoutInCell: false,
        // `relativeHeight`: without it docx writes each drawing's height there,
        // the same for both, and Word drew the fill over the bar.
        zIndex,
      },
    })

  /** The column's left edge on the page, where the Preview's bar starts: 544px. */
  const columnLeftPx = PAGE_WIDTH_PX - GEOMETRY.columnWidth

  // Both fills are anchored in the row's FIRST cell, whose origin is the
  // page's own (0, 0), as `docx-swiss-trades.ts` anchors its dark column.
  // Anchored in the column's cell, as first written, Word did not draw the
  // fills where their page offsets put them (Word → PDF, 2026-11-23): the
  // column and its bar ended with the row's content, short of the page's foot,
  // which is where the cell's own shading and left border end. The likely
  // reading is that Word 2013+ layout (compatibility mode 15, this document's)
  // places a drawing anchored in a table cell from that cell whatever
  // `layoutInCell` says. From a cell at the page's origin the page offsets and
  // the cell offsets are the same numbers, so the fills land in the same place
  // in either reading — the arrangement Word draws correctly for swissTrades.
  const fillRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    height: { value: 1, rule: HeightRule.EXACT },
    children: [
      new TableCell({
        width: { size: mainWidth, type: WidthType.DXA },
        margins: NO_MARGINS,
        borders: NO_CELL_BORDERS,
        children: [
          new Paragraph({
            children: [
              // The bar in front of the fill, side by side as the Preview draws them.
              pageFill(PALETTE.bar, columnLeftPx, GEOMETRY.columnBar, '2', 2),
              pageFill(PALETTE.column, columnLeftPx + GEOMETRY.columnBar, GEOMETRY.columnWidth - GEOMETRY.columnBar, '3', 1),
            ],
            spacing: NO_TEXT_LINE,
          }),
        ],
      }),
      new TableCell({
        width: { size: columnWidth, type: WidthType.DXA },
        margins: NO_MARGINS,
        borders: NO_CELL_BORDERS,
        children: [emptyParagraph()],
      }),
    ],
  })

  const body = new Table({
    width: { size: pageWidthTwips, type: WidthType.DXA },
    columnWidths: [mainWidth, columnWidth],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    margins: NO_MARGINS,
    rows: [
      fillRow,
      new TableRow({
        cantSplit: false,
        children: [
          new TableCell({
            width: { size: mainWidth, type: WidthType.DXA },
            margins: {
              top: pxToTwips(GEOMETRY.mainPaddingTop),
              bottom: pxToTwips(GEOMETRY.mainPaddingBottom),
              left: mainPaddingLeft,
              right: mainPaddingRight,
            },
            borders: NO_CELL_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            children: main,
          }),
          new TableCell({
            width: { size: columnWidth, type: WidthType.DXA },
            // The text starts after the bar and the column's padding, and ends
            // the padding from the page's edge: SWISS_ENGINEERING_COLUMN_TEXT_WIDTH.
            margins: {
              top: pxToTwips(GEOMETRY.columnPaddingTop),
              bottom: pxToTwips(GEOMETRY.columnPaddingBottom),
              left: pxToTwips(GEOMETRY.columnBar + GEOMETRY.columnPaddingX),
              right: pxToTwips(GEOMETRY.columnPaddingX),
            },
            // No border and no shading: Word paints a cell's shading and borders
            // over the drawings behind the text, so they hid the page-high bar
            // and drew a second, shorter one (Word → PDF, 2026-11-23). The
            // column's colour and its bar are the page drawings alone.
            borders: NO_CELL_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            children: side,
          }),
        ],
      }),
    ],
  })

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
            size: { width: pageWidthTwips, height: pageHeightTwips, orientation: PageOrientation.PORTRAIT },
            // No margin: the light column meets the paper's edges, and the
            // printed Preview's pages start at the edge too (`@page` margin 0).
            margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
          },
        },
        // OOXML ends a body with a paragraph; after a table it carries no line.
        children: [body, emptyParagraph()],
      },
    ],
  })

  let buffer = (await Packer.toBuffer(doc)) as Buffer

  // `docx` writes the photo as a rectangle with no outline or fill and has no
  // API for either, so its geometry is set to an ellipse — Word's own "crop to
  // shape" — with the Preview's ring and fill, and the object-fit: cover crop
  // is written as `docx-modern.ts` does.
  if (photo) {
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file('word/document.xml')
    if (!file) throw new Error('The generated swissEngineering document has no word/document.xml')
    const xml = await file.async('string')
    zip.file('word/document.xml', roundPhoto(xml, photo.crop, PALETTE.photoRing, PALETTE.photoFill))
    buffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
  }

  return buffer
}

/**
 * The photo's drawing — the document's one inline drawing; the column fills
 * are anchored to the page — made round: its preset geometry an ellipse,
 * filled in `fillHex` where the photo is transparent, outlined in `ringHex` at
 * the Preview's ring width, and cropped to cover its square.
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
  if (!inline) throw new Error('swissEngineering photo: no inline drawing')
  let drawing = inline[0]

  const geometry = /<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="rect"\/>/
  if (!geometry.test(drawing)) throw new Error('swissEngineering photo: no rectangular picture geometry to round')
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
  if (!effectExtent.test(drawing)) throw new Error('swissEngineering photo: no effect extent to widen for the ring')
  drawing = drawing.replace(effectExtent, `<wp:effectExtent t="${ringEmu}" r="${ringEmu}" b="${ringEmu}" l="${ringEmu}"/>`)
  if (crop) {
    const srcRect = /<a:srcRect\/>|<a:srcRect><\/a:srcRect>/
    if (!srcRect.test(drawing)) throw new Error('swissEngineering photo: no source rectangle to crop')
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
    // crop is centred, so the mapping is the one `docx-modern.ts` documents.
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
