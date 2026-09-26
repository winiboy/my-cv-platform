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
import { Fragment, type ReactNode } from 'react'
import type { Locale } from '@/lib/i18n'
import { renderFormattedText } from '@/lib/format-text'
import { PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import {
  assertExhaustiveSection,
  DEFAULT_RESUME_LAYOUT,
  mapEditorOrderToMinimal,
  type EditorMainId,
  type MinimalMainId,
} from '@/lib/layout-settings'

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
  /**
   * The document-wide size multiplier from the layout model (Part 3 US-011).
   * Every size this template draws from the model is drawn at this scale, and
   * `docx-minimal.ts` scales the same four sizes by the same number.
   */
  fontScale?: number
  /**
   * The font the owner CHOSE, or undefined when they chose none (Part 3
   * US-012). Minimal declares no family of its own and so draws the app's
   * Inter until one is chosen; `resume-preview.tsx` applies
   * `chosenFontFamily` before passing it.
   */
  fontFamily?: string
  /**
   * Section order and visibility, in the EDITOR's vocabulary, exactly as the
   * layout model stores them (Part 3 US-009). Minimal's own section sequence is
   * derived from them by `mapEditorOrderToMinimal`, the same rule
   * `docx-minimal.ts` applies, so the Preview and the export cannot drift.
   */
  mainContentOrder?: readonly EditorMainId[]
  hiddenMainSections?: readonly EditorMainId[]
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
  setSectionDescFontSize,
  fontScale = DEFAULT_RESUME_LAYOUT.fontScale,
  fontFamily,
  mainContentOrder = DEFAULT_RESUME_LAYOUT.mainContentOrder,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections
}: MinimalTemplateProps) {
  /**
   * The sizes this document DRAWS: the stored size at the model's scale
   * (Part 3 US-011).
   *
   * Separate from the props because the sliders below keep showing and writing
   * the STORED size — the scale is a second, document-wide control, and a
   * slider that displayed the product would report a value the model does not
   * hold and would feed it back on the next drag.
   */
  const drawnTitleSize = titleFontSize * fontScale
  const drawnContactSize = contactFontSize * fontScale
  const drawnSectionTitleSize = sectionTitleFontSize * fontScale
  const drawnSectionDescSize = sectionDescFontSize * fontScale

  const contact = (resume.contact as unknown as ResumeContact) || {}
  // Filter to show only visible items
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter(exp => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter(edu => edu.visible !== false)
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).filter(skill => skill.visible !== false)
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter(lang => lang.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).filter(cert => cert.visible !== false)
  const projects = ((resume.projects as unknown as ResumeProject[]) || []).filter(proj => proj.visible !== false)

  /**
   * The sections this document draws, in order (Part 3 US-009).
   *
   * `mapEditorOrderToMinimal` is the one rule that turns the editor's stored
   * main-content order into Minimal's own sequence, and `docx-minimal.ts`
   * applies it to the same stored lists — so the Preview and the export cannot
   * order or hide sections differently. Nothing here re-states the sequence.
   *
   * The hidden list is the editor's vocabulary, which is a subset of the
   * template's; widening it to `string` compares the two as the DOCX does
   * instead of asserting one is the other.
   */
  const hiddenIds: readonly string[] = hiddenMainSections
  const visibleSections = mapEditorOrderToMinimal(mainContentOrder).filter(
    sectionId => !hiddenIds.includes(sectionId)
  )

  /**
   * One section of the document, by its id in Classic's and Minimal's shared
   * vocabulary. Returns null where the resume carries nothing for it, which is
   * the same emptiness test each block always applied.
   */
  const renderMainSection = (sectionId: MinimalMainId): ReactNode => {
    switch (sectionId) {
      // Summary
      case 'summary': {
        if (!resume.summary) return null
        return (
          <div>
            <h2 className="mb-4 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ position: 'relative', fontSize: `${drawnSectionTitleSize}px` }}>
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
            <div className="max-w-3xl leading-relaxed text-slate-600 text-justify" style={{ fontSize: `${drawnSectionDescSize}px` }}>
              {renderFormattedText(resume.summary)}
            </div>
          </div>
        )
      }

      // Experience
      case 'experience': {
        if (experiences.length === 0) return null
        return (
          <div>
            <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
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
                    <ul className="space-y-2 text-slate-700" style={{ position: 'relative', fontSize: `${drawnSectionDescSize}px` }}>
                      {exp.achievements.map((achievement, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400"></span>
                          <span className="flex-1 leading-relaxed">{renderFormattedText(achievement)}</span>
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
                    <div className="mb-3 leading-relaxed text-slate-700 text-justify" style={{ position: 'relative', fontSize: `${drawnSectionDescSize}px` }}>
                      {renderFormattedText(exp.description)}

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
        )
      }

      // Projects
      case 'projects': {
        if (projects.length === 0) return null
        return (
          <div>
            <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              {dict.resumes?.editor?.sections?.projects || 'Projects'}
            </h2>
            <div className="space-y-6">
              {projects.map((project, index) => (
                <div key={index}>
                  <h3 className="mb-2 text-xl font-medium text-slate-900">{project.name}</h3>
                  {project.description && (
                    <div className="mb-3 leading-relaxed text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      {renderFormattedText(project.description)}
                    </div>
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
        )
      }

      // Education
      case 'education': {
        if (education.length === 0) return null
        return (
          <div>
            <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
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
                  <p className="font-light text-slate-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                    {edu.school}
                    {edu.field && ` · ${edu.field}`}
                  </p>
                  {edu.gpa && <p className="mt-1 text-slate-500" style={{ fontSize: `${drawnSectionDescSize}px` }}>GPA: {edu.gpa}</p>}
                </div>
              ))}
            </div>
          </div>
        )
      }

      // Skills
      case 'skills': {
        if (skills.length === 0) return null
        return (
          <div>
            <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              {dict.resumes?.editor?.sections?.skills || 'Skills'}
            </h2>
            <div className="space-y-4">
              {skills.map((skillCategory, index) => (
                <div key={index}>
                  <h3 className="mb-2 font-medium text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                    {skillCategory.category}
                  </h3>
                  {skillCategory.skillsHtml ? (
                    <div className="text-slate-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      {renderFormattedText(skillCategory.skillsHtml)}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {skillCategory.items.map((skill, i) => (
                        <span key={i} className="text-slate-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      }

      // Two-column for Languages and Certifications
      case 'languagesAndCerts': {
        if (languages.length === 0 && certifications.length === 0) return null
        return (
          <div className="grid grid-cols-2 gap-12">
            {/* Languages */}
            {languages.length > 0 && (
              <div>
                <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
                  {dict.resumes?.editor?.sections?.languages || 'Languages'}
                </h2>
                <div className="space-y-3">
                  {languages.map((lang, index) => (
                    <div key={index} className="flex justify-between">
                      <span className="text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>{lang.language}</span>
                      <span className="font-light text-slate-500" style={{ fontSize: `${drawnSectionDescSize}px` }}>
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
                <h2 className="mb-6 font-semibold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
                  {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
                </h2>
                <div className="space-y-4">
                  {certifications.map((cert, index) => (
                    <div key={index}>
                      <h3 className="font-medium text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>{cert.name}</h3>
                      <p className="text-slate-500" style={{ fontSize: `${drawnSectionDescSize}px` }}>{cert.issuer}</p>
                      {cert.date && (
                        <p className="text-slate-400" style={{ fontSize: `${drawnSectionDescSize}px` }}>
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
        )
      }
      default:
        assertExhaustiveSection(sectionId)
        return null
    }
  }

  return (
    <div data-testid="resume-document" className="mx-auto bg-white shadow-lg print:shadow-none" style={{ width: PAGE_WIDTH_CSS, fontFamily: fontFamily }}>
      <div className="space-y-10 p-16 print:p-10">
        {/* Header: CV Title and Contact */}
        <div className="space-y-4 pb-6 border-b border-slate-300" style={{ position: 'relative' }}>
          <h1 className="font-light tracking-tight text-slate-900 text-center" style={{ fontSize: `${drawnTitleSize}px` }}>
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
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-slate-500" style={{ position: 'relative', fontSize: `${drawnContactSize}px` }}>
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

        {visibleSections.map((sectionId) => (
          <Fragment key={sectionId}>{renderMainSection(sectionId)}</Fragment>
        ))}
      </div>
    </div>
  )
}
