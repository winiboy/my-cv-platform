'use client'

import { Plus, Trash2, ChevronDown, ChevronUp, X, Sparkles, Languages, Check, Eye, EyeOff, GripVertical } from 'lucide-react'
import { useState, useRef, useCallback } from 'react'
import type { Resume, ResumeProject } from '@/types/database'
import { RichTextEditor } from '../rich-text-editor'
import { KeyAchievementsToolbar, KeyAchievementsFormatCommand } from '../key-achievements-toolbar'
import { htmlToPlainText, migrateTextToHtml } from '@/lib/html-utils'

interface ProjectsSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
  locale: string
}

export function ProjectsSection({ resume, updateResume, dict, locale }: ProjectsSectionProps) {
  const projects = (resume.projects as unknown as ResumeProject[]) || []
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    projects.length > 0 ? 0 : null
  )
  const [newTechInputs, setNewTechInputs] = useState<{ [key: number]: string }>({})

  // AI state management
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null)
  const [optimizedDescriptions, setOptimizedDescriptions] = useState<{ [key: number]: string }>({})
  const [error, setError] = useState<string | null>(null)

  // Translation state management
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null)
  const [translatedDescriptions, setTranslatedDescriptions] = useState<{ [key: number]: { text: string; language: string } }>({})

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  // Editor refs for toolbar formatting
  const editorRefs = useRef<{ [key: number]: HTMLDivElement | null }>({})

  // Handle formatting commands from toolbar
  const handleFormat = useCallback((index: number, command: KeyAchievementsFormatCommand) => {
    const editorId = `project-description-${index}`
    const editor = document.getElementById(editorId) as HTMLDivElement | null
    if (!editor) return

    editor.focus()

    // Restore selection if needed
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      // Create a selection at the end if none exists
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
        // Insert a custom dash list by creating an unordered list with dash markers
        document.execCommand('insertUnorderedList')
        // Apply dash style to the list
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

    // Trigger input event to sync state
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  const addProject = () => {
    const newProject: ResumeProject = {
      name: '',
      description: '',
      technologies: [],
      visible: true, // Default to visible
    }
    const updated = [...projects, newProject]
    updateResume({ projects: updated as any })
    setExpandedIndex(projects.length)
  }

  const toggleVisibility = (index: number) => {
    const updated = [...projects]
    updated[index].visible = !(updated[index].visible ?? true)
    updateResume({ projects: updated as any })
  }

  const updateProject = (index: number, updates: Partial<ResumeProject>) => {
    const updated = [...projects]
    updated[index] = { ...updated[index], ...updates }
    updateResume({ projects: updated as any })
  }

  const removeProject = (index: number) => {
    const updated = projects.filter((_, i) => i !== index)
    updateResume({ projects: updated as any })
    if (expandedIndex === index) {
      setExpandedIndex(null)
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1)
    }
  }

  const addTechnology = (projectIndex: number) => {
    const techName = newTechInputs[projectIndex]?.trim()
    if (!techName) return

    const updated = [...projects]
    const technologies = updated[projectIndex].technologies || []
    updated[projectIndex].technologies = [...technologies, techName]
    updateResume({ projects: updated as any })
    setNewTechInputs({ ...newTechInputs, [projectIndex]: '' })
  }

  const removeTechnology = (projectIndex: number, techIndex: number) => {
    const updated = [...projects]
    const technologies = updated[projectIndex].technologies || []
    updated[projectIndex].technologies = technologies.filter((_, i) => i !== techIndex)
    updateResume({ projects: updated as any })
  }

  // Handle description change
  const handleDescriptionChange = (index: number, html: string, plainText: string) => {
    updateProject(index, { description: html })
  }

  const handleOptimize = async (index: number) => {
    const project = projects[index]
    // Extract plain text from HTML for AI processing
    const plainText = htmlToPlainText(project.description || '')

    if (!plainText || plainText.trim().length < 10) {
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
          text: plainText,
          context: `Project: ${project.name}${
            project.technologies && project.technologies.length > 0
              ? ` (Technologies: ${project.technologies.join(', ')})`
              : ''
          }`,
          locale,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to optimize description')
      }

      const data = await response.json()
      // Convert AI response back to HTML
      const optimizedHtml = migrateTextToHtml(data.optimizedText)
      setOptimizedDescriptions({ ...optimizedDescriptions, [index]: optimizedHtml })
    } catch (err) {
      console.error('Error optimizing description:', err)
      setError('Failed to optimize description. Please try again.')
    } finally {
      setOptimizingIndex(null)
    }
  }

  const handleAcceptOptimization = (index: number) => {
    const optimizedText = optimizedDescriptions[index]
    if (optimizedText) {
      updateProject(index, { description: optimizedText })
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
    const project = projects[index]
    // Extract plain text from HTML for translation
    const plainText = htmlToPlainText(project.description || '')

    if (!plainText || plainText.trim().length < 10) {
      setError('Please add a description (at least 10 characters) before translating')
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
        throw new Error('Failed to translate description')
      }

      const data = await response.json()
      // Convert translation back to HTML
      const translatedHtml = migrateTextToHtml(data.translatedSummary)
      setTranslatedDescriptions({
        ...translatedDescriptions,
        [index]: { text: translatedHtml, language: language.toUpperCase() },
      })
    } catch (err) {
      console.error('Error translating description:', err)
      setError('Failed to translate description. Please try again.')
    } finally {
      setTranslatingIndex(null)
    }
  }

  const handleAcceptTranslation = (index: number) => {
    const translated = translatedDescriptions[index]
    if (translated) {
      updateProject(index, { description: translated.text })
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

    // Reorder the projects array
    const updatedProjects = [...projects]
    const [draggedItem] = updatedProjects.splice(draggedIndex, 1)
    updatedProjects.splice(dropIndex, 0, draggedItem)

    updateResume({ projects: updatedProjects as any })

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
            {dict.resumes?.editor?.sections?.projects || 'Projects'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {dict.resumes?.editor?.projectsHint ||
              'Showcase notable projects and side work'}
          </p>
        </div>
        <button
          onClick={addProject}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          {dict.resumes?.editor?.addProject || 'Add Project'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {projects.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">
              {dict.resumes?.editor?.noProjects || 'No projects added yet'}
            </p>
          </div>
        )}

        {projects.map((project, index) => {
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
                    {project.name || dict.resumes?.editor?.newProject || 'New Project'}
                  </h3>
                  {/* Rich Text Toolbar for Description field */}
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <KeyAchievementsToolbar
                      editorId={`project-description-${index}`}
                      onFormat={(command) => handleFormat(index, command)}
                      disabled={!isExpanded}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOptimize(index)
                      }}
                      disabled={
                        optimizingIndex === index ||
                        !project.description ||
                        project.description.trim().length < 10
                      }
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
                        disabled={
                          translatingIndex === index ||
                          !project.description ||
                          project.description.trim().length < 10
                        }
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
                        disabled={
                          translatingIndex === index ||
                          !project.description ||
                          project.description.trim().length < 10
                        }
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
                        disabled={
                          translatingIndex === index ||
                          !project.description ||
                          project.description.trim().length < 10
                        }
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
                        disabled={
                          translatingIndex === index ||
                          !project.description ||
                          project.description.trim().length < 10
                        }
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
                    className={`transition-colors ${project.visible ?? true ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-400'}`}
                    title={project.visible ?? true ? 'Hide from CV' : 'Show in CV'}
                  >
                    {project.visible ?? true ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeProject(index)
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

              {isExpanded && (
                <div
                  className="space-y-4 border-t border-slate-200 p-6"
                  draggable={false}
                  onDragStart={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {dict.resumes?.editor?.projectName || 'Project Name'}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={project.name}
                      onChange={(e) => updateProject(index, { name: e.target.value })}
                      placeholder={
                        dict.resumes?.editor?.projectNamePlaceholder ||
                        'e.g., E-commerce Platform'
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {dict.resumes?.editor?.description || 'Description'}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="mt-1">
                      <RichTextEditor
                        id={`project-description-${index}`}
                        value={project.description || ''}
                        onChange={(html, plainText) => handleDescriptionChange(index, html, plainText)}
                        placeholder={
                          dict.resumes?.editor?.projectDescPlaceholder ||
                          'Describe the project, your role, and key achievements...'
                        }
                        minHeight="72px"
                        showRibbon={false}
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
                      <div
                        className="mb-4 text-sm leading-relaxed text-slate-900 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: optimizedDescriptions[index] }}
                      />
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
                          Translated Description ({translatedDescriptions[index].language})
                        </h4>
                        <button
                          onClick={() => handleRejectTranslation(index)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div
                        className="mb-4 text-sm leading-relaxed text-slate-900 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: translatedDescriptions[index].text }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptTranslation(index)}
                          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          <Check className="h-4 w-4" />
                          {dict.resumes?.editor?.useThisVersion || 'Use This Version'}
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

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        {dict.resumes?.editor?.startDate || 'Start Date'}{' '}
                        <span className="text-slate-400">
                          ({dict.resumes?.editor?.optional || 'optional'})
                        </span>
                      </label>
                      <input
                        type="month"
                        value={project.startDate || ''}
                        onChange={(e) => updateProject(index, { startDate: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        {dict.resumes?.editor?.endDate || 'End Date'}{' '}
                        <span className="text-slate-400">
                          ({dict.resumes?.editor?.optional || 'optional'})
                        </span>
                      </label>
                      <input
                        type="month"
                        value={project.endDate || ''}
                        onChange={(e) => updateProject(index, { endDate: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {dict.resumes?.editor?.projectUrl || 'Project URL'}{' '}
                      <span className="text-slate-400">
                        ({dict.resumes?.editor?.optional || 'optional'})
                      </span>
                    </label>
                    <input
                      type="url"
                      value={project.url || ''}
                      onChange={(e) => updateProject(index, { url: e.target.value })}
                      placeholder={
                        dict.resumes?.editor?.projectUrlPlaceholder || 'https://github.com/...'
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {dict.resumes?.editor?.technologies || 'Technologies Used'}{' '}
                      <span className="text-slate-400">
                        ({dict.resumes?.editor?.optional || 'optional'})
                      </span>
                    </label>
                    <div className="mt-2 space-y-3">
                      {/* Technology tags */}
                      {project.technologies && project.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {project.technologies.map((tech, techIndex) => (
                            <span
                              key={techIndex}
                              className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-sm text-teal-900"
                            >
                              {tech}
                              <button
                                onClick={() => removeTechnology(index, techIndex)}
                                className="hover:text-red-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Add technology input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTechInputs[index] || ''}
                          onChange={(e) =>
                            setNewTechInputs({ ...newTechInputs, [index]: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addTechnology(index)
                            }
                          }}
                          placeholder={
                            dict.resumes?.editor?.addTechnology || 'Add a technology...'
                          }
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                        <button
                          onClick={() => addTechnology(index)}
                          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                        >
                          {dict.resumes?.editor?.add || 'Add'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
