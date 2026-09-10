import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTranslations } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import type { Resume } from '@/types/database'
import { ResumePreviewWrapper } from '@/components/dashboard/resume-preview-wrapper'
import { DownloadResumeButtons } from '@/components/dashboard/download-resume-buttons'

interface ResumePreviewPageProps {
  params: Promise<{
    locale: Locale
    id: string
  }>
}

export default async function ResumePreviewPage({ params }: ResumePreviewPageProps) {
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
  const { data: resume, error } = (await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()) as { data: Resume | null; error: any }

  if (error || !resume) {
    notFound()
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/dashboard/resumes/${id}/edit`}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {dict.common?.back || 'Back to Editor'}
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{resume.title}</h1>
        </div>
        <DownloadResumeButtons
          pdfLabel={dict.resumes?.downloadPDF || 'Download PDF'}
          wordLabel={dict.resumes?.downloadWord || 'Download Word'}
        />
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-y-auto bg-slate-100 p-8">
        <ResumePreviewWrapper initialResume={resume as Resume} locale={locale} dict={dict} />
      </div>
    </div>
  )
}
