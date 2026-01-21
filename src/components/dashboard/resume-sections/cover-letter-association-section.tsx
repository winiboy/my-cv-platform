'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Plus, ChevronDown, ChevronUp, Link2, Loader2 } from 'lucide-react'

interface CoverLetterItem {
  id: string
  title: string
  company_name: string | null
  job_title: string | null
}

interface UnlinkedCoverLetterItem {
  id: string
  title: string
  company_name: string | null
}

interface CoverLetterAssociationSectionProps {
  resumeId: string
  coverLetters: CoverLetterItem[]
  unlinkedCoverLetters?: UnlinkedCoverLetterItem[]
  locale: string
  dict: Record<string, unknown>
  onAssociate?: (coverLetterId: string) => Promise<void>
}

/** Maximum number of cover letters to show before collapsing */
const MAX_VISIBLE_ITEMS = 3

/**
 * Section component for the resume editor showing linked cover letters.
 *
 * Features:
 * - List of linked cover letters with title and company
 * - Clickable items linking to cover letter editor
 * - Dropdown to link existing unlinked cover letters
 * - "Create Cover Letter" button with resume_id query param
 * - Collapsible list when more than MAX_VISIBLE_ITEMS
 */
export function CoverLetterAssociationSection({
  resumeId,
  coverLetters,
  unlinkedCoverLetters = [],
  locale,
  dict,
  onAssociate,
}: CoverLetterAssociationSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedUnlinkedId, setSelectedUnlinkedId] = useState<string>('')
  const [isAssociating, setIsAssociating] = useState(false)
  const [associateError, setAssociateError] = useState<string>('')

  const associationDict = ((dict.resumes || {}) as Record<string, unknown>).association as Record<string, unknown> || {}

  const hasMoreItems = coverLetters.length > MAX_VISIBLE_ITEMS
  const visibleItems = isExpanded ? coverLetters : coverLetters.slice(0, MAX_VISIBLE_ITEMS)
  const hiddenCount = coverLetters.length - MAX_VISIBLE_ITEMS

  const handleAssociate = async () => {
    if (!selectedUnlinkedId || !onAssociate) return

    setIsAssociating(true)
    setAssociateError('')

    try {
      await onAssociate(selectedUnlinkedId)
      setSelectedUnlinkedId('')
    } catch (err) {
      console.error('Failed to associate cover letter:', err)
      setAssociateError((associationDict.associateError as string) || 'Failed to link cover letter')
    } finally {
      setIsAssociating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {(associationDict.linkedCoverLetters as string) || 'Linked Cover Letters'}
          </h3>
        </div>
        {coverLetters.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {coverLetters.length}
          </span>
        )}
      </div>

      {/* Cover Letters List */}
      {coverLetters.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center dark:border-slate-600 dark:bg-slate-800/50">
          <Mail className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {(associationDict.noCoverLetters as string) || 'No cover letters linked to this resume'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((coverLetter) => (
            <Link
              key={coverLetter.id}
              href={`/${locale}/dashboard/cover-letters/${coverLetter.id}/edit`}
              className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-teal-300 hover:bg-teal-50/50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-teal-600 dark:hover:bg-teal-900/20"
            >
              <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 group-hover:text-teal-700 dark:text-slate-100 dark:group-hover:text-teal-400">
                  {coverLetter.title || ((associationDict.untitledCoverLetter as string) || 'Untitled Cover Letter')}
                </p>
                {(coverLetter.company_name || coverLetter.job_title) && (
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {[coverLetter.job_title, coverLetter.company_name]
                      .filter(Boolean)
                      .join(' - ')}
                  </p>
                )}
              </div>
            </Link>
          ))}

          {/* Expand/Collapse Toggle */}
          {hasMoreItems && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  {(associationDict.showLess as string) || 'Show less'}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  {(associationDict.viewAll as string) || `View all`} ({hiddenCount} {(associationDict.more as string) || 'more'})
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Link Existing Cover Letter Section */}
      {unlinkedCoverLetters.length > 0 && onAssociate && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Link2 className="h-3.5 w-3.5" />
              {(associationDict.linkExisting as string) || 'Link Existing Cover Letter'}
            </div>
          </label>
          <div className="flex gap-2">
            <select
              value={selectedUnlinkedId}
              onChange={(e) => setSelectedUnlinkedId(e.target.value)}
              disabled={isAssociating}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">
                {(associationDict.selectCoverLetter as string) || 'Select a cover letter...'}
              </option>
              {unlinkedCoverLetters.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.title || ((associationDict.untitledCoverLetter as string) || 'Untitled')}
                  {cl.company_name ? ` - ${cl.company_name}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssociate}
              disabled={!selectedUnlinkedId || isAssociating}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {isAssociating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {(associationDict.link as string) || 'Link'}
            </button>
          </div>
          {associateError && (
            <p className="text-xs text-red-600 dark:text-red-400">{associateError}</p>
          )}
        </div>
      )}

      {/* Create Cover Letter Button */}
      <Link
        href={`/${locale}/dashboard/cover-letters/new?resume_id=${resumeId}`}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
      >
        <Plus className="h-4 w-4" />
        {(associationDict.createCoverLetter as string) || 'Create Cover Letter'}
      </Link>

      {/* Hint Text */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {(associationDict.hint as string) ||
          'Cover letters linked to this resume will use your experience and skills for AI-powered content generation.'}
      </p>
    </div>
  )
}
