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
  let currentJobApplication = null
  if (resume.job_application_id) {
    const { data: jobData } = await supabase
      .from('job_applications')
      .select('id, company_name, job_title, job_url')
      .eq('id', resume.job_application_id)
      .single()

    currentJobApplication = jobData
  }

  // Fetch all user's job applications for the selector dropdown
  const { data: jobApplicationsData } = await supabase
    .from('job_applications')
    .select('id, company_name, job_title, job_url')
    .eq('user_id', user.id)
    .or('is_archived.eq.false,is_archived.is.null')
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
      currentJobApplicationId={resume.job_application_id || null}
      currentJobApplication={currentJobApplication}
      jobApplications={jobApplicationsData || []}
    />
  )
}
