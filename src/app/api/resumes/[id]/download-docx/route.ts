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
} from 'docx'

// Colors matching the professional template: oklch(0.25 0.05 240)
// Extracted exact RGB from browser canvas: rgb(6, 36, 55)
const SIDEBAR_BLUE = '062437' // EXACT color calculated by browser from oklch(0.25 0.05 240)
const CYAN_ACCENT = '4DD0E1' // Cyan for accents (oklch 0.7 0.15 200)
const WHITE = 'FFFFFF'
const DARK_TEXT = '333333' // For main content text

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    // Get locale from query params or default to 'fr'
    const { searchParams } = new URL(request.url)
    const locale = (searchParams.get('locale') || 'fr') as Locale

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
    const { data: resume, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    }

    const contact = resume.contact_info || {}
    const experiences = resume.experience || []
    const education = resume.education || []
    const skills = resume.skills || []
    const certifications = resume.certifications || []

    // Generate key achievements using the same logic as the template
    const keyAchievements = generateKeyAchievements(experiences, skills)

    // Sidebar content (30% width - Dark blue-gray background)
    const sidebarCells = [
      // Header Section
      new TableCell({
        children: [
          // Name - Large, Bold, Uppercase
          new Paragraph({
            children: [
              new TextRun({
                text: (contact.name || 'YOUR NAME').toUpperCase(),
                bold: true,
                size: 32,
                color: WHITE,
              }),
            ],
            spacing: { after: 100 },
          }),
          // Professional Title - Cyan
          new Paragraph({
            children: [
              new TextRun({
                text: resume.title || 'Professional Title',
                size: 18,
                color: CYAN_ACCENT,
              }),
            ],
            spacing: { after: 200 },
          }),
          // Contact Info
          ...(contact.phone ? [
            new Paragraph({
              children: [
                new TextRun({ text: '📞 ', size: 16 }),
                new TextRun({ text: contact.phone, size: 16, color: WHITE }),
              ],
              spacing: { after: 50 },
            }),
          ] : []),
          ...(contact.email ? [
            new Paragraph({
              children: [
                new TextRun({ text: '✉️ ', size: 16 }),
                new TextRun({ text: contact.email, size: 16, color: WHITE }),
              ],
              spacing: { after: 50 },
            }),
          ] : []),
          ...(contact.location ? [
            new Paragraph({
              children: [
                new TextRun({ text: '📍 ', size: 16 }),
                new TextRun({ text: contact.location, size: 16, color: WHITE }),
              ],
              spacing: { after: 50 },
            }),
          ] : []),
          ...(contact.linkedin ? [
            new Paragraph({
              children: [
                new TextRun({ text: '🔗 ', size: 16 }),
                new TextRun({ text: contact.linkedin, size: 16, color: WHITE }),
              ],
              spacing: { after: 200 },
            }),
          ] : []),

          // Key Achievements Section
          new Paragraph({
            children: [
              new TextRun({
                text: dict.resumes.template.keyAchievements.toUpperCase(),
                bold: true,
                size: 20,
                color: CYAN_ACCENT,
              }),
            ],
            spacing: { before: 200, after: 150 },
            border: {
              bottom: {
                color: WHITE,
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
              },
            },
          }),
          ...keyAchievements.map((achievement: any) =>
            new Paragraph({
              children: [
                new TextRun({ text: '▸ ', color: CYAN_ACCENT, size: 16 }),
                new TextRun({ text: achievement.title || achievement, size: 14, color: WHITE, bold: true }),
              ],
              spacing: { after: achievement.description ? 50 : 100 },
            })
          ),
          ...keyAchievements.flatMap((achievement: any) =>
            achievement.description ? [
              new Paragraph({
                children: [
                  new TextRun({ text: achievement.description, size: 12, color: WHITE }),
                ],
                spacing: { after: 100, left: convertInchesToTwip(0.15) },
              })
            ] : []
          ),

          // Skills Section
          ...(skills.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: dict.resumes.template.skills.toUpperCase(),
                  bold: true,
                  size: 20,
                  color: CYAN_ACCENT,
                }),
              ],
              spacing: { before: 200, after: 150 },
              border: {
                bottom: {
                  color: WHITE,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
                },
              },
            }),
            ...skills.flatMap((skillCat: any) => [
              new Paragraph({
                children: [
                  new TextRun({
                    text: skillCat.category,
                    bold: true,
                    size: 16,
                    color: CYAN_ACCENT,
                  }),
                ],
                spacing: { before: 100, after: 50 },
              }),
              ...skillCat.items.map((skill: string) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: '• ', color: CYAN_ACCENT, size: 16 }),
                    new TextRun({ text: skill, size: 16, color: WHITE }),
                  ],
                  spacing: { after: 50 },
                })
              ),
            ]),
          ] : []),

          // Training/Certifications
          ...(certifications.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: dict.resumes.template.training.toUpperCase(),
                  bold: true,
                  size: 20,
                  color: CYAN_ACCENT,
                }),
              ],
              spacing: { before: 200, after: 150 },
              border: {
                bottom: {
                  color: WHITE,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
                },
              },
            }),
            ...certifications.map((cert: any) =>
              new Paragraph({
                children: [
                  new TextRun({ text: '• ', color: CYAN_ACCENT, size: 16 }),
                  new TextRun({ text: cert.name, size: 16, color: WHITE }),
                ],
                spacing: { after: 100 },
              })
            ),
          ] : []),
        ],
        shading: {
          fill: SIDEBAR_BLUE,
          color: "auto",
        },
        margins: {
          top: convertInchesToTwip(0.4),
          bottom: convertInchesToTwip(0.4),
          left: convertInchesToTwip(0.4),
          right: convertInchesToTwip(0.4),
        },
        verticalAlign: VerticalAlign.TOP,
        width: {
          size: 30,
          type: WidthType.PERCENTAGE,
        },
      }),

      // Main content (70% width - White background)
      new TableCell({
        children: [
          // Summary Section
          ...(resume.summary ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: dict.resumes.template.summary.toUpperCase(),
                  bold: true,
                  size: 24,
                  color: DARK_TEXT,
                }),
              ],
              spacing: { after: 150 },
              border: {
                bottom: {
                  color: DARK_TEXT,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 10,
                },
              },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: resume.summary,
                  size: 20,
                }),
              ],
              spacing: { after: 300 },
              alignment: AlignmentType.JUSTIFIED,
            }),
          ] : []),

          // Experience Section
          ...(experiences.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: dict.resumes.template.experience.toUpperCase(),
                  bold: true,
                  size: 24,
                  color: DARK_TEXT,
                }),
              ],
              spacing: { before: 200, after: 150 },
              border: {
                bottom: {
                  color: DARK_TEXT,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 10,
                },
              },
            }),
            ...experiences.flatMap((exp: any) => [
              // Position + Date (on same line using tab stop)
              new Paragraph({
                children: [
                  new TextRun({
                    text: exp.position || '',
                    bold: true,
                    size: 22,
                    color: DARK_TEXT,
                  }),
                  new TextRun({
                    text: '\t' + formatDateRange(exp.startDate, exp.endDate, exp.current, locale, dict),
                    size: 18,
                    italics: true,
                    color: '666666',
                  }),
                ],
                spacing: { before: 200, after: 50 },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: TabStopPosition.MAX,
                  },
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: exp.company || '',
                    italics: true,
                    size: 20,
                  }),
                  ...(exp.location ? [
                    new TextRun({ text: ' • ' }),
                    new TextRun({ text: exp.location, size: 20 }),
                  ] : []),
                ],
                spacing: { after: 100 },
              }),
              ...(exp.description ?
                exp.description.split('\n').map((line: string) =>
                  new Paragraph({
                    children: [
                      new TextRun({ text: '• ', size: 20, color: CYAN_ACCENT }),
                      new TextRun({ text: line, size: 20 }),
                    ],
                    spacing: { after: 80 },
                  })
                )
              : []),
            ]),
          ] : []),

          // Education Section
          ...(education.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: dict.resumes.template.education.toUpperCase(),
                  bold: true,
                  size: 24,
                  color: DARK_TEXT,
                }),
              ],
              spacing: { before: 300, after: 150 },
              border: {
                bottom: {
                  color: DARK_TEXT,
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 10,
                },
              },
            }),
            ...education.flatMap((edu: any) => [
              // Degree + Date (on same line using tab stop)
              new Paragraph({
                children: [
                  new TextRun({
                    text: edu.degree || '',
                    bold: true,
                    size: 22,
                    color: DARK_TEXT,
                  }),
                  ...(edu.field ? [
                    new TextRun({ text: ` ${dict.resumes.template.in} ${edu.field}`, size: 22 }),
                  ] : []),
                  new TextRun({
                    text: '\t' + formatDateRange(edu.startDate, edu.endDate, false, locale, dict),
                    size: 18,
                    italics: true,
                    color: '666666',
                  }),
                ],
                spacing: { before: 200, after: 50 },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: TabStopPosition.MAX,
                  },
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: edu.school || '',
                    italics: true,
                    size: 20,
                    color: CYAN_ACCENT,
                  }),
                  ...(edu.location ? [
                    new TextRun({ text: ' • ', size: 20 }),
                    new TextRun({ text: edu.location, size: 20 }),
                  ] : []),
                  ...(edu.gpa ? [
                    new TextRun({ text: ` | ${dict.resumes.template.gpa}: ${edu.gpa}`, size: 18 }),
                  ] : []),
                ],
                spacing: { after: 150 },
              }),
            ]),
          ] : []),
        ],
        margins: {
          top: convertInchesToTwip(0.4),
          bottom: convertInchesToTwip(0.4),
          left: convertInchesToTwip(0.4),
          right: convertInchesToTwip(0.4),
        },
        verticalAlign: VerticalAlign.TOP,
        width: {
          size: 70,
          type: WidthType.PERCENTAGE,
        },
      }),
    ]

    // Create the main table with 2 columns
    const mainTable = new Table({
      rows: [
        new TableRow({
          children: sidebarCells,
          cantSplit: true,
          height: {
            value: convertInchesToTwip(11), // 11 inches = full page height
            rule: HeightRule.ATLEAST,
          },
        }),
      ],
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
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
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
            },
          },
          children: [mainTable],
        },
      ],
    })

    // Generate buffer
    const buffer = await Packer.toBuffer(doc)

    // Return as downloadable file
    return new NextResponse(buffer, {
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

/**
 * Generate Key Achievements from experience data
 * Matches the logic from professional-template.tsx
 */
function generateKeyAchievements(
  experiences: any[],
  skills: any[]
): { title: string; description: string }[] {
  const achievements: { title: string; description: string }[] = []

  // Extract from experiences
  experiences.slice(0, 3).forEach((exp) => {
    if (exp.achievements && exp.achievements.length > 0) {
      // Extract a key metric or achievement
      const firstAchievement = exp.achievements[0]
      // Try to create a title from the achievement text
      const words = firstAchievement.split(' ')
      const title = words.slice(0, 4).join(' ') + (words.length > 4 ? '...' : '')

      achievements.push({
        title: title,
        description: firstAchievement.substring(0, 80) + (firstAchievement.length > 80 ? '...' : ''),
      })
    } else if (exp.description) {
      // Fallback: use first line of description
      const lines = exp.description.split('\n').filter((l: string) => l.trim())
      if (lines.length > 0) {
        const firstLine = lines[0]
        const words = firstLine.split(' ')
        const title = words.slice(0, 4).join(' ') + (words.length > 4 ? '...' : '')
        achievements.push({
          title: title,
          description: firstLine.substring(0, 80) + (firstLine.length > 80 ? '...' : ''),
        })
      }
    }
  })

  // If not enough achievements, add skill-based ones
  if (achievements.length < 4 && skills.length > 0) {
    const topSkillCategory = skills[0]
    if (topSkillCategory.category && topSkillCategory.items) {
      achievements.push({
        title: `${topSkillCategory.category} Expert`,
        description: `Proficient in ${topSkillCategory.items.slice(0, 3).join(', ')}`,
      })
    }
  }

  return achievements.slice(0, 4) // Max 4 achievements
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean | undefined,
  locale: Locale,
  dict: any
): string {
  if (!startDate) return ''

  const start = new Date(startDate + '-01').toLocaleDateString(locale, {
    month: '2-digit',
    year: 'numeric',
  })

  const end = isCurrent
    ? dict.resumes.template.present
    : endDate
      ? new Date(endDate + '-01').toLocaleDateString(locale, {
          month: '2-digit',
          year: 'numeric',
        })
      : dict.resumes.template.present

  return end ? `${start} - ${end}` : start
}
