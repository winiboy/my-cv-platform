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

interface ScoreGaugeProps {
  /** Score value from 0 to 100 */
  score: number
  /** Size variant of the gauge */
  size?: GaugeSize
  /** Optional CSS class name for the container */
  className?: string
}

/**
 * Determines the color class based on the score value.
 * - Green (teal) for scores 80 and above
 * - Amber/yellow for scores 60-79
 * - Red for scores below 60
 */
function getScoreColor(score: number): {
  stroke: string
  text: string
  bg: string
} {
  if (score >= 80) {
    return {
      stroke: 'stroke-teal-500',
      text: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-900/20',
    }
  }
  if (score >= 60) {
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
 * ```
 */
export function ScoreGauge({
  score,
  size = 'md',
  className,
}: ScoreGaugeProps) {
  // Clamp score to valid range
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))

  // State for animation - starts at 0 and animates to actual score
  const [animatedProgress, setAnimatedProgress] = useState(0)

  const config = SIZE_CONFIG[size]
  const colors = getScoreColor(clampedScore)

  // Calculate SVG circle properties
  const circumference = 2 * Math.PI * config.radius
  const strokeDashoffset = circumference - (animatedProgress / 100) * circumference

  // Center point of the SVG
  const center = config.width / 2

  // Trigger animation on mount
  useEffect(() => {
    // Small delay to ensure the initial state is rendered before animating
    const timer = setTimeout(() => {
      setAnimatedProgress(clampedScore)
    }, 50)

    return () => clearTimeout(timer)
  }, [clampedScore])

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="img"
      aria-label={`Score: ${clampedScore} out of 100`}
    >
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
            'transition-[stroke-dashoffset] duration-1000 ease-out'
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

      {/* Hidden text for screen readers */}
      <span className="sr-only">
        Score: {clampedScore} out of 100
      </span>
    </div>
  )
}
