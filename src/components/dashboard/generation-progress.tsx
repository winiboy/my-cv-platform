'use client'

import { Loader2 } from 'lucide-react'

interface GenerationProgressProps {
  /** Whether the progress indicator is visible */
  isVisible: boolean
  /** Current iteration number (1, 2, or 3) */
  currentIteration: number
  /** Maximum number of iterations (default: 3) */
  maxIterations?: number
}

/**
 * Displays CV generation progress with iteration count.
 * Shows different messages based on the current iteration:
 * - First iteration: "Generating CV..."
 * - Subsequent iterations: "Improving CV... attempt X/Y"
 */
export function GenerationProgress({
  isVisible,
  currentIteration,
  maxIterations = 3,
}: GenerationProgressProps) {
  if (!isVisible) {
    return null
  }

  const message =
    currentIteration === 1
      ? 'Generating CV...'
      : `Improving CV... attempt ${currentIteration}/${maxIterations}`

  return (
    <div className="flex items-center gap-2 rounded-lg bg-purple-50 px-4 py-2 text-sm text-purple-700">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{message}</span>
    </div>
  )
}
