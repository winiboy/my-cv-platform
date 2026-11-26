import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  LineRuleType,
  Document,
  ImageRun,
  OverlapType,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  TabStopType,
  Table,
  TableAnchorType,
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
  ResumeSkillCategory,
} from '@/types/database'
import { PAGE_HEIGHT_INCHES, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_COMMERCE_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import {
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHeading,
  swissHasText,
  swissLanguageLevel,
  swissSkillContent,
} from '@/lib/swiss-vocational-template'
import {
  SWISS_COMMERCE_GEOMETRY as GEOMETRY,
  SWISS_COMMERCE_SIZES as SIZES,
  swissCommerceLanguagePill,
  swissCommerceSections,
  swissCommerceSkillLabel,
  type SwissCommerceSectionId,
} from '@/lib/swiss-commerce-template'
import { visibleContactDetails } from '@/lib/contact-visibility'
import {
  APP_BODY_FONT,
  contactValueChildren,
  KEEP_LINES,
  KEEP_WITH_NEXT,
  NO_TEXT_LINE,
  exactLineSpacing,
  extractAlignment,
  isHtmlList,
  isPlainTextList,
  keepAt,
  parseHtmlToDocxRuns,
  parsePlainTextBlocks,
  parsePlainTextListToParagraphs,
  pxToHalfPoints,
  pxToTwips,
  trackingSpacing,
  type DocxGeneratorSettings,
  type ParagraphKeep,
} from './docx-helpers'
import { interDocxFonts, pairInterFaces } from './docx-fonts'
import { DOCX_PALETTE } from './docx-palette'
import { bareInlineFormatTags, formattedBlocks } from './docx-preview-metrics'
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
  skills?: ResumeSkillCategory[] | null
  languages?: ResumeLanguage[] | null
}

/** Every run, rule and fill, in the colour of the class the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissCommerce

/** The letter spacing the Preview's `tracking-widest` draws, in em. */
const TRACKING = PREVIEW_TRACKING.swissCommerce

const LINE_HEIGHT = SWISS_COMMERCE_LINE_HEIGHT

/** Blank lines part plain text into blocks, as `formatText` and `parsePlainTextBlocks` split it. */
const PLAIN_TEXT_PARAGRAPH_SEPARATOR = /\n\n+/

/** Word's single line spacing, in 240ths of a line. */
const AUTO_SINGLE_LINE = 240

/** DrawingML line widths are in EMU: 9525 to the CSS px. */
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

/**
 * Character spacing, in twentieths of a point, that widens one space of a run
 * at `halfPoints` to `px`. A space is about a quarter of its font size wide,
 * so the spacing adds the rest.
 */
const spaceWidening = (px: number, halfPoints: number) => Math.max(0, Math.round((px - (halfPoints / 1.5) * 0.25) * 0.75 * 20))

/** The paragraph a table cell or the end of the body needs, drawing no text. */
const emptyParagraph = () => new Paragraph({ children: [], spacing: { before: 0, after: 0, ...NO_TEXT_LINE } })

/**
 * Generate the Word export of the "Commerce & administration" template.
 *
 * The Preview (`swiss-commerce-template.tsx`) is the contract: the same
 * sections in the same fixed order, the same visibility, headings, dates and
 * level names, read from `@/lib/swiss-commerce-template` and
 * `@/lib/swiss-vocational-template`.
 *
 * Layout in Word: every page has the printed Preview's top and foot margins;
 * the navy band is a floating table placed at the page's origin, so it meets
 * the paper's top and side edges on page 1 while later pages keep their
 * margin, its cells shaded navy, with the round photo in its first cell. Dated rows are
 * borderless two-column tables with the dates on the left; skills are a
 * borderless two-column table; languages are shaded, bordered runs.
 */
export async function generateSwissCommerceDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does (FR-4).
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields, photoBase64 } = settings
  const sections = swissCommerceSections(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = APP_BODY_FONT

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads.
  const row = (resume ?? {}) as StoredResume
  const { contact, title, photoVisible } = visibleContactDetails(row, hiddenContactFields)
  const experiences = (row.experience || []).filter((exp) => exp.visible !== false)
  const education = (row.education || []).filter((edu) => edu.visible !== false)
  const certifications = (row.certifications || []).filter((cert) => cert.visible !== false)
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = (row.skills || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissSkillContent(skill)
    return content ? [{ category: skill.category, content }] : []
  })
  const languages = (row.languages || []).filter((lang) => lang.visible !== false)

  // Run sizes in whole half-points; line pitches from the unrounded px.
  const size = {
    name: pxToHalfPoints(SIZES.name),
    title: pxToHalfPoints(SIZES.title),
    contact: pxToHalfPoints(SIZES.contact),
    heading: pxToHalfPoints(SIZES.heading),
    body: pxToHalfPoints(SIZES.body),
    pill: pxToHalfPoints(SIZES.pill),
  }
  const line = {
    name: SIZES.name * 1.5,
    title: SIZES.title * 1.5,
    contact: SIZES.contact * 1.5,
    heading: SIZES.heading * 1.5,
    body: SIZES.body * 1.5,
    pill: SIZES.pill * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])
  /** The line height of text drawn through `renderFormattedText`, at the body size. */
  const richLine = (text: string | undefined) => exactLineSpacing([formattedTextLineHeight(text, LINE_HEIGHT.text), line.body])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const pageHeightTwips = convertInchesToTwip(PAGE_HEIGHT_INCHES)
  const marginX = pxToTwips(GEOMETRY.paddingX)
  const contentWidth = pageWidthTwips - 2 * marginX

  const run = (text: string, color: string, options: { bold?: boolean; size?: number } = {}) =>
    new TextRun({ text, color, font, size: options.size ?? size.body, bold: options.bold })

  /**
   * Rich text (summary, descriptions, `skillsHtml`) as the Preview's
   * `renderFormattedText` draws it. HTML with a list: one paragraph per block
   * the browser draws (`formattedBlocks`), in order — every `<p>` and every
   * list item, so a paragraph beside a list is kept, which the shared list
   * helper drops — each list item written as that helper writes it, its
   * marker before its text. A plain-text list as one paragraph per item,
   * anything else as one paragraph of formatted runs.
   * `keep`: the keep rules of the last paragraph, inside a block print keeps
   * whole (`keepAt`).
   */
  const richParagraphs = (text: string, color: string, options: { spacingBefore?: number; keep?: ParagraphKeep } = {}): Paragraph[] => {
    const runOptions = { size: size.body, color, font }
    const lineSpacing = richLine(text)
    const alignment = extractAlignment(text)
    const { keep } = options
    const paragraphs = isHtmlList(text)
      ? formattedBlocks(text).map(
          (block, index, blocks) =>
            new Paragraph({
              children: [
                ...(block.marker === null ? [] : [new TextRun({ ...runOptions, text: `${block.marker} ` })]),
                ...parseHtmlToDocxRuns(bareInlineFormatTags(block.html), runOptions),
              ],
              alignment: block.alignment ?? alignment,
              spacing: { after: 0, ...lineSpacing },
              ...keepAt(keep, index, blocks.length),
            }),
        )
      : isPlainTextList(text)
        ? parsePlainTextListToParagraphs(text, runOptions, { spacingAfterItem: 0, spacingAfterLast: 0, alignment, lineSpacing, keep })
        : [new Paragraph({ children: parseHtmlToDocxRuns(text, runOptions), alignment, spacing: { after: 0, ...lineSpacing }, ...keep })]
    if (options.spacingBefore && paragraphs.length > 0) {
      // The Preview's `mt-1`: a spacer, since a built paragraph's spacing cannot be changed.
      paragraphs.unshift(new Paragraph({ children: [], spacing: { before: 0, after: options.spacingBefore, ...NO_TEXT_LINE }, ...(keep ? KEEP_WITH_NEXT : {}) }))
    }
    return paragraphs
  }

  /** A section heading: navy spaced capitals over a full-width navy rule. */
  const heading = (label: string, first: boolean) =>
    new Paragraph({
      children: [
        new TextRun({
          text: label,
          font,
          size: size.heading,
          bold: true,
          allCaps: true,
          color: PALETTE.navy,
          characterSpacing: trackingSpacing(TRACKING.caps, size.heading),
        }),
      ],
      spacing: {
        // The first section's gap under the band is the floating band's own
        // bottom distance from the text.
        before: first ? 0 : pxToTwips(GEOMETRY.sectionGap),
        after: pxToTwips(GEOMETRY.headingGap),
        ...exactLineSpacing([LINE_HEIGHT.compact, line.heading]),
      },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: pxToEighths(GEOMETRY.headingRule),
          color: PALETTE.navy,
          space: pxToPoints(GEOMETRY.headingRuleGap),
        },
      },
      keepNext: true,
    })

  /**
   * Dated rows: each a borderless one-row table, the dates in the left column,
   * the content on the right. The gap between two is a spacer paragraph
   * between their tables, not the next row's top margin, so a row that starts
   * a page starts at its top margin, as print drops the margin before an
   * entry at a page break; it also keeps Word from merging the tables.
   *
   * The entry is kept whole by its paragraphs' keep rules (`keepAt`), which
   * the content carries, not by a row that cannot split: Word clips such a
   * row at the page's foot when it is taller than a page, where print breaks
   * it. A paragraph kept with the next one in its row's last cell would keep
   * the row with the next row, so the content's last paragraph has none.
   */
  const datedRows = (rows: { dates: string; content: Paragraph[] }[]): (Paragraph | Table)[] => {
    const dateWidth = pxToTwips(GEOMETRY.dateColumn)
    return rows.flatMap(({ dates, content }, index) => [
      ...(index > 0 ? [new Paragraph({ children: [], spacing: { before: 0, after: pxToTwips(GEOMETRY.entryGap), ...NO_TEXT_LINE } })] : []),
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [dateWidth, contentWidth - dateWidth],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: dateWidth, type: WidthType.DXA },
                margins: NO_MARGINS,
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.TOP,
                children: [
                  new Paragraph({
                    children: dates ? [run(dates, PALETTE['slate-500'])] : [],
                    spacing: { after: 0, ...bodyLine },
                    ...KEEP_LINES,
                  }),
                ],
              }),
              new TableCell({
                width: { size: contentWidth - dateWidth, type: WidthType.DXA },
                margins: NO_MARGINS,
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.TOP,
                children: content.length > 0 ? content : [emptyParagraph()],
              }),
            ],
          }),
        ],
      }),
    ])
  }

  const children: (Paragraph | Table)[] = []

  // ----------------------------------------------------------
  // HEADER BAND
  // ----------------------------------------------------------
  const photo = photoVisible && photoBase64 ? photoRun(photoBase64) : null
  const contactEntries = swissContactEntries(contact, dict)

  const headerText: Paragraph[] = []
  if (contact.name) {
    headerText.push(
      new Paragraph({
        children: [run(contact.name, PALETTE.white, { bold: true, size: size.name })],
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
            color: PALETTE['blue-300'],
            characterSpacing: trackingSpacing(TRACKING.caps, size.title),
          }),
        ],
        spacing: {
          before: headerText.length > 0 ? pxToTwips(GEOMETRY.nameGap) : 0,
          after: 0,
          ...exactLineSpacing([LINE_HEIGHT.compact, line.title]),
        },
      }),
    )
  }
  if (contactEntries.length > 0) {
    // One row of values, as the Preview's wrapping flex row; each gap is one
    // breakable space widened to the Preview's column gap, and each value is
    // held whole when it fits the band's line (`contactValueChildren`).
    const linePx = (contentWidth - (photo ? pxToTwips(GEOMETRY.photo + GEOMETRY.photoGap) : 0)) / 15
    const runs: TextRun[] = []
    contactEntries.forEach((entry, index) => {
      if (index > 0) {
        runs.push(
          new TextRun({ text: ' ', font, size: size.contact, characterSpacing: spaceWidening(GEOMETRY.contactGap, size.contact) }),
        )
      }
      runs.push(new TextRun({ children: contactValueChildren(entry.value, linePx, size.contact, entry.key === 'email'), color: PALETTE['blue-100'], font, size: size.contact }))
    })
    headerText.push(
      new Paragraph({
        children: runs,
        spacing: {
          before: headerText.length > 0 ? pxToTwips(GEOMETRY.titleGap) : 0,
          after: 0,
          ...exactLineSpacing([LINE_HEIGHT.compact, line.contact]),
        },
      }),
    )
  }
  if (headerText.length === 0) headerText.push(emptyParagraph())

  const navyShading = { type: ShadingType.CLEAR, fill: PALETTE.navy, color: 'auto' }
  const bandPadY = pxToTwips(GEOMETRY.bandPaddingY)
  const photoCellWidth = marginX + pxToTwips(GEOMETRY.photo + GEOMETRY.photoGap)
  const bandCells: TableCell[] = []
  if (photo) {
    bandCells.push(
      new TableCell({
        width: { size: photoCellWidth, type: WidthType.DXA },
        // The drawing's effect extent (see `roundPhoto`) adds the ring's width on
        // each side; the side margins give it up so the circle stays in place.
        margins: {
          top: bandPadY,
          bottom: bandPadY,
          left: marginX - pxToTwips(GEOMETRY.photoRing),
          right: pxToTwips(GEOMETRY.photoGap - GEOMETRY.photoRing),
        },
        borders: NO_CELL_BORDERS,
        shading: navyShading,
        verticalAlign: VerticalAlign.CENTER,
        // Single (auto) spacing: under the document's default exact line,
        // Word clips the inline drawing to one text line's height.
        children: [new Paragraph({ children: [photo.image], spacing: { before: 0, after: 0, line: AUTO_SINGLE_LINE, lineRule: LineRuleType.AUTO } })],
      }),
    )
  }
  const textCellWidth = pageWidthTwips - (photo ? photoCellWidth : 0)
  bandCells.push(
    new TableCell({
      width: { size: textCellWidth, type: WidthType.DXA },
      margins: { top: bandPadY, bottom: bandPadY, left: photo ? 0 : marginX, right: marginX },
      borders: NO_CELL_BORDERS,
      shading: navyShading,
      verticalAlign: VerticalAlign.CENTER,
      children: headerText,
    }),
  )
  children.push(
    new Table({
      // The band runs from paper edge to paper edge and meets the paper's top:
      // a floating table, the page's width, placed at the page's own origin,
      // as `docx-swiss-it.ts` places its band. Page margins are per section,
      // so this is what lets every page keep its top margin while page 1's
      // band still starts at the paper's edge: the body flows below the band
      // (its bottom distance is the Preview's gap), and a page the band is not
      // on starts at the margin.
      width: { size: pageWidthTwips, type: WidthType.DXA },
      float: {
        horizontalAnchor: TableAnchorType.PAGE,
        verticalAnchor: TableAnchorType.PAGE,
        absoluteHorizontalPosition: 0,
        absoluteVerticalPosition: 0,
        topFromText: 0,
        leftFromText: 0,
        rightFromText: 0,
        bottomFromText: pxToTwips(GEOMETRY.bandGap),
        overlap: OverlapType.NEVER,
      },
      columnWidths: photo ? [photoCellWidth, textCellWidth] : [textCellWidth],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [new TableRow({ cantSplit: true, children: bandCells })],
    }),
  )

  // ----------------------------------------------------------
  // SECTIONS, in the template's fixed order
  // ----------------------------------------------------------
  const sectionBlocks = (sectionId: SwissCommerceSectionId, first: boolean): (Paragraph | Table)[] => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return []
        // Kept whole with its heading, as print keeps the section.
        return [heading(swissHeading(dict, 'summary'), first), ...richParagraphs(row.summary, PALETTE['slate-800'], { keep: KEEP_LINES })]

      case 'experience':
        if (experiences.length === 0) return []
        return [
          heading(swissHeading(dict, 'experience'), first),
          ...datedRows(
            experiences.map((exp) => {
              const titleRuns = [run(exp.position || '', PALETTE['slate-900'], { bold: true })]
              if (exp.company) {
                titleRuns.push(run(` · ${exp.company}${exp.location ? `, ${exp.location}` : ''}`, PALETTE['slate-500']))
              }
              const achievements = (exp.achievements ?? []).filter(swissHasText)
              // The entry is kept whole, as print keeps it.
              const hasDetails = achievements.length > 0 || swissHasText(exp.description)
              const content: Paragraph[] = [
                new Paragraph({ children: titleRuns, spacing: { after: 0, ...bodyLine }, ...(hasDetails ? KEEP_WITH_NEXT : KEEP_LINES) }),
              ]
              if (achievements.length > 0) {
                achievements.forEach((achievement, index) => {
                  content.push(
                    new Paragraph({
                      children: [
                        run('•\t', PALETTE['slate-800']),
                        ...parseHtmlToDocxRuns(achievement, { size: size.body, color: PALETTE['slate-800'], font }),
                      ],
                      indent: { left: pxToTwips(20), hanging: pxToTwips(20) },
                      tabStops: [{ type: TabStopType.LEFT, position: pxToTwips(20) }],
                      spacing: { before: index === 0 ? pxToTwips(4) : 0, after: 0, ...richLine(achievement) },
                      ...keepAt(KEEP_LINES, index, achievements.length),
                    }),
                  )
                })
              } else if (swissHasText(exp.description)) {
                content.push(...richParagraphs(exp.description, PALETTE['slate-800'], { spacingBefore: pxToTwips(4), keep: KEEP_LINES }))
              }
              return { dates: formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict), content }
            }),
          ),
        ]

      case 'education':
        if (education.length === 0) return []
        return [
          heading(swissHeading(dict, 'education'), first),
          ...datedRows(
            education.map((edu) => {
              // The entry is kept whole, as print keeps it.
              const content: Paragraph[] = []
              const schoolLine = [edu.school, edu.field].filter(Boolean).join(' · ')
              const hasDescription = swissHasText(edu.description)
              if (edu.degree) {
                content.push(
                  new Paragraph({
                    children: [run(edu.degree, PALETTE['slate-900'], { bold: true })],
                    spacing: { after: 0, ...bodyLine },
                    ...(schoolLine || hasDescription ? KEEP_WITH_NEXT : KEEP_LINES),
                  }),
                )
              }
              if (schoolLine) {
                content.push(
                  new Paragraph({ children: [run(schoolLine, PALETTE['slate-500'])], spacing: { after: 0, ...bodyLine }, ...(hasDescription ? KEEP_WITH_NEXT : KEEP_LINES) }),
                )
              }
              if (swissHasText(edu.description)) {
                content.push(...richParagraphs(edu.description, PALETTE['slate-800'], { spacingBefore: pxToTwips(4), keep: KEEP_LINES }))
              }
              return { dates: formatSwissDateRange(edu.startDate, edu.endDate, false, dict), content }
            }),
          ),
        ]

      case 'skills': {
        if (skills.length === 0) return []
        const gap = pxToTwips(GEOMETRY.skillColumnGap)
        const columnWidth = Math.round((contentWidth - gap) / 2)
        /**
         * Plain-text skills (no tags: the editor's migration of legacy items
         * writes them so), as the Preview's `formatText` blocks lay them out
         * after the label: a first text block runs on from the label, its lines
         * kept apart by breaks; a first list starts on the line below a label
         * of its own; every further block is a paragraph of its own.
         */
        const plainSkillParagraphs = (label: TextRun, text: string): Paragraph[] => {
          const layout = { spacingAfterItem: 0, spacingAfterLast: 0, lineSpacing: bodyLine }
          const runOptions = { size: size.body, color: PALETTE['slate-800'], font }
          const [firstBlock, ...rest] = text.split(PLAIN_TEXT_PARAGRAPH_SEPARATOR)
          const first = parsePlainTextBlocks(firstBlock)[0]
          if (first?.type !== 'text') {
            return [new Paragraph({ children: [label], spacing: { after: 0, ...bodyLine } }), ...parsePlainTextListToParagraphs(text, runOptions, layout)]
          }
          // A trailing empty line opens no new line, as in the Preview's <div>.
          const lines = first.lines.length > 1 && first.lines[first.lines.length - 1].trim() === '' ? first.lines.slice(0, -1) : first.lines
          const runs: TextRun[] = [label, run(' ', PALETTE['slate-800'])]
          lines.forEach((textLine, index) => {
            if (index > 0) runs.push(new TextRun({ break: 1, ...runOptions }))
            if (textLine) runs.push(run(textLine, PALETTE['slate-800']))
          })
          const paragraphs = [new Paragraph({ children: runs, spacing: { after: 0, ...bodyLine } })]
          if (rest.length > 0) paragraphs.push(...parsePlainTextListToParagraphs(rest.join('\n\n'), runOptions, layout))
          return paragraphs
        }
        const skillCell = (skill: (typeof skills)[number] | undefined, width: number, top: number) => {
          const paragraphs: Paragraph[] = []
          if (skill) {
            const label = run(swissCommerceSkillLabel(skill.category), PALETTE.navy, { bold: true })
            const { content } = skill
            if (content.kind === 'html' && !rendersAsFormattedContent(content.html)) {
              paragraphs.push(...plainSkillParagraphs(label, content.html))
            } else if (content.kind === 'html' && isHtmlList(content.html)) {
              // A list cannot run on from the label: the label stands on its line, the items below, as on the Preview.
              paragraphs.push(new Paragraph({ children: [label], spacing: { after: 0, ...bodyLine } }))
              paragraphs.push(...richParagraphs(content.html, PALETTE['slate-800']))
            } else {
              const runs =
                content.kind === 'html'
                  ? parseHtmlToDocxRuns(content.html, { size: size.body, color: PALETTE['slate-800'], font })
                  : [run(content.text, PALETTE['slate-800'])]
              const lineSpacing = content.kind === 'html' ? richLine(content.html) : bodyLine
              paragraphs.push(new Paragraph({ children: [label, run(' ', PALETTE['slate-800']), ...runs], spacing: { after: 0, ...lineSpacing } }))
            }
          }
          return new TableCell({
            width: { size: width, type: WidthType.DXA },
            margins: { ...NO_MARGINS, top },
            borders: NO_CELL_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            children: paragraphs.length > 0 ? paragraphs : [emptyParagraph()],
          })
        }
        const rows: TableRow[] = []
        for (let index = 0; index < skills.length; index += 2) {
          const top = index === 0 ? 0 : pxToTwips(GEOMETRY.skillRowGap)
          rows.push(
            new TableRow({
              cantSplit: true,
              children: [
                skillCell(skills[index], columnWidth, top),
                skillCell(undefined, gap, top),
                skillCell(skills[index + 1], contentWidth - columnWidth - gap, top),
              ],
            }),
          )
        }
        return [
          heading(swissHeading(dict, 'skills'), first),
          new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [columnWidth, gap, contentWidth - columnWidth - gap],
            layout: TableLayoutType.FIXED,
            borders: NO_BORDERS,
            rows,
          }),
        ]
      }

      case 'languages': {
        if (languages.length === 0) return []
        const pillBorder: IBorderOptions = { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.pillBorder), color: PALETTE['blue-200'], space: 0 }
        const runs: TextRun[] = []
        languages.forEach((lang, index) => {
          if (index > 0) {
            runs.push(new TextRun({ text: ' ', font, size: size.pill, characterSpacing: spaceWidening(GEOMETRY.pillGap, size.pill) }))
          }
          // No-break spaces pad the pill and hold it on one line, as the
          // Preview's `whitespace-nowrap` does.
          const text = swissCommerceLanguagePill(lang.language, swissLanguageLevel(dict, lang.level)).replace(/ /g, '\u00A0')
          runs.push(
            new TextRun({
              text: `\u00A0${text}\u00A0`,
              font,
              size: size.pill,
              color: PALETTE['slate-800'],
              shading: { type: ShadingType.CLEAR, fill: PALETTE['blue-50'], color: 'auto' },
              border: pillBorder,
            }),
          )
        })
        return [
          heading(swissHeading(dict, 'languages'), first),
          new Paragraph({
            children: runs,
            alignment: AlignmentType.LEFT,
            // Single (auto) spacing: under an exact line Word paints a run's
            // shading the full height of the line but draws its border round
            // the glyphs, so the fill sat above the border. Auto spacing makes
            // the two boxes coincide; the pill row's height is then Word's own.
            spacing: { after: 0, line: AUTO_SINGLE_LINE, lineRule: LineRuleType.AUTO },
            // Kept whole with its heading, as print keeps the section.
            ...KEEP_LINES,
          }),
        ]
      }

      case 'training':
        if (certifications.length === 0) return []
        return [
          heading(swissHeading(dict, 'training'), first),
          ...datedRows(
            certifications.map((cert) => {
              const runs = [run(cert.name || '', PALETTE['slate-900'], { bold: true })]
              if (cert.issuer) runs.push(run(` · ${cert.issuer}`, PALETTE['slate-500']))
              return {
                dates: cert.date ? formatSwissMonth(cert.date) : '',
                content: [new Paragraph({ children: runs, spacing: { after: 0, ...bodyLine }, ...KEEP_LINES })],
              }
            }),
          ),
        ]
    }
  }

  let drawnSections = 0
  for (const sectionId of sections) {
    const blocks = sectionBlocks(sectionId, drawnSections === 0)
    if (blocks.length > 0) drawnSections += 1
    children.push(...blocks)
  }

  // ----------------------------------------------------------
  // ASSEMBLE
  // ----------------------------------------------------------
  const doc = new Document({
    // Inter travels with the file, so Word draws it on any computer (`docx-fonts.ts`).
    fonts: await interDocxFonts(),
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
            // The printed Preview's page margins (SWISS_COMMERCE_GEOMETRY), so
            // both break their pages at the same place: every page's foot and
            // every page's top, page 1's band floating over the top margin to
            // the paper's edge.
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

  let buffer = (await Packer.toBuffer(doc)) as Buffer

  // The photo is the document's only drawing. `docx` writes it as a rectangle
  // with no outline and has no API for either, so its geometry is set to an
  // ellipse — Word's own "crop to shape" — with the Preview's blue ring as its
  // outline, and the object-fit: cover crop is written from `calculateCoverCropPercents` (`docx-photo.ts`).
  if (photo) {
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file('word/document.xml')
    if (!file) throw new Error('The generated swissCommerce document has no word/document.xml')
    const xml = await file.async('string')
    zip.file('word/document.xml', roundPhoto(xml, photo.crop, PALETTE['blue-300']))
    buffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
  }

  return pairInterFaces(buffer)
}

/**
 * The photo's drawing made round: its preset geometry an ellipse, outlined in
 * `ringHex` at the Preview's ring width, and cropped to cover its square.
 *
 * @throws when the drawing is not in the shape `docx` writes it, rather than
 * shipping a square photo that the Preview draws round.
 */
export function roundPhoto(xml: string, crop: { l: number; t: number; r: number; b: number } | null, ringHex: string): string {
  const geometry = /<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="rect"\/>/
  if (!geometry.test(xml)) throw new Error('swissCommerce photo: no rectangular picture geometry to round')
  const ringEmu = GEOMETRY.photoRing * EMU_PER_PX
  let rounded = xml.replace(
    geometry,
    `<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:ln w="${ringEmu}"><a:solidFill><a:srgbClr val="${ringHex}"/></a:solidFill></a:ln>`,
  )
  // The ring is stroked on the ellipse's edge, so part of it falls outside the
  // picture's extent; the effect extent reserves that room, or Word clips the
  // ring flat at the top and bottom of the drawing. Measured in Word's own
  // render: half the ring's width still clipped it, its full width does not.
  const effectExtent = /<wp:effectExtent t="0" r="0" b="0" l="0"\/>/
  if (!effectExtent.test(rounded)) throw new Error('swissCommerce photo: no effect extent to widen for the ring')
  rounded = rounded.replace(effectExtent, `<wp:effectExtent t="${ringEmu}" r="${ringEmu}" b="${ringEmu}" l="${ringEmu}"/>`)
  if (crop) {
    const srcRect = /<a:srcRect\/>|<a:srcRect><\/a:srcRect>/
    if (!srcRect.test(rounded)) throw new Error('swissCommerce photo: no source rectangle to crop')
    rounded = rounded.replace(srcRect, `<a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/>`)
  }
  return rounded
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
