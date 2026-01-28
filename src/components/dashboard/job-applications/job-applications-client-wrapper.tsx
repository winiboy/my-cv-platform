'use client'

import { useState, useMemo, useCallback, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { JobApplicationWithRelations, JobStatus } from '@/types/database'
import { useDebounce } from '@/lib/hooks/use-debounce'
import { useJobApplicationFilters } from '@/lib/hooks/use-job-application-filters'
import { DATE_RANGE_OPTIONS } from '@/types/filters'
import { JobApplicationsHeader } from './job-applications-header'
import { KanbanBoard } from './kanban-board'
import { KanbanBoardSkeleton } from './kanban-board-skeleton'
import { FilterPills } from './filter-pills'
import { JobApplicationCard } from '@/components/dashboard/job-application-card'

interface JobApplicationsClientWrapperProps {
  applications: JobApplicationWithRelations[]
  locale: string
  dict: Record<string, unknown>
  /** Server-rendered empty state to show when no applications exist */
  emptyState?: ReactNode
  /** Whether the data is currently loading (shows skeleton when true and no applications) */
  isLoading?: boolean
}

/**
 * Client wrapper component for the Job Applications page.
 * Manages search, filters, and view state, providing filtered data to child components.
 *
 * - Search: Debounced filtering by job_title, company_name, or location
 * - Filters: Status and date range filtering via URL params
 * - View: URL-persisted toggle between 'board' (Kanban) and 'list' views
 */
export function JobApplicationsClientWrapper({
  applications,
  locale,
  dict,
  emptyState,
  isLoading = false,
}: JobApplicationsClientWrapperProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Search state with debounce for performance
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Filter state from URL params
  const {
    filters,
    toggleStatus,
    setDateRange,
    clearFilters,
    activeFilterCount,
  } = useJobApplicationFilters()

  // View state from URL params (defaults to 'board')
  const currentView = (searchParams.get('view') === 'list' ? 'list' : 'board') as 'board' | 'list'

  /**
   * Update URL when view changes.
   * Uses shallow navigation to avoid full page reload.
   */
  const handleViewChange = useCallback(
    (view: 'board' | 'list') => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('view', view)
      router.push(`?${params.toString()}`)
    },
    [searchParams, router]
  )

  /**
   * Remove a single status from the filter.
   */
  const handleRemoveStatus = useCallback(
    (status: JobStatus) => {
      toggleStatus(status)
    },
    [toggleStatus]
  )

  /**
   * Clear the date range filter.
   */
  const handleClearDateRange = useCallback(() => {
    setDateRange('all')
  }, [setDateRange])

  /**
   * Filter applications by search query, status, and date range.
   */
  const filteredApplications = useMemo(() => {
    let result = applications

    // Filter by search query
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase()
      result = result.filter(
        (app) =>
          app.job_title.toLowerCase().includes(query) ||
          app.company_name.toLowerCase().includes(query) ||
          (app.location?.toLowerCase().includes(query) ?? false)
      )
    }

    // Filter by date range
    if (filters.dateRange !== 'all') {
      const option = DATE_RANGE_OPTIONS.find((o) => o.value === filters.dateRange)
      const startDate = option?.getStartDate()
      if (startDate) {
        result = result.filter((app) => new Date(app.updated_at) >= startDate)
      }
    }

    // Filter by status (client-side)
    if (filters.statuses.length > 0) {
      result = result.filter((app) => filters.statuses.includes(app.status as JobStatus))
    }

    return result
  }, [applications, debouncedSearch, filters])

  // Extract translations
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const searchDict = (kanbanDict.search || {}) as Record<string, string>
  const boardDict = (kanbanDict.board || {}) as Record<string, string>
  const noSearchResults = searchDict.noResults || 'No applications match your search'
  const noFilterResults = searchDict.noFilterResults || 'No applications match your filters'
  const clearSearch = searchDict.clearSearch || 'Clear search'

  // Determine empty states
  // Show server empty state only when there are no applications at all (before filtering)
  // Show search/filter empty state when filters yield no results
  const hasNoApplications = applications.length === 0
  const hasNoFilterResults = !hasNoApplications && filteredApplications.length === 0

  return (
    <div className="flex flex-col gap-6">
      <JobApplicationsHeader
        locale={locale}
        dict={dict}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        currentView={currentView}
        onViewChange={handleViewChange}
        totalCount={filteredApplications.length}
        filters={filters}
        onToggleStatus={toggleStatus}
        onSetDateRange={setDateRange}
        onClearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
      />

      {/* Filter pills */}
      <FilterPills
        filters={filters}
        onRemoveStatus={handleRemoveStatus}
        onClearDateRange={handleClearDateRange}
        onClearAll={clearFilters}
        dict={dict}
      />

      {/* Loading skeleton (shown when loading and no applications yet) */}
      {isLoading && applications.length === 0 && <KanbanBoardSkeleton />}

      {/* Empty state from server (no applications at all) */}
      {!isLoading && hasNoApplications && emptyState}

      {/* Filter/search empty state (has applications but filters found nothing) */}
      {hasNoFilterResults && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-slate-600 dark:text-slate-400">
            {searchQuery
              ? `${noSearchResults} "${searchQuery}"`
              : noFilterResults}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              clearFilters()
            }}
            className="mt-4 text-teal-600 hover:text-teal-700 font-medium"
          >
            {clearSearch}
          </button>
        </div>
      )}

      {/* Board or List view */}
      {filteredApplications.length > 0 && (
        <>
          {/* Skip link for keyboard users to bypass the Kanban board */}
          {currentView === 'board' && (
            <a
              href="#after-kanban-board"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-md focus:shadow-lg"
            >
              {boardDict.skipLink || 'Skip Kanban board'}
            </a>
          )}
          {currentView === 'board' ? (
            <KanbanBoard
              jobApplications={filteredApplications}
              locale={locale}
              dict={dict}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredApplications.map((jobApplication) => (
                <JobApplicationCard
                  key={jobApplication.id}
                  jobApplication={jobApplication}
                  locale={locale}
                  dict={dict}
                />
              ))}
            </div>
          )}
          {/* Target for skip link */}
          <div id="after-kanban-board" tabIndex={-1} />
        </>
      )}
    </div>
  )
}
