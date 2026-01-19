'use client'

import { useState, useRef, useCallback } from 'react'
import { Plus, Trash2, GripVertical, Sparkles, Languages, X, Check, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import type { Resume, ResumeExperience } from '@/types/database'
import { RichTextEditor } from '../rich-text-editor'
import { htmlToPlainText, migrateTextToHtml } from '@/lib/html-utils'
import { KeyAchievementsToolbar, KeyAchievementsFormatCommand } from '../key-achievements-toolbar'

interface ExperienceSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
  locale: string
}

export function ExperienceSection({ resume, updateResume, dict, locale }: ExperienceSectionProps) {
  const experiences = (resume.experience as unknown as ResumeExperience[]) || []

  // Expand/collapse state
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    experiences.length > 0 ? 0 : null
  )

  // AI state management
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null)
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null)
  const [optimizedDescriptions, setOptimizedDescriptions] = useState<{ [key: number]: string }>({})
  const [translatedDescriptions, setTranslatedDescriptions] = useState<{ [key: number]: { text: string; language: string } }>({})
  const [error, setError] = useState<string | null>(null)

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  // Handle formatting commands from toolbar
  const handleFormat = useCallback((index: number, command: KeyAchievementsFormatCommand) => {
    const editorId = `experience-description-${index}`
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
        break
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

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
    setExpandedIndex(experiences.length) // Expand the newly added experience
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
    // Update expanded index
    if (expandedIndex === index) {
      setExpandedIndex(null)
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1)
    }
  }

  // Handle description change
  const handleDescriptionChange = (index: number, html: string, plainText: string) => {
    updateExperience(index, { description: html })
  }

  const handleOptimize = async (index: number) => {
    const exp = experiences[index]
    // Extract plain text from HTML for AI processing
    const plainText = htmlToPlainText(exp.description || '')

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
          context: `${exp.position} at ${exp.company}`,
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

  const handleTranslate = async (index: number, language: 'fr' | 'de' | 'en' | 'it') => {
    const exp = experiences[index]
    // Extract plain text from HTML for translation
    const plainText = htmlToPlainText(exp.description || '')

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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index)
    dragNodeRef.current = e.currentTarget
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    // Add a slight delay to allow the drag image to be captured
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.5'
      }
    }, 0)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    // Only clear if we're leaving the container, not entering a child
    const relatedTarget = e.relatedTarget as HTMLElement
    if (!e.currentTarget.contains(relatedTarget)) {
      setDragOverIndex(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    // Reorder the experiences array
    const updatedExperiences = [...experiences]
    const [draggedItem] = updatedExperiences.splice(draggedIndex, 1)
    updatedExperiences.splice(dropIndex, 0, draggedItem)

    updateResume({ experience: updatedExperiences as any })

    // Update expanded index to follow the moved item
    if (expandedIndex === draggedIndex) {
      setExpandedIndex(dropIndex)
    } else if (expandedIndex !== null) {
      if (draggedIndex < expandedIndex && dropIndex >= expandedIndex) {
        setExpandedIndex(expandedIndex - 1)
      } else if (draggedIndex > expandedIndex && dropIndex <= expandedIndex) {
        setExpandedIndex(expandedIndex + 1)
      }
    }

    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1'
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
    dragNodeRef.current = null
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

        {experiences.map((exp, index) => {
          const isExpanded = expandedIndex === index

          return (
            <div
              key={index}
              draggable={!isExpanded}
              onDragStart={(e) => isExpanded ? e.preventDefault() : handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnter={(e) => handleDragEnter(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`rounded-lg border bg-white transition-all ${
                draggedIndex === index
                  ? 'border-teal-400 opacity-50 shadow-lg'
                  : dragOverIndex === index
                  ? 'border-teal-500 border-2 shadow-md'
                  : 'border-slate-200'
              }`}
            >
              {/* Header - always visible */}
              <div
                className="flex cursor-pointer items-center justify-between p-6"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
              >
                {/* Drag handle */}
                <div
                  className="mr-3 cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing"
                  title={dict.resumes?.editor?.dragToReorder || 'Drag to reorder'}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">
                    {exp.position || dict.resumes?.editor?.newPosition || 'New Position'}
                  </h3>
                  {exp.company && (
                    <p className="mt-1 text-sm text-slate-600">{exp.company}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOptimize(index)
                      }}
                      disabled={optimizingIndex === index || !exp.description || exp.description.trim().length < 10}
                      className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      {optimizingIndex === index ? dict.resumes?.editor?.optimizing || 'Optimizing...' : dict.resumes?.editor?.optimizeWithAI || 'Optimize with AI'}
                    </button>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTranslate(index, 'fr')
                        }}
                        disabled={translatingIndex === index || !exp.description || exp.description.trim().length < 10}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={dict.resumes?.editor?.translateToFrench || 'Translate to French'}
                      >
                        <Languages className="h-3 w-3" />
                        FR
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTranslate(index, 'de')
                        }}
                        disabled={translatingIndex === index || !exp.description || exp.description.trim().length < 10}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={dict.resumes?.editor?.translateToGerman || 'Translate to German'}
                      >
                        <Languages className="h-3 w-3" />
                        DE
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTranslate(index, 'en')
                        }}
                        disabled={translatingIndex === index || !exp.description || exp.description.trim().length < 10}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={dict.resumes?.editor?.translateToEnglish || 'Translate to English'}
                      >
                        <Languages className="h-3 w-3" />
                        EN
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTranslate(index, 'it')
                        }}
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
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleVisibility(index)
                    }}
                  className={`transition-colors ${exp.visible ?? true ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-400'}`}
                  title={exp.visible ?? true ? (dict?.aria?.hideFromCV || 'Hide from CV') : (dict?.aria?.showInCV || 'Show in CV')}
                >
                  {exp.visible ?? true ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeExperience(index)
                  }}
                  className="text-slate-400 hover:text-red-600"
                  title={dict.common?.delete || 'Delete'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </div>

            {/* Expandable content */}
            {isExpanded && (
              <div className="space-y-4 border-t border-slate-200 p-6">
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
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    {dict.resumes?.editor?.description || 'Description'}
                  </label>
                  {/* Rich Text Toolbar for Description field - only for professional template */}
                  {resume.template === 'professional' && (
                    <KeyAchievementsToolbar
                      editorId={`experience-description-${index}`}
                      onFormat={(command) => handleFormat(index, command)}
                    />
                  )}
                </div>
                <div className="mt-1">
                  <RichTextEditor
                    id={`experience-description-${index}`}
                    value={exp.description || ''}
                    onChange={(html, plainText) => handleDescriptionChange(index, html, plainText)}
                    placeholder={
                      dict.resumes?.editor?.descriptionPlaceholder ||
                      'Describe your responsibilities and achievements...'
                    }
                    minHeight="72px"
                    showRibbon={false}
                  />
                </div>
              </div>

              {/* Current Achievements Display */}
              {exp.achievements && exp.achievements.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-900">
                      {dict?.translation?.currentAchievements || 'Current Achievements'}
                    </label>
                    <button
                      onClick={() => updateExperience(index, { achievements: [] })}
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      {dict?.translation?.clearAll || 'Clear All'}
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
                      {dict.resumes?.editor?.keepOriginal || 'Keep Original'}
                    </button>
                  </div>
                </div>
              )}
              </div>
            )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
