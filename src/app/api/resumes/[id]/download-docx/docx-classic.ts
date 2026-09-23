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
  isPlainTextList,
  parsePlainTextListToParagraphs,
  parseHtmlToDocxRuns,
  stripHtml,
  exactLineSpacing,
  NO_TEXT_LINE,
  type DocxGeneratorSettings,
} from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { PREFLIGHT_LINE_HEIGHT, TAILWIND_LEADING, TAILWIND_TEXT_LINE_HEIGHT } from '@/lib/resume-line-height'
import {
  assertExhaustiveSection,
  mapEditorOrderToClassic,
  type ClassicMainId,
} from '@/lib/layout-settings'

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
// CLASSIC TEMPLATE COLORS
// ============================================================
/** Every text run and rule, in the colour of the class the Preview draws it with (US-003). */
const PALETTE = DOCX_PALETTE.classic

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

/**
 * The Preview's line heights (US-004), from `resume-line-height.ts`.
 * `classic-template.tsx` sets none inline: most elements inherit Tailwind's
 * preflight 1.5; `text-sm` elements (dates, company, location) draw at its
 * line height; the summary and description divs at `leading-relaxed`. The
 * template renders every text plainly (`formatText`), never as formatted
 * content, so HTML does not change the height here.
 */
const LINE_HEIGHT = {
  inherited: PREFLIGHT_LINE_HEIGHT,
  textSm: TAILWIND_TEXT_LINE_HEIGHT['text-sm'],
  relaxed: TAILWIND_LEADING['leading-relaxed'],
} as const

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

  /**
   * Section ordering, from the shared model's editor→Classic rule.
   *
   * The rule itself used to live at the foot of this file. It is the same rule
   * and the same result; it is now stated once, next to the layout model whose
   * vocabulary it translates, instead of privately here.
   *
   * THE EMPTY-INPUT FALLBACK WAS REMOVED AS DEAD, NOT AS TIDYING.
   *
   * This read `mainContentOrderRaw.length > 0 ? map(...) : DEFAULT_MAIN_ORDER`,
   * where `DEFAULT_MAIN_ORDER` was a six-member literal declared in this file.
   * Two things were wrong with it and one thing made it safe to drop:
   *
   *  - Unreachable. The only caller is `route.ts`, which passes
   *    `[...layout.mainContentOrder]` from `resolveResumeLayout`. That spreads
   *    `DEFAULT_RESUME_LAYOUT` (three ids) and then partials from
   *    `parseLayoutModel`, which sets `mainContentOrder` only when the parsed
   *    list is non-empty. The array therefore always has at least one member,
   *    and the `false` branch could never be taken.
   *
   *  - It was a competing default: a private copy of Classic's sections beside
   *    the shared mapping, which at the time produced neither `skills` nor
   *    `projects` from the real default order. Part 3 US-002 closed that
   *    omission in the shared mapping, not here, so this generator still states
   *    no section list of its own.
   *
   *  - `mapEditorOrderToClassic` cannot return an empty list: the sections the
   *    editor cannot position — skills, projects, `languagesAndCerts` — always
   *    keep their slots. So even the unreachable input yields a renderable
   *    document rather than an empty one.
   *
   * `hiddenMainRaw` no longer carries an `as string[]` cast: it is already
   * declared `string[]` by `DocxGeneratorSettings`, and the cast asserted
   * nothing.
   */
  const mainContentOrder: readonly ClassicMainId[] =
    mapEditorOrderToClassic(mainContentOrderRaw)
  const hiddenMainSections = hiddenMainRaw

  // Calculate scaled font sizes (half-points for docx)
  const scaledFontSizes = {
    title: pxToHalfPoints(FONT_SIZES.TITLE * fontScale),
    contact: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale),
    sectionTitle: pxToHalfPoints(FONT_SIZES.SECTION_TITLE * fontScale),
    body: pxToHalfPoints(FONT_SIZES.SECTION_DESC * fontScale),
    bodyDefault: pxToHalfPoints(FONT_SIZES.BODY_DEFAULT * fontScale),
    // Dates, company and location: `text-sm` in the Preview.
    textSm: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale),
  }

  // Line spacing shared by many paragraphs.
  const inheritedBody = exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.body])
  const relaxedBody = exactLineSpacing([LINE_HEIGHT.relaxed, scaledFontSizes.body])
  const textSmLine = exactLineSpacing([LINE_HEIGHT.textSm, scaledFontSizes.textSm])
  // A title and its date in one flex row: the h3 inherits 1.5, the date is text-sm.
  const titleAndDateLine = exactLineSpacing(
    [LINE_HEIGHT.inherited, scaledFontSizes.body],
    [LINE_HEIGHT.textSm, scaledFontSizes.textSm],
  )

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
          color: PALETTE['slate-900'],
          font: SERIF_FONT,
        }),
      ],
      spacing: {
        after: spacingAfter ?? pxToTwips(SPACING.SECTION_TITLE_MB),
        ...exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.sectionTitle]),
      },
      border: {
        bottom: {
          color: PALETTE['slate-400'],
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
          color: PALETTE['slate-900'],
          font: SERIF_FONT,
          characterSpacing: 8, // tracking-wide
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: {
        after: pxToTwips(SPACING.HEADER_MB),
        ...exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.title]),
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
            color: PALETTE['slate-700'],
            font: SERIF_FONT,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: {
          after: hasContactLine2 ? pxToTwips(4) : 0,
          ...exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.contact]),
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
            color: PALETTE['slate-600'],
            font: SERIF_FONT,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.inherited, scaledFontSizes.contact]) },
      })
    )
  }

  // Header bottom border: 2px solid slate-900, with pb-4 and mb-3
  // We create an empty paragraph with the bottom border to simulate the header border.
  // It draws no text; its line stands for the header's pb-4, the padding the
  // Preview draws between the contact lines and the border.
  children.push(
    new Paragraph({
      children: [],
      spacing: {
        after: pxToTwips(SPACING.SECTION_GAP),
        line: pxToTwips(SPACING.HEADER_PB),
        lineRule: LineRuleType.EXACT,
      },
      border: {
        bottom: {
          color: PALETTE['slate-900'],
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

    switch (sectionId) {
      // --- SUMMARY ---
      case 'summary': {
        if (resume.summary) {
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
                color: PALETTE['slate-800'],
                font: SERIF_FONT,
              },
              pxToTwips(4),
              sectionEndSpacing,
              relaxedBody,
              undefined,
              summaryAlignment
            )
            children.push(...listParagraphs)
          } else if (isPlainTextList(resume.summary)) {
            children.push(
              ...parsePlainTextListToParagraphs(
                resume.summary,
                {
                  size: scaledFontSizes.body,
                  color: PALETTE['slate-800'],
                  font: SERIF_FONT,
                },
                {
                  spacingAfterItem: pxToTwips(4),
                  spacingAfterLast: sectionEndSpacing,
                  alignment: summaryAlignment,
                  lineSpacing: relaxedBody,
                }
              )
            )
          } else {
            const summaryRuns = parseHtmlToDocxRuns(resume.summary, {
              size: scaledFontSizes.body,
              color: PALETTE['slate-800'],
              font: SERIF_FONT,
            })

            children.push(
              new Paragraph({
                children: summaryRuns,
                alignment: summaryAlignment,
                spacing: {
                  after: sectionEndSpacing,
                  ...relaxedBody,
                },
              })
            )
          }
        }
        break
      }

      // --- EXPERIENCE ---
      case 'experience': {
        if (experiences.length > 0) {
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
                    color: PALETTE['slate-900'],
                    font: SERIF_FONT,
                  }),
                  ...(dateText ? [
                    new TextRun({
                      text: '\t' + dateText,
                      italics: true,
                      size: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale), // text-sm
                      color: PALETTE['slate-600'],
                      font: SERIF_FONT,
                    }),
                  ] : []),
                ],
                spacing: { after: pxToTwips(2), ...titleAndDateLine },
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
                    color: PALETTE['slate-700'],
                    font: SERIF_FONT,
                  }),
                  ...(exp.location ? [
                    new TextRun({
                      text: '\t' + exp.location,
                      size: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale), // text-sm
                      color: PALETTE['slate-600'],
                      font: SERIF_FONT,
                    }),
                  ] : []),
                ],
                spacing: { after: pxToTwips(8), ...textSmLine },
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
                  color: PALETTE['slate-800'],
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
                        color: PALETTE['slate-800'],
                        font: SERIF_FONT,
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
              const descSpacingAfter = isLastExp ? sectionEndSpacing : pxToTwips(SPACING.EXPERIENCE_ITEM_GAP)

              if (isHtmlList(exp.description)) {
                const listParagraphs = parseHtmlListToParagraphs(
                  exp.description,
                  {
                    size: scaledFontSizes.body,
                    color: PALETTE['slate-800'],
                    font: SERIF_FONT,
                  },
                  pxToTwips(4),
                  descSpacingAfter,
                  relaxedBody,
                  undefined,
                  descAlignment
                )
                children.push(...listParagraphs)
              } else if (isPlainTextList(exp.description)) {
                children.push(
                  ...parsePlainTextListToParagraphs(
                    exp.description,
                    {
                      size: scaledFontSizes.body,
                      color: PALETTE['slate-800'],
                      font: SERIF_FONT,
                    },
                    {
                      spacingAfterItem: pxToTwips(4),
                      spacingAfterLast: descSpacingAfter,
                      alignment: descAlignment,
                      lineSpacing: relaxedBody,
                    }
                  )
                )
              } else {
                const descRuns = parseHtmlToDocxRuns(exp.description, {
                  size: scaledFontSizes.body,
                  color: PALETTE['slate-800'],
                  font: SERIF_FONT,
                })

                children.push(
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
              // No description or achievements — add spacing between experiences.
              // The spacer carries only the gap; the Preview draws no line there.
              if (!isLastExp) {
                children.push(
                  new Paragraph({
                    children: [],
                    spacing: { after: pxToTwips(SPACING.EXPERIENCE_ITEM_GAP), ...NO_TEXT_LINE },
                  })
                )
              } else {
                children.push(
                  new Paragraph({
                    children: [],
                    spacing: { after: sectionEndSpacing, ...NO_TEXT_LINE },
                  })
                )
              }
            }
          })
        }
        break
      }

      // --- EDUCATION ---
      case 'education': {
        if (education.length > 0) {
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
                    color: PALETTE['slate-900'],
                    font: SERIF_FONT,
                  }),
                  ...(eduDateText ? [
                    new TextRun({
                      text: '\t' + eduDateText,
                      italics: true,
                      size: pxToHalfPoints(FONT_SIZES.CONTACT * fontScale), // text-sm
                      color: PALETTE['slate-600'],
                      font: SERIF_FONT,
                    }),
                  ] : []),
                ],
                spacing: { after: pxToTwips(2), ...titleAndDateLine },
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
                    color: PALETTE['slate-700'],
                    font: SERIF_FONT,
                  }),
                ],
                spacing: {
                  after: edu.gpa || edu.description ? pxToTwips(2) : (isLastEdu ? sectionEndSpacing : pxToTwips(SPACING.EDUCATION_ITEM_GAP)),
                  ...inheritedBody,
                },
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
                      color: PALETTE['slate-600'],
                      font: SERIF_FONT,
                    }),
                    new TextRun({
                      text: edu.gpa,
                      bold: true,
                      size: scaledFontSizes.body,
                      color: PALETTE['slate-600'],
                      font: SERIF_FONT,
                    }),
                  ],
                  spacing: {
                    after: edu.description ? pxToTwips(2) : (isLastEdu ? sectionEndSpacing : pxToTwips(SPACING.EDUCATION_ITEM_GAP)),
                    ...inheritedBody,
                  },
                })
              )
            }

            // Line 4: Description (optional)
            if (edu.description) {
              const eduDescRuns = parseHtmlToDocxRuns(edu.description, {
                size: scaledFontSizes.body,
                color: PALETTE['slate-800'],
                font: SERIF_FONT,
              })

              children.push(
                new Paragraph({
                  children: eduDescRuns,
                  spacing: {
                    after: isLastEdu ? sectionEndSpacing : pxToTwips(SPACING.EDUCATION_ITEM_GAP),
                    ...inheritedBody,
                  },
                })
              )
            }
          })
        }
        break
      }

      // --- SKILLS ---
      case 'skills': {
        if (skills.length > 0) {
          children.push(
            createSectionHeader(
              (dict as any).resumes?.editor?.sections?.skills || classicDict.skills
            )
          )

          skills.forEach((skillCat: any, i: number) => {
            const isLastSkill = i === skills.length - 1
            const itemEndSpacing = isLastSkill ? sectionEndSpacing : pxToTwips(SPACING.SKILLS_ITEM_GAP)

            // "Category: item1, item2, item3" format
            // Use skillsHtml if available (rich text), otherwise fall back to items array.
            // The Preview renders `items` only, never `skillsHtml`; that content
            // divergence is Part 3 US-016's. Every branch takes the line height of
            // the Preview's category row, which inherits 1.5.
            if (skillCat.skillsHtml) {
              const plainSkills = stripHtml(skillCat.skillsHtml)
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${skillCat.category}: `,
                      bold: true,
                      size: scaledFontSizes.body,
                      color: PALETTE['slate-900'],
                      font: SERIF_FONT,
                    }),
                    new TextRun({
                      text: plainSkills,
                      size: scaledFontSizes.body,
                      color: PALETTE['slate-800'],
                      font: SERIF_FONT,
                    }),
                  ],
                  spacing: { after: itemEndSpacing, ...inheritedBody },
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
                      color: PALETTE['slate-900'],
                      font: SERIF_FONT,
                    }),
                    new TextRun({
                      text: skillCat.items.join(', '),
                      size: scaledFontSizes.body,
                      color: PALETTE['slate-800'],
                      font: SERIF_FONT,
                    }),
                  ],
                  spacing: { after: itemEndSpacing, ...inheritedBody },
                })
              )
            } else {
              // A visible category with no items at all, which `addCategory` in
              // `skills-section.tsx` creates and the editor saves as soon as the
              // user names it. `classic-template.tsx:345` renders the label
              // whatever the items are, and `docx-minimal.ts` pushes the
              // category name unconditionally; without this branch the heading
              // would be emitted (it is guarded on `skills.length`) above a
              // category that draws nothing.
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${skillCat.category}: `,
                      bold: true,
                      size: scaledFontSizes.body,
                      color: PALETTE['slate-900'],
                      font: SERIF_FONT,
                    }),
                  ],
                  spacing: { after: itemEndSpacing, ...inheritedBody },
                })
              )
            }
          })
        }
        break
      }

      // --- PROJECTS ---
      case 'projects': {
        if (projects.length > 0) {
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
                    color: PALETTE['slate-900'],
                    font: SERIF_FONT,
                  }),
                ],
                spacing: {
                  after: hasDescription || hasTechnologies ? pxToTwips(4) : (isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP)),
                  ...inheritedBody,
                },
              })
            )

            // Description (optional)
            if (hasDescription) {
              const projectDescRuns = parseHtmlToDocxRuns(project.description, {
                size: scaledFontSizes.body,
                color: PALETTE['slate-800'],
                font: SERIF_FONT,
              })

              children.push(
                new Paragraph({
                  children: projectDescRuns,
                  spacing: {
                    after: hasTechnologies ? pxToTwips(4) : (isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP)),
                    ...inheritedBody,
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
                      color: PALETTE['slate-700'],
                      font: SERIF_FONT,
                    }),
                    new TextRun({
                      text: project.technologies.join(', '),
                      size: scaledFontSizes.body,
                      color: PALETTE['slate-700'],
                      font: SERIF_FONT,
                    }),
                  ],
                  spacing: { after: isLastProject ? sectionEndSpacing : pxToTwips(SPACING.PROJECT_ITEM_GAP), ...inheritedBody },
                })
              )
            }
          })
        }
        break
      }

      // --- LANGUAGES + CERTIFICATIONS (2-column grid) ---
      case 'languagesAndCerts': {
        if (languages.length > 0 || certifications.length > 0) {
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
                      color: PALETTE['slate-900'],
                      font: SERIF_FONT,
                    }),
                    new TextRun({
                      text: '\t' + levelText,
                      size: scaledFontSizes.body,
                      color: PALETTE['slate-700'],
                      font: SERIF_FONT,
                    }),
                  ],
                  spacing: { after: isLast ? 0 : pxToTwips(SPACING.LANGUAGE_ITEM_GAP), ...inheritedBody },
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
                      color: PALETTE['slate-900'],
                      font: SERIF_FONT,
                    }),
                  ],
                  spacing: { after: cert.issuer || cert.date ? 0 : (isLast ? 0 : pxToTwips(SPACING.CERT_ITEM_GAP)), ...inheritedBody },
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
                        color: PALETTE['slate-700'],
                        font: SERIF_FONT,
                      }),
                    ],
                    spacing: { after: cert.date ? 0 : (isLast ? 0 : pxToTwips(SPACING.CERT_ITEM_GAP)), ...inheritedBody },
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
                        color: PALETTE['slate-600'],
                        font: SERIF_FONT,
                      }),
                    ],
                    spacing: { after: isLast ? 0 : pxToTwips(SPACING.CERT_ITEM_GAP), ...inheritedBody },
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
              children: langParagraphs.length > 0 ? langParagraphs : [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
              verticalAlign: VerticalAlign.TOP,
              width: { size: halfColumnWidth, type: WidthType.DXA },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
            })

            // The grid gap: a cell OOXML requires to hold one paragraph, drawing no text.
            const gapCell = new TableCell({
              children: [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
              verticalAlign: VerticalAlign.TOP,
              width: { size: gapWidth, type: WidthType.DXA },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
            })

            const certCell = new TableCell({
              children: certParagraphs.length > 0 ? certParagraphs : [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
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
        break
      }

      default:
        assertExhaustiveSection(sectionId)
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
              top: marginTwips,
              right: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
            },
          },
        },
        // OOXML ends a body with a paragraph. When the document ends with the
        // languages and certifications table, write that paragraph explicitly
        // with a 1-twip line: left to Word, it would take the document default's
        // text line and could push an exactly full page onto a blank one.
        children: children[children.length - 1] instanceof Table
          ? [...children, new Paragraph({ children: [], spacing: { before: 0, after: 0, ...NO_TEXT_LINE } })]
          : children,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return buffer as Buffer
}
