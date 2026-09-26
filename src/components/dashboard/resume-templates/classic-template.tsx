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
  mapEditorOrderToClassic,
  type ClassicMainId,
  type EditorMainId,
} from '@/lib/layout-settings'

interface ClassicTemplateProps {
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
   * `docx-classic.ts` scales the same four sizes by the same number.
   */
  fontScale?: number
  /**
   * The font the owner CHOSE, or undefined when they chose none (Part 3
   * US-012). Classic keeps its designed serif until one is chosen, so this
   * prop is the choice and not the stored stack — `resume-preview.tsx` applies
   * `chosenFontFamily` before passing it.
   */
  fontFamily?: string
  /**
   * Section order and visibility, in the EDITOR's vocabulary, exactly as the
   * layout model stores them (Part 3 US-009). Classic's own section sequence is
   * derived from them by `mapEditorOrderToClassic`, the same rule
   * `docx-classic.ts` applies, so the Preview and the export cannot drift.
   */
  mainContentOrder?: readonly EditorMainId[]
  hiddenMainSections?: readonly EditorMainId[]
}

export function ClassicTemplate({
  resume,
  locale,
  dict,
  titleFontSize = 36,
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
}: ClassicTemplateProps) {
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
   * `mapEditorOrderToClassic` is the one rule that turns the editor's stored
   * main-content order into Classic's own sequence, and `docx-classic.ts`
   * applies it to the same stored lists — so the Preview and the export cannot
   * order or hide sections differently. Nothing here re-states the sequence.
   *
   * The hidden list is the editor's vocabulary, which is a subset of the
   * template's; widening it to `string` compares the two as the DOCX does
   * instead of asserting one is the other.
   */
  const hiddenIds: readonly string[] = hiddenMainSections
  const visibleSections = mapEditorOrderToClassic(mainContentOrder).filter(
    sectionId => !hiddenIds.includes(sectionId)
  )

  /**
   * One section of the document, by its id in Classic's and Minimal's shared
   * vocabulary. Returns null where the resume carries nothing for it, which is
   * the same emptiness test each block always applied.
   */
  const renderMainSection = (sectionId: ClassicMainId): ReactNode => {
    switch (sectionId) {
      // Summary
      case 'summary': {
        if (!resume.summary) return null
        return (
          <div>
            <h2 className={`mb-3 border-b border-slate-400 pb-1 ${fontFamily ? '' : 'font-serif'} font-bold uppercase text-slate-900`} style={{ position: 'relative', fontSize: `${drawnSectionTitleSize}px` }}>
              {dict.resumes?.editor?.sections?.summary || 'Professional Summary'}

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
            <div className="leading-relaxed text-slate-800 text-justify" style={{ fontSize: `${drawnSectionDescSize}px` }}>{renderFormattedText(resume.summary)}</div>
          </div>
        )
      }

      // Experience
      case 'experience': {
        if (experiences.length === 0) return null
        return (
          <div>
            <h2 className={`mb-3 border-b border-slate-400 pb-1 ${fontFamily ? '' : 'font-serif'} font-bold uppercase text-slate-900`} style={{ fontSize: `${drawnSectionTitleSize}px` }}>
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
                    <ul className="mt-2 list-inside list-disc space-y-1 text-slate-800" style={{ position: index === 0 ? 'relative' : undefined, fontSize: `${drawnSectionDescSize}px` }}>
                      {exp.achievements.map((achievement, i) => (
                        <li key={i}>{renderFormattedText(achievement)}</li>
                      ))}

                      {/* Description Font Size Slider - on first experience */}
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
                    <div className="mt-2 leading-relaxed text-slate-800 text-justify" style={{ position: index === 0 ? 'relative' : undefined, fontSize: `${drawnSectionDescSize}px` }}>
                      {renderFormattedText(exp.description)}

                      {/* Description Font Size Slider - on first experience */}
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

      // Education
      case 'education': {
        if (education.length === 0) return null
        return (
          <div>
            <h2 className={`mb-3 border-b border-slate-400 pb-1 ${fontFamily ? '' : 'font-serif'} font-bold uppercase text-slate-900`} style={{ fontSize: `${drawnSectionTitleSize}px` }}>
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
                  <p className="italic text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                    {edu.school}
                    {edu.field && ` - ${edu.field}`}
                  </p>
                  {edu.gpa && (
                    <p className="text-slate-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      GPA: <span className="font-semibold">{edu.gpa}</span>
                    </p>
                  )}
                  {edu.description && (
                    <div className="mt-1 text-slate-800" style={{ fontSize: `${drawnSectionDescSize}px` }}>{renderFormattedText(edu.description)}</div>
                  )}
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
            <h2 className={`mb-3 border-b border-slate-400 pb-1 ${fontFamily ? '' : 'font-serif'} font-bold uppercase text-slate-900`} style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              {dict.resumes?.editor?.sections?.skills || 'Skills'}
            </h2>
            <div className="space-y-2">
              {skills.map((skillCategory, index) => (
                <div key={index}>
                  <span className="font-bold text-slate-900">{skillCategory.category}: </span>
                  <span className="text-slate-800" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                    {skillCategory.skillsHtml
                      ? renderFormattedText(skillCategory.skillsHtml)
                      : skillCategory.items.join(', ')}
                  </span>
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
            <h2 className={`mb-3 border-b border-slate-400 pb-1 ${fontFamily ? '' : 'font-serif'} font-bold uppercase text-slate-900`} style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              {dict.resumes?.editor?.sections?.projects || 'Projects'}
            </h2>
            <div className="space-y-3">
              {projects.map((project, index) => (
                <div key={index}>
                  <h3 className="font-bold text-slate-900">{project.name}</h3>
                  {project.description && (
                    <div className="mt-1 text-slate-800" style={{ fontSize: `${drawnSectionDescSize}px` }}>{renderFormattedText(project.description)}</div>
                  )}
                  {project.technologies && project.technologies.length > 0 && (
                    <p className="mt-1 text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      <span className="font-semibold">Technologies:</span>{' '}
                      {project.technologies.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      }

      // Two-column layout for Languages and Certifications
      case 'languagesAndCerts': {
        if (languages.length === 0 && certifications.length === 0) return null
        return (
          <div className="grid grid-cols-2 gap-6">
            {/* Languages */}
            {languages.length > 0 && (
              <div>
                <h2 className={`mb-3 border-b border-slate-400 pb-1 ${fontFamily ? '' : 'font-serif'} font-bold uppercase text-slate-900`} style={{ fontSize: `${drawnSectionTitleSize}px` }}>
                  {dict.resumes?.editor?.sections?.languages || 'Languages'}
                </h2>
                <div className="space-y-1">
                  {languages.map((lang, index) => (
                    <div key={index} className="flex justify-between" style={{ fontSize: `${drawnSectionDescSize}px` }}>
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
                <h2 className={`mb-3 border-b border-slate-400 pb-1 ${fontFamily ? '' : 'font-serif'} font-bold uppercase text-slate-900`} style={{ fontSize: `${drawnSectionTitleSize}px` }}>
                  {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
                </h2>
                <div className="space-y-2">
                  {certifications.map((cert, index) => (
                    <div key={index}>
                      <h3 className="font-bold text-slate-900" style={{ fontSize: `${drawnSectionDescSize}px` }}>{cert.name}</h3>
                      <p className="text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>{cert.issuer}</p>
                      {cert.date && (
                        <p className="italic text-slate-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>
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

  /**
   * Classic's title and section headings are serif, its body the app's Inter,
   * and that is its identity while no font is chosen (Part 3 US-012). A chosen
   * font replaces BOTH: it is set on the document root, which the body
   * inherits, and the serif class is withdrawn below so the headings inherit it
   * too — a class on the heading would otherwise beat an inherited family and
   * leave the document in two fonts. `docx-classic.ts` writes the same two
   * families.
   *
   * The condition is written out at each heading rather than hoisted into a
   * variable because `resume-palette.test.ts` scans these class lists for the
   * colours this template draws, and fails closed on a class list built from a
   * variable: it can read a conditional, not an identifier.
   */
  return (
    <div data-testid="resume-document" className="mx-auto bg-white shadow-lg print:shadow-none" style={{ width: PAGE_WIDTH_CSS, fontFamily: fontFamily }}>
      <div className="space-y-5 p-12 print:p-8">
        {/* Header: CV Title */}
        <div className="border-b-2 border-slate-900 pb-4 text-center" style={{ position: 'relative' }}>
          <h1 className={`mb-3 ${fontFamily ? '' : 'font-serif'} font-bold uppercase tracking-wide text-slate-900`} style={{ fontSize: `${drawnTitleSize}px` }}>
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
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-slate-700" style={{ position: 'relative', fontSize: `${drawnContactSize}px` }}>
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
          {(contact.linkedin || contact.github || contact.website) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 text-slate-600" style={{ fontSize: `${drawnContactSize}px` }}>
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

        {visibleSections.map((sectionId) => (
          <Fragment key={sectionId}>{renderMainSection(sectionId)}</Fragment>
        ))}
      </div>
    </div>
  )
}
