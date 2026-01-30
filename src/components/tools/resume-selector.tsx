'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FileText, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Resume } from '@/types/database'

/**
 * Minimal resume data needed for the selector display.
 * Only fetches fields required for listing and selection.
 */
type ResumeSummary = Pick<Resume, 'id' | 'title' | 'updated_at' | 'created_at'>

interface ResumeSelectorProps {
  /** Callback when a resume is selected */
  onSelect: (resumeId: string) => void
  /** Currently selected resume ID for controlled selection */
  selectedId: string | null
  /** Locale for navigation links */
  locale: string
}

/**
 * ResumeSelector component for selecting a user's saved resume.
 * Fetches resumes from Supabase and displays them as selectable cards.
 */
export function ResumeSelector({
  onSelect,
  selectedId,
  locale,
}: ResumeSelectorProps) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchResumes = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Verify user is authenticated before querying
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Please log in to view your resumes')
        setIsLoading(false)
        return
      }

      // RLS ensures we only get the current user's resumes
      const { data, error: fetchError } = await supabase
        .from('resumes')
        .select('id, title, updated_at, created_at')
        .order('updated_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      setResumes(data || [])
    } catch (err) {
      console.error('Error fetching resumes:', err)
      setError('Failed to load resumes. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchResumes()
  }, [fetchResumes])

  /**
   * Format date to a human-readable string based on locale
   */
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-10 w-10 text-teal-600 animate-spin" />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Loading your resumes...
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        <button
          onClick={fetchResumes}
          className="mt-4 text-sm text-red-600 dark:text-red-400 hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  // Empty state
  if (resumes.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          No resumes found
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Create your first resume to get started with the analysis.
        </p>
        <Link
          href={`/${locale}/dashboard/resumes`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Resume
        </Link>
      </div>
    )
  }

  // Resumes grid
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {resumes.map((resume) => {
        const isSelected = selectedId === resume.id
        const lastModified = resume.updated_at || resume.created_at

        return (
          <button
            key={resume.id}
            type="button"
            onClick={() => onSelect(resume.id)}
            aria-pressed={isSelected}
            aria-label={`Select resume: ${resume.title}`}
            className={cn(
              'relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all',
              'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
              isSelected
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-400'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            )}
          >
            {/* Selection indicator */}
            {isSelected && (
              <div className="absolute top-3 right-3 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center">
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            )}

            {/* Resume icon and title */}
            <div className="flex items-start gap-3 w-full">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  isSelected
                    ? 'bg-teal-100 dark:bg-teal-800/50'
                    : 'bg-slate-100 dark:bg-slate-700'
                )}
              >
                <FileText
                  className={cn(
                    'h-5 w-5',
                    isSelected
                      ? 'text-teal-600 dark:text-teal-400'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <h3
                  className={cn(
                    'font-medium truncate',
                    isSelected
                      ? 'text-teal-900 dark:text-teal-100'
                      : 'text-slate-900 dark:text-slate-100'
                  )}
                >
                  {resume.title}
                </h3>
                <p
                  className={cn(
                    'text-xs mt-1',
                    isSelected
                      ? 'text-teal-700 dark:text-teal-300'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  Updated {formatDate(lastModified)}
                </p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
