'use client'

import { useEffect, useState } from 'react'
import { FileSearch, Loader2, CheckCircle2, AlertCircle, Lightbulb, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScoreGauge } from './score-gauge'
import { useIsMobile } from '@/lib/hooks/use-media-query'
import type { JobMatchAnalysis } from '@/types/job-match'

/**
 * Translation strings required by the MatchResults component.
 */
export interface MatchResultsTranslations {
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
}

interface MatchResultsProps {
  /** The job match analysis data to display, null when no analysis exists */
  analysis: JobMatchAnalysis | null
  /** Whether the analysis is currently being generated */
  isLoading: boolean
  /** Translated UI strings */
  translations: MatchResultsTranslations
  /** Optional locale for date formatting */
  locale?: string
  /** Optional CSS class name for the container */
  className?: string
}

/**
 * Formats an ISO 8601 date string to a localized display format.
 * Falls back to the original string if parsing fails.
 */
function formatAnalysisDate(isoString: string, locale?: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleString(locale, {
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
function MatchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
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

      {/* Matched skills skeleton */}
      <div className="space-y-3">
        <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-7 w-20 rounded-full bg-slate-200 dark:bg-slate-700"
            />
          ))}
        </div>
      </div>

      {/* Missing skills skeleton */}
      <div className="space-y-3">
        <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-7 w-24 rounded-full bg-slate-200 dark:bg-slate-700"
            />
          ))}
        </div>
      </div>

      {/* Recommendations skeleton */}
      <div className="space-y-3">
        <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
          ))}
        </div>
      </div>

      {/* Strengths skeleton */}
      <div className="space-y-3">
        <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  translations: Pick<MatchResultsTranslations, 'emptyStateTitle' | 'emptyStateDescription'>
}

/**
 * Empty state component shown when no analysis exists.
 * Provides instructional text to guide the user.
 */
function EmptyState({ translations }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-4 text-center">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mb-4 sm:mb-6">
        <FileSearch className="w-8 h-8 sm:w-10 sm:h-10 text-teal-500 dark:text-teal-400" />
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {translations.emptyStateTitle}
      </h3>
      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
        {translations.emptyStateDescription}
      </p>
    </div>
  )
}

interface SkillBadgeProps {
  skill: string
  variant: 'matched' | 'missing'
  /** Animation delay index for stagger effect */
  animationIndex?: number
}

/**
 * Badge component for displaying individual skills.
 * Green for matched skills, amber for missing skills.
 * Uses rounded-full for pill-shaped badges with consistent padding.
 * Supports stagger animation with configurable delay based on index.
 */
function SkillBadge({ skill, variant, animationIndex = 0 }: SkillBadgeProps) {
  const styles = {
    matched: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700',
    missing: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  }

  // Calculate animation delay: 50ms per badge, max 500ms
  const animationDelay = Math.min(animationIndex * 50, 500)

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium',
        'border transition-colors',
        // Animation classes with motion-reduce support
        'opacity-0 translate-y-2',
        'animate-[badge-appear_0.3s_ease-out_forwards]',
        'motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-y-0',
        styles[variant]
      )}
      style={{
        animationDelay: `${animationDelay}ms`,
      }}
    >
      {skill}
    </span>
  )
}

interface SectionHeaderProps {
  icon: React.ReactNode
  title: string
  count?: number
}

/**
 * Section header with icon and optional count badge.
 */
function SectionHeader({ icon, title, count }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
      {icon}
      <h3 className="text-sm sm:text-base font-semibold text-foreground">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {count}
        </span>
      )}
    </div>
  )
}

interface BulletListProps {
  items: string[]
  emptyMessage: string
}

/**
 * Bulleted list component for recommendations and strengths.
 */
function BulletList({ items, emptyMessage }: BulletListProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs sm:text-sm text-muted-foreground italic">{emptyMessage}</p>
    )
  }

  return (
    <ul className="space-y-1.5 sm:space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2 text-xs sm:text-sm text-foreground">
          <span className="mt-1.5 w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 flex-shrink-0" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * MatchResults displays the job match analysis results including:
 * - Overall match score as a circular gauge
 * - Matched skills as green badges
 * - Missing skills as amber badges
 * - Actionable recommendations as a bulleted list
 * - Key strengths as a bulleted list
 *
 * Supports loading and empty states for optimal UX.
 * Features fade-in animation when results appear and stagger animation for badges.
 *
 * @example
 * ```tsx
 * <MatchResults
 *   analysis={matchAnalysis}
 *   isLoading={false}
 *   translations={uiTranslations}
 * />
 * ```
 */
export function MatchResults({
  analysis,
  isLoading,
  translations,
  locale,
  className,
}: MatchResultsProps) {
  // Use responsive sizing for the score gauge
  const isMobile = useIsMobile()
  const gaugeSize = isMobile ? 'md' : 'lg'

  // Track whether the results should be visible (for fade-in animation)
  // Initialize based on whether we already have analysis data (e.g., on re-render)
  const [isVisible, setIsVisible] = useState(() => !!(analysis && !isLoading))

  // Trigger fade-in animation when analysis data becomes available
  useEffect(() => {
    if (analysis && !isLoading) {
      // Small delay to ensure DOM is ready before triggering animation
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 50)
      return () => clearTimeout(timer)
    }
    // Reset visibility when loading starts or analysis is cleared
    // Using a timer to satisfy the lint rule about sync setState in effects
    const resetTimer = setTimeout(() => {
      setIsVisible(false)
    }, 0)
    return () => clearTimeout(resetTimer)
  }, [analysis, isLoading])

  // Loading state: show skeleton while analysis is being generated
  if (isLoading) {
    return (
      <div className={cn('w-full', className)}>
        <MatchResultsSkeleton />
      </div>
    )
  }

  // Empty state: no analysis data available
  if (!analysis) {
    return (
      <div className={cn('w-full', className)}>
        <EmptyState translations={translations} />
      </div>
    )
  }

  // Data state: display the match results with fade-in animation
  return (
    <div
      className={cn(
        'w-full flex flex-col',
        // Fade-in transition with motion-reduce support
        'transition-opacity duration-500 ease-out',
        'motion-reduce:transition-none',
        isVisible ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      {/* Score gauge section - centered at top */}
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pb-4 sm:pb-6">
        <ScoreGauge score={analysis.matchScore} size={gaugeSize} />
        <p className="text-sm sm:text-base font-semibold text-foreground">
          {translations.matchScore}
        </p>
        {/* Analyzed at timestamp */}
        <p className="text-xs sm:text-sm text-muted-foreground text-center">
          {translations.analyzedAt} {formatAnalysisDate(analysis.analyzedAt, locale)}
        </p>
      </div>

      {/* Matched skills section */}
      <div className="py-4 sm:py-5 border-t border-slate-100 dark:border-slate-700">
        <SectionHeader
          icon={<CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 dark:text-teal-400" />}
          title={translations.matchedSkills}
          count={analysis.matchedSkills.length}
        />
        {analysis.matchedSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {analysis.matchedSkills.map((skill, index) => (
              <SkillBadge
                key={index}
                skill={skill}
                variant="matched"
                animationIndex={index}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-muted-foreground italic">
            {translations.noSkillsFound}
          </p>
        )}
      </div>

      {/* Missing skills section */}
      <div className="py-4 sm:py-5 border-t border-slate-100 dark:border-slate-700">
        <SectionHeader
          icon={<AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400" />}
          title={translations.missingSkills}
          count={analysis.missingSkills.length}
        />
        {analysis.missingSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {analysis.missingSkills.map((skill, index) => (
              <SkillBadge
                key={index}
                skill={skill}
                variant="missing"
                animationIndex={index}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-muted-foreground italic">
            {translations.noMissingSkills}
          </p>
        )}
      </div>

      {/* Recommendations section */}
      <div className="py-4 sm:py-5 border-t border-slate-100 dark:border-slate-700">
        <SectionHeader
          icon={<Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />}
          title={translations.recommendations}
          count={analysis.recommendations.length}
        />
        <BulletList
          items={analysis.recommendations}
          emptyMessage={translations.noRecommendations}
        />
      </div>

      {/* Strengths section */}
      <div className="py-4 sm:py-5 border-t border-slate-100 dark:border-slate-700">
        <SectionHeader
          icon={<Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />}
          title={translations.strengths}
          count={analysis.strengths.length}
        />
        <BulletList
          items={analysis.strengths}
          emptyMessage={translations.noStrengths}
        />
      </div>
    </div>
  )
}
