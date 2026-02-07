import type {
  Resume,
  ResumeContact,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
  ResumeLanguage,
  ResumeCertification,
  ResumeProject,
} from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { formatText } from '@/lib/format-text'

const DEFAULT_SIDEBAR_COLOR = '#333333'
const ACCENT_COLOR = '#D4A843'

interface ModernTemplateProps {
  resume: Resume
  locale: Locale
  dict: any
  sidebarColor?: string
  titleFontSize?: number
  setTitleFontSize?: (size: number) => void
  contactFontSize?: number
  setContactFontSize?: (size: number) => void
  sectionTitleFontSize?: number
  setSectionTitleFontSize?: (size: number) => void
  sectionDescFontSize?: number
  setSectionDescFontSize?: (size: number) => void
}

export function ModernTemplate({ resume, locale, dict, sidebarColor, titleFontSize = 36, setTitleFontSize, contactFontSize = 12, setContactFontSize, sectionTitleFontSize = 16, setSectionTitleFontSize, sectionDescFontSize = 14, setSectionDescFontSize }: ModernTemplateProps) {
  const contact = (resume.contact as unknown as ResumeContact) || {}
  // Filter to show only visible items
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter(exp => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter(edu => edu.visible !== false)
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).filter(skill => skill.visible !== false)
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter(lang => lang.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).filter(cert => cert.visible !== false)
  const projects = ((resume.projects as unknown as ResumeProject[]) || []).filter(proj => proj.visible !== false)

  const activeSidebarColor = sidebarColor || DEFAULT_SIDEBAR_COLOR

  return (
    <div
      className="mx-auto shadow-lg print:shadow-none"
      style={{
        position: 'relative',
        width: '816px',
        minHeight: '1056px',
        backgroundColor: 'white',
      }}
    >
      {/* Left Sidebar - Dark accent, absolute full height */}
      <div
        className="text-white"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '35%',
          backgroundColor: activeSidebarColor,
        }}
      >
        {/* Photo Placeholder Zone */}
        <div
          style={{
            width: '100%',
            height: '220px',
            backgroundColor: '#444444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* User silhouette icon placeholder */}
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="40" cy="28" r="16" fill="rgba(255,255,255,0.3)" />
            <ellipse cx="40" cy="68" rx="28" ry="18" fill="rgba(255,255,255,0.3)" />
          </svg>
        </div>

        {/* Sidebar content with padding */}
        <div className="p-8 print:p-6">
        {/* Contact */}
        <div className="mb-8">
          <h2
            className="mb-4 pb-2 text-lg font-bold uppercase tracking-wide"
            style={{ borderBottom: `2px solid ${ACCENT_COLOR}` }}
          >
            {dict.resumes?.editor?.sections?.contact || 'Contact'}
          </h2>
          <div className="space-y-3" style={{ fontSize: `${contactFontSize}px`, position: 'relative' }}>
            {/* Font Size Slider for Contact - Positioned outside CV to the right */}
            {setContactFontSize && (
              <div
                className="print:hidden flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm"
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: 0,
                  marginLeft: '48px',
                  whiteSpace: 'nowrap'
                }}
              >
                <input
                  type="range"
                  min="10"
                  max="18"
                  step="1"
                  value={contactFontSize}
                  onChange={(e) => setContactFontSize(Number(e.target.value))}
                  className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: ACCENT_COLOR }}
                />
                <span className="text-xs text-slate-600 font-mono">
                  {contactFontSize}px
                </span>
              </div>
            )}
            {contact.email && (
              <div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Email</p>
                <p className="break-all">{contact.email}</p>
              </div>
            )}
            {contact.phone && (
              <div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Phone</p>
                <p>{contact.phone}</p>
              </div>
            )}
            {contact.location && (
              <div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Location</p>
                <p>{contact.location}</p>
              </div>
            )}
            {contact.linkedin && (
              <div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>LinkedIn</p>
                <p className="break-all text-xs">{contact.linkedin}</p>
              </div>
            )}
            {contact.github && (
              <div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>GitHub</p>
                <p className="break-all text-xs">{contact.github}</p>
              </div>
            )}
            {contact.website && (
              <div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Website</p>
                <p className="break-all text-xs">{contact.website}</p>
              </div>
            )}
          </div>
        </div>

        {/* Skills */}
        {skills.length > 0 && (
          <div className="mb-8">
            <h2
              className="mb-4 pb-2 text-lg font-bold uppercase tracking-wide"
              style={{ borderBottom: `2px solid ${ACCENT_COLOR}` }}
            >
              {dict.resumes?.editor?.sections?.skills || 'Skills'}
            </h2>
            <div className="space-y-4">
              {skills.map((skillCategory, index) => (
                <div key={index}>
                  <h3 className="mb-2 text-sm font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {skillCategory.category}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {skillCategory.items.map((skill, i) => (
                      <span
                        key={i}
                        className="rounded px-2 py-1 text-xs font-medium"
                        style={{ backgroundColor: ACCENT_COLOR, color: '#1a1a1a' }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {languages.length > 0 && (
          <div className="mb-8">
            <h2
              className="mb-4 pb-2 text-lg font-bold uppercase tracking-wide"
              style={{ borderBottom: `2px solid ${ACCENT_COLOR}` }}
            >
              {dict.resumes?.editor?.sections?.languages || 'Languages'}
            </h2>
            <div className="space-y-2">
              {languages.map((lang, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="font-semibold">{lang.language}</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {dict.resumes?.editor?.levels?.[lang.level.toLowerCase()] || lang.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certifications */}
        {certifications.length > 0 && (
          <div>
            <h2
              className="mb-4 pb-2 text-lg font-bold uppercase tracking-wide"
              style={{ borderBottom: `2px solid ${ACCENT_COLOR}` }}
            >
              {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
            </h2>
            <div className="space-y-3">
              {certifications.map((cert, index) => (
                <div key={index} className="text-sm">
                  <h3 className="font-bold">{cert.name}</h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{cert.issuer}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {cert.date &&
                      new Date(cert.date + '-01').toLocaleDateString(locale, {
                        month: 'short',
                        year: 'numeric',
                      })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>{/* End sidebar content padding wrapper */}
      </div>

      {/* Right Content Area */}
      <div className="p-8 print:p-6" style={{ marginLeft: '35%', backgroundColor: 'white' }}>
        {/* Header: Name, Job Title, Address */}
        <div className="mb-6" style={{ position: 'relative' }}>
          {/* Full name — large bold uppercase with letter-spacing */}
          <h1
            className="font-bold uppercase text-slate-900"
            style={{
              fontSize: `${titleFontSize}px`,
              letterSpacing: '0.15em',
              lineHeight: 1.2,
              marginBottom: '8px',
            }}
          >
            {contact.name || 'Your Name'}
          </h1>

          {/* Font Size Slider - Positioned outside CV to the right */}
          {setTitleFontSize && (
            <div
              className="print:hidden flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm"
              style={{
                position: 'absolute',
                left: '100%',
                top: 0,
                marginLeft: '48px',
                whiteSpace: 'nowrap'
              }}
            >
              <input
                type="range"
                min="16"
                max="48"
                step="2"
                value={titleFontSize}
                onChange={(e) => setTitleFontSize(Number(e.target.value))}
                className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: ACCENT_COLOR }}
              />
              <span className="text-xs text-slate-600 font-mono">
                {titleFontSize}px
              </span>
            </div>
          )}

          {/* Job title — on gold accent highlight bar */}
          {resume.title && (
            <div
              className="inline-block uppercase font-semibold tracking-wide"
              style={{
                backgroundColor: ACCENT_COLOR,
                color: '#FFFFFF',
                fontSize: '16px',
                padding: '4px 12px',
                marginBottom: '8px',
              }}
            >
              {resume.title}
            </div>
          )}

          {/* Address line — small gray text */}
          {contact.location && (
            <p
              style={{
                fontSize: '11px',
                color: '#6b7280',
                marginTop: resume.title ? '0px' : '4px',
              }}
            >
              {contact.location}
            </p>
          )}
        </div>

        {/* Summary */}
        {resume.summary && (
          <div className="mb-6 pb-4" style={{ borderBottom: `4px solid ${ACCENT_COLOR}` }}>
            <div className="leading-relaxed text-slate-700 text-justify" style={{ fontSize: `${sectionDescFontSize}px` }}>{formatText(resume.summary)}</div>
          </div>
        )}

        {/* Experience */}
        {experiences.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-4 flex items-center gap-2 font-bold" style={{ fontSize: `${sectionTitleFontSize}px`, position: 'relative', color: ACCENT_COLOR }}>
              <div className="h-1 w-8" style={{ backgroundColor: ACCENT_COLOR }}></div>
              {dict.resumes?.editor?.sections?.experience || 'Experience'}

              {/* Font Size Slider for Section Titles - Positioned outside CV to the right */}
              {setSectionTitleFontSize && (
                <div
                  className="print:hidden flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm"
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: 0,
                    marginLeft: '48px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    value={sectionTitleFontSize}
                    onChange={(e) => setSectionTitleFontSize(Number(e.target.value))}
                    className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: ACCENT_COLOR }}
                  />
                  <span className="text-xs text-slate-600 font-mono">
                    {sectionTitleFontSize}px
                  </span>
                </div>
              )}
            </h2>
            <div className="space-y-4">
              {experiences.map((exp, index) => (
                <div key={index} className="relative pl-4">
                  <div className="absolute left-0 top-2 h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT_COLOR }}></div>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900">{exp.position}</h3>
                      <p className="text-sm font-semibold" style={{ color: ACCENT_COLOR }}>{exp.company}</p>
                    </div>
                    <div className="text-right text-sm text-slate-600">
                      <p className="font-medium">
                        {exp.startDate &&
                          new Date(exp.startDate + '-01').toLocaleDateString(locale, {
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                        -{' '}
                        {exp.current
                          ? 'Present'
                          : exp.endDate
                            ? new Date(exp.endDate + '-01').toLocaleDateString(locale, {
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'Present'}
                      </p>
                      {exp.location && <p className="text-xs">{exp.location}</p>}
                    </div>
                  </div>
                  {exp.achievements && exp.achievements.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-slate-700" style={{ fontSize: `${sectionDescFontSize}px`, position: index === 0 ? 'relative' : undefined }}>
                      {index === 0 && setSectionDescFontSize && (
                        <div
                          className="print:hidden flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm"
                          style={{
                            position: 'absolute',
                            left: '100%',
                            top: 0,
                            marginLeft: '48px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <input
                            type="range"
                            min="10"
                            max="18"
                            step="1"
                            value={sectionDescFontSize}
                            onChange={(e) => setSectionDescFontSize(Number(e.target.value))}
                            className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            style={{ accentColor: ACCENT_COLOR }}
                          />
                          <span className="text-xs text-slate-600 font-mono">
                            {sectionDescFontSize}px
                          </span>
                        </div>
                      )}
                      {exp.achievements.map((achievement, i) => (
                        <li key={i} className="flex gap-2">
                          <span style={{ color: ACCENT_COLOR }}>&#9656;</span>
                          <span>{formatText(achievement)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : exp.description ? (
                    <div className="mt-2 leading-relaxed text-slate-700 text-justify" style={{ fontSize: `${sectionDescFontSize}px`, position: index === 0 ? 'relative' : undefined }}>
                      {index === 0 && setSectionDescFontSize && (
                        <div
                          className="print:hidden flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm"
                          style={{
                            position: 'absolute',
                            left: '100%',
                            top: 0,
                            marginLeft: '48px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <input
                            type="range"
                            min="10"
                            max="18"
                            step="1"
                            value={sectionDescFontSize}
                            onChange={(e) => setSectionDescFontSize(Number(e.target.value))}
                            className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            style={{ accentColor: ACCENT_COLOR }}
                          />
                          <span className="text-xs text-slate-600 font-mono">
                            {sectionDescFontSize}px
                          </span>
                        </div>
                      )}
                      {formatText(exp.description)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-4 flex items-center gap-2 font-bold" style={{ fontSize: `${sectionTitleFontSize}px`, color: ACCENT_COLOR }}>
              <div className="h-1 w-8" style={{ backgroundColor: ACCENT_COLOR }}></div>
              {dict.resumes?.editor?.sections?.projects || 'Projects'}
            </h2>
            <div className="space-y-4">
              {projects.map((project, index) => (
                <div key={index} className="relative pl-4">
                  <div className="absolute left-0 top-2 h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT_COLOR }}></div>
                  <h3 className="text-lg font-bold text-slate-900">{project.name}</h3>
                  {project.description && (
                    <p className="mt-1 leading-relaxed text-slate-700" style={{ fontSize: `${sectionDescFontSize}px` }}>
                      {project.description}
                    </p>
                  )}
                  {project.technologies && project.technologies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {project.technologies.map((tech, i) => (
                        <span
                          key={i}
                          className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {education.length > 0 && (
          <div>
            <h2 className="mb-4 flex items-center gap-2 font-bold" style={{ fontSize: `${sectionTitleFontSize}px`, color: ACCENT_COLOR }}>
              <div className="h-1 w-8" style={{ backgroundColor: ACCENT_COLOR }}></div>
              {dict.resumes?.editor?.sections?.education || 'Education'}
            </h2>
            <div className="space-y-3">
              {education.map((edu, index) => (
                <div key={index} className="relative pl-4">
                  <div className="absolute left-0 top-2 h-2 w-2 rounded-full" style={{ backgroundColor: ACCENT_COLOR }}></div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">{edu.degree}</h3>
                      <p className="text-sm" style={{ color: ACCENT_COLOR }}>
                        {edu.school}
                        {edu.field && ` - ${edu.field}`}
                      </p>
                      {edu.gpa && (
                        <p className="text-xs text-slate-600">GPA: {edu.gpa}</p>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">
                      {edu.startDate &&
                        new Date(edu.startDate + '-01').toLocaleDateString(locale, {
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                      -{' '}
                      {edu.endDate
                        ? new Date(edu.endDate + '-01').toLocaleDateString(locale, {
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Present'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
