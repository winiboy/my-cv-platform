'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { FileText, MoreVertical, Pencil, Trash2, Copy, Download, Loader2 } from 'lucide-react'
import type { CoverLetter } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { sanitizeHtml } from '@/lib/html-utils'
import { buildCoverLetterPdfHtml } from '@/lib/cover-letter-pdf-html'
import { applyHtml2canvasColorFallback } from '@/lib/html2canvas-color-fallback'
import { JobLinkBadge } from '@/components/dashboard/entity-link-badge'

const HOVER_DISMISS_DELAY_MS = 200

/**
 * The one html2pdf internal this component reads, and why it has to.
 *
 * `html2pdf.js` mounts a `position: fixed`, full-viewport `.html2pdf__overlay`
 * on `document.body` (`node_modules/html2pdf.js/src/worker.js:105-125`) and
 * removes it in exactly one place - `toCanvas_post` at `:152` - which is never
 * reached when `html2canvas()` rejects. `opacity: 0` hides the overlay but does
 * not stop pointer events, so a failed export left the dashboard unclickable
 * until a reload, with every retry stacking another copy. That is the same
 * failure this change exists to handle, so the overlay has to come down on the
 * failure path too.
 *
 * It must be identified by node, not by `.html2pdf__overlay`: each card owns its
 * own `isExportingPdf`, so a second card can be mid-export on the same page, and
 * removing its overlay would pull that render's subtree out from under
 * html2canvas. Diffing the class before and after has the same defect - a
 * concurrent export's overlay is "new" by that test as well. The worker hands
 * over the node itself: `prop` is an own property of the promise chain's shared
 * root object and every link resolves it through the prototype chain, so the
 * `prop.overlay` read after `save()` settles is the very node `toContainer`
 * created for this call.
 *
 * `prop` is absent from the package's `type.d.ts`, so this is a deliberate reach
 * into an internal. A future html2pdf that renames it would make the read
 * `undefined` and the cleanup would silently stop happening - which is why
 * `e2e/cover-letter-pdf-export.spec.ts` drives a forced failure and asserts the
 * overlay is gone, instead of trusting this.
 */
interface Html2PdfWorkerInternals {
  readonly prop?: { readonly overlay?: unknown }
}

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
  const [isExportingPdf, setIsExportingPdf] = useState(false)
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
   * Export cover letter as PDF using html2pdf.js
   * Generates a PDF from the cover letter content
   */
  const handlePdfExport = useCallback(async () => {
    setIsExportingPdf(true)
    setShowMenu(false)

    let container: HTMLDivElement | null = null
    // See `Html2PdfWorkerInternals`: held across the `try` so the `finally` can
    // take down the overlay html2pdf leaks when the render rejects.
    let worker: Html2PdfWorkerInternals | null = null

    try {
      // Dynamically import html2pdf to avoid SSR issues
      const html2pdf = (await import('html2pdf.js')).default

      // Format date for the letter
      const currentDate = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })

      const htmlContent = buildCoverLetterPdfHtml(coverLetter, {
        currentDate,
        sanitizeRichText: sanitizeHtml,
      })

      // Create a temporary container
      container = document.createElement('div')
      container.innerHTML = htmlContent
      container.style.position = 'absolute'
      container.style.left = '-9999px'
      document.body.appendChild(container)

      // Generate PDF
      const filename = `${coverLetter.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`

      const element = container.firstElementChild as HTMLElement | null
      if (!element) {
        throw new Error('Failed to create PDF content')
      }

      const pdfWorker = html2pdf()
        .set({
          margin: 0,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          // `onclone` is what keeps the theme's oklch() palette from aborting
          // the render; see src/lib/html2canvas-color-fallback.ts.
          html2canvas: { scale: 2, useCORS: true, onclone: applyHtml2canvasColorFallback },
          jsPDF: { unit: 'px', format: [816, 1056], orientation: 'portrait' },
        })
        .from(element)

      // The cast reaches past the package's `type.d.ts`, which does not declare
      // `prop`; the read itself is guarded rather than trusted.
      worker = pdfWorker as unknown as Html2PdfWorkerInternals

      await pdfWorker.save()
    } catch (error) {
      // This export is entirely client-side, so a failure leaves no server
      // trace at all. It sat broken in production for weeks behind nothing but
      // the alert below, because html2canvas could not parse the theme's
      // oklch() colours and console.error is invisible from here. Capture
      // first, for the same reason `src/lib/ai/client.ts` does.
      //
      // The letter's contents are deliberately absent: they are user career
      // data, which .claude/rules/security.md forbids logging. Only the
      // template and the letter id go out.
      Sentry.captureException(error, {
        tags: {
          area: 'cover-letter-export',
          export_format: 'pdf',
          export_template: coverLetter.template ?? 'default',
        },
        extra: { coverLetterId: coverLetter.id },
      })

      console.error('Error exporting PDF:', error)
      alert(
        (coverLettersDict.downloadPDFError as string) ||
          'The PDF could not be created. Please try again.'
      )
    } finally {
      // Removed here rather than after `save()`: on the failure path the old
      // code left the off-screen container in the document for the lifetime of
      // the page, so every retry appended another copy of the letter.
      container?.remove()

      // html2pdf's own overlay, for the reasons set out on
      // `Html2PdfWorkerInternals`. On the success path html2pdf has already
      // detached this node and `remove()` is a no-op, so the failure path needs
      // no separate branch.
      const overlay = worker?.prop?.overlay
      if (overlay instanceof HTMLElement) {
        overlay.remove()
      }

      setIsExportingPdf(false)
    }
  }, [coverLetter, coverLettersDict])

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
            <h3 className="font-semibold text-lg mb-1 truncate">{coverLetter.title}</h3>
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

      <div className="text-xs text-slate-500 dark:text-slate-500">
        {(coverLettersDict.updated as string) || 'Updated'} {formatDate(coverLetter.updated_at)}
      </div>
    </div>
  )
}
