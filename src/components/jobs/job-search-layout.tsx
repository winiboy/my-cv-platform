'use client'

import { useState, useMemo, useEffect } from 'react'
import type { JobListing, JobSearchFilters } from '@/types/jobs'
import type { Locale } from '@/lib/i18n'
import { JobFilters } from './job-filters'
import { JobList } from './job-list'
import { JobDetailPanel } from './job-detail-panel'
import { AlertCircle, Loader2 } from 'lucide-react'

interface JobSearchLayoutProps {
  initialJobs: JobListing[]
  dict: any
  locale: Locale
}

export function JobSearchLayout({ initialJobs, dict, locale }: JobSearchLayoutProps) {
  const [jobs, setJobs] = useState<JobListing[]>(initialJobs)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'mock' | 'adzuna'>('mock')

  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialJobs.length > 0 ? initialJobs[0].id : null
  )
  const [filters, setFilters] = useState<JobSearchFilters>({
    query: '',
    location_city: undefined,
    employment_type: undefined,
  })

  // Fetch jobs from API
  useEffect(() => {
    const fetchJobs = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (filters.query) params.append('query', filters.query)
        if (filters.location_city) params.append('location', filters.location_city)
        if (filters.employment_type) params.append('employmentType', filters.employment_type)

        const response = await fetch(`/api/jobs?${params.toString()}`)

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data = await response.json()
        setJobs(data.jobs || [])
        setDataSource(data.source)

        // Select first job if none selected
        if (data.jobs && data.jobs.length > 0 && !selectedJobId) {
          setSelectedJobId(data.jobs[0].id)
        }

        // If there's an error message but we got data (fallback scenario)
        if (data.error) {
          setError(data.message || 'Using mock data due to API error')
        }
      } catch (err) {
        console.error('Error fetching jobs:', err)
        setError('Failed to load jobs. Displaying sample data.')
        // Keep initial mock jobs on error
        setJobs(initialJobs)
        setDataSource('mock')
      } finally {
        setIsLoading(false)
      }
    }

    fetchJobs()
  }, [filters, initialJobs]) // Re-fetch when filters change

  // Filter jobs client-side (for better UX when using mock data)
  const filteredJobs = useMemo(() => {
    // If using real API, jobs are already filtered server-side
    if (dataSource === 'adzuna') {
      return jobs
    }

    // For mock data, filter client-side
    return jobs.filter((job) => {
      if (filters.query) {
        const searchLower = filters.query.toLowerCase()
        const matchesQuery =
          job.title.toLowerCase().includes(searchLower) ||
          job.company.toLowerCase().includes(searchLower)
        if (!matchesQuery) return false
      }

      if (filters.location_city && job.location_city !== filters.location_city) {
        return false
      }

      if (filters.employment_type && job.employment_type !== filters.employment_type) {
        return false
      }

      return true
    })
  }, [jobs, filters, dataSource])

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) || filteredJobs[0]

  // Update selected job if it's filtered out
  if (selectedJob && selectedJobId !== selectedJob.id) {
    setSelectedJobId(selectedJob?.id || null)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {dict?.title || 'Job Search'}
            </h1>
            <p className="mt-2 text-slate-600">
              {dict?.subtitle || 'Find your next opportunity in Switzerland'}
            </p>
          </div>

          {/* Data Source Indicator */}
          <div className="text-sm text-slate-500">
            {dataSource === 'adzuna' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-green-700">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                Live Data
              </span>
            )}
            {dataSource === 'mock' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                Sample Data
              </span>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">Notice</p>
              <p className="mt-1 text-sm text-amber-700">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6">
        <JobFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableCities={Array.from(new Set(jobs.map((j) => j.location_city)))}
          dict={dict}
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm text-slate-600">
              {dict?.loading || 'Loading jobs...'}
            </p>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      {!isLoading && (
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
      )}
    </div>
  )
}
