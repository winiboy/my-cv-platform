import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  HorizontalPositionAlign,
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
  UnderlineType,
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
import { PAGE_HEIGHT_TWIPS, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_TRADES_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import {
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHeading,
  swissHasText,
  swissLanguageLevel,
} from '@/lib/swiss-vocational-template'
import {
  SWISS_TRADES_GEOMETRY as GEOMETRY,
  SWISS_TRADES_SIZES as SIZES,
  swissTradesCertificateDetail,
  swissTradesContactHeading,
  swissTradesLanguageLine,
  swissTradesSections,
  swissTradesSkillContent,
  type SwissTradesMainSectionId,
  type SwissTradesSidebarSectionId,
} from '@/lib/swiss-trades-template'
import { visibleContactDetails } from '@/lib/contact-visibility'
import {
  APP_BODY_FONT,
  contactValueChildren,
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
  trackingSpacing,
  type DocxGeneratorSettings,
  type ParagraphKeep,
} from './docx-helpers'
import { interDocxFonts, pairInterFaces } from './docx-fonts'
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
const PALETTE = DOCX_PALETTE.swissTrades

/** The letter spacing the Preview's `tracking-widest` draws, in em. */
const TRACKING = PREVIEW_TRACKING.swissTrades

const LINE_HEIGHT = SWISS_TRADES_LINE_HEIGHT

/** DrawingML lengths are in EMU: 9525 to the CSS px. */
const EMU_PER_PX = 9525

/** Twips to the CSS px: a drawing's extent is given in px. */
const TWIPS_PER_PX = 15

/** A zero-width space (U+200B): a line-break opportunity that draws nothing. */
export const TAG_BREAK = '​'

/**
 * The tag paragraph's line, in 240ths of Word's single line: the single line
 * (about the glyph box Word shades, 1.2em) plus the Preview's gap between two
 * rows of tags, so wrapped rows no longer touch.
 */
const TAG_ROW_LINE = Math.round(240 * ((SIZES.tag * 1.2 + GEOMETRY.tagGap) / (SIZES.tag * 1.2)))

/** A border OOXML draws as nothing. */
const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
const NO_CELL_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const NO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 }

/**
 * Character spacing, in twentieths of a point, that widens one space of a run
 * at `halfPoints` to `px`. A space is about a quarter of its font size wide,
 * so the spacing adds the rest.
 */
const spaceWidening = (px: number, halfPoints: number) => Math.max(0, Math.round((px - (halfPoints / 1.5) * 0.25) * 0.75 * 20))

/** The paragraph a table cell or the end of the body needs, drawing no text. */
const emptyParagraph = () => new Paragraph({ children: [], spacing: { before: 0, after: 0, ...NO_TEXT_LINE } })

/** The space above the next block of a column, which depends on what was drawn before it. */
interface Flow {
  before: number
}

/**
 * Generate the Word export of the "Métiers techniques & manuels" template.
 *
 * The Preview (`swiss-trades-template.tsx`) is the contract: the same sections
 * in the same fixed order in the same column, the same visibility, headings,
 * dates, level names and skill tags, read from `@/lib/swiss-trades-template`
 * and `@/lib/swiss-vocational-template`.
 *
 * Layout in Word: every page has the printed Preview's top and foot margins
 * and no side margin; the body is one two-column table, its left cell shaded
 * the dark column's colour, and the column's fill is also a page-high raster
 * anchored to the page behind the text in the section's header, which Word
 * repeats on every page, so it runs from the paper's top edge to its foot. The photo is a drawing centred at the
 * top of the dark column; skill tags are shaded runs; each main heading's rule
 * is an underlined tab to the column's edge; dates sit at a right tab stop.
 */
export async function generateSwissTradesDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does (FR-4).
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields, photoBase64 } = settings
  const sections = swissTradesSections(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = APP_BODY_FONT

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads.
  const row = (resume ?? {}) as StoredResume
  const { contact, title, photoVisible } = visibleContactDetails(row, hiddenContactFields)
  const experiences = (row.experience || []).filter((exp) => exp.visible !== false)
  const education = (row.education || []).filter((edu) => edu.visible !== false)
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = (row.skills || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissTradesSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const certifications = (row.certifications || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const name = cert.name?.trim() ?? ''
    const detail = swissTradesCertificateDetail(cert.issuer, cert.date ? formatSwissMonth(cert.date) : '')
    return name || detail ? [{ name, detail }] : []
  })
  const languages = (row.languages || []).filter((lang) => lang.visible !== false && Boolean(lang.language?.trim()))

  // Run sizes in whole half-points; line pitches from the unrounded px.
  const size = {
    name: pxToHalfPoints(SIZES.name),
    title: pxToHalfPoints(SIZES.title),
    sidebarHeading: pxToHalfPoints(SIZES.sidebarHeading),
    sidebar: pxToHalfPoints(SIZES.sidebar),
    tag: pxToHalfPoints(SIZES.tag),
    skillCaption: pxToHalfPoints(SIZES.skillCaption),
    heading: pxToHalfPoints(SIZES.heading),
    body: pxToHalfPoints(SIZES.body),
    date: pxToHalfPoints(SIZES.date),
  }
  const line = {
    name: SIZES.name * 1.5,
    title: SIZES.title * 1.5,
    sidebarHeading: SIZES.sidebarHeading * 1.5,
    sidebar: SIZES.sidebar * 1.5,
    tag: SIZES.tag * 1.5,
    skillCaption: SIZES.skillCaption * 1.5,
    heading: SIZES.heading * 1.5,
    body: SIZES.body * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])
  const sidebarLine = exactLineSpacing([LINE_HEIGHT.text, line.sidebar])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const pageHeightTwips = PAGE_HEIGHT_TWIPS
  const sidebarWidth = pxToTwips(GEOMETRY.sidebarWidth)
  const mainWidth = pageWidthTwips - sidebarWidth
  const mainPaddingX = pxToTwips(GEOMETRY.mainPaddingX)
  const mainContentWidth = mainWidth - 2 * mainPaddingX
  const sidebarPaddingX = pxToTwips(GEOMETRY.sidebarPaddingX)

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
    options: { size: number; line: number; elementLineHeight: number; spacingBefore?: number; keep?: ParagraphKeep },
  ): Paragraph[] => {
    const runOptions = { size: options.size, color, font }
    const lineSpacing = exactLineSpacing([formattedTextLineHeight(text, options.elementLineHeight), options.line])
    const alignment = extractAlignment(text)
    const markerHang = pxToTwips(FORMATTED_LIST_MARKER_EM * (options.size / 1.5))
    const paragraphs = !rendersAsFormattedContent(text)
      ? parsePlainTextListToParagraphs(text, runOptions, { spacingAfterItem: 0, spacingAfterLast: 0, alignment, lineSpacing, keep: options.keep })
      : formattedBlocks(text).map(
          (block, index, blocks) =>
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
              ...keepAt(options.keep, index, blocks.length),
            }),
        )
    if (options.spacingBefore && paragraphs.length > 0) {
      // The Preview's top margin: a spacer, since a built paragraph's spacing cannot be changed.
      paragraphs.unshift(
        new Paragraph({ children: [], spacing: { before: 0, after: options.spacingBefore, ...NO_TEXT_LINE }, ...(options.keep ? KEEP_WITH_NEXT : {}) }),
      )
    }
    return paragraphs
  }

  // ----------------------------------------------------------
  // THE DARK COLUMN
  // ----------------------------------------------------------
  const sidebar: Paragraph[] = []
  const photo = photoVisible && photoBase64 ? photoRun(photoBase64) : null
  const contactEntries = swissContactEntries(contact, dict)

  /** The space above the next block of the dark column: none at its top, the photo's gap after the photo. */
  const sidebarFlow: Flow = { before: 0 }

  const sidebarHeading = (label: string) => {
    sidebar.push(
      new Paragraph({
        children: [
          new TextRun({
            text: label,
            font,
            size: size.sidebarHeading,
            bold: true,
            allCaps: true,
            color: PALETTE.sidebarHeading,
            characterSpacing: trackingSpacing(TRACKING.caps, size.sidebarHeading),
          }),
        ],
        spacing: {
          before: sidebarFlow.before,
          after: pxToTwips(GEOMETRY.sidebarHeadingGap),
          ...exactLineSpacing([LINE_HEIGHT.compact, line.sidebarHeading]),
        },
        keepNext: true,
      }),
    )
  }

  /**
   * The lines of a list in the dark column, the space between two lines its
   * row gap; kept whole with its heading, as print keeps each such section.
   */
  const sidebarLines = (lines: TextRun[][]) => {
    lines.forEach((runs, index) => {
      sidebar.push(
        new Paragraph({
          children: runs,
          spacing: { before: index === 0 ? 0 : pxToTwips(GEOMETRY.sidebarRowGap), after: 0, ...sidebarLine },
          ...keepAt(KEEP_LINES, index, lines.length),
        }),
      )
    })
  }

  if (photo) {
    // The paragraph is the photo's height, exactly: the photo floats in it,
    // centred, so the line reserves its room without clipping it.
    sidebar.push(
      new Paragraph({
        children: [photo.image],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: pxToTwips(GEOMETRY.photoHeight), lineRule: LineRuleType.EXACT },
      }),
    )
    sidebarFlow.before = pxToTwips(GEOMETRY.photoGap)
  }

  const markDrawn = () => {
    sidebarFlow.before = pxToTwips(GEOMETRY.sidebarSectionGap)
  }

  if (contactEntries.length > 0) {
    sidebarHeading(swissTradesContactHeading(dict))
    // The mockup draws the values without labels.
    // Each value held whole when it fits the column (`contactValueChildren`).
    const linePx = GEOMETRY.sidebarWidth - 2 * GEOMETRY.sidebarPaddingX
    sidebarLines(
      contactEntries.map((entry) => [
        new TextRun({ children: contactValueChildren(entry.value, linePx, size.sidebar, entry.key === 'email'), color: PALETTE.sidebarText, font, size: size.sidebar }),
      ]),
    )
    markDrawn()
  }

  const sidebarSection = (sectionId: SwissTradesSidebarSectionId) => {
    switch (sectionId) {
      case 'skills': {
        if (skills.length === 0) return
        sidebarHeading(swissHeading(dict, 'skills'))
        skills.forEach((skill, index) => {
          const before = index === 0 ? 0 : pxToTwips(GEOMETRY.skillCategoryGap)
          if (skill.category) {
            // The mockup draws no category; the stored category is content, so
            // it is drawn, small, above its own tags (FR-1).
            sidebar.push(
              new Paragraph({
                children: [run(skill.category, PALETTE.sidebarText, { bold: true, size: size.skillCaption })],
                spacing: {
                  before,
                  after: pxToTwips(GEOMETRY.skillCaptionGap),
                  ...exactLineSpacing([LINE_HEIGHT.compact, line.skillCaption]),
                },
                ...KEEP_WITH_NEXT,
              }),
            )
          }
          // The entry is kept whole, as print keeps it.
          const contentBefore = skill.category ? 0 : before
          if (skill.content.kind === 'tags') {
            const runs: TextRun[] = []
            skill.content.tags.forEach((tag, tagIndex) => {
              if (tagIndex > 0) {
                // The gap, then a zero-width space: the explicit break
                // opportunity between two tags. Word does not reliably break
                // between a space and the no-break space a tag opens with, so
                // without it a whole row of tags was one unbreakable word and
                // Word split a tag mid-word at the column's edge.
                runs.push(
                  new TextRun({ text: ' ', font, size: size.tag, characterSpacing: spaceWidening(GEOMETRY.tagGap, size.tag) }),
                  new TextRun({ text: TAG_BREAK, font, size: size.tag }),
                )
              }
              // No-break spaces pad the tag and hold its words together, so a
              // tag that does not fit moves to the next line whole.
              runs.push(
                new TextRun({
                  text: ` ${tag.replace(/ /g, ' ')} `,
                  font,
                  size: size.tag,
                  color: PALETTE.sidebarText,
                  shading: { type: ShadingType.CLEAR, fill: PALETTE.tag, color: 'auto' },
                }),
              )
            })
            sidebar.push(
              new Paragraph({
                children: runs,
                alignment: AlignmentType.LEFT,
                // Auto (multiple) spacing: under an exact line Word shades a run
                // the full height of its line, so wrapped rows of tags touched.
                // Under auto spacing a run's shading is its glyph box, and the
                // multiple adds the Preview's gap between two rows below it.
                spacing: { before: contentBefore, after: 0, line: TAG_ROW_LINE, lineRule: LineRuleType.AUTO },
                ...KEEP_LINES,
              }),
            )
          } else {
            // The gap before the entry is not part of it, so a page may break
            // there; rich text that draws nothing has no gap.
            const paragraphs = richParagraphs(skill.content.html, PALETTE.sidebarText, {
              size: size.sidebar,
              line: line.sidebar,
              elementLineHeight: LINE_HEIGHT.text,
              keep: KEEP_LINES,
            })
            if (contentBefore > 0 && paragraphs.length > 0) {
              sidebar.push(new Paragraph({ children: [], spacing: { before: 0, after: contentBefore, ...NO_TEXT_LINE } }))
            }
            sidebar.push(...paragraphs)
          }
        })
        markDrawn()
        return
      }

      case 'training': {
        if (certifications.length === 0) return
        sidebarHeading(swissHeading(dict, 'training'))
        sidebarLines(
          certifications.map(({ name, detail }) => {
            const runs: TextRun[] = []
            if (name) runs.push(run(name, PALETTE.sidebarText, { bold: true, size: size.sidebar }))
            if (detail) runs.push(run(name ? ` · ${detail}` : detail, PALETTE.sidebarText, { size: size.sidebar }))
            return runs
          }),
        )
        markDrawn()
        return
      }

      case 'languages': {
        if (languages.length === 0) return
        sidebarHeading(swissHeading(dict, 'languages'))
        sidebarLines(
          languages.map((lang) => [
            run(swissTradesLanguageLine(lang.language, swissLanguageLevel(dict, lang.level)), PALETTE.sidebarText, { size: size.sidebar }),
          ]),
        )
        markDrawn()
        return
      }
    }
  }
  for (const sectionId of sections.sidebar) sidebarSection(sectionId)
  if (sidebar.length === 0) sidebar.push(emptyParagraph())

  // ----------------------------------------------------------
  // THE MAIN COLUMN
  // ----------------------------------------------------------
  const main: Paragraph[] = []
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
        children: [
          new TextRun({
            text: title,
            font,
            size: size.title,
            bold: true,
            allCaps: true,
            color: PALETTE.accent,
            characterSpacing: trackingSpacing(TRACKING.caps, size.title),
          }),
        ],
        spacing: {
          before: contact.name ? pxToTwips(GEOMETRY.nameGap) : 0,
          after: 0,
          ...exactLineSpacing([LINE_HEIGHT.compact, line.title]),
        },
      }),
    )
  }
  if (main.length > 0) mainFlow.before = pxToTwips(GEOMETRY.titleGap)

  /**
   * A main heading: dark spaced capitals, then the light-orange rule to the
   * column's edge, drawn as an underlined tab to a right tab stop there. The
   * gap before the rule is a widened, unlined space.
   */
  const heading = (label: string) => {
    main.push(
      new Paragraph({
        children: [
          new TextRun({
            text: label,
            font,
            size: size.heading,
            bold: true,
            allCaps: true,
            color: PALETTE.ink,
            characterSpacing: trackingSpacing(TRACKING.caps, size.heading),
          }),
          new TextRun({ text: ' ', font, size: size.heading, characterSpacing: spaceWidening(GEOMETRY.headingRuleGap, size.heading) }),
          new TextRun({ children: [new Tab()], font, size: size.heading, underline: { type: UnderlineType.THICK, color: PALETTE.rule } }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: mainContentWidth }],
        spacing: {
          before: mainFlow.before,
          after: pxToTwips(GEOMETRY.headingGap),
          ...exactLineSpacing([LINE_HEIGHT.compact, line.heading]),
        },
        keepNext: true,
      }),
    )
  }

  /**
   * One entry: its first line, bold, with the dates at a right tab stop — the
   * title, or the company or school when there is no title, as the Preview
   * draws it — then the meta line under a title, then its details. A value
   * that is not stored leaves no line (FR-2). The entry is kept whole, as
   * print keeps it: its details carry their own keep rules (`keepAt`).
   */
  const entry = (index: number, titleText: string, meta: string, dates: string, details: Paragraph[]) => {
    const paragraphs: Paragraph[] = []
    const firstIsTitle = titleText !== ''
    const first = firstIsTitle ? titleText : meta
    const hasMeta = firstIsTitle && meta !== ''
    if (first || dates) {
      const runs: TextRun[] = []
      if (first) runs.push(run(first, PALETTE.ink, { bold: true }))
      if (dates) {
        runs.push(new TextRun({ children: [new Tab()], font, size: size.date }), run(dates, PALETTE.accent, { size: size.date }))
      }
      paragraphs.push(
        new Paragraph({
          children: runs,
          tabStops: [{ type: TabStopType.RIGHT, position: mainContentWidth }],
          spacing: { after: 0, ...bodyLine },
          ...(hasMeta || details.length > 0 ? KEEP_WITH_NEXT : KEEP_LINES),
        }),
      )
    }
    if (hasMeta) {
      paragraphs.push(new Paragraph({ children: [run(meta, PALETTE.muted)], spacing: { after: 0, ...bodyLine }, ...(details.length > 0 ? KEEP_WITH_NEXT : KEEP_LINES) }))
    }
    paragraphs.push(...details)
    if (index > 0 && paragraphs.length > 0) {
      // The space between two entries: a spacer, since a built paragraph's spacing cannot be changed.
      paragraphs.unshift(new Paragraph({ children: [], spacing: { before: 0, after: pxToTwips(GEOMETRY.entryGap), ...NO_TEXT_LINE } }))
    }
    main.push(...paragraphs)
  }

  const mainSection = (sectionId: SwissTradesMainSectionId): boolean => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return false
        heading(swissHeading(dict, 'summary'))
        // Kept whole with its heading, as print keeps the section.
        main.push(...richParagraphs(row.summary, PALETTE.body, { size: size.body, line: line.body, elementLineHeight: LINE_HEIGHT.text, keep: KEEP_LINES }))
        return true

      case 'experience':
        if (experiences.length === 0) return false
        heading(swissHeading(dict, 'experience'))
        experiences.forEach((exp, index) => {
          const details: Paragraph[] = []
          const achievements = (exp.achievements ?? []).filter(swissHasText)
          if (achievements.length > 0) {
            const indent = pxToTwips(GEOMETRY.bulletIndent)
            achievements.forEach((achievement, i) => {
              details.push(
                new Paragraph({
                  children: [
                    run('•\t', PALETTE.body),
                    ...parseHtmlToDocxRuns(achievement, { size: size.body, color: PALETTE.body, font }),
                  ],
                  indent: { left: indent, hanging: indent },
                  tabStops: [{ type: TabStopType.LEFT, position: indent }],
                  spacing: {
                    before: i === 0 ? pxToTwips(GEOMETRY.detailGap) : 0,
                    after: 0,
                    ...exactLineSpacing([formattedTextLineHeight(achievement, LINE_HEIGHT.text), line.body]),
                  },
                  ...keepAt(KEEP_LINES, i, achievements.length),
                }),
              )
            })
          } else if (swissHasText(exp.description)) {
            details.push(
              ...richParagraphs(exp.description, PALETTE.body, {
                size: size.body,
                line: line.body,
                elementLineHeight: LINE_HEIGHT.text,
                spacingBefore: pxToTwips(GEOMETRY.detailGap),
                keep: KEEP_LINES,
              }),
            )
          }
          entry(
            index,
            exp.position?.trim() ?? '',
            [exp.company?.trim(), exp.location?.trim()].filter(Boolean).join(', '),
            formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict),
            details,
          )
        })
        return true

      case 'education':
        if (education.length === 0) return false
        heading(swissHeading(dict, 'education'))
        education.forEach((edu, index) => {
          entry(
            index,
            edu.degree?.trim() ?? '',
            [edu.school?.trim(), edu.field?.trim()].filter(Boolean).join(', '),
            formatSwissDateRange(edu.startDate, edu.endDate, false, dict),
            swissHasText(edu.description)
              ? richParagraphs(edu.description, PALETTE.body, {
                  size: size.body,
                  line: line.body,
                  elementLineHeight: LINE_HEIGHT.text,
                  spacingBefore: pxToTwips(GEOMETRY.detailGap),
                  keep: KEEP_LINES,
                })
              : [],
          )
        })
        return true
    }
  }
  for (const sectionId of sections.main) {
    if (mainSection(sectionId)) mainFlow.before = pxToTwips(GEOMETRY.sectionGap)
  }
  if (main.length === 0) main.push(emptyParagraph())

  // ----------------------------------------------------------
  // ASSEMBLE
  // ----------------------------------------------------------

  /**
   * The dark column's fill on every page, from the paper's top edge to its
   * foot, its top and foot margins included: a page-high drawing anchored to
   * the page's own origin behind the text. It sits in the section's header,
   * which Word repeats on every page, as `docx-swiss-first-job.ts` draws its
   * sidebar: a cell's fill ends where the row's part on a page ends, and a
   * drawing anchored in a table cell is placed from that cell, which no longer
   * starts at the paper's edge once the page has a top margin.
   */
  const sidebarFill = new ImageRun({
    type: 'png',
    data: solidColourPng(PALETTE.sidebar),
    transformation: { width: GEOMETRY.sidebarWidth, height: pageHeightTwips / TWIPS_PER_PX },
    // A distinct id keeps the two drawings' wp:docPr ids unique.
    altText: { name: '', description: '', title: '', id: '2' },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
      wrap: { type: TextWrappingType.NONE },
      behindDocument: true,
      allowOverlap: true,
      layoutInCell: false,
    },
  })

  const body = new Table({
    width: { size: pageWidthTwips, type: WidthType.DXA },
    columnWidths: [sidebarWidth, mainWidth],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    margins: NO_MARGINS,
    rows: [
      new TableRow({
        cantSplit: false,
        children: [
          new TableCell({
            width: { size: sidebarWidth, type: WidthType.DXA },
            // Its top and foot are the page's margins, as in the printed
            // Preview, where the columns' own padding gives way to them.
            margins: { top: 0, bottom: 0, left: sidebarPaddingX, right: sidebarPaddingX },
            borders: NO_CELL_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: PALETTE.sidebar, color: 'auto' },
            verticalAlign: VerticalAlign.TOP,
            children: sidebar,
          }),
          new TableCell({
            width: { size: mainWidth, type: WidthType.DXA },
            margins: { top: 0, bottom: 0, left: mainPaddingX, right: mainPaddingX },
            borders: NO_CELL_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            children: main,
          }),
        ],
      }),
    ],
  })

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
            // The printed Preview's top and foot margins (its document's
            // padding, repeated on every printed page), so both break their
            // pages at the same place; no side margin, so the dark column
            // meets the paper's left edge.
            margin: { top: pxToTwips(GEOMETRY.pageTop), right: 0, bottom: pxToTwips(GEOMETRY.pageBottom), left: 0, header: 0, footer: 0 },
          },
        },
        headers: { default: new Header({ children: [new Paragraph({ children: [sidebarFill], spacing: NO_TEXT_LINE })] }) },
        // OOXML ends a body with a paragraph; after a table it carries no line.
        children: [body, emptyParagraph()],
      },
    ],
  })

  let buffer = (await Packer.toBuffer(doc)) as Buffer

  // `docx` writes the photo with no outline and has no srcRect API: its thin
  // border and its object-fit: cover crop are written into its drawing.
  if (photo) {
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file('word/document.xml')
    if (!file) throw new Error('The generated swissTrades document has no word/document.xml')
    const xml = await file.async('string')
    zip.file('word/document.xml', framePhoto(xml, photo.crop, PALETTE.muted))
    buffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
  }

  return pairInterFaces(buffer)
}

/**
 * The photo's drawing — the one anchored in its cell, not the column fill,
 * which is anchored to the page — outlined in `borderHex` at the Preview's
 * border width and cropped to cover its frame.
 *
 * @throws when the drawing is not in the shape `docx` writes it, rather than
 * shipping a photo without the frame the Preview draws.
 */
export function framePhoto(xml: string, crop: { l: number; t: number; r: number; b: number } | null, borderHex: string): string {
  const anchor = /<wp:anchor\b[^>]*\slayoutInCell="1"[\s\S]*?<\/wp:anchor>/.exec(xml)
  if (!anchor) throw new Error('swissTrades photo: no drawing laid out in its cell')
  let drawing = anchor[0]

  const geometry = /<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="rect"\/>/
  if (!geometry.test(drawing)) throw new Error('swissTrades photo: no rectangular picture geometry to outline')
  const borderEmu = GEOMETRY.photoBorder * EMU_PER_PX
  drawing = drawing.replace(
    geometry,
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="${borderEmu}"><a:solidFill><a:srgbClr val="${borderHex}"/></a:solidFill></a:ln>`,
  )
  // The outline is stroked on the picture's edge, so half of it falls outside
  // the extent; the effect extent reserves that room, so Word does not clip it.
  const effectExtent = /<wp:effectExtent t="0" r="0" b="0" l="0"\/>/
  if (!effectExtent.test(drawing)) throw new Error('swissTrades photo: no effect extent to widen for the border')
  drawing = drawing.replace(effectExtent, `<wp:effectExtent t="${borderEmu}" r="${borderEmu}" b="${borderEmu}" l="${borderEmu}"/>`)
  if (crop) {
    const srcRect = /<a:srcRect\/>|<a:srcRect><\/a:srcRect>/
    if (!srcRect.test(drawing)) throw new Error('swissTrades photo: no source rectangle to crop')
    drawing = drawing.replace(srcRect, `<a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/>`)
  }
  return xml.slice(0, anchor.index) + drawing + xml.slice(anchor.index + anchor[0].length)
}

/**
 * The photo as a drawing that fills the Preview's portrait frame with
 * `object-fit: cover`, upright per its EXIF orientation, centred in the dark
 * column, or null when the data is not an image this route can embed — in
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
    // crop is centred, so the mapping is the one `EXIF_PHOTO_TRANSFORMS` (`docx-photo.ts`) documents.
    const stored = swapsAxes
      ? { l: displayedCrop.t, r: displayedCrop.b, t: displayedCrop.l, b: displayedCrop.r }
      : displayedCrop
    crop = stored.l === 0 && stored.t === 0 && stored.r === 0 && stored.b === 0 ? null : stored
  }

  // A picture turned 90° is laid out unrotated and turned about its centre:
  // centring keeps it centred across, and it is moved down by half the
  // difference to land its turned box on the frame.
  const pictureWidth = swapsAxes ? boxHeight : boxWidth
  const pictureHeight = swapsAxes ? boxWidth : boxHeight
  const offsetTop = swapsAxes ? Math.round(((boxHeight - boxWidth) / 2) * EMU_PER_PX) : 0

  const image = new ImageRun({
    type: imageType,
    data,
    transformation: { width: pictureWidth, height: pictureHeight, ...transform?.picture },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, align: HorizontalPositionAlign.CENTER },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: offsetTop },
      wrap: { type: TextWrappingType.NONE },
      behindDocument: false,
      layoutInCell: true,
      allowOverlap: false,
    },
  })
  return { image, crop }
}
