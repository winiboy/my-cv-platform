'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  User,
  FileText,
  Briefcase,
  GraduationCap,
  Code,
  Languages,
  Award,
  FolderGit2,
  Save,
  Eye,
  ArrowLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n'
import type { Resume } from '@/types/database'
import { ContactSection } from './resume-sections/contact-section'
import { SummarySection } from './resume-sections/summary-section'
import { ExperienceSection } from './resume-sections/experience-section'
import { EducationSection } from './resume-sections/education-section'
import { SkillsSection } from './resume-sections/skills-section'
import { LanguagesSection } from './resume-sections/languages-section'
import { CertificationsSection } from './resume-sections/certifications-section'
import { ProjectsSection } from './resume-sections/projects-section'
import { ProfessionalTemplate } from './resume-templates/professional-template'

interface ResumeEditorProps {
  resume: Resume
  locale: Locale
  dict: any
}

type SectionId =
  | 'contact'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certifications'
  | 'projects'

const SECTIONS = [
  { id: 'contact' as const, label: 'Contact', icon: User },
  { id: 'summary' as const, label: 'Summary', icon: FileText },
  { id: 'experience' as const, label: 'Experience', icon: Briefcase },
  { id: 'education' as const, label: 'Education', icon: GraduationCap },
  { id: 'skills' as const, label: 'Skills', icon: Code },
  { id: 'languages' as const, label: 'Languages', icon: Languages },
  { id: 'certifications' as const, label: 'Certifications', icon: Award },
  { id: 'projects' as const, label: 'Projects', icon: FolderGit2 },
]

const SECTION_MAPPING: Record<string, SectionId> = {
  contact: 'contact',
  summary: 'summary',
  experience: 'experience',
  education: 'education',
  skills: 'skills',
  languages: 'languages',
  certifications: 'certifications',
  projects: 'projects',
}

export function ResumeEditor({ resume: initialResume, locale, dict }: ResumeEditorProps) {
  const router = useRouter()
  const [resume, setResume] = useState(initialResume)
  const [activeSection, setActiveSection] = useState<SectionId>('contact')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [modifiedSections, setModifiedSections] = useState<Set<SectionId>>(new Set())

  // Design settings for live preview (loaded from localStorage)
  const [titleFontSize, setTitleFontSize] = useState(24)
  const [titleGap, setTitleGap] = useState(8)
  const [contactFontSize, setContactFontSize] = useState(12)
  const [sectionTitleFontSize, setSectionTitleFontSize] = useState(16)
  const [sectionDescFontSize, setSectionDescFontSize] = useState(14)
  const [sectionGap, setSectionGap] = useState(12)
  const [headerGap, setHeaderGap] = useState(12)
  const [sidebarColor, setSidebarColor] = useState('hsl(240, 85%, 35%)')

  // Resizable split pane state
  const [splitPosition, setSplitPosition] = useState(50) // Percentage
  const [isDragging, setIsDragging] = useState(false)
  const [previewScale, setPreviewScale] = useState(0.85)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError('')

    try {
      const supabase = createClient()

      const updates: any = {
        title: resume.title,
        template: resume.template,
        contact: resume.contact,
        summary: resume.summary,
        experience: resume.experience,
        education: resume.education,
        skills: resume.skills,
        languages: resume.languages,
        certifications: resume.certifications,
        projects: resume.projects,
        custom_sections: resume.custom_sections,
      }

      const result = await (supabase.from('resumes') as any).update(updates).eq('id', resume.id)
      const { error } = result

      if (error) {
        console.error('Error saving resume:', error)
        setSaveError(dict.resumes?.errors?.saveFailed || 'Failed to save resume')
      } else {
        setLastSaved(new Date())
        setHasUnsavedChanges(false)
        setModifiedSections(new Set()) // Clear modified sections after save
      }
    } catch (err) {
      console.error('❌ Unexpected error:', err)
      setSaveError(dict.resumes?.errors?.saveFailed || 'Failed to save resume')
    } finally {
      setIsSaving(false)
    }
  }

  // Debounced localStorage save
  const saveToLocalStorageDebounced = useRef<NodeJS.Timeout | undefined>(undefined)

  const updateResume = useCallback((updates: Partial<Resume>) => {
    const updatedResume = { ...resume, ...updates }
    setResume(updatedResume)
    setHasUnsavedChanges(true)

    // Track which sections were modified
    const newModifiedSections = new Set(modifiedSections)
    Object.keys(updates).forEach((key) => {
      const sectionId = SECTION_MAPPING[key]
      if (sectionId) {
        newModifiedSections.add(sectionId)
      }
    })
    setModifiedSections(newModifiedSections)

    // Debounce localStorage writes (500ms)
    if (saveToLocalStorageDebounced.current) {
      clearTimeout(saveToLocalStorageDebounced.current)
    }
    saveToLocalStorageDebounced.current = setTimeout(() => {
      localStorage.setItem(`resume_draft_${resume.id}`, JSON.stringify(updatedResume))
      localStorage.setItem(`resume_modified_sections_${resume.id}`, JSON.stringify(Array.from(newModifiedSections)))
    }, 500)
  }, [resume, modifiedSections])

  // Handle dragging the divider
  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const offsetX = e.clientX - containerRect.left - 256 // Subtract sidebar width (w-64 = 256px)
      const newPosition = (offsetX / (containerRect.width - 256)) * 100

      // Constrain between 30% and 70%
      setSplitPosition(Math.min(Math.max(newPosition, 30), 70))
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Calculate preview scale prioritizing width (allows vertical scroll if needed)
  const calculatePreviewScale = useCallback(() => {
    if (!previewContainerRef.current) return

    const container = previewContainerRef.current
    const containerWidth = container.clientWidth - 64 // Subtract padding (p-8 = 32px each side)

    // CV dimensions (A4 size - standard letter)
    const cvWidth = 816

    // Use full available width - allows zoom in with vertical scrolling
    const scale = containerWidth / cvWidth

    setPreviewScale(Math.max(scale, 0.1)) // Minimum 10% to avoid invisible preview
  }, [])

  // Attach mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Recalculate scale when split position changes or window resizes
  useEffect(() => {
    calculatePreviewScale()

    const handleResize = () => calculatePreviewScale()
    window.addEventListener('resize', handleResize)

    // Use ResizeObserver for more accurate container size tracking
    const resizeObserver = new ResizeObserver(calculatePreviewScale)
    if (previewContainerRef.current) {
      resizeObserver.observe(previewContainerRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
    }
  }, [splitPosition, calculatePreviewScale])

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = localStorage.getItem(`resume_draft_${resume.id}`)
    if (draft) {
      try {
        const draftResume = JSON.parse(draft)
        setResume(draftResume)
        setHasUnsavedChanges(true)
      } catch (error) {
        console.error('Failed to load draft:', error)
      }
    }

    // Load modified sections
    const storedSections = localStorage.getItem(`resume_modified_sections_${resume.id}`)
    if (storedSections) {
      try {
        const sections = JSON.parse(storedSections)
        setModifiedSections(new Set(sections))
      } catch (error) {
        console.error('Failed to load modified sections:', error)
      }
    }

    // Load design settings for live preview
    const savedSettings = localStorage.getItem(`resume_slider_settings_${resume.id}`)
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        if (settings.titleFontSize !== undefined) setTitleFontSize(settings.titleFontSize)
        if (settings.titleGap !== undefined) setTitleGap(settings.titleGap)
        if (settings.contactFontSize !== undefined) setContactFontSize(settings.contactFontSize)
        if (settings.sectionTitleFontSize !== undefined) setSectionTitleFontSize(settings.sectionTitleFontSize)
        if (settings.sectionDescFontSize !== undefined) setSectionDescFontSize(settings.sectionDescFontSize)
        if (settings.sectionGap !== undefined) setSectionGap(settings.sectionGap)
        if (settings.headerGap !== undefined) setHeaderGap(settings.headerGap)
        if (settings.sidebarColor !== undefined) setSidebarColor(settings.sidebarColor)
      } catch (error) {
        console.error('Failed to load design settings:', error)
      }
    }
  }, [resume.id])

  // Clear localStorage after successful save
  useEffect(() => {
    if (!hasUnsavedChanges && lastSaved) {
      localStorage.removeItem(`resume_draft_${resume.id}`)
      localStorage.removeItem(`resume_modified_sections_${resume.id}`)
    }
  }, [hasUnsavedChanges, lastSaved, resume.id])

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/${locale}/dashboard/resumes`)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {dict.common?.back || 'Back'}
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{resume.title}</h1>
            {hasUnsavedChanges ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600"></span>
                {dict.resumes?.editor?.unsavedChanges || 'Unsaved changes'}
              </p>
            ) : lastSaved ? (
              <p className="text-xs text-slate-500">
                {dict.resumes?.editor?.lastSaved || 'Last saved'}{' '}
                {lastSaved.toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/${locale}/dashboard/resumes/${resume.id}/preview`)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Eye className="h-4 w-4" />
            {dict.resumes?.preview || 'Preview'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              hasUnsavedChanges
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {hasUnsavedChanges && (
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white"></span>
            )}
            <Save className="h-4 w-4" />
            {isSaving ? dict.common?.saving || 'Saving...' : dict.common?.save || 'Save'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 px-6 py-3">
          <p className="text-sm text-red-800">{saveError}</p>
        </div>
      )}

      {/* Editor Layout */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <div className="w-64 border-r border-slate-200 bg-slate-50">
          <nav className="space-y-1 p-4">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id
              const isModified = modifiedSections.has(section.id)

              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-teal-100 text-teal-900'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  } ${isModified ? 'border-l-4 border-amber-500 pl-2' : ''}`}
                >
                  {isModified && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-amber-500"></span>
                  )}
                  <Icon className={`h-4 w-4 ${isModified ? 'ml-3' : ''}`} />
                  {dict.resumes?.editor?.sections?.[section.id] || section.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Split Content Area: Editor (Left) + Live Preview (Right) */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left: Editor */}
          <div
            className="overflow-y-auto bg-white p-8"
            style={{ width: `${splitPosition}%` }}
          >
            <div className="mx-auto max-w-xl">
              {activeSection === 'contact' && (
                <ContactSection resume={resume} updateResume={updateResume} dict={dict} />
              )}
              {activeSection === 'summary' && (
                <SummarySection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {activeSection === 'experience' && (
                <ExperienceSection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {activeSection === 'education' && (
                <EducationSection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {activeSection === 'skills' && (
                <SkillsSection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {activeSection === 'languages' && (
                <LanguagesSection resume={resume} updateResume={updateResume} dict={dict} />
              )}
              {activeSection === 'certifications' && (
                <CertificationsSection resume={resume} updateResume={updateResume} dict={dict} />
              )}
              {activeSection === 'projects' && (
                <ProjectsSection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
            </div>
          </div>

          {/* Draggable Divider */}
          <div
            onMouseDown={handleMouseDown}
            className={`w-1 bg-slate-300 hover:bg-teal-500 cursor-col-resize transition-colors ${
              isDragging ? 'bg-teal-500' : ''
            }`}
            style={{ flexShrink: 0 }}
          />

          {/* Right: Live Preview */}
          <div
            ref={previewContainerRef}
            className="overflow-y-auto bg-slate-100 p-8"
            style={{ width: `${100 - splitPosition}%` }}
          >
            <div className="flex items-start justify-center min-h-full">
              <div
                style={{
                  width: '816px',
                  transformOrigin: 'top center',
                  transform: `scale(${previewScale})`,
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                }}
              >
                <ProfessionalTemplate
                  resume={resume}
                  locale={locale}
                  dict={dict}
                  titleFontSize={titleFontSize}
                  titleGap={titleGap}
                  contactFontSize={contactFontSize}
                  sectionTitleFontSize={sectionTitleFontSize}
                  sectionDescFontSize={sectionDescFontSize}
                  sectionGap={sectionGap}
                  headerGap={headerGap}
                  sidebarColor={sidebarColor}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
