'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FileText, MoreVertical, Pencil, Trash2, Copy, Download, Loader2 } from 'lucide-react'
import type { CoverLetter } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useCoverLetterDownload, type CoverLetterDownloadResult } from '@/lib/hooks/use-cover-letter-download'
import { JobLinkBadge } from '@/components/dashboard/entity-link-badge'
import { coverLetterCardLanguage, displayCoverLetterTitle } from '@/lib/cover-letter-title'
import { toLocale } from '@/lib/i18n'
import { LANGUAGE_FLAG_OPTIONS } from '@/components/ui/language-flags'

const HOVER_DISMISS_DELAY_MS = 200

interface LinkedJobInfo {
  id: string
  job_title: string
  company_name: string
}

interface CoverLetterCardProps {
  coverLetter: CoverLetter
  locale: string
  dict: Record<string, unknown>
  linkedResumeName?: string | null
  linkedResumeId?: string | null
  linkedJob?: LinkedJobInfo | null
}

export function CoverLetterCard({ coverLetter, locale, dict, linkedResumeName, linkedResumeId, linkedJob }: CoverLetterCardProps) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { download: downloadPdf, isDownloading: isExportingPdf } = useCoverLetterDownload(coverLetter.id, 'pdf', locale)
  const { download: downloadWord, isDownloading: isExportingWord } = useCoverLetterDownload(coverLetter.id, 'docx', locale)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  /**
   * Hover-out dismiss: when the cursor leaves the popup bounds, start
   * a short grace timer before closing. Re-entering the popup within
   * the grace window cancels the timer, so brief cursor excursions do
   * not dismiss the menu.
   */
  const handlePopupMouseLeave = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setShowMenu(false)
      hoverTimerRef.current = null
    }, HOVER_DISMISS_DELAY_MS)
  }, [])

  const handlePopupMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
      }
    }
  }, [])

  /**
   * Close the kebab dropdown when the user presses Escape and return
   * focus to the toggle button for accessibility. Listener is gated on
   * the open state so it is only attached while the popup is visible.
   */
  useEffect(() => {
    if (!showMenu) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMenu(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showMenu])

  // Memoised because `handlePdfExport` depends on it: the bare cast produced a
  // fresh object every render, which would rebuild the callback every render.
  // `commonDict` is deliberately left bare rather than made to match - no
  // dependency array reads it, so memoising it would buy nothing and only
  // suggest that the cast itself is what needs wrapping.
  const coverLettersDict = useMemo(
    () => (dict.coverLetters || {}) as Record<string, unknown>,
    [dict.coverLetters]
  )
  const commonDict = (dict.common || {}) as Record<string, unknown>

  // Resolved once and shared by the title and the flag, so the two cannot
  // disagree. Memoised because it runs language detection over the letter's
  // paragraphs, which need not repeat on every menu toggle.
  const letterLanguage = useMemo(
    () => coverLetterCardLanguage(coverLetter, toLocale(locale)),
    [coverLetter, locale]
  )
  const displayTitle = useMemo(
    () => displayCoverLetterTitle(coverLetter, letterLanguage),
    [coverLetter, letterLanguage]
  )
  const LanguageFlag = LANGUAGE_FLAG_OPTIONS.find(({ code }) => code === letterLanguage)?.Flag
  const languageLabel =
    ((coverLettersDict.cardLanguage as Record<string, string> | undefined)?.[letterLanguage]) ||
    `Language: ${letterLanguage.toUpperCase()}`

  const handleDelete = async () => {
    const confirmMsg = (coverLettersDict.confirmDelete as string) || 'Are you sure you want to delete this cover letter?'
    if (!confirm(confirmMsg)) return

    setIsDeleting(true)
    const supabase = createClient()

    const { error } = await supabase.from('cover_letters').delete().eq('id', coverLetter.id)

    if (error) {
      console.error('Error deleting cover letter:', error)
      alert('Failed to delete cover letter')
      setIsDeleting(false)
      return
    }

    router.refresh()
  }

  const handleDuplicate = async () => {
    const supabase = createClient()

    const { error } = await supabase.from('cover_letters').insert({
      user_id: coverLetter.user_id,
      title: `${coverLetter.title} (Copy)`,
      resume_id: coverLetter.resume_id,
      recipient_name: coverLetter.recipient_name,
      recipient_title: coverLetter.recipient_title,
      company_name: coverLetter.company_name,
      company_address: coverLetter.company_address,
      greeting: coverLetter.greeting,
      opening_paragraph: coverLetter.opening_paragraph,
      body_paragraphs: coverLetter.body_paragraphs,
      closing_paragraph: coverLetter.closing_paragraph,
      sign_off: coverLetter.sign_off,
      sender_name: coverLetter.sender_name,
      job_title: coverLetter.job_title,
      job_description: coverLetter.job_description,
      template: coverLetter.template,
    })

    if (error) {
      console.error('Error duplicating cover letter:', error)
      alert('Failed to duplicate cover letter')
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

  /**
   * The saved letter as a file generated by the server. A failure is reported
   * the way this card reports its other failures, and leaves no file.
   */
  const handleExport = useCallback(
    async (download: () => Promise<CoverLetterDownloadResult | null>, failedMessage: string) => {
      // Closing the menu unmounts the focused item; focus goes back to the
      // toggle that opened it, as on Escape, rather than falling to <body>.
      setShowMenu(false)
      buttonRef.current?.focus()
      const result = await download()
      if (result === 'too-large') {
        // The size guard is the same for both formats, and so is its message.
        alert(
          (coverLettersDict.downloadPDFTooLarge as string) ||
            'This letter is too long to export. Shorten its paragraphs and try again.'
        )
      } else if (result === 'failed') {
        alert(failedMessage)
      }
    },
    [coverLettersDict]
  )

  const handlePdfExport = useCallback(
    () =>
      handleExport(
        downloadPdf,
        (coverLettersDict.downloadPDFError as string) || 'The PDF could not be created. Please try again.'
      ),
    [handleExport, downloadPdf, coverLettersDict]
  )

  const handleWordExport = useCallback(
    () =>
      handleExport(
        downloadWord,
        (coverLettersDict.downloadWordError as string) || 'The Word file could not be created. Please try again.'
      ),
    [handleExport, downloadWord, coverLettersDict]
  )

  return (
    <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-lg transition-shadow">
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
          <div
            ref={menuRef}
            onMouseEnter={handlePopupMouseEnter}
            onMouseLeave={handlePopupMouseLeave}
            className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-10"
          >
            <Link
              href={`/${locale}/dashboard/cover-letters/${coverLetter.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              {(coverLettersDict.edit as string) || 'Edit'}
            </Link>
            <button
              onClick={handleDuplicate}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Copy className="h-4 w-4" />
              {(coverLettersDict.duplicate as string) || 'Duplicate'}
            </button>
            <button
              onClick={handlePdfExport}
              disabled={isExportingPdf}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {isExportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {(coverLettersDict.downloadPDF as string) || 'Download PDF'}
            </button>
            <button
              onClick={handleWordExport}
              disabled={isExportingWord}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {isExportingWord ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {(coverLettersDict.downloadWord as string) || 'Download Word'}
            </button>
            <hr className="my-1 border-slate-200 dark:border-slate-700" />
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting
                ? ((commonDict.deleting as string) || 'Deleting...')
                : ((coverLettersDict.delete as string) || 'Delete')}
            </button>
          </div>
        )}
      </div>

      {/* Card content — Link wraps only the title area to avoid nested <a> tags */}
      <Link href={`/${locale}/dashboard/cover-letters/${coverLetter.id}/edit`} className="block mb-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg mb-1 truncate">{displayTitle}</h3>
            {coverLetter.company_name && (
              <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                {coverLetter.company_name}
                {coverLetter.job_title && ` - ${coverLetter.job_title}`}
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* Badges row — outside parent Link to avoid nested <a> tags */}
      {(coverLetter.analysis_score !== null || (linkedResumeName && linkedResumeId) || linkedJob) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {coverLetter.analysis_score !== null && (
            <div
              className={`px-2 py-1 text-xs font-medium rounded ${
                coverLetter.analysis_score >= 80
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : coverLetter.analysis_score >= 60
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}
            >
              {coverLetter.analysis_score}%
            </div>
          )}
          {linkedResumeName && linkedResumeId && (
            <Link
              href={`/${locale}/dashboard/resumes/${linkedResumeId}/edit`}
              className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-medium rounded hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors"
            >
              <FileText className="h-3 w-3" />
              {(coverLettersDict.linkedTo as string) || 'Linked to'}: {linkedResumeName}
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

      {/* pr-8 reserves the flag's corner, so a long date never runs under it. */}
      <div className="pr-8 text-xs text-slate-500 dark:text-slate-500">
        {(coverLettersDict.updated as string) || 'Updated'} {formatDate(coverLetter.updated_at)}
      </div>

      {/*
        Anchored to the card, not to the content flow: the grid stretches the
        cards of a row to one height, so the last content row is not always at
        the card's bottom. h-4 is the date's line height, so the flag sits on
        the date's line when the card is not stretched.
      */}
      {LanguageFlag && (
        <span
          role="img"
          aria-label={languageLabel}
          title={languageLabel}
          data-language={letterLanguage}
          data-testid="cover-letter-card-flag"
          className="absolute bottom-6 right-6 flex h-4 items-center"
        >
          <LanguageFlag />
        </span>
      )}
    </div>
  )
}
