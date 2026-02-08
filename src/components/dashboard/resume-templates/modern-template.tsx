'use client'

import React, { useRef, useCallback } from 'react'
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

export type ModernSidebarSectionId = 'contact' | 'education' | 'skills' | 'languages' | 'training'
export type ModernMainContentSectionId = 'summary' | 'experience'

const DEFAULT_SIDEBAR_ORDER: ModernSidebarSectionId[] = ['contact', 'education', 'skills', 'languages', 'training']
const DEFAULT_MAIN_ORDER: ModernMainContentSectionId[] = ['summary', 'experience']

const DEFAULT_SIDEBAR_COLOR = '#333333'
const DEFAULT_ACCENT_COLOR = '#D4A843'

/** Derive a lighter, more saturated accent color from the sidebar HSL color.
 *  Falls back to the default gold when no sidebarColor is provided or it cannot be parsed. */
function deriveAccentColor(sidebarColor: string | undefined): string {
  if (!sidebarColor) return DEFAULT_ACCENT_COLOR
  const match = sidebarColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
  if (!match) return DEFAULT_ACCENT_COLOR
  const h = parseInt(match[1], 10)
  const s = Math.min(parseInt(match[2], 10) + 20, 100)
  const l = Math.min(parseInt(match[3], 10) + 25, 65)
  return `hsl(${h}, ${s}%, ${l}%)`
}

/** Sidebar section header -- full-width accent-colored banner with white uppercase text */
function SidebarSectionHeader({ title, accentColor, fontScale = 1 }: { title: string; accentColor: string; fontScale?: number }) {
  return (
    <div
      style={{
        backgroundColor: accentColor,
        padding: '6px 12px',
        marginBottom: '12px',
        marginLeft: '-32px',
        marginRight: '-32px',
      }}
    >
      <h2
        style={{
          color: '#FFFFFF',
          fontSize: `${13 * fontScale}px`,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          margin: 0,
          lineHeight: 1.4,
        }}
      >
        {title}
      </h2>
    </div>
  )
}

/** Single contact item row: right-aligned text on the left, circular icon on the right */
function ContactItem({ label, value, accentColor, icon, fontScale = 1 }: { label: string; value: string; accentColor: string; icon: React.ReactNode; fontScale?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* Text block: label + value, both right-aligned, fills available space */}
      <div style={{ flex: 1, textAlign: 'right', minWidth: 0 }}>
        <p
          style={{
            fontSize: `${10 * fontScale}px`,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'rgba(255,255,255,0.6)',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: `${11 * fontScale}px`,
            color: '#FFFFFF',
            margin: 0,
            lineHeight: 1.4,
            wordBreak: 'break-all',
          }}
        >
          {value}
        </p>
      </div>
      {/* Circular icon badge */}
      <div
        style={{
          width: '32px',
          height: '32px',
          minWidth: '32px',
          borderRadius: '50%',
          backgroundColor: accentColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
    </div>
  )
}

/** Main area section header -- uppercase dark text with accent-colored horizontal rule below */
function MainSectionHeader({ title, accentColor, fontScale = 1, children }: { title: string; accentColor: string; fontScale?: number; children?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '12px', position: 'relative' }}>
      <h2
        style={{
          color: '#1a1a1a',
          fontSize: `${16 * fontScale}px`,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          margin: 0,
          paddingBottom: '6px',
          lineHeight: 1.4,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          height: '2px',
          backgroundColor: accentColor,
        }}
      />
      {children}
    </div>
  )
}

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
  sidebarOrder?: ModernSidebarSectionId[]
  mainContentOrder?: ModernMainContentSectionId[]
  hiddenSidebarSections?: ModernSidebarSectionId[]
  hiddenMainSections?: ModernMainContentSectionId[]
  sidebarWidth?: number
  setSidebarWidth?: (width: number) => void
  sidebarTopMargin?: number
  setSidebarTopMargin?: (margin: number) => void
  mainContentTopMargin?: number
  setMainContentTopMargin?: (margin: number) => void
  fontScale?: number
  fontFamily?: string
  photoUrl?: string
  onPhotoChange?: (dataUrl: string) => void
}

export function ModernTemplate({ resume, locale, dict, sidebarColor, titleFontSize = 36, setTitleFontSize, sectionTitleFontSize = 16, setSectionTitleFontSize, sectionDescFontSize = 14, setSectionDescFontSize, sidebarOrder, mainContentOrder, hiddenSidebarSections, hiddenMainSections, sidebarWidth, setSidebarWidth, sidebarTopMargin, setSidebarTopMargin, mainContentTopMargin, setMainContentTopMargin, fontScale, fontFamily, photoUrl, onPhotoChange }: ModernTemplateProps) {
  const contact = (resume.contact as unknown as ResumeContact) || {}
  // Filter to show only visible items
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter(exp => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter(edu => edu.visible !== false)
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).filter(skill => skill.visible !== false)
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter(lang => lang.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).filter(cert => cert.visible !== false)
  const projects = ((resume.projects as unknown as ResumeProject[]) || []).filter(proj => proj.visible !== false)

  const activeSidebarColor = sidebarColor || DEFAULT_SIDEBAR_COLOR
  const accentColor = deriveAccentColor(sidebarColor)
  const activeWidth = sidebarWidth ?? 35
  const activeSidebarTopMargin = sidebarTopMargin ?? 0
  const activeMainContentTopMargin = mainContentTopMargin ?? 0
  const activeScale = fontScale ?? 1

  const activeSidebarOrder = sidebarOrder || DEFAULT_SIDEBAR_ORDER
  const activeMainOrder = mainContentOrder || DEFAULT_MAIN_ORDER
  const hiddenSidebar = new Set(hiddenSidebarSections || [])
  const hiddenMain = new Set(hiddenMainSections || [])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reject files over 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      onPhotoChange?.(dataUrl)
    }
    reader.readAsDataURL(file)

    // Reset input so same file can be re-selected
    e.target.value = ''
  }, [onPhotoChange])

  /** Render a single sidebar section by its identifier; returns null if section has no data */
  const renderSidebarSection = (id: ModernSidebarSectionId): React.ReactNode => {
    switch (id) {
      case 'contact': {
        const hasContactData = contact.phone || contact.email || contact.website || contact.linkedin || contact.github || contact.location
        if (!hasContactData) return null
        return (
          <div className="mb-8">
            <SidebarSectionHeader title={dict.resumes?.editor?.sections?.contact || 'Contact'} accentColor={accentColor} fontScale={activeScale} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contact.phone && (
                <ContactItem
                  label="Phone"
                  value={contact.phone}
                  accentColor={accentColor}
                  fontScale={activeScale}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                    </svg>
                  }
                />
              )}
              {contact.email && (
                <ContactItem
                  label="Email"
                  value={contact.email}
                  accentColor={accentColor}
                  fontScale={activeScale}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 4L12 13 2 4" />
                    </svg>
                  }
                />
              )}
              {contact.website && (
                <ContactItem
                  label="Website"
                  value={contact.website}
                  accentColor={accentColor}
                  fontScale={activeScale}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20" />
                      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
                    </svg>
                  }
                />
              )}
              {contact.linkedin && (
                <ContactItem
                  label="LinkedIn"
                  value={contact.linkedin}
                  accentColor={accentColor}
                  fontScale={activeScale}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" />
                      <rect x="2" y="9" width="4" height="12" />
                      <circle cx="4" cy="4" r="2" />
                    </svg>
                  }
                />
              )}
              {contact.github && (
                <ContactItem
                  label="GitHub"
                  value={contact.github}
                  accentColor={accentColor}
                  fontScale={activeScale}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none" aria-hidden="true">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                  }
                />
              )}
              {contact.location && (
                <ContactItem
                  label="Location"
                  value={contact.location}
                  accentColor={accentColor}
                  fontScale={activeScale}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  }
                />
              )}
            </div>
          </div>
        )
      }
      case 'education': {
        if (education.length === 0) return null
        return (
          <div className="mb-8">
            <SidebarSectionHeader title={dict.resumes?.editor?.sections?.education || 'Education'} accentColor={accentColor} fontScale={activeScale} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {education.map((edu, index) => (
                <div key={index}>
                  <p
                    style={{
                      fontSize: `${12 * activeScale}px`,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: '#FFFFFF',
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {edu.degree}
                    {edu.field ? ` - ${edu.field}` : ''}
                  </p>
                  <p
                    style={{
                      fontSize: `${11 * activeScale}px`,
                      color: 'rgba(255,255,255,0.8)',
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {edu.school}
                    {edu.endDate
                      ? ` | ${new Date(edu.endDate + '-01').toLocaleDateString(locale, { year: 'numeric' })}`
                      : edu.startDate
                        ? ` | ${new Date(edu.startDate + '-01').toLocaleDateString(locale, { year: 'numeric' })}`
                        : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )
      }
      case 'skills': {
        if (skills.length === 0) return null
        return (
          <div className="mb-8">
            <SidebarSectionHeader title={dict.resumes?.editor?.sections?.skills || 'Technical Skills'} accentColor={accentColor} fontScale={activeScale} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {skills.map((skillCategory, index) => (
                <div key={index}>
                  {skillCategory.category && (
                    <p
                      style={{
                        fontSize: `${12 * activeScale}px`,
                        fontWeight: 700,
                        color: '#FFFFFF',
                        margin: '0 0 8px 0',
                        lineHeight: 1.4,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {skillCategory.category}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {skillCategory.items.map((skill, i) => {
                      const skillName = typeof skill === 'string' ? skill : String(skill)
                      const level = 70
                      return (
                        <div key={i}>
                          <p
                            style={{
                              fontSize: `${11 * activeScale}px`,
                              color: '#FFFFFF',
                              margin: '0 0 3px 0',
                              lineHeight: 1.4,
                            }}
                          >
                            {skillName}
                          </p>
                          <div
                            style={{
                              width: '100%',
                              height: '6px',
                              backgroundColor: 'rgba(255,255,255,0.2)',
                              borderRadius: '3px',
                            }}
                          >
                            <div
                              style={{
                                width: `${level}%`,
                                height: '100%',
                                backgroundColor: accentColor,
                                borderRadius: '3px',
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }
      case 'languages': {
        if (languages.length === 0) return null
        return (
          <div style={{ marginBottom: '24px' }}>
            <SidebarSectionHeader title={dict.resumes?.editor?.sections?.languages || 'Languages'} accentColor={accentColor} fontScale={activeScale} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {languages.map((lang, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: `${12 * activeScale}px`,
                      fontWeight: 700,
                      color: '#FFFFFF',
                      lineHeight: 1.4,
                    }}
                  >
                    {lang.language}
                  </span>
                  <span
                    style={{
                      fontSize: `${11 * activeScale}px`,
                      color: 'rgba(255,255,255,0.7)',
                      lineHeight: 1.4,
                    }}
                  >
                    {dict.resumes?.editor?.levels?.[lang.level.toLowerCase()] || lang.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      }
      case 'training': {
        if (certifications.length === 0) return null
        return (
          <div className="mb-8">
            <SidebarSectionHeader title={dict.resumes?.editor?.sections?.certifications || 'Training'} accentColor={accentColor} fontScale={activeScale} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {certifications.map((cert, index) => (
                <div key={index}>
                  <p
                    style={{
                      fontSize: `${12 * activeScale}px`,
                      fontWeight: 700,
                      color: '#FFFFFF',
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {cert.name}
                  </p>
                  {cert.issuer && (
                    <p
                      style={{
                        fontSize: `${11 * activeScale}px`,
                        color: 'rgba(255,255,255,0.7)',
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {cert.issuer}
                    </p>
                  )}
                  {cert.date && (
                    <p
                      style={{
                        fontSize: `${10 * activeScale}px`,
                        color: 'rgba(255,255,255,0.6)',
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
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
        )
      }
      default:
        return null
    }
  }

  /** Render a single main content section by its identifier; returns null if section has no data */
  const renderMainSection = (id: ModernMainContentSectionId): React.ReactNode => {
    switch (id) {
      case 'summary': {
        if (!resume.summary) return null
        return (
          <div className="mb-6">
            <MainSectionHeader title={dict.resumes?.editor?.sections?.summary || 'Professional Profile'} accentColor={accentColor} fontScale={activeScale} />
            <div
              className="leading-relaxed text-slate-700 text-justify"
              style={{ fontSize: `${sectionDescFontSize * activeScale}px`, lineHeight: 1.5 }}
            >
              {formatText(resume.summary)}
            </div>
          </div>
        )
      }
      case 'experience': {
        if (experiences.length === 0) return null
        return (
          <div className="mb-6">
            <MainSectionHeader title={dict.resumes?.editor?.sections?.experience || 'Professional Experience'} accentColor={accentColor} fontScale={activeScale} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {experiences.map((exp, index) => (
                <div
                  key={index}
                  style={{ display: 'flex', gap: '16px', position: index === 0 ? 'relative' : undefined }}
                >
                  <div style={{ width: '40%', flexShrink: 0 }}>
                    <p
                      style={{
                        fontSize: `${13 * activeScale}px`,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: '#1a1a1a',
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {exp.position}
                    </p>
                    <p
                      style={{
                        fontSize: `${12 * activeScale}px`,
                        color: '#6b7280',
                        margin: '2px 0 0 0',
                        lineHeight: 1.4,
                      }}
                    >
                      {exp.startDate &&
                        new Date(exp.startDate + '-01').toLocaleDateString(locale, {
                          year: 'numeric',
                        })}
                      {' - '}
                      {exp.current
                        ? (dict.resumes?.editor?.present || 'Present')
                        : exp.endDate
                          ? new Date(exp.endDate + '-01').toLocaleDateString(locale, {
                              year: 'numeric',
                            })
                          : (dict.resumes?.editor?.present || 'Present')}
                    </p>
                    <p
                      style={{
                        fontSize: `${12 * activeScale}px`,
                        fontWeight: 700,
                        color: '#1a1a1a',
                        margin: '8px 0 0 0',
                        lineHeight: 1.4,
                      }}
                    >
                      {exp.company}
                    </p>
                    {exp.location && (
                      <p
                        style={{
                          fontSize: `${11 * activeScale}px`,
                          color: '#6b7280',
                          margin: '2px 0 0 0',
                          lineHeight: 1.4,
                        }}
                      >
                        {exp.location}
                      </p>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {exp.description && (
                      <div
                        style={{
                          fontSize: `${sectionDescFontSize * activeScale}px`,
                          color: '#374151',
                          lineHeight: 1.5,
                          textAlign: 'justify',
                          margin: 0,
                        }}
                      >
                        {formatText(exp.description)}
                      </div>
                    )}

                    {exp.achievements && exp.achievements.length > 0 && (
                      <ul
                        style={{
                          margin: exp.description ? '6px 0 0 0' : 0,
                          padding: 0,
                          listStyle: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        {exp.achievements.map((achievement, i) => (
                          <li
                            key={i}
                            style={{
                              display: 'flex',
                              gap: '6px',
                              fontSize: `${sectionDescFontSize * activeScale}px`,
                              color: '#374151',
                              lineHeight: 1.5,
                              fontStyle: 'italic',
                            }}
                          >
                            <span style={{ color: accentColor, flexShrink: 0 }}>&#8226;</span>
                            <span>{formatText(achievement)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }
      default:
        return null
    }
  }

  return (
    <div
      className="mx-auto shadow-lg print:shadow-none"
      style={{
        position: 'relative',
        width: '816px',
        minHeight: '1056px',
        backgroundColor: 'white',
        fontFamily: fontFamily,
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
          width: `${activeWidth}%`,
          backgroundColor: activeSidebarColor,
        }}
      >
        {/* Photo Zone */}
        <div
          style={{
            width: '100%',
            height: '220px',
            backgroundColor: '#444444',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Photo or placeholder */}
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Profile"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* User silhouette icon placeholder */}
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
                <circle cx="40" cy="28" r="16" fill="rgba(255,255,255,0.3)" />
                <ellipse cx="40" cy="68" rx="28" ry="18" fill="rgba(255,255,255,0.3)" />
              </svg>
            </div>
          )}

          {/* Upload overlay - editor only */}
          {onPhotoChange && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label={photoUrl ? 'Change profile photo' : 'Upload profile photo'}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
                className="print:hidden"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: 0,
                  transition: 'opacity 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
              >
                {/* Camera icon */}
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span style={{ color: 'white', fontSize: '11px', marginTop: '8px', fontWeight: 500 }}>
                  {photoUrl ? 'Change Photo' : 'Upload Photo'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Sidebar content with padding */}
        <div className="p-8 print:p-6" style={{ paddingTop: activeSidebarTopMargin > 0 ? `${activeSidebarTopMargin}px` : undefined }}>
        {/* Sidebar sections rendered in dynamic order */}
        {activeSidebarOrder.filter(id => !hiddenSidebar.has(id)).map(id => (
          <React.Fragment key={id}>{renderSidebarSection(id)}</React.Fragment>
        ))}
        </div>{/* End sidebar content padding wrapper */}
      </div>

      {/* Right Content Area */}
      <div className="p-8 print:p-6" style={{ marginLeft: `${activeWidth}%`, backgroundColor: 'white', paddingTop: activeMainContentTopMargin > 0 ? `${activeMainContentTopMargin}px` : undefined }}>
        {/* Header: Name, Job Title, Address */}
        <div className="mb-6" style={{ position: 'relative' }}>
          {/* Full name — large bold uppercase with letter-spacing */}
          <h1
            className="font-bold uppercase text-slate-900"
            style={{
              fontSize: `${titleFontSize * activeScale}px`,
              letterSpacing: '0.15em',
              lineHeight: 1.2,
              marginBottom: '8px',
            }}
          >
            {contact.name || 'Your Name'}
          </h1>

          {/* Job title — on gold accent highlight bar */}
          {resume.title && (
            <div
              className="inline-block uppercase font-semibold tracking-wide"
              style={{
                backgroundColor: accentColor,
                color: '#FFFFFF',
                fontSize: `${16 * activeScale}px`,
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
                fontSize: `${11 * activeScale}px`,
                color: '#6b7280',
                marginTop: resume.title ? '0px' : '4px',
              }}
            >
              {contact.location}
            </p>
          )}
        </div>

        {/* Main content sections rendered in dynamic order */}
        {activeMainOrder.filter(id => !hiddenMain.has(id)).map(id => (
          <React.Fragment key={id}>{renderMainSection(id)}</React.Fragment>
        ))}

        {/* Projects */}
        {projects.length > 0 && (
          <div className="mb-6">
            <MainSectionHeader title={dict.resumes?.editor?.sections?.projects || 'Projects'} accentColor={accentColor} fontScale={activeScale} />
            <div className="space-y-4">
              {projects.map((project, index) => (
                <div key={index} className="relative pl-4">
                  <div className="absolute left-0 top-2 h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }}></div>
                  <h3 className="text-lg font-bold text-slate-900">{project.name}</h3>
                  {project.description && (
                    <p className="mt-1 leading-relaxed text-slate-700" style={{ fontSize: `${sectionDescFontSize * activeScale}px` }}>
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

      </div>
    </div>
  )
}
