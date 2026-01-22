'use client'

import { Briefcase, ChevronDown } from 'lucide-react'

interface JobApplicationData {
  id: string
  company_name: string
  job_title: string
  job_url: string | null
}

interface JobAssociationSelectorProps {
  currentJobApplicationId: string | null
  jobApplications: JobApplicationData[]
  onChange: (jobApplicationId: string | null) => void
  locale: string
  dict: Record<string, unknown>
  disabled?: boolean
}

/**
 * Dropdown component for selecting a job application to link to a cover letter.
 * Provides a list of user's saved job applications with an option to unlink.
 */
export function JobAssociationSelector({
  currentJobApplicationId,
  jobApplications,
  onChange,
  locale: _locale,
  dict,
  disabled = false,
}: JobAssociationSelectorProps) {
  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const jobAssociationDict = (coverLettersDict.jobAssociation || {}) as Record<string, string>

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    onChange(value === '' ? null : value)
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Briefcase className="h-4 w-4 text-slate-400" />
      </div>
      <select
        value={currentJobApplicationId || ''}
        onChange={handleChange}
        disabled={disabled}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-10 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-teal-400 dark:disabled:bg-slate-900"
        aria-label={jobAssociationDict.selectJob || 'Select a job'}
      >
        <option value="">
          {jobAssociationDict.noJobLinked || 'No job linked'}
        </option>
        {jobApplications.map((job) => (
          <option key={job.id} value={job.id}>
            {job.job_title} - {job.company_name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  )
}
