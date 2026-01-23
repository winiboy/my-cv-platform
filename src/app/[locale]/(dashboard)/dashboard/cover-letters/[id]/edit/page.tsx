import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { CoverLetterEditor } from '@/components/dashboard/cover-letter-editor'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { CoverLetter, Resume, JobApplication } from '@/types/database'

interface JobApplicationData {
  id: string
  company_name: string
  job_title: string
  job_url: string | null
  job_description: string | null
}

export default async function EditCoverLetterPage({
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

  // Fetch the cover letter
  const { data: coverLetter, error } = await supabase
    .from('cover_letters')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !coverLetter) {
    notFound()
  }

  // Fetch user's resumes for linking/generation
  const { data: resumes } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  // Fetch user's job applications for linking (including job_description for generation)
  const { data: jobApplications } = await supabase
    .from('job_applications')
    .select('id, company_name, job_title, job_url, job_description, status')
    .eq('user_id', user.id)
    .or('is_archived.eq.false,is_archived.is.null')
    .order('updated_at', { ascending: false })

  // Fetch the linked job application if exists
  let currentJobApplication: JobApplicationData | null = null
  if (coverLetter.job_application_id) {
    const linkedJob = (jobApplications as JobApplication[] | null)?.find(
      (j) => j.id === coverLetter.job_application_id
    )
    if (linkedJob) {
      currentJobApplication = {
        id: linkedJob.id,
        company_name: linkedJob.company_name,
        job_title: linkedJob.job_title,
        job_url: linkedJob.job_url,
        job_description: linkedJob.job_description,
      }
    }
  }

  // Transform job applications to the format needed by the editor
  const jobApplicationsData: JobApplicationData[] = (jobApplications || []).map((j) => ({
    id: j.id,
    company_name: j.company_name,
    job_title: j.job_title,
    job_url: j.job_url,
    job_description: j.job_description,
  }))

  // Get translations
  const dict = getTranslations(locale as Locale, 'common')

  return (
    <CoverLetterEditor
      coverLetter={coverLetter as CoverLetter}
      resumes={(resumes as Resume[]) || []}
      jobApplications={jobApplicationsData}
      currentJobApplication={currentJobApplication}
      locale={locale as Locale}
      dict={dict}
    />
  )
}
