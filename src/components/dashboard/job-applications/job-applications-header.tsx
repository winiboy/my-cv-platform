'use client'

import Link from 'next/link'
import { Search, LayoutGrid, List, ExternalLink } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/lib/hooks/use-media-query'
import { FilterDropdown } from './filter-dropdown'
import type { JobApplicationFilters, DateRangeFilter } from '@/types/filters'
import type { JobStatus } from '@/types/database'

interface JobApplicationsHeaderProps {
  locale: string
  dict: Record<string, unknown>
  searchQuery: string
  onSearchChange: (query: string) => void
  currentView: 'board' | 'list'
  onViewChange: (view: 'board' | 'list') => void
  totalCount: number
  filters: JobApplicationFilters
  onToggleStatus: (status: JobStatus) => void
  onSetDateRange: (dateRange: DateRangeFilter) => void
  onClearFilters: () => void
  activeFilterCount: number
}

/**
 * Header component for the Job Applications page.
 * Provides title, search, filters, view toggle, and navigation to browse jobs.
 */
export function JobApplicationsHeader({
  locale,
  dict,
  searchQuery,
  onSearchChange,
  currentView,
  onViewChange,
  totalCount,
  filters,
  onToggleStatus,
  onSetDateRange,
  onClearFilters,
  activeFilterCount,
}: JobApplicationsHeaderProps) {
  // Track mobile viewport for responsive layout
  const isMobile = useIsMobile()

  // Extract translations with fallbacks
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const headerDict = (kanbanDict.header || {}) as Record<string, string>

  const title = headerDict.title || 'Job Applications'
  const searchPlaceholder = headerDict.searchPlaceholder || 'Search by title, company, or location...'
  const viewBoard = headerDict.viewBoard || 'Board'
  const viewList = headerDict.viewList || 'List'
  const browseJobs = headerDict.browseJobs || 'Browse Jobs'
  const applicationsSingular = headerDict.applicationsSingular || 'application'
  const applicationsPlural = headerDict.applicationsPlural || 'applications'

  return (
    <div className="flex flex-col gap-4">
      {/* Title row - always visible */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h1>
          <p className="text-sm text-slate-500">
            {totalCount} {totalCount === 1 ? applicationsSingular : applicationsPlural}
          </p>
        </div>

        {/* Desktop: Browse Jobs in title row */}
        {!isMobile && (
          <Link
            href={`/${locale}/dashboard/jobs`}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
          >
            <span>{browseJobs}</span>
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Controls row - stacked on mobile */}
      <div
        className={cn(
          'flex gap-3',
          isMobile ? 'flex-col' : 'flex-row items-center'
        )}
      >
        {/* Search input - full width on mobile */}
        <div className={cn('relative', isMobile ? 'w-full' : 'w-[250px]')}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder={isMobile ? (headerDict.searchPlaceholderShort || 'Search...') : searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 w-full"
          />
        </div>

        {/* Filter, view toggle, and Browse Jobs (mobile) in a row */}
        <div className="flex items-center gap-2">
          {/* Filter dropdown */}
          <FilterDropdown
            filters={filters}
            onToggleStatus={onToggleStatus}
            onSetDateRange={onSetDateRange}
            onClearFilters={onClearFilters}
            activeFilterCount={activeFilterCount}
            dict={dict}
            isMobile={isMobile}
          />

          {/* View toggle - icons only on mobile */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => onViewChange('board')}
              className={cn(
                'flex items-center justify-center gap-1.5 text-sm font-medium transition-colors',
                // Mobile: 44px touch target, Desktop: standard padding
                isMobile ? 'min-h-[44px] min-w-[44px]' : 'px-3 py-2',
                currentView === 'board'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              )}
              aria-pressed={currentView === 'board'}
              aria-label={viewBoard}
            >
              <LayoutGrid className="h-4 w-4" />
              {!isMobile && <span>{viewBoard}</span>}
            </button>
            <button
              type="button"
              onClick={() => onViewChange('list')}
              className={cn(
                'flex items-center justify-center gap-1.5 text-sm font-medium transition-colors',
                // Mobile: 44px touch target, Desktop: standard padding
                isMobile ? 'min-h-[44px] min-w-[44px]' : 'px-3 py-2',
                currentView === 'list'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              )}
              aria-pressed={currentView === 'list'}
              aria-label={viewList}
            >
              <List className="h-4 w-4" />
              {!isMobile && <span>{viewList}</span>}
            </button>
          </div>

          {/* Mobile: Browse Jobs icon button */}
          {isMobile && (
            <Link
              href={`/${locale}/dashboard/jobs`}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg bg-teal-600 text-white transition-colors hover:bg-teal-700"
              aria-label={browseJobs}
            >
              <ExternalLink className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
