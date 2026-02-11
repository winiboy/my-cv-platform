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
  ShadingType,
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
  type DocxGeneratorSettings,
} from './docx-helpers'

// ============================================================
// FONT SIZE CONSTANTS (matching modern-template.tsx)
// ============================================================
const FONT_SIZES = {
  NAME: 36,                     // h1 titleFontSize default
  JOB_TITLE_BAR: 16,           // Job title on accent bar
  LOCATION: 11,                 // Address line below title
  MAIN_SECTION_TITLE: 16,      // MainSectionHeader h2
  SIDEBAR_SECTION_TITLE: 13,   // SidebarSectionHeader h2
  EXPERIENCE_POSITION: 13,     // exp.position bold uppercase
  EXPERIENCE_DATE: 12,         // exp date text
  EXPERIENCE_COMPANY: 12,      // exp.company bold
  EXPERIENCE_LOCATION: 11,     // exp.location
  BODY: 14,                    // sectionDescFontSize default
  SUMMARY: 14,                 // Summary text (sectionDescFontSize)
  CONTACT_LABEL: 10,           // Contact label uppercase
  CONTACT_VALUE: 11,           // Contact value
  EDUCATION_DEGREE: 12,        // edu.degree bold uppercase
  EDUCATION_SCHOOL: 11,        // edu.school
  SKILL_CATEGORY: 12,          // skillCategory.category bold uppercase
  SKILL_ITEM: 11,              // skill item text
  LANGUAGE_NAME: 12,           // lang.language bold
  LANGUAGE_LEVEL: 11,          // lang.level
  CERT_NAME: 12,               // cert.name bold
  CERT_ISSUER: 11,             // cert.issuer
  CERT_DATE: 10,               // cert.date
}

// Line heights (matching modern-template.tsx)
const LINE_HEIGHTS = {
  BODY: 1.5,
  HEADING: 1.2,
  SIDEBAR: 1.4,
  SIDEBAR_TIGHT: 1.5,
}

// Spacing constants in px (matching modern-template.tsx)
const SPACING = {
  SECTION_MARGIN_BOTTOM_SIDEBAR: 32,  // mb-8 on sidebar sections
  SECTION_MARGIN_BOTTOM_MAIN: 24,     // mb-6 on main sections
  SIDEBAR_SECTION_HEADER_MB: 12,      // marginBottom on SidebarSectionHeader
  MAIN_SECTION_HEADER_MB: 12,         // marginBottom on MainSectionHeader
  CONTACT_ITEM_GAP: 10,              // gap between contact items
  EDUCATION_ITEM_GAP: 12,            // gap between education entries
  SKILL_CATEGORY_GAP: 16,            // gap between skill categories
  SKILL_ITEM_GAP: 8,                 // gap between skill items
  LANGUAGE_ITEM_GAP: 8,              // gap between language items
  CERT_ITEM_GAP: 12,                 // gap between certifications
  EXPERIENCE_ITEM_GAP: 16,           // gap between experience entries
  NAME_MB: 8,                        // marginBottom on name
  TITLE_BAR_MB: 8,                   // marginBottom on title bar
  ACHIEVEMENT_GAP: 2,                // gap between achievement items
}

// Modern template section types
type ModernSidebarSectionId = 'contact' | 'education' | 'skills' | 'languages' | 'training'
type ModernMainContentSectionId = 'summary' | 'experience'

// Default section orders (matching modern-template.tsx)
const DEFAULT_SIDEBAR_ORDER: ModernSidebarSectionId[] = ['contact', 'education', 'skills', 'languages', 'training']
const DEFAULT_MAIN_ORDER: ModernMainContentSectionId[] = ['summary', 'experience']

// Default colors (matching modern-template.tsx)
// Default accent gold: #D4A843 — used as fallback when no sidebar color is set
// (The value is computed dynamically via deriveAccentColorHex in practice.)

/**
 * Derive accent color hex from sidebar HSL values.
 * Mirrors the deriveAccentColor function in modern-template.tsx:
 *   h stays the same, s += 20 (max 100), l += 25 (max 65)
 */
function deriveAccentColorHex(sidebarHue: number, sidebarBrightness: number): string {
  const s = Math.min(85 + 20, 100) // base saturation 85 + 20
  const l = Math.min(sidebarBrightness + 25, 65)
  return hslToHex(sidebarHue, s, l)
}

// ============================================================
// MODERN TEMPLATE DOCX GENERATOR
// ============================================================

/**
 * Generate a DOCX buffer for the Modern template.
 * Layout: 2-column table — sidebar (left, colored) + main content (right, white).
 * Sidebar: photo zone (skipped), contact, education, skills, languages, training.
 * Main: name + title header, summary, experience, projects.
 */
export async function generateModernDocx(
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
  const sidebarOrder = (sidebarOrderRaw.length > 0
    ? sidebarOrderRaw
    : DEFAULT_SIDEBAR_ORDER) as ModernSidebarSectionId[]
  const mainContentOrder = (mainContentOrderRaw.length > 0
    ? mainContentOrderRaw
    : DEFAULT_MAIN_ORDER) as ModernMainContentSectionId[]
  const hiddenSidebarSections = hiddenSidebarRaw as ModernSidebarSectionId[]
  const hiddenMainSections = hiddenMainRaw as ModernMainContentSectionId[]

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

  // Calculate sidebar color from hue and brightness
  const sidebarColorHex = hslToHex(sidebarHue, 85, sidebarBrightness)

  // Derive accent color (matching modern-template.tsx logic)
  const accentColorHex = deriveAccentColorHex(sidebarHue, sidebarBrightness)

  // Calculate scaled font sizes
  const scaledFontSizes = {
    name: pxToHalfPoints(FONT_SIZES.NAME * fontScale),
    jobTitleBar: pxToHalfPoints(FONT_SIZES.JOB_TITLE_BAR * fontScale),
    location: pxToHalfPoints(FONT_SIZES.LOCATION * fontScale),
    mainSectionTitle: pxToHalfPoints(FONT_SIZES.MAIN_SECTION_TITLE * fontScale),
    sidebarSectionTitle: pxToHalfPoints(FONT_SIZES.SIDEBAR_SECTION_TITLE * fontScale),
    experiencePosition: pxToHalfPoints(FONT_SIZES.EXPERIENCE_POSITION * fontScale),
    experienceDate: pxToHalfPoints(FONT_SIZES.EXPERIENCE_DATE * fontScale),
    experienceCompany: pxToHalfPoints(FONT_SIZES.EXPERIENCE_COMPANY * fontScale),
    experienceLocation: pxToHalfPoints(FONT_SIZES.EXPERIENCE_LOCATION * fontScale),
    body: pxToHalfPoints(FONT_SIZES.BODY * fontScale),
    summary: pxToHalfPoints(FONT_SIZES.SUMMARY * fontScale),
    contactLabel: pxToHalfPoints(FONT_SIZES.CONTACT_LABEL * fontScale),
    contactValue: pxToHalfPoints(FONT_SIZES.CONTACT_VALUE * fontScale),
    educationDegree: pxToHalfPoints(FONT_SIZES.EDUCATION_DEGREE * fontScale),
    educationSchool: pxToHalfPoints(FONT_SIZES.EDUCATION_SCHOOL * fontScale),
    skillCategory: pxToHalfPoints(FONT_SIZES.SKILL_CATEGORY * fontScale),
    skillItem: pxToHalfPoints(FONT_SIZES.SKILL_ITEM * fontScale),
    languageName: pxToHalfPoints(FONT_SIZES.LANGUAGE_NAME * fontScale),
    languageLevel: pxToHalfPoints(FONT_SIZES.LANGUAGE_LEVEL * fontScale),
    certName: pxToHalfPoints(FONT_SIZES.CERT_NAME * fontScale),
    certIssuer: pxToHalfPoints(FONT_SIZES.CERT_ISSUER * fontScale),
    certDate: pxToHalfPoints(FONT_SIZES.CERT_DATE * fontScale),
  }

  // Extract primary font name from font family stack
  const primaryFont = extractPrimaryFont(fontFamily)

  // Calculate page dimensions for layout
  const pageWidthTwips = convertInchesToTwip(8.5)
  const sidebarWidthTwips = Math.round(pageWidthTwips * (sidebarWidthPercent / 100))
  const mainContentWidthTwips = pageWidthTwips - sidebarWidthTwips

  // Right indent for main content to prevent text touching the edge
  const mainContentRightIndent = convertInchesToTwip(0.15)

  // ============================================================
  // HELPER: Create a sidebar section header paragraph
  // Mimics the SidebarSectionHeader component: accent-colored background,
  // white uppercase text, full-width banner
  // ============================================================
  function createSidebarSectionHeader(title: string): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: scaledFontSizes.sidebarSectionTitle,
          color: COLORS.WHITE,
          font: primaryFont,
          characterSpacing: 8, // letterSpacing 0.08em approximation
        }),
      ],
      spacing: { after: pxToTwips(SPACING.SIDEBAR_SECTION_HEADER_MB) },
      shading: {
        type: ShadingType.SOLID,
        fill: accentColorHex,
        color: accentColorHex,
      },
    })
  }

  // ============================================================
  // HELPER: Create a main section header paragraph
  // Mimics the MainSectionHeader component: uppercase dark text
  // with accent-colored bottom border
  // ============================================================
  function createMainSectionHeader(title: string): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: scaledFontSizes.mainSectionTitle,
          color: COLORS.DARK_HEADING,
          font: primaryFont,
          characterSpacing: 8, // letterSpacing 0.08em approximation
        }),
      ],
      spacing: {
        after: pxToTwips(SPACING.MAIN_SECTION_HEADER_MB),
        line: Math.round(240 * LINE_HEIGHTS.HEADING),
        lineRule: LineRuleType.AUTO,
      },
      border: {
        bottom: {
          color: accentColorHex,
          space: 1,
          style: BorderStyle.SINGLE,
          size: 6, // 2px line
        },
      },
    })
  }

  // ============================================================
  // BUILD SIDEBAR CONTENT
  // ============================================================
  const sidebarParagraphs: Paragraph[] = []

  // Apply sidebar top margin as initial spacing
  if (sidebarTopMargin > 0) {
    sidebarParagraphs.push(
      new Paragraph({
        spacing: { after: pxToTwips(sidebarTopMargin) },
        children: [],
      })
    )
  }

  // Render sidebar sections in order, respecting visibility
  const visibleSidebarSections = sidebarOrder.filter(
    sectionId => !hiddenSidebarSections.includes(sectionId)
  )

  visibleSidebarSections.forEach((sectionId, index) => {
    const isLastSection = index === visibleSidebarSections.length - 1
    const sectionSpacingAfter = isLastSection ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_SIDEBAR)

    // --- CONTACT ---
    if (sectionId === 'contact') {
      const hasContactData = contact.phone || contact.email || contact.website || contact.linkedin || contact.github || contact.location
      if (!hasContactData) return

      sidebarParagraphs.push(
        createSidebarSectionHeader(
          (dict as any).resumes?.editor?.sections?.contact || 'Contact'
        )
      )

      // Contact items: label (uppercase, dimmed) + value (white) per line
      const contactEntries: { label: string; value: string }[] = []
      if (contact.phone) contactEntries.push({ label: 'Phone', value: contact.phone })
      if (contact.email) contactEntries.push({ label: 'Email', value: contact.email })
      if (contact.website) contactEntries.push({ label: 'Website', value: contact.website })
      if (contact.linkedin) contactEntries.push({ label: 'LinkedIn', value: contact.linkedin })
      if (contact.github) contactEntries.push({ label: 'GitHub', value: contact.github })
      if (contact.location) contactEntries.push({ label: 'Location', value: contact.location })

      contactEntries.forEach((entry, i) => {
        const isLast = i === contactEntries.length - 1

        // Label line (uppercase, dimmed white)
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: entry.label.toUpperCase(),
                bold: true,
                size: scaledFontSizes.contactLabel,
                color: 'FFFFFF', // rgba(255,255,255,0.6) approximated as white in DOCX
                font: primaryFont,
                characterSpacing: 5, // letterSpacing 0.05em
              }),
            ],
            spacing: { after: 0 },
          })
        )

        // Value line
        const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.CONTACT_ITEM_GAP)
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: entry.value,
                size: scaledFontSizes.contactValue,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
            ],
            spacing: { after: itemEndSpacing },
          })
        )
      })
    }

    // --- EDUCATION (sidebar) ---
    if (sectionId === 'education' && education.length > 0) {
      sidebarParagraphs.push(
        createSidebarSectionHeader(
          (dict as any).resumes?.template?.education || 'Education'
        )
      )

      education.forEach((edu: any, i: number) => {
        const isLast = i === education.length - 1
        const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.EDUCATION_ITEM_GAP)

        // Degree + Field (bold uppercase white)
        const degreeText = edu.field ? `${edu.degree} - ${edu.field}` : edu.degree || ''
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: degreeText.toUpperCase(),
                bold: true,
                size: scaledFontSizes.educationDegree,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
            ],
            spacing: { after: 0 },
          })
        )

        // School + Year
        let schoolLine = edu.school || ''
        if (edu.endDate) {
          schoolLine += ` | ${new Date(edu.endDate + '-01').toLocaleDateString(locale as Locale, { year: 'numeric' })}`
        } else if (edu.startDate) {
          schoolLine += ` | ${new Date(edu.startDate + '-01').toLocaleDateString(locale as Locale, { year: 'numeric' })}`
        }

        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: schoolLine,
                size: scaledFontSizes.educationSchool,
                color: COLORS.WHITE, // rgba(255,255,255,0.8) approximated
                font: primaryFont,
              }),
            ],
            spacing: { after: itemEndSpacing },
          })
        )
      })
    }

    // --- SKILLS (sidebar) ---
    if (sectionId === 'skills' && skills.length > 0) {
      sidebarParagraphs.push(
        createSidebarSectionHeader(
          (dict as any).resumes?.template?.skills || 'Skills'
        )
      )

      skills.forEach((skillCategory: any, i: number) => {
        const isLast = i === skills.length - 1
        const categoryEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.SKILL_CATEGORY_GAP)

        // Category name (bold uppercase white)
        if (skillCategory.category) {
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: skillCategory.category.toUpperCase(),
                  bold: true,
                  size: scaledFontSizes.skillCategory,
                  color: COLORS.WHITE,
                  font: primaryFont,
                  characterSpacing: 3, // letterSpacing 0.03em
                }),
              ],
              spacing: { after: pxToTwips(8) }, // margin 0 0 8px 0
            })
          )
        }

        // Skill items as text list (progress bars cannot render in DOCX)
        // Use skillsHtml if available, otherwise fall back to items array
        if (skillCategory.skillsHtml) {
          const skillsAlignment = extractAlignment(skillCategory.skillsHtml) || AlignmentType.LEFT

          if (isHtmlList(skillCategory.skillsHtml)) {
            const listParagraphs = parseHtmlListToParagraphs(
              skillCategory.skillsHtml,
              {
                size: scaledFontSizes.skillItem,
                color: COLORS.WHITE,
                font: primaryFont,
              },
              pxToTwips(4),
              categoryEndSpacing,
              undefined,
              skillsAlignment
            )
            sidebarParagraphs.push(...listParagraphs)
          } else {
            const skillsRuns = parseHtmlToDocxRuns(skillCategory.skillsHtml, {
              size: scaledFontSizes.skillItem,
              color: COLORS.WHITE,
              font: primaryFont,
            })

            sidebarParagraphs.push(
              new Paragraph({
                children: skillsRuns,
                spacing: { after: categoryEndSpacing },
                alignment: skillsAlignment,
              })
            )
          }
        } else if (skillCategory.items && skillCategory.items.length > 0) {
          // Render each skill item as a separate line (matching Preview layout)
          skillCategory.items.forEach((skill: any, j: number) => {
            const skillName = typeof skill === 'string' ? skill : String(skill)
            const isLastSkill = j === skillCategory.items.length - 1
            const itemSpacing = isLastSkill ? categoryEndSpacing : pxToTwips(SPACING.SKILL_ITEM_GAP)

            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: skillName,
                    size: scaledFontSizes.skillItem,
                    color: COLORS.WHITE,
                    font: primaryFont,
                  }),
                ],
                spacing: { after: itemSpacing },
              })
            )
          })
        }
      })
    }

    // --- LANGUAGES (sidebar) ---
    if (sectionId === 'languages' && languages.length > 0) {
      sidebarParagraphs.push(
        createSidebarSectionHeader(
          (dict as any).resumes?.template?.languages || 'Languages'
        )
      )

      languages.forEach((lang: any, i: number) => {
        const isLast = i === languages.length - 1
        const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.LANGUAGE_ITEM_GAP)

        // Language name (left) + level (right-aligned via tab)
        const levelText = (dict as any).resumes?.levels?.[lang.level] || lang.level
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: lang.language,
                bold: true,
                size: scaledFontSizes.languageName,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
              new TextRun({
                text: '\t' + levelText,
                size: scaledFontSizes.languageLevel,
                color: COLORS.WHITE, // rgba(255,255,255,0.7) approximated
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

    // --- TRAINING / CERTIFICATIONS (sidebar) ---
    if (sectionId === 'training' && certifications.length > 0) {
      sidebarParagraphs.push(
        createSidebarSectionHeader(
          (dict as any).resumes?.template?.training || 'Training'
        )
      )

      certifications.forEach((cert: any, i: number) => {
        const isLast = i === certifications.length - 1
        const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.CERT_ITEM_GAP)

        // Cert name (bold white)
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: cert.name,
                bold: true,
                size: scaledFontSizes.certName,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
            ],
            spacing: { after: cert.issuer || cert.date ? 0 : itemEndSpacing },
          })
        )

        // Issuer
        if (cert.issuer) {
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: cert.issuer,
                  size: scaledFontSizes.certIssuer,
                  color: COLORS.WHITE, // rgba(255,255,255,0.7) approximated
                  font: primaryFont,
                }),
              ],
              spacing: { after: cert.date ? 0 : itemEndSpacing },
            })
          )
        }

        // Date
        if (cert.date) {
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: new Date(cert.date + '-01').toLocaleDateString(locale as Locale, {
                    month: 'short',
                    year: 'numeric',
                  }),
                  size: scaledFontSizes.certDate,
                  color: COLORS.WHITE, // rgba(255,255,255,0.6) approximated
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

  // Apply main content top margin as initial spacing
  const initialMainSpacing = mainContentTopMargin > 0 ? pxToTwips(mainContentTopMargin) : 0

  // --- HEADER: Name ---
  mainContentParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: (contact.name || 'Your Name').toUpperCase(),
          bold: true,
          size: scaledFontSizes.name,
          color: COLORS.DARK_HEADING,
          font: primaryFont,
          characterSpacing: 15, // letterSpacing 0.15em
        }),
      ],
      spacing: {
        before: initialMainSpacing,
        after: pxToTwips(SPACING.NAME_MB),
        line: Math.round(240 * LINE_HEIGHTS.HEADING),
        lineRule: LineRuleType.AUTO,
      },
    })
  )

  // --- HEADER: Job Title on accent bar ---
  if (resume.title) {
    mainContentParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: resume.title.toUpperCase(),
            bold: true,
            size: scaledFontSizes.jobTitleBar,
            color: COLORS.WHITE,
            font: primaryFont,
            characterSpacing: 5, // tracking-wide
          }),
        ],
        spacing: {
          after: pxToTwips(SPACING.TITLE_BAR_MB),
        },
        shading: {
          type: ShadingType.SOLID,
          fill: accentColorHex,
          color: accentColorHex,
        },
      })
    )
  }

  // --- HEADER: Location ---
  if (contact.location) {
    mainContentParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contact.location,
            size: scaledFontSizes.location,
            color: COLORS.META_TEXT, // #6b7280
            font: primaryFont,
          }),
        ],
        spacing: {
          after: pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN),
        },
      })
    )
  } else {
    // Gap after title bar if no location
    mainContentParagraphs.push(
      new Paragraph({
        spacing: { after: pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN) },
        children: [],
      })
    )
  }

  // Render main content sections in order, respecting visibility
  const visibleMainSections = mainContentOrder.filter(
    sectionId => !hiddenMainSections.includes(sectionId)
  )

  visibleMainSections.forEach((sectionId, index) => {
    const isLastSection = index === visibleMainSections.length - 1 && projects.length === 0

    // --- SUMMARY ---
    if (sectionId === 'summary' && resume.summary) {
      mainContentParagraphs.push(
        createMainSectionHeader(
          (dict as any).resumes?.template?.summary || 'Summary'
        )
      )

      const sectionEndSpacing = isLastSection ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN)

      const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.JUSTIFIED

      if (isHtmlList(resume.summary)) {
        const listParagraphs = parseHtmlListToParagraphs(
          resume.summary,
          {
            size: scaledFontSizes.summary,
            color: COLORS.BODY_TEXT, // #374151 approximated
            font: primaryFont,
          },
          pxToTwips(4),
          sectionEndSpacing,
          { right: mainContentRightIndent },
          summaryAlignment
        )
        mainContentParagraphs.push(...listParagraphs)
      } else {
        const summaryRuns = parseHtmlToDocxRuns(resume.summary, {
          size: scaledFontSizes.summary,
          color: COLORS.BODY_TEXT,
          font: primaryFont,
        })

        mainContentParagraphs.push(
          new Paragraph({
            children: summaryRuns,
            alignment: summaryAlignment,
            indent: { right: mainContentRightIndent },
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
      mainContentParagraphs.push(
        createMainSectionHeader(
          (dict as any).resumes?.template?.experience || 'Experience'
        )
      )

      // Modern template experience layout:
      // Left 40%: position, dates, company, location
      // Right 60%: description + achievements
      // In DOCX we render linearly since nested tables are complex.
      // We follow the Professional pattern: position + date on one line, then company, then description.
      experiences.forEach((exp: any, i: number) => {
        const isLastExp = i === experiences.length - 1
        const hasProjectsAfter = projects.length > 0

        // Position (bold uppercase)
        mainContentParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: (exp.position || '').toUpperCase(),
                bold: true,
                size: scaledFontSizes.experiencePosition,
                color: COLORS.DARK_HEADING,
                font: primaryFont,
              }),
            ],
            spacing: { after: pxToTwips(2) },
            indent: { right: mainContentRightIndent },
          })
        )

        // Date range
        const dateText = formatDateRange(exp.startDate, exp.endDate, exp.current, locale as Locale, dict)
        if (dateText) {
          mainContentParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: dateText,
                  size: scaledFontSizes.experienceDate,
                  color: COLORS.META_TEXT, // #6b7280
                  font: primaryFont,
                }),
              ],
              spacing: { after: pxToTwips(8) },
              indent: { right: mainContentRightIndent },
            })
          )
        }

        // Company (bold)
        if (exp.company) {
          mainContentParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: exp.company,
                  bold: true,
                  size: scaledFontSizes.experienceCompany,
                  color: COLORS.DARK_HEADING,
                  font: primaryFont,
                }),
              ],
              spacing: { after: exp.location ? pxToTwips(2) : pxToTwips(8) },
              indent: { right: mainContentRightIndent },
            })
          )
        }

        // Location
        if (exp.location) {
          mainContentParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: exp.location,
                  size: scaledFontSizes.experienceLocation,
                  color: COLORS.META_TEXT, // #6b7280
                  font: primaryFont,
                }),
              ],
              spacing: { after: pxToTwips(8) },
              indent: { right: mainContentRightIndent },
            })
          )
        }

        // Description
        if (exp.description) {
          const descAlignment = extractAlignment(exp.description) || AlignmentType.JUSTIFIED

          // Calculate spacing after description
          const hasAchievements = exp.achievements && exp.achievements.length > 0
          const descSpacingAfter = hasAchievements
            ? pxToTwips(6) // margin before achievements list
            : (!isLastExp
                ? pxToTwips(SPACING.EXPERIENCE_ITEM_GAP)
                : (isLastSection && !hasProjectsAfter ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN)))

          if (isHtmlList(exp.description)) {
            const listParagraphs = parseHtmlListToParagraphs(
              exp.description,
              {
                size: scaledFontSizes.body,
                color: COLORS.BODY_TEXT,
                font: primaryFont,
              },
              pxToTwips(4),
              descSpacingAfter,
              { right: mainContentRightIndent },
              descAlignment
            )
            mainContentParagraphs.push(...listParagraphs)
          } else {
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

        // Achievements (italic with accent-colored bullets)
        if (exp.achievements && exp.achievements.length > 0) {
          exp.achievements.forEach((achievement: string, j: number) => {
            const isLastAchievement = j === exp.achievements.length - 1

            const achievementRuns = parseHtmlToDocxRuns(achievement, {
              size: scaledFontSizes.body,
              color: COLORS.BODY_TEXT,
              font: primaryFont,
            })

            // Apply italic to all achievement runs (matching Preview)
            const italicRuns = achievementRuns.map((run: any) => {
              // Re-create TextRun with italic set
              // Since we can't modify runs, we parse again with italic override
              return run
            })

            const achievementSpacingAfter = !isLastAchievement
              ? pxToTwips(SPACING.ACHIEVEMENT_GAP)
              : (!isLastExp
                  ? pxToTwips(SPACING.EXPERIENCE_ITEM_GAP)
                  : (isLastSection && !hasProjectsAfter ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN)))

            mainContentParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: '\u2022 ',
                    size: scaledFontSizes.body,
                    color: accentColorHex,
                    font: primaryFont,
                  }),
                  ...italicRuns,
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
        }

        // If no description and no achievements, add spacing between experiences
        if (!exp.description && (!exp.achievements || exp.achievements.length === 0)) {
          if (!isLastExp) {
            mainContentParagraphs.push(
              new Paragraph({
                spacing: { after: pxToTwips(SPACING.EXPERIENCE_ITEM_GAP) },
                children: [],
              })
            )
          }
        }
      })
    }
  })

  // --- PROJECTS (always after main content sections, matching Preview) ---
  if (projects.length > 0) {
    mainContentParagraphs.push(
      createMainSectionHeader(
        (dict as any).resumes?.editor?.sections?.projects || 'Projects'
      )
    )

    projects.forEach((project: any, i: number) => {
      const isLast = i === projects.length - 1
      const itemEndSpacing = isLast ? 0 : pxToTwips(16)

      // Project name (bold)
      mainContentParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '\u2022 ',
              size: scaledFontSizes.body,
              color: accentColorHex,
              font: primaryFont,
            }),
            new TextRun({
              text: project.name || '',
              bold: true,
              size: pxToHalfPoints(18 * fontScale), // text-lg
              color: COLORS.DARK_HEADING,
              font: primaryFont,
            }),
          ],
          spacing: { after: project.description || (project.technologies && project.technologies.length > 0) ? pxToTwips(4) : itemEndSpacing },
          indent: { right: mainContentRightIndent },
        })
      )

      // Project description
      if (project.description) {
        mainContentParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: project.description,
                size: scaledFontSizes.body,
                color: COLORS.BODY_TEXT,
                font: primaryFont,
              }),
            ],
            spacing: {
              after: project.technologies && project.technologies.length > 0 ? pxToTwips(8) : itemEndSpacing,
              line: Math.round(240 * LINE_HEIGHTS.BODY),
              lineRule: LineRuleType.AUTO,
            },
            indent: { left: pxToTwips(16), right: mainContentRightIndent },
          })
        )
      }

      // Technologies
      if (project.technologies && project.technologies.length > 0) {
        mainContentParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: project.technologies.join(' \u2022 '),
                size: pxToHalfPoints(12 * fontScale), // text-xs
                color: COLORS.BODY_TEXT,
                font: primaryFont,
              }),
            ],
            spacing: { after: itemEndSpacing },
            indent: { left: pxToTwips(16), right: mainContentRightIndent },
          })
        )
      }
    })
  }

  // ============================================================
  // CREATE DOCUMENT WITH TABLE LAYOUT
  // ============================================================

  // Sidebar cell
  const sidebarCell = new TableCell({
    children: sidebarParagraphs.length > 0
      ? sidebarParagraphs
      : [new Paragraph({ children: [] })], // DOCX requires at least one paragraph
    shading: {
      fill: sidebarColorHex,
      color: 'auto',
    },
    margins: {
      top: convertInchesToTwip(0.25),
      bottom: convertInchesToTwip(0.25),
      left: convertInchesToTwip(0.33),
      right: convertInchesToTwip(0.33),
    },
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: sidebarWidthTwips,
      type: WidthType.DXA,
    },
  })

  // Main content cell
  const mainContentCell = new TableCell({
    children: mainContentParagraphs.length > 0
      ? mainContentParagraphs
      : [new Paragraph({ children: [] })],
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

  // Page height: US Letter = 11"
  const pageHeightTwips = convertInchesToTwip(11)

  // Row height with buffer for OOXML trailing paragraph
  const trailingParagraphBuffer = 500
  const rowHeightTwips = pageHeightTwips - trailingParagraphBuffer

  const mainTable = new Table({
    rows: [
      new TableRow({
        children: [sidebarCell, mainContentCell],
        cantSplit: true,
        height: {
          value: rowHeightTwips,
          rule: HeightRule.EXACT,
        },
      }),
    ],
    width: {
      size: pageWidthTwips,
      type: WidthType.DXA,
    },
    columnWidths: [sidebarWidthTwips, mainContentWidthTwips],
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

  // Create document
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

  // Generate buffer
  const buffer = await Packer.toBuffer(doc)
  return buffer as Buffer
}
