'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BelowThresholdWarningProps {
  /**
   * Controls whether the warning banner is visible.
   * Should be true when the CV score is below the quality threshold.
   */
  isVisible: boolean
  /**
   * The current CV quality score (0-100).
   */
  score: number
  /**
   * The minimum acceptable quality threshold (0-100).
   */
  threshold: number
  /**
   * Callback fired when the user clicks the Regenerate button.
   */
  onRegenerate: () => void
  /**
   * Whether a regeneration is currently in progress.
   * When true, the Regenerate button is disabled and shows a spinner.
   */
  isRegenerating: boolean
  /**
   * Optional className for additional styling.
   */
  className?: string
}

/**
 * BelowThresholdWarning displays an orange warning banner when
 * the CV quality score is below the acceptable threshold.
 *
 * Unlike QualityWarningBanner, this banner is NOT dismissible because
 * the user should address the quality issue. It includes a Regenerate
 * button to trigger a new generation cycle.
 *
 * The user can still use/edit the CV - this is informational, not blocking.
 */
export function BelowThresholdWarning({
  isVisible,
  score,
  threshold,
  onRegenerate,
  isRegenerating,
  className,
}: BelowThresholdWarningProps) {
  // Do not render if not visible
  if (!isVisible) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle
          className="h-5 w-5 flex-shrink-0 text-orange-600"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-orange-800">
          CV quality ({score}%) is below target ({threshold}%). Review the gaps below.
        </p>
      </div>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={isRegenerating}
        className="flex flex-shrink-0 items-center gap-2 rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Regenerate CV"
      >
        <RefreshCw
          className={cn('h-4 w-4', isRegenerating && 'animate-spin')}
          aria-hidden="true"
        />
        {isRegenerating ? 'Regenerating...' : 'Regenerate'}
      </button>
    </div>
  )
}
