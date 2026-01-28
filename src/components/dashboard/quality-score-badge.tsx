'use client'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface QualityScoreBadgeProps {
  /** The quality score as a percentage (0-100), or null if not available */
  score: number | null
  /** Whether the badge should be visible (typically true when CV was created from a job) */
  isVisible: boolean
}

/**
 * Displays a CV quality/match score as a colored badge with tooltip.
 * Colors indicate score quality: red (<50), yellow (50-70), green (>70).
 * Only renders when isVisible is true and score is not null.
 */
export function QualityScoreBadge({ score, isVisible }: QualityScoreBadgeProps) {
  // Do not render if not visible or score is null
  if (!isVisible || score === null) {
    return null
  }

  // Determine background color based on score thresholds
  const getBackgroundColor = (value: number): string => {
    if (value < 50) {
      return 'bg-red-500'
    }
    if (value <= 70) {
      return 'bg-yellow-500'
    }
    return 'bg-green-500'
  }

  // Determine text color for contrast
  const getTextColor = (value: number): string => {
    // Yellow needs dark text for better contrast
    if (value >= 50 && value <= 70) {
      return 'text-slate-900'
    }
    return 'text-white'
  }

  const bgColor = getBackgroundColor(score)
  const textColor = getTextColor(score)

  const tooltipMessage =
    'This score indicates how well your CV matches the linked job description. ' +
    'A higher score means better alignment with the job requirements.'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bgColor} ${textColor} cursor-help`}
          >
            Match: {score}%
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-sm">
          <p>{tooltipMessage}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
