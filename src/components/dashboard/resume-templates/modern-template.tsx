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

interface ModernTemplateProps {
  resume: Resume
  locale: Locale
  dict: any
}

export function ModernTemplate({ resume, locale, dict }: ModernTemplateProps) {
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
      <div className="flex">
        {/* Left Sidebar - Teal accent */}
        <div className="w-[35%] bg-teal-700 p-8 text-white print:p-6">
          {/* Contact */}
          <div className="mb-8">
            <h2 className="mb-4 border-b-2 border-teal-400 pb-2 text-lg font-bold uppercase tracking-wide">
              {dict.resumes?.editor?.sections?.contact || 'Contact'}
            </h2>
            <div className="space-y-3 text-sm">
              {contact.email && (
                <div>
                  <p className="text-xs text-teal-200">Email</p>
                  <p className="break-all">{contact.email}</p>
                </div>
              )}
              {contact.phone && (
                <div>
                  <p className="text-xs text-teal-200">Phone</p>
                  <p>{contact.phone}</p>
                </div>
              )}
              {contact.location && (
                <div>
                  <p className="text-xs text-teal-200">Location</p>
                  <p>{contact.location}</p>
                </div>
              )}
              {contact.linkedin && (
                <div>
                  <p className="text-xs text-teal-200">LinkedIn</p>
                  <p className="break-all text-xs">{contact.linkedin}</p>
                </div>
              )}
              {contact.github && (
                <div>
                  <p className="text-xs text-teal-200">GitHub</p>
                  <p className="break-all text-xs">{contact.github}</p>
                </div>
              )}
              {contact.website && (
                <div>
                  <p className="text-xs text-teal-200">Website</p>
                  <p className="break-all text-xs">{contact.website}</p>
                </div>
              )}
            </div>
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 border-b-2 border-teal-400 pb-2 text-lg font-bold uppercase tracking-wide">
                {dict.resumes?.editor?.sections?.skills || 'Skills'}
              </h2>
              <div className="space-y-4">
                {skills.map((skillCategory, index) => (
                  <div key={index}>
                    <h3 className="mb-2 text-sm font-bold text-teal-100">
                      {skillCategory.category}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {skillCategory.items.map((skill, i) => (
                        <span
                          key={i}
                          className="rounded bg-teal-600 px-2 py-1 text-xs font-medium"
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
              <h2 className="mb-4 border-b-2 border-teal-400 pb-2 text-lg font-bold uppercase tracking-wide">
                {dict.resumes?.editor?.sections?.languages || 'Languages'}
              </h2>
              <div className="space-y-2">
                {languages.map((lang, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="font-semibold">{lang.language}</span>
                    <span className="text-teal-200">
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
              <h2 className="mb-4 border-b-2 border-teal-400 pb-2 text-lg font-bold uppercase tracking-wide">
                {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
              </h2>
              <div className="space-y-3">
                {certifications.map((cert, index) => (
                  <div key={index} className="text-sm">
                    <h3 className="font-bold">{cert.name}</h3>
                    <p className="text-xs text-teal-200">{cert.issuer}</p>
                    <p className="text-xs text-teal-300">
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
        </div>

        {/* Right Content Area */}
        <div className="w-[65%] p-8 print:p-6">
          {/* Header */}
          <div className="mb-6 border-b-4 border-teal-600 pb-4">
            <h1 className="mb-2 text-4xl font-bold text-slate-900">
              {contact.name || 'Your Name'}
            </h1>
            {resume.summary && (
              <div className="text-sm leading-relaxed text-slate-700 text-justify">{formatText(resume.summary)}</div>
            )}
          </div>

          {/* Experience */}
          {experiences.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-teal-700">
                <div className="h-1 w-8 bg-teal-600"></div>
                {dict.resumes?.editor?.sections?.experience || 'Experience'}
              </h2>
              <div className="space-y-4">
                {experiences.map((exp, index) => (
                  <div key={index} className="relative pl-4">
                    <div className="absolute left-0 top-2 h-2 w-2 rounded-full bg-teal-600"></div>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900">{exp.position}</h3>
                        <p className="text-sm font-semibold text-teal-700">{exp.company}</p>
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
                      <ul className="mt-2 space-y-1 text-sm text-slate-700">
                        {exp.achievements.map((achievement, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-teal-600">▸</span>
                            <span>{formatText(achievement)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : exp.description ? (
                      <div className="mt-2 text-sm leading-relaxed text-slate-700 text-justify">
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
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-teal-700">
                <div className="h-1 w-8 bg-teal-600"></div>
                {dict.resumes?.editor?.sections?.projects || 'Projects'}
              </h2>
              <div className="space-y-4">
                {projects.map((project, index) => (
                  <div key={index} className="relative pl-4">
                    <div className="absolute left-0 top-2 h-2 w-2 rounded-full bg-teal-600"></div>
                    <h3 className="text-lg font-bold text-slate-900">{project.name}</h3>
                    {project.description && (
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
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
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-teal-700">
                <div className="h-1 w-8 bg-teal-600"></div>
                {dict.resumes?.editor?.sections?.education || 'Education'}
              </h2>
              <div className="space-y-3">
                {education.map((edu, index) => (
                  <div key={index} className="relative pl-4">
                    <div className="absolute left-0 top-2 h-2 w-2 rounded-full bg-teal-600"></div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900">{edu.degree}</h3>
                        <p className="text-sm text-teal-700">
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
    </div>
  )
}
