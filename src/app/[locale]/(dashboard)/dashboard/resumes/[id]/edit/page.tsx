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

  // Fetch linked cover letters for this resume
  const { data: linkedCoverLetters } = await supabase
    .from('cover_letters')
    .select('id, title, company_name, job_title')
    .eq('resume_id', id)
    .order('updated_at', { ascending: false })

  // Fetch unlinked cover letters (available for association)
  const { data: unlinkedCoverLetters } = await supabase
    .from('cover_letters')
    .select('id, title, company_name')
    .eq('user_id', user.id)
    .is('resume_id', null)
    .order('updated_at', { ascending: false })

  // Fetch linked job application (if any)
  let linkedJob = null
  if (resume.job_application_id) {
    const { data: jobData } = await supabase
      .from('job_applications')
      .select('id, company_name, job_title, job_url, status, job_description')
      .eq('id', resume.job_application_id)
      .single()

    linkedJob = jobData
  }

  // Fetch available jobs for association (not linked to this resume)
  const { data: availableJobsData } = await supabase
    .from('job_applications')
    .select('id, company_name, job_title, job_url, status, job_description')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .neq('id', resume.job_application_id || '')
    .order('updated_at', { ascending: false })
    .limit(50)

  // Get translations
  const dict = getTranslations(locale as Locale, 'common')

  return (
    <ResumeEditor
      resume={resume as Resume}
      locale={locale as Locale}
      dict={dict}
      linkedCoverLetters={linkedCoverLetters || []}
      unlinkedCoverLetters={unlinkedCoverLetters || []}
      linkedJob={linkedJob}
      availableJobs={availableJobsData || []}
    />
  )
}
