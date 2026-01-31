'use client'

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
} from 'react'
import { useSession } from 'next-auth/react'
import {
  FileText,
  Upload,
  FolderOpen,
  ClipboardPaste,
  Link,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
  ResumeLinker,
  type ResumeLinkerTranslations,
} from './resume-linker'
import { ResumeFileUpload, type ResumeFileUploadTranslations } from './resume-file-upload'
import { ResumeTextInput, type ResumeTextInputTranslations } from './resume-text-input'
import {
  GrammarResults,
  GrammarResultsSkeleton,
  type GrammarResultsTranslations,
} from './grammar-results'
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
import type { GrammarAnalysisResponse } from '@/types/grammar-check'

/**
 * Minimum character count required for grammar analysis.
 */
const MIN_PASTE_CHARACTERS = 100

/**
 * SVG Flag components for language selection.
 * Simple, lightweight representations of country flags.
 */
function FlagGB({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 30" width="20" height="10" aria-hidden="true">
      {/* Blue background */}
      <rect width="60" height="30" fill="#012169" />
      {/* White diagonal stripes */}
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      {/* Red diagonal stripes */}
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" />
      {/* White cross */}
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
      {/* Red cross */}
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

function FlagFR({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" width="20" height="13" aria-hidden="true">
      <rect width="10" height="20" fill="#002395" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ED2939" />
    </svg>
  )
}

function FlagDE({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" width="20" height="13" aria-hidden="true">
      <rect width="30" height="6.67" fill="#000" />
      <rect y="6.67" width="30" height="6.67" fill="#DD0000" />
      <rect y="13.33" width="30" height="6.67" fill="#FFCC00" />
    </svg>
  )
}

function FlagIT({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" width="20" height="13" aria-hidden="true">
      <rect width="10" height="20" fill="#009246" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#CE2B37" />
    </svg>
  )
}

/**
 * Language options for grammar analysis.
 * Users can select which language to use for checking grammar.
 */
const LANGUAGE_OPTIONS = [
  { code: 'en', flag: <FlagGB />, fullName: 'English' },
  { code: 'fr', flag: <FlagFR />, fullName: 'Français' },
  { code: 'de', flag: <FlagDE />, fullName: 'Deutsch' },
  { code: 'it', flag: <FlagIT />, fullName: 'Italiano' },
] as const

/**
 * Decodes common HTML entities to their text equivalents.
 * Handles &nbsp;, &amp;, &lt;, &gt;, &quot;, and numeric entities.
 */
function decodeHtmlEntities(text: string): string {
  const entityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&mdash;': '\u2014',
    '&ndash;': '\u2013',
    '&bull;': '\u2022',
    '&hellip;': '\u2026',
    '&copy;': '\u00A9',
    '&reg;': '\u00AE',
    '&trade;': '\u2122',
  }

  // Replace named entities
  let decoded = text.replace(/&[a-z]+;/gi, (match) => entityMap[match] || match)

  // Replace numeric entities (decimal)
  decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))

  // Replace numeric entities (hex)
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  return decoded
}

/**
 * Strips HTML tags from a string, converting it to plain text.
 * Used for extracting text content from rich text fields like skillsHtml.
 * Also decodes HTML entities like &nbsp; to their text equivalents.
 */
function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Formats resume text for preview display.
 * Renders text with proper line breaks and formatting.
 */
function formatPreviewText(text: string): React.ReactNode {
  if (!text) return null

  // Decode any remaining HTML entities in the text
  const decodedText = decodeHtmlEntities(text)

  // Split by double line breaks for paragraphs
  const paragraphs = decodedText.split(/\n\n+/)

  return paragraphs.map((paragraph, pIndex) => {
    const lines = paragraph.split('\n')

    return (
      <React.Fragment key={pIndex}>
        {lines.map((line, lIndex) => (
          <React.Fragment key={lIndex}>
            {line}
            {lIndex < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
        {pIndex < paragraphs.length - 1 && (
          <>
            <br />
            <br />
          </>
        )}
      </React.Fragment>
    )
  })
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
    sections.push(`SUMMARY\n${stripHtmlTags(resume.summary)}`)
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
        if (exp.description) lines.push(stripHtmlTags(exp.description))
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
        if (edu.description) lines.push(stripHtmlTags(edu.description))
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
        if (proj.description) lines.push(stripHtmlTags(proj.description))
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
 * Combined translation interface for all Grammar Checker UI strings.
 * This is passed from the server component which has access to translations.
 */
export interface GrammarCheckerTranslations {
  inputSection: string
  resultsSection: string
  tabLinkResume: string
  tabMyResumes: string
  tabPasteText: string
  tabUploadFile: string
  checkButton: string
  checkingButton: string
  emptyStateTitle: string
  emptyStateDescription: string
  // File upload specific translations
  uploadLabel?: string
  dragDropText?: string
  browseText?: string
  acceptedFilesText?: string
  fileTooLargeError?: string
  unsupportedFileError?: string
  extractionFailedError?: string
  extractingText?: string
  removeFileLabel?: string
  fileSizeLimit?: string
  // Paste tab specific translations
  pasteLabel?: string
  pastePlaceholder?: string
  clearTextButton?: string
  characterCount?: string
  minCharactersWarning?: string
  minCharsError?: string
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
  // ResumeLinker translations
  resumeLinker: ResumeLinkerTranslations
  // GrammarResults translations
  results: GrammarResultsTranslations
  // Toast messages
  analysisComplete?: string
  analysisFailed?: string
  // Check again button
  checkAgainButton?: string
  // Language selector
  selectLanguage?: string
}

interface GrammarCheckerClientProps {
  /** Locale for navigation links and API calls */
  locale: string
  /** Translated UI strings */
  translations: GrammarCheckerTranslations
}

/**
 * Enum for the four resume input methods available in the tabbed interface.
 * Order: Link to Resume | Paste Text | Upload File | My Resumes
 * 'link' allows users to link to a saved resume from their account.
 * 'my-resumes' is only shown to authenticated users.
 */
type InputTab = 'link' | 'paste' | 'upload' | 'my-resumes'

/**
 * GrammarCheckerClient is the main client component for the Grammar Checker feature.
 * It provides three input methods: select from saved resumes, paste text, or file upload.
 *
 * Layout:
 * - Left column: Input section with tabs (My Resumes / Paste Text / Upload File)
 * - Right column: Results section (empty state until check complete)
 */
export function GrammarCheckerClient({
  locale,
  translations,
}: GrammarCheckerClientProps) {
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'
  const toast = useToast()

  // Tab state - starts on 'link' tab (first tab, visible to all users)
  const [activeTab, setActiveTab] = useState<InputTab>('link')

  // Language selection state for grammar analysis
  const [analysisLanguage, setAnalysisLanguage] = useState<'en' | 'fr' | 'de' | 'it'>(
    (locale === 'en' || locale === 'fr' || locale === 'de' || locale === 'it') ? locale : 'en'
  )

  // Resume text state - populated by any input method
  const [resumeText, setResumeText] = useState('')

  // State for the linked resume in the 'my-resumes' tab
  const [linkedResumeId, setLinkedResumeId] = useState<string | null>(null)
  const [isLoadingResume, setIsLoadingResume] = useState(false)

  // Analysis state - tracks when grammar check is in progress
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Analysis result state - holds the grammar check results
  const [analysisResult, setAnalysisResult] = useState<GrammarAnalysisResponse | null>(null)

  // Refs for tab keyboard navigation
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const inputSectionRef = useRef<HTMLDivElement>(null)

  /**
   * Get available tabs based on authentication status.
   * Order: Link to Resume | Paste Text | Upload File | My Resumes
   * The "Link to Resume" tab is always first and visible to all users.
   * The "My Resumes" tab is only shown to authenticated users.
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
        icon: <Link className="h-4 w-4" aria-hidden="true" />,
      },
      {
        id: 'paste',
        label: translations.tabPasteText || 'Paste Text',
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
        label: translations.tabMyResumes || 'My Resumes',
        icon: <FolderOpen className="h-4 w-4" aria-hidden="true" />,
      })
    }

    return tabs
  }, [isAuthenticated, translations])

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
   * Clears state when switching between tabs to ensure only one input method is active.
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
        case 'my-resumes':
          // Leaving my-resumes tab: clear linked resume selection
          setLinkedResumeId(null)
          break
        // 'paste' and 'upload' tabs share resumeText
      }

      // Clear resume text when switching tabs
      setResumeText('')
      setActiveTab(newTab)
    },
    [activeTab]
  )

  /**
   * Handles selection of a linked resume from the 'my-resumes' tab.
   * Fetches the full resume data and converts it to plain text.
   */
  const handleLinkedResumeSelect = useCallback(
    async (resumeId: string) => {
      setLinkedResumeId(resumeId)
      setIsLoadingResume(true)

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
   * Handles text extracted from file upload.
   */
  const handleFileTextExtracted = useCallback((text: string) => {
    setResumeText(text)
  }, [])

  /**
   * Determines if the check button should be enabled.
   * Requires minimum character count.
   * Button is also disabled during analysis or loading states.
   */
  const canCheck =
    !isAnalyzing &&
    !isLoadingResume &&
    resumeText.length >= MIN_PASTE_CHARACTERS

  /**
   * Initiates the grammar check by calling the grammar-check API.
   * Handles validation, API call, response parsing, and error handling.
   */
  const handleCheckGrammar = useCallback(async () => {
    if (!resumeText || resumeText.length < MIN_PASTE_CHARACTERS) return

    setIsAnalyzing(true)
    setAnalysisResult(null)

    try {
      const response = await fetch('/api/tools/grammar-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, locale: analysisLanguage }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Analysis failed')
      }

      const data = await response.json()
      setAnalysisResult({
        overallScore: data.overallScore,
        issueCount: data.issueCount,
        issues: data.issues,
      })

      toast.success(translations.analysisComplete || 'Analysis complete')
    } catch (error) {
      console.error('Grammar check failed:', error)
      toast.error(translations.analysisFailed || 'Failed to analyze grammar')
    } finally {
      setIsAnalyzing(false)
    }
  }, [resumeText, analysisLanguage, translations.analysisComplete, translations.analysisFailed, toast])

  /**
   * Resets the analysis state to allow checking again.
   * Scrolls the input section into view for convenience.
   */
  const handleCheckAgain = useCallback(() => {
    setAnalysisResult(null)
    // Scroll to input section for convenience
    inputSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  /**
   * Build file upload translations from the main translations object.
   */
  const fileUploadTranslations: ResumeFileUploadTranslations = useMemo(
    () => ({
      uploadLabel: translations.uploadLabel || 'Upload your resume',
      dragDropText: translations.dragDropText || 'Drag and drop your file here or',
      browseText: translations.browseText || 'browse',
      acceptedFilesText: translations.acceptedFilesText || 'PDF or DOCX (max 5MB)',
      fileTooLargeError: translations.fileTooLargeError || 'File is too large. Maximum size is 5MB.',
      unsupportedFileError: translations.unsupportedFileError || 'Unsupported file type. Please upload a PDF or DOCX file.',
      extractionFailedError: translations.extractionFailedError || 'Failed to extract text from file. Please try again.',
      extractingText: translations.extractingText || 'Extracting text...',
      removeFileLabel: translations.removeFileLabel || 'Remove file',
    }),
    [translations]
  )

  /**
   * Build text input translations from the main translations object.
   */
  const textInputTranslations: ResumeTextInputTranslations = useMemo(
    () => ({
      resumeLabel: translations.pasteLabel || 'Paste your resume content',
      resumePlaceholder: translations.pastePlaceholder || 'Paste your resume text here...',
      minCharsError: translations.minCharsError || 'Please enter at least {count} characters',
    }),
    [translations]
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
      {/* Left column: Input section */}
      <div ref={inputSectionRef} className="space-y-4 sm:space-y-6">
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
          {translations.inputSection}
        </h2>

        {/* Tab navigation with ARIA support and language selector */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
          {/* Tab buttons */}
          <div
            role="tablist"
            aria-label="Resume input methods"
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

          {/* Language selector */}
          <div
            role="group"
            aria-label={translations.selectLanguage || 'Select analysis language'}
            className="flex items-center gap-1 px-2 pb-2"
          >
            {LANGUAGE_OPTIONS.map((lang) => {
              const isSelected = analysisLanguage === lang.code

              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setAnalysisLanguage(lang.code)}
                  aria-pressed={isSelected}
                  aria-label={lang.fullName}
                  className={cn(
                    'flex items-center justify-center px-2 py-1.5 rounded-full transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1',
                    isSelected
                      ? 'bg-teal-600 ring-2 ring-teal-600 ring-offset-1'
                      : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'
                  )}
                >
                  {lang.flag}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-h-[280px] sm:min-h-[300px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6">
          {/* Link to Resume Tab Panel - visible to all users */}
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
                      <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-6">
                        {formatPreviewText(resumeText.slice(0, 500))}
                        {resumeText.length > 500 && '...'}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {new Intl.NumberFormat().format(resumeText.length)}{' '}
                      {translations.charactersExtracted || 'characters'}
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
              <ResumeTextInput
                value={resumeText}
                onChange={setResumeText}
                translations={textInputTranslations}
                minChars={MIN_PASTE_CHARACTERS}
              />
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
                <ResumeFileUpload
                  onTextExtracted={handleFileTextExtracted}
                  translations={fileUploadTranslations}
                  disabled={isAnalyzing}
                />
                {/* Extracted text preview */}
                {resumeText && (
                  <div className="mt-3 sm:mt-4">
                    <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      {translations.extractedContent || 'Extracted Content'}
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 sm:p-4 max-h-36 sm:max-h-48 overflow-y-auto">
                      <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-6">
                        {formatPreviewText(resumeText.slice(0, 500))}
                        {resumeText.length > 500 && '...'}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {new Intl.NumberFormat().format(resumeText.length)}{' '}
                      {translations.charactersExtracted || 'characters extracted'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* My Resumes Tab Panel - Only rendered when authenticated */}
          {isAuthenticated && (
            <div
              role="tabpanel"
              id="tabpanel-my-resumes"
              aria-labelledby="tab-my-resumes"
              hidden={activeTab !== 'my-resumes'}
              tabIndex={0}
            >
              {activeTab === 'my-resumes' && (
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
                        <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-6">
                          {formatPreviewText(resumeText.slice(0, 500))}
                          {resumeText.length > 500 && '...'}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {new Intl.NumberFormat().format(resumeText.length)}{' '}
                        {translations.charactersExtracted || 'characters'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Check Grammar Button */}
        <button
          type="button"
          onClick={handleCheckGrammar}
          disabled={!canCheck}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-all',
            'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
            canCheck
              ? 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800'
              : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
          )}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              {translations.checkingButton || 'Checking...'}
            </>
          ) : (
            <>
              <FileText className="h-5 w-5" aria-hidden="true" />
              {translations.checkButton || 'Check Grammar'}
            </>
          )}
        </button>
      </div>

      {/* Right column: Results section */}
      <div className="space-y-4 sm:space-y-6">
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
          {translations.resultsSection}
        </h2>

        {/* Results container */}
        <div className="min-h-[400px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 sm:p-8">
          {isAnalyzing ? (
            <GrammarResultsSkeleton />
          ) : analysisResult ? (
            <div className="space-y-6">
              <GrammarResults
                analysis={analysisResult}
                isLoading={false}
                translations={translations.results}
              />
              {/* Check Again button */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleCheckAgain}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium',
                    'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20',
                    'hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2'
                  )}
                >
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  {translations.checkAgainButton || 'Check Another Resume'}
                </button>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                {translations.emptyStateTitle || 'No Results Yet'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                {translations.emptyStateDescription ||
                  'Upload, paste, or select a resume to check for grammar and spelling errors.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
