import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  HorizontalPositionRelativeFrom,
  LineRuleType,
  ImageRun,
  Packer,
  PageBorderDisplay,
  PageBorderOffsetFrom,
  PageOrientation,
  Paragraph,
  ShadingType,
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
  ResumeSkillCategory,
} from '@/types/database'
import { PAGE_HEIGHT_INCHES, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_VOCATIONAL_ACCENT } from '@/lib/resume-graphics'
import { SWISS_VOCATIONAL_LINE_HEIGHT, formattedTextLineHeight } from '@/lib/resume-line-height'
import {
  SWISS_VOCATIONAL_GEOMETRY as GEOMETRY,
  SWISS_VOCATIONAL_SIZES as SIZES,
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHeading,
  swissHasText,
  swissLanguageLevel,
  swissSkillContent,
  swissVocationalVisibility,
  type SwissVocationalSectionId,
} from '@/lib/swiss-vocational-template'
import {
  APP_BODY_FONT,
  NO_TEXT_LINE,
  exactLineSpacing,
  extractAlignment,
  isHtmlList,
  isPlainTextList,
  parseHtmlListToParagraphs,
  parseHtmlToDocxRuns,
  parsePlainTextListToParagraphs,
  pxToHalfPoints,
  pxToTwips,
  resolveDocxFont,
  trackingSpacing,
  type DocxGeneratorSettings,
} from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
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
}

/** Every run, rule and fill, in the colour of the class the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissVocational

/** The letter spacing the Preview's `tracking-widest` draws, in em. */
const TRACKING = PREVIEW_TRACKING.swissVocational

const LINE_HEIGHT = SWISS_VOCATIONAL_LINE_HEIGHT

const EMU_PER_PX = 9525

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

/**
 * Generate the Word export of the "Formation professionnelle (CFC)" template.
 *
 * The Preview (`swiss-vocational-template.tsx`) is the contract: the same
 * sections in the same fixed order, the same visibility, the same headings,
 * dates and level names, all read from `@/lib/swiss-vocational-template`.
 *
 * Layout in Word: the red strip is a left page border; the header is a
 * borderless table with the photo in its right cell when there is one; dated
 * rows are borderless two-column tables with the dates on the left; skills and
 * languages are the two cells of a borderless table.
 */
export async function generateSwissVocationalDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  const { fontFamily, fontScale, locale: localeRaw, hiddenMainSections, hiddenSidebarSections, photoBase64 } = settings
  const visibility = swissVocationalVisibility(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = resolveDocxFont(fontFamily, APP_BODY_FONT)

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads.
  const row = (resume ?? {}) as StoredResume
  const contact: ResumeContact = row.contact || {}
  const experiences: ResumeExperience[] = (row.experience || []).filter((exp: ResumeExperience) => exp.visible !== false)
  const education: ResumeEducation[] = (row.education || []).filter((edu: ResumeEducation) => edu.visible !== false)
  const certifications: ResumeCertification[] = (row.certifications || []).filter(
    (cert: ResumeCertification) => cert.visible !== false,
  )
  // A hidden column draws as an empty one: no heading, no entries, as on the Preview.
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = visibility.skills
    ? (row.skills || []).flatMap((skill: ResumeSkillCategory) => {
        const content = skill.visible === false ? null : swissSkillContent(skill)
        return content ? [{ category: skill.category, content }] : []
      })
    : []
  const languages: ResumeLanguage[] = visibility.languages
    ? (row.languages || []).filter((lang: ResumeLanguage) => lang.visible !== false)
    : []

  // Run sizes in whole half-points, and the same sizes unrounded for line
  // spacing, so a fractional size keeps the Preview's line pitch.
  const px = {
    name: SIZES.name * fontScale,
    title: SIZES.title * fontScale,
    contact: SIZES.contact * fontScale,
    heading: SIZES.heading * fontScale,
    body: SIZES.body * fontScale,
  }
  const size = {
    name: pxToHalfPoints(px.name),
    title: pxToHalfPoints(px.title),
    contact: pxToHalfPoints(px.contact),
    heading: pxToHalfPoints(px.heading),
    body: pxToHalfPoints(px.body),
  }
  const line = {
    name: px.name * 1.5,
    title: px.title * 1.5,
    contact: px.contact * 1.5,
    heading: px.heading * 1.5,
    body: px.body * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])
  /** The line height of text drawn through `renderFormattedText`, at the body size. */
  const richLine = (text: string | undefined) => exactLineSpacing([formattedTextLineHeight(text, LINE_HEIGHT.text), line.body])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const pageHeightTwips = convertInchesToTwip(PAGE_HEIGHT_INCHES)
  const marginX = pxToTwips(GEOMETRY.paddingX)
  const marginY = pxToTwips(GEOMETRY.paddingY)
  const contentWidth = pageWidthTwips - 2 * marginX

  const run = (text: string, color: string, options: { bold?: boolean; size?: number } = {}) =>
    new TextRun({ text, color, font, size: options.size ?? size.body, bold: options.bold })

  /**
   * Rich text (summary, descriptions, `skillsHtml`) as the Preview's
   * `renderFormattedText` draws it: an HTML list or a plain-text list as one
   * paragraph per item, anything else as one paragraph of formatted runs.
   */
  const richParagraphs = (
    text: string,
    color: string,
    options: { spacingBefore?: number; justify?: boolean } = {},
  ): Paragraph[] => {
    const runOptions = { size: size.body, color, font }
    const lineSpacing = richLine(text)
    const alignment = extractAlignment(text) ?? (options.justify ? AlignmentType.JUSTIFIED : undefined)
    const paragraphs = isHtmlList(text)
      ? parseHtmlListToParagraphs(text, runOptions, 0, 0, lineSpacing, undefined, alignment)
      : isPlainTextList(text)
        ? parsePlainTextListToParagraphs(text, runOptions, { spacingAfterItem: 0, spacingAfterLast: 0, alignment, lineSpacing })
        : [new Paragraph({ children: parseHtmlToDocxRuns(text, runOptions), alignment, spacing: { after: 0, ...lineSpacing } })]
    if (options.spacingBefore && paragraphs.length > 0) {
      // The Preview's `mt-1`: a spacer, since a built paragraph's spacing cannot be changed.
      paragraphs.unshift(new Paragraph({ children: [], spacing: { before: 0, after: options.spacingBefore, ...NO_TEXT_LINE } }))
    }
    return paragraphs
  }

  /** A section heading: the red square, then the label in spaced capitals over a light rule. */
  const heading = (label: string) =>
    new Paragraph({
      children: [
        // The square, as a shaded no-break space widened to its side (see
        // `PREVIEW_GRAPHICS.swissVocational.headingSquare`).
        new TextRun({
          text: ' ',
          font,
          size: pxToHalfPoints(SWISS_VOCATIONAL_ACCENT.squarePx),
          // Character spacing is in twentieths of a point (px × 0.75 × 20). The
          // no-break space is itself about a quarter of the run's size wide, so
          // the spacing adds the other three quarters of the square's side:
          // the second 0.75 is that remainder, not a unit conversion.
          characterSpacing: Math.round(SWISS_VOCATIONAL_ACCENT.squarePx * 0.75 * 0.75 * 20),
          shading: { type: ShadingType.CLEAR, fill: PALETTE['red-700'], color: 'auto' },
        }),
        new TextRun({
          text: ' ',
          font,
          size: size.heading,
          characterSpacing: Math.round(SWISS_VOCATIONAL_ACCENT.squareGapPx * 0.75 * 20),
        }),
        new TextRun({
          text: label,
          font,
          size: size.heading,
          bold: true,
          allCaps: true,
          color: PALETTE['slate-900'],
          characterSpacing: trackingSpacing(TRACKING.caps, size.heading),
        }),
      ],
      spacing: { before: pxToTwips(GEOMETRY.sectionGap), after: pxToTwips(GEOMETRY.headingGap), ...exactLineSpacing([LINE_HEIGHT.compact, line.heading]) },
      border: { bottom: { style: BorderStyle.SINGLE, size: pxToEighths(1), color: PALETTE['slate-300'], space: pxToPoints(6) } },
      keepNext: true,
    })

  /** One borderless table of dated rows: the dates in the left column, the content on the right. */
  const datedRows = (rows: { dates: string; content: Paragraph[] }[]) => {
    // Scaled with the type, as on the Preview, so a scaled date still fits (FR-4).
    const dateWidth = pxToTwips(GEOMETRY.dateColumn * fontScale)
    return new Table({
      width: { size: contentWidth, type: WidthType.DXA },
      columnWidths: [dateWidth, contentWidth - dateWidth],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: rows.map(
        ({ dates, content }, index) =>
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: dateWidth, type: WidthType.DXA },
                margins: { ...NO_MARGINS, top: index === 0 ? 0 : pxToTwips(GEOMETRY.entryGap) },
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.TOP,
                children: [new Paragraph({ children: dates ? [run(dates, PALETTE['slate-600'])] : [], spacing: { after: 0, ...bodyLine } })],
              }),
              new TableCell({
                width: { size: contentWidth - dateWidth, type: WidthType.DXA },
                margins: { ...NO_MARGINS, top: index === 0 ? 0 : pxToTwips(GEOMETRY.entryGap) },
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.TOP,
                children: content.length > 0 ? content : [emptyParagraph()],
              }),
            ],
          }),
      ),
    })
  }

  const children: (Paragraph | Table)[] = []

  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------
  const photo = photoBase64 ? photoRun(photoBase64) : null

  const contactEntries = swissContactEntries(contact, dict)
  const headerText: (Paragraph | Table)[] = []
  if (contact.name) {
    headerText.push(
      new Paragraph({
        children: [run(contact.name, PALETTE['slate-900'], { bold: true, size: size.name })],
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.name, line.name]) },
      }),
    )
  }
  if (row.title) {
    headerText.push(
      new Paragraph({
        children: [
          new TextRun({
            text: row.title,
            font,
            size: size.title,
            allCaps: true,
            color: PALETTE['red-700'],
            characterSpacing: trackingSpacing(TRACKING.caps, size.title),
          }),
        ],
        spacing: { before: headerText.length > 0 ? pxToTwips(8) : 0, after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, line.title]) },
      }),
    )
  }

  const textColumnWidth = photo
    ? contentWidth - pxToTwips(GEOMETRY.photoWidth) - pxToTwips(GEOMETRY.photoGap)
    : contentWidth

  if (contactEntries.length > 0) {
    if (headerText.length > 0) {
      headerText.push(new Paragraph({ children: [], spacing: { before: 0, after: pxToTwips(16), ...NO_TEXT_LINE } }))
    }
    headerText.push(contactGrid(contactEntries, textColumnWidth))
  }
  if (headerText.length === 0) headerText.push(emptyParagraph())
  // A cell that ends with a table needs a paragraph after it.
  if (headerText[headerText.length - 1] instanceof Table) headerText.push(emptyParagraph())

  if (photo) {
    const gap = pxToTwips(GEOMETRY.photoGap)
    const photoWidth = pxToTwips(GEOMETRY.photoWidth)
    children.push(
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [textColumnWidth, gap, photoWidth],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            cantSplit: true,
            height: { value: pxToTwips(GEOMETRY.photoHeight), rule: HeightRule.ATLEAST },
            children: [
              new TableCell({ width: { size: textColumnWidth, type: WidthType.DXA }, margins: NO_MARGINS, borders: NO_CELL_BORDERS, children: headerText }),
              new TableCell({ width: { size: gap, type: WidthType.DXA }, margins: NO_MARGINS, borders: NO_CELL_BORDERS, children: [emptyParagraph()] }),
              new TableCell({
                width: { size: photoWidth, type: WidthType.DXA },
                margins: NO_MARGINS,
                borders: NO_CELL_BORDERS,
                children: [new Paragraph({ children: [photo.image], spacing: { before: 0, after: 0, ...NO_TEXT_LINE } })],
              }),
            ],
          }),
        ],
      }),
    )
  } else {
    children.push(...headerText)
  }

  // The dark rule under the header, below the header's padding.
  children.push(
    new Paragraph({
      children: [],
      spacing: { before: 0, after: 0, line: pxToTwips(GEOMETRY.sectionGap), lineRule: LineRuleType.EXACT },
      border: { bottom: { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.headerRule), color: PALETTE['slate-800'], space: 0 } },
    }),
  )

  // ----------------------------------------------------------
  // SECTIONS, in the template's fixed order
  // ----------------------------------------------------------
  const sectionBlocks = (sectionId: SwissVocationalSectionId): (Paragraph | Table)[] => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return []
        return [heading(swissHeading(dict, 'summary')), ...richParagraphs(row.summary, PALETTE['slate-700'], { justify: true })]

      case 'experience':
        if (experiences.length === 0) return []
        return [
          heading(swissHeading(dict, 'experience')),
          datedRows(
            experiences.map((exp) => {
              const titleRuns = [run(exp.position || '', PALETTE['slate-900'], { bold: true })]
              if (exp.company) {
                titleRuns.push(run(` · ${exp.company}${exp.location ? `, ${exp.location}` : ''}`, PALETTE['slate-600']))
              }
              const content: Paragraph[] = [new Paragraph({ children: titleRuns, spacing: { after: 0, ...bodyLine } })]
              const achievements = (exp.achievements ?? []).filter(swissHasText)
              if (achievements.length > 0) {
                achievements.forEach((achievement, index) => {
                  content.push(
                    new Paragraph({
                      children: [run('•\t', PALETTE['slate-700']), ...parseHtmlToDocxRuns(achievement, { size: size.body, color: PALETTE['slate-700'], font })],
                      indent: { left: pxToTwips(20), hanging: pxToTwips(20) },
                      tabStops: [{ type: TabStopType.LEFT, position: pxToTwips(20) }],
                      spacing: { before: index === 0 ? pxToTwips(4) : 0, after: 0, ...richLine(achievement) },
                    }),
                  )
                })
              } else if (swissHasText(exp.description)) {
                content.push(...richParagraphs(exp.description, PALETTE['slate-700'], { spacingBefore: pxToTwips(4) }))
              }
              return { dates: formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict), content }
            }),
          ),
        ]

      case 'education':
        if (education.length === 0) return []
        return [
          heading(swissHeading(dict, 'education')),
          datedRows(
            education.map((edu) => {
              const content: Paragraph[] = []
              if (edu.degree) {
                content.push(new Paragraph({ children: [run(edu.degree, PALETTE['slate-900'], { bold: true })], spacing: { after: 0, ...bodyLine } }))
              }
              const schoolLine = [edu.school, edu.field].filter(Boolean).join(' · ')
              if (schoolLine) {
                content.push(new Paragraph({ children: [run(schoolLine, PALETTE['slate-600'])], spacing: { after: 0, ...bodyLine } }))
              }
              if (swissHasText(edu.description)) {
                content.push(...richParagraphs(edu.description, PALETTE['slate-700'], { spacingBefore: pxToTwips(4) }))
              }
              return { dates: formatSwissDateRange(edu.startDate, edu.endDate, false, dict), content }
            }),
          ),
        ]

      case 'training':
        if (certifications.length === 0) return []
        return [
          heading(swissHeading(dict, 'training')),
          datedRows(
            certifications.map((cert) => {
              const runs = [run(cert.name || '', PALETTE['slate-900'], { bold: true })]
              if (cert.issuer) runs.push(run(` · ${cert.issuer}`, PALETTE['slate-600']))
              return {
                dates: cert.date ? formatSwissMonth(cert.date) : '',
                content: [new Paragraph({ children: runs, spacing: { after: 0, ...bodyLine } })],
              }
            }),
          ),
        ]

      case 'skillsAndLanguages': {
        const columns: (Paragraph | Table)[][] = []
        const columnWidth = Math.round((contentWidth - pxToTwips(GEOMETRY.columnGap)) / 2)

        if (skills.length > 0) {
          const column: (Paragraph | Table)[] = [heading(swissHeading(dict, 'skills'))]
          skills.forEach((skill, index) => {
            // One structure whatever the storage, as on the Preview: the label
            // and its content on one line. A list cannot share a line in
            // Word, so a list's items follow the label line.
            const label = run(`${skill.category}: `, PALETTE['slate-900'], { bold: true })
            const spacingBefore = index === 0 ? 0 : pxToTwips(6)
            const { content } = skill
            if (content.kind === 'html' && (isHtmlList(content.html) || isPlainTextList(content.html))) {
              column.push(new Paragraph({ children: [label], spacing: { before: spacingBefore, after: 0, ...bodyLine } }))
              column.push(...richParagraphs(content.html, PALETTE['slate-700']))
            } else {
              const runs =
                content.kind === 'html'
                  ? parseHtmlToDocxRuns(content.html, { size: size.body, color: PALETTE['slate-700'], font })
                  : [run(content.text, PALETTE['slate-700'])]
              const lineSpacing = content.kind === 'html' ? richLine(content.html) : bodyLine
              column.push(new Paragraph({ children: [label, ...runs], spacing: { before: spacingBefore, after: 0, ...lineSpacing } }))
            }
          })
          columns.push(column)
        }

        if (languages.length > 0) {
          columns.push([heading(swissHeading(dict, 'languages')), languageTable(languages, columnWidth), emptyParagraph()])
        }

        if (columns.length === 0) return []
        // Each column's heading carries the section gap as its space before, as
        // every other heading does; the cells start at the table's top.
        const gap = pxToTwips(GEOMETRY.columnGap)
        const cell = (content: (Paragraph | Table)[] | undefined, width: number) =>
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            margins: NO_MARGINS,
            borders: NO_CELL_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            children: content && content.length > 0 ? content : [emptyParagraph()],
          })
        return [
          new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [columnWidth, gap, columnWidth],
            layout: TableLayoutType.FIXED,
            borders: NO_BORDERS,
            rows: [new TableRow({ children: [cell(columns[0], columnWidth), cell(undefined, gap), cell(columns[1], columnWidth)] })],
          }),
        ]
      }
    }
  }

  for (const sectionId of visibility.sections) {
    children.push(...sectionBlocks(sectionId))
  }

  /** The contact grid: label and value pairs, two to a row. */
  function contactGrid(entries: ReturnType<typeof swissContactEntries>, width: number): Table {
    const pairGap = pxToTwips(GEOMETRY.contactPairGap)
    // The label column and its gap grow with the type, as on the Preview (FR-4).
    const labelWidth = pxToTwips((GEOMETRY.contactLabel + GEOMETRY.contactLabelGap) * fontScale)
    const pairWidth = Math.round((width - pairGap) / 2)
    const valueWidth = pairWidth - labelWidth
    const contactLine = exactLineSpacing([LINE_HEIGHT.compact, line.contact])
    const textCell = (text: string, color: string, bold: boolean, cellWidth: number, top: number) =>
      new TableCell({
        width: { size: cellWidth, type: WidthType.DXA },
        margins: { ...NO_MARGINS, top },
        borders: NO_CELL_BORDERS,
        children: [new Paragraph({ children: text ? [run(text, color, { bold, size: size.contact })] : [], spacing: { after: 0, ...contactLine } })],
      })
    const rows: TableRow[] = []
    for (let index = 0; index < entries.length; index += 2) {
      const top = index === 0 ? 0 : pxToTwips(4)
      const left = entries[index]
      const right = entries[index + 1]
      rows.push(
        new TableRow({
          children: [
            textCell(left.label, PALETTE['slate-900'], true, labelWidth, top),
            textCell(left.value, PALETTE['slate-700'], false, valueWidth, top),
            textCell('', PALETTE['slate-700'], false, pairGap, top),
            textCell(right?.label ?? '', PALETTE['slate-900'], true, labelWidth, top),
            textCell(right?.value ?? '', PALETTE['slate-700'], false, valueWidth, top),
          ],
        }),
      )
    }
    return new Table({
      width: { size: width, type: WidthType.DXA },
      columnWidths: [labelWidth, valueWidth, pairGap, labelWidth, valueWidth],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows,
    })
  }

  /** The languages: name left, localized level right, a dotted rule under each. */
  function languageTable(entries: ResumeLanguage[], width: number): Table {
    const dotted: IBorderOptions = { style: BorderStyle.DOTTED, size: pxToEighths(1), color: PALETTE['slate-300'] }
    const half = Math.round(width / 2)
    const cell = (text: string, color: string, alignment: (typeof AlignmentType)[keyof typeof AlignmentType], cellWidth: number) =>
      new TableCell({
        width: { size: cellWidth, type: WidthType.DXA },
        margins: { top: pxToTwips(4), bottom: pxToTwips(4), left: 0, right: 0 },
        borders: { ...NO_CELL_BORDERS, bottom: dotted },
        children: [new Paragraph({ children: [run(text, color)], alignment, spacing: { after: 0, ...bodyLine } })],
      })
    return new Table({
      width: { size: width, type: WidthType.DXA },
      columnWidths: [half, width - half],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: entries.map(
        (lang) =>
          new TableRow({
            cantSplit: true,
            children: [
              cell(lang.language, PALETTE['slate-900'], AlignmentType.LEFT, half),
              cell(swissLanguageLevel(dict, lang.level), PALETTE['slate-600'], AlignmentType.RIGHT, width - half),
            ],
          }),
      ),
    })
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
            size: { width: pageWidthTwips, height: pageHeightTwips, orientation: PageOrientation.PORTRAIT },
            margin: { top: marginY, right: marginX, bottom: marginY, left: marginX },
            // The red strip down the left edge of every page.
            borders: {
              pageBorders: { display: PageBorderDisplay.ALL_PAGES, offsetFrom: PageBorderOffsetFrom.PAGE },
              pageBorderLeft: {
                style: BorderStyle.SINGLE,
                size: pxToEighths(SWISS_VOCATIONAL_ACCENT.stripPx),
                color: PALETTE['red-700'],
                space: 0,
              },
            },
          },
        },
        // OOXML ends a body with a paragraph; after a table it carries no line.
        children: children[children.length - 1] instanceof Table ? [...children, emptyParagraph()] : children,
      },
    ],
  })

  let buffer = (await Packer.toBuffer(doc)) as Buffer

  // `docx` has no srcRect API: the photo's object-fit: cover crop is written
  // into the one drawing laid out in its cell, as `docx-modern.ts` does.
  if (photo?.crop) {
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file('word/document.xml')
    if (file) {
      const xml = await file.async('string')
      const at = xml.search(/<wp:anchor\b[^>]*\slayoutInCell="1"/)
      if (at >= 0) {
        const { l, t, r, b } = photo.crop
        const cropped =
          xml.slice(0, at) +
          xml.slice(at).replace(/<a:srcRect\/>|<a:srcRect><\/a:srcRect>/, `<a:srcRect l="${l}" t="${t}" r="${r}" b="${b}"/>`)
        zip.file('word/document.xml', cropped)
        buffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
      }
    }
  }

  return buffer
}

/**
 * The photo as a drawing that fills the Preview's 110 × 140 px box with
 * `object-fit: cover`, upright per its EXIF orientation, or null when the data
 * is not an image this route can embed — in which case no frame is drawn
 * either, as on the Preview without a photo.
 */
function photoRun(photoBase64: string): { image: ImageRun; crop: { l: number; t: number; r: number; b: number } | null } | null {
  const imageType = detectImageType(photoBase64)
  if (!imageType) return null
  const data = Buffer.from(extractBase64Data(photoBase64), 'base64')
  if (data.length === 0) return null

  const boxWidth = GEOMETRY.photoWidth
  const boxHeight = GEOMETRY.photoHeight
  const orientation = imageType === 'jpg' ? readJpegOrientation(data) : EXIF_ORIENTATION_NONE
  const transform = EXIF_PHOTO_TRANSFORMS[orientation] ?? null
  const swapsAxes = transform?.swapsAxes === true

  let crop: { l: number; t: number; r: number; b: number } | null = null
  const dimensions = parseImageDimensions(data, imageType)
  if (dimensions) {
    const displayed = swapsAxes ? { width: dimensions.height, height: dimensions.width } : dimensions
    const displayedCrop = calculateCoverCropPercents(displayed.width, displayed.height, boxWidth, boxHeight)
    // srcRect is in the stored image's axes, which a 90° turn swaps; the cover
    // crop is centred, so the mapping is the one `docx-modern.ts` documents.
    const stored = swapsAxes
      ? { l: displayedCrop.t, r: displayedCrop.b, t: displayedCrop.l, b: displayedCrop.r }
      : displayedCrop
    crop = stored.l === 0 && stored.t === 0 && stored.r === 0 && stored.b === 0 ? null : stored
  }

  // A picture turned 90° is laid out unrotated and turned about its centre, so
  // it is offset by half the difference to land its turned box on the photo box.
  const pictureWidth = swapsAxes ? boxHeight : boxWidth
  const pictureHeight = swapsAxes ? boxWidth : boxHeight
  const offsetLeft = swapsAxes ? Math.round(((boxWidth - boxHeight) / 2) * EMU_PER_PX) : 0
  const offsetTop = swapsAxes ? Math.round(((boxHeight - boxWidth) / 2) * EMU_PER_PX) : 0

  const image = new ImageRun({
    type: imageType,
    data,
    transformation: { width: pictureWidth, height: pictureHeight, ...transform?.picture },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: offsetLeft },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: offsetTop },
      wrap: { type: TextWrappingType.NONE },
      behindDocument: false,
      layoutInCell: true,
      allowOverlap: false,
    },
  })
  return { image, crop }
}
