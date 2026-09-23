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
  NO_TEXT_LINE,
  type DocxGeneratorSettings,
} from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
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

/**
 * Runs with no single Preview colour to take, still stock. The header summary
 * and second contact row are `text-white/90` and `text-white/80` over the
 * gradient (US-006); the language level text and the technologies stand in for
 * the level bars and gradient pills (US-007).
 */
const COLORS = {
  PURPLE_600: '9333EA',  // Technologies (for the pills)
  SLATE_600: '475569',   // Language level text (for the level bars)
  WHITE: 'FFFFFF',       // Header summary and second contact row
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
// HELPER: Map language level string to numeric level for display
// ============================================================
function languageLevelToText(level: string): string {
  switch (level) {
    case 'Native': return 'Native (5/5)'
    case 'Fluent': return 'Fluent (4/5)'
    case 'Professional': return 'Professional (3/5)'
    case 'Intermediate': return 'Intermediate (2/5)'
    case 'Basic': return 'Basic (1/5)'
    default: return level || ''
  }
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

  // Name: White, font-black, uppercase, 48px
  headerParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: (resume.title || contact.name || 'Your Name').toUpperCase(),
          bold: true,
          size: scaledFontSizes.name,
          color: PALETTE.white,
          font,
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
            color: COLORS.WHITE,
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
        color: COLORS.WHITE,
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
            color: COLORS.WHITE,
            font,
          })
        )
      }
      linkRuns.push(
        new TextRun({
          text: item,
          size: scaledFontSizes.contactLinks,
          color: COLORS.WHITE,
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
  const leftParagraphs: Paragraph[] = []

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

      // Proficiency: rendered as text since DOCX cannot replicate gradient bars
      const levelText = languageLevelToText(lang.level)
      if (levelText) {
        leftParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: levelText,
                size: scaledFontSizes.body,
                color: COLORS.SLATE_600,
                font,
              }),
            ],
            // Stands in for the level bars (US-007), which draw no text; it takes
            // the inherited 1.5 of the language block it sits in.
            spacing: { after: pxToTwips(itemEndSpacing), ...inheritedBody },
          })
        )
      }
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
  const rightParagraphs: Paragraph[] = []

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

      // Position: bold, slate-900
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
            undefined,
            descAlignment
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

      // Project name: bold, slate-900
      rightParagraphs.push(
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
            after: project.description || (project.technologies && project.technologies.length > 0)
              ? pxToTwips(SPACING.PROJECT_NAME_MB)
              : pxToTwips(projectEndSpacing),
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

        rightParagraphs.push(
          new Paragraph({
            children: projectDescRuns,
            spacing: {
              after: project.technologies && project.technologies.length > 0
                ? pxToTwips(SPACING.PROJECT_DESC_MB)
                : pxToTwips(projectEndSpacing),
              ...relaxedBody,
            },
          })
        )
      }

      // Technologies: bold purple-600 text (approximation of gradient pills)
      if (project.technologies && project.technologies.length > 0) {
        rightParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: project.technologies.join('  \u2022  '),
                bold: true,
                size: scaledFontSizes.body,
                color: COLORS.PURPLE_600,
                font,
              }),
            ],
            // Each pill's text inherits 1.5; the pill's padding and fill are US-007's.
            spacing: { after: pxToTwips(projectEndSpacing), ...inheritedBody },
          })
        )
      }
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

  // ============================================================
  // CREATE HEADER TABLE (full-width, purple background)
  // Using a single-cell table to get consistent background shading
  // ============================================================
  const headerCell = new TableCell({
    children: headerParagraphs.length > 0
      ? headerParagraphs
      : [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
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
