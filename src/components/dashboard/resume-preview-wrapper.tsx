'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import {
  DEFAULT_RESUME_LAYOUT,
  extractLayoutSettings,
  mapEditorOrderToModern,
  migrateSidebarOrder,
  parseLayoutModel,
  serializeLayoutModel,
  type EditorMainId,
  type EditorSidebarId,
} from '@/lib/layout-settings'
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
  // Layout state. Every initial value comes from DEFAULT_RESUME_LAYOUT so the
  // preview, the editor and the DOCX route cannot drift apart; the arrays are
  // copied because the shared default is frozen.
  const [titleFontSize, setTitleFontSize] = useState(DEFAULT_RESUME_LAYOUT.titleFontSize)
  const [titleGap, setTitleGap] = useState(DEFAULT_RESUME_LAYOUT.titleGap)
  const [contactFontSize, setContactFontSize] = useState(DEFAULT_RESUME_LAYOUT.contactFontSize)
  const [sectionTitleFontSize, setSectionTitleFontSize] = useState(DEFAULT_RESUME_LAYOUT.sectionTitleFontSize)
  const [sectionDescFontSize, setSectionDescFontSize] = useState(DEFAULT_RESUME_LAYOUT.sectionDescFontSize)
  const [sectionGap, setSectionGap] = useState(DEFAULT_RESUME_LAYOUT.sectionGap)
  const [headerGap, setHeaderGap] = useState(DEFAULT_RESUME_LAYOUT.headerGap)
  const [sidebarHue, setSidebarHue] = useState(DEFAULT_RESUME_LAYOUT.sidebarHue)
  const [sidebarSaturation, setSidebarSaturation] = useState(DEFAULT_RESUME_LAYOUT.sidebarSaturation)
  const [sidebarBrightness, setSidebarBrightness] = useState(DEFAULT_RESUME_LAYOUT.sidebarBrightness)
  const [fontScale, setFontScale] = useState(DEFAULT_RESUME_LAYOUT.fontScale)
  const [sidebarOrder, setSidebarOrder] = useState<EditorSidebarId[]>([...DEFAULT_RESUME_LAYOUT.sidebarOrder])
  const [mainContentOrder, setMainContentOrder] = useState<EditorMainId[]>([...DEFAULT_RESUME_LAYOUT.mainContentOrder])
  const [fontFamily, setFontFamily] = useState(DEFAULT_RESUME_LAYOUT.fontFamily)
  const [sidebarTopMargin, setSidebarTopMargin] = useState(DEFAULT_RESUME_LAYOUT.sidebarTopMargin)
  const [mainContentTopMargin, setMainContentTopMargin] = useState(DEFAULT_RESUME_LAYOUT.mainContentTopMargin)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_RESUME_LAYOUT.sidebarWidth)
  const [hiddenSidebarSections, setHiddenSidebarSections] = useState<EditorSidebarId[]>([...DEFAULT_RESUME_LAYOUT.hiddenSidebarSections])
  const [hiddenMainSections, setHiddenMainSections] = useState<EditorMainId[]>([...DEFAULT_RESUME_LAYOUT.hiddenMainSections])
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
        setSidebarOrder(migrateSidebarOrder(supabaseLayout.sidebarOrder) as EditorSidebarId[])
      }
      if (supabaseLayout.mainContentOrder) {
        setMainContentOrder(supabaseLayout.mainContentOrder as EditorMainId[])
      }
      if (supabaseLayout.hiddenSidebarSections) {
        setHiddenSidebarSections(supabaseLayout.hiddenSidebarSections as EditorSidebarId[])
      }
      if (supabaseLayout.hiddenMainSections) {
        setHiddenMainSections(supabaseLayout.hiddenMainSections as EditorMainId[])
      }
    }

    // localStorage settings override Supabase values (supports local customization).
    // parseLayoutModel returns only the keys this blob actually carries, so a
    // blob that never mentioned section order leaves the account's order alone.
    // It is total: a malformed blob yields no keys instead of throwing, and an
    // individually unusable value falls back to its default rather than
    // reaching a style attribute.
    const savedSettings = localStorage.getItem(`resume_slider_settings_${initialResume.id}`)
    if (savedSettings) {
      let settings: ReturnType<typeof parseLayoutModel> = {}
      try {
        settings = parseLayoutModel(JSON.parse(savedSettings))
      } catch (error) {
        console.error('Failed to load slider settings:', error)
      }
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
      if (settings.sidebarOrder !== undefined) setSidebarOrder([...settings.sidebarOrder])
      if (settings.mainContentOrder !== undefined) setMainContentOrder([...settings.mainContentOrder])
      if (settings.fontFamily !== undefined) setFontFamily(settings.fontFamily)
      if (settings.sidebarTopMargin !== undefined) setSidebarTopMargin(settings.sidebarTopMargin)
      if (settings.mainContentTopMargin !== undefined) setMainContentTopMargin(settings.mainContentTopMargin)
      if (settings.sidebarWidth !== undefined) setSidebarWidth(settings.sidebarWidth)
      if (settings.hiddenSidebarSections !== undefined) setHiddenSidebarSections([...settings.hiddenSidebarSections])
      if (settings.hiddenMainSections !== undefined) setHiddenMainSections([...settings.hiddenMainSections])
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

    const localStorageKey = `resume_slider_settings_${initialResume.id}`
    localStorage.setItem(localStorageKey, serializeLayoutModel({
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
      fontFamily,
      sidebarTopMargin,
      mainContentTopMargin,
      sidebarWidth,
      sidebarOrder,
      mainContentOrder,
      hiddenSidebarSections,
      hiddenMainSections,
    }))

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
