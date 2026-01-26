'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Mail, Plus, ChevronDown, ChevronUp, Link2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEntityLinking } from '@/lib/hooks/useEntityLinking'

/**
 * Cover letter data structure for selection dropdown
 */
interface UnlinkedCoverLetterData {
  id: string
  title: string
  company_name: string | null
}

/**
 * Props for the CoverLettersSection component
 */
export interface CoverLettersSectionProps {
  /** Type of entity being linked: 'resume' or 'jobApplication' */
  entityType: 'resume' | 'jobApplication'
  /** ID of the entity (resume or job application) */
  entityId: string
  /** Current locale for i18n routing */
  locale: string
  /** Dictionary containing i18n translations */
  dict: Record<string, unknown>
}

/** Maximum number of cover letters to show before collapsing */
const MAX_VISIBLE_ITEMS = 3

/**
 * Shared component for listing and managing cover letters linked to resumes or job applications.
 *
 * This component provides a unified UI for the "Linked Cover Letters" section that is used
 * in both the Resume and Job Application editors. It uses the centralized
 * useEntityLinking hook for all linking operations, ensuring consistent
 * bidirectional sync between entities.
 *
 * Features:
 * - List of linked cover letters with title and company/job info
 * - Clickable items linking to cover letter editor
 * - Dropdown to link existing unlinked cover letters
 * - "Create Cover Letter" button with appropriate query params
 * - Collapsible list when more than MAX_VISIBLE_ITEMS
 * - Loading overlay during operations
 * - Empty, linked, loading, and error states
 */
export function CoverLettersSection({
  entityType,
  entityId,
  locale,
  dict,
}: CoverLettersSectionProps) {
  // Use the centralized entity linking hook
  // Note: unlinkCoverLetter is available from the hook but not exposed in UI
  // to match the reference implementation pattern
  const {
    linkedCoverLetters,
    linkCoverLetter,
    isLoading: hookLoading,
    error: hookError,
  } = useEntityLinking({ entityType, entityId })

  // Local state for unlinked cover letters list and UI operations
  const [unlinkedCoverLetters, setUnlinkedCoverLetters] = useState<UnlinkedCoverLetterData[]>([])
  const [isLoadingUnlinked, setIsLoadingUnlinked] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedUnlinkedId, setSelectedUnlinkedId] = useState<string>('')
  const [isLinking, setIsLinking] = useState(false)
  const [linkError, setLinkError] = useState<string>('')

  // Extract i18n strings from dict
  const commonDict = (dict.common || {}) as Record<string, string>
  const resumesDict = (dict.resumes || {}) as Record<string, unknown>
  const associationDict = (resumesDict.association || {}) as Record<string, string>

  // Stabilize linkedCoverLetters dependency to prevent waterfall fetches
  // by tracking only the IDs, not the full objects
  const linkedIdsRef = useRef<string>('')
  const currentLinkedIds = linkedCoverLetters.map((cl) => cl.id).sort().join(',')
  if (linkedIdsRef.current !== currentLinkedIds) {
    linkedIdsRef.current = currentLinkedIds
  }

  /**
   * Fetch available unlinked cover letters for the dropdown selector.
   * Filters to cover letters not linked to this entity.
   */
  useEffect(() => {
    const fetchUnlinkedCoverLetters = async () => {
      setIsLoadingUnlinked(true)
      try {
        const supabase = createClient()

        // Build query based on entity type using proper filter chaining
        // to avoid SQL injection from string interpolation
        const query = supabase
          .from('cover_letters')
          .select('id, title, company_name')
          .order('updated_at', { ascending: false })

        if (entityType === 'resume') {
          // Get cover letters not linked to this resume using safe filter methods
          // First get all, then filter client-side to avoid SQL injection
          // Supabase's .or() with string interpolation is unsafe
        } else if (entityType === 'jobApplication') {
          // Same approach for job applications
        }

        const { data, error } = await query

        if (error) {
          console.error('Error fetching unlinked cover letters:', error)
          return
        }

        // Filter out cover letters that are linked to this specific entity
        // and also filter out currently linked cover letters
        const linkedIds = new Set(linkedIdsRef.current.split(',').filter(Boolean))
        const filtered = (data || []).filter((cl) => {
          // Exclude already linked cover letters
          if (linkedIds.has(cl.id)) return false
          return true
        })

        setUnlinkedCoverLetters(
          filtered.map((cl) => ({
            id: cl.id,
            title: cl.title || '',
            company_name: cl.company_name,
          }))
        )
      } catch (err) {
        console.error('Unexpected error fetching unlinked cover letters:', err)
      } finally {
        setIsLoadingUnlinked(false)
      }
    }

    fetchUnlinkedCoverLetters()
    // Use linkedIdsRef.current to stabilize the dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, linkedIdsRef.current])

  /**
   * Handles linking a cover letter from the dropdown selection.
   */
  const handleLinkCoverLetter = useCallback(async () => {
    if (!selectedUnlinkedId) return

    setIsLinking(true)
    setLinkError('')

    try {
      await linkCoverLetter(selectedUnlinkedId)
      setSelectedUnlinkedId('')
    } catch (err) {
      console.error('Failed to link cover letter:', err)
      setLinkError(associationDict.linkError || 'Failed to link cover letter')
    } finally {
      setIsLinking(false)
    }
  }, [selectedUnlinkedId, linkCoverLetter, associationDict.linkError])

  // Derive display values
  const hasMoreItems = linkedCoverLetters.length > MAX_VISIBLE_ITEMS
  const visibleItems = isExpanded
    ? linkedCoverLetters
    : linkedCoverLetters.slice(0, MAX_VISIBLE_ITEMS)
  const hiddenCount = linkedCoverLetters.length - MAX_VISIBLE_ITEMS

  // Build the "Create Cover Letter" URL with appropriate query params
  const createCoverLetterUrl =
    entityType === 'resume'
      ? `/${locale}/dashboard/cover-letters/new?resume_id=${entityId}`
      : `/${locale}/dashboard/cover-letters/new?jobApplicationId=${entityId}`

  // Combined loading state
  const isLoading = hookLoading || isLoadingUnlinked

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {associationDict.linkedCoverLetters || 'Linked Cover Letters'}
          </h3>
        </div>
        {linkedCoverLetters.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {linkedCoverLetters.length}
          </span>
        )}
      </div>

      {/* Cover Letters List */}
      {isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{commonDict.loading || 'Loading...'}</span>
        </div>
      ) : linkedCoverLetters.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center dark:border-slate-600 dark:bg-slate-800/50">
          <Mail className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {associationDict.noCoverLetters || 'No cover letters linked'}
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
                  {coverLetter.title ||
                    (associationDict.untitledCoverLetter || 'Untitled Cover Letter')}
                </p>
                {(coverLetter.company_name || coverLetter.job_title) && (
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {coverLetter.company_name && coverLetter.job_title
                      ? `${coverLetter.company_name} - ${coverLetter.job_title}`
                      : coverLetter.company_name || coverLetter.job_title || ''}
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
                  {associationDict.showLess || 'Show less'}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  {associationDict.viewAll || 'View all'} ({hiddenCount}{' '}
                  {associationDict.more || 'more'})
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Error Display */}
      {hookError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{hookError}</p>
        </div>
      )}

      {/* Link Existing Cover Letter Section */}
      {unlinkedCoverLetters.length > 0 && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              {associationDict.linkExisting || 'Link Existing Cover Letter'}
            </div>
          </label>
          <div className="relative flex gap-2">
            {isLinking && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 dark:bg-slate-800/50">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              </div>
            )}
            <select
              value={selectedUnlinkedId}
              onChange={(e) => setSelectedUnlinkedId(e.target.value)}
              disabled={isLinking || isLoading}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">
                {associationDict.selectCoverLetter || 'Select a cover letter...'}
              </option>
              {unlinkedCoverLetters.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.title || (associationDict.untitledCoverLetter || 'Untitled')}
                  {cl.company_name ? ` - ${cl.company_name}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleLinkCoverLetter}
              disabled={!selectedUnlinkedId || isLinking || isLoading}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {isLinking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {isLinking
                ? associationDict.linking || 'Linking...'
                : associationDict.link || 'Link'}
            </button>
          </div>
          {linkError && <p className="text-xs text-red-600 dark:text-red-400">{linkError}</p>}
        </div>
      )}

      {/* Create Cover Letter Button */}
      <Link
        href={createCoverLetterUrl}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
      >
        <Plus className="h-4 w-4" />
        {associationDict.createCoverLetter || 'Create Cover Letter'}
      </Link>

      {/* Hint Text */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {associationDict.hint ||
          'Cover letters linked to this resume will use your experience and skills for AI-powered content generation.'}
      </p>
    </div>
  )
}
