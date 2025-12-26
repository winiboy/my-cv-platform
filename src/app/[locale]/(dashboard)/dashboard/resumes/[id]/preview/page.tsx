import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n'
import { getTranslations } from '@/lib/i18n'
import { ResumePreviewWrapper } from '@/components/dashboard/resume-preview-wrapper'
import { DownloadButton } from '@/components/dashboard/download-button'
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

  return (
    <>
      {/* Header - Hidden when printing */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 print:hidden">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/${locale}/dashboard/resumes/${id}/edit`}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {dict.common?.back || 'Back'}
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{resume.title}</h1>
              <p className="text-sm text-slate-600">
                {dict.resumes?.preview || 'Preview'}
              </p>
            </div>
          </div>
          <DownloadButton
            label={dict.resumes?.downloadPDF || 'Download PDF'}
            wordLabel={dict.resumes?.downloadWord || 'Download Word'}
          />
        </div>
      </div>

      {/* Preview Content - visible both on screen and when printing */}
      <div className="py-8 bg-slate-100 print:py-0 print:bg-white">
        <ResumePreviewWrapper initialResume={resume as Resume} locale={locale} dict={dict} />
      </div>
    </>
  )
}
