'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TemplatePicker } from '@/components/dashboard/template-picker'
import { useToast } from '@/components/ui/toast'
import { toLocale } from '@/lib/i18n'
import { cutResumeTitle, RESUME_TITLE_MAX_LENGTH } from '@/lib/resume-from-job/resume-title'
import type { ResumeInsert, ResumeTemplate, JobApplication } from '@/types/database'

/** Long enough to read on the editor after the redirect. */
const NOT_TAILORED_NOTICE_DURATION_MS = 12_000

interface CreateResumeFormProps {
  locale: string
  dict: Record<string, unknown>
  jobApplication?: JobApplication | null
}

export function CreateResumeForm({ locale, dict, jobApplication }: CreateResumeFormProps) {
  const resumesDict = (dict.resumes || {}) as Record<string, unknown>
  const newDict = (resumesDict.new || {}) as Record<string, unknown>
  const errorsDict = (dict.errors || {}) as Record<string, unknown>
  const validationDict = (errorsDict.validation || {}) as Record<string, unknown>
  const apiDict = (errorsDict.api || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>
  const resumeErrorsDict = (resumesDict.errors || {}) as Record<string, unknown>

  const router = useRouter()
  const toast = useToast()
  // AC1: a CV for a job application starts with the job's title, still editable.
  // A job title can be longer than a CV title may be, so it is cut to the
  // length the route keeps, and the input enforces the same limit.
  const [title, setTitle] = useState(jobApplication ? cutResumeTitle(jobApplication.job_title) : '')
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplate>('modern')
  const templateLabelId = useId()
  const [isCreating, setIsCreating] = useState(false)
  // A state update is not visible to a second submit fired in the same tick, so
  // the job-application path, which spends an AI call, also guards with a ref.
  const isSubmittingRef = useRef(false)
  const [error, setError] = useState('')

  /**
   * The job-application path (US-002): the server reads the application, fills
   * the CV through the shared builder and links both ways. Only the id, title,
   * template and page locale are sent; the server trusts no job content from here.
   */
  const createFromJobApplication = async (jobApplicationId: string) => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setIsCreating(true)

    try {
      const response = await fetch('/api/resumes/from-job-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobApplicationId,
          title: title.trim(),
          template: selectedTemplate,
          locale: toLocale(locale),
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          setError((validationDict.loginRequired as string) || 'You must be logged in to create a resume')
        } else {
          setError((apiDict.createResume as string) || 'Failed to create resume. Please try again.')
        }
        isSubmittingRef.current = false
        setIsCreating(false)
        return
      }

      const result = (await response.json()) as { resumeId?: unknown; tailored?: unknown }
      if (typeof result.resumeId !== 'string') {
        throw new Error('Malformed response from /api/resumes/from-job-application')
      }

      // AC4: the toast provider sits in the locale layout, which survives the
      // navigation, so the notice stays visible on the editor.
      if (result.tailored !== true) {
        toast.warning(
          (newDict.notTailored as string) ||
            'This CV could not be tailored to the job offer. Its sample values show what to fill in.',
          NOT_TAILORED_NOTICE_DURATION_MS
        )
      }

      router.push(`/${locale}/dashboard/resumes/${result.resumeId}/edit`)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError((errorsDict.generic as string) || 'An unexpected error occurred. Please try again.')
      isSubmittingRef.current = false
      setIsCreating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError((resumeErrorsDict.titleRequired as string) || 'Resume title is required')
      return
    }

    if (jobApplication) {
      await createFromJobApplication(jobApplication.id)
      return
    }

    setIsCreating(true)

    try {
      const supabase = createClient()

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError((validationDict.loginRequired as string) || 'You must be logged in to create a resume')
        setIsCreating(false)
        return
      }

      // A CV from scratch: empty content. A CV for a job application is created
      // by createFromJobApplication above.
      const newResume: ResumeInsert = {
        user_id: user.id,
        title: title.trim(),
        template: selectedTemplate,
        contact: {},
        summary: '',
        experience: [],
        education: [],
        skills: [],
        languages: [],
        certifications: [],
        projects: [],
        custom_sections: [],
        is_default: false,
        is_public: false,
        job_application_id: null,
      }

      const { data: resume, error: insertError } = await supabase
        .from('resumes')
        .insert(newResume)
        .select()
        .single()

      if (insertError) {
        console.error('Error creating resume:', insertError)
        setError((apiDict.createResume as string) || 'Failed to create resume. Please try again.')
        setIsCreating(false)
        return
      }

      // Redirect to editor
      router.push(`/${locale}/dashboard/resumes/${resume.id}/edit`)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError((dict.generic as string) || 'An unexpected error occurred. Please try again.')
      setIsCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Resume Title */}
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium">
          {(newDict.titleLabel as string) || 'Resume Title'}
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={(newDict.titlePlaceholder as string) || 'e.g., "Software Engineer Resume"'}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          disabled={isCreating}
          maxLength={jobApplication ? RESUME_TITLE_MAX_LENGTH : undefined}
        />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {(newDict.titleHint as string) || 'Give your resume a descriptive name'}
        </p>
      </div>

      {/* Template Selection */}
      <div className="space-y-4">
        <div>
          <label id={templateLabelId} className="block text-sm font-medium mb-2">
            {(newDict.templateLabel as string) || 'Choose Template'}
          </label>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            {(newDict.templateHint as string) || 'Select a template that fits your style'}
          </p>
        </div>

        <TemplatePicker
          value={selectedTemplate}
          onChange={setSelectedTemplate}
          disabled={isCreating}
          labelledBy={templateLabelId}
          locale={toLocale(locale)}
          dict={dict}
        />
      </div>

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
          className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating
            ? jobApplication
              ? ((newDict.generating as string) || 'Generating your CV...')
              : ((newDict.creating as string) || 'Creating...')
            : ((newDict.create as string) || 'Create Resume')}
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
