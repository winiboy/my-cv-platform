'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { FileText, Sparkles, Mail, Loader2, ClipboardPaste, Briefcase, Settings, ListChecks, Bold, Italic, Underline, Wand2, Copy, Check, FileDown, AlertCircle, X, RefreshCw, Info, CheckCircle2, Upload, FolderOpen } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  ResumeLinker,
  type ResumeLinkerTranslations,
} from './resume-linker'
import {
  ResumeFileUpload,
  type ResumeFileUploadTranslations,
} from './resume-file-upload'
import {
  ResumeTextInput,
  type ResumeTextInputTranslations,
} from './resume-text-input'
import {
  JobDescriptionInput,
  type JobDescriptionInputTranslations,
} from './job-description-input'
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

  // Summary - strip HTML tags as summary may contain rich text
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
        // Strip HTML from description as it may contain rich text
        if (exp.description) lines.push(stripHtmlTags(exp.description))
        if (exp.achievements && exp.achievements.length > 0) {
          lines.push(exp.achievements.map((a) => `- ${stripHtmlTags(a)}`).join('\n'))
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
        // Strip HTML from description as it may contain rich text
        if (edu.description) lines.push(stripHtmlTags(edu.description))
        if (edu.achievements && edu.achievements.length > 0) {
          lines.push(edu.achievements.map((a) => `- ${stripHtmlTags(a)}`).join('\n'))
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
        // Strip HTML from description as it may contain rich text
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
 * Represents a key requirement or responsibility extracted from a job description.
 */
interface ExtractedDetail {
  /** Unique identifier for the detail */
  id: string
  /** The extracted text content */
  text: string
  /** Whether this detail is currently selected by the user */
  selected: boolean
}

/**
 * Minimum number of characters in a detail to be considered valid.
 * Filters out noise like "etc." or single-word items.
 */
const MIN_DETAIL_LENGTH = 15

/**
 * Maximum number of details to extract from a job description.
 */
const MAX_DETAILS = 10

/**
 * Default number of details to pre-select.
 */
const DEFAULT_SELECTED_COUNT = 4

/**
 * Minimum number of characters required for resume content.
 * Ensures the AI has enough context to generate a meaningful cover letter.
 */
const MIN_RESUME_CONTENT_LENGTH = 200

/**
 * Minimum number of characters required for job description.
 * Ensures the AI can identify key requirements and tailor the letter.
 */
const MIN_JOB_DESCRIPTION_LENGTH = 100

/**
 * Extracts key requirements and responsibilities from a job description.
 * Uses pattern matching to identify:
 * - Bullet points (various formats: -, *, .)
 * - Numbered lists
 * - Section headers like "Requirements:", "Responsibilities:", etc.
 * - Key qualifications and skills
 *
 * @param jobDescription - The raw job description text
 * @returns An array of extracted details with unique IDs
 */
function extractJobDetails(jobDescription: string): ExtractedDetail[] {
  if (!jobDescription || jobDescription.length < 50) {
    return []
  }

  const details: string[] = []
  const seenTexts = new Set<string>()

  /**
   * Helper to add a detail if it meets criteria and is not a duplicate.
   */
  const addDetail = (text: string): void => {
    // Clean and normalize the text
    const cleaned = text
      .replace(/^[-*.\d)+\s]+/, '') // Remove leading bullets/numbers
      .replace(/\s+/g, ' ')
      .trim()

    // Skip if too short, too long, or already seen
    if (
      cleaned.length < MIN_DETAIL_LENGTH ||
      cleaned.length > 200 ||
      seenTexts.has(cleaned.toLowerCase())
    ) {
      return
    }

    // Skip generic phrases that don't add value
    const skipPatterns = [
      /^(we are|we're) looking for/i,
      /^(the|a) candidate (will|should|must)/i,
      /^apply now/i,
      /^click here/i,
      /^learn more/i,
      /^about (us|the company)/i,
      /^equal opportunity/i,
      /^we offer/i,
    ]

    if (skipPatterns.some((pattern) => pattern.test(cleaned))) {
      return
    }

    seenTexts.add(cleaned.toLowerCase())
    details.push(cleaned)
  }

  // Split into lines for processing
  const lines = jobDescription.split(/\n/)

  // Track if we're in a relevant section
  let inRelevantSection = false
  const sectionHeaders = [
    /requirements?:?/i,
    /responsibilit(y|ies):?/i,
    /qualifications?:?/i,
    /what you('ll| will) (do|bring):?/i,
    /your (role|responsibilities):?/i,
    /key (duties|tasks|skills):?/i,
    /must have:?/i,
    /nice to have:?/i,
    /skills:?/i,
    /experience:?/i,
  ]

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Check if this is a section header
    if (sectionHeaders.some((pattern) => pattern.test(trimmedLine))) {
      inRelevantSection = true
      continue
    }

    // Check if this is an irrelevant section header
    const irrelevantHeaders = [
      /^benefits?:?$/i,
      /^perks?:?$/i,
      /^what we offer:?$/i,
      /^about (us|the company):?$/i,
      /^company (overview|description):?$/i,
    ]

    if (irrelevantHeaders.some((pattern) => pattern.test(trimmedLine))) {
      inRelevantSection = false
      continue
    }

    // Process bullet points and numbered lists
    const bulletPatterns = [
      /^[-*.\u2022\u25CF\u25CB]\s+(.+)$/, // Standard bullets
      /^\d+[.)]\s+(.+)$/, // Numbered lists
      /^[a-z][.)]\s+(.+)$/i, // Lettered lists
    ]

    for (const pattern of bulletPatterns) {
      const match = trimmedLine.match(pattern)
      if (match && match[1]) {
        addDetail(match[1])
        break
      }
    }

    // If in a relevant section and line looks like a requirement
    if (inRelevantSection && trimmedLine.length > MIN_DETAIL_LENGTH) {
      // Check if it's not just a continuation or header
      if (!trimmedLine.endsWith(':') && !trimmedLine.endsWith(',')) {
        addDetail(trimmedLine)
      }
    }
  }

  // If we didn't find enough through structured extraction,
  // try to find sentences containing key requirement indicators
  if (details.length < 3) {
    const requirementIndicators = [
      /(\d+\+?\s*years?\s+(?:of\s+)?experience\s+(?:in|with)\s+[^.]+)/gi,
      /(proficien(?:t|cy)\s+(?:in|with)\s+[^.]+)/gi,
      /(strong\s+(?:knowledge|understanding|skills?)\s+(?:of|in)\s+[^.]+)/gi,
      /(experience\s+(?:with|in|using)\s+[^.]+)/gi,
      /(ability\s+to\s+[^.]+)/gi,
      /(familiarity\s+with\s+[^.]+)/gi,
      /(expertise\s+in\s+[^.]+)/gi,
      /(bachelor'?s?|master'?s?|degree)\s+in\s+[^.]+/gi,
    ]

    for (const pattern of requirementIndicators) {
      const matches = jobDescription.matchAll(pattern)
      for (const match of matches) {
        if (match[1] || match[0]) {
          addDetail(match[1] || match[0])
        }
        if (details.length >= MAX_DETAILS) break
      }
      if (details.length >= MAX_DETAILS) break
    }
  }

  // Limit to MAX_DETAILS and create ExtractedDetail objects
  return details.slice(0, MAX_DETAILS).map((text, index) => ({
    id: `detail-${index}-${Date.now()}`,
    text,
    selected: index < DEFAULT_SELECTED_COUNT,
  }))
}

/**
 * Valid resume input tab identifiers.
 * 'upload' - Upload a PDF or DOCX file
 * 'paste' - Paste resume text directly
 * 'saved' - Select from saved resumes
 */
type ResumeInputTab = 'upload' | 'paste' | 'saved'

/**
 * Valid job input tab identifiers.
 * 'paste' - Paste job description text directly
 * 'saved' - Select from saved job applications
 */
type JobInputTab = 'paste' | 'saved'

/**
 * Valid letter length options.
 * 'short' - 2-3 paragraphs, concise and direct
 * 'medium' - 3-4 paragraphs, balanced detail
 * 'long' - 4-5 paragraphs, comprehensive
 */
export type LetterLength = 'short' | 'medium' | 'long'

/**
 * Valid writing tone options.
 * 'professional' - Formal and business-appropriate
 * 'enthusiastic' - Energetic and passionate
 * 'confident' - Assertive and self-assured
 * 'conversational' - Friendly and approachable
 */
export type WritingTone = 'professional' | 'enthusiastic' | 'confident' | 'conversational'

/**
 * Translations for the job details extraction section.
 */
export interface JobDetailsTranslations {
  sectionTitle: string
  sectionDescription: string
  noDetailsFound: string
  fewDetailsFound: string
  selectToEmphasize: string
  selectedCount: string
}

/**
 * Translations for empty state guidance messages.
 */
export interface EmptyStatesTranslations {
  resumeHint: string
  resumeDescription: string
  jobDescriptionHint: string
  jobDescriptionDescription: string
  readyToGenerate: string
  readyToGenerateDescription: string
}

/**
 * Valid output language options for cover letter generation.
 * Matches the supported locales in the application.
 */
export type OutputLanguage = 'en' | 'fr' | 'de' | 'it'

/**
 * Settings translations for the cover letter generator.
 */
export interface SettingsTranslations {
  settingsSection: string
  lengthLabel: string
  lengthShort: string
  lengthMedium: string
  lengthLong: string
  lengthShortDescription: string
  lengthMediumDescription: string
  lengthLongDescription: string
  toneLabel: string
  toneProfessional: string
  toneEnthusiastic: string
  toneConfident: string
  toneConversational: string
  toneProfessionalDescription: string
  toneEnthusiasticDescription: string
  toneConfidentDescription: string
  toneConversationalDescription: string
  outputLanguageLabel: string
  outputLanguageEnglish: string
  outputLanguageFrench: string
  outputLanguageGerman: string
  outputLanguageItalian: string
  customPromptLabel: string
  customPromptPlaceholder: string
}

/**
 * Generation action translations for the cover letter generator.
 */
export interface GenerationTranslations {
  generateButton: string
  generatingButton: string
  generationComplete: string
  generationFailed: string
  connectionError: string
  emptyResumeError: string
  emptyJobDescriptionError: string
  improveButton: string
  improvingButton: string
  retryButton: string
  dismissError: string
  resumeTooShortError: string
  jobDescriptionTooShortError: string
}

/**
 * Combined translation interface for all Cover Letter Generator UI strings.
 * This is passed from the server component which has access to translations.
 */
export interface CoverLetterGeneratorTranslations {
  inputSection: string
  outputSection: string
  resumeLabel: string
  emptyStateTitle: string
  emptyStateDescription: string
  loadingResumeContent: string
  resumeLoadError: string
  extractedContent: string
  charactersExtracted: string
  // Resume input tab labels
  tabUploadFile: string
  tabPasteText: string
  tabMyResumes: string
  // Resume input method translations
  resumeLinker: ResumeLinkerTranslations
  resumeFileUpload: ResumeFileUploadTranslations
  resumeTextInput: ResumeTextInputTranslations
  // Job description input translations
  jobDescriptionLabel: string
  tabJobPaste: string
  tabJobLink: string
  jobDescriptionInput: JobDescriptionInputTranslations
  jobLinker: JobLinkerTranslations
  loadingJobDescription: string
  jobLoadError: string
  // Job details extraction translations
  jobDetails: JobDetailsTranslations
  // Empty states guidance translations
  emptyStates: EmptyStatesTranslations
  // Settings translations
  settings: SettingsTranslations
  // Generation action translations
  generation: GenerationTranslations
}

/**
 * Props for the CoverLetterGeneratorClient component.
 */
interface CoverLetterGeneratorClientProps {
  /**
   * The current locale for i18n support.
   */
  locale: Locale
  /**
   * Translated UI strings.
   */
  translations: CoverLetterGeneratorTranslations
}

/**
 * Client component for the Cover Letter Generator tool.
 * Implements a two-column layout matching TealHQ parity:
 * - Left column (40%): Input section for resume and job description selection
 * - Right column (60%): Generated cover letter output
 *
 * Responsive behavior:
 * - Desktop (md+): Two-column grid with 40/60 split
 * - Mobile (<768px): Single column, stacked vertically
 *
 * This component allows users to:
 * - Select a resume to base the cover letter on
 * - Input or select a job description
 * - Generate AI-powered cover letters tailored to the position
 * - Edit and customize the generated content
 * - Export to various formats
 */
export function CoverLetterGeneratorClient({
  locale,
  translations,
}: CoverLetterGeneratorClientProps) {
  // Resume input tab state - 'upload' is first/default
  const [activeResumeTab, setActiveResumeTab] = useState<ResumeInputTab>('upload')

  // Resume selection state
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [resumeText, setResumeText] = useState<string>('')
  const [isLoadingResume, setIsLoadingResume] = useState(false)
  const [resumeLoadError, setResumeLoadError] = useState<string | null>(null)

  // Job description state
  const [activeJobTab, setActiveJobTab] = useState<JobInputTab>('paste')
  const [jobDescription, setJobDescription] = useState<string>('')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [isLoadingJob, setIsLoadingJob] = useState(false)
  const [jobLoadError, setJobLoadError] = useState<string | null>(null)

  // Extracted job details state
  const [extractedDetails, setExtractedDetails] = useState<ExtractedDetail[]>([])

  // Generation settings state
  const [letterLength, setLetterLength] = useState<LetterLength>('medium')
  const [writingTone, setWritingTone] = useState<WritingTone>('professional')
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>(locale as OutputLanguage)
  const [customPrompt, setCustomPrompt] = useState<string>('')

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [isImproving, setIsImproving] = useState(false)
  const [generatedCoverLetter, setGeneratedCoverLetter] = useState<string>('')
  const [generationError, setGenerationError] = useState<string | null>(null)

  // Editor state for WYSIWYG editing
  const editorRef = useRef<HTMLDivElement>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const isUserEditingRef = useRef(false)

  // Copy to clipboard state
  const [isCopied, setIsCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // PDF export state
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  // DOCX export state
  const [isExportingDocx, setIsExportingDocx] = useState(false)

  // Tab refs for keyboard navigation
  const resumeTabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const jobTabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Refs for aria-live announcements
  const statusAnnouncerRef = useRef<HTMLDivElement>(null)

  /**
   * Announces a message to screen readers via the live region.
   * Used for dynamic status updates (loading, success, error states).
   */
  const announceToScreenReader = useCallback((message: string) => {
    if (statusAnnouncerRef.current) {
      // Clear and re-set to ensure announcement is made even for same message
      statusAnnouncerRef.current.textContent = ''
      // Use requestAnimationFrame to ensure the clear takes effect
      requestAnimationFrame(() => {
        if (statusAnnouncerRef.current) {
          statusAnnouncerRef.current.textContent = message
        }
      })
    }
  }, [])

  /**
   * Extract key details from job description when it changes.
   * Uses a debounce-like approach by only extracting after a minimum length.
   */
  useEffect(() => {
    if (jobDescription.length >= 100) {
      const details = extractJobDetails(jobDescription)
      setExtractedDetails(details)
    } else {
      setExtractedDetails([])
    }
  }, [jobDescription])

  /**
   * Announce generation state changes to screen readers.
   * Provides feedback for loading, success, and error states.
   */
  useEffect(() => {
    if (isGenerating) {
      announceToScreenReader(translations.generation.generatingButton)
    }
  }, [isGenerating, announceToScreenReader, translations.generation.generatingButton])

  /**
   * Announce when cover letter generation completes successfully.
   */
  useEffect(() => {
    if (generatedCoverLetter && !isGenerating) {
      announceToScreenReader(translations.generation.generationComplete)
    }
  }, [generatedCoverLetter, isGenerating, announceToScreenReader, translations.generation.generationComplete])

  /**
   * Announce generation errors to screen readers.
   */
  useEffect(() => {
    if (generationError) {
      announceToScreenReader(generationError)
    }
  }, [generationError, announceToScreenReader])

  /**
   * Announce resume loading state to screen readers.
   */
  useEffect(() => {
    if (isLoadingResume) {
      announceToScreenReader(translations.loadingResumeContent)
    }
  }, [isLoadingResume, announceToScreenReader, translations.loadingResumeContent])

  /**
   * Announce job loading state to screen readers.
   */
  useEffect(() => {
    if (isLoadingJob) {
      announceToScreenReader(translations.loadingJobDescription)
    }
  }, [isLoadingJob, announceToScreenReader, translations.loadingJobDescription])

  /**
   * Sync generated cover letter to the contentEditable editor.
   * Only updates when not actively being edited by the user.
   */
  useEffect(() => {
    if (!editorRef.current || isUserEditingRef.current) return

    if (generatedCoverLetter) {
      // Convert plain text paragraphs to HTML paragraphs
      const htmlContent = generatedCoverLetter
        .split(/\n\n+/)
        .filter((paragraph) => paragraph.trim().length > 0)
        .map((paragraph) => `<p>${paragraph.trim()}</p>`)
        .join('')
      editorRef.current.innerHTML = htmlContent
    } else {
      editorRef.current.innerHTML = ''
    }
  }, [generatedCoverLetter])

  /**
   * Track active formatting state based on current selection.
   * Updates the toolbar button states to reflect current formatting.
   */
  useEffect(() => {
    const updateActiveFormats = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const formats = new Set<string>()

      try {
        if (document.queryCommandState('bold')) formats.add('bold')
        if (document.queryCommandState('italic')) formats.add('italic')
        if (document.queryCommandState('underline')) formats.add('underline')
      } catch {
        // queryCommandState can throw in some browsers
      }

      setActiveFormats(formats)
    }

    document.addEventListener('selectionchange', updateActiveFormats)
    return () => document.removeEventListener('selectionchange', updateActiveFormats)
  }, [])

  /**
   * Cleanup copy timeout on unmount to prevent memory leaks.
   */
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  /**
   * Handles toggling the selection of a specific job detail.
   * Updates the extractedDetails state with the new selection.
   */
  const handleDetailToggle = useCallback((detailId: string) => {
    setExtractedDetails((prev) =>
      prev.map((detail) =>
        detail.id === detailId
          ? { ...detail, selected: !detail.selected }
          : detail
      )
    )
  }, [])

  /**
   * Handles content changes in the WYSIWYG editor.
   * Updates the generatedCoverLetter state with the edited content.
   */
  const handleEditorInput = useCallback(() => {
    if (!editorRef.current) return

    isUserEditingRef.current = true

    // Extract plain text from the HTML content for state storage
    const htmlContent = editorRef.current.innerHTML
    // Convert HTML paragraphs back to double-newline separated text
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = htmlContent

    // Convert paragraphs to text with double newlines
    const paragraphs = tempDiv.querySelectorAll('p')
    let plainText: string

    if (paragraphs.length > 0) {
      plainText = Array.from(paragraphs)
        .map((p) => p.textContent || '')
        .filter((text) => text.trim().length > 0)
        .join('\n\n')
    } else {
      // Handle case where content is not in paragraphs (e.g., directly typed)
      plainText = tempDiv.textContent || ''
    }

    setGeneratedCoverLetter(plainText)

    // Reset the editing flag after a short delay to allow re-sync if needed
    setTimeout(() => {
      isUserEditingRef.current = false
    }, 100)
  }, [])

  /**
   * Handles keyboard shortcuts for formatting (Ctrl/Cmd + B/I/U).
   */
  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault()
            document.execCommand('bold')
            handleEditorInput()
            break
          case 'i':
            e.preventDefault()
            document.execCommand('italic')
            handleEditorInput()
            break
          case 'u':
            e.preventDefault()
            document.execCommand('underline')
            handleEditorInput()
            break
        }
      }
    },
    [handleEditorInput]
  )

  /**
   * Handles paste events to strip external formatting.
   * Only pastes plain text to maintain consistent styling.
   */
  const handleEditorPaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      document.execCommand('insertText', false, text)
      handleEditorInput()
    },
    [handleEditorInput]
  )

  /**
   * Applies a formatting command to the editor selection.
   * Supports bold, italic, and underline.
   */
  const handleFormat = useCallback(
    (command: 'bold' | 'italic' | 'underline') => {
      if (!editorRef.current) return

      editorRef.current.focus()
      document.execCommand(command)
      handleEditorInput()

      // Update active formats immediately for better UX
      const newFormats = new Set(activeFormats)
      if (newFormats.has(command)) {
        newFormats.delete(command)
      } else {
        newFormats.add(command)
      }
      setActiveFormats(newFormats)
    },
    [activeFormats, handleEditorInput]
  )

  /**
   * Returns the currently selected details for use in API calls.
   * Memoized to avoid unnecessary recalculations.
   */
  const selectedDetails = useMemo(
    () => extractedDetails.filter((detail) => detail.selected),
    [extractedDetails]
  )

  /**
   * Available resume input tabs configuration.
   * Order: Upload File | Paste Text | My Resumes
   * Each tab has an id, label, and icon for consistent rendering.
   */
  const resumeInputTabs = useMemo(
    () => [
      {
        id: 'upload' as ResumeInputTab,
        label: translations.tabUploadFile,
        icon: <Upload className="h-4 w-4" aria-hidden="true" />,
      },
      {
        id: 'paste' as ResumeInputTab,
        label: translations.tabPasteText,
        icon: <ClipboardPaste className="h-4 w-4" aria-hidden="true" />,
      },
      {
        id: 'saved' as ResumeInputTab,
        label: translations.tabMyResumes,
        icon: <FolderOpen className="h-4 w-4" aria-hidden="true" />,
      },
    ],
    [translations.tabUploadFile, translations.tabPasteText, translations.tabMyResumes]
  )

  /**
   * Available job input tabs configuration.
   * Each tab has an id, label, and icon for consistent rendering.
   */
  const jobInputTabs = useMemo(
    () => [
      {
        id: 'paste' as JobInputTab,
        label: translations.tabJobPaste,
        icon: <ClipboardPaste className="h-4 w-4" aria-hidden="true" />,
      },
      {
        id: 'saved' as JobInputTab,
        label: translations.tabJobLink,
        icon: <Briefcase className="h-4 w-4" aria-hidden="true" />,
      },
    ],
    [translations.tabJobPaste, translations.tabJobLink]
  )

  /**
   * Handles resume selection from the ResumeLinker component.
   * Fetches the full resume content and converts it to text.
   */
  const handleResumeSelect = useCallback(
    async (resumeId: string) => {
      setSelectedResumeId(resumeId)
      setResumeText('')
      setResumeLoadError(null)
      setIsLoadingResume(true)

      try {
        const supabase = createClient()

        const { data: resume, error } = await supabase
          .from('resumes')
          .select('*')
          .eq('id', resumeId)
          .single()

        if (error) {
          throw error
        }

        if (!resume) {
          throw new Error('Resume not found')
        }

        // Convert the resume to plain text and strip any remaining HTML tags
        const text = stripHtmlTags(convertResumeToText(resume))
        setResumeText(text)
      } catch (err) {
        console.error('Error loading resume:', err)
        setResumeLoadError(translations.resumeLoadError)
      } finally {
        setIsLoadingResume(false)
      }
    },
    [translations.resumeLoadError]
  )

  /**
   * Handles clearing the resume selection.
   * Resets all resume-related state.
   */
  const handleResumeClear = useCallback(() => {
    setSelectedResumeId(null)
    setResumeText('')
    setResumeLoadError(null)
  }, [])

  /**
   * Handles job selection from the JobLinker component.
   * Fetches the job description from the saved job application.
   */
  const handleJobSelect = useCallback(
    async (jobId: string) => {
      setSelectedJobId(jobId)
      setJobLoadError(null)
      setIsLoadingJob(true)

      try {
        const supabase = createClient()

        const { data: job, error } = await supabase
          .from('job_applications')
          .select('job_description')
          .eq('id', jobId)
          .single()

        if (error) {
          throw error
        }

        if (!job) {
          throw new Error('Job not found')
        }

        // Store the job description if available
        if (job.job_description) {
          setJobDescription(job.job_description)
        }
      } catch (err) {
        console.error('Error loading job description:', err)
        setJobLoadError(translations.jobLoadError)
      } finally {
        setIsLoadingJob(false)
      }
    },
    [translations.jobLoadError]
  )

  /**
   * Handles clearing the job selection.
   * Resets all job-related state.
   */
  const handleJobClear = useCallback(() => {
    setSelectedJobId(null)
    // Don't clear job description when clearing selection - user may have edited it
    setJobLoadError(null)
  }, [])

  /**
   * Determines if the generate button should be disabled.
   * Button is disabled when:
   * - Resume text is empty
   * - Job description is less than 100 characters
   * - Generation is in progress
   */
  const isGenerateDisabled = useMemo(() => {
    return !resumeText || jobDescription.length < 100 || isGenerating
  }, [resumeText, jobDescription.length, isGenerating])

  /**
   * Dismisses the current generation error.
   * Called when user clicks the X button on the error alert.
   */
  const handleDismissError = useCallback(() => {
    setGenerationError(null)
  }, [])

  /**
   * Handles the cover letter generation process.
   * Calls the API endpoint with all required parameters and handles success/error states.
   * Includes comprehensive pre-validation and error handling.
   */
  const handleGenerate = useCallback(async () => {
    // Pre-validation: Check if resume content is empty
    if (!resumeText) {
      setGenerationError(translations.generation.emptyResumeError)
      return
    }

    // Pre-validation: Check if resume content is too short
    if (resumeText.length < MIN_RESUME_CONTENT_LENGTH) {
      setGenerationError(translations.generation.resumeTooShortError)
      return
    }

    // Pre-validation: Check if job description is empty or too short
    if (!jobDescription || jobDescription.length < MIN_JOB_DESCRIPTION_LENGTH) {
      setGenerationError(translations.generation.jobDescriptionTooShortError)
      return
    }

    // Clear previous state and start generation
    setIsGenerating(true)
    setGenerationError(null)
    setGeneratedCoverLetter('')

    try {
      const response = await fetch('/api/tools/generate-cover-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeText,
          jobDescription,
          length: letterLength,
          tone: writingTone,
          selectedDetails: selectedDetails.map((d) => d.text),
          customPrompt: customPrompt.trim() || undefined,
          locale: outputLanguage,
        }),
      })

      if (!response.ok) {
        // Handle specific HTTP errors
        if (response.status >= 500) {
          throw new Error('server_error')
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'generation_failed')
      }

      const data = await response.json()

      if (!data.success || !data.coverLetter) {
        throw new Error('generation_failed')
      }

      // Success - clear any previous error and set the generated content
      setGenerationError(null)
      setGeneratedCoverLetter(data.coverLetter)
    } catch (err) {
      console.error('Error generating cover letter:', err)

      // Determine appropriate error message based on error type
      if (err instanceof TypeError && err.message.includes('fetch')) {
        // Network error - fetch failed entirely
        setGenerationError(translations.generation.connectionError)
      } else if (err instanceof Error && err.message === 'server_error') {
        // Server-side error (5xx)
        setGenerationError(translations.generation.connectionError)
      } else if (err instanceof Error && err.message === 'Failed to fetch') {
        // Another form of network error
        setGenerationError(translations.generation.connectionError)
      } else {
        // Generic generation failure
        setGenerationError(translations.generation.generationFailed)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [
    resumeText,
    jobDescription,
    letterLength,
    writingTone,
    outputLanguage,
    selectedDetails,
    customPrompt,
    translations.generation,
  ])

  /**
   * Handles regeneration/improvement of the cover letter.
   * Uses the same API endpoint with current settings to generate a new version.
   * Includes the same pre-validation as handleGenerate.
   */
  const handleImprove = useCallback(async () => {
    // Pre-validation: Check if resume content is empty
    if (!resumeText) {
      setGenerationError(translations.generation.emptyResumeError)
      return
    }

    // Pre-validation: Check if resume content is too short
    if (resumeText.length < MIN_RESUME_CONTENT_LENGTH) {
      setGenerationError(translations.generation.resumeTooShortError)
      return
    }

    // Pre-validation: Check if job description is empty or too short
    if (!jobDescription || jobDescription.length < MIN_JOB_DESCRIPTION_LENGTH) {
      setGenerationError(translations.generation.jobDescriptionTooShortError)
      return
    }

    // Clear previous error and start improving
    setIsImproving(true)
    setGenerationError(null)

    try {
      const response = await fetch('/api/tools/generate-cover-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeText,
          jobDescription,
          length: letterLength,
          tone: writingTone,
          selectedDetails: selectedDetails.map((d) => d.text),
          customPrompt: customPrompt.trim() || undefined,
          locale: outputLanguage,
        }),
      })

      if (!response.ok) {
        if (response.status >= 500) {
          throw new Error('server_error')
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'generation_failed')
      }

      const data = await response.json()

      if (!data.success || !data.coverLetter) {
        throw new Error('generation_failed')
      }

      // Success - clear any previous error and set the improved content
      setGenerationError(null)
      setGeneratedCoverLetter(data.coverLetter)
    } catch (err) {
      console.error('Error improving cover letter:', err)

      // Determine appropriate error message based on error type
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setGenerationError(translations.generation.connectionError)
      } else if (err instanceof Error && err.message === 'server_error') {
        setGenerationError(translations.generation.connectionError)
      } else if (err instanceof Error && err.message === 'Failed to fetch') {
        setGenerationError(translations.generation.connectionError)
      } else {
        setGenerationError(translations.generation.generationFailed)
      }
    } finally {
      setIsImproving(false)
    }
  }, [
    resumeText,
    jobDescription,
    letterLength,
    writingTone,
    outputLanguage,
    selectedDetails,
    customPrompt,
    translations.generation,
  ])

  /**
   * Handles copying the cover letter to clipboard.
   * Strips HTML formatting and copies plain text.
   * Shows visual feedback (icon change) for 2 seconds.
   */
  const handleCopyToClipboard = useCallback(async () => {
    if (!generatedCoverLetter) return

    // Clear any existing timeout
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = null
    }

    try {
      // Copy plain text to clipboard
      await navigator.clipboard.writeText(generatedCoverLetter)

      // Show success state
      setIsCopied(true)

      // Reset after 2 seconds
      copyTimeoutRef.current = setTimeout(() => {
        setIsCopied(false)
        copyTimeoutRef.current = null
      }, 2000)
    } catch (err) {
      // Fallback for browsers without clipboard API support
      console.error('Failed to copy to clipboard:', err)

      // Try fallback method using textarea
      try {
        const textArea = document.createElement('textarea')
        textArea.value = generatedCoverLetter
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        textArea.style.top = '-9999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)

        // Show success state
        setIsCopied(true)
        copyTimeoutRef.current = setTimeout(() => {
          setIsCopied(false)
          copyTimeoutRef.current = null
        }, 2000)
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr)
      }
    }
  }, [generatedCoverLetter])

  /**
   * Handles exporting the cover letter as a PDF file.
   * Creates a hidden container with styled HTML content, uses html2pdf.js
   * to generate a PDF with proper formatting (1 inch margins, 12pt font),
   * and triggers download with timestamp-based filename.
   *
   * Uses a timeout mechanism to prevent freezing if html2pdf fails silently.
   */
  const handlePdfExport = useCallback(async () => {
    if (!generatedCoverLetter || isExportingPdf) return

    setIsExportingPdf(true)

    try {
      // Dynamically import jsPDF to avoid SSR issues
      const { jsPDF } = await import('jspdf')

      // Create PDF document (Letter size: 8.5 x 11 inches)
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
      })

      // Page dimensions and margins (1 inch = 72 points)
      const pageWidth = 612 // 8.5 inches
      const pageHeight = 792 // 11 inches
      const margin = 72 // 1 inch margins
      const contentWidth = pageWidth - 2 * margin
      const lineHeight = 20 // Line height in points
      const paragraphSpacing = 12 // Extra space between paragraphs

      // Set font
      doc.setFont('times', 'normal')
      doc.setFontSize(12)
      doc.setTextColor(31, 41, 55) // text-gray-800

      // Split content into paragraphs
      const paragraphs = generatedCoverLetter
        .split(/\n\n+/)
        .filter((p) => p.trim().length > 0)
        .map((p) => p.trim().replace(/\n/g, ' '))

      let currentY = margin

      for (const paragraph of paragraphs) {
        // Split paragraph into lines that fit within content width
        const lines = doc.splitTextToSize(paragraph, contentWidth)

        for (const line of lines) {
          // Check if we need a new page
          if (currentY + lineHeight > pageHeight - margin) {
            doc.addPage()
            currentY = margin
          }

          doc.text(line, margin, currentY)
          currentY += lineHeight
        }

        // Add paragraph spacing
        currentY += paragraphSpacing
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_')
      const filename = `Cover_Letter_${timestamp}.pdf`

      // Save the PDF
      doc.save(filename)
    } catch (error) {
      console.error('Error exporting PDF:', error)
    } finally {
      setIsExportingPdf(false)
    }
  }, [generatedCoverLetter, isExportingPdf])

  /**
   * Handles exporting the cover letter as a DOCX file.
   * Converts the cover letter content to Word document format using the docx library,
   * preserving paragraph structure and basic formatting.
   * Triggers download with timestamp-based filename.
   */
  const handleDocxExport = useCallback(async () => {
    if (!generatedCoverLetter || isExportingDocx) return

    setIsExportingDocx(true)

    try {
      // Dynamically import docx library to avoid SSR issues
      const { Document, Packer, Paragraph, TextRun, AlignmentType, convertInchesToTwip } = await import('docx')

      // Parse cover letter into paragraphs
      const textParagraphs = generatedCoverLetter
        .split(/\n\n+/)
        .filter((p) => p.trim().length > 0)

      // Convert paragraphs to DOCX Paragraph objects
      const docxParagraphs = textParagraphs.map((text, index) => {
        // Handle line breaks within paragraphs
        const lines = text.split('\n')
        const children: InstanceType<typeof TextRun>[] = []

        lines.forEach((line, lineIndex) => {
          if (lineIndex > 0) {
            // Add line break between lines within the same paragraph
            children.push(new TextRun({ break: 1 }))
          }
          children.push(
            new TextRun({
              text: line.trim(),
              font: 'Georgia',
              size: 24, // 12pt in half-points
            })
          )
        })

        return new Paragraph({
          children,
          alignment: AlignmentType.JUSTIFIED,
          spacing: {
            after: index < textParagraphs.length - 1 ? 240 : 0, // 240 twips = ~0.17 inch gap between paragraphs
            line: 360, // 1.5 line spacing (240 = single, 360 = 1.5)
          },
        })
      })

      // Create the document with US Letter size and 1 inch margins
      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: 'Georgia',
                size: 24, // 12pt
              },
            },
          },
        },
        sections: [
          {
            properties: {
              page: {
                size: {
                  width: convertInchesToTwip(8.5),
                  height: convertInchesToTwip(11),
                },
                margin: {
                  top: convertInchesToTwip(1),
                  right: convertInchesToTwip(1),
                  bottom: convertInchesToTwip(1),
                  left: convertInchesToTwip(1),
                },
              },
            },
            children: docxParagraphs,
          },
        ],
      })

      // Generate the DOCX blob
      const blob = await Packer.toBlob(doc)

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_')
      const filename = `Cover_Letter_${timestamp}.docx`

      // Create download link and trigger download
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()

      // Clean up
      window.URL.revokeObjectURL(url)
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exporting DOCX:', error)
      // Silent failure - user can retry
    } finally {
      setIsExportingDocx(false)
    }
  }, [generatedCoverLetter, isExportingDocx])

  /**
   * Handles text extracted from an uploaded file.
   * Sets the resume text directly from the file extraction.
   */
  const handleFileTextExtracted = useCallback((text: string) => {
    // Strip HTML tags from extracted text
    setResumeText(stripHtmlTags(text))
    setSelectedResumeId(null)
    setResumeLoadError(null)
  }, [])

  /**
   * Handles resume tab change with state preservation.
   * Clears relevant state when switching between tabs.
   */
  const handleResumeTabChange = useCallback((newTab: ResumeInputTab) => {
    if (newTab === activeResumeTab) return

    // When switching tabs, clear the state from the previous tab
    if (activeResumeTab === 'saved') {
      setSelectedResumeId(null)
      setResumeLoadError(null)
    }

    // Clear resume text when switching tabs to ensure clean state
    setResumeText('')
    setActiveResumeTab(newTab)
  }, [activeResumeTab])

  /**
   * Handles keyboard navigation for resume tabs.
   * Supports arrow keys for accessibility.
   */
  const handleResumeTabKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const tabs = resumeInputTabs
      let newIndex = index

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        newIndex = (index + 1) % tabs.length
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        newIndex = (index - 1 + tabs.length) % tabs.length
      } else if (e.key === 'Home') {
        e.preventDefault()
        newIndex = 0
      } else if (e.key === 'End') {
        e.preventDefault()
        newIndex = tabs.length - 1
      } else {
        return
      }

      const newTab = tabs[newIndex]
      if (newTab) {
        handleResumeTabChange(newTab.id)
        resumeTabRefs.current[newIndex]?.focus()
      }
    },
    [resumeInputTabs, handleResumeTabChange]
  )

  /**
   * Handles job tab change with state preservation.
   * Clears relevant state when switching between tabs.
   */
  const handleJobTabChange = useCallback((newTab: JobInputTab) => {
    if (newTab === activeJobTab) return

    // When switching tabs, clear the state from the previous tab
    if (activeJobTab === 'saved') {
      setSelectedJobId(null)
      setJobLoadError(null)
    }

    setActiveJobTab(newTab)
  }, [activeJobTab])

  /**
   * Handles keyboard navigation for job tabs.
   * Supports arrow keys for accessibility.
   */
  const handleJobTabKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const tabs = jobInputTabs
      let newIndex = index

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        newIndex = (index + 1) % tabs.length
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        newIndex = (index - 1 + tabs.length) % tabs.length
      } else if (e.key === 'Home') {
        e.preventDefault()
        newIndex = 0
      } else if (e.key === 'End') {
        e.preventDefault()
        newIndex = tabs.length - 1
      } else {
        return
      }

      const newTab = tabs[newIndex]
      if (newTab) {
        handleJobTabChange(newTab.id)
        jobTabRefs.current[newIndex]?.focus()
      }
    },
    [jobInputTabs, handleJobTabChange]
  )

  return (
    <>
      {/* Screen reader live region for status announcements */}
      <div
        ref={statusAnnouncerRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-[40%_1fr]">
        {/* Left column: Input section (40% width on desktop) */}
        <section
          aria-labelledby="input-section-heading"
          className="space-y-4 sm:space-y-6"
        >
          <h2
            id="input-section-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg"
          >
            {translations.inputSection}
          </h2>

          {/* Input container */}
          <div className="min-h-[400px] rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-6">
            {/* Resume selection section with tabbed interface */}
            <div
              role="region"
              aria-labelledby="resume-section-heading"
              className="mb-6"
            >
              {/* Section header */}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
                  <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="resume-section-heading" className="font-medium text-slate-900 dark:text-slate-100">
                    {translations.resumeLabel}
                  </h3>
                </div>
              </div>

              {/* Tab navigation */}
              <div
                role="tablist"
                aria-label="Resume input methods"
                className="-mx-1 mb-4 flex overflow-x-auto border-b border-slate-200 px-1 scrollbar-none dark:border-slate-700"
              >
                {resumeInputTabs.map((tab, index) => {
                  const isActive = activeResumeTab === tab.id

                  return (
                    <button
                      key={tab.id}
                      ref={(el) => {
                        resumeTabRefs.current[index] = el
                      }}
                      type="button"
                      role="tab"
                      id={`resume-tab-${tab.id}`}
                      aria-selected={isActive}
                      aria-controls={`resume-tabpanel-${tab.id}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => handleResumeTabChange(tab.id)}
                      onKeyDown={(e) => handleResumeTabKeyDown(e, index)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
                        '-mb-px min-h-[40px] whitespace-nowrap cursor-pointer',
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
              <div className="min-h-[150px]">
                {/* Upload File Tab Panel */}
                <div
                  role="tabpanel"
                  id="resume-tabpanel-upload"
                  aria-labelledby="resume-tab-upload"
                  hidden={activeResumeTab !== 'upload'}
                  tabIndex={0}
                >
                  {activeResumeTab === 'upload' && (
                    <div className="space-y-4">
                      <ResumeFileUpload
                        onTextExtracted={handleFileTextExtracted}
                        translations={translations.resumeFileUpload}
                      />
                      {/* Show extracted content preview when text is available */}
                      {resumeText && (
                        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-900/20">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
                              {translations.extractedContent}
                            </span>
                            <span className="text-xs text-teal-600 dark:text-teal-400">
                              {translations.charactersExtracted.replace('{count}', stripHtmlTags(resumeText).length.toLocaleString())}
                            </span>
                          </div>
                          <div className="max-h-32 overflow-y-auto text-xs text-teal-800 dark:text-teal-200">
                            <pre className="whitespace-pre-wrap font-sans">
                              {stripHtmlTags(resumeText).slice(0, 500)}
                              {stripHtmlTags(resumeText).length > 500 && '...'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Paste Text Tab Panel */}
                <div
                  role="tabpanel"
                  id="resume-tabpanel-paste"
                  aria-labelledby="resume-tab-paste"
                  hidden={activeResumeTab !== 'paste'}
                  tabIndex={0}
                >
                  {activeResumeTab === 'paste' && (
                    <div className="space-y-4">
                      <ResumeTextInput
                        value={resumeText}
                        onChange={setResumeText}
                        translations={translations.resumeTextInput}
                        minChars={200}
                      />
                    </div>
                  )}
                </div>

                {/* My Resumes Tab Panel */}
                <div
                  role="tabpanel"
                  id="resume-tabpanel-saved"
                  aria-labelledby="resume-tab-saved"
                  hidden={activeResumeTab !== 'saved'}
                  tabIndex={0}
                >
                  {activeResumeTab === 'saved' && (
                    <div className="space-y-4">
                      <ResumeLinker
                        onSelect={handleResumeSelect}
                        onClear={handleResumeClear}
                        selectedResumeId={selectedResumeId}
                        locale={locale}
                        translations={translations.resumeLinker}
                      />

                      {/* Guidance hint when no resume selected */}
                      {!selectedResumeId && !isLoadingResume && (
                        <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-800/50 dark:bg-teal-900/10">
                          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                          <div>
                            <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
                              {translations.emptyStates.resumeHint}
                            </p>
                            <p className="mt-0.5 text-xs text-teal-600 dark:text-teal-400">
                              {translations.emptyStates.resumeDescription}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Loading state */}
                      {isLoadingResume && (
                        <div
                          role="status"
                          aria-label={translations.loadingResumeContent}
                          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
                        >
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          <span>{translations.loadingResumeContent}</span>
                        </div>
                      )}

                      {/* Error state */}
                      {resumeLoadError && (
                        <div
                          role="alert"
                          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                        >
                          {resumeLoadError}
                        </div>
                      )}

                      {/* Extracted content preview */}
                      {resumeText && !isLoadingResume && (
                        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-900/20">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
                              {translations.extractedContent}
                            </span>
                            <span className="text-xs text-teal-600 dark:text-teal-400">
                              {translations.charactersExtracted.replace('{count}', stripHtmlTags(resumeText).length.toLocaleString())}
                            </span>
                          </div>
                          <div className="max-h-32 overflow-y-auto text-xs text-teal-800 dark:text-teal-200">
                            <pre className="whitespace-pre-wrap font-sans">
                              {stripHtmlTags(resumeText).slice(0, 500)}
                              {stripHtmlTags(resumeText).length > 500 && '...'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
          </div>

          {/* Job description section with tabbed interface */}
          <div
            role="region"
            aria-labelledby="job-description-section-heading"
          >
            {/* Section header */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Briefcase className="h-5 w-5 text-purple-600 dark:text-purple-400" aria-hidden="true" />
              </div>
              <div>
                <h3 id="job-description-section-heading" className="font-medium text-slate-900 dark:text-slate-100">
                  {translations.jobDescriptionLabel}
                </h3>
              </div>
            </div>

            {/* Tab navigation */}
            <div
              role="tablist"
              aria-label="Job description input methods"
              className="-mx-1 mb-4 flex overflow-x-auto border-b border-slate-200 px-1 scrollbar-none dark:border-slate-700"
            >
              {jobInputTabs.map((tab, index) => {
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
                      'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
                      '-mb-px min-h-[40px] whitespace-nowrap cursor-pointer',
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
            <div className="min-h-[200px]">
              {/* Paste Text Tab Panel */}
              <div
                role="tabpanel"
                id="job-tabpanel-paste"
                aria-labelledby="job-tab-paste"
                hidden={activeJobTab !== 'paste'}
                tabIndex={0}
              >
                {activeJobTab === 'paste' && (
                  <>
                    <JobDescriptionInput
                      value={jobDescription}
                      onChange={setJobDescription}
                      translations={translations.jobDescriptionInput}
                      minChars={100}
                    />
                    {/* Guidance hint when job description is empty */}
                    {jobDescription.length < 100 && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800/50 dark:bg-purple-900/10">
                        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                            {translations.emptyStates.jobDescriptionHint}
                          </p>
                          <p className="mt-0.5 text-xs text-purple-600 dark:text-purple-400">
                            {translations.emptyStates.jobDescriptionDescription}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Saved Jobs Tab Panel */}
              <div
                role="tabpanel"
                id="job-tabpanel-saved"
                aria-labelledby="job-tab-saved"
                hidden={activeJobTab !== 'saved'}
                tabIndex={0}
              >
                {activeJobTab === 'saved' && (
                  <div className="space-y-4">
                    <JobLinker
                      onSelect={handleJobSelect}
                      onClear={handleJobClear}
                      selectedJobId={selectedJobId}
                      locale={locale}
                      translations={translations.jobLinker}
                    />

                    {/* Guidance hint when no job selected */}
                    {!selectedJobId && !isLoadingJob && (
                      <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800/50 dark:bg-purple-900/10">
                        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                            {translations.emptyStates.jobDescriptionHint}
                          </p>
                          <p className="mt-0.5 text-xs text-purple-600 dark:text-purple-400">
                            {translations.emptyStates.jobDescriptionDescription}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Loading state */}
                    {isLoadingJob && selectedJobId && (
                      <div
                        role="status"
                        aria-label={translations.loadingJobDescription}
                        className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>{translations.loadingJobDescription}</span>
                      </div>
                    )}

                    {/* Error state */}
                    {jobLoadError && (
                      <div
                        role="alert"
                        className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                      >
                        {jobLoadError}
                      </div>
                    )}

                    {/* Job description preview when loaded from saved job */}
                    {jobDescription && selectedJobId && !isLoadingJob && (
                      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            {translations.extractedContent}
                          </span>
                          <span className="text-xs text-purple-600 dark:text-purple-400">
                            {translations.charactersExtracted.replace('{count}', jobDescription.length.toLocaleString())}
                          </span>
                        </div>
                        <div className="max-h-32 overflow-y-auto text-xs text-purple-800 dark:text-purple-200">
                          <pre className="whitespace-pre-wrap font-sans">
                            {jobDescription.slice(0, 500)}
                            {jobDescription.length > 500 && '...'}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Extracted job details section - only show when details are extracted */}
          {extractedDetails.length > 0 && (
            <div
              role="region"
              aria-labelledby="job-details-section-heading"
              className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700"
            >
              {/* Section header */}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                  <ListChecks className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="job-details-section-heading" className="font-medium text-slate-900 dark:text-slate-100">
                    {translations.jobDetails.sectionTitle}
                  </h3>
                  <p id="job-details-section-description" className="text-xs text-slate-500 dark:text-slate-400">
                    {translations.jobDetails.sectionDescription}
                  </p>
                </div>
              </div>

              {/* Show info message if fewer than 3 items extracted */}
              {extractedDetails.length < 3 && (
                <div
                  role="note"
                  className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
                >
                  {translations.jobDetails.fewDetailsFound}
                </div>
              )}

              {/* Checkbox list of extracted details */}
              <fieldset>
                <legend className="sr-only">{translations.jobDetails.selectToEmphasize}</legend>
                <div
                  role="group"
                  aria-describedby="job-details-section-description"
                  className="space-y-2"
                >
                  {extractedDetails.map((detail) => (
                    <label
                      key={detail.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer',
                        detail.selected
                          ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700/30 dark:hover:border-slate-500'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={detail.selected}
                        onChange={() => handleDetailToggle(detail.id)}
                        aria-describedby={`detail-${detail.id}-text`}
                        className={cn(
                          'mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600',
                          'focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                          'dark:border-slate-500 dark:bg-slate-700 dark:checked:bg-indigo-600'
                        )}
                      />
                      <span
                        id={`detail-${detail.id}-text`}
                        className={cn(
                          'text-sm leading-snug',
                          detail.selected
                            ? 'text-indigo-900 dark:text-indigo-100'
                            : 'text-slate-700 dark:text-slate-300'
                        )}
                        title={detail.text}
                      >
                        {detail.text.length > 120
                          ? `${detail.text.slice(0, 120)}...`
                          : detail.text}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Selection count */}
              <div
                aria-live="polite"
                aria-atomic="true"
                className="mt-3 text-xs text-slate-500 dark:text-slate-400"
              >
                {translations.jobDetails.selectedCount.replace(
                  '{count}',
                  selectedDetails.length.toString()
                ).replace(
                  '{total}',
                  extractedDetails.length.toString()
                )}
              </div>
            </div>
          )}

          {/* Empty state when job description is present but no details extracted */}
          {jobDescription.length >= 100 && extractedDetails.length === 0 && (
            <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                  <ListChecks className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-slate-100">
                    {translations.jobDetails.sectionTitle}
                  </h3>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-600 dark:bg-slate-700/30">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {translations.jobDetails.noDetailsFound}
                </p>
              </div>
            </div>
          )}

          {/* Settings section */}
          <div
            role="region"
            aria-labelledby="settings-section-heading"
            className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700"
          >
            {/* Section header */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                <Settings className="h-5 w-5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              </div>
              <div>
                <h3 id="settings-section-heading" className="font-medium text-slate-900 dark:text-slate-100">
                  {translations.settings.settingsSection}
                </h3>
              </div>
            </div>

            <div className="space-y-5">
              {/* Length selector */}
              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {translations.settings.lengthLabel}
                </legend>
                <div
                  role="radiogroup"
                  aria-label={translations.settings.lengthLabel}
                  className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-700/50"
                >
                  {([
                    { value: 'short' as LetterLength, label: translations.settings.lengthShort, description: translations.settings.lengthShortDescription },
                    { value: 'medium' as LetterLength, label: translations.settings.lengthMedium, description: translations.settings.lengthMediumDescription },
                    { value: 'long' as LetterLength, label: translations.settings.lengthLong, description: translations.settings.lengthLongDescription },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={letterLength === option.value}
                      onClick={() => setLetterLength(option.value)}
                      aria-describedby={`length-${option.value}-description`}
                      className={cn(
                        'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                        letterLength === option.value
                          ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-600 dark:text-teal-300'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p
                  id={`length-${letterLength}-description`}
                  className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
                >
                  {letterLength === 'short' && translations.settings.lengthShortDescription}
                  {letterLength === 'medium' && translations.settings.lengthMediumDescription}
                  {letterLength === 'long' && translations.settings.lengthLongDescription}
                </p>
              </fieldset>

              {/* Tone selector */}
              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {translations.settings.toneLabel}
                </legend>
                <div
                  role="radiogroup"
                  aria-label={translations.settings.toneLabel}
                  className="grid grid-cols-2 gap-2"
                >
                  {([
                    { value: 'professional' as WritingTone, label: translations.settings.toneProfessional, description: translations.settings.toneProfessionalDescription },
                    { value: 'enthusiastic' as WritingTone, label: translations.settings.toneEnthusiastic, description: translations.settings.toneEnthusiasticDescription },
                    { value: 'confident' as WritingTone, label: translations.settings.toneConfident, description: translations.settings.toneConfidentDescription },
                    { value: 'conversational' as WritingTone, label: translations.settings.toneConversational, description: translations.settings.toneConversationalDescription },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={writingTone === option.value}
                      onClick={() => setWritingTone(option.value)}
                      className={cn(
                        'rounded-lg border px-3 py-2.5 text-left transition-all',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                        writingTone === option.value
                          ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-900/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700/50 dark:hover:border-slate-500'
                      )}
                    >
                      <span className={cn(
                        'block text-sm font-medium',
                        writingTone === option.value
                          ? 'text-teal-700 dark:text-teal-300'
                          : 'text-slate-700 dark:text-slate-300'
                      )}>
                        {option.label}
                      </span>
                      <span className={cn(
                        'mt-0.5 block text-xs',
                        writingTone === option.value
                          ? 'text-teal-600 dark:text-teal-400'
                          : 'text-slate-500 dark:text-slate-400'
                      )}>
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Output language selector */}
              <div>
                <label
                  htmlFor="output-language"
                  className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  {translations.settings.outputLanguageLabel}
                </label>
                <select
                  id="output-language"
                  value={outputLanguage}
                  onChange={(e) => setOutputLanguage(e.target.value as OutputLanguage)}
                  className={cn(
                    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm',
                    'dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-100',
                    'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20',
                    'dark:focus:border-teal-400 dark:focus:ring-teal-400/20',
                    'cursor-pointer'
                  )}
                >
                  <option value="en">{translations.settings.outputLanguageEnglish}</option>
                  <option value="fr">{translations.settings.outputLanguageFrench}</option>
                  <option value="de">{translations.settings.outputLanguageGerman}</option>
                  <option value="it">{translations.settings.outputLanguageItalian}</option>
                </select>
              </div>

              {/* Custom prompt textarea */}
              <div>
                <label
                  htmlFor="custom-prompt"
                  className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  {translations.settings.customPromptLabel}
                </label>
                <textarea
                  id="custom-prompt"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={translations.settings.customPromptPlaceholder}
                  rows={3}
                  className={cn(
                    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm',
                    'placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-100 dark:placeholder:text-slate-500',
                    'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:focus:border-teal-400 dark:focus:ring-teal-400/20',
                    'resize-none'
                  )}
                />
                {customPrompt.length > 0 && (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {customPrompt.length} / 500
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Ready to generate message - shows when both inputs are filled */}
          {resumeText && jobDescription.length >= 100 && !generatedCoverLetter && !isGenerating && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-800/50 dark:bg-green-900/10">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  {translations.emptyStates.readyToGenerate}
                </p>
                <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">
                  {translations.emptyStates.readyToGenerateDescription}
                </p>
              </div>
            </div>
          )}

          {/* Generate button */}
          <div className="mt-6">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerateDisabled}
              aria-busy={isGenerating}
              aria-describedby={isGenerateDisabled ? 'generate-requirements' : undefined}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                isGenerateDisabled
                  ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                  : 'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-600 dark:active:bg-teal-700'
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  {translations.generation.generatingButton}
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                  {translations.generation.generateButton}
                </>
              )}
            </button>
            {/* Hidden requirements description for screen readers */}
            {isGenerateDisabled && (
              <span id="generate-requirements" className="sr-only">
                {!resumeText ? translations.generation.emptyResumeError : translations.generation.jobDescriptionTooShortError}
              </span>
            )}

            {/* Generation error display - dismissible alert with retry button */}
            {generationError && (
              <div
                role="alert"
                aria-live="polite"
                className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
              >
                <div className="flex items-start gap-3">
                  {/* Alert icon */}
                  <AlertCircle
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
                    aria-hidden="true"
                  />

                  {/* Error message and actions */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">
                      {generationError}
                    </p>

                    {/* Action buttons */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* Retry button */}
                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        aria-label={translations.generation.retryButton}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                          'bg-red-100 text-red-800 hover:bg-red-200 active:bg-red-300',
                          'dark:bg-red-800/30 dark:text-red-200 dark:hover:bg-red-800/50 dark:active:bg-red-800/70',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
                          'disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        <RefreshCw
                          className={cn('h-4 w-4', isGenerating && 'animate-spin')}
                          aria-hidden="true"
                        />
                        {translations.generation.retryButton}
                      </button>
                    </div>
                  </div>

                  {/* Dismiss button */}
                  <button
                    type="button"
                    onClick={handleDismissError}
                    className={cn(
                      'flex-shrink-0 rounded-md p-1 transition-colors',
                      'text-red-500 hover:bg-red-100 hover:text-red-700',
                      'dark:text-red-400 dark:hover:bg-red-800/30 dark:hover:text-red-200',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2'
                    )}
                    aria-label={translations.generation.dismissError}
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

        {/* Right column: Output section (60% width on desktop) */}
        <section
          aria-labelledby="output-section-heading"
          className="space-y-4 sm:space-y-6"
        >
          <h2
            id="output-section-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg"
          >
            {translations.outputSection}
          </h2>

          {/* Output container */}
          <div className="min-h-[400px] rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-6">
            {/* Output section header */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
                <Mail className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              </div>
              <div>
                <h3 id="generated-content-heading" className="font-medium text-slate-900 dark:text-slate-100">
                  AI-Generated Content
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your personalized cover letter
                </p>
              </div>
            </div>

            {/* Loading skeleton during generation */}
            {isGenerating && (
              <div
                role="status"
                aria-label={translations.generation.generatingButton}
                className="min-h-[300px] space-y-4"
              >
              {/* Skeleton lines simulating letter content */}
              <div className="space-y-3">
                {/* Greeting line */}
                <div className="h-5 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />

                {/* First paragraph */}
                <div className="space-y-2 pt-4">
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                </div>

                {/* Second paragraph */}
                <div className="space-y-2 pt-4">
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                </div>

                {/* Third paragraph */}
                <div className="space-y-2 pt-4">
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                </div>

                {/* Closing */}
                <div className="space-y-2 pt-6">
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                </div>
              </div>
            </div>
          )}

            {/* Generated cover letter WYSIWYG editor */}
            {!isGenerating && generatedCoverLetter && (
              <div
                role="region"
                aria-labelledby="generated-content-heading"
                className={cn(
                  'min-h-[300px]',
                  'animate-in fade-in duration-500 ease-out'
                )}
              >
                {/* Action bar with Copy, Download PDF, and Improve with AI buttons */}
                <div
                  role="toolbar"
                  aria-label="Cover letter actions"
                  className="mb-4 flex flex-wrap items-center justify-end gap-2"
                >
                  {/* Copy to clipboard button */}
                  <button
                    type="button"
                    onClick={handleCopyToClipboard}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                      isCopied
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:active:bg-slate-500'
                    )}
                    aria-label={isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
                    aria-live="polite"
                  >
                    {isCopied ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="sr-only sm:not-sr-only">
                      {isCopied ? 'Copied!' : 'Copy'}
                    </span>
                  </button>

                  {/* Download PDF button */}
                  <button
                    type="button"
                    onClick={handlePdfExport}
                    disabled={isExportingPdf}
                    aria-busy={isExportingPdf}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                      isExportingPdf
                        ? 'cursor-not-allowed bg-teal-100 text-teal-400 dark:bg-teal-900/30 dark:text-teal-500'
                        : 'bg-teal-100 text-teal-700 hover:bg-teal-200 active:bg-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50 dark:active:bg-teal-900/70'
                    )}
                    aria-label={isExportingPdf ? 'Exporting PDF...' : 'Download as PDF'}
                  >
                    {isExportingPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileDown className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="sr-only sm:not-sr-only">
                      {isExportingPdf ? 'Exporting...' : 'PDF'}
                    </span>
                  </button>

                  {/* Download DOCX button */}
                  <button
                    type="button"
                    onClick={handleDocxExport}
                    disabled={isExportingDocx}
                    aria-busy={isExportingDocx}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                      isExportingDocx
                        ? 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:active:bg-slate-500'
                    )}
                    aria-label={isExportingDocx ? 'Exporting DOCX...' : 'Download as DOCX'}
                  >
                    {isExportingDocx ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="sr-only sm:not-sr-only">
                      {isExportingDocx ? 'Exporting...' : 'DOCX'}
                    </span>
                  </button>

                  {/* Improve with AI button */}
                  <button
                    type="button"
                    onClick={handleImprove}
                    disabled={isImproving}
                    aria-busy={isImproving}
                    aria-label={isImproving ? translations.generation.improvingButton : translations.generation.improveButton}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                      isImproving
                        ? 'cursor-not-allowed bg-teal-50 text-teal-400 dark:bg-teal-900/20 dark:text-teal-500'
                        : 'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-600 dark:active:bg-teal-700'
                    )}
                  >
                    {isImproving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        {translations.generation.improvingButton}
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" aria-hidden="true" />
                        {translations.generation.improveButton}
                      </>
                    )}
                  </button>
                </div>

                {/* Minimal formatting toolbar */}
                <div
                  role="toolbar"
                  aria-label="Text formatting"
                  className="mb-4 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-700/50"
                >
                <button
                  type="button"
                  onClick={() => handleFormat('bold')}
                  className={cn(
                    'rounded p-2 transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                    activeFormats.has('bold')
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600'
                  )}
                  title="Bold (Ctrl+B)"
                  aria-label="Bold"
                  aria-pressed={activeFormats.has('bold')}
                >
                  <Bold className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleFormat('italic')}
                  className={cn(
                    'rounded p-2 transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                    activeFormats.has('italic')
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600'
                  )}
                  title="Italic (Ctrl+I)"
                  aria-label="Italic"
                  aria-pressed={activeFormats.has('italic')}
                >
                  <Italic className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleFormat('underline')}
                  className={cn(
                    'rounded p-2 transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                    activeFormats.has('underline')
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600'
                  )}
                  title="Underline (Ctrl+U)"
                  aria-label="Underline"
                  aria-pressed={activeFormats.has('underline')}
                >
                  <Underline className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {/* Editable content area */}
              <div
                ref={editorRef}
                contentEditable
                onInput={handleEditorInput}
                onKeyDown={handleEditorKeyDown}
                onPaste={handleEditorPaste}
                className={cn(
                  'min-h-[250px] max-h-[calc(100vh-350px)] overflow-y-auto',
                  'rounded-lg border border-slate-200 bg-white p-4',
                  'dark:border-slate-600 dark:bg-slate-700/30',
                  'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20',
                  'dark:focus:border-teal-400 dark:focus:ring-teal-400/20',
                  // Typography styles matching the original display
                  'font-serif text-base leading-relaxed text-slate-800 dark:text-slate-200',
                  // Paragraph styling within the editor
                  '[&_p]:mb-4 [&_p]:last:mb-0'
                )}
                suppressContentEditableWarning
                role="textbox"
                aria-label="Cover letter editor"
                aria-multiline="true"
              />
            </div>
          )}

            {/* Empty state placeholder - shown when not generating and no content */}
            {!isGenerating && !generatedCoverLetter && (
              <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                  <Mail className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                </div>
                <h4 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {translations.emptyStateTitle}
                </h4>
                <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  {translations.emptyStateDescription}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
