'use client'

import { Plus, Trash2, X, Sparkles, Languages, Check, Pencil, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { Resume, ResumeSkillCategory } from '@/types/database'

interface SkillsSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
  locale: string
}

export function SkillsSection({ resume, updateResume, dict, locale }: SkillsSectionProps) {
  const skills = (resume.skills as unknown as ResumeSkillCategory[]) || []
  const [newSkillInputs, setNewSkillInputs] = useState<{ [key: number]: string }>({})

  // Editing state
  const [editingSkill, setEditingSkill] = useState<{ categoryIndex: number; skillIndex: number } | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')

  // AI state management
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null)
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null)
  const [optimizedCategories, setOptimizedCategories] = useState<{ [key: number]: { category: string; items: string[] } }>({})
  const [translatedCategories, setTranslatedCategories] = useState<{ [key: number]: { category: string; items: string[]; language: string } }>({})
  const [error, setError] = useState<string | null>(null)

  const addCategory = () => {
    const newCategory: ResumeSkillCategory = {
      category: '',
      items: [],
      visible: true, // Default to visible
    }
    updateResume({ skills: [...skills, newCategory] as any })
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
    if (!skillCat.category || skillCat.items.length === 0) {
      setError('Please add a category name and at least one skill before optimizing')
      return
    }

    setOptimizingIndex(index)
    setError(null)

    try {
      const text = `${skillCat.category}: ${skillCat.items.join(', ')}`
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
        throw new Error('Failed to optimize skills')
      }

      const data = await response.json()

      // Parse the optimized text back into category and items
      const optimizedText = data.optimizedText
      const colonIndex = optimizedText.indexOf(':')
      if (colonIndex > -1) {
        const category = optimizedText.substring(0, colonIndex).trim()
        const itemsText = optimizedText.substring(colonIndex + 1).trim()
        const items = itemsText.split(',').map(s => s.trim()).filter(s => s.length > 0)

        setOptimizedCategories({ ...optimizedCategories, [index]: { category, items } })
      } else {
        setError('Failed to parse optimized skills')
      }
    } catch (err) {
      console.error('Error optimizing skills:', err)
      setError('Failed to optimize skills. Please try again.')
    } finally {
      setOptimizingIndex(null)
    }
  }

  const handleAcceptOptimization = (index: number) => {
    const optimized = optimizedCategories[index]
    if (optimized) {
      updateCategory(index, { category: optimized.category, items: optimized.items })
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
    if (!skillCat.category || skillCat.items.length === 0) {
      setError('Please add a category name and at least one skill before translating')
      return
    }

    setTranslatingIndex(index)
    setError(null)

    try {
      // Format as "Category: item1, item2, item3" for translation
      const skillsText = `${skillCat.category}: ${skillCat.items.join(', ')}`

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
        throw new Error('Failed to translate skills')
      }

      const data = await response.json()
      const translatedText = data.translatedSummary

      // Parse the translated text back into category and items
      const colonIndex = translatedText.indexOf(':')
      if (colonIndex !== -1) {
        const category = translatedText.substring(0, colonIndex).trim()
        const itemsText = translatedText.substring(colonIndex + 1).trim()
        const items = itemsText.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)

        setTranslatedCategories({
          ...translatedCategories,
          [index]: { category, items, language }
        })
      } else {
        setError('Failed to parse translated skills')
      }
    } catch (err) {
      console.error('Error translating skills:', err)
      setError('Failed to translate skills. Please try again.')
    } finally {
      setTranslatingIndex(null)
    }
  }

  const handleAcceptTranslation = (index: number) => {
    const translation = translatedCategories[index]
    if (translation) {
      updateCategory(index, { category: translation.category, items: translation.items })
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

        {skills.map((skillCategory, categoryIndex) => (
          <div key={categoryIndex} className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <input
                type="text"
                value={skillCategory.category}
                onChange={(e) => updateCategory(categoryIndex, { category: e.target.value })}
                placeholder={dict.resumes?.editor?.categoryName || 'Category name (e.g., Programming Languages)'}
                className="flex-1 border-0 bg-transparent text-lg font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-0"
              />
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleOptimize(categoryIndex)}
                    disabled={optimizingIndex === categoryIndex || !skillCategory.category || skillCategory.items.length === 0}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    {optimizingIndex === categoryIndex ? dict.resumes?.editor?.optimizing || 'Optimizing...' : dict.resumes?.editor?.optimizeWithAI || 'Optimize with AI'}
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleTranslate(categoryIndex, 'fr')}
                      disabled={translatingIndex === categoryIndex || !skillCategory.category || skillCategory.items.length === 0}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToFrench || 'Translate to French'}
                    >
                      <Languages className="h-3 w-3" />
                      FR
                    </button>
                    <button
                      onClick={() => handleTranslate(categoryIndex, 'de')}
                      disabled={translatingIndex === categoryIndex || !skillCategory.category || skillCategory.items.length === 0}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToGerman || 'Translate to German'}
                    >
                      <Languages className="h-3 w-3" />
                      DE
                    </button>
                    <button
                      onClick={() => handleTranslate(categoryIndex, 'en')}
                      disabled={translatingIndex === categoryIndex || !skillCategory.category || skillCategory.items.length === 0}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToEnglish || 'Translate to English'}
                    >
                      <Languages className="h-3 w-3" />
                      EN
                    </button>
                    <button
                      onClick={() => handleTranslate(categoryIndex, 'it')}
                      disabled={translatingIndex === categoryIndex || !skillCategory.category || skillCategory.items.length === 0}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={dict.resumes?.editor?.translateToItalian || 'Translate to Italian'}
                    >
                      <Languages className="h-3 w-3" />
                      IT
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => toggleVisibility(categoryIndex)}
                  className={`transition-colors ${skillCategory.visible ?? true ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-400'}`}
                  title={skillCategory.visible ?? true ? 'Hide from CV' : 'Show in CV'}
                >
                  {skillCategory.visible ?? true ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => removeCategory(categoryIndex)}
                  className="text-slate-400 hover:text-red-600"
                  title={dict.common?.delete || 'Delete'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {/* Skill tags */}
              <div className="flex flex-wrap gap-2">
                {skillCategory.items.map((skill, skillIndex) => {
                  const isEditing = editingSkill?.categoryIndex === categoryIndex && editingSkill?.skillIndex === skillIndex

                  return isEditing ? (
                    <div key={skillIndex} className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveEditedSkill()
                          } else if (e.key === 'Escape') {
                            cancelEditingSkill()
                          }
                        }}
                        onBlur={saveEditedSkill}
                        autoFocus
                        className="rounded-full border border-teal-300 bg-white px-3 py-1 text-sm text-teal-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                  ) : (
                    <span
                      key={skillIndex}
                      className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-sm text-teal-900"
                    >
                      <span>{skill}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditingSkill(categoryIndex, skillIndex, skill)
                        }}
                        className="hover:text-teal-700"
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeSkillFromCategory(categoryIndex, skillIndex)
                        }}
                        className="hover:text-red-600"
                        title="Delete"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
              </div>

              {/* Add skill input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSkillInputs[categoryIndex] || ''}
                  onChange={(e) =>
                    setNewSkillInputs({ ...newSkillInputs, [categoryIndex]: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSkillToCategory(categoryIndex)
                    }
                  }}
                  placeholder={dict.resumes?.editor?.addSkill || 'Add a skill...'}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                <button
                  onClick={() => addSkillToCategory(categoryIndex)}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  {dict.resumes?.editor?.add || 'Add'}
                </button>
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
                    <div className="flex flex-wrap gap-2">
                      {optimizedCategories[categoryIndex].items.map((skill, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-900"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
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
                      Translated to {translatedCategories[categoryIndex].language.toUpperCase()}
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
                    <div className="flex flex-wrap gap-2">
                      {translatedCategories[categoryIndex].items.map((skill, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-900"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptTranslation(categoryIndex)}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <Check className="h-4 w-4" />
                      Use Translation
                    </button>
                    <button
                      onClick={() => handleRejectTranslation(categoryIndex)}
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
