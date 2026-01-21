import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { CoverLetterEditor } from '@/components/dashboard/cover-letter-editor'
import { getTranslations, type Locale } from '@/lib/i18n'
import type { CoverLetter, Resume } from '@/types/database'

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

  // Get translations
  const dict = getTranslations(locale as Locale, 'common')

  return (
    <CoverLetterEditor
      coverLetter={coverLetter as CoverLetter}
      resumes={(resumes as Resume[]) || []}
      locale={locale as Locale}
      dict={dict}
    />
  )
}
