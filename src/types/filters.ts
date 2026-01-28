import type { JobStatus } from './database'

/**
 * Date range filter options
 */
export type DateRangeFilter = 'week' | 'month' | '3months' | 'all'

/**
 * Column sort options for Kanban board columns
 */
export type ColumnSortOption = 'recent' | 'oldest' | 'company_asc' | 'company_desc'

/**
 * Column sort option configuration
 */
export interface ColumnSortOptionConfig {
  value: ColumnSortOption
  labelKey: string
  fallbackLabel: string
}

/**
 * Available column sort options
 */
export const COLUMN_SORT_OPTIONS: ColumnSortOptionConfig[] = [
  {
    value: 'recent',
    labelKey: 'mostRecent',
    fallbackLabel: 'Most recent',
  },
  {
    value: 'oldest',
    labelKey: 'oldestFirst',
    fallbackLabel: 'Oldest first',
  },
  {
    value: 'company_asc',
    labelKey: 'companyAZ',
    fallbackLabel: 'Company A-Z',
  },
  {
    value: 'company_desc',
    labelKey: 'companyZA',
    fallbackLabel: 'Company Z-A',
  },
]

/**
 * Default sort option for columns
 */
export const DEFAULT_COLUMN_SORT: ColumnSortOption = 'recent'

/**
 * Filter state for job applications
 */
export interface JobApplicationFilters {
  statuses: JobStatus[]
  dateRange: DateRangeFilter
}

/**
 * Date range configuration
 */
export interface DateRangeOption {
  value: DateRangeFilter
  labelKey: string
  fallbackLabel: string
  getStartDate: () => Date | null
}

/**
 * Date range options with translation keys
 */
export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  {
    value: 'week',
    labelKey: 'week',
    fallbackLabel: 'This week',
    getStartDate: () => {
      const d = new Date()
      d.setDate(d.getDate() - 7)
      d.setHours(0, 0, 0, 0)
      return d
    },
  },
  {
    value: 'month',
    labelKey: 'month',
    fallbackLabel: 'This month',
    getStartDate: () => {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      d.setHours(0, 0, 0, 0)
      return d
    },
  },
  {
    value: '3months',
    labelKey: 'threeMonths',
    fallbackLabel: 'Last 3 months',
    getStartDate: () => {
      const d = new Date()
      d.setMonth(d.getMonth() - 3)
      d.setHours(0, 0, 0, 0)
      return d
    },
  },
  {
    value: 'all',
    labelKey: 'all',
    fallbackLabel: 'All time',
    getStartDate: () => null,
  },
]
