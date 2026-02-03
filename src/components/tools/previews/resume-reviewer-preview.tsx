'use client'

import { ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Category data for the resume evaluation.
 * Each category has a name, score percentage, and color indicator.
 */
interface EvaluationCategory {
  /** Display name of the category */
  name: string
  /** Score percentage (0-100) */
  score: number
  /** Color for the indicator: 'red' | 'orange' | 'green' */
  color: 'red' | 'orange' | 'green'
  /** Icon component */
  icon: typeof Zap
}

/**
 * Hardcoded sample data matching the screenshot reference.
 * Score: 58/100 (orange - needs improvement), Impact category at 40%.
 */
const SAMPLE_DATA = {
  overallScore: 58,
  maxScore: 100,
  status: 'À améliorer',
  analyzedDate: '9/16/2024, 4:30:00 PM',
  categories: [
    { name: 'Impact', score: 40, color: 'orange', icon: Zap },
  ] satisfies EvaluationCategory[],
}

/**
 * Size configuration for the circular gauge.
 */
const GAUGE_CONFIG = {
  size: 120,
  strokeWidth: 8,
  radius: 52,
}

/**
 * Returns color classes based on score value.
 * - Green (teal) for scores >= 70
 * - Orange for scores >= 40
 * - Red for scores < 40
 */
function getScoreColor(score: number): { stroke: string; text: string } {
  if (score >= 70) {
    return {
      stroke: 'stroke-teal-500',
      text: 'text-teal-600',
    }
  }
  if (score >= 40) {
    return {
      stroke: 'stroke-orange-500',
      text: 'text-orange-500',
    }
  }
  return {
    stroke: 'stroke-red-500',
    text: 'text-red-600',
  }
}

/**
 * Returns color classes for category indicator based on color type.
 */
function getCategoryIndicatorColor(color: EvaluationCategory['color']): {
  bg: string
  text: string
  iconBg: string
  iconText: string
} {
  switch (color) {
    case 'green':
      return {
        bg: 'bg-teal-100',
        text: 'text-teal-600',
        iconBg: 'bg-teal-100',
        iconText: 'text-teal-600',
      }
    case 'orange':
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-600',
        iconBg: 'bg-orange-100',
        iconText: 'text-orange-600',
      }
    case 'red':
    default:
      return {
        bg: 'bg-red-100',
        text: 'text-red-600',
        iconBg: 'bg-red-100',
        iconText: 'text-red-600',
      }
  }
}

/**
 * Circular progress gauge component for displaying the overall score.
 * Uses SVG for the circular progress ring with animated fill.
 * Shows score number in center.
 */
function CircularGauge({ score, maxScore }: { score: number; maxScore: number }) {
  const { size, strokeWidth, radius } = GAUGE_CONFIG
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / maxScore) * circumference
  const center = size / 2
  const colors = getScoreColor(score)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-slate-200"
        />

        {/* Progress ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn(colors.stroke, 'transition-[stroke-dashoffset] duration-700 ease-out')}
        />
      </svg>

      {/* Score number in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-4xl font-bold tabular-nums', colors.text)}>
          {score}
        </span>
      </div>
    </div>
  )
}

/**
 * Category row component displaying a single evaluation category.
 * Shows icon, category name, score percentage, and expand chevron.
 */
function CategoryRow({ category }: { category: EvaluationCategory }) {
  const colors = getCategoryIndicatorColor(category.color)
  const CategoryIcon = category.icon

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
      {/* Category icon with background circle */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full',
          colors.iconBg
        )}
      >
        <CategoryIcon className={cn('w-4 h-4', colors.iconText)} aria-hidden="true" />
      </div>

      {/* Category name */}
      <span className="flex-1 text-sm font-medium text-slate-700">
        {category.name}
      </span>

      {/* Score percentage */}
      <span className={cn('flex-shrink-0 text-sm font-semibold tabular-nums', colors.text)}>
        {category.score}%
      </span>

      {/* Expand chevron */}
      <ChevronRight
        className="flex-shrink-0 w-4 h-4 text-slate-400"
        aria-hidden="true"
      />
    </div>
  )
}

/**
 * ResumeReviewerPreview displays a static preview of Resume Reviewer/Evaluator results.
 * Shows a circular score gauge with overall score out of 100, status indicator,
 * analysis date, and expandable categories section with individual scores.
 *
 * This is a static display component using hardcoded sample data
 * matching the design in Screenshot/3-evaluateur-de-cv.png.
 */
export default function ResumeReviewerPreview() {
  const { overallScore, maxScore, status, analyzedDate, categories } = SAMPLE_DATA
  const statusColors = getScoreColor(overallScore)

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Circular score gauge */}
      <CircularGauge score={overallScore} maxScore={maxScore} />

      {/* Score label */}
      <p className="text-sm font-medium text-slate-700">Score du CV</p>

      {/* Status link */}
      <a
        href="#"
        className={cn(
          'text-sm font-medium hover:underline',
          statusColors.text
        )}
        onClick={(e) => e.preventDefault()}
      >
        {status}
      </a>

      {/* Analyzed date */}
      <p className="text-xs text-slate-500">
        Analysé: {analyzedDate}
      </p>

      {/* Categories section */}
      <div className="w-full mt-2">
        {/* Section header */}
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-3 hover:text-slate-800 transition-colors"
        >
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
          Catégories
        </button>

        {/* Category list */}
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <CategoryRow key={category.name} category={category} />
          ))}
        </div>
      </div>
    </div>
  )
}
