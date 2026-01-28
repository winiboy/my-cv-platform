'use client'

import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { JOB_STATUS_CONFIG, JOB_STATUSES } from '@/lib/constants/job-statuses'
import { DATE_RANGE_OPTIONS, type JobApplicationFilters } from '@/types/filters'
import type { JobStatus } from '@/types/database'

interface FilterPillsProps {
  filters: JobApplicationFilters
  onRemoveStatus: (status: JobStatus) => void
  onClearDateRange: () => void
  onClearAll: () => void
  dict: Record<string, unknown>
}

/**
 * Displays active filters as dismissible pills.
 * Shows status pills and date range pill when filters are active.
 * Includes a "Clear all" button to reset all filters at once.
 */
export function FilterPills({
  filters,
  onRemoveStatus,
  onClearDateRange,
  onClearAll,
  dict,
}: FilterPillsProps) {
  // Extract translations with fallbacks
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const filtersDict = (kanbanDict.filters || {}) as Record<string, string>
  const jobsDict = (dict.jobs || {}) as Record<string, unknown>
  const statusesDict = (jobsDict.statuses || {}) as Record<string, string>

  const clearAllLabel = filtersDict.clearAll || 'Clear all'

  /**
   * Get status label from translations or fallback to config
   */
  function getStatusLabel(status: JobStatus): string {
    return statusesDict[status] || JOB_STATUS_CONFIG[status].label
  }

  /**
   * Get date range label from translations or fallback
   */
  function getDateRangeLabel(value: string): string {
    const option = DATE_RANGE_OPTIONS.find((opt) => opt.value === value)
    if (!option) return value
    return filtersDict[option.labelKey] || option.fallbackLabel
  }

  /**
   * Get subtle background color for status pill
   */
  function getStatusPillColor(status: JobStatus): string {
    const colorMap: Record<JobStatus, string> = {
      saved: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
      applied: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      interviewing: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      offer: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      rejected: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      accepted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      declined: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    }
    return colorMap[status]
  }

  // Determine if status filter is active
  // Active when: some statuses selected but not all, and not empty
  const allStatusCount = JOB_STATUSES.length
  const selectedStatusCount = filters.statuses.length
  const hasStatusFilter =
    selectedStatusCount > 0 && selectedStatusCount < allStatusCount

  // Determine if date range filter is active
  const hasDateRangeFilter = filters.dateRange !== 'all'

  // Only show if at least one filter is active
  const hasActiveFilters = hasStatusFilter || hasDateRangeFilter

  if (!hasActiveFilters) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status pills */}
      {hasStatusFilter &&
        filters.statuses.map((status) => (
          <span
            key={status}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs',
              getStatusPillColor(status)
            )}
          >
            {getStatusLabel(status)}
            <button
              type="button"
              onClick={() => onRemoveStatus(status)}
              className="rounded-full p-0.5 transition-colors hover:bg-slate-200 dark:hover:bg-slate-600"
              aria-label={`Remove ${getStatusLabel(status)} filter`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

      {/* Date range pill */}
      {hasDateRangeFilter && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-300">
          {getDateRangeLabel(filters.dateRange)}
          <button
            type="button"
            onClick={onClearDateRange}
            className="rounded-full p-0.5 transition-colors hover:bg-slate-200 dark:hover:bg-slate-600"
            aria-label={filtersDict.removeDateRange || 'Remove date range filter'}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {/* Clear all button */}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs text-slate-500 underline transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
      >
        {clearAllLabel}
      </button>
    </div>
  )
}
