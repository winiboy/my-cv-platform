import { Fragment, type ReactNode } from 'react'
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
import { renderFormattedText } from '@/lib/format-text'
import { PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import {
  assertExhaustiveSection,
  DEFAULT_CREATIVE_MAIN_ORDER,
  DEFAULT_CREATIVE_SIDEBAR_ORDER,
  DEFAULT_RESUME_LAYOUT,
  type CreativeMainId,
  type CreativeSidebarId,
} from '@/lib/layout-settings'

interface CreativeTemplateProps {
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
   * `docx-creative.ts` scales the same four sizes by the same number.
   */
  fontScale?: number
  /**
   * The font the owner CHOSE, or undefined when they chose none (Part 3
   * US-012). Creative declares no family of its own and so draws the app's
   * Inter until one is chosen; `resume-preview.tsx` applies
   * `chosenFontFamily` before passing it.
   */
  fontFamily?: string
  /**
   * Creative's own section vocabulary (Part 3 US-015), mapped from the editor's
   * by `mapEditorOrderToCreative`. Absent means "the template's own sequence",
   * which is what the shared default maps to, so a caller that passes nothing
   * renders what this template rendered before that story.
   */
  sidebarOrder?: readonly CreativeSidebarId[]
  mainContentOrder?: readonly CreativeMainId[]
  hiddenSidebarSections?: readonly CreativeSidebarId[]
  hiddenMainSections?: readonly CreativeMainId[]
  /** `summary` is fixed in the header and carries visibility only — see `CreativeHeaderId`. */
  summaryHidden?: boolean
}

export function CreativeTemplate({
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
  sidebarOrder = DEFAULT_CREATIVE_SIDEBAR_ORDER,
  mainContentOrder = DEFAULT_CREATIVE_MAIN_ORDER,
  hiddenSidebarSections = [],
  hiddenMainSections = [],
  summaryHidden = false
}: CreativeTemplateProps) {
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

  // Part 3 US-015: the sections each column draws, in the order the layout
  // model asks for. A section with no visible item still renders nothing — that
  // is each case below, unchanged — so the two filters answer only the question
  // the model owns.
  const visibleSidebarSections = sidebarOrder.filter((id) => !hiddenSidebarSections.includes(id))
  const visibleMainSections = mainContentOrder.filter((id) => !hiddenMainSections.includes(id))

  function renderSidebarSection(sectionId: CreativeSidebarId): ReactNode {
    switch (sectionId) {
      // --- SKILLS ---
      // Carries the section-title and section-description size inputs, which
      // the editor renders by passing the setters. They are anchored to this
      // section's first heading and first item, so they follow it when it moves
      // and are not drawn while it is hidden.
      case 'skills':
        return skills.length > 0 ? (
          <div>
            <h2 className="relative mb-4 flex items-center gap-2 font-black uppercase text-purple-600" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              <div className="h-6 w-1 bg-gradient-to-b from-purple-600 to-pink-500"></div>
              {dict.resumes?.editor?.sections?.skills || 'Skills'}

              {/* Section Title Font Size Slider */}
              {setSectionTitleFontSize && (
                <div
                  className="print:hidden flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-lg"
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: '0',
                    marginLeft: '48px',
                    whiteSpace: 'nowrap',
                    zIndex: 20
                  }}
                >
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    value={sectionTitleFontSize}
                    onChange={(e) => setSectionTitleFontSize(Number(e.target.value))}
                    className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                  <span className="text-xs text-slate-700 font-mono">
                    {sectionTitleFontSize}px
                  </span>
                </div>
              )}
            </h2>
            <div className="space-y-4">
              {skills.map((skillCategory, index) => (
                <div key={index} className="relative">
                  {/* Description Font Size Slider - only show on first item */}
                  {index === 0 && setSectionDescFontSize && (
                    <div
                      className="print:hidden flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-lg"
                      style={{
                        position: 'absolute',
                        left: '100%',
                        top: '0',
                        marginLeft: '48px',
                        whiteSpace: 'nowrap',
                        zIndex: 20
                      }}
                    >
                      <input
                        type="range"
                        min="10"
                        max="18"
                        step="1"
                        value={sectionDescFontSize}
                        onChange={(e) => setSectionDescFontSize(Number(e.target.value))}
                        className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                      />
                      <span className="text-xs text-slate-700 font-mono">
                        {sectionDescFontSize}px
                      </span>
                    </div>
                  )}

                  <h3 className="mb-2 font-bold text-slate-800" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                    {skillCategory.category}
                  </h3>
                  {skillCategory.skillsHtml ? (
                    <div className="text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      {renderFormattedText(skillCategory.skillsHtml)}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {skillCategory.items.map((skill, i) => (
                        <div key={i} className="text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                          • {skill}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null

      // --- LANGUAGES ---
      case 'languages':
        return languages.length > 0 ? (
          <div>
            <h2 className="mb-4 flex items-center gap-2 font-black uppercase text-purple-600" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              <div className="h-6 w-1 bg-gradient-to-b from-purple-600 to-pink-500"></div>
              {dict.resumes?.editor?.sections?.languages || 'Languages'}
            </h2>
            <div className="space-y-2">
              {languages.map((lang, index) => (
                <div key={index}>
                  <div className="mb-1 font-bold text-slate-800" style={{ fontSize: `${drawnSectionDescSize}px` }}>{lang.language}</div>
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
        ) : null

      // --- CERTIFICATIONS ---
      case 'certifications':
        return certifications.length > 0 ? (
          <div>
            <h2 className="mb-4 flex items-center gap-2 font-black uppercase text-purple-600" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              <div className="h-6 w-1 bg-gradient-to-b from-purple-600 to-pink-500"></div>
              {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
            </h2>
            <div className="space-y-3">
              {certifications.map((cert, index) => (
                <div key={index}>
                  <h3 className="font-bold text-slate-800" style={{ fontSize: `${drawnSectionDescSize}px` }}>{cert.name}</h3>
                  <p className="text-slate-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>{cert.issuer}</p>
                  {cert.date && (
                    <p className="text-slate-500" style={{ fontSize: `${drawnSectionDescSize}px` }}>
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
        ) : null

      default:
        assertExhaustiveSection(sectionId)
        return null
    }
  }

  function renderMainSection(sectionId: CreativeMainId): ReactNode {
    switch (sectionId) {
      // --- EXPERIENCE ---
      case 'experience':
        return experiences.length > 0 ? (
          <div>
            <h2 className="mb-5 flex items-center gap-2 font-black uppercase text-purple-600" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
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
                      <h3 className="font-bold text-slate-900" style={{ fontSize: `${drawnSectionDescSize}px` }}>{exp.position}</h3>
                      <p className="font-semibold text-purple-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>{exp.company}</p>
                    </div>
                    <div className="rounded-full bg-purple-100 px-3 py-1 font-semibold text-purple-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
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
                    <p className="mb-2 text-slate-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>{exp.location}</p>
                  )}

                  {exp.achievements && exp.achievements.length > 0 ? (
                    <ul className="space-y-1 text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      {exp.achievements.map((achievement, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-purple-500">▸</span>
                          <span>{renderFormattedText(achievement)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : exp.description ? (
                    <div className="mb-3 leading-relaxed text-slate-700 text-justify" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      {renderFormattedText(exp.description)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null

      // --- PROJECTS ---
      case 'projects':
        return projects.length > 0 ? (
          <div>
            <h2 className="mb-5 flex items-center gap-2 font-black uppercase text-purple-600" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              <div className="h-8 w-1.5 bg-gradient-to-b from-purple-600 to-pink-500"></div>
              {dict.resumes?.editor?.sections?.projects || 'Projects'}
            </h2>
            <div className="space-y-4">
              {projects.map((project, index) => (
                <div
                  key={index}
                  className="rounded-lg border-l-4 border-purple-500 bg-slate-50 p-4"
                >
                  <h3 className="mb-2 font-bold text-slate-900" style={{ fontSize: `${drawnSectionDescSize}px` }}>{project.name}</h3>
                  {project.description && (
                    <div className="mb-3 leading-relaxed text-slate-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      {renderFormattedText(project.description)}
                    </div>
                  )}
                  {project.technologies && project.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {project.technologies.map((tech, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 font-semibold text-white"
                          style={{ fontSize: `${drawnSectionDescSize}px` }}
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
        ) : null

      // --- EDUCATION ---
      case 'education':
        return education.length > 0 ? (
          <div>
            <h2 className="mb-5 flex items-center gap-2 font-black uppercase text-purple-600" style={{ fontSize: `${drawnSectionTitleSize}px` }}>
              <div className="h-8 w-1.5 bg-gradient-to-b from-purple-600 to-pink-500"></div>
              {dict.resumes?.editor?.sections?.education || 'Education'}
            </h2>
            <div className="space-y-4">
              {education.map((edu, index) => (
                <div key={index} className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900" style={{ fontSize: `${drawnSectionDescSize}px` }}>{edu.degree}</h3>
                    <p className="text-purple-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>
                      {edu.school}
                      {edu.field && ` - ${edu.field}`}
                    </p>
                    {edu.gpa && (
                      <p className="mt-1 text-slate-600" style={{ fontSize: `${drawnSectionDescSize}px` }}>GPA: {edu.gpa}</p>
                    )}
                  </div>
                  <div className="rounded-full bg-purple-100 px-3 py-1 font-semibold text-purple-700" style={{ fontSize: `${drawnSectionDescSize}px` }}>
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
        ) : null

      default:
        assertExhaustiveSection(sectionId)
        return null
    }
  }

  return (
    <div data-testid="resume-document" className="mx-auto bg-white shadow-lg print:shadow-none" style={{ width: PAGE_WIDTH_CSS, fontFamily: fontFamily }}>
      {/* Header with gradient background */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-10 text-white print:p-8" style={{ position: 'relative' }}>
        <div className="relative z-10">
          <h1 className="mb-3 font-black uppercase tracking-tight" style={{ fontSize: `${drawnTitleSize}px` }}>
            {resume.title || contact.name || 'Your Name'}
          </h1>

          {/* Font Size Slider - Positioned outside CV to the right */}
          {setTitleFontSize && (
            <div
              className="print:hidden flex items-center gap-2 bg-white/90 rounded-lg border border-white px-3 py-2 shadow-lg"
              style={{
                position: 'absolute',
                left: '100%',
                top: '40px',
                marginLeft: '48px',
                whiteSpace: 'nowrap',
                zIndex: 20
              }}
            >
              <input
                type="range"
                min="16"
                max="48"
                step="2"
                value={titleFontSize}
                onChange={(e) => setTitleFontSize(Number(e.target.value))}
                className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <span className="text-xs text-slate-700 font-mono">
                {titleFontSize}px
              </span>
            </div>
          )}

          {/* The summary is FIXED here (Part 3 US-015): the model can hide it,
              not move it. See `CreativeHeaderId` in src/lib/layout-settings.ts. */}
          {!summaryHidden && resume.summary && (
            <div className="mb-4 max-w-2xl text-base leading-relaxed text-white/90 text-justify">
              {renderFormattedText(resume.summary)}
            </div>
          )}
          <div className="relative flex flex-wrap gap-x-5 gap-y-2" style={{ fontSize: `${drawnContactSize}px` }}>
            {/* Contact Font Size Slider */}
            {setContactFontSize && (
              <div
                className="print:hidden flex items-center gap-2 bg-white/90 rounded-lg border border-white px-3 py-2 shadow-lg"
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: '0',
                  marginLeft: '48px',
                  whiteSpace: 'nowrap',
                  zIndex: 20
                }}
              >
                <input
                  type="range"
                  min="10"
                  max="18"
                  step="1"
                  value={contactFontSize}
                  onChange={(e) => setContactFontSize(Number(e.target.value))}
                  className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <span className="text-xs text-slate-700 font-mono">
                  {contactFontSize}px
                </span>
              </div>
            )}

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
            {visibleSidebarSections.map((sectionId) => (
              <Fragment key={sectionId}>{renderSidebarSection(sectionId)}</Fragment>
            ))}
          </div>

          {/* Right column - 2/3 */}
          <div className="col-span-2 space-y-6">
            {visibleMainSections.map((sectionId) => (
              <Fragment key={sectionId}>{renderMainSection(sectionId)}</Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
