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

interface MinimalTemplateProps {
  resume: Resume
  locale: Locale
  dict: any
  titleFontSize?: number
  setTitleFontSize?: (size: number) => void
  contactFontSize?: number
  setContactFontSize?: (size: number) => void
  sectionTitleFontSize?: number
  setSectionTitleFontSize?: (size: number) => void
  sectionDescFontSize?: number
  setSectionDescFontSize?: (size: number) => void
}

export function MinimalTemplate({
  resume,
  locale,
  dict,
  titleFontSize = 48,
  setTitleFontSize,
  contactFontSize = 12,
  setContactFontSize,
  sectionTitleFontSize = 16,
  setSectionTitleFontSize,
  sectionDescFontSize = 14,
  setSectionDescFontSize
}: MinimalTemplateProps) {
  const contact = (resume.contact as unknown as ResumeContact) || {}
  // Filter to show only visible items
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter(exp => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter(edu => edu.visible !== false)
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).filter(skill => skill.visible !== false)
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter(lang => lang.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).filter(cert => cert.visible !== false)
  const projects = ((resume.projects as unknown as ResumeProject[]) || []).filter(proj => proj.visible !== false)

  return (
    <div className="mx-auto bg-white shadow-lg print:shadow-none" style={{ width: '8.5in' }}>
      <div className="space-y-10 p-16 print:p-10">
        {/* Header: CV Title and Contact */}
        <div className="space-y-4 pb-6 border-b border-slate-300" style={{ position: 'relative' }}>
          <h1 className="font-light tracking-tight text-slate-900 text-center" style={{ fontSize: `${titleFontSize}px` }}>
            {resume.title || 'CV TITLE'}
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
                className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
              />
              <span className="text-xs text-slate-600 font-mono">
                {titleFontSize}px
              </span>
            </div>
          )}

          {/* Contact Information */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-slate-500" style={{ position: 'relative', fontSize: `${contactFontSize}px` }}>
            {contact.email && <span>✉️ {contact.email}</span>}
            {contact.phone && <span>📞 {contact.phone}</span>}
            {contact.location && <span>📍 {contact.location}</span>}
            {contact.linkedin && <span>🔗 {contact.linkedin}</span>}
            {contact.github && <span>💻 {contact.github}</span>}
            {contact.website && <span>🌐 {contact.website}</span>}

            {/* Contact Font Size Slider */}
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
                  className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                />
                <span className="text-xs text-slate-600 font-mono">
                  {contactFontSize}px
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        {resume.summary && (
          <div>
            <h2 className="mb-4 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ position: 'relative', fontSize: `${sectionTitleFontSize}px` }}>
              {dict.resumes?.editor?.sections?.summary || 'Summary'}

              {/* Section Title Font Size Slider */}
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
                    className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                  />
                  <span className="text-xs text-slate-600 font-mono">
                    {sectionTitleFontSize}px
                  </span>
                </div>
              )}
            </h2>
            <div className="max-w-3xl leading-relaxed text-slate-600 text-justify" style={{ fontSize: `${sectionDescFontSize}px` }}>
              {formatText(resume.summary)}
            </div>
          </div>
        )}

        {/* Experience */}
        {experiences.length > 0 && (
          <div>
            <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${sectionTitleFontSize}px` }}>
              {dict.resumes?.editor?.sections?.experience || 'Experience'}
            </h2>
            <div className="space-y-8">
              {experiences.map((exp, index) => (
                <div key={index}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-xl font-medium text-slate-900">{exp.position}</h3>
                    <span className="text-sm text-slate-500">
                      {exp.startDate &&
                        new Date(exp.startDate + '-01').toLocaleDateString(locale, {
                          month: 'short',
                          year: 'numeric',
                        })}
                      {' — '}
                      {exp.current
                        ? 'Present'
                        : exp.endDate
                          ? new Date(exp.endDate + '-01').toLocaleDateString(locale, {
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Present'}
                    </span>
                  </div>
                  <p className="mb-3 text-base font-light text-slate-600">
                    {exp.company}
                    {exp.location && ` · ${exp.location}`}
                  </p>
                  {exp.achievements && exp.achievements.length > 0 ? (
                    <ul className="space-y-2 text-slate-700" style={{ position: 'relative', fontSize: `${sectionDescFontSize}px` }}>
                      {exp.achievements.map((achievement, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400"></span>
                          <span className="flex-1 leading-relaxed">{formatText(achievement)}</span>
                        </li>
                      ))}

                      {/* Section Description Font Size Slider - Only show on first experience */}
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
                            className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                          />
                          <span className="text-xs text-slate-600 font-mono">
                            {sectionDescFontSize}px
                          </span>
                        </div>
                      )}
                    </ul>
                  ) : exp.description ? (
                    <div className="mb-3 leading-relaxed text-slate-700 text-justify" style={{ position: 'relative', fontSize: `${sectionDescFontSize}px` }}>
                      {formatText(exp.description)}

                      {/* Section Description Font Size Slider - Only show on first experience */}
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
                            className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                          />
                          <span className="text-xs text-slate-600 font-mono">
                            {sectionDescFontSize}px
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <div>
            <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${sectionTitleFontSize}px` }}>
              {dict.resumes?.editor?.sections?.projects || 'Projects'}
            </h2>
            <div className="space-y-6">
              {projects.map((project, index) => (
                <div key={index}>
                  <h3 className="mb-2 text-xl font-medium text-slate-900">{project.name}</h3>
                  {project.description && (
                    <p className="mb-3 leading-relaxed text-slate-700" style={{ fontSize: `${sectionDescFontSize}px` }}>
                      {project.description}
                    </p>
                  )}
                  {project.technologies && project.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {project.technologies.map((tech, i) => (
                        <span key={i} className="text-xs font-light text-slate-500">
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
            <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${sectionTitleFontSize}px` }}>
              {dict.resumes?.editor?.sections?.education || 'Education'}
            </h2>
            <div className="space-y-6">
              {education.map((edu, index) => (
                <div key={index}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-xl font-medium text-slate-900">{edu.degree}</h3>
                    <span className="text-sm text-slate-500">
                      {edu.startDate &&
                        new Date(edu.startDate + '-01').toLocaleDateString(locale, {
                          month: 'short',
                          year: 'numeric',
                        })}
                      {' — '}
                      {edu.endDate
                        ? new Date(edu.endDate + '-01').toLocaleDateString(locale, {
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Present'}
                    </span>
                  </div>
                  <p className="font-light text-slate-600" style={{ fontSize: `${sectionDescFontSize}px` }}>
                    {edu.school}
                    {edu.field && ` · ${edu.field}`}
                  </p>
                  {edu.gpa && <p className="mt-1 text-slate-500" style={{ fontSize: `${sectionDescFontSize}px` }}>GPA: {edu.gpa}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <div>
            <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${sectionTitleFontSize}px` }}>
              {dict.resumes?.editor?.sections?.skills || 'Skills'}
            </h2>
            <div className="space-y-4">
              {skills.map((skillCategory, index) => (
                <div key={index}>
                  <h3 className="mb-2 font-medium text-slate-700" style={{ fontSize: `${sectionDescFontSize}px` }}>
                    {skillCategory.category}
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {skillCategory.items.map((skill, i) => (
                      <span key={i} className="text-slate-600" style={{ fontSize: `${sectionDescFontSize}px` }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Two-column for Languages and Certifications */}
        {(languages.length > 0 || certifications.length > 0) && (
          <div className="grid grid-cols-2 gap-12">
            {/* Languages */}
            {languages.length > 0 && (
              <div>
                <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${sectionTitleFontSize}px` }}>
                  {dict.resumes?.editor?.sections?.languages || 'Languages'}
                </h2>
                <div className="space-y-3">
                  {languages.map((lang, index) => (
                    <div key={index} className="flex justify-between">
                      <span className="text-slate-700" style={{ fontSize: `${sectionDescFontSize}px` }}>{lang.language}</span>
                      <span className="font-light text-slate-500" style={{ fontSize: `${sectionDescFontSize}px` }}>
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
                <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${sectionTitleFontSize}px` }}>
                  {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
                </h2>
                <div className="space-y-4">
                  {certifications.map((cert, index) => (
                    <div key={index}>
                      <h3 className="font-medium text-slate-700" style={{ fontSize: `${sectionDescFontSize}px` }}>{cert.name}</h3>
                      <p className="text-slate-500" style={{ fontSize: `${sectionDescFontSize}px` }}>{cert.issuer}</p>
                      {cert.date && (
                        <p className="text-slate-400" style={{ fontSize: `${sectionDescFontSize}px` }}>
                          {new Date(cert.date + '-01').toLocaleDateString(locale, {
                            month: 'short',
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
        )}
      </div>
    </div>
  )
}
