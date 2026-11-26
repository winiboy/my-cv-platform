import { getTranslations, type Locale } from '@/lib/i18n'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
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
import { PAGE_HEIGHT_TWIPS, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { SWISS_FIRST_JOB_LINE_HEIGHT, formattedTextLineHeight, rendersAsFormattedContent } from '@/lib/resume-line-height'
import { formatSwissMonth, swissHeading, swissHasText } from '@/lib/swiss-vocational-template'
import { swissTradesContactHeading } from '@/lib/swiss-trades-template'
import { swissEngineeringSkillContent } from '@/lib/swiss-engineering-template'
import { swissItDates, swissItEntryLines, swissItUnbreakable } from '@/lib/swiss-it-template'
import { swissAcademicDate } from '@/lib/swiss-academic-template'
import {
  SWISS_FIRST_JOB_CHECK,
  SWISS_FIRST_JOB_GEOMETRY as GEOMETRY,
  SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH,
  SWISS_FIRST_JOB_SIZES as SIZES,
  swissFirstJobCertificate,
  swissFirstJobContactLines,
  swissFirstJobEmailFit,
  swissFirstJobLanguageDots,
  swissFirstJobSections,
  type SwissFirstJobMainSectionId,
  type SwissFirstJobSidebarSectionId,
} from '@/lib/swiss-first-job-template'
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
  trackingSpacing,
  type DocxGeneratorSettings,
  type ParagraphKeep,
} from './docx-helpers'
import { interDocxFonts, pairInterFaces } from './docx-fonts'
import { DOCX_PALETTE } from './docx-palette'
import { FORMATTED_LIST_INDENT_PX, FORMATTED_LIST_MARKER_EM, bareInlineFormatTags, formattedBlocks } from './docx-preview-metrics'
import { solidColourPng } from './docx-disc'
import { swissExecutiveLinkChildren } from './docx-swiss-executive'
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

/** Every run, fill and border, in the colour the Preview draws it with. */
const PALETTE = DOCX_PALETTE.swissFirstJob

/** The letter spacing the Preview's `tracking-widest` draws on the sidebar's headings, in em. */
const TRACKING = PREVIEW_TRACKING.swissFirstJob

const LINE_HEIGHT = SWISS_FIRST_JOB_LINE_HEIGHT

/** Word's single line spacing, in 240ths of a line. */
const AUTO_SINGLE_LINE = 240

/** DrawingML lengths are in EMU: 9525 to the CSS px. */
const EMU_PER_PX = 9525

/** Twips to the CSS px: a drawing's extent is given in px. */
const TWIPS_PER_PX = 15

/**
 * A main heading's filled circle, as Word draws it: the large circle glyph
 * (U+2B24) in the violet, a tab away from the heading text. Decoration: the
 * Preview draws it as an empty round box.
 */
export const SWISS_FIRST_JOB_HEADING_CIRCLE = '⬤'

/**
 * A language's dot, as Word draws it: the black circle (U+25CF) for every dot,
 * filled and empty alike, so all five are the same size, in Arial, which has
 * the glyph on Windows and macOS (Inter may not be installed, and a fallback
 * font drew "●" and "○" at different sizes). Arial's metrics, in em, read
 * from its `glyf` and `hmtx` tables: the circle's ink is 0.430 wide with a
 * 0.087 side bearing; a no-break space advances 0.278.
 */
export const SWISS_FIRST_JOB_DOT_GLYPH = '●'
const DOT_GLYPH = SWISS_FIRST_JOB_DOT_GLYPH
const DOT_FONT = 'Arial'
const DOT_INK_EM = 0.43
const DOT_BEARING_EM = 0.087
const DOT_SPACE_EM = 0.278

/** A border OOXML draws as nothing. */
const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
const NO_CELL_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const NO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 }

/** The paragraph a table cell or the end of the body needs, drawing no text. */
const emptyParagraph = () => new Paragraph({ children: [], spacing: { before: 0, after: 0, ...NO_TEXT_LINE } })

/** A paragraph drawing no text that carries a vertical gap of `twips`. */
const spacer = (twips: number, keep?: ParagraphKeep) => new Paragraph({ children: [], spacing: { before: 0, after: twips, ...NO_TEXT_LINE }, ...keep })

/**
 * Generate the Word export of the "Premier emploi" template.
 *
 * The Preview (`swiss-first-job-template.tsx`) is the contract: the same
 * sections in the same fixed order in the same column, the same visibility,
 * headings, dates, level dots and lines, read from
 * `@/lib/swiss-first-job-template` and the shared Swiss helpers.
 *
 * Layout in Word: every page has the printed Preview's top and foot margins
 * and no side margin; the body is one two-column table — the sidebar, then the
 * main column — with no shading. The sidebar's violet is a page-high raster
 * anchored to the page behind the text in the section's header, which Word
 * repeats on every page, so it runs from the paper's top edge to its foot,
 * margins included, as the printed Preview's root background does. The photo
 * is a round inline drawing centred at the top of the sidebar; a language's
 * level is written as dot glyphs; dates are no-break text.
 */
export async function generateSwissFirstJobDocx(resume: unknown, settings: DocxGeneratorSettings): Promise<Buffer> {
  // `fontFamily` and `fontScale` are deliberately not read: the template draws
  // its own typeface at its own sizes in every output, as its Preview does (FR-4).
  const { locale: localeRaw, hiddenMainSections, hiddenSidebarSections, hiddenContactFields, photoBase64 } = settings
  const sections = swissFirstJobSections(hiddenMainSections, hiddenSidebarSections)
  const locale = localeRaw as Locale
  const dict = getTranslations(locale, 'common')
  const font = APP_BODY_FONT

  // The route hands every generator the selected `resumes` row as it came from
  // the database; these are the columns this template reads. An entry that
  // stores nothing the template draws is not an entry (FR-2), as on the Preview.
  const row = (resume ?? {}) as StoredResume
  const { contact, title, photoVisible } = visibleContactDetails(row, hiddenContactFields)
  const experiences = (row.experience || []).flatMap((exp) => {
    if (exp.visible === false) return []
    const lines = swissItEntryLines(exp.position, [exp.company, exp.location])
    const dates = swissAcademicDate(swissItDates(exp.startDate, exp.endDate, exp.current, dict))
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return lines.lead || dates || achievements.length > 0 || description ? [{ ...lines, dates, achievements, description }] : []
  })
  const education = (row.education || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const lines = swissItEntryLines(edu.degree, [edu.school, edu.field])
    const dates = swissAcademicDate(swissItDates(edu.startDate, edu.endDate, false, dict))
    const description = swissHasText(edu.description) ? edu.description : null
    return lines.lead || dates || description ? [{ ...lines, dates, description }] : []
  })
  const skills = (row.skills || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissEngineeringSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const languages = (row.languages || []).filter((lang) => lang.visible !== false && Boolean(lang.language?.trim()))
  const certificates = (row.certifications || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const line = swissFirstJobCertificate(cert.name, cert.issuer, cert.date ? swissAcademicDate(formatSwissMonth(cert.date)) : '')
    return line ? [line] : []
  })

  // Run sizes in whole half-points; line pitches from the unrounded px.
  const size = {
    name: pxToHalfPoints(SIZES.name),
    title: pxToHalfPoints(SIZES.title),
    heading: pxToHalfPoints(SIZES.heading),
    circle: pxToHalfPoints(GEOMETRY.headingCircle),
    body: pxToHalfPoints(SIZES.body),
    date: pxToHalfPoints(SIZES.date),
    sidebarHeading: pxToHalfPoints(SIZES.sidebarHeading),
    sidebar: pxToHalfPoints(SIZES.sidebar),
    dot: Math.round((GEOMETRY.dot / DOT_INK_EM) * 1.5),
  }
  // A language's dots: the glyph's size whose ink is a dot's diameter, then
  // the letter spacing that leaves the Preview's gaps between two dots' ink and
  // between the name and the first dot (a no-break space's advance, plus the
  // first dot's leading bearing).
  const dotPx = size.dot / 1.5
  const dotSpacing = pxToTwips(GEOMETRY.dotsGap - 2 * DOT_BEARING_EM * dotPx)
  const dotLeadSpacing = pxToTwips(GEOMETRY.dotsLead - (DOT_SPACE_EM + DOT_BEARING_EM) * dotPx)
  const line = {
    name: SIZES.name * 1.5,
    title: SIZES.title * 1.5,
    heading: SIZES.heading * 1.5,
    body: SIZES.body * 1.5,
    sidebarHeading: SIZES.sidebarHeading * 1.5,
    sidebar: SIZES.sidebar * 1.5,
  }
  const bodyLine = exactLineSpacing([LINE_HEIGHT.text, line.body])
  const sidebarLine = exactLineSpacing([LINE_HEIGHT.text, line.sidebar])

  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const sidebarWidth = pxToTwips(GEOMETRY.sidebarWidth)
  const mainWidth = pageWidthTwips - sidebarWidth
  /** A list marker's hang: its measured width before the text, as the Preview's list draws it. */
  const markerHang = pxToTwips(FORMATTED_LIST_MARKER_EM * (size.body / 1.5))
  const listIndent = pxToTwips(FORMATTED_LIST_INDENT_PX)

  const run = (text: string, color: string, options: { bold?: boolean; size?: number } = {}) =>
    new TextRun({ text, color, font, size: options.size ?? size.body, bold: options.bold })

  /**
   * Rich text (summary, descriptions, `skillsHtml`) as the Preview's
   * `renderFormattedText` draws it, as `docx-swiss-engineering.ts` draws it:
   * HTML as one paragraph per block the browser draws (`formattedBlocks`), a
   * list item's marker hanging by its measured width with a tab stop at the
   * text; plain text by `formatText`'s rules.
   */
  const richParagraphs = (
    text: string,
    color: string,
    options: { size: number; line: number; spacingBefore?: number; keep?: ParagraphKeep },
  ): Paragraph[] => {
    const runOptions = { size: options.size, color, font }
    const lineSpacing = exactLineSpacing([formattedTextLineHeight(text, LINE_HEIGHT.text), options.line])
    const alignment = extractAlignment(text)
    const hang = pxToTwips(FORMATTED_LIST_MARKER_EM * (options.size / 1.5))
    const paragraphs = !rendersAsFormattedContent(text)
      ? parsePlainTextListToParagraphs(text, runOptions, { spacingAfterItem: 0, spacingAfterLast: 0, alignment, lineSpacing, keep: options.keep })
      : formattedBlocks(text).map((block, index, blocks) => {
          const left = pxToTwips(FORMATTED_LIST_INDENT_PX * block.depth)
          return new Paragraph({
            children: [
              ...(block.marker === null ? [] : [new TextRun({ ...runOptions, text: `${block.marker}\t` })]),
              ...parseHtmlToDocxRuns(bareInlineFormatTags(block.html), runOptions),
            ],
            alignment: block.alignment ?? alignment,
            indent: block.depth === 0 ? undefined : { left, hanging: block.marker === null ? 0 : hang },
            ...(block.marker === null ? {} : { tabStops: [{ type: TabStopType.LEFT, position: left }] }),
            spacing: { after: 0, ...lineSpacing },
            ...keepAt(options.keep, index, blocks.length),
          })
        })
    if (options.spacingBefore && paragraphs.length > 0) paragraphs.unshift(spacer(options.spacingBefore, options.keep ? KEEP_WITH_NEXT : undefined))
    return paragraphs
  }

  // ----------------------------------------------------------
  // THE SIDEBAR
  // ----------------------------------------------------------
  const sidebar: Paragraph[] = []
  const photo = photoVisible && photoBase64 ? photoRun(photoBase64) : null
  let sidebarBefore = 0

  /** A sidebar heading: violet bold spaced capitals, kept with what follows. */
  const sidebarHeading = (label: string) =>
    sidebar.push(
      new Paragraph({
        children: [
          new TextRun({
            text: label,
            font,
            size: size.sidebarHeading,
            bold: true,
            allCaps: true,
            color: PALETTE.accent,
            characterSpacing: trackingSpacing(TRACKING.caps, size.sidebarHeading),
          }),
        ],
        spacing: { before: sidebarBefore, after: pxToTwips(GEOMETRY.sidebarHeadingGap), ...exactLineSpacing([LINE_HEIGHT.compact, line.sidebarHeading]) },
        keepNext: true,
      }),
    )

  /** A line of the sidebar, the space above it its row gap after the first. */
  const sidebarParagraph = (children: TextRun[], first: boolean, extra: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) =>
    new Paragraph({ children, spacing: { before: first ? 0 : pxToTwips(GEOMETRY.sidebarRowGap), after: 0, ...sidebarLine }, ...extra })

  const markDrawn = () => {
    sidebarBefore = pxToTwips(GEOMETRY.sidebarSectionGap)
  }

  if (photo) {
    // Single (auto) spacing: under the document's default exact line, Word
    // clips an inline drawing to one text line's height.
    sidebar.push(
      new Paragraph({
        children: [photo.image],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: AUTO_SINGLE_LINE, lineRule: LineRuleType.AUTO },
      }),
    )
    sidebarBefore = pxToTwips(GEOMETRY.photoGap)
  }

  const contactLines = swissFirstJobContactLines(contact)
  /** Whether the email is too wide even at 7pt, so its run is marked for `fitEmail`. */
  let fitsEmail = false
  if (contactLines.length > 0) {
    sidebarHeading(swissTradesContactHeading(dict))
    // One value per line, held together — no-break spaces, non-breaking
    // hyphens — unless wider than the sidebar on its own, which then wraps at
    // its link boundaries (`swissExecutiveLinkChildren`). The email is the
    // stored address as plain text, never altered, at the size that fits it
    // on one line (`swissFirstJobEmailFit`), as the Preview draws it. One too
    // wide even at the smallest size is still written as stored, at that
    // size, and marked for `fitEmail` to give it `w:fitText`: Word then
    // compresses it onto one line of the sidebar without changing its text
    // (the Preview wraps it at its boundaries instead, a recorded difference).
    contactLines.forEach(({ key, value }, index) => {
      const email = key === 'email' ? swissFirstJobEmailFit(value) : null
      if (email && email.parts.length > 1) fitsEmail = true
      sidebar.push(
        sidebarParagraph(
          [
            new TextRun({
              children: email ? [value] : swissExecutiveLinkChildren(swissItUnbreakable(value), SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH, size.sidebar),
              color: PALETTE.body,
              font,
              size: email ? email.halfPoints : size.sidebar,
              ...(email && email.parts.length > 1 ? { style: FIT_EMAIL_MARKER } : {}),
            }),
          ],
          index === 0,
          // Kept whole with its heading, as print keeps the section.
          keepAt(KEEP_LINES, index, contactLines.length),
        ),
      )
    })
    markDrawn()
  }

  const sidebarSection = (sectionId: SwissFirstJobSidebarSectionId) => {
    switch (sectionId) {
      case 'skills': {
        if (skills.length === 0) return
        sidebarHeading(swissHeading(dict, 'skills'))
        skills.forEach((skill, index) => {
          const before = index === 0 ? 0 : pxToTwips(GEOMETRY.skillCategoryGap)
          // The mockup draws no category; the stored category is content, so it
          // is drawn as a caption above its skills (FR-1).
          if (skill.category) {
            sidebar.push(
              new Paragraph({
                children: [run(skill.category, PALETTE.ink, { bold: true, size: size.sidebar })],
                spacing: { before, after: pxToTwips(GEOMETRY.skillCaptionGap), ...sidebarLine },
                ...KEEP_WITH_NEXT,
              }),
            )
          }
          // The entry is kept whole, as print keeps it.
          const contentBefore = skill.category ? 0 : before
          if (skill.content.kind === 'lines') {
            const indent = pxToTwips(GEOMETRY.checkIndent)
            skill.content.lines.forEach((text, i, lines) => {
              sidebar.push(
                new Paragraph({
                  children: [run(`${SWISS_FIRST_JOB_CHECK}\t`, PALETTE.body, { size: size.sidebar }), run(text, PALETTE.body, { size: size.sidebar })],
                  indent: { left: indent, hanging: indent },
                  tabStops: [{ type: TabStopType.LEFT, position: indent }],
                  spacing: { before: i === 0 ? contentBefore : pxToTwips(GEOMETRY.sidebarRowGap), after: 0, ...sidebarLine },
                  ...keepAt(KEEP_LINES, i, lines.length),
                }),
              )
            })
          } else {
            // The gap before the entry is not part of it, so a page may break
            // there; rich text that draws nothing has no gap.
            const paragraphs = richParagraphs(skill.content.html, PALETTE.body, { size: size.sidebar, line: line.sidebar, keep: KEEP_LINES })
            if (contentBefore > 0 && paragraphs.length > 0) sidebar.push(spacer(contentBefore))
            sidebar.push(...paragraphs)
          }
        })
        markDrawn()
        return
      }

      case 'languages': {
        if (languages.length === 0) return
        sidebarHeading(swissHeading(dict, 'languages'))
        languages.forEach((lang, index) => {
          // The level as five equal dots, one glyph in one font, filled in
          // violet and empty in light violet after a no-break space: the level
          // is told by colour only here (the Preview names it in words).
          const dots = swissFirstJobLanguageDots(lang.level)
          const dotRun = (text: string, color: string, characterSpacing: number) =>
            new TextRun({ text, font: DOT_FONT, size: size.dot, color, characterSpacing })
          const runs = [run(lang.language.trim(), PALETTE.body, { size: size.sidebar }), dotRun('\u00A0', PALETTE.body, dotLeadSpacing)]
          if (dots.filled) runs.push(dotRun(DOT_GLYPH.repeat(dots.filled), PALETTE.mark, dotSpacing))
          if (dots.empty) runs.push(dotRun(DOT_GLYPH.repeat(dots.empty), PALETTE.emptyDot, dotSpacing))
          // Kept whole with its heading, as print keeps the section.
          sidebar.push(sidebarParagraph(runs, index === 0, keepAt(KEEP_LINES, index, languages.length)))
        })
        markDrawn()
        return
      }

      case 'training': {
        if (certificates.length === 0) return
        sidebarHeading(swissHeading(dict, 'training'))
        // Kept whole with its heading, as print keeps the section.
        certificates.forEach((text, index) =>
          sidebar.push(sidebarParagraph([run(text, PALETTE.body, { size: size.sidebar })], index === 0, keepAt(KEEP_LINES, index, certificates.length))),
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
  if (contact.name) {
    main.push(new Paragraph({ children: [run(contact.name, PALETTE.name, { bold: true, size: size.name })], spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.name, line.name]) } }))
  }
  if (title) {
    main.push(
      new Paragraph({
        children: [run(title, PALETTE.accent, { size: size.title })],
        spacing: { before: contact.name ? pxToTwips(GEOMETRY.nameGap) : 0, after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, line.title]) },
      }),
    )
  }
  let mainBefore = main.length > 0 ? pxToTwips(GEOMETRY.titleGap) : 0

  /** A main heading: the filled violet circle, a tab, then the heading in violet bold; kept with what follows. */
  const heading = (label: string) => {
    const textAt = pxToTwips(GEOMETRY.headingCircle + GEOMETRY.headingCircleGap)
    main.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${SWISS_FIRST_JOB_HEADING_CIRCLE}\t`, font, size: size.circle, color: PALETTE.mark }),
          new TextRun({ text: label, font, size: size.heading, bold: true, color: PALETTE.accent }),
        ],
        tabStops: [{ type: TabStopType.LEFT, position: textAt }],
        spacing: {
          before: mainBefore,
          after: pxToTwips(GEOMETRY.headingGap),
          // The taller of the heading's line and the circle, as the Preview's flex row.
          ...exactLineSpacing([LINE_HEIGHT.compact, line.heading], [1, GEOMETRY.headingCircle * 1.5]),
        },
        keepNext: true,
      }),
    )
  }

  /**
   * An entry's head: its date line in violet, its bold title, its grey second
   * line. The entry is kept whole, as print keeps it; `endsEntry` when nothing
   * of the entry follows its head.
   */
  const entryHead = (dates: string, lead: string, detail: string, endsEntry: boolean) => {
    const lines = [
      ...(dates ? [[run(dates, PALETTE.accent, { size: size.date })]] : []),
      ...(lead ? [[run(lead, PALETTE.ink, { bold: true })]] : []),
      ...(detail ? [[run(detail, PALETTE.muted)]] : []),
    ]
    lines.forEach((children, index) =>
      main.push(new Paragraph({ children, spacing: { after: 0, ...bodyLine }, ...keepAt(endsEntry ? KEEP_LINES : KEEP_WITH_NEXT, index, lines.length) })),
    )
  }

  const mainSection = (sectionId: SwissFirstJobMainSectionId): boolean => {
    switch (sectionId) {
      case 'summary':
        if (!swissHasText(row.summary)) return false
        heading(swissHeading(dict, 'summary'))
        // Kept whole with its heading, as print keeps the section.
        main.push(...richParagraphs(row.summary, PALETTE.body, { size: size.body, line: line.body, keep: KEEP_LINES }))
        return true

      case 'experience':
        if (experiences.length === 0) return false
        heading(swissHeading(dict, 'experience'))
        experiences.forEach((exp, index) => {
          if (index > 0) main.push(spacer(pxToTwips(GEOMETRY.entryGap)))
          entryHead(exp.dates, exp.lead, exp.detail, exp.achievements.length === 0 && !exp.description)
          if (exp.achievements.length > 0) {
            exp.achievements.forEach((achievement, i) => {
              main.push(
                new Paragraph({
                  children: [run('•\t', PALETTE.body), ...parseHtmlToDocxRuns(achievement, { size: size.body, color: PALETTE.body, font })],
                  // The same bullet geometry as a description's list (`richParagraphs`).
                  indent: { left: listIndent, hanging: markerHang },
                  tabStops: [{ type: TabStopType.LEFT, position: listIndent }],
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
            main.push(
              ...richParagraphs(exp.description, PALETTE.body, { size: size.body, line: line.body, spacingBefore: pxToTwips(GEOMETRY.detailGap), keep: KEEP_LINES }),
            )
          }
        })
        return true

      case 'education':
        if (education.length === 0) return false
        heading(swissHeading(dict, 'education'))
        education.forEach((edu, index) => {
          if (index > 0) main.push(spacer(pxToTwips(GEOMETRY.entryGap)))
          entryHead(edu.dates, edu.lead, edu.detail, !edu.description)
          if (edu.description) {
            main.push(
              ...richParagraphs(edu.description, PALETTE.body, { size: size.body, line: line.body, spacingBefore: pxToTwips(GEOMETRY.detailGap), keep: KEEP_LINES }),
            )
          }
        })
        return true
    }
  }
  for (const sectionId of sections.main) {
    if (mainSection(sectionId)) mainBefore = pxToTwips(GEOMETRY.sectionGap)
  }
  if (main.length === 0) main.push(emptyParagraph())

  // ----------------------------------------------------------
  // ASSEMBLE
  // ----------------------------------------------------------

  /**
   * The sidebar's violet: a solid PNG the sidebar's width and the page's
   * height, anchored to the page's own origin behind the text. It sits in the
   * section's header, which Word repeats on every page, so the sidebar runs
   * from the paper's top edge to its foot on every page, its top and foot
   * margins included, as the printed Preview's root background does.
   */
  const sidebarFill = new ImageRun({
    type: 'png',
    data: solidColourPng(PALETTE.sidebar),
    transformation: { width: GEOMETRY.sidebarWidth, height: PAGE_HEIGHT_TWIPS / TWIPS_PER_PX },
    // A distinct id keeps every drawing's wp:docPr id unique; the photo's is 1.
    altText: { name: '', description: '', title: '', id: '2' },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
      wrap: { type: TextWrappingType.NONE },
      behindDocument: true,
      allowOverlap: true,
      layoutInCell: false,
      zIndex: 1,
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
            // The text starts and ends the sidebar's padding from its edges:
            // SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH. Its top and foot are the page's margins.
            margins: { top: 0, bottom: 0, left: pxToTwips(GEOMETRY.sidebarPaddingX), right: pxToTwips(GEOMETRY.sidebarPaddingX) },
            // No shading: Word paints a cell's shading over the drawing behind the
            // text, and it would end where the row's part on a page ends.
            borders: NO_CELL_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            children: sidebar,
          }),
          new TableCell({
            width: { size: mainWidth, type: WidthType.DXA },
            margins: { top: 0, bottom: 0, left: pxToTwips(GEOMETRY.mainPaddingLeft), right: pxToTwips(GEOMETRY.mainPaddingRight) },
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
            size: { width: pageWidthTwips, height: PAGE_HEIGHT_TWIPS, orientation: PageOrientation.PORTRAIT },
            // The printed Preview's page margins (`@page swiss-first-job`) top
            // and foot, so both break their pages at the same place; no side
            // margin, so the sidebar meets the paper's left edge.
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

  // `docx` writes the photo as a rectangle with no outline or fill and has no
  // API for either, so its geometry is set to an ellipse — Word's own "crop to
  // shape" — with the Preview's light ring and fill, and the object-fit: cover
  // crop is written from `calculateCoverCropPercents` (`docx-photo.ts`). It has no API for `w:fitText`
  // either, which an email too wide for the sidebar even at 7pt is given.
  if (photo || fitsEmail) {
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file('word/document.xml')
    if (!file) throw new Error('The generated swissFirstJob document has no word/document.xml')
    let xml = await file.async('string')
    if (photo) xml = roundPhoto(xml, photo.crop, PALETTE.soft, PALETTE.photoFill)
    if (fitsEmail) xml = fitEmail(xml, pxToTwips(SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH))
    zip.file('word/document.xml', xml)
    buffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
  }

  return pairInterFaces(buffer)
}

/**
 * The run style that marks the one run `fitEmail` gives `w:fitText`. No such
 * style exists: `fitEmail` removes the reference, so it never reaches Word.
 */
export const FIT_EMAIL_MARKER = 'SwissFirstJobFitEmail'

/**
 * Properties a run may carry after `w:fitText`, in the schema's order
 * (CT_RPr): the fit goes before the first of them, or last.
 */
const AFTER_FIT_TEXT = /<w:(?:vertAlign|rtl|cs|em|lang|eastAsianLayout|specVanish|oMath)\b/

/**
 * The email's run, marked with `FIT_EMAIL_MARKER`, given `w:fitText` of
 * `widthTwips` (the sidebar's text width): Word lays the run out in exactly
 * that width, so an address too wide for the sidebar even at 7pt is
 * compressed onto one line with its text unchanged. The marker's `w:rStyle` is
 * removed and `w:fitText`, with the document's one fit id, is written in its
 * schema place. The id is 1: the generator gives no other run a fit, so it is
 * unique in the document. No other run is touched.
 *
 * @throws unless exactly one run carries the marker, rather than shipping an
 * email that Word would wrap at a letter, or a reference to a missing style.
 */
export function fitEmail(xml: string, widthTwips: number): string {
  const marker = `<w:rStyle w:val="${FIT_EMAIL_MARKER}"/>`
  const runs = [...xml.matchAll(/<w:rPr>((?:(?!<\/w:rPr>)[\s\S])*?)<\/w:rPr>/g)].filter(([, inner]) => inner.includes(marker))
  if (runs.length !== 1) throw new Error(`Expected one email run to fit, found ${runs.length}`)
  const [whole, inner] = runs[0]
  const start = runs[0].index ?? 0
  const cleaned = inner.replace(marker, '')
  const fit = `<w:fitText w:val="${widthTwips}" w:id="1"/>`
  const at = AFTER_FIT_TEXT.exec(cleaned)?.index ?? cleaned.length
  return `${xml.slice(0, start)}<w:rPr>${cleaned.slice(0, at)}${fit}${cleaned.slice(at)}</w:rPr>${xml.slice(start + whole.length)}`
}

/**
 * The photo's drawing — the body's one inline drawing; the sidebar's fill is in
 * the header — made round: its preset geometry an ellipse, filled in `fillHex`
 * where the photo is transparent, outlined in `ringHex` at the Preview's ring
 * width, and cropped to cover its square.
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
  if (!inline) throw new Error('swissFirstJob photo: no inline drawing')
  let drawing = inline[0]

  const geometry = /<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="rect"\/>/
  if (!geometry.test(drawing)) throw new Error('swissFirstJob photo: no rectangular picture geometry to round')
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
  if (!effectExtent.test(drawing)) throw new Error('swissFirstJob photo: no effect extent to widen for the ring')
  drawing = drawing.replace(effectExtent, `<wp:effectExtent t="${ringEmu}" r="${ringEmu}" b="${ringEmu}" l="${ringEmu}"/>`)
  if (crop) {
    const srcRect = /<a:srcRect\/>|<a:srcRect><\/a:srcRect>/
    if (!srcRect.test(drawing)) throw new Error('swissFirstJob photo: no source rectangle to crop')
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
