import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Briefcase, Search } from 'lucide-react'
import { JobApplicationsClientWrapper } from '@/components/dashboard/job-applications'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { JobApplicationWithRelations } from '@/types/database'

interface JobApplicationsPageProps {
  params: { locale: string }
}

export default async function JobApplicationsPage({
  params,
}: JobApplicationsPageProps) {
  const { locale } = params
  const dict = getTranslations(locale as Locale, 'common') as Record<string, unknown>
  const jobsDict = getTranslations(locale as Locale, 'jobs') as Record<string, unknown>
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log('[JobApplicationsPage] User:', user?.id ?? 'NOT AUTHENTICATED')

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch all applications (filtering is now handled client-side)
  // Include records where is_archived is false OR null (null = not yet set)
  const { data: allJobApplications, error } = await supabase
    .from('job_applications')
    .select('*, resume:resumes!job_applications_resume_id_fkey(id, title, template), cover_letter:cover_letters!job_applications_cover_letter_id_fkey(id, title, company_name)')
    .eq('user_id', user.id)
    .or('is_archived.eq.false,is_archived.is.null')
    .order('updated_at', { ascending: false })

  console.log('[JobApplicationsPage] Query result - data:', allJobApplications?.length ?? 'null', 'error:', error)

  if (error) {
    console.error('Error fetching job applications:', error)
  }

  const allApplications = (allJobApplications as JobApplicationWithRelations[] | null) || []

  console.log('[JobApplicationsPage] Rendering with allApplications.length:', allApplications.length)

  // Extract translations with fallbacks
  const jobApplicationsDict = (dict.jobApplications || {}) as Record<string, unknown>
  const emptyDict = (jobApplicationsDict.empty || {}) as Record<string, unknown>

  return (
    <JobApplicationsClientWrapper
      applications={allApplications}
      locale={locale}
      dict={{ ...dict, jobs: jobsDict }}
      emptyState={
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <Briefcase className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {(emptyDict.title as string) || 'No job applications yet'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-6">
            {(emptyDict.description as string) ||
              'Start tracking your job search by saving jobs you are interested in.'}
          </p>
          <Link
            href={`/${locale}/dashboard/jobs`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
          >
            <Search className="h-5 w-5" />
            {(emptyDict.browseJobsCta as string) || 'Browse Job Listings'}
          </Link>
        </div>
      }
    />
  )
}
