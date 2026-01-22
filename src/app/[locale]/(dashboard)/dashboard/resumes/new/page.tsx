import { CreateResumeForm } from '@/components/dashboard/create-resume-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowLeft, Briefcase } from 'lucide-react'
import Link from 'next/link'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { JobApplication } from '@/types/database'

interface NewResumePageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ jobApplicationId?: string }>
}

export default async function NewResumePage({
  params,
  searchParams,
}: NewResumePageProps) {
  const { locale } = await params
  const { jobApplicationId } = await searchParams
  const dict = getTranslations(locale as Locale, 'common') as Record<string, unknown>
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch job application if jobApplicationId is provided
  let jobApplication: JobApplication | null = null
  if (jobApplicationId) {
    const { data } = await supabase
      .from('job_applications')
      .select('*')
      .eq('id', jobApplicationId)
      .eq('user_id', user.id)
      .single()

    jobApplication = data
  }

  const resumesDict = (dict.resumes || {}) as Record<string, unknown>
  const newDict = (resumesDict.new || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href={`/${locale}/dashboard/resumes`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {(commonDict.back as string) || 'Back'} {(resumesDict.title as string) || 'My Resumes'}
      </Link>

      {/* Job Application Banner */}
      {jobApplication && (
        <div className="flex items-start gap-3 p-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg">
          <Briefcase className="h-5 w-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
              {(newDict.creatingForJob as string) || 'Creating CV for job application'}
            </p>
            <p className="text-sm text-teal-700 dark:text-teal-300">
              {jobApplication.job_title} {(commonDict.at as string) || 'at'} {jobApplication.company_name}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {(newDict.title as string) || 'Create New Resume'}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          {(newDict.subtitle as string) || 'Choose a template and get started'}
        </p>
      </div>

      {/* Form */}
      <CreateResumeForm locale={locale} dict={dict} jobApplication={jobApplication} />
    </div>
  )
}
