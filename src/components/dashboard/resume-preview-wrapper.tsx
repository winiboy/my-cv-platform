'use client'

import { useEffect, useState } from 'react'
import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { ResumePreview } from './resume-preview'

interface ResumePreviewWrapperProps {
  initialResume: Resume
  locale: Locale
  dict: any
}

/**
 * Wrapper component that checks for unsaved changes in localStorage
 * and displays them in the preview instead of the saved version
 */
export function ResumePreviewWrapper({
  initialResume,
  locale,
  dict,
}: ResumePreviewWrapperProps) {
  const [resume, setResume] = useState<Resume>(initialResume)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [titleFontSize, setTitleFontSize] = useState(24) // Default: text-2xl = 24px
  const [titleGap, setTitleGap] = useState(8) // Default: mb-2 = 8px gap between title and contact
  const [contactFontSize, setContactFontSize] = useState(12) // Default: text-xs = 12px
  const [sectionTitleFontSize, setSectionTitleFontSize] = useState(16) // Default: text-base = 16px
  const [sectionDescFontSize, setSectionDescFontSize] = useState(14) // Default: text-sm = 14px

  useEffect(() => {
    // Check for draft in localStorage
    const draft = localStorage.getItem(`resume_draft_${initialResume.id}`)
    if (draft) {
      try {
        const draftResume = JSON.parse(draft)
        setResume(draftResume)
        setHasUnsavedChanges(true)
      } catch (error) {
        console.error('Failed to load draft for preview:', error)
        setResume(initialResume)
      }
    } else {
      setResume(initialResume)
    }
  }, [initialResume])

  return (
    <>
      {hasUnsavedChanges && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 print:hidden">
          <div className="mx-auto max-w-7xl flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-600 animate-pulse"></div>
            <p className="text-sm text-amber-900 font-medium">
              {dict.resumes?.previewUnsavedTitle || 'Preview with unsaved changes'}
            </p>
            <p className="text-xs text-amber-700">
              {dict.resumes?.previewUnsavedWarning || 'Changes will be lost if you do not save'}
            </p>
          </div>
        </div>
      )}

      <ResumePreview
        resume={resume}
        locale={locale}
        dict={dict}
        titleFontSize={titleFontSize}
        setTitleFontSize={setTitleFontSize}
        titleGap={titleGap}
        setTitleGap={setTitleGap}
        contactFontSize={contactFontSize}
        setContactFontSize={setContactFontSize}
        sectionTitleFontSize={sectionTitleFontSize}
        setSectionTitleFontSize={setSectionTitleFontSize}
        sectionDescFontSize={sectionDescFontSize}
        setSectionDescFontSize={setSectionDescFontSize}
      />
    </>
  )
}
