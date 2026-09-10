'use client'

import { useEffect, useState } from 'react'
import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { useResumeLayout } from '@/lib/hooks/use-resume-layout'
import { ResumePreview } from './resume-preview'

interface ResumePreviewWrapperProps {
  initialResume: Resume
  locale: Locale
  dict: any
  showControls?: boolean
}

/**
 * Wrapper component that checks for unsaved changes in localStorage
 * and displays them in the preview instead of the saved version
 *
 * Layout state is NOT declared here. It is owned by `useResumeLayout`, which
 * `resume-editor.tsx` also calls — one declaration, one loader, one cache
 * writer, one account writer. Adding a `useState` for a layout property to this
 * file would recreate the second authoritative copy US-002 removed.
 */
export function ResumePreviewWrapper({
  initialResume,
  locale,
  dict,
  showControls = true,
}: ResumePreviewWrapperProps) {
  const [resume, setResume] = useState<Resume>(initialResume)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string>('')

  const { layout, setters, sidebarColor, modern } = useResumeLayout(
    initialResume.id,
    initialResume,
  )

  // The photo is not layout state — it stays browser-local under its own key,
  // as the named exception the PRD records — so it is loaded here rather than
  // by the layout owner.
  useEffect(() => {
    try {
      const savedPhoto = localStorage.getItem(`resume_photo_${initialResume.id}`)
      if (savedPhoto) setPhotoUrl(savedPhoto)
    } catch {}
  }, [initialResume.id])

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
        titleFontSize={layout.titleFontSize}
        setTitleFontSize={showControls ? setters.setTitleFontSize : undefined}
        titleGap={layout.titleGap}
        setTitleGap={showControls ? setters.setTitleGap : undefined}
        contactFontSize={layout.contactFontSize}
        setContactFontSize={showControls ? setters.setContactFontSize : undefined}
        sectionTitleFontSize={layout.sectionTitleFontSize}
        setSectionTitleFontSize={showControls ? setters.setSectionTitleFontSize : undefined}
        sectionDescFontSize={layout.sectionDescFontSize}
        setSectionDescFontSize={showControls ? setters.setSectionDescFontSize : undefined}
        sectionGap={layout.sectionGap}
        setSectionGap={showControls ? setters.setSectionGap : undefined}
        headerGap={layout.headerGap}
        setHeaderGap={showControls ? setters.setHeaderGap : undefined}
        sidebarColor={sidebarColor}
        fontScale={layout.fontScale}
        fontFamily={layout.fontFamily}
        sidebarOrder={layout.sidebarOrder}
        mainContentOrder={layout.mainContentOrder}
        sidebarTopMargin={layout.sidebarTopMargin}
        mainContentTopMargin={layout.mainContentTopMargin}
        sidebarWidth={layout.sidebarWidth}
        hiddenSidebarSections={layout.hiddenSidebarSections}
        hiddenMainSections={layout.hiddenMainSections}
        modernSidebarOrder={modern.modernSidebarOrder}
        modernMainContentOrder={modern.modernMainOrder}
        hiddenModernSidebarSections={modern.hiddenModernSidebar}
        hiddenModernMainSections={modern.hiddenModernMain}
        photoUrl={photoUrl}
      />
    </>
  )
}
