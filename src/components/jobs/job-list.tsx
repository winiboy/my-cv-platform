'use client'

import type { JobListing } from '@/types/jobs'
import { JobCard } from './job-card'

interface JobListProps {
  jobs: JobListing[]
  selectedJobId: string | null
  onSelectJob: (jobId: string) => void
  dict: any
}

export function JobList({ jobs, selectedJobId, onSelectJob, dict }: JobListProps) {
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
      </div>
    </div>
  )
}
