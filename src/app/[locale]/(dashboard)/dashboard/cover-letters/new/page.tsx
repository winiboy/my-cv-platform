import { CreateCoverLetterForm } from '@/components/dashboard/create-cover-letter-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getTranslations, type Locale } from '@/lib/i18n'

export default async function NewCoverLetterPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const dict = getTranslations(locale as Locale, 'common') as Record<string, unknown>
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch user's resumes for linking
  const { data: resumes } = await supabase
    .from('resumes')
    .select('id, title')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const newDict = (coverLettersDict.new || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href={`/${locale}/dashboard/cover-letters`}
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {(commonDict.back as string) || 'Back to'} {(coverLettersDict.title as string) || 'Cover Letters'}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {(newDict.title as string) || 'Create New Cover Letter'}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          {(newDict.subtitle as string) || 'Create a cover letter for your job application'}
        </p>
      </div>

      {/* Form */}
      <CreateCoverLetterForm
        locale={locale}
        dict={dict}
        resumes={resumes || []}
      />
    </div>
  )
}
