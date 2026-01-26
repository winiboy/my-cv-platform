import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  DollarSign,
  Calendar,
  ExternalLink,
} from 'lucide-react'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { JobApplicationWithRelations, JobStatus } from '@/types/database'
import { JobApplicationStatusChanger } from '@/components/dashboard/job-application-status-changer'
import { JobApplicationDeleteButton } from '@/components/dashboard/job-application-delete-button'
import { LinkedCVSection, CoverLettersSection } from '@/components/dashboard/shared'
import { JOB_STATUS_CONFIG } from '@/lib/constants/job-statuses'
import { cn } from '@/lib/utils'

interface JobApplicationDetailPageProps {
  params: { locale: string; id: string }
}

export default async function JobApplicationDetailPage({
  params,
}: JobApplicationDetailPageProps) {
  const { locale, id } = params
  const dict = getTranslations(locale as Locale, 'common') as Record<string, unknown>
  const jobsDict = getTranslations(locale as Locale, 'jobs') as Record<string, unknown>
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch the job application with linked entities
  const { data: jobApplication, error } = await supabase
    .from('job_applications')
    .select('*, resume:resumes!job_applications_resume_id_fkey(id, title, template), cover_letter:cover_letters!job_applications_cover_letter_id_fkey(id, title, company_name)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !jobApplication) {
    notFound()
  }

  console.log('[JobApplicationDetailPage] Fetched job application:', { id, jobApplication })

  const job = jobApplication as JobApplicationWithRelations

  // Extract translations with fallbacks
  const jobApplicationsDict = (dict.jobApplications || {}) as Record<string, unknown>
  const detailDict = (jobApplicationsDict.detail || {}) as Record<string, unknown>
  const statusesDict = (jobsDict.statuses || {}) as Record<string, string>

  /**
   * Get translated status label with fallback to English
   */
  const getStatusLabel = (status: JobStatus): string => {
    return statusesDict[status] || JOB_STATUS_CONFIG[status].label
  }

  /**
   * Format date for display using locale
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  const currentStatusConfig = JOB_STATUS_CONFIG[job.status]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href={`/${locale}/dashboard/job-applications`}
        className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {(detailDict.backToList as string) || 'Back to Job Applications'}
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-1">{job.job_title}</h1>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                {job.company_name}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <div
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded self-start',
              currentStatusConfig.bgColor,
              currentStatusConfig.textColor
            )}
          >
            {getStatusLabel(job.status)}
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-500 dark:text-slate-400">
          {job.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {job.location}
            </span>
          )}
          {job.salary_range && (
            <span className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" />
              {job.salary_range}
            </span>
          )}
          {job.applied_date && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {(jobsDict.appliedOn as string) || 'Applied'} {formatDate(job.applied_date)}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <JobApplicationStatusChanger
            jobApplicationId={job.id}
            currentStatus={job.status}
            dict={{ ...dict, jobs: jobsDict }}
          />

          {job.job_url && (
            <a
              href={job.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              {(detailDict.viewJobPosting as string) || 'View Original Posting'}
            </a>
          )}

          <JobApplicationDeleteButton
            jobApplicationId={job.id}
            locale={locale}
            dict={{ ...dict, jobs: jobsDict }}
          />
        </div>
      </div>

      {/* Linked Entities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Linked Resume */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <LinkedCVSection
            entityType="jobApplication"
            entityId={job.id}
            locale={locale}
            dict={dict}
          />
        </div>

        {/* Linked Cover Letter */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <CoverLettersSection
            entityType="jobApplication"
            entityId={job.id}
            locale={locale}
            dict={dict}
          />
        </div>
      </div>

      {/* Job Description */}
      {job.job_description && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <h2 className="font-semibold mb-4">
            {(jobsDict.jobDescription as string) || 'Job Description'}
          </h2>
          <div className="prose dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">
              {job.job_description}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {job.notes && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <h2 className="font-semibold mb-4">
            {(detailDict.notes as string) || 'Notes'}
          </h2>
          <div className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">
            {job.notes}
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <h2 className="font-semibold mb-4">
          {(detailDict.timeline as string) || 'Timeline'}
        </h2>
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <p>
            <span className="font-medium">{(detailDict.created as string) || 'Created'}:</span>{' '}
            {formatDate(job.created_at)}
          </p>
          <p>
            <span className="font-medium">{(detailDict.lastUpdated as string) || 'Last Updated'}:</span>{' '}
            {formatDate(job.updated_at)}
          </p>
          {job.deadline && (
            <p>
              <span className="font-medium">{(detailDict.deadline as string) || 'Deadline'}:</span>{' '}
              {formatDate(job.deadline)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
