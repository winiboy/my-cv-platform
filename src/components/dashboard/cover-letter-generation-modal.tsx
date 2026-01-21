'use client'

import { useState } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import type { Resume } from '@/types/database'

interface CoverLetterGenerationModalProps {
  isOpen: boolean
  onClose: () => void
  onGenerate: (content: {
    greeting: string
    openingParagraph: string
    bodyParagraphs: string[]
    closingParagraph: string
    signOff: string
  }) => void
  resumes: Resume[]
  defaultResumeId?: string | null
  defaultJobDescription?: string | null
  defaultJobTitle?: string | null
  defaultCompanyName?: string | null
  dict: Record<string, unknown>
  locale: string
}

export function CoverLetterGenerationModal({
  isOpen,
  onClose,
  onGenerate,
  resumes,
  defaultResumeId,
  defaultJobDescription,
  defaultJobTitle,
  defaultCompanyName,
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

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const generationDict = (coverLettersDict.generation || {}) as Record<string, unknown>

  const handleGenerate = async () => {
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
          locale,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate cover letter')
      }

      onGenerate({
        greeting: data.coverLetter.greeting,
        openingParagraph: data.coverLetter.openingParagraph,
        bodyParagraphs: data.coverLetter.bodyParagraphs,
        closingParagraph: data.coverLetter.closingParagraph,
        signOff: data.coverLetter.signOff,
      })

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
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
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
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
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
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 resize-none"
            />
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
