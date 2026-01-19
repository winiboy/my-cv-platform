'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText, Sparkles, Layout, PenTool, Briefcase } from 'lucide-react'
import type { ResumeInsert } from '@/types/database'

interface CreateResumeFormProps {
  locale: string
  dict: any
}

export function CreateResumeForm({ locale, dict }: CreateResumeFormProps) {
  const templates = [
    {
      id: 'modern',
      name: dict.resumes?.templates?.modern || 'Modern',
      description: dict.resumes?.templates?.modernDesc || 'Clean and professional with a contemporary design',
      icon: Sparkles,
    },
    {
      id: 'classic',
      name: dict.resumes?.templates?.classic || 'Classic',
      description: dict.resumes?.templates?.classicDesc || 'Traditional format preferred by conservative industries',
      icon: FileText,
    },
    {
      id: 'minimal',
      name: dict.resumes?.templates?.minimal || 'Minimal',
      description: dict.resumes?.templates?.minimalDesc || 'Simple and elegant with focus on content',
      icon: Layout,
    },
    {
      id: 'creative',
      name: dict.resumes?.templates?.creative || 'Creative',
      description: dict.resumes?.templates?.creativeDesc || 'Bold design for creative professionals',
      icon: PenTool,
    },
    {
      id: 'professional',
      name: dict.resumes?.templates?.professional || 'Professional',
      description: dict.resumes?.templates?.professionalDesc || 'Executive template with sidebar and key achievements section',
      icon: Briefcase,
    },
  ] as const
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('modern')
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

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError(dict?.errors?.validation?.loginRequired || 'You must be logged in to create a resume')
        setIsCreating(false)
        return
      }

      // Create resume
      const newResume: ResumeInsert = {
        user_id: user.id,
        title: title.trim(),
        template: selectedTemplate as 'modern' | 'classic' | 'minimal' | 'creative' | 'professional',
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
      }

      const { data: resume, error: insertError } = (await (supabase as any)
        .from('resumes')
        .insert(newResume)
        .select()
        .single()) as { data: any; error: any }

      if (insertError) {
        console.error('Error creating resume:', insertError)
        setError(dict?.errors?.api?.createResume || 'Failed to create resume. Please try again.')
        setIsCreating(false)
        return
      }

      // Redirect to editor
      router.push(`/${locale}/dashboard/resumes/${resume.id}/edit`)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError(dict?.errors?.generic || 'An unexpected error occurred. Please try again.')
      setIsCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Resume Title */}
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium">
          {dict.resumes?.new?.titleLabel || 'Resume Title'}
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={dict.resumes?.new?.titlePlaceholder || 'e.g., "Software Engineer Resume"'}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          disabled={isCreating}
        />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {dict.resumes?.new?.titleHint || 'Give your resume a descriptive name'}
        </p>
      </div>

      {/* Template Selection */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">{dict.resumes?.new?.templateLabel || 'Choose Template'}</label>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            {dict.resumes?.new?.templateHint || 'Select a template that fits your style'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => {
            const Icon = template.icon
            const isSelected = selectedTemplate === template.id

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplate(template.id)}
                disabled={isCreating}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{template.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {template.description}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
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
          {isCreating ? (dict.resumes?.new?.creating || 'Creating...') : (dict.resumes?.new?.create || 'Create Resume')}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isCreating}
          className="px-6 py-3 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {dict.common?.cancel || 'Cancel'}
        </button>
      </div>
    </form>
  )
}
