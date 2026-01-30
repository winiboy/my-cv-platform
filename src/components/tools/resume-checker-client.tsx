'use client'

import { useState, useCallback } from 'react'
import { Loader2, Search } from 'lucide-react'
import { ResumeSelector, type ResumeSelectorTranslations } from './resume-selector'
import { AnalysisResults, type AnalysisResultsTranslations } from './analysis-results'
import { useToast } from '@/components/ui/toast'
import type { ResumeAnalysis } from '@/types/resume-analysis'

/**
 * Combined translation interface for all Resume Checker UI strings.
 * This is passed from the server component which has access to translations.
 */
export interface ResumeCheckerTranslations {
  selectResume: string
  analysisResults: string
  analyzeButton: string
  analyzingButton: string
  loadingResumes: string
  tryAgain: string
  noResumesFound: string
  noResumesDescription: string
  createResume: string
  updated: string
  loginRequired: string
  loadError: string
  noAnalysisYet: string
  noAnalysisDescription: string
  analyzedAt: string
  noCategories: string
  noIssues: string
  showMe: string
  suggestion: string
  issues: string
  severityHigh: string
  severityMedium: string
  severityLow: string
  selectResumePrompt: string
  analysisComplete: string
  analysisFailed: string
  analysisDataMissing: string
}

interface ResumeCheckerClientProps {
  /** Locale for navigation links and API calls */
  locale: string
  /** Translated UI strings */
  translations: ResumeCheckerTranslations
}

/**
 * API response shape from /api/ai/analyze-resume endpoint.
 * Used for type-safe response parsing.
 */
interface AnalyzeResumeResponse {
  success: boolean
  analysis?: ResumeAnalysis
  error?: string
  message?: string
}

/**
 * ResumeCheckerClient is the main client component for the Resume Checker feature.
 * It orchestrates the resume selection, analysis triggering, and results display.
 *
 * Layout:
 * - Left column: ResumeSelector + Analyze button
 * - Right column: AnalysisResults
 *
 * State management:
 * - selectedResumeId: Currently selected resume for analysis
 * - analysis: The analysis result from the API
 * - isLoading: Whether an analysis is in progress
 * - error: Any error message from the last operation
 */
export function ResumeCheckerClient({ locale, translations }: ResumeCheckerClientProps) {
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toast = useToast()

  // Prepare translations for child components
  const resumeSelectorTranslations: ResumeSelectorTranslations = {
    loadingResumes: translations.loadingResumes,
    tryAgain: translations.tryAgain,
    noResumesFound: translations.noResumesFound,
    noResumesDescription: translations.noResumesDescription,
    createResume: translations.createResume,
    updated: translations.updated,
    loginRequired: translations.loginRequired,
    loadError: translations.loadError,
  }

  const analysisResultsTranslations: AnalysisResultsTranslations = {
    noAnalysisYet: translations.noAnalysisYet,
    noAnalysisDescription: translations.noAnalysisDescription,
    analyzedAt: translations.analyzedAt,
    noCategories: translations.noCategories,
    noIssues: translations.noIssues,
    showMe: translations.showMe,
    suggestion: translations.suggestion,
    issues: translations.issues,
    severityHigh: translations.severityHigh,
    severityMedium: translations.severityMedium,
    severityLow: translations.severityLow,
  }

  /**
   * Handles resume selection from the ResumeSelector component.
   * Clears any existing analysis when a new resume is selected.
   */
  const handleResumeSelect = useCallback((resumeId: string) => {
    setSelectedResumeId(resumeId)
    // Clear previous analysis when selecting a new resume
    if (analysis) {
      setAnalysis(null)
    }
    setError(null)
  }, [analysis])

  /**
   * Triggers the resume analysis API call.
   * Validates that a resume is selected before making the request.
   */
  const handleAnalyze = useCallback(async () => {
    if (!selectedResumeId) {
      toast.error(translations.selectResumePrompt)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/analyze-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId: selectedResumeId,
          locale,
        }),
      })

      const data: AnalyzeResumeResponse = await response.json()

      if (!response.ok || !data.success) {
        const errorMessage = data.error || data.message || translations.analysisFailed
        throw new Error(errorMessage)
      }

      if (!data.analysis) {
        throw new Error(translations.analysisDataMissing)
      }

      setAnalysis(data.analysis)
      toast.success(translations.analysisComplete)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : translations.analysisFailed
      console.error('Error analyzing resume:', err)
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [selectedResumeId, locale, toast, translations])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Left column: Resume selection and analyze button */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            {translations.selectResume}
          </h2>
          <ResumeSelector
            onSelect={handleResumeSelect}
            selectedId={selectedResumeId}
            locale={locale}
            translations={resumeSelectorTranslations}
          />
        </div>

        {/* Analyze button */}
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!selectedResumeId || isLoading}
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
                <Search className="h-5 w-5" aria-hidden="true" />
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

      {/* Right column: Analysis results */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {translations.analysisResults}
        </h2>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 min-h-[400px]">
          <AnalysisResults
            analysis={analysis}
            isLoading={isLoading}
            resumeId={selectedResumeId ?? undefined}
            locale={locale}
            translations={analysisResultsTranslations}
          />
        </div>
      </div>
    </div>
  )
}
