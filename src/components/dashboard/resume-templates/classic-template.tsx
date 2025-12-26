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

interface ClassicTemplateProps {
  resume: Resume
  locale: Locale
  dict: any
  titleFontSize?: number
  setTitleFontSize?: (size: number) => void
}

export function ClassicTemplate({ resume, locale, dict, titleFontSize = 36, setTitleFontSize }: ClassicTemplateProps) {
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
      <div className="space-y-5 p-12 print:p-8">
        {/* Header: CV Title */}
        <div className="border-b-2 border-slate-900 pb-4 text-center" style={{ position: 'relative' }}>
          <h1 className="mb-3 font-serif font-bold uppercase tracking-wide text-slate-900" style={{ fontSize: `${titleFontSize}px` }}>
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
                marginLeft: '24px',
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
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-slate-700">
            {contact.email && (
              <>
                <span>✉️ {contact.email}</span>
                {(contact.phone || contact.location || contact.linkedin || contact.github || contact.website) && <span>•</span>}
              </>
            )}
            {contact.phone && (
              <>
                <span>📞 {contact.phone}</span>
                {(contact.location || contact.linkedin || contact.github || contact.website) && <span>•</span>}
              </>
            )}
            {contact.location && (
              <>
                <span>📍 {contact.location}</span>
                {(contact.linkedin || contact.github || contact.website) && <span>•</span>}
              </>
            )}
          </div>
          {(contact.linkedin || contact.github || contact.website) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 text-xs text-slate-600">
              {contact.linkedin && (
                <>
                  <span>🔗 {contact.linkedin}</span>
                  {(contact.github || contact.website) && <span>•</span>}
                </>
              )}
              {contact.github && (
                <>
                  <span>💻 {contact.github}</span>
                  {contact.website && <span>•</span>}
                </>
              )}
              {contact.website && <span>🌐 {contact.website}</span>}
            </div>
          )}
        </div>

        {/* Summary */}
        {resume.summary && (
          <div>
            <h2 className="mb-3 border-b border-slate-400 pb-1 font-serif text-lg font-bold uppercase text-slate-900">
              {dict.resumes?.editor?.sections?.summary || 'Professional Summary'}
            </h2>
            <div className="text-sm leading-relaxed text-slate-800 text-justify">{formatText(resume.summary)}</div>
          </div>
        )}

        {/* Experience */}
        {experiences.length > 0 && (
          <div>
            <h2 className="mb-3 border-b border-slate-400 pb-1 font-serif text-lg font-bold uppercase text-slate-900">
              {dict.resumes?.editor?.sections?.experience || 'Professional Experience'}
            </h2>
            <div className="space-y-4">
              {experiences.map((exp, index) => (
                <div key={index}>
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-bold text-slate-900">{exp.position}</h3>
                    <span className="text-sm italic text-slate-600">
                      {exp.startDate &&
                        new Date(exp.startDate + '-01').toLocaleDateString(locale, {
                          month: 'short',
                          year: 'numeric',
                        })}
                      {' - '}
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
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm italic text-slate-700">{exp.company}</p>
                    {exp.location && <p className="text-sm text-slate-600">{exp.location}</p>}
                  </div>
                  {exp.achievements && exp.achievements.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-800">
                      {exp.achievements.map((achievement, i) => (
                        <li key={i}>{formatText(achievement)}</li>
                      ))}
                    </ul>
                  ) : exp.description ? (
                    <div className="mt-2 text-sm leading-relaxed text-slate-800 text-justify">
                      {formatText(exp.description)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {education.length > 0 && (
          <div>
            <h2 className="mb-3 border-b border-slate-400 pb-1 font-serif text-lg font-bold uppercase text-slate-900">
              {dict.resumes?.editor?.sections?.education || 'Education'}
            </h2>
            <div className="space-y-3">
              {education.map((edu, index) => (
                <div key={index}>
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-bold text-slate-900">{edu.degree}</h3>
                    <span className="text-sm italic text-slate-600">
                      {edu.startDate &&
                        new Date(edu.startDate + '-01').toLocaleDateString(locale, {
                          month: 'short',
                          year: 'numeric',
                        })}
                      {' - '}
                      {edu.endDate
                        ? new Date(edu.endDate + '-01').toLocaleDateString(locale, {
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Present'}
                    </span>
                  </div>
                  <p className="text-sm italic text-slate-700">
                    {edu.school}
                    {edu.field && ` - ${edu.field}`}
                  </p>
                  {edu.gpa && (
                    <p className="text-sm text-slate-600">
                      GPA: <span className="font-semibold">{edu.gpa}</span>
                    </p>
                  )}
                  {edu.description && (
                    <p className="mt-1 text-sm text-slate-800">{edu.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <div>
            <h2 className="mb-3 border-b border-slate-400 pb-1 font-serif text-lg font-bold uppercase text-slate-900">
              {dict.resumes?.editor?.sections?.skills || 'Skills'}
            </h2>
            <div className="space-y-2">
              {skills.map((skillCategory, index) => (
                <div key={index}>
                  <span className="font-bold text-slate-900">{skillCategory.category}: </span>
                  <span className="text-sm text-slate-800">
                    {skillCategory.items.join(', ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <div>
            <h2 className="mb-3 border-b border-slate-400 pb-1 font-serif text-lg font-bold uppercase text-slate-900">
              {dict.resumes?.editor?.sections?.projects || 'Projects'}
            </h2>
            <div className="space-y-3">
              {projects.map((project, index) => (
                <div key={index}>
                  <h3 className="font-bold text-slate-900">{project.name}</h3>
                  {project.description && (
                    <p className="mt-1 text-sm text-slate-800">{project.description}</p>
                  )}
                  {project.technologies && project.technologies.length > 0 && (
                    <p className="mt-1 text-sm text-slate-700">
                      <span className="font-semibold">Technologies:</span>{' '}
                      {project.technologies.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Two-column layout for Languages and Certifications */}
        {(languages.length > 0 || certifications.length > 0) && (
          <div className="grid grid-cols-2 gap-6">
            {/* Languages */}
            {languages.length > 0 && (
              <div>
                <h2 className="mb-3 border-b border-slate-400 pb-1 font-serif text-lg font-bold uppercase text-slate-900">
                  {dict.resumes?.editor?.sections?.languages || 'Languages'}
                </h2>
                <div className="space-y-1">
                  {languages.map((lang, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="font-semibold text-slate-900">{lang.language}</span>
                      <span className="text-slate-700">
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
                <h2 className="mb-3 border-b border-slate-400 pb-1 font-serif text-lg font-bold uppercase text-slate-900">
                  {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
                </h2>
                <div className="space-y-2">
                  {certifications.map((cert, index) => (
                    <div key={index}>
                      <h3 className="text-sm font-bold text-slate-900">{cert.name}</h3>
                      <p className="text-xs text-slate-700">{cert.issuer}</p>
                      {cert.date && (
                        <p className="text-xs italic text-slate-600">
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
