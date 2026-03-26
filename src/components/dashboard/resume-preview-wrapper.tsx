'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { extractLayoutSettings, migrateSidebarOrder, mapEditorOrderToModern } from '@/lib/layout-settings'
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
  const [sidebarHue, setSidebarHue] = useState(240) // Default: blue hue
  const [sidebarSaturation, setSidebarSaturation] = useState(85) // Default: 85% saturation
  const [sidebarBrightness, setSidebarBrightness] = useState(35) // Default: 35% lightness
  const [fontScale, setFontScale] = useState(1) // Default: 1 (100%)
  const [sidebarOrder, setSidebarOrder] = useState<('keyAchievements' | 'skills' | 'languages' | 'training')[]>(['keyAchievements', 'skills', 'languages', 'training'])
  const [mainContentOrder, setMainContentOrder] = useState<('summary' | 'experience' | 'education')[]>(['summary', 'experience', 'education'])
  const [fontFamily, setFontFamily] = useState("Arial, Helvetica, sans-serif")
  const [sidebarTopMargin, setSidebarTopMargin] = useState(64) // Default: 64px (mb-16)
  const [mainContentTopMargin, setMainContentTopMargin] = useState(24) // Default: 24px
  const [sidebarWidth, setSidebarWidth] = useState(30) // Default: 30%
  const [hiddenSidebarSections, setHiddenSidebarSections] = useState<('keyAchievements' | 'skills' | 'languages' | 'training')[]>([])
  const [hiddenMainSections, setHiddenMainSections] = useState<('summary' | 'experience' | 'education')[]>([])
  const [photoUrl, setPhotoUrl] = useState<string>('')

  // Compute sidebarColor from hue, saturation, and brightness
  const sidebarColor = `hsl(${sidebarHue}, ${sidebarSaturation}%, ${sidebarBrightness}%)`

  // Map editor section IDs to Modern template section IDs for the Apercu preview
  const { modernSidebarOrder, modernMainOrder, hiddenModernSidebar, hiddenModernMain } = useMemo(
    () => mapEditorOrderToModern(sidebarOrder, mainContentOrder, hiddenSidebarSections, hiddenMainSections),
    [sidebarOrder, mainContentOrder, hiddenSidebarSections, hiddenMainSections],
  )

  // Load slider settings on mount: first from Supabase data, then localStorage may override
  useEffect(() => {
    // Load layout settings from Supabase data (persisted in custom_sections JSONB)
    const supabaseLayout = extractLayoutSettings(initialResume.custom_sections)
    if (supabaseLayout) {
      if (supabaseLayout.sidebarOrder) {
        setSidebarOrder(migrateSidebarOrder(supabaseLayout.sidebarOrder) as ('keyAchievements' | 'skills' | 'languages' | 'training')[])
      }
      if (supabaseLayout.mainContentOrder) {
        setMainContentOrder(supabaseLayout.mainContentOrder as ('summary' | 'experience' | 'education')[])
      }
      if (supabaseLayout.hiddenSidebarSections) {
        setHiddenSidebarSections(supabaseLayout.hiddenSidebarSections as ('keyAchievements' | 'skills' | 'languages' | 'training')[])
      }
      if (supabaseLayout.hiddenMainSections) {
        setHiddenMainSections(supabaseLayout.hiddenMainSections as ('summary' | 'experience' | 'education')[])
      }
    }

    // localStorage settings override Supabase values (supports local customization)
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
        if (settings.sidebarHue !== undefined) setSidebarHue(settings.sidebarHue)
        if (settings.sidebarSaturation !== undefined) setSidebarSaturation(settings.sidebarSaturation)
        if (settings.sidebarBrightness !== undefined) setSidebarBrightness(settings.sidebarBrightness)
        if (settings.fontScale !== undefined) setFontScale(settings.fontScale)
        if (settings.sidebarOrder !== undefined) {
          setSidebarOrder(migrateSidebarOrder(settings.sidebarOrder) as ('keyAchievements' | 'skills' | 'languages' | 'training')[])
        }
        if (settings.mainContentOrder !== undefined) setMainContentOrder(settings.mainContentOrder)
        if (settings.fontFamily !== undefined) setFontFamily(settings.fontFamily)
        if (settings.sidebarTopMargin !== undefined) setSidebarTopMargin(settings.sidebarTopMargin)
        if (settings.mainContentTopMargin !== undefined) setMainContentTopMargin(settings.mainContentTopMargin)
        if (settings.sidebarWidth !== undefined) setSidebarWidth(settings.sidebarWidth)
        if (settings.hiddenSidebarSections !== undefined) setHiddenSidebarSections(settings.hiddenSidebarSections)
        if (settings.hiddenMainSections !== undefined) setHiddenMainSections(settings.hiddenMainSections)
      } catch (error) {
        console.error('Failed to load slider settings:', error)
      }
    }

    try {
      const savedPhoto = localStorage.getItem(`resume_photo_${initialResume.id}`)
      if (savedPhoto) setPhotoUrl(savedPhoto)
    } catch {}

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
      sidebarHue,
      sidebarSaturation,
      sidebarBrightness,
      fontScale,
      sidebarOrder,
      mainContentOrder,
      fontFamily,
      sidebarTopMargin,
      mainContentTopMargin,
      sidebarWidth,
      hiddenSidebarSections,
      hiddenMainSections,
    }
    const localStorageKey = `resume_slider_settings_${initialResume.id}`
    localStorage.setItem(localStorageKey, JSON.stringify(settings))

  }, [isLoaded, titleFontSize, titleGap, contactFontSize, sectionTitleFontSize, sectionDescFontSize, sectionGap, headerGap, sidebarHue, sidebarSaturation, sidebarBrightness, fontScale, sidebarOrder, mainContentOrder, fontFamily, sidebarTopMargin, mainContentTopMargin, sidebarWidth, hiddenSidebarSections, hiddenMainSections, initialResume.id])

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
        fontScale={fontScale}
        fontFamily={fontFamily}
        sidebarOrder={sidebarOrder}
        mainContentOrder={mainContentOrder}
        sidebarTopMargin={sidebarTopMargin}
        mainContentTopMargin={mainContentTopMargin}
        sidebarWidth={sidebarWidth}
        hiddenSidebarSections={hiddenSidebarSections}
        hiddenMainSections={hiddenMainSections}
        modernSidebarOrder={modernSidebarOrder}
        modernMainContentOrder={modernMainOrder}
        hiddenModernSidebarSections={hiddenModernSidebar}
        hiddenModernMainSections={hiddenModernMain}
        photoUrl={photoUrl}
      />
    </>
  )
}
