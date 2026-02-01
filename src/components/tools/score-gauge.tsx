'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Size configuration for the gauge component.
 * Defines dimensions and typography for each size variant.
 */
const SIZE_CONFIG = {
  sm: {
    width: 80,
    height: 80,
    strokeWidth: 6,
    radius: 34,
    fontSize: 'text-xl',
    labelSize: 'text-xs',
  },
  md: {
    width: 120,
    height: 120,
    strokeWidth: 8,
    radius: 52,
    fontSize: 'text-3xl',
    labelSize: 'text-sm',
  },
  lg: {
    width: 160,
    height: 160,
    strokeWidth: 10,
    radius: 70,
    fontSize: 'text-4xl',
    labelSize: 'text-base',
  },
} as const

type GaugeSize = keyof typeof SIZE_CONFIG

/**
 * Color thresholds for the score gauge.
 * Scores >= greenThreshold are green, >= yellowThreshold are yellow, below are red.
 */
export interface ScoreThresholds {
  /** Score threshold for green color (default: 80) */
  green: number
  /** Score threshold for yellow color (default: 60) */
  yellow: number
}

/** Default thresholds used for resume-related tools */
const DEFAULT_THRESHOLDS: ScoreThresholds = {
  green: 80,
  yellow: 60,
}

/** Alternative thresholds commonly used for cover letter analysis */
export const COVER_LETTER_THRESHOLDS: ScoreThresholds = {
  green: 75,
  yellow: 50,
}

interface ScoreGaugeProps {
  /** Score value from 0 to 100 */
  score: number
  /** Size variant of the gauge */
  size?: GaugeSize
  /** Optional CSS class name for the container */
  className?: string
  /** Optional label displayed below the score */
  label?: string
  /** Custom color thresholds (defaults to 80/60) */
  thresholds?: ScoreThresholds
}

/**
 * Determines the color class based on the score value and thresholds.
 * - Green (teal) for scores at or above green threshold
 * - Amber/yellow for scores at or above yellow threshold
 * - Red for scores below yellow threshold
 */
function getScoreColor(
  score: number,
  thresholds: ScoreThresholds = DEFAULT_THRESHOLDS
): {
  stroke: string
  text: string
  bg: string
} {
  if (score >= thresholds.green) {
    return {
      stroke: 'stroke-teal-500',
      text: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-900/20',
    }
  }
  if (score >= thresholds.yellow) {
    return {
      stroke: 'stroke-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    }
  }
  return {
    stroke: 'stroke-red-500',
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
  }
}

/**
 * ScoreGauge displays a score (0-100) as a circular progress gauge.
 * Features animated fill on mount and color-coding based on score thresholds.
 *
 * @example
 * ```tsx
 * <ScoreGauge score={85} size="md" />
 * // With custom thresholds for cover letter checker
 * <ScoreGauge score={70} thresholds={COVER_LETTER_THRESHOLDS} label="Overall Score" />
 * ```
 */
export function ScoreGauge({
  score,
  size = 'md',
  className,
  label,
  thresholds = DEFAULT_THRESHOLDS,
}: ScoreGaugeProps) {
  // Clamp score to valid range
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))

  // State for animation - starts at 0 and animates to actual score
  const [animatedProgress, setAnimatedProgress] = useState(0)

  const config = SIZE_CONFIG[size]
  const colors = getScoreColor(clampedScore, thresholds)

  // Calculate SVG circle properties
  const circumference = 2 * Math.PI * config.radius
  const strokeDashoffset = circumference - (animatedProgress / 100) * circumference

  // Center point of the SVG
  const center = config.width / 2

  // Trigger animation on mount (respects reduced motion preference)
  useEffect(() => {
    // Check for reduced motion preference (must be inside effect for SSR safety)
    const prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

    // Determine the delay: instant for reduced motion, slight delay for animation
    const delay = prefersReducedMotion ? 0 : 50

    // Small delay to ensure the initial state is rendered before animating
    const timer = setTimeout(() => {
      setAnimatedProgress(clampedScore)
    }, delay)

    return () => clearTimeout(timer)
  }, [clampedScore])

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-2', className)}
      role="img"
      aria-label={label ? `${label}: ${clampedScore} out of 100` : `Score: ${clampedScore} out of 100`}
    >
      {/* Circular gauge container */}
      <div className="relative inline-flex items-center justify-center">
        <svg
          width={config.width}
          height={config.height}
          viewBox={`0 0 ${config.width} ${config.height}`}
          className="transform -rotate-90"
          aria-hidden="true"
        >
          {/* Background ring */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            fill="none"
            strokeWidth={config.strokeWidth}
            className="stroke-slate-200 dark:stroke-slate-700"
          />

          {/* Progress ring */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            fill="none"
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn(
              colors.stroke,
              'transition-[stroke-dashoffset] duration-1000 ease-out',
              'motion-reduce:transition-none'
            )}
          />
        </svg>

        {/* Score number in center */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span
            className={cn(
              config.fontSize,
              colors.text,
              'font-bold tabular-nums leading-none'
            )}
          >
            {clampedScore}
          </span>
        </div>
      </div>

      {/* Optional label below the gauge */}
      {label && (
        <span
          className={cn(
            config.labelSize,
            'font-medium text-slate-600 dark:text-slate-400'
          )}
          aria-hidden="true"
        >
          {label}
        </span>
      )}

      {/* Hidden text for screen readers */}
      <span className="sr-only">
        {label ? `${label}: ${clampedScore} out of 100` : `Score: ${clampedScore} out of 100`}
      </span>
    </div>
  )
}
