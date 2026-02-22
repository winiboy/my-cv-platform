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
  LineRuleType,
  PageOrientation,
  TableLayoutType,
} from 'docx'
import {
  pxToHalfPoints,
  pxToTwips,
  extractAlignment,
  extractPrimaryFont,
  isHtmlList,
  parseHtmlListToParagraphs,
  parseHtmlToDocxRuns,
  stripHtml,
  type DocxGeneratorSettings,
} from './docx-helpers'

// ============================================================
// TRANSLATION DICTIONARY (matching minimal-template.tsx section labels)
// ============================================================
const MINIMAL_DICT: Record<string, Record<string, string>> = {
  fr: { summary: 'Résumé', experience: 'Expérience', education: 'Formation', skills: 'Compétences', languages: 'Langues', certifications: 'Certifications', projects: 'Projets', present: 'Présent' },
  en: { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', languages: 'Languages', certifications: 'Certifications', projects: 'Projects', present: 'Present' },
  de: { summary: 'Zusammenfassung', experience: 'Erfahrung', education: 'Ausbildung', skills: 'Fähigkeiten', languages: 'Sprachen', certifications: 'Zertifizierungen', projects: 'Projekte', present: 'Gegenwart' },
  it: { summary: 'Riepilogo', experience: 'Esperienza', education: 'Formazione', skills: 'Competenze', languages: 'Lingue', certifications: 'Certificazioni', projects: 'Progetti', present: 'Presente' },
}

// ============================================================
// MINIMAL TEMPLATE COLORS (Tailwind Slate palette — lighter than Classic)
// ============================================================
const SLATE = {
  900: '0F172A', // titles only
  700: '334155', // body text, achievements, skill category names
  600: '475569', // secondary text (company, summary, skill items)
  500: '64748B', // dates, contact info, metadata
  400: '94A3B8', // section headers (light gray)
  300: 'CBD5E1', // header bottom border
  200: 'E2E8F0', // section title borders (very light)
}

// ============================================================
// FONT SIZE CONSTANTS (matching minimal-template.tsx defaults)
// ============================================================
const FONT_SIZES = {
  TITLE: 48,         // h1 default (font-light)
  CONTACT: 12,       // contact info
  SECTION_TITLE: 16, // h2 section headers (uppercase, tracking-widest)
  BODY: 14,          // sectionDescFontSize default
  POSITION: 20,      // text-xl for position/degree/project name
  COMPANY: 16,       // text-base for company line
  DATE: 14,          // text-sm for date ranges
  TECH: 12,          // text-xs for technology tags
}

// Line heights
const LINE_HEIGHTS = {
  BODY: 1.625,    // leading-relaxed
  HEADING: 1.2,
}

// Spacing constants (px, converted to twips at usage)
// Wider than Classic to match the Minimal template's airy feel
const SPACING = {
  OUTER_PADDING: 64,            // p-16 = 4rem = 64px
  SECTION_GAP: 40,              // space-y-10 = 40px between major sections
  HEADER_PB: 24,                // pb-6 = 24px below header content (before border)
  SECTION_TITLE_MB: 24,         // mb-6 = 24px below section title
  SUMMARY_SECTION_TITLE_MB: 16, // mb-4 = 16px below summary section title
  EXPERIENCE_ITEM_GAP: 32,      // space-y-8 = 32px between experience items
  PROJECT_ITEM_GAP: 24,         // space-y-6 = 24px between project items
  EDUCATION_ITEM_GAP: 24,       // space-y-6 = 24px between education items
  SKILLS_CAT_GAP: 16,           // space-y-4 = 16px between skill categories
  SKILLS_ITEM_MB: 8,            // mb-2 = 8px between category name and items
  ACHIEVEMENT_GAP: 8,           // space-y-2 = 8px between achievement items
  LANGUAGE_ITEM_GAP: 12,        // space-y-3 = 12px between language items
  CERT_ITEM_GAP: 16,            // space-y-4 = 16px between certification items
  GRID_GAP: 48,                 // gap-12 = 48px between language/cert columns
  EXP_LINE1_MB: 8,              // mb-2 = 8px between position line and company line
  EXP_LINE2_MB: 12,             // mb-3 = 12px between company line and achievements
  PROJECT_NAME_MB: 8,           // mb-2 = 8px below project name
  PROJECT_DESC_MB: 12,          // mb-3 = 12px below project description
  EDU_LINE1_MB: 8,              // mb-2 = 8px between degree line and school line
}

// Minimal template uses sans-serif, not serif
const DEFAULT_SANS_FONT = 'Arial'

// Section types for ordering
type MinimalMainSectionId = 'summary' | 'experience' | 'projects' | 'education' | 'skills' | 'languagesAndCerts'

const DEFAULT_MAIN_ORDER: MinimalMainSectionId[] = [
  'summary', 'experience', 'projects', 'education', 'skills', 'languagesAndCerts',
]

// ============================================================
// MINIMAL TEMPLATE DOCX GENERATOR
// ============================================================

/**
 * Generate a DOCX buffer for the Minimal template.
 * Layout: Single-column, full-width, sans-serif typography, light font weights.
 * Light, airy design with wider spacing and lighter colors than Classic.
 * Section headers are uppercase, tracking-widest, in light slate-400.
 * Em-dash separators for dates, middle-dot for company/location.
 */
export async function generateMinimalDocx(
  resume: any,
  settings: DocxGeneratorSettings
): Promise<Buffer> {
  const {
    fontFamily,
    fontScale,
    locale,
    mainContentOrder: mainContentOrderRaw,
    hiddenMainSections: hiddenMainRaw,
  } = settings

  // Load translations
  const dict = getTranslations(locale as Locale, 'common')
  const minimalDict = MINIMAL_DICT[locale] || MINIMAL_DICT.en

  // Determine font: extract primary from settings, default to sans-serif
  const primaryFont = extractPrimaryFont(fontFamily)
  const font = primaryFont || DEFAULT_SANS_FONT

  const contact = resume.contact || {}

  // Filter visible items only (matching Preview behavior)
  const experiences = (resume.experience || []).filter((exp: any) => exp.visible !== false)
  const education = (resume.education || []).filter((edu: any) => edu.visible !== false)
  const skills = (resume.skills || []).filter((skill: any) => skill.visible !== false)
  const certifications = (resume.certifications || []).filter((cert: any) => cert.visible !== false)
  const projects = (resume.projects || []).filter((project: any) => project.visible !== false)
  const languages = (resume.languages || []).filter((lang: any) => lang.visible !== false)

  // Determine section ordering
  const mainContentOrder = mainContentOrderRaw.length > 0
    ? mapToMinimalOrder(mainContentOrderRaw)
    : DEFAULT_MAIN_ORDER
  const hiddenMainSections = hiddenMainRaw as string[]

  // Calculate scaled font sizes (half-points for docx)
  const scaledFontSizes = {
    title: pxToHalfPoints(FONT_SIZES.TITLE * fontScale),
    contact: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale),
    sectionTitle: pxToHalfPoints(FONT_SIZES.SECTION_TITLE * fontScale),
    body: pxToHalfPoints(FONT_SIZES.BODY * fontScale),
    position: pxToHalfPoints(FONT_SIZES.POSITION * fontScale),
    company: pxToHalfPoints(FONT_SIZES.COMPANY * fontScale),
    date: pxToHalfPoints(FONT_SIZES.DATE * fontScale),
    tech: pxToHalfPoints(FONT_SIZES.TECH * fontScale),
  }

  // Page dimensions: A4
  const pageWidthTwips = convertInchesToTwip(8.27)
  const pageHeightTwips = convertInchesToTwip(11.69)

  // Margins: p-16 = 64px = 960 twips
  const marginTwips = pxToTwips(SPACING.OUTER_PADDING)

  // Content width for tab stop calculations
  const contentWidthTwips = pageWidthTwips - (2 * marginTwips)
  const rightTabPosition = contentWidthTwips

  // Character spacing for tracking-widest on section headers
  // CSS tracking-widest = 0.1em. At 16px font, 0.1em ~ 1.6px ~ 24 twips
  // Using a generous value to match the wide appearance
  const trackingWidestTwips = pxToTwips(1.6)

  // ============================================================
  // HELPER: Section header with very light bottom border
  // Matches: font-semibold uppercase tracking-widest text-slate-400
  //          pb-2 border-b border-slate-200, mb-6
  // ============================================================
  function createSectionHeader(title: string, spacingAfter?: number): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true, // font-semibold approximated as bold
          size: scaledFontSizes.sectionTitle,
          color: SLATE[400], // Light gray — key difference from Classic
          font,
          characterSpacing: trackingWidestTwips,
        }),
      ],
      spacing: {
        after: spacingAfter ?? pxToTwips(SPACING.SECTION_TITLE_MB),
      },
      border: {
        bottom: {
          color: SLATE[200], // Very light border — key difference from Classic
          space: 1, // pb-2 spacing between text and border
          style: BorderStyle.SINGLE,
          size: 4, // 1px border
        },
      },
    })
  }

  // ============================================================
  // HELPER: Format date with em-dash separator (Minimal style)
  // ============================================================
  function formatMinimalDateRange(
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
      ? (minimalDict.present || 'Present')
      : endDate
        ? new Date(endDate + '-01').toLocaleDateString(locale as Locale, {
            month: 'short',
            year: 'numeric',
          })
        : (minimalDict.present || 'Present')

    // Em-dash with spaces, matching the template's {' \u2014 '} pattern
    return `${start} \u2014 ${end}`
  }

  // ============================================================
  // BUILD DOCUMENT PARAGRAPHS
  // ============================================================
  const children: (Paragraph | Table)[] = []

  // ----------------------------------------------------------
  // HEADER: CV Title (centered, light weight, NOT bold)
  // font-light tracking-tight text-slate-900
  // ----------------------------------------------------------
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: resume.title || 'CV TITLE',
          // font-light (300) = normal (non-bold) in DOCX
          bold: false,
          size: scaledFontSizes.title,
          color: SLATE[900],
          font,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: {
        after: pxToTwips(16), // space-y-4 between title and contact
        line: Math.round(240 * LINE_HEIGHTS.HEADING),
        lineRule: LineRuleType.AUTO,
      },
    })
  )

  // ----------------------------------------------------------
  // HEADER: Contact information (centered, NO bullet separators)
  // flex-wrap justify-center gap-x-6 gap-y-2 text-slate-500
  // Unlike Classic, items are separated by spaces only, not bullets
  // ----------------------------------------------------------
  const contactItems: string[] = []
  if (contact.email) contactItems.push(`\u2709\uFE0F ${contact.email}`)
  if (contact.phone) contactItems.push(`\uD83D\uDCDE ${contact.phone}`)
  if (contact.location) contactItems.push(`\uD83D\uDCCD ${contact.location}`)
  if (contact.linkedin) contactItems.push(`\uD83D\uDD17 ${contact.linkedin}`)
  if (contact.github) contactItems.push(`\uD83D\uDCBB ${contact.github}`)
  if (contact.website) contactItems.push(`\uD83C\uDF10 ${contact.website}`)

  if (contactItems.length > 0) {
    // Render all contact items on one line with generous spacing (no bullet separators)
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactItems.join('    '), // Wide spacing between items (gap-x-6)
            size: scaledFontSizes.contact,
            color: SLATE[500],
            font,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      })
    )
  }

  // Header bottom border: border-b border-slate-300, pb-6
  children.push(
    new Paragraph({
      children: [],
      spacing: {
        after: pxToTwips(SPACING.SECTION_GAP),
      },
      border: {
        bottom: {
          color: SLATE[300], // slate-300, lighter than Classic's slate-900
          space: 1,
          style: BorderStyle.SINGLE,
          size: 4, // 1px border
        },
      },
    })
  )

  // ----------------------------------------------------------
  // MAIN CONTENT SECTIONS (in order, respecting visibility)
  // ----------------------------------------------------------
  const visibleMainSections = mainContentOrder.filter(
    sectionId => !hiddenMainSections.includes(sectionId)
  )

  visibleMainSections.forEach((sectionId, index) => {
    const isLastSection = index === visibleMainSections.length - 1
    const sectionEndSpacing = isLastSection ? 0 : pxToTwips(SPACING.SECTION_GAP)

    // --- SUMMARY ---
    if (sectionId === 'summary' && resume.summary) {
      children.push(
        createSectionHeader(
          (dict as any).resumes?.editor?.sections?.summary || minimalDict.summary,
          pxToTwips(SPACING.SUMMARY_SECTION_TITLE_MB) // mb-4, not mb-6
        )
      )

      const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.JUSTIFIED

      if (isHtmlList(resume.summary)) {
        const listParagraphs = parseHtmlListToParagraphs(
          resume.summary,
          {
            size: scaledFontSizes.body,
            color: SLATE[600], // slate-600 for summary text
            font,
          },
          pxToTwips(4),
          sectionEndSpacing,
          undefined,
          summaryAlignment
        )
        children.push(...listParagraphs)
      } else {
        const summaryRuns = parseHtmlToDocxRuns(resume.summary, {
          size: scaledFontSizes.body,
          color: SLATE[600],
          font,
        })

        children.push(
          new Paragraph({
            children: summaryRuns,
            alignment: summaryAlignment,
            spacing: {
              after: sectionEndSpacing,
              line: Math.round(240 * LINE_HEIGHTS.BODY),
              lineRule: LineRuleType.AUTO,
            },
          })
        )
      }
    }

    // --- EXPERIENCE ---
    if (sectionId === 'experience' && experiences.length > 0) {
      children.push(
        createSectionHeader(
          (dict as any).resumes?.editor?.sections?.experience || minimalDict.experience
        )
      )

      experiences.forEach((exp: any, i: number) => {
        const isLastExp = i === experiences.length - 1

        // Line 1: Position (left, font-medium=bold) + Date range (right, em-dash)
        const dateText = formatMinimalDateRange(
          exp.startDate,
          exp.endDate,
          exp.current
        )

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: exp.position || '',
                bold: true, // font-medium approximated as bold
                size: scaledFontSizes.position, // text-xl = 20px
                color: SLATE[900],
                font,
              }),
              ...(dateText ? [
                new TextRun({
                  text: '\t' + dateText,
                  size: scaledFontSizes.date, // text-sm = 14px
                  color: SLATE[500],
                  font,
                }),
              ] : []),
            ],
            spacing: { after: pxToTwips(SPACING.EXP_LINE1_MB) },
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: rightTabPosition,
              },
            ],
          })
        )

        // Line 2: Company \u00B7 Location (font-light=non-bold, slate-600, middle dot)
        const companyText = exp.location
          ? `${exp.company || ''} \u00B7 ${exp.location}`
          : (exp.company || '')

        if (companyText) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: companyText,
                  size: scaledFontSizes.company, // text-base = 16px
                  color: SLATE[600],
                  font,
                  // font-light = non-bold (default)
                }),
              ],
              spacing: { after: pxToTwips(SPACING.EXP_LINE2_MB) },
            })
          )
        }

        // Achievements (small circle bullet) or Description (paragraph)
        if (exp.achievements && exp.achievements.length > 0) {
          exp.achievements.forEach((achievement: string, j: number) => {
            const isLastAchievement = j === exp.achievements.length - 1

            const achievementRuns = parseHtmlToDocxRuns(achievement, {
              size: scaledFontSizes.body,
              color: SLATE[700], // slate-700 for achievement text
              font,
            })

            // Spacing: between achievements = 8px, between experiences = 32px
            const achievementSpacingAfter = !isLastAchievement
              ? pxToTwips(SPACING.ACHIEVEMENT_GAP)
              : isLastExp
                ? sectionEndSpacing
                : pxToTwips(SPACING.EXPERIENCE_ITEM_GAP)

            // Use small bullet (middle dot) to approximate the 4px circle bullets
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: '\u2022 ', // Small bullet character
                    size: scaledFontSizes.body,
                    color: SLATE[400], // Bullet color matches slate-400
                    font,
                  }),
                  ...achievementRuns,
                ],
                spacing: {
                  after: achievementSpacingAfter,
                  line: Math.round(240 * LINE_HEIGHTS.BODY),
                  lineRule: LineRuleType.AUTO,
                },
              })
            )
          })
        } else if (exp.description) {
          const descAlignment = extractAlignment(exp.description) || AlignmentType.JUSTIFIED
          const descSpacingAfter = isLastExp ? sectionEndSpacing : pxToTwips(SPACING.EXPERIENCE_ITEM_GAP)

          if (isHtmlList(exp.description)) {
            const listParagraphs = parseHtmlListToParagraphs(
              exp.description,
              {
                size: scaledFontSizes.body,
                color: SLATE[700],
                font,
              },
              pxToTwips(SPACING.ACHIEVEMENT_GAP),
              descSpacingAfter,
              undefined,
              descAlignment
            )
            children.push(...listParagraphs)
          } else {
            const descRuns = parseHtmlToDocxRuns(exp.description, {
              size: scaledFontSizes.body,
              color: SLATE[700],
              font,
            })

            children.push(
              new Paragraph({
                children: descRuns,
                spacing: {
                  after: descSpacingAfter,
                  line: Math.round(240 * LINE_HEIGHTS.BODY),
                  lineRule: LineRuleType.AUTO,
                },
                alignment: descAlignment,
              })
            )
          }
        } else {
          // No description or achievements
          children.push(
            new Paragraph({
              children: [],
              spacing: { after: isLastExp ? sectionEndSpacing : pxToTwips(SPACING.EXPERIENCE_ITEM_GAP) },
            })
          )
        }
      })
    }

    // --- PROJECTS ---
    if (sectionId === 'projects' && projects.length > 0) {
      children.push(
        createSectionHeader(
          (dict as any).resumes?.editor?.sections?.projects || minimalDict.projects
        )
      )

      projects.forEach((project: any, i: number) => {
        const isLastProject = i === projects.length - 1
        const hasDescription = !!project.description
        const hasTechnologies = project.technologies && project.technologies.length > 0

        // Project name (text-xl font-medium = bold, slate-900)
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: project.name || '',
                bold: true,
                size: scaledFontSizes.position, // text-xl = 20px
                color: SLATE[900],
                font,
              }),
            ],
            spacing: {
              after: hasDescription || hasTechnologies
                ? pxToTwips(SPACING.PROJECT_NAME_MB)
                : (isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP)),
            },
          })
        )

        // Description (optional, slate-700, leading-relaxed)
        if (hasDescription) {
          const projectDescRuns = parseHtmlToDocxRuns(project.description, {
            size: scaledFontSizes.body,
            color: SLATE[700],
            font,
          })

          children.push(
            new Paragraph({
              children: projectDescRuns,
              spacing: {
                after: hasTechnologies
                  ? pxToTwips(SPACING.PROJECT_DESC_MB)
                  : (isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP)),
                line: Math.round(240 * LINE_HEIGHTS.BODY),
                lineRule: LineRuleType.AUTO,
              },
            })
          )
        }

        // Technologies (text-xs font-light text-slate-500, displayed as tags with gap-3)
        // In DOCX, render as comma-separated since flex-wrap doesn't translate
        if (hasTechnologies) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: project.technologies.join('    '), // Wide spacing to simulate gap-3 flex
                  size: scaledFontSizes.tech, // text-xs = 12px
                  color: SLATE[500],
                  font,
                  // font-light = non-bold (default)
                }),
              ],
              spacing: {
                after: isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP),
              },
            })
          )
        }
      })
    }

    // --- EDUCATION ---
    if (sectionId === 'education' && education.length > 0) {
      children.push(
        createSectionHeader(
          (dict as any).resumes?.editor?.sections?.education || minimalDict.education
        )
      )

      education.forEach((edu: any, i: number) => {
        const isLastEdu = i === education.length - 1

        // Line 1: Degree (left, font-medium=bold, text-xl) + Date (right, em-dash)
        const eduDateText = formatMinimalDateRange(
          edu.startDate,
          edu.endDate,
          false // education has no "current" flag in the template
        )

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: edu.degree || '',
                bold: true,
                size: scaledFontSizes.position, // text-xl = 20px
                color: SLATE[900],
                font,
              }),
              ...(eduDateText ? [
                new TextRun({
                  text: '\t' + eduDateText,
                  size: scaledFontSizes.date,
                  color: SLATE[500],
                  font,
                }),
              ] : []),
            ],
            spacing: { after: pxToTwips(SPACING.EDU_LINE1_MB) },
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: rightTabPosition,
              },
            ],
          })
        )

        // Line 2: School \u00B7 Field (font-light, slate-600, middle dot)
        const schoolText = edu.field
          ? `${edu.school || ''} \u00B7 ${edu.field}`
          : (edu.school || '')

        const hasGpa = !!edu.gpa

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: schoolText,
                size: scaledFontSizes.body,
                color: SLATE[600],
                font,
                // font-light = non-bold
              }),
            ],
            spacing: {
              after: hasGpa
                ? pxToTwips(4) // mt-1 before GPA
                : (isLastEdu ? sectionEndSpacing : pxToTwips(SPACING.EDUCATION_ITEM_GAP)),
            },
          })
        )

        // Line 3: GPA (optional, slate-500)
        if (hasGpa) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `GPA: ${edu.gpa}`,
                  size: scaledFontSizes.body,
                  color: SLATE[500],
                  font,
                }),
              ],
              spacing: {
                after: isLastEdu ? sectionEndSpacing : pxToTwips(SPACING.EDUCATION_ITEM_GAP),
              },
            })
          )
        }
      })
    }

    // --- SKILLS ---
    // Minimal template: category name on one line, items flex-wrapped below
    // NOT "Category: item1, item2" format like Classic
    if (sectionId === 'skills' && skills.length > 0) {
      children.push(
        createSectionHeader(
          (dict as any).resumes?.editor?.sections?.skills || minimalDict.skills
        )
      )

      skills.forEach((skillCat: any, i: number) => {
        const isLastSkill = i === skills.length - 1
        const itemEndSpacing = isLastSkill ? sectionEndSpacing : pxToTwips(SPACING.SKILLS_CAT_GAP)

        // Category name (font-medium = bold, slate-700)
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: skillCat.category || '',
                bold: true,
                size: scaledFontSizes.body,
                color: SLATE[700],
                font,
              }),
            ],
            spacing: { after: pxToTwips(SPACING.SKILLS_ITEM_MB) },
          })
        )

        // Skill items (slate-600, flex-wrapped with gap-x-4)
        // Use skillsHtml if available, otherwise items array
        let skillText = ''
        if (skillCat.skillsHtml) {
          skillText = stripHtml(skillCat.skillsHtml)
        } else if (skillCat.items && skillCat.items.length > 0) {
          // Render with wide spacing to simulate gap-x-4 flex wrapping
          skillText = skillCat.items.join('    ')
        }

        if (skillText) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: skillText,
                  size: scaledFontSizes.body,
                  color: SLATE[600],
                  font,
                }),
              ],
              spacing: { after: itemEndSpacing },
            })
          )
        }
      })
    }

    // --- LANGUAGES + CERTIFICATIONS (2-column grid, gap-12) ---
    if (sectionId === 'languagesAndCerts' && (languages.length > 0 || certifications.length > 0)) {
      // Build languages column paragraphs
      const langParagraphs: Paragraph[] = []

      if (languages.length > 0) {
        langParagraphs.push(
          createSectionHeader(
            (dict as any).resumes?.editor?.sections?.languages || minimalDict.languages
          )
        )

        // Half column width for the tab stop within the language cell
        const halfColumnWidth = Math.round((contentWidthTwips - pxToTwips(SPACING.GRID_GAP)) / 2)

        languages.forEach((lang: any, i: number) => {
          const isLast = i === languages.length - 1
          const levelText = (dict as any).resumes?.editor?.levels?.[lang.level?.toLowerCase()] || lang.level || ''

          langParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: lang.language || '',
                  size: scaledFontSizes.body,
                  color: SLATE[700],
                  font,
                  // Not bold — Minimal template uses non-bold for language names
                }),
                new TextRun({
                  text: '\t' + levelText,
                  size: scaledFontSizes.body,
                  color: SLATE[500],
                  font,
                  // font-light = non-bold
                }),
              ],
              spacing: { after: isLast ? 0 : pxToTwips(SPACING.LANGUAGE_ITEM_GAP) },
              tabStops: [
                {
                  type: TabStopType.RIGHT,
                  position: halfColumnWidth,
                },
              ],
            })
          )
        })
      }

      // Build certifications column paragraphs
      const certParagraphs: Paragraph[] = []

      if (certifications.length > 0) {
        certParagraphs.push(
          createSectionHeader(
            (dict as any).resumes?.editor?.sections?.certifications || minimalDict.certifications
          )
        )

        certifications.forEach((cert: any, i: number) => {
          const isLast = i === certifications.length - 1

          // Cert name (font-medium = bold, slate-700)
          certParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: cert.name || '',
                  bold: true,
                  size: scaledFontSizes.body,
                  color: SLATE[700],
                  font,
                }),
              ],
              spacing: { after: cert.issuer || cert.date ? 0 : (isLast ? 0 : pxToTwips(SPACING.CERT_ITEM_GAP)) },
            })
          )

          // Issuer (slate-500, not bold)
          if (cert.issuer) {
            certParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: cert.issuer,
                    size: scaledFontSizes.body,
                    color: SLATE[500],
                    font,
                  }),
                ],
                spacing: { after: cert.date ? 0 : (isLast ? 0 : pxToTwips(SPACING.CERT_ITEM_GAP)) },
              })
            )
          }

          // Date (slate-400, not bold)
          if (cert.date) {
            certParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: new Date(cert.date + '-01').toLocaleDateString(locale as Locale, {
                      month: 'short',
                      year: 'numeric',
                    }),
                    size: scaledFontSizes.body,
                    color: SLATE[400],
                    font,
                  }),
                ],
                spacing: { after: isLast ? 0 : pxToTwips(SPACING.CERT_ITEM_GAP) },
              })
            )
          }
        })
      }

      // Create 2-column table for languages + certifications
      const halfColumnWidth = Math.round((contentWidthTwips - pxToTwips(SPACING.GRID_GAP)) / 2)
      const gapWidth = pxToTwips(SPACING.GRID_GAP)

      if (languages.length > 0 && certifications.length > 0) {
        // Both columns: 3-column table (lang | gap | certs)
        const langCell = new TableCell({
          children: langParagraphs.length > 0 ? langParagraphs : [new Paragraph({ children: [] })],
          verticalAlign: VerticalAlign.TOP,
          width: { size: halfColumnWidth, type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })

        const gapCell = new TableCell({
          children: [new Paragraph({ children: [] })],
          verticalAlign: VerticalAlign.TOP,
          width: { size: gapWidth, type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })

        const certCell = new TableCell({
          children: certParagraphs.length > 0 ? certParagraphs : [new Paragraph({ children: [] })],
          verticalAlign: VerticalAlign.TOP,
          width: { size: halfColumnWidth, type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })

        const gridTable = new Table({
          rows: [
            new TableRow({
              children: [langCell, gapCell, certCell],
            }),
          ],
          width: { size: contentWidthTwips, type: WidthType.DXA },
          columnWidths: [halfColumnWidth, gapWidth, halfColumnWidth],
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

        children.push(gridTable)
      } else {
        // Only one column — render inline as regular paragraphs
        if (languages.length > 0) {
          children.push(...langParagraphs)
        }
        if (certifications.length > 0) {
          children.push(...certParagraphs)
        }
      }
    }
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
          paragraph: {
            spacing: {
              before: 0,
              after: 0,
              line: 240,
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
              width: pageWidthTwips,
              height: pageHeightTwips,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: marginTwips,
              right: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
            },
          },
        },
        children,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return buffer as Buffer
}

// ============================================================
// HELPER: Map generic section IDs to minimal-specific order
// ============================================================
function mapToMinimalOrder(rawOrder: string[]): MinimalMainSectionId[] {
  const mapped: MinimalMainSectionId[] = []
  const seen = new Set<string>()

  for (const id of rawOrder) {
    if (seen.has(id)) continue

    switch (id) {
      case 'summary':
      case 'experience':
      case 'education':
      case 'skills':
      case 'projects':
        mapped.push(id as MinimalMainSectionId)
        seen.add(id)
        break
      case 'languages':
      case 'certifications':
      case 'languagesAndCerts':
        if (!seen.has('languagesAndCerts')) {
          mapped.push('languagesAndCerts')
          seen.add('languagesAndCerts')
        }
        break
      default:
        break
    }
  }

  // Ensure languagesAndCerts is included if not already mapped
  if (!seen.has('languagesAndCerts')) {
    mapped.push('languagesAndCerts')
  }

  return mapped
}
