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
  TabStopType,
  HeightRule,
  LineRuleType,
  TableLayoutType,
  type UniversalMeasure,
  PageOrientation,
} from 'docx'
import {
  pxToHalfPoints,
  pxToTwips,
  hslToHex,
  extractAlignment,
  isPlainTextList,
  parsePlainTextListToParagraphs,
  parseHtmlToDocxRuns,
  formatDateRange,
  exactLineSpacing,
  trackingSpacing,
  NO_TEXT_LINE,
  type DocxGeneratorSettings,
} from './docx-helpers'
import {
  FORMATTED_LIST_INDENT_PX,
  FORMATTED_LIST_MARKER_EM,
  PREVIEW_FONT_METRICS,
  bareInlineFormatTags,
  baselineRaise,
  formattedBlocks,
  resolvePreviewFont,
} from './docx-preview-metrics'
import { DOCX_PALETTE } from './docx-palette'
import { docxTranslucentText } from './docx-text-opacity'
import { PAGE_HEIGHT_INCHES, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import {
  FORMATTED_CONTENT_LINE_HEIGHT,
  PROFESSIONAL_LINE_HEIGHT,
  formattedTextLineHeight,
  rendersAsFormattedContent,
} from '@/lib/resume-line-height'
import {
  assertExhaustiveSection,
  type EditorMainId,
  type EditorSidebarId,
} from '@/lib/layout-settings'

/**
 * Every text run and rule the Preview draws in a colour of its own (US-003).
 * The sidebar text it draws at `opacity-80` over the user's colour is not a
 * colour of its own: it is composited per request (US-006, below).
 */
const PALETTE = DOCX_PALETTE.professional

/** The letter spacing the Preview draws, in em, applied at the size of each run (US-005). */
const TRACKING = PREVIEW_TRACKING.professional

// ============================================================
// FONT SIZE CONSTANTS (matching professional-template.tsx)
// ============================================================
export const FONT_SIZES = {
  NAME: 22,                    // Candidate name
  PROFESSIONAL_TITLE: 22,     // Professional title
  SECTION_TITLE: 14.5,        // Section titles (sidebar)
  RESUME_SECTION_TITLE: 14,   // Main content section titles
  JOB_TITLE: 13,              // Job/role titles
  BODY: 11,                   // Body text
  META: 11,                   // Dates, companies
  SKILL_CATEGORY: 13,         // Skill category names
  CONTACT: 10.5,              // Contact information
}

/**
 * The Preview's line heights (US-004), from the module the template itself
 * imports them from. Headings, the name and entry titles draw at `heading`;
 * every other element at `body`; formatted (HTML) text at `.formatted-content`'s
 * height, through `formattedTextLineHeight`.
 */
const LINE_HEIGHT = PROFESSIONAL_LINE_HEIGHT

/**
 * The browser's `text-transform: capitalize`, which every Professional section
 * heading draws with: the first letter of each word upper-cased. The headings'
 * words are separated by spaces in every locale.
 */
function capitalizeWords(text: string, locale: string): string {
  return text.replace(/(^|\s)(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toLocaleUpperCase(locale))
}

/**
 * Spacing in px, converted to twips at use. These MUST match the Preview.
 *
 * TITLE_GAP AND SECTION_GAP ARE DELIBERATELY NOT READ FROM THE SHARED MODEL.
 *
 * `DEFAULT_RESUME_LAYOUT` carries `titleGap: 8` and `sectionGap: 12`, the same
 * two numbers, which makes them look like duplicated defaults waiting to be
 * replaced by a reference. They are not, for two independent reasons, and
 * substituting the reference would be a regression in both:
 *
 *  1. `professional-template.tsx:57-58` hardcodes the identical pair and takes
 *     no `titleGap`/`sectionGap` prop at all — Part 1's finding D-6. Pointing
 *     this file at the model while the Preview stays fixed means the day
 *     anyone retunes the shared default, the DOCX moves and the Preview does
 *     not. That is a NEW Preview/DOCX divergence, which this part's FAIL
 *     conditions forbid and `.claude/rules/exports.md` makes the contract.
 *
 *  2. There is no transport for a user's own value even if both surfaces did
 *     honour it: `DocxGeneratorSettings` declares no gap keys — Part 1's D-4 —
 *     so the reference could only ever resolve to the default, never to what
 *     the resume actually stores. It would state a dependency that does not
 *     exist.
 *
 * Moving these two is a paired change to this file AND the React template, and
 * belongs to whatever story decides the gap controls should work. It is not a
 * cleanup to be done in passing here.
 *
 * The remaining three mirror Tailwind classes in the Preview, not model
 * properties; the model has no key for any of them.
 */
const SPACING = {
  TITLE_GAP: 8,
  SECTION_GAP: 12,              // marginBottom on section titles
  SECTION_MARGIN_BOTTOM: 32,    // mb-8 in Preview = 32px (2rem)
  ITEM_SPACING: 16,             // space-y-4 between items
  EXPERIENCE_ITEM_SPACING: 24,  // space-y-6 between experience items
}

/**
 * The section vocabulary, taken from the shared layout model rather than
 * restated here.
 *
 * These were two independent unions naming the ids the model already defines.
 * A local copy compiles happily while the model moves underneath it, so the
 * generator could render a section list that no longer matches the Preview's.
 * Aliasing gives two guarantees, and they are not symmetric:
 *
 *  - REMOVING or RENAMING an id in the model breaks this file on its own: the
 *    case clauses below stop naming members of the union, and each one fails
 *    with TS2678 — `Type '"training"' is not comparable to type
 *    '"keyAchievements" | "skills" | "languages"'`. (Verified by deleting
 *    `training` from `VALID_SIDEBAR_IDS` and running `pnpm typecheck`.)
 *
 *  - ADDING an id is caught only because the dispatches below are `switch`
 *    statements ending in `assertExhaustiveSection`. The alias alone would not
 *    catch it: `DocxGeneratorSettings` types the order arrays as `string[]`
 *    (`docx-helpers.ts:26-29`), so the casts at the top of the generator are
 *    unchecked in both directions, and an `if`-chain has no notion of being
 *    complete. A new id would have flowed through the cast, matched no branch,
 *    and vanished from the export while the Preview showed it.
 *
 * `professional-template.tsx` aliases the same two types for the same reason,
 * so the Preview and the DOCX now take their section names from one place.
 */
type SidebarSectionId = EditorSidebarId
type MainContentSectionId = EditorMainId

// ============================================================
// PROFESSIONAL TEMPLATE DOCX GENERATOR
// ============================================================

/**
 * Generate a DOCX buffer for the Professional template.
 * This is a direct extraction from the original monolithic route handler —
 * the output is byte-identical to the previous implementation.
 */
export async function generateProfessionalDocx(
  resume: any,
  settings: DocxGeneratorSettings
): Promise<Buffer> {
  const {
    fontFamily,
    fontScale,
    locale,
    sidebarHue,
    sidebarBrightness,
    sidebarWidth: sidebarWidthPercent,
    sidebarTopMargin,
    mainContentTopMargin,
    sidebarOrder: sidebarOrderRaw,
    mainContentOrder: mainContentOrderRaw,
    hiddenSidebarSections: hiddenSidebarRaw,
    hiddenMainSections: hiddenMainRaw,
  } = settings

  // Cast section ID arrays to their specific union types
  const sidebarOrder = sidebarOrderRaw as SidebarSectionId[]
  const mainContentOrder = mainContentOrderRaw as MainContentSectionId[]
  const hiddenSidebarSections = hiddenSidebarRaw as SidebarSectionId[]
  const hiddenMainSections = hiddenMainRaw as MainContentSectionId[]

  // Load translations
  const dict = getTranslations(locale as Locale, 'common')

  const contact = resume.contact || {}

  // Filter visible items only (matching Preview behavior)
  const experiences = (resume.experience || []).filter((exp: any) => exp.visible !== false)
  const education = (resume.education || []).filter((edu: any) => edu.visible !== false)
  const skills = (resume.skills || []).filter((skill: any) => skill.visible !== false)
  const certifications = (resume.certifications || []).filter((cert: any) => cert.visible !== false)
  const projects = (resume.projects || []).filter((project: any) => project.visible !== false)
  const languages = (resume.languages || []).filter((lang: any) => lang.visible !== false)

  // Key Achievements from projects (matching Preview)
  const keyAchievements = projects.map((project: any) => ({
    title: project.name || '',
    description: project.description || ''
  }))

  // Calculate sidebar color from hue, saturation, and brightness.
  //
  // All three components come from the model. A `?? DEFAULT_RESUME_LAYOUT
  // .sidebarSaturation` stood on the middle one and could never fire —
  // `DocxGeneratorSettings.sidebarSaturation` is a required number, so the
  // route always supplies it — which made it a generator-side default for a
  // value the model already carries, the thing FR-4 forbids. Removing it also
  // makes the type system the guard: were the field ever made optional, this
  // line would fail to compile rather than quietly resolve to a colour the
  // Preview is not showing.
  const sidebarColorHex = hslToHex(sidebarHue, settings.sidebarSaturation, sidebarBrightness)

  /**
   * The key-achievement descriptions, skill items and language levels the
   * Preview draws at `opacity-80` inside the `text-white` sidebar (US-006).
   * A DOCX run carries no alpha, so each is written in the colour that
   * translucency composites to over the sidebar fill this document draws.
   */
  const sidebarSecondaryColor = docxTranslucentText('professional', 'sidebarSecondary', sidebarColorHex)

  // Calculate scaled font sizes
  const scaledFontSizes = {
    name: pxToHalfPoints(FONT_SIZES.NAME * fontScale),
    professionalTitle: pxToHalfPoints(FONT_SIZES.PROFESSIONAL_TITLE * fontScale),
    sectionTitle: pxToHalfPoints(FONT_SIZES.SECTION_TITLE * fontScale),
    resumeSectionTitle: pxToHalfPoints(FONT_SIZES.RESUME_SECTION_TITLE * fontScale),
    jobTitle: pxToHalfPoints(FONT_SIZES.JOB_TITLE * fontScale),
    body: pxToHalfPoints(FONT_SIZES.BODY * fontScale),
    meta: pxToHalfPoints(FONT_SIZES.META * fontScale),
    skillCategory: pxToHalfPoints(FONT_SIZES.SKILL_CATEGORY * fontScale),
    contact: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale),
  }

  // The same sizes unrounded, in half-points. A run's size must be whole
  // half-points, but the Preview's line box is its px size times the line
  // height: 11px body text is 16.5 half-points, and rounding it to 17 before
  // multiplying drew every body line 0.5px taller than the Preview, a drift of
  // 10px by the bottom of the sidebar (measured in Word's render). Line
  // heights, the width scale, the baseline shift and letter spacing use these:
  // the width scale draws each glyph at the Preview's advance, and Word adds
  // character spacing after scaling, so the em of tracking is taken of the
  // Preview's size too.
  const lineFontSizes = {
    name: FONT_SIZES.NAME * fontScale * 1.5,
    professionalTitle: FONT_SIZES.PROFESSIONAL_TITLE * fontScale * 1.5,
    sectionTitle: FONT_SIZES.SECTION_TITLE * fontScale * 1.5,
    resumeSectionTitle: FONT_SIZES.RESUME_SECTION_TITLE * fontScale * 1.5,
    jobTitle: FONT_SIZES.JOB_TITLE * fontScale * 1.5,
    body: FONT_SIZES.BODY * fontScale * 1.5,
    meta: FONT_SIZES.META * fontScale * 1.5,
    skillCategory: FONT_SIZES.SKILL_CATEGORY * fontScale * 1.5,
    contact: FONT_SIZES.CONTACT * fontScale * 1.5,
  }

  // A run rounded to whole half-points draws every glyph that much wider or
  // narrower than the Preview's px size (11px written as 17 half-points is 3%
  // wide), and Word then breaks lines at different words. Each run is scaled
  // horizontally (w:w, whole percent) back to the Preview's advance widths.
  const widthScale = (exact: number, run: number) => Math.round((100 * exact) / run)
  const widthScales = Object.fromEntries(
    (Object.keys(scaledFontSizes) as (keyof typeof scaledFontSizes)[]).map((key) => [
      key,
      widthScale(lineFontSizes[key], scaledFontSizes[key]),
    ])
  ) as Record<keyof typeof scaledFontSizes, number>

  // Word and the browser put a line's baseline in different places, so the
  // same line box draws its text at different heights (measured: Word's
  // render vs Chromium, every font in the picker, 9 sizes, both line heights).
  // Every Word line drew 0.3–2.2px lower than the Preview's, by an amount that
  // depends on its size and line height. Each run is raised by the difference
  // (`baselineRaise`). A row of two Preview boxes in one Word line passes that
  // line, the row's tallest.
  const previewFont = resolvePreviewFont(fontFamily)
  const previewMetrics = previewFont.metrics
  const baselineShift = (
    key: keyof typeof scaledFontSizes,
    lineHeight: number,
    wordLine: number = exactLineSpacing([lineHeight, lineFontSizes[key]]).line
  ): UniversalMeasure => baselineRaise(previewMetrics, lineFontSizes[key] / 1.5, lineHeight, wordLine)

  // The entry rows of Experience and Education: the h3 at heading height beside
  // the dates at body height, one flex row in the Preview and one Word line.
  const entryRowLine = exactLineSpacing(
    [LINE_HEIGHT.heading, lineFontSizes.jobTitle],
    [LINE_HEIGHT.body, lineFontSizes.meta]
  )

  // Every underlined heading draws pb-1 + a 1px border under its line in the
  // Preview: 5px. Word takes a bottom border's space in whole points only, so
  // the heading's border is 2pt of space plus a size-6 (3/4pt) rule, and the
  // rest of the 5px goes into the heading's space after.
  const HEADING_BORDER_SPACE_PT = 2
  const HEADING_BORDER_SIZE = 6 // eighths of a point
  const HEADING_BORDER_COMPENSATION =
    pxToTwips(4 + 1) - HEADING_BORDER_SPACE_PT * 20 - (HEADING_BORDER_SIZE / 8) * 20

  // The family every run is written in: the one the metrics above are of.
  const primaryFont = previewFont.name

  // Formatted (HTML) text draws at `.formatted-content`'s line height, so its
  // runs take the raise for that line, not the body default's.
  const formattedLine = exactLineSpacing([FORMATTED_CONTENT_LINE_HEIGHT, lineFontSizes.body])
  const formattedShift = baselineShift('body', FORMATTED_CONTENT_LINE_HEIGHT)
  const formattedMarkerHang = pxToTwips(FORMATTED_LIST_MARKER_EM * FONT_SIZES.BODY * fontScale)

  /**
   * The paragraphs of a formatted (HTML) text block in body type: one per
   * block `formattedBlocks` finds, stacked with no gap, the last one carrying
   * the space after the whole element. An element with no text still keeps
   * that space, as the Preview's empty box does.
   */
  const formattedParagraphs = (
    html: string,
    color: string,
    containerAlignment: (typeof AlignmentType)[keyof typeof AlignmentType],
    spacingAfter: number
  ): Paragraph[] => {
    const blocks = formattedBlocks(html)
    if (blocks.length === 0) return [new Paragraph({ spacing: { after: spacingAfter, ...NO_TEXT_LINE } })]
    const run = { size: scaledFontSizes.body, scale: widthScales.body, color, font: primaryFont, position: formattedShift }
    return blocks.map((block, i) => {
      const left = pxToTwips(FORMATTED_LIST_INDENT_PX * block.depth)
      return new Paragraph({
        children: [
          ...(block.marker === null ? [] : [new TextRun({ ...run, text: `${block.marker}\t` })]),
          ...parseHtmlToDocxRuns(bareInlineFormatTags(block.html), run),
        ],
        spacing: { after: i === blocks.length - 1 ? spacingAfter : 0, ...formattedLine },
        // A list item's marker hangs outside its text, which starts — and wraps — at the list's indent.
        indent: block.depth === 0 ? undefined : { left, hanging: block.marker === null ? 0 : formattedMarkerHang },
        alignment: block.alignment ?? containerAlignment,
      })
    })
  }

  // Calculate page dimensions for layout
  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const sidebarWidthTwips = Math.round(pageWidthTwips * (sidebarWidthPercent / 100))
  const mainContentWidthTwips = pageWidthTwips - sidebarWidthTwips

  // Main content cell margins: the Preview's p-8, exactly 32px. (0.33" was
  // 475 twips, 31.67px, which started the main column 0.33px high.)
  const mainCellMargin = pxToTwips(32)

  // Right-aligned dates and locations: the Preview's rows are `justify-between`
  // inside p-8, so they end on the column's right edge. (A 0.1" buffer ended
  // them 9.6px short of the Preview's in Word's render.)
  const mainContentTextWidth = mainContentWidthTwips - (mainCellMargin * 2)
  const rightTabPosition = mainContentTextWidth

  // The sidebar's p-6, and the right edge of its text for the language rows'
  // `justify-between`. A tab at TabStopPosition.MAX is not clamped to the cell
  // in Word 2010 layout (below): it drew each level in the main column.
  const sidebarCellMargin = convertInchesToTwip(0.25)
  const sidebarTextRight = sidebarWidthTwips - sidebarCellMargin * 2

  // An experience bullet is `flex gap-2`: the "•", then the text, so every line
  // of the text starts — and wraps — after the bullet's advance plus 8px. A
  // family the metric table does not know takes Arial's advance.
  const bulletAdvanceEm = (previewMetrics ?? PREVIEW_FONT_METRICS.arial).bullet
  const achievementTextIndent = pxToTwips(bulletAdvanceEm * FONT_SIZES.BODY * fontScale + 8)

  // No right indentation beyond the cell margin: the Preview's main text runs
  // the full width inside p-8, and an extra 0.15" made Word wrap the main
  // column at different words than the Preview does.
  const mainContentRightIndent = 0

  // Word does not keep two different cell top margins in one row: measured in
  // Word's own render, the sidebar started at the main cell's 0.33" instead of
  // its own 0.25", 8px lower than the Preview. Both cells therefore get the
  // sidebar's top margin, and the main column's extra top padding becomes space
  // before its first paragraph.
  const cellTopMargin = convertInchesToTwip(0.25)
  const mainFirstParagraphBefore = mainCellMargin - cellTopMargin

  // ============================================================
  // BUILD SIDEBAR CONTENT
  // ============================================================
  const sidebarParagraphs: Paragraph[] = []

  const sidebarSpacingTwips = pxToTwips(sidebarTopMargin)

  // Contact Name with sidebarTopMargin gap after
  sidebarParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: contact.name || 'Your Name',
          bold: true,
          size: scaledFontSizes.name,
          scale: widthScales.name,
          position: baselineShift('name', LINE_HEIGHT.heading),
          color: PALETTE.white,
          font: primaryFont,
        }),
      ],
      spacing: {
        after: sidebarSpacingTwips,
        ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.name]),
      },
    })
  )

  // Render sidebar sections in order, respecting visibility
  const visibleSidebarSections = sidebarOrder.filter(
    sectionId => !hiddenSidebarSections.includes(sectionId)
  )

  visibleSidebarSections.forEach((sectionId, index) => {
    const isLastSection = index === visibleSidebarSections.length - 1
    const sectionSpacingAfter = isLastSection ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM)

    switch (sectionId) {
      case 'keyAchievements': {
        if (keyAchievements.length > 0) {
          // Section title with underline
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: capitalizeWords((dict as any).resumes?.template?.keyAchievements || 'Key Achievements', locale),
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  scale: widthScales.sectionTitle,
                  position: baselineShift('sectionTitle', LINE_HEIGHT.heading),
                  color: PALETTE.white,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, lineFontSizes.sectionTitle),
                }),
              ],
              // mb-4 in Preview
              spacing: { after: pxToTwips(16) + HEADING_BORDER_COMPENSATION, ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.sectionTitle]) },
              border: {
                bottom: {
                  color: PALETTE.white,
                  space: HEADING_BORDER_SPACE_PT,
                  style: BorderStyle.SINGLE,
                  size: HEADING_BORDER_SIZE,
                },
              },
            })
          )

          // Achievement items - space-y-4 (16px) in Preview
          keyAchievements.forEach((achievement: any, i: number) => {
            const isLastItem = i === keyAchievements.length - 1
            // Last item of section gets section margin (32px), others get item spacing (16px)
            const itemEndSpacing = isLastItem
              ? (isLastSection ? 0 : sectionSpacingAfter)
              : pxToTwips(16)

            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: achievement.title,
                    bold: true,
                    size: scaledFontSizes.jobTitle,
                    scale: widthScales.jobTitle,
                    position: baselineShift('jobTitle', LINE_HEIGHT.heading),
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                spacing: {
                  after: achievement.description ? pxToTwips(4) : itemEndSpacing,
                  ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.jobTitle]),
                },
              })
            )
            if (achievement.description) {
              const descriptionLineSpacing = exactLineSpacing([
                formattedTextLineHeight(achievement.description, LINE_HEIGHT.body),
                lineFontSizes.body,
              ])
              // Extract alignment from HTML if present. The fallback is LEFT, not
              // JUSTIFIED, to match the Preview's narrow sidebar column.
              const descriptionAlignment = extractAlignment(achievement.description) || AlignmentType.LEFT

              // Formatted (HTML) text: every <p>, line and list item, at .formatted-content's height.
              if (rendersAsFormattedContent(achievement.description)) {
                sidebarParagraphs.push(...formattedParagraphs(achievement.description, sidebarSecondaryColor, AlignmentType.LEFT, itemEndSpacing))
              } else if (isPlainTextList(achievement.description)) {
                sidebarParagraphs.push(
                  ...parsePlainTextListToParagraphs(
                    achievement.description,
                    {
                      size: scaledFontSizes.body,
                      color: sidebarSecondaryColor,
                      font: primaryFont,
                    },
                    {
                      spacingAfterItem: pxToTwips(4),
                      spacingAfterLast: itemEndSpacing,
                      alignment: descriptionAlignment,
                      lineSpacing: descriptionLineSpacing,
                    }
                  )
                )
              } else {
                // Plain text: one paragraph
                const descriptionRuns = parseHtmlToDocxRuns(achievement.description, {
                  size: scaledFontSizes.body,
                  color: sidebarSecondaryColor,
                  font: primaryFont,
                })

                sidebarParagraphs.push(
                  new Paragraph({
                    children: descriptionRuns,
                    spacing: { after: itemEndSpacing, ...descriptionLineSpacing },
                    alignment: descriptionAlignment,
                  })
                )
              }
            }
          })
        }
        break
      }

      case 'skills': {
        if (skills.filter((s: any) => s.category && (s.skillsHtml || s.items?.length > 0)).length > 0) {
          // Section title
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: capitalizeWords((dict as any).resumes?.template?.skills || 'Skills', locale),
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  scale: widthScales.sectionTitle,
                  position: baselineShift('sectionTitle', LINE_HEIGHT.heading),
                  color: PALETTE.white,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, lineFontSizes.sectionTitle),
                }),
              ],
              // mb-4 in Preview
              spacing: { after: pxToTwips(16) + HEADING_BORDER_COMPENSATION, ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.sectionTitle]) },
              border: {
                bottom: {
                  color: PALETTE.white,
                  space: HEADING_BORDER_SPACE_PT,
                  style: BorderStyle.SINGLE,
                  size: HEADING_BORDER_SIZE,
                },
              },
            })
          )

          // Skill categories - mb-3 (12px) in Preview
          const validSkills = skills.filter((s: any) => s.category && (s.skillsHtml || s.items?.length > 0))
          validSkills.forEach((skillCat: any, i: number) => {
            const isLastItem = i === validSkills.length - 1
            // Last item of section gets section margin (32px), others get item spacing (12px)
            const itemEndSpacing = isLastItem
              ? (isLastSection ? 0 : sectionSpacingAfter)
              : pxToTwips(12)

            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${skillCat.category}:`,
                    bold: true,
                    size: scaledFontSizes.skillCategory,
                    scale: widthScales.skillCategory,
                    position: baselineShift('skillCategory', LINE_HEIGHT.body),
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                // mb-1 in Preview
                spacing: { after: pxToTwips(4), ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.skillCategory]) },
              })
            )

            // Use skillsHtml if available, otherwise fall back to items array
            if (skillCat.skillsHtml) {
              const skillsLineSpacing = exactLineSpacing([
                formattedTextLineHeight(skillCat.skillsHtml, LINE_HEIGHT.body),
                lineFontSizes.body,
              ])
              // Extract alignment from HTML if present
              // Plain text renders through formatText, which justifies its blocks.
              const skillsAlignment = AlignmentType.JUSTIFIED

              // Formatted (HTML) text: every <p>, line and list item, at .formatted-content's height.
              if (rendersAsFormattedContent(skillCat.skillsHtml)) {
                sidebarParagraphs.push(...formattedParagraphs(skillCat.skillsHtml, sidebarSecondaryColor, AlignmentType.LEFT, itemEndSpacing))
              } else if (isPlainTextList(skillCat.skillsHtml)) {
                sidebarParagraphs.push(
                  ...parsePlainTextListToParagraphs(
                    skillCat.skillsHtml,
                    {
                      size: scaledFontSizes.body,
                      color: sidebarSecondaryColor,
                      font: primaryFont,
                    },
                    {
                      spacingAfterItem: pxToTwips(4),
                      spacingAfterLast: itemEndSpacing,
                      alignment: skillsAlignment,
                      lineSpacing: skillsLineSpacing,
                    }
                  )
                )
              } else {
                // Plain text: one paragraph
                const skillsRuns = parseHtmlToDocxRuns(skillCat.skillsHtml, {
                  size: scaledFontSizes.body,
                  color: sidebarSecondaryColor,
                  font: primaryFont,
                })

                sidebarParagraphs.push(
                  new Paragraph({
                    children: skillsRuns,
                    spacing: { after: itemEndSpacing, ...skillsLineSpacing },
                    alignment: skillsAlignment,
                  })
                )
              }
            } else {
              sidebarParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: skillCat.items.join(' • '),
                      size: scaledFontSizes.body,
                      scale: widthScales.body,
                      position: baselineShift('body', LINE_HEIGHT.body),
                      color: sidebarSecondaryColor,
                      font: primaryFont,
                    }),
                  ],
                  spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.body]) },
                  // The Preview's `text-align: justify` is on an inline span, where it does
                  // nothing: the list draws left-aligned like the rest of the sidebar.
                  alignment: AlignmentType.LEFT,
                })
              )
            }
          })
        }
        break
      }

      case 'languages': {
        if (languages.length > 0) {
          // Section title
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: capitalizeWords((dict as any).resumes?.template?.languages || 'Languages', locale),
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  scale: widthScales.sectionTitle,
                  position: baselineShift('sectionTitle', LINE_HEIGHT.heading),
                  color: PALETTE.white,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, lineFontSizes.sectionTitle),
                }),
              ],
              // mb-4 in Preview
              spacing: { after: pxToTwips(16) + HEADING_BORDER_COMPENSATION, ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.sectionTitle]) },
              border: {
                bottom: {
                  color: PALETTE.white,
                  space: HEADING_BORDER_SPACE_PT,
                  style: BorderStyle.SINGLE,
                  size: HEADING_BORDER_SIZE,
                },
              },
            })
          )

          // Language items - space-y-2 (8px) in Preview
          languages.forEach((lang: any, i: number) => {
            const isLastItem = i === languages.length - 1
            // Last item of section gets section margin (32px), others get item spacing (8px)
            const itemEndSpacing = isLastItem
              ? (isLastSection ? 0 : sectionSpacingAfter)
              : pxToTwips(8)

            const levelText = (dict as any).resumes?.editor?.levels?.[lang.level?.toLowerCase()] || lang.level
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: lang.language,
                    size: scaledFontSizes.body,
                    scale: widthScales.body,
                    position: baselineShift('body', LINE_HEIGHT.body),
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                  new TextRun({
                    text: '\t' + levelText,
                    size: scaledFontSizes.body,
                    scale: widthScales.body,
                    position: baselineShift('body', LINE_HEIGHT.body),
                    color: sidebarSecondaryColor,
                    font: primaryFont,
                  }),
                ],
                spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.body]) },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: sidebarTextRight,
                  },
                ],
              })
            )
          })
        }
        break
      }

      case 'training': {
        if (certifications.length > 0) {
          // Section title
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: capitalizeWords((dict as any).resumes?.template?.training || 'Training', locale),
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  scale: widthScales.sectionTitle,
                  position: baselineShift('sectionTitle', LINE_HEIGHT.heading),
                  color: PALETTE.white,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, lineFontSizes.sectionTitle),
                }),
              ],
              // mb-4 in Preview
              spacing: { after: pxToTwips(16) + HEADING_BORDER_COMPENSATION, ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.sectionTitle]) },
              border: {
                bottom: {
                  color: PALETTE.white,
                  space: HEADING_BORDER_SPACE_PT,
                  style: BorderStyle.SINGLE,
                  size: HEADING_BORDER_SIZE,
                },
              },
            })
          )

          // Certification items - space-y-4 (16px) in Preview
          const visibleCerts = certifications.slice(0, 3)
          visibleCerts.forEach((cert: any, i: number) => {
            const isLastItem = i === visibleCerts.length - 1
            // Last item of section gets section margin (32px), others get item spacing (16px)
            const itemEndSpacing = isLastItem
              ? (isLastSection ? 0 : sectionSpacingAfter)
              : pxToTwips(16)

            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: cert.name,
                    bold: true,
                    size: scaledFontSizes.jobTitle,
                    scale: widthScales.jobTitle,
                    position: baselineShift('jobTitle', LINE_HEIGHT.heading),
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                // mb-1 in Preview
                spacing: { after: pxToTwips(4), ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.jobTitle]) },
              })
            )
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: cert.issuer,
                    size: scaledFontSizes.meta,
                    scale: widthScales.meta,
                    position: baselineShift('meta', LINE_HEIGHT.body),
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                spacing: {
                  after: cert.date ? 0 : itemEndSpacing, // the Preview stacks issuer and date with no gap
                  ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.meta]),
                },
              })
            )
            if (cert.date) {
              sidebarParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: new Date(cert.date + '-01').toLocaleDateString(locale as Locale, {
                        month: 'long',
                        year: 'numeric',
                      }),
                      size: scaledFontSizes.meta,
                      scale: widthScales.meta,
                      position: baselineShift('meta', LINE_HEIGHT.body),
                      color: PALETTE.white,
                      font: primaryFont,
                    }),
                  ],
                  spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.meta]) },
                })
              )
            }
          })
        }
        break
      }
      default:
        assertExhaustiveSection(sectionId)
    }
  })

  // ============================================================
  // BUILD MAIN CONTENT
  // ============================================================
  const mainContentParagraphs: Paragraph[] = []

  // Header: Professional Title
  mainContentParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: resume.title || 'PROFESSIONAL TITLE',
          bold: true,
          size: scaledFontSizes.professionalTitle,
          scale: widthScales.professionalTitle,
          position: baselineShift('professionalTitle', LINE_HEIGHT.heading),
          color: PALETTE.heading,
          font: primaryFont,
          characterSpacing: trackingSpacing(TRACKING.title, lineFontSizes.professionalTitle),
        }),
      ],
      spacing: {
        before: mainFirstParagraphBefore,
        after: pxToTwips(SPACING.TITLE_GAP),
        ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.professionalTitle]),
      },
    })
  )

  // Contact Information (horizontal layout with emojis)
  const contactItems: { icon: string; text: string }[] = []
  if (contact.email) contactItems.push({ icon: '✉️', text: contact.email })
  if (contact.phone) contactItems.push({ icon: '📞', text: contact.phone })
  if (contact.location) contactItems.push({ icon: '📍', text: contact.location })
  if (contact.linkedin) contactItems.push({ icon: '🔗', text: contact.linkedin })
  if (contact.github) contactItems.push({ icon: '💻', text: contact.github })
  if (contact.website) contactItems.push({ icon: '🌐', text: contact.website })

  if (contactItems.length > 0) {
    // The Preview lays the items out as `flex flex-wrap gap-x-4 gap-y-1`, each
    // item `flex gap-1.5` of its icon and its text: an item never breaks
    // inside, items sit 16px apart, an icon 6px before its text, and wrapped
    // rows 4px apart. Non-breaking spaces keep each item whole; between items
    // a breakable space is widened to 16px, and the icon's non-breaking space
    // to 6px, by character spacing. The row gap goes into every line's exact
    // height and is taken back once from the space after, so n rows measure n
    // lines plus n - 1 gaps, as in the Preview.
    const contactRowGap = pxToTwips(4)
    const contactLine = exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.contact])
    const contactSpacePx = (previewMetrics ?? PREVIEW_FONT_METRICS.arial).space * FONT_SIZES.CONTACT * fontScale
    const contactRun = {
      size: scaledFontSizes.contact,
      scale: widthScales.contact,
      position: baselineShift('contact', LINE_HEIGHT.body, contactLine.line + contactRowGap),
      color: PALETTE.meta,
      font: primaryFont,
    }
    mainContentParagraphs.push(
      new Paragraph({
        children: contactItems.flatMap(({ icon, text }, i) => [
          ...(i === 0 ? [] : [new TextRun({ ...contactRun, text: ' ', characterSpacing: pxToTwips(16 - contactSpacePx) })]),
          new TextRun({ ...contactRun, text: icon }),
          new TextRun({ ...contactRun, text: '\u00A0', characterSpacing: pxToTwips(6 - contactSpacePx) }),
          new TextRun({ ...contactRun, text: text.replace(/ /g, '\u00A0') }),
        ]),
        spacing: {
          after: pxToTwips(24 + mainContentTopMargin) - contactRowGap,
          ...contactLine,
          line: contactLine.line + contactRowGap,
        },
      })
    )
  } else {
    // Even without contact info, we need the same gap as Preview's pb-6 + marginBottom.
    // This paragraph carries only that gap; the Preview draws no line here.
    mainContentParagraphs.push(
      new Paragraph({
        spacing: { after: pxToTwips(24 + mainContentTopMargin), ...NO_TEXT_LINE },
      })
    )
  }

  // Render main content sections in order, respecting visibility
  const visibleMainSections = mainContentOrder.filter(
    sectionId => !hiddenMainSections.includes(sectionId)
  )

  visibleMainSections.forEach((sectionId, index) => {
    const isLastSection = index === visibleMainSections.length - 1
    const sectionSpacingAfter = isLastSection ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM)

    switch (sectionId) {
      case 'summary': {
        if (resume.summary) {
          // Section title with underline
          mainContentParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: capitalizeWords((dict as any).resumes?.template?.summary || 'Summary', locale),
                  bold: true,
                  size: scaledFontSizes.resumeSectionTitle,
                  scale: widthScales.resumeSectionTitle,
                  position: baselineShift('resumeSectionTitle', LINE_HEIGHT.heading),
                  color: PALETTE.heading,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, lineFontSizes.resumeSectionTitle),
                }),
              ],
              spacing: {
                after: pxToTwips(SPACING.SECTION_GAP) + HEADING_BORDER_COMPENSATION,
                ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.resumeSectionTitle]),
              },
              border: {
                bottom: {
                  color: PALETTE.heading,
                  space: HEADING_BORDER_SPACE_PT,
                  style: BorderStyle.SINGLE,
                  size: HEADING_BORDER_SIZE,
                },
              },
            })
          )

          // Extract alignment from HTML if present
          const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.JUSTIFIED
          const summaryLineSpacing = exactLineSpacing([
            formattedTextLineHeight(resume.summary, LINE_HEIGHT.body),
            lineFontSizes.body,
          ])

          // Formatted (HTML) text: every <p>, line and list item, at .formatted-content's height.
          if (rendersAsFormattedContent(resume.summary)) {
            mainContentParagraphs.push(...formattedParagraphs(resume.summary, PALETTE.body, AlignmentType.JUSTIFIED, sectionSpacingAfter))
          } else if (isPlainTextList(resume.summary)) {
            mainContentParagraphs.push(
              ...parsePlainTextListToParagraphs(
                resume.summary,
                {
                  size: scaledFontSizes.body,
                  color: PALETTE.body,
                  font: primaryFont,
                },
                {
                  spacingAfterItem: pxToTwips(4),
                  spacingAfterLast: sectionSpacingAfter,
                  indent: { right: mainContentRightIndent },
                  alignment: summaryAlignment,
                  lineSpacing: summaryLineSpacing,
                }
              )
            )
          } else {
            // Plain text: one paragraph
            const summaryRuns = parseHtmlToDocxRuns(resume.summary, {
              size: scaledFontSizes.body,
              color: PALETTE.body,
              font: primaryFont,
            })

            mainContentParagraphs.push(
              new Paragraph({
                children: summaryRuns,
                alignment: summaryAlignment,
                indent: { right: mainContentRightIndent },
                spacing: {
                  after: sectionSpacingAfter,
                  ...summaryLineSpacing,
                },
              })
            )
          }
        }
        break
      }

      case 'experience': {
        if (experiences.length > 0) {
          // Section title
          mainContentParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: capitalizeWords((dict as any).resumes?.template?.experience || 'Experience', locale),
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  scale: widthScales.sectionTitle,
                  position: baselineShift('sectionTitle', LINE_HEIGHT.heading),
                  color: PALETTE.heading,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, lineFontSizes.sectionTitle),
                }),
              ],
              spacing: {
                after: pxToTwips(SPACING.SECTION_GAP) + HEADING_BORDER_COMPENSATION,
                ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.sectionTitle]),
              },
              border: {
                bottom: {
                  color: PALETTE.heading,
                  space: HEADING_BORDER_SPACE_PT,
                  style: BorderStyle.SINGLE,
                  size: HEADING_BORDER_SIZE,
                },
              },
            })
          )

          // Experience items
          experiences.forEach((exp: any, i: number) => {
            const isLast = i === experiences.length - 1

            // Position + Date
            mainContentParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: exp.position || '',
                    bold: true,
                    size: scaledFontSizes.jobTitle,
                    scale: widthScales.jobTitle,
                    position: baselineShift('jobTitle', LINE_HEIGHT.heading, entryRowLine.line),
                    color: PALETTE.heading,
                    font: primaryFont,
                  }),
                  new TextRun({
                    text: '\t' + formatDateRange(exp.startDate, exp.endDate, exp.current, locale as Locale, dict),
                    size: scaledFontSizes.meta,
                    scale: widthScales.meta,
                    position: baselineShift('meta', LINE_HEIGHT.body, entryRowLine.line),
                    color: PALETTE.date,
                    font: primaryFont,
                  }),
                ],
                // One flex row in the Preview: the h3 at heading height beside the date at body height.
                spacing: {
                  after: pxToTwips(4),
                  ...entryRowLine,
                },
                indent: { right: mainContentRightIndent },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: rightTabPosition,
                  },
                ],
              })
            )

            // Company + Location
            mainContentParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: exp.company || '',
                    size: scaledFontSizes.meta,
                    scale: widthScales.meta,
                    position: baselineShift('meta', LINE_HEIGHT.body),
                    color: PALETTE.meta,
                    font: primaryFont,
                  }),
                  ...(exp.location ? [
                    new TextRun({
                      text: ` • ${exp.location}`,
                      size: scaledFontSizes.meta,
                      scale: widthScales.meta,
                      position: baselineShift('meta', LINE_HEIGHT.body),
                      color: PALETTE.meta,
                      font: primaryFont,
                    }),
                  ] : []),
                ],
                spacing: { after: pxToTwips(8), ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.meta]) },
                indent: { right: mainContentRightIndent },
              })
            )

            // Achievements or Description
            if (exp.achievements && exp.achievements.length > 0) {
              exp.achievements.forEach((achievement: string, j: number) => {
                const isLastAchievement = j === exp.achievements.length - 1
                // Parse achievement HTML to preserve formatting
                const achievementIsFormatted = rendersAsFormattedContent(achievement)
                const achievementShift = achievementIsFormatted ? formattedShift : baselineShift('body', LINE_HEIGHT.body)
                const achievementRuns = parseHtmlToDocxRuns(achievementIsFormatted ? bareInlineFormatTags(achievement) : achievement, {
                  size: scaledFontSizes.body,
                  color: PALETTE.body,
                  font: primaryFont,
                  // Plain text inherits the body default's raise; HTML is laid at its own line height.
                  ...(achievementIsFormatted ? { position: formattedShift } : {}),
                })

                // Calculate spacing after this achievement:
                // - Not last achievement: 4px (space-y-1)
                // - Last achievement, not last experience: 24px (space-y-6 between experiences)
                // - Last achievement, last experience, not last section: 32px (mb-8 between sections)
                // - Last achievement, last experience, last section: 0
                const achievementSpacingAfter = !isLastAchievement
                  ? pxToTwips(4)
                  : !isLast
                    ? pxToTwips(SPACING.EXPERIENCE_ITEM_SPACING)
                    : isLastSection
                      ? 0
                      : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM)

                mainContentParagraphs.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: '•\t',
                        size: scaledFontSizes.body,
                        scale: widthScales.body,
                        position: achievementShift,
                        color: PALETTE.heading,
                        font: primaryFont,
                      }),
                      ...achievementRuns,
                    ],
                    // The achievement's lines are spaced at its text's height: the li's
                    // body height, or the formatted-content height when it is HTML. The
                    // bullet beside it is a separate flex item no taller than either.
                    spacing: {
                      after: achievementSpacingAfter,
                      ...exactLineSpacing([formattedTextLineHeight(achievement, LINE_HEIGHT.body), lineFontSizes.body]),
                    },
                    // The bullet hangs; the tab takes the text to the indent on the first line.
                    indent: { left: achievementTextIndent, hanging: achievementTextIndent, right: mainContentRightIndent },
                    // Plain text renders through formatText's justified div; HTML through
                    // .formatted-content, which inherits the li's start alignment.
                    alignment: achievementIsFormatted
                      ? extractAlignment(achievement) || AlignmentType.LEFT
                      : AlignmentType.JUSTIFIED,
                  })
                )
              })
            } else if (exp.description) {
              // Calculate spacing after description:
              // - Not last experience: 24px (space-y-6 between experiences)
              // - Last experience, not last section: 32px (mb-8 between sections)
              // - Last experience, last section: 0
              const descSpacingAfter = !isLast
                ? pxToTwips(SPACING.EXPERIENCE_ITEM_SPACING)
                : isLastSection
                  ? 0
                  : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM)

              // Extract alignment from HTML if present
              const descAlignment = extractAlignment(exp.description) || AlignmentType.JUSTIFIED
              const descLineSpacing = exactLineSpacing([
                formattedTextLineHeight(exp.description, LINE_HEIGHT.body),
                lineFontSizes.body,
              ])

              // Formatted (HTML) text: every <p>, line and list item, at .formatted-content's height.
              if (rendersAsFormattedContent(exp.description)) {
                mainContentParagraphs.push(...formattedParagraphs(exp.description, PALETTE.body, AlignmentType.JUSTIFIED, descSpacingAfter))
              } else if (isPlainTextList(exp.description)) {
                mainContentParagraphs.push(
                  ...parsePlainTextListToParagraphs(
                    exp.description,
                    {
                      size: scaledFontSizes.body,
                      color: PALETTE.body,
                      font: primaryFont,
                    },
                    {
                      spacingAfterItem: pxToTwips(4),
                      spacingAfterLast: descSpacingAfter,
                      indent: { right: mainContentRightIndent },
                      alignment: descAlignment,
                      lineSpacing: descLineSpacing,
                    }
                  )
                )
              } else {
                // Plain text: one paragraph
                const descRuns = parseHtmlToDocxRuns(exp.description, {
                  size: scaledFontSizes.body,
                  color: PALETTE.body,
                  font: primaryFont,
                })

                mainContentParagraphs.push(
                  new Paragraph({
                    children: descRuns,
                    spacing: {
                      after: descSpacingAfter,
                      ...descLineSpacing,
                    },
                    alignment: descAlignment,
                    indent: { right: mainContentRightIndent },
                  })
                )
              }
            }
          })

          // Note: Section spacing is handled by the last item's spacing.after
          // Do NOT add an empty paragraph here - it causes double spacing
        }
        break
      }

      case 'education': {
        if (education.length > 0) {
          // Section title
          mainContentParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: capitalizeWords((dict as any).resumes?.template?.education || 'Education', locale),
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  scale: widthScales.sectionTitle,
                  position: baselineShift('sectionTitle', LINE_HEIGHT.heading),
                  color: PALETTE.heading,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, lineFontSizes.sectionTitle),
                }),
              ],
              spacing: {
                after: pxToTwips(SPACING.SECTION_GAP) + HEADING_BORDER_COMPENSATION,
                ...exactLineSpacing([LINE_HEIGHT.heading, lineFontSizes.sectionTitle]),
              },
              border: {
                bottom: {
                  color: PALETTE.heading,
                  space: HEADING_BORDER_SPACE_PT,
                  style: BorderStyle.SINGLE,
                  size: HEADING_BORDER_SIZE,
                },
              },
            })
          )

          // Education items
          education.forEach((edu: any, i: number) => {
            const isLast = i === education.length - 1
            const inText = (dict as any).resumes?.template?.in || 'in'

            // Degree + Field + Date
            mainContentParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: edu.degree || '',
                    bold: true,
                    size: scaledFontSizes.jobTitle,
                    scale: widthScales.jobTitle,
                    position: baselineShift('jobTitle', LINE_HEIGHT.heading, entryRowLine.line),
                    color: PALETTE.heading,
                    font: primaryFont,
                  }),
                  ...(edu.field ? [
                    new TextRun({
                      text: ` ${inText} ${edu.field}`,
                      bold: true,
                      size: scaledFontSizes.jobTitle,
                      scale: widthScales.jobTitle,
                      position: baselineShift('jobTitle', LINE_HEIGHT.heading, entryRowLine.line),
                      color: PALETTE.heading,
                      font: primaryFont,
                    }),
                  ] : []),
                  new TextRun({
                    text: '\t' + formatDateRange(edu.startDate, edu.endDate, false, locale as Locale, dict),
                    size: scaledFontSizes.meta,
                    scale: widthScales.meta,
                    position: baselineShift('meta', LINE_HEIGHT.body, entryRowLine.line),
                    color: PALETTE.date,
                    font: primaryFont,
                  }),
                ],
                // One flex row in the Preview: the h3 at heading height beside the dates at body height.
                spacing: {
                  after: pxToTwips(4),
                  ...entryRowLine,
                },
                indent: { right: mainContentRightIndent },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: rightTabPosition,
                  },
                ],
              })
            )

            // School + Location
            mainContentParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: edu.school || '',
                    size: scaledFontSizes.meta,
                    scale: widthScales.meta,
                    position: baselineShift('meta', LINE_HEIGHT.body),
                    color: PALETTE.meta,
                    font: primaryFont,
                  }),
                  ...((edu as any).location ? [
                    new TextRun({
                      text: `\t${(edu as any).location}`,
                      size: scaledFontSizes.meta,
                      scale: widthScales.meta,
                      position: baselineShift('meta', LINE_HEIGHT.body),
                      color: PALETTE.date,
                      font: primaryFont,
                    }),
                  ] : []),
                ],
                spacing: {
                  after: edu.gpa ? pxToTwips(4) : (isLast && isLastSection ? 0 : pxToTwips(16)),
                  ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.meta]),
                },
                indent: { right: mainContentRightIndent },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: rightTabPosition,
                  },
                ],
              })
            )

            // GPA if available
            if (edu.gpa) {
              const gpaText = (dict as any).resumes?.template?.gpa || 'GPA'
              mainContentParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${gpaText}: ${edu.gpa}`,
                      size: scaledFontSizes.meta,
                      scale: widthScales.meta,
                      position: baselineShift('meta', LINE_HEIGHT.body),
                      color: PALETTE.meta,
                      font: primaryFont,
                    }),
                  ],
                  spacing: {
                    after: isLast && isLastSection ? 0 : pxToTwips(16),
                    ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.meta]),
                  },
                  indent: { right: mainContentRightIndent },
                })
              )
            }
          })
        }
        break
      }
      default:
        assertExhaustiveSection(sectionId)
    }
  })

  // ============================================================
  // CREATE DOCUMENT WITH TABLE LAYOUT
  // ============================================================

  // Sidebar cell
  const sidebarCell = new TableCell({
    children: sidebarParagraphs,
    shading: {
      fill: sidebarColorHex,
      color: "auto",
    },
    margins: {
      top: cellTopMargin,
      bottom: convertInchesToTwip(0.25),
      left: sidebarCellMargin,
      right: sidebarCellMargin,
    },
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: sidebarWidthTwips,
      type: WidthType.DXA,
    },
  })

  // Main content cell
  const mainContentCell = new TableCell({
    children: mainContentParagraphs,
    margins: {
      top: cellTopMargin,
      bottom: mainCellMargin,
      left: mainCellMargin,
      right: mainCellMargin,
    },
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: mainContentWidthTwips,
      type: WidthType.DXA,
    },
  })

  // Create table with FIXED layout to prevent Word auto-resizing
  // This is critical for maintaining exact sidebar width parity with Preview
  // Page height: A4, from the one declaration every surface reads.
  const pageHeightTwips = convertInchesToTwip(PAGE_HEIGHT_INCHES)

  // Row height must account for the trailing paragraph that OOXML requires.
  // Testing with large buffer to confirm root cause.
  const trailingParagraphBuffer = 500 // ~0.35 inches - testing value
  const rowHeightTwips = pageHeightTwips - trailingParagraphBuffer

  const mainTable = new Table({
    rows: [
      new TableRow({
        children: [sidebarCell, mainContentCell],
        cantSplit: true,
        // EXACT height ensures sidebar fills to visual page bottom
        // The 20-twip buffer prevents overflow to a second page
        height: {
          value: rowHeightTwips,
          rule: HeightRule.EXACT,
        },
      }),
    ],
    // Use fixed table width in DXA (twips) - NOT percentage
    width: {
      size: pageWidthTwips,
      type: WidthType.DXA,
    },
    // Explicit column widths array - required for fixed layout
    columnWidths: [sidebarWidthTwips, mainContentWidthTwips],
    // FIXED layout prevents Word from auto-fitting columns
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

  // Create document with font settings and no default paragraph spacing.
  // Every paragraph writes its own line spacing; the default is the body
  // text's, at the default run size, so nothing can fall back to a Word auto
  // multiple.
  const doc = new Document({
    // Word 2013+ layout (compatibility mode 15) shrinks the spaces of a
    // justified line to fit one more word; the browser never does. Measured in
    // Word's render: the Preview's justified summary broke "…Led the / rewrite",
    // Word's "…Led the rewrite /", and every later line moved with it. Word 2010
    // layout (mode 14) only stretches spaces, so justified lines break at the
    // same words as left-aligned ones, as in the Preview.
    compatibility: { version: 14 },
    styles: {
      default: {
        document: {
          run: {
            font: primaryFont,
            size: scaledFontSizes.body,
            // The runs the shared HTML/list helpers build where no scale is
            // passed are all body text, and inherit this one.
            scale: widthScales.body,
            position: baselineShift('body', LINE_HEIGHT.body),
          },
          paragraph: {
            spacing: {
              before: 0,
              after: 0,
              ...exactLineSpacing([LINE_HEIGHT.body, lineFontSizes.body]),
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
              width: convertInchesToTwip(PAGE_WIDTH_INCHES),
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
          mainTable,
          // Explicit trailing paragraph with minimal height.
          // OOXML requires a paragraph after table for section properties.
          // By adding it explicitly with near-zero height, we control the overflow.
          new Paragraph({
            spacing: {
              before: 0,
              after: 0,
              line: 1, // 1 twip - absolute minimum
              lineRule: LineRuleType.EXACT,
            },
            children: [], // Empty paragraph
          }),
        ],
      },
    ],
  })

  // Generate buffer
  const buffer = await Packer.toBuffer(doc)
  return buffer as Buffer
}
