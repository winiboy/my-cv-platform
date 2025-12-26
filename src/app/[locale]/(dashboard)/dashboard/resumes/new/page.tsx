import { CreateResumeForm } from '@/components/dashboard/create-resume-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getTranslations, type Locale } from '@/lib/i18n'

export default async function NewResumePage({
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href={`/${locale}/dashboard/resumes`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {dict.common?.back || 'Back'} {dict.resumes?.title || 'My Resumes'}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{dict.resumes?.new?.title || 'Create New Resume'}</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          {dict.resumes?.new?.subtitle || 'Choose a template and get started'}
        </p>
      </div>

      {/* Form */}
      <CreateResumeForm locale={locale} dict={dict} />
    </div>
  )
}
