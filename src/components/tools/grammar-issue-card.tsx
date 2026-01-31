import type { LucideIcon } from 'lucide-react'
import { SpellCheck, ALargeSmall, TextQuote, Clock, Lightbulb, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GrammarIssue, GrammarIssueType, GrammarIssueSeverity } from '@/types/grammar-check'

/**
 * Translation strings required by the GrammarIssueCard component.
 */
export interface GrammarIssueCardTranslations {
  typeLabels: Record<GrammarIssueType, string>
  severityLabels: Record<GrammarIssueSeverity, string>
  original: string
  suggested: string
  explanation: string
  location: string
}

export interface GrammarIssueCardProps {
  /** The grammar issue to display */
  issue: GrammarIssue
  /** Translated UI strings */
  translations: GrammarIssueCardTranslations
  /** Optional CSS class name for the container */
  className?: string
}

/**
 * Configuration for each issue type, mapping to its icon.
 */
const ISSUE_TYPE_CONFIG: Record<GrammarIssueType, { icon: LucideIcon }> = {
  spelling: { icon: SpellCheck },
  grammar: { icon: ALargeSmall },
  punctuation: { icon: TextQuote },
  tense: { icon: Clock },
  phrasing: { icon: Lightbulb },
}

/**
 * Configuration for each severity level, defining color classes for various UI elements.
 */
const SEVERITY_CONFIG: Record<
  GrammarIssueSeverity,
  {
    bg: string
    border: string
    text: string
    badge: string
  }
> = {
  error: {
    bg: 'bg-red-50/50 dark:bg-red-900/10',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  },
  warning: {
    bg: 'bg-amber-50/50 dark:bg-amber-900/10',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  suggestion: {
    bg: 'bg-blue-50/50 dark:bg-blue-900/10',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
}

/**
 * GrammarIssueCard displays a single grammar issue with its details.
 * Shows the issue type, severity, original and suggested text,
 * explanation, and location where the issue was found.
 *
 * @example
 * ```tsx
 * <GrammarIssueCard
 *   issue={grammarIssue}
 *   translations={issueCardTranslations}
 * />
 * ```
 */
export function GrammarIssueCard({
  issue,
  translations,
  className,
}: GrammarIssueCardProps) {
  const typeConfig = ISSUE_TYPE_CONFIG[issue.type]
  const severityConfig = SEVERITY_CONFIG[issue.severity]
  const TypeIcon = typeConfig.icon

  return (
    <div
      className={cn(
        'rounded-lg border p-3 sm:p-4 transition-shadow duration-150',
        'hover:shadow-sm',
        severityConfig.bg,
        severityConfig.border,
        className
      )}
    >
      {/* Header: Icon + Type label + Severity badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex-shrink-0 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full',
              severityConfig.bg
            )}
          >
            <TypeIcon
              className={cn('w-4 h-4 sm:w-5 sm:h-5', severityConfig.text)}
              aria-hidden="true"
            />
          </div>
          <span className={cn('text-xs sm:text-sm font-medium', severityConfig.text)}>
            {translations.typeLabels[issue.type]}
          </span>
        </div>
        <span
          className={cn(
            'flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
            severityConfig.badge
          )}
        >
          {translations.severityLabels[issue.severity]}
        </span>
      </div>

      {/* Original text section */}
      <div className="mb-2">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground">
          {translations.original}
        </span>
        <p className="mt-0.5 text-xs sm:text-sm text-foreground line-through decoration-red-400 dark:decoration-red-500">
          {issue.originalText}
        </p>
      </div>

      {/* Suggested text section */}
      <div className="mb-3">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground">
          {translations.suggested}
        </span>
        <p className="mt-0.5 text-xs sm:text-sm text-teal-700 dark:text-teal-300 bg-teal-50/50 dark:bg-teal-900/20 px-2 py-1 rounded">
          {issue.suggestedText}
        </p>
      </div>

      {/* Explanation section */}
      <div className="mb-3">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground">
          {translations.explanation}
        </span>
        <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {issue.explanation}
        </p>
      </div>

      {/* Footer: Location */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-border/50">
        <MapPin
          className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0"
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground">
          {translations.location}
        </span>
        <span className="text-xs text-foreground font-medium">
          {issue.location}
        </span>
      </div>
    </div>
  )
}
