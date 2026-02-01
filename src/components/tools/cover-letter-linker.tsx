'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Mail, Loader2, Plus, X, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { CoverLetter } from '@/types/database'

/**
 * Minimal cover letter data needed for the linker display.
 * Only fetches fields required for listing and selection.
 */
type CoverLetterSummary = Pick<CoverLetter, 'id' | 'title' | 'company_name' | 'updated_at' | 'created_at'>

/**
 * Translation strings required by the CoverLetterLinker component.
 */
export interface CoverLetterLinkerTranslations {
  selectCoverLetterDropdown: string
  noCoverLettersAvailable: string
  createCoverLetterPrompt: string
  company: string
  lastUpdated: string
  loadingCoverLetters: string
  tryAgain: string
  loginRequired: string
  loadError: string
  createCoverLetter: string
  clearSelection: string
}

interface CoverLetterLinkerProps {
  /** Callback when a cover letter is selected */
  onSelect: (coverLetterId: string) => void
  /** Callback when selection is cleared */
  onClear: () => void
  /** Currently selected cover letter ID */
  selectedCoverLetterId: string | null
  /** Locale for navigation links and date formatting */
  locale: string
  /** Translated UI strings */
  translations: CoverLetterLinkerTranslations
  /** Optional max height class for dropdown (default: 'max-h-60') */
  dropdownMaxHeight?: string
}

/**
 * CoverLetterLinker component for linking a user's saved cover letter.
 * Displays as a compact dropdown selector with cover letter title and company name.
 * Fetches cover letters from Supabase when rendered if user is authenticated.
 */
export function CoverLetterLinker({
  onSelect,
  onClear,
  selectedCoverLetterId,
  locale,
  translations,
  dropdownMaxHeight = 'max-h-60',
}: CoverLetterLinkerProps) {
  const [coverLetters, setCoverLetters] = useState<CoverLetterSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  const fetchCoverLetters = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Verify user is authenticated before querying
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsAuthenticated(false)
        setIsLoading(false)
        return
      }

      setIsAuthenticated(true)

      // RLS ensures we only get the current user's cover letters
      const { data, error: fetchError } = await supabase
        .from('cover_letters')
        .select('id, title, company_name, updated_at, created_at')
        .order('updated_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      setCoverLetters(data || [])
    } catch (err) {
      console.error('Error fetching cover letters:', err)
      setError(translations.loadError)
    } finally {
      setIsLoading(false)
    }
  }, [translations.loadError])

  useEffect(() => {
    fetchCoverLetters()
  }, [fetchCoverLetters])

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

  /**
   * Get the selected cover letter object
   */
  const selectedCoverLetter = coverLetters.find((cl) => cl.id === selectedCoverLetterId)

  /**
   * Handle cover letter selection
   */
  const handleSelect = (coverLetterId: string) => {
    onSelect(coverLetterId)
    setIsOpen(false)
  }

  /**
   * Handle clear selection
   */
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClear()
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4 px-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
        <Loader2 className="h-5 w-5 text-teal-600 animate-spin mr-2" />
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {translations.loadingCoverLetters}
        </span>
      </div>
    )
  }

  // Not authenticated state
  if (isAuthenticated === false) {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {translations.loginRequired}
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        <button
          onClick={fetchCoverLetters}
          className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
        >
          {translations.tryAgain}
        </button>
      </div>
    )
  }

  // Empty state - no cover letters
  if (coverLetters.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-6 text-center">
        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
          <Mail className="h-6 w-6 text-slate-400 dark:text-slate-500" />
        </div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
          {translations.noCoverLettersAvailable}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
          {translations.createCoverLetterPrompt}
        </p>
        <Link
          href={`/${locale}/tools/cover-letter-generator`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          {translations.createCoverLetter}
        </Link>
      </div>
    )
  }

  // Dropdown selector
  return (
    <div className="relative">
      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-all',
          'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
          selectedCoverLetterId
            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-400'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={cn(
              'w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0',
              selectedCoverLetterId
                ? 'bg-teal-100 dark:bg-teal-800/50'
                : 'bg-slate-100 dark:bg-slate-700'
            )}
          >
            <Mail
              className={cn(
                'h-4 w-4',
                selectedCoverLetterId
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            />
          </div>
          {selectedCoverLetter ? (
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm font-medium truncate',
                  'text-teal-900 dark:text-teal-100'
                )}
              >
                {selectedCoverLetter.title}
              </p>
              <p className="text-xs text-teal-700 dark:text-teal-300">
                {selectedCoverLetter.company_name
                  ? `${translations.company}: ${selectedCoverLetter.company_name}`
                  : `${translations.lastUpdated} ${formatDate(selectedCoverLetter.updated_at || selectedCoverLetter.created_at)}`
                }
              </p>
            </div>
          ) : (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {translations.selectCoverLetterDropdown}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedCoverLetterId && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleClear}
              className="h-6 w-6 rounded-full hover:bg-teal-200 dark:hover:bg-teal-800"
              aria-label={translations.clearSelection}
            >
              <X className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
            </Button>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              selectedCoverLetterId
                ? 'text-teal-700 dark:text-teal-300'
                : 'text-slate-400 dark:text-slate-500',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <>
          {/* Backdrop to close dropdown on outside click */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <ul
            role="listbox"
            className={cn(
              'absolute z-20 w-full mt-1 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700',
              'shadow-lg overflow-auto',
              dropdownMaxHeight
            )}
          >
            {coverLetters.map((coverLetter) => {
              const isSelected = selectedCoverLetterId === coverLetter.id
              const lastModified = coverLetter.updated_at || coverLetter.created_at

              return (
                <li
                  key={coverLetter.id}
                  role="option"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(coverLetter.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-900/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    )}
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                        isSelected
                          ? 'bg-teal-100 dark:bg-teal-800/50'
                          : 'bg-slate-100 dark:bg-slate-700'
                      )}
                    >
                      <Mail
                        className={cn(
                          'h-3.5 w-3.5',
                          isSelected
                            ? 'text-teal-600 dark:text-teal-400'
                            : 'text-slate-500 dark:text-slate-400'
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm font-medium truncate',
                          isSelected
                            ? 'text-teal-900 dark:text-teal-100'
                            : 'text-slate-900 dark:text-slate-100'
                        )}
                      >
                        {coverLetter.title}
                      </p>
                      <p
                        className={cn(
                          'text-xs',
                          isSelected
                            ? 'text-teal-700 dark:text-teal-300'
                            : 'text-slate-500 dark:text-slate-400'
                        )}
                      >
                        {coverLetter.company_name
                          ? coverLetter.company_name
                          : `${translations.lastUpdated} ${formatDate(lastModified)}`
                        }
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center flex-shrink-0">
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
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
