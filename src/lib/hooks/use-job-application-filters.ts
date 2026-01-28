'use client'

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { JobStatus } from '@/types/database'
import type { JobApplicationFilters, DateRangeFilter } from '@/types/filters'

/**
 * Custom hook for managing job application filter state via URL params
 */
export function useJobApplicationFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Parse filters from URL
  const filters = useMemo((): JobApplicationFilters => {
    const statusParam = searchParams.get('status')
    const dateRangeParam = searchParams.get('dateRange')

    return {
      statuses: statusParam
        ? (statusParam.split(',').filter(Boolean) as JobStatus[])
        : [],
      dateRange: (dateRangeParam as DateRangeFilter) || 'all',
    }
  }, [searchParams])

  // Update URL with new filters
  const updateFilters = useCallback(
    (newFilters: Partial<JobApplicationFilters>) => {
      const params = new URLSearchParams(searchParams.toString())
      const merged = { ...filters, ...newFilters }

      // Status filter
      if (merged.statuses.length > 0 && merged.statuses.length < 7) {
        params.set('status', merged.statuses.join(','))
      } else {
        params.delete('status')
      }

      // Date range filter
      if (merged.dateRange !== 'all') {
        params.set('dateRange', merged.dateRange)
      } else {
        params.delete('dateRange')
      }

      router.push(`?${params.toString()}`)
    },
    [searchParams, filters, router]
  )

  // Toggle a single status
  const toggleStatus = useCallback(
    (status: JobStatus) => {
      const newStatuses = filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : [...filters.statuses, status]
      updateFilters({ statuses: newStatuses })
    },
    [filters.statuses, updateFilters]
  )

  // Set date range
  const setDateRange = useCallback(
    (dateRange: DateRangeFilter) => {
      updateFilters({ dateRange })
    },
    [updateFilters]
  )

  // Clear all filters
  const clearFilters = useCallback(() => {
    updateFilters({ statuses: [], dateRange: 'all' })
  }, [updateFilters])

  // Check if any filters are active
  const hasActiveFilters = filters.statuses.length > 0 || filters.dateRange !== 'all'

  // Get active filter count
  const activeFilterCount =
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.dateRange !== 'all' ? 1 : 0)

  return {
    filters,
    updateFilters,
    toggleStatus,
    setDateRange,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
  }
}
