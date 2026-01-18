'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type {
  Resume,
  ResumeContact,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
  ResumeCertification,
  ResumeLanguage,
} from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { renderFormattedText } from '@/lib/format-text'

type SidebarSectionId = 'keyAchievements' | 'skills' | 'languages' | 'training'
type MainContentSectionId = 'summary' | 'experience' | 'education'

interface ProfessionalTemplateProps {
  resume: Resume
  locale: Locale
  dict: any
  sidebarColor?: string
  fontScale?: number
  fontFamily?: string
  sidebarOrder?: SidebarSectionId[]
  mainContentOrder?: MainContentSectionId[]
  sidebarTopMargin?: number
  setSidebarTopMargin?: (margin: number) => void
  mainContentTopMargin?: number
  setMainContentTopMargin?: (margin: number) => void
  sidebarWidth?: number
  setSidebarWidth?: (width: number) => void
  hiddenSidebarSections?: SidebarSectionId[]
  hiddenMainSections?: MainContentSectionId[]
}

// Fixed font sizes based on professional CV standards
const BASE_FONT_SIZE = 11 // Body text baseline (×1.0)
const NAME_FONT_SIZE = 22 // Candidate name (×2.0)
const PROFESSIONAL_TITLE_FONT_SIZE = 22 // Professional title (×2.0) - UPDATED
const SECTION_TITLE_FONT_SIZE = 14.5 // Section titles (×1.35)
const RESUME_SECTION_TITLE_FONT_SIZE = 14 // Résumé section title only - UPDATED
const JOB_TITLE_FONT_SIZE = 13 // Job/role titles (×1.2)
const BODY_FONT_SIZE = 11 // Body text, descriptions (×1.0)
const META_FONT_SIZE = 11 // Dates, companies, metadata (×1.0) - UPDATED
const SKILL_CATEGORY_FONT_SIZE = 13 // Skill category names - UPDATED
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
  sidebarColor: sidebarColorProp,
  fontScale = 1,
  fontFamily = "Arial, Helvetica, sans-serif",
  sidebarOrder = ['keyAchievements', 'skills', 'languages', 'training'],
  mainContentOrder = ['summary', 'experience', 'education'],
  sidebarTopMargin = 64,
  setSidebarTopMargin,
  mainContentTopMargin = 24,
  setMainContentTopMargin,
  sidebarWidth = 30,
  setSidebarWidth,
  hiddenSidebarSections = [],
  hiddenMainSections = [],
}: ProfessionalTemplateProps) {
  const contact = (resume.contact as unknown as ResumeContact) || {}
  // Filter to show only visible items
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter(exp => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter(edu => edu.visible !== false)
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).filter(skill => skill.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).filter(cert => cert.visible !== false)
  const projects = ((resume.projects as unknown as any[]) || []).filter(project => project.visible !== false)
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter(lang => lang.visible !== false)

  // Key Achievements - Use projects data (renamed from Projects section)
  const keyAchievements = projects.map(project => ({
    title: project.name || '',
    description: project.description || ''
  }))

  // Use prop or default sidebar color
  const activeSidebarColor = sidebarColorProp || SIDEBAR_COLOR

  // Drag state for sidebar line
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false)
  const sidebarDragStartY = useRef<number>(0)
  const sidebarDragStartMargin = useRef<number>(sidebarTopMargin)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    if (!setSidebarTopMargin) return
    e.preventDefault()
    setIsDraggingSidebar(true)
    sidebarDragStartY.current = e.clientY
    sidebarDragStartMargin.current = sidebarTopMargin
  }, [sidebarTopMargin, setSidebarTopMargin])

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSidebar || !setSidebarTopMargin) return
    const deltaY = e.clientY - sidebarDragStartY.current
    const newMargin = Math.max(24, Math.min(200, sidebarDragStartMargin.current + deltaY))
    setSidebarTopMargin(newMargin)
  }, [isDraggingSidebar, setSidebarTopMargin])

  const handleSidebarMouseUp = useCallback(() => {
    setIsDraggingSidebar(false)
  }, [])

  // Drag state for main content line
  const [isDraggingMain, setIsDraggingMain] = useState(false)
  const mainDragStartY = useRef<number>(0)
  const mainDragStartMargin = useRef<number>(mainContentTopMargin)

  const handleMainMouseDown = useCallback((e: React.MouseEvent) => {
    if (!setMainContentTopMargin) return
    e.preventDefault()
    setIsDraggingMain(true)
    mainDragStartY.current = e.clientY
    mainDragStartMargin.current = mainContentTopMargin
  }, [mainContentTopMargin, setMainContentTopMargin])

  const handleMainMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingMain || !setMainContentTopMargin) return
    const deltaY = e.clientY - mainDragStartY.current
    const newMargin = Math.max(-20, Math.min(80, mainDragStartMargin.current + deltaY))
    setMainContentTopMargin(newMargin)
  }, [isDraggingMain, setMainContentTopMargin])

  const handleMainMouseUp = useCallback(() => {
    setIsDraggingMain(false)
  }, [])

  // Add global mouse event listeners when dragging sidebar
  useEffect(() => {
    if (isDraggingSidebar) {
      window.addEventListener('mousemove', handleSidebarMouseMove)
      window.addEventListener('mouseup', handleSidebarMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleSidebarMouseMove)
        window.removeEventListener('mouseup', handleSidebarMouseUp)
      }
    }
  }, [isDraggingSidebar, handleSidebarMouseMove, handleSidebarMouseUp])

  // Add global mouse event listeners when dragging main content
  useEffect(() => {
    if (isDraggingMain) {
      window.addEventListener('mousemove', handleMainMouseMove)
      window.addEventListener('mouseup', handleMainMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMainMouseMove)
        window.removeEventListener('mouseup', handleMainMouseUp)
      }
    }
  }, [isDraggingMain, handleMainMouseMove, handleMainMouseUp])

  // Drag state for sidebar width (horizontal)
  const [isDraggingSidebarWidth, setIsDraggingSidebarWidth] = useState(false)
  const sidebarWidthDragStartX = useRef<number>(0)
  const sidebarWidthDragStartWidth = useRef<number>(sidebarWidth)

  const handleSidebarWidthMouseDown = useCallback((e: React.MouseEvent) => {
    if (!setSidebarWidth) return
    e.preventDefault()
    setIsDraggingSidebarWidth(true)
    sidebarWidthDragStartX.current = e.clientX
    sidebarWidthDragStartWidth.current = sidebarWidth
  }, [sidebarWidth, setSidebarWidth])

  const handleSidebarWidthMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSidebarWidth || !setSidebarWidth) return
    const deltaX = e.clientX - sidebarWidthDragStartX.current
    // Convert pixel delta to percentage (816px is the template width)
    const deltaPercent = (deltaX / 816) * 100
    const newWidth = Math.max(20, Math.min(45, sidebarWidthDragStartWidth.current + deltaPercent))
    setSidebarWidth(newWidth)
  }, [isDraggingSidebarWidth, setSidebarWidth])

  const handleSidebarWidthMouseUp = useCallback(() => {
    setIsDraggingSidebarWidth(false)
  }, [])

  // Add global mouse event listeners when dragging sidebar width
  useEffect(() => {
    if (isDraggingSidebarWidth) {
      window.addEventListener('mousemove', handleSidebarWidthMouseMove)
      window.addEventListener('mouseup', handleSidebarWidthMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleSidebarWidthMouseMove)
        window.removeEventListener('mouseup', handleSidebarWidthMouseUp)
      }
    }
  }, [isDraggingSidebarWidth, handleSidebarWidthMouseMove, handleSidebarWidthMouseUp])

  // Scale font sizes proportionally
  const scaledNameFontSize = NAME_FONT_SIZE * fontScale
  const scaledProfessionalTitleFontSize = PROFESSIONAL_TITLE_FONT_SIZE * fontScale
  const scaledSectionTitleFontSize = SECTION_TITLE_FONT_SIZE * fontScale
  const scaledResumeSectionTitleFontSize = RESUME_SECTION_TITLE_FONT_SIZE * fontScale
  const scaledJobTitleFontSize = JOB_TITLE_FONT_SIZE * fontScale
  const scaledBodyFontSize = BODY_FONT_SIZE * fontScale
  const scaledMetaFontSize = META_FONT_SIZE * fontScale
  const scaledSkillCategoryFontSize = SKILL_CATEGORY_FONT_SIZE * fontScale
  const scaledContactFontSize = CONTACT_FONT_SIZE * fontScale

  return (
    <div
      className="professional-template mx-auto shadow-lg print:shadow-none print:bg-transparent"
      style={{
        width: '816px',
        minHeight: '1056px',
        position: 'relative',
        backgroundColor: 'white',
        fontFamily: fontFamily
      }}
    >
      {/* Sidebar - Full height from top to bottom */}
      <div
        ref={sidebarRef}
        className="p-6 text-white print:p-5"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: `${sidebarWidth}%`,
          backgroundColor: activeSidebarColor
        }}
      >
        {/* Left/Right drag arrows for sidebar width - positioned at right edge, only show in edit mode */}
        {setSidebarWidth && (
          <span
            className="absolute flex flex-row print:hidden cursor-ew-resize select-none"
            style={{
              right: '0px',
              top: '50%',
              transform: 'translate(50%, -50%)'
            }}
            onMouseDown={handleSidebarWidthMouseDown}
          >
            <ChevronLeft size={16} className="text-gray-500" />
            <ChevronRight size={16} className="text-gray-500" />
          </span>
        )}
          {/* CONTACT NAME SECTION */}
          <div style={{ marginBottom: `${sidebarTopMargin}px` }}>
            {/* Contact Name - Candidate Name */}
            <p
              className="font-semibold"
              style={{ fontSize: `${scaledNameFontSize}px`, lineHeight: HEADING_LINE_HEIGHT, textAlign: 'justify' }}
            >
              {contact.name || 'Your Name'}
            </p>
          </div>

          {/* SIDEBAR SECTIONS - Rendered in dynamic order */}
          {(() => {
            // Determine which section is actually first (has data to render)
            const visibleSections = sidebarOrder.filter(sectionId => !hiddenSidebarSections.includes(sectionId))
            const firstRenderedSidebarSection = visibleSections.find(sectionId => {
              if (sectionId === 'keyAchievements') return keyAchievements.length > 0
              if (sectionId === 'skills') return skills.filter(s => s.category && s.items && s.items.length > 0).length > 0
              if (sectionId === 'languages') return languages.length > 0
              if (sectionId === 'training') return certifications.length > 0
              return false
            })

            return visibleSections.map((sectionId, orderIndex, filteredOrder) => {
            const isLastSection = orderIndex === filteredOrder.length - 1

            // Check if this is the first actually rendered section (for chevron placement)
            const isFirstSection = sectionId === firstRenderedSidebarSection

            if (sectionId === 'keyAchievements' && keyAchievements.length > 0) {
              return (
                <div key={sectionId} className={isLastSection ? '' : 'mb-8'}>
                  <h2 className="relative mb-4 pb-1 border-b border-white font-bold tracking-wide capitalize" style={{ fontSize: `${scaledSectionTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                    {dict.resumes.template.keyAchievements}
                    {/* Up/Down reorder arrows - only on first visible section */}
                    {isFirstSection && setSidebarTopMargin && (
                      <span
                        className="absolute flex flex-col print:hidden cursor-ns-resize select-none"
                        style={{
                          left: '-20px',
                          bottom: '0px',
                          transform: 'translateY(50%)'
                        }}
                        onMouseDown={handleSidebarMouseDown}
                      >
                        <ChevronUp size={12} className="text-white/80" />
                        <ChevronDown size={12} className="text-white/80" />
                      </span>
                    )}
                  </h2>
                  <div className="space-y-4">
                    {keyAchievements.map((achievement, index) => (
                      <div key={index}>
                        <h3 className="mb-1 font-bold" style={{ fontSize: `${scaledJobTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                          {achievement.title}
                        </h3>
                        {achievement.description && (
                          <div className="opacity-80" style={{ fontSize: `${scaledBodyFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}>
                            {renderFormattedText(achievement.description)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            }

            if (sectionId === 'skills' && skills.filter(s => s.category && s.items && s.items.length > 0).length > 0) {
              return (
                <div key={sectionId} className={isLastSection ? '' : 'mb-8'}>
                  <h2 className="relative mb-4 pb-1 border-b border-white font-bold tracking-wide capitalize" style={{ fontSize: `${scaledSectionTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                    {dict.resumes.template.skills}
                    {/* Up/Down reorder arrows - only on first visible section */}
                    {isFirstSection && setSidebarTopMargin && (
                      <span
                        className="absolute flex flex-col print:hidden cursor-ns-resize select-none"
                        style={{
                          left: '-20px',
                          bottom: '0px',
                          transform: 'translateY(50%)'
                        }}
                        onMouseDown={handleSidebarMouseDown}
                      >
                        <ChevronUp size={12} className="text-white/80" />
                        <ChevronDown size={12} className="text-white/80" />
                      </span>
                    )}
                  </h2>
                  <div>
                    {skills
                      .filter(skillCategory =>
                        skillCategory.category &&
                        (skillCategory.skillsHtml || (skillCategory.items && skillCategory.items.length > 0))
                      )
                      .map((skillCategory, index) => (
                        <div key={index} className="mb-3">
                          <p className="mb-1 font-semibold" style={{ fontSize: `${scaledSkillCategoryFontSize}px`, lineHeight: BODY_LINE_HEIGHT, textAlign: 'left' }}>
                            {skillCategory.category}:
                          </p>
                          <div className="opacity-80" style={{ fontSize: `${scaledBodyFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}>
                            {skillCategory.skillsHtml
                              ? renderFormattedText(skillCategory.skillsHtml)
                              : <span style={{ textAlign: 'justify' }}>{skillCategory.items.join(' • ')}</span>
                            }
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )
            }

            if (sectionId === 'languages' && languages.length > 0) {
              return (
                <div key={sectionId} className={isLastSection ? '' : 'mb-8'}>
                  <h2 className="relative mb-4 pb-1 border-b border-white font-bold tracking-wide capitalize" style={{ fontSize: `${scaledSectionTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                    {dict.resumes.template.languages}
                    {/* Up/Down reorder arrows - only on first visible section */}
                    {isFirstSection && setSidebarTopMargin && (
                      <span
                        className="absolute flex flex-col print:hidden cursor-ns-resize select-none"
                        style={{
                          left: '-20px',
                          bottom: '0px',
                          transform: 'translateY(50%)'
                        }}
                        onMouseDown={handleSidebarMouseDown}
                      >
                        <ChevronUp size={12} className="text-white/80" />
                        <ChevronDown size={12} className="text-white/80" />
                      </span>
                    )}
                  </h2>
                  <div className="space-y-2">
                    {languages.map((lang, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="font-medium" style={{ fontSize: `${scaledBodyFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}>
                          {lang.language}
                        </span>
                        <span className="opacity-80" style={{ fontSize: `${scaledBodyFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}>
                          {dict.resumes?.levels?.[lang.level] || lang.level}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }

            if (sectionId === 'training' && certifications.length > 0) {
              return (
                <div key={sectionId} className={isLastSection ? '' : 'mb-8'}>
                  <h2 className="relative mb-4 pb-1 border-b border-white font-bold tracking-wide capitalize" style={{ fontSize: `${scaledSectionTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT }}>
                    {dict.resumes.template.training}
                    {/* Up/Down reorder arrows - only on first visible section */}
                    {isFirstSection && setSidebarTopMargin && (
                      <span
                        className="absolute flex flex-col print:hidden cursor-ns-resize select-none"
                        style={{
                          left: '-20px',
                          bottom: '0px',
                          transform: 'translateY(50%)'
                        }}
                        onMouseDown={handleSidebarMouseDown}
                      >
                        <ChevronUp size={12} className="text-white/80" />
                        <ChevronDown size={12} className="text-white/80" />
                      </span>
                    )}
                  </h2>
                  <div className="space-y-4">
                    {certifications.slice(0, 3).map((cert, index) => (
                      <div key={index}>
                        <h3 className="mb-1 font-bold" style={{ fontSize: `${scaledJobTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT, textAlign: 'justify' }}>
                          {cert.name}
                        </h3>
                        <p style={{ fontSize: `${scaledMetaFontSize}px`, lineHeight: BODY_LINE_HEIGHT, textAlign: 'justify' }}>{cert.issuer}</p>
                        {cert.date && (
                          <p style={{ fontSize: `${scaledMetaFontSize}px`, lineHeight: BODY_LINE_HEIGHT, textAlign: 'justify' }}>
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
              )
            }

            return null
            })
          })()}
        </div>

      {/* Main Content - Positioned to the right of sidebar */}
      <div
        className="p-8 print:p-6"
        style={{
          marginLeft: `${sidebarWidth}%`,
          position: 'relative',
          zIndex: 1
        }}
      >
          {/* HEADER: Professional Title and Contact Info */}
          <div className="pb-6" style={{ marginBottom: `${mainContentTopMargin}px` }}>
            <h1 className="font-bold tracking-tight" style={{ color: 'oklch(0.2 0 0)', fontSize: `${scaledProfessionalTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT, marginBottom: `${TITLE_GAP}px` }}>
              {resume.title || 'PROFESSIONAL TITLE'}
            </h1>

            {/* Contact Information */}
            <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'oklch(0.4 0 0)', fontSize: `${scaledContactFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}>
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

          {/* MAIN CONTENT SECTIONS - Rendered in dynamic order */}
          {(() => {
            // Determine which section is actually first (has data to render)
            const visibleMainSections = mainContentOrder.filter(sectionId => !hiddenMainSections.includes(sectionId))
            const firstRenderedMainSection = visibleMainSections.find(sectionId => {
              if (sectionId === 'summary') return !!resume.summary
              if (sectionId === 'experience') return experiences.length > 0
              if (sectionId === 'education') return education.length > 0
              return false
            })

            return visibleMainSections.map((sectionId, orderIndex, filteredOrder) => {
            const isLastSection = orderIndex === filteredOrder.length - 1

            // Check if this is the first actually rendered section (for chevron placement)
            const isFirstSection = sectionId === firstRenderedMainSection

            if (sectionId === 'summary' && resume.summary) {
              return (
                <div key={sectionId} className={isLastSection ? '' : 'mb-8'}>
                  <h2
                    className="relative font-bold tracking-wide pb-1 border-b capitalize"
                    style={{ color: 'oklch(0.2 0 0)', borderColor: 'oklch(0.2 0 0)', fontSize: `${scaledResumeSectionTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT, marginBottom: `${SECTION_GAP}px` }}
                  >
                    {dict.resumes.template.summary}
                    {/* Up/Down reorder arrows - only on first visible section */}
                    {isFirstSection && setMainContentTopMargin && (
                      <span
                        className="absolute flex flex-col print:hidden cursor-ns-resize select-none"
                        style={{
                          left: '-20px',
                          bottom: '0px',
                          transform: 'translateY(50%)'
                        }}
                        onMouseDown={handleMainMouseDown}
                      >
                        <ChevronUp size={12} className="text-gray-500" />
                        <ChevronDown size={12} className="text-gray-500" />
                      </span>
                    )}
                  </h2>
                  <div
                    className="text-justify"
                    style={{
                      fontSize: `${scaledBodyFontSize}px`,
                      color: 'oklch(0.3 0 0)',
                      lineHeight: BODY_LINE_HEIGHT
                    }}
                  >
                    {renderFormattedText(resume.summary)}
                  </div>
                </div>
              )
            }

            if (sectionId === 'experience' && experiences.length > 0) {
              return (
                <div key={sectionId} className={isLastSection ? '' : 'mb-8'}>
                  <h2
                    className="relative font-bold tracking-wide pb-1 border-b capitalize"
                    style={{ color: 'oklch(0.2 0 0)', borderColor: 'oklch(0.2 0 0)', fontSize: `${scaledSectionTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT, marginBottom: `${SECTION_GAP}px` }}
                  >
                    {dict.resumes.template.experience}
                    {/* Up/Down reorder arrows - only on first visible section */}
                    {isFirstSection && setMainContentTopMargin && (
                      <span
                        className="absolute flex flex-col print:hidden cursor-ns-resize select-none"
                        style={{
                          left: '-20px',
                          bottom: '0px',
                          transform: 'translateY(50%)'
                        }}
                        onMouseDown={handleMainMouseDown}
                      >
                        <ChevronUp size={12} className="text-gray-500" />
                        <ChevronDown size={12} className="text-gray-500" />
                      </span>
                    )}
                  </h2>
                  <div className="space-y-6">
                    {experiences.map((exp, index) => (
                      <div key={index}>
                        {/* Job Title + Dates */}
                        <div className="mb-1 flex items-start justify-between">
                          <h3
                            className="font-bold"
                            style={{ color: 'oklch(0.2 0 0)', fontSize: `${scaledJobTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT }}
                          >
                            {exp.position}
                          </h3>
                          <span
                            style={{ color: 'oklch(0.5 0 0)', fontSize: `${scaledMetaFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}
                          >
                            {formatDateRange(exp, locale, dict)}
                          </span>
                        </div>

                        {/* Company Name */}
                        <p
                          className="mb-2"
                          style={{ color: 'oklch(0.4 0 0)', fontSize: `${scaledMetaFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}
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
                                  fontSize: `${scaledBodyFontSize}px`,
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
                              fontSize: `${scaledBodyFontSize}px`,
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
              )
            }

            if (sectionId === 'education' && education.length > 0) {
              return (
                <div key={sectionId} className={isLastSection ? '' : 'mb-8'}>
                  <h2
                    className="relative font-bold tracking-wide pb-1 border-b capitalize"
                    style={{ color: 'oklch(0.2 0 0)', borderColor: 'oklch(0.2 0 0)', fontSize: `${scaledSectionTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT, marginBottom: `${SECTION_GAP}px` }}
                  >
                    {dict.resumes.template.education}
                    {/* Up/Down reorder arrows - only on first visible section */}
                    {isFirstSection && setMainContentTopMargin && (
                      <span
                        className="absolute flex flex-col print:hidden cursor-ns-resize select-none"
                        style={{
                          left: '-20px',
                          bottom: '0px',
                          transform: 'translateY(50%)'
                        }}
                        onMouseDown={handleMainMouseDown}
                      >
                        <ChevronUp size={12} className="text-gray-500" />
                        <ChevronDown size={12} className="text-gray-500" />
                      </span>
                    )}
                  </h2>
                  <div className="space-y-4">
                    {education.map((edu, index) => (
                      <div key={index}>
                        {/* Degree + Dates */}
                        <div className="mb-1 flex items-start justify-between">
                          <h3
                            className="font-bold"
                            style={{ color: 'oklch(0.2 0 0)', fontSize: `${scaledJobTitleFontSize}px`, lineHeight: HEADING_LINE_HEIGHT }}
                          >
                            {edu.degree}
                            {edu.field && ` ${dict.resumes.template.in} ${edu.field}`}
                          </h3>
                          <span
                            style={{ color: 'oklch(0.5 0 0)', fontSize: `${scaledMetaFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}
                          >
                            {formatEducationDates(edu, locale, dict)}
                          </span>
                        </div>

                        {/* University + Location */}
                        <div className="flex items-start justify-between">
                          <a
                            href="#"
                            className="font-medium hover:underline"
                            style={{ color: 'oklch(0.4 0 0)', fontSize: `${scaledMetaFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}
                          >
                            {edu.school}
                          </a>
                          {(edu as any).location && (
                            <span
                              style={{ color: 'oklch(0.5 0 0)', fontSize: `${scaledMetaFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}
                            >
                              {(edu as any).location}
                            </span>
                          )}
                        </div>

                        {/* GPA if available */}
                        {edu.gpa && (
                          <p
                            className="mt-1"
                            style={{ color: 'oklch(0.4 0 0)', fontSize: `${scaledMetaFontSize}px`, lineHeight: BODY_LINE_HEIGHT }}
                          >
                            {dict.resumes.template.gpa}: {edu.gpa}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            }

            return null
            })
          })()}
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
 * Extract list items from HTML and join them inline with bullet separators
 * Handles both HTML lists and plain text bullet points
 */
function renderInlineBullets(text: string | null | undefined): string {
  if (!text) return ''

  // Check if content is HTML
  const isHtml = /<[^>]+>/.test(text)

  if (isHtml) {
    // Extract text from <li> tags
    const liMatches = text.match(/<li[^>]*>(.*?)<\/li>/gi)
    if (liMatches && liMatches.length > 0) {
      const items = liMatches.map(li =>
        li.replace(/<li[^>]*>/gi, '').replace(/<\/li>/gi, '').replace(/<[^>]+>/g, '').trim()
      )
      return items.join(' • ')
    }
    // If no list items, strip all HTML tags
    return text.replace(/<[^>]+>/g, '').trim()
  }

  // Plain text - check for bullet points
  const lines = text.split('\n')
  const bulletItems = lines
    .filter(line => /^[\s]*[•\-*]\s+/.test(line))
    .map(line => line.replace(/^[\s]*[•\-*]\s+/, '').trim())

  if (bulletItems.length > 0) {
    return bulletItems.join(' • ')
  }

  // No bullets found, return as-is (single line)
  return text.replace(/\n/g, ' ').trim()
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
