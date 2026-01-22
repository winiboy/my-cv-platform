import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Briefcase, Search } from 'lucide-react'
import { JobApplicationCard } from '@/components/dashboard/job-application-card'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { JobApplicationWithRelations, JobStatus } from '@/types/database'

/**
 * Valid status filter values for job applications
 * 'all' shows all applications, other values filter by specific status
 */
type StatusFilter = 'all' | JobStatus

/**
 * All available status options for the filter tabs
 * Order reflects typical job application workflow progression
 */
const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'saved',
  'applied',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'declined',
]

interface JobApplicationsPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function JobApplicationsPage({
  params,
  searchParams,
}: JobApplicationsPageProps) {
  const { locale } = await params
  const { status: statusParam } = await searchParams
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

  // Validate and normalize status filter from URL params
  const activeStatus: StatusFilter = STATUS_FILTERS.includes(statusParam as StatusFilter)
    ? (statusParam as StatusFilter)
    : 'all'

  // Fetch all applications to calculate status counts and filter
  const { data: allJobApplications, error } = await supabase
    .from('job_applications')
    .select('*, resume:resumes(id, title, template), cover_letter:cover_letters(id, title, company_name)')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching job applications:', error)
  }

  const allApplications = (allJobApplications as JobApplicationWithRelations[] | null) || []

  // Calculate counts for each status
  const statusCounts: Record<StatusFilter, number> = {
    all: allApplications.length,
    saved: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    accepted: 0,
    rejected: 0,
    declined: 0,
  }

  for (const app of allApplications) {
    const status = app.status as JobStatus
    if (status in statusCounts) {
      statusCounts[status]++
    }
  }

  // Filter applications based on active status
  const applicationsList = activeStatus === 'all'
    ? allApplications
    : allApplications.filter((app) => app.status === activeStatus)

  // Extract translations with fallbacks
  const jobApplicationsDict = (dict.jobApplications || {}) as Record<string, unknown>
  const emptyDict = (jobApplicationsDict.empty || {}) as Record<string, unknown>
  const statusesDict = (jobsDict.statuses || {}) as Record<string, string>

  /**
   * Get translated label for a status filter
   * Falls back to capitalized status name if no translation exists
   */
  const getStatusLabel = (status: StatusFilter): string => {
    if (status === 'all') {
      return (jobApplicationsDict.filterAll as string) || 'All'
    }
    return statusesDict[status] || status.charAt(0).toUpperCase() + status.slice(1)
  }

  /**
   * Build URL for status filter navigation
   * Preserves locale and only adds status param when not 'all'
   */
  const getFilterUrl = (status: StatusFilter): string => {
    if (status === 'all') {
      return `/${locale}/dashboard/job-applications`
    }
    return `/${locale}/dashboard/job-applications?status=${status}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {(jobApplicationsDict.title as string) || 'My Job Applications'}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            {(jobApplicationsDict.subtitle as string) || 'Track and manage your job applications'}
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/jobs`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          <Search className="h-4 w-4" />
          {(jobApplicationsDict.browseJobs as string) || 'Browse Jobs'}
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-4">
        {STATUS_FILTERS.map((status) => {
          const isActive = status === activeStatus
          const count = statusCounts[status]
          return (
            <Link
              key={status}
              href={getFilterUrl(status)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {getStatusLabel(status)}
              <span className={`ml-1.5 ${isActive ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'}`}>
                ({count})
              </span>
            </Link>
          )
        })}
      </div>

      {/* Empty state */}
      {applicationsList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <Briefcase className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {activeStatus === 'all'
              ? (emptyDict.title as string) || 'No job applications yet'
              : (emptyDict.noMatchingStatus as string) || `No ${getStatusLabel(activeStatus).toLowerCase()} applications`}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-6">
            {activeStatus === 'all'
              ? (emptyDict.description as string) ||
                'Start tracking your job search by saving jobs you are interested in.'
              : (emptyDict.tryDifferentFilter as string) ||
                'Try selecting a different filter or browse jobs to add new applications.'}
          </p>
          <Link
            href={`/${locale}/dashboard/jobs`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
          >
            <Search className="h-5 w-5" />
            {(emptyDict.browseJobsCta as string) || 'Browse Job Listings'}
          </Link>
        </div>
      )}

      {/* Job applications grid */}
      {applicationsList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {applicationsList.map((jobApplication) => (
            <JobApplicationCard
              key={jobApplication.id}
              jobApplication={jobApplication}
              locale={locale}
              dict={{ ...dict, jobs: jobsDict }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
