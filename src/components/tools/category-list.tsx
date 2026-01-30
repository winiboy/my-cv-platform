'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnalysisCategory, AnalysisIssue, CategoryStatus, IssueSeverity } from '@/types/resume-analysis'

interface CategoryListProps {
  /** Array of analysis categories to display */
  categories: AnalysisCategory[]
  /** Optional callback when a category row is clicked */
  onCategoryClick?: (index: number) => void
  /** Optional CSS class name for the container */
  className?: string
  /** Resume ID for "Show me" navigation links */
  resumeId?: string
  /** Locale for i18n routing in navigation links */
  locale?: string
}

/**
 * Returns the appropriate icon component and color classes based on category status.
 */
function getStatusConfig(status: CategoryStatus): {
  icon: typeof CheckCircle2
  iconColor: string
  bgColor: string
  borderColor: string
  scoreColor: string
} {
  switch (status) {
    case 'pass':
      return {
        icon: CheckCircle2,
        iconColor: 'text-teal-600 dark:text-teal-400',
        bgColor: 'bg-teal-50/50 dark:bg-teal-900/10 hover:bg-teal-50 dark:hover:bg-teal-900/20',
        borderColor: 'border-teal-200 dark:border-teal-800',
        scoreColor: 'text-teal-700 dark:text-teal-300',
      }
    case 'warning':
      return {
        icon: AlertTriangle,
        iconColor: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20',
        borderColor: 'border-amber-200 dark:border-amber-800',
        scoreColor: 'text-amber-700 dark:text-amber-300',
      }
    case 'fail':
      return {
        icon: XCircle,
        iconColor: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
        scoreColor: 'text-red-700 dark:text-red-300',
      }
  }
}

/**
 * Returns severity badge styling based on issue severity level.
 */
function getSeverityConfig(severity: IssueSeverity): {
  bgColor: string
  textColor: string
  label: string
} {
  switch (severity) {
    case 'high':
      return {
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        textColor: 'text-red-700 dark:text-red-300',
        label: 'High',
      }
    case 'medium':
      return {
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        textColor: 'text-amber-700 dark:text-amber-300',
        label: 'Medium',
      }
    case 'low':
      return {
        bgColor: 'bg-gray-100 dark:bg-gray-800',
        textColor: 'text-gray-600 dark:text-gray-400',
        label: 'Low',
      }
  }
}

/** Valid resume section anchors for "Show me" navigation */
const VALID_SECTIONS = ['summary', 'experience', 'education', 'skills', 'contact'] as const
type ResumeSection = (typeof VALID_SECTIONS)[number]

/**
 * Type guard to validate if a section string is a valid resume section anchor.
 */
function isValidSection(section: string | undefined): section is ResumeSection {
  return section !== undefined && VALID_SECTIONS.includes(section as ResumeSection)
}

interface IssueItemProps {
  issue: AnalysisIssue
  resumeId?: string
  locale?: string
}

/**
 * Renders an individual issue with severity badge, description, and suggestion.
 * Includes a "Show me" link when the issue has a valid section reference.
 */
function IssueItem({ issue, resumeId, locale }: IssueItemProps) {
  const severityConfig = getSeverityConfig(issue.severity)
  const canNavigate = resumeId && locale && isValidSection(issue.section)

  return (
    <div className="flex flex-col gap-1.5 py-2 border-b border-border/50 last:border-b-0">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
            severityConfig.bgColor,
            severityConfig.textColor
          )}
        >
          {severityConfig.label}
        </span>
        <p className="text-sm text-foreground flex-1">{issue.description}</p>
        {canNavigate && (
          <Link
            href={`/${locale}/dashboard/resumes/${resumeId}#${issue.section}`}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline transition-colors"
          >
            Show me
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        )}
      </div>
      {issue.suggestion && (
        <p className="text-sm text-muted-foreground pl-[52px]">
          <span className="font-medium">Suggestion:</span> {issue.suggestion}
        </p>
      )}
    </div>
  )
}

/**
 * CategoryList displays a list of analysis categories with their scores and status.
 * Each category is clickable and shows an icon indicating pass/warning/fail status.
 *
 * @example
 * ```tsx
 * <CategoryList
 *   categories={analysis.categories}
 *   onCategoryClick={(index) => setSelectedCategory(index)}
 * />
 * ```
 */
export function CategoryList({
  categories,
  onCategoryClick,
  className,
  resumeId,
  locale,
}: CategoryListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  if (categories.length === 0) {
    return (
      <div className={cn('text-center text-muted-foreground py-8', className)}>
        No categories to display
      </div>
    )
  }

  /**
   * Handles category row click - toggles expansion and calls external callback if provided.
   */
  function handleCategoryClick(index: number) {
    setExpandedIndex((current) => (current === index ? null : index))
    onCategoryClick?.(index)
  }

  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      role="list"
      aria-label="Analysis categories"
    >
      {categories.map((category, index) => {
        const config = getStatusConfig(category.status)
        const StatusIcon = config.icon
        const isExpanded = expandedIndex === index
        const hasIssues = category.issues.length > 0

        return (
          <div
            key={`${category.name}-${index}`}
            className={cn(
              'rounded-lg border transition-all duration-150',
              config.borderColor,
              isExpanded && 'ring-1 ring-ring/20'
            )}
          >
            {/* Category header row */}
            <button
              type="button"
              onClick={() => handleCategoryClick(index)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 w-full transition-all duration-150 min-h-[56px]',
                'text-left cursor-pointer',
                config.bgColor,
                isExpanded ? 'rounded-t-lg' : 'rounded-lg',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
              aria-expanded={isExpanded}
              aria-controls={`category-content-${index}`}
              aria-label={`${category.name}: ${category.score} out of 100, status ${category.status}`}
            >
              {/* Status icon */}
              <div
                className={cn(
                  'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full',
                  category.status === 'pass' && 'bg-teal-100 dark:bg-teal-900/30',
                  category.status === 'warning' && 'bg-amber-100 dark:bg-amber-900/30',
                  category.status === 'fail' && 'bg-red-100 dark:bg-red-900/30'
                )}
              >
                <StatusIcon
                  className={cn('w-5 h-5', config.iconColor)}
                  aria-hidden="true"
                />
              </div>

              {/* Category name */}
              <span className="flex-1 text-sm font-medium text-foreground truncate">
                {category.name}
              </span>

              {/* Score */}
              <span
                className={cn(
                  'flex-shrink-0 text-lg font-bold tabular-nums',
                  config.scoreColor
                )}
              >
                {category.score}
              </span>

              {/* Chevron indicator - rotates when expanded */}
              <ChevronDown
                className={cn(
                  'flex-shrink-0 w-4 h-4 text-muted-foreground transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>

            {/* Expanded content section with smooth animation */}
            <div
              id={`category-content-${index}`}
              className={cn(
                'overflow-hidden transition-all duration-200 ease-in-out',
                isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <div className="px-4 py-3 bg-background/50 border-t border-border/50 rounded-b-lg">
                {/* Feedback text */}
                {category.feedback && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {category.feedback}
                  </p>
                )}

                {/* Issues list */}
                {hasIssues ? (
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Issues ({category.issues.length})
                    </h4>
                    <div className="divide-y divide-border/50">
                      {category.issues.map((issue, issueIndex) => (
                        <IssueItem
                          key={`${category.name}-issue-${issueIndex}`}
                          issue={issue}
                          resumeId={resumeId}
                          locale={locale}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-teal-600 dark:text-teal-400 font-medium">
                    No issues found in this category.
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
