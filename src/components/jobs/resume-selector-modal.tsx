'use client'

import { useState, useEffect } from 'react'
import { X, FileText, Loader2, FilePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Resume } from '@/types/database'

interface ResumeSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectResume: (resumeId: string) => void
  onCreateNewCV?: () => void
  userId: string
  showCreateNewOption?: boolean
  dict?: {
    selectResumeTitle?: string
    selectResumeTitleWithCreate?: string
    noResumesError?: string
    cancel?: string
    selectCV?: string
    loading?: string
    newCV?: string
    newCVDescription?: string
  }
}

export function ResumeSelectorModal({
  isOpen,
  onClose,
  onSelectResume,
  onCreateNewCV,
  userId,
  showCreateNewOption = false,
  dict = {},
}: ResumeSelectorModalProps) {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [isCreateNewSelected, setIsCreateNewSelected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')

  // Fetch resumes when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      fetchResumes()
    }
  }, [isOpen, userId])

  const fetchResumes = async () => {
    setIsLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (fetchError) throw fetchError

      setResumes(data || [])

      // Auto-select first resume if only one
      if (data && data.length === 1 && data[0]) {
        setSelectedResumeId((data[0] as any).id)
      }
    } catch (err) {
      console.error('Error fetching resumes:', err)
      setError('Failed to load resumes')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelect = () => {
    if (isCreateNewSelected && onCreateNewCV) {
      onCreateNewCV()
      onClose()
    } else if (selectedResumeId) {
      onSelectResume(selectedResumeId)
      onClose()
    }
  }

  const handleSelectNewCV = () => {
    setIsCreateNewSelected(true)
    setSelectedResumeId(null)
  }

  const handleSelectExistingCV = (resumeId: string) => {
    setSelectedResumeId(resumeId)
    setIsCreateNewSelected(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              {showCreateNewOption
                ? (dict.selectResumeTitleWithCreate || 'Select CV to Adapt or Create a New CV')
                : (dict.selectResumeTitle || 'Select CV to Adapt')}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="h-12 w-12 text-purple-600 animate-spin" />
                <p className="text-sm text-gray-600">{dict.loading || 'Loading your CVs...'}</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            ) : resumes.length === 0 && !showCreateNewOption ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <p className="text-sm text-yellow-800">
                  {dict.noResumesError || 'Please create a CV first before adapting it to a job.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* New CV Option - Only shown when showCreateNewOption is true */}
                {showCreateNewOption && (
                  <label
                    className={`flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      isCreateNewSelected
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-teal-200 hover:border-teal-300 hover:bg-teal-50/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resume"
                      value="new"
                      checked={isCreateNewSelected}
                      onChange={handleSelectNewCV}
                      className="mt-1 w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FilePlus className="h-5 w-5 text-teal-600" />
                        <h3 className="font-medium text-teal-900">{dict.newCV || 'Nouveau CV'}</h3>
                      </div>
                      <p className="mt-1 text-sm text-teal-700">
                        {dict.newCVDescription || 'Create a new CV based on this job description'}
                      </p>
                    </div>
                  </label>
                )}

                {/* Existing CVs */}
                {resumes.map((resume) => (
                  <label
                    key={resume.id}
                    className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedResumeId === resume.id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resume"
                      value={resume.id}
                      checked={selectedResumeId === resume.id}
                      onChange={() => handleSelectExistingCV(resume.id)}
                      className="mt-1 w-4 h-4 text-purple-600 border-gray-300 focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-gray-400" />
                        <h3 className="font-medium text-gray-900 truncate">{resume.title}</h3>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                        <span className="capitalize">{resume.template} template</span>
                        <span>•</span>
                        <span>
                          Updated {new Date(resume.updated_at || resume.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 hover:bg-gray-200 rounded-md transition-colors"
            >
              {dict.cancel || 'Cancel'}
            </button>
            <button
              onClick={handleSelect}
              disabled={!selectedResumeId && !isCreateNewSelected}
              className={`px-6 py-2 text-white text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                isCreateNewSelected
                  ? 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-500'
                  : 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'
              }`}
            >
              {isCreateNewSelected ? (dict.newCV || 'Nouveau CV') : (dict.selectCV || 'Select CV')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
