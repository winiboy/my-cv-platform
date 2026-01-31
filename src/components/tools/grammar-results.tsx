'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScoreGauge } from './score-gauge'
import { GrammarIssueCard, type GrammarIssueCardTranslations } from './grammar-issue-card'
import { useIsMobile } from '@/lib/hooks/use-media-query'
import type { GrammarAnalysisResponse, GrammarIssueType } from '@/types/grammar-check'

/**
 * Filter type for issue categories.
 * 'all' shows all issues, other values filter by specific type.
 */
type IssueFilter = 'all' | GrammarIssueType

/**
 * Translation strings required by the GrammarResults component.
 */
export interface GrammarResultsTranslations {
  grammarScore: string
  issuesFound: string
  noIssuesFound: string
  filterAll: string
  filterSpelling: string
  filterGrammar: string
  filterPunctuation: string
  filterTense: string
  filterPhrasing: string
  emptyStateTitle: string
  emptyStateDescription: string
  noFilterResults: string
  /** Translations for the issue card component */
  issueCard: GrammarIssueCardTranslations
}

interface GrammarResultsProps {
  /** The grammar analysis data to display, null when no analysis exists */
  analysis: GrammarAnalysisResponse | null
  /** Whether the analysis is currently being generated */
  isLoading: boolean
  /** Translated UI strings */
  translations: GrammarResultsTranslations
  /** Optional CSS class name for the container */
  className?: string
}

/**
 * Filter tab configuration with keys mapping to translation keys.
 */
const FILTER_TABS: { key: IssueFilter; translationKey: keyof GrammarResultsTranslations }[] = [
  { key: 'all', translationKey: 'filterAll' },
  { key: 'spelling', translationKey: 'filterSpelling' },
  { key: 'grammar', translationKey: 'filterGrammar' },
  { key: 'punctuation', translationKey: 'filterPunctuation' },
  { key: 'tense', translationKey: 'filterTense' },
  { key: 'phrasing', translationKey: 'filterPhrasing' },
]

/**
 * Skeleton component for the loading state.
 * Displays placeholder UI while analysis is being generated.
 */
export function GrammarResultsSkeleton() {
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
        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>

      {/* Filter tabs skeleton */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-8 w-20 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0"
          />
        ))}
      </div>

      {/* Issue cards skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-700 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface EmptyStateProps {
  translations: Pick<GrammarResultsTranslations, 'emptyStateTitle' | 'emptyStateDescription'>
}

/**
 * Empty state component shown when no analysis exists.
 * Provides instructional text to guide the user.
 */
function EmptyState({ translations }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-4 text-center">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mb-4 sm:mb-6">
        <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-teal-500 dark:text-teal-400" />
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

interface PerfectScoreStateProps {
  translations: Pick<GrammarResultsTranslations, 'emptyStateTitle' | 'emptyStateDescription'>
}

/**
 * State shown when analysis found zero issues.
 * Celebrates the user's perfect grammar.
 */
function PerfectScoreState({ translations }: PerfectScoreStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-4 text-center">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mb-3 sm:mb-4">
        <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8 text-teal-500 dark:text-teal-400" />
      </div>
      <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
        {translations.emptyStateTitle}
      </h3>
      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
        {translations.emptyStateDescription}
      </p>
    </div>
  )
}

interface NoFilterResultsProps {
  filterType: GrammarIssueType
  translations: GrammarResultsTranslations
}

/**
 * State shown when a filter is active but no issues match.
 */
function NoFilterResults({ filterType, translations }: NoFilterResultsProps) {
  // Get the translated type label
  const typeLabel = translations[`filter${filterType.charAt(0).toUpperCase()}${filterType.slice(1)}` as keyof GrammarResultsTranslations] as string

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <p className="text-sm text-muted-foreground">
        {translations.noFilterResults.replace('{type}', typeLabel.toLowerCase())}
      </p>
    </div>
  )
}

interface FilterTabsProps {
  activeFilter: IssueFilter
  onFilterChange: (filter: IssueFilter) => void
  issueCounts: Record<IssueFilter, number>
  translations: GrammarResultsTranslations
}

/**
 * Horizontal tab bar for filtering issues by type.
 * Supports keyboard navigation with arrow keys, Home, and End.
 */
function FilterTabs({ activeFilter, onFilterChange, issueCounts, translations }: FilterTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let nextIndex: number | null = null

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          nextIndex = currentIndex > 0 ? currentIndex - 1 : FILTER_TABS.length - 1
          break
        case 'ArrowRight':
          event.preventDefault()
          nextIndex = currentIndex < FILTER_TABS.length - 1 ? currentIndex + 1 : 0
          break
        case 'Home':
          event.preventDefault()
          nextIndex = 0
          break
        case 'End':
          event.preventDefault()
          nextIndex = FILTER_TABS.length - 1
          break
        default:
          return
      }

      if (nextIndex !== null) {
        const nextTab = tabRefs.current[nextIndex]
        if (nextTab) {
          nextTab.focus()
          onFilterChange(FILTER_TABS[nextIndex].key)
        }
      }
    },
    [onFilterChange]
  )

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-label="Filter issues by type"
      className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600"
    >
      {FILTER_TABS.map((tab, index) => {
        const isActive = activeFilter === tab.key
        const count = issueCounts[tab.key]
        const label = translations[tab.translationKey] as string

        return (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            id={`${tab.key}-tab`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tab.key}-panel`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onFilterChange(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
              'text-xs sm:text-sm font-medium transition-all duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
              'dark:focus-visible:ring-offset-slate-900',
              isActive
                ? 'bg-teal-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            )}
          >
            <span>{label}</span>
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] sm:text-xs font-medium',
                isActive
                  ? 'bg-teal-400/30 text-white'
                  : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              )}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Formats the issue count message by replacing {count} placeholder.
 */
function formatIssueCount(template: string, count: number): string {
  return template.replace('{count}', String(count))
}

/**
 * GrammarResults displays the grammar analysis results including:
 * - Overall grammar score as a circular gauge
 * - Issue count badge
 * - Filter tabs for issue types
 * - List of grammar issues as cards
 *
 * Supports loading and empty states for optimal UX.
 * Features fade-in animation when results appear.
 *
 * @example
 * ```tsx
 * <GrammarResults
 *   analysis={grammarAnalysis}
 *   isLoading={false}
 *   translations={uiTranslations}
 * />
 * ```
 */
export function GrammarResults({
  analysis,
  isLoading,
  translations,
  className,
}: GrammarResultsProps) {
  // Use responsive sizing for the score gauge
  const isMobile = useIsMobile()
  const gaugeSize = isMobile ? 'sm' : 'md'

  // Track the active filter for issue types
  const [activeFilter, setActiveFilter] = useState<IssueFilter>('all')

  // Track whether the results should be visible (for fade-in animation)
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
    const resetTimer = setTimeout(() => {
      setIsVisible(false)
    }, 0)
    return () => clearTimeout(resetTimer)
  }, [analysis, isLoading])

  // Loading state: show skeleton while analysis is being generated
  if (isLoading) {
    return (
      <div className={cn('w-full', className)}>
        <GrammarResultsSkeleton />
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

  // Calculate issue counts per filter
  const issueCounts: Record<IssueFilter, number> = {
    all: analysis.issues.length,
    spelling: analysis.issues.filter((i) => i.type === 'spelling').length,
    grammar: analysis.issues.filter((i) => i.type === 'grammar').length,
    punctuation: analysis.issues.filter((i) => i.type === 'punctuation').length,
    tense: analysis.issues.filter((i) => i.type === 'tense').length,
    phrasing: analysis.issues.filter((i) => i.type === 'phrasing').length,
  }

  // Filter issues based on active filter
  const filteredIssues =
    activeFilter === 'all'
      ? analysis.issues
      : analysis.issues.filter((issue) => issue.type === activeFilter)

  // Determine the issue count display text
  const issueCountText =
    analysis.issueCount > 0
      ? formatIssueCount(translations.issuesFound, analysis.issueCount)
      : translations.noIssuesFound

  // Data state: display the grammar results with fade-in animation
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
        <ScoreGauge score={analysis.overallScore} size={gaugeSize} />
        <p className="text-sm sm:text-base font-semibold text-foreground">
          {translations.grammarScore}
        </p>
        {/* Issue count badge */}
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-medium',
            analysis.issueCount === 0
              ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
              : analysis.issueCount <= 5
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          )}
        >
          {issueCountText}
        </span>
      </div>

      {/* Perfect score state - no issues found */}
      {analysis.issueCount === 0 ? (
        <PerfectScoreState translations={translations} />
      ) : (
        <>
          {/* Filter tabs */}
          <div className="py-3 sm:py-4 border-t border-slate-100 dark:border-slate-700">
            <FilterTabs
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              issueCounts={issueCounts}
              translations={translations}
            />
          </div>

          {/* Issue list */}
          <div
            id={`${activeFilter}-panel`}
            role="tabpanel"
            aria-labelledby={`${activeFilter}-tab`}
            className="space-y-3 sm:space-y-4"
          >
            {filteredIssues.length === 0 ? (
              <NoFilterResults
                filterType={activeFilter as GrammarIssueType}
                translations={translations}
              />
            ) : (
              filteredIssues.map((issue) => (
                <GrammarIssueCard
                  key={issue.id}
                  issue={issue}
                  translations={translations.issueCard}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
