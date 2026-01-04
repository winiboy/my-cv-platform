'use client'

import { Search } from 'lucide-react'
import type { JobSearchFilters, EmploymentType } from '@/types/jobs'
import { SWISS_CANTONS } from '@/types/jobs'

interface JobFiltersProps {
  filters: JobSearchFilters
  onFiltersChange: (filters: JobSearchFilters) => void
  dict: any
}

export function JobFilters({ filters, onFiltersChange, dict }: JobFiltersProps) {
  const employmentTypes: EmploymentType[] = ['full-time', 'part-time', 'contract', 'internship', 'temporary']

  return (
    <div className="flex flex-wrap gap-4">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={dict?.filters?.searchPlaceholder || 'Search jobs...'}
          value={filters.query}
          onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>

      {/* Canton Filter */}
      <div className="w-full sm:w-auto">
        <select
          value={filters.location_canton || ''}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              location_canton: e.target.value || undefined,
            })
          }
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 sm:w-auto"
        >
          <option value="">{dict?.filters?.allCantons || 'All Cantons'}</option>
          {SWISS_CANTONS.map((canton) => (
            <option key={canton} value={canton}>
              {canton}
            </option>
          ))}
        </select>
      </div>

      {/* Employment Type Filter */}
      <div className="w-full sm:w-auto">
        <select
          value={filters.employment_type || ''}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              employment_type: (e.target.value || undefined) as EmploymentType | undefined,
            })
          }
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 sm:w-auto"
        >
          <option value="">{dict?.filters?.allTypes || 'All Types'}</option>
          {employmentTypes.map((type) => (
            <option key={type} value={type}>
              {dict?.employmentTypes?.[type] || type}
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {(filters.query || filters.location_canton || filters.employment_type) && (
        <button
          onClick={() =>
            onFiltersChange({ query: '', location_canton: undefined, employment_type: undefined })
          }
          className="text-sm text-slate-600 hover:text-slate-900 underline"
        >
          {dict?.filters?.clearFilters || 'Clear filters'}
        </button>
      )}
    </div>
  )
}
