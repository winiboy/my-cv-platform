'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, Loader2, Briefcase, FileText } from 'lucide-react'
import type { Resume } from '@/types/database'

interface SavedJob {
  id: string
  company_name: string
  job_title: string
  job_description: string | null
}

type JobSource = 'manual' | 'saved'

interface CoverLetterGenerationModalProps {
  isOpen: boolean
  onClose: () => void
  onGenerate: (
    content: {
      greeting: string
      openingParagraph: string
      bodyParagraphs: string[]
      closingParagraph: string
      signOff: string
    },
    jobApplicationId?: string
  ) => void
  resumes: Resume[]
  savedJobs?: SavedJob[]
  defaultResumeId?: string | null
  defaultJobDescription?: string | null
  defaultJobTitle?: string | null
  defaultCompanyName?: string | null
  defaultJobApplicationId?: string | null
  dict: Record<string, unknown>
  locale: string
}

export function CoverLetterGenerationModal({
  isOpen,
  onClose,
  onGenerate,
  resumes,
  savedJobs = [],
  defaultResumeId,
  defaultJobDescription,
  defaultJobTitle,
  defaultCompanyName,
  defaultJobApplicationId,
  dict,
  locale,
}: CoverLetterGenerationModalProps) {
  const [resumeId, setResumeId] = useState(defaultResumeId || '')
  const [jobDescription, setJobDescription] = useState(defaultJobDescription || '')
  const [jobTitle, setJobTitle] = useState(defaultJobTitle || '')
  const [companyName, setCompanyName] = useState(defaultCompanyName || '')
  const [recipientName, setRecipientName] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  // Job source state: manual entry or saved job selection
  const [jobSource, setJobSource] = useState<JobSource>(
    defaultJobApplicationId ? 'saved' : 'manual'
  )
  const [selectedJobId, setSelectedJobId] = useState<string>(defaultJobApplicationId || '')

  // Reset fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setResumeId(defaultResumeId || '')
      setJobDescription(defaultJobDescription || '')
      setJobTitle(defaultJobTitle || '')
      setCompanyName(defaultCompanyName || '')
      setRecipientName('')
      setError('')
      setJobSource(defaultJobApplicationId ? 'saved' : 'manual')
      setSelectedJobId(defaultJobApplicationId || '')
    }
  }, [isOpen, defaultResumeId, defaultJobDescription, defaultJobTitle, defaultCompanyName, defaultJobApplicationId])

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const generationDict = (coverLettersDict.generation || {}) as Record<string, unknown>

  /**
   * Handle saved job selection - auto-fills job details
   */
  const handleSavedJobSelect = (jobId: string) => {
    setSelectedJobId(jobId)
    if (jobId) {
      const job = savedJobs.find((j) => j.id === jobId)
      if (job) {
        setJobTitle(job.job_title)
        setCompanyName(job.company_name)
        setJobDescription(job.job_description || '')
      }
    } else {
      // Clear fields when deselecting
      setJobTitle('')
      setCompanyName('')
      setJobDescription('')
    }
  }

  /**
   * Handle job source tab change
   */
  const handleJobSourceChange = (source: JobSource) => {
    setJobSource(source)
    setError('')
    if (source === 'manual') {
      // Clear saved job selection but preserve manual fields
      setSelectedJobId('')
    } else if (source === 'saved') {
      // Clear fields when switching to saved jobs
      if (!selectedJobId) {
        setJobTitle('')
        setCompanyName('')
        setJobDescription('')
      }
    }
  }

  // Check if fields are auto-filled from saved job
  const isAutoFilled = jobSource === 'saved' && selectedJobId !== ''

  const handleGenerate = async () => {
    // Validate job selection when using saved jobs
    if (jobSource === 'saved' && !selectedJobId) {
      setError((generationDict.selectJobRequired as string) || 'Please select a saved job')
      return
    }
    if (!jobDescription.trim()) {
      setError((generationDict.jobDescriptionRequired as string) || 'Job description is required')
      return
    }
    if (!jobTitle.trim()) {
      setError((generationDict.jobTitleRequired as string) || 'Job title is required')
      return
    }
    if (!companyName.trim()) {
      setError((generationDict.companyRequired as string) || 'Company name is required')
      return
    }

    setIsGenerating(true)
    setError('')

    try {
      const response = await fetch('/api/ai/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId: resumeId || undefined,
          jobDescription,
          jobTitle,
          companyName,
          recipientName: recipientName || undefined,
          jobApplicationId: jobSource === 'saved' ? selectedJobId : undefined,
          locale,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate cover letter')
      }

      // Pass the job application ID to the callback for linking
      onGenerate(
        {
          greeting: data.coverLetter.greeting,
          openingParagraph: data.coverLetter.openingParagraph,
          bodyParagraphs: data.coverLetter.bodyParagraphs,
          closingParagraph: data.coverLetter.closingParagraph,
          signOff: data.coverLetter.signOff,
        },
        jobSource === 'saved' ? selectedJobId : undefined
      )

      onClose()
    } catch (err) {
      console.error('Error generating cover letter:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate cover letter')
    } finally {
      setIsGenerating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {(generationDict.title as string) || 'Generate Cover Letter'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {(generationDict.subtitle as string) || 'AI will create a personalized cover letter'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Resume selection */}
          {resumes.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {(generationDict.resumeLabel as string) || 'Use data from resume'} <span className="text-slate-400">(optional)</span>
              </label>
              <select
                value={resumeId}
                onChange={(e) => setResumeId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
              >
                <option value="">{(generationDict.selectResume as string) || 'Select a resume...'}</option>
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Job Source Tabs */}
          {savedJobs.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                {(generationDict.jobSourceLabel as string) || 'Job Source'}
              </label>
              <div className="flex border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleJobSourceChange('manual')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    jobSource === 'manual'
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  {(generationDict.pasteJobDescription as string) || 'Paste Job Description'}
                </button>
                <button
                  type="button"
                  onClick={() => handleJobSourceChange('saved')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    jobSource === 'saved'
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  <Briefcase className="h-4 w-4" />
                  {(generationDict.selectSavedJob as string) || 'Select Saved Job'}
                </button>
              </div>
            </div>
          )}

          {/* Saved Job Dropdown - only shown when 'saved' tab is active */}
          {jobSource === 'saved' && savedJobs.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {(generationDict.savedJobLabel as string) || 'Select a saved job'} *
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => handleSavedJobSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
              >
                <option value="">{(generationDict.selectSavedJobPlaceholder as string) || 'Select a saved job...'}</option>
                {savedJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.job_title} - {job.company_name}
                  </option>
                ))}
              </select>
              {selectedJobId && (
                <p className="mt-1.5 text-xs text-teal-600 dark:text-teal-400">
                  {(generationDict.autoFilledHint as string) || 'Job details auto-filled from saved job'}
                </p>
              )}
            </div>
          )}

          {/* Job Title */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {(generationDict.jobTitleLabel as string) || 'Job Title'} *
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={(generationDict.jobTitlePlaceholder as string) || 'e.g., Software Engineer'}
              readOnly={isAutoFilled}
              className={`w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 ${
                isAutoFilled ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : ''
              }`}
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {(generationDict.companyLabel as string) || 'Company Name'} *
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={(generationDict.companyPlaceholder as string) || 'e.g., Google'}
              readOnly={isAutoFilled}
              className={`w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 ${
                isAutoFilled ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : ''
              }`}
            />
          </div>

          {/* Recipient Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {(generationDict.recipientLabel as string) || 'Recipient Name'} <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder={(generationDict.recipientPlaceholder as string) || 'e.g., John Smith'}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
            />
          </div>

          {/* Job Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {(generationDict.jobDescriptionLabel as string) || 'Job Description'} *
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder={(generationDict.jobDescriptionPlaceholder as string) || 'Paste the job description here...'}
              rows={6}
              readOnly={isAutoFilled}
              className={`w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 resize-none ${
                isAutoFilled ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : ''
              }`}
            />
            {isAutoFilled && !jobDescription && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                {(generationDict.noJobDescriptionWarning as string) || 'This saved job has no job description. Consider adding one for better results.'}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {(generationDict.cancel as string) || 'Cancel'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {(generationDict.generating as string) || 'Generating...'}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {(generationDict.generate as string) || 'Generate'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
