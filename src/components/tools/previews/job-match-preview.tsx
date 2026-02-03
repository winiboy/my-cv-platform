'use client'

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Skill tag data for matching skills display.
 */
interface MatchingSkill {
  /** Display name of the skill */
  name: string
}

/**
 * Hardcoded sample data matching the screenshot reference.
 * Score: 10 (red/low), analyzed date, and three matching skills.
 */
const SAMPLE_DATA = {
  matchScore: 10,
  analyzedDate: '16 sept. 2024, 16:30',
  matchingSkills: [
    { name: 'Conseil a la clientele' },
    { name: 'Communication avec les clients' },
    { name: 'Planification de processus de travail' },
  ] satisfies MatchingSkill[],
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
 * Returns color classes based on match score value.
 * - Green (teal) for scores >= 70
 * - Amber/orange for scores >= 40
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
 * Circular progress gauge component for displaying the match score.
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
 * Skill tag pill component.
 * Displays a skill name in a rounded teal/green pill style.
 */
function SkillTag({ skill }: { skill: MatchingSkill }) {
  return (
    <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full bg-teal-100 text-teal-700 whitespace-nowrap">
      {skill.name}
    </span>
  )
}

/**
 * JobMatchPreview displays a static preview of Job Match results.
 * Shows a circular score gauge with match score (0-100),
 * "Score de correspondance" label, analysis date, and
 * a section showing matching skills as pill tags.
 *
 * This is a static display component using hardcoded sample data
 * matching the design in Screenshot/4-Correspondance-CV-Job.png.
 */
export default function JobMatchPreview() {
  const { matchScore, analyzedDate, matchingSkills } = SAMPLE_DATA

  return (
    <div className="flex flex-col items-center gap-5 p-4">
      {/* Circular score gauge */}
      <CircularGauge score={matchScore} />

      {/* Score label */}
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700">Score de correspondance</p>
        <p className="text-xs text-slate-500 mt-1">
          Analyse le {analyzedDate}
        </p>
      </div>

      {/* Matching skills section */}
      <div className="w-full">
        {/* Section header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-100">
            <CheckCircle2 className="w-4 h-4 text-teal-600" aria-hidden="true" />
          </div>
          <span className="text-sm font-medium text-slate-700">
            Competences correspondantes
          </span>
          <span className="text-sm font-semibold text-teal-600">
            {matchingSkills.length}
          </span>
        </div>

        {/* Skill tags */}
        <div className="flex flex-wrap gap-2">
          {matchingSkills.map((skill) => (
            <SkillTag key={skill.name} skill={skill} />
          ))}
        </div>
      </div>
    </div>
  )
}
