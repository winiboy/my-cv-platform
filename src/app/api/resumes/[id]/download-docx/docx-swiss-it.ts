import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  LineRuleType,
  OverlapType,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Tab,
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
  ResumeProject,
  ResumeSkillCategory,
} from '@/types/database'
import { PAGE_HEIGHT_TWIPS, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { interLinkWidthPx } from '@/lib/inter-link-widths'
import { SWISS_IT_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import { formatSwissMonth, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import {
  SWISS_IT_CARD_TEXT_WIDTH,
  SWISS_IT_CONTACT_DOT,
  SWISS_IT_GEOMETRY as GEOMETRY,
  SWISS_IT_MONO_FONT_DOCX as MONO,
  SWISS_IT_SIZES as SIZES,
  swissItCardRows,
  swissItCertificate,
  swissItCertificationsLine,
  swissItContactLines,
  swissItDates,
  swissItEntryLines,
  swissItHeading,
  swissItLanguagesLine,
  swissItLastHeading,
  swissItLinkParts,
  swissItProject,
  swissItSkillContent,
  swissItSkillLabel,
  swissItUnbreakable,
  swissItTitle,
  swissItVisibility,
  type SwissItSectionId,
} from '@/lib/swiss-it-template'
import { visibleContactDetails } from '@/lib/contact-visibility'
import {
  APP_BODY_FONT,
  KEEP_LINES,
  KEEP_WITH_NEXT,
  NO_TEXT_LINE,
  exactLineSpacing,
  extractAlignment,
  keepAt,
  parseHtmlToDocxRuns,
  parsePlainTextListToParagraphs,
  pxToHalfPoints,
  pxToTwips,
  type DocxGeneratorSettings,
  type ParagraphKeep,
} from './docx-helpers'
import { interDocxFonts, pairInterFaces } from './docx-fonts'
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
  skills?: ResumeSkillCategory[] | null
  languages?: ResumeLanguage[] | null
  projects?: ResumeProject[] | null
}

/** Every run, border and fill, in the colour the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissIt

const LINE_HEIGHT = SWISS_IT_LINE_HEIGHT

/** Word's single line spacing, in 240ths of a line. */
const AUTO_SINGLE_LINE = 240

/** DrawingML lengths are in EMU: 9525 to the CSS px. */
const EMU_PER_PX = 9525

/**
 * A tag paragraph's line, in 240ths of Word's single line: the single line
 * (about the glyph box Word shades, 1.2em) plus the Preview's gap between two
 * rows of tags, so wrapped rows do not touch, as `docx-swiss-trades.ts` sets it.
 */
const TAG_ROW_LINE = Math.round(240 * ((SIZES.tag * 1.2 + GEOMETRY.tagGap) / (SIZES.tag * 1.2)))

/** A border OOXML draws as nothing. */
const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
const NO_CELL_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }

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

/**
 * A link or a contact value with a zero-width space at each place it may wrap
 * (`swissItLinkParts`), as the Preview's `<wbr>`: Word wraps it after a "/" or
 * before a ".", never at an arbitrary letter. Used only for a value wider than
 * its whole line, so a value that fits is written as stored.
 */
const breakableLink = (text: string) => swissItLinkParts(text).join(TAG_BREAK)

/**
 * Consolas's advance, in em: every glyph of the monospace face is 1126/2048 of
 * its size wide, the no-break space and the middle dot included, so a
 * contact value's width in Word is exact from its length.
 */
export const CONSOLAS_ADVANCE_EM = 1126 / 2048

/**
 * A contact value's run text for its band line: whole, its spaces no-break
 * spaces, so Word moves a value that does not fit to the next line as the
 * Preview's flex row does; only a value wider than the whole line on its own
 * — which the Preview then wraps at its `<wbr>`s — gets its link boundaries
 * as break opportunities (`breakableLink`). `lineTwips` is the band's text
 * width; `halfPoints` the run's size.
 */
export function swissItContactRunText(value: string, lineTwips: number, halfPoints: number, isEmail: boolean): string {
  const whole = swissItUnbreakable(value)
  // An email address is never given a break opportunity: copied from Word or
  // read by an applicant-tracking parser, it must be the stored address. One
  // wider than the whole band breaks where Word decides (a recorded FR-10 limit).
  if (isEmail) return whole
  const widthTwips = [...whole].length * CONSOLAS_ADVANCE_EM * (halfPoints / 2) * 20
  return widthTwips > lineTwips ? breakableLink(whole) : whole
}

/**
 * How much narrower than a card's line a project link must measure to be
 * written as stored: a margin for what an unkerned sum and Word's own layout
 * may differ by, in CSS px.
 */
export const SWISS_IT_LINK_SAFETY_PX = 4

/**
 * A project link's run text: as stored when it fits a card's line in Inter at
 * Word's size (whole half-points), with `SWISS_IT_LINK_SAFETY_PX` to spare, so
 * copying it from Word gives the stored link; otherwise with a zero-width space
 * at each of its boundaries (`breakableLink`), so Word wraps it there rather
 * than at a letter, as the Preview wraps it at its `<wbr>`s.
 */
export function swissItProjectLinkText(url: string, halfPoints: number): string {
  const wordPx = halfPoints / 1.5
  return interLinkWidthPx(url, wordPx) > SWISS_IT_CARD_TEXT_WIDTH - SWISS_IT_LINK_SAFETY_PX ? breakableLink(url) : url
}

/** A paragraph drawing no text that carries a vertical gap of `twips`. */
const spacer = (twips: number, keep?: ParagraphKeep) => new Paragraph({ children: [], spacing: { before: 0, after: twips, ...NO_TEXT_LINE }, ...keep })

/**
 * Generate the Word export of the "Informatique & IT" template.
 *
 * The Preview (`swiss-it-template.tsx`) is the contract: the same sections in
 * the same fixed order, the same visibility, headings, dates, level names,
 * tags and project cards, read from `@/lib/swiss-it-template` and the shared
 * Swiss helpers.
 *
 * Layout in Word: every page has the printed Preview's continuation-page top
 * margin; the dark band is a floating table placed at the page's origin, so it
 * meets the paper's top and side edges on page 1 while later pages keep their
 * margin, its cells shaded, with the round photo in its last cell. Tags are shaded, outlined runs, as
 * `docx-swiss-trades.ts` draws its tags; each row of project cards is a table
 * of two bordered cells; dates sit at a right tab stop. The monospace lines
 * are Consolas, the face the Preview's monospace stack draws on Windows.
 */
export async function generateSwissItDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does (FR-4).
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields, photoBase64 } = settings
  const visibility = swissItVisibility(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = APP_BODY_FONT

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads. An entry that
  // stores nothing the template draws is not an entry (FR-2), as on the Preview.
  const row = (resume ?? {}) as StoredResume
  const { contact, title, photoVisible } = visibleContactDetails(row, hiddenContactFields)
  const skills = (row.skills || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissItSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const experiences = (row.experience || []).flatMap((exp) => {
    if (exp.visible === false) return []
    const lines = swissItEntryLines(exp.position, [exp.company, exp.location])
    const dates = swissItDates(exp.startDate, exp.endDate, exp.current, dict)
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return lines.lead || dates || achievements.length > 0 || description ? [{ ...lines, dates, achievements, description }] : []
  })
  const projects = (row.projects || []).flatMap((project) => {
    const drawn = project.visible === false ? null : swissItProject(project)
    return drawn ? [drawn] : []
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
        const line = swissItCertificate(cert.name, cert.issuer, cert.date ? formatSwissMonth(cert.date) : '')
        return line ? [line] : []
      })
    : []

  // Run sizes in whole half-points; line pitches from the unrounded px.
  const size = {
    name: pxToHalfPoints(SIZES.name),
    title: pxToHalfPoints(SIZES.title),
    contact: pxToHalfPoints(SIZES.contact),
    heading: pxToHalfPoints(SIZES.heading),
    body: pxToHalfPoints(SIZES.body),
    date: pxToHalfPoints(SIZES.date),
    tag: pxToHalfPoints(SIZES.tag),
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

  const run = (text: string, color: string, options: { bold?: boolean; size?: number } = {}) =>
    new TextRun({ text, color, font, size: options.size ?? size.body, bold: options.bold })
  const monoRun = (text: string, color: string, runSize: number, options: { bold?: boolean } = {}) =>
    new TextRun({ text, color, font: MONO, size: runSize, bold: options.bold })

  /**
   * Rich text (summary, descriptions, `skillsHtml`) as the Preview's
   * `renderFormattedText` draws it. HTML: one paragraph per block the browser
   * draws (`formattedBlocks`), in order, each with its inline formatting, a
   * list item's marker hanging at the list's indent. Plain text:
   * `formatText`'s rules — its lists as items, its other blocks as paragraphs.
   * As `docx-swiss-engineering.ts` draws it.
   * `keep`: the keep rules of the last paragraph, inside a block print keeps
   * whole (`keepAt`).
   */
  const richParagraphs = (text: string, color: string, spacingBefore = 0, keep?: ParagraphKeep): Paragraph[] => {
    const runOptions = { size: size.body, color, font }
    const lineSpacing = exactLineSpacing([formattedTextLineHeight(text, LINE_HEIGHT.text), line.body])
    const alignment = extractAlignment(text)
    const markerHang = pxToTwips(FORMATTED_LIST_MARKER_EM * (size.body / 1.5))
    const paragraphs = !rendersAsFormattedContent(text)
      ? parsePlainTextListToParagraphs(text, runOptions, { spacingAfterItem: 0, spacingAfterLast: 0, alignment, lineSpacing, keep })
      : formattedBlocks(text).map(
          (block, index, blocks) =>
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
              ...keepAt(keep, index, blocks.length),
            }),
        )
    if (spacingBefore > 0 && paragraphs.length > 0) paragraphs.unshift(spacer(spacingBefore, keep ? KEEP_WITH_NEXT : undefined))
    return paragraphs
  }

  /** A section heading: "// label", lower case, in green bold Consolas, kept with what follows. */
  const heading = (label: string, first: boolean) =>
    new Paragraph({
      children: [monoRun(label, PALETTE.heading, size.heading, { bold: true })],
      spacing: {
        // The first section's gap under the band is the band's own bottom
        // distance from the text; without a band, the page's top margin.
        before: first ? 0 : pxToTwips(GEOMETRY.sectionGap),
        after: pxToTwips(GEOMETRY.headingGap),
        ...exactLineSpacing([LINE_HEIGHT.compact, line.heading]),
      },
      keepNext: true,
    })

  /** One tag run: shaded and outlined, padded and held together with no-break spaces (`swissItUnbreakable`). */
  const tagRun = (text: string) =>
    new TextRun({
      text: `\u00A0${swissItUnbreakable(text)}\u00A0`,
      font,
      size: size.tag,
      color: PALETTE.tagText,
      shading: { type: ShadingType.CLEAR, fill: PALETTE.tagFill, color: 'auto' },
      border: { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.tagBorder), color: PALETTE.tagBorder, space: 0 },
    })

  /**
   * The gap before a tag, then a zero-width space: the explicit break
   * opportunity between two tags. Word does not reliably break between a space
   * and the no-break space a tag opens with (`docx-swiss-trades.ts`).
   */
  const tagGap = () => [
    new TextRun({ text: ' ', font, size: size.tag, characterSpacing: spaceWidening(GEOMETRY.tagGap, size.tag) }),
    new TextRun({ text: TAG_BREAK, font, size: size.tag }),
  ]

  /**
   * A paragraph of tags, after an optional lead run. Auto (multiple) spacing:
   * under an exact line Word shades a run the full height of its line, so
   * wrapped rows of tags touched; under auto spacing a run's shading is its
   * glyph box, and the multiple adds the Preview's gap between two rows.
   */
  const tagParagraph = (lead: TextRun | null, tags: readonly string[], before: number) => {
    const runs: TextRun[] = lead ? [lead] : []
    tags.forEach((text, index) => {
      if (lead || index > 0) runs.push(...tagGap())
      runs.push(tagRun(text))
    })
    return new Paragraph({
      children: runs,
      alignment: AlignmentType.LEFT,
      spacing: { before, after: 0, line: TAG_ROW_LINE, lineRule: LineRuleType.AUTO },
      // A row of tags is kept whole, as print keeps it; a card's ends the card.
      ...KEEP_LINES,
    })
  }

  /** An entry's first line: its bold lead, then its dates in grey Consolas at a right tab stop. */
  const firstLine = (lead: string, dates: string, tabAt: number, keep: ParagraphKeep) => {
    const runs: TextRun[] = []
    if (lead) runs.push(run(lead, PALETTE.ink, { bold: true }))
    if (dates) runs.push(new TextRun({ children: [new Tab()], font, size: size.date }), monoRun(dates, PALETTE.muted, size.date))
    return new Paragraph({ children: runs, tabStops: [{ type: TabStopType.RIGHT, position: tabAt }], spacing: { after: 0, ...bodyLine }, ...keep })
  }

  const textLine = (text: string, color: string, before = 0, keep?: ParagraphKeep) =>
    new Paragraph({ children: [run(text, color)], spacing: { before, after: 0, ...bodyLine }, ...keep })

  const children: (Paragraph | Table)[] = []

  // ----------------------------------------------------------
  // HEADER BAND
  // ----------------------------------------------------------
  const photo = photoVisible && photoBase64 ? photoRun(photoBase64) : null
  const contactLines = swissItContactLines(contact)
  // The band's cells: the text beside the photo, the photo with its gap and the page's inset.
  const photoCellWidth = pxToTwips(GEOMETRY.photoGap + GEOMETRY.photo) + marginX
  const textCellWidth = pageWidthTwips - (photo ? photoCellWidth : 0)
  /** The width the band's text cell leaves for a line, inside its margins. */
  const bandLineTwips = textCellWidth - marginX - (photo ? 0 : marginX)

  const headerText: Paragraph[] = []
  if (contact.name) {
    headerText.push(
      new Paragraph({
        children: [run(contact.name, PALETTE.name, { bold: true, size: size.name })],
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.name, line.name]) },
      }),
    )
  }
  if (title) {
    headerText.push(
      new Paragraph({
        children: [monoRun(swissItTitle(title), PALETTE.prompt, size.title)],
        spacing: { before: contact.name ? pxToTwips(GEOMETRY.nameGap) : 0, after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, line.title]) },
      }),
    )
  }
  contactLines.forEach((values, index) => {
    const before = index > 0 ? pxToTwips(GEOMETRY.contactRowGap) : headerText.length > 0 ? pxToTwips(GEOMETRY.titleGap) : 0
    // Each value is held together, so the line wraps at the breakable space
    // after a dot and moves a value that does not fit whole, as the Preview's
    // row wraps between two values; a value wider than the whole line on its
    // own wraps at its link boundaries (`swissItContactRunText`).
    const runs = values.map((value, valueIndex) =>
      monoRun(
        `${swissItContactRunText(value, bandLineTwips, size.contact, value.endsWith(SWISS_IT_CONTACT_DOT) ? value.slice(0, -SWISS_IT_CONTACT_DOT.length) === contact.email?.trim() : value === contact.email?.trim())}${valueIndex < values.length - 1 ? ' ' : ''}`,
        PALETTE.contact,
        size.contact,
      ),
    )
    headerText.push(
      new Paragraph({
        children: runs,
        spacing: { before, after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, line.contact]) },
      }),
    )
  })

  // A band with nothing in it is not drawn (FR-2), as on the Preview.
  if (headerText.length > 0 || photo) {
    if (headerText.length === 0) headerText.push(emptyParagraph())
    const bandShading = { type: ShadingType.CLEAR, fill: PALETTE.ink, color: 'auto' }
    const bandPadY = pxToTwips(GEOMETRY.bandPaddingY)
    const bandCells: TableCell[] = [
      new TableCell({
        width: { size: textCellWidth, type: WidthType.DXA },
        margins: { top: bandPadY, bottom: bandPadY, left: marginX, right: photo ? 0 : marginX },
        borders: NO_CELL_BORDERS,
        shading: bandShading,
        verticalAlign: VerticalAlign.CENTER,
        children: headerText,
      }),
    ]
    if (photo) {
      bandCells.push(
        new TableCell({
          width: { size: photoCellWidth, type: WidthType.DXA },
          // The drawing's effect extent (see `roundPhoto`) adds the ring's width on
          // each side; the side margins give it up so the circle stays in place.
          margins: {
            top: bandPadY,
            bottom: bandPadY,
            left: pxToTwips(GEOMETRY.photoGap - GEOMETRY.photoRing),
            right: marginX - pxToTwips(GEOMETRY.photoRing),
          },
          borders: NO_CELL_BORDERS,
          shading: bandShading,
          verticalAlign: VerticalAlign.CENTER,
          // Single (auto) spacing: under the document's default exact line,
          // Word clips the inline drawing to one text line's height.
          children: [new Paragraph({ children: [photo.image], spacing: { before: 0, after: 0, line: AUTO_SINGLE_LINE, lineRule: LineRuleType.AUTO } })],
        }),
      )
    }
    children.push(
      new Table({
        // The band runs from paper edge to paper edge and meets the paper's top:
        // a floating table, the page's width, placed at the page's own origin.
        // Page margins are per section, so this is what lets every page keep its
        // top margin while page 1's band still starts at the paper's edge: the
        // body flows below the band (its bottom distance is the Preview's gap),
        // and a page the band is not on starts at the margin.
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
        columnWidths: photo ? [textCellWidth, photoCellWidth] : [textCellWidth],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [new TableRow({ cantSplit: true, children: bandCells })],
      }),
    )
  }

  // ----------------------------------------------------------
  // SECTIONS, in the template's fixed order
  // ----------------------------------------------------------

  /** A row of project cards: two bordered cells and the gap between them; an odd last card stays left. */
  const cardRow = (cards: [ReturnType<typeof swissItProject>, ReturnType<typeof swissItProject>]) => {
    const gap = pxToTwips(GEOMETRY.cardGap)
    const cardWidth = Math.round((contentWidth - gap) / 2)
    const widths = [cardWidth, gap, contentWidth - cardWidth - gap]
    const thin: IBorderOptions = { style: BorderStyle.SINGLE, size: pxToEighths(GEOMETRY.cardBorder), color: PALETTE.cardBorder }
    // The cell margins are the card's padding plus the border it sits inside,
    // so the text starts, and wraps, where the Preview's does.
    const insetY = pxToTwips(GEOMETRY.cardBorder + GEOMETRY.cardPaddingY)
    const insetX = pxToTwips(GEOMETRY.cardBorder + GEOMETRY.cardPaddingX)
    const cardCell = (project: ReturnType<typeof swissItProject>, width: number) => {
      if (!project) {
        return new TableCell({ width: { size: width, type: WidthType.DXA }, borders: NO_CELL_BORDERS, children: [emptyParagraph()] })
      }
      const content: Paragraph[] = []
      if (project.name) content.push(new Paragraph({ children: [run(project.name, PALETTE.ink, { bold: true })], spacing: { after: 0, ...bodyLine } }))
      if (project.description) content.push(...richParagraphs(project.description, PALETTE.body))
      if (project.url) content.push(textLine(swissItProjectLinkText(project.url, size.body), PALETTE.muted))
      if (project.technologies.length > 0) {
        content.push(tagParagraph(null, project.technologies, content.length > 0 ? pxToTwips(GEOMETRY.cardTagGap) : 0))
      }
      return new TableCell({
        width: { size: width, type: WidthType.DXA },
        margins: { top: insetY, bottom: insetY, left: insetX, right: insetX },
        borders: { top: thin, right: thin, bottom: thin, left: thin },
        verticalAlign: VerticalAlign.TOP,
        children: content,
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

  const sectionBlocks = (sectionId: SwissItSectionId, first: boolean): (Paragraph | Table)[] => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return []
        // Kept whole with its heading, as print keeps the section.
        return [heading(swissItHeading(swissHeading(dict, 'summary'), locale), first), ...richParagraphs(row.summary, PALETTE.body, 0, KEEP_LINES)]

      case 'skills': {
        if (skills.length === 0) return []
        const blocks: (Paragraph | Table)[] = [heading(swissItHeading(swissHeading(dict, 'skills'), locale), first)]
        skills.forEach((skill, index) => {
          const before = index === 0 ? 0 : pxToTwips(GEOMETRY.skillRowGap)
          const label = skill.category ? run(swissItSkillLabel(skill.category), PALETTE.ink, { bold: true }) : null
          if (skill.content.kind === 'tags') {
            // The label leads its tags on their line, as on the Preview.
            blocks.push(tagParagraph(label, skill.content.tags, before))
            return
          }
          // Rich text that is not a list of skills stands under its label; the
          // entry is kept whole, as print keeps it, but not the gap before it,
          // which rich text that draws nothing does not have.
          const paragraphs = richParagraphs(skill.content.html, PALETTE.body, 0, KEEP_LINES)
          if (label) blocks.push(new Paragraph({ children: [label], spacing: { before, after: 0, ...bodyLine }, ...KEEP_WITH_NEXT }))
          else if (before > 0 && paragraphs.length > 0) blocks.push(spacer(before))
          blocks.push(...paragraphs)
        })
        return blocks
      }

      case 'experience': {
        if (experiences.length === 0) return []
        const blocks: (Paragraph | Table)[] = [heading(swissItHeading(swissHeading(dict, 'experience'), locale), first)]
        experiences.forEach((exp, index) => {
          // The space between two entries: a spacer, since a built paragraph's spacing cannot be changed.
          if (index > 0) blocks.push(spacer(pxToTwips(GEOMETRY.entryGap)))
          // The entry is kept whole, as print keeps it.
          const hasDetails = exp.achievements.length > 0 || Boolean(exp.description)
          if (exp.lead || exp.dates) blocks.push(firstLine(exp.lead, exp.dates, contentWidth, exp.detail || hasDetails ? KEEP_WITH_NEXT : KEEP_LINES))
          if (exp.detail) blocks.push(textLine(exp.detail, PALETTE.muted, 0, hasDetails ? KEEP_WITH_NEXT : KEEP_LINES))
          if (exp.achievements.length > 0) {
            const indent = pxToTwips(GEOMETRY.bulletIndent)
            exp.achievements.forEach((achievement, i) => {
              blocks.push(
                new Paragraph({
                  children: [run('•\t', PALETTE.body), ...parseHtmlToDocxRuns(achievement, { size: size.body, color: PALETTE.body, font })],
                  indent: { left: indent, hanging: indent },
                  tabStops: [{ type: TabStopType.LEFT, position: indent }],
                  spacing: {
                    before: i === 0 ? pxToTwips(GEOMETRY.detailGap) : 0,
                    after: 0,
                    ...exactLineSpacing([formattedTextLineHeight(achievement, LINE_HEIGHT.text), line.body]),
                  },
                  ...keepAt(KEEP_LINES, i, exp.achievements.length),
                }),
              )
            })
          } else if (exp.description) {
            blocks.push(...richParagraphs(exp.description, PALETTE.body, pxToTwips(GEOMETRY.detailGap), KEEP_LINES))
          }
        })
        return blocks
      }

      case 'keyAchievements': {
        if (projects.length === 0) return []
        const blocks: (Paragraph | Table)[] = [heading(swissItHeading(swissHeading(dict, 'projects'), locale), first)]
        swissItCardRows(projects).forEach((cards, index) => {
          // The gap between two rows; it also keeps Word from merging the two tables.
          if (index > 0) blocks.push(spacer(pxToTwips(GEOMETRY.cardGap)))
          blocks.push(cardRow(cards))
        })
        return blocks
      }

      case 'education': {
        if (education.length === 0) return []
        const blocks: (Paragraph | Table)[] = [heading(swissItHeading(swissHeading(dict, 'education'), locale), first)]
        education.forEach((edu, index) => {
          if (index > 0) blocks.push(spacer(pxToTwips(GEOMETRY.entryGap)))
          // The entry is kept whole, as print keeps it.
          if (edu.lead || edu.dates) blocks.push(firstLine(edu.lead, edu.dates, contentWidth, edu.detail || edu.description ? KEEP_WITH_NEXT : KEEP_LINES))
          if (edu.detail) blocks.push(textLine(edu.detail, PALETTE.muted, 0, edu.description ? KEEP_WITH_NEXT : KEEP_LINES))
          if (edu.description) blocks.push(...richParagraphs(edu.description, PALETTE.body, pxToTwips(GEOMETRY.detailGap), KEEP_LINES))
        })
        return blocks
      }

      case 'languagesAndCertifications': {
        if (languages.length === 0 && certificates.length === 0) return []
        const label = swissItLastHeading(
          swissHeading(dict, 'languages'),
          swissHeading(dict, 'training'),
          languages.length > 0,
          certificates.length > 0,
          locale,
        )
        // Kept whole with its heading, as print keeps the section.
        const blocks: (Paragraph | Table)[] = [heading(label, first)]
        if (languages.length > 0) blocks.push(textLine(swissItLanguagesLine(languages), PALETTE.body, 0, certificates.length > 0 ? KEEP_WITH_NEXT : KEEP_LINES))
        if (certificates.length > 0) {
          blocks.push(textLine(swissItCertificationsLine(certificates), PALETTE.body, languages.length > 0 ? pxToTwips(GEOMETRY.lastRowGap) : 0, KEEP_LINES))
        }
        return blocks
      }
    }
  }

  let drawnSections = 0
  for (const sectionId of visibility.sections) {
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
            size: { width: pageWidthTwips, height: PAGE_HEIGHT_TWIPS, orientation: PageOrientation.PORTRAIT },
            // The printed Preview's page margins (`@page swiss-it`), so both
            // break their pages at the same place: every page's foot and every
            // page's top, page 1's band floating over the top margin to the
            // paper's edge.
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
        children: children.length === 0 || children[children.length - 1] instanceof Table ? [...children, emptyParagraph()] : children,
      },
    ],
  })

  let buffer = (await Packer.toBuffer(doc)) as Buffer

  // `docx` writes the photo as a rectangle with no outline or fill and has no
  // API for either, so its geometry is set to an ellipse — Word's own "crop to
  // shape" — with the Preview's green ring and fill, and the object-fit: cover
  // crop is written from `calculateCoverCropPercents` (`docx-photo.ts`).
  if (photo) {
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file('word/document.xml')
    if (!file) throw new Error('The generated swissIt document has no word/document.xml')
    const xml = await file.async('string')
    zip.file('word/document.xml', roundPhoto(xml, photo.crop, PALETTE.photoRing, PALETTE.photoFill))
    buffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
  }

  return pairInterFaces(buffer)
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
  if (!inline) throw new Error('swissIt photo: no inline drawing')
  let drawing = inline[0]

  const geometry = /<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="rect"\/>/
  if (!geometry.test(drawing)) throw new Error('swissIt photo: no rectangular picture geometry to round')
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
  if (!effectExtent.test(drawing)) throw new Error('swissIt photo: no effect extent to widen for the ring')
  drawing = drawing.replace(effectExtent, `<wp:effectExtent t="${ringEmu}" r="${ringEmu}" b="${ringEmu}" l="${ringEmu}"/>`)
  if (crop) {
    const srcRect = /<a:srcRect\/>|<a:srcRect><\/a:srcRect>/
    if (!srcRect.test(drawing)) throw new Error('swissIt photo: no source rectangle to crop')
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
