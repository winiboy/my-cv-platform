'use client'

import type { JobListing } from '@/types/jobs'
import { JobCard } from './job-card'
import { Loader2 } from 'lucide-react'

interface JobListProps {
  jobs: JobListing[]
  selectedJobId: string | null
  onSelectJob: (jobId: string) => void
  dict: any
  observerTarget?: React.RefObject<HTMLDivElement | null>
  isLoadingMore?: boolean
  hasMore?: boolean
  totalJobs?: number
}

export function JobList({
  jobs,
  selectedJobId,
  onSelectJob,
  dict,
  observerTarget,
  isLoadingMore = false,
  hasMore = true,
  totalJobs = 0,
}: JobListProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8">
        <div className="text-center">
          <p className="text-lg font-medium text-slate-900">
            {dict?.noJobsFound || 'No jobs found'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {dict?.tryDifferentFilters || 'Try adjusting your filters'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white">
      <div className="divide-y divide-slate-200">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isSelected={job.id === selectedJobId}
            onClick={() => onSelectJob(job.id)}
            dict={dict}
          />
        ))}

        {/* Loading indicator at bottom */}
        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 p-6">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            <p className="text-sm text-slate-600">
              {dict?.loadingMore || 'Loading more jobs...'}
            </p>
          </div>
        )}

        {/* Intersection Observer target */}
        {hasMore && !isLoadingMore && (
          <div ref={observerTarget} className="h-4" />
        )}

        {/* "All jobs loaded" message */}
        {!hasMore && jobs.length > 0 && (
          <div className="p-6 text-center">
            <p className="text-sm text-slate-500">
              {dict?.allJobsLoaded || `All ${totalJobs.toLocaleString()} jobs loaded`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
