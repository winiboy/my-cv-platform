'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Briefcase, Plus, ExternalLink, Loader2 } from 'lucide-react'
import { JobAssociationSelector } from '../job-association-selector'

interface JobApplicationData {
  id: string
  company_name: string
  job_title: string
  job_url: string | null
}

interface JobAssociationSectionProps {
  currentJobApplicationId: string | null
  currentJobApplication: JobApplicationData | null
  jobApplications: JobApplicationData[]
  locale: string
  dict: Record<string, unknown>
  onJobApplicationChange: (jobApplicationId: string | null) => Promise<void>
}

/**
 * Section component for the cover letter editor sidebar that allows
 * users to link/unlink a job application to the current cover letter.
 *
 * Features:
 * - Dropdown to select a saved job application
 * - View linked job application details
 * - Link to original job URL
 * - Hint text explaining the benefit of linking jobs
 */
export function JobAssociationSection({
  currentJobApplicationId,
  currentJobApplication,
  jobApplications,
  locale,
  dict,
  onJobApplicationChange,
}: JobAssociationSectionProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const jobAssociationDict = (coverLettersDict.jobAssociation || {}) as Record<string, string>

  const handleJobApplicationChange = async (jobApplicationId: string | null) => {
    setIsUpdating(true)
    try {
      await onJobApplicationChange(jobApplicationId)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Briefcase className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {jobAssociationDict.linkedJob || 'Linked Job'}
        </h3>
      </div>

      {/* Current Selection Display */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        {currentJobApplication ? (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {currentJobApplication.job_title}
                </p>
                <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                  {currentJobApplication.company_name}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {jobAssociationDict.noJobLinked || 'No job linked'}
          </span>
        )}
      </div>

      {/* Job Application Selector Dropdown */}
      <div className="relative">
        {isUpdating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 dark:bg-slate-800/50">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
          </div>
        )}
        <JobAssociationSelector
          currentJobApplicationId={currentJobApplicationId}
          jobApplications={jobApplications}
          onChange={handleJobApplicationChange}
          locale={locale}
          dict={dict}
          disabled={isUpdating}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {currentJobApplicationId && currentJobApplication?.job_url && (
          <a
            href={currentJobApplication.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {jobAssociationDict.viewJobListing || 'View Job Listing'}
          </a>
        )}
        <Link
          href={`/${locale}/dashboard/jobs`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {jobAssociationDict.browseJobs || 'Browse Jobs'}
        </Link>
      </div>

      {/* Hint Text */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {jobAssociationDict.hint ||
          'Link a job to track which position this cover letter is for and use the job description for AI generation.'}
      </p>
    </div>
  )
}
