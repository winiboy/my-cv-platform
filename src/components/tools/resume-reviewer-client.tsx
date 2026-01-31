'use client'

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type DragEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  FileText,
  Upload,
  FolderOpen,
  ClipboardPaste,
  File,
  X,
  Loader2,
  AlertCircle,
  Plus,
  ChevronDown,
  ChevronRight,
  Briefcase,
  CheckCircle2,
  TrendingUp,
  Target,
  Zap,
  Scissors,
  Palette,
  LayoutGrid,
  Star,
  Lightbulb,
  ThumbsUp,
  AlertTriangle,
  RotateCcw,
  Link as LinkIcon,
  Globe,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  ResumeLinker,
  type ResumeLinkerTranslations,
} from './resume-linker'
import {
  JobLinker,
  type JobLinkerTranslations,
} from './job-linker'
import type { Resume } from '@/types/database'
import type {
  ResumeContact,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
  ResumeLanguage,
  ResumeCertification,
  ResumeProject,
} from '@/types/database'

/**
 * Maximum file size in bytes (5MB).
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * Category result from the resume review API.
 */
interface CategoryResult {
  name: string
  score: number
  feedback: string[]
}

/**
 * Job match result from the resume review API (when job description provided).
 */
interface JobMatchResult {
  score: number
  matchedKeywords: string[]
  missingKeywords: string[]
  suggestions: string[]
}

/**
 * Complete analysis result from the /api/tools/review-resume endpoint.
 */
interface ResumeReviewResult {
  overallScore: number
  categories: CategoryResult[]
  suggestions: string[]
  jobMatch?: JobMatchResult
  analyzedAt: string
}

/**
 * API response shape from the review-resume endpoint.
 */
interface ReviewResumeResponse {
  success?: boolean
  overallScore?: number
  categories?: CategoryResult[]
  suggestions?: string[]
  jobMatch?: JobMatchResult
  analyzedAt?: string
  error?: string
  message?: string
  details?: Array<{ field: string; message: string }>
}

/**
 * Accepted file extensions (PDF and DOCX for Resume Reviewer).
 */
const ACCEPTED_EXTENSIONS = '.pdf,.docx'
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

/**
 * Minimum character count required for paste text analysis.
 */
const MIN_PASTE_CHARACTERS = 100

/**
 * Minimal resume data needed for the selector display.
 * Only fetches fields required for listing and selection.
 */
type ResumeSummary = Pick<Resume, 'id' | 'title' | 'updated_at' | 'created_at' | 'template'>

/**
 * Strips HTML tags from a string, converting it to plain text.
 * Used for extracting text content from rich text fields like skillsHtml.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Converts a resume's JSONB content to plain text for analysis.
 * Extracts and formats all relevant sections into a readable text format.
 */
function convertResumeToText(resume: Resume): string {
  const sections: string[] = []

  // Contact information
  const contact = resume.contact as ResumeContact | null
  if (contact) {
    const contactParts: string[] = []
    if (contact.name) contactParts.push(contact.name)
    if (contact.email) contactParts.push(contact.email)
    if (contact.phone) contactParts.push(contact.phone)
    if (contact.location) contactParts.push(contact.location)
    if (contact.linkedin) contactParts.push(`LinkedIn: ${contact.linkedin}`)
    if (contact.github) contactParts.push(`GitHub: ${contact.github}`)
    if (contact.website) contactParts.push(`Website: ${contact.website}`)
    if (contactParts.length > 0) {
      sections.push(`CONTACT\n${contactParts.join('\n')}`)
    }
  }

  // Summary
  if (resume.summary) {
    sections.push(`SUMMARY\n${resume.summary}`)
  }

  // Experience
  const experience = resume.experience as ResumeExperience[] | null
  if (experience && Array.isArray(experience) && experience.length > 0) {
    const experienceText = experience
      .filter((exp) => exp.visible !== false)
      .map((exp) => {
        const lines: string[] = []
        lines.push(`${exp.position} at ${exp.company}`)
        if (exp.location) lines.push(exp.location)
        const dateRange = exp.current
          ? `${exp.startDate} - Present`
          : `${exp.startDate} - ${exp.endDate || ''}`
        lines.push(dateRange)
        if (exp.description) lines.push(exp.description)
        if (exp.achievements && exp.achievements.length > 0) {
          lines.push(exp.achievements.map((a) => `- ${a}`).join('\n'))
        }
        return lines.join('\n')
      })
      .join('\n\n')
    sections.push(`EXPERIENCE\n${experienceText}`)
  }

  // Education
  const education = resume.education as ResumeEducation[] | null
  if (education && Array.isArray(education) && education.length > 0) {
    const educationText = education
      .filter((edu) => edu.visible !== false)
      .map((edu) => {
        const lines: string[] = []
        lines.push(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`)
        lines.push(edu.school)
        const dateRange = edu.endDate
          ? `${edu.startDate} - ${edu.endDate}`
          : edu.startDate
        lines.push(dateRange)
        if (edu.gpa) lines.push(`GPA: ${edu.gpa}`)
        if (edu.description) lines.push(edu.description)
        if (edu.achievements && edu.achievements.length > 0) {
          lines.push(edu.achievements.map((a) => `- ${a}`).join('\n'))
        }
        return lines.join('\n')
      })
      .join('\n\n')
    sections.push(`EDUCATION\n${educationText}`)
  }

  // Skills
  const skills = resume.skills as ResumeSkillCategory[] | null
  if (skills && Array.isArray(skills) && skills.length > 0) {
    const skillsText = skills
      .filter((skill) => skill.visible !== false)
      .map((skill) => {
        // Prefer skillsHtml if available, fall back to items array
        const skillContent = skill.skillsHtml
          ? stripHtmlTags(skill.skillsHtml)
          : skill.items?.join(', ') || ''
        return `${skill.category}: ${skillContent}`
      })
      .filter((text) => text.length > 2)
      .join('\n')
    if (skillsText) {
      sections.push(`SKILLS\n${skillsText}`)
    }
  }

  // Languages
  const languages = resume.languages as ResumeLanguage[] | null
  if (languages && Array.isArray(languages) && languages.length > 0) {
    const languagesText = languages
      .filter((lang) => lang.visible !== false)
      .map((lang) => `${lang.language} (${lang.level})`)
      .join(', ')
    if (languagesText) {
      sections.push(`LANGUAGES\n${languagesText}`)
    }
  }

  // Certifications
  const certifications = resume.certifications as ResumeCertification[] | null
  if (
    certifications &&
    Array.isArray(certifications) &&
    certifications.length > 0
  ) {
    const certsText = certifications
      .filter((cert) => cert.visible !== false)
      .map((cert) => {
        const parts = [cert.name, cert.issuer, cert.date]
        return parts.filter(Boolean).join(' - ')
      })
      .join('\n')
    if (certsText) {
      sections.push(`CERTIFICATIONS\n${certsText}`)
    }
  }

  // Projects
  const projects = resume.projects as ResumeProject[] | null
  if (projects && Array.isArray(projects) && projects.length > 0) {
    const projectsText = projects
      .filter((proj) => proj.visible !== false)
      .map((proj) => {
        const lines: string[] = [proj.name]
        if (proj.description) lines.push(proj.description)
        if (proj.technologies && proj.technologies.length > 0) {
          lines.push(`Technologies: ${proj.technologies.join(', ')}`)
        }
        return lines.join('\n')
      })
      .join('\n\n')
    if (projectsText) {
      sections.push(`PROJECTS\n${projectsText}`)
    }
  }

  return sections.join('\n\n')
}

/**
 * Combined translation interface for all Resume Reviewer UI strings.
 * This is passed from the server component which has access to translations.
 */
export interface ResumeReviewerTranslations {
  inputSection: string
  resultsSection: string
  tabLinkResume: string
  tabUploadFile: string
  tabPaste: string
  tabMyResumes: string
  uploadLabel: string
  dragDropText: string
  browseText: string
  acceptedFilesText: string
  pasteLabel: string
  pastePlaceholder: string
  selectResumeLabel: string
  selectResumePlaceholder: string
  reviewButton: string
  reviewingButton: string
  emptyStateTitle: string
  emptyStateDescription: string
  // File upload specific translations
  fileTooLargeError?: string
  unsupportedFileError?: string
  extractionFailedError?: string
  extractingText?: string
  removeFileLabel?: string
  fileSizeLimit?: string
  // Paste tab specific translations
  clearTextButton?: string
  characterCount?: string
  minCharactersWarning?: string
  // My Resumes tab translations
  loadingResumes?: string
  loadError?: string
  tryAgain?: string
  noResumesFound?: string
  noResumesDescription?: string
  createResume?: string
  updated?: string
  loginRequired?: string
  loadingResumeContent?: string
  resumeLoadError?: string
  extractedContent?: string
  charactersExtracted?: string
  // Job description section translations
  jobDescriptionSectionTitle?: string
  jobDescriptionLabel?: string
  jobDescriptionPlaceholder?: string
  jobDescriptionHint?: string
  jobDescriptionCharCount?: string
  jobDescriptionClear?: string
  // Analysis loading state translations
  analyzingMessage?: string
  analyzingHint?: string
  // Analysis results translations
  overallScoreLabel?: string
  categoriesLabel?: string
  suggestionsLabel?: string
  jobMatchLabel?: string
  jobMatchScore?: string
  matchedKeywordsLabel?: string
  missingKeywordsLabel?: string
  jobMatchSuggestionsLabel?: string
  analysisError?: string
  analyzeAgainButton?: string
  analyzedAtLabel?: string
  // Error state translations (US-012)
  errorGeneric?: string
  errorNetwork?: string
  errorServerBusy?: string
  errorResumeEmpty?: string
  errorResumeTooShort?: string
  errorParsingFailed?: string
  errorValidationFailed?: string
  errorClearAndRetry?: string
  // Score interpretation translations (US-008)
  scoreExcellent?: string
  scoreGood?: string
  scoreNeedsWork?: string
  scorePoor?: string
  // Category name translations (US-009)
  categoryImpact?: string
  categoryBrevity?: string
  categoryStyle?: string
  categorySections?: string
  categorySkills?: string
  // US-010: Expanded feedback translations
  showDetails?: string
  hideDetails?: string
  greatJob?: string
  feedbackItems?: string
  prioritySuggestion?: string
  keySuggestions?: string
  improvementAreas?: string
  strengthsIdentified?: string
  // US-013: Analyze Another reset button
  analyzeAnotherButton?: string
  // ResumeLinker translations
  resumeLinker: ResumeLinkerTranslations
  // JobLinker translations
  jobLinker: JobLinkerTranslations
  // Job input tab translations
  tabJobPaste?: string
  tabJobLink?: string
  // Job URL extraction translations
  jobUrlExtraction: {
    label: string
    placeholder: string
    extract: string
    extracting: string
    clearUrl: string
    invalidUrl: string
    emptyUrl: string
    extractionFailed: string
    noDescriptionFound: string
  }
  // Job description loading states
  loadingJobDescription?: string
  jobDescriptionLoadError?: string
}

interface ResumeReviewerClientProps {
  /** Locale for navigation links and API calls */
  locale: string
  /** Translated UI strings */
  translations: ResumeReviewerTranslations
}

/**
 * Enum for the four resume input methods available in the tabbed interface.
 * Order: link | paste | upload | my-resumes
 */
type InputTab = 'link' | 'paste' | 'upload' | 'my-resumes'

/**
 * Enum for the two job description input methods available in the tabbed interface.
 */
type JobInputTab = 'link' | 'paste'

/**
 * Response shape from the /api/tools/extract-text endpoint.
 */
interface ExtractTextResponse {
  success?: boolean
  text?: string
  fileName?: string
  error?: string
  message?: string
}

/**
 * ResumeReviewerClient is the main client component for the Resume Reviewer feature.
 * It provides three input methods: file upload, paste text, or select from saved resumes.
 *
 * Layout:
 * - Left column: Input section with tabs (Upload / Paste / My Resumes)
 * - Right column: Results section (empty state until review complete)
 *
 * US-002: Implements PDF upload with drag-and-drop, file validation, progress indicator,
 * and error handling. Extracts text from PDF for later review analysis.
 */
export function ResumeReviewerClient({
  locale,
  translations,
}: ResumeReviewerClientProps) {
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'

  // Tab state - starts on 'link' tab (the first tab)
  const [activeTab, setActiveTab] = useState<InputTab>('link')

  // Resume text state - populated by any input method
  const [resumeText, setResumeText] = useState('')

  // State for the linked resume in the 'link' tab
  const [linkedResumeId, setLinkedResumeId] = useState<string | null>(null)
  const [isLoadingResume, setIsLoadingResume] = useState(false)

  // Job description state - optional input for targeted review
  const [jobDescription, setJobDescription] = useState('')
  const [isJobDescriptionExpanded, setIsJobDescriptionExpanded] = useState(false)

  // Job input tab state management
  const [activeJobTab, setActiveJobTab] = useState<JobInputTab>('link')

  // State for the linked job in the job 'link' tab
  const [linkedJobId, setLinkedJobId] = useState<string | null>(null)
  const [isLoadingJob, setIsLoadingJob] = useState(false)

  // State for job URL input in the job 'link' tab
  const [jobUrl, setJobUrl] = useState('')
  const [isExtractingUrl, setIsExtractingUrl] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  // Analysis state - tracks when review is in progress and stores results
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<ResumeReviewResult | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // File upload state
  const [isDragActive, setIsDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const jobTabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const inputSectionRef = useRef<HTMLDivElement>(null)

  /**
   * Get available tabs based on authentication status.
   * Order: Link to Resume | Paste Text | Upload File | My Resumes
   * My Resumes tab is only shown to authenticated users.
   */
  const availableTabs: Array<{
    id: InputTab
    label: string
    icon: React.ReactNode
  }> = useMemo(() => {
    const tabs: Array<{
      id: InputTab
      label: string
      icon: React.ReactNode
    }> = [
      {
        id: 'link',
        label: translations.tabLinkResume || 'Link to Resume',
        icon: <LinkIcon className="h-4 w-4" aria-hidden="true" />,
      },
      {
        id: 'paste',
        label: translations.tabPaste,
        icon: <ClipboardPaste className="h-4 w-4" aria-hidden="true" />,
      },
      {
        id: 'upload',
        label: translations.tabUploadFile || 'Upload File',
        icon: <Upload className="h-4 w-4" aria-hidden="true" />,
      },
    ]

    if (isAuthenticated) {
      tabs.push({
        id: 'my-resumes',
        label: translations.tabMyResumes,
        icon: <FolderOpen className="h-4 w-4" aria-hidden="true" />,
      })
    }

    return tabs
  }, [isAuthenticated, translations])

  /**
   * Available tabs for job description input.
   * Order: Link to Job | Paste Text
   */
  const availableJobTabs: Array<{
    id: JobInputTab
    label: string
    icon: React.ReactNode
  }> = useMemo(() => [
    {
      id: 'link',
      label: translations.tabJobLink || 'Link to Job',
      icon: <Briefcase className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'paste',
      label: translations.tabJobPaste || 'Paste Text',
      icon: <FileText className="h-4 w-4" aria-hidden="true" />,
    },
  ], [translations])

  /**
   * Handles keyboard navigation for tabs.
   * Arrow keys move focus between tabs, Enter/Space activates.
   */
  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
      const tabCount = availableTabs.length

      switch (event.key) {
        case 'ArrowLeft': {
          event.preventDefault()
          const prevIndex = tabIndex === 0 ? tabCount - 1 : tabIndex - 1
          tabRefs.current[prevIndex]?.focus()
          break
        }
        case 'ArrowRight': {
          event.preventDefault()
          const nextIndex = tabIndex === tabCount - 1 ? 0 : tabIndex + 1
          tabRefs.current[nextIndex]?.focus()
          break
        }
        case 'Home': {
          event.preventDefault()
          tabRefs.current[0]?.focus()
          break
        }
        case 'End': {
          event.preventDefault()
          tabRefs.current[tabCount - 1]?.focus()
          break
        }
      }
    },
    [availableTabs.length]
  )

  /**
   * Handles tab changes with mutual exclusivity.
   * Clears state when switching between tabs.
   */
  const handleTabChange = useCallback(
    (newTab: InputTab) => {
      if (newTab === activeTab) return

      // Clear state from the previous tab
      switch (activeTab) {
        case 'link':
          // Leaving link tab: clear linked resume selection
          setLinkedResumeId(null)
          break
        // 'paste', 'upload', and 'my-resumes' tabs share resumeText
      }

      // Clear resume text and file state when switching tabs
      setResumeText('')
      setSelectedFile(null)
      setUploadError(null)
      setActiveTab(newTab)
    },
    [activeTab]
  )

  /**
   * Handles job tab changes with mutual exclusivity.
   */
  const handleJobTabChange = useCallback(
    (newTab: JobInputTab) => {
      if (newTab === activeJobTab) return

      // Clear state based on tab transition
      if (activeJobTab === 'link') {
        // Leaving link tab: clear all link tab state
        setLinkedJobId(null)
        setJobUrl('')
        setUrlError(null)
      }

      if (newTab === 'link') {
        // Entering link tab: clear pasted job description
        setJobDescription('')
      }

      setActiveJobTab(newTab)
    },
    [activeJobTab]
  )

  /**
   * Handles keyboard navigation for job tabs.
   */
  const handleJobTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
      const tabCount = availableJobTabs.length

      switch (event.key) {
        case 'ArrowLeft': {
          event.preventDefault()
          const prevIndex = tabIndex === 0 ? tabCount - 1 : tabIndex - 1
          jobTabRefs.current[prevIndex]?.focus()
          break
        }
        case 'ArrowRight': {
          event.preventDefault()
          const nextIndex = tabIndex === tabCount - 1 ? 0 : tabIndex + 1
          jobTabRefs.current[nextIndex]?.focus()
          break
        }
        case 'Home': {
          event.preventDefault()
          jobTabRefs.current[0]?.focus()
          break
        }
        case 'End': {
          event.preventDefault()
          jobTabRefs.current[tabCount - 1]?.focus()
          break
        }
      }
    },
    [availableJobTabs.length]
  )

  /**
   * Validates file type and size.
   * Returns error message if invalid, null if valid.
   */
  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type (PDF or DOCX)
      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        return (
          translations.unsupportedFileError ||
          'Unsupported file type. Please upload a PDF or DOCX file.'
        )
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        return (
          translations.fileTooLargeError ||
          'File is too large. Maximum size is 5MB.'
        )
      }

      return null
    },
    [translations]
  )

  /**
   * Extracts text from the file using the server-side API endpoint.
   */
  const extractText = useCallback(
    async (file: File) => {
      setIsExtracting(true)
      setUploadError(null)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/tools/extract-text', {
          method: 'POST',
          body: formData,
        })

        // Check response.ok BEFORE attempting to parse JSON
        if (!response.ok) {
          let errorMessage =
            translations.extractionFailedError ||
            'Failed to extract text from file. Please try again.'
          try {
            const errorData: ExtractTextResponse = await response.json()
            errorMessage =
              errorData.message || errorData.error || errorMessage
          } catch {
            errorMessage = response.statusText || errorMessage
          }
          throw new Error(errorMessage)
        }

        const data: ExtractTextResponse = await response.json()

        if (!data.success) {
          throw new Error(
            data.message ||
              data.error ||
              translations.extractionFailedError ||
              'Failed to extract text from file.'
          )
        }

        if (!data.text) {
          throw new Error(
            translations.extractionFailedError ||
              'Failed to extract text from file.'
          )
        }

        // Success - set the extracted text
        setResumeText(data.text)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : translations.extractionFailedError ||
              'Failed to extract text from file.'
        console.error('Error extracting text from file:', err)
        setUploadError(errorMessage)
        setSelectedFile(null)
      } finally {
        setIsExtracting(false)
      }
    },
    [translations.extractionFailedError]
  )

  /**
   * Processes a selected file - validates and initiates extraction.
   */
  const processFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file)
      if (validationError) {
        setUploadError(validationError)
        setSelectedFile(null)
        return
      }

      setUploadError(null)
      setSelectedFile(file)
      extractText(file)
    },
    [validateFile, extractText]
  )

  /**
   * Handles drag enter event.
   */
  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isExtracting) {
        setIsDragActive(true)
      }
    },
    [isExtracting]
  )

  /**
   * Handles drag leave event.
   */
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }, [])

  /**
   * Handles drag over event.
   */
  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isExtracting) {
        setIsDragActive(true)
      }
    },
    [isExtracting]
  )

  /**
   * Handles file drop event.
   */
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)

      if (isExtracting) return

      const files = e.dataTransfer.files
      if (files && files.length > 0) {
        processFile(files[0])
      }
    },
    [isExtracting, processFile]
  )

  /**
   * Handles file input change event.
   */
  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        processFile(files[0])
      }
      // Reset input value to allow selecting the same file again
      e.target.value = ''
    },
    [processFile]
  )

  /**
   * Opens the file browser dialog.
   */
  const handleBrowseClick = useCallback(() => {
    if (!isExtracting && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }, [isExtracting])

  /**
   * Handles keyboard activation on the drop zone.
   */
  const handleDropZoneKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleBrowseClick()
      }
    },
    [handleBrowseClick]
  )

  /**
   * Clears the selected file and resets state.
   */
  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null)
    setUploadError(null)
    setResumeText('')
  }, [])

  /**
   * Handles selection of a linked resume from the 'link' tab.
   * Fetches the full resume data and converts it to plain text.
   */
  const handleLinkedResumeSelect = useCallback(
    async (resumeId: string) => {
      setLinkedResumeId(resumeId)
      setIsLoadingResume(true)
      setAnalysisError(null)

      try {
        const supabase = createClient()

        // Fetch the full resume data
        const { data: resume, error: fetchError } = await supabase
          .from('resumes')
          .select('*')
          .eq('id', resumeId)
          .single()

        if (fetchError) {
          throw fetchError
        }

        if (!resume) {
          throw new Error(translations.resumeLoadError || 'Resume not found')
        }

        // Convert resume to plain text and set it
        const plainText = convertResumeToText(resume as Resume)
        setResumeText(plainText)
      } catch (err) {
        console.error('Error loading linked resume:', err)
        const errorMessage =
          err instanceof Error
            ? err.message
            : translations.resumeLoadError || 'Failed to load resume content'
        setAnalysisError(errorMessage)
        // Reset selection on error
        setLinkedResumeId(null)
      } finally {
        setIsLoadingResume(false)
      }
    },
    [translations.resumeLoadError]
  )

  /**
   * Handles clearing the linked resume selection.
   */
  const handleLinkedResumeClear = useCallback(() => {
    setLinkedResumeId(null)
    setResumeText('')
  }, [])

  /**
   * Handles selection of a linked job from the job 'link' tab.
   */
  const handleLinkedJobSelect = useCallback(
    async (jobId: string) => {
      setLinkedJobId(jobId)
      setIsLoadingJob(true)
      setAnalysisError(null)
      // Clear URL extraction state for mutual exclusivity
      setJobUrl('')
      setUrlError(null)

      try {
        const supabase = createClient()

        // Fetch the job description from the job_applications table
        const { data: jobApplication, error: fetchError } = await supabase
          .from('job_applications')
          .select('job_description')
          .eq('id', jobId)
          .single()

        if (fetchError) {
          throw fetchError
        }

        if (!jobApplication?.job_description) {
          throw new Error(translations.jobDescriptionLoadError || 'No job description found')
        }

        // Set the job description for analysis
        setJobDescription(jobApplication.job_description)
      } catch (err) {
        console.error('Error loading job description:', err)
        const errorMessage =
          err instanceof Error
            ? err.message
            : translations.jobDescriptionLoadError || 'Failed to load job description'
        setAnalysisError(errorMessage)
        // Reset selection on error
        setLinkedJobId(null)
      } finally {
        setIsLoadingJob(false)
      }
    },
    [translations.jobDescriptionLoadError]
  )

  /**
   * Handles clearing the linked job selection.
   */
  const handleLinkedJobClear = useCallback(() => {
    setLinkedJobId(null)
    setJobDescription('')
  }, [])

  /**
   * Handles extraction of job description from a URL.
   */
  const handleExtractJobUrl = useCallback(async () => {
    // Validate URL is not empty
    const trimmedUrl = jobUrl.trim()
    if (!trimmedUrl) {
      setUrlError(translations.jobUrlExtraction.emptyUrl)
      return
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl)
    } catch {
      setUrlError(translations.jobUrlExtraction.invalidUrl)
      return
    }

    setIsExtractingUrl(true)
    setUrlError(null)

    try {
      const response = await fetch('/api/tools/extract-job-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        const errorMessage = data.message || data.error || translations.jobUrlExtraction.extractionFailed
        setUrlError(errorMessage)
        return
      }

      // Success - populate job description
      if (data.jobDescription) {
        setJobDescription(data.jobDescription)
        // Clear the linked job selection since we're using URL extraction
        setLinkedJobId(null)
        setUrlError(null)
      } else {
        setUrlError(translations.jobUrlExtraction.noDescriptionFound)
      }
    } catch (err) {
      console.error('Error extracting job from URL:', err)
      setUrlError(
        err instanceof Error
          ? err.message
          : translations.jobUrlExtraction.extractionFailed
      )
    } finally {
      setIsExtractingUrl(false)
    }
  }, [jobUrl, translations.jobUrlExtraction])

  /**
   * Handles Enter key press in the URL input field.
   */
  const handleUrlKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !isExtractingUrl) {
        event.preventDefault()
        handleExtractJobUrl()
      }
    },
    [handleExtractJobUrl, isExtractingUrl]
  )

  /**
   * Determines the active job input source for visual indication.
   */
  type JobInputSource = 'linked' | 'url' | 'manual' | null
  const activeJobSource: JobInputSource = useMemo(() => {
    if (linkedJobId && jobDescription) {
      return 'linked'
    }
    if (jobUrl && jobDescription && !linkedJobId) {
      return 'url'
    }
    if (activeJobTab === 'paste' && jobDescription) {
      return 'manual'
    }
    return null
  }, [linkedJobId, jobUrl, jobDescription, activeJobTab])

  /**
   * Resets all form state to initial values and scrolls to input section.
   * Used by "Analyze Another Resume" button to start fresh.
   */
  const handleAnalyzeAnother = useCallback(() => {
    // Clear resume text state
    setResumeText('')
    // Clear linked resume state
    setLinkedResumeId(null)
    // Clear job description state
    setJobDescription('')
    setIsJobDescriptionExpanded(false)
    // Clear linked job state
    setLinkedJobId(null)
    setJobUrl('')
    setUrlError(null)
    // Reset job tab
    setActiveJobTab('link')
    // Clear analysis results and errors
    setAnalysisResult(null)
    setAnalysisError(null)
    // Clear file upload state
    setSelectedFile(null)
    setUploadError(null)
    setIsDragActive(false)
    // Reset to initial tab (Link to Resume)
    setActiveTab('link')

    // Scroll smoothly to the input section
    if (inputSectionRef.current) {
      inputSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }, [])

  /**
   * Format file size for display.
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * Determines if the review button should be enabled.
   * For paste tab, requires minimum character count.
   * For upload tab, any extracted text is sufficient.
   * Button is also disabled during analysis or loading states.
   */
  const canReview =
    !isExtracting &&
    !isAnalyzing &&
    !isLoadingResume &&
    !isLoadingJob &&
    !isExtractingUrl &&
    resumeText.length > 0 &&
    (activeTab !== 'paste' || resumeText.length >= MIN_PASTE_CHARACTERS)

  /**
   * Maps API error messages to user-friendly translated messages.
   * Returns appropriate message based on error type/content.
   */
  const getErrorMessage = useCallback(
    (error: string, statusCode?: number): string => {
      const lowerError = error.toLowerCase()

      // Network/connectivity errors
      if (
        lowerError.includes('network') ||
        lowerError.includes('failed to fetch') ||
        lowerError.includes('connection') ||
        lowerError.includes('timeout')
      ) {
        return (
          translations.errorNetwork ||
          'Connection error. Please check your network and try again.'
        )
      }

      // Server busy / rate limiting (429, 503)
      if (
        statusCode === 429 ||
        statusCode === 503 ||
        lowerError.includes('rate limit') ||
        lowerError.includes('too many requests') ||
        lowerError.includes('service unavailable')
      ) {
        return (
          translations.errorServerBusy ||
          'Our servers are busy. Please wait a moment and try again.'
        )
      }

      // Resume validation errors
      if (
        lowerError.includes('resume text') ||
        lowerError.includes('too short') ||
        lowerError.includes('minimum') ||
        lowerError.includes('at least')
      ) {
        return (
          translations.errorResumeTooShort ||
          'The resume text is too short. Please add more content.'
        )
      }

      // Parsing/format errors
      if (
        lowerError.includes('parse') ||
        lowerError.includes('invalid json') ||
        lowerError.includes('invalid analysis')
      ) {
        return (
          translations.errorParsingFailed ||
          'Unable to process the analysis. Please try again.'
        )
      }

      // Validation errors (keep original message as it may have details)
      if (lowerError.includes('validation')) {
        return (
          translations.errorValidationFailed ||
          'Please check your input and try again.'
        )
      }

      // Generic fallback
      return (
        translations.errorGeneric ||
        'Unable to analyze your resume. Please try again.'
      )
    },
    [translations]
  )

  /**
   * Initiates the resume analysis by calling the review-resume API.
   * Handles the full flow: validation, API call, response parsing, error handling.
   * US-012: Provides user-friendly error messages for all failure scenarios.
   */
  const handleAnalyzeResume = useCallback(async () => {
    if (!canReview) return

    // Pre-validation: Check for empty or insufficient resume text
    if (!resumeText.trim()) {
      setAnalysisError(
        translations.errorResumeEmpty ||
          'Please provide your resume content before analyzing.'
      )
      return
    }

    if (resumeText.trim().length < MIN_PASTE_CHARACTERS) {
      setAnalysisError(
        translations.errorResumeTooShort ||
          'The resume text is too short. Please add more content.'
      )
      return
    }

    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const response = await fetch('/api/tools/review-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeText,
          jobDescription: jobDescription.trim() || undefined,
          locale,
        }),
      })

      // Handle non-OK responses with status-specific messages
      if (!response.ok) {
        let errorMessage: string
        try {
          const errorData: ReviewResumeResponse = await response.json()
          // Get user-friendly message based on error content and status
          errorMessage = getErrorMessage(
            errorData.message || errorData.error || 'Unknown error',
            response.status
          )
        } catch {
          // JSON parsing failed - use status-based message
          errorMessage = getErrorMessage(response.statusText, response.status)
        }
        throw new Error(errorMessage)
      }

      const data: ReviewResumeResponse = await response.json()

      if (!data.success) {
        // Handle validation errors with details
        if (data.details && data.details.length > 0) {
          const detailMessages = data.details.map((d) => d.message).join('. ')
          throw new Error(
            translations.errorValidationFailed || detailMessages
          )
        }
        throw new Error(
          getErrorMessage(data.message || data.error || 'Analysis failed')
        )
      }

      // Validate response has required fields
      if (
        typeof data.overallScore !== 'number' ||
        !Array.isArray(data.categories) ||
        !Array.isArray(data.suggestions)
      ) {
        throw new Error(
          translations.errorParsingFailed ||
            'Unable to process the analysis. Please try again.'
        )
      }

      // Store the analysis result
      setAnalysisResult({
        overallScore: data.overallScore,
        categories: data.categories,
        suggestions: data.suggestions,
        jobMatch: data.jobMatch,
        analyzedAt: data.analyzedAt || new Date().toISOString(),
      })
    } catch (err) {
      console.error('Error analyzing resume:', err)

      // Handle network errors specifically
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setAnalysisError(
          translations.errorNetwork ||
            'Connection error. Please check your network and try again.'
        )
      } else {
        const errorMessage =
          err instanceof Error
            ? err.message
            : translations.errorGeneric || 'Unable to analyze your resume. Please try again.'
        setAnalysisError(errorMessage)
      }
    } finally {
      setIsAnalyzing(false)
    }
  }, [
    canReview,
    resumeText,
    jobDescription,
    locale,
    translations.errorResumeEmpty,
    translations.errorResumeTooShort,
    translations.errorValidationFailed,
    translations.errorParsingFailed,
    translations.errorNetwork,
    translations.errorGeneric,
    getErrorMessage,
  ])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
      {/* Left column: Input section */}
      <div ref={inputSectionRef} className="space-y-4 sm:space-y-6">
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
          {translations.inputSection}
        </h2>

        {/* Tab navigation with ARIA support */}
        <div
          role="tablist"
          aria-label="Resume input methods"
          className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-none -mx-1 px-1"
        >
          {availableTabs.map((tab, index) => {
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => handleTabChange(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
                className={cn(
                  'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors',
                  '-mb-px min-h-[44px] whitespace-nowrap cursor-pointer',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:rounded-t-md',
                  isActive
                    ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="min-h-[280px] sm:min-h-[300px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6">
          {/* Link to Resume Tab Panel */}
          <div
            role="tabpanel"
            id="tabpanel-link"
            aria-labelledby="tab-link"
            hidden={activeTab !== 'link'}
            tabIndex={0}
          >
            {activeTab === 'link' && (
              <div className="space-y-4">
                <ResumeLinker
                  onSelect={handleLinkedResumeSelect}
                  onClear={handleLinkedResumeClear}
                  selectedResumeId={linkedResumeId}
                  locale={locale}
                  translations={translations.resumeLinker}
                />
                {isLoadingResume && linkedResumeId && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {translations.loadingResumeContent || 'Loading resume content...'}
                  </div>
                )}
                {/* Show loaded resume preview when a linked resume is selected */}
                {resumeText && linkedResumeId && !isLoadingResume && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      {translations.extractedContent || 'Extracted Content'}
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                      <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-6">
                        {resumeText.slice(0, 500)}
                        {resumeText.length > 500 && '...'}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {new Intl.NumberFormat().format(resumeText.length)}{' '}
                      characters
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upload File Tab Panel */}
          <div
            role="tabpanel"
            id="tabpanel-upload"
            aria-labelledby="tab-upload"
            hidden={activeTab !== 'upload'}
            tabIndex={0}
          >
            {activeTab === 'upload' && (
              <div className="space-y-4">
                {/* Label */}
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  {translations.uploadLabel}
                </label>

                {/* Drop zone */}
                <div
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={handleBrowseClick}
                  onKeyDown={handleDropZoneKeyDown}
                  role="button"
                  tabIndex={isExtracting ? -1 : 0}
                  aria-label={translations.dragDropText}
                  aria-disabled={isExtracting}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-8',
                    'border-2 border-dashed rounded-lg cursor-pointer',
                    'transition-all duration-200 outline-none min-h-[160px] sm:min-h-[200px]',
                    'focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                    // Base state
                    !isExtracting &&
                      !isDragActive &&
                      'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50',
                    // Hover state
                    !isExtracting &&
                      !isDragActive &&
                      'hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 hover:shadow-sm',
                    // Drag active state
                    isDragActive &&
                      'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-500/30',
                    // Extracting state
                    isExtracting &&
                      'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/30 cursor-not-allowed opacity-60',
                    // Error state
                    uploadError && 'border-red-400 dark:border-red-500'
                  )}
                >
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    onChange={handleFileInputChange}
                    disabled={isExtracting}
                    className="sr-only"
                    aria-hidden="true"
                  />

                  {/* Content based on state */}
                  {isExtracting ? (
                    // Extracting state
                    <>
                      <Loader2
                        className="h-10 w-10 text-teal-600 dark:text-teal-400 animate-spin"
                        aria-hidden="true"
                      />
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {translations.extractingText || 'Extracting text...'}
                      </p>
                    </>
                  ) : selectedFile && resumeText ? (
                    // File selected and extracted state
                    <div className="flex items-center gap-3 w-full max-w-sm">
                      <File
                        className="h-8 w-8 text-teal-600 dark:text-teal-400 flex-shrink-0"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveFile()
                        }}
                        aria-label={
                          translations.removeFileLabel || 'Remove file'
                        }
                        className={cn(
                          'p-1.5 rounded-md flex-shrink-0',
                          'text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400',
                          'hover:bg-red-50 dark:hover:bg-red-900/20',
                          'transition-colors focus:outline-none focus:ring-2 focus:ring-red-500'
                        )}
                      >
                        <X className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    // Default drop zone state
                    <>
                      <div
                        className={cn(
                          'flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full',
                          isDragActive
                            ? 'bg-teal-100 dark:bg-teal-900/50'
                            : 'bg-slate-100 dark:bg-slate-700'
                        )}
                      >
                        <Upload
                          className={cn(
                            'h-6 w-6 sm:h-8 sm:w-8',
                            isDragActive
                              ? 'text-teal-600 dark:text-teal-400'
                              : 'text-slate-400 dark:text-slate-500'
                          )}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="text-center px-2">
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                          {translations.dragDropText}{' '}
                          <span className="text-teal-600 dark:text-teal-400 font-medium hover:underline">
                            {translations.browseText}
                          </span>
                        </p>
                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-500 mt-1">
                          {translations.acceptedFilesText}
                        </p>
                        <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {translations.fileSizeLimit || 'Max 5MB'}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Error message */}
                {uploadError && (
                  <div
                    className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    <AlertCircle
                      className="h-4 w-4 mt-0.5 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <p>{uploadError}</p>
                  </div>
                )}

                {/* Extracted text preview */}
                {resumeText && !isExtracting && (
                  <div className="mt-3 sm:mt-4">
                    <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Extracted Content
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 sm:p-4 max-h-36 sm:max-h-48 overflow-y-auto">
                      <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-6">
                        {resumeText.slice(0, 500)}
                        {resumeText.length > 500 && '...'}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {new Intl.NumberFormat().format(resumeText.length)}{' '}
                      characters extracted
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Paste Tab Panel */}
          <div
            role="tabpanel"
            id="tabpanel-paste"
            aria-labelledby="tab-paste"
            hidden={activeTab !== 'paste'}
            tabIndex={0}
          >
            {activeTab === 'paste' && (
              <PasteTabContent
                translations={translations}
                value={resumeText}
                onChange={setResumeText}
              />
            )}
          </div>

          {/* My Resumes Tab Panel */}
          {isAuthenticated && (
            <div
              role="tabpanel"
              id="tabpanel-my-resumes"
              aria-labelledby="tab-my-resumes"
              hidden={activeTab !== 'my-resumes'}
              tabIndex={0}
            >
              {activeTab === 'my-resumes' && (
                <MyResumesTabContent
                  translations={translations}
                  locale={locale}
                  onResumeTextChange={setResumeText}
                />
              )}
            </div>
          )}
        </div>

        {/* Job Description Section - Tabbed Interface */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          {/* Job section header */}
          <button
            type="button"
            onClick={() => setIsJobDescriptionExpanded(!isJobDescriptionExpanded)}
            aria-expanded={isJobDescriptionExpanded}
            aria-controls="job-description-section"
            className={cn(
              'w-full flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3',
              'text-left transition-colors min-h-[56px] sm:min-h-0',
              'hover:bg-slate-50 dark:hover:bg-slate-700/50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500'
            )}
          >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div
                className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                  'bg-slate-100 dark:bg-slate-700'
                )}
              >
                <Briefcase
                  className="h-4 w-4 text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                  {translations.jobDescriptionSectionTitle || 'Add Job Description (Optional)'}
                </span>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  {translations.jobDescriptionHint || 'Provide a job description for targeted feedback'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Character count badge when collapsed and has content */}
              {!isJobDescriptionExpanded && jobDescription.length > 0 && (
                <span className="text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
                  {new Intl.NumberFormat().format(jobDescription.length)} chars
                </span>
              )}
              <ChevronDown
                className={cn(
                  'h-5 w-5 text-slate-400 dark:text-slate-500 transition-transform duration-200',
                  isJobDescriptionExpanded && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </div>
          </button>

          {/* Collapsible content with tabbed interface */}
          <div
            id="job-description-section"
            role="region"
            hidden={!isJobDescriptionExpanded}
            className={cn(
              'border-t border-slate-200 dark:border-slate-700',
              !isJobDescriptionExpanded && 'hidden'
            )}
          >
            <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
              {/* Job tab buttons */}
              <div
                role="tablist"
                aria-label="Job description input methods"
                className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-none"
              >
                {availableJobTabs.map((tab, index) => {
                  const isActive = activeJobTab === tab.id

                  return (
                    <button
                      key={tab.id}
                      ref={(el) => {
                        jobTabRefs.current[index] = el
                      }}
                      role="tab"
                      id={`job-tab-${tab.id}`}
                      aria-selected={isActive}
                      aria-controls={`job-tabpanel-${tab.id}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => handleJobTabChange(tab.id)}
                      onKeyDown={(e) => handleJobTabKeyDown(e, index)}
                      className={cn(
                        'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap',
                        'border-b-2 -mb-px transition-all duration-200 min-h-[44px] cursor-pointer',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:rounded-t-md',
                        isActive
                          ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      )}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Job tab panels */}
              <div className="pt-2">
                {/* Link to Job Tab Panel */}
                <div
                  role="tabpanel"
                  id="job-tabpanel-link"
                  aria-labelledby="job-tab-link"
                  hidden={activeJobTab !== 'link'}
                  tabIndex={0}
                >
                  {activeJobTab === 'link' && (
                    <div className="space-y-4">
                      <JobLinker
                        onSelect={handleLinkedJobSelect}
                        onClear={handleLinkedJobClear}
                        selectedJobId={linkedJobId}
                        locale={locale}
                        translations={translations.jobLinker}
                        dropdownMaxHeight="max-h-[400px]"
                      />

                      {/* Job URL input field with Extract button */}
                      <div className="space-y-2">
                        <label
                          htmlFor="job-url-input"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          {translations.jobUrlExtraction.label}
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              id="job-url-input"
                              type="url"
                              value={jobUrl}
                              onChange={(e) => {
                                setJobUrl(e.target.value)
                                if (urlError) setUrlError(null)
                              }}
                              onKeyDown={handleUrlKeyDown}
                              placeholder={translations.jobUrlExtraction.placeholder}
                              disabled={isExtractingUrl}
                              className={cn(
                                'w-full px-3 py-2.5 pr-10 rounded-lg border',
                                'text-sm text-slate-900 dark:text-slate-100',
                                'bg-white dark:bg-slate-800',
                                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                                'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500',
                                'transition-colors duration-200',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                                urlError
                                  ? 'border-red-500 dark:border-red-500'
                                  : 'border-slate-300 dark:border-slate-600'
                              )}
                            />
                            {jobUrl && !isExtractingUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  setJobUrl('')
                                  setUrlError(null)
                                }}
                                aria-label={translations.jobUrlExtraction.clearUrl}
                                className={cn(
                                  'absolute right-2 top-1/2 -translate-y-1/2',
                                  'p-1 rounded-full',
                                  'text-slate-400 hover:text-slate-600',
                                  'dark:text-slate-500 dark:hover:text-slate-300',
                                  'hover:bg-slate-100 dark:hover:bg-slate-700',
                                  'transition-colors duration-200',
                                  'focus:outline-none focus:ring-2 focus:ring-teal-500'
                                )}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={handleExtractJobUrl}
                            disabled={isExtractingUrl || !jobUrl.trim()}
                            aria-busy={isExtractingUrl}
                            className={cn(
                              'inline-flex items-center justify-center gap-2 px-4 py-2.5',
                              'bg-teal-600 text-white font-medium rounded-lg',
                              'text-sm whitespace-nowrap',
                              'shadow-sm transition-all duration-200',
                              'hover:bg-teal-700 hover:shadow-md',
                              'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
                              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-teal-600 disabled:hover:shadow-sm'
                            )}
                          >
                            {isExtractingUrl ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                <span>{translations.jobUrlExtraction.extracting}</span>
                              </>
                            ) : (
                              <span>{translations.jobUrlExtraction.extract}</span>
                            )}
                          </button>
                        </div>
                        {/* URL extraction error message */}
                        {urlError && (
                          <p className="text-sm text-red-600 dark:text-red-400">
                            {urlError}
                          </p>
                        )}
                      </div>

                      {isLoadingJob && linkedJobId && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {translations.loadingJobDescription || 'Loading job description...'}
                        </div>
                      )}
                      {/* Show loaded job description preview when populated */}
                      {jobDescription && !isLoadingJob && !isExtractingUrl && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {translations.jobDescriptionLabel || 'Job Description'}
                            </p>
                            {/* Visual indicator for active job input source */}
                            {activeJobSource === 'linked' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                Linked Job
                              </span>
                            )}
                            {activeJobSource === 'url' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                <Globe className="h-3 w-3" aria-hidden="true" />
                                From URL
                              </span>
                            )}
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-6">
                              {jobDescription.slice(0, 500)}
                              {jobDescription.length > 500 && '...'}
                            </p>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {new Intl.NumberFormat().format(jobDescription.length)}{' '}
                            characters
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Paste Text Tab Panel */}
                <div
                  role="tabpanel"
                  id="job-tabpanel-paste"
                  aria-labelledby="job-tab-paste"
                  hidden={activeJobTab !== 'paste'}
                  tabIndex={0}
                >
                  {activeJobTab === 'paste' && (
                    <div className="space-y-3">
                      {/* Label row with clear button */}
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="job-description-textarea"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          {translations.jobDescriptionLabel || 'Job Description'}
                        </label>
                        {jobDescription.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setJobDescription('')}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md',
                              'text-slate-600 dark:text-slate-400',
                              'hover:text-red-600 dark:hover:text-red-400',
                              'hover:bg-red-50 dark:hover:bg-red-900/20',
                              'transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2'
                            )}
                            aria-label={translations.jobDescriptionClear || 'Clear job description'}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            {translations.jobDescriptionClear || 'Clear'}
                          </button>
                        )}
                      </div>

                      {/* Textarea */}
                      <textarea
                        id="job-description-textarea"
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        placeholder={
                          translations.jobDescriptionPlaceholder ||
                          'Paste the job description here to get targeted feedback on how well your resume matches the position requirements...'
                        }
                        aria-describedby="job-description-char-count"
                        className={cn(
                          'w-full min-h-[120px] sm:min-h-[150px] px-3 sm:px-4 py-3 rounded-lg resize-y',
                          'border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700',
                          'text-slate-900 dark:text-slate-100 text-sm leading-relaxed',
                          'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                          'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 focus:ring-offset-0',
                          'transition-colors'
                        )}
                      />

                      {/* Character count */}
                      <div className="flex justify-end">
                        <p
                          id="job-description-char-count"
                          className="text-xs text-slate-500 dark:text-slate-400"
                        >
                          {translations.jobDescriptionCharCount
                            ? translations.jobDescriptionCharCount.replace(
                                '{count}',
                                new Intl.NumberFormat().format(jobDescription.length)
                              )
                            : `${new Intl.NumberFormat().format(jobDescription.length)} characters`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Review button */}
        <button
          type="button"
          disabled={!canReview}
          onClick={handleAnalyzeResume}
          aria-busy={isAnalyzing}
          className={cn(
            'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3',
            'bg-teal-600 hover:bg-teal-700 text-white text-sm sm:text-base font-medium rounded-lg',
            'transition-colors min-h-[48px] sm:min-h-[44px]',
            'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-teal-600'
          )}
        >
          {isAnalyzing && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {isAnalyzing ? translations.reviewingButton : translations.reviewButton}
        </button>
      </div>

      {/* Right column: Results section */}
      <div className="space-y-4 sm:space-y-6">
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
          {translations.resultsSection}
        </h2>

        <div
          className={cn(
            'min-h-[350px] sm:min-h-[400px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6',
            // Only center content for empty/loading states
            !analysisResult && !analysisError && 'flex flex-col items-center justify-center'
          )}
          aria-busy={isAnalyzing}
          aria-live="polite"
        >
          {isAnalyzing ? (
            <ResultsLoadingState translations={translations} />
          ) : analysisError ? (
            <ResultsErrorState
              translations={translations}
              error={analysisError}
              onRetry={handleAnalyzeResume}
            />
          ) : analysisResult ? (
            <ResultsDisplayState
              translations={translations}
              result={analysisResult}
              onAnalyzeAnother={handleAnalyzeAnother}
            />
          ) : (
            <ResultsEmptyState translations={translations} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Paste tab content - text area for pasting resume content.
 * Features:
 * - Large resizable textarea with placeholder guidance
 * - Live character count display
 * - Clear button (visible only when text exists)
 * - Minimum character validation (100 chars) with warning
 */
function PasteTabContent({
  translations,
  value,
  onChange,
}: {
  translations: ResumeReviewerTranslations
  value: string
  onChange: (value: string) => void
}) {
  const characterCount = value.length
  const isUnderMinimum = characterCount > 0 && characterCount < MIN_PASTE_CHARACTERS
  const remainingChars = MIN_PASTE_CHARACTERS - characterCount

  /**
   * Clears the textarea content.
   */
  const handleClear = useCallback(() => {
    onChange('')
  }, [onChange])

  return (
    <div className="h-full flex flex-col space-y-3">
      {/* Label row with clear button */}
      <div className="flex items-center justify-between">
        <label
          htmlFor="resume-paste"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {translations.pasteLabel}
        </label>
        {value.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md',
              'text-slate-600 dark:text-slate-400',
              'hover:text-red-600 dark:hover:text-red-400',
              'hover:bg-red-50 dark:hover:bg-red-900/20',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2'
            )}
            aria-label={translations.clearTextButton || 'Clear text'}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {translations.clearTextButton || 'Clear'}
          </button>
        )}
      </div>

      {/* Textarea */}
      <textarea
        id="resume-paste"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={translations.pastePlaceholder}
        aria-describedby="paste-char-count paste-min-warning"
        aria-invalid={isUnderMinimum}
        className={cn(
          'flex-1 w-full min-h-[180px] sm:min-h-[200px] px-3 sm:px-4 py-3 rounded-lg resize-y',
          'border bg-white dark:bg-slate-700',
          'text-slate-900 dark:text-slate-100 text-sm leading-relaxed',
          'placeholder:text-slate-400 dark:placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
          // Border and focus ring color based on validation state
          isUnderMinimum
            ? 'border-amber-400 dark:border-amber-500 focus:ring-amber-500 focus:border-amber-500'
            : 'border-slate-200 dark:border-slate-600 focus:ring-teal-500 focus:border-teal-500'
        )}
      />

      {/* Character count and validation message */}
      <div className="flex flex-col-reverse sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        {/* Minimum character warning */}
        <div id="paste-min-warning" aria-live="polite" className="w-full sm:w-auto">
          {isUnderMinimum && (
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>
                {translations.minCharactersWarning
                  ? translations.minCharactersWarning.replace(
                      '{count}',
                      remainingChars.toString()
                    )
                  : `${remainingChars} more characters needed for analysis`}
              </span>
            </div>
          )}
        </div>

        {/* Character count */}
        <p
          id="paste-char-count"
          className={cn(
            'text-[11px] sm:text-xs whitespace-nowrap self-end sm:self-auto',
            characterCount === 0
              ? 'text-slate-400 dark:text-slate-500'
              : isUnderMinimum
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400'
          )}
        >
          {translations.characterCount
            ? translations.characterCount.replace(
                '{count}',
                new Intl.NumberFormat().format(characterCount)
              )
            : `${new Intl.NumberFormat().format(characterCount)} characters`}
        </p>
      </div>
    </div>
  )
}

/**
 * My Resumes tab content - displays user's saved resumes for selection.
 * Fetches resumes from Supabase, allows selection, and extracts text
 * from the selected resume's JSONB content.
 */
function MyResumesTabContent({
  translations,
  locale,
  onResumeTextChange,
}: {
  translations: ResumeReviewerTranslations
  locale: string
  onResumeTextChange: (text: string) => void
}) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [extractedText, setExtractedText] = useState<string | null>(null)

  /**
   * Fetches user's resumes from Supabase.
   */
  const fetchResumes = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Verify user is authenticated before querying
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError(translations.loginRequired || 'Please sign in to access your resumes')
        setIsLoading(false)
        return
      }

      // RLS ensures we only get the current user's resumes
      const { data, error: fetchError } = await supabase
        .from('resumes')
        .select('id, title, updated_at, created_at, template')
        .order('updated_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      setResumes(data || [])
    } catch (err) {
      console.error('Error fetching resumes:', err)
      setError(translations.loadError || 'Failed to load resumes')
    } finally {
      setIsLoading(false)
    }
  }, [translations.loginRequired, translations.loadError])

  // Fetch resumes on mount
  useEffect(() => {
    fetchResumes()
  }, [fetchResumes])

  /**
   * Handles resume selection - fetches full content and extracts text.
   */
  const handleResumeSelect = useCallback(
    async (resumeId: string) => {
      // If clicking the same resume, deselect it
      if (selectedResumeId === resumeId) {
        setSelectedResumeId(null)
        setExtractedText(null)
        onResumeTextChange('')
        return
      }

      setSelectedResumeId(resumeId)
      setIsLoadingContent(true)
      setError(null)

      try {
        const supabase = createClient()

        // Fetch the full resume data
        const { data: resume, error: fetchError } = await supabase
          .from('resumes')
          .select('*')
          .eq('id', resumeId)
          .single()

        if (fetchError) {
          throw fetchError
        }

        if (!resume) {
          throw new Error(translations.resumeLoadError || 'Resume not found')
        }

        // Convert resume to plain text
        const plainText = convertResumeToText(resume as Resume)
        setExtractedText(plainText)
        onResumeTextChange(plainText)
      } catch (err) {
        console.error('Error loading resume content:', err)
        const errorMessage =
          err instanceof Error
            ? err.message
            : translations.resumeLoadError || 'Failed to load resume content'
        setError(errorMessage)
        // Reset selection on error
        setSelectedResumeId(null)
        setExtractedText(null)
        onResumeTextChange('')
      } finally {
        setIsLoadingContent(false)
      }
    },
    [selectedResumeId, onResumeTextChange, translations.resumeLoadError]
  )

  /**
   * Format date to a human-readable string based on locale.
   */
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12 space-y-3 sm:space-y-4">
        <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 text-teal-600 animate-spin" aria-hidden="true" />
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          {translations.loadingResumes || 'Loading your resumes...'}
        </p>
      </div>
    )
  }

  // Error state (including login required)
  if (error && resumes.length === 0) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 sm:p-6 text-center">
        <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 text-red-500 dark:text-red-400 mx-auto mb-2 sm:mb-3" aria-hidden="true" />
        <p className="text-xs sm:text-sm text-red-800 dark:text-red-200">{error}</p>
        <button
          type="button"
          onClick={fetchResumes}
          className="mt-3 sm:mt-4 text-xs sm:text-sm text-red-600 dark:text-red-400 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded min-h-[44px] px-4 py-2"
        >
          {translations.tryAgain || 'Try again'}
        </button>
      </div>
    )
  }

  // Empty state - user has no resumes
  if (resumes.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-6 sm:p-8 text-center">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
          <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          {translations.noResumesFound || 'No resumes found'}
        </h3>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4 sm:mb-6">
          {translations.noResumesDescription || 'Create a resume to get started with the review.'}
        </p>
        <Link
          href={`/${locale}/dashboard/resumes`}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 min-h-[48px] sm:min-h-[44px]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {translations.createResume || 'Create Resume'}
        </Link>
      </div>
    )
  }

  // Resumes list
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Label */}
      <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
        {translations.selectResumeLabel}
      </label>

      {/* Resumes grid */}
      <div className="grid grid-cols-1 gap-2 sm:gap-3 max-h-[250px] sm:max-h-[300px] overflow-y-auto pr-1 -mr-1">
        {resumes.map((resume) => {
          const isSelected = selectedResumeId === resume.id
          const lastModified = resume.updated_at || resume.created_at

          return (
            <button
              key={resume.id}
              type="button"
              onClick={() => handleResumeSelect(resume.id)}
              disabled={isLoadingContent && selectedResumeId === resume.id}
              aria-pressed={isSelected}
              aria-label={`Select resume: ${resume.title}`}
              className={cn(
                'relative flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border-2 text-left transition-all',
                'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
                'disabled:cursor-wait min-h-[56px]',
                isSelected
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-400'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              )}
            >
              {/* Resume icon */}
              <div
                className={cn(
                  'w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  isSelected
                    ? 'bg-teal-100 dark:bg-teal-800/50'
                    : 'bg-slate-100 dark:bg-slate-700'
                )}
              >
                {isLoadingContent && selectedResumeId === resume.id ? (
                  <Loader2
                    className="h-5 w-5 text-teal-600 dark:text-teal-400 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <FileText
                    className={cn(
                      'h-5 w-5',
                      isSelected
                        ? 'text-teal-600 dark:text-teal-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Resume info */}
              <div className="flex-1 min-w-0 pr-5 sm:pr-6">
                <h3
                  className={cn(
                    'font-medium truncate text-xs sm:text-sm',
                    isSelected
                      ? 'text-teal-900 dark:text-teal-100'
                      : 'text-slate-900 dark:text-slate-100'
                  )}
                >
                  {resume.title}
                </h3>
                <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
                  <span
                    className={cn(
                      'text-[11px] sm:text-xs',
                      isSelected
                        ? 'text-teal-700 dark:text-teal-300'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {translations.updated || 'Updated'} {formatDate(lastModified)}
                  </span>
                  {resume.template && (
                    <>
                      <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">|</span>
                      <span
                        className={cn(
                          'text-[11px] sm:text-xs capitalize',
                          isSelected
                            ? 'text-teal-600 dark:text-teal-400'
                            : 'text-slate-400 dark:text-slate-500'
                        )}
                      >
                        {resume.template}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Selection indicator */}
              {isSelected && !isLoadingContent && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Loading content indicator */}
      {isLoadingContent && (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {translations.loadingResumeContent || 'Loading resume content...'}
        </div>
      )}

      {/* Extracted text preview */}
      {extractedText && !isLoadingContent && (
        <div className="mt-3 sm:mt-4">
          <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {translations.extractedContent || 'Extracted Content'}
          </p>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 sm:p-4 max-h-36 sm:max-h-48 overflow-y-auto">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-6">
              {extractedText.slice(0, 500)}
              {extractedText.length > 500 && '...'}
            </p>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
            {translations.charactersExtracted
              ? translations.charactersExtracted.replace(
                  '{count}',
                  new Intl.NumberFormat().format(extractedText.length)
                )
              : `${new Intl.NumberFormat().format(extractedText.length)} characters extracted`}
          </p>
        </div>
      )}

      {/* Inline error for content loading */}
      {error && selectedResumeId && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}

/**
 * Loading state for results section - shown while analysis is in progress.
 * Displays animated skeleton placeholders with a processing message.
 */
function ResultsLoadingState({
  translations,
}: {
  translations: ResumeReviewerTranslations
}) {
  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header with spinner and message */}
      <div className="flex flex-col items-center gap-3 sm:gap-4">
        <div className="relative">
          <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-900/30">
            <Loader2
              className="h-6 w-6 sm:h-8 sm:w-8 text-teal-600 dark:text-teal-400 animate-spin"
              aria-hidden="true"
            />
          </div>
          {/* Pulsing ring animation */}
          <div className="absolute inset-0 rounded-full border-2 border-teal-500/30 animate-ping" />
        </div>
        <div className="text-center px-2">
          <h3 className="text-base sm:text-lg font-medium text-slate-900 dark:text-slate-100">
            {translations.analyzingMessage || 'Analyzing your resume...'}
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {translations.analyzingHint || 'This may take a moment'}
          </p>
        </div>
      </div>

      {/* Skeleton placeholders for results sections */}
      <div className="space-y-3 sm:space-y-4 animate-pulse">
        {/* Score skeleton */}
        <div className="flex flex-col items-center gap-2 sm:gap-3 pb-3 sm:pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-28 sm:w-32 rounded bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Category skeletons */}
        <div className="space-y-2 sm:space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50"
            >
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 sm:h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-2.5 sm:h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="h-5 sm:h-6 w-10 sm:w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>

        {/* Recommendations skeleton */}
        <div className="space-y-2 pt-3 sm:pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="h-4 sm:h-5 w-32 sm:w-40 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="space-y-2">
            <div className="h-2.5 sm:h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-2.5 sm:h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-2.5 sm:h-3 w-4/5 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Empty state for results section - shown until review is complete.
 */
function ResultsEmptyState({
  translations,
}: {
  translations: ResumeReviewerTranslations
}) {
  return (
    <>
      <div className="mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
        <FileText
          className="h-6 w-6 sm:h-8 sm:w-8 text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        />
      </div>
      <h3 className="text-base sm:text-lg font-medium text-slate-700 dark:text-slate-300">
        {translations.emptyStateTitle}
      </h3>
      <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm text-center px-2">
        {translations.emptyStateDescription}
      </p>
    </>
  )
}

/**
 * Error state for results section - shown when analysis fails.
 * US-012: Enhanced with accessible error announcements and clear recovery actions.
 * Provides retry button to attempt analysis again.
 */
function ResultsErrorState({
  translations,
  error,
  onRetry,
}: {
  translations: ResumeReviewerTranslations
  error: string
  onRetry: () => void
}) {
  /**
   * Determines if the error is related to network/connectivity issues.
   * Used to show appropriate icon and styling.
   */
  const isNetworkError =
    error.toLowerCase().includes('network') ||
    error.toLowerCase().includes('connection') ||
    error.toLowerCase().includes('offline')

  /**
   * Determines if the error is related to server overload.
   */
  const isServerBusy =
    error.toLowerCase().includes('busy') ||
    error.toLowerCase().includes('wait')

  return (
    <div
      className="flex flex-col items-center justify-center text-center px-2"
      role="alert"
      aria-live="assertive"
    >
      {/* Error icon with contextual styling */}
      <div
        className={cn(
          'mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full',
          isServerBusy
            ? 'bg-amber-50 dark:bg-amber-900/20'
            : 'bg-red-50 dark:bg-red-900/20'
        )}
      >
        {isNetworkError ? (
          <svg
            className="h-6 w-6 sm:h-8 sm:w-8 text-red-500 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
            />
          </svg>
        ) : isServerBusy ? (
          <Loader2
            className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
        ) : (
          <AlertCircle
            className="h-6 w-6 sm:h-8 sm:w-8 text-red-500 dark:text-red-400"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Error title */}
      <h3
        className={cn(
          'text-base sm:text-lg font-medium',
          isServerBusy
            ? 'text-amber-900 dark:text-amber-100'
            : 'text-slate-900 dark:text-slate-100'
        )}
      >
        {translations.analysisError || 'Analysis Failed'}
      </h3>

      {/* Error message - visible to screen readers */}
      <p
        className={cn(
          'mt-2 text-xs sm:text-sm max-w-sm',
          isServerBusy
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-red-600 dark:text-red-400'
        )}
      >
        {error}
      </p>

      {/* Action buttons */}
      <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
        {/* Primary retry button */}
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'inline-flex items-center gap-2 px-5 py-3 sm:py-2.5',
            'bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg',
            'transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
            'w-full sm:w-auto min-w-[140px] min-h-[48px] sm:min-h-[44px] justify-center'
          )}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          {translations.analyzeAgainButton || 'Try Again'}
        </button>
      </div>

      {/* Helpful hint for persistent errors */}
      {!isServerBusy && (
        <p className="mt-3 sm:mt-4 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 max-w-xs">
          If the problem persists, try refreshing the page or checking your
          resume content.
        </p>
      )}
    </div>
  )
}

/**
 * Animated circular score gauge component.
 * Displays score with SVG stroke-dasharray animation and number counting effect.
 */
function ScoreGauge({
  score,
  translations,
}: {
  score: number
  translations: ResumeReviewerTranslations
}) {
  const [displayScore, setDisplayScore] = useState(0)
  const [isAnimated, setIsAnimated] = useState(false)

  // SVG circle parameters
  const size = 140
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (displayScore / 100) * circumference

  // Determine color based on score thresholds
  const getStrokeColor = useCallback((s: number): string => {
    if (s < 50) return '#ef4444' // red-500
    if (s <= 75) return '#f59e0b' // amber-500
    return '#22c55e' // green-500
  }, [])

  const getTextColorClass = useCallback((s: number): string => {
    if (s < 50) return 'text-red-600 dark:text-red-400'
    if (s <= 75) return 'text-amber-600 dark:text-amber-400'
    return 'text-green-600 dark:text-green-400'
  }, [])

  const getBackgroundColorClass = useCallback((s: number): string => {
    if (s < 50) return 'bg-red-50 dark:bg-red-900/10'
    if (s <= 75) return 'bg-amber-50 dark:bg-amber-900/10'
    return 'bg-green-50 dark:bg-green-900/10'
  }, [])

  /**
   * Returns interpretation text based on score ranges.
   */
  const getInterpretationText = useCallback((s: number): string => {
    if (s >= 85) return translations.scoreExcellent || 'Excellent'
    if (s >= 70) return translations.scoreGood || 'Good'
    if (s >= 50) return translations.scoreNeedsWork || 'Needs Improvement'
    return translations.scorePoor || 'Needs Significant Work'
  }, [translations])

  // Animate score counting up on mount
  useEffect(() => {
    // Small delay before starting animation for visual effect
    const startDelay = setTimeout(() => {
      setIsAnimated(true)
    }, 100)

    return () => clearTimeout(startDelay)
  }, [])

  useEffect(() => {
    if (!isAnimated) return

    const duration = 1200 // Animation duration in ms
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const currentScore = Math.round(easeOut * score)

      setDisplayScore(currentScore)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [isAnimated, score])

  const strokeColor = getStrokeColor(displayScore)
  const textColorClass = getTextColorClass(displayScore)
  const bgColorClass = getBackgroundColorClass(displayScore)

  return (
    <div className="flex flex-col items-center">
      {/* Circular gauge container */}
      <div
        className={cn(
          'relative rounded-full p-3 transition-colors duration-500',
          bgColorClass
        )}
        role="img"
        aria-label={`Resume score: ${score} out of 100. ${getInterpretationText(score)}`}
      >
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          aria-hidden="true"
        >
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200 dark:text-slate-700"
          />
          {/* Animated progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={isAnimated ? strokeDashoffset : circumference}
            className="transition-all duration-1000 ease-out"
            style={{
              filter: `drop-shadow(0 0 6px ${strokeColor}40)`,
            }}
          />
        </svg>

        {/* Score number display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'text-3xl sm:text-4xl font-bold tabular-nums transition-colors duration-500',
              textColorClass
            )}
            aria-hidden="true"
          >
            {displayScore}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            / 100
          </span>
        </div>
      </div>

      {/* Score label */}
      <p className="mt-3 sm:mt-4 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
        {translations.overallScoreLabel || 'Resume Score'}
      </p>

      {/* Interpretation text */}
      <p
        className={cn(
          'mt-1 text-xs sm:text-sm font-medium transition-colors duration-500',
          textColorClass
        )}
      >
        {getInterpretationText(displayScore)}
      </p>
    </div>
  )
}

/**
 * Category icon and color configuration.
 * Maps API category names to visual properties.
 */
interface CategoryConfig {
  icon: LucideIcon
  bgColorClass: string
  iconColorClass: string
  translationKey: keyof Pick<
    ResumeReviewerTranslations,
    'categoryImpact' | 'categoryBrevity' | 'categoryStyle' | 'categorySections' | 'categorySkills'
  >
  defaultLabel: string
}

/**
 * Returns configuration for a category based on its name.
 * Matches category names case-insensitively.
 */
function getCategoryConfig(categoryName: string): CategoryConfig {
  const normalizedName = categoryName.toLowerCase().trim()

  if (normalizedName.includes('impact')) {
    return {
      icon: Zap,
      bgColorClass: 'bg-amber-100 dark:bg-amber-900/30',
      iconColorClass: 'text-amber-600 dark:text-amber-400',
      translationKey: 'categoryImpact',
      defaultLabel: 'Impact',
    }
  }

  if (normalizedName.includes('brevity') || normalizedName.includes('concis')) {
    return {
      icon: Scissors,
      bgColorClass: 'bg-blue-100 dark:bg-blue-900/30',
      iconColorClass: 'text-blue-600 dark:text-blue-400',
      translationKey: 'categoryBrevity',
      defaultLabel: 'Brevity',
    }
  }

  if (normalizedName.includes('style') || normalizedName.includes('format')) {
    return {
      icon: Palette,
      bgColorClass: 'bg-purple-100 dark:bg-purple-900/30',
      iconColorClass: 'text-purple-600 dark:text-purple-400',
      translationKey: 'categoryStyle',
      defaultLabel: 'Style',
    }
  }

  if (normalizedName.includes('section') || normalizedName.includes('structure')) {
    return {
      icon: LayoutGrid,
      bgColorClass: 'bg-teal-100 dark:bg-teal-900/30',
      iconColorClass: 'text-teal-600 dark:text-teal-400',
      translationKey: 'categorySections',
      defaultLabel: 'Sections',
    }
  }

  if (normalizedName.includes('skill') || normalizedName.includes('competen')) {
    return {
      icon: Star,
      bgColorClass: 'bg-rose-100 dark:bg-rose-900/30',
      iconColorClass: 'text-rose-600 dark:text-rose-400',
      translationKey: 'categorySkills',
      defaultLabel: 'Skills',
    }
  }

  // Default fallback for unknown categories
  return {
    icon: TrendingUp,
    bgColorClass: 'bg-slate-100 dark:bg-slate-700',
    iconColorClass: 'text-slate-600 dark:text-slate-400',
    translationKey: 'categoryImpact',
    defaultLabel: categoryName,
  }
}

/**
 * Animated category score card component with expandable feedback.
 * Displays a category with icon, name, score, animated progress bar.
 * Collapsed by default - expands to show detailed feedback on click.
 * Shows positive indicator for high scores (>= 80).
 */
function CategoryScoreCard({
  category,
  translations,
  animationDelay,
}: {
  category: CategoryResult
  translations: ResumeReviewerTranslations
  animationDelay: number
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [displayScore, setDisplayScore] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)

  const config = getCategoryConfig(category.name)
  const IconComponent = config.icon
  const isHighScore = category.score >= 80
  const hasFeedback = category.feedback.length > 0

  // Get translated category name or use API name
  const categoryLabel = translations[config.translationKey] || category.name

  /**
   * Returns the progress bar background color based on score value.
   */
  const getProgressBgColor = (score: number): string => {
    if (score >= 75) return 'bg-green-500'
    if (score >= 50) return 'bg-amber-500'
    return 'bg-red-500'
  }

  /**
   * Returns the score text color based on score value.
   */
  const getScoreTextColor = (score: number): string => {
    if (score >= 75) return 'text-green-600 dark:text-green-400'
    if (score >= 50) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  /**
   * Returns the progress bar glow shadow based on score value.
   */
  const getProgressGlow = (score: number): string => {
    if (score >= 75) return 'shadow-[0_0_8px_rgba(34,197,94,0.4)]'
    if (score >= 50) return 'shadow-[0_0_8px_rgba(245,158,11,0.4)]'
    return 'shadow-[0_0_8px_rgba(239,68,68,0.4)]'
  }

  // Trigger visibility animation after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, animationDelay)

    return () => clearTimeout(timer)
  }, [animationDelay])

  // Animate score counting up once visible
  useEffect(() => {
    if (!isVisible) return

    const duration = 800
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3)
      setDisplayScore(Math.round(easeOut * category.score))

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [isVisible, category.score])

  /**
   * Toggles the expanded state of the card.
   */
  const handleToggle = useCallback(() => {
    if (hasFeedback) {
      setIsExpanded((prev) => !prev)
    }
  }, [hasFeedback])

  /**
   * Handles keyboard activation for accessibility.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleToggle()
      }
    },
    [handleToggle]
  )

  const cardId = `category-card-${category.name.toLowerCase().replace(/\s+/g, '-')}`
  const contentId = `${cardId}-content`

  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden',
        'transition-all duration-500 ease-out',
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4'
      )}
      role="article"
      aria-label={`${categoryLabel} score: ${category.score} out of 100`}
    >
      {/* Category header - clickable to expand */}
      <button
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        disabled={!hasFeedback}
        className={cn(
          'w-full p-3 sm:p-4 text-left transition-colors min-h-[56px]',
          hasFeedback && 'hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer',
          !hasFeedback && 'cursor-default',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Category icon */}
            <div
              className={cn(
                'flex h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-lg',
                config.bgColorClass
              )}
            >
              <IconComponent
                className={cn('h-4 w-4 sm:h-5 sm:w-5', config.iconColorClass)}
                aria-hidden="true"
              />
            </div>
            {/* Category name with high score indicator */}
            <div className="flex flex-col min-w-0">
              <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {categoryLabel}
              </span>
              {/* High score positive message */}
              {isHighScore && isVisible && (
                <span className="flex items-center gap-1 text-[11px] sm:text-xs text-green-600 dark:text-green-400 mt-0.5">
                  <ThumbsUp className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{translations.greatJob || 'Great job!'}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Score badge */}
            <div
              className={cn(
                'px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold tabular-nums',
                'bg-slate-100 dark:bg-slate-700',
                getScoreTextColor(displayScore)
              )}
            >
              {displayScore}%
            </div>

            {/* Expand/collapse chevron (only shown if has feedback) */}
            {hasFeedback && (
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-md',
                  'bg-slate-100 dark:bg-slate-700',
                  'transition-transform duration-200'
                )}
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-slate-500 dark:text-slate-400',
                    'transition-transform duration-200',
                    isExpanded && 'rotate-90'
                  )}
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
        </div>

        {/* Animated progress bar - always visible */}
        <div className="relative h-1.5 sm:h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mt-2 sm:mt-3">
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out',
              getProgressBgColor(category.score),
              isVisible && getProgressGlow(category.score)
            )}
            style={{
              width: isVisible ? `${category.score}%` : '0%',
              transitionDelay: `${animationDelay + 200}ms`,
            }}
            role="progressbar"
            aria-valuenow={category.score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${categoryLabel} progress`}
          />
        </div>
      </button>

      {/* Expandable feedback section */}
      <div
        id={contentId}
        role="region"
        aria-labelledby={cardId}
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        {hasFeedback && (
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-slate-100 dark:border-slate-700">
            {/* Feedback header */}
            <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 mt-2 sm:mt-3 mb-2 flex items-center gap-1.5">
              {category.score >= 75 ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                  {translations.strengthsIdentified || 'Strengths identified'}
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                  {translations.improvementAreas || 'Areas for improvement'}
                </>
              )}
            </p>

            {/* Feedback list with icons */}
            <ul className="space-y-1.5 sm:space-y-2">
              {category.feedback.map((item, index) => (
                <li
                  key={index}
                  className={cn(
                    'text-xs sm:text-sm flex items-start gap-2 sm:gap-2.5 p-2 rounded-lg',
                    category.score >= 75
                      ? 'bg-green-50 dark:bg-green-900/10 text-slate-700 dark:text-slate-300'
                      : category.score >= 50
                        ? 'bg-amber-50 dark:bg-amber-900/10 text-slate-700 dark:text-slate-300'
                        : 'bg-red-50 dark:bg-red-900/10 text-slate-700 dark:text-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-medium mt-0.5',
                      category.score >= 75
                        ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300'
                        : category.score >= 50
                          ? 'bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300'
                          : 'bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300'
                    )}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="flex-1 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Compact circular score gauge for job match display.
 * Smaller version of the main ScoreGauge with animation.
 */
function JobMatchScoreGauge({
  score,
  translations,
}: {
  score: number
  translations: ResumeReviewerTranslations
}) {
  const [displayScore, setDisplayScore] = useState(0)
  const [isAnimated, setIsAnimated] = useState(false)

  // Smaller SVG circle parameters
  const size = 80
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (displayScore / 100) * circumference

  /**
   * Determines stroke color based on score thresholds.
   */
  const getStrokeColor = useCallback((s: number): string => {
    if (s < 50) return '#ef4444' // red-500
    if (s <= 70) return '#f59e0b' // amber-500
    return '#22c55e' // green-500
  }, [])

  /**
   * Returns the text color class based on score.
   */
  const getTextColorClass = useCallback((s: number): string => {
    if (s < 50) return 'text-red-600 dark:text-red-400'
    if (s <= 70) return 'text-amber-600 dark:text-amber-400'
    return 'text-green-600 dark:text-green-400'
  }, [])

  /**
   * Returns interpretation text for job match score.
   */
  const getMatchInterpretation = useCallback((s: number): string => {
    if (s >= 80) return translations.scoreExcellent || 'Excellent'
    if (s >= 70) return translations.scoreGood || 'Good'
    if (s >= 50) return translations.scoreNeedsWork || 'Needs Improvement'
    return translations.scorePoor || 'Needs Significant Work'
  }, [translations])

  // Trigger animation after mount
  useEffect(() => {
    const startDelay = setTimeout(() => {
      setIsAnimated(true)
    }, 200)

    return () => clearTimeout(startDelay)
  }, [])

  // Animate score counting up once visible
  useEffect(() => {
    if (!isAnimated) return

    const duration = 1000
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const currentScore = Math.round(easeOut * score)

      setDisplayScore(currentScore)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [isAnimated, score])

  const strokeColor = getStrokeColor(displayScore)
  const textColorClass = getTextColorClass(displayScore)

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative"
        role="img"
        aria-label={`Job match score: ${score} out of 100. ${getMatchInterpretation(score)}`}
      >
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          aria-hidden="true"
        >
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200 dark:text-slate-700"
          />
          {/* Animated progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={isAnimated ? strokeDashoffset : circumference}
            className="transition-all duration-1000 ease-out"
            style={{
              filter: `drop-shadow(0 0 4px ${strokeColor}40)`,
            }}
          />
        </svg>

        {/* Score number display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'text-xl font-bold tabular-nums transition-colors duration-500',
              textColorClass
            )}
            aria-hidden="true"
          >
            {displayScore}%
          </span>
        </div>
      </div>

      {/* Interpretation text */}
      <p
        className={cn(
          'mt-2 text-xs font-medium transition-colors duration-500',
          textColorClass
        )}
      >
        {getMatchInterpretation(displayScore)}
      </p>
    </div>
  )
}

/**
 * Job Match Section component - displays job match analysis results.
 * Only renders when job description was provided during analysis.
 *
 * Features:
 * - Compact score gauge with animation
 * - Two-column layout for matched vs missing keywords
 * - Keyword pills with checkmarks and X icons
 * - Job-specific suggestions list
 * - Clear visual separation from general analysis
 */
function JobMatchSection({
  jobMatch,
  translations,
}: {
  jobMatch: JobMatchResult
  translations: ResumeReviewerTranslations
}) {
  const hasMatchedKeywords = jobMatch.matchedKeywords.length > 0
  const hasMissingKeywords = jobMatch.missingKeywords.length > 0
  const hasSuggestions = jobMatch.suggestions.length > 0

  return (
    <div className="space-y-4 sm:space-y-5 pt-4 sm:pt-5 border-t-2 border-violet-200 dark:border-violet-800">
      {/* Section header with distinct styling */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
          <Target
            className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
            {translations.jobMatchLabel || 'Job Match Analysis'}
          </h4>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
            How well your resume matches the job requirements
          </p>
        </div>
      </div>

      {/* Score gauge and label */}
      <div className="flex flex-col items-center py-3 sm:py-4 rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-100 dark:border-violet-800">
        <JobMatchScoreGauge score={jobMatch.score} translations={translations} />
        <p className="mt-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
          {translations.jobMatchScore || 'Match Score'}
        </p>
      </div>

      {/* Keywords comparison - Two column layout */}
      {(hasMatchedKeywords || hasMissingKeywords) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Matched Keywords Column */}
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <CheckCircle2
                className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 flex-shrink-0"
                aria-hidden="true"
              />
              <h5 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                {translations.matchedKeywordsLabel || 'Matched Keywords'}
              </h5>
              {hasMatchedKeywords && (
                <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded-full">
                  {jobMatch.matchedKeywords.length}
                </span>
              )}
            </div>

            {hasMatchedKeywords ? (
              <ul
                className="flex flex-wrap gap-1.5 sm:gap-2"
                aria-label="Matched keywords"
              >
                {jobMatch.matchedKeywords.map((keyword, index) => (
                  <li key={index}>
                    <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                      <CheckCircle2
                        className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-500 flex-shrink-0"
                        aria-hidden="true"
                      />
                      {keyword}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 italic py-2">
                No matched keywords found
              </p>
            )}
          </div>

          {/* Missing Keywords Column */}
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <X
                className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500 flex-shrink-0"
                aria-hidden="true"
              />
              <h5 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                {translations.missingKeywordsLabel || 'Missing Keywords'}
              </h5>
              {hasMissingKeywords && (
                <span className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded-full">
                  {jobMatch.missingKeywords.length}
                </span>
              )}
            </div>

            {hasMissingKeywords ? (
              <ul
                className="flex flex-wrap gap-1.5 sm:gap-2"
                aria-label="Missing keywords"
              >
                {jobMatch.missingKeywords.map((keyword, index) => (
                  <li key={index}>
                    <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                      <X
                        className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-red-500 flex-shrink-0"
                        aria-hidden="true"
                      />
                      {keyword}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 italic py-2">
                No missing keywords identified
              </p>
            )}
          </div>
        </div>
      )}

      {/* Job-specific suggestions */}
      {hasSuggestions && (
        <div className="space-y-2 sm:space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Lightbulb
              className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-violet-500 flex-shrink-0"
              aria-hidden="true"
            />
            <h5 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
              {translations.jobMatchSuggestionsLabel || 'Recommendations'}
            </h5>
          </div>

          <ul className="space-y-2 sm:space-y-2.5">
            {jobMatch.suggestions.map((suggestion, index) => (
              <li
                key={index}
                className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800"
              >
                <span
                  className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center bg-violet-100 dark:bg-violet-800/50 text-violet-700 dark:text-violet-300 text-[10px] sm:text-xs font-semibold"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {suggestion}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Display state for results section - shows the analysis results.
 * Renders overall score, categories, suggestions, and optional job match.
 * Includes "Analyze Another Resume" button for starting a new analysis.
 */
function ResultsDisplayState({
  translations,
  result,
  onAnalyzeAnother,
}: {
  translations: ResumeReviewerTranslations
  result: ResumeReviewResult
  /** Callback to reset form and start a new analysis */
  onAnalyzeAnother: () => void
}) {
  /**
   * Format timestamp to locale string.
   */
  const formatTimestamp = (isoString: string): string => {
    try {
      return new Date(isoString).toLocaleString()
    } catch {
      return isoString
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Overall Score with animated circular gauge */}
      <div className="flex flex-col items-center pb-4 sm:pb-6 border-b border-slate-200 dark:border-slate-700">
        <ScoreGauge score={result.overallScore} translations={translations} />
        <p className="mt-2 sm:mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-500">
          {translations.analyzedAtLabel || 'Analyzed'}: {formatTimestamp(result.analyzedAt)}
        </p>
      </div>

      {/* Categories with enhanced card layout */}
      <div className="space-y-3 sm:space-y-4">
        <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 sm:gap-2">
          <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-500" aria-hidden="true" />
          {translations.categoriesLabel || 'Categories'}
        </h4>

        {/* Responsive grid for category cards */}
        <div className="grid grid-cols-1 gap-2 sm:gap-3">
          {result.categories.map((category, index) => (
            <CategoryScoreCard
              key={category.name}
              category={category}
              translations={translations}
              animationDelay={index * 100}
            />
          ))}
        </div>
      </div>

      {/* Key Suggestions with Priority Indicators */}
      {result.suggestions.length > 0 && (
        <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 sm:gap-2">
              <Lightbulb className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 flex-shrink-0" aria-hidden="true" />
              {translations.keySuggestions || translations.suggestionsLabel || 'Key Suggestions'}
            </h4>
            <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
              {result.suggestions.length} {result.suggestions.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          <ul className="space-y-2 sm:space-y-3">
            {result.suggestions.map((suggestion, index) => {
              // First 3 suggestions are high priority, rest are normal
              const isHighPriority = index < 3
              const priorityColors = isHighPriority
                ? {
                    bg: index === 0
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      : index === 1
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
                    badge: index === 0
                      ? 'bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300'
                      : index === 1
                        ? 'bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300'
                        : 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300',
                  }
                : {
                    bg: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
                    badge: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
                  }

              return (
                <li
                  key={index}
                  className={cn(
                    'flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-all',
                    priorityColors.bg
                  )}
                >
                  {/* Priority indicator */}
                  <div
                    className={cn(
                      'flex-shrink-0 w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center',
                      priorityColors.badge
                    )}
                    aria-label={isHighPriority ? `Priority ${index + 1}` : `Suggestion ${index + 1}`}
                  >
                    {isHighPriority ? (
                      <span className="text-xs sm:text-sm font-bold">{index + 1}</span>
                    ) : (
                      <span className="text-[10px] sm:text-xs font-medium">{index + 1}</span>
                    )}
                  </div>

                  {/* Suggestion content */}
                  <div className="flex-1 min-w-0">
                    {isHighPriority && (
                      <span
                        className={cn(
                          'inline-block text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide mb-0.5 sm:mb-1',
                          index === 0
                            ? 'text-red-600 dark:text-red-400'
                            : index === 1
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-yellow-600 dark:text-yellow-400'
                        )}
                      >
                        {translations.prioritySuggestion || 'Priority'} #{index + 1}
                      </span>
                    )}
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {suggestion}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Job Match Section - Only visible when job description was provided */}
      {result.jobMatch && (
        <JobMatchSection
          jobMatch={result.jobMatch}
          translations={translations}
        />
      )}

      {/* Analyze Another Resume Button */}
      <div className="pt-4 sm:pt-6 border-t border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={onAnalyzeAnother}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 px-4 py-3',
            'text-xs sm:text-sm font-medium rounded-lg',
            'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200',
            'hover:bg-slate-200 dark:hover:bg-slate-600',
            'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
            'transition-colors min-h-[48px] sm:min-h-[44px]'
          )}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {translations.analyzeAnotherButton || 'Analyze Another Resume'}
        </button>
      </div>
    </div>
  )
}
