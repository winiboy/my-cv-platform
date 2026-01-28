'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2, AlertCircle } from 'lucide-react'
import type { JobApplicationWithRelations, JobStatus } from '@/types/database'
import { JOB_STATUS_CONFIG } from '@/lib/constants/job-statuses'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Zod schema for quick add form validation.
 * Requires job title and company name, optional URL.
 */
const quickAddSchema = z.object({
  job_title: z
    .string()
    .min(1, 'Job title is required')
    .max(255, 'Job title must be less than 255 characters'),
  company_name: z
    .string()
    .min(1, 'Company name is required')
    .max(255, 'Company name must be less than 255 characters'),
  job_url: z
    .string()
    .max(2000, 'URL must be less than 2000 characters')
    .refine(
      (val) => !val || val === '' || isValidUrl(val),
      'Please enter a valid URL'
    )
    .optional()
    .or(z.literal('')),
})

/**
 * Helper to validate URL format.
 * Returns true for valid URLs, false otherwise.
 */
function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

type QuickAddFormData = z.infer<typeof quickAddSchema>

interface QuickAddModalProps {
  /** Whether the modal is currently visible */
  isOpen: boolean
  /** Callback to close the modal */
  onClose: () => void
  /** Callback when a job application is successfully created */
  onSuccess: (newApp: JobApplicationWithRelations) => void
  /** The status to assign to the new job application */
  initialStatus: JobStatus
  /** Current locale for i18n (reserved for future use) */
  locale?: string
  /** Translation dictionary */
  dict: Record<string, unknown>
}

/**
 * QuickAddModal provides a minimal form for quickly adding a job application
 * directly from a Kanban column. It captures the essential information
 * (job title, company, optional URL) and creates the application with the
 * specified status.
 */
export function QuickAddModal({
  isOpen,
  onClose,
  onSuccess,
  initialStatus,
  dict,
}: QuickAddModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // State for API submission errors
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Extract translations
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const quickAddDict = (kanbanDict.quickAdd || {}) as Record<string, string>
  const commonDict = (dict.common || {}) as Record<string, string>
  const statusConfig = JOB_STATUS_CONFIG[initialStatus]

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setFocus,
  } = useForm<QuickAddFormData>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: {
      job_title: '',
      company_name: '',
      job_url: '',
    },
  })

  /**
   * Wrapped close handler that resets form state before calling onClose.
   * This avoids calling setState in an effect and keeps cleanup co-located with the close action.
   */
  const handleClose = useCallback(() => {
    reset()
    setSubmitError(null)
    onClose()
  }, [reset, onClose])

  /**
   * Focus the first input when modal opens.
   */
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        setFocus('job_title')
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen, setFocus])

  /**
   * Handle click outside modal to close.
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        handleClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, handleClose])

  /**
   * Handle Escape key to close modal.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleClose])

  /**
   * Trap focus within the modal for accessibility.
   */
  useEffect(() => {
    if (!isOpen) return

    const modal = modalRef.current
    if (!modal) return

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleTabKey)
    return () => document.removeEventListener('keydown', handleTabKey)
  }, [isOpen])

  /**
   * Clear submit error when user starts typing.
   */
  const clearSubmitError = useCallback(() => {
    if (submitError) {
      setSubmitError(null)
    }
  }, [submitError])

  /**
   * Submit handler - creates the job application via API.
   */
  const onSubmit = useCallback(
    async (data: QuickAddFormData) => {
      // Clear any previous submission error
      setSubmitError(null)

      try {
        const response = await fetch('/api/job-applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_title: data.job_title.trim(),
            company_name: data.company_name.trim(),
            job_url: data.job_url?.trim() || null,
            status: initialStatus,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage =
            errorData.error || 'Failed to create job application. Please try again.'
          setSubmitError(errorMessage)
          return
        }

        const result = await response.json()

        // Create a JobApplicationWithRelations object for optimistic update
        const newApp: JobApplicationWithRelations = {
          ...result.jobApplication,
          resume: null,
          cover_letter: null,
        }

        onSuccess(newApp)
      } catch (error) {
        // Network or unexpected errors
        console.error('[QuickAddModal] Error creating job application:', error)
        const message =
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred. Please try again.'
        setSubmitError(message)
      }
    },
    [initialStatus, onSuccess]
  )

  // Don't render anything if modal is closed
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Modal content */}
      <div
        ref={modalRef}
        className={cn(
          'relative w-full max-w-md mx-4',
          'bg-white dark:bg-slate-800',
          'rounded-lg shadow-xl',
          'animate-in fade-in-0 zoom-in-95 duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <h2
              id="quick-add-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {quickAddDict.title || 'Quick Add Job'}
            </h2>
            <span
              className={cn(
                'px-2 py-0.5 text-xs font-medium rounded',
                statusConfig.bgColor,
                statusConfig.textColor
              )}
            >
              {statusConfig.label}
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'p-2 -mr-2 rounded-lg',
              'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'focus:outline-none focus:ring-2 focus:ring-teal-500',
              'transition-colors'
            )}
            aria-label={commonDict.cancel || 'Close'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 py-4 space-y-4">
            {/* API Error Alert */}
            {submitError && (
              <div
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg',
                  'bg-red-50 dark:bg-red-900/20',
                  'border border-red-200 dark:border-red-800'
                )}
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  {submitError}
                </p>
              </div>
            )}

            {/* Job Title */}
            <div>
              <label
                htmlFor="quick-add-job-title"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {quickAddDict.jobTitleLabel || 'Job Title'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="quick-add-job-title"
                {...register('job_title', { onChange: clearSubmitError })}
                placeholder={quickAddDict.jobTitlePlaceholder || 'e.g., Software Engineer'}
                aria-invalid={!!errors.job_title}
                aria-describedby={errors.job_title ? 'job-title-error' : undefined}
                disabled={isSubmitting}
              />
              {errors.job_title && (
                <p
                  id="job-title-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {errors.job_title.message}
                </p>
              )}
            </div>

            {/* Company Name */}
            <div>
              <label
                htmlFor="quick-add-company"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {quickAddDict.companyLabel || 'Company'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="quick-add-company"
                {...register('company_name', { onChange: clearSubmitError })}
                placeholder={quickAddDict.companyPlaceholder || 'e.g., Google'}
                aria-invalid={!!errors.company_name}
                aria-describedby={errors.company_name ? 'company-error' : undefined}
                disabled={isSubmitting}
              />
              {errors.company_name && (
                <p
                  id="company-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {errors.company_name.message}
                </p>
              )}
            </div>

            {/* Job URL (Optional) */}
            <div>
              <label
                htmlFor="quick-add-url"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {quickAddDict.jobUrlLabel || 'Job URL'}{' '}
                <span className="text-slate-400 dark:text-slate-500 font-normal">
                  ({quickAddDict.optional || 'optional'})
                </span>
              </label>
              <Input
                id="quick-add-url"
                type="url"
                {...register('job_url', { onChange: clearSubmitError })}
                placeholder={quickAddDict.jobUrlPlaceholder || 'https://...'}
                aria-invalid={!!errors.job_url}
                aria-describedby={errors.job_url ? 'url-error' : undefined}
                disabled={isSubmitting}
              />
              {errors.job_url && (
                <p
                  id="url-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {errors.job_url.message}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-lg">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {commonDict.cancel || 'Cancel'}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {quickAddDict.saving || 'Saving...'}
                </>
              ) : (
                quickAddDict.save || 'Save'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
