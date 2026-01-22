'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, Plus, ExternalLink, Loader2 } from 'lucide-react'
import { ResumeAssociationSelector } from '../resume-association-selector'

interface ResumeAssociationSectionProps {
  coverLetterId: string
  currentResumeId: string | null
  resumes: { id: string; title: string }[]
  locale: string
  dict: Record<string, unknown>
  onResumeChange: (resumeId: string | null) => Promise<void>
}

/**
 * Section component for the cover letter editor sidebar that allows
 * users to link/unlink a resume to the current cover letter.
 *
 * Features:
 * - Dropdown to select a resume
 * - View linked resume button
 * - Create new resume button
 * - Hint text explaining the AI generation benefit
 */
export function ResumeAssociationSection({
  coverLetterId,
  currentResumeId,
  resumes,
  locale,
  dict,
  onResumeChange,
}: ResumeAssociationSectionProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  const associationDict = ((dict.coverLetters || {}) as Record<string, unknown>).association as Record<string, unknown> || {}

  const selectedResume = resumes.find((r) => r.id === currentResumeId)

  const handleResumeChange = async (resumeId: string | null) => {
    setIsUpdating(true)
    try {
      await onResumeChange(resumeId)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {(associationDict.linkedCV as string) || 'Linked CV'}
        </h3>
      </div>

      {/* Current Selection Display */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        {selectedResume ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {selectedResume.title || ((associationDict.untitledResume as string) || 'Untitled Resume')}
            </span>
            <Link
              href={`/${locale}/dashboard/resumes/${currentResumeId}/edit`}
              className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
              title={(associationDict.viewResume as string) || 'View Resume'}
            >
              <ExternalLink className="h-3 w-3" />
              {(associationDict.view as string) || 'View'}
            </Link>
          </div>
        ) : (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {(associationDict.noResumeLinked as string) || 'No resume linked'}
          </span>
        )}
      </div>

      {/* Resume Selector Dropdown */}
      <div className="relative">
        {isUpdating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 dark:bg-slate-800/50">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
          </div>
        )}
        <ResumeAssociationSelector
          currentResumeId={currentResumeId}
          resumes={resumes}
          onChange={handleResumeChange}
          locale={locale}
          dict={dict}
          disabled={isUpdating}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {currentResumeId && (
          <Link
            href={`/${locale}/dashboard/resumes/${currentResumeId}/edit`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {(associationDict.viewResume as string) || 'View Resume'}
          </Link>
        )}
        <Link
          href={`/${locale}/dashboard/resumes/new`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {(associationDict.createNew as string) || 'Create New'}
        </Link>
      </div>

      {/* Hint Text */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {(associationDict.hint as string) ||
          'Link a resume to use your experience and skills when generating cover letter content with AI.'}
      </p>
    </div>
  )
}
