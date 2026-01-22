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
  const dict = getTranslations(locale as Locale, 'common') as any
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
  const resumeIds = resumes?.map(r => r.job_application_id).filter(Boolean) || []
  const jobApplicationsMap = new Map<string, { id: string; job_title: string; company_name: string }>()

  if (resumeIds.length > 0) {
    const { data: jobApps } = await supabase
      .from('job_applications')
      .select('id, job_title, company_name')
      .in('id', resumeIds)

    if (jobApps) {
      for (const job of jobApps) {
        jobApplicationsMap.set(job.id, job)
      }
    }
  }

  // Fetch cover letter IDs per resume
  const { data: coverLetterLinks } = await supabase
    .from('cover_letters')
    .select('id, resume_id')
    .eq('user_id', user.id)
    .not('resume_id', 'is', null)

  // Aggregate cover letter IDs per resume_id
  const coverLetterIdsMap = new Map<string, string[]>()
  if (coverLetterLinks) {
    for (const link of coverLetterLinks) {
      if (link.resume_id) {
        const current = coverLetterIdsMap.get(link.resume_id) || []
        current.push(link.id)
        coverLetterIdsMap.set(link.resume_id, current)
      }
    }
  }

  const resumeList = (resumes as Resume[] | null) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{dict.resumes?.title || 'My Resumes'}</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            {dict.resumes?.subtitle || 'Create and manage your professional resumes'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/dashboard/jobs`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-teal-600 bg-white text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {dict.resumes?.createFromJob || 'Create from Job Description'}
          </Link>
          <Link
            href={`/${locale}/dashboard/resumes/new`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            {dict.resumes?.createNew || 'Create Resume'}
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {resumeList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{dict.resumes?.empty?.title || 'No resumes yet'}</h2>
          <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-6">
            {dict.resumes?.empty?.description || 'Create your first professional resume to start applying for jobs.'}
          </p>
          <Link
            href={`/${locale}/dashboard/resumes/new`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="h-5 w-5" />
            {dict.resumes?.createFirst || 'Create Your First Resume'}
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
              linkedJob={resume.job_application_id ? jobApplicationsMap.get(resume.job_application_id) : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
