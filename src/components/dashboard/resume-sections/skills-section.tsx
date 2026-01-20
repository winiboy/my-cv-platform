'use client'

import { Plus, Trash2, X, Sparkles, Languages, Check, Pencil, Eye, EyeOff, GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { Resume, ResumeSkillCategory } from '@/types/database'
import { KeyAchievementsToolbar, KeyAchievementsFormatCommand } from '../key-achievements-toolbar'
import { RichTextEditor } from '../rich-text-editor'

interface SkillsSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
  locale: string
}

export function SkillsSection({ resume, updateResume, dict, locale }: SkillsSectionProps) {
  const skills = (resume.skills as unknown as ResumeSkillCategory[]) || []
  const [newSkillInputs, setNewSkillInputs] = useState<{ [key: number]: string }>({})

  // Expand/collapse state
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    skills.length > 0 ? 0 : null
  )

  // Editing state
  const [editingSkill, setEditingSkill] = useState<{ categoryIndex: number; skillIndex: number } | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')

  // AI state management
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null)
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null)
  const [optimizedCategories, setOptimizedCategories] = useState<{ [key: number]: { category: string; items: string[]; skillsHtml?: string } }>({})
  const [translatedCategories, setTranslatedCategories] = useState<{ [key: number]: { category: string; items: string[]; skillsHtml?: string; language: string } }>({})
  const [error, setError] = useState<string | null>(null)

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  // Auto-migrate legacy items array to skillsHtml
  useEffect(() => {
    const skillsNeedingMigration = skills.filter(
      (skill) => !skill.skillsHtml && skill.items && skill.items.length > 0
    )

    if (skillsNeedingMigration.length > 0) {
      const updatedSkills = skills.map((skill) => {
        if (!skill.skillsHtml && skill.items && skill.items.length > 0) {
          // Convert items array to comma-separated string
          return {
            ...skill,
            skillsHtml: skill.items.join(', '),
          }
        }
        return skill
      })
      updateResume({ skills: updatedSkills as any })
    }
  }, []) // Run only on mount

  const addCategory = () => {
    const newCategory: ResumeSkillCategory = {
      category: '',
      items: [],
      visible: true, // Default to visible
    }
    updateResume({ skills: [...skills, newCategory] as any })
    setExpandedIndex(skills.length) // Expand the newly added category
  }

  const toggleVisibility = (index: number) => {
    const updated = [...skills]
    updated[index].visible = !(updated[index].visible ?? true)
    updateResume({ skills: updated as any })
  }

  const updateCategory = (index: number, updates: Partial<ResumeSkillCategory>) => {
    const updated = [...skills]
    updated[index] = { ...updated[index], ...updates }
    updateResume({ skills: updated as any })
  }

  const removeCategory = (index: number) => {
    const updated = skills.filter((_, i) => i !== index)
    updateResume({ skills: updated as any })
    // Update expanded index
    if (expandedIndex === index) {
      setExpandedIndex(null)
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1)
    }
  }

  const addSkillToCategory = (categoryIndex: number) => {
    const skillName = newSkillInputs[categoryIndex]?.trim()
    if (!skillName) return

    const updated = [...skills]
    updated[categoryIndex].items = [...updated[categoryIndex].items, skillName]
    updateResume({ skills: updated as any })
    setNewSkillInputs({ ...newSkillInputs, [categoryIndex]: '' })
  }

  const removeSkillFromCategory = (categoryIndex: number, skillIndex: number) => {
    const updated = [...skills]
    updated[categoryIndex].items = updated[categoryIndex].items.filter((_, i) => i !== skillIndex)
    updateResume({ skills: updated as any })
  }

  const startEditingSkill = (categoryIndex: number, skillIndex: number, currentValue: string) => {
    setEditingSkill({ categoryIndex, skillIndex })
    setEditingValue(currentValue)
  }

  const saveEditedSkill = () => {
    if (!editingSkill || !editingValue.trim()) {
      setEditingSkill(null)
      setEditingValue('')
      return
    }

    const updated = [...skills]
    updated[editingSkill.categoryIndex].items[editingSkill.skillIndex] = editingValue.trim()
    updateResume({ skills: updated as any })
    setEditingSkill(null)
    setEditingValue('')
  }

  const cancelEditingSkill = () => {
    setEditingSkill(null)
    setEditingValue('')
  }

  const handleOptimize = async (index: number) => {
    const skillCat = skills[index]
    const skillsPlainText = skillCat.skillsHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ''
    if (!skillCat.category || skillsPlainText.length < 3) {
      setError(dict?.errors?.validation?.skillsRequired || 'Please add a category name and skills before optimizing')
      return
    }

    setOptimizingIndex(index)
    setError(null)

    try {
      const text = `${skillCat.category}: ${skillsPlainText}`
      const response = await fetch('/api/ai/optimize-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          context: 'Skills category - improve category name and skill items to be more professional and industry-standard',
          locale,
        }),
      })

      if (!response.ok) {
        throw new Error(dict?.errors?.api?.optimizeDescription || 'Failed to optimize skills')
      }

      const data = await response.json()

      // Parse the optimized text back into category and skillsHtml
      const optimizedText = data.optimizedText
      const colonIndex = optimizedText.indexOf(':')
      if (colonIndex > -1) {
        const category = optimizedText.substring(0, colonIndex).trim()
        const skillsContent = optimizedText.substring(colonIndex + 1).trim()

        setOptimizedCategories({ ...optimizedCategories, [index]: { category, items: [], skillsHtml: skillsContent } })
      } else {
        setError(dict?.errors?.generic || 'Failed to parse optimized skills')
      }
    } catch (err) {
      console.error('Error optimizing skills:', err)
      setError(dict?.errors?.api?.optimizeDescription || 'Failed to optimize skills. Please try again.')
    } finally {
      setOptimizingIndex(null)
    }
  }

  const handleAcceptOptimization = (index: number) => {
    const optimized = optimizedCategories[index]
    if (optimized) {
      updateCategory(index, { category: optimized.category, skillsHtml: optimized.skillsHtml })
      const newOptimized = { ...optimizedCategories }
      delete newOptimized[index]
      setOptimizedCategories(newOptimized)
    }
  }

  const handleRejectOptimization = (index: number) => {
    const newOptimized = { ...optimizedCategories }
    delete newOptimized[index]
    setOptimizedCategories(newOptimized)
  }

  const handleTranslate = async (index: number, language: 'fr' | 'de' | 'en' | 'it') => {
    const skillCat = skills[index]
    const skillsPlainText = skillCat.skillsHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ''
    if (!skillCat.category || skillsPlainText.length < 3) {
      setError(dict?.errors?.validation?.skillsRequiredTranslate || 'Please add a category name and skills before translating')
      return
    }

    setTranslatingIndex(index)
    setError(null)

    try {
      // Format as "Category: skills content" for translation
      const skillsText = `${skillCat.category}: ${skillsPlainText}`

      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: skillsText,
          targetLanguage: language,
        }),
      })

      if (!response.ok) {
        throw new Error(dict?.errors?.api?.translateText || 'Failed to translate skills')
      }

      const data = await response.json()
      const translatedText = data.translatedSummary

      // Parse the translated text back into category and skillsHtml
      const colonIndex = translatedText.indexOf(':')
      if (colonIndex !== -1) {
        const category = translatedText.substring(0, colonIndex).trim()
        const skillsContent = translatedText.substring(colonIndex + 1).trim()

        setTranslatedCategories({
          ...translatedCategories,
          [index]: { category, items: [], skillsHtml: skillsContent, language }
        })
      } else {
        setError(dict?.errors?.generic || 'Failed to parse translated skills')
      }
    } catch (err) {
      console.error('Error translating skills:', err)
      setError(dict?.errors?.api?.translateText || 'Failed to translate skills. Please try again.')
    } finally {
      setTranslatingIndex(null)
    }
  }

  const handleAcceptTranslation = (index: number) => {
    const translation = translatedCategories[index]
    if (translation) {
      updateCategory(index, { category: translation.category, skillsHtml: translation.skillsHtml })
      const newTranslated = { ...translatedCategories }
      delete newTranslated[index]
      setTranslatedCategories(newTranslated)
    }
  }

  const handleRejectTranslation = (index: number) => {
    const newTranslated = { ...translatedCategories }
    delete newTranslated[index]
    setTranslatedCategories(newTranslated)
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

    // Reorder the skills array
    const updatedSkills = [...skills]
    const [draggedItem] = updatedSkills.splice(draggedIndex, 1)
    updatedSkills.splice(dropIndex, 0, draggedItem)

    updateResume({ skills: updatedSkills as any })

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

  // Handle formatting commands from toolbar
  const handleFormat = useCallback((index: number, command: KeyAchievementsFormatCommand) => {
    const editorId = `skill-content-${index}`
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
      case 'dashList': {
        // Save selection state using range for more reliable traversal
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) break

        const range = sel.getRangeAt(0)
        let node: Node | null = range.startContainer
        let currentList: HTMLUListElement | null = null

        // Traverse up to find the parent UL element
        while (node && node !== editor) {
          if (node.nodeName === 'UL') {
            currentList = node as HTMLUListElement
            break
          }
          node = node.parentNode
        }

        // Detect dash list by checking ONLY for presence of dash spans (more reliable than inline styles)
        const hasDashSpans = currentList &&
          Array.from(currentList.querySelectorAll('li')).some(li =>
            li.querySelector('span[data-dash="true"]') !== null
          )

        if (currentList && hasDashSpans) {
          // TOGGLE OFF: Replace entire list with paragraphs
          // Manual DOM manipulation is required because execCommand('insertUnorderedList')
          // only toggles the first line when multiple lines are selected in a dash list.

          // 1. Collect all list item contents (removing dash spans, filtering empty)
          const items = currentList.querySelectorAll('li')
          const contents: string[] = []

          items.forEach(item => {
            // Remove dash span if present
            const dashSpan = item.querySelector('span[data-dash="true"]')
            if (dashSpan) {
              dashSpan.remove()
            }
            // Store non-empty content only
            const trimmedContent = item.innerHTML.trim()
            if (trimmedContent) {
              contents.push(trimmedContent)
            }
          })

          // 2. Create document fragment with paragraphs, tracking the last one
          const fragment = document.createDocumentFragment()
          let lastParagraph: HTMLParagraphElement | null = null

          contents.forEach(content => {
            const p = document.createElement('p')
            p.innerHTML = content
            fragment.appendChild(p)
            lastParagraph = p
          })

          // 3. Replace the UL with the paragraphs
          if (currentList.parentNode) {
            currentList.parentNode.replaceChild(fragment, currentList)
          }

          // 4. Place cursor at the end of the last created paragraph
          if (lastParagraph) {
            const newRange = document.createRange()
            newRange.selectNodeContents(lastParagraph)
            newRange.collapse(false)
            sel.removeAllRanges()
            sel.addRange(newRange)
          }
        } else if (currentList) {
          // IN BULLET LIST: Convert to dash list
          currentList.style.listStyleType = 'none'
          const items = currentList.querySelectorAll('li')
          items.forEach(item => {
            if (!item.querySelector('span[data-dash="true"]')) {
              const content = item.innerHTML
              item.innerHTML = `<span data-dash="true" style="margin-right: 0.5em;">-</span>${content}`
            }
          })
        } else {
          // NOT IN LIST: Create new dash list
          document.execCommand('insertUnorderedList')

          // Find the newly created list
          const newSel = window.getSelection()
          let newNode: Node | null = newSel?.anchorNode || null
          let newList: HTMLUListElement | null = null

          while (newNode && newNode !== editor) {
            if (newNode.nodeName === 'UL') {
              newList = newNode as HTMLUListElement
              break
            }
            newNode = newNode.parentNode
          }

          if (newList) {
            newList.style.listStyleType = 'none'
            const items = newList.querySelectorAll('li')
            items.forEach(item => {
              if (!item.querySelector('span[data-dash="true"]')) {
                const content = item.innerHTML
                item.innerHTML = `<span data-dash="true" style="margin-right: 0.5em;">-</span>${content}`
              }
            })
          }
        }
        break
      }
    }

    // Trigger input event to sync state
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  // Handle skills HTML change
  const handleSkillsHtmlChange = (index: number, html: string) => {
    updateCategory(index, { skillsHtml: html })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {dict.resumes?.editor?.sections?.skills || 'Skills'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {dict.resumes?.editor?.skillsHint || 'Organize your skills into categories'}
          </p>
        </div>
        <button
          onClick={addCategory}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          {dict.resumes?.editor?.addCategory || 'Add Category'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {skills.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">
              {dict.resumes?.editor?.noSkills || 'No skills added yet'}
            </p>
          </div>
        )}

        {skills.map((skillCategory, categoryIndex) => {
          const isExpanded = expandedIndex === categoryIndex

          return (
            <div
              key={categoryIndex}
              draggable={!isExpanded}
              onDragStart={(e) => isExpanded ? e.preventDefault() : handleDragStart(e, categoryIndex)}
              onDragOver={(e) => handleDragOver(e, categoryIndex)}
              onDragEnter={(e) => handleDragEnter(e, categoryIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, categoryIndex)}
              onDragEnd={handleDragEnd}
              className={`rounded-lg border bg-white transition-all ${
                draggedIndex === categoryIndex
                  ? 'border-teal-400 opacity-50 shadow-lg'
                  : dragOverIndex === categoryIndex
                  ? 'border-teal-500 border-2 shadow-md'
                  : 'border-slate-200'
              }`}
            >
              {/* Header - always visible */}
              <div
                className="flex cursor-pointer items-center justify-between p-6"
                onClick={() => setExpandedIndex(isExpanded ? null : categoryIndex)}
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
                  <input
                    type="text"
                    value={skillCategory.category}
                    onChange={(e) => updateCategory(categoryIndex, { category: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={dict.resumes?.editor?.categoryName || 'Category name (e.g., Programming Languages)'}
                    className="w-full border-0 bg-transparent text-lg font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-0"
                  />
                  {!isExpanded && skillCategory.skillsHtml && (
                    <p className="mt-1 text-sm text-slate-500 line-clamp-1">
                      {skillCategory.skillsHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)}
                      {skillCategory.skillsHtml.replace(/<[^>]+>/g, '').length > 100 && '...'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOptimize(categoryIndex)
                      }}
                      disabled={optimizingIndex === categoryIndex || !skillCategory.category || (!skillCategory.skillsHtml || skillCategory.skillsHtml.replace(/<[^>]+>/g, '').trim().length < 3)}
                      className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      {optimizingIndex === categoryIndex ? dict.resumes?.editor?.optimizing || 'Optimizing...' : dict.resumes?.editor?.optimizeWithAI || 'Optimize with AI'}
                    </button>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTranslate(categoryIndex, 'fr')
                        }}
                        disabled={translatingIndex === categoryIndex || !skillCategory.category || (!skillCategory.skillsHtml || skillCategory.skillsHtml.replace(/<[^>]+>/g, '').trim().length < 3)}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={dict.resumes?.editor?.translateToFrench || 'Translate to French'}
                      >
                        <Languages className="h-3 w-3" />
                        FR
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTranslate(categoryIndex, 'de')
                        }}
                        disabled={translatingIndex === categoryIndex || !skillCategory.category || (!skillCategory.skillsHtml || skillCategory.skillsHtml.replace(/<[^>]+>/g, '').trim().length < 3)}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={dict.resumes?.editor?.translateToGerman || 'Translate to German'}
                      >
                        <Languages className="h-3 w-3" />
                        DE
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTranslate(categoryIndex, 'en')
                        }}
                        disabled={translatingIndex === categoryIndex || !skillCategory.category || (!skillCategory.skillsHtml || skillCategory.skillsHtml.replace(/<[^>]+>/g, '').trim().length < 3)}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={dict.resumes?.editor?.translateToEnglish || 'Translate to English'}
                      >
                        <Languages className="h-3 w-3" />
                        EN
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTranslate(categoryIndex, 'it')
                        }}
                        disabled={translatingIndex === categoryIndex || !skillCategory.category || (!skillCategory.skillsHtml || skillCategory.skillsHtml.replace(/<[^>]+>/g, '').trim().length < 3)}
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
                      toggleVisibility(categoryIndex)
                    }}
                    className={`transition-colors ${skillCategory.visible ?? true ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-400'}`}
                    title={skillCategory.visible ?? true ? (dict?.aria?.hideFromCV || 'Hide from CV') : (dict?.aria?.showInCV || 'Show in CV')}
                  >
                    {skillCategory.visible ?? true ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeCategory(categoryIndex)
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
                <div
                  className="space-y-3 border-t border-slate-200 p-6"
                  draggable={false}
                  onDragStart={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
              {/* Skills rich text field */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    {dict.resumes?.editor?.skills || 'Skills'}
                  </label>
                  <KeyAchievementsToolbar
                    editorId={`skill-content-${categoryIndex}`}
                    onFormat={(command) => handleFormat(categoryIndex, command)}
                    showItalic={false}
                    dict={dict}
                  />
                </div>
                <div className="mt-1">
                  <RichTextEditor
                    id={`skill-content-${categoryIndex}`}
                    value={skillCategory.skillsHtml || ''}
                    onChange={(html) => handleSkillsHtmlChange(categoryIndex, html)}
                    placeholder={
                      dict.resumes?.editor?.skillsPlaceholder ||
                      'Enter your skills (e.g., JavaScript, Python, React...)'
                    }
                    minHeight="72px"
                    showRibbon={false}
                    dict={dict}
                  />
                </div>
              </div>

              {/* AI-Optimized Skills Preview */}
              {optimizedCategories[categoryIndex] && (
                <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-purple-900">
                      <Sparkles className="h-4 w-4" />
                      {dict.resumes?.editor?.aiOptimizedSummary || 'AI-Optimized Summary'}
                    </h4>
                    <button
                      onClick={() => handleRejectOptimization(categoryIndex)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mb-4">
                    <p className="mb-2 text-sm font-semibold text-purple-900">
                      {optimizedCategories[categoryIndex].category}
                    </p>
                    <p className="text-sm text-purple-800">
                      {optimizedCategories[categoryIndex].skillsHtml}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptOptimization(categoryIndex)}
                      className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                    >
                      <Check className="h-4 w-4" />
                      {dict.resumes?.editor?.useThisVersion || 'Use This Version'}
                    </button>
                    <button
                      onClick={() => handleRejectOptimization(categoryIndex)}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {dict.resumes?.editor?.keepOriginal || 'Keep Original'}
                    </button>
                  </div>
                </div>
              )}

              {/* Translated Skills Preview */}
              {translatedCategories[categoryIndex] && (
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                      <Languages className="h-4 w-4" />
                      {dict?.translation?.translatedTo || 'Translated to'} {translatedCategories[categoryIndex].language.toUpperCase()}
                    </h4>
                    <button
                      onClick={() => handleRejectTranslation(categoryIndex)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mb-4">
                    <p className="mb-2 text-sm font-semibold text-blue-900">
                      {translatedCategories[categoryIndex].category}
                    </p>
                    <p className="text-sm text-blue-800">
                      {translatedCategories[categoryIndex].skillsHtml}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptTranslation(categoryIndex)}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <Check className="h-4 w-4" />
                      {dict?.translation?.useTranslation || 'Use Translation'}
                    </button>
                    <button
                      onClick={() => handleRejectTranslation(categoryIndex)}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {dict?.translation?.keepOriginal || 'Keep Original'}
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
