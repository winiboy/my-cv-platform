'use client'

import { MapPin, Briefcase, Bookmark } from 'lucide-react'
import type { JobListing } from '@/types/jobs'
import { useState } from 'react'

interface JobCardProps {
  job: JobListing
  isSelected: boolean
  onClick: () => void
  dict: any
}

export function JobCard({ job, isSelected, onClick, dict }: JobCardProps) {
  const [isSaved, setIsSaved] = useState(job.is_saved || false)

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsSaved(!isSaved)
    // TODO: Persist to backend
  }

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer p-4 transition-colors hover:bg-slate-50 ${
        isSelected ? 'bg-teal-50 border-l-4 border-l-teal-500' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Job Title */}
          <h3 className="font-semibold text-slate-900 truncate">
            {job.title}
          </h3>

          {/* Company */}
          <p className="mt-1 text-sm text-slate-700">
            {job.company}
          </p>

          {/* Location & Type */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span>{job.location_city}, CH</span>
            </div>
            <div className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              <span>{dict?.employmentTypes?.[job.employment_type] || job.employment_type}</span>
            </div>
          </div>

          {/* Posted Date */}
          <p className="mt-2 text-xs text-slate-500">
            {dict?.postedOn || 'Posted on'} {new Date(job.posted_date).toLocaleDateString('en-GB')}
          </p>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveClick}
          className={`flex-shrink-0 rounded-lg p-2 transition-colors ${
            isSaved
              ? 'bg-teal-100 text-teal-600 hover:bg-teal-200'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          }`}
          title={isSaved ? dict?.unsave || 'Unsave' : dict?.save || 'Save'}
        >
          <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
        </button>
      </div>
    </div>
  )
}
