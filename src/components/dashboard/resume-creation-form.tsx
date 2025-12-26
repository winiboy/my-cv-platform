'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Sparkles, Layout, Palette } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n'
import type { ResumeTemplate } from '@/types/database'

interface ResumeCreationFormProps {
  locale: Locale
  userId: string
  dict: any
}

const templates: Array<{
  id: ResumeTemplate
  name: string
  description: string
  icon: typeof FileText
}> = [
  {
    id: 'modern',
    name: 'Modern',
    description: 'Clean and contemporary design with a professional look',
    icon: Sparkles,
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Traditional layout perfect for corporate positions',
    icon: FileText,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Simple and elegant with focus on content',
    icon: Layout,
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Bold and unique for creative industries',
    icon: Palette,
  },
]

export function ResumeCreationForm({ locale, userId, dict }: ResumeCreationFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplate>('modern')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError(dict.resumes?.errors?.titleRequired || 'Resume title is required')
      return
    }

    setIsCreating(true)

    try {
      const supabase = createClient()

      // Create new resume
      const { data: resume, error: createError } = await (supabase
        .from('resumes')
        .insert({
          user_id: userId,
          title: title.trim(),
          template: selectedTemplate,
          contact: {},
          experience: [],
          education: [],
          skills: [],
          languages: [],
          certifications: [],
          projects: [],
          custom_sections: [],
        } as any)
        .select()
        .single() as any)

      if (createError) {
        console.error('Error creating resume:', createError)
        setError(dict.resumes?.errors?.createFailed || 'Failed to create resume')
        setIsCreating(false)
        return
      }

      // Redirect to editor
      router.push(`/${locale}/dashboard/resumes/${resume.id}/edit`)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError(dict.resumes?.errors?.createFailed || 'Failed to create resume')
      setIsCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Resume Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-900">
          {dict.resumes?.new?.titleLabel || 'Resume Title'}
        </label>
        <p className="mt-1 text-sm text-slate-500">
          {dict.resumes?.new?.titleHint ||
            'Give your resume a descriptive name (e.g., "Software Engineer Resume")'}
        </p>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={dict.resumes?.new?.titlePlaceholder || 'e.g., Marketing Manager Resume'}
          className="mt-2 block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          disabled={isCreating}
        />
      </div>

      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-900">
          {dict.resumes?.new?.templateLabel || 'Choose Template'}
        </label>
        <p className="mt-1 text-sm text-slate-500">
          {dict.resumes?.new?.templateHint || 'Select a template that fits your style'}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {templates.map((template) => {
            const Icon = template.icon
            const isSelected = selectedTemplate === template.id

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplate(template.id)}
                className={`flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? 'border-teal-500 bg-teal-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
                disabled={isCreating}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    isSelected ? 'bg-teal-100' : 'bg-slate-100'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${isSelected ? 'text-teal-600' : 'text-slate-600'}`}
                  />
                </div>
                <h3
                  className={`mt-3 font-semibold ${isSelected ? 'text-teal-900' : 'text-slate-900'}`}
                >
                  {dict.resumes?.templates?.[template.id] || template.name}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{template.description}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-slate-700 hover:text-slate-900"
          disabled={isCreating}
        >
          {dict.common?.cancel || 'Cancel'}
        </button>
        <button
          type="submit"
          disabled={isCreating}
          className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreating
            ? dict.resumes?.new?.creating || 'Creating...'
            : dict.resumes?.new?.create || 'Create Resume'}
        </button>
      </div>
    </form>
  )
}
