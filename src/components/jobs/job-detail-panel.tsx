'use client'

import { MapPin, Briefcase, DollarSign, Calendar, Bookmark, ExternalLink, CheckCircle } from 'lucide-react'
import type { JobListing } from '@/types/jobs'
import type { Locale } from '@/lib/i18n'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface JobDetailPanelProps {
  job: JobListing
  dict: any
  locale: Locale
}

export function JobDetailPanel({ job, dict }: JobDetailPanelProps) {
  const [isSaved, setIsSaved] = useState(job.is_saved || false)
  const [isTracked, setIsTracked] = useState(false)

  const handleSave = () => {
    setIsSaved(!isSaved)
    // TODO: Persist to backend
  }

  const handleTrack = () => {
    setIsTracked(!isTracked)
    // TODO: Persist to backend (create job_application record with status 'saved')
  }

  const handleApply = () => {
    if (job.application_url && job.application_url !== '#') {
      window.open(job.application_url, '_blank')
    }
    // TODO: Track application
  }

  // Parse description into paragraphs
  const descriptionParagraphs = job.description.split('\n\n')

  return (
    <div className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 p-6">
        <h2 className="text-2xl font-bold text-slate-900">{job.title}</h2>
        <p className="mt-2 text-lg text-slate-700">{job.company}</p>

        {/* Meta Information */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            <span>{job.location_full || `${job.location_city}, Switzerland`}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4" />
            <span>{dict?.employmentTypes?.[job.employment_type] || job.employment_type}</span>
          </div>
          {job.salary_range && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" />
              <span>{job.salary_range}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            <span>{new Date(job.posted_date).toLocaleDateString('en-GB')}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={handleApply} className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            {dict?.apply || 'Apply'}
          </Button>

          <Button
            onClick={handleTrack}
            variant={isTracked ? 'default' : 'outline'}
            className="flex items-center gap-2"
          >
            <CheckCircle className={`h-4 w-4 ${isTracked ? 'fill-current' : ''}`} />
            {isTracked ? (dict?.tracked || 'Tracked') : (dict?.track || 'Track')}
          </Button>

          <Button
            onClick={handleSave}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
            {isSaved ? (dict?.saved || 'Saved') : (dict?.save || 'Save')}
          </Button>
        </div>
      </div>

      {/* Job Description */}
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {dict?.jobDescription || 'Job Description'}
          </h3>
          <span className="text-xs text-slate-500">
            {dict?.preview || 'Preview'}
          </span>
        </div>

        <div className="mt-4 space-y-4 text-slate-700 whitespace-pre-wrap">
          {descriptionParagraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        {/* View Full Details CTA */}
        {job.application_url && job.application_url !== '#' && (
          <div className="mt-6 rounded-lg border-2 border-teal-200 bg-teal-50 p-6 text-center">
            <p className="mb-4 text-sm font-medium text-teal-900">
              {dict?.fullDetailsNote || 'The complete job description with all details is available on the employer\'s website.'}
            </p>
            <Button
              onClick={() => window.open(job.application_url, '_blank')}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700"
              size="lg"
            >
              <ExternalLink className="h-5 w-5" />
              {dict?.viewFullDetails || 'View Full Job Details'}
            </Button>
          </div>
        )}

        {/* Requirements Section (if present in description) */}
        {job.requirements && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-slate-900">
              {dict?.requirements || 'Requirements'}
            </h3>
            <div className="mt-4 whitespace-pre-wrap text-slate-700">
              {job.requirements}
            </div>
          </div>
        )}

        {/* Additional Information */}
        <div className="mt-8 rounded-lg bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            {dict?.locationNote || 'This position is located in Switzerland and requires legal authorization to work in Switzerland.'}
          </p>
        </div>
      </div>
    </div>
  )
}
