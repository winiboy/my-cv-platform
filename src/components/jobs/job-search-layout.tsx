'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'mock' | 'adzuna'>('mock')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalJobs, setTotalJobs] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialJobs.length > 0 ? initialJobs[0].id : null
  )
  const [filters, setFilters] = useState<JobSearchFilters>({
    query: '',
    location_city: undefined,
    employment_type: undefined,
  })

  // Fetch jobs from API (reset on filter change)
  const fetchJobs = useCallback(async (page: number = 1, append: boolean = false) => {
    if (append) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
      setCurrentPage(1)
      setHasMore(true)
    }
    setError(null)

    try {
      const params = new URLSearchParams()
      if (filters.query) params.append('query', filters.query)
      if (filters.location_city) params.append('location', filters.location_city)
      if (filters.employment_type) params.append('employmentType', filters.employment_type)
      params.append('page', String(page))
      params.append('resultsPerPage', '20')

      const response = await fetch(`/api/jobs?${params.toString()}`)

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const newJobs = data.jobs || []

      setDataSource(data.source)
      setTotalJobs(data.total || 0)

      if (append) {
        // Append new jobs to existing list
        setJobs(prev => [...prev, ...newJobs])
      } else {
        // Replace jobs (new search)
        setJobs(newJobs)
        // Select first job if none selected
        if (newJobs.length > 0 && !selectedJobId) {
          setSelectedJobId(newJobs[0].id)
        }
      }

      // Check if there are more jobs to load
      const loadedCount = append ? jobs.length + newJobs.length : newJobs.length
      setHasMore(loadedCount < (data.total || 0) && newJobs.length > 0)

      // If there's an error message but we got data
      if (data.error) {
        setError(data.message || 'API error occurred')
      }
    } catch (err) {
      console.error('Error fetching jobs:', err)
      setError('Failed to load jobs from API. Please check your connection and try again.')
      if (!append) {
        setJobs([])
        setDataSource('adzuna')
      }
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [filters, jobs.length, selectedJobId])

  // Initial fetch and re-fetch when filters change
  useEffect(() => {
    fetchJobs(1, false)
  }, [filters]) // Re-fetch when filters change

  // Load more jobs (for infinite scroll)
  const loadMoreJobs = useCallback(() => {
    if (!isLoadingMore && hasMore && !isLoading) {
      const nextPage = currentPage + 1
      setCurrentPage(nextPage)
      fetchJobs(nextPage, true)
    }
  }, [isLoadingMore, hasMore, isLoading, currentPage, fetchJobs])

  // Intersection Observer for infinite scroll
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = observerTarget.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadMoreJobs()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(target)

    return () => {
      if (target) {
        observer.unobserve(target)
      }
    }
  }, [hasMore, isLoadingMore, isLoading, loadMoreJobs])

  // Jobs are filtered server-side by the API
  const filteredJobs = jobs

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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500"></span>
              Live Data
            </span>
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
              observerTarget={observerTarget}
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              totalJobs={totalJobs}
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
