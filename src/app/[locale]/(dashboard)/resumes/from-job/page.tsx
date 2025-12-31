import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTranslations } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { JobDescriptionForm } from '@/components/dashboard/job-description-form'

interface FromJobPageProps {
  params: Promise<{
    locale: Locale
  }>
}

export default async function FromJobPage({ params }: FromJobPageProps) {
  const { locale } = await params
  const dict = getTranslations(locale, 'common') as any
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back button */}
      <Link
        href={`/${locale}/dashboard/resumes`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {dict.resumes?.fromJob?.backToResumes || 'Back to My Resumes'}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {dict.resumes?.fromJob?.title || 'Create CV from Job Description'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {dict.resumes?.fromJob?.subtitle ||
            'Paste a job description and let AI create a tailored CV for you'}
        </p>
      </div>

      {/* Form */}
      <JobDescriptionForm locale={locale} dict={dict} userId={user.id} />
    </div>
  )
}
