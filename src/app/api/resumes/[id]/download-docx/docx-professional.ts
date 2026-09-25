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
  TabStopPosition,
  HeightRule,
  LineRuleType,
  TableLayoutType,
  PageOrientation,
} from 'docx'
import {
  pxToHalfPoints,
  pxToTwips,
  hslToHex,
  extractPrimaryFont,
  extractAlignment,
  isHtmlList,
  parseHtmlListToParagraphs,
  isPlainTextList,
  parsePlainTextListToParagraphs,
  parseHtmlToDocxRuns,
  formatDateRange,
  exactLineSpacing,
  trackingSpacing,
  NO_TEXT_LINE,
  type DocxGeneratorSettings,
} from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { docxTranslucentText } from './docx-text-opacity'
import { PAGE_HEIGHT_INCHES, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { PROFESSIONAL_LINE_HEIGHT, formattedTextLineHeight } from '@/lib/resume-line-height'
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
const FONT_SIZES = {
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

  // Extract primary font name from font family stack
  const primaryFont = extractPrimaryFont(fontFamily)

  // Calculate page dimensions for layout
  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const sidebarWidthTwips = Math.round(pageWidthTwips * (sidebarWidthPercent / 100))
  const mainContentWidthTwips = pageWidthTwips - sidebarWidthTwips

  // Calculate main content cell margins (matching Preview p-8 = 32px ≈ 0.33")
  const mainCellMargin = convertInchesToTwip(0.33)

  // Calculate explicit tab stop position for right-aligned dates
  // This prevents text from touching the right edge
  // Tab position = cell content width - right margin buffer
  const mainContentTextWidth = mainContentWidthTwips - (mainCellMargin * 2)
  const rightTabPosition = mainContentTextWidth - convertInchesToTwip(0.1) // 0.1" buffer for dates

  // Explicit right indentation for paragraphs in main content
  // This ensures body text doesn't touch the right edge of the cell
  // The cell margin alone may not be sufficient in all Word renderers
  const mainContentRightIndent = convertInchesToTwip(0.15) // Additional 0.15" right indent

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
          color: PALETTE.white,
          font: primaryFont,
        }),
      ],
      spacing: {
        after: sidebarSpacingTwips,
        ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.name]),
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
                  text: (dict as any).resumes?.template?.keyAchievements || 'Key Achievements',
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  color: PALETTE.white,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, scaledFontSizes.sectionTitle),
                }),
              ],
              // mb-4 in Preview
              spacing: { after: pxToTwips(16), ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.sectionTitle]) },
              border: {
                bottom: {
                  color: PALETTE.white,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
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
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                spacing: {
                  after: achievement.description ? pxToTwips(4) : itemEndSpacing,
                  ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.jobTitle]),
                },
              })
            )
            if (achievement.description) {
              const descriptionLineSpacing = exactLineSpacing([
                formattedTextLineHeight(achievement.description, LINE_HEIGHT.body),
                scaledFontSizes.body,
              ])
              // Extract alignment from HTML if present. The fallback is LEFT, not
              // JUSTIFIED, to match the Preview's narrow sidebar column.
              const descriptionAlignment = extractAlignment(achievement.description) || AlignmentType.LEFT

              // Check if description contains a list structure
              if (isHtmlList(achievement.description)) {
                // Parse list into separate paragraphs for proper DOCX rendering
                const listParagraphs = parseHtmlListToParagraphs(
                  achievement.description,
                  {
                    size: scaledFontSizes.body,
                    color: sidebarSecondaryColor,
                    font: primaryFont,
                  },
                  pxToTwips(4), // spacing between list items
                  itemEndSpacing, // spacing after last item
                  descriptionLineSpacing,
                  undefined, // no indent for sidebar
                  descriptionAlignment
                )
                sidebarParagraphs.push(...listParagraphs)
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
                // Parse HTML to DOCX TextRuns with formatting preserved
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
                  text: (dict as any).resumes?.template?.skills || 'Skills',
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  color: PALETTE.white,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, scaledFontSizes.sectionTitle),
                }),
              ],
              // mb-4 in Preview
              spacing: { after: pxToTwips(16), ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.sectionTitle]) },
              border: {
                bottom: {
                  color: PALETTE.white,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
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
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                // mb-1 in Preview
                spacing: { after: pxToTwips(4), ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.skillCategory]) },
              })
            )

            // Use skillsHtml if available, otherwise fall back to items array
            if (skillCat.skillsHtml) {
              const skillsLineSpacing = exactLineSpacing([
                formattedTextLineHeight(skillCat.skillsHtml, LINE_HEIGHT.body),
                scaledFontSizes.body,
              ])
              // Extract alignment from HTML if present
              const skillsAlignment = extractAlignment(skillCat.skillsHtml) || AlignmentType.LEFT

              // Check if skillsHtml contains a list structure
              if (isHtmlList(skillCat.skillsHtml)) {
                // Parse list into separate paragraphs for proper DOCX rendering
                const listParagraphs = parseHtmlListToParagraphs(
                  skillCat.skillsHtml,
                  {
                    size: scaledFontSizes.body,
                    color: sidebarSecondaryColor,
                    font: primaryFont,
                  },
                  pxToTwips(4), // spacing between list items
                  itemEndSpacing, // spacing after last item
                  skillsLineSpacing,
                  undefined, // no indent for sidebar
                  skillsAlignment
                )
                sidebarParagraphs.push(...listParagraphs)
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
                // Non-list content: use inline rendering
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
                      color: sidebarSecondaryColor,
                      font: primaryFont,
                    }),
                  ],
                  spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.body]) },
                  alignment: AlignmentType.JUSTIFIED,
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
                  text: (dict as any).resumes?.template?.languages || 'Languages',
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  color: PALETTE.white,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, scaledFontSizes.sectionTitle),
                }),
              ],
              // mb-4 in Preview
              spacing: { after: pxToTwips(16), ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.sectionTitle]) },
              border: {
                bottom: {
                  color: PALETTE.white,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
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

            const levelText = (dict as any).resumes?.levels?.[lang.level] || lang.level
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: lang.language,
                    size: scaledFontSizes.body,
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                  new TextRun({
                    text: '\t' + levelText,
                    size: scaledFontSizes.body,
                    color: sidebarSecondaryColor,
                    font: primaryFont,
                  }),
                ],
                spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.body]) },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: TabStopPosition.MAX,
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
                  text: (dict as any).resumes?.template?.training || 'Training',
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  color: PALETTE.white,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, scaledFontSizes.sectionTitle),
                }),
              ],
              // mb-4 in Preview
              spacing: { after: pxToTwips(16), ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.sectionTitle]) },
              border: {
                bottom: {
                  color: PALETTE.white,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
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
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                // mb-1 in Preview
                spacing: { after: pxToTwips(4), ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.jobTitle]) },
              })
            )
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: cert.issuer,
                    size: scaledFontSizes.meta,
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                spacing: {
                  after: cert.date ? pxToTwips(2) : itemEndSpacing,
                  ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.meta]),
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
                      color: PALETTE.white,
                      font: primaryFont,
                    }),
                  ],
                  spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.meta]) },
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
          color: PALETTE.heading,
          font: primaryFont,
          characterSpacing: trackingSpacing(TRACKING.title, scaledFontSizes.professionalTitle),
        }),
      ],
      spacing: {
        after: pxToTwips(SPACING.TITLE_GAP),
        ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.professionalTitle]),
      },
    })
  )

  // Contact Information (horizontal layout with emojis)
  const contactItems: string[] = []
  if (contact.email) contactItems.push(`✉️ ${contact.email}`)
  if (contact.phone) contactItems.push(`📞 ${contact.phone}`)
  if (contact.location) contactItems.push(`📍 ${contact.location}`)
  if (contact.linkedin) contactItems.push(`🔗 ${contact.linkedin}`)
  if (contact.github) contactItems.push(`💻 ${contact.github}`)
  if (contact.website) contactItems.push(`🌐 ${contact.website}`)

  if (contactItems.length > 0) {
    mainContentParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactItems.join('    '),
            size: scaledFontSizes.contact,
            color: PALETTE.meta,
            font: primaryFont,
          }),
        ],
        spacing: {
          after: pxToTwips(24 + mainContentTopMargin),
          ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.contact]),
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
                  text: (dict as any).resumes?.template?.summary || 'Summary',
                  bold: true,
                  size: scaledFontSizes.resumeSectionTitle,
                  color: PALETTE.heading,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, scaledFontSizes.resumeSectionTitle),
                }),
              ],
              spacing: {
                after: pxToTwips(SPACING.SECTION_GAP),
                ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.resumeSectionTitle]),
              },
              border: {
                bottom: {
                  color: PALETTE.heading,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
                },
              },
            })
          )

          // Extract alignment from HTML if present
          const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.JUSTIFIED
          const summaryLineSpacing = exactLineSpacing([
            formattedTextLineHeight(resume.summary, LINE_HEIGHT.body),
            scaledFontSizes.body,
          ])

          // Summary text - check if it contains a list structure
          if (isHtmlList(resume.summary)) {
            // Parse list into separate paragraphs for proper DOCX rendering
            const listParagraphs = parseHtmlListToParagraphs(
              resume.summary,
              {
                size: scaledFontSizes.body,
                color: PALETTE.body,
                font: primaryFont,
              },
              pxToTwips(4), // spacing between list items
              sectionSpacingAfter, // spacing after last item
              summaryLineSpacing,
              { right: mainContentRightIndent }, // indent
              summaryAlignment
            )
            mainContentParagraphs.push(...listParagraphs)
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
            // Non-list content: use inline rendering
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
                  text: (dict as any).resumes?.template?.experience || 'Experience',
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  color: PALETTE.heading,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, scaledFontSizes.sectionTitle),
                }),
              ],
              spacing: {
                after: pxToTwips(SPACING.SECTION_GAP),
                ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.sectionTitle]),
              },
              border: {
                bottom: {
                  color: PALETTE.heading,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
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
                    color: PALETTE.heading,
                    font: primaryFont,
                  }),
                  new TextRun({
                    text: '\t' + formatDateRange(exp.startDate, exp.endDate, exp.current, locale as Locale, dict),
                    size: scaledFontSizes.meta,
                    color: PALETTE.date,
                    font: primaryFont,
                  }),
                ],
                // One flex row in the Preview: the h3 at heading height beside the date at body height.
                spacing: {
                  after: pxToTwips(4),
                  ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.jobTitle], [LINE_HEIGHT.body, scaledFontSizes.meta]),
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
                    color: PALETTE.meta,
                    font: primaryFont,
                  }),
                  ...(exp.location ? [
                    new TextRun({
                      text: ` • ${exp.location}`,
                      size: scaledFontSizes.meta,
                      color: PALETTE.meta,
                      font: primaryFont,
                    }),
                  ] : []),
                ],
                spacing: { after: pxToTwips(8), ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.meta]) },
                indent: { right: mainContentRightIndent },
              })
            )

            // Achievements or Description
            if (exp.achievements && exp.achievements.length > 0) {
              exp.achievements.forEach((achievement: string, j: number) => {
                const isLastAchievement = j === exp.achievements.length - 1
                // Parse achievement HTML to preserve formatting
                const achievementRuns = parseHtmlToDocxRuns(achievement, {
                  size: scaledFontSizes.body,
                  color: PALETTE.body,
                  font: primaryFont,
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
                        text: '• ',
                        size: scaledFontSizes.body,
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
                      ...exactLineSpacing([formattedTextLineHeight(achievement, LINE_HEIGHT.body), scaledFontSizes.body]),
                    },
                    indent: { right: mainContentRightIndent },
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
                scaledFontSizes.body,
              ])

              // Check if description contains a list structure
              if (isHtmlList(exp.description)) {
                // Parse list into separate paragraphs for proper DOCX rendering
                const listParagraphs = parseHtmlListToParagraphs(
                  exp.description,
                  {
                    size: scaledFontSizes.body,
                    color: PALETTE.body,
                    font: primaryFont,
                  },
                  pxToTwips(4), // spacing between list items
                  descSpacingAfter, // spacing after last item
                  descLineSpacing,
                  { right: mainContentRightIndent }, // indent
                  descAlignment
                )
                mainContentParagraphs.push(...listParagraphs)
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
                // Parse description HTML to preserve formatting
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
                  text: (dict as any).resumes?.template?.education || 'Education',
                  bold: true,
                  size: scaledFontSizes.sectionTitle,
                  color: PALETTE.heading,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.heading, scaledFontSizes.sectionTitle),
                }),
              ],
              spacing: {
                after: pxToTwips(SPACING.SECTION_GAP),
                ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.sectionTitle]),
              },
              border: {
                bottom: {
                  color: PALETTE.heading,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
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
                    color: PALETTE.heading,
                    font: primaryFont,
                  }),
                  ...(edu.field ? [
                    new TextRun({
                      text: ` ${inText} ${edu.field}`,
                      size: scaledFontSizes.jobTitle,
                      color: PALETTE.heading,
                      font: primaryFont,
                    }),
                  ] : []),
                  new TextRun({
                    text: '\t' + formatDateRange(edu.startDate, edu.endDate, false, locale as Locale, dict),
                    size: scaledFontSizes.meta,
                    color: PALETTE.date,
                    font: primaryFont,
                  }),
                ],
                // One flex row in the Preview: the h3 at heading height beside the dates at body height.
                spacing: {
                  after: pxToTwips(4),
                  ...exactLineSpacing([LINE_HEIGHT.heading, scaledFontSizes.jobTitle], [LINE_HEIGHT.body, scaledFontSizes.meta]),
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
                    color: PALETTE.meta,
                    font: primaryFont,
                  }),
                  ...((edu as any).location ? [
                    new TextRun({
                      text: `\t${(edu as any).location}`,
                      size: scaledFontSizes.meta,
                      color: PALETTE.date,
                      font: primaryFont,
                    }),
                  ] : []),
                ],
                spacing: {
                  after: edu.gpa ? pxToTwips(4) : (isLast && isLastSection ? 0 : pxToTwips(16)),
                  ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.meta]),
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
                      color: PALETTE.meta,
                      font: primaryFont,
                    }),
                  ],
                  spacing: {
                    after: isLast && isLastSection ? 0 : pxToTwips(16),
                    ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.meta]),
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
      top: convertInchesToTwip(0.25),
      bottom: convertInchesToTwip(0.25),
      left: convertInchesToTwip(0.25),
      right: convertInchesToTwip(0.25),
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
      top: convertInchesToTwip(0.33),
      bottom: convertInchesToTwip(0.33),
      left: convertInchesToTwip(0.33),
      right: convertInchesToTwip(0.33),
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
    styles: {
      default: {
        document: {
          run: {
            font: primaryFont,
            size: scaledFontSizes.body,
          },
          paragraph: {
            spacing: {
              before: 0,
              after: 0,
              ...exactLineSpacing([LINE_HEIGHT.body, scaledFontSizes.body]),
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
