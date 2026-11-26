import { getTranslations, type Locale } from '@/lib/i18n'
import {
  BorderStyle,
  Document,
  ImageRun,
  LineRuleType,
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
  ResumeSkillCategory,
} from '@/types/database'
import { PAGE_HEIGHT_INCHES, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_HEALTH_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import {
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHeading,
  swissHasText,
  swissLanguageLevel,
} from '@/lib/swiss-vocational-template'
import {
  SWISS_HEALTH_GEOMETRY as GEOMETRY,
  SWISS_HEALTH_SEPARATOR,
  SWISS_HEALTH_SIZES as SIZES,
  swissHealthLanguageLine,
  swissHealthSections,
  swissHealthSkillContent,
  type SwissHealthSectionId,
} from '@/lib/swiss-health-template'
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

/** Every run, rule and fill, in the colour the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissHealth

/** The letter spacing the Preview's `tracking-widest` draws, in em. */
const TRACKING = PREVIEW_TRACKING.swissHealth

const LINE_HEIGHT = SWISS_HEALTH_LINE_HEIGHT

/** Word's single line spacing, in 240ths of a line. */
const AUTO_SINGLE_LINE = 240

/** DrawingML line widths are in EMU: 9525 to the CSS px. */
const EMU_PER_PX = 9525

/** A no-break space (U+00A0): pads a heading pill without letting its line break there. */
const NBSP = ' '

/**
 * How far a heading pill's text is raised (`w:position`), so it sits in the
 * middle of its shading. Under an exact line Word lays the whole extra height
 * — the pill's padding, top and bottom — above the glyphs, so the text sat at
 * the foot of the box. Half the vertical padding centres the capitals: in
 * Word's own render (2026-11-22) the gap above and below them went from 12.8px
 * and 6px to 10px and 8.5px, the accent of "É" included above. The shading is
 * the line's and does not move, so nothing is clipped.
 */
export const PILL_TEXT_RAISE = `${(GEOMETRY.pillPaddingY / 2) * 0.75}pt` as const

/** A border OOXML draws as nothing. */
const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
const NO_CELL_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const NO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 }

/** A CSS px border width as a Word border width, in eighths of a point. */
const pxToEighths = (px: number) => Math.round(px * 0.75 * 8)

/**
 * Character spacing, in twentieths of a point, that widens one space of a run
 * at `halfPoints` to `px`. A space is about a quarter of its font size wide,
 * so the spacing adds the rest.
 */
const spaceWidening = (px: number, halfPoints: number) => Math.max(0, Math.round((px - (halfPoints / 1.5) * 0.25) * 0.75 * 20))

/** The paragraph a table cell or the end of the body needs, drawing no text. */
const emptyParagraph = () => new Paragraph({ children: [], spacing: { before: 0, after: 0, ...NO_TEXT_LINE } })

/** A paragraph drawing no text that carries a vertical gap of `twips`. */
const spacer = (twips: number) => new Paragraph({ children: [], spacing: { before: 0, after: twips, ...NO_TEXT_LINE } })

/**
 * Generate the Word export of the "Santé & social" template.
 *
 * The Preview (`swiss-health-template.tsx`) is the contract: the same sections
 * in the same fixed order, the same visibility, headings, dates, level names
 * and skill text, read from `@/lib/swiss-health-template` and
 * `@/lib/swiss-vocational-template`.
 *
 * Layout in Word: the page margins are the Preview's padding. The header is a
 * borderless two-column table holding the round photo and the name block, or
 * the name block alone. Each heading pill is a run of spaced capitals shaded
 * the pill colour, padded by widened no-break spaces, on a line as tall as the
 * pill. Each dated entry is a borderless one-row table: the dates in its left
 * cell, whose left border is the entry's light-teal bar, so the bar runs the
 * row's full height; the content in its right cell. Skills and languages side
 * by side are a borderless table of two columns and their gap.
 */
export async function generateSwissHealthDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does (FR-4).
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields, photoBase64 } = settings
  const sections = swissHealthSections(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = APP_BODY_FONT

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads.
  const row = (resume ?? {}) as StoredResume
  const { contact, title, photoVisible } = visibleContactDetails(row, hiddenContactFields)
  const experiences = (row.experience || []).filter((exp) => exp.visible !== false)
  const education = (row.education || []).filter((edu) => edu.visible !== false)
  const certifications = (row.certifications || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const name = cert.name?.trim() ?? ''
    const issuer = cert.issuer?.trim() ?? ''
    const date = cert.date ? formatSwissMonth(cert.date) : ''
    return name || issuer || date ? [{ name, issuer, date }] : []
  })
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = (row.skills || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissHealthSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const languages = (row.languages || []).filter((lang) => lang.visible !== false && Boolean(lang.language?.trim()))

  // Run sizes in whole half-points; line pitches from the unrounded px.
  const size = {
    name: pxToHalfPoints(SIZES.name),
    title: pxToHalfPoints(SIZES.title),
    contact: pxToHalfPoints(SIZES.contact),
    pill: pxToHalfPoints(SIZES.pill),
    body: pxToHalfPoints(SIZES.body),
    date: pxToHalfPoints(SIZES.date),
    skillCaption: pxToHalfPoints(SIZES.skillCaption),
  }
  const line = {
    name: SIZES.name * 1.5,
    title: SIZES.title * 1.5,
    contact: SIZES.contact * 1.5,
    pill: SIZES.pill * 1.5,
    body: SIZES.body * 1.5,
    date: SIZES.date * 1.5,
    skillCaption: SIZES.skillCaption * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const pageHeightTwips = convertInchesToTwip(PAGE_HEIGHT_INCHES)
  const marginX = pxToTwips(GEOMETRY.paddingX)
  const contentWidth = pageWidthTwips - 2 * marginX

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
   * A section heading drawn as a pill: dark-teal spaced capitals in runs
   * shaded the pill colour, padded each side by a no-break space widened to
   * the pill's padding. The line is exactly the pill's height, and under an
   * exact line Word shades a run the full height of its line, so the shading
   * is the pill's box; the text is raised to its middle (`PILL_TEXT_RAISE`).
   * Word has no rounded run: the pill's ends are square.
   */
  const pill = (label: string) => {
    const shading = { type: ShadingType.CLEAR, fill: PALETTE.pill, color: 'auto' }
    const pad = () =>
      new TextRun({ text: NBSP, font, size: size.pill, shading, characterSpacing: spaceWidening(GEOMETRY.pillPaddingX, size.pill) })
    return new Paragraph({
      children: [
        pad(),
        new TextRun({
          text: label,
          font,
          size: size.pill,
          bold: true,
          allCaps: true,
          color: PALETTE.heading,
          shading,
          characterSpacing: trackingSpacing(TRACKING.caps, size.pill),
          position: PILL_TEXT_RAISE,
        }),
        pad(),
      ],
      spacing: {
        before: 0,
        after: pxToTwips(GEOMETRY.headingGap),
        ...exactLineSpacing({ lineHeight: LINE_HEIGHT.compact, halfPoints: line.pill, paddingPx: 2 * GEOMETRY.pillPaddingY }),
      },
      keepNext: true,
    })
  }

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
   * One dated entry: a one-row borderless table, its dates in teal in the left
   * cell, whose left border is the entry's light-teal bar, and its content in
   * the right cell. A table per entry, so each bar is as tall as its own entry
   * and the gap between two entries is not barred.
   */
  const datedRow = (dates: string, content: Paragraph[]) => {
    const dateWidth = pxToTwips(GEOMETRY.dateColumn)
    return new Table({
      width: { size: contentWidth, type: WidthType.DXA },
      columnWidths: [dateWidth, contentWidth - dateWidth],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: dateWidth, type: WidthType.DXA },
              margins: { ...NO_MARGINS, left: pxToTwips(GEOMETRY.datePaddingLeft) },
              borders: {
                ...NO_CELL_BORDERS,
                left: { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.entryBar), color: PALETTE.rule, space: 0 },
              },
              verticalAlign: VerticalAlign.TOP,
              children: [
                new Paragraph({
                  children: dates ? [run(dates, PALETTE.accent, { size: size.date })] : [],
                  spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.text, line.date]) },
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
    })
  }

  /** A section of dated entries: its pill, then each entry, the entry gap between two. */
  const entrySection = (label: string, entries: Table[]): (Paragraph | Table)[] => [
    pill(label),
    ...entries.flatMap((entry, index) => (index === 0 ? [entry] : [spacer(pxToTwips(GEOMETRY.entryGap)), entry])),
  ]

  const skillsParagraphs = (): Paragraph[] => {
    const paragraphs: Paragraph[] = [pill(swissHeading(dict, 'skills'))]
    skills.forEach((skill, index) => {
      const before = index === 0 ? 0 : pxToTwips(GEOMETRY.skillCategoryGap)
      if (skill.category) {
        // The mockup draws no category; the stored category is content, so it
        // is drawn, small, as a caption above its own skills (FR-1).
        paragraphs.push(
          new Paragraph({
            children: [run(skill.category, PALETTE.heading, { bold: true, size: size.skillCaption })],
            spacing: {
              before,
              after: pxToTwips(GEOMETRY.skillCaptionGap),
              ...exactLineSpacing([LINE_HEIGHT.compact, line.skillCaption]),
            },
            keepNext: true,
          }),
        )
      }
      const contentBefore = skill.category ? 0 : before
      if (skill.content.kind === 'text') {
        paragraphs.push(new Paragraph({ children: [run(skill.content.text, PALETTE.body)], spacing: { before: contentBefore, after: 0, ...bodyLine } }))
      } else {
        paragraphs.push(...richParagraphs(skill.content.html, { spacingBefore: contentBefore }))
      }
    })
    return paragraphs
  }

  const languagesParagraphs = (): Paragraph[] => [
    pill(swissHeading(dict, 'languages')),
    ...languages.map(
      (lang) =>
        new Paragraph({
          children: [run(swissHealthLanguageLine(lang.language, swissLanguageLevel(dict, lang.level)), PALETTE.body)],
          spacing: { after: 0, ...bodyLine },
        }),
    ),
  ]

  const skillsDrawn = sections.includes('skills') && skills.length > 0
  const languagesDrawn = sections.includes('languages') && languages.length > 0

  const children: (Paragraph | Table)[] = []

  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------
  const photo = photoVisible && photoBase64 ? photoRun(photoBase64) : null
  const contactEntries = swissContactEntries(contact, dict)

  const headerText: Paragraph[] = []
  if (contact.name) {
    headerText.push(
      new Paragraph({
        children: [run(contact.name, PALETTE.heading, { bold: true, size: size.name })],
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.name, line.name]) },
      }),
    )
  }
  if (title) {
    headerText.push(
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
  if (contactEntries.length > 0) {
    // One line of values, as the Preview's wrapping flex row; each gap is one
    // breakable space widened to the Preview's column gap.
    const runs: TextRun[] = []
    contactEntries.forEach((entry, index) => {
      if (index > 0) {
        runs.push(new TextRun({ text: ' ', font, size: size.contact, characterSpacing: spaceWidening(GEOMETRY.contactGap, size.contact) }))
      }
      runs.push(run(entry.value, PALETTE.contact, { size: size.contact }))
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

  if (photo) {
    const photoCellWidth = pxToTwips(GEOMETRY.photo + GEOMETRY.photoGap)
    children.push(
      new Table({
        width: { size: contentWidth, type: WidthType.DXA },
        columnWidths: [photoCellWidth, contentWidth - photoCellWidth],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: photoCellWidth, type: WidthType.DXA },
                // The drawing's effect extent (see `roundPhoto`) adds the ring's
                // width on each side; the right margin gives it up, so the name
                // block starts where the Preview's does.
                margins: { ...NO_MARGINS, right: pxToTwips(GEOMETRY.photoGap - 2 * GEOMETRY.photoRing) },
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                // Single (auto) spacing: under the document's default exact line,
                // Word clips the inline drawing to one text line's height.
                children: [new Paragraph({ children: [photo.image], spacing: { before: 0, after: 0, line: AUTO_SINGLE_LINE, lineRule: LineRuleType.AUTO } })],
              }),
              new TableCell({
                width: { size: contentWidth - photoCellWidth, type: WidthType.DXA },
                margins: NO_MARGINS,
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: headerText.length > 0 ? headerText : [emptyParagraph()],
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

  // ----------------------------------------------------------
  // SECTIONS, in the template's fixed order
  // ----------------------------------------------------------
  const sectionBlocks = (sectionId: SwissHealthSectionId): (Paragraph | Table)[] => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return []
        return [pill(swissHeading(dict, 'summary')), ...richParagraphs(row.summary)]

      case 'education':
        if (education.length === 0) return []
        return entrySection(
          swissHeading(dict, 'education'),
          education.map((edu) => {
            const degree = edu.degree?.trim() ?? ''
            const school = [edu.school?.trim(), edu.field?.trim()].filter(Boolean).join(', ')
            const first = degree || school
            const content: Paragraph[] = []
            if (first) content.push(new Paragraph({ children: [run(first, PALETTE.ink, { bold: true })], spacing: { after: 0, ...bodyLine } }))
            if (degree && school) content.push(new Paragraph({ children: [run(school, PALETTE.muted)], spacing: { after: 0, ...bodyLine } }))
            content.push(...details([], edu.description))
            return datedRow(formatSwissDateRange(edu.startDate, edu.endDate, false, dict), content)
          }),
        )

      case 'experience':
        if (experiences.length === 0) return []
        return entrySection(
          swissHeading(dict, 'experience'),
          experiences.map((exp) => {
            const position = exp.position?.trim() ?? ''
            const employer = [exp.company?.trim(), exp.location?.trim()].filter(Boolean).join(', ')
            const first = position || employer
            const content: Paragraph[] = []
            if (first) {
              const runs = [run(first, PALETTE.ink, { bold: true })]
              if (position && employer) runs.push(run(`${SWISS_HEALTH_SEPARATOR}${employer}`, PALETTE.muted))
              content.push(new Paragraph({ children: runs, spacing: { after: 0, ...bodyLine } }))
            }
            content.push(...details((exp.achievements ?? []).filter(swissHasText), exp.description))
            return datedRow(formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict), content)
          }),
        )

      case 'training':
        if (certifications.length === 0) return []
        return entrySection(
          swissHeading(dict, 'training'),
          certifications.map(({ name, issuer, date }) => {
            const runs: TextRun[] = []
            if (name) runs.push(run(name, PALETTE.ink, { bold: true }))
            if (issuer) runs.push(run(name ? `${SWISS_HEALTH_SEPARATOR}${issuer}` : issuer, PALETTE.muted))
            return datedRow(date, runs.length > 0 ? [new Paragraph({ children: runs, spacing: { after: 0, ...bodyLine } })] : [])
          }),
        )

      case 'skills': {
        if (!skillsDrawn) return []
        if (!languagesDrawn) return skillsParagraphs()
        // Side by side, as the mockup draws them; when one of the two is not
        // drawn, the other takes the full width alone, as on the Preview.
        const gap = pxToTwips(GEOMETRY.columnGap)
        const columnWidth = Math.round((contentWidth - gap) / 2)
        const cell = (paragraphs: Paragraph[], width: number) =>
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            margins: NO_MARGINS,
            borders: NO_CELL_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            children: paragraphs.length > 0 ? paragraphs : [emptyParagraph()],
          })
        return [
          new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [columnWidth, gap, contentWidth - columnWidth - gap],
            layout: TableLayoutType.FIXED,
            borders: NO_BORDERS,
            rows: [
              new TableRow({
                cantSplit: true,
                children: [cell(skillsParagraphs(), columnWidth), cell([], gap), cell(languagesParagraphs(), contentWidth - columnWidth - gap)],
              }),
            ],
          }),
        ]
      }

      case 'languages':
        // Drawn beside the skills when both are drawn.
        if (!languagesDrawn || skillsDrawn) return []
        return languagesParagraphs()
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

  // The photo is the document's only drawing. `docx` writes it as a rectangle
  // with no outline or fill and has no API for any of them, so its geometry is
  // set to an ellipse — Word's own "crop to shape" — with the Preview's
  // light-teal fill and ring, and the object-fit: cover crop is written from
  // `calculateCoverCropPercents` (`docx-photo.ts`).
  if (photo) {
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file('word/document.xml')
    if (!file) throw new Error('The generated swissHealth document has no word/document.xml')
    const xml = await file.async('string')
    zip.file('word/document.xml', roundPhoto(xml, photo.crop, PALETTE.rule, PALETTE.photoFill))
    buffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
  }

  return buffer
}

/**
 * The photo's drawing made round: its preset geometry an ellipse, filled in
 * `fillHex` where the photo is transparent, outlined in `ringHex` at the
 * Preview's ring width, and cropped to cover its square.
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
  const geometry = /<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="rect"\/>/
  if (!geometry.test(xml)) throw new Error('swissHealth photo: no rectangular picture geometry to round')
  const ringEmu = GEOMETRY.photoRing * EMU_PER_PX
  let rounded = xml.replace(
    geometry,
    `<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>` +
      `<a:ln w="${ringEmu}"><a:solidFill><a:srgbClr val="${ringHex}"/></a:solidFill></a:ln>`,
  )
  // The ring is stroked on the ellipse's edge, so part of it falls outside the
  // picture's extent; the effect extent reserves that room, or Word clips the
  // ring flat at the top and bottom of the drawing (measured for swissCommerce).
  const effectExtent = /<wp:effectExtent t="0" r="0" b="0" l="0"\/>/
  if (!effectExtent.test(rounded)) throw new Error('swissHealth photo: no effect extent to widen for the ring')
  rounded = rounded.replace(effectExtent, `<wp:effectExtent t="${ringEmu}" r="${ringEmu}" b="${ringEmu}" l="${ringEmu}"/>`)
  if (crop) {
    const srcRect = /<a:srcRect\/>|<a:srcRect><\/a:srcRect>/
    if (!srcRect.test(rounded)) throw new Error('swissHealth photo: no source rectangle to crop')
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
