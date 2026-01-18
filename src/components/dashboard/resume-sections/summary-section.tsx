'use client'

import { useState, useCallback } from 'react'
import { Sparkles, X, Check, Languages } from 'lucide-react'
import type { Resume } from '@/types/database'
import { RichTextEditor } from '../rich-text-editor'
import { htmlToPlainText, migrateTextToHtml } from '@/lib/html-utils'
import { KeyAchievementsToolbar, KeyAchievementsFormatCommand } from '../key-achievements-toolbar'

interface SummarySectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
  locale: string
}

export function SummarySection({ resume, updateResume, dict, locale }: SummarySectionProps) {
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [transformedSummary, setTransformedSummary] = useState<string | null>(null)
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null)
  const [targetLanguage, setTargetLanguage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Handle summary change
  const handleSummaryChange = (html: string, plainText: string) => {
    updateResume({ summary: html })
  }

  const handleOptimize = async () => {
    // Extract plain text from HTML for AI processing
    const plainText = htmlToPlainText(resume.summary || '')

    if (!plainText || plainText.trim().length < 20) {
      setError('Please write at least a brief summary before optimizing')
      return
    }

    setIsOptimizing(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/transform-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawSummary: plainText,
          currentRole: (resume.experience as any)?.[0]?.position,
          yearsOfExperience: calculateYearsOfExperience(resume.experience as any),
          topSkills: extractTopSkills(resume.skills as any),
          locale,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to optimize summary')
      }

      const data = await response.json()
      // Convert AI response back to HTML
      const optimizedHtml = migrateTextToHtml(data.transformedSummary)
      setTransformedSummary(optimizedHtml)
    } catch (err) {
      console.error('Error optimizing summary:', err)
      setError('Failed to optimize summary. Please try again.')
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleTranslate = async (language: 'fr' | 'de' | 'en' | 'it') => {
    // Extract plain text from HTML for translation
    const plainText = htmlToPlainText(resume.summary || '')

    if (!plainText || plainText.trim().length < 10) {
      setError('Please write a summary before translating')
      return
    }

    setIsTranslating(true)
    setError(null)
    setTargetLanguage(language)

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
        throw new Error('Failed to translate summary')
      }

      const data = await response.json()
      // Convert translation back to HTML
      const translatedHtml = migrateTextToHtml(data.translatedSummary)
      setTranslatedSummary(translatedHtml)
    } catch (err) {
      console.error('Error translating summary:', err)
      setError('Failed to translate summary. Please try again.')
    } finally {
      setIsTranslating(false)
    }
  }

  const handleAccept = () => {
    if (transformedSummary) {
      updateResume({ summary: transformedSummary })
      setTransformedSummary(null)
    }
  }

  const handleAcceptTranslation = () => {
    if (translatedSummary) {
      updateResume({ summary: translatedSummary })
      setTranslatedSummary(null)
      setTargetLanguage(null)
    }
  }

  const handleReject = () => {
    setTransformedSummary(null)
  }

  const handleRejectTranslation = () => {
    setTranslatedSummary(null)
    setTargetLanguage(null)
  }

  // Handle formatting commands from toolbar
  const handleFormat = useCallback((command: KeyAchievementsFormatCommand) => {
    const editorId = 'summary-editor'
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {dict.resumes?.editor?.sections?.summary || 'Professional Summary'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {dict.resumes?.editor?.summaryHint ||
              'Write a brief overview of your professional background and key achievements'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleOptimize}
            disabled={isOptimizing || !resume.summary || resume.summary.trim().length < 20}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {isOptimizing ? dict.resumes?.editor?.optimizing || 'Optimizing...' : dict.resumes?.editor?.optimizeWithAI || 'Optimize with AI'}
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => handleTranslate('fr')}
              disabled={isTranslating || !resume.summary || resume.summary.trim().length < 10}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={dict.resumes?.editor?.translateToFrench || 'Translate to French'}
            >
              <Languages className="h-3 w-3" />
              FR
            </button>
            <button
              onClick={() => handleTranslate('de')}
              disabled={isTranslating || !resume.summary || resume.summary.trim().length < 10}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={dict.resumes?.editor?.translateToGerman || 'Translate to German'}
            >
              <Languages className="h-3 w-3" />
              DE
            </button>
            <button
              onClick={() => handleTranslate('en')}
              disabled={isTranslating || !resume.summary || resume.summary.trim().length < 10}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={dict.resumes?.editor?.translateToEnglish || 'Translate to English'}
            >
              <Languages className="h-3 w-3" />
              EN
            </button>
            <button
              onClick={() => handleTranslate('it')}
              disabled={isTranslating || !resume.summary || resume.summary.trim().length < 10}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={dict.resumes?.editor?.translateToItalian || 'Translate to Italian'}
            >
              <Languages className="h-3 w-3" />
              IT
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {transformedSummary && (
        <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-purple-900">
              <Sparkles className="h-4 w-4" />
              {dict.resumes?.editor?.aiOptimizedSummary || 'AI-Optimized Summary'}
            </h3>
            <button
              onClick={handleReject}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-900">
            {transformedSummary}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              <Check className="h-4 w-4" />
              {dict.resumes?.editor?.useThisVersion || 'Use This Version'}
            </button>
            <button
              onClick={handleReject}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {dict.resumes?.editor?.keepOriginal || 'Keep Original'}
            </button>
          </div>
        </div>
      )}

      {translatedSummary && targetLanguage && (
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-900">
              <Languages className="h-4 w-4" />
              Translated to {targetLanguage.toUpperCase()}
            </h3>
            <button
              onClick={handleRejectTranslation}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-900">
            {translatedSummary}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleAcceptTranslation}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Check className="h-4 w-4" />
              Use Translation
            </button>
            <button
              onClick={handleRejectTranslation}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Keep Original
            </button>
          </div>
        </div>
      )}

      <div>
        {/* Label with conditional toolbar for professional template */}
        {resume.template === 'professional' && (
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">
              {dict.resumes?.editor?.yourSummary || 'Your Summary'}
            </label>
            <KeyAchievementsToolbar
              editorId="summary-editor"
              onFormat={handleFormat}
            />
          </div>
        )}
        <RichTextEditor
          id="summary-editor"
          value={resume.summary || ''}
          onChange={handleSummaryChange}
          placeholder={
            dict.resumes?.editor?.summaryPlaceholder ||
            'e.g., Experienced software engineer with 5+ years of experience building scalable web applications...'
          }
          minHeight="192px"
          showRibbon={false}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            {dict.resumes?.editor?.recommended || 'Recommended'}: 3-5{' '}
            {dict.resumes?.editor?.sentences || 'sentences'}
          </span>
          <span>
            {htmlToPlainText(resume.summary || '').length || 0} {dict.resumes?.editor?.characters || 'characters'}
          </span>
        </div>
      </div>
    </div>
  )
}

// Helper functions
function calculateYearsOfExperience(experience: any): number {
  if (!Array.isArray(experience) || experience.length === 0) return 0

  let totalMonths = 0
  experience.forEach((exp: any) => {
    if (exp.startDate) {
      const start = new Date(exp.startDate + '-01')
      const end = exp.current || !exp.endDate
        ? new Date()
        : new Date(exp.endDate + '-01')

      const months = (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth())

      totalMonths += months
    }
  })

  return Math.floor(totalMonths / 12)
}

function extractTopSkills(skills: any): string[] {
  if (!Array.isArray(skills) || skills.length === 0) return []

  const allSkills: string[] = []
  skills.forEach((category: any) => {
    if (category.items && Array.isArray(category.items)) {
      allSkills.push(...category.items)
    }
  })

  return allSkills.slice(0, 5) // Top 5 skills
}
