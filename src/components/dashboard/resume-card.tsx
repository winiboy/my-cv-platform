'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileText, Star, MoreVertical, Pencil, Trash2, Copy, Download } from 'lucide-react'
import type { Resume } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { JobLinkBadge } from '@/components/dashboard/entity-link-badge'

interface LinkedJobInfo {
  id: string
  job_title: string
  company_name: string
}

interface ResumeCardProps {
  resume: Resume
  locale: string
  dict: any
  linkedCoverLetterIds?: string[]
  linkedJob?: LinkedJobInfo | null
}

export function ResumeCard({ resume, locale, dict, linkedCoverLetterIds, linkedJob }: ResumeCardProps) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Check for unsaved changes in localStorage
  useEffect(() => {
    const draft = localStorage.getItem(`resume_draft_${resume.id}`)
    setHasUnsavedChanges(!!draft)
  }, [resume.id])

  const handleDelete = async () => {
    if (!confirm(dict.resumes?.confirmDelete || 'Are you sure you want to delete this resume?')) return

    setIsDeleting(true)
    const supabase = createClient()

    const { error } = await supabase.from('resumes').delete().eq('id', resume.id)

    if (error) {
      console.error('Error deleting resume:', error)
      alert(dict.errors?.api?.deleteResume || 'Failed to delete resume')
      setIsDeleting(false)
      return
    }

    router.refresh()
  }

  const handleDuplicate = async () => {
    const supabase = createClient()

    const { error } = await (supabase as any).from('resumes').insert({
      user_id: resume.user_id,
      title: `${resume.title} (Copy)`,
      template: resume.template,
      contact: resume.contact,
      summary: resume.summary,
      experience: resume.experience,
      education: resume.education,
      skills: resume.skills,
      languages: resume.languages,
      certifications: resume.certifications,
      projects: resume.projects,
      custom_sections: resume.custom_sections,
      is_default: false,
      is_public: false,
    })

    if (error) {
      console.error('Error duplicating resume:', error)
      alert(dict.errors?.api?.duplicateResume || 'Failed to duplicate resume')
      return
    }

    router.refresh()
    setShowMenu(false)
  }

  const handleSetDefault = async () => {
    const supabase = createClient()

    // First, unset any existing default
    await (supabase as any).from('resumes').update({ is_default: false }).eq('user_id', resume.user_id)

    // Set this one as default
    const { error } = await (supabase as any).from('resumes').update({ is_default: true }).eq('id', resume.id)

    if (error) {
      console.error('Error setting default:', error)
      alert(dict.errors?.api?.setDefault || 'Failed to set as default')
      return
    }

    router.refresh()
    setShowMenu(false)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  const templateLabels = {
    modern: dict.resumes?.templates?.modern || 'Modern',
    classic: dict.resumes?.templates?.classic || 'Classic',
    minimal: dict.resumes?.templates?.minimal || 'Minimal',
    creative: dict.resumes?.templates?.creative || 'Creative',
  }

  return (
    <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Badges container */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        {/* Unsaved changes badge */}
        {hasUnsavedChanges && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium rounded">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
            {dict.resumes?.editor?.unsavedChanges || 'Unsaved changes'}
          </div>
        )}
        {/* Default badge */}
        {resume.is_default && (
          <div className="flex items-center gap-1 px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-medium rounded">
            <Star className="h-3 w-3 fill-current" />
            {dict.resumes?.default || 'Default'}
          </div>
        )}
        {/* Linked cover letters badge */}
        {linkedCoverLetterIds && linkedCoverLetterIds.length > 0 && (
          <Link
            href={
              linkedCoverLetterIds.length === 1
                ? `/${locale}/dashboard/cover-letters/${linkedCoverLetterIds[0]}/edit`
                : `/${locale}/dashboard/cover-letters`
            }
            className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium rounded hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer"
          >
            <FileText className="h-3 w-3" />
            {linkedCoverLetterIds.length} {dict.resumes?.linkedCoverLetters || 'cover letter(s)'}
          </Link>
        )}
        {/* Linked job badge */}
        {linkedJob && (
          <JobLinkBadge
            jobTitle={linkedJob.job_title}
            companyName={linkedJob.company_name}
            dict={dict}
          />
        )}
      </div>

      {/* Menu button */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          disabled={isDeleting}
        >
          <MoreVertical className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-10">
            <Link
              href={`/${locale}/dashboard/resumes/${resume.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              {dict.resumes?.edit || 'Edit'}
            </Link>
            <button
              onClick={handleDuplicate}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Copy className="h-4 w-4" />
              {dict.resumes?.duplicate || 'Duplicate'}
            </button>
            {!resume.is_default && (
              <button
                onClick={handleSetDefault}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <Star className="h-4 w-4" />
                {dict.resumes?.setDefault || 'Set as Default'}
              </button>
            )}
            <button
              onClick={() => alert(dict.resumes?.pdfExportComingSoon || 'PDF export coming soon!')}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              {dict.resumes?.downloadPDF || 'Download PDF'}
            </button>
            <hr className="my-1 border-slate-200 dark:border-slate-700" />
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? (dict.common?.deleting || 'Deleting...') : (dict.resumes?.delete || 'Delete')}
            </button>
          </div>
        )}
      </div>

      {/* Card content */}
      <Link href={`/${locale}/dashboard/resumes/${resume.id}/edit`} className="block">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg mb-1 truncate">{resume.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {templateLabels[resume.template as keyof typeof templateLabels] || resume.template}
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-500">
          {dict.resumes?.updated || 'Updated'} {formatDate(resume.updated_at)}
        </div>
      </Link>
    </div>
  )
}
