'use client'

import { useState } from 'react'
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScoringItem } from '@/lib/ai/relevance-scorer'

interface GapAnalysisPanelProps {
  /**
   * Controls whether the panel is visible.
   * When false, the component renders nothing.
   * Should be true only when CV was created from a job.
   */
  isVisible: boolean
  /**
   * Items from job requirements that were found in the CV.
   */
  matchedItems: ScoringItem[]
  /**
   * Items from job requirements that were NOT found in the CV.
   */
  missingItems: ScoringItem[]
  /**
   * Optional className for additional styling.
   */
  className?: string
}

/**
 * GapAnalysisPanel displays a collapsible panel showing matched and missing
 * items when comparing a CV against job requirements.
 *
 * The panel is collapsed by default, showing a summary of matched/missing counts.
 * When expanded, it displays two sections with green checkmarks for matched items
 * and red X icons for missing items.
 */
export function GapAnalysisPanel({
  isVisible,
  matchedItems,
  missingItems,
  className,
}: GapAnalysisPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Do not render if not visible
  if (!isVisible) {
    return null
  }

  const matchedCount = matchedItems.length
  const missingCount = missingItems.length

  /**
   * Formats the category label for display.
   * Capitalizes first letter.
   */
  const formatCategory = (category: ScoringItem['category']): string => {
    return category.charAt(0).toUpperCase() + category.slice(1)
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white',
        className
      )}
    >
      {/* Collapsed Header / Toggle Button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500"
        aria-expanded={isExpanded}
        aria-controls="gap-analysis-content"
      >
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-700">
            Gap Analysis
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <Check className="h-4 w-4" aria-hidden="true" />
              {matchedCount} matched
            </span>
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <X className="h-4 w-4" aria-hidden="true" />
              {missingCount} missing
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400" aria-hidden="true" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div
          id="gap-analysis-content"
          className="border-t border-slate-200 px-4 py-4"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Matched Section */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                Matched ({matchedCount})
              </h4>
              {matchedItems.length > 0 ? (
                <ul className="space-y-2">
                  {matchedItems.map((item, index) => (
                    <li
                      key={`matched-${index}`}
                      className="flex items-start gap-2"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500"
                        aria-hidden="true"
                      />
                      <div>
                        <span className="text-sm text-slate-700">
                          {item.item}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          ({formatCategory(item.category)})
                        </span>
                        {item.matchedIn && (
                          <span className="ml-1 text-xs text-slate-400">
                            - {item.matchedIn}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No matched items</p>
              )}
            </div>

            {/* Missing Section */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700">
                <X className="h-4 w-4" aria-hidden="true" />
                Missing ({missingCount})
              </h4>
              {missingItems.length > 0 ? (
                <ul className="space-y-2">
                  {missingItems.map((item, index) => (
                    <li
                      key={`missing-${index}`}
                      className="flex items-start gap-2"
                    >
                      <X
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
                        aria-hidden="true"
                      />
                      <div>
                        <span className="text-sm text-slate-700">
                          {item.item}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          ({formatCategory(item.category)})
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No missing items</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
