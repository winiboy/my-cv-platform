'use client'

import { CheckCircle2, AlertTriangle, XCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnalysisCategory, CategoryStatus } from '@/types/resume-analysis'

interface CategoryListProps {
  /** Array of analysis categories to display */
  categories: AnalysisCategory[]
  /** Optional callback when a category row is clicked */
  onCategoryClick?: (index: number) => void
  /** Optional CSS class name for the container */
  className?: string
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
}: CategoryListProps) {
  if (categories.length === 0) {
    return (
      <div className={cn('text-center text-muted-foreground py-8', className)}>
        No categories to display
      </div>
    )
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
        const isClickable = onCategoryClick !== undefined

        return (
          <button
            key={`${category.name}-${index}`}
            type="button"
            onClick={() => onCategoryClick?.(index)}
            disabled={!isClickable}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-150',
              'text-left w-full',
              config.bgColor,
              config.borderColor,
              isClickable && [
                'cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              ],
              !isClickable && 'cursor-default'
            )}
            role="listitem"
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

            {/* Chevron indicator for clickable rows */}
            {isClickable && (
              <ChevronRight
                className="flex-shrink-0 w-4 h-4 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
