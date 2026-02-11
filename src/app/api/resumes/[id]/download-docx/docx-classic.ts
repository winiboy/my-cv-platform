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
  isHtmlList,
  parseHtmlListToParagraphs,
  parseHtmlToDocxRuns,
  stripHtml,
  type DocxGeneratorSettings,
} from './docx-helpers'

// ============================================================
// TRANSLATION DICTIONARY (matching classic-template.tsx section labels)
// ============================================================
const CLASSIC_DICT: Record<string, Record<string, string>> = {
  fr: { summary: 'Résumé', experience: 'Expérience', education: 'Formation', skills: 'Compétences', languages: 'Langues', certifications: 'Certifications', projects: 'Projets', present: 'Présent' },
  en: { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', languages: 'Languages', certifications: 'Certifications', projects: 'Projects', present: 'Present' },
  de: { summary: 'Zusammenfassung', experience: 'Erfahrung', education: 'Ausbildung', skills: 'Fähigkeiten', languages: 'Sprachen', certifications: 'Zertifizierungen', projects: 'Projekte', present: 'Gegenwart' },
  it: { summary: 'Riepilogo', experience: 'Esperienza', education: 'Formazione', skills: 'Competenze', languages: 'Lingue', certifications: 'Certificazioni', projects: 'Progetti', present: 'Presente' },
}

// ============================================================
// CLASSIC TEMPLATE COLORS (Tailwind Slate palette)
// ============================================================
const SLATE = {
  900: '0F172A',
  800: '1E293B',
  700: '334155',
  600: '475569',
  400: '94A3B8',
}

// ============================================================
// FONT SIZE CONSTANTS (matching classic-template.tsx defaults)
// ============================================================
const FONT_SIZES = {
  TITLE: 36,              // h1 titleFontSize default
  CONTACT: 12,            // contactFontSize default
  SECTION_TITLE: 16,      // sectionTitleFontSize default
  SECTION_DESC: 14,       // sectionDescFontSize default — body text, achievements, descriptions
  BODY_DEFAULT: 14,       // base body size for items without explicit sectionDescFontSize
}

// Line heights
const LINE_HEIGHTS = {
  BODY: 1.625,  // leading-relaxed
  HEADING: 1.2,
}

// Spacing constants (in px, converted to twips at usage)
const SPACING = {
  OUTER_PADDING: 48,           // p-12 = 3rem = 48px
  SECTION_GAP: 20,             // space-y-5 = 20px between sections
  HEADER_PB: 16,               // pb-4 = 16px padding below header
  HEADER_MB: 12,               // mb-3 in title
  SECTION_TITLE_PB: 4,         // pb-1 = 4px below section title text
  SECTION_TITLE_MB: 12,        // mb-3 = 12px below section title (including border)
  EXPERIENCE_ITEM_GAP: 16,     // space-y-4 = 16px between experience items
  EDUCATION_ITEM_GAP: 12,      // space-y-3 = 12px between education items
  SKILLS_ITEM_GAP: 8,          // space-y-2 = 8px between skill categories
  PROJECT_ITEM_GAP: 12,        // space-y-3 = 12px between project items
  LANGUAGE_ITEM_GAP: 4,        // space-y-1 = 4px between language items
  CERT_ITEM_GAP: 8,            // space-y-2 = 8px between certification items
  ACHIEVEMENT_GAP: 4,          // space-y-1 = 4px between achievements
  GRID_GAP: 24,                // gap-6 = 24px between grid columns
}

// Classic template section IDs (single-column, no sidebar)
type ClassicMainSectionId = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'languagesAndCerts'

// Default main content order for classic template
const DEFAULT_MAIN_ORDER: ClassicMainSectionId[] = [
  'summary', 'experience', 'education', 'skills', 'projects', 'languagesAndCerts',
]

// Serif font used by the Classic template
const SERIF_FONT = 'Times New Roman'

// ============================================================
// CLASSIC TEMPLATE DOCX GENERATOR
// ============================================================

/**
 * Generate a DOCX buffer for the Classic template.
 * Layout: Single-column, full-width, serif typography.
 * Header with centered title + contact, then sections with bottom-bordered headings.
 * Languages + Certifications at the bottom in a 2-column table.
 */
export async function generateClassicDocx(
  resume: any,
  settings: DocxGeneratorSettings
): Promise<Buffer> {
  const {
    fontScale,
    locale,
    mainContentOrder: mainContentOrderRaw,
    hiddenMainSections: hiddenMainRaw,
  } = settings

  // Load translations — use i18n dict for section labels, fall back to built-in dict
  const dict = getTranslations(locale as Locale, 'common')
  const classicDict = CLASSIC_DICT[locale] || CLASSIC_DICT.en

  const contact = resume.contact || {}

  // Filter visible items only (matching Preview behavior)
  const experiences = (resume.experience || []).filter((exp: any) => exp.visible !== false)
  const education = (resume.education || []).filter((edu: any) => edu.visible !== false)
  const skills = (resume.skills || []).filter((skill: any) => skill.visible !== false)
  const certifications = (resume.certifications || []).filter((cert: any) => cert.visible !== false)
  const projects = (resume.projects || []).filter((project: any) => project.visible !== false)
  const languages = (resume.languages || []).filter((lang: any) => lang.visible !== false)

  // Determine section ordering — map generic IDs to classic-specific ones
  const mainContentOrder = (mainContentOrderRaw.length > 0
    ? mapToClassicOrder(mainContentOrderRaw)
    : DEFAULT_MAIN_ORDER
  )
  const hiddenMainSections = hiddenMainRaw as string[]

  // Calculate scaled font sizes (half-points for docx)
  const scaledFontSizes = {
    title: pxToHalfPoints(FONT_SIZES.TITLE * fontScale),
    contact: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale),
    sectionTitle: pxToHalfPoints(FONT_SIZES.SECTION_TITLE * fontScale),
    body: pxToHalfPoints(FONT_SIZES.SECTION_DESC * fontScale),
    bodyDefault: pxToHalfPoints(FONT_SIZES.BODY_DEFAULT * fontScale),
  }

  // Page dimensions: A4 (8.27" x 11.69") — the spec says A4 size
  const pageWidthTwips = convertInchesToTwip(8.27)
  const pageHeightTwips = convertInchesToTwip(11.69)

  // Margins: p-12 in the template = 48px ≈ 720 twips
  const marginTwips = pxToTwips(SPACING.OUTER_PADDING)

  // Content width for tab stop calculations
  const contentWidthTwips = pageWidthTwips - (2 * marginTwips)

  // Right tab stop position: at the right edge of the content area
  const rightTabPosition = contentWidthTwips

  // ============================================================
  // HELPER: Create a section header with bottom border
  // Matches: font-serif font-bold uppercase text-slate-900
  //          border-b border-slate-400 pb-1 mb-3
  // ============================================================
  function createSectionHeader(title: string, spacingAfter?: number): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: scaledFontSizes.sectionTitle,
          color: SLATE[900],
          font: SERIF_FONT,
        }),
      ],
      spacing: {
        after: spacingAfter ?? pxToTwips(SPACING.SECTION_TITLE_MB),
      },
      border: {
        bottom: {
          color: SLATE[400],
          space: 1, // pb-1 spacing between text and border
          style: BorderStyle.SINGLE,
          size: 4, // 1px border
        },
      },
    })
  }

  // ============================================================
  // BUILD DOCUMENT PARAGRAPHS
  // ============================================================
  const children: (Paragraph | Table)[] = []

  // ----------------------------------------------------------
  // HEADER: CV Title (centered, serif, bold, uppercase)
  // ----------------------------------------------------------
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: (resume.title || 'CV TITLE').toUpperCase(),
          bold: true,
          size: scaledFontSizes.title,
          color: SLATE[900],
          font: SERIF_FONT,
          characterSpacing: 8, // tracking-wide
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: {
        after: pxToTwips(SPACING.HEADER_MB),
        line: Math.round(240 * LINE_HEIGHTS.HEADING),
        lineRule: LineRuleType.AUTO,
      },
    })
  )

  // ----------------------------------------------------------
  // HEADER: Contact information (centered, with emoji + bullet separators)
  // ----------------------------------------------------------
  // Build contact line 1: email, phone, location (separated by •)
  const contactLine1Items: string[] = []
  if (contact.email) contactLine1Items.push(`✉️ ${contact.email}`)
  if (contact.phone) contactLine1Items.push(`📞 ${contact.phone}`)
  if (contact.location) contactLine1Items.push(`📍 ${contact.location}`)

  // Build contact line 2: linkedin, github, website (separated by •)
  const contactLine2Items: string[] = []
  if (contact.linkedin) contactLine2Items.push(`🔗 ${contact.linkedin}`)
  if (contact.github) contactLine2Items.push(`💻 ${contact.github}`)
  if (contact.website) contactLine2Items.push(`🌐 ${contact.website}`)

  const hasContactLine1 = contactLine1Items.length > 0
  const hasContactLine2 = contactLine2Items.length > 0

  if (hasContactLine1) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactLine1Items.join('  •  '),
            size: scaledFontSizes.contact,
            color: SLATE[700],
            font: SERIF_FONT,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: {
          after: hasContactLine2 ? pxToTwips(4) : 0,
        },
      })
    )
  }

  if (hasContactLine2) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactLine2Items.join('  •  '),
            size: scaledFontSizes.contact,
            color: SLATE[600],
            font: SERIF_FONT,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      })
    )
  }

  // Header bottom border: 2px solid slate-900, with pb-4 and mb-3
  // We create an empty paragraph with the bottom border to simulate the header border
  children.push(
    new Paragraph({
      children: [],
      spacing: {
        after: pxToTwips(SPACING.SECTION_GAP),
      },
      border: {
        bottom: {
          color: SLATE[900],
          space: 1,
          style: BorderStyle.SINGLE,
          size: 8, // 2px border
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
          (dict as any).resumes?.editor?.sections?.summary || classicDict.summary
        )
      )

      const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.JUSTIFIED

      if (isHtmlList(resume.summary)) {
        const listParagraphs = parseHtmlListToParagraphs(
          resume.summary,
          {
            size: scaledFontSizes.body,
            color: SLATE[800],
            font: SERIF_FONT,
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
          color: SLATE[800],
          font: SERIF_FONT,
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
          (dict as any).resumes?.editor?.sections?.experience || classicDict.experience
        )
      )

      experiences.forEach((exp: any, i: number) => {
        const isLastExp = i === experiences.length - 1

        // Line 1: Position (left, bold) + Date range (right, italic)
        const dateText = exp.startDate
          ? `${new Date(exp.startDate + '-01').toLocaleDateString(locale as Locale, { month: 'short', year: 'numeric' })} - ${
              exp.current
                ? classicDict.present
                : exp.endDate
                  ? new Date(exp.endDate + '-01').toLocaleDateString(locale as Locale, { month: 'short', year: 'numeric' })
                  : classicDict.present
            }`
          : ''

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: exp.position || '',
                bold: true,
                size: scaledFontSizes.body,
                color: SLATE[900],
                font: SERIF_FONT,
              }),
              ...(dateText ? [
                new TextRun({
                  text: '\t' + dateText,
                  italics: true,
                  size: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale), // text-sm
                  color: SLATE[600],
                  font: SERIF_FONT,
                }),
              ] : []),
            ],
            spacing: { after: pxToTwips(2) },
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: rightTabPosition,
              },
            ],
          })
        )

        // Line 2: Company (left, italic) + Location (right)
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: exp.company || '',
                italics: true,
                size: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale), // text-sm
                color: SLATE[700],
                font: SERIF_FONT,
              }),
              ...(exp.location ? [
                new TextRun({
                  text: '\t' + exp.location,
                  size: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale), // text-sm
                  color: SLATE[600],
                  font: SERIF_FONT,
                }),
              ] : []),
            ],
            spacing: { after: pxToTwips(8) },
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: rightTabPosition,
              },
            ],
          })
        )

        // Achievements (disc bullets) or Description (paragraph)
        if (exp.achievements && exp.achievements.length > 0) {
          exp.achievements.forEach((achievement: string, j: number) => {
            const isLastAchievement = j === exp.achievements.length - 1

            const achievementRuns = parseHtmlToDocxRuns(achievement, {
              size: scaledFontSizes.body,
              color: SLATE[800],
              font: SERIF_FONT,
            })

            // Spacing: between achievements = 4px, between experiences = 16px, between sections = 20px
            const achievementSpacingAfter = !isLastAchievement
              ? pxToTwips(SPACING.ACHIEVEMENT_GAP)
              : isLastExp
                ? sectionEndSpacing
                : pxToTwips(SPACING.EXPERIENCE_ITEM_GAP)

            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: '• ',
                    size: scaledFontSizes.body,
                    color: SLATE[800],
                    font: SERIF_FONT,
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
                color: SLATE[800],
                font: SERIF_FONT,
              },
              pxToTwips(4),
              descSpacingAfter,
              undefined,
              descAlignment
            )
            children.push(...listParagraphs)
          } else {
            const descRuns = parseHtmlToDocxRuns(exp.description, {
              size: scaledFontSizes.body,
              color: SLATE[800],
              font: SERIF_FONT,
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
          // No description or achievements — add spacing between experiences
          if (!isLastExp) {
            children.push(
              new Paragraph({
                children: [],
                spacing: { after: pxToTwips(SPACING.EXPERIENCE_ITEM_GAP) },
              })
            )
          } else {
            children.push(
              new Paragraph({
                children: [],
                spacing: { after: sectionEndSpacing },
              })
            )
          }
        }
      })
    }

    // --- EDUCATION ---
    if (sectionId === 'education' && education.length > 0) {
      children.push(
        createSectionHeader(
          (dict as any).resumes?.editor?.sections?.education || classicDict.education
        )
      )

      education.forEach((edu: any, i: number) => {
        const isLastEdu = i === education.length - 1

        // Line 1: Degree (left, bold) + Date range (right, italic)
        const eduDateText = edu.startDate
          ? `${new Date(edu.startDate + '-01').toLocaleDateString(locale as Locale, { month: 'short', year: 'numeric' })} - ${
              edu.endDate
                ? new Date(edu.endDate + '-01').toLocaleDateString(locale as Locale, { month: 'short', year: 'numeric' })
                : classicDict.present
            }`
          : ''

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: edu.degree || '',
                bold: true,
                size: scaledFontSizes.body,
                color: SLATE[900],
                font: SERIF_FONT,
              }),
              ...(eduDateText ? [
                new TextRun({
                  text: '\t' + eduDateText,
                  italics: true,
                  size: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale), // text-sm
                  color: SLATE[600],
                  font: SERIF_FONT,
                }),
              ] : []),
            ],
            spacing: { after: pxToTwips(2) },
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: rightTabPosition,
              },
            ],
          })
        )

        // Line 2: School + optional " - field" (italic, slate-700)
        const schoolText = edu.field
          ? `${edu.school || ''} - ${edu.field}`
          : (edu.school || '')

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: schoolText,
                italics: true,
                size: scaledFontSizes.body,
                color: SLATE[700],
                font: SERIF_FONT,
              }),
            ],
            spacing: { after: edu.gpa || edu.description ? pxToTwips(2) : (isLastEdu ? sectionEndSpacing : pxToTwips(SPACING.EDUCATION_ITEM_GAP)) },
          })
        )

        // Line 3: GPA (optional)
        if (edu.gpa) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: 'GPA: ',
                  size: scaledFontSizes.body,
                  color: SLATE[600],
                  font: SERIF_FONT,
                }),
                new TextRun({
                  text: edu.gpa,
                  bold: true,
                  size: scaledFontSizes.body,
                  color: SLATE[600],
                  font: SERIF_FONT,
                }),
              ],
              spacing: { after: edu.description ? pxToTwips(2) : (isLastEdu ? sectionEndSpacing : pxToTwips(SPACING.EDUCATION_ITEM_GAP)) },
            })
          )
        }

        // Line 4: Description (optional)
        if (edu.description) {
          const eduDescRuns = parseHtmlToDocxRuns(edu.description, {
            size: scaledFontSizes.body,
            color: SLATE[800],
            font: SERIF_FONT,
          })

          children.push(
            new Paragraph({
              children: eduDescRuns,
              spacing: {
                after: isLastEdu ? sectionEndSpacing : pxToTwips(SPACING.EDUCATION_ITEM_GAP),
              },
            })
          )
        }
      })
    }

    // --- SKILLS ---
    if (sectionId === 'skills' && skills.length > 0) {
      children.push(
        createSectionHeader(
          (dict as any).resumes?.editor?.sections?.skills || classicDict.skills
        )
      )

      skills.forEach((skillCat: any, i: number) => {
        const isLastSkill = i === skills.length - 1
        const itemEndSpacing = isLastSkill ? sectionEndSpacing : pxToTwips(SPACING.SKILLS_ITEM_GAP)

        // "Category: item1, item2, item3" format
        // Use skillsHtml if available (rich text), otherwise fall back to items array
        if (skillCat.skillsHtml) {
          const plainSkills = stripHtml(skillCat.skillsHtml)
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${skillCat.category}: `,
                  bold: true,
                  size: scaledFontSizes.body,
                  color: SLATE[900],
                  font: SERIF_FONT,
                }),
                new TextRun({
                  text: plainSkills,
                  size: scaledFontSizes.body,
                  color: SLATE[800],
                  font: SERIF_FONT,
                }),
              ],
              spacing: { after: itemEndSpacing },
            })
          )
        } else if (skillCat.items && skillCat.items.length > 0) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${skillCat.category}: `,
                  bold: true,
                  size: scaledFontSizes.body,
                  color: SLATE[900],
                  font: SERIF_FONT,
                }),
                new TextRun({
                  text: skillCat.items.join(', '),
                  size: scaledFontSizes.body,
                  color: SLATE[800],
                  font: SERIF_FONT,
                }),
              ],
              spacing: { after: itemEndSpacing },
            })
          )
        }
      })
    }

    // --- PROJECTS ---
    if (sectionId === 'projects' && projects.length > 0) {
      children.push(
        createSectionHeader(
          (dict as any).resumes?.editor?.sections?.projects || classicDict.projects
        )
      )

      projects.forEach((project: any, i: number) => {
        const isLastProject = i === projects.length - 1
        const hasDescription = !!project.description
        const hasTechnologies = project.technologies && project.technologies.length > 0

        // Project name (bold, slate-900)
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: project.name || '',
                bold: true,
                size: scaledFontSizes.body,
                color: SLATE[900],
                font: SERIF_FONT,
              }),
            ],
            spacing: { after: hasDescription || hasTechnologies ? pxToTwips(4) : (isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP)) },
          })
        )

        // Description (optional)
        if (hasDescription) {
          const projectDescRuns = parseHtmlToDocxRuns(project.description, {
            size: scaledFontSizes.body,
            color: SLATE[800],
            font: SERIF_FONT,
          })

          children.push(
            new Paragraph({
              children: projectDescRuns,
              spacing: {
                after: hasTechnologies ? pxToTwips(4) : (isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP)),
              },
            })
          )
        }

        // Technologies (optional): "Technologies: tech1, tech2"
        if (hasTechnologies) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Technologies: ',
                  bold: true,
                  size: scaledFontSizes.body,
                  color: SLATE[700],
                  font: SERIF_FONT,
                }),
                new TextRun({
                  text: project.technologies.join(', '),
                  size: scaledFontSizes.body,
                  color: SLATE[700],
                  font: SERIF_FONT,
                }),
              ],
              spacing: { after: isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP) },
            })
          )
        }
      })
    }

    // --- LANGUAGES + CERTIFICATIONS (2-column grid) ---
    if (sectionId === 'languagesAndCerts' && (languages.length > 0 || certifications.length > 0)) {
      // Build languages column paragraphs
      const langParagraphs: Paragraph[] = []

      if (languages.length > 0) {
        langParagraphs.push(
          createSectionHeader(
            (dict as any).resumes?.editor?.sections?.languages || classicDict.languages
          )
        )

        languages.forEach((lang: any, i: number) => {
          const isLast = i === languages.length - 1
          const levelText = (dict as any).resumes?.editor?.levels?.[lang.level?.toLowerCase()] || lang.level || ''

          langParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: lang.language || '',
                  bold: true,
                  size: scaledFontSizes.body,
                  color: SLATE[900],
                  font: SERIF_FONT,
                }),
                new TextRun({
                  text: '\t' + levelText,
                  size: scaledFontSizes.body,
                  color: SLATE[700],
                  font: SERIF_FONT,
                }),
              ],
              spacing: { after: isLast ? 0 : pxToTwips(SPACING.LANGUAGE_ITEM_GAP) },
              tabStops: [
                {
                  type: TabStopType.RIGHT,
                  // Use half the content width minus gap as the column width for tab stop
                  position: Math.round((contentWidthTwips - pxToTwips(SPACING.GRID_GAP)) / 2),
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
            (dict as any).resumes?.editor?.sections?.certifications || classicDict.certifications
          )
        )

        certifications.forEach((cert: any, i: number) => {
          const isLast = i === certifications.length - 1

          // Cert name (bold, slate-900)
          certParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: cert.name || '',
                  bold: true,
                  size: scaledFontSizes.body,
                  color: SLATE[900],
                  font: SERIF_FONT,
                }),
              ],
              spacing: { after: cert.issuer || cert.date ? 0 : (isLast ? 0 : pxToTwips(SPACING.CERT_ITEM_GAP)) },
            })
          )

          // Issuer (slate-700)
          if (cert.issuer) {
            certParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: cert.issuer,
                    size: scaledFontSizes.body,
                    color: SLATE[700],
                    font: SERIF_FONT,
                  }),
                ],
                spacing: { after: cert.date ? 0 : (isLast ? 0 : pxToTwips(SPACING.CERT_ITEM_GAP)) },
              })
            )
          }

          // Date (italic, slate-600)
          if (cert.date) {
            certParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: new Date(cert.date + '-01').toLocaleDateString(locale as Locale, {
                      month: 'short',
                      year: 'numeric',
                    }),
                    italics: true,
                    size: scaledFontSizes.body,
                    color: SLATE[600],
                    font: SERIF_FONT,
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

      // Handle cases where only one column has data
      if (languages.length > 0 && certifications.length > 0) {
        // Both columns — use a 3-column table (lang | gap | certs)
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

        // Push Table directly — the docx library accepts both Paragraph and Table as section children
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
            font: SERIF_FONT,
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
// HELPER: Map generic section IDs to classic-specific order
// The classic template has a flat single-column layout, so sidebar
// sections (languages, certifications) become part of main content.
// ============================================================
function mapToClassicOrder(rawOrder: string[]): ClassicMainSectionId[] {
  const mapped: ClassicMainSectionId[] = []
  const seen = new Set<string>()

  for (const id of rawOrder) {
    if (seen.has(id)) continue

    switch (id) {
      case 'summary':
      case 'experience':
      case 'education':
      case 'skills':
      case 'projects':
        mapped.push(id as ClassicMainSectionId)
        seen.add(id)
        break
      // Languages and certifications are treated as a combined section
      case 'languages':
      case 'certifications':
      case 'languagesAndCerts':
        if (!seen.has('languagesAndCerts')) {
          mapped.push('languagesAndCerts')
          seen.add('languagesAndCerts')
        }
        break
      default:
        // Ignore unknown section IDs
        break
    }
  }

  // Ensure languagesAndCerts is included if not already mapped
  if (!seen.has('languagesAndCerts')) {
    mapped.push('languagesAndCerts')
  }

  return mapped
}
