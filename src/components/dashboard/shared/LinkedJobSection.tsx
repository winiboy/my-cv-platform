'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Briefcase, Plus, ExternalLink, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEntityLinking } from '@/lib/hooks/useEntityLinking'
import { JobAssociationSelector } from '../job-association-selector'

/**
 * Job application data structure for display and selection
 */
interface JobApplicationData {
  id: string
  company_name: string
  job_title: string
  job_url: string | null
}

/**
 * Props for the LinkedJobSection component
 */
export interface LinkedJobSectionProps {
  /** Type of entity being linked: 'resume' or 'coverLetter' */
  entityType: 'resume' | 'coverLetter'
  /** ID of the entity (resume or cover letter) */
  entityId: string
  /** Current locale for i18n routing */
  locale: string
  /** Dictionary containing i18n translations */
  dict: Record<string, unknown>
}

/**
 * Shared component for linking/unlinking job applications to resumes or cover letters.
 *
 * This component provides a unified UI for the "Linked Job" section that is used
 * in both the Resume and Cover Letter editors. It uses the centralized
 * useEntityLinking hook for all linking operations, ensuring consistent
 * bidirectional sync between entities.
 *
 * Features:
 * - Dropdown selector to choose from saved job applications
 * - Display of currently linked job (title + company)
 * - View Job Listing external link (when job has URL)
 * - Browse Jobs navigation button
 * - Loading overlay during operations
 * - Empty, linked, and loading states
 */
export function LinkedJobSection({
  entityType,
  entityId,
  locale,
  dict,
}: LinkedJobSectionProps) {
  // Use the centralized entity linking hook
  const {
    linkedJob,
    linkJob,
    unlinkJob,
    isLoading: hookLoading,
    error: hookError,
  } = useEntityLinking({ entityType, entityId })

  // Local state for job applications list and UI operations
  const [jobApplications, setJobApplications] = useState<JobApplicationData[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  // Extract i18n strings from dict
  const commonDict = (dict.common || {}) as Record<string, string>
  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const jobAssociationDict = (coverLettersDict.jobAssociation || {}) as Record<string, string>

  /**
   * Fetch available job applications for the dropdown selector.
   * Filters to non-archived jobs and orders by most recently updated.
   */
  useEffect(() => {
    const fetchJobApplications = async () => {
      setIsLoadingJobs(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('job_applications')
          .select('id, company_name, job_title, job_url')
          .or('is_archived.eq.false,is_archived.is.null')
          .order('updated_at', { ascending: false })

        if (error) {
          console.error('Error fetching job applications:', error)
          return
        }

        setJobApplications(
          (data || []).map((j) => ({
            id: j.id,
            company_name: j.company_name,
            job_title: j.job_title,
            job_url: j.job_url,
          }))
        )
      } catch (err) {
        console.error('Unexpected error fetching job applications:', err)
      } finally {
        setIsLoadingJobs(false)
      }
    }

    fetchJobApplications()
  }, [])

  /**
   * Handles job selection changes from the dropdown.
   * Links or unlinks the job based on the selection.
   */
  const handleJobApplicationChange = useCallback(
    async (jobApplicationId: string | null) => {
      setIsUpdating(true)
      try {
        if (jobApplicationId) {
          await linkJob(jobApplicationId)
        } else {
          await unlinkJob()
        }
      } finally {
        setIsUpdating(false)
      }
    },
    [linkJob, unlinkJob]
  )

  // Derive current job application data for display
  const currentJobApplication = linkedJob
    ? {
        id: linkedJob.id,
        company_name: linkedJob.company_name,
        job_title: linkedJob.job_title,
        job_url: jobApplications.find((j) => j.id === linkedJob.id)?.job_url || null,
      }
    : null

  const currentJobApplicationId = linkedJob?.id || null

  // Combined loading state
  const isLoading = hookLoading || isLoadingJobs

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
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{commonDict.loading || 'Loading...'}</span>
          </div>
        ) : currentJobApplication ? (
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

      {/* Error Display */}
      {hookError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{hookError}</p>
        </div>
      )}

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
          disabled={isUpdating || isLoading}
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
