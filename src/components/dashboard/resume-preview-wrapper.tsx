'use client'

import { useEffect, useState } from 'react'
import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
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
 */
export function ResumePreviewWrapper({
  initialResume,
  locale,
  dict,
  showControls = true,
}: ResumePreviewWrapperProps) {
  const [resume, setResume] = useState<Resume>(initialResume)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [titleFontSize, setTitleFontSize] = useState(24) // Default: text-2xl = 24px
  const [titleGap, setTitleGap] = useState(8) // Default: mb-2 = 8px gap between title and contact
  const [contactFontSize, setContactFontSize] = useState(12) // Default: text-xs = 12px
  const [sectionTitleFontSize, setSectionTitleFontSize] = useState(16) // Default: text-base = 16px
  const [sectionDescFontSize, setSectionDescFontSize] = useState(14) // Default: text-sm = 14px
  const [sectionGap, setSectionGap] = useState(12) // Default: mb-3 = 12px gap between section title and description
  const [headerGap, setHeaderGap] = useState(12) // Default: 12px gap between contact and summary section
  const [sidebarColor, setSidebarColor] = useState('hsl(240, 85%, 35%)') // Default: dark blue

  // Load slider settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(`resume_slider_settings_${initialResume.id}`)
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        if (settings.titleFontSize !== undefined) setTitleFontSize(settings.titleFontSize)
        if (settings.titleGap !== undefined) setTitleGap(settings.titleGap)
        if (settings.contactFontSize !== undefined) setContactFontSize(settings.contactFontSize)
        if (settings.sectionTitleFontSize !== undefined) setSectionTitleFontSize(settings.sectionTitleFontSize)
        if (settings.sectionDescFontSize !== undefined) setSectionDescFontSize(settings.sectionDescFontSize)
        if (settings.sectionGap !== undefined) setSectionGap(settings.sectionGap)
        if (settings.headerGap !== undefined) setHeaderGap(settings.headerGap)
        if (settings.sidebarColor !== undefined) setSidebarColor(settings.sidebarColor)
      } catch (error) {
        console.error('Failed to load slider settings:', error)
      }
    }
    setIsLoaded(true)
  }, [initialResume.id])

  // Save slider settings to localStorage whenever they change (only after initial load)
  useEffect(() => {
    if (!isLoaded) return // Don't save until initial load is complete

    const settings = {
      titleFontSize,
      titleGap,
      contactFontSize,
      sectionTitleFontSize,
      sectionDescFontSize,
      sectionGap,
      headerGap,
      sidebarColor,
    }
    localStorage.setItem(`resume_slider_settings_${initialResume.id}`, JSON.stringify(settings))
  }, [isLoaded, titleFontSize, titleGap, contactFontSize, sectionTitleFontSize, sectionDescFontSize, sectionGap, headerGap, sidebarColor, initialResume.id])

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
        setTitleFontSize={showControls ? setTitleFontSize : undefined}
        titleGap={titleGap}
        setTitleGap={showControls ? setTitleGap : undefined}
        contactFontSize={contactFontSize}
        setContactFontSize={showControls ? setContactFontSize : undefined}
        sectionTitleFontSize={sectionTitleFontSize}
        setSectionTitleFontSize={showControls ? setSectionTitleFontSize : undefined}
        sectionDescFontSize={sectionDescFontSize}
        setSectionDescFontSize={showControls ? setSectionDescFontSize : undefined}
        sectionGap={sectionGap}
        setSectionGap={showControls ? setSectionGap : undefined}
        headerGap={headerGap}
        setHeaderGap={showControls ? setHeaderGap : undefined}
        sidebarColor={sidebarColor}
        setSidebarColor={showControls ? setSidebarColor : undefined}
      />
    </>
  )
}
