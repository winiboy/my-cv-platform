'use client'

import { cn } from '@/lib/utils'

/**
 * Props interface for GrammarCheckerPreview component.
 * Allows customization of all displayed text for i18n support.
 */
export interface GrammarCheckerPreviewProps {
  translations?: {
    scoreLabel: string
    issuesFound: string
    categories: {
      all: string
      spelling: string
      grammar: string
      punctuation: string
      tense: string
    }
    originalLabel: string
  }
}

/**
 * Default translations in French.
 */
const DEFAULT_TRANSLATIONS: Required<GrammarCheckerPreviewProps>['translations'] = {
  scoreLabel: 'Score grammatical',
  issuesFound: 'problemes trouves',
  categories: {
    all: 'Tous',
    spelling: 'Orthographe',
    grammar: 'Grammaire',
    punctuation: 'Ponctuation',
    tense: 'Temps...',
  },
  originalLabel: 'Original :',
}

/**
 * Category tab data for grammar issues.
 * Each tab shows a category name and count of issues.
 */
interface CategoryTab {
  /** Display name of the category */
  name: string
  /** Number of issues in this category */
  count: number
  /** Whether this tab is currently active */
  isActive?: boolean
}

/**
 * Builds sample data with translated category names.
 * Score: 85 (green), 7 total issues across categories.
 */
function buildSampleData(translations: Required<GrammarCheckerPreviewProps>['translations']) {
  return {
    score: 85,
    totalIssues: 7,
    categories: [
      { name: translations.categories.all, count: 7, isActive: true },
      { name: translations.categories.spelling, count: 1 },
      { name: translations.categories.grammar, count: 2 },
      { name: translations.categories.punctuation, count: 2 },
      { name: translations.categories.tense, count: 0 },
    ] satisfies CategoryTab[],
    sampleIssue: {
      category: translations.categories.punctuation,
      severity: 'Avertissement',
      originalText: 'Reparation de bijoux,',
    },
  }
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
 * Circular progress gauge component for displaying the grammar score.
 * Uses SVG for the circular progress ring.
 */
function CircularGauge({ score }: { score: number }) {
  const { size, strokeWidth, radius } = GAUGE_CONFIG
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference
  const center = size / 2

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

        {/* Progress ring - always teal/green for grammar score */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="stroke-teal-500 transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>

      {/* Score number in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-4xl font-bold tabular-nums text-teal-600">
          {score}
        </span>
      </div>
    </div>
  )
}

/**
 * Category tab button component.
 * Shows category name and issue count with active state styling.
 */
function CategoryTabButton({ tab }: { tab: CategoryTab }) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors',
        tab.isActive
          ? 'bg-teal-100 text-teal-700'
          : 'text-slate-600 hover:bg-slate-100'
      )}
    >
      {tab.name}
      <span
        className={cn(
          'text-xs font-semibold',
          tab.isActive ? 'text-teal-600' : 'text-slate-400'
        )}
      >
        {tab.count}
      </span>
    </button>
  )
}

/**
 * Sample issue card component showing a grammar problem.
 * Displays category label, severity badge, and highlighted original text.
 */
function IssueCard({
  category,
  severity,
  originalText,
  originalLabel,
}: {
  category: string
  severity: string
  originalText: string
  originalLabel: string
}) {
  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Header row with category and severity */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-amber-400" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-700">{category}</span>
        </div>
        <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">
          {severity}
        </span>
      </div>

      {/* Content area with original text */}
      <div className="px-4 py-3">
        <p className="text-xs text-slate-500 mb-1">{originalLabel}</p>
        <p className="text-sm text-slate-700">
          <span className="bg-amber-200 px-0.5 rounded">{originalText}</span>
        </p>
      </div>
    </div>
  )
}

/**
 * GrammarCheckerPreview displays a static preview of Grammar Checker results.
 * Shows a circular score gauge with grammar score, issues badge,
 * category tabs, and a sample issue card with highlighted text.
 *
 * This is a static display component using hardcoded sample data
 * matching the design in Screenshot/2-corr-gram-cv.png.
 */
export default function GrammarCheckerPreview({
  translations = DEFAULT_TRANSLATIONS,
}: GrammarCheckerPreviewProps) {
  const mergedTranslations = { ...DEFAULT_TRANSLATIONS, ...translations }
  const { score, totalIssues, categories, sampleIssue } = buildSampleData(mergedTranslations)

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Circular score gauge */}
      <CircularGauge score={score} />

      {/* Score label */}
      <p className="text-sm font-medium text-slate-600">{mergedTranslations.scoreLabel}</p>

      {/* Issues count badge */}
      <span className="px-3 py-1 text-xs font-medium rounded-full bg-teal-100 text-teal-700">
        {totalIssues} {mergedTranslations.issuesFound}
      </span>

      {/* Category tabs */}
      <div className="w-full flex items-center gap-1 overflow-x-auto pb-1">
        {categories.map((tab) => (
          <CategoryTabButton key={tab.name} tab={tab} />
        ))}
      </div>

      {/* Sample issue card */}
      <IssueCard
        category={sampleIssue.category}
        severity={sampleIssue.severity}
        originalText={sampleIssue.originalText}
        originalLabel={mergedTranslations.originalLabel}
      />
    </div>
  )
}
