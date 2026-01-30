'use client'

import { FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScoreGauge } from './score-gauge'
import { CategoryList } from './category-list'
import type { ResumeAnalysis } from '@/types/resume-analysis'

interface AnalysisResultsProps {
  /** The analysis data to display, null when no analysis exists */
  analysis: ResumeAnalysis | null
  /** Whether the analysis is currently being generated */
  isLoading: boolean
  /** Resume ID for "Show me" navigation links */
  resumeId?: string
  /** Locale for i18n routing in "Show me" navigation links */
  locale?: string
  /** Optional CSS class name for the container */
  className?: string
}

/**
 * Formats an ISO 8601 date string to a localized display format.
 * Falls back to the original string if parsing fails.
 */
function formatAnalysisDate(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

/**
 * Skeleton component for the loading state.
 * Displays placeholder UI while analysis is being generated.
 */
function AnalysisSkeleton() {
  return (
    <div className="flex flex-col items-center gap-6 animate-pulse">
      {/* Score gauge skeleton */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-[120px] h-[120px] rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          </div>
        </div>
        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>

      {/* Category list skeleton */}
      <div className="w-full space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-16 rounded-lg bg-slate-200 dark:bg-slate-700"
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Empty state component shown when no analysis exists.
 * Provides instructional text to guide the user.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        <FileText className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        No Analysis Yet
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Select a resume from the dropdown above and click &quot;Analyze&quot; to get
        detailed feedback on how to improve your resume.
      </p>
    </div>
  )
}

/**
 * AnalysisResults is the main container component for displaying resume analysis.
 * It composes ScoreGauge and CategoryList components together with proper states
 * for loading, empty, and data display scenarios.
 *
 * @example
 * ```tsx
 * <AnalysisResults
 *   analysis={analysisData}
 *   isLoading={false}
 *   resumeId="abc-123"
 * />
 * ```
 */
export function AnalysisResults({
  analysis,
  isLoading,
  resumeId,
  locale,
  className,
}: AnalysisResultsProps) {
  // Loading state: show skeleton while analysis is being generated
  if (isLoading) {
    return (
      <div className={cn('w-full', className)}>
        <AnalysisSkeleton />
      </div>
    )
  }

  // Empty state: no analysis data available
  if (!analysis) {
    return (
      <div className={cn('w-full', className)}>
        <EmptyState />
      </div>
    )
  }

  // Data state: display the analysis results
  return (
    <div className={cn('w-full flex flex-col gap-6', className)}>
      {/* Score gauge section - centered at top */}
      <div className="flex flex-col items-center gap-2">
        <ScoreGauge score={analysis.overallScore} size="lg" />

        {/* Analyzed at timestamp */}
        <p className="text-sm text-muted-foreground">
          Analyzed at: {formatAnalysisDate(analysis.generatedAt)}
        </p>
      </div>

      {/* Category breakdown */}
      <CategoryList
        categories={analysis.categories}
        resumeId={resumeId}
        locale={locale}
      />
    </div>
  )
}
