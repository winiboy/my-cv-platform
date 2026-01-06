'use client'

import type { ConfidenceLevel } from '@/types/cv-adaptation'

interface DiffViewerProps {
  title: string
  original: string
  proposed: string
  confidence: ConfidenceLevel
  reasoning: string
  isChecked: boolean
  onCheckChange: (checked: boolean) => void
  dict?: {
    currentVersion?: string
    proposedVersion?: string
    reasoning?: string
    applyChange?: string
    confidenceHigh?: string
    confidenceMedium?: string
    confidenceLow?: string
  }
}

export function DiffViewer({
  title,
  original,
  proposed,
  confidence,
  reasoning,
  isChecked,
  onCheckChange,
  dict = {},
}: DiffViewerProps) {
  // Confidence badge styling
  const confidenceBadge = {
    high: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-300',
      label: dict.confidenceHigh || 'High Confidence',
    },
    medium: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      border: 'border-yellow-300',
      label: dict.confidenceMedium || 'Medium Confidence',
    },
    low: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-300',
      label: dict.confidenceLow || 'Low Confidence',
    },
  }

  const badge = confidenceBadge[confidence]

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Header with title and confidence badge */}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Two-column comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current version */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {dict.currentVersion || 'Current'}
          </label>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md min-h-[100px] text-sm text-gray-700 whitespace-pre-wrap">
            {original || <span className="italic text-gray-400">No content</span>}
          </div>
        </div>

        {/* Proposed version */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {dict.proposedVersion || 'Proposed'}
          </label>
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-md min-h-[100px] text-sm text-gray-900 whitespace-pre-wrap">
            {proposed}
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
        <p className="text-xs font-medium text-blue-900 mb-1">
          {dict.reasoning || 'Reasoning'}:
        </p>
        <p className="text-sm text-blue-800">{reasoning}</p>
      </div>

      {/* Checkbox to apply change */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onCheckChange(e.target.checked)}
          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
        />
        <span className="text-sm font-medium text-gray-700">
          {dict.applyChange || 'Apply this change'}
        </span>
      </label>
    </div>
  )
}
