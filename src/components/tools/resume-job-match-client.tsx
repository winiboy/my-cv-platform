'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, BarChart3 } from 'lucide-react'
import {
  ResumeTextInput,
  type ResumeTextInputTranslations,
} from './resume-text-input'
import {
  JobDescriptionInput,
  type JobDescriptionInputTranslations,
} from './job-description-input'
import { MatchResults, type MatchResultsTranslations } from './match-results'
import {
  ResumeSelector,
  type ResumeSelectorTranslations,
} from './resume-selector'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import type { JobMatchAnalysis } from '@/types/job-match'
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
 * Minimum character thresholds for input validation.
 * Resume requires more content to provide meaningful analysis.
 */
const MIN_RESUME_CHARS = 200
const MIN_JOB_DESCRIPTION_CHARS = 100

/**
 * Combined translation interface for all Resume-Job Match UI strings.
 * This is passed from the server component which has access to translations.
 */
export interface ResumeJobMatchTranslations {
  // Section headers
  inputSection: string
  resultsSection: string

  // Resume input translations
  resumeLabel: string
  resumePlaceholder: string
  resumeMinCharsError: string

  // Job description input translations
  jobLabel: string
  jobPlaceholder: string
  jobMinCharsError: string

  // Button translations
  analyzeButton: string
  analyzingButton: string

  // Result translations
  matchScore: string
  matchedSkills: string
  missingSkills: string
  recommendations: string
  strengths: string
  emptyStateTitle: string
  emptyStateDescription: string
  analyzedAt: string
  noSkillsFound: string
  noMissingSkills: string
  noRecommendations: string
  noStrengths: string

  // Toast messages
  analysisComplete: string
  analysisFailed: string

  // Resume selector translations (for authenticated users)
  selectSavedResume: string
  orPasteManually: string
  loadingResumes: string
  tryAgain: string
  noResumesFound: string
  noResumesDescription: string
  createResume: string
  updated: string
  loginRequired: string
  loadError: string
  loadingResumeContent: string
  resumeLoadError: string
}

interface ResumeJobMatchClientProps {
  /** Locale for API calls and date formatting */
  locale: string
  /** Translated UI strings */
  translations: ResumeJobMatchTranslations
}

/**
 * API response shape from /api/tools/match-resume-job endpoint.
 * Used for type-safe response parsing.
 */
interface MatchResumeJobResponse {
  success: boolean
  analysis?: JobMatchAnalysis
  error?: string
  message?: string
}

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
 * ResumeJobMatchClient is the main client component for the Resume-Job Match feature.
 * It orchestrates the resume and job description inputs, analysis triggering, and results display.
 *
 * Layout:
 * - Left column: ResumeTextInput, JobDescriptionInput, and Analyze button
 * - Right column: MatchResults
 *
 * State management:
 * - resumeText: The resume content entered by the user
 * - jobDescription: The job description entered by the user
 * - analysis: The analysis result from the API
 * - isLoading: Whether an analysis is in progress
 * - error: Any error message from the last operation
 */
export function ResumeJobMatchClient({
  locale,
  translations,
}: ResumeJobMatchClientProps) {
  const { data: session, status } = useSession()
  const isAuthenticated = status === 'authenticated' && !!session?.user

  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [analysis, setAnalysis] = useState<JobMatchAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [isLoadingResume, setIsLoadingResume] = useState(false)

  const toast = useToast()

  // Prepare translations for child components
  const resumeInputTranslations: ResumeTextInputTranslations = useMemo(
    () => ({
      resumeLabel: translations.resumeLabel,
      resumePlaceholder: translations.resumePlaceholder,
      minCharsError: translations.resumeMinCharsError,
    }),
    [translations]
  )

  const jobInputTranslations: JobDescriptionInputTranslations = useMemo(
    () => ({
      jobLabel: translations.jobLabel,
      jobPlaceholder: translations.jobPlaceholder,
      minCharsError: translations.jobMinCharsError,
    }),
    [translations]
  )

  const matchResultsTranslations: MatchResultsTranslations = useMemo(
    () => ({
      matchScore: translations.matchScore,
      matchedSkills: translations.matchedSkills,
      missingSkills: translations.missingSkills,
      recommendations: translations.recommendations,
      strengths: translations.strengths,
      emptyStateTitle: translations.emptyStateTitle,
      emptyStateDescription: translations.emptyStateDescription,
      analyzedAt: translations.analyzedAt,
      noSkillsFound: translations.noSkillsFound,
      noMissingSkills: translations.noMissingSkills,
      noRecommendations: translations.noRecommendations,
      noStrengths: translations.noStrengths,
    }),
    [translations]
  )

  const resumeSelectorTranslations: ResumeSelectorTranslations = useMemo(
    () => ({
      loadingResumes: translations.loadingResumes,
      tryAgain: translations.tryAgain,
      noResumesFound: translations.noResumesFound,
      noResumesDescription: translations.noResumesDescription,
      createResume: translations.createResume,
      updated: translations.updated,
      loginRequired: translations.loginRequired,
      loadError: translations.loadError,
    }),
    [translations]
  )

  /**
   * Handles selection of a saved resume.
   * Fetches the full resume data and converts it to plain text.
   */
  const handleResumeSelect = useCallback(
    async (resumeId: string) => {
      setSelectedResumeId(resumeId)
      setIsLoadingResume(true)
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
          throw new Error(translations.resumeLoadError)
        }

        // Convert resume to plain text and set it
        const plainText = convertResumeToText(resume as Resume)
        setResumeText(plainText)
      } catch (err) {
        console.error('Error loading resume:', err)
        const errorMessage =
          err instanceof Error ? err.message : translations.resumeLoadError
        setError(errorMessage)
        toast.error(errorMessage)
        // Reset selection on error
        setSelectedResumeId(null)
      } finally {
        setIsLoadingResume(false)
      }
    },
    [toast, translations.resumeLoadError]
  )

  /**
   * Determines if the analyze button should be enabled.
   * Both inputs must meet their minimum character requirements.
   */
  const canAnalyze = useMemo(() => {
    const hasEnoughResume = resumeText.length >= MIN_RESUME_CHARS
    const hasEnoughJobDescription =
      jobDescription.length >= MIN_JOB_DESCRIPTION_CHARS
    return hasEnoughResume && hasEnoughJobDescription && !isLoading
  }, [resumeText.length, jobDescription.length, isLoading])

  /**
   * Triggers the resume-job match analysis API call.
   * Validates inputs before making the request.
   */
  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/tools/match-resume-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText,
          jobDescription,
          locale,
        }),
      })

      const data: MatchResumeJobResponse = await response.json()

      if (!response.ok || !data.success) {
        const errorMessage =
          data.error || data.message || translations.analysisFailed
        throw new Error(errorMessage)
      }

      if (!data.analysis) {
        throw new Error(translations.analysisFailed)
      }

      setAnalysis(data.analysis)
      toast.success(translations.analysisComplete)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : translations.analysisFailed
      console.error('Error analyzing resume-job match:', err)
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [
    canAnalyze,
    resumeText,
    jobDescription,
    locale,
    toast,
    translations.analysisFailed,
    translations.analysisComplete,
  ])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Left column: Inputs and analyze button */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            {translations.inputSection}
          </h2>

          <div className="space-y-6">
            {/* Resume selector for authenticated users */}
            {isAuthenticated && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {translations.selectSavedResume}
                </h3>
                <ResumeSelector
                  onSelect={handleResumeSelect}
                  selectedId={selectedResumeId}
                  locale={locale}
                  translations={resumeSelectorTranslations}
                />
                {isLoadingResume && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {translations.loadingResumeContent}
                  </div>
                )}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200 dark:border-slate-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-slate-900 px-2 text-slate-500 dark:text-slate-400">
                      {translations.orPasteManually}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Resume text input */}
            <ResumeTextInput
              value={resumeText}
              onChange={setResumeText}
              translations={resumeInputTranslations}
              minChars={MIN_RESUME_CHARS}
            />

            {/* Job description input */}
            <JobDescriptionInput
              value={jobDescription}
              onChange={setJobDescription}
              translations={jobInputTranslations}
              minChars={MIN_JOB_DESCRIPTION_CHARS}
            />
          </div>
        </div>

        {/* Analyze button */}
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze || isLoadingResume}
            aria-busy={isLoading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                {translations.analyzingButton}
              </>
            ) : (
              <>
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
                {translations.analyzeButton}
              </>
            )}
          </button>

          {/* Inline error display for non-toast errors */}
          {error && !isLoading && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Right column: Match results */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {translations.resultsSection}
        </h2>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 min-h-[400px]">
          <MatchResults
            analysis={analysis}
            isLoading={isLoading}
            translations={matchResultsTranslations}
            locale={locale}
          />
        </div>
      </div>
    </div>
  )
}
