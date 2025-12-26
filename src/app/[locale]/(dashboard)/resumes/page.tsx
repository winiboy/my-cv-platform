import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus, Calendar, Download, Eye, Pencil, Trash2 } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTranslations } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import type { Resume } from '@/types/database'

interface ResumesPageProps {
  params: Promise<{
    locale: Locale
  }>
}

export default async function ResumesPage({ params }: ResumesPageProps) {
  const { locale } = await params
  const dict = getTranslations(locale, 'common') as any
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  // Fetch user's resumes
  const { data: resumes, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching resumes:', error)
  }

  const resumesList = (resumes as Resume[]) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {dict.resumes?.title || 'My Resumes'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {dict.resumes?.subtitle || 'Create and manage your professional resumes'}
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/resumes/new`}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          {dict.resumes?.createNew || 'Create Resume'}
        </Link>
      </div>

      {/* Empty State */}
      {resumesList.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
            <FileText className="h-8 w-8 text-teal-600" />
          </div>
          <h3 className="mt-6 text-lg font-semibold text-slate-900">
            {dict.resumes?.empty?.title || 'No resumes yet'}
          </h3>
          <p className="mt-2 max-w-md text-center text-sm text-slate-600">
            {dict.resumes?.empty?.description ||
              'Create your first professional resume to start applying for jobs.'}
          </p>
          <Link
            href={`/${locale}/dashboard/resumes/new`}
            className="mt-6 flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            {dict.resumes?.createFirst || 'Create Your First Resume'}
          </Link>
        </div>
      )}

      {/* Resumes Grid */}
      {resumesList.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {resumesList.map((resume) => (
            <ResumeCard key={resume.id} resume={resume} locale={locale} dict={dict} />
          ))}
        </div>
      )}
    </div>
  )
}

interface ResumeCardProps {
  resume: Resume
  locale: Locale
  dict: any
}

function ResumeCard({ resume, locale, dict }: ResumeCardProps) {
  const updatedAt = new Date(resume.updated_at).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      {/* Default badge */}
      {resume.is_default && (
        <div className="absolute right-4 top-4">
          <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-medium text-teal-700">
            {dict.resumes?.default || 'Default'}
          </span>
        </div>
      )}

      {/* Resume Icon/Preview */}
      <div className="flex h-48 items-center justify-center rounded-lg bg-gradient-to-br from-slate-50 to-slate-100">
        <FileText className="h-16 w-16 text-slate-400" />
      </div>

      {/* Resume Info */}
      <div className="mt-4 flex-1">
        <h3 className="font-semibold text-slate-900">{resume.title}</h3>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="h-3 w-3" />
          <span>
            {dict.resumes?.updated || 'Updated'} {updatedAt}
          </span>
        </div>
        <div className="mt-1">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
            {resume.template}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/${locale}/dashboard/resumes/${resume.id}/edit`}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Pencil className="h-4 w-4" />
          {dict.resumes?.edit || 'Edit'}
        </Link>
        <Link
          href={`/${locale}/dashboard/resumes/${resume.id}/preview`}
          className="flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 transition-colors hover:bg-slate-50"
          title={dict.resumes?.preview || 'Preview'}
        >
          <Eye className="h-4 w-4" />
        </Link>
        <button
          className="flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 transition-colors hover:bg-slate-50"
          title={dict.resumes?.download || 'Download'}
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
