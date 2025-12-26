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

interface CreativeTemplateProps {
  resume: Resume
  locale: Locale
  dict: any
  titleFontSize?: number
  setTitleFontSize?: (size: number) => void
}

export function CreativeTemplate({ resume, locale, dict, titleFontSize = 48, setTitleFontSize }: CreativeTemplateProps) {
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
      {/* Header with gradient background */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-10 text-white print:p-8">
        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-4">
            <h1 className="font-black uppercase tracking-tight" style={{ fontSize: `${titleFontSize}px` }}>
              {resume.title || contact.name || 'Your Name'}
            </h1>
            {setTitleFontSize && (
              <div className="flex items-center gap-2 print:hidden">
                <input
                  type="range"
                  min="16"
                  max="48"
                  step="2"
                  value={titleFontSize}
                  onChange={(e) => setTitleFontSize(Number(e.target.value))}
                  className="w-32 h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white"
                />
                <span className="text-xs text-white/80 font-mono w-10">
                  {titleFontSize}px
                </span>
              </div>
            )}
          </div>
          {resume.summary && (
            <div className="mb-4 max-w-2xl text-base leading-relaxed text-white/90 text-justify">
              {formatText(resume.summary)}
            </div>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {contact.email && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                <span>{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                <span>{contact.phone}</span>
              </div>
            )}
            {contact.location && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                <span>{contact.location}</span>
              </div>
            )}
          </div>
          {(contact.linkedin || contact.github || contact.website) && (
            <div className="mt-2 flex flex-wrap gap-x-5 text-xs text-white/80">
              {contact.linkedin && <span>{contact.linkedin}</span>}
              {contact.github && <span>{contact.github}</span>}
              {contact.website && <span>{contact.website}</span>}
            </div>
          )}
        </div>

        {/* Decorative circles */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10"></div>
        <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-white/10"></div>
      </div>

      <div className="p-10 print:p-8">
        {/* Two-column layout */}
        <div className="grid grid-cols-3 gap-8">
          {/* Left column - 1/3 */}
          <div className="space-y-6">
            {/* Skills */}
            {skills.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-black uppercase text-purple-600">
                  <div className="h-6 w-1 bg-gradient-to-b from-purple-600 to-pink-500"></div>
                  {dict.resumes?.editor?.sections?.skills || 'Skills'}
                </h2>
                <div className="space-y-4">
                  {skills.map((skillCategory, index) => (
                    <div key={index}>
                      <h3 className="mb-2 text-sm font-bold text-slate-800">
                        {skillCategory.category}
                      </h3>
                      <div className="space-y-1">
                        {skillCategory.items.map((skill, i) => (
                          <div key={i} className="text-xs text-slate-700">
                            • {skill}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Languages */}
            {languages.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-black uppercase text-purple-600">
                  <div className="h-6 w-1 bg-gradient-to-b from-purple-600 to-pink-500"></div>
                  {dict.resumes?.editor?.sections?.languages || 'Languages'}
                </h2>
                <div className="space-y-2">
                  {languages.map((lang, index) => (
                    <div key={index}>
                      <div className="mb-1 text-sm font-bold text-slate-800">{lang.language}</div>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1.5 w-full rounded ${
                              (lang.level === 'Native' && level <= 5) ||
                              (lang.level === 'Fluent' && level <= 4) ||
                              (lang.level === 'Professional' && level <= 3) ||
                              (lang.level === 'Intermediate' && level <= 2) ||
                              (lang.level === 'Basic' && level <= 1)
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                                : 'bg-slate-200'
                            }`}
                          ></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {certifications.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-black uppercase text-purple-600">
                  <div className="h-6 w-1 bg-gradient-to-b from-purple-600 to-pink-500"></div>
                  {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
                </h2>
                <div className="space-y-3">
                  {certifications.map((cert, index) => (
                    <div key={index}>
                      <h3 className="text-sm font-bold text-slate-800">{cert.name}</h3>
                      <p className="text-xs text-slate-600">{cert.issuer}</p>
                      {cert.date && (
                        <p className="text-xs text-slate-500">
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

          {/* Right column - 2/3 */}
          <div className="col-span-2 space-y-6">
            {/* Experience */}
            {experiences.length > 0 && (
              <div>
                <h2 className="mb-5 flex items-center gap-2 text-2xl font-black uppercase text-purple-600">
                  <div className="h-8 w-1.5 bg-gradient-to-b from-purple-600 to-pink-500"></div>
                  {dict.resumes?.editor?.sections?.experience || 'Experience'}
                </h2>
                <div className="space-y-5">
                  {experiences.map((exp, index) => (
                    <div key={index} className="relative pl-6">
                      <div className="absolute left-0 top-1 h-3 w-3 rounded-full bg-gradient-to-br from-purple-500 to-pink-500"></div>
                      <div className="absolute left-[5px] top-4 h-full w-0.5 bg-gradient-to-b from-purple-300 to-transparent"></div>

                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">{exp.position}</h3>
                          <p className="text-base font-semibold text-purple-600">{exp.company}</p>
                        </div>
                        <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
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
                        </div>
                      </div>

                      {exp.location && (
                        <p className="mb-2 text-sm text-slate-600">{exp.location}</p>
                      )}

                      {exp.achievements && exp.achievements.length > 0 ? (
                        <ul className="space-y-1 text-sm text-slate-700">
                          {exp.achievements.map((achievement, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-purple-500">▸</span>
                              <span>{formatText(achievement)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : exp.description ? (
                        <div className="mb-3 text-sm leading-relaxed text-slate-700 text-justify">
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
              <div>
                <h2 className="mb-5 flex items-center gap-2 text-2xl font-black uppercase text-purple-600">
                  <div className="h-8 w-1.5 bg-gradient-to-b from-purple-600 to-pink-500"></div>
                  {dict.resumes?.editor?.sections?.projects || 'Projects'}
                </h2>
                <div className="space-y-4">
                  {projects.map((project, index) => (
                    <div
                      key={index}
                      className="rounded-lg border-l-4 border-purple-500 bg-slate-50 p-4"
                    >
                      <h3 className="mb-2 text-lg font-bold text-slate-900">{project.name}</h3>
                      {project.description && (
                        <p className="mb-3 text-sm leading-relaxed text-slate-700">
                          {project.description}
                        </p>
                      )}
                      {project.technologies && project.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {project.technologies.map((tech, i) => (
                            <span
                              key={i}
                              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 text-xs font-semibold text-white"
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
                <h2 className="mb-5 flex items-center gap-2 text-2xl font-black uppercase text-purple-600">
                  <div className="h-8 w-1.5 bg-gradient-to-b from-purple-600 to-pink-500"></div>
                  {dict.resumes?.editor?.sections?.education || 'Education'}
                </h2>
                <div className="space-y-4">
                  {education.map((edu, index) => (
                    <div key={index} className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{edu.degree}</h3>
                        <p className="text-base text-purple-600">
                          {edu.school}
                          {edu.field && ` - ${edu.field}`}
                        </p>
                        {edu.gpa && (
                          <p className="mt-1 text-sm text-slate-600">GPA: {edu.gpa}</p>
                        )}
                      </div>
                      <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
