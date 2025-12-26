'use client'

import { useState, useEffect } from 'react'
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

const sections = [
  { id: 'contact' as const, label: 'Contact', icon: User },
  { id: 'summary' as const, label: 'Summary', icon: FileText },
  { id: 'experience' as const, label: 'Experience', icon: Briefcase },
  { id: 'education' as const, label: 'Education', icon: GraduationCap },
  { id: 'skills' as const, label: 'Skills', icon: Code },
  { id: 'languages' as const, label: 'Languages', icon: Languages },
  { id: 'certifications' as const, label: 'Certifications', icon: Award },
  { id: 'projects' as const, label: 'Projects', icon: FolderGit2 },
]

export function ResumeEditor({ resume: initialResume, locale, dict }: ResumeEditorProps) {
  const router = useRouter()
  const [resume, setResume] = useState(initialResume)
  const [activeSection, setActiveSection] = useState<SectionId>('contact')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [modifiedSections, setModifiedSections] = useState<Set<SectionId>>(new Set())

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

  const updateResume = (updates: Partial<Resume>) => {
    const updatedResume = { ...resume, ...updates }
    setResume(updatedResume)
    setHasUnsavedChanges(true)

    // Track which sections were modified
    const newModifiedSections = new Set(modifiedSections)
    Object.keys(updates).forEach((key) => {
      // Map resume fields to section IDs
      const sectionMapping: Record<string, SectionId> = {
        contact: 'contact',
        summary: 'summary',
        experience: 'experience',
        education: 'education',
        skills: 'skills',
        languages: 'languages',
        certifications: 'certifications',
        projects: 'projects',
      }
      const sectionId = sectionMapping[key]
      if (sectionId) {
        newModifiedSections.add(sectionId)
      }
    })
    setModifiedSections(newModifiedSections)

    // Save to localStorage for preview with unsaved changes
    localStorage.setItem(`resume_draft_${resume.id}`, JSON.stringify(updatedResume))
    localStorage.setItem(`resume_modified_sections_${resume.id}`, JSON.stringify(Array.from(newModifiedSections)))
  }

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
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <div className="w-64 border-r border-slate-200 bg-slate-50">
          <nav className="space-y-1 p-4">
            {sections.map((section) => {
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

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-white p-8">
          <div className="mx-auto max-w-3xl">
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
      </div>
    </div>
  )
}
