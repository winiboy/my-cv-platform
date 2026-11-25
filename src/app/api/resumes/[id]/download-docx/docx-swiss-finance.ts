import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Packer,
  PageOrientation,
  Paragraph,
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
import { SWISS_FINANCE_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import {
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHeading,
  swissHasText,
  swissLanguageLevel,
} from '@/lib/swiss-vocational-template'
import {
  SWISS_FINANCE_CONTACT_SEPARATOR,
  SWISS_FINANCE_GEOMETRY as GEOMETRY,
  SWISS_FINANCE_SIZES as SIZES,
  SWISS_FINANCE_LABEL_MAX_PX,
  swissFinanceFirstLine,
  swissFinanceLabelColumnPx,
  swissFinanceLanguagesLine,
  swissFinanceSections,
  swissFinanceSkillContent,
  swissFinanceSkillsHeading,
  type SwissFinanceSectionId,
} from '@/lib/swiss-finance-template'
import { visibleContactDetails } from '@/lib/contact-visibility'
import {
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

/**
 * The serif this template's Preview draws, as Word is given it.
 *
 * `swiss-finance-template.tsx` sets Tailwind's `font-serif` on its root, whose
 * stack is `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`.
 * `ui-serif` is a generic the platform resolves, and Georgia is the first
 * family a reader can actually be given — the face Chromium draws the Preview
 * and the PDF in, and one Word has on Windows and macOS. It is the face
 * `docx-classic.ts` writes for the same stack.
 */
export const SWISS_FINANCE_WORD_FONT = 'Georgia'

/** Every run, rule and fill, in the colour the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissFinance

/** The letter spacing of the name and of every heading, in em. */
const TRACKING = PREVIEW_TRACKING.swissFinance

const LINE_HEIGHT = SWISS_FINANCE_LINE_HEIGHT

/** Added to the measured label column so twip rounding can never leave Word a hair short of a word. */
export const WORD_LABEL_SLACK_PX = 2

/** DrawingML line widths are in EMU: 9525 to the CSS px. */
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
 * Generate the Word export of the "Banque, finance & assurance" template.
 *
 * The Preview (`swiss-finance-template.tsx`) is the contract: the same
 * sections in the same fixed order, the same visibility, headings, dates,
 * level names and joined text, read from `@/lib/swiss-finance-template` and
 * `@/lib/swiss-vocational-template`.
 *
 * Layout in Word: the page margins are the Preview's padding, and every run is
 * Georgia (`SWISS_FINANCE_WORD_FONT`). The header is the name block, beside
 * the photo in a borderless two-column table when there is one, then a
 * paragraph drawing no text whose bottom border is the double green rule. Each
 * heading's thin grey rule is its own paragraph's bottom border. Each dated
 * entry's first line is a borderless one-row table: the line in its left cell,
 * its dates right-aligned in its right cell, as wide as the Preview's date
 * column; what the entry draws below follows as paragraphs. Skills and
 * languages are a borderless two-column table, one row each.
 */
export async function generateSwissFinanceDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does (FR-4).
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields, photoBase64 } = settings
  const sections = swissFinanceSections(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = SWISS_FINANCE_WORD_FONT

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads.
  const row = (resume ?? {}) as StoredResume
  const { contact, title, photoVisible } = visibleContactDetails(row, hiddenContactFields)
  const experiences = (row.experience || []).filter((exp) => exp.visible !== false)
  const education = (row.education || []).filter((edu) => edu.visible !== false)
  const certifications = (row.certifications || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const line = swissFinanceFirstLine([cert.name, cert.issuer])
    const date = cert.date ? formatSwissMonth(cert.date) : ''
    return line.lead || date ? [{ line, date }] : []
  })
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = (row.skills || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissFinanceSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const languages = (row.languages || []).flatMap((lang) => {
    const language = lang.visible === false ? '' : (lang.language?.trim() ?? '')
    return language ? [{ language, level: swissLanguageLevel(dict, lang.level) }] : []
  })

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
    date: SIZES.date * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const pageHeightTwips = convertInchesToTwip(PAGE_HEIGHT_INCHES)
  const marginX = pxToTwips(GEOMETRY.paddingX)
  const contentWidth = pageWidthTwips - 2 * marginX

  const run = (text: string, color: string, options: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
    new TextRun({ text, color, font, size: options.size ?? size.body, bold: options.bold, italics: options.italics })

  /**
   * Rich text (summary, descriptions, `skillsHtml`) as the Preview's
   * `renderFormattedText` draws it. HTML: one paragraph per block the browser
   * draws (`formattedBlocks`), in order — every `<p>` and every list item, so
   * a paragraph beside a list is kept, which the shared list helper drops —
   * each with its inline formatting, a list item's marker hanging at the
   * list's indent. Plain text: `formatText`'s rules — its lists as items, its
   * other blocks as paragraphs whose lines keep their breaks.
   */
  const richParagraphs = (text: string, options: { spacingBefore?: number } = {}): Paragraph[] => {
    const runOptions = { size: size.body, color: PALETTE.body, font }
    const lineSpacing = exactLineSpacing([formattedTextLineHeight(text, LINE_HEIGHT.text), line.body])
    const alignment = extractAlignment(text)
    const markerHang = pxToTwips(FORMATTED_LIST_MARKER_EM * SIZES.body)
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
    if (options.spacingBefore && paragraphs.length > 0) paragraphs.unshift(spacer(options.spacingBefore))
    return paragraphs
  }

  /**
   * A section heading: green spaced capitals, its thin grey rule the
   * paragraph's bottom border, `headingRuleGap` below the text (a whole number
   * of points: Word takes a border's distance in points).
   */
  const heading = (label: string) =>
    new Paragraph({
      children: [
        new TextRun({
          text: label,
          font,
          size: size.heading,
          allCaps: true,
          color: PALETTE.accent,
          characterSpacing: trackingSpacing(TRACKING.heading, size.heading),
        }),
      ],
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: pxToEighths(GEOMETRY.headingRule),
          color: PALETTE.rule,
          space: Math.round(GEOMETRY.headingRuleGap * 0.75),
        },
      },
      spacing: { before: 0, after: pxToTwips(GEOMETRY.headingGap), ...exactLineSpacing([LINE_HEIGHT.compact, line.heading]) },
      keepNext: true,
    })

  /** An entry's achievements as bullets, or else its description, under its first line. */
  const details = (achievements: readonly string[], description: string | undefined): Paragraph[] => {
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
    return swissHasText(description) ? richParagraphs(description, { spacingBefore: pxToTwips(GEOMETRY.detailGap) }) : []
  }

  /**
   * One dated entry: its first line as a one-row borderless table — the bold
   * lead and the rest of the line in the left cell, the dates right-aligned in
   * grey italics in the right cell — then what it draws below.
   */
  const datedEntry = (entryLine: { lead: string; rest: string }, dates: string, below: Paragraph[]): (Paragraph | Table)[] => {
    const dateWidth = pxToTwips(GEOMETRY.dateColumn)
    const runs: TextRun[] = []
    if (entryLine.lead) runs.push(run(entryLine.lead, PALETTE.ink, { bold: true }))
    if (entryLine.rest) runs.push(run(entryLine.rest, PALETTE.body))
    const firstLine = new Table({
      width: { size: contentWidth, type: WidthType.DXA },
      columnWidths: [contentWidth - dateWidth, dateWidth],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: contentWidth - dateWidth, type: WidthType.DXA },
              margins: NO_MARGINS,
              borders: NO_CELL_BORDERS,
              verticalAlign: VerticalAlign.TOP,
              // Kept with what the entry draws below, as the Preview keeps the entry whole.
              children: [new Paragraph({ children: runs, spacing: { after: 0, ...bodyLine }, keepNext: below.length > 0 })],
            }),
            new TableCell({
              width: { size: dateWidth, type: WidthType.DXA },
              margins: { ...NO_MARGINS, left: pxToTwips(GEOMETRY.dateGap) },
              borders: NO_CELL_BORDERS,
              verticalAlign: VerticalAlign.TOP,
              children: [
                new Paragraph({
                  children: dates ? [run(dates, PALETTE.muted, { italics: true, size: size.date })] : [],
                  alignment: AlignmentType.RIGHT,
                  spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.text, line.date]) },
                  keepNext: below.length > 0,
                }),
              ],
            }),
          ],
        }),
      ],
    })
    return [firstLine, ...below]
  }

  /** A section of dated entries: its heading, then each entry, the entry gap between two. */
  const entrySection = (label: string, entries: (Paragraph | Table)[][]): (Paragraph | Table)[] => [
    heading(label),
    ...entries.flatMap((entry, index) => (index === 0 ? entry : [spacer(pxToTwips(GEOMETRY.entryGap)), ...entry])),
  ]

  const skillsDrawn = sections.includes('skills') && skills.length > 0
  const languagesDrawn = sections.includes('languages') && languages.length > 0
  // One table under one heading, where the first of the two sections falls, as on the Preview.
  const tableSection: SwissFinanceSectionId = sections.includes('skills') ? 'skills' : 'languages'

  /** The skills and languages table: a bold label column and a value column, one row per category and one for the languages. */
  const skillsTable = (): (Paragraph | Table)[] => {
    const rows: { label: string; value: Paragraph[] }[] = []
    if (skillsDrawn) {
      for (const skill of skills) {
        rows.push({
          label: skill.category,
          value:
            skill.content.kind === 'text'
              ? [new Paragraph({ children: [run(skill.content.text, PALETTE.body)], spacing: { after: 0, ...bodyLine } })]
              : richParagraphs(skill.content.html),
        })
      }
    }
    if (languagesDrawn) {
      rows.push({
        label: swissHeading(dict, 'languages'),
        value: [new Paragraph({ children: [run(swissFinanceLanguagesLine(languages), PALETTE.body)], spacing: { after: 0, ...bodyLine } })],
      })
    }
    // Word splits a word wider than its cell, so the label cell is sized to
    // the labels by the Preview's own rule, measured at the size Word draws
    // them (a whole half-point, never smaller than the Preview's), with
    // `WORD_LABEL_SLACK_PX` for twip rounding, never past the Preview's bound,
    // plus the gap the cell's right margin carries. Only a word wider than
    // that bound is broken, by Word, as the Preview breaks it.
    const labelPx = Math.min(
      SWISS_FINANCE_LABEL_MAX_PX,
      swissFinanceLabelColumnPx(rows.map(({ label }) => label), Math.max(SIZES.body, size.body / 1.5)) + WORD_LABEL_SLACK_PX,
    )
    const labelWidth = pxToTwips(labelPx) + pxToTwips(GEOMETRY.labelGap)
    return [
      heading(swissFinanceSkillsHeading(swissHeading(dict, 'skills'), swissHeading(dict, 'languages'), skillsDrawn, languagesDrawn)),
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [labelWidth, contentWidth - labelWidth],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: rows.map(
          ({ label, value }, index) =>
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: labelWidth, type: WidthType.DXA },
                  // The row gap is the top margin of every row after the first.
                  margins: { ...NO_MARGINS, top: index === 0 ? 0 : pxToTwips(GEOMETRY.rowGap), right: pxToTwips(GEOMETRY.labelGap) },
                  borders: NO_CELL_BORDERS,
                  verticalAlign: VerticalAlign.TOP,
                  children: [
                    new Paragraph({ children: label ? [run(label, PALETTE.ink, { bold: true })] : [], spacing: { after: 0, ...bodyLine } }),
                  ],
                }),
                new TableCell({
                  width: { size: contentWidth - labelWidth, type: WidthType.DXA },
                  margins: { ...NO_MARGINS, top: index === 0 ? 0 : pxToTwips(GEOMETRY.rowGap) },
                  borders: NO_CELL_BORDERS,
                  verticalAlign: VerticalAlign.TOP,
                  children: value.length > 0 ? value : [emptyParagraph()],
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
  const photo = photoVisible && photoBase64 ? photoRun(photoBase64) : null
  const contactLine = swissContactEntries(contact, dict)
    .map((entry) => entry.value)
    .join(SWISS_FINANCE_CONTACT_SEPARATOR)

  const headerText: Paragraph[] = []
  if (contact.name) {
    headerText.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contact.name,
            font,
            size: size.name,
            color: PALETTE.ink,
            allCaps: true,
            characterSpacing: trackingSpacing(TRACKING.name, size.name),
          }),
        ],
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.name, line.name]) },
      }),
    )
  }
  if (title) {
    headerText.push(
      new Paragraph({
        children: [run(title, PALETTE.accent, { italics: true, size: size.title })],
        spacing: {
          before: contact.name ? pxToTwips(GEOMETRY.nameGap) : 0,
          after: 0,
          ...exactLineSpacing([LINE_HEIGHT.compact, line.title]),
        },
      }),
    )
  }
  if (contactLine) {
    headerText.push(
      new Paragraph({
        children: [run(contactLine, PALETTE.muted, { size: size.contact })],
        spacing: {
          before: headerText.length > 0 ? pxToTwips(GEOMETRY.titleGap) : 0,
          after: 0,
          ...exactLineSpacing([LINE_HEIGHT.compact, line.contact]),
        },
      }),
    )
  }

  if (photo) {
    const photoCellWidth = pxToTwips(GEOMETRY.photoWidth + GEOMETRY.photoGap)
    children.push(
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [contentWidth - photoCellWidth, photoCellWidth],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: contentWidth - photoCellWidth, type: WidthType.DXA },
                margins: NO_MARGINS,
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: headerText.length > 0 ? headerText : [emptyParagraph()],
              }),
              new TableCell({
                width: { size: photoCellWidth, type: WidthType.DXA },
                margins: { ...NO_MARGINS, left: pxToTwips(GEOMETRY.photoGap) },
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                // The paragraph is the photo's height, exactly: the photo floats
                // in it, so the line reserves its room and nothing clips it.
                children: [
                  new Paragraph({
                    children: [photo.image],
                    spacing: { before: 0, after: 0, line: pxToTwips(GEOMETRY.photoHeight), lineRule: LineRuleType.EXACT },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    )
  } else {
    children.push(...headerText)
  }
  const hasHeader = children.length > 0
  if (hasHeader) {
    // The double green rule under the header, on a paragraph drawing no text.
    children.push(
      new Paragraph({
        children: [],
        border: { bottom: { style: BorderStyle.DOUBLE, size: pxToEighths(GEOMETRY.headerRule / 3), color: PALETTE.accent, space: 0 } },
        spacing: { before: pxToTwips(GEOMETRY.headerRuleGap), after: 0, ...NO_TEXT_LINE },
      }),
    )
  }

  // ----------------------------------------------------------
  // SECTIONS, in the template's fixed order
  // ----------------------------------------------------------
  const sectionBlocks = (sectionId: SwissFinanceSectionId): (Paragraph | Table)[] => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return []
        return [heading(swissHeading(dict, 'summary')), ...richParagraphs(row.summary)]

      case 'experience':
        if (experiences.length === 0) return []
        return entrySection(
          swissHeading(dict, 'experience'),
          experiences.map((exp) =>
            datedEntry(
              swissFinanceFirstLine([exp.position, exp.company, exp.location]),
              formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict),
              details((exp.achievements ?? []).filter(swissHasText), exp.description),
            ),
          ),
        )

      case 'education':
        if (education.length === 0) return []
        return entrySection(
          swissHeading(dict, 'education'),
          education.map((edu) => {
            const degree = edu.degree?.trim() ?? ''
            const school = [edu.school?.trim(), edu.field?.trim()].filter(Boolean).join(', ')
            const below: Paragraph[] = []
            if (degree && school) below.push(new Paragraph({ children: [run(school, PALETTE.muted)], spacing: { after: 0, ...bodyLine } }))
            below.push(...details([], edu.description))
            return datedEntry({ lead: degree || school, rest: '' }, formatSwissDateRange(edu.startDate, edu.endDate, false, dict), below)
          }),
        )

      case 'training':
        if (certifications.length === 0) return []
        return entrySection(
          swissHeading(dict, 'training'),
          certifications.map(({ line: entryLine, date }) => datedEntry(entryLine, date, [])),
        )

      case 'skills':
      case 'languages':
        if (sectionId !== tableSection || (!skillsDrawn && !languagesDrawn)) return []
        return skillsTable()
    }
  }

  let drawnSections = 0
  for (const sectionId of sections) {
    const blocks = sectionBlocks(sectionId)
    if (blocks.length === 0) continue
    // The space above a section: the header's gap above the first, when there
    // is a header, and the section gap above every other. A spacer carries it,
    // so it also separates two tables, which Word would otherwise merge.
    const gap = drawnSections === 0 ? (hasHeader ? GEOMETRY.headerGap : 0) : GEOMETRY.sectionGap
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
            size: { width: pageWidthTwips, height: pageHeightTwips, orientation: PageOrientation.PORTRAIT },
            // The Preview's padding, as the page's margins.
            margin: {
              top: pxToTwips(GEOMETRY.paddingTop),
              right: marginX,
              bottom: pxToTwips(GEOMETRY.paddingBottom),
              left: marginX,
              header: 0,
              footer: 0,
            },
          },
        },
        // OOXML ends a body with a paragraph; after a table it carries no line.
        children:
          children.length === 0 || children[children.length - 1] instanceof Table ? [...children, emptyParagraph()] : children,
      },
    ],
  })

  let buffer = (await Packer.toBuffer(doc)) as Buffer

  // The photo is the document's only drawing. `docx` writes it with no outline
  // or fill and has no srcRect API: its thin border, its fill and its
  // object-fit: cover crop are written into its drawing.
  if (photo) {
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file('word/document.xml')
    if (!file) throw new Error('The generated swissFinance document has no word/document.xml')
    const xml = await file.async('string')
    zip.file('word/document.xml', framePhoto(xml, photo.crop, PALETTE.rule, PALETTE.photoFill))
    buffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
  }

  return buffer
}

/**
 * The photo's drawing outlined in `borderHex` at the Preview's border width,
 * filled in `fillHex` where the photo is transparent, and cropped to cover its
 * frame.
 *
 * @throws when the drawing is not in the shape `docx` writes it, rather than
 * shipping a photo without the frame the Preview draws.
 */
export function framePhoto(
  xml: string,
  crop: { l: number; t: number; r: number; b: number } | null,
  borderHex: string,
  fillHex: string,
): string {
  const geometry = /<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="rect"\/>/
  if (!geometry.test(xml)) throw new Error('swissFinance photo: no rectangular picture geometry to outline')
  const borderEmu = GEOMETRY.photoBorder * EMU_PER_PX
  let framed = xml.replace(
    geometry,
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>` +
      `<a:ln w="${borderEmu}"><a:solidFill><a:srgbClr val="${borderHex}"/></a:solidFill></a:ln>`,
  )
  // The outline is stroked on the picture's edge, so half of it falls outside
  // the extent; the effect extent reserves that room, so Word does not clip it.
  const effectExtent = /<wp:effectExtent t="0" r="0" b="0" l="0"\/>/
  if (!effectExtent.test(framed)) throw new Error('swissFinance photo: no effect extent to widen for the border')
  framed = framed.replace(effectExtent, `<wp:effectExtent t="${borderEmu}" r="${borderEmu}" b="${borderEmu}" l="${borderEmu}"/>`)
  if (crop) {
    const srcRect = /<a:srcRect\/>|<a:srcRect><\/a:srcRect>/
    if (!srcRect.test(framed)) throw new Error('swissFinance photo: no source rectangle to crop')
    framed = framed.replace(srcRect, `<a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/>`)
  }
  return framed
}

/**
 * The photo as a drawing that fills the Preview's rectangular frame with
 * `object-fit: cover`, upright per its EXIF orientation, at the right of its
 * cell, or null when the data is not an image this route can embed — in
 * which case no frame is drawn either, as on the Preview without a photo.
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

  // The photo's cell is exactly as wide as the frame, past its left margin, so
  // the frame starts at the cell's text column. A picture turned 90° is laid
  // out unrotated and turned about its centre: it is moved left and down by
  // half the difference of its sides to land its turned box on the frame.
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
