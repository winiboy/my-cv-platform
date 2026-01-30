'use client'

import { useState, useCallback, useMemo } from 'react'
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
import { useToast } from '@/components/ui/toast'
import type { JobMatchAnalysis } from '@/types/job-match'

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
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [analysis, setAnalysis] = useState<JobMatchAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
            disabled={!canAnalyze}
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
