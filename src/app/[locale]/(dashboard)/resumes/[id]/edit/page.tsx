import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTranslations, toLocale } from '@/lib/i18n'
import { cvAdaptationStrings } from '@/lib/cv-adaptation-strings'
import type { Resume } from '@/types/database'
import { ResumeEditor } from '@/components/dashboard/resume-editor'

interface ResumeEditPageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

export default async function ResumeEditPage({ params }: ResumeEditPageProps) {
  const { locale: routeLocale, id } = await params
  const locale = toLocale(routeLocale)
  const dict = getTranslations(locale, 'common') as any
  const cvAdaptation = cvAdaptationStrings(getTranslations(locale, 'jobs'))
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch resume
  const { data: resume, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !resume) {
    notFound()
  }

  return <ResumeEditor resume={resume as Resume} locale={locale} dict={dict} cvAdaptation={cvAdaptation} />
}
