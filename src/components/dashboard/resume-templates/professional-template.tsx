import type {
  Resume,
  ResumeContact,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
  ResumeCertification,
} from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { renderFormattedText } from '@/lib/format-text'

interface ProfessionalTemplateProps {
  resume: Resume
  locale: Locale
  dict: any
}

// Fixed font sizes based on professional CV standards
// Using "Safe Default" preset recommended for SaaS CV builders
const BASE_FONT_SIZE = 11 // Body text baseline (×1.0)
const NAME_FONT_SIZE = 22 // Candidate name (×2.0)
const PROFESSIONAL_TITLE_FONT_SIZE = 13 // Professional title (×1.2)
const SECTION_TITLE_FONT_SIZE = 14.5 // Section titles (×1.35)
const JOB_TITLE_FONT_SIZE = 13 // Job/role titles (×1.2)
const BODY_FONT_SIZE = 11 // Body text, descriptions (×1.0)
const META_FONT_SIZE = 10.5 // Dates, companies, metadata (×0.95)
const CONTACT_FONT_SIZE = 10.5 // Contact information (×0.95)

// Spacing
const TITLE_GAP = 8
const SECTION_GAP = 12
const HEADER_GAP = 12
const SIDEBAR_COLOR = 'hsl(240, 85%, 35%)'

// Line heights
const BODY_LINE_HEIGHT = 1.35
const HEADING_LINE_HEIGHT = 1.2

/**
 * Professional Template - Faithful to reference CV design with header modification
 *
 * Layout: Header + 2-column asymmetric (30% sidebar / 70% main content)
 *
 * Header (Full Width):
 *  - CV Title (centered, large)
 *  - Contact Info (Email, Phone, Location, LinkedIn, GitHub, Website)
 *
 * Sidebar (Navy Blue - Full Height):
 *  1. Name and Professional Title
 *  2. Key Achievements
 *  3. Skills
 *  4. Training/Courses (Certifications)
 *
 * Main Content (White):
 *  1. Summary (with bottom border)
 *  2. Experience (with bottom border)
 *  3. Education (with bottom border)
 */
export function ProfessionalTemplate({
  resume,
  locale,
  dict,
}: ProfessionalTemplateProps) {
  const contact = (resume.contact as unknown as ResumeContact) || {}
  // Filter to show only visible items
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter(exp => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter(edu => edu.visible !== false)
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).filter(skill => skill.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).filter(cert => cert.visible !== false)
  const projects = ((resume.projects as unknown as any[]) || []).filter(project => project.visible !== false)

  // Key Achievements - Use projects data (renamed from Projects section)
  const keyAchievements = projects.map(project => ({
    title: project.name || '',
    description: project.description || ''
  }))

  return (
    <div
      className="professional-template mx-auto shadow-lg print:shadow-none print:bg-transparent"
      style={{
        width: '816px',
        minHeight: '1056px',
        position: 'relative',
        backgroundColor: 'white',
        fontFamily: 'Arial, Helvetica, sans-serif'
      }}
    >
      {/* Sidebar - Full height from top to bottom */}
      <div
        className="p-6 text-white print:p-5"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '30%',
          backgroundColor: SIDEBAR_COLOR
        }}
      >
          {/* CONTACT NAME SECTION */}
          <div className="mb-16">
            {/* Contact Name - Candidate Name */}
            <p
              className="font-semibold"
              style={{ fontSize: `${NAME_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT, textAlign: 'justify' }}
            >
              {contact.name || 'Your Name'}
            </p>
          </div>

          {/* KEY ACHIEVEMENTS SECTION */}
          {keyAchievements.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 pb-1 border-b border-white/20 font-bold tracking-wide capitalize" style={{ fontSize: `${SECTION_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                {dict.resumes.template.keyAchievements}
              </h2>
              <div className="space-y-4">
                {keyAchievements.map((achievement, index) => (
                  <div key={index}>
                    <h3 className="mb-1 font-bold" style={{ fontSize: `${JOB_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                      {achievement.title}
                    </h3>
                    {achievement.description && (
                      <div className="ml-2 opacity-90" style={{ fontSize: `${BODY_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT, textAlign: 'justify' }}>
                        {renderFormattedText(achievement.description)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SKILLS SECTION */}
          {skills.filter(s => s.category && s.items && s.items.length > 0).length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 pb-1 border-b border-white/20 font-bold tracking-wide capitalize" style={{ fontSize: `${SECTION_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                {dict.resumes.template.skills}
              </h2>
              <div>
                {skills
                  .filter(skillCategory =>
                    skillCategory.category &&
                    skillCategory.items &&
                    skillCategory.items.length > 0
                  )
                  .map((skillCategory, index) => (
                    <div key={index} className="mb-3">
                      <p className="mb-1 font-semibold opacity-90" style={{ fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT, textAlign: 'justify' }}>
                        {skillCategory.category}:
                      </p>
                      <p className="opacity-80" style={{ fontSize: `${BODY_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT, textAlign: 'justify' }}>{skillCategory.items.join(' • ')}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TRAINING / COURSES SECTION */}
          {certifications.length > 0 && (
            <div>
              <h2 className="mb-4 pb-1 border-b border-white/20 font-bold tracking-wide capitalize" style={{ fontSize: `${SECTION_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                {dict.resumes.template.training}
              </h2>
              <div className="space-y-4">
                {certifications.slice(0, 3).map((cert, index) => (
                  <div key={index}>
                    <h3 className="mb-1 font-bold" style={{ fontSize: `${JOB_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT, textAlign: 'justify' }}>
                      {cert.name}
                    </h3>
                    <p className="opacity-90" style={{ fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT, textAlign: 'justify' }}>{cert.issuer}</p>
                    {cert.date && (
                      <p className="opacity-75" style={{ fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT, textAlign: 'justify' }}>
                        {new Date(cert.date + '-01').toLocaleDateString(locale, {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      {/* Main Content - Positioned to the right of sidebar */}
      <div
        className="p-8 print:p-6"
        style={{
          marginLeft: '30%',
          position: 'relative',
          zIndex: 1
        }}
      >
          {/* HEADER: Professional Title and Contact Info */}
          <div className="pb-6" style={{ marginBottom: `${HEADER_GAP}px` }}>
            <h1 className="font-bold tracking-tight" style={{ color: SIDEBAR_COLOR, fontSize: `${PROFESSIONAL_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT, marginBottom: `${TITLE_GAP}px` }}>
              {resume.title || 'PROFESSIONAL TITLE'}
            </h1>

            {/* Contact Information */}
            <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'oklch(0.4 0 0)', fontSize: `${CONTACT_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT }}>
              {contact.email && (
                <div className="flex items-center gap-1.5">
                  <span>✉️</span>
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-1.5">
                  <span>📞</span>
                  <span>{contact.phone}</span>
                </div>
              )}
              {contact.location && (
                <div className="flex items-center gap-1.5">
                  <span>📍</span>
                  <span>{contact.location}</span>
                </div>
              )}
              {contact.linkedin && (
                <div className="flex items-center gap-1.5">
                  <span>🔗</span>
                  <span>{contact.linkedin}</span>
                </div>
              )}
              {contact.github && (
                <div className="flex items-center gap-1.5">
                  <span>💻</span>
                  <span>{contact.github}</span>
                </div>
              )}
              {contact.website && (
                <div className="flex items-center gap-1.5">
                  <span>🌐</span>
                  <a href={contact.website} className="hover:underline">
                    {contact.website}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* SUMMARY SECTION */}
          {resume.summary && (
            <div className="mb-8">
              <h2
                className="font-bold tracking-wide pb-1 border-b capitalize"
                style={{ color: 'oklch(0.2 0 0)', borderColor: lightenHslColor(SIDEBAR_COLOR, 30), fontSize: `${SECTION_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT, marginBottom: `${SECTION_GAP}px` }}
              >
                {dict.resumes.template.summary}
              </h2>
              <div
                className="text-justify"
                style={{
                  fontSize: `${BODY_FONT_SIZE}px`,
                  color: 'oklch(0.3 0 0)',
                  lineHeight: BODY_LINE_HEIGHT
                }}
              >
                {renderFormattedText(resume.summary)}
              </div>
            </div>
          )}

          {/* EXPERIENCE SECTION */}
          {experiences.length > 0 && (
            <div className="mb-8">
              <h2
                className="font-bold tracking-wide pb-1 border-b capitalize"
                style={{ color: 'oklch(0.2 0 0)', borderColor: lightenHslColor(SIDEBAR_COLOR, 30), fontSize: `${SECTION_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT, marginBottom: `${SECTION_GAP}px` }}
              >
                {dict.resumes.template.experience}
              </h2>
              <div className="space-y-6">
                {experiences.map((exp, index) => (
                  <div key={index}>
                    {/* Job Title + Dates */}
                    <div className="mb-1 flex items-start justify-between">
                      <h3
                        className="font-bold"
                        style={{ color: 'oklch(0.2 0 0)', fontSize: `${JOB_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT }}
                      >
                        {exp.position}
                      </h3>
                      <span
                        style={{ color: 'oklch(0.5 0 0)', fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT }}
                      >
                        {formatDateRange(exp, locale, dict)}
                      </span>
                    </div>

                    {/* Company Name */}
                    <p
                      className="mb-2"
                      style={{ color: 'oklch(0.4 0 0)', fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT }}
                    >
                      {exp.company}
                      {exp.location && ` • ${exp.location}`}
                    </p>

                    {/* Achievements Bullets (priority) or Description */}
                    {exp.achievements && exp.achievements.length > 0 ? (
                      <ul className="space-y-1">
                        {exp.achievements.map((achievement, i) => (
                          <li
                            key={i}
                            className="flex gap-2"
                            style={{
                              fontSize: `${BODY_FONT_SIZE}px`,
                              color: 'oklch(0.3 0 0)',
                              lineHeight: BODY_LINE_HEIGHT,
                            }}
                          >
                            <span style={{ color: 'oklch(0.2 0 0)' }}>•</span>
                            <span>{renderFormattedText(achievement)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : exp.description ? (
                      <div
                        className="mb-2 text-justify"
                        style={{
                          fontSize: `${BODY_FONT_SIZE}px`,
                          color: 'oklch(0.3 0 0)',
                          lineHeight: BODY_LINE_HEIGHT,
                        }}
                      >
                        {renderFormattedText(exp.description)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EDUCATION SECTION */}
          {education.length > 0 && (
            <div>
              <h2
                className="font-bold tracking-wide pb-1 border-b capitalize"
                style={{ color: 'oklch(0.2 0 0)', borderColor: lightenHslColor(SIDEBAR_COLOR, 30), fontSize: `${SECTION_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT, marginBottom: `${SECTION_GAP}px` }}
              >
                {dict.resumes.template.education}
              </h2>
              <div className="space-y-4">
                {education.map((edu, index) => (
                  <div key={index}>
                    {/* Degree + Dates */}
                    <div className="mb-1 flex items-start justify-between">
                      <h3
                        className="font-bold"
                        style={{ color: 'oklch(0.2 0 0)', fontSize: `${JOB_TITLE_FONT_SIZE}px`, lineHeight: HEADING_LINE_HEIGHT }}
                      >
                        {edu.degree}
                        {edu.field && ` ${dict.resumes.template.in} ${edu.field}`}
                      </h3>
                      <span
                        style={{ color: 'oklch(0.5 0 0)', fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT }}
                      >
                        {formatEducationDates(edu, locale, dict)}
                      </span>
                    </div>

                    {/* University + Location */}
                    <div className="flex items-start justify-between">
                      <a
                        href="#"
                        className="font-medium hover:underline"
                        style={{ color: 'oklch(0.7 0.15 200)', fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT }}
                      >
                        {edu.school}
                      </a>
                      {(edu as any).location && (
                        <span
                          style={{ color: 'oklch(0.5 0 0)', fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT }}
                        >
                          {(edu as any).location}
                        </span>
                      )}
                    </div>

                    {/* GPA if available */}
                    {edu.gpa && (
                      <p
                        className="mt-1"
                        style={{ color: 'oklch(0.5 0 0)', fontSize: `${META_FONT_SIZE}px`, lineHeight: BODY_LINE_HEIGHT }}
                      >
                        {dict.resumes.template.gpa}: {edu.gpa}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Lighten an HSL color by increasing its lightness
 * Example: lightenHslColor("hsl(240, 85%, 35%)", 30) -> "hsl(240, 85%, 65%)"
 */
function lightenHslColor(hslString: string, amount: number): string {
  const match = hslString.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/)
  if (!match) return hslString

  const hue = parseFloat(match[1])
  const saturation = parseFloat(match[2])
  const lightness = parseFloat(match[3])

  const newLightness = Math.min(100, lightness + amount)

  return `hsl(${hue}, ${saturation}%, ${newLightness}%)`
}

/**
 * Generate Key Achievements from experience data
 */
function generateKeyAchievements(
  experiences: ResumeExperience[],
  skills: ResumeSkillCategory[]
): { title: string; description: string }[] {
  const achievements: { title: string; description: string }[] = []

  // Extract from experiences
  experiences.slice(0, 3).forEach((exp) => {
    if (exp.achievements && exp.achievements.length > 0) {
      const firstAchievement = exp.achievements[0]
      const words = firstAchievement.split(' ')
      const title = words.slice(0, 4).join(' ') + (words.length > 4 ? '...' : '')

      achievements.push({
        title: title,
        description: firstAchievement.substring(0, 80) + '...',
      })
    }
  })

  // If not enough achievements, add skill-based ones
  if (achievements.length < 4 && skills.length > 0) {
    const topSkillCategory = skills[0]
    achievements.push({
      title: `${topSkillCategory.category} Expert`,
      description: `Proficient in ${topSkillCategory.items.slice(0, 3).join(', ')}`,
    })
  }

  return achievements.slice(0, 4)
}

/**
 * Format date range for experience
 */
function formatDateRange(exp: ResumeExperience, locale: Locale, dict: any): string {
  const startDate = exp.startDate
    ? new Date(exp.startDate + '-01').toLocaleDateString(locale, {
        month: '2-digit',
        year: 'numeric',
      })
    : ''

  const endDate = exp.current
    ? dict.resumes.template.present
    : exp.endDate
      ? new Date(exp.endDate + '-01').toLocaleDateString(locale, {
          month: '2-digit',
          year: 'numeric',
        })
      : dict.resumes.template.present

  return `${startDate} - ${endDate}`
}

/**
 * Format date range for education
 */
function formatEducationDates(edu: ResumeEducation, locale: Locale, dict: any): string {
  const startDate = edu.startDate
    ? new Date(edu.startDate + '-01').toLocaleDateString(locale, {
        month: '2-digit',
        year: 'numeric',
      })
    : ''

  const endDate = edu.endDate
    ? new Date(edu.endDate + '-01').toLocaleDateString(locale, {
        month: '2-digit',
        year: 'numeric',
      })
    : dict.resumes.template.present

  return `${startDate} - ${endDate}`
}
