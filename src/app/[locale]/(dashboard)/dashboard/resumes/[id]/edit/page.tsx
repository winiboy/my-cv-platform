import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ResumeEditor } from '@/components/dashboard/resume-editor'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { Resume } from '@/types/database'

export default async function EditResumePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch the resume
  const { data: resume, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !resume) {
    notFound()
  }

  // Get translations
  const dict = getTranslations(locale as Locale, 'common')

  return <ResumeEditor resume={resume as Resume} locale={locale as Locale} dict={dict} />
}
