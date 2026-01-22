'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  EyeOff,
  ArrowLeft,
  Sparkles,
  LayoutList,
  GripVertical,
  Mail,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n'
import type { Resume, ResumeSkillCategory } from '@/types/database'
import { ContactSection } from './resume-sections/contact-section'
import { SummarySection } from './resume-sections/summary-section'
import { ExperienceSection } from './resume-sections/experience-section'
import { EducationSection } from './resume-sections/education-section'
import { SkillsSection } from './resume-sections/skills-section'
import { LanguagesSection } from './resume-sections/languages-section'
import { CertificationsSection } from './resume-sections/certifications-section'
import { ProjectsSection } from './resume-sections/projects-section'
import { CoverLetterAssociationSection } from './resume-sections/cover-letter-association-section'
import { JobAssociationSection } from './resume-sections/job-association-section'
import { ProfessionalTemplate } from './resume-templates/professional-template'
import { CVAdaptationModal } from './cv-adaptation-modal'
import { FontCarousel3D, FONTS } from '@/components/ui/font-carousel-3d'
import type { CVAdaptationPatch } from '@/types/cv-adaptation'

interface JobApplicationItem {
  id: string
  company_name: string
  job_title: string
  job_url: string | null
  status: string
  job_description: string | null
}

interface ResumeEditorProps {
  resume: Resume
  locale: Locale
  dict: any
  linkedCoverLetters?: { id: string; title: string; company_name: string | null; job_title: string | null }[]
  unlinkedCoverLetters?: { id: string; title: string; company_name: string | null }[]
  linkedJob?: JobApplicationItem | null
  availableJobs?: JobApplicationItem[]
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
  | 'jobApplication'
  | 'coverLetters'
  | 'editSidebar'
  | 'editMainContent'

const SECTIONS = [
  { id: 'contact' as const, label: 'Contact', icon: User },
  { id: 'summary' as const, label: 'Summary', icon: FileText },
  { id: 'experience' as const, label: 'Experience', icon: Briefcase },
  { id: 'education' as const, label: 'Education', icon: GraduationCap },
  { id: 'skills' as const, label: 'Skills', icon: Code },
  { id: 'languages' as const, label: 'Languages', icon: Languages },
  { id: 'certifications' as const, label: 'Certifications', icon: Award },
  { id: 'projects' as const, label: 'Projects', icon: FolderGit2 },
  { id: 'jobApplication' as const, label: 'Job Application', icon: Briefcase },
  { id: 'coverLetters' as const, label: 'Cover Letters', icon: Mail },
  { id: 'editSidebar' as const, label: 'Edit Sidebar', icon: LayoutList },
  { id: 'editMainContent' as const, label: 'Edit Main Content', icon: LayoutList },
]

// Sidebar section IDs for ordering
type SidebarSectionId = 'keyAchievements' | 'skills' | 'languages' | 'training'
const DEFAULT_SIDEBAR_ORDER: SidebarSectionId[] = ['keyAchievements', 'skills', 'languages', 'training']

// Main content section IDs for ordering
type MainContentSectionId = 'summary' | 'experience' | 'education'
const DEFAULT_MAIN_CONTENT_ORDER: MainContentSectionId[] = ['summary', 'experience', 'education']

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

export function ResumeEditor({ resume: initialResume, locale, dict, linkedCoverLetters, unlinkedCoverLetters: initialUnlinkedCoverLetters, linkedJob: initialLinkedJob, availableJobs: initialAvailableJobs }: ResumeEditorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [resume, setResume] = useState(initialResume)
  const resumeRef = useRef(resume) // Track latest resume to avoid stale closures
  // Initialize active section from URL query param or default to 'contact'
  const initialSection = searchParams?.get('section') as SectionId | null
  const [activeSection, setActiveSection] = useState<SectionId>(
    initialSection && SECTIONS.some(s => s.id === initialSection) ? initialSection : 'contact'
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [modifiedSections, setModifiedSections] = useState<Set<SectionId>>(new Set())
  const [showAdaptationModal, setShowAdaptationModal] = useState(false)

  // Cover letter association state
  const [coverLetters, setCoverLetters] = useState(linkedCoverLetters || [])
  const [unlinkedCoverLetters, setUnlinkedCoverLetters] = useState(initialUnlinkedCoverLetters || [])

  // Job association state
  const [linkedJob, setLinkedJob] = useState<JobApplicationItem | null>(initialLinkedJob || null)
  const [availableJobs, setAvailableJobs] = useState<JobApplicationItem[]>(initialAvailableJobs || [])

  // State for pre-filling the adaptation modal from a linked job
  const [adaptationJobDescription, setAdaptationJobDescription] = useState('')
  const [adaptationJobTitle, setAdaptationJobTitle] = useState('')
  const [adaptationCompany, setAdaptationCompany] = useState('')

  // Design settings for live preview (loaded from localStorage)
  const [titleFontSize, setTitleFontSize] = useState(24)
  const [titleGap, setTitleGap] = useState(8)
  const [contactFontSize, setContactFontSize] = useState(12)
  const [sectionTitleFontSize, setSectionTitleFontSize] = useState(16)
  const [sectionDescFontSize, setSectionDescFontSize] = useState(14)
  const [sectionGap, setSectionGap] = useState(12)
  const [headerGap, setHeaderGap] = useState(12)
  const [sidebarHue, setSidebarHue] = useState(240)
  const [sidebarBrightness, setSidebarBrightness] = useState(35)
  const [fontScale, setFontScale] = useState(1)
  const [sidebarOrder, setSidebarOrder] = useState<SidebarSectionId[]>(DEFAULT_SIDEBAR_ORDER)
  const [mainContentOrder, setMainContentOrder] = useState<MainContentSectionId[]>(DEFAULT_MAIN_CONTENT_ORDER)
  const [fontFamily, setFontFamily] = useState<string>(FONTS[4].family) // Default to Arial
  const [sidebarTopMargin, setSidebarTopMargin] = useState(64) // Default: 64px
  const [mainContentTopMargin, setMainContentTopMargin] = useState(24) // Default: 24px
  const [sidebarWidth, setSidebarWidth] = useState(30) // Default: 30%
  const [isSliderSettingsLoaded, setIsSliderSettingsLoaded] = useState(false)
  const [draggedSection, setDraggedSection] = useState<SidebarSectionId | null>(null)
  const [draggedMainSection, setDraggedMainSection] = useState<MainContentSectionId | null>(null)
  const [hiddenSidebarSections, setHiddenSidebarSections] = useState<SidebarSectionId[]>([])
  const [hiddenMainSections, setHiddenMainSections] = useState<MainContentSectionId[]>([])

  // Compute sidebarColor from hue and brightness
  const sidebarColor = `hsl(${sidebarHue}, 85%, ${sidebarBrightness}%)`

  // Keep resumeRef in sync with resume state
  useEffect(() => {
    resumeRef.current = resume
  }, [resume])

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

  /**
   * Associates an existing unlinked cover letter with this resume.
   * PATCHes the cover letter to set its resume_id to the current resume.
   */
  const handleAssociateCoverLetter = useCallback(async (coverLetterId: string) => {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('cover_letters')
        .update({ resume_id: resume.id })
        .eq('id', coverLetterId)

      if (error) {
        console.error('Error associating cover letter:', error)
        throw error
      }

      // Find the cover letter in unlinked list and move it to linked list
      const associatedCoverLetter = unlinkedCoverLetters.find((cl) => cl.id === coverLetterId)
      if (associatedCoverLetter) {
        // Add to linked cover letters (with empty job_title since unlinked doesn't have it)
        setCoverLetters((prev) => [
          { ...associatedCoverLetter, job_title: null },
          ...prev,
        ])
        // Remove from unlinked cover letters
        setUnlinkedCoverLetters((prev) => prev.filter((cl) => cl.id !== coverLetterId))
      }
    } catch (err) {
      console.error('Failed to associate cover letter:', err)
      throw err
    }
  }, [resume.id, unlinkedCoverLetters])

  /**
   * Handles job association changes from the JobAssociationSection.
   * Updates local state when a job is linked or unlinked.
   */
  const handleJobChange = useCallback((job: JobApplicationItem | null) => {
    if (job) {
      // Job was linked - remove from available jobs and set as linked
      setLinkedJob(job)
      setAvailableJobs((prev) => prev.filter((j) => j.id !== job.id))
    } else if (linkedJob) {
      // Job was unlinked - add back to available jobs
      setAvailableJobs((prev) => [linkedJob, ...prev])
      setLinkedJob(null)
    }
  }, [linkedJob])

  /**
   * Opens the adaptation modal with pre-filled data from the linked job.
   * Called when user clicks "Adapt CV to this Job" in JobAssociationSection.
   */
  const handleAdaptToJobFromSection = useCallback((jobDescription: string, jobTitle: string, companyName: string) => {
    setAdaptationJobDescription(jobDescription)
    setAdaptationJobTitle(jobTitle)
    setAdaptationCompany(companyName)
    setShowAdaptationModal(true)
  }, [])

  // Debounced localStorage save
  const saveToLocalStorageDebounced = useRef<NodeJS.Timeout | undefined>(undefined)

  const updateResume = useCallback((updates: Partial<Resume>) => {
    // Use functional update to avoid stale closure issues
    setResume(prevResume => {
      const updatedResume = { ...prevResume, ...updates }

      // Debounce localStorage writes (500ms)
      if (saveToLocalStorageDebounced.current) {
        clearTimeout(saveToLocalStorageDebounced.current)
      }
      saveToLocalStorageDebounced.current = setTimeout(() => {
        localStorage.setItem(`resume_draft_${prevResume.id}`, JSON.stringify(updatedResume))
      }, 500)

      return updatedResume
    })
    setHasUnsavedChanges(true)

    // Track which sections were modified
    setModifiedSections(prevModifiedSections => {
      const newModifiedSections = new Set(prevModifiedSections)
      Object.keys(updates).forEach((key) => {
        const sectionId = SECTION_MAPPING[key]
        if (sectionId) {
          newModifiedSections.add(sectionId)
        }
      })

      // Debounce localStorage writes for modified sections
      setTimeout(() => {
        localStorage.setItem(`resume_modified_sections_${initialResume.id}`, JSON.stringify(Array.from(newModifiedSections)))
      }, 500)

      return newModifiedSections
    })
  }, [initialResume.id])

  // Handle CV adaptation from job description
  const handleApplyChanges = useCallback((patch: CVAdaptationPatch, selectedPatches: string[]) => {
    // Use resumeRef.current to get the latest state (avoid stale closure)
    const currentResume = resumeRef.current
    const updates: Partial<Resume> = {}

    console.log('Applying changes:', { patch, selectedPatches }) // Debug log

    // Guard: validate patch structure
    if (!patch || !patch.patches || !Array.isArray(selectedPatches)) {
      console.error('Invalid patch data:', { patch, selectedPatches })
      return
    }

    // Apply summary patch if selected
    if (selectedPatches.includes('summary') && patch.patches.summary) {
      updates.summary = patch.patches.summary.proposed
      console.log('Updating summary:', updates.summary) // Debug log
    }

    // Apply experience description patch if selected
    if (selectedPatches.includes('experienceDescription') && patch.patches.experienceDescription) {
      const rawExperience = currentResume.experience as any[] | null
      const experienceArray: any[] = Array.isArray(rawExperience)
        ? rawExperience.map((exp: any) => ({ ...exp })) // Deep copy each item
        : []
      const index = patch.patches.experienceDescription.experienceIndex
      const experienceItem = experienceArray[index]
      if (experienceItem && typeof experienceItem === 'object') {
        experienceArray[index] = {
          ...experienceItem,
          description: patch.patches.experienceDescription.proposed,
        }
        updates.experience = experienceArray
        console.log('Updating experience at index:', index) // Debug log
      }
    }

    // Apply skills patches if selected
    let skillsModified = false
    const rawSkills = currentResume.skills as any[] | null
    const skillsArray: any[] = Array.isArray(rawSkills)
      ? rawSkills.map((skill: any) => ({
          ...skill,
          items: Array.isArray(skill?.items) ? [...skill.items] : []
        })) // Deep copy each skill category
      : []

    // Add new skill categories
    patch.patches.skillsToAdd?.forEach((skillPatch, index) => {
      if (selectedPatches.includes(`skillsToAdd-${index}`)) {
        skillsArray.push({
          category: skillPatch.category,
          items: [...skillPatch.items],
          visible: true,
        })
        skillsModified = true
        console.log('Adding skill category:', skillPatch.category) // Debug log
      }
    })

    // Enhance existing skill categories
    patch.patches.skillsToEnhance?.forEach((skillPatch, index) => {
      if (selectedPatches.includes(`skillsToEnhance-${index}`)) {
        const existingCategory = skillsArray.find((cat: any) => cat?.category === skillPatch.category)
        if (existingCategory && Array.isArray(existingCategory.items)) {
          // Merge skills, avoiding duplicates
          const existingSkillsLower = existingCategory.items.map((s: any) => String(s).toLowerCase())
          const newSkills = skillPatch.itemsToAdd.filter(
            (skill) => !existingSkillsLower.includes(skill.toLowerCase())
          )
          if (newSkills.length > 0) {
            existingCategory.items = [...existingCategory.items, ...newSkills]
            skillsModified = true
            console.log('Enhancing skill category:', skillPatch.category, newSkills) // Debug log
          }
        }
      }
    })

    if (skillsModified) {
      updates.skills = skillsArray
    }

    // Apply all updates
    console.log('Final updates:', updates) // Debug log
    if (Object.keys(updates).length > 0) {
      updateResume(updates)

      // Show success message
      setTimeout(() => {
        alert(dict?.cvAdaptation?.successMessage || 'CV adapted successfully. Review and save when ready.')
      }, 100)
    } else {
      console.log('No updates to apply') // Debug log
    }

    setShowAdaptationModal(false)
  }, [updateResume, dict])

  // Track if adaptation has been applied to prevent re-runs
  const adaptationAppliedRef = useRef(false)

  // Check for pending adaptation data on mount
  useEffect(() => {
    // Guard: skip if already applied
    if (adaptationAppliedRef.current) return

    // Check URL flag
    const shouldApply = searchParams?.get('applyAdaptation') === 'true'
    if (!shouldApply) return

    // Read adaptation data from sessionStorage
    const storedData = sessionStorage.getItem('cv_adaptation_pending')
    if (!storedData) {
      console.log('No adaptation data in sessionStorage')
      return
    }

    try {
      const { patch, selectedPatches, resumeId, timestamp } = JSON.parse(storedData)

      // Validate the data is for this resume and not stale (5 min max)
      const isStale = Date.now() - timestamp > 5 * 60 * 1000
      if (resumeId !== resume.id || isStale) {
        console.log('Adaptation data is for different resume or stale, clearing')
        sessionStorage.removeItem('cv_adaptation_pending')
        return
      }

      console.log('Loading adaptation from sessionStorage:', { patch, selectedPatches })

      // Mark as applied before processing to prevent re-runs
      adaptationAppliedRef.current = true

      // Clear sessionStorage
      sessionStorage.removeItem('cv_adaptation_pending')

      // Apply changes
      handleApplyChanges(patch, selectedPatches)

      // Clean up URL after a short delay
      setTimeout(() => {
        router.replace(`/${locale}/dashboard/resumes/${resume.id}/edit`)
      }, 200)
    } catch (error) {
      console.error('Error parsing adaptation data:', error)
      sessionStorage.removeItem('cv_adaptation_pending')
    }
  }, [searchParams, handleApplyChanges, router, locale, resume.id])

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
        if (settings.sidebarHue !== undefined) setSidebarHue(settings.sidebarHue)
        if (settings.sidebarBrightness !== undefined) setSidebarBrightness(settings.sidebarBrightness)
        if (settings.fontScale !== undefined) setFontScale(settings.fontScale)
        if (settings.sidebarOrder !== undefined) {
          // Migration: Add 'languages' if missing from saved order
          let order = settings.sidebarOrder as SidebarSectionId[]
          if (!order.includes('languages')) {
            // Insert 'languages' after 'skills' or at position 2
            const skillsIndex = order.indexOf('skills')
            if (skillsIndex >= 0) {
              order = [...order.slice(0, skillsIndex + 1), 'languages', ...order.slice(skillsIndex + 1)]
            } else {
              order = [...order, 'languages']
            }
          }
          setSidebarOrder(order)
        }
        if (settings.mainContentOrder !== undefined) setMainContentOrder(settings.mainContentOrder)
        if (settings.fontFamily !== undefined) setFontFamily(settings.fontFamily)
        if (settings.sidebarTopMargin !== undefined) setSidebarTopMargin(settings.sidebarTopMargin)
        if (settings.mainContentTopMargin !== undefined) setMainContentTopMargin(settings.mainContentTopMargin)
        if (settings.sidebarWidth !== undefined) setSidebarWidth(settings.sidebarWidth)
        if (settings.hiddenSidebarSections !== undefined) setHiddenSidebarSections(settings.hiddenSidebarSections)
        if (settings.hiddenMainSections !== undefined) setHiddenMainSections(settings.hiddenMainSections)
      } catch (error) {
        console.error('Failed to load design settings:', error)
      }
    }
    setIsSliderSettingsLoaded(true)
  }, [resume.id])

  // Clear localStorage after successful save
  useEffect(() => {
    if (!hasUnsavedChanges && lastSaved) {
      localStorage.removeItem(`resume_draft_${resume.id}`)
      localStorage.removeItem(`resume_modified_sections_${resume.id}`)
    }
  }, [hasUnsavedChanges, lastSaved, resume.id])

  // Save slider settings (sidebarHue, sidebarBrightness, fontScale) to localStorage whenever they change
  useEffect(() => {
    if (!isSliderSettingsLoaded) return // Don't save until initial load is complete

    const savedSettings = localStorage.getItem(`resume_slider_settings_${resume.id}`)
    let settings: Record<string, any> = {}
    if (savedSettings) {
      try {
        settings = JSON.parse(savedSettings)
      } catch (error) {
        console.error('Failed to parse slider settings:', error)
      }
    }
    settings.sidebarHue = sidebarHue
    settings.sidebarBrightness = sidebarBrightness
    settings.fontScale = fontScale
    settings.sidebarOrder = sidebarOrder
    settings.mainContentOrder = mainContentOrder
    settings.fontFamily = fontFamily
    settings.sidebarTopMargin = sidebarTopMargin
    settings.mainContentTopMargin = mainContentTopMargin
    settings.sidebarWidth = sidebarWidth
    settings.hiddenSidebarSections = hiddenSidebarSections
    settings.hiddenMainSections = hiddenMainSections
    localStorage.setItem(`resume_slider_settings_${resume.id}`, JSON.stringify(settings))
  }, [isSliderSettingsLoaded, sidebarHue, sidebarBrightness, fontScale, sidebarOrder, mainContentOrder, fontFamily, sidebarTopMargin, mainContentTopMargin, sidebarWidth, hiddenSidebarSections, hiddenMainSections, resume.id])

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
            onClick={() => setShowAdaptationModal(true)}
            className="flex items-center gap-2 rounded-lg border border-purple-600 bg-white px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50"
          >
            <Sparkles className="h-4 w-4" />
            {dict?.cvAdaptation?.adaptToJob || 'Adapt to Job'}
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
              {activeSection === 'jobApplication' && (
                <JobAssociationSection
                  resumeId={resume.id}
                  linkedJob={linkedJob}
                  availableJobs={availableJobs}
                  locale={locale}
                  dict={dict}
                  onJobChange={handleJobChange}
                  onAdaptToJob={handleAdaptToJobFromSection}
                />
              )}
              {activeSection === 'coverLetters' && (
                <CoverLetterAssociationSection
                  resumeId={resume.id}
                  coverLetters={coverLetters}
                  unlinkedCoverLetters={unlinkedCoverLetters}
                  locale={locale}
                  dict={dict}
                  onAssociate={handleAssociateCoverLetter}
                />
              )}
              {activeSection === 'editSidebar' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-2">
                      {dict.resumes?.editor?.editSidebar || 'Edit Sidebar'}
                    </h2>
                    <p className="text-sm text-slate-600 mb-4">
                      {dict.resumes?.editor?.editSidebarDescription || 'Drag and drop to reorder sidebar sections'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {sidebarOrder.map((sectionId, index) => {
                      const sectionLabels: Record<SidebarSectionId, string> = {
                        keyAchievements: dict.resumes?.template?.keyAchievements || 'Réalisations Clés',
                        skills: dict.resumes?.template?.skills || 'Compétences',
                        languages: dict.resumes?.template?.languages || 'Langues',
                        training: dict.resumes?.template?.training || 'Formation / Cours',
                      }
                      const isHidden = hiddenSidebarSections.includes(sectionId)
                      return (
                        <div
                          key={sectionId}
                          draggable={!isHidden}
                          onDragStart={() => !isHidden && setDraggedSection(sectionId)}
                          onDragEnd={() => setDraggedSection(null)}
                          onDragOver={(e) => {
                            e.preventDefault()
                            if (draggedSection && draggedSection !== sectionId && !isHidden) {
                              const newOrder = [...sidebarOrder]
                              const draggedIndex = newOrder.indexOf(draggedSection)
                              const targetIndex = newOrder.indexOf(sectionId)
                              newOrder.splice(draggedIndex, 1)
                              newOrder.splice(targetIndex, 0, draggedSection)
                              setSidebarOrder(newOrder)
                            }
                          }}
                          className={`flex items-center gap-3 p-3 bg-white border rounded-lg transition-all ${
                            isHidden
                              ? 'opacity-50 border-slate-200 bg-slate-50'
                              : draggedSection === sectionId
                                ? 'opacity-50 border-teal-500 bg-teal-50 cursor-grab active:cursor-grabbing'
                                : 'border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <GripVertical className={`h-5 w-5 ${isHidden ? 'text-slate-300' : 'text-slate-400'}`} />
                          <span className={`font-medium ${isHidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{sectionLabels[sectionId]}</span>
                          <span className="ml-auto flex items-center gap-2">
                            <span className={`text-xs ${isHidden ? 'text-slate-300' : 'text-slate-400'}`}>{index + 1}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isHidden) {
                                  setHiddenSidebarSections(prev => prev.filter(id => id !== sectionId))
                                } else {
                                  setHiddenSidebarSections(prev => [...prev, sectionId])
                                }
                              }}
                              className={`p-1 rounded hover:bg-slate-100 transition-colors ${isHidden ? 'text-slate-400' : 'text-slate-500'}`}
                              title={isHidden ? (dict?.aria?.showSection || 'Show section') : (dict?.aria?.hideSection || 'Hide section')}
                            >
                              {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {activeSection === 'editMainContent' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-2">
                      {dict.resumes?.editor?.editMainContent || 'Edit Main Content'}
                    </h2>
                    <p className="text-sm text-slate-600 mb-4">
                      {dict.resumes?.editor?.editMainContentDescription || 'Drag and drop to reorder main content sections'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {mainContentOrder.map((sectionId, index) => {
                      const sectionLabels: Record<MainContentSectionId, string> = {
                        summary: dict.resumes?.template?.summary || 'Résumé',
                        experience: dict.resumes?.template?.experience || 'Expérience',
                        education: dict.resumes?.template?.education || 'Formation',
                      }
                      const isHidden = hiddenMainSections.includes(sectionId)
                      return (
                        <div
                          key={sectionId}
                          draggable={!isHidden}
                          onDragStart={() => !isHidden && setDraggedMainSection(sectionId)}
                          onDragEnd={() => setDraggedMainSection(null)}
                          onDragOver={(e) => {
                            e.preventDefault()
                            if (draggedMainSection && draggedMainSection !== sectionId && !isHidden) {
                              const newOrder = [...mainContentOrder]
                              const draggedIndex = newOrder.indexOf(draggedMainSection)
                              const targetIndex = newOrder.indexOf(sectionId)
                              newOrder.splice(draggedIndex, 1)
                              newOrder.splice(targetIndex, 0, draggedMainSection)
                              setMainContentOrder(newOrder)
                            }
                          }}
                          className={`flex items-center gap-3 p-3 bg-white border rounded-lg transition-all ${
                            isHidden
                              ? 'opacity-50 border-slate-200 bg-slate-50'
                              : draggedMainSection === sectionId
                                ? 'opacity-50 border-teal-500 bg-teal-50 cursor-grab active:cursor-grabbing'
                                : 'border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <GripVertical className={`h-5 w-5 ${isHidden ? 'text-slate-300' : 'text-slate-400'}`} />
                          <span className={`font-medium ${isHidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{sectionLabels[sectionId]}</span>
                          <span className="ml-auto flex items-center gap-2">
                            <span className={`text-xs ${isHidden ? 'text-slate-300' : 'text-slate-400'}`}>{index + 1}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isHidden) {
                                  setHiddenMainSections(prev => prev.filter(id => id !== sectionId))
                                } else {
                                  setHiddenMainSections(prev => [...prev, sectionId])
                                }
                              }}
                              className={`p-1 rounded hover:bg-slate-100 transition-colors ${isHidden ? 'text-slate-400' : 'text-slate-500'}`}
                              title={isHidden ? (dict?.aria?.showSection || 'Show section') : (dict?.aria?.hideSection || 'Hide section')}
                            >
                              {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
            {/* Sliders Container - NOT scaled, fixed 15px gaps */}
            <div className="flex justify-center" style={{ marginBottom: '15px' }}>
              <div style={{ width: `${816 * previewScale}px` }} className="flex">
                {/* Left column: Sidebar sliders (30%) - independent stacking */}
                <div style={{ width: '30%', paddingRight: '8px' }} className="flex flex-col justify-end">
                  {/* Brightness Slider - fixed 15px above Color slider */}
                  <div style={{ marginBottom: '15px' }}>
                    <div className="flex items-center gap-2">
                      {/* Small sun icon (dim) */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                        <circle cx="12" cy="12" r="4"/>
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                      </svg>
                      <input
                        type="range"
                        min="20"
                        max="50"
                        value={sidebarBrightness}
                        onChange={(e) => setSidebarBrightness(parseInt(e.target.value))}
                        className="brightness-slider"
                        style={{
                          flex: 1,
                          height: '20px',
                          appearance: 'none',
                          background: `linear-gradient(to right, hsl(${sidebarHue}, 85%, 20%), hsl(${sidebarHue}, 85%, 50%))`,
                          borderRadius: '10px',
                          cursor: `url('/hand-cursor.png') 16 0, pointer`,
                        }}
                      />
                      {/* Large sun icon (bright) */}
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                        <circle cx="12" cy="12" r="4"/>
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                      </svg>
                    </div>
                  </div>
                  {/* Color Slider - Above sidebar */}
                  <div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={sidebarHue}
                      onChange={(e) => setSidebarHue(parseInt(e.target.value))}
                      className="color-slider"
                      style={{
                        width: '100%',
                        height: '24px',
                        appearance: 'none',
                        background: `linear-gradient(to right, hsl(0, 85%, ${sidebarBrightness}%), hsl(60, 85%, ${sidebarBrightness}%), hsl(120, 85%, ${sidebarBrightness}%), hsl(180, 85%, ${sidebarBrightness}%), hsl(240, 85%, ${sidebarBrightness}%), hsl(300, 85%, ${sidebarBrightness}%), hsl(360, 85%, ${sidebarBrightness}%))`,
                        borderRadius: '12px',
                        cursor: `url('/hand-cursor.png') 16 0, pointer`,
                      }}
                    />
                  </div>
                </div>
                {/* Right column: Main content sliders (70%) - independent stacking */}
                <div style={{ width: '70%', paddingLeft: '8px' }} className="flex flex-col justify-end">
                  {/* 3D Font Carousel - Above Font Size slider */}
                  <div style={{ marginBottom: '15px' }}>
                    <FontCarousel3D
                      selectedFont={fontFamily}
                      onFontChange={setFontFamily}
                    />
                  </div>
                  {/* Font Size Slider - Above main content */}
                  <div>
                    <input
                      type="range"
                      min="0.7"
                      max="1.3"
                      step="0.01"
                      value={fontScale}
                      onChange={(e) => setFontScale(parseFloat(e.target.value))}
                      className="font-slider"
                      style={{
                        width: '100%',
                        height: '24px',
                        appearance: 'none',
                        background: 'linear-gradient(to right, #e2e8f0, #64748b)',
                        borderRadius: '12px',
                        cursor: `url('/hand-cursor.png') 16 0, pointer`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

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
                  sidebarColor={sidebarColor}
                  fontScale={fontScale}
                  fontFamily={fontFamily}
                  sidebarOrder={sidebarOrder}
                  mainContentOrder={mainContentOrder}
                  sidebarTopMargin={sidebarTopMargin}
                  setSidebarTopMargin={setSidebarTopMargin}
                  mainContentTopMargin={mainContentTopMargin}
                  setMainContentTopMargin={setMainContentTopMargin}
                  sidebarWidth={sidebarWidth}
                  setSidebarWidth={setSidebarWidth}
                  hiddenSidebarSections={hiddenSidebarSections}
                  hiddenMainSections={hiddenMainSections}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CV Adaptation Modal */}
      <CVAdaptationModal
        isOpen={showAdaptationModal}
        onClose={() => {
          setShowAdaptationModal(false)
          // Reset pre-filled values when modal closes
          setAdaptationJobDescription('')
          setAdaptationJobTitle('')
          setAdaptationCompany('')
        }}
        resumeId={resume.id}
        initialJobDescription={adaptationJobDescription}
        initialJobTitle={adaptationJobTitle}
        initialCompany={adaptationCompany}
        locale={locale}
        onApplyChanges={handleApplyChanges}
        dict={dict?.cvAdaptation}
      />
    </div>
  )
}
