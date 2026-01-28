'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QualityWarningBannerProps {
  /**
   * Controls whether the banner is visible.
   * When false, the component renders nothing.
   */
  isVisible: boolean
  /**
   * The warning message to display.
   */
  message: string
  /**
   * Optional className for additional styling.
   */
  className?: string
}

/**
 * QualityWarningBanner displays an amber/yellow warning banner
 * to inform users about potential quality limitations.
 *
 * The banner is dismissible - once the user clicks the X button,
 * it will be hidden for the current session.
 */
export function QualityWarningBanner({
  isVisible,
  message,
  className,
}: QualityWarningBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)

  // Do not render if not visible or already dismissed
  if (!isVisible || isDismissed) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle
          className="h-5 w-5 flex-shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-amber-800">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => setIsDismissed(true)}
        className="flex-shrink-0 rounded-md p-1 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        aria-label="Dismiss warning"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
