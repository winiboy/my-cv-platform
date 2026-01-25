import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus, Sparkles } from 'lucide-react'
import { ResumeCard } from '@/components/dashboard/resume-card'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { Resume } from '@/types/database'

export default async function ResumesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const dict = getTranslations(locale as Locale, 'common') as Record<string, unknown>
  const resumesDict = (dict.resumes || {}) as Record<string, unknown>
  const emptyDict = (resumesDict.empty || {}) as Record<string, string>
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch user's resumes
  const { data: resumes, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching resumes:', error)
  }

  // Fetch linked job applications separately (to avoid schema cache issues)
  // Filter out null values and cast to string[] for TypeScript
  const directJobApplicationIds = (resumes?.map(r => r.job_application_id).filter((id): id is string => id !== null) || [])
  const jobApplicationsMap = new Map<string, { id: string; job_title: string; company_name: string }>()

  if (directJobApplicationIds.length > 0) {
    const { data: jobApps } = await supabase
      .from('job_applications')
      .select('id, job_title, company_name')
      .in('id', directJobApplicationIds)

    if (jobApps) {
      for (const job of jobApps) {
        jobApplicationsMap.set(job.id, job)
      }
    }
  }

  // Fetch cover letter IDs per resume (including job_application_id for transitive linking)
  const { data: coverLetterLinks } = await supabase
    .from('cover_letters')
    .select('id, resume_id, job_application_id')
    .eq('user_id', user.id)
    .not('resume_id', 'is', null)

  // Aggregate cover letter IDs per resume_id
  const coverLetterIdsMap = new Map<string, string[]>()
  // Map resume_id -> job_application_id (indirect link via cover letter)
  const indirectJobIdMap = new Map<string, string>()

  if (coverLetterLinks) {
    for (const link of coverLetterLinks) {
      if (link.resume_id) {
        // Collect cover letter IDs for the resume
        const current = coverLetterIdsMap.get(link.resume_id) || []
        current.push(link.id)
        coverLetterIdsMap.set(link.resume_id, current)

        // Track indirect job application link (cover letter -> job application)
        // Only set if this resume doesn't already have an indirect link
        if (link.job_application_id && !indirectJobIdMap.has(link.resume_id)) {
          indirectJobIdMap.set(link.resume_id, link.job_application_id)
        }
      }
    }
  }

  // Fetch indirect job applications (from cover letters) that aren't already in the map
  const indirectJobIds = Array.from(indirectJobIdMap.values()).filter(
    id => !jobApplicationsMap.has(id)
  )

  if (indirectJobIds.length > 0) {
    const { data: indirectJobApps } = await supabase
      .from('job_applications')
      .select('id, job_title, company_name')
      .in('id', indirectJobIds)

    if (indirectJobApps) {
      for (const job of indirectJobApps) {
        jobApplicationsMap.set(job.id, job)
      }
    }
  }

  const resumeList = (resumes as Resume[] | null) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{(resumesDict.title as string) || 'My Resumes'}</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            {(resumesDict.subtitle as string) || 'Create and manage your professional resumes'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/dashboard/jobs`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-teal-600 bg-white text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {(resumesDict.createFromJob as string) || 'Create from Job Description'}
          </Link>
          <Link
            href={`/${locale}/dashboard/resumes/new`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            {(resumesDict.createNew as string) || 'Create Resume'}
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {resumeList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{emptyDict.title || 'No resumes yet'}</h2>
          <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-6">
            {emptyDict.description || 'Create your first professional resume to start applying for jobs.'}
          </p>
          <Link
            href={`/${locale}/dashboard/resumes/new`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="h-5 w-5" />
            {(resumesDict.createFirst as string) || 'Create Your First Resume'}
          </Link>
        </div>
      )}

      {/* Resume grid */}
      {resumeList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resumeList.map((resume) => (
            <ResumeCard
              key={resume.id}
              resume={resume}
              locale={locale}
              dict={dict}
              linkedCoverLetterIds={coverLetterIdsMap.get(resume.id)}
              linkedJob={
                // Direct association takes priority
                resume.job_application_id
                  ? jobApplicationsMap.get(resume.job_application_id)
                  // Indirect association via cover letter
                  : indirectJobIdMap.has(resume.id)
                    ? jobApplicationsMap.get(indirectJobIdMap.get(resume.id)!)
                    : null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
