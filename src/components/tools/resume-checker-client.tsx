'use client'

import { useState, useCallback } from 'react'
import { Loader2, Search } from 'lucide-react'
import { ResumeSelector } from './resume-selector'
import { AnalysisResults } from './analysis-results'
import { useToast } from '@/components/ui/toast'
import type { ResumeAnalysis } from '@/types/resume-analysis'

interface ResumeCheckerClientProps {
  /** Locale for navigation links and API calls */
  locale: string
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
export function ResumeCheckerClient({ locale }: ResumeCheckerClientProps) {
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toast = useToast()

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
      toast.error('Please select a resume to analyze')
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
        const errorMessage = data.error || data.message || 'Failed to analyze resume'
        throw new Error(errorMessage)
      }

      if (!data.analysis) {
        throw new Error('Analysis data is missing from response')
      }

      setAnalysis(data.analysis)
      toast.success('Resume analysis complete')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze resume'
      console.error('Error analyzing resume:', err)
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [selectedResumeId, locale, toast])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left column: Resume selection and analyze button */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Select a Resume
          </h2>
          <ResumeSelector
            onSelect={handleResumeSelect}
            selectedId={selectedResumeId}
            locale={locale}
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
                Analyzing...
              </>
            ) : (
              <>
                <Search className="h-5 w-5" aria-hidden="true" />
                Analyze Resume
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
          Analysis Results
        </h2>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 min-h-[400px]">
          <AnalysisResults
            analysis={analysis}
            isLoading={isLoading}
            resumeId={selectedResumeId ?? undefined}
            locale={locale}
          />
        </div>
      </div>
    </div>
  )
}
