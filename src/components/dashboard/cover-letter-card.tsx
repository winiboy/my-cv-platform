'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { FileText, MoreVertical, Pencil, Trash2, Copy, Download, Loader2 } from 'lucide-react'
import type { CoverLetter } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { sanitizeHtml } from '@/lib/html-utils'

interface CoverLetterCardProps {
  coverLetter: CoverLetter
  locale: string
  dict: Record<string, unknown>
  linkedResumeName?: string | null
  linkedResumeId?: string | null
}

export function CoverLetterCard({ coverLetter, locale, dict, linkedResumeName, linkedResumeId }: CoverLetterCardProps) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
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

    try {
      // Dynamically import html2pdf to avoid SSR issues
      const html2pdf = (await import('html2pdf.js')).default

      // Format date for the letter
      const currentDate = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })

      // Get body paragraphs safely
      const bodyParagraphs = Array.isArray(coverLetter.body_paragraphs)
        ? (coverLetter.body_paragraphs as string[])
        : []

      // Build HTML content for the cover letter
      const htmlContent = `
        <div style="width: 816px; min-height: 1056px; background: white; padding: 64px; font-family: Georgia, serif; font-size: 14px; line-height: 1.625; color: #1f2937;">
          <!-- Sender name -->
          ${coverLetter.sender_name ? `<div style="font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 4px;">${coverLetter.sender_name}</div>` : ''}

          <!-- Date -->
          <div style="margin-bottom: 24px; color: #4b5563;">${currentDate}</div>

          <!-- Recipient info -->
          ${coverLetter.recipient_name || coverLetter.company_name ? `
            <div style="margin-bottom: 24px;">
              ${coverLetter.recipient_name ? `<div>${coverLetter.recipient_name}</div>` : ''}
              ${coverLetter.recipient_title ? `<div>${coverLetter.recipient_title}</div>` : ''}
              ${coverLetter.company_name ? `<div>${coverLetter.company_name}</div>` : ''}
              ${coverLetter.company_address ? `<div style="white-space: pre-line;">${coverLetter.company_address}</div>` : ''}
            </div>
          ` : ''}

          <!-- Job reference -->
          ${coverLetter.job_title ? `<div style="margin-bottom: 24px;"><strong>Re: Application for ${coverLetter.job_title}</strong></div>` : ''}

          <!-- Greeting -->
          <div style="margin-bottom: 16px;">${coverLetter.greeting || 'Dear Hiring Manager,'}</div>

          <!-- Opening paragraph -->
          ${coverLetter.opening_paragraph ? `<div style="margin-bottom: 16px; text-align: justify;">${sanitizeHtml(coverLetter.opening_paragraph)}</div>` : ''}

          <!-- Body paragraphs -->
          ${bodyParagraphs.map(p => `<div style="margin-bottom: 16px; text-align: justify;">${sanitizeHtml(p)}</div>`).join('')}

          <!-- Closing paragraph -->
          ${coverLetter.closing_paragraph ? `<div style="margin-bottom: 24px; text-align: justify;">${sanitizeHtml(coverLetter.closing_paragraph)}</div>` : ''}

          <!-- Sign-off -->
          <div style="margin-top: 32px;">
            <div style="margin-bottom: 32px;">${coverLetter.sign_off || 'Sincerely,'}</div>
            ${coverLetter.sender_name ? `<div style="font-weight: 600;">${coverLetter.sender_name}</div>` : ''}
          </div>
        </div>
      `

      // Create a temporary container
      const container = document.createElement('div')
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

      await html2pdf()
        .set({
          margin: 0,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'px', format: [816, 1056], orientation: 'portrait' },
        })
        .from(element)
        .save()

      // Clean up
      document.body.removeChild(container)
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setIsExportingPdf(false)
    }
  }, [coverLetter])

  return (
    <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Score badge */}
      {coverLetter.analysis_score !== null && (
        <div className="absolute top-4 right-4">
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
        </div>
      )}

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

      {/* Card content */}
      <Link href={`/${locale}/dashboard/cover-letters/${coverLetter.id}/edit`} className="block">
        <div className="flex items-start gap-4 mb-4">
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

        {/* Linked resume badge */}
        {linkedResumeName && linkedResumeId && (
          <div className="mb-3">
            <Link
              href={`/${locale}/dashboard/resumes/${linkedResumeId}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-medium rounded hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors"
            >
              <FileText className="h-3 w-3" />
              {(coverLettersDict.linkedTo as string) || 'Linked to'}: {linkedResumeName}
            </Link>
          </div>
        )}

        <div className="text-xs text-slate-500 dark:text-slate-500">
          {(coverLettersDict.updated as string) || 'Updated'} {formatDate(coverLetter.updated_at)}
        </div>
      </Link>
    </div>
  )
}
