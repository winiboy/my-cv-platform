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
import type { EditorMainId, EditorSidebarId } from '@/lib/layout-settings'
import {
  templateEditorSections,
  listedEditorSections,
  templateDrawsPhoto,
  templateOffersLayoutControl,
} from '@/lib/layout-settings'
import { withContactFieldVisible, type ContactFieldId } from '@/lib/contact-visibility'
import { useResumeLayout } from '@/lib/hooks/use-resume-layout'
import { resolveResumeTemplate } from '@/lib/resume-templates'
import { resumeSaveUpdates, resumeWithDraft } from '@/lib/resume-draft'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { EditorSectionTabs } from './editor-section-tabs'
import { ContactSection } from './resume-sections/contact-section'
import { SummarySection } from './resume-sections/summary-section'
import { ExperienceSection } from './resume-sections/experience-section'
import { EducationSection } from './resume-sections/education-section'
import { SkillsSection } from './resume-sections/skills-section'
import { LanguagesSection } from './resume-sections/languages-section'
import { CertificationsSection } from './resume-sections/certifications-section'
import { ProjectsSection } from './resume-sections/projects-section'
import { CoverLetterAssociationSection } from './resume-sections/cover-letter-association-section'
import { JobAssociationSection } from './cover-letter-sections/job-association-section'
import { SwissVocationalTemplate } from './resume-templates/swiss-vocational-template'
import { SwissCommerceTemplate } from './resume-templates/swiss-commerce-template'
import { SwissTradesTemplate } from './resume-templates/swiss-trades-template'
import { SwissHealthTemplate } from './resume-templates/swiss-health-template'
import { SwissFinanceTemplate } from './resume-templates/swiss-finance-template'
import { SwissEngineeringTemplate } from './resume-templates/swiss-engineering-template'
import { SwissItTemplate } from './resume-templates/swiss-it-template'
import { SwissExecutiveTemplate } from './resume-templates/swiss-executive-template'
import { SwissAcademicTemplate } from './resume-templates/swiss-academic-template'
import { SwissFirstJobTemplate } from './resume-templates/swiss-first-job-template'
import { ResumePageBreakIndicators } from './resume-page-break-indicators'
import { CVAdaptationModal } from './cv-adaptation-modal'
import type { CVAdaptationStrings } from '@/lib/cv-adaptation-strings'
import { QualityWarningBanner } from './quality-warning-banner'
import { QualityScoreBadge } from './quality-score-badge'
import { GapAnalysisPanel } from './gap-analysis-panel'
import { GenerationProgress } from './generation-progress'
import { BelowThresholdWarning } from './below-threshold-warning'
import { QUALITY_THRESHOLD } from '@/lib/constants'
import type { QualityAnalysis } from '@/types/quality-analysis'
import type { CVAdaptationPatch } from '@/types/cv-adaptation'

interface JobApplicationItem {
  id: string
  company_name: string
  job_title: string
  job_url: string | null
}

interface ResumeEditorProps {
  resume: Resume
  locale: Locale
  dict: any
  /**
   * The adaptation modal's strings and the editor's own "Adapt to Job" button
   * and success alert. They live in `jobs.json`, which `dict` (`common.json`)
   * does not carry, so the page selects them with `cvAdaptationStrings`.
   */
  cvAdaptation: CVAdaptationStrings
  linkedCoverLetters?: { id: string; title: string; company_name: string | null; job_title: string | null }[]
  unlinkedCoverLetters?: { id: string; title: string; company_name: string | null }[]
  currentJobApplicationId?: string | null
  currentJobApplication?: JobApplicationItem | null
  jobApplications?: JobApplicationItem[]
  /** Optional quality analysis from CV generation - used to populate quality UI components */
  qualityAnalysis?: QualityAnalysis | null
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
  { id: 'jobApplication' as const, label: 'Linked Job', icon: Briefcase },
  { id: 'coverLetters' as const, label: 'Cover Letters', icon: Mail },
  { id: 'editSidebar' as const, label: 'Edit Sidebar', icon: LayoutList },
  { id: 'editMainContent' as const, label: 'Edit Main Content', icon: LayoutList },
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

export function ResumeEditor({ resume: initialResume, locale, dict, cvAdaptation, linkedCoverLetters, unlinkedCoverLetters: initialUnlinkedCoverLetters, currentJobApplicationId: initialJobAppId, currentJobApplication: initialJobApp, jobApplications: initialJobApps, qualityAnalysis: initialQualityAnalysis }: ResumeEditorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [resume, setResume] = useState(initialResume)
  const resumeRef = useRef(resume) // Track latest resume to avoid stale closures
  // Initialize active section from URL query param or default to 'contact'
  const initialSection = searchParams?.get('section') as SectionId | null
  const [activeSection, setActiveSection] = useState<SectionId>(
    initialSection && SECTIONS.some(s => s.id === initialSection) ? initialSection : 'contact'
  )

  // Part 3 US-014: which layout controls this template applies, from the one
  // template x control matrix in `layout-settings.ts`. DERIVED, never stored and
  // never written back — a control that is not offered leaves the model's value
  // exactly where it is, so selecting a template that reads it again shows it
  // unchanged. Nothing below may clear or rewrite a value because it is hidden.
  const offersSidebarSections = templateOffersLayoutControl(resume.template, 'sidebarSections')
  // FR-14: the Contact tab's photo row, only where the template draws a photo.
  const drawsPhoto = templateDrawsPhoto(resume.template)
  /**
   * Part 3 US-015 criterion 7: the rows each panel LISTS while this template
   * is selected, and which of them can be dragged. A display filter only —
   * the drag handlers below still splice the full stored order, so an id that
   * is not listed keeps the position it already has and applies again the
   * moment a template that renders it is selected (FR-6, FR-9).
   */
  const editorSections = templateEditorSections(resume.template)

  // The nav entries this template can act on. `editSidebar` reorders and hides
  // sidebar sections; it is listed only for a template that offers that panel.
  const visibleSections = SECTIONS.filter(
    (section) => section.id !== 'editSidebar' || offersSidebarSections,
  )

  // A section can stop being offered while it is open — a saved URL names it, or
  // the resume's template is not the one it was opened under. Falling back at
  // RENDER rather than resetting the state keeps the user's place if they return
  // to a template that offers it, and touches no editing state.
  const shownSection: SectionId = visibleSections.some((section) => section.id === activeSection)
    ? activeSection
    : 'contact'

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [modifiedSections, setModifiedSections] = useState<Set<SectionId>>(new Set())
  const [showAdaptationModal, setShowAdaptationModal] = useState(false)

  // CV generation progress state (placeholder for US-017 wiring)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationIteration, setGenerationIteration] = useState(1)

  // Quality analysis state - initialized from prop if provided
  const [qualityAnalysis, setQualityAnalysis] = useState<QualityAnalysis | null>(initialQualityAnalysis || null)

  // Below-threshold warning state
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Cover letter association state
  const [coverLetters, setCoverLetters] = useState(linkedCoverLetters || [])
  const [unlinkedCoverLetters, setUnlinkedCoverLetters] = useState(initialUnlinkedCoverLetters || [])

  // Job association state
  const [currentJobApplicationId, setCurrentJobApplicationId] = useState<string | null>(initialJobAppId || null)
  const [currentJobApplication, setCurrentJobApplication] = useState<JobApplicationItem | null>(initialJobApp || null)
  const [jobApplications, setJobApplications] = useState<JobApplicationItem[]>(initialJobApps || [])

  // State for pre-filling the adaptation modal from a linked job (used by header button only)
  const [adaptationJobDescription, setAdaptationJobDescription] = useState('')
  const [adaptationJobTitle, setAdaptationJobTitle] = useState('')
  const [adaptationCompany, setAdaptationCompany] = useState('')

  /**
   * Layout state for the Live Preview.
   *
   * NOT declared here. `useResumeLayout` owns it, loads it from the two
   * persisted stores and the browser cache, caches it and persists it — and
   * `resume-preview-wrapper.tsx` calls the same hook, so the editor and the
   * preview cannot hold different answers. Re-introducing a `useState` for any
   * of these nineteen properties would recreate the second authoritative copy
   * US-002 removed.
   *
   * The values and setters are unpacked into locals of the names the render
   * below already used, so the templates and their controls are reached exactly
   * as before. Properties no Swiss template draws and no editor control writes
   * (the font family and scale, the sidebar colour, the gaps, the per-property
   * sizes and the sidebar geometry) are not unpacked; they are still part of
   * the model the hook holds, caches and persists.
   *
   * `initialResume` rather than the `resume` state: every store handed to the
   * loader must describe the row the server sent, and `resume` is state that a
   * `resume_draft_${id}` blob replaces on mount.
   */
  const { layout, setters: layoutSetters } = useResumeLayout(initialResume.id, initialResume)
  const {
    sidebarOrder,
    mainContentOrder,
    hiddenSidebarSections,
    hiddenMainSections,
    hiddenContactFields,
  } = layout
  const {
    setSidebarOrder,
    setMainContentOrder,
    setHiddenSidebarSections,
    setHiddenMainSections,
    setHiddenContactFields,
  } = layoutSetters
  const listedSidebarSections = listedEditorSections(sidebarOrder, editorSections.sidebar, editorSections.fixed)
  const listedMainSections = listedEditorSections(mainContentOrder, editorSections.main, editorSections.fixed)

  const [draggedSection, setDraggedSection] = useState<EditorSidebarId | null>(null)
  const [draggedMainSection, setDraggedMainSection] = useState<EditorMainId | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string>('')

  // Keep resumeRef in sync with resume state
  useEffect(() => {
    resumeRef.current = resume
  }, [resume])

  const handlePhotoChange = useCallback((dataUrl: string) => {
    setPhotoUrl(dataUrl)
    try {
      localStorage.setItem(`resume_photo_${resume.id}`, dataUrl)
    } catch {
      alert('Failed to save photo. Image may be too large.')
    }
  }, [resume.id])

  const handleContactFieldVisibleChange = useCallback(
    (field: ContactFieldId, visible: boolean) => {
      // Unchanged state is handed back as is, so a no-op tick re-renders nothing.
      setHiddenContactFields((hidden) =>
        hidden.includes(field) === !visible ? hidden : withContactFieldVisible(hidden, field, visible),
      )
    },
    [setHiddenContactFields],
  )

  // Uploading a photo ticks it on (FR-14): whoever uploads one wants to see it.
  const handleNewPhotoUpload = useCallback((dataUrl: string) => {
    handlePhotoChange(dataUrl)
    handleContactFieldVisibleChange('photo', true)
  }, [handlePhotoChange, handleContactFieldVisibleChange])

  // Resizable split pane state
  const [splitPosition, setSplitPosition] = useState(50) // Percentage
  const [isDragging, setIsDragging] = useState(false)
  const [previewScale, setPreviewScale] = useState(0.85)
  // Unscaled height of the previewed document. A CSS transform does not change
  // the layout box, so the wrapper is sized from this to drop the blank space
  // the unscaled height would otherwise leave below the scaled page.
  const [previewDocHeight, setPreviewDocHeight] = useState<number | null>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const previewDocumentRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError('')

    try {
      const supabase = createClient()

      const updates = resumeSaveUpdates(resume)

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
   * Performs bidirectional database sync: updates both resumes.job_application_id
   * and job_applications.resume_id to maintain data integrity.
   */
  const handleJobApplicationChange = useCallback(async (jobApplicationId: string | null) => {
    const supabase = createClient()
    const previousJobId = currentJobApplicationId

    if (jobApplicationId) {
      // Linking a new job
      // Step 1: Update the resume to link to the job
      const { error: resumeError } = await supabase
        .from('resumes')
        .update({ job_application_id: jobApplicationId })
        .eq('id', resume.id)

      if (resumeError) {
        console.error('Error linking job to resume:', resumeError)
        throw resumeError
      }

      // Step 2: Update the job application to link back to this resume
      const { error: jobError } = await supabase
        .from('job_applications')
        .update({ resume_id: resume.id })
        .eq('id', jobApplicationId)

      if (jobError) {
        console.error('Error updating job application reverse link:', jobError)
        // Rollback: revert the resume update
        await supabase
          .from('resumes')
          .update({ job_application_id: previousJobId })
          .eq('id', resume.id)
        throw jobError
      }

      // Step 3: If there was a previously linked job, clear its reverse link
      if (previousJobId && previousJobId !== jobApplicationId) {
        await supabase
          .from('job_applications')
          .update({ resume_id: null })
          .eq('id', previousJobId)
      }

      // Update local state
      const newJob = jobApplications.find((j) => j.id === jobApplicationId)
      if (newJob) {
        setCurrentJobApplication(newJob)
        setCurrentJobApplicationId(jobApplicationId)
      }
    } else {
      // Unlinking the current job
      // Step 1: Clear the resume's link
      const { error: resumeError } = await supabase
        .from('resumes')
        .update({ job_application_id: null })
        .eq('id', resume.id)

      if (resumeError) {
        console.error('Error unlinking job from resume:', resumeError)
        throw resumeError
      }

      // Step 2: Clear the job application's reverse link
      if (previousJobId) {
        const { error: jobError } = await supabase
          .from('job_applications')
          .update({ resume_id: null })
          .eq('id', previousJobId)

        if (jobError) {
          console.error('Error clearing job application reverse link:', jobError)
          // Rollback: restore the resume's link
          await supabase
            .from('resumes')
            .update({ job_application_id: previousJobId })
            .eq('id', resume.id)
          throw jobError
        }
      }

      // Update local state
      setCurrentJobApplication(null)
      setCurrentJobApplicationId(null)
    }
  }, [currentJobApplicationId, resume.id, jobApplications])


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
        alert(cvAdaptation.successMessage)
      }, 100)
    } else {
      console.log('No updates to apply') // Debug log
    }

    setShowAdaptationModal(false)
  }, [updateResume, cvAdaptation])

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
    // The container's padding is responsive, so read it rather than assume it.
    const { paddingLeft, paddingRight } = window.getComputedStyle(container)
    const containerWidth =
      container.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight)

    // The page the templates draw on; see src/lib/resume-page-size.ts.
    const cvWidth = PAGE_WIDTH_PX

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

  // Track the document's unscaled height so the preview wrapper follows the
  // content as it grows or shrinks. offsetHeight ignores the transform.
  useEffect(() => {
    const element = previewDocumentRef.current
    if (!element) return

    const measure = () => setPreviewDocHeight(element.offsetHeight)
    measure()

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [])

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = localStorage.getItem(`resume_draft_${resume.id}`)
    if (draft) {
      try {
        // The stored row keeps its template; see `resumeWithDraft`. On mount
        // the ref still holds the row the server sent.
        setResume(resumeWithDraft(resumeRef.current, JSON.parse(draft)))
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

    // The layout model is NOT loaded here. `useResumeLayout` above reads the
    // two persisted stores and the browser cache, resolves them and runs the
    // one-time adoption, in its own mount effect keyed on the same resume.
    // What remains below is the state this surface owns alone: the draft, the
    // modified-section markers and the photo.

    try {
      const savedPhoto = localStorage.getItem(`resume_photo_${resume.id}`)
      if (savedPhoto) setPhotoUrl(savedPhoto)
    } catch {}

    // Mount-only, keyed on the resume rather than on prop changes.
  }, [resume.id])

  // Clear localStorage after successful save
  useEffect(() => {
    if (!hasUnsavedChanges && lastSaved) {
      localStorage.removeItem(`resume_draft_${resume.id}`)
      localStorage.removeItem(`resume_modified_sections_${resume.id}`)
    }
  }, [hasUnsavedChanges, lastSaved, resume.id])

  // The layout model is not assembled here, cached here or persisted here.
  // `useResumeLayout` holds it as one object and owns all three — see the hook
  // call at the top of this component. It carries all nineteen properties,
  // including the seven typography sizes and gaps, exactly as this file did
  // before the state moved.

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
    // Below xl the panels stack and the page scrolls; from xl up the editor
    // fills the viewport and each pane scrolls on its own.
    <div className="flex flex-col xl:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <button
            onClick={() => router.push(`/${locale}/dashboard/resumes`)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {dict.common?.back || 'Back'}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="break-words text-xl font-bold text-slate-900">{resume.title}</h1>
              <QualityScoreBadge
                score={qualityAnalysis?.score ?? 0}
                isVisible={Boolean(currentJobApplicationId) && qualityAnalysis !== null}
              />
            </div>
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
        <div className="flex flex-wrap items-center gap-3">
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
            {cvAdaptation.adaptToJob}
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

      {/* Quality Warning Banner - shown when CV was created from a job with limited description */}
      <QualityWarningBanner
        isVisible={Boolean(currentJobApplicationId)}
        message={dict?.resumes?.editor?.qualityWarning || 'The job description is limited. CV quality may be affected.'}
        className="mx-6 mt-3"
      />

      {/* Generation Progress - shows iteration count during CV generation */}
      {isGenerating && (
        <div className="mx-6 mt-3">
          <GenerationProgress
            isVisible={isGenerating}
            currentIteration={generationIteration}
            maxIterations={3}
          />
        </div>
      )}

      {/* Below Threshold Warning - shows when CV quality is below target */}
      <BelowThresholdWarning
        isVisible={Boolean(currentJobApplicationId) && qualityAnalysis !== null && qualityAnalysis.score < QUALITY_THRESHOLD}
        score={qualityAnalysis?.score ?? 0}
        threshold={QUALITY_THRESHOLD}
        onRegenerate={() => {
          // Placeholder: will be wired to actual regeneration logic in a follow-up story
          setIsRegenerating(true)
          setTimeout(() => setIsRegenerating(false), 2000)
        }}
        isRegenerating={isRegenerating}
        className="mx-6 mt-3"
      />

      {/* Gap Analysis Panel - shows matched/missing items when CV was created from a job */}
      <GapAnalysisPanel
        isVisible={Boolean(currentJobApplicationId) && qualityAnalysis !== null}
        matchedItems={qualityAnalysis?.matchedItems ?? []}
        missingItems={qualityAnalysis?.missingItems ?? []}
        className="mx-6 mt-3"
      />

      {/* Editor Layout */}
      <div ref={containerRef} className="flex flex-1 flex-col xl:flex-row xl:overflow-hidden">
        {/* Sidebar Navigation - a horizontally scrolling strip below xl */}
        <div
          data-testid="resume-editor-section-nav"
          className="border-b border-slate-200 bg-slate-50 xl:w-64 xl:border-b-0 xl:border-r"
        >
          <EditorSectionTabs
            tabs={visibleSections.map((section) => ({
              id: section.id,
              label: dict.resumes?.editor?.sections?.[section.id] || section.label,
              icon: section.icon,
              isModified: modifiedSections.has(section.id),
            }))}
            activeId={shownSection}
            onSelect={setActiveSection}
            xlPadding="xl:p-4"
          />
        </div>

        {/* Split Content Area: Editor (Left) + Live Preview (Right) */}
        {/* Below xl the editor stacks above the preview and the split widths do not apply. */}
        <div
          className="relative flex flex-1 flex-col xl:flex-row xl:overflow-hidden"
          style={
            {
              '--editor-pane-width': `${splitPosition}%`,
              '--preview-pane-width': `${100 - splitPosition}%`,
            } as React.CSSProperties
          }
        >
          {/* Left: Editor */}
          <div
            data-testid="resume-editor-panel"
            className="w-full bg-white p-4 sm:p-6 xl:w-[var(--editor-pane-width)] xl:overflow-y-auto xl:p-8"
          >
            <div className="mx-auto max-w-xl">
              {shownSection === 'contact' && (
                <ContactSection
                  resume={resume}
                  updateResume={updateResume}
                  dict={dict}
                  hiddenContactFields={hiddenContactFields}
                  onContactFieldVisibleChange={handleContactFieldVisibleChange}
                  photo={drawsPhoto ? { url: photoUrl, onChange: handleNewPhotoUpload } : undefined}
                />
              )}
              {shownSection === 'summary' && (
                <SummarySection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {shownSection === 'experience' && (
                <ExperienceSection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {shownSection === 'education' && (
                <EducationSection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {shownSection === 'skills' && (
                <SkillsSection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {shownSection === 'languages' && (
                <LanguagesSection resume={resume} updateResume={updateResume} dict={dict} />
              )}
              {shownSection === 'certifications' && (
                <CertificationsSection resume={resume} updateResume={updateResume} dict={dict} />
              )}
              {shownSection === 'projects' && (
                <ProjectsSection resume={resume} updateResume={updateResume} dict={dict} locale={locale} />
              )}
              {shownSection === 'jobApplication' && (
                <JobAssociationSection
                  currentJobApplicationId={currentJobApplicationId}
                  currentJobApplication={currentJobApplication}
                  jobApplications={jobApplications}
                  locale={locale}
                  dict={dict}
                  onJobApplicationChange={handleJobApplicationChange}
                />
              )}
              {shownSection === 'coverLetters' && (
                <CoverLetterAssociationSection
                  resumeId={resume.id}
                  coverLetters={coverLetters}
                  unlinkedCoverLetters={unlinkedCoverLetters}
                  locale={locale}
                  dict={dict}
                  onAssociate={handleAssociateCoverLetter}
                />
              )}
              {shownSection === 'editSidebar' && (
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
                    {listedSidebarSections.map((sectionId, index) => {
                      const sectionLabels: Record<EditorSidebarId, string> = {
                        keyAchievements: dict.resumes?.template?.keyAchievements || 'Réalisations Clés',
                        skills: dict.resumes?.template?.skills || 'Compétences',
                        languages: dict.resumes?.template?.languages || 'Langues',
                        training: dict.resumes?.template?.training || 'Formation / Cours',
                      }
                      const isHidden = hiddenSidebarSections.includes(sectionId)
                      // Part 3 US-015: a row the template draws in a fixed place keeps its
                      // visibility toggle and loses its drag handle.
                      const isFixed = editorSections.fixed.includes(sectionId)
                      const isDraggable = !isHidden && !isFixed
                      return (
                        <div
                          key={sectionId}
                          draggable={isDraggable}
                          onDragStart={() => isDraggable && setDraggedSection(sectionId)}
                          onDragEnd={() => setDraggedSection(null)}
                          onDragOver={(e) => {
                            e.preventDefault()
                            if (draggedSection && draggedSection !== sectionId && isDraggable) {
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
                                : isFixed
                                  ? 'border-slate-200 cursor-default'
                                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <GripVertical className={`h-5 w-5 ${isHidden || isFixed ? 'text-slate-300' : 'text-slate-400'}`} />
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
              {shownSection === 'editMainContent' && (
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
                    {listedMainSections.map((sectionId, index) => {
                      const sectionLabels: Record<EditorMainId, string> = {
                        summary: dict.resumes?.template?.summary || 'Résumé',
                        experience: dict.resumes?.template?.experience || 'Expérience',
                        education: dict.resumes?.template?.education || 'Formation',
                      }
                      const isHidden = hiddenMainSections.includes(sectionId)
                      // Part 3 US-015: a row the template draws in a fixed place keeps its
                      // visibility toggle and loses its drag handle.
                      const isFixed = editorSections.fixed.includes(sectionId)
                      const isDraggable = !isHidden && !isFixed
                      return (
                        <div
                          key={sectionId}
                          draggable={isDraggable}
                          onDragStart={() => isDraggable && setDraggedMainSection(sectionId)}
                          onDragEnd={() => setDraggedMainSection(null)}
                          onDragOver={(e) => {
                            e.preventDefault()
                            if (draggedMainSection && draggedMainSection !== sectionId && isDraggable) {
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
                                : isFixed
                                  ? 'border-slate-200 cursor-default'
                                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <GripVertical className={`h-5 w-5 ${isHidden || isFixed ? 'text-slate-300' : 'text-slate-400'}`} />
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
            className={`hidden w-1 bg-slate-300 hover:bg-teal-500 cursor-col-resize transition-colors xl:block ${
              isDragging ? 'bg-teal-500' : ''
            }`}
            style={{ flexShrink: 0 }}
          />

          {/* Right: Live Preview */}
          <div
            ref={previewContainerRef}
            data-testid="resume-editor-preview"
            // The always-on vertical scrollbar keeps the pane's width independent
            // of whether it overflows. Otherwise the scale (derived from that
            // width) and the frame height (derived from the scale) can toggle
            // the scrollbar on and off indefinitely at the overflow edge.
            className="w-full overflow-x-hidden bg-slate-100 p-4 sm:p-6 xl:w-[var(--preview-pane-width)] xl:overflow-x-auto xl:overflow-y-scroll xl:p-8"
          >
            <div
              data-testid="resume-editor-preview-frame"
              className="flex items-start justify-center"
              style={
                previewDocHeight === null
                  ? undefined
                  : { height: `${previewDocHeight * previewScale}px` }
              }
            >
              <div
                ref={previewDocumentRef}
                style={{
                  width: `${PAGE_WIDTH_PX}px`,
                  flexShrink: 0,
                  transformOrigin: 'top center',
                  transform: `scale(${previewScale})`,
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                }}
              >
                {(() => {
                  // An id outside the ten is drawn as the default template, as in
                  // the Preview and the Word export (FR-1).
                  switch (resolveResumeTemplate(resume.template)) {
                    case 'swissVocational':
                      return (
                        // The photo is uploaded from the Contact tab's photo row, not from
                        // the CV (FR-5). Its own typeface and sizes: no font, no scale (FR-4).
                        <SwissVocationalTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                    case 'swissCommerce':
                      return (
                        // As swissVocational: photo from the Contact tab, own typeface and sizes.
                        <SwissCommerceTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                    case 'swissTrades':
                      return (
                        // As swissVocational: photo from the Contact tab, own typeface and sizes.
                        <SwissTradesTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                    case 'swissHealth':
                      return (
                        // As swissVocational: photo from the Contact tab, own typeface and sizes.
                        <SwissHealthTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                    case 'swissFinance':
                      return (
                        // As swissVocational: photo from the Contact tab, own typeface and sizes.
                        <SwissFinanceTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                    case 'swissEngineering':
                      return (
                        // As swissVocational: photo from the Contact tab, own typeface and sizes.
                        <SwissEngineeringTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                    case 'swissIt':
                      return (
                        // As swissVocational: photo from the Contact tab, own typeface and sizes.
                        <SwissItTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                    case 'swissExecutive':
                      return (
                        // As swissVocational: photo from the Contact tab, own typeface and sizes.
                        <SwissExecutiveTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                    case 'swissAcademic':
                      return (
                        // As swissVocational, own typeface and sizes; it draws no photo,
                        // so it is handed none (PRD FR-5 exception).
                        <SwissAcademicTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                        />
                      )
                    case 'swissFirstJob':
                      return (
                        // As swissVocational: photo from the Contact tab, own typeface and sizes.
                        <SwissFirstJobTemplate
                          resume={resume}
                          locale={locale}
                          dict={dict}
                          hiddenMainSections={hiddenMainSections}
                          hiddenSidebarSections={hiddenSidebarSections}
                          hiddenContactFields={hiddenContactFields}
                          photoUrl={photoUrl}
                        />
                      )
                  }
                })()}
                {/* The wrapper's transform makes it the containing block, so the
                    overlay shares the page's unscaled coordinates. */}
                <ResumePageBreakIndicators
                  documentHeight={previewDocHeight}
                  scale={previewScale}
                  labelTemplate={dict.resumes.pageBreakLabel}
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
        dict={cvAdaptation}
      />
    </div>
  )
}
