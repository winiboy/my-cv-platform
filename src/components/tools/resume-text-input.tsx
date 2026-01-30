'use client'

import { useCallback, useMemo } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Translation strings required by the ResumeTextInput component.
 */
export interface ResumeTextInputTranslations {
  resumeLabel: string
  resumePlaceholder: string
  minCharsError: string
}

interface ResumeTextInputProps {
  /** Current value of the textarea */
  value: string
  /** Callback when value changes */
  onChange: (value: string) => void
  /** Translated UI strings */
  translations: ResumeTextInputTranslations
  /** External error message (e.g., from form validation) */
  error?: string
  /** Minimum characters required for validation (default: 200) */
  minChars?: number
}

/**
 * ResumeTextInput component for entering resume text content.
 * Includes character count, minimum length validation, and clear functionality.
 */
export function ResumeTextInput({
  value,
  onChange,
  translations,
  error,
  minChars = 200,
}: ResumeTextInputProps) {
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
        htmlFor="resume-text-input"
        className="block text-sm font-medium text-slate-900 dark:text-slate-100"
      >
        {translations.resumeLabel}
      </label>

      {/* Textarea container */}
      <div className="relative">
        <textarea
          id="resume-text-input"
          value={value}
          onChange={handleChange}
          placeholder={translations.resumePlaceholder}
          rows={8}
          aria-invalid={showError}
          aria-describedby={showError ? 'resume-text-error' : undefined}
          className={cn(
            'w-full rounded-lg border bg-white dark:bg-slate-900 px-3 sm:px-4 py-3 pr-10 text-sm',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            'transition-all duration-200 outline-none resize-y min-h-[140px] sm:min-h-[160px]',
            'focus:ring-2 focus:ring-offset-0 focus:shadow-sm',
            showError
              ? 'border-red-300 dark:border-red-500 focus:border-red-500 focus:ring-red-500/20'
              : 'border-slate-200 dark:border-slate-600 focus:border-teal-500 focus:ring-teal-500/20 dark:focus:border-teal-400 dark:focus:ring-teal-400/20',
            'text-slate-900 dark:text-slate-100'
          )}
        />

        {/* Clear button - only visible when content exists */}
        {hasContent && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear resume text"
            className={cn(
              'absolute top-3 right-3 p-1.5 rounded-md',
              'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1'
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
            id="resume-text-error"
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
