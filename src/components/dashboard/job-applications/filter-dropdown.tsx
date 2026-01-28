'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { JOB_STATUSES, JOB_STATUS_CONFIG } from '@/lib/constants/job-statuses'
import { DATE_RANGE_OPTIONS, type DateRangeFilter, type JobApplicationFilters } from '@/types/filters'
import type { JobStatus } from '@/types/database'

interface FilterDropdownProps {
  filters: JobApplicationFilters
  onToggleStatus: (status: JobStatus) => void
  onSetDateRange: (dateRange: DateRangeFilter) => void
  onClearFilters: () => void
  activeFilterCount: number
  dict: Record<string, unknown>
  /** Whether the viewport is mobile-sized for bottom sheet */
  isMobile?: boolean
}

/**
 * Filter component for job applications.
 * Desktop: renders as a dropdown.
 * Mobile: renders as a bottom sheet with backdrop overlay.
 *
 * Provides status checkboxes and date range radio buttons
 * with touch-friendly targets on mobile (48px minimum).
 */
export function FilterDropdown({
  filters,
  onToggleStatus,
  onSetDateRange,
  onClearFilters,
  activeFilterCount,
  dict,
  isMobile = false,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Extract translations with fallbacks
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const filtersDict = (kanbanDict.filters || {}) as Record<string, string>
  const jobsDict = (dict.jobs || {}) as Record<string, unknown>
  const statusesDict = (jobsDict.statuses || {}) as Record<string, string>

  const buttonLabel = filtersDict.button || 'Filters'
  const statusLabel = filtersDict.status || 'Status'
  const dateRangeLabel = filtersDict.dateRange || 'Date added'
  const clearAllLabel = filtersDict.clearAll || 'Clear all'

  // Close dropdown on click outside (desktop only)
  useEffect(() => {
    if (isMobile) return // Mobile uses backdrop click instead

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, isMobile])

  // Close on Escape key
  useEffect(() => {
    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      return () => document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen])

  // Prevent body scroll when mobile sheet is open
  useEffect(() => {
    if (isMobile && isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isMobile, isOpen])

  const toggleDropdown = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleBackdropClick = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleStatusToggle = useCallback(
    (status: JobStatus) => {
      onToggleStatus(status)
    },
    [onToggleStatus]
  )

  const handleDateRangeChange = useCallback(
    (dateRange: DateRangeFilter) => {
      onSetDateRange(dateRange)
    },
    [onSetDateRange]
  )

  const handleClearFilters = useCallback(() => {
    onClearFilters()
    setIsOpen(false)
  }, [onClearFilters])

  /**
   * Get status label from translations or fallback to config
   */
  function getStatusLabel(status: JobStatus): string {
    return statusesDict[status] || JOB_STATUS_CONFIG[status].label
  }

  /**
   * Get indicator color class based on status
   */
  function getStatusIndicatorColor(status: JobStatus): string {
    const colorMap: Record<JobStatus, string> = {
      saved: 'bg-slate-400',
      applied: 'bg-blue-500',
      interviewing: 'bg-yellow-500',
      offer: 'bg-green-500',
      rejected: 'bg-red-500',
      accepted: 'bg-emerald-500',
      declined: 'bg-orange-500',
    }
    return colorMap[status]
  }

  /**
   * Shared filter content used in both dropdown and bottom sheet
   */
  const filterContent = (
    <>
      {/* Status section */}
      <div className="border-b border-slate-200 p-3 dark:border-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {statusLabel}
        </h3>
        <div className={cn('space-y-1.5', isMobile && 'space-y-0')}>
          {JOB_STATUSES.map((status) => {
            const isChecked = filters.statuses.includes(status)
            return (
              <label
                key={status}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-slate-700',
                  // Mobile: 48px touch target, Desktop: compact
                  isMobile ? 'min-h-[48px] px-3 py-2' : 'px-2 py-1.5'
                )}
              >
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleStatusToggle(status)}
                    className={cn(
                      'peer cursor-pointer appearance-none rounded border border-slate-300 bg-white transition-colors checked:border-teal-600 checked:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-600 dark:bg-slate-700 dark:checked:border-teal-500 dark:checked:bg-teal-500',
                      // Mobile: larger checkbox, Desktop: standard
                      isMobile ? 'h-5 w-5' : 'h-4 w-4'
                    )}
                  />
                  <svg
                    className={cn(
                      'pointer-events-none absolute hidden text-white peer-checked:block',
                      isMobile ? 'left-0.5 top-0.5 h-4 w-4' : 'left-0.5 top-0.5 h-3 w-3'
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span
                  className={cn(
                    'rounded-full',
                    getStatusIndicatorColor(status),
                    isMobile ? 'h-3 w-3' : 'h-2.5 w-2.5'
                  )}
                  aria-hidden="true"
                />
                <span className={cn('text-slate-700 dark:text-slate-300', isMobile ? 'text-base' : 'text-sm')}>
                  {getStatusLabel(status)}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Date range section */}
      <div className="border-b border-slate-200 p-3 dark:border-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {dateRangeLabel}
        </h3>
        <div className={cn('space-y-1.5', isMobile && 'space-y-0')}>
          {DATE_RANGE_OPTIONS.map((option) => {
            const isSelected = filters.dateRange === option.value
            const label = filtersDict[option.labelKey] || option.fallbackLabel
            return (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-slate-700',
                  // Mobile: 48px touch target, Desktop: compact
                  isMobile ? 'min-h-[48px] px-3 py-2' : 'px-2 py-1.5'
                )}
              >
                <div className="relative flex items-center">
                  <input
                    type="radio"
                    name="dateRange"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => handleDateRangeChange(option.value)}
                    className={cn(
                      'peer cursor-pointer appearance-none rounded-full border border-slate-300 bg-white transition-colors checked:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-600 dark:bg-slate-700 dark:checked:border-teal-500',
                      // Mobile: larger radio, Desktop: standard
                      isMobile ? 'h-5 w-5' : 'h-4 w-4'
                    )}
                  />
                  <div
                    className={cn(
                      'pointer-events-none absolute rounded-full bg-teal-600 opacity-0 transition-opacity peer-checked:opacity-100 dark:bg-teal-500',
                      isMobile ? 'left-1.5 top-1.5 h-2 w-2' : 'left-1 top-1 h-2 w-2'
                    )}
                  />
                </div>
                <span className={cn('text-slate-700 dark:text-slate-300', isMobile ? 'text-base' : 'text-sm')}>
                  {label}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Clear all button */}
      <div className="p-3">
        <button
          type="button"
          onClick={handleClearFilters}
          disabled={activeFilterCount === 0}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
            // Mobile: 48px touch target, Desktop: standard
            isMobile ? 'min-h-[48px] px-4 py-3 text-base' : 'px-3 py-2 text-sm',
            activeFilterCount > 0
              ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
              : 'cursor-not-allowed text-slate-400 dark:text-slate-600'
          )}
        >
          <X className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
          {clearAllLabel}
        </button>
      </div>
    </>
  )

  return (
    <div ref={dropdownRef} className="relative">
      {/* Filter button */}
      {/* Mobile: 44px minimum touch target */}
      <button
        type="button"
        onClick={toggleDropdown}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-slate-200 text-sm font-medium transition-colors',
          'bg-slate-100 text-slate-700 hover:bg-slate-200',
          'dark:border-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
          isOpen && 'bg-slate-200 dark:bg-slate-600',
          // Mobile: 44px touch target, Desktop: standard
          isMobile ? 'min-h-[44px] min-w-[44px] justify-center px-3' : 'px-3 py-2'
        )}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <SlidersHorizontal className="h-4 w-4" />
        {!isMobile && <span>{buttonLabel}</span>}
        {activeFilterCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Desktop: Dropdown panel */}
      {!isMobile && isOpen && (
        <div
          className={cn(
            'absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border bg-white shadow-lg',
            'dark:border-slate-700 dark:bg-slate-800',
            'animate-in fade-in-0 zoom-in-95 duration-150 origin-top-right'
          )}
          role="menu"
          aria-orientation="vertical"
        >
          {filterContent}
        </div>
      )}

      {/* Mobile: Bottom sheet with backdrop */}
      {isMobile && isOpen && (
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 animate-in fade-in-0 duration-200"
            onClick={handleBackdropClick}
            aria-hidden="true"
          />

          {/* Bottom sheet */}
          <div
            ref={sheetRef}
            className={cn(
              'fixed bottom-0 left-0 right-0 z-50',
              'bg-white dark:bg-slate-800',
              'rounded-t-2xl shadow-2xl',
              'max-h-[85vh] overflow-y-auto overscroll-y-contain',
              'animate-in slide-in-from-bottom duration-300'
            )}
            role="dialog"
            aria-modal="true"
            aria-label={buttonLabel}
          >
            {/* Drag handle indicator */}
            <div className="sticky top-0 z-10 bg-white pt-3 pb-2 dark:bg-slate-800">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Sheet header with title and close button */}
            <div className="flex items-center justify-between px-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {buttonLabel}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter content */}
            <div className="pb-safe">
              {filterContent}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
