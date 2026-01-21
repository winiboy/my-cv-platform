'use client'

import { useState } from 'react'
import { X, CheckCircle, AlertTriangle, Lightbulb, Loader2, Tag } from 'lucide-react'
import type { CoverLetterAnalysis } from '@/types/database'

interface CoverLetterCheckerModalProps {
  isOpen: boolean
  onClose: () => void
  openingParagraph: string | null
  bodyParagraphs: string[]
  closingParagraph: string | null
  jobDescription: string | null
  jobTitle: string | null
  companyName: string | null
  onAnalysisComplete: (analysis: CoverLetterAnalysis) => void
  dict: Record<string, unknown>
  locale: string
}

export function CoverLetterCheckerModal({
  isOpen,
  onClose,
  openingParagraph,
  bodyParagraphs,
  closingParagraph,
  jobDescription,
  jobTitle,
  companyName,
  onAnalysisComplete,
  dict,
  locale,
}: CoverLetterCheckerModalProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<CoverLetterAnalysis | null>(null)
  const [error, setError] = useState('')
  const [localJobDescription, setLocalJobDescription] = useState(jobDescription || '')
  const [localJobTitle, setLocalJobTitle] = useState(jobTitle || '')

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const checkerDict = (coverLettersDict.checker || {}) as Record<string, unknown>

  const handleAnalyze = async () => {
    if (!localJobDescription.trim()) {
      setError((checkerDict.jobDescriptionRequired as string) || 'Job description is required for analysis')
      return
    }
    if (!localJobTitle.trim()) {
      setError((checkerDict.jobTitleRequired as string) || 'Job title is required for analysis')
      return
    }

    const hasContent = openingParagraph || (bodyParagraphs && bodyParagraphs.length > 0) || closingParagraph
    if (!hasContent) {
      setError((checkerDict.contentRequired as string) || 'Please add some content to your cover letter before analyzing')
      return
    }

    setIsAnalyzing(true)
    setError('')

    try {
      const response = await fetch('/api/ai/check-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingParagraph,
          bodyParagraphs,
          closingParagraph,
          jobDescription: localJobDescription,
          jobTitle: localJobTitle,
          companyName,
          locale,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze cover letter')
      }

      setAnalysis(data.analysis)
      onAnalysisComplete(data.analysis)
    } catch (err) {
      console.error('Error analyzing cover letter:', err)
      setError(err instanceof Error ? err.message : 'Failed to analyze cover letter')
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (!isOpen) return null

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400'
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30'
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-semibold">
              {(checkerDict.title as string) || 'Cover Letter Checker'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {(checkerDict.subtitle as string) || 'AI will analyze your cover letter'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!analysis ? (
            <>
              {/* Job context input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {(checkerDict.jobTitleLabel as string) || 'Job Title'} *
                  </label>
                  <input
                    type="text"
                    value={localJobTitle}
                    onChange={(e) => setLocalJobTitle(e.target.value)}
                    placeholder={(checkerDict.jobTitlePlaceholder as string) || 'e.g., Software Engineer'}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {(checkerDict.jobDescriptionLabel as string) || 'Job Description'} *
                  </label>
                  <textarea
                    value={localJobDescription}
                    onChange={(e) => setLocalJobDescription(e.target.value)}
                    placeholder={(checkerDict.jobDescriptionPlaceholder as string) || 'Paste the job description here...'}
                    rows={6}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 resize-none"
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Score */}
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${getScoreBg(analysis.score)}`}>
                  <span className={`text-4xl font-bold ${getScoreColor(analysis.score)}`}>
                    {analysis.score}
                  </span>
                </div>
                <p className="mt-2 text-lg font-medium">
                  {analysis.score >= 80 ? ((checkerDict.scoreExcellent as string) || 'Excellent!') :
                   analysis.score >= 60 ? ((checkerDict.scoreGood as string) || 'Good') :
                   ((checkerDict.scoreNeedsWork as string) || 'Needs Work')}
                </p>
              </div>

              {/* Keyword Coverage */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  <span className="font-medium">
                    {(checkerDict.keywordCoverage as string) || 'Keyword Coverage'}: {analysis.keywordCoverage}%
                  </span>
                </div>
                {analysis.matchedKeywords.length > 0 && (
                  <div className="mb-2">
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {(checkerDict.matchedKeywords as string) || 'Matched'}:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {analysis.matchedKeywords.map((keyword, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.missingKeywords.length > 0 && (
                  <div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {(checkerDict.missingKeywords as string) || 'Missing'}:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {analysis.missingKeywords.map((keyword, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Strengths */}
              {analysis.strengths.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <h3 className="font-semibold">{(checkerDict.strengths as string) || 'Strengths'}</h3>
                  </div>
                  <ul className="space-y-1">
                    {analysis.strengths.map((strength, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 mt-0.5">+</span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {analysis.weaknesses.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    <h3 className="font-semibold">{(checkerDict.weaknesses as string) || 'Areas for Improvement'}</h3>
                  </div>
                  <ul className="space-y-1">
                    {analysis.weaknesses.map((weakness, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                        <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">!</span>
                        {weakness}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {analysis.suggestions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-semibold">{(checkerDict.suggestions as string) || 'Suggestions'}</h3>
                  </div>
                  <ul className="space-y-1">
                    {analysis.suggestions.map((suggestion, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                        <span className="text-blue-600 dark:text-blue-400 mt-0.5">*</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            {(checkerDict.close as string) || 'Close'}
          </button>
          {!analysis && (
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {(checkerDict.analyzing as string) || 'Analyzing...'}
                </>
              ) : (
                (checkerDict.analyze as string) || 'Analyze'
              )}
            </button>
          )}
          {analysis && (
            <button
              onClick={() => setAnalysis(null)}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
            >
              {(checkerDict.analyzeAgain as string) || 'Analyze Again'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
