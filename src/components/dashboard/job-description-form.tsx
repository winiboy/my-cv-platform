'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import type { Locale } from '@/lib/i18n'

interface JobDescriptionFormProps {
  locale: Locale
  dict: any
  userId: string
}

type Template = 'modern' | 'classic' | 'minimal' | 'creative' | 'professional'

export function JobDescriptionForm({ locale, dict, userId }: JobDescriptionFormProps) {
  const router = useRouter()
  const [jobDescription, setJobDescription] = useState('')
  const [title, setTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<Template>('professional')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>('')

  const templates: { id: Template; name: string; desc: string }[] = [
    {
      id: 'professional',
      name: dict.resumes?.templates?.modern || 'Modern',
      desc: dict.resumes?.templates?.modernDesc || 'Clean and professional',
    },
    {
      id: 'modern',
      name: dict.resumes?.templates?.modern || 'Modern',
      desc: dict.resumes?.templates?.modernDesc || 'Clean and professional',
    },
    {
      id: 'classic',
      name: dict.resumes?.templates?.classic || 'Classic',
      desc: dict.resumes?.templates?.classicDesc || 'Traditional format',
    },
    {
      id: 'minimal',
      name: dict.resumes?.templates?.minimal || 'Minimal',
      desc: dict.resumes?.templates?.minimalDesc || 'Simple and elegant',
    },
    {
      id: 'creative',
      name: dict.resumes?.templates?.creative || 'Creative',
      desc: dict.resumes?.templates?.creativeDesc || 'Bold design',
    },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsGenerating(true)
    setProgress(dict.resumes?.fromJob?.analyzing || 'Analyzing job description...')

    try {
      // Validate inputs
      if (!jobDescription.trim()) {
        throw new Error('Job description is required')
      }

      if (!title.trim()) {
        throw new Error(dict.resumes?.errors?.titleRequired || 'Resume title is required')
      }

      // Call AI API to generate resume
      setProgress(dict.resumes?.fromJob?.generating || 'Generating your CV...')
      const response = await fetch('/api/ai/generate-from-job-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobDescription: jobDescription.trim(),
          title: title.trim(),
          template: selectedTemplate,
          locale,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate CV')
      }

      const data = await response.json()

      if (!data.success || !data.resumeId) {
        throw new Error('Failed to create resume')
      }

      // Redirect to editor
      router.push(`/${locale}/dashboard/resumes/${data.resumeId}/edit`)
    } catch (err) {
      console.error('Error generating CV:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      setIsGenerating(false)
      setProgress('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* CV Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-700">
          {dict.resumes?.fromJob?.titleLabel || 'CV Title'}
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={dict.resumes?.fromJob?.titlePlaceholder || 'e.g., Software Engineer CV for TechCorp'}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          disabled={isGenerating}
          required
        />
      </div>

      {/* Job Description */}
      <div>
        <label htmlFor="jobDescription" className="block text-sm font-medium text-slate-700">
          {dict.resumes?.fromJob?.jobDescriptionLabel || 'Job Description'}
        </label>
        <textarea
          id="jobDescription"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder={
            dict.resumes?.fromJob?.jobDescriptionPlaceholder ||
            'Paste the full job description here...'
          }
          rows={12}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          disabled={isGenerating}
          required
        />
        <p className="mt-2 text-xs text-slate-500">
          {dict.resumes?.fromJob?.jobDescriptionHint || 'Paste the complete job description including requirements, responsibilities, and qualifications.'}
        </p>
      </div>

      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700">
          {dict.resumes?.fromJob?.templateLabel || 'Choose Template'}
        </label>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedTemplate(template.id)}
              disabled={isGenerating}
              className={`rounded-lg border-2 p-4 text-left transition-all ${
                selectedTemplate === template.id
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              } ${isGenerating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <div className="font-medium text-slate-900">{template.name}</div>
              <div className="mt-1 text-xs text-slate-600">{template.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Progress Message */}
      {isGenerating && progress && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            <span className="text-sm font-medium text-teal-800">{progress}</span>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
        <button
          type="submit"
          disabled={isGenerating || !jobDescription.trim() || !title.trim()}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {dict.resumes?.fromJob?.generating || 'Generating...'}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {dict.resumes?.fromJob?.create || 'Generate CV'}
            </>
          )}
        </button>
      </div>
    </form>
  )
}
