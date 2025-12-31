import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Locale } from '@/lib/i18n'
import { getTranslations } from '@/lib/i18n'
import { ResumePreviewPageClient } from '@/components/dashboard/resume-preview-page-client'
import type { Resume } from '@/types/database'

interface PageProps {
  params: Promise<{
    locale: Locale
    id: string
  }>
}

export default async function ResumePreviewPage({ params }: PageProps) {
  const { locale, id } = await params
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
    redirect(`/${locale}/dashboard/resumes`)
  }

  const dict = getTranslations(locale, 'common') as any

  return <ResumePreviewPageClient resume={resume as Resume} locale={locale} dict={dict} />
}
