import { useEffect, useState } from 'react'
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
import { ColorWheel } from '../ColorWheel'

interface ProfessionalTemplateProps {
  resume: Resume
  locale: Locale
  dict: any
  titleFontSize?: number
  setTitleFontSize?: (size: number) => void
  titleGap?: number
  setTitleGap?: (gap: number) => void
  contactFontSize?: number
  setContactFontSize?: (size: number) => void
  sectionTitleFontSize?: number
  setSectionTitleFontSize?: (size: number) => void
  sectionDescFontSize?: number
  setSectionDescFontSize?: (size: number) => void
  sectionGap?: number
  setSectionGap?: (gap: number) => void
  headerGap?: number
  setHeaderGap?: (gap: number) => void
  sidebarColor?: string
  setSidebarColor?: (color: string) => void
}

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
  titleFontSize = 24,
  setTitleFontSize,
  titleGap = 8,
  setTitleGap,
  contactFontSize = 12,
  setContactFontSize,
  sectionTitleFontSize = 16,
  setSectionTitleFontSize,
  sectionDescFontSize = 14,
  setSectionDescFontSize,
  sectionGap = 12,
  setSectionGap,
  headerGap = 12,
  setHeaderGap,
  sidebarColor = 'hsl(240, 85%, 35%)',
  setSidebarColor,
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

  // Calculate maximum title font size to keep title on one line
  const [maxTitleFontSize, setMaxTitleFontSize] = useState(48)

  useEffect(() => {
    // Calculate max font size that keeps title on one line
    const availableWidth = 507 // CV main content width (816px * 0.7 - 64px padding)
    const titleText = resume.title || 'CV TITLE'

    // Create canvas to measure text
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return

    // Find max font size that fits (search from 48px down to 16px)
    let maxSize = 16
    for (let size = 48; size >= 16; size -= 2) {
      // Use bold font - system font stack
      context.font = `bold ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
      const metrics = context.measureText(titleText.toUpperCase())
      const textWidth = metrics.width

      // Account for font rendering being potentially wider than canvas measurement
      // Apply safety factor: multiply measured width by 1.4 to account for rendering differences
      const adjustedWidth = textWidth * 1.4

      if (adjustedWidth <= availableWidth) {
        maxSize = size
        break
      }
    }

    setMaxTitleFontSize(maxSize)

    // Automatically reduce titleFontSize if it exceeds the calculated max
    if (setTitleFontSize && titleFontSize > maxSize) {
      setTitleFontSize(maxSize)
    }
  }, [resume.title, titleFontSize, setTitleFontSize])

  return (
    <div
      className="professional-template mx-auto shadow-lg print:shadow-none print:bg-transparent"
      style={{
        width: '816px',
        minHeight: '1056px',
        position: 'relative',
        backgroundColor: 'white'
      }}
    >
      {/* Color Wheel - Positioned to the left of sidebar aligned with name */}
      {setSidebarColor && (
        <div
          className="print:hidden"
          style={{
            position: 'absolute',
            left: '-220px',
            top: '24px',
            zIndex: 50
          }}
        >
          <div className="bg-white rounded-lg shadow-lg p-4 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 text-center">
              {dict.resumes?.colorWheel?.sidebarColor || 'Sidebar Color'}
            </h3>
            <ColorWheel
              onColorChange={(color) => setSidebarColor(`hsl(${color.hue}, 85%, ${color.lightness}%)`)}
              size={150}
              initialHue={extractHueFromOklch(sidebarColor)}
              initialLightness={35}
              dict={dict}
            />
          </div>
        </div>
      )}
      {/* Sidebar - Full height from top to bottom */}
      <div
        className="p-6 text-white print:p-5"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '30%',
          backgroundColor: sidebarColor
        }}
      >
          {/* CONTACT NAME SECTION */}
          <div style={{ marginBottom: `${Math.round(titleFontSize * 1.25) + titleGap + Math.round(contactFontSize * 2.5) + 24 + headerGap + Math.round((sectionTitleFontSize - 14) * 1.2)}px` }}>
            {/* Contact Name */}
            <p
              className="text-base font-semibold leading-snug"
              style={{ textAlign: 'justify' }}
            >
              {contact.name || 'Your Name'}
            </p>
          </div>

          {/* KEY ACHIEVEMENTS SECTION */}
          {keyAchievements.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 pb-1 border-b border-white/20 text-sm font-bold tracking-wide capitalize">
                {dict.resumes.template.keyAchievements}
              </h2>
              <div className="space-y-4">
                {keyAchievements.map((achievement, index) => (
                  <div key={index}>
                    <h3 className="mb-1 text-sm font-bold leading-snug">
                      {achievement.title}
                    </h3>
                    {achievement.description && (
                      <div className="ml-2 text-xs leading-relaxed opacity-90" style={{ textAlign: 'justify' }}>
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
              <h2 className="mb-4 pb-1 border-b border-white/20 text-sm font-bold tracking-wide capitalize">
                {dict.resumes.template.skills}
              </h2>
              <div className="text-xs leading-relaxed">
                {skills
                  .filter(skillCategory =>
                    skillCategory.category &&
                    skillCategory.items &&
                    skillCategory.items.length > 0
                  )
                  .map((skillCategory, index) => (
                    <div key={index} className="mb-3">
                      <p className="mb-1 font-semibold opacity-90" style={{ textAlign: 'justify' }}>
                        {skillCategory.category}:
                      </p>
                      <p className="opacity-80" style={{ textAlign: 'justify' }}>{skillCategory.items.join(' • ')}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TRAINING / COURSES SECTION */}
          {certifications.length > 0 && (
            <div>
              <h2 className="mb-4 pb-1 border-b border-white/20 text-sm font-bold tracking-wide capitalize">
                {dict.resumes.template.training}
              </h2>
              <div className="space-y-4">
                {certifications.slice(0, 3).map((cert, index) => (
                  <div key={index}>
                    <h3 className="mb-1 text-sm font-bold leading-snug" style={{ textAlign: 'justify' }}>
                      {cert.name}
                    </h3>
                    <p className="text-xs opacity-90" style={{ textAlign: 'justify' }}>{cert.issuer}</p>
                    {cert.date && (
                      <p className="text-xs opacity-75" style={{ textAlign: 'justify' }}>
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
          <div className="pb-6" style={{ marginBottom: `${headerGap}px`, position: 'relative' }}>
            <h1 className="font-bold tracking-tight" style={{ color: sidebarColor, fontSize: `${titleFontSize}px`, marginBottom: `${titleGap}px`, position: 'relative' }}>
              {resume.title || 'PROFESSIONAL TITLE'}

              {/* Font Size Slider - Positioned outside CV to the right */}
              {setTitleFontSize && (
                <div
                  className="print:hidden"
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: '-18px',
                    marginLeft: '48px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <div style={{ fontSize: '9px' }} className="text-slate-600 font-medium mb-0.5">
                    {dict.resumes?.sliders?.title || 'Title'}
                  </div>
                  <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm" style={{ padding: '3px 8px' }}>
                    <input
                      type="range"
                      min="16"
                      max={maxTitleFontSize}
                      step="2"
                      value={titleFontSize}
                      onChange={(e) => setTitleFontSize(Number(e.target.value))}
                      className="bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                      style={{ width: '90px', height: '4px' }}
                    />
                  </div>
                </div>
              )}
            </h1>

            {/* Gap Slider (gap1) - Vertical slider between sidebar and main title */}
            {setTitleGap && (
              <div
                className="print:hidden"
                style={{
                  position: 'absolute',
                  left: '-22px',
                  top: `${titleFontSize - 56}px`,
                  zIndex: 10,
                  width: '12px'
                }}
              >
                <div style={{ fontSize: '9px' }} className="text-slate-600 font-medium mb-0.5 text-center">
                  {dict.resumes?.sliders?.gap || 'Gap'}
                </div>
                <div className="flex flex-col items-center bg-white rounded-lg border border-slate-200 shadow-sm" style={{ height: '44px', padding: '3px' }}>
                  <input
                    type="range"
                    min="-4"
                    max="20"
                    step="1"
                    value={titleGap}
                    onChange={(e) => setTitleGap(Number(e.target.value))}
                    className="appearance-none cursor-pointer accent-slate-600"
                    style={{
                      writingMode: 'vertical-lr',
                      width: '5px',
                      height: '38px',
                      background: 'linear-gradient(to top, oklch(0.85 0 0) 0%, oklch(0.85 0 0) 100%)',
                      borderRadius: '0.35rem'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Contact Information */}
            <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'oklch(0.4 0 0)', fontSize: `${contactFontSize}px`, position: 'relative' }}>
              {/* Font Size Slider for Contact - Positioned outside CV to the right */}
              {setContactFontSize && (
                <div
                  className="print:hidden"
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: `${Math.max(Math.min(0, headerGap), 8 - titleFontSize - titleGap)}px`,
                    marginLeft: '48px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <div style={{ fontSize: '9px' }} className="text-slate-600 font-medium mb-0.5">
                    {dict.resumes?.sliders?.contactDetails || 'Contact details'}
                  </div>
                  <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm" style={{ padding: '3px 8px' }}>
                    <input
                      type="range"
                      min="8"
                      max="12"
                      step="0.5"
                      value={contactFontSize}
                      onChange={(e) => setContactFontSize(Number(e.target.value))}
                      className="bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                      style={{ width: '90px', height: '4px' }}
                    />
                  </div>
                </div>
              )}

              {/* Header Gap Slider (gap2) - Vertical slider below gap1 */}
              {setHeaderGap && (
                <div
                  className="print:hidden"
                  style={{
                    position: 'absolute',
                    left: '-22px',
                    bottom: '-45px',
                    zIndex: 10,
                    width: '12px'
                  }}
                >
                  <div style={{ fontSize: '9px' }} className="text-slate-600 font-medium mb-0.5 text-center">
                    Gap
                  </div>
                  <div className="flex flex-col items-center bg-white rounded-lg border border-slate-200 shadow-sm" style={{ height: '44px', padding: '3px' }}>
                    <input
                      type="range"
                      min="-25"
                      max="32"
                      step="1"
                      value={headerGap}
                      onChange={(e) => setHeaderGap(Number(e.target.value))}
                      className="appearance-none cursor-pointer accent-slate-600"
                      style={{
                        writingMode: 'vertical-lr',
                        width: '5px',
                        height: '38px',
                        background: 'linear-gradient(to top, oklch(0.85 0 0) 0%, oklch(0.85 0 0) 100%)',
                        borderRadius: '0.35rem'
                      }}
                    />
                  </div>
                </div>
              )}
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
                style={{ color: 'oklch(0.2 0 0)', borderColor: lightenHslColor(sidebarColor, 30), fontSize: `${sectionTitleFontSize}px`, marginBottom: `${sectionGap}px`, position: 'relative' }}
              >
                {dict.resumes.template.summary}

                {/* Font Size Slider for Section Titles - Positioned outside CV to the right */}
                {setSectionTitleFontSize && (
                  <div
                    className="print:hidden"
                    style={{
                      position: 'absolute',
                      left: '100%',
                      bottom: 0,
                      marginLeft: '48px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <div style={{ fontSize: '9px' }} className="text-slate-600 font-medium mb-0.5">
                      {dict.resumes?.sliders?.sectionTitle || 'Section title'}
                    </div>
                    <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm" style={{ padding: '3px 8px' }}>
                      <input
                        type="range"
                        min="12"
                        max="24"
                        step="1"
                        value={sectionTitleFontSize}
                        onChange={(e) => setSectionTitleFontSize(Number(e.target.value))}
                        className="bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        style={{ width: '90px', height: '4px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Section Gap Slider (gap3) - Vertical slider aligned with Summary title */}
                {setSectionGap && (
                  <div
                    className="print:hidden"
                    style={{
                      position: 'absolute',
                      left: '-22px',
                      top: `${Math.max(-14, 41 - headerGap)}px`,
                      zIndex: 10,
                      width: '12px'
                    }}
                  >
                    <div style={{ fontSize: '9px' }} className="text-slate-600 font-medium mb-0.5 text-center">
                      Gap
                    </div>
                    <div className="flex flex-col items-center bg-white rounded-lg border border-slate-200 shadow-sm" style={{ height: '44px', padding: '3px' }}>
                      <input
                        type="range"
                        min="0"
                        max="32"
                        step="2"
                        value={sectionGap}
                        onChange={(e) => setSectionGap(Number(e.target.value))}
                        className="appearance-none cursor-pointer accent-slate-600"
                        style={{
                          writingMode: 'vertical-lr',
                          width: '5px',
                          height: '38px',
                          background: 'linear-gradient(to top, oklch(0.85 0 0) 0%, oklch(0.85 0 0) 100%)',
                          borderRadius: '0.35rem'
                        }}
                      />
                    </div>
                  </div>
                )}
              </h2>
              <div
                className="leading-relaxed text-justify"
                style={{
                  fontSize: `${sectionDescFontSize}px`,
                  color: 'oklch(0.3 0 0)',
                  lineHeight: '1.6',
                  position: 'relative'
                }}
              >
                {renderFormattedText(resume.summary)}

                {/* Font Size Slider for Section Descriptions - Positioned outside CV to the right */}
                {setSectionDescFontSize && (
                  <div
                    className="print:hidden"
                    style={{
                      position: 'absolute',
                      left: '100%',
                      top: 0,
                      marginLeft: '48px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <div style={{ fontSize: '9px' }} className="text-slate-600 font-medium mb-0.5">
                      {dict.resumes?.sliders?.description || 'Description'}
                    </div>
                    <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm" style={{ padding: '3px 8px' }}>
                      <input
                        type="range"
                        min="10"
                        max="18"
                        step="1"
                        value={sectionDescFontSize}
                        onChange={(e) => setSectionDescFontSize(Number(e.target.value))}
                        className="bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        style={{ width: '90px', height: '4px' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EXPERIENCE SECTION */}
          {experiences.length > 0 && (
            <div className="mb-8">
              <h2
                className="font-bold tracking-wide pb-1 border-b capitalize"
                style={{ color: 'oklch(0.2 0 0)', borderColor: lightenHslColor(sidebarColor, 30), fontSize: `${sectionTitleFontSize}px`, marginBottom: `${sectionGap}px` }}
              >
                {dict.resumes.template.experience}
              </h2>
              <div className="space-y-6">
                {experiences.map((exp, index) => (
                  <div key={index}>
                    {/* Job Title + Dates */}
                    <div className="mb-1 flex items-start justify-between">
                      <h3
                        className="text-base font-bold"
                        style={{ color: 'oklch(0.2 0 0)' }}
                      >
                        {exp.position}
                      </h3>
                      <span
                        className="text-sm"
                        style={{ color: 'oklch(0.5 0 0)' }}
                      >
                        {formatDateRange(exp, locale, dict)}
                      </span>
                    </div>

                    {/* Company Name */}
                    <p
                      className="mb-2 text-sm"
                      style={{ color: 'oklch(0.4 0 0)' }}
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
                              fontSize: `${sectionDescFontSize}px`,
                              color: 'oklch(0.3 0 0)',
                              lineHeight: '1.5',
                            }}
                          >
                            <span style={{ color: 'oklch(0.2 0 0)' }}>•</span>
                            <span>{renderFormattedText(achievement)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : exp.description ? (
                      <div
                        className="mb-2 leading-relaxed text-justify"
                        style={{
                          fontSize: `${sectionDescFontSize}px`,
                          color: 'oklch(0.3 0 0)',
                          lineHeight: '1.5',
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
                style={{ color: 'oklch(0.2 0 0)', borderColor: lightenHslColor(sidebarColor, 30), fontSize: `${sectionTitleFontSize}px`, marginBottom: `${sectionGap}px` }}
              >
                {dict.resumes.template.education}
              </h2>
              <div className="space-y-4">
                {education.map((edu, index) => (
                  <div key={index}>
                    {/* Degree + Dates */}
                    <div className="mb-1 flex items-start justify-between">
                      <h3
                        className="text-base font-bold"
                        style={{ color: 'oklch(0.2 0 0)' }}
                      >
                        {edu.degree}
                        {edu.field && ` ${dict.resumes.template.in} ${edu.field}`}
                      </h3>
                      <span
                        className="text-sm"
                        style={{ color: 'oklch(0.5 0 0)' }}
                      >
                        {formatEducationDates(edu, locale, dict)}
                      </span>
                    </div>

                    {/* University + Location */}
                    <div className="flex items-start justify-between">
                      <a
                        href="#"
                        className="text-sm font-medium hover:underline"
                        style={{ color: 'oklch(0.7 0.15 200)' }}
                      >
                        {edu.school}
                      </a>
                      {(edu as any).location && (
                        <span
                          className="text-sm"
                          style={{ color: 'oklch(0.5 0 0)' }}
                        >
                          {(edu as any).location}
                        </span>
                      )}
                    </div>

                    {/* GPA if available */}
                    {edu.gpa && (
                      <p
                        className="mt-1 text-xs"
                        style={{ color: 'oklch(0.5 0 0)' }}
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
 * Extract hue from color string (supports both HSL and OKLCH)
 * HSL example: "hsl(240, 70%, 25%)" -> 240
 * OKLCH example: "oklch(0.25 0.15 240)" -> 240
 */
function extractHueFromOklch(colorString: string): number {
  // Try HSL format first: hsl(240, 70%, 25%)
  const hslMatch = colorString.match(/hsl\(([\d.]+)/)
  if (hslMatch) return parseFloat(hslMatch[1])

  // Try OKLCH format: oklch(0.25 0.15 240)
  const oklchMatch = colorString.match(/oklch\([^)]*\s+([\d.]+)\)/)
  if (oklchMatch) return parseFloat(oklchMatch[1])

  return 240 // Default to 240 if parsing fails
}

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
