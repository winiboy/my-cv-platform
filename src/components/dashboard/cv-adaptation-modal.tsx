'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react'
import { DiffViewer } from './diff-viewer'
import type { CVAdaptationPatch } from '@/types/cv-adaptation'

interface CVAdaptationModalProps {
  isOpen: boolean
  onClose: () => void
  resumeId: string
  initialJobDescription?: string
  initialJobTitle?: string
  initialCompany?: string
  locale: string
  onApplyChanges: (patch: CVAdaptationPatch, selectedPatches: string[]) => void
  dict?: {
    title?: string
    jobDescriptionLabel?: string
    jobDescriptionPlaceholder?: string
    jobDescriptionHint?: string
    jobDescriptionTooShort?: string
    jobTitleLabel?: string
    companyLabel?: string
    analyzeButton?: string
    analyzing?: string
    generating?: string
    matchScore?: string
    keyGaps?: string
    strengths?: string
    selectAll?: string
    deselectAll?: string
    applySelected?: string
    cancel?: string
    helpText?: string
    antiCopyDisclaimer?: string
    [key: string]: string | undefined
  }
}

type Stage = 'input' | 'processing' | 'preview'

export function CVAdaptationModal({
  isOpen,
  onClose,
  resumeId,
  initialJobDescription = '',
  initialJobTitle = '',
  initialCompany = '',
  locale,
  onApplyChanges,
  dict = {},
}: CVAdaptationModalProps) {
  const [stage, setStage] = useState<Stage>('input')
  const [jobDescription, setJobDescription] = useState(initialJobDescription)
  const [jobTitle, setJobTitle] = useState(initialJobTitle)
  const [company, setCompany] = useState(initialCompany)
  const [patch, setPatch] = useState<CVAdaptationPatch | null>(null)
  const [selectedPatches, setSelectedPatches] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [progressMessage, setProgressMessage] = useState('')

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setJobDescription(initialJobDescription)
      setJobTitle(initialJobTitle)
      setCompany(initialCompany)
      setStage('input')
      setPatch(null)
      setSelectedPatches(new Set())
      setError('')
    }
  }, [isOpen, initialJobDescription, initialJobTitle, initialCompany])

  // Auto-select high confidence patches by default
  useEffect(() => {
    if (patch) {
      const highConfidencePatches = new Set<string>()

      if (patch.patches.summary?.confidence === 'high') {
        highConfidencePatches.add('summary')
      }
      if (patch.patches.experienceDescription?.confidence === 'high') {
        highConfidencePatches.add('experienceDescription')
      }
      patch.patches.skillsToAdd?.forEach((skill, index) => {
        if (skill.confidence === 'high') {
          highConfidencePatches.add(`skillsToAdd-${index}`)
        }
      })
      patch.patches.skillsToEnhance?.forEach((skill, index) => {
        if (skill.confidence === 'high') {
          highConfidencePatches.add(`skillsToEnhance-${index}`)
        }
      })

      setSelectedPatches(highConfidencePatches)
    }
  }, [patch])

  const handleSubmit = async () => {
    // Validation
    if (jobDescription.trim().length < 100) {
      setError(dict.jobDescriptionTooShort || 'Job description must be at least 100 characters.')
      return
    }

    if (!jobTitle.trim()) {
      setError('Job title is required.')
      return
    }

    setIsLoading(true)
    setError('')
    setStage('processing')

    try {
      // Show progress messages
      setProgressMessage(dict.analyzing || 'Analyzing job requirements...')

      // Call API
      const response = await fetch('/api/ai/adapt-resume-to-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId,
          jobDescription: jobDescription.trim(),
          jobTitle: jobTitle.trim(),
          company: company.trim() || jobTitle.trim(),
          locale,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to generate adaptation')
      }

      setProgressMessage(dict.generating || 'Preparing preview...')

      // Set patch and move to preview stage
      setPatch(data.patch)
      setStage('preview')
    } catch (err) {
      console.error('Error generating adaptation:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate adaptation')
      setStage('input')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApply = () => {
    if (!patch) return

    // Convert Set to array
    const selectedPatchesArray = Array.from(selectedPatches)

    // Call parent handler
    onApplyChanges(patch, selectedPatchesArray)

    // Close modal
    onClose()
  }

  const handleSelectAll = () => {
    const allPatches = new Set<string>()

    if (patch?.patches.summary) allPatches.add('summary')
    if (patch?.patches.experienceDescription) allPatches.add('experienceDescription')
    patch?.patches.skillsToAdd?.forEach((_, index) => allPatches.add(`skillsToAdd-${index}`))
    patch?.patches.skillsToEnhance?.forEach((_, index) =>
      allPatches.add(`skillsToEnhance-${index}`)
    )

    setSelectedPatches(allPatches)
  }

  const handleDeselectAll = () => {
    setSelectedPatches(new Set())
  }

  const togglePatch = (patchKey: string) => {
    const newSelected = new Set(selectedPatches)
    if (newSelected.has(patchKey)) {
      newSelected.delete(patchKey)
    } else {
      newSelected.add(patchKey)
    }
    setSelectedPatches(newSelected)
  }

  if (!isOpen) return null

  // Match score color
  const getMatchScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-semibold text-gray-900">
                {dict.title || 'Adapt CV to Job'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* INPUT STAGE */}
            {stage === 'input' && (
              <div className="space-y-6">
                {/* Help text */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-sm text-purple-900">
                    {dict.helpText ||
                      'Paste the complete job description, and our AI will suggest targeted updates to your CV. You\'re always in control - review and select which changes to apply.'}
                  </p>
                </div>

                {/* Error message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {/* Job Description */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {dict.jobDescriptionLabel || 'Job Description'} *
                  </label>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder={
                      dict.jobDescriptionPlaceholder || 'Paste the full job description here...'
                    }
                    rows={10}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500">
                    {dict.jobDescriptionHint ||
                      'Include requirements, responsibilities, and qualifications for best results.'}
                    {' '}
                    ({jobDescription.length}/100 characters minimum)
                  </p>
                </div>

                {/* Job Title */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {dict.jobTitleLabel || 'Job Title'} *
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g., Senior Software Engineer"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Company */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {dict.companyLabel || 'Company'} (optional)
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g., Google"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Submit button */}
                <button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="w-full bg-purple-600 text-white py-3 px-4 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {dict.analyzeButton || 'Analyze & Generate Adaptation'}
                </button>

                {/* Anti-copy disclaimer */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs text-gray-600 italic">
                    {dict.antiCopyDisclaimer ||
                      'All suggestions are original and written in professional CV language. We never copy text from job descriptions.'}
                  </p>
                </div>
              </div>
            )}

            {/* PROCESSING STAGE */}
            {stage === 'processing' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="h-12 w-12 text-purple-600 animate-spin" />
                <p className="text-lg font-medium text-gray-900">{progressMessage}</p>
              </div>
            )}

            {/* PREVIEW STAGE */}
            {stage === 'preview' && patch && (
              <div className="space-y-6">
                {/* Analysis summary */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {dict.matchScore || 'Match Score'}:
                    </span>
                    <span
                      className={`text-2xl font-bold ${getMatchScoreColor(patch.analysis.matchScore)}`}
                    >
                      {patch.analysis.matchScore}/100
                    </span>
                  </div>

                  {patch.analysis.keyGaps.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        {dict.keyGaps || 'Key Gaps'}:
                      </p>
                      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                        {patch.analysis.keyGaps.map((gap, index) => (
                          <li key={index}>{gap}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {patch.analysis.strengths.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        {dict.strengths || 'Strengths'}:
                      </p>
                      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                        {patch.analysis.strengths.map((strength, index) => (
                          <li key={index}>{strength}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Patches */}
                <div className="space-y-4">
                  {/* Summary patch */}
                  {patch.patches.summary && (
                    <DiffViewer
                      title="Professional Summary"
                      original={patch.patches.summary.original}
                      proposed={patch.patches.summary.proposed}
                      confidence={patch.patches.summary.confidence}
                      reasoning={patch.patches.summary.reasoning}
                      isChecked={selectedPatches.has('summary')}
                      onCheckChange={() => togglePatch('summary')}
                      dict={{
                        currentVersion: dict?.currentVersion,
                        proposedVersion: dict?.proposedVersion,
                        reasoning: dict?.reasoning,
                        applyChange: dict?.applyChange,
                        confidenceHigh: dict?.confidenceHigh,
                        confidenceMedium: dict?.confidenceMedium,
                        confidenceLow: dict?.confidenceLow,
                      }}
                    />
                  )}

                  {/* Experience description patch */}
                  {patch.patches.experienceDescription && (
                    <DiffViewer
                      title="Experience Description"
                      original={patch.patches.experienceDescription.original}
                      proposed={patch.patches.experienceDescription.proposed}
                      confidence={patch.patches.experienceDescription.confidence}
                      reasoning={patch.patches.experienceDescription.reasoning}
                      isChecked={selectedPatches.has('experienceDescription')}
                      onCheckChange={() => togglePatch('experienceDescription')}
                      dict={{
                        currentVersion: dict?.currentVersion,
                        proposedVersion: dict?.proposedVersion,
                        reasoning: dict?.reasoning,
                        applyChange: dict?.applyChange,
                        confidenceHigh: dict?.confidenceHigh,
                        confidenceMedium: dict?.confidenceMedium,
                        confidenceLow: dict?.confidenceLow,
                      }}
                    />
                  )}

                  {/* Skills to add */}
                  {patch.patches.skillsToAdd?.map((skillPatch, index) => (
                    <div key={`add-${index}`} className="border border-gray-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-900">
                          Add Skills: {skillPatch.category}
                        </h4>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${
                          skillPatch.confidence === 'high' ? 'bg-green-100 text-green-800 border-green-300' :
                          skillPatch.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                          'bg-red-100 text-red-800 border-red-300'
                        }`}>
                          {skillPatch.confidence === 'high' ? dict.confidenceHigh :
                           skillPatch.confidence === 'medium' ? dict.confidenceMedium :
                           dict.confidenceLow}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {skillPatch.items.map((skill, skillIndex) => (
                          <span
                            key={skillIndex}
                            className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <p className="text-xs font-medium text-blue-900 mb-1">
                          {dict.reasoning || 'Reasoning'}:
                        </p>
                        <p className="text-sm text-blue-800">{skillPatch.reasoning}</p>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPatches.has(`skillsToAdd-${index}`)}
                          onChange={() => togglePatch(`skillsToAdd-${index}`)}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {dict.applyChange || 'Apply this change'}
                        </span>
                      </label>
                    </div>
                  ))}

                  {/* Skills to enhance */}
                  {patch.patches.skillsToEnhance?.map((skillPatch, index) => (
                    <div key={`enhance-${index}`} className="border border-gray-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-900">
                          Enhance: {skillPatch.category}
                        </h4>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${
                          skillPatch.confidence === 'high' ? 'bg-green-100 text-green-800 border-green-300' :
                          skillPatch.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                          'bg-red-100 text-red-800 border-red-300'
                        }`}>
                          {skillPatch.confidence === 'high' ? dict.confidenceHigh :
                           skillPatch.confidence === 'medium' ? dict.confidenceMedium :
                           dict.confidenceLow}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {skillPatch.itemsToAdd.map((skill, skillIndex) => (
                          <span
                            key={skillIndex}
                            className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <p className="text-xs font-medium text-blue-900 mb-1">
                          {dict.reasoning || 'Reasoning'}:
                        </p>
                        <p className="text-sm text-blue-800">{skillPatch.reasoning}</p>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPatches.has(`skillsToEnhance-${index}`)}
                          onChange={() => togglePatch(`skillsToEnhance-${index}`)}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {dict.applyChange || 'Apply this change'}
                        </span>
                      </label>
                    </div>
                  ))}

                  {/* No patches message */}
                  {!patch.patches.summary &&
                   !patch.patches.experienceDescription &&
                   (!patch.patches.skillsToAdd || patch.patches.skillsToAdd.length === 0) &&
                   (!patch.patches.skillsToEnhance || patch.patches.skillsToEnhance.length === 0) && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                      <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold text-green-900 mb-2">Great News!</h3>
                      <p className="text-sm text-green-800">
                        Your CV already aligns well with this job description. We don't recommend any changes at this time.
                      </p>
                    </div>
                  )}
                </div>

                {/* Selection controls */}
                {(patch.patches.summary ||
                  patch.patches.experienceDescription ||
                  (patch.patches.skillsToAdd && patch.patches.skillsToAdd.length > 0) ||
                  (patch.patches.skillsToEnhance && patch.patches.skillsToEnhance.length > 0)) && (
                  <div className="flex gap-2 pt-4 border-t border-gray-200">
                    <button
                      onClick={handleSelectAll}
                      className="px-4 py-2 text-sm font-medium text-purple-700 hover:text-purple-800 hover:bg-purple-50 rounded-md transition-colors"
                    >
                      {dict.selectAll || 'Select All'}
                    </button>
                    <button
                      onClick={handleDeselectAll}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      {dict.deselectAll || 'Deselect All'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {stage === 'preview' && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 hover:bg-gray-200 rounded-md transition-colors"
              >
                {dict.cancel || 'Cancel'}
              </button>
              <button
                onClick={handleApply}
                disabled={selectedPatches.size === 0}
                className="px-6 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {dict.applySelected || 'Apply Selected Changes'} ({selectedPatches.size})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
