'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  dict: Record<string, unknown>
  linkedCoverLetterIds?: string[]
  linkedJob?: LinkedJobInfo | null
}

export function ResumeCard({ resume, locale, dict, linkedCoverLetterIds, linkedJob }: ResumeCardProps) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  /**
   * Close the kebab dropdown when the user clicks anywhere outside
   * the popup or the toggle button. Excluding the button from the
   * outside-check prevents a toggle race where the open click would
   * immediately be treated as an outside click and re-close the menu.
   */
  const handleClickOutside = useCallback((event: MouseEvent) => {
    const target = event.target as Node | null
    if (!target) return
    if (menuRef.current?.contains(target)) return
    if (buttonRef.current?.contains(target)) return
    setShowMenu(false)
  }, [])

  useEffect(() => {
    if (!showMenu) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu, handleClickOutside])

  // Check for unsaved changes in localStorage (computed on render)
  const hasUnsavedChanges = useMemo(() => {
    if (typeof window === 'undefined') return false
    return !!localStorage.getItem(`resume_draft_${resume.id}`)
  }, [resume.id])

  // Extract nested dictionaries with type assertions
  const resumesDict = (dict.resumes || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>
  const errorsDict = (dict.errors || {}) as Record<string, unknown>
  const apiErrorsDict = (errorsDict.api || {}) as Record<string, string>
  const editorDict = (resumesDict.editor || {}) as Record<string, string>
  const templatesDict = (resumesDict.templates || {}) as Record<string, string>

  const handleDelete = async () => {
    if (!confirm((resumesDict.confirmDelete as string) || 'Are you sure you want to delete this resume?')) return

    setIsDeleting(true)
    const supabase = createClient()

    const { error } = await supabase.from('resumes').delete().eq('id', resume.id)

    if (error) {
      console.error('Error deleting resume:', error)
      alert(apiErrorsDict.deleteResume || 'Failed to delete resume')
      setIsDeleting(false)
      return
    }

    router.refresh()
  }

  const handleDuplicate = async () => {
    const supabase = createClient()

    const { error } = await supabase.from('resumes').insert({
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
      alert(apiErrorsDict.duplicateResume || 'Failed to duplicate resume')
      return
    }

    router.refresh()
    setShowMenu(false)
  }

  const handleSetDefault = async () => {
    const supabase = createClient()

    // First, unset any existing default
    await supabase.from('resumes').update({ is_default: false }).eq('user_id', resume.user_id)

    // Set this one as default
    const { error } = await supabase.from('resumes').update({ is_default: true }).eq('id', resume.id)

    if (error) {
      console.error('Error setting default:', error)
      alert(apiErrorsDict.setDefault || 'Failed to set as default')
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
    modern: templatesDict.modern || 'Modern',
    classic: templatesDict.classic || 'Classic',
    minimal: templatesDict.minimal || 'Minimal',
    creative: templatesDict.creative || 'Creative',
  }

  return (
    <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Badges container */}
      <div className="absolute top-4 right-14 flex flex-col items-end gap-2">
        {/* Unsaved changes badge */}
        {hasUnsavedChanges && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium rounded">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
            {editorDict.unsavedChanges || 'Unsaved changes'}
          </div>
        )}
        {/* Default badge */}
        {resume.is_default && (
          <div className="flex items-center gap-1 px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-medium rounded">
            <Star className="h-3 w-3 fill-current" />
            {(resumesDict.default as string) || 'Default'}
          </div>
        )}
      </div>

      {/* Menu button */}
      <div className="absolute top-4 right-4">
        <button
          ref={buttonRef}
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          disabled={isDeleting}
        >
          <MoreVertical className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div ref={menuRef} className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-10">
            <Link
              href={`/${locale}/dashboard/resumes/${resume.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              {(resumesDict.edit as string) || 'Edit'}
            </Link>
            <button
              onClick={handleDuplicate}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Copy className="h-4 w-4" />
              {(resumesDict.duplicate as string) || 'Duplicate'}
            </button>
            {!resume.is_default && (
              <button
                onClick={handleSetDefault}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <Star className="h-4 w-4" />
                {(resumesDict.setDefault as string) || 'Set as Default'}
              </button>
            )}
            <button
              onClick={() => alert((resumesDict.pdfExportComingSoon as string) || 'PDF export coming soon!')}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              {(resumesDict.downloadPDF as string) || 'Download PDF'}
            </button>
            <hr className="my-1 border-slate-200 dark:border-slate-700" />
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? ((commonDict.deleting as string) || 'Deleting...') : ((resumesDict.delete as string) || 'Delete')}
            </button>
          </div>
        )}
      </div>

      {/* Card content — Link wraps only the title area to avoid nested <a> tags */}
      <Link href={`/${locale}/dashboard/resumes/${resume.id}/edit`} className="block mb-4">
        <div className="flex items-start gap-4">
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
      </Link>

      {/* Linked entities badges — outside parent Link to avoid nested <a> tags */}
      {((linkedCoverLetterIds && linkedCoverLetterIds.length > 0) || linkedJob) && (
        <div className="flex flex-wrap gap-2 mb-3">
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
              {linkedCoverLetterIds.length} {(resumesDict.linkedCoverLetters as string) || 'cover letter(s)'}
            </Link>
          )}
          {linkedJob && (
            <JobLinkBadge
              jobId={linkedJob.id}
              jobTitle={linkedJob.job_title}
              companyName={linkedJob.company_name}
              locale={locale}
              dict={dict}
            />
          )}
        </div>
      )}

      <div className="text-xs text-slate-500 dark:text-slate-500">
        {(resumesDict.updated as string) || 'Updated'} {formatDate(resume.updated_at)}
      </div>
    </div>
  )
}
