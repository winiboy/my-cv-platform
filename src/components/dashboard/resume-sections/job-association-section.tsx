'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Briefcase, Link2, Unlink, Loader2, ExternalLink, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface JobApplicationItem {
  id: string
  company_name: string
  job_title: string
  job_url: string | null
  status: string
  job_description: string | null
}

interface JobAssociationSectionProps {
  resumeId: string
  linkedJob: JobApplicationItem | null
  availableJobs: JobApplicationItem[]
  locale: string
  dict: Record<string, unknown>
  onJobChange: (job: JobApplicationItem | null) => void
  onAdaptToJob?: (jobDescription: string, jobTitle: string, companyName: string) => void
}

/**
 * Section component for the resume editor showing linked job application.
 *
 * Features:
 * - Display currently linked job with company name and job title
 * - Dropdown to select from available saved jobs
 * - Unlink button to remove association
 * - "View Job Details" link to original job URL
 * - "Adapt CV to this Job" quick action button
 */
export function JobAssociationSection({
  resumeId,
  linkedJob,
  availableJobs,
  locale,
  dict,
  onJobChange,
  onAdaptToJob,
}: JobAssociationSectionProps) {
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [isLinking, setIsLinking] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [error, setError] = useState<string>('')

  // Extract association dictionary with safe access
  const associationDict = ((dict.resumes || {}) as Record<string, unknown>).jobAssociation as Record<string, unknown> || {}

  /**
   * Links a job application to this resume by updating both sides of the relationship:
   * - resumes.job_application_id = jobId
   * - job_applications.resume_id = resumeId
   */
  const handleLink = useCallback(async () => {
    if (!selectedJobId) return

    setIsLinking(true)
    setError('')

    try {
      const supabase = createClient()

      // Step 1: Update the resume to link to the job
      const { error: resumeUpdateError } = await supabase
        .from('resumes')
        .update({ job_application_id: selectedJobId })
        .eq('id', resumeId)

      if (resumeUpdateError) {
        console.error('Error linking job to resume:', resumeUpdateError)
        throw resumeUpdateError
      }

      // Step 2: Update the job application to link back to this resume (bidirectional sync)
      const { error: jobUpdateError } = await supabase
        .from('job_applications')
        .update({ resume_id: resumeId })
        .eq('id', selectedJobId)

      if (jobUpdateError) {
        console.error('Error updating job application reverse link:', jobUpdateError)
        // Rollback: revert the resume update
        await supabase
          .from('resumes')
          .update({ job_application_id: null })
          .eq('id', resumeId)
        throw jobUpdateError
      }

      // Find the job in available jobs and notify parent
      const linkedJobData = availableJobs.find((job) => job.id === selectedJobId)
      if (linkedJobData) {
        onJobChange(linkedJobData)
      }

      setSelectedJobId('')
    } catch (err) {
      console.error('Failed to link job:', err)
      setError((associationDict.linkError as string) || 'Failed to link job application')
    } finally {
      setIsLinking(false)
    }
  }, [selectedJobId, resumeId, availableJobs, onJobChange, associationDict.linkError])

  /**
   * Unlinks the job application from this resume by clearing both sides of the relationship:
   * - resumes.job_application_id = null
   * - job_applications.resume_id = null (for the previously linked job)
   */
  const handleUnlink = useCallback(async () => {
    if (!linkedJob) return

    setIsUnlinking(true)
    setError('')

    const previousJobId = linkedJob.id

    try {
      const supabase = createClient()

      // Step 1: Clear the resume's link to the job
      const { error: resumeUpdateError } = await supabase
        .from('resumes')
        .update({ job_application_id: null })
        .eq('id', resumeId)

      if (resumeUpdateError) {
        console.error('Error unlinking job from resume:', resumeUpdateError)
        throw resumeUpdateError
      }

      // Step 2: Clear the job application's link back to this resume (bidirectional sync)
      const { error: jobUpdateError } = await supabase
        .from('job_applications')
        .update({ resume_id: null })
        .eq('id', previousJobId)

      if (jobUpdateError) {
        console.error('Error clearing job application reverse link:', jobUpdateError)
        // Rollback: restore the resume's link
        await supabase
          .from('resumes')
          .update({ job_application_id: previousJobId })
          .eq('id', resumeId)
        throw jobUpdateError
      }

      onJobChange(null)
    } catch (err) {
      console.error('Failed to unlink job:', err)
      setError((associationDict.unlinkError as string) || 'Failed to unlink job application')
    } finally {
      setIsUnlinking(false)
    }
  }, [linkedJob, resumeId, onJobChange, associationDict.unlinkError])

  /**
   * Handles the "Adapt CV to this Job" action
   */
  const handleAdaptToJob = useCallback(() => {
    if (!linkedJob || !onAdaptToJob) return

    onAdaptToJob(
      linkedJob.job_description || '',
      linkedJob.job_title,
      linkedJob.company_name
    )
  }, [linkedJob, onAdaptToJob])

  // Status badge color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'saved':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
      case 'applied':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
      case 'interviewing':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
      case 'offer':
        return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
      case 'rejected':
        return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
      case 'accepted':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
      case 'declined':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
    }
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {(associationDict.linkedJob as string) || 'Linked Job Application'}
          </h3>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Linked Job Display */}
      {linkedJob ? (
        <div className="space-y-3">
          {/* Job Card - Clickable when job URL exists */}
          <div className="relative rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            {linkedJob.job_url ? (
              <a
                href={linkedJob.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block p-4 pr-14 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 group-hover:text-teal-700 dark:text-slate-100 dark:group-hover:text-teal-400">
                    {linkedJob.job_title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {linkedJob.company_name}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(linkedJob.status)}`}>
                      {linkedJob.status.charAt(0).toUpperCase() + linkedJob.status.slice(1)}
                    </span>
                    <ExternalLink className="h-3 w-3 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400" />
                  </div>
                </div>
              </a>
            ) : (
              <div className="p-4 pr-14">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {linkedJob.job_title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {linkedJob.company_name}
                  </p>
                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(linkedJob.status)}`}>
                    {linkedJob.status.charAt(0).toUpperCase() + linkedJob.status.slice(1)}
                  </span>
                </div>
              </div>
            )}
            {/* Unlink button positioned absolutely to avoid click interference */}
            <button
              onClick={handleUnlink}
              disabled={isUnlinking}
              className="absolute right-3 top-3 flex-shrink-0 rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              title={(associationDict.unlink as string) || 'Unlink job'}
            >
              {isUnlinking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            {/* Adapt CV to Job - Primary CTA when job description available */}
            {linkedJob.job_description && onAdaptToJob && (
              <button
                onClick={handleAdaptToJob}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                <Sparkles className="h-4 w-4" />
                {(associationDict.adaptToJob as string) || 'Adapt CV to this Job'}
              </button>
            )}

            {/* No job description warning */}
            {!linkedJob.job_description && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {(associationDict.noJobDescription as string) || 'This job application has no job description. Add one to enable AI adaptation.'}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Empty State */}
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center dark:border-slate-600 dark:bg-slate-800/50">
            <Briefcase className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {(associationDict.noLinkedJob as string) || 'No job application linked to this resume'}
            </p>
          </div>

          {/* Link Existing Job Section */}
          {availableJobs.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  {(associationDict.linkExisting as string) || 'Link to Saved Job'}
                </div>
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  disabled={isLinking}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">
                    {(associationDict.selectJob as string) || 'Select a job application...'}
                  </option>
                  {availableJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.job_title} - {job.company_name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLink}
                  disabled={!selectedJobId || isLinking}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {isLinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  {(associationDict.link as string) || 'Link'}
                </button>
              </div>
            </div>
          )}

          {/* No available jobs message */}
          {availableJobs.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {(associationDict.noAvailableJobs as string) || 'No saved job applications available. Save a job application first to link it to this resume.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* Browse Jobs Link - Only show when no job is linked */}
      {!linkedJob && (
        <Link
          href={`/${locale}/dashboard/jobs`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal-600 px-4 py-2.5 text-sm font-medium text-teal-600 transition-colors hover:bg-teal-50 dark:border-teal-500 dark:text-teal-400 dark:hover:bg-teal-900/20"
        >
          <Briefcase className="h-4 w-4" />
          {(associationDict.browseJobs as string) || 'Browse Job Listings'}
        </Link>
      )}

      {/* Hint Text */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {(associationDict.hint as string) ||
          'Link a job application to quickly adapt your CV using the job description and track your application progress.'}
      </p>
    </div>
  )
}
