'use client'

import { FileText, ChevronDown } from 'lucide-react'

interface ResumeAssociationSelectorProps {
  currentResumeId: string | null
  resumes: { id: string; title: string }[]
  onChange: (resumeId: string | null) => void
  locale: string
  dict: Record<string, unknown>
  disabled?: boolean
}

/**
 * Dropdown component for selecting a resume to link to a cover letter.
 * Provides a list of user's resumes with an option to unlink (no resume).
 */
export function ResumeAssociationSelector({
  currentResumeId,
  resumes,
  onChange,
  locale,
  dict,
  disabled = false,
}: ResumeAssociationSelectorProps) {
  const associationDict = ((dict.coverLetters || {}) as Record<string, unknown>).association as Record<string, unknown> || {}

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    onChange(value === '' ? null : value)
  }

  const selectedResume = resumes.find((r) => r.id === currentResumeId)

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <FileText className="h-4 w-4 text-slate-400" />
      </div>
      <select
        value={currentResumeId || ''}
        onChange={handleChange}
        disabled={disabled}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-10 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-teal-400 dark:disabled:bg-slate-900"
        aria-label={(associationDict.selectResume as string) || 'Select a resume'}
      >
        <option value="">
          {(associationDict.noResumeLinked as string) || 'No resume linked'}
        </option>
        {resumes.map((resume) => (
          <option key={resume.id} value={resume.id}>
            {resume.title || ((associationDict.untitledResume as string) || 'Untitled Resume')}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  )
}
