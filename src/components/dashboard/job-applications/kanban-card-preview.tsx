'use client'

import { DollarSign, Calendar, FileText, Clock } from 'lucide-react'
import type { JobApplicationWithRelations, JobInterview } from '@/types/database'
import type { Json } from '@/types/supabase'

interface KanbanCardPreviewProps {
  jobApplication: JobApplicationWithRelations
  locale: string
  dict: Record<string, unknown>
}

/**
 * Maximum characters to display for notes excerpt before truncation.
 */
const NOTES_MAX_LENGTH = 100

/**
 * KanbanCardPreview displays quick details about a job application
 * in a tooltip that appears on card hover.
 *
 * Shows:
 * - Salary range (if available)
 * - Next interview date (parsed from interviews JSON array)
 * - Notes excerpt (truncated)
 * - Application deadline (if set)
 */
export function KanbanCardPreview({
  jobApplication,
  locale,
  dict,
}: KanbanCardPreviewProps) {
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const previewDict = (kanbanDict.preview || {}) as Record<string, string>

  /**
   * Format a date string for display.
   * Uses locale-aware formatting for consistency.
   */
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  /**
   * Parse interviews JSON and find the next upcoming interview.
   * Returns the nearest future interview date, or null if none found.
   */
  const getNextInterview = (): JobInterview | null => {
    if (!jobApplication.interviews) return null

    // Type-safe parsing of JSONB interviews array
    const interviews = jobApplication.interviews as Json

    if (!Array.isArray(interviews)) return null

    const now = new Date()
    // Cast through unknown to satisfy TypeScript strict mode
    const typedInterviews = interviews as unknown as JobInterview[]
    const futureInterviews = typedInterviews
      .filter((interview) => {
        if (!interview.date) return false
        const interviewDate = new Date(interview.date)
        return interviewDate >= now
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return futureInterviews[0] || null
  }

  /**
   * Truncate notes to max length with ellipsis.
   */
  const truncateNotes = (notes: string): string => {
    if (notes.length <= NOTES_MAX_LENGTH) return notes
    return notes.slice(0, NOTES_MAX_LENGTH).trim() + '...'
  }

  /**
   * Get interview type label.
   * Uses dictionary for i18n or falls back to formatted type name.
   */
  const getInterviewTypeLabel = (type: JobInterview['type']): string => {
    const typeLabels = (previewDict.interviewTypes || {}) as Record<string, string>
    return typeLabels[type] || type.replace(/_/g, ' ')
  }

  const nextInterview = getNextInterview()
  const hasDetails =
    jobApplication.salary_range ||
    nextInterview ||
    jobApplication.notes ||
    jobApplication.deadline

  // When no additional details exist, show a "no details" message
  if (!hasDetails) {
    return (
      <div className="min-w-[200px] max-w-[280px]">
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
          {previewDict.noDetails || 'No additional details'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-w-[200px] max-w-[280px] space-y-2">
      {/* Salary Range */}
      {jobApplication.salary_range && (
        <div className="flex items-start gap-2">
          <DollarSign className="h-4 w-4 flex-shrink-0 text-emerald-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {previewDict.salary || 'Salary'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {jobApplication.salary_range}
            </p>
          </div>
        </div>
      )}

      {/* Next Interview */}
      {nextInterview && (
        <div className="flex items-start gap-2">
          <Calendar className="h-4 w-4 flex-shrink-0 text-blue-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {previewDict.nextInterview || 'Next Interview'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {formatDate(nextInterview.date)}
              {' - '}
              <span className="capitalize">
                {getInterviewTypeLabel(nextInterview.type)}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Notes Excerpt */}
      {jobApplication.notes && (
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 flex-shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {previewDict.notes || 'Notes'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {truncateNotes(jobApplication.notes)}
            </p>
          </div>
        </div>
      )}

      {/* Deadline */}
      {jobApplication.deadline && (
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {previewDict.deadline || 'Deadline'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {formatDate(jobApplication.deadline)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
