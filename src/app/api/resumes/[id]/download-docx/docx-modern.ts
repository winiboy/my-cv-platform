import { getTranslations, type Locale } from '@/lib/i18n'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
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

// Modern template default colors (matching modern-template.tsx constants)
const DEFAULT_SIDEBAR_COLOR_HEX = '333333'
const DEFAULT_ACCENT_COLOR_HEX = 'D4A843'

// Modern template section types
type ModernSidebarSectionId = 'contact' | 'education' | 'skills' | 'languages' | 'training'
type ModernMainContentSectionId = 'summary' | 'experience'

// Default section orders (matching modern-template.tsx)
const DEFAULT_SIDEBAR_ORDER: ModernSidebarSectionId[] = ['contact', 'education', 'skills', 'languages', 'training']
const DEFAULT_MAIN_ORDER: ModernMainContentSectionId[] = ['summary', 'experience']

/**
 * Derive accent color hex from sidebar HSL values.
 * Mirrors the deriveAccentColor function in modern-template.tsx:
 *   h stays the same, s += 20 (max 100), l += 25 (max 65)
 */
function deriveAccentColorHex(sidebarHue: number, sidebarSaturation: number, sidebarBrightness: number): string {
  const s = Math.min(sidebarSaturation + 20, 100)
  const l = Math.min(sidebarBrightness + 25, 65)
  return hslToHex(sidebarHue, s, l)
}

/**
 * Detect the image type from a base64 data URL or raw base64 string.
 * Returns a docx-compatible type or null if unrecognized.
 */
function detectImageType(base64: string): 'jpg' | 'png' | 'gif' | 'bmp' | null {
  if (base64.startsWith('data:image/jpeg') || base64.startsWith('data:image/jpg')) return 'jpg'
  if (base64.startsWith('data:image/png')) return 'png'
  if (base64.startsWith('data:image/gif')) return 'gif'
  if (base64.startsWith('data:image/bmp')) return 'bmp'

  // Check raw base64 magic bytes (no data URL prefix)
  // JPEG starts with /9j/, PNG starts with iVBOR
  if (base64.startsWith('/9j/')) return 'jpg'
  if (base64.startsWith('iVBOR')) return 'png'
  if (base64.startsWith('R0lGOD')) return 'gif'

  return null
}

/**
 * Extract raw base64 data from a data URL. If already raw, returns as-is.
 */
function extractBase64Data(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex !== -1 && dataUrl.startsWith('data:')) {
    return dataUrl.substring(commaIndex + 1)
  }
  return dataUrl
}

// ============================================================
// MODERN TEMPLATE DOCX GENERATOR
// ============================================================

/**
 * Generate a DOCX buffer for the Modern template.
 * Layout: 2-column table -- sidebar (left, colored) + main content (right, white).
 * Sidebar: photo zone, contact, education, skills, languages, training.
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
    hasCustomColors,
    photoBase64,
  } = settings

  // Validate incoming section IDs against Modern template's known sections.
  // The route defaults are for the Professional template and may not match.
  const validSidebarIds = new Set<string>(DEFAULT_SIDEBAR_ORDER)
  const validMainIds = new Set<string>(DEFAULT_MAIN_ORDER)

  const filteredSidebar = sidebarOrderRaw.filter(id => validSidebarIds.has(id))
  const filteredMain = mainContentOrderRaw.filter(id => validMainIds.has(id))

  const sidebarOrder = (filteredSidebar.length > 0
    ? filteredSidebar
    : DEFAULT_SIDEBAR_ORDER) as ModernSidebarSectionId[]
  const mainContentOrder = (filteredMain.length > 0
    ? filteredMain
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

  // ============================================================
  // COLOR LOGIC (matching modern-template.tsx exactly)
  // When the user hasn't customized colors, use the template defaults:
  //   sidebar = #333333, accent = #D4A843
  // When the user has customized, compute from HSL values.
  // ============================================================
  let sidebarColorHex: string
  let accentColorHex: string

  const sidebarSaturation = settings.sidebarSaturation ?? 85

  if (hasCustomColors) {
    sidebarColorHex = hslToHex(sidebarHue, sidebarSaturation, sidebarBrightness)
    accentColorHex = deriveAccentColorHex(sidebarHue, sidebarSaturation, sidebarBrightness)
  } else {
    sidebarColorHex = DEFAULT_SIDEBAR_COLOR_HEX
    accentColorHex = DEFAULT_ACCENT_COLOR_HEX
  }

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

  // Sidebar text indentation — replaces cell margins (which are 0 for edge-to-edge photo).
  // All non-photo sidebar paragraphs use this left/right indent.
  const sidebarTextIndent = {
    left: convertInchesToTwip(0.33),
    right: convertInchesToTwip(0.33),
  }

  // No-border definition for nested tables
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  } as const

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
      indent: sidebarTextIndent,
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
  // PHOTO EMBEDDING (Defect 1)
  // Convert base64 photo data to ImageRun for the sidebar
  // ============================================================
  let photoImageRun: ImageRun | null = null

  if (photoBase64) {
    try {
      const imageType = detectImageType(photoBase64)
      if (imageType) {
        const rawBase64 = extractBase64Data(photoBase64)
        const imageBuffer = Buffer.from(rawBase64, 'base64')

        // docx library v9.5.1 expects pixels for transformation dimensions
        // and internally converts to EMUs (pixels * 9525).
        const sidebarInches = (sidebarWidthPercent / 100) * 8.5
        // Photo fills the full sidebar width edge-to-edge, matching the preview
        const imageWidthPx = Math.round(sidebarInches * 96)
        // Photo zone height matches the 220px zone in the template
        const imageHeightPx = 220

        photoImageRun = new ImageRun({
          type: imageType,
          data: imageBuffer,
          transformation: {
            width: imageWidthPx,
            height: imageHeightPx,
          },
        })
      }
    } catch {
      // Photo embedding failed silently -- continue without photo
    }
  }

  // ============================================================
  // BUILD SIDEBAR CONTENT
  // ============================================================
  const sidebarParagraphs: Paragraph[] = []

  // Add photo at the top of sidebar if available — no spacing after, left-aligned
  // to fill the sidebar edge-to-edge (cell margins are 0)
  if (photoImageRun) {
    sidebarParagraphs.push(
      new Paragraph({
        children: [photoImageRun],
        spacing: { after: 0 },
        alignment: AlignmentType.LEFT,
      })
    )
  }

  // Cell margins are 0, so recreate vertical padding via paragraph spacing.
  // When a photo is present: photo is flush top, then add 0.25" gap before text.
  // When no photo: add 0.25" top padding (previously from cell margin).
  const topPaddingBeforeText = convertInchesToTwip(0.25)
  if (sidebarTopMargin > 0) {
    sidebarParagraphs.push(
      new Paragraph({
        spacing: {
          before: photoImageRun ? topPaddingBeforeText : topPaddingBeforeText,
          after: pxToTwips(sidebarTopMargin),
        },
        indent: sidebarTextIndent,
        children: [],
      })
    )
  } else {
    // Always add the top padding spacer paragraph before first text content
    sidebarParagraphs.push(
      new Paragraph({
        spacing: { before: topPaddingBeforeText, after: 0 },
        indent: sidebarTextIndent,
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

      // Contact items: emoji icon + label (uppercase, dimmed) + value (white) per line
      const contactEntries: { label: string; value: string; icon: string }[] = []
      if (contact.phone) contactEntries.push({ label: 'Phone', value: contact.phone, icon: '\u{1F4DE}' })
      if (contact.email) contactEntries.push({ label: 'Email', value: contact.email, icon: '\u{2709}\uFE0F' })
      if (contact.website) contactEntries.push({ label: 'Website', value: contact.website, icon: '\u{1F310}' })
      if (contact.linkedin) contactEntries.push({ label: 'LinkedIn', value: contact.linkedin, icon: '\u{1F517}' })
      if (contact.github) contactEntries.push({ label: 'GitHub', value: contact.github, icon: '\u{1F4BB}' })
      if (contact.location) contactEntries.push({ label: 'Location', value: contact.location, icon: '\u{1F4CD}' })

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
            indent: sidebarTextIndent,
            spacing: { after: 0 },
          })
        )

        // Value line (with emoji icon prefix)
        const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.CONTACT_ITEM_GAP)
        sidebarParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${entry.icon} `,
                size: scaledFontSizes.contactValue,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
              new TextRun({
                text: entry.value,
                size: scaledFontSizes.contactValue,
                color: COLORS.WHITE,
                font: primaryFont,
              }),
            ],
            indent: sidebarTextIndent,
            spacing: { after: itemEndSpacing },
          })
        )
      })
    }

    // --- EDUCATION (sidebar) ---
    if (sectionId === 'education' && education.length > 0) {
      sidebarParagraphs.push(
        createSidebarSectionHeader(
          (dict as any).resumes?.editor?.sections?.education || 'Education'
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
            indent: sidebarTextIndent,
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
            indent: sidebarTextIndent,
            spacing: { after: itemEndSpacing },
          })
        )
      })
    }

    // --- SKILLS (sidebar) ---
    if (sectionId === 'skills' && skills.length > 0) {
      sidebarParagraphs.push(
        createSidebarSectionHeader(
          (dict as any).resumes?.editor?.sections?.skills || 'Technical Skills'
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
              indent: sidebarTextIndent,
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
              sidebarTextIndent,
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
                indent: sidebarTextIndent,
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
                indent: sidebarTextIndent,
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
          (dict as any).resumes?.editor?.sections?.languages || 'Languages'
        )
      )

      languages.forEach((lang: any, i: number) => {
        const isLast = i === languages.length - 1
        const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.LANGUAGE_ITEM_GAP)

        // Language name (left) + level (right-aligned via tab)
        const levelText = (dict as any).resumes?.editor?.levels?.[lang.level?.toLowerCase()] || lang.level
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
            indent: sidebarTextIndent,
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
          (dict as any).resumes?.editor?.sections?.certifications || 'Training'
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
            indent: sidebarTextIndent,
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
              indent: sidebarTextIndent,
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
              indent: sidebarTextIndent,
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
          (dict as any).resumes?.editor?.sections?.summary || 'Professional Profile'
        )
      )

      const sectionEndSpacing = isLastSection ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN)

      const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.LEFT

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

    // --- EXPERIENCE (Defect 3: 2-column inner layout) ---
    if (sectionId === 'experience' && experiences.length > 0) {
      mainContentParagraphs.push(
        createMainSectionHeader(
          (dict as any).resumes?.editor?.sections?.experience || 'Professional Experience'
        )
      )

      // Modern template experience layout:
      // Left 40%: position, dates, company, location
      // Right 60%: description + achievements
      // Rendered as nested tables within the main content area
      experiences.forEach((exp: any, i: number) => {
        const isLastExp = i === experiences.length - 1
        const hasProjectsAfter = projects.length > 0

        // --- Build LEFT column paragraphs (40%) ---
        const leftParagraphs: Paragraph[] = []

        // Position (bold uppercase)
        leftParagraphs.push(
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
          })
        )

        // Date range
        const dateText = formatDateRange(exp.startDate, exp.endDate, exp.current, locale as Locale, dict)
        if (dateText) {
          leftParagraphs.push(
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
            })
          )
        }

        // Company (bold)
        if (exp.company) {
          leftParagraphs.push(
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
              spacing: { after: exp.location ? pxToTwips(2) : 0 },
            })
          )
        }

        // Location
        if (exp.location) {
          leftParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: exp.location,
                  size: scaledFontSizes.experienceLocation,
                  color: COLORS.META_TEXT, // #6b7280
                  font: primaryFont,
                }),
              ],
              spacing: { after: 0 },
            })
          )
        }

        // Ensure at least one paragraph in left column
        if (leftParagraphs.length === 0) {
          leftParagraphs.push(new Paragraph({ children: [] }))
        }

        // --- Build RIGHT column paragraphs (60%) ---
        const rightParagraphs: Paragraph[] = []

        // Description
        if (exp.description) {
          const descAlignment = extractAlignment(exp.description) || AlignmentType.LEFT

          if (isHtmlList(exp.description)) {
            const listParagraphs = parseHtmlListToParagraphs(
              exp.description,
              {
                size: scaledFontSizes.body,
                color: COLORS.BODY_TEXT,
                font: primaryFont,
              },
              pxToTwips(4),
              exp.achievements && exp.achievements.length > 0 ? pxToTwips(6) : 0,
              undefined,
              descAlignment
            )
            rightParagraphs.push(...listParagraphs)
          } else {
            const descRuns = parseHtmlToDocxRuns(exp.description, {
              size: scaledFontSizes.body,
              color: COLORS.BODY_TEXT,
              font: primaryFont,
            })

            rightParagraphs.push(
              new Paragraph({
                children: descRuns,
                spacing: {
                  after: exp.achievements && exp.achievements.length > 0 ? pxToTwips(6) : 0,
                  line: Math.round(240 * LINE_HEIGHTS.BODY),
                  lineRule: LineRuleType.AUTO,
                },
                alignment: descAlignment,
              })
            )
          }
        }

        // Achievements (italic with accent-colored bullets)
        if (exp.achievements && exp.achievements.length > 0) {
          exp.achievements.forEach((achievement: string, j: number) => {
            const isLastAchievement = j === exp.achievements.length - 1

            // Decode HTML entities then strip HTML tags for the achievement text
            const achievementText = achievement
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&nbsp;/g, ' ')
              .replace(/&quot;/g, '"')
              .replace(/<[^>]+>/g, '')
              .trim()

            rightParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: '\u2022 ',
                    size: scaledFontSizes.body,
                    color: accentColorHex,
                    font: primaryFont,
                    italics: true,
                  }),
                  new TextRun({
                    text: achievementText,
                    size: scaledFontSizes.body,
                    color: COLORS.BODY_TEXT,
                    font: primaryFont,
                    italics: true,
                  }),
                ],
                spacing: {
                  after: isLastAchievement ? 0 : pxToTwips(SPACING.ACHIEVEMENT_GAP),
                  line: Math.round(240 * LINE_HEIGHTS.BODY),
                  lineRule: LineRuleType.AUTO,
                },
              })
            )
          })
        }

        // Ensure at least one paragraph in right column
        if (rightParagraphs.length === 0) {
          rightParagraphs.push(new Paragraph({ children: [] }))
        }

        // --- Create 2-column nested table for this experience entry ---
        // Calculate column widths: 40% left, 60% right of available main content width
        // Subtract cell margins from available width for inner table
        const innerTableWidth = mainContentWidthTwips - convertInchesToTwip(0.66)
        const leftColumnWidth = Math.round(innerTableWidth * 0.4)
        const rightColumnWidth = innerTableWidth - leftColumnWidth

        const experienceTable = new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: leftParagraphs,
                  width: { size: leftColumnWidth, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.TOP,
                  margins: {
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: pxToTwips(16), // gap: 16px between columns
                  },
                  borders: noBorders,
                }),
                new TableCell({
                  children: rightParagraphs,
                  width: { size: rightColumnWidth, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.TOP,
                  margins: {
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                  },
                  borders: noBorders,
                }),
              ],
            }),
          ],
          width: { size: innerTableWidth, type: WidthType.DXA },
          columnWidths: [leftColumnWidth, rightColumnWidth],
          layout: TableLayoutType.FIXED,
          borders: noBorders,
        })

        // Cast Table to Paragraph[] type; resolved at assembly via mainContentChildren union cast
        mainContentParagraphs.push(experienceTable as unknown as Paragraph)

        // Add spacing after this experience entry
        const expEndSpacing = isLastExp
          ? (isLastSection && !hasProjectsAfter ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN))
          : pxToTwips(SPACING.EXPERIENCE_ITEM_GAP)

        if (expEndSpacing > 0) {
          mainContentParagraphs.push(
            new Paragraph({
              spacing: { after: expEndSpacing },
              children: [],
            })
          )
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

      // Project description (Defect 4: use HTML parsing instead of raw text)
      if (project.description) {
        if (isHtmlList(project.description)) {
          const listParagraphs = parseHtmlListToParagraphs(
            project.description,
            {
              size: scaledFontSizes.body,
              color: COLORS.BODY_TEXT,
              font: primaryFont,
            },
            pxToTwips(4),
            project.technologies && project.technologies.length > 0 ? pxToTwips(8) : itemEndSpacing,
            { left: pxToTwips(16), right: mainContentRightIndent }
          )
          mainContentParagraphs.push(...listParagraphs)
        } else {
          const descRuns = parseHtmlToDocxRuns(project.description, {
            size: scaledFontSizes.body,
            color: COLORS.BODY_TEXT,
            font: primaryFont,
          })

          mainContentParagraphs.push(
            new Paragraph({
              children: descRuns,
              spacing: {
                after: project.technologies && project.technologies.length > 0 ? pxToTwips(8) : itemEndSpacing,
                line: Math.round(240 * LINE_HEIGHTS.BODY),
                lineRule: LineRuleType.AUTO,
              },
              indent: { left: pxToTwips(16), right: mainContentRightIndent },
            })
          )
        }
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

  // Cast mainContentParagraphs to the union type that TableCell accepts
  // This allows Tables (from experience section) alongside Paragraphs
  const mainContentChildren: (Paragraph | Table)[] = mainContentParagraphs as unknown as (Paragraph | Table)[]

  // Sidebar cell — margins set to 0 so the photo fills edge-to-edge.
  // Text content uses paragraph-level indentation instead (applied below).
  const sidebarCell = new TableCell({
    children: sidebarParagraphs.length > 0
      ? sidebarParagraphs
      : [new Paragraph({ children: [] })], // DOCX requires at least one paragraph
    shading: {
      fill: sidebarColorHex,
      color: 'auto',
    },
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: sidebarWidthTwips,
      type: WidthType.DXA,
    },
  })

  // Main content cell -- accepts both Paragraph and Table children
  const mainContentCell = new TableCell({
    children: mainContentChildren.length > 0
      ? mainContentChildren
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

  // Row minimum height = full page minus trailing paragraph buffer.
  // AT_LEAST allows the row to grow when content exceeds one page.
  const trailingParagraphBuffer = 500
  const rowHeightTwips = pageHeightTwips - trailingParagraphBuffer

  const mainTable = new Table({
    rows: [
      new TableRow({
        children: [sidebarCell, mainContentCell],
        cantSplit: false,
        height: {
          value: rowHeightTwips,
          rule: HeightRule.ATLEAST,
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
