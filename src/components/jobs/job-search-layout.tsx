'use client'

import { useState, useMemo } from 'react'
import type { JobListing, JobSearchFilters } from '@/types/jobs'
import type { Locale } from '@/lib/i18n'
import { JobFilters } from './job-filters'
import { JobList } from './job-list'
import { JobDetailPanel } from './job-detail-panel'

interface JobSearchLayoutProps {
  initialJobs: JobListing[]
  dict: any
  locale: Locale
}

export function JobSearchLayout({ initialJobs, dict, locale }: JobSearchLayoutProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialJobs.length > 0 ? initialJobs[0].id : null
  )
  const [filters, setFilters] = useState<JobSearchFilters>({
    query: '',
    location_city: undefined,
    employment_type: undefined,
  })

  // Filter jobs based on search criteria
  const filteredJobs = useMemo(() => {
    return initialJobs.filter((job) => {
      // Text search (title, company)
      if (filters.query) {
        const searchLower = filters.query.toLowerCase()
        const matchesQuery =
          job.title.toLowerCase().includes(searchLower) ||
          job.company.toLowerCase().includes(searchLower)
        if (!matchesQuery) return false
      }

      // Location filter
      if (filters.location_city && job.location_city !== filters.location_city) {
        return false
      }

      // Employment type filter
      if (filters.employment_type && job.employment_type !== filters.employment_type) {
        return false
      }

      return true
    })
  }, [initialJobs, filters])

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) || filteredJobs[0]

  // Update selected job if it's filtered out
  if (selectedJob && selectedJobId !== selectedJob.id) {
    setSelectedJobId(selectedJob?.id || null)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          {dict?.title || 'Job Search'}
        </h1>
        <p className="mt-2 text-slate-600">
          {dict?.subtitle || 'Find your next opportunity in Switzerland'}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <JobFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableCities={Array.from(new Set(initialJobs.map((j) => j.location_city)))}
          dict={dict}
        />
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left: Job List */}
        <div className="w-full md:w-1/2 lg:w-2/5">
          <JobList
            jobs={filteredJobs}
            selectedJobId={selectedJobId}
            onSelectJob={setSelectedJobId}
            dict={dict}
          />
        </div>

        {/* Right: Job Detail */}
        <div className="hidden md:block md:w-1/2 lg:w-3/5">
          {selectedJob ? (
            <JobDetailPanel job={selectedJob} dict={dict} locale={locale} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
              <p className="text-slate-500">{dict?.emptyState || 'No jobs found'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
