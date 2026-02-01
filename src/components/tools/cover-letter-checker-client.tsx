'use client'

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type DragEvent,
  type ChangeEvent,
} from 'react'
import { Mail, ClipboardPaste, Upload, Loader2, AlertCircle, Sparkles, CheckCircle2, AlertTriangle, CheckCircle, Briefcase, RefreshCw, Link, FileText, X, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScoreGauge, COVER_LETTER_THRESHOLDS } from '@/components/tools/score-gauge'
import { CoverLetterLinker, type CoverLetterLinkerTranslations } from './cover-letter-linker'
import { JobLinker, type JobLinkerTranslations } from './job-linker'
import { createClient } from '@/lib/supabase/client'
import type { CoverLetter } from '@/types/database'

/**
 * Category analysis result structure for cover letter analysis.
 * Matches the API response from /api/tools/check-cover-letter.
 */
interface CategoryResult {
  name: string
  score: number
  feedback: string
}

/**
 * Job match analysis result structure (when job description is provided).
 */
interface JobMatchResult {
  score: number
  matchedKeywords: string[]
  missingKeywords: string[]
  suggestions: string[]
}

/**
 * Complete cover letter analysis response structure.
 * Matches the API response from /api/tools/check-cover-letter.
 */
export interface CoverLetterAnalysis {
  overallScore: number
  categories: CategoryResult[]
  strengths: string[]
  improvements: string[]
  jobMatch?: JobMatchResult
}

/**
 * Maximum file size in bytes (5MB).
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * Accepted file extensions and MIME types.
 */
const ACCEPTED_EXTENSIONS = '.pdf,.docx'
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

/**
 * Combined translation interface for all Cover Letter Checker UI strings.
 * This is passed from the server component which has access to translations.
 */
export interface CoverLetterCheckerTranslations {
  tabs: {
    linkCoverLetter: string
    pasteText: string
    uploadFile: string
  }
  textareaPlaceholder: string
  characterCount: string
  minCharsWarning: string
  jobDescriptionToggle: string
  jobDescriptionPlaceholder: string
  checkButton: string
  checkingButton: string
  /** Drag-drop zone translations for file upload */
  dragDropText: string
  browseText: string
  acceptedFilesText: string
  extractingText: string
  /** Job input tab labels */
  tabJobLink: string
  tabJobPaste: string
  /** Loading states */
  loadingCoverLetterContent: string
  loadingJobDescription: string
  /** Job description label */
  jobLabel: string
}

export interface CoverLetterCheckerResultsTranslations {
  overallScore: string
  categories: {
    structure: string
    tone: string
    clarity: string
    relevance: string
    callToAction: string
  }
  strengths: string
  improvements: string
}

export interface CoverLetterCheckerJobMatchTranslations {
  title: string
  score: string
  matchedKeywords: string
  missingKeywords: string
  suggestions: string
}

export interface CoverLetterCheckerErrorTranslations {
  tooShort: string
  uploadFailed: string
  networkError: string
  rateLimited: string
  tryAgain: string
  coverLetterLoadError: string
  jobDescriptionLoadError: string
}

export interface CoverLetterCheckerEmptyTranslations {
  noResults: string
  getStarted: string
}

export interface CoverLetterCheckerJobUrlExtractionTranslations {
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

export interface CoverLetterCheckerAllTranslations {
  ui: CoverLetterCheckerTranslations
  results: CoverLetterCheckerResultsTranslations
  jobMatch: CoverLetterCheckerJobMatchTranslations
  error: CoverLetterCheckerErrorTranslations
  empty: CoverLetterCheckerEmptyTranslations
  coverLetterLinker: CoverLetterLinkerTranslations
  jobLinker: JobLinkerTranslations
  jobUrlExtraction: CoverLetterCheckerJobUrlExtractionTranslations
}

interface CoverLetterCheckerClientProps {
  /** Locale for navigation links and API calls */
  locale: string
  /** Translations for all UI strings */
  translations: CoverLetterCheckerAllTranslations
}

/**
 * Minimum character count required for cover letter analysis.
 */
const MIN_COVER_LETTER_CHARACTERS = 100

/**
 * Minimum character count required for job description.
 */
const MIN_JOB_DESCRIPTION_CHARS = 100

/**
 * Input tab type for cover letter - link, paste, or upload.
 */
type CoverLetterInputTab = 'link' | 'paste' | 'upload'

/**
 * Input tab type for job description - link or paste.
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
 * Converts a cover letter's content to plain text for analysis.
 * Extracts and formats all relevant fields into a readable text format.
 */
function convertCoverLetterToText(coverLetter: CoverLetter): string {
  const sections: string[] = []

  // Greeting
  if (coverLetter.greeting) {
    sections.push(coverLetter.greeting)
  }

  // Opening paragraph
  if (coverLetter.opening_paragraph) {
    sections.push(coverLetter.opening_paragraph)
  }

  // Body paragraphs (stored as JSON array)
  if (coverLetter.body_paragraphs) {
    const bodyParagraphs = coverLetter.body_paragraphs as string[] | null
    if (Array.isArray(bodyParagraphs) && bodyParagraphs.length > 0) {
      sections.push(...bodyParagraphs.filter(Boolean))
    }
  }

  // Closing paragraph
  if (coverLetter.closing_paragraph) {
    sections.push(coverLetter.closing_paragraph)
  }

  // Sign-off and sender name
  const signOff: string[] = []
  if (coverLetter.sign_off) {
    signOff.push(coverLetter.sign_off)
  }
  if (coverLetter.sender_name) {
    signOff.push(coverLetter.sender_name)
  }
  if (signOff.length > 0) {
    sections.push(signOff.join('\n'))
  }

  return sections.join('\n\n')
}

/**
 * Cover Letter Checker client component.
 * Provides a two-column responsive layout for checking cover letters.
 * Left column (40%): Input controls for cover letter text/upload
 * Right column (60%): Results display with analysis
 */
export function CoverLetterCheckerClient({
  locale,
  translations,
}: CoverLetterCheckerClientProps) {
  const toast = useToast()

  // Tab state - starts on 'link' tab (first tab)
  const [activeTab, setActiveTab] = useState<CoverLetterInputTab>('link')

  // Cover letter text state
  const [coverLetterText, setCoverLetterText] = useState('')

  // Linked cover letter state
  const [linkedCoverLetterId, setLinkedCoverLetterId] = useState<string | null>(null)
  const [isLoadingCoverLetter, setIsLoadingCoverLetter] = useState(false)

  // File upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Job description state
  const [jobDescription, setJobDescription] = useState('')
  const [activeJobTab, setActiveJobTab] = useState<JobInputTab>('link')
  const [linkedJobId, setLinkedJobId] = useState<string | null>(null)
  const [isLoadingJob, setIsLoadingJob] = useState(false)
  const [jobUrl, setJobUrl] = useState('')
  const [isExtractingUrl, setIsExtractingUrl] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  // Analysis state
  const [isLoading, setIsLoading] = useState(false)
  const [analysis, setAnalysis] = useState<CoverLetterAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // Refs for tab keyboard navigation
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const jobTabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Character count and validation
  const characterCount = coverLetterText.length
  const isBelowMinimum = characterCount > 0 && characterCount < MIN_COVER_LETTER_CHARACTERS
  const formattedCount = new Intl.NumberFormat().format(characterCount)

  // Available tabs for cover letter input
  const availableTabs: Array<{
    id: CoverLetterInputTab
    label: string
    icon: React.ReactNode
  }> = useMemo(() => [
    {
      id: 'link',
      label: translations.ui.tabs.linkCoverLetter,
      icon: <Link className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'paste',
      label: translations.ui.tabs.pasteText,
      icon: <ClipboardPaste className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'upload',
      label: translations.ui.tabs.uploadFile,
      icon: <Upload className="h-4 w-4" aria-hidden="true" />,
    },
  ], [translations.ui.tabs])

  // Available tabs for job description input
  const availableJobTabs: Array<{
    id: JobInputTab
    label: string
    icon: React.ReactNode
  }> = useMemo(() => [
    {
      id: 'link',
      label: translations.ui.tabJobLink,
      icon: <Briefcase className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'paste',
      label: translations.ui.tabJobPaste,
      icon: <FileText className="h-4 w-4" aria-hidden="true" />,
    },
  ], [translations.ui.tabJobLink, translations.ui.tabJobPaste])

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
   * Handles tab changes with mutual exclusivity.
   */
  const handleTabChange = useCallback(
    (newTab: CoverLetterInputTab) => {
      if (newTab === activeTab) return

      // Clear state when switching tabs
      if (activeTab === 'link') {
        setLinkedCoverLetterId(null)
      }
      setCoverLetterText('')
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

      // Clear state from the previous tab
      if (activeJobTab === 'link') {
        setLinkedJobId(null)
        setJobUrl('')
        setUrlError(null)
      }

      if (newTab === 'link') {
        setJobDescription('')
      }

      setActiveJobTab(newTab)
    },
    [activeJobTab]
  )

  /**
   * Handles selection of a linked cover letter.
   * Fetches the full cover letter data and converts it to plain text.
   */
  const handleLinkedCoverLetterSelect = useCallback(
    async (coverLetterId: string) => {
      setLinkedCoverLetterId(coverLetterId)
      setIsLoadingCoverLetter(true)

      try {
        const supabase = createClient()

        // Fetch the full cover letter data
        const { data: coverLetter, error: fetchError } = await supabase
          .from('cover_letters')
          .select('*')
          .eq('id', coverLetterId)
          .single()

        if (fetchError) {
          throw fetchError
        }

        if (!coverLetter) {
          throw new Error(translations.error.coverLetterLoadError)
        }

        // Convert cover letter to plain text and set it
        const plainText = convertCoverLetterToText(coverLetter as CoverLetter)
        setCoverLetterText(plainText)
      } catch (err) {
        console.error('Error loading cover letter:', err)
        const errorMessage =
          err instanceof Error ? err.message : translations.error.coverLetterLoadError
        toast.error(errorMessage)
        // Reset selection on error
        setLinkedCoverLetterId(null)
      } finally {
        setIsLoadingCoverLetter(false)
      }
    },
    [toast, translations.error.coverLetterLoadError]
  )

  /**
   * Handles clearing the linked cover letter selection.
   */
  const handleLinkedCoverLetterClear = useCallback(() => {
    setLinkedCoverLetterId(null)
    setCoverLetterText('')
  }, [])

  /**
   * Handles selection of a linked job.
   * Fetches the full job_description from the job_applications record.
   */
  const handleLinkedJobSelect = useCallback(
    async (jobId: string) => {
      setLinkedJobId(jobId)
      setIsLoadingJob(true)
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
          throw new Error(translations.error.jobDescriptionLoadError)
        }

        // Set the job description for analysis
        setJobDescription(jobApplication.job_description)
      } catch (err) {
        console.error('Error loading job description:', err)
        const errorMessage =
          err instanceof Error ? err.message : translations.error.jobDescriptionLoadError
        toast.error(errorMessage)
        // Reset selection on error
        setLinkedJobId(null)
      } finally {
        setIsLoadingJob(false)
      }
    },
    [toast, translations.error.jobDescriptionLoadError]
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

      if (data.jobDescription) {
        setJobDescription(data.jobDescription)
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
   * Validates file type and size.
   * Returns error message if invalid, null if valid.
   */
  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        return translations.error.uploadFailed
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        return translations.error.uploadFailed
      }

      return null
    },
    [translations.error.uploadFailed]
  )

  /**
   * Extracts text from the file using the server-side API endpoint.
   */
  const extractText = useCallback(
    async (file: File) => {
      setIsUploading(true)
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
          // Try to parse error details from JSON body, fallback to generic error
          let errorMessage = translations.error.uploadFailed
          try {
            const errorData: ExtractTextResponse = await response.json()
            errorMessage =
              errorData.message || errorData.error || translations.error.uploadFailed
          } catch {
            // JSON parsing failed, use generic error message
            errorMessage = translations.error.uploadFailed
          }
          throw new Error(errorMessage)
        }

        const data: ExtractTextResponse = await response.json()

        if (!data.success) {
          throw new Error(
            data.message || data.error || translations.error.uploadFailed
          )
        }

        if (!data.text) {
          throw new Error(translations.error.uploadFailed)
        }

        // Success - set the extracted text and switch to paste tab
        setCoverLetterText(data.text)
        setActiveTab('paste')
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : translations.error.uploadFailed
        console.error('Error extracting text from cover letter file:', err)
        setUploadError(errorMessage)
      } finally {
        setIsUploading(false)
      }
    },
    [translations.error.uploadFailed]
  )

  /**
   * Processes a selected file - validates and initiates extraction.
   */
  const processFile = useCallback(
    (file: File) => {
      // Validate the file
      const validationError = validateFile(file)
      if (validationError) {
        setUploadError(validationError)
        return
      }

      // Clear previous error and extract text
      setUploadError(null)
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
      if (!isUploading) {
        setIsDragActive(true)
      }
    },
    [isUploading]
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
      if (!isUploading) {
        setIsDragActive(true)
      }
    },
    [isUploading]
  )

  /**
   * Handles file drop event.
   */
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)

      if (isUploading) return

      const files = e.dataTransfer.files
      if (files && files.length > 0) {
        processFile(files[0])
      }
    },
    [isUploading, processFile]
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
    if (!isUploading && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }, [isUploading])

  /**
   * Handles job description textarea value changes.
   */
  const handleJobDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setJobDescription(e.target.value)
    },
    []
  )

  /**
   * Handles textarea value changes.
   */
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCoverLetterText(e.target.value)
    },
    []
  )

  /**
   * Determines if the check button should be enabled.
   * Requires minimum character count and not already loading.
   */
  const canCheck = !isLoading && characterCount >= MIN_COVER_LETTER_CHARACTERS

  /**
   * Clears the analysis error state and allows re-analysis.
   */
  const handleClearError = useCallback(() => {
    setAnalysisError(null)
  }, [])

  /**
   * Handles the cover letter check by calling the API endpoint.
   * Manages loading state and error handling with appropriate error messages.
   */
  const handleCheckCoverLetter = useCallback(async () => {
    if (!canCheck) return

    setIsLoading(true)
    setAnalysis(null)
    setAnalysisError(null)

    try {
      const response = await fetch('/api/tools/check-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverLetterText,
          jobDescription: jobDescription || undefined,
          locale,
        }),
      })

      if (!response.ok) {
        // Handle specific HTTP status codes
        if (response.status === 429) {
          throw new Error(translations.error.rateLimited)
        }

        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || translations.error.networkError)
      }

      const data = await response.json()

      if (!data.success || !data.analysis) {
        throw new Error(data.message || translations.error.networkError)
      }

      setAnalysis(data.analysis)
    } catch (error) {
      console.error('Cover letter check failed:', error)

      // Determine appropriate error message based on error type
      let errorMessage: string
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network connectivity issue
        errorMessage = translations.error.networkError
      } else if (error instanceof Error) {
        errorMessage = error.message
      } else {
        errorMessage = translations.error.networkError
      }

      setAnalysisError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [canCheck, coverLetterText, jobDescription, locale, translations.error.rateLimited, translations.error.networkError, toast])

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 md:gap-8 md:grid-cols-[40%_1fr]">
      {/* Left column: Input section (40% width on desktop) */}
      <section
        aria-labelledby="input-section-heading"
        className="space-y-4 sm:space-y-6"
      >
        <h2
          id="input-section-heading"
          className="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg"
        >
          Cover Letter Input
        </h2>

        {/* Tab navigation with ARIA support */}
        <div className="border-b border-slate-200 dark:border-slate-700">
          <div
            role="tablist"
            aria-label="Cover letter input methods"
            className="flex overflow-x-auto scrollbar-none -mx-1 px-1"
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
        </div>

        {/* Tab content */}
        <div className="min-h-[280px] sm:min-h-[300px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          {/* Link to Cover Letter Tab Panel */}
          <div
            role="tabpanel"
            id="tabpanel-link"
            aria-labelledby="tab-link"
            hidden={activeTab !== 'link'}
            tabIndex={0}
          >
            {activeTab === 'link' && (
              <div className="space-y-4">
                <CoverLetterLinker
                  onSelect={handleLinkedCoverLetterSelect}
                  onClear={handleLinkedCoverLetterClear}
                  selectedCoverLetterId={linkedCoverLetterId}
                  locale={locale}
                  translations={translations.coverLetterLinker}
                />
                {isLoadingCoverLetter && linkedCoverLetterId && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {translations.ui.loadingCoverLetterContent}
                  </div>
                )}
                {/* Show loaded cover letter preview when linked */}
                {coverLetterText && linkedCoverLetterId && !isLoadingCoverLetter && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Cover Letter Content
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                      <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-6">
                        {coverLetterText.slice(0, 500)}
                        {coverLetterText.length > 500 && '...'}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {formattedCount} characters
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Paste Text Tab Panel */}
          <div
            role="tabpanel"
            id="tabpanel-paste"
            aria-labelledby="tab-paste"
            hidden={activeTab !== 'paste'}
            tabIndex={0}
          >
            {activeTab === 'paste' && (
              <div className="space-y-2">
                {/* Textarea */}
                <textarea
                  id="cover-letter-text-input"
                  value={coverLetterText}
                  onChange={handleTextChange}
                  placeholder={translations.ui.textareaPlaceholder}
                  rows={10}
                  disabled={isLoading}
                  aria-invalid={isBelowMinimum}
                  aria-describedby={isBelowMinimum ? 'cover-letter-text-error' : undefined}
                  className={cn(
                    'w-full rounded-lg border bg-white dark:bg-slate-900 px-3 sm:px-4 py-3 text-sm',
                    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                    'transition-all duration-200 outline-none resize-y min-h-[180px] sm:min-h-[200px]',
                    'focus:ring-2 focus:ring-offset-0 focus:shadow-sm',
                    isBelowMinimum
                      ? 'border-red-300 dark:border-red-500 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-slate-200 dark:border-slate-600 focus:border-teal-500 focus:ring-teal-500/20 dark:focus:border-teal-400 dark:focus:ring-teal-400/20',
                    'text-slate-900 dark:text-slate-100',
                    isLoading && 'opacity-60 cursor-not-allowed'
                  )}
                />

                {/* Footer: Character count and warning message */}
                <div className="flex items-center justify-between gap-4">
                  {/* Warning message */}
                  {isBelowMinimum ? (
                    <p
                      id="cover-letter-text-error"
                      className="text-sm text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {translations.ui.minCharsWarning}
                    </p>
                  ) : (
                    <span />
                  )}

                  {/* Character count */}
                  <p
                    className={cn(
                      'text-xs tabular-nums',
                      isBelowMinimum
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {translations.ui.characterCount.replace('{count}', formattedCount)}
                  </p>
                </div>
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
              <div className="space-y-2">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={handleFileInputChange}
                  disabled={isUploading || isLoading}
                  className="sr-only"
                  aria-hidden="true"
                />

                {/* Drop zone */}
                <div
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={handleBrowseClick}
                  role="button"
                  tabIndex={isUploading || isLoading ? -1 : 0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleBrowseClick()
                    }
                  }}
                  aria-label={translations.ui.dragDropText}
                  aria-disabled={isUploading || isLoading}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-3 p-8',
                    'border-2 border-dashed rounded-lg cursor-pointer',
                    'transition-all duration-200 outline-none min-h-[200px]',
                    // Focus visible state for keyboard navigation
                    'focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                    // Base state
                    !isUploading &&
                      !isLoading &&
                      !isDragActive &&
                      'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50',
                    // Hover state
                    !isUploading &&
                      !isLoading &&
                      !isDragActive &&
                      'hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 hover:shadow-sm',
                    // Drag active state
                    isDragActive &&
                      'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-500/30',
                    // Uploading or loading state
                    (isUploading || isLoading) &&
                      'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/30 cursor-not-allowed opacity-60',
                    // Error state
                    uploadError && 'border-red-400 dark:border-red-500'
                  )}
                >
                  {/* Content based on state */}
                  {isUploading ? (
                    // Uploading/extracting state
                    <>
                      <Loader2
                        className="h-10 w-10 text-teal-600 dark:text-teal-400 animate-spin"
                        aria-hidden="true"
                      />
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {translations.ui.extractingText}
                      </p>
                    </>
                  ) : (
                    // Default drop zone state
                    <>
                      <Upload
                        className={cn(
                          'h-10 w-10',
                          isDragActive
                            ? 'text-teal-600 dark:text-teal-400'
                            : 'text-slate-400 dark:text-slate-500'
                        )}
                        aria-hidden="true"
                      />
                      <div className="text-center">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {translations.ui.dragDropText}{' '}
                          <span className="text-teal-600 dark:text-teal-400 font-medium hover:underline">
                            {translations.ui.browseText}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                          {translations.ui.acceptedFilesText}
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
              </div>
            )}
          </div>
        </div>

        {/* Job Description Section with Tabs */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
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
                  type="button"
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
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Job tab panels */}
          <div className="p-4">
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
                      {translations.ui.loadingJobDescription}
                    </div>
                  )}

                  {/* Show loaded job description preview when populated */}
                  {jobDescription && !isLoadingJob && !isExtractingUrl && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {translations.ui.jobLabel}
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
                        {new Intl.NumberFormat().format(jobDescription.length)} characters
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
                <div className="space-y-2">
                  <textarea
                    id="job-description-input"
                    value={jobDescription}
                    onChange={handleJobDescriptionChange}
                    placeholder={translations.ui.jobDescriptionPlaceholder}
                    rows={6}
                    disabled={isLoading}
                    className={cn(
                      'w-full rounded-lg border bg-white dark:bg-slate-900 px-3 sm:px-4 py-3 text-sm',
                      'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                      'transition-all duration-200 outline-none resize-y min-h-[120px]',
                      'focus:ring-2 focus:ring-offset-0 focus:shadow-sm',
                      'border-slate-200 dark:border-slate-600 focus:border-teal-500 focus:ring-teal-500/20 dark:focus:border-teal-400 dark:focus:ring-teal-400/20',
                      'text-slate-900 dark:text-slate-100',
                      isLoading && 'opacity-60 cursor-not-allowed'
                    )}
                  />
                  {/* Character count for job description */}
                  <div className="flex items-center justify-between gap-4">
                    {jobDescription.length > 0 && jobDescription.length < MIN_JOB_DESCRIPTION_CHARS ? (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        Minimum {MIN_JOB_DESCRIPTION_CHARS} characters recommended
                      </p>
                    ) : (
                      <span />
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {new Intl.NumberFormat().format(jobDescription.length)} characters
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Check Cover Letter Button */}
        <button
          type="button"
          onClick={handleCheckCoverLetter}
          disabled={!canCheck}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-all',
            'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
            'min-h-[44px]',
          canCheck
              ? 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800'
              : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              {translations.ui.checkingButton}
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              {translations.ui.checkButton}
            </>
          )}
        </button>
      </section>

      {/* Right column: Results section (60% width on desktop) */}
      <section
        aria-labelledby="results-section-heading"
        className="space-y-4 sm:space-y-6"
      >
        <h2
          id="results-section-heading"
          className="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg"
        >
          Analysis Results
        </h2>

        {/* Results container - scrollable on overflow */}
        <div className="min-h-[400px] max-h-[calc(100vh-200px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          {isLoading ? (
            /* Loading skeleton */
            <CoverLetterResultsSkeleton />
          ) : analysisError ? (
            /* Error state */
            <div className="flex min-h-[250px] flex-col items-center justify-center text-center sm:min-h-[300px]">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Analysis Failed</AlertTitle>
                <AlertDescription className="mt-2">
                  {analysisError}
                </AlertDescription>
              </Alert>
              <button
                type="button"
                onClick={handleClearError}
                className={cn(
                  'mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-xs min-h-[44px]',
                  'bg-slate-100 text-slate-700 hover:bg-slate-200',
                  'dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
                  'transition-colors duration-200 sm:text-sm',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2'
                )}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {translations.error.tryAgain}
              </button>
            </div>
          ) : analysis ? (
            /* Analysis results with score gauge */
            <div className="space-y-4 sm:space-y-6">
              {/* Overall Score Section */}
              <div className="flex flex-col items-center py-4">
                <ScoreGauge
                  score={analysis.overallScore}
                  size="lg"
                  thresholds={COVER_LETTER_THRESHOLDS}
                  label={translations.results.overallScore}
                />
              </div>

              {/* Category Breakdown Section */}
              <div className="space-y-3 sm:space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base">
                  Category Breakdown
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                  {analysis.categories.map((category) => (
                    <CategoryCard
                      key={category.name}
                      category={category}
                      translations={translations.results.categories}
                    />
                  ))}
                </div>
              </div>

              {/* Strengths and Improvements Sections */}
              <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                {/* Strengths Section */}
                {analysis.strengths && analysis.strengths.length > 0 && (
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:p-4">
                    <div className="mb-2 flex items-center gap-2 sm:mb-3">
                      <CheckCircle2
                        className="h-4 w-4 text-green-600 dark:text-green-400 sm:h-5 sm:w-5"
                        aria-hidden="true"
                      />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base">
                        {translations.results.strengths}
                      </h3>
                    </div>
                    <ul className="space-y-1.5 sm:space-y-2">
                      {analysis.strengths.map((strength, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle
                            className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600 dark:text-green-400 sm:h-4 sm:w-4"
                            aria-hidden="true"
                          />
                          <span className="text-xs text-slate-700 dark:text-slate-300 sm:text-sm">
                            {strength}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Areas for Improvement Section */}
                {analysis.improvements && analysis.improvements.length > 0 && (
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:p-4">
                    <div className="mb-2 flex items-center gap-2 sm:mb-3">
                      <AlertTriangle
                        className="h-4 w-4 text-amber-500 dark:text-amber-400 sm:h-5 sm:w-5"
                        aria-hidden="true"
                      />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base">
                        {translations.results.improvements}
                      </h3>
                    </div>
                    <ul className="space-y-1.5 sm:space-y-2">
                      {analysis.improvements.map((improvement, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500 dark:text-amber-400 sm:h-4 sm:w-4"
                            aria-hidden="true"
                          />
                          <span className="text-xs text-slate-700 dark:text-slate-300 sm:text-sm">
                            {improvement}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Job Match Analysis Section - Only shown when job description was provided */}
              {analysis.jobMatch && (
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:p-4">
                  {/* Section Header with Icon and Score Badge */}
                  <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Briefcase
                        className="h-4 w-4 text-teal-600 dark:text-teal-400 sm:h-5 sm:w-5"
                        aria-hidden="true"
                      />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base">
                        {translations.jobMatch.title}
                      </h3>
                    </div>
                    {/* Job Match Score Badge */}
                    <div
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm',
                        analysis.jobMatch.score >= 75
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          : analysis.jobMatch.score >= 50
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                      )}
                    >
                      <span className="tabular-nums">{analysis.jobMatch.score}%</span>
                      <span className="text-[10px] font-medium opacity-75 sm:text-xs">
                        {translations.jobMatch.score}
                      </span>
                    </div>
                  </div>

                  {/* Keywords Section */}
                  <div className="space-y-3 sm:space-y-4">
                    {/* Matched Keywords */}
                    {analysis.jobMatch.matchedKeywords && analysis.jobMatch.matchedKeywords.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 sm:mb-2 sm:text-sm">
                          {translations.jobMatch.matchedKeywords}
                        </p>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {analysis.jobMatch.matchedKeywords.map((keyword, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 sm:px-2.5 sm:py-1 sm:text-xs"
                            >
                              <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" aria-hidden="true" />
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Missing Keywords */}
                    {analysis.jobMatch.missingKeywords && analysis.jobMatch.missingKeywords.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 sm:mb-2 sm:text-sm">
                          {translations.jobMatch.missingKeywords}
                        </p>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {analysis.jobMatch.missingKeywords.map((keyword, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 sm:px-2.5 sm:py-1 sm:text-xs"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Job-Specific Suggestions */}
                    {analysis.jobMatch.suggestions && analysis.jobMatch.suggestions.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 sm:mb-2 sm:text-sm">
                          {translations.jobMatch.suggestions}
                        </p>
                        <ul className="space-y-1.5 sm:space-y-2">
                          {analysis.jobMatch.suggestions.map((suggestion, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span
                                className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-teal-500 dark:bg-teal-400 sm:mt-1.5 sm:h-1.5 sm:w-1.5"
                                aria-hidden="true"
                              />
                              <span className="text-xs text-slate-600 dark:text-slate-400 sm:text-sm">
                                {suggestion}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty state - shown when no results yet */
            <div className="flex min-h-[250px] flex-col items-center justify-center text-center sm:min-h-[300px]">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 sm:mb-4 sm:h-16 sm:w-16">
                <Mail className="h-6 w-6 text-slate-400 dark:text-slate-500 sm:h-8 sm:w-8" aria-hidden="true" />
              </div>
              <h4 className="mb-1.5 text-base font-semibold text-slate-900 dark:text-slate-100 sm:mb-2 sm:text-lg">
                {translations.empty.noResults}
              </h4>
              <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                {translations.empty.getStarted}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Returns the appropriate color class based on score value.
 * Red for scores below 50, yellow for 50-75, green for above 75.
 */
function getScoreColorClass(score: number): {
  bar: string
  text: string
} {
  if (score < 50) {
    return {
      bar: 'bg-red-500',
      text: 'text-red-600 dark:text-red-400',
    }
  }
  if (score <= 75) {
    return {
      bar: 'bg-yellow-500',
      text: 'text-yellow-600 dark:text-yellow-400',
    }
  }
  return {
    bar: 'bg-green-500',
    text: 'text-green-600 dark:text-green-400',
  }
}

/**
 * Maps category API names to translation keys.
 * Handles case variations and common naming patterns.
 */
function getCategoryTranslationKey(
  categoryName: string
): keyof CoverLetterCheckerResultsTranslations['categories'] | null {
  const normalized = categoryName.toLowerCase().replace(/[\s_-]+/g, '')

  const keyMap: Record<string, keyof CoverLetterCheckerResultsTranslations['categories']> = {
    structure: 'structure',
    tone: 'tone',
    clarity: 'clarity',
    relevance: 'relevance',
    calltoaction: 'callToAction',
    cta: 'callToAction',
  }

  return keyMap[normalized] ?? null
}

/**
 * Category card component for displaying individual category scores.
 * Shows category name, horizontal progress bar with percentage, and feedback text.
 */
interface CategoryCardProps {
  category: CategoryResult
  translations: CoverLetterCheckerResultsTranslations['categories']
}

function CategoryCard({ category, translations }: CategoryCardProps) {
  const colorClasses = getScoreColorClass(category.score)

  // Try to get translated category name, fallback to API name
  const translationKey = getCategoryTranslationKey(category.name)
  const displayName = translationKey ? translations[translationKey] : category.name

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4">
      {/* Category header with name and score */}
      <div className="mb-2 flex items-center justify-between sm:mb-3">
        <h4 className="text-xs font-medium text-slate-900 dark:text-slate-100 sm:text-sm">
          {displayName}
        </h4>
        <span className={cn('text-xs font-semibold tabular-nums sm:text-sm', colorClasses.text)}>
          {category.score}%
        </span>
      </div>

      {/* Horizontal progress bar */}
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700 sm:mb-3 sm:h-2">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClasses.bar)}
          style={{ width: `${category.score}%` }}
          role="progressbar"
          aria-valuenow={category.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${displayName}: ${category.score}%`}
        />
      </div>

      {/* Feedback text */}
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed sm:text-sm">
        {category.feedback}
      </p>
    </div>
  )
}

/**
 * Loading skeleton component for cover letter analysis results.
 * Displays animated placeholder content while analysis is in progress.
 */
function CoverLetterResultsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Overall score skeleton */}
      <div className="flex flex-col items-center gap-4">
        <div className="h-24 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-6 w-32 rounded bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* Categories skeleton */}
      <div className="space-y-4">
        <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="grid gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-2 flex-1 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-8 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      </div>

      {/* Strengths and improvements skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 rounded bg-slate-200 dark:bg-slate-700" style={{ width: `${85 - i * 10}%` }} />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-5 w-28 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 rounded bg-slate-200 dark:bg-slate-700" style={{ width: `${90 - i * 10}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
