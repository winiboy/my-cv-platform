import { getTranslations, type Locale } from '@/lib/i18n'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
  convertInchesToTwip,
  LineRuleType,
  TableLayoutType,
  PageOrientation,
  ShadingType,
  ImageRun,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
} from 'docx'
import {
  pxToHalfPoints,
  pxToTwips,
  extractPrimaryFont,
  extractAlignment,
  isHtmlList,
  parseHtmlListToParagraphs,
  isPlainTextList,
  parsePlainTextListToParagraphs,
  parseHtmlToDocxRuns,
  stripHtml,
  exactLineSpacing,
  trackingSpacing,
  twipsToEmu,
  NO_TEXT_LINE,
  type DocxGeneratorSettings,
} from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { docxTranslucentText } from './docx-text-opacity'
import { graphicHeightTwips, pillRuns, segmentedBar, shadedCellBar, verticalRule } from './docx-graphics'
import { translucentDiscPng } from './docx-disc'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import {
  CREATIVE_HEADER_CIRCLES,
  CREATIVE_LANGUAGE_BAR,
  CREATIVE_PROJECT_CARD,
  CREATIVE_TIMELINE,
  creativeLanguageBarSegments,
  graphicHeightPx,
} from '@/lib/resume-graphics'
import {
  CREATIVE_HEADING_BAR_STEP,
  PREFLIGHT_LINE_HEIGHT,
  TAILWIND_LEADING,
  TAILWIND_TEXT_LINE_HEIGHT,
  tailwindHeightPx,
} from '@/lib/resume-line-height'

// ============================================================
// TRANSLATION DICTIONARY (matching creative-template.tsx section labels)
// ============================================================
const CREATIVE_DICT: Record<string, Record<string, string>> = {
  fr: { summary: 'Résumé', experience: 'Expérience', education: 'Formation', skills: 'Compétences', languages: 'Langues', certifications: 'Certifications', projects: 'Projets', present: 'Présent' },
  en: { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', languages: 'Languages', certifications: 'Certifications', projects: 'Projects', present: 'Present' },
  de: { summary: 'Zusammenfassung', experience: 'Erfahrung', education: 'Ausbildung', skills: 'Fähigkeiten', languages: 'Sprachen', certifications: 'Zertifizierungen', projects: 'Projekte', present: 'Gegenwart' },
  it: { summary: 'Riepilogo', experience: 'Esperienza', education: 'Formazione', skills: 'Competenze', languages: 'Lingue', certifications: 'Certificazioni', projects: 'Progetti', present: 'Presente' },
}

// ============================================================
// COLOR PALETTE
// ============================================================
/**
 * Every text run and fill the Preview draws in a colour of its own (US-003).
 * The header is a three-stop gradient (`from-purple-600 via-pink-500
 * to-orange-400`); DOCX shading is one solid colour, so the header takes the
 * first stop — a format limitation the parity report records.
 */
const PALETTE = DOCX_PALETTE.creative

/** The letter spacing the Preview draws, in em, applied at each run's own size (US-005). */
const TRACKING = PREVIEW_TRACKING.creative

/**
 * The header text the Preview draws translucent — `text-white/90` for the
 * summary, `text-white/80` for the second contact row (US-006). A DOCX run
 * carries no alpha, so each is written in the colour that translucency
 * composites to over the fill the header paragraphs actually carry, which is
 * the gradient's first stop. The Preview's other two stops are not in the DOCX,
 * and are recorded with this composite in the parity report's creative header
 * limitation.
 *
 * The `bg-white/10` circles the header draws over the gradient ARE in the DOCX
 * since US-007, as floating rasters (`headerCircle` below). They are not folded
 * into this composite: each is a 10% white wash over part of the header only,
 * and the text it reaches is white or near-white, so it moves that text by
 * 0.1 x (255 - v) a channel — nothing on the opaque white title, at most 3.9 on
 * the darkest channel of the composited `text-white/80` links row. The parity
 * check composites the sampled text against the header fill on both sides, so
 * neither side accounts for them.
 */
const HEADER_TRANSLUCENT = {
  summary: docxTranslucentText('creative', 'headerSummary', PALETTE['purple-600']),
  links: docxTranslucentText('creative', 'headerLinks', PALETTE['purple-600']),
}

// ============================================================
// FONT SIZE CONSTANTS (matching creative-template.tsx defaults)
// ============================================================
const FONT_SIZES = {
  NAME: 48,                // h1 titleFontSize default (font-black, uppercase)
  SUMMARY: 16,             // text-base (16px) — summary in header
  CONTACT: 12,             // contactFontSize default
  CONTACT_LINKS: 12,       // text-xs for linkedin/github/website row
  SECTION_TITLE: 16,       // sectionTitleFontSize default (font-black, uppercase)
  BODY: 14,                // sectionDescFontSize default — used for most body text
}

/**
 * The Preview's line heights (US-004), from `resume-line-height.ts`.
 * `creative-template.tsx` sets none inline: elements inherit Tailwind's
 * preflight 1.5 unless a class sets one — `leading-relaxed` on the header
 * summary and the experience and project descriptions, `text-xs` on the
 * second contact row. The template renders every text plainly (`formatText`
 * or as a string), never as formatted content.
 */
const LINE_HEIGHT = {
  inherited: PREFLIGHT_LINE_HEIGHT,
  textXs: TAILWIND_TEXT_LINE_HEIGHT['text-xs'],
  relaxed: TAILWIND_LEADING['leading-relaxed'],
} as const

// Spacing constants (px, converted to twips at usage)
const SPACING = {
  OUTER_PADDING: 40,               // p-10 = 2.5rem = 40px
  HEADER_PADDING: 40,              // p-10 in header
  NAME_MB: 12,                     // mb-3 = 12px below name
  SUMMARY_MB: 16,                  // mb-4 = 16px below summary
  CONTACT_GAP_Y: 8,                // gap-y-2 = 8px vertical gap between contact items
  LINKS_ROW_MT: 8,                 // mt-2 = 8px above links row
  BODY_COLUMN_GAP: 32,             // gap-8 = 32px between columns
  LEFT_SECTION_GAP: 24,            // space-y-6 = 24px between left column sections
  RIGHT_SECTION_GAP: 24,           // space-y-6 = 24px between right column sections
  SECTION_TITLE_MB_LEFT: 16,       // mb-4 = 16px below left section titles
  SECTION_TITLE_MB_RIGHT: 20,      // mb-5 = 20px below right section titles
  SKILLS_CATEGORY_GAP: 16,         // space-y-4 = 16px between skill categories
  SKILLS_ITEM_GAP: 4,              // space-y-1 = 4px between skill items
  SKILLS_CATEGORY_NAME_MB: 8,      // mb-2 = 8px below category name
  LANGUAGE_ITEM_GAP: 8,            // space-y-2 = 8px between language items (approx)
  LANGUAGE_NAME_MB: 4,             // mb-1 = 4px below language name
  CERT_ITEM_GAP: 12,               // space-y-3 = 12px between certification items
  EXPERIENCE_ITEM_GAP: 20,         // space-y-5 = 20px between experience items
  EXPERIENCE_HEADER_MB: 8,         // mb-2 = 8px below position/company header
  EXPERIENCE_LOCATION_MB: 8,       // mb-2 = 8px below location
  ACHIEVEMENT_GAP: 4,              // space-y-1 = 4px between achievements
  PROJECT_ITEM_GAP: 16,            // space-y-4 = 16px between projects
  PROJECT_NAME_MB: 8,              // mb-2 = 8px below project name
  PROJECT_DESC_MB: 12,             // mb-3 = 12px below project description
  EDUCATION_ITEM_GAP: 16,          // space-y-4 = 16px between education items
}

// ============================================================
// CREATIVE TEMPLATE DOCX GENERATOR
// ============================================================

/**
 * Generate a DOCX buffer for the Creative template.
 *
 * Layout:
 * 1. Full-width header paragraphs with purple-600 background shading
 *    (approximation of the gradient from-purple-600 via-pink-500 to-orange-400)
 * 2. Body: 2-column Table (1/3 left + 2/3 right) with 32px gap
 *
 * Left column: Skills, Languages, Certifications
 * Right column: Experience, Projects, Education
 */
export async function generateCreativeDocx(
  resume: any,
  settings: DocxGeneratorSettings
): Promise<Buffer> {
  const {
    fontFamily,
    fontScale,
    locale,
  } = settings

  // Load translations
  const dict = getTranslations(locale as Locale, 'common')
  const creativeDict = CREATIVE_DICT[locale] || CREATIVE_DICT.en

  // Determine font
  const primaryFont = extractPrimaryFont(fontFamily)
  const font = primaryFont || 'Arial'

  const contact = resume.contact || {}

  // Filter visible items only (matching Preview behavior)
  const experiences = (resume.experience || []).filter((exp: any) => exp.visible !== false)
  const education = (resume.education || []).filter((edu: any) => edu.visible !== false)
  const skills = (resume.skills || []).filter((skill: any) => skill.visible !== false)
  const certifications = (resume.certifications || []).filter((cert: any) => cert.visible !== false)
  const projects = (resume.projects || []).filter((project: any) => project.visible !== false)
  const languages = (resume.languages || []).filter((lang: any) => lang.visible !== false)

  // Calculate scaled font sizes (half-points for docx)
  const scaledFontSizes = {
    name: pxToHalfPoints(FONT_SIZES.NAME * fontScale),
    summary: pxToHalfPoints(FONT_SIZES.SUMMARY * fontScale),
    contact: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale),
    contactLinks: pxToHalfPoints(FONT_SIZES.CONTACT_LINKS * fontScale),
    sectionTitle: pxToHalfPoints(FONT_SIZES.SECTION_TITLE * fontScale),
    body: pxToHalfPoints(FONT_SIZES.BODY * fontScale),
  }

  // Line spacing shared by many paragraphs.
  const inheritedBody = exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.body])
  const relaxedBody = exactLineSpacing([LINE_HEIGHT.relaxed, scaledFontSizes.body])

  // Page dimensions: A4
  const pageWidthTwips = convertInchesToTwip(8.27)
  const pageHeightTwips = convertInchesToTwip(11.69)

  // Margins: p-10 = 40px = 600 twips for the body section
  // Header has its own padding via cell margins, so page margins are 0
  // and we handle spacing through the table structure
  const bodyPaddingTwips = pxToTwips(SPACING.OUTER_PADDING)

  // Column widths for the body table
  // Full page width for the body table (margins handled by cell padding)
  const gapTwips = pxToTwips(SPACING.BODY_COLUMN_GAP)
  const bodyContentWidth = pageWidthTwips
  // 1/3 and 2/3 split: the gap is distributed as cell margin
  const leftColumnWidth = Math.round(bodyContentWidth / 3)
  const rightColumnWidth = bodyContentWidth - leftColumnWidth

  // The width a graphic drawn `w-full` in a column actually has: the column less
  // the cell margins below (US-007).
  const leftContentWidth = leftColumnWidth - bodyPaddingTwips - Math.round(gapTwips / 2)
  const rightContentWidth = rightColumnWidth - bodyPaddingTwips - Math.round(gapTwips / 2)

  /**
   * The experience timeline (US-007): every paragraph of an entry is indented by
   * the Preview's `pl-6` gutter and carries a left border in its place, which
   * Word draws as one continuous rule down consecutive paragraphs. It is solid
   * purple-300 where the Preview fades the gradient out to transparent.
   */
  const timelineBorder = {
    left: verticalRule(
      CREATIVE_TIMELINE.lineWidthPx,
      PALETTE['purple-300'],
      CREATIVE_TIMELINE.gutterPx - CREATIVE_TIMELINE.lineLeftPx,
    ),
  }
  const timelineIndent = { left: pxToTwips(CREATIVE_TIMELINE.gutterPx) }

  /**
   * The header's two decorative discs (US-007), each a floating PNG whose alpha
   * channel carries the Preview's `bg-white/10`. See `docx-disc.ts` for why a
   * raster, and `resume-graphics.ts` for what the DOCX does not reproduce.
   *
   * `behindDocument: false` because true puts the drawing behind the header
   * cell's own fill, where Word does not show it. Word clips each drawing to the
   * cell, which is the Preview's `overflow-hidden`, so the offsets below place
   * the discs exactly where the Preview does, overhang included.
   *
   * @param anchor whether the run sits in the header's first paragraph, from
   *        whose top the Preview measures `-top-20`, or in the zero-height
   *        paragraph after its last, from whose top the header's bottom edge is
   *        one cell margin away whatever the text above did.
   */
  function headerCircle(anchor: 'top' | 'bottom'): ImageRun {
    // Both offsets are measured from the anchor paragraph's own top-left, which
    // sits one header padding inside the header box on each axis.
    const padding = pxToTwips(CREATIVE_HEADER_CIRCLES.paddingPx)
    const { sizePx, overhangPx } =
      anchor === 'top' ? CREATIVE_HEADER_CIRCLES.topRight : CREATIVE_HEADER_CIRCLES.bottomLeft
    const size = pxToTwips(sizePx)
    const overhang = pxToTwips(overhangPx)
    const offset =
      anchor === 'top'
        ? { x: pageWidthTwips - padding - size + overhang, y: -(padding + overhang) }
        : { x: -(padding + overhang), y: padding + overhang - size }
    return new ImageRun({
      type: 'png',
      data: translucentDiscPng(sizePx, PALETTE.white, CREATIVE_HEADER_CIRCLES.alpha),
      transformation: { width: sizePx, height: sizePx },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: twipsToEmu(offset.x) },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: twipsToEmu(offset.y) },
        wrap: { type: TextWrappingType.NONE },
        behindDocument: false,
        layoutInCell: true,
        allowOverlap: true,
      },
    })
  }

  /**
   * The card a project sits in (US-007), as a single-cell table: the cell's fill
   * is `bg-slate-50`, its left border `border-l-4 border-purple-500`, and its
   * margins the `p-4` padding. `rounded-lg` has no OOXML counterpart. The header
   * above uses the same one-cell idiom for the same reason — a cell is the only
   * thing in this format that carries a fill and its own padding.
   */
  function projectCard(children: readonly Paragraph[]): Table {
    return new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [...children],
              width: { size: rightContentWidth, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: PALETTE['slate-50'], color: 'auto' },
              margins: {
                top: pxToTwips(CREATIVE_PROJECT_CARD.paddingPx),
                bottom: pxToTwips(CREATIVE_PROJECT_CARD.paddingPx),
                left: pxToTwips(CREATIVE_PROJECT_CARD.paddingPx),
                right: pxToTwips(CREATIVE_PROJECT_CARD.paddingPx),
              },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                left: verticalRule(CREATIVE_PROJECT_CARD.rulePx, PALETTE['purple-500'], 0),
              },
              verticalAlign: VerticalAlign.TOP,
            }),
          ],
        }),
      ],
      width: { size: rightContentWidth, type: WidthType.DXA },
      columnWidths: [rightContentWidth],
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
    })
  }

  // ============================================================
  // HELPER: Create section header with vertical bar prefix
  // Matches: "|" in purple-600 + title in font-black uppercase purple-600
  // ============================================================
  function createSectionHeader(
    title: string,
    spacingAfter: number,
    column: keyof typeof CREATIVE_HEADING_BAR_STEP,
  ): Paragraph {
    const headingLine = exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.sectionTitle])
    const barTwips = pxToTwips(tailwindHeightPx(CREATIVE_HEADING_BAR_STEP[column]))
    const headingRowPadding = Math.round(Math.max(0, barTwips - headingLine.line) / 2)
    return new Paragraph({
      children: [
        new TextRun({
          text: '|  ',
          bold: true,
          size: scaledFontSizes.sectionTitle,
          color: PALETTE['purple-600'],
          font,
        }),
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: scaledFontSizes.sectionTitle,
          color: PALETTE['purple-600'],
          font,
        }),
      ],
      // The h2 is a flex row of its gradient bar, which the "|" run stands in for,
      // and the title, which inherits 1.5. The bar is taller than the title's line
      // at ordinary heading sizes, and `items-center` centres the title in the row,
      // so the paragraph keeps the title's leading and carries the rest of the
      // row's height as space above and below. Putting it in the line instead would
      // space a heading that wraps at the bar's height rather than its own.
      spacing: {
        before: headingRowPadding,
        after: pxToTwips(spacingAfter) + headingRowPadding,
        ...headingLine,
      },
    })
  }

  // ============================================================
  // HELPER: Format date for Creative template
  // Returns "Mon YYYY - Mon YYYY" or "Mon YYYY - Present"
  // ============================================================
  function formatCreativeDate(
    startDate: string | null,
    endDate: string | null,
    isCurrent: boolean | undefined,
  ): string {
    if (!startDate) return ''

    const start = new Date(startDate + '-01').toLocaleDateString(locale as Locale, {
      month: 'short',
      year: 'numeric',
    })

    const end = isCurrent
      ? (creativeDict.present || 'Present')
      : endDate
        ? new Date(endDate + '-01').toLocaleDateString(locale as Locale, {
            month: 'short',
            year: 'numeric',
          })
        : (creativeDict.present || 'Present')

    return `${start} - ${end}`
  }

  // ============================================================
  // BUILD HEADER PARAGRAPHS (full-width, purple background)
  // ============================================================
  const headerParagraphs: Paragraph[] = []

  // Name: White, font-black, uppercase, 48px. It carries the top-right
  // decorative disc (US-007): a floating drawing takes no inline space, so the
  // run sits in the first header paragraph without moving the title, and the
  // Preview measures that disc's `-top-20` from the header's top edge.
  //
  // Its pair, the bottom-left disc, is pushed after the LAST header paragraph,
  // just before the header cell is built — search `headerCircle('bottom')`.
  // Only one of the two can be anchored here: the Preview places that one from
  // the header's bottom edge, which is not known until the text above it ends.
  headerParagraphs.push(
    new Paragraph({
      children: [
        headerCircle('top'),
        new TextRun({
          text: (resume.title || contact.name || 'Your Name').toUpperCase(),
          bold: true,
          size: scaledFontSizes.name,
          color: PALETTE.white,
          font,
          characterSpacing: trackingSpacing(TRACKING.title, scaledFontSizes.name),
        }),
      ],
      spacing: {
        after: pxToTwips(SPACING.NAME_MB),
        ...exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.name]),
      },
      shading: {
        type: ShadingType.SOLID,
        fill: PALETTE['purple-600'],
        color: PALETTE['purple-600'],
      },
    })
  )

  // Summary (optional): White/90, base text, justified
  if (resume.summary) {
    const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.JUSTIFIED
    // The summary div is `text-base leading-relaxed`; leading-relaxed wins.
    const summaryLineSpacing = exactLineSpacing([LINE_HEIGHT.relaxed, scaledFontSizes.summary])

    if (isPlainTextList(resume.summary)) {
      // No HTML-list branch exists here to follow: keep the summary paragraph's
      // header shading and line height, with the 4px gap the other templates use
      // between list items.
      headerParagraphs.push(
        ...parsePlainTextListToParagraphs(
          resume.summary,
          {
            size: scaledFontSizes.summary,
            color: HEADER_TRANSLUCENT.summary,
            font,
          },
          {
            spacingAfterItem: pxToTwips(4),
            spacingAfterLast: pxToTwips(SPACING.SUMMARY_MB),
            alignment: summaryAlignment,
            lineSpacing: summaryLineSpacing,
            shading: {
              type: ShadingType.SOLID,
              fill: PALETTE['purple-600'],
              color: PALETTE['purple-600'],
            },
          }
        )
      )
    } else {
      const summaryRuns = parseHtmlToDocxRuns(resume.summary, {
        size: scaledFontSizes.summary,
        color: HEADER_TRANSLUCENT.summary,
        font,
      })

      headerParagraphs.push(
        new Paragraph({
          children: summaryRuns,
          spacing: {
            after: pxToTwips(SPACING.SUMMARY_MB),
            ...summaryLineSpacing,
          },
          alignment: summaryAlignment,
          shading: {
            type: ShadingType.SOLID,
            fill: PALETTE['purple-600'],
            color: PALETTE['purple-600'],
          },
        })
      )
    }
  }

  // Contact info: White text with white dot separators
  // Primary row: email, phone, location
  const primaryContactItems: string[] = []
  if (contact.email) primaryContactItems.push(contact.email)
  if (contact.phone) primaryContactItems.push(contact.phone)
  if (contact.location) primaryContactItems.push(contact.location)

  if (primaryContactItems.length > 0) {
    const contactRuns: (typeof TextRun.prototype)[] = []

    primaryContactItems.forEach((item, index) => {
      if (index > 0) {
        // White dot separator
        contactRuns.push(
          new TextRun({
            text: '  \u2022  ',
            size: scaledFontSizes.contact,
            color: PALETTE.white,
            font,
          })
        )
      }
      contactRuns.push(
        new TextRun({
          text: item,
          size: scaledFontSizes.contact,
          color: PALETTE.white,
          font,
        })
      )
    })

    headerParagraphs.push(
      new Paragraph({
        children: contactRuns,
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.contact]) },
        shading: {
          type: ShadingType.SOLID,
          fill: PALETTE['purple-600'],
          color: PALETTE['purple-600'],
        },
      })
    )
  }

  // Secondary row: linkedin, github, website (text-xs, white/80)
  const secondaryContactItems: string[] = []
  if (contact.linkedin) secondaryContactItems.push(contact.linkedin)
  if (contact.github) secondaryContactItems.push(contact.github)
  if (contact.website) secondaryContactItems.push(contact.website)

  if (secondaryContactItems.length > 0) {
    const linkRuns: (typeof TextRun.prototype)[] = []

    secondaryContactItems.forEach((item, index) => {
      if (index > 0) {
        linkRuns.push(
          new TextRun({
            text: '     ',
            size: scaledFontSizes.contactLinks,
            color: HEADER_TRANSLUCENT.links,
            font,
          })
        )
      }
      linkRuns.push(
        new TextRun({
          text: item,
          size: scaledFontSizes.contactLinks,
          color: HEADER_TRANSLUCENT.links,
          font,
        })
      )
    })

    headerParagraphs.push(
      new Paragraph({
        children: linkRuns,
        spacing: {
          before: pxToTwips(SPACING.LINKS_ROW_MT),
          after: 0,
          ...exactLineSpacing([LINE_HEIGHT.textXs, scaledFontSizes.contactLinks]),
        },
        shading: {
          type: ShadingType.SOLID,
          fill: PALETTE['purple-600'],
          color: PALETTE['purple-600'],
        },
      })
    )
  }

  // ============================================================
  // BUILD LEFT COLUMN (1/3): Skills, Languages, Certifications
  // ============================================================
  // Tables as well as paragraphs: a language's level bar is a table (US-007).
  const leftParagraphs: (Paragraph | Table)[] = []

  // --- SKILLS ---
  if (skills.length > 0) {
    leftParagraphs.push(
      createSectionHeader(
        (dict as any).resumes?.editor?.sections?.skills || creativeDict.skills,
        SPACING.SECTION_TITLE_MB_LEFT,
        'sidebar',
      )
    )

    skills.forEach((skillCategory: any, i: number) => {
      const isLastCategory = i === skills.length - 1
      const nextSectionExists = languages.length > 0 || certifications.length > 0
      const categoryEndSpacing = isLastCategory
        ? (nextSectionExists ? SPACING.LEFT_SECTION_GAP : 0)
        : SPACING.SKILLS_CATEGORY_GAP

      // Category name: bold, slate-800
      if (skillCategory.category) {
        leftParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: skillCategory.category,
                bold: true,
                size: scaledFontSizes.body,
                color: PALETTE['slate-800'],
                font,
              }),
            ],
            spacing: { after: pxToTwips(SPACING.SKILLS_CATEGORY_NAME_MB), ...inheritedBody },
          })
        )
      }

      // Skill items as bullet list using skillsHtml or items array.
      // The Preview renders `items` only, never `skillsHtml`; that content
      // divergence is Part 3 US-016's. Every skill line takes the line height
      // of the Preview's skill item, which inherits 1.5.
      if (skillCategory.skillsHtml) {
        const skillsAlignment = extractAlignment(skillCategory.skillsHtml) || AlignmentType.LEFT

        if (isHtmlList(skillCategory.skillsHtml)) {
          const listParagraphs = parseHtmlListToParagraphs(
            skillCategory.skillsHtml,
            {
              size: scaledFontSizes.body,
              color: PALETTE['slate-700'],
              font,
            },
            pxToTwips(SPACING.SKILLS_ITEM_GAP),
            pxToTwips(categoryEndSpacing),
            inheritedBody,
            undefined,
            skillsAlignment
          )
          leftParagraphs.push(...listParagraphs)
        } else {
          // Render as plain text with bullets on each line
          const plainText = stripHtml(skillCategory.skillsHtml)
          const items = plainText.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean)
          items.forEach((item: string, j: number) => {
            const isLastItem = j === items.length - 1
            leftParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `\u2022 ${item}`,
                    size: scaledFontSizes.body,
                    color: PALETTE['slate-700'],
                    font,
                  }),
                ],
                spacing: {
                  after: isLastItem
                    ? pxToTwips(categoryEndSpacing)
                    : pxToTwips(SPACING.SKILLS_ITEM_GAP),
                  ...inheritedBody,
                },
              })
            )
          })
        }
      } else if (skillCategory.items && skillCategory.items.length > 0) {
        skillCategory.items.forEach((skill: any, j: number) => {
          const skillName = typeof skill === 'string' ? skill : String(skill)
          const isLastItem = j === skillCategory.items.length - 1

          leftParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `\u2022 ${skillName}`,
                  size: scaledFontSizes.body,
                  color: PALETTE['slate-700'],
                  font,
                }),
              ],
              spacing: {
                after: isLastItem
                  ? pxToTwips(categoryEndSpacing)
                  : pxToTwips(SPACING.SKILLS_ITEM_GAP),
                ...inheritedBody,
              },
            })
          )
        })
      }
    })
  }

  // --- LANGUAGES ---
  if (languages.length > 0) {
    leftParagraphs.push(
      createSectionHeader(
        (dict as any).resumes?.editor?.sections?.languages || creativeDict.languages,
        SPACING.SECTION_TITLE_MB_LEFT,
        'sidebar',
      )
    )

    languages.forEach((lang: any, i: number) => {
      const isLast = i === languages.length - 1
      const nextSectionExists = certifications.length > 0
      const itemEndSpacing = isLast
        ? (nextSectionExists ? SPACING.LEFT_SECTION_GAP : 0)
        : SPACING.LANGUAGE_ITEM_GAP

      // Language name: bold, slate-800
      leftParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: lang.language || '',
              bold: true,
              size: scaledFontSizes.body,
              color: PALETTE['slate-800'],
              font,
            }),
          ],
          spacing: { after: pxToTwips(SPACING.LANGUAGE_NAME_MB), ...inheritedBody },
        })
      )

      // Proficiency: the five-segment bar the Preview draws, as five shaded
      // cells of a nested table (US-007). It replaces the "Fluent (4/5)" line
      // that stood in for it, which the Preview never showed; the number of
      // filled segments is the level, on both surfaces, and an unrecognised
      // stored level fills none on both.
      leftParagraphs.push(
        shadedCellBar(
          segmentedBar(
            leftContentWidth,
            CREATIVE_LANGUAGE_BAR.segments,
            graphicHeightTwips(graphicHeightPx(CREATIVE_LANGUAGE_BAR.gapStep)),
            creativeLanguageBarSegments(lang.level),
            PALETTE['purple-500'],
            PALETTE['slate-200'],
          ),
          graphicHeightTwips(graphicHeightPx(CREATIVE_LANGUAGE_BAR.heightStep)),
        )
      )
      // A table carries no spacing, and `docx` would append a default-spaced
      // paragraph to a cell whose last child is one.
      leftParagraphs.push(
        new Paragraph({ children: [], spacing: { after: pxToTwips(itemEndSpacing), ...NO_TEXT_LINE } })
      )
    })
  }

  // --- CERTIFICATIONS ---
  if (certifications.length > 0) {
    leftParagraphs.push(
      createSectionHeader(
        (dict as any).resumes?.editor?.sections?.certifications || creativeDict.certifications,
        SPACING.SECTION_TITLE_MB_LEFT,
        'sidebar',
      )
    )

    certifications.forEach((cert: any, i: number) => {
      const isLast = i === certifications.length - 1
      const itemEndSpacing = isLast ? 0 : SPACING.CERT_ITEM_GAP

      // Cert name: bold, slate-800
      leftParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cert.name || '',
              bold: true,
              size: scaledFontSizes.body,
              color: PALETTE['slate-800'],
              font,
            }),
          ],
          spacing: { after: cert.issuer || cert.date ? 0 : pxToTwips(itemEndSpacing), ...inheritedBody },
        })
      )

      // Issuer: slate-600
      if (cert.issuer) {
        leftParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: cert.issuer,
                size: scaledFontSizes.body,
                color: PALETTE['slate-600'],
                font,
              }),
            ],
            spacing: { after: cert.date ? 0 : pxToTwips(itemEndSpacing), ...inheritedBody },
          })
        )
      }

      // Date: slate-500, "Mon YYYY"
      if (cert.date) {
        leftParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: new Date(cert.date + '-01').toLocaleDateString(locale as Locale, {
                  month: 'short',
                  year: 'numeric',
                }),
                size: scaledFontSizes.body,
                color: PALETTE['slate-500'],
                font,
              }),
            ],
            spacing: { after: pxToTwips(itemEndSpacing), ...inheritedBody },
          })
        )
      }
    })
  }

  // ============================================================
  // BUILD RIGHT COLUMN (2/3): Experience, Projects, Education
  // ============================================================
  // Tables as well as paragraphs: a project's card is a table (US-007).
  const rightParagraphs: (Paragraph | Table)[] = []

  // --- EXPERIENCE ---
  if (experiences.length > 0) {
    rightParagraphs.push(
      createSectionHeader(
        (dict as any).resumes?.editor?.sections?.experience || creativeDict.experience,
        SPACING.SECTION_TITLE_MB_RIGHT,
        'main',
      )
    )

    experiences.forEach((exp: any, i: number) => {
      const isLastExp = i === experiences.length - 1
      const nextSectionExists = projects.length > 0 || education.length > 0
      const expEndSpacing = isLastExp
        ? (nextSectionExists ? SPACING.RIGHT_SECTION_GAP : 0)
        : SPACING.EXPERIENCE_ITEM_GAP

      // Position: bold, slate-900. The Preview also draws a dot in the gutter
      // here; the DOCX does not (US-007). A "●" run was built and rendered, and
      // rejected by the owner: it writes characters into the job title, which is
      // a field read as text. The timeline rule already marks the entry.
      rightParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: exp.position || '',
              bold: true,
              size: scaledFontSizes.body,
              color: PALETTE['slate-900'],
              font,
            }),
          ],
          border: timelineBorder,
          indent: timelineIndent,
          spacing: { after: 0, ...inheritedBody },
        })
      )

      // Company: font-semibold, purple-600
      if (exp.company) {
        rightParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: exp.company,
                bold: true,
                size: scaledFontSizes.body,
                color: PALETTE['purple-600'],
                font,
              }),
            ],
            border: timelineBorder,
            indent: timelineIndent,
            spacing: { after: pxToTwips(SPACING.EXPERIENCE_HEADER_MB), ...inheritedBody },
          })
        )
      }

      // Date badge: purple-100 bg, purple-700 text
      const dateText = formatCreativeDate(exp.startDate, exp.endDate, exp.current)
      if (dateText) {
        rightParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: dateText,
                bold: true,
                size: scaledFontSizes.body,
                color: PALETTE['purple-700'],
                font,
                shading: {
                  type: ShadingType.SOLID,
                  fill: PALETTE['purple-100'],
                  color: PALETTE['purple-100'],
                },
              }),
            ],
            border: timelineBorder,
            indent: timelineIndent,
            spacing: { after: pxToTwips(SPACING.EXPERIENCE_HEADER_MB), ...inheritedBody },
          })
        )
      }

      // Location (optional): slate-600
      if (exp.location) {
        rightParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: exp.location,
                size: scaledFontSizes.body,
                color: PALETTE['slate-600'],
                font,
              }),
            ],
            border: timelineBorder,
            indent: timelineIndent,
            spacing: { after: pxToTwips(SPACING.EXPERIENCE_LOCATION_MB), ...inheritedBody },
          })
        )
      }

      // Achievements with triangle bullet "▸" or Description
      if (exp.achievements && exp.achievements.length > 0) {
        exp.achievements.forEach((achievement: string, j: number) => {
          const isLastAchievement = j === exp.achievements.length - 1

          const achievementRuns = parseHtmlToDocxRuns(achievement, {
            size: scaledFontSizes.body,
            color: PALETTE['slate-700'],
            font,
          })

          const achievementSpacingAfter = isLastAchievement
            ? pxToTwips(expEndSpacing)
            : pxToTwips(SPACING.ACHIEVEMENT_GAP)

          rightParagraphs.push(
            new Paragraph({
              children: [
                // Triangle bullet in purple-500
                new TextRun({
                  text: '\u25B8 ',
                  size: scaledFontSizes.body,
                  color: PALETTE['purple-500'],
                  font,
                }),
                ...achievementRuns,
              ],
              border: timelineBorder,
              indent: timelineIndent,
              // The achievement list sets no leading, so it inherits 1.5.
              spacing: {
                after: achievementSpacingAfter,
                ...inheritedBody,
              },
            })
          )
        })
      } else if (exp.description) {
        const descAlignment = extractAlignment(exp.description) || AlignmentType.JUSTIFIED
        const descSpacingAfter = pxToTwips(expEndSpacing)

        if (isHtmlList(exp.description)) {
          const listParagraphs = parseHtmlListToParagraphs(
            exp.description,
            {
              size: scaledFontSizes.body,
              color: PALETTE['slate-700'],
              font,
            },
            pxToTwips(SPACING.ACHIEVEMENT_GAP),
            descSpacingAfter,
            relaxedBody,
            timelineIndent,
            descAlignment,
            timelineBorder
          )
          rightParagraphs.push(...listParagraphs)
        } else if (isPlainTextList(exp.description)) {
          rightParagraphs.push(
            ...parsePlainTextListToParagraphs(
              exp.description,
              {
                size: scaledFontSizes.body,
                color: PALETTE['slate-700'],
                font,
              },
              {
                spacingAfterItem: pxToTwips(SPACING.ACHIEVEMENT_GAP),
                spacingAfterLast: descSpacingAfter,
                alignment: descAlignment,
                lineSpacing: relaxedBody,
                indent: timelineIndent,
                border: timelineBorder,
              }
            )
          )
        } else {
          const descRuns = parseHtmlToDocxRuns(exp.description, {
            size: scaledFontSizes.body,
            color: PALETTE['slate-700'],
            font,
          })

          rightParagraphs.push(
            new Paragraph({
              children: descRuns,
              border: timelineBorder,
              indent: timelineIndent,
              spacing: {
                after: descSpacingAfter,
                ...relaxedBody,
              },
              alignment: descAlignment,
            })
          )
        }
      } else {
        // No description or achievements — still need spacing. The spacer
        // carries only the gap; the Preview draws no line there.
        if (!isLastExp || nextSectionExists) {
          rightParagraphs.push(
            new Paragraph({
              children: [],
              spacing: { after: pxToTwips(expEndSpacing), ...NO_TEXT_LINE },
            })
          )
        }
      }
    })
  }

  // --- PROJECTS ---
  if (projects.length > 0) {
    rightParagraphs.push(
      createSectionHeader(
        (dict as any).resumes?.editor?.sections?.projects || creativeDict.projects,
        SPACING.SECTION_TITLE_MB_RIGHT,
        'main',
      )
    )

    projects.forEach((project: any, i: number) => {
      const isLastProject = i === projects.length - 1
      const nextSectionExists = education.length > 0
      const projectEndSpacing = isLastProject
        ? (nextSectionExists ? SPACING.RIGHT_SECTION_GAP : 0)
        : SPACING.PROJECT_ITEM_GAP

      // The Preview draws each project in a card (US-007): a slate-50 fill, a
      // 4px purple-500 rule down its left edge and 16px of padding all round.
      // A single-cell table is what carries all three \u2014 cell margins are the
      // only padding OOXML has, and paragraph shading would start at the text
      // indent and leave the padding unfilled. The gap to the next card is a
      // paragraph after it, because a table carries no spacing of its own.
      const cardParagraphs: Paragraph[] = []
      const hasTechnologies = Boolean(project.technologies && project.technologies.length > 0)

      // Project name: bold, slate-900
      cardParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: project.name || '',
              bold: true,
              size: scaledFontSizes.body,
              color: PALETTE['slate-900'],
              font,
            }),
          ],
          spacing: {
            after: project.description || hasTechnologies ? pxToTwips(SPACING.PROJECT_NAME_MB) : 0,
            ...inheritedBody,
          },
        })
      )

      // Project description: slate-700, leading-relaxed
      if (project.description) {
        const projectDescRuns = parseHtmlToDocxRuns(project.description, {
          size: scaledFontSizes.body,
          color: PALETTE['slate-700'],
          font,
        })

        cardParagraphs.push(
          new Paragraph({
            children: projectDescRuns,
            spacing: {
              after: hasTechnologies ? pxToTwips(SPACING.PROJECT_DESC_MB) : 0,
              ...relaxedBody,
            },
          })
        )
      }

      // Technologies: one shaded run per pill (US-007), white on purple-500.
      if (hasTechnologies) {
        cardParagraphs.push(
          new Paragraph({
            children: pillRuns(
              project.technologies.map((technology: unknown) => String(technology)),
              {
                size: scaledFontSizes.body,
                color: PALETTE.white,
                fill: PALETTE['purple-500'],
                font,
                bold: true,
              },
            ),
            // Each pill's text inherits 1.5; its vertical padding is not leading
            // and a run's shading cannot carry it.
            spacing: { after: 0, ...inheritedBody },
          })
        )
      }

      rightParagraphs.push(projectCard(cardParagraphs))
      rightParagraphs.push(
        new Paragraph({ children: [], spacing: { after: pxToTwips(projectEndSpacing), ...NO_TEXT_LINE } })
      )
    })
  }

  // --- EDUCATION ---
  if (education.length > 0) {
    rightParagraphs.push(
      createSectionHeader(
        (dict as any).resumes?.editor?.sections?.education || creativeDict.education,
        SPACING.SECTION_TITLE_MB_RIGHT,
        'main',
      )
    )

    education.forEach((edu: any, i: number) => {
      const isLastEdu = i === education.length - 1
      const eduEndSpacing = isLastEdu ? 0 : SPACING.EDUCATION_ITEM_GAP

      // Degree: bold, slate-900
      rightParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: edu.degree || '',
              bold: true,
              size: scaledFontSizes.body,
              color: PALETTE['slate-900'],
              font,
            }),
          ],
          spacing: { after: 0, ...inheritedBody },
        })
      )

      // School + Field: purple-600, "School - Field"
      const schoolFieldText = edu.field
        ? `${edu.school || ''} - ${edu.field}`
        : (edu.school || '')

      if (schoolFieldText) {
        rightParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: schoolFieldText,
                size: scaledFontSizes.body,
                color: PALETTE['purple-600'],
                font,
              }),
            ],
            spacing: { after: edu.gpa ? 0 : pxToTwips(4), ...inheritedBody },
          })
        )
      }

      // GPA (optional): slate-600
      if (edu.gpa) {
        rightParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `GPA: ${edu.gpa}`,
                size: scaledFontSizes.body,
                color: PALETTE['slate-600'],
                font,
              }),
            ],
            spacing: { after: pxToTwips(4), ...inheritedBody },
          })
        )
      }

      // Date badge: purple-100 bg, purple-700 text
      const eduDateText = formatCreativeDate(edu.startDate, edu.endDate, false)
      if (eduDateText) {
        rightParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: eduDateText,
                bold: true,
                size: scaledFontSizes.body,
                color: PALETTE['purple-700'],
                font,
                shading: {
                  type: ShadingType.SOLID,
                  fill: PALETTE['purple-100'],
                  color: PALETTE['purple-100'],
                },
              }),
            ],
            spacing: { after: pxToTwips(eduEndSpacing), ...inheritedBody },
          })
        )
      }
    })
  }

  // The bottom-left decorative disc (US-007). The Preview places it from the
  // header's BOTTOM edge, which depends on how the text above wrapped, so it is
  // anchored in a paragraph of its own after the last: from that paragraph's top
  // the header's bottom is one cell margin away, whatever happened above it. The
  // paragraph carries no text and a one-twip exact line (US-004).
  headerParagraphs.push(
    new Paragraph({ children: [headerCircle('bottom')], spacing: { after: 0, ...NO_TEXT_LINE } })
  )

  // ============================================================
  // CREATE HEADER TABLE (full-width, purple background)
  // Using a single-cell table to get consistent background shading
  // ============================================================
  const headerCell = new TableCell({
    children: headerParagraphs,
    shading: {
      fill: PALETTE['purple-600'],
      color: 'auto',
    },
    margins: {
      top: pxToTwips(SPACING.HEADER_PADDING),
      bottom: pxToTwips(SPACING.HEADER_PADDING),
      left: pxToTwips(SPACING.HEADER_PADDING),
      right: pxToTwips(SPACING.HEADER_PADDING),
    },
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: pageWidthTwips,
      type: WidthType.DXA,
    },
  })

  const headerTable = new Table({
    rows: [
      new TableRow({
        children: [headerCell],
      }),
    ],
    width: {
      size: pageWidthTwips,
      type: WidthType.DXA,
    },
    columnWidths: [pageWidthTwips],
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
  })

  // ============================================================
  // CREATE BODY TABLE (2-column: 1/3 left + 2/3 right)
  // ============================================================
  const leftCell = new TableCell({
    children: leftParagraphs.length > 0
      ? leftParagraphs
      : [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: leftColumnWidth,
      type: WidthType.DXA,
    },
    margins: {
      top: bodyPaddingTwips,
      bottom: bodyPaddingTwips,
      left: bodyPaddingTwips,
      // Right margin on left cell = half the gap
      right: Math.round(gapTwips / 2),
    },
  })

  const rightCell = new TableCell({
    children: rightParagraphs.length > 0
      ? rightParagraphs
      : [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: rightColumnWidth,
      type: WidthType.DXA,
    },
    margins: {
      top: bodyPaddingTwips,
      bottom: bodyPaddingTwips,
      // Left margin on right cell = half the gap
      left: Math.round(gapTwips / 2),
      right: bodyPaddingTwips,
    },
  })

  const bodyTable = new Table({
    rows: [
      new TableRow({
        children: [leftCell, rightCell],
      }),
    ],
    width: {
      size: pageWidthTwips,
      type: WidthType.DXA,
    },
    columnWidths: [leftColumnWidth, rightColumnWidth],
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
  })

  // ============================================================
  // ASSEMBLE DOCUMENT
  // ============================================================
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font,
            size: scaledFontSizes.body,
          },
          // Every paragraph writes its own line spacing; the default is the
          // inherited 1.5 at the body size, so nothing falls back to Word auto.
          paragraph: {
            spacing: {
              before: 0,
              after: 0,
              ...inheritedBody,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: pageWidthTwips,
              height: pageHeightTwips,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            },
          },
        },
        children: [
          headerTable,
          bodyTable,
          // Trailing paragraph required by OOXML after table
          new Paragraph({
            spacing: {
              before: 0,
              after: 0,
              line: 1,
              lineRule: LineRuleType.EXACT,
            },
            children: [],
          }),
        ],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return buffer as Buffer
}
