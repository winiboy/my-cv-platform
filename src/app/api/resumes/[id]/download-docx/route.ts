import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
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
  parseHtmlToDocxRuns,
  formatDateRange,
  COLORS,
} from './docx-helpers'

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

// Line heights
const LINE_HEIGHTS = {
  BODY: 1.35,
  HEADING: 1.2,
}

// Spacing constants (in px, will be converted to twips)
// These MUST match the Preview exactly
const SPACING = {
  TITLE_GAP: 8,
  SECTION_GAP: 12,              // marginBottom on section titles
  SECTION_MARGIN_BOTTOM: 32,    // mb-8 in Preview = 32px (2rem)
  ITEM_SPACING: 16,             // space-y-4 between items
  EXPERIENCE_ITEM_SPACING: 24,  // space-y-6 between experience items
}

// Section type definitions
type SidebarSectionId = 'keyAchievements' | 'skills' | 'languages' | 'training'
type MainContentSectionId = 'summary' | 'experience' | 'education'

// ============================================================
// MAIN ROUTE HANDLER
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    // Get all parameters from query string
    const { searchParams } = new URL(request.url)
    const locale = (searchParams.get('locale') || 'fr') as Locale

    // Styling parameters (with defaults matching professional-template.tsx)
    const fontFamily = searchParams.get('fontFamily') || 'Arial, Helvetica, sans-serif'
    const fontScale = parseFloat(searchParams.get('fontScale') || '1')
    const sidebarHue = parseInt(searchParams.get('sidebarHue') || '240')
    const sidebarBrightness = parseInt(searchParams.get('sidebarBrightness') || '35')
    const sidebarWidthPercent = parseFloat(searchParams.get('sidebarWidth') || '30')
    const sidebarTopMarginRaw = searchParams.get('sidebarTopMargin')
    const mainContentTopMarginRaw = searchParams.get('mainContentTopMargin')

    // Parse with defaults
    const sidebarTopMargin = sidebarTopMarginRaw ? parseInt(sidebarTopMarginRaw) : 64
    const mainContentTopMargin = mainContentTopMarginRaw ? parseInt(mainContentTopMarginRaw) : 24

    // DEBUG: Log received alignment values to identify where data flow breaks
    console.log('[DOCX Route Debug] Raw query params:', {
      sidebarWidth: searchParams.get('sidebarWidth'),
      sidebarTopMargin: sidebarTopMarginRaw,
      mainContentTopMargin: mainContentTopMarginRaw,
    })
    console.log('[DOCX Route Debug] Final values used:', {
      sidebarWidthPercent,
      sidebarTopMargin,
      mainContentTopMargin,
      sidebarTopMarginTwips: pxToTwips(sidebarTopMargin),
    })

    // Section ordering (JSON arrays)
    const sidebarOrderParam = searchParams.get('sidebarOrder')
    const mainContentOrderParam = searchParams.get('mainContentOrder')
    const hiddenSidebarParam = searchParams.get('hiddenSidebarSections')
    const hiddenMainParam = searchParams.get('hiddenMainSections')

    const sidebarOrder: SidebarSectionId[] = sidebarOrderParam
      ? JSON.parse(sidebarOrderParam)
      : ['keyAchievements', 'skills', 'languages', 'training']
    const mainContentOrder: MainContentSectionId[] = mainContentOrderParam
      ? JSON.parse(mainContentOrderParam)
      : ['summary', 'experience', 'education']
    const hiddenSidebarSections: SidebarSectionId[] = hiddenSidebarParam
      ? JSON.parse(hiddenSidebarParam)
      : []
    const hiddenMainSections: MainContentSectionId[] = hiddenMainParam
      ? JSON.parse(hiddenMainParam)
      : []

    // Load translations
    const dict = getTranslations(locale, 'common')

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch resume
    const result: any = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (result.error || !result.data) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    }

    const resume = result.data
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

    // Calculate sidebar color from hue and brightness
    const sidebarColorHex = hslToHex(sidebarHue, 85, sidebarBrightness)

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
    const pageWidthTwips = convertInchesToTwip(8.5)
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

    // DEBUG: Log the actual spacing value being applied
    const sidebarSpacingTwips = pxToTwips(sidebarTopMargin)
    console.log('[DOCX Sidebar Debug] sidebarTopMargin px:', sidebarTopMargin, '-> twips:', sidebarSpacingTwips)

    // Contact Name with sidebarTopMargin gap after
    sidebarParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contact.name || 'Your Name',
            bold: true,
            size: scaledFontSizes.name,
            color: COLORS.WHITE,
            font: primaryFont,
          }),
        ],
        spacing: {
          after: sidebarSpacingTwips,
          line: Math.round(240 * LINE_HEIGHTS.HEADING),
          lineRule: LineRuleType.AUTO,
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

      if (sectionId === 'keyAchievements' && keyAchievements.length > 0) {
        // Section title with underline
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (dict as any).resumes?.template?.keyAchievements || 'Key Achievements',
                bold: true,
                size: scaledFontSizes.sectionTitle,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
            ],
            spacing: { after: pxToTwips(16) }, // mb-4 in Preview
            border: {
              bottom: {
                color: COLORS.WHITE,
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
                  color: COLORS.WHITE,
                  font: primaryFont,
                }),
              ],
              spacing: { after: achievement.description ? pxToTwips(4) : itemEndSpacing },
            })
          )
          if (achievement.description) {
            // Extract alignment from HTML if present
            const descriptionAlignment = extractAlignment(achievement.description) || AlignmentType.JUSTIFIED

            // Check if description contains a list structure
            if (isHtmlList(achievement.description)) {
              // Parse list into separate paragraphs for proper DOCX rendering
              const listParagraphs = parseHtmlListToParagraphs(
                achievement.description,
                {
                  size: scaledFontSizes.body,
                  color: COLORS.WHITE,
                  font: primaryFont,
                },
                pxToTwips(4), // spacing between list items
                itemEndSpacing, // spacing after last item
                undefined, // no indent for sidebar
                descriptionAlignment
              )
              sidebarParagraphs.push(...listParagraphs)
            } else {
              // Parse HTML to DOCX TextRuns with formatting preserved
              const descriptionRuns = parseHtmlToDocxRuns(achievement.description, {
                size: scaledFontSizes.body,
                color: COLORS.WHITE,
                font: primaryFont,
              })

              sidebarParagraphs.push(
                new Paragraph({
                  children: descriptionRuns,
                  spacing: { after: itemEndSpacing },
                  alignment: descriptionAlignment,
                })
              )
            }
          }
        })
      }

      if (sectionId === 'skills' && skills.filter((s: any) => s.category && (s.skillsHtml || s.items?.length > 0)).length > 0) {
        // Section title
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (dict as any).resumes?.template?.skills || 'Skills',
                bold: true,
                size: scaledFontSizes.sectionTitle,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
            ],
            spacing: { after: pxToTwips(16) }, // mb-4 in Preview
            border: {
              bottom: {
                color: COLORS.WHITE,
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
                  color: COLORS.WHITE,
                  font: primaryFont,
                }),
              ],
              spacing: { after: pxToTwips(4) }, // mb-1 in Preview
            })
          )

          // Use skillsHtml if available, otherwise fall back to items array
          if (skillCat.skillsHtml) {
            // Extract alignment from HTML if present
            const skillsAlignment = extractAlignment(skillCat.skillsHtml) || AlignmentType.LEFT

            // Check if skillsHtml contains a list structure
            if (isHtmlList(skillCat.skillsHtml)) {
              // Parse list into separate paragraphs for proper DOCX rendering
              const listParagraphs = parseHtmlListToParagraphs(
                skillCat.skillsHtml,
                {
                  size: scaledFontSizes.body,
                  color: COLORS.WHITE,
                  font: primaryFont,
                },
                pxToTwips(4), // spacing between list items
                itemEndSpacing, // spacing after last item
                undefined, // no indent for sidebar
                skillsAlignment
              )
              sidebarParagraphs.push(...listParagraphs)
            } else {
              // Non-list content: use inline rendering
              const skillsRuns = parseHtmlToDocxRuns(skillCat.skillsHtml, {
                size: scaledFontSizes.body,
                color: COLORS.WHITE,
                font: primaryFont,
              })

              sidebarParagraphs.push(
                new Paragraph({
                  children: skillsRuns,
                  spacing: { after: itemEndSpacing },
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
                    color: COLORS.WHITE,
                    font: primaryFont,
                  }),
                ],
                spacing: { after: itemEndSpacing },
                alignment: AlignmentType.JUSTIFIED,
              })
            )
          }
        })
      }

      if (sectionId === 'languages' && languages.length > 0) {
        // Section title
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (dict as any).resumes?.template?.languages || 'Languages',
                bold: true,
                size: scaledFontSizes.sectionTitle,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
            ],
            spacing: { after: pxToTwips(16) }, // mb-4 in Preview
            border: {
              bottom: {
                color: COLORS.WHITE,
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
                  color: COLORS.WHITE,
                  font: primaryFont,
                }),
                new TextRun({
                  text: '\t' + levelText,
                  size: scaledFontSizes.body,
                  color: COLORS.WHITE,
                  font: primaryFont,
                }),
              ],
              spacing: { after: itemEndSpacing },
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

      if (sectionId === 'training' && certifications.length > 0) {
        // Section title
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (dict as any).resumes?.template?.training || 'Training',
                bold: true,
                size: scaledFontSizes.sectionTitle,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
            ],
            spacing: { after: pxToTwips(16) }, // mb-4 in Preview
            border: {
              bottom: {
                color: COLORS.WHITE,
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
                  color: COLORS.WHITE,
                  font: primaryFont,
                }),
              ],
              spacing: { after: pxToTwips(4) }, // mb-1 in Preview
            })
          )
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: cert.issuer,
                  size: scaledFontSizes.meta,
                  color: COLORS.WHITE,
                  font: primaryFont,
                }),
              ],
              spacing: { after: cert.date ? pxToTwips(2) : itemEndSpacing },
            })
          )
          if (cert.date) {
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: new Date(cert.date + '-01').toLocaleDateString(locale, {
                      month: 'long',
                      year: 'numeric',
                    }),
                    size: scaledFontSizes.meta,
                    color: COLORS.WHITE,
                    font: primaryFont,
                  }),
                ],
                spacing: { after: itemEndSpacing },
              })
            )
          }
        })
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
            color: COLORS.DARK_HEADING,
            font: primaryFont,
          }),
        ],
        spacing: {
          after: pxToTwips(SPACING.TITLE_GAP),
          line: Math.round(240 * LINE_HEIGHTS.HEADING),
          lineRule: LineRuleType.AUTO,
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
              color: COLORS.META_TEXT,
              font: primaryFont,
            }),
          ],
          spacing: {
            after: pxToTwips(24 + mainContentTopMargin),
            line: Math.round(240 * LINE_HEIGHTS.BODY),
            lineRule: LineRuleType.AUTO,
          },
        })
      )
    } else {
      // Even without contact info, we need the same gap as Preview's pb-6 + marginBottom
      mainContentParagraphs.push(
        new Paragraph({
          spacing: { after: pxToTwips(24 + mainContentTopMargin) },
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

      if (sectionId === 'summary' && resume.summary) {
        // Section title with underline
        mainContentParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (dict as any).resumes?.template?.summary || 'Summary',
                bold: true,
                size: scaledFontSizes.resumeSectionTitle,
                color: COLORS.DARK_HEADING,
                font: primaryFont,
              }),
            ],
            spacing: { after: pxToTwips(SPACING.SECTION_GAP) },
            border: {
              bottom: {
                color: COLORS.DARK_HEADING,
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
              },
            },
          })
        )

        // Extract alignment from HTML if present
        const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.JUSTIFIED

        // Summary text - check if it contains a list structure
        if (isHtmlList(resume.summary)) {
          // Parse list into separate paragraphs for proper DOCX rendering
          const listParagraphs = parseHtmlListToParagraphs(
            resume.summary,
            {
              size: scaledFontSizes.body,
              color: COLORS.BODY_TEXT,
              font: primaryFont,
            },
            pxToTwips(4), // spacing between list items
            sectionSpacingAfter, // spacing after last item
            { right: mainContentRightIndent }, // indent
            summaryAlignment
          )
          mainContentParagraphs.push(...listParagraphs)
        } else {
          // Non-list content: use inline rendering
          const summaryRuns = parseHtmlToDocxRuns(resume.summary, {
            size: scaledFontSizes.body,
            color: COLORS.BODY_TEXT,
            font: primaryFont,
          })

          mainContentParagraphs.push(
            new Paragraph({
              children: summaryRuns,
              alignment: summaryAlignment,
              indent: { right: mainContentRightIndent },
              spacing: {
                after: sectionSpacingAfter,
                line: Math.round(240 * LINE_HEIGHTS.BODY),
                lineRule: LineRuleType.AUTO,
              },
            })
          )
        }
      }

      if (sectionId === 'experience' && experiences.length > 0) {
        // Section title
        mainContentParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (dict as any).resumes?.template?.experience || 'Experience',
                bold: true,
                size: scaledFontSizes.sectionTitle,
                color: COLORS.DARK_HEADING,
                font: primaryFont,
              }),
            ],
            spacing: { after: pxToTwips(SPACING.SECTION_GAP) },
            border: {
              bottom: {
                color: COLORS.DARK_HEADING,
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
                  color: COLORS.DARK_HEADING,
                  font: primaryFont,
                }),
                new TextRun({
                  text: '\t' + formatDateRange(exp.startDate, exp.endDate, exp.current, locale, dict),
                  size: scaledFontSizes.meta,
                  color: COLORS.DATE_TEXT,
                  font: primaryFont,
                }),
              ],
              spacing: { after: pxToTwips(4) },
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
                  color: COLORS.META_TEXT,
                  font: primaryFont,
                }),
                ...(exp.location ? [
                  new TextRun({
                    text: ` • ${exp.location}`,
                    size: scaledFontSizes.meta,
                    color: COLORS.META_TEXT,
                    font: primaryFont,
                  }),
                ] : []),
              ],
              spacing: { after: pxToTwips(8) },
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
                color: COLORS.BODY_TEXT,
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
                      color: COLORS.DARK_HEADING,
                      font: primaryFont,
                    }),
                    ...achievementRuns,
                  ],
                  spacing: {
                    after: achievementSpacingAfter,
                    line: Math.round(240 * LINE_HEIGHTS.BODY),
                    lineRule: LineRuleType.AUTO,
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

            // Check if description contains a list structure
            if (isHtmlList(exp.description)) {
              // Parse list into separate paragraphs for proper DOCX rendering
              const listParagraphs = parseHtmlListToParagraphs(
                exp.description,
                {
                  size: scaledFontSizes.body,
                  color: COLORS.BODY_TEXT,
                  font: primaryFont,
                },
                pxToTwips(4), // spacing between list items
                descSpacingAfter, // spacing after last item
                { right: mainContentRightIndent }, // indent
                descAlignment
              )
              mainContentParagraphs.push(...listParagraphs)
            } else {
              // Parse description HTML to preserve formatting
              const descRuns = parseHtmlToDocxRuns(exp.description, {
                size: scaledFontSizes.body,
                color: COLORS.BODY_TEXT,
                font: primaryFont,
              })

              mainContentParagraphs.push(
                new Paragraph({
                  children: descRuns,
                  spacing: {
                    after: descSpacingAfter,
                    line: Math.round(240 * LINE_HEIGHTS.BODY),
                    lineRule: LineRuleType.AUTO,
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

      if (sectionId === 'education' && education.length > 0) {
        // Section title
        mainContentParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (dict as any).resumes?.template?.education || 'Education',
                bold: true,
                size: scaledFontSizes.sectionTitle,
                color: COLORS.DARK_HEADING,
                font: primaryFont,
              }),
            ],
            spacing: { after: pxToTwips(SPACING.SECTION_GAP) },
            border: {
              bottom: {
                color: COLORS.DARK_HEADING,
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
                  color: COLORS.DARK_HEADING,
                  font: primaryFont,
                }),
                ...(edu.field ? [
                  new TextRun({
                    text: ` ${inText} ${edu.field}`,
                    size: scaledFontSizes.jobTitle,
                    color: COLORS.DARK_HEADING,
                    font: primaryFont,
                  }),
                ] : []),
                new TextRun({
                  text: '\t' + formatDateRange(edu.startDate, edu.endDate, false, locale, dict),
                  size: scaledFontSizes.meta,
                  color: COLORS.DATE_TEXT,
                  font: primaryFont,
                }),
              ],
              spacing: { after: pxToTwips(4) },
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
                  color: COLORS.META_TEXT,
                  font: primaryFont,
                }),
                ...((edu as any).location ? [
                  new TextRun({
                    text: `\t${(edu as any).location}`,
                    size: scaledFontSizes.meta,
                    color: COLORS.DATE_TEXT,
                    font: primaryFont,
                  }),
                ] : []),
              ],
              spacing: { after: edu.gpa ? pxToTwips(4) : (isLast && isLastSection ? 0 : pxToTwips(16)) },
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
                    color: COLORS.META_TEXT,
                    font: primaryFont,
                  }),
                ],
                spacing: { after: isLast && isLastSection ? 0 : pxToTwips(16) },
                indent: { right: mainContentRightIndent },
              })
            )
          }
        })
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
    // Page height: US Letter = 11"
    const pageHeightTwips = convertInchesToTwip(11)

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

    // Create document with font settings and minimal default paragraph spacing
    // The paragraph defaults ensure the implicit trailing paragraph (required by OOXML
    // for section properties) takes minimal space, preventing page overflow.
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
                line: 240, // Single line spacing (240 twips = 1 line at 12pt)
                lineRule: LineRuleType.AUTO,
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
                width: convertInchesToTwip(8.5),
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

    // Return as downloadable file
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${resume.title || 'resume'}.docx"`,
      },
    })
  } catch (error) {
    console.error('Error generating Word document:', error)
    return NextResponse.json(
      { error: 'Failed to generate Word document' },
      { status: 500 }
    )
  }
}
