import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
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
        <Link
          href={`/${locale}/dashboard/resumes/new`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          {dict.resumes?.createNew || 'Create Resume'}
        </Link>
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
            <ResumeCard key={resume.id} resume={resume} locale={locale} dict={dict} />
          ))}
        </div>
      )}
    </div>
  )
}
