import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTranslations } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import type { Resume } from '@/types/database'
import { ResumeEditor } from '@/components/dashboard/resume-editor'

interface ResumeEditPageProps {
  params: Promise<{
    locale: Locale
    id: string
  }>
}

export default async function ResumeEditPage({ params }: ResumeEditPageProps) {
  const { locale, id } = await params
  const dict = getTranslations(locale, 'common') as any
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

  return <ResumeEditor resume={resume as Resume} locale={locale} dict={dict} />
}
