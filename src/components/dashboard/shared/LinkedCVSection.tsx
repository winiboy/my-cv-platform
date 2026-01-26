'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FileText, Plus, ExternalLink, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEntityLinking } from '@/lib/hooks/useEntityLinking'
import { ResumeAssociationSelector } from '../resume-association-selector'

/**
 * Resume data structure for display and selection
 */
interface ResumeData {
  id: string
  title: string
}

/**
 * Props for the LinkedCVSection component
 */
export interface LinkedCVSectionProps {
  /** Type of entity being linked: 'coverLetter' or 'jobApplication' */
  entityType: 'coverLetter' | 'jobApplication'
  /** ID of the entity (cover letter or job application) */
  entityId: string
  /** Current locale for i18n routing */
  locale: string
  /** Dictionary containing i18n translations */
  dict: Record<string, unknown>
}

/**
 * Shared component for linking/unlinking resumes to cover letters or job applications.
 *
 * This component provides a unified UI for the "Linked CV" section that is used
 * in both the Cover Letter and Job Application editors. It uses the centralized
 * useEntityLinking hook for all linking operations, ensuring consistent
 * bidirectional sync between entities.
 *
 * Features:
 * - Dropdown selector to choose from saved resumes
 * - Display of currently linked resume title
 * - View link to open the resume
 * - View Resume navigation button
 * - Create New Resume navigation button
 * - Loading overlay during operations
 * - Empty, linked, loading, and error states
 */
export function LinkedCVSection({
  entityType,
  entityId,
  locale,
  dict,
}: LinkedCVSectionProps) {
  // Use the centralized entity linking hook
  const {
    linkedResume,
    linkResume,
    unlinkResume,
    isLoading: hookLoading,
    error: hookError,
  } = useEntityLinking({ entityType, entityId })

  // Local state for resumes list and UI operations
  const [resumes, setResumes] = useState<ResumeData[]>([])
  const [isLoadingResumes, setIsLoadingResumes] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  // Extract i18n strings from dict
  const commonDict = (dict.common || {}) as Record<string, string>
  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const associationDict = (coverLettersDict.association || {}) as Record<string, string>

  /**
   * Fetch available resumes for the dropdown selector.
   * Orders by most recently updated.
   */
  useEffect(() => {
    const fetchResumes = async () => {
      setIsLoadingResumes(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('resumes')
          .select('id, title')
          .order('updated_at', { ascending: false })

        if (error) {
          console.error('Error fetching resumes:', error)
          return
        }

        setResumes(
          (data || []).map((r) => ({
            id: r.id,
            title: r.title || '',
          }))
        )
      } catch (err) {
        console.error('Unexpected error fetching resumes:', err)
      } finally {
        setIsLoadingResumes(false)
      }
    }

    fetchResumes()
  }, [])

  /**
   * Handles resume selection changes from the dropdown.
   * Links or unlinks the resume based on the selection.
   */
  const handleResumeChange = useCallback(
    async (resumeId: string | null) => {
      setIsUpdating(true)
      try {
        if (resumeId) {
          await linkResume(resumeId)
        } else {
          await unlinkResume()
        }
      } finally {
        setIsUpdating(false)
      }
    },
    [linkResume, unlinkResume]
  )

  // Current resume ID for the selector
  const currentResumeId = linkedResume?.id || null

  // Selected resume for display (fallback to local list for title)
  const selectedResume = linkedResume
    ? {
        id: linkedResume.id,
        title: linkedResume.title || resumes.find((r) => r.id === linkedResume.id)?.title || '',
      }
    : null

  // Combined loading state
  const isLoading = hookLoading || isLoadingResumes

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {associationDict.linkedCV || 'Linked CV'}
        </h3>
      </div>

      {/* Current Selection Display */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{commonDict.loading || 'Loading...'}</span>
          </div>
        ) : selectedResume ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {selectedResume.title || (associationDict.untitledResume || 'Untitled Resume')}
            </span>
            <Link
              href={`/${locale}/dashboard/resumes/${currentResumeId}/edit`}
              className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
              title={associationDict.viewResume || 'View Resume'}
            >
              <ExternalLink className="h-3 w-3" />
              {associationDict.view || 'View'}
            </Link>
          </div>
        ) : (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {associationDict.noResumeLinked || 'No resume linked'}
          </span>
        )}
      </div>

      {/* Error Display */}
      {hookError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{hookError}</p>
        </div>
      )}

      {/* Resume Selector Dropdown */}
      <div className="relative">
        {isUpdating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 dark:bg-slate-800/50">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
          </div>
        )}
        <ResumeAssociationSelector
          currentResumeId={currentResumeId}
          resumes={resumes}
          onChange={handleResumeChange}
          locale={locale}
          dict={dict}
          disabled={isUpdating || isLoading}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {currentResumeId && (
          <Link
            href={`/${locale}/dashboard/resumes/${currentResumeId}/edit`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {associationDict.viewResume || 'View Resume'}
          </Link>
        )}
        <Link
          href={`/${locale}/dashboard/resumes/new`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {associationDict.createNew || 'Create New'}
        </Link>
      </div>

      {/* Hint Text */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {associationDict.hint ||
          'Link a resume to use your experience and skills when generating cover letter content with AI.'}
      </p>
    </div>
  )
}
