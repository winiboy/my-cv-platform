'use client'

import { useCallback, useMemo } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Translation strings required by the JobDescriptionInput component.
 */
export interface JobDescriptionInputTranslations {
  jobLabel: string
  jobPlaceholder: string
  minCharsError: string
}

interface JobDescriptionInputProps {
  /** Current value of the textarea */
  value: string
  /** Callback when value changes */
  onChange: (value: string) => void
  /** Translated UI strings */
  translations: JobDescriptionInputTranslations
  /** External error message (e.g., from form validation) */
  error?: string
  /** Minimum characters required for validation (default: 100) */
  minChars?: number
}

/**
 * JobDescriptionInput component for entering job description text.
 * Includes character count, minimum length validation, and clear functionality.
 */
export function JobDescriptionInput({
  value,
  onChange,
  translations,
  error,
  minChars = 100,
}: JobDescriptionInputProps) {
  const characterCount = value.length
  const isBelowMinimum = characterCount > 0 && characterCount < minChars
  const hasContent = characterCount > 0

  // Determine if we should show an error (external error or min chars validation)
  const showError = Boolean(error) || isBelowMinimum

  // Build the error message - external error takes precedence
  const errorMessage = useMemo(() => {
    if (error) return error
    if (isBelowMinimum) {
      return translations.minCharsError.replace('{count}', String(minChars))
    }
    return null
  }, [error, isBelowMinimum, translations.minCharsError, minChars])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
    },
    [onChange]
  )

  const handleClear = useCallback(() => {
    onChange('')
  }, [onChange])

  // Format character count with thousands separator
  const formattedCount = new Intl.NumberFormat().format(characterCount)

  return (
    <div className="space-y-2">
      {/* Label */}
      <label
        htmlFor="job-description-input"
        className="block text-sm font-medium text-slate-900 dark:text-slate-100"
      >
        {translations.jobLabel}
      </label>

      {/* Textarea container */}
      <div className="relative">
        <textarea
          id="job-description-input"
          value={value}
          onChange={handleChange}
          placeholder={translations.jobPlaceholder}
          rows={8}
          aria-invalid={showError}
          aria-describedby={showError ? 'job-description-error' : undefined}
          className={cn(
            'w-full rounded-lg border bg-white dark:bg-slate-800 px-4 py-3 pr-10 text-sm',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            'transition-colors outline-none resize-y min-h-[160px]',
            'focus:ring-2 focus:ring-offset-0',
            showError
              ? 'border-red-500 dark:border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : 'border-slate-200 dark:border-slate-700 focus:border-teal-500 focus:ring-teal-500/20',
            'text-slate-900 dark:text-slate-100'
          )}
        />

        {/* Clear button - only visible when content exists */}
        {hasContent && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear job description"
            className={cn(
              'absolute top-3 right-3 p-1 rounded-md',
              'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500'
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Footer: Character count and error message */}
      <div className="flex items-center justify-between gap-4">
        {/* Error message */}
        {showError && errorMessage ? (
          <p
            id="job-description-error"
            className="text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : (
          <span />
        )}

        {/* Character count */}
        <p
          className={cn(
            'text-xs tabular-nums',
            showError
              ? 'text-red-600 dark:text-red-400'
              : 'text-slate-500 dark:text-slate-400'
          )}
        >
          {formattedCount} characters
        </p>
      </div>
    </div>
  )
}
