import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTranslations, toLocale } from '@/lib/i18n'
import { ResumeCreationForm } from '@/components/dashboard/resume-creation-form'

interface NewResumePageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function NewResumePage({ params }: NewResumePageProps) {
  const locale = toLocale((await params).locale)
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {dict.resumes?.new?.title || 'Create New Resume'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {dict.resumes?.new?.subtitle || 'Choose a template and get started'}
        </p>
      </div>

      <ResumeCreationForm locale={locale} userId={user.id} dict={dict} />
    </div>
  )
}
