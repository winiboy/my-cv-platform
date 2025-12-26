'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, GripVertical, Sparkles, Languages, X, Check, Eye, EyeOff } from 'lucide-react'
import type { Resume, ResumeExperience } from '@/types/database'

interface ExperienceSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
  locale: string
}

export function ExperienceSection({ resume, updateResume, dict, locale }: ExperienceSectionProps) {
  const experiences = (resume.experience as unknown as ResumeExperience[]) || []

  // AI state management
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null)
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null)
  const [optimizedDescriptions, setOptimizedDescriptions] = useState<{ [key: number]: string }>({})
  const [translatedDescriptions, setTranslatedDescriptions] = useState<{ [key: number]: { text: string; language: string } }>({})
  const [error, setError] = useState<string | null>(null)

  const addExperience = () => {
    const newExperience: ResumeExperience = {
      company: '',
      position: '',
      startDate: '',
      endDate: '',
      current: false,
      location: '',
      description: '',
      achievements: [],
      visible: true, // Default to visible
    }
    updateResume({ experience: [...experiences, newExperience] as any })
  }

  const toggleVisibility = (index: number) => {
    const updated = [...experiences]
    updated[index].visible = !(updated[index].visible ?? true)
    updateResume({ experience: updated as any })
  }

  const updateExperience = (index: number, updates: Partial<ResumeExperience>) => {
    const updated = [...experiences]
    updated[index] = { ...updated[index], ...updates }
    updateResume({ experience: updated as any })
  }

  const removeExperience = (index: number) => {
    const updated = experiences.filter((_, i) => i !== index)
    updateResume({ experience: updated as any })
  }

  // Auto-resize textarea function
  const autoResizeTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = element.scrollHeight + 'px'
  }

  // Handle description change with auto-resize
  const handleDescriptionChange = (index: number, value: string, event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateExperience(index, { description: value })
    autoResizeTextarea(event.target)
  }

  const handleOptimize = async (index: number) => {
    const exp = experiences[index]
    if (!exp.description || exp.description.trim().length < 10) {
      setError('Please add a description (at least 10 characters) before optimizing')
      return
    }

    setOptimizingIndex(index)
    setError(null)

    try {
      const response = await fetch('/api/ai/optimize-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: exp.description,
          context: `${exp.position} at ${exp.company}`,
          locale,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to optimize description')
      }

      const data = await response.json()
      setOptimizedDescriptions({ ...optimizedDescriptions, [index]: data.optimizedText })
    } catch (err) {
      console.error('Error optimizing description:', err)
      setError('Failed to optimize description. Please try again.')
    } finally {
      setOptimizingIndex(null)
    }
  }

  const handleTranslate = async (index: number, language: 'fr' | 'de' | 'en' | 'it') => {
    const exp = experiences[index]
    if (!exp.description || exp.description.trim().length < 10) {
      setError('Please write a description before translating')
      return
    }

    setTranslatingIndex(index)
    setError(null)

    try {
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: exp.description,
          targetLanguage: language,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to translate description')
      }

      const data = await response.json()
      setTranslatedDescriptions({
        ...translatedDescriptions,
        [index]: { text: data.translatedSummary, language }
      })
    } catch (err) {
      console.error('Error translating description:', err)
      setError('Failed to translate description. Please try again.')
    } finally {
      setTranslatingIndex(null)
    }
  }

  const handleAcceptOptimization = (index: number) => {
    const optimizedText = optimizedDescriptions[index]
    if (optimizedText) {
      updateExperience(index, { description: optimizedText })
      const newOptimized = { ...optimizedDescriptions }
      delete newOptimized[index]
      setOptimizedDescriptions(newOptimized)
    }
  }

  const handleRejectOptimization = (index: number) => {
    const newOptimized = { ...optimizedDescriptions }
    delete newOptimized[index]
    setOptimizedDescriptions(newOptimized)
  }

  const handleAcceptTranslation = (index: number) => {
    const translation = translatedDescriptions[index]
    if (translation) {
      updateExperience(index, { description: translation.text })
      const newTranslated = { ...translatedDescriptions }
      delete newTranslated[index]
      setTranslatedDescriptions(newTranslated)
    }
  }

  const handleRejectTranslation = (index: number) => {
    const newTranslated = { ...translatedDescriptions }
    delete newTranslated[index]
    setTranslatedDescriptions(newTranslated)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {dict.resumes?.editor?.sections?.experience || 'Work Experience'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {dict.resumes?.editor?.experienceHint || 'Add your professional work history'}
          </p>
        </div>
        <button
          onClick={addExperience}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          {dict.resumes?.editor?.addExperience || 'Add Experience'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {experiences.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">
              {dict.resumes?.editor?.noExperience || 'No work experience added yet'}
            </p>
          </div>
        )}

        {experiences.map((exp, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-5 w-5 text-slate-400" />
                <h3 className="font-semibold text-slate-900">
                  {exp.position || dict.resumes?.editor?.newPosition || 'New Position'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleOptimize(index)}
                    disabled={optimizingIndex === index || !exp.description || exp.description.trim().length < 10}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    {optimizingIndex === index ? dict.resumes?.editor?.optimizing || 'Optimizing...' : dict.resumes?.editor?.optimizeWithAI || 'Optimize with AI'}
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleTranslate(index, 'fr')}
                      disabled={translatingIndex === index || !exp.description || exp.description.trim().length < 10}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToFrench || 'Translate to French'}
                    >
                      <Languages className="h-3 w-3" />
                      FR
                    </button>
                    <button
                      onClick={() => handleTranslate(index, 'de')}
                      disabled={translatingIndex === index || !exp.description || exp.description.trim().length < 10}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToGerman || 'Translate to German'}
                    >
                      <Languages className="h-3 w-3" />
                      DE
                    </button>
                    <button
                      onClick={() => handleTranslate(index, 'en')}
                      disabled={translatingIndex === index || !exp.description || exp.description.trim().length < 10}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToEnglish || 'Translate to English'}
                    >
                      <Languages className="h-3 w-3" />
                      EN
                    </button>
                    <button
                      onClick={() => handleTranslate(index, 'it')}
                      disabled={translatingIndex === index || !exp.description || exp.description.trim().length < 10}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToItalian || 'Translate to Italian'}
                    >
                      <Languages className="h-3 w-3" />
                      IT
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => toggleVisibility(index)}
                  className={`transition-colors ${exp.visible ?? true ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-400'}`}
                  title={exp.visible ?? true ? 'Hide from CV' : 'Show in CV'}
                >
                  {exp.visible ?? true ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => removeExperience(index)}
                  className="text-slate-400 hover:text-red-600"
                  title={dict.common?.delete || 'Delete'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.position || 'Position'}
                  </label>
                  <input
                    type="text"
                    value={exp.position}
                    onChange={(e) => updateExperience(index, { position: e.target.value })}
                    placeholder="Software Engineer"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.company || 'Company'}
                  </label>
                  <input
                    type="text"
                    value={exp.company}
                    onChange={(e) => updateExperience(index, { company: e.target.value })}
                    placeholder="Tech Corp"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900">
                  {dict.resumes?.editor?.location || 'Location'}
                </label>
                <input
                  type="text"
                  value={exp.location || ''}
                  onChange={(e) => updateExperience(index, { location: e.target.value })}
                  placeholder="San Francisco, CA"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.startDate || 'Start Date'}
                  </label>
                  <input
                    type="month"
                    value={exp.startDate}
                    onChange={(e) => updateExperience(index, { startDate: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.endDate || 'End Date'}
                  </label>
                  <input
                    type="month"
                    value={exp.endDate || ''}
                    onChange={(e) => updateExperience(index, { endDate: e.target.value })}
                    disabled={exp.current}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exp.current}
                      onChange={(e) =>
                        updateExperience(index, { current: e.target.checked, endDate: '' })
                      }
                      className="rounded border-slate-300 text-teal-600 focus:ring-2 focus:ring-teal-500/20"
                    />
                    <span className="text-sm text-slate-700">
                      {dict.resumes?.editor?.current || 'Current position'}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900">
                  {dict.resumes?.editor?.description || 'Description'}
                </label>
                <textarea
                  value={exp.description || ''}
                  onChange={(e) => handleDescriptionChange(index, e.target.value, e)}
                  onInput={(e) => autoResizeTextarea(e.target as HTMLTextAreaElement)}
                  rows={3}
                  placeholder={
                    dict.resumes?.editor?.descriptionPlaceholder ||
                    'Describe your responsibilities and achievements...'
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none overflow-hidden"
                  style={{ minHeight: '72px' }}
                  ref={(el) => {
                    if (el) {
                      autoResizeTextarea(el)
                    }
                  }}
                />
              </div>

              {/* Current Achievements Display */}
              {exp.achievements && exp.achievements.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-900">
                      Current Achievements
                    </label>
                    <button
                      onClick={() => updateExperience(index, { achievements: [] })}
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      Clear All
                    </button>
                  </div>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {exp.achievements.map((achievement, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-slate-400">•</span>
                        <span className="flex-1">{achievement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AI-Optimized Description Preview */}
              {optimizedDescriptions[index] && (
                <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-purple-900">
                      <Sparkles className="h-4 w-4" />
                      {dict.resumes?.editor?.aiOptimizedSummary || 'AI-Optimized Summary'}
                    </h4>
                    <button
                      onClick={() => handleRejectOptimization(index)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                    {optimizedDescriptions[index]}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptOptimization(index)}
                      className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                    >
                      <Check className="h-4 w-4" />
                      {dict.resumes?.editor?.useThisVersion || 'Use This Version'}
                    </button>
                    <button
                      onClick={() => handleRejectOptimization(index)}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {dict.resumes?.editor?.keepOriginal || 'Keep Original'}
                    </button>
                  </div>
                </div>
              )}

              {/* Translated Description Preview */}
              {translatedDescriptions[index] && (
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                      <Languages className="h-4 w-4" />
                      Translated to {translatedDescriptions[index].language.toUpperCase()}
                    </h4>
                    <button
                      onClick={() => handleRejectTranslation(index)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-slate-900">
                    {translatedDescriptions[index].text}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptTranslation(index)}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <Check className="h-4 w-4" />
                      Use Translation
                    </button>
                    <button
                      onClick={() => handleRejectTranslation(index)}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {dict.resumes?.editor?.keepOriginal || 'Keep Original'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
