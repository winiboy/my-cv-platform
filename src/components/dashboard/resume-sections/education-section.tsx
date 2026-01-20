'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, GripVertical, Sparkles, Languages, X, Check, Eye, EyeOff } from 'lucide-react'
import type { Resume, ResumeEducation } from '@/types/database'
import { KeyAchievementsToolbar, KeyAchievementsFormatCommand } from '../key-achievements-toolbar'
import { RichTextEditor } from '../rich-text-editor'
import { htmlToPlainText, migrateTextToHtml } from '@/lib/html-utils'

interface EducationSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
  locale: string
}

export function EducationSection({ resume, updateResume, dict, locale }: EducationSectionProps) {
  const education = (resume.education as unknown as ResumeEducation[]) || []

  // AI state management
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null)
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null)
  const [optimizedDescriptions, setOptimizedDescriptions] = useState<{ [key: number]: string }>({})
  const [translatedDescriptions, setTranslatedDescriptions] = useState<{ [key: number]: { text: string; language: string } }>({})
  const [error, setError] = useState<string | null>(null)

  const addEducation = () => {
    const newEducation: ResumeEducation = {
      school: '',
      degree: '',
      field: '',
      startDate: '',
      endDate: '',
      gpa: '',
      description: '',
      achievements: [],
      visible: true, // Default to visible
    }
    updateResume({ education: [...education, newEducation] as any })
  }

  const toggleVisibility = (index: number) => {
    const updated = [...education]
    updated[index].visible = !(updated[index].visible ?? true)
    updateResume({ education: updated as any })
  }

  const updateEducation = (index: number, updates: Partial<ResumeEducation>) => {
    const updated = [...education]
    updated[index] = { ...updated[index], ...updates }
    updateResume({ education: updated as any })
  }

  const removeEducation = (index: number) => {
    const updated = education.filter((_, i) => i !== index)
    updateResume({ education: updated as any })
  }

  // Handle formatting commands from toolbar
  const handleFormat = useCallback((index: number, command: KeyAchievementsFormatCommand) => {
    const editorId = `education-description-${index}`
    const editor = document.getElementById(editorId) as HTMLDivElement | null
    if (!editor) return

    editor.focus()

    // Restore selection if needed
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }

    switch (command) {
      case 'bold':
        document.execCommand('bold')
        break
      case 'italic':
        document.execCommand('italic')
        break
      case 'alignLeft':
        document.execCommand('justifyLeft')
        break
      case 'alignCenter':
        document.execCommand('justifyCenter')
        break
      case 'alignJustify':
        document.execCommand('justifyFull')
        break
      case 'bulletList':
        document.execCommand('insertUnorderedList')
        break
      case 'numberedList':
        document.execCommand('insertOrderedList')
        break
      case 'dashList':
        // Check if we're already in a dash list (to toggle it off)
        const existingDashList = editor.querySelector('ul[style*="list-style-type: none"]')
        if (existingDashList) {
          // Remove dash spans from each li before removing the list
          const dashItems = existingDashList.querySelectorAll('li')
          dashItems.forEach(item => {
            // Remove the dash span at the beginning
            const dashSpan = item.querySelector('span[style*="margin-right"]')
            if (dashSpan && dashSpan.textContent === '-') {
              dashSpan.remove()
            }
          })
          // Remove the list-style-type style so insertUnorderedList works correctly
          ;(existingDashList as HTMLElement).style.listStyleType = ''
          // Now toggle off the list
          document.execCommand('insertUnorderedList')
        } else {
          // Create a new dash list
          document.execCommand('insertUnorderedList')
          const listElement = editor.querySelector('ul:not([style*="list-style-type"])')
          if (listElement) {
            (listElement as HTMLElement).style.listStyleType = 'none'
            const items = listElement.querySelectorAll('li')
            items.forEach(item => {
              if (!item.textContent?.startsWith('- ')) {
                const textContent = item.innerHTML
                item.innerHTML = `<span style="margin-right: 0.5em;">-</span>${textContent}`
              }
            })
          }
        }
        break
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  // Handle description change from RichTextEditor
  const handleDescriptionChange = (index: number, html: string, plainText: string) => {
    updateEducation(index, { description: html })
  }

  const handleOptimize = async (index: number) => {
    const edu = education[index]
    // Extract plain text from HTML for AI processing
    const plainText = htmlToPlainText(edu.description || '')

    if (!plainText || plainText.trim().length < 10) {
      setError(dict?.errors?.validation?.descriptionTooShort || 'Please add a description (at least 10 characters) before optimizing')
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
          text: plainText,
          context: `${edu.degree} in ${edu.field} at ${edu.school}`,
          locale,
        }),
      })

      if (!response.ok) {
        throw new Error(dict?.errors?.api?.optimizeDescription || 'Failed to optimize description')
      }

      const data = await response.json()
      // Convert AI response back to HTML
      const optimizedHtml = migrateTextToHtml(data.optimizedText)
      setOptimizedDescriptions({ ...optimizedDescriptions, [index]: optimizedHtml })
    } catch (err) {
      console.error('Error optimizing description:', err)
      setError(dict?.errors?.api?.optimizeDescription || 'Failed to optimize description. Please try again.')
    } finally {
      setOptimizingIndex(null)
    }
  }

  const handleAcceptOptimization = (index: number) => {
    const optimizedText = optimizedDescriptions[index]
    if (optimizedText) {
      updateEducation(index, { description: optimizedText })
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

  const handleTranslate = async (index: number, language: 'fr' | 'de' | 'en' | 'it') => {
    const edu = education[index]
    // Extract plain text from HTML for translation
    const plainText = htmlToPlainText(edu.description || '')

    if (!plainText || plainText.trim().length < 10) {
      setError(dict?.errors?.validation?.descriptionRequiredTranslate || 'Please write a description before translating')
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
          summary: plainText,
          targetLanguage: language,
        }),
      })

      if (!response.ok) {
        throw new Error(dict?.errors?.api?.translateText || 'Failed to translate description')
      }

      const data = await response.json()
      // Convert translation back to HTML
      const translatedHtml = migrateTextToHtml(data.translatedSummary)
      setTranslatedDescriptions({
        ...translatedDescriptions,
        [index]: { text: translatedHtml, language }
      })
    } catch (err) {
      console.error('Error translating description:', err)
      setError(dict?.errors?.api?.translateText || 'Failed to translate description. Please try again.')
    } finally {
      setTranslatingIndex(null)
    }
  }

  const handleAcceptTranslation = (index: number) => {
    const translation = translatedDescriptions[index]
    if (translation) {
      updateEducation(index, { description: translation.text })
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
            {dict.resumes?.editor?.sections?.education || 'Education'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {dict.resumes?.editor?.educationHint || 'Add your educational background'}
          </p>
        </div>
        <button
          onClick={addEducation}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          {dict.resumes?.editor?.addEducation || 'Add Education'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {education.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">
              {dict.resumes?.editor?.noEducation || 'No education added yet'}
            </p>
          </div>
        )}

        {education.map((edu, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-5 w-5 text-slate-400" />
                <h3 className="font-semibold text-slate-900">
                  {edu.degree || dict.resumes?.editor?.newDegree || 'New Degree'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleOptimize(index)}
                    disabled={optimizingIndex === index || !edu.description || edu.description.trim().length < 10}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    {optimizingIndex === index ? dict.resumes?.editor?.optimizing || 'Optimizing...' : dict.resumes?.editor?.optimizeWithAI || 'Optimize with AI'}
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleTranslate(index, 'fr')}
                      disabled={translatingIndex === index || !edu.description || edu.description.trim().length < 10}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToFrench || 'Translate to French'}
                    >
                      <Languages className="h-3 w-3" />
                      FR
                    </button>
                    <button
                      onClick={() => handleTranslate(index, 'de')}
                      disabled={translatingIndex === index || !edu.description || edu.description.trim().length < 10}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToGerman || 'Translate to German'}
                    >
                      <Languages className="h-3 w-3" />
                      DE
                    </button>
                    <button
                      onClick={() => handleTranslate(index, 'en')}
                      disabled={translatingIndex === index || !edu.description || edu.description.trim().length < 10}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToEnglish || 'Translate to English'}
                    >
                      <Languages className="h-3 w-3" />
                      EN
                    </button>
                    <button
                      onClick={() => handleTranslate(index, 'it')}
                      disabled={translatingIndex === index || !edu.description || edu.description.trim().length < 10}
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
                  className={`transition-colors ${edu.visible ?? true ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-400'}`}
                  title={edu.visible ?? true ? (dict?.aria?.hideFromCV || 'Hide from CV') : (dict?.aria?.showInCV || 'Show in CV')}
                >
                  {edu.visible ?? true ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => removeEducation(index)}
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
                    {dict.resumes?.editor?.degree || 'Degree'}
                  </label>
                  <input
                    type="text"
                    value={edu.degree}
                    onChange={(e) => updateEducation(index, { degree: e.target.value })}
                    placeholder="Bachelor of Science"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.field || 'Field of Study'}
                  </label>
                  <input
                    type="text"
                    value={edu.field || ''}
                    onChange={(e) => updateEducation(index, { field: e.target.value })}
                    placeholder="Computer Science"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900">
                  {dict.resumes?.editor?.school || 'School'}
                </label>
                <input
                  type="text"
                  value={edu.school}
                  onChange={(e) => updateEducation(index, { school: e.target.value })}
                  placeholder="University of California"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.startDate || 'Start Date'}
                  </label>
                  <input
                    type="month"
                    value={edu.startDate}
                    onChange={(e) => updateEducation(index, { startDate: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.endDate || 'End Date'}
                  </label>
                  <input
                    type="month"
                    value={edu.endDate || ''}
                    onChange={(e) => updateEducation(index, { endDate: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.gpa || 'GPA (optional)'}
                  </label>
                  <input
                    type="text"
                    value={edu.gpa || ''}
                    onChange={(e) => updateEducation(index, { gpa: e.target.value })}
                    placeholder="3.8"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-900">
                    {dict.resumes?.editor?.description || 'Description'}
                  </label>
                  {/* Rich Text Toolbar for Description field - only for professional template */}
                  {resume.template === 'professional' && (
                    <KeyAchievementsToolbar
                      editorId={`education-description-${index}`}
                      onFormat={(command) => handleFormat(index, command)}
                      dict={dict}
                    />
                  )}
                </div>
                <div className="mt-1">
                  <RichTextEditor
                    id={`education-description-${index}`}
                    value={edu.description || ''}
                    onChange={(html, plainText) => handleDescriptionChange(index, html, plainText)}
                    placeholder={
                      dict.resumes?.editor?.educationDescPlaceholder ||
                      'Add relevant coursework, honors, activities...'
                    }
                    minHeight="60px"
                    showRibbon={false}
                    dict={dict}
                  />
                </div>
              </div>

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
                      {dict?.translation?.translatedTo || 'Translated to'} {translatedDescriptions[index].language.toUpperCase()}
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
                      {dict?.translation?.useTranslation || 'Use Translation'}
                    </button>
                    <button
                      onClick={() => handleRejectTranslation(index)}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {dict?.translation?.keepOriginal || 'Keep Original'}
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
