'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TemplatePicker } from '@/components/dashboard/template-picker'
import { toLocale } from '@/lib/i18n'
import type { ResumeInsert, ResumeTemplate, JobApplication } from '@/types/database'

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

  const router = useRouter()
  const [title, setTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplate>('modern')
  const templateLabelId = useId()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError((newDict.titleRequired as string) || 'Resume title is required')
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

      // Create resume with optional job_application_id
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
        job_application_id: jobApplication?.id || null,
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

      // Create bidirectional link: update job_applications.resume_id
      if (jobApplication?.id && resume?.id) {
        const { error: updateError } = await supabase
          .from('job_applications')
          .update({ resume_id: resume.id, updated_at: new Date().toISOString() })
          .eq('id', jobApplication.id)
          .eq('user_id', user.id)

        if (updateError) {
          // Log but don't fail the operation - the resume was created successfully
          console.error('Error linking resume to job application:', updateError)
        }
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
            ? ((newDict.creating as string) || 'Creating...')
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
