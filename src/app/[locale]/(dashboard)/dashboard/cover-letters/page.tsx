import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import { CoverLetterCard } from '@/components/dashboard/cover-letter-card'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { CoverLetterWithResume } from '@/types/database'

export default async function CoverLettersPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const dict = getTranslations(locale as Locale, 'common') as Record<string, unknown>
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch user's cover letters with linked resume info
  const { data: coverLetters, error } = await supabase
    .from('cover_letters')
    .select('*, resume:resumes(id, title)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching cover letters:', error)
  }

  // Fetch linked job applications separately (to avoid schema cache issues)
  const jobAppIds = coverLetters?.map(cl => cl.job_application_id).filter(Boolean) || []
  const jobApplicationsMap = new Map<string, { id: string; job_title: string; company_name: string }>()

  if (jobAppIds.length > 0) {
    const { data: jobApps } = await supabase
      .from('job_applications')
      .select('id, job_title, company_name')
      .in('id', jobAppIds)

    if (jobApps) {
      for (const job of jobApps) {
        jobApplicationsMap.set(job.id, job)
      }
    }
  }

  const coverLetterList = (coverLetters as CoverLetterWithResume[] | null) || []
  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const emptyDict = (coverLettersDict.empty || {}) as Record<string, unknown>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {(coverLettersDict.title as string) || 'Cover Letters'}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            {(coverLettersDict.subtitle as string) || 'Create and manage your cover letters'}
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/cover-letters/new`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          {(coverLettersDict.createNew as string) || 'Create Cover Letter'}
        </Link>
      </div>

      {/* Empty state */}
      {coverLetterList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {(emptyDict.title as string) || 'No cover letters yet'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-6">
            {(emptyDict.description as string) ||
              'Create your first cover letter to accompany your job applications.'}
          </p>
          <Link
            href={`/${locale}/dashboard/cover-letters/new`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="h-5 w-5" />
            {(emptyDict.createFirst as string) || 'Create Your First Cover Letter'}
          </Link>
        </div>
      )}

      {/* Cover letters grid */}
      {coverLetterList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {coverLetterList.map((coverLetter) => (
            <CoverLetterCard
              key={coverLetter.id}
              coverLetter={coverLetter}
              locale={locale}
              dict={dict}
              linkedResumeName={coverLetter.resume?.title}
              linkedResumeId={coverLetter.resume?.id}
              linkedJob={coverLetter.job_application_id ? jobApplicationsMap.get(coverLetter.job_application_id) : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
