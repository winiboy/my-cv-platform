'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText } from 'lucide-react'
import type { CoverLetterInsert } from '@/types/database'

interface CreateCoverLetterFormProps {
  locale: string
  dict: Record<string, unknown>
  resumes: { id: string; title: string }[]
}

export function CreateCoverLetterForm({ locale, dict, resumes }: CreateCoverLetterFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read resume_id from URL query parameter to pre-select the resume
  const resumeIdFromUrl = searchParams?.get('resume_id') || ''
  // Validate that the resume_id from URL exists in the resumes list
  const initialResumeId = resumes.some((r) => r.id === resumeIdFromUrl) ? resumeIdFromUrl : ''

  const [title, setTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [selectedResumeId, setSelectedResumeId] = useState<string>(initialResumeId)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const newDict = (coverLettersDict.new || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>
  const errorsDict = (dict.errors || {}) as Record<string, unknown>
  const validationDict = (errorsDict.validation || {}) as Record<string, unknown>

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError((newDict.titleRequired as string) || 'Cover letter title is required')
      return
    }

    setIsCreating(true)

    try {
      const supabase = createClient()

      // Get current user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) {
        console.error('Auth error:', authError)
        setError('Authentication error. Please refresh the page and try again.')
        setIsCreating(false)
        return
      }

      if (!user) {
        console.error('No user found - user may not be logged in')
        setError((validationDict.loginRequired as string) || 'You must be logged in')
        setIsCreating(false)
        return
      }

      console.log('Authenticated user:', user.id.substring(0, 8) + '...')

      // Create cover letter - ensure resume_id is null when empty, not empty string
      const resumeId = selectedResumeId && selectedResumeId.trim() !== '' ? selectedResumeId : null
      const newCoverLetter: CoverLetterInsert = {
        user_id: user.id,
        title: title.trim(),
        resume_id: resumeId,
        company_name: companyName.trim() || null,
        job_title: jobTitle.trim() || null,
        greeting: 'Dear Hiring Manager,',
        opening_paragraph: null,
        body_paragraphs: [],
        closing_paragraph: null,
        sign_off: 'Sincerely,',
        sender_name: null,
        template: 'modern',
      }

      console.log('Creating cover letter with data:', {
        ...newCoverLetter,
        user_id: user.id.substring(0, 8) + '...', // Partially hide for privacy
      })

      const { data: coverLetter, error: insertError } = await supabase
        .from('cover_letters')
        .insert(newCoverLetter)
        .select()
        .single()

      if (insertError) {
        console.error('Error creating cover letter:', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        })
        // Provide more specific error messages based on error type
        let errorMessage = 'Failed to create cover letter. Please try again.'
        if (insertError.code === '42501') {
          // RLS policy violation
          errorMessage = 'Permission denied. Please ensure you are logged in.'
        } else if (insertError.code === '23503') {
          // Foreign key violation
          errorMessage = 'Invalid resume selected. Please select a valid resume or none.'
        } else if (insertError.code === '23505') {
          // Unique constraint violation
          errorMessage = 'A cover letter with this title already exists.'
        } else if (insertError.message) {
          errorMessage = `Error: ${insertError.message}`
        }
        setError(errorMessage)
        setIsCreating(false)
        return
      }

      // Redirect to editor
      router.push(`/${locale}/dashboard/cover-letters/${coverLetter.id}/edit`)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
      setIsCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cover Letter Title */}
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium">
          {(newDict.titleLabel as string) || 'Cover Letter Title'}
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={(newDict.titlePlaceholder as string) || 'e.g., "Application for Software Engineer"'}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          disabled={isCreating}
        />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {(newDict.titleHint as string) || 'Give your cover letter a descriptive name'}
        </p>
      </div>

      {/* Company Name */}
      <div className="space-y-2">
        <label htmlFor="companyName" className="block text-sm font-medium">
          {(newDict.companyLabel as string) || 'Company Name'} <span className="text-slate-400">(optional)</span>
        </label>
        <input
          type="text"
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder={(newDict.companyPlaceholder as string) || 'e.g., "Google"'}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          disabled={isCreating}
        />
      </div>

      {/* Job Title */}
      <div className="space-y-2">
        <label htmlFor="jobTitle" className="block text-sm font-medium">
          {(newDict.jobTitleLabel as string) || 'Job Title'} <span className="text-slate-400">(optional)</span>
        </label>
        <input
          type="text"
          id="jobTitle"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder={(newDict.jobTitlePlaceholder as string) || 'e.g., "Senior Software Engineer"'}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          disabled={isCreating}
        />
      </div>

      {/* Link to Resume */}
      {resumes.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="resumeId" className="block text-sm font-medium">
            {(newDict.linkResumeLabel as string) || 'Link to Resume'} <span className="text-slate-400">(optional)</span>
          </label>
          <select
            id="resumeId"
            value={selectedResumeId}
            onChange={(e) => setSelectedResumeId(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
            disabled={isCreating}
          >
            <option value="">{(newDict.selectResume as string) || 'Select a resume...'}</option>
            {resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.title}
              </option>
            ))}
          </select>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {(newDict.linkResumeHint as string) || 'Use data from an existing resume to generate content'}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Submit button */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isCreating}
          className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileText className="h-5 w-5" />
          {isCreating
            ? ((newDict.creating as string) || 'Creating...')
            : ((newDict.create as string) || 'Create Cover Letter')}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isCreating}
          className="px-6 py-3 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(commonDict.cancel as string) || 'Cancel'}
        </button>
      </div>
    </form>
  )
}
