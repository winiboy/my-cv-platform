'use client'

import { CheckCircle2, XCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Translations for the ResumeCheckerPreview component.
 * Allows internationalization of static text labels.
 */
export interface ResumeCheckerPreviewProps {
  translations?: {
    /** Label for the analyzed date line (e.g., "Analyzed on:") */
    analyzedLabel: string
    /** Contact information section name */
    contactInfo: string
    /** Summary/objective section name */
    summaryObjective: string
    /** Professional experience section name */
    professionalExperience: string
  }
}

/**
 * Default French translations for backwards compatibility.
 */
const DEFAULT_TRANSLATIONS: Required<ResumeCheckerPreviewProps>['translations'] = {
  analyzedLabel: 'Analyse le :',
  contactInfo: 'Informations de contact',
  summaryObjective: 'Resume/Objectif',
  professionalExperience: 'Experience professionnelle',
}

/**
 * Section score data for the preview component.
 * Each section has a name, score, and status indicator.
 */
interface SectionScore {
  /** Display name of the section */
  name: string
  /** Score value (0-100) */
  score: number
  /** Status determines icon and color: 'pass' for green checkmark, 'fail' for red X */
  status: 'pass' | 'fail'
}

/**
 * Creates sample data with translated section names.
 * Score: 62 (amber), analyzed date, and three sections with varying scores.
 */
function createSampleData(translations: Required<ResumeCheckerPreviewProps>['translations']) {
  return {
    overallScore: 62,
    analyzedDate: '16 sept. 2024, 16:30',
    sections: [
      { name: translations.contactInfo, score: 0, status: 'fail' },
      { name: translations.summaryObjective, score: 80, status: 'pass' },
      { name: translations.professionalExperience, score: 85, status: 'pass' },
    ] satisfies SectionScore[],
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
 * Returns color classes based on score value.
 * - Green (teal) for scores >= 80
 * - Amber/orange for scores >= 60
 * - Red for scores < 60
 */
function getScoreColor(score: number): { stroke: string; text: string } {
  if (score >= 80) {
    return {
      stroke: 'stroke-teal-500',
      text: 'text-teal-600',
    }
  }
  if (score >= 60) {
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
 * Returns configuration for section row styling based on status.
 */
function getSectionConfig(status: 'pass' | 'fail'): {
  icon: typeof CheckCircle2 | typeof XCircle
  iconColor: string
  iconBg: string
  scoreColor: string
  rowBg: string
} {
  if (status === 'pass') {
    return {
      icon: CheckCircle2,
      iconColor: 'text-teal-600',
      iconBg: 'bg-teal-100',
      scoreColor: 'text-teal-600',
      rowBg: 'bg-teal-50/50 hover:bg-teal-50',
    }
  }
  return {
    icon: XCircle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100',
    scoreColor: 'text-red-600',
    rowBg: 'bg-red-50/50 hover:bg-red-50',
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
 * Section row component displaying a single analysis category.
 * Shows status icon, section name, score, and expand chevron.
 */
function SectionRow({ section }: { section: SectionScore }) {
  const config = getSectionConfig(section.status)
  const StatusIcon = config.icon

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 transition-colors',
        config.rowBg
      )}
    >
      {/* Status icon with background circle */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full',
          config.iconBg
        )}
      >
        <StatusIcon className={cn('w-5 h-5', config.iconColor)} aria-hidden="true" />
      </div>

      {/* Section name */}
      <span className="flex-1 text-sm font-medium text-slate-700">
        {section.name}
      </span>

      {/* Score */}
      <span className={cn('flex-shrink-0 text-lg font-bold tabular-nums', config.scoreColor)}>
        {section.score}
      </span>

      {/* Expand chevron */}
      <ChevronDown
        className="flex-shrink-0 w-4 h-4 text-slate-400"
        aria-hidden="true"
      />
    </div>
  )
}

/**
 * ResumeCheckerPreview displays a static preview of Resume Checker results.
 * Shows a circular score gauge with overall score, analysis date, and
 * section-by-section scores with status indicators.
 *
 * This is a static display component using sample data
 * matching the design in Screenshot/1-Verificateur-CV.png.
 *
 * @param translations - Optional translations for labels. Defaults to French.
 */
export default function ResumeCheckerPreview({ translations }: ResumeCheckerPreviewProps) {
  const t = { ...DEFAULT_TRANSLATIONS, ...translations }
  const { overallScore, analyzedDate, sections } = createSampleData(t)

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      {/* Circular score gauge */}
      <CircularGauge score={overallScore} />

      {/* Analyzed date text */}
      <p className="text-sm text-slate-500">
        {t.analyzedLabel} {analyzedDate}
      </p>

      {/* Section scores list */}
      <div className="w-full flex flex-col gap-2">
        {sections.map((section, index) => (
          <SectionRow key={`${section.name}-${index}`} section={section} />
        ))}
      </div>
    </div>
  )
}
