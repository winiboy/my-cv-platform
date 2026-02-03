'use client'

import { cn } from '@/lib/utils'

/**
 * Category card data for cover letter analysis.
 * Each card shows a category name, percentage, and description.
 */
interface CategoryCard {
  /** Display name of the category */
  name: string
  /** Score percentage (0-100) */
  percentage: number
  /** Description explaining the issues found */
  description: string
}

/**
 * Hardcoded sample data matching the screenshot reference.
 * Score: 10 (red - very low), with Structure and Ton categories.
 */
const SAMPLE_DATA = {
  overallScore: 10,
  categories: [
    {
      name: 'Structure',
      percentage: 0,
      description:
        "La lettre de motivation manque d'une structure claire et logique, avec un début et une fin peu convaincants.",
    },
    {
      name: 'Ton',
      percentage: 20,
      description:
        "Le ton est trop informel et manque de professionnalisme, ce qui peut donner une mauvaise impression à l'employeur.",
    },
  ] satisfies CategoryCard[],
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
 * - Orange/amber for scores >= 40
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
 * Returns color classes for category percentage bar based on value.
 * - Green (teal) for percentages >= 70
 * - Orange for percentages >= 40
 * - Red for percentages < 40
 */
function getPercentageColor(percentage: number): { bar: string; text: string } {
  if (percentage >= 70) {
    return {
      bar: 'bg-teal-500',
      text: 'text-teal-600',
    }
  }
  if (percentage >= 40) {
    return {
      bar: 'bg-orange-500',
      text: 'text-orange-500',
    }
  }
  return {
    bar: 'bg-red-500',
    text: 'text-red-600',
  }
}

/**
 * Circular progress gauge component for displaying the overall score.
 * Uses SVG for the circular progress ring with animated fill.
 */
function CircularGauge({ score }: { score: number }) {
  const { size, strokeWidth, radius } = GAUGE_CONFIG
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference
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
 * Category card component showing percentage bar and description.
 * Displays category name, percentage with colored bar, and issue description.
 */
function CategoryCardComponent({ category }: { category: CategoryCard }) {
  const colors = getPercentageColor(category.percentage)

  return (
    <div className="flex-1 min-w-[140px] rounded-lg border border-slate-200 bg-white p-4">
      {/* Header with name and percentage */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">{category.name}</span>
        <span className={cn('text-sm font-bold tabular-nums', colors.text)}>
          {category.percentage}%
        </span>
      </div>

      {/* Percentage progress bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-200 mb-3">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
          style={{ width: `${category.percentage}%` }}
        />
      </div>

      {/* Description text */}
      <p className="text-xs text-slate-500 leading-relaxed">
        {category.description}
      </p>
    </div>
  )
}

/**
 * CoverLetterCheckerPreview displays a static preview of Cover Letter Checker results.
 * Shows a circular score gauge with overall score, "Score global" label,
 * and category breakdown cards showing Structure and Ton scores with descriptions.
 *
 * This is a static display component using hardcoded sample data
 * matching the design in Screenshot/6-verif-lettre-motiv.png.
 */
export default function CoverLetterCheckerPreview() {
  const { overallScore, categories } = SAMPLE_DATA

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Circular score gauge */}
      <CircularGauge score={overallScore} />

      {/* Score label */}
      <p className="text-sm font-medium text-slate-600">Score global</p>

      {/* Category Breakdown section */}
      <div className="w-full">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Category Breakdown</h3>

        {/* Category cards grid */}
        <div className="flex gap-3">
          {categories.map((category) => (
            <CategoryCardComponent key={category.name} category={category} />
          ))}
        </div>
      </div>
    </div>
  )
}
