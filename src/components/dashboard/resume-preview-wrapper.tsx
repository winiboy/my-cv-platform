'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import {
  DEFAULT_RESUME_LAYOUT,
  mapEditorOrderToModern,
  resolveResumeLayout,
  serializeLayoutModel,
  type EditorMainId,
  type EditorSidebarId,
} from '@/lib/layout-settings'
import { adoptCachedLayout, usePersistedLayout } from '@/lib/hooks/use-persisted-layout'
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

  // Load layout settings on mount.
  //
  // The account's persisted settings and the browser's cached ones are both
  // handed to `resolveResumeLayout`, which owns the precedence between them —
  // per property, the account wins where the account has a value. This
  // component does not layer the two itself and must not start to: a second
  // copy of that rule is exactly what would let the two disagree.
  //
  // Reading a complete model rather than a partial is what lets every setter
  // below be called unconditionally: a property no store carries comes back as
  // its documented default, which is the value this state was initialized to.
  useEffect(() => {
    let cached: string | null = null
    try {
      cached = localStorage.getItem(`resume_slider_settings_${initialResume.id}`)
    } catch (error) {
      // A browser that refuses localStorage is not a reason to fail the render;
      // the account's settings are still readable.
      console.error('Failed to read cached layout settings:', error)
    }

    const layout = resolveResumeLayout(initialResume, cached)

    // Move anything this browser holds that the account has never had onto the
    // account, once. Called here rather than from a hook of its own so it sees
    // the same two stores and the same cache string the line above resolved
    // from — and sees the cache before the effect below starts overwriting it
    // with the resolved model.
    adoptCachedLayout(initialResume.id, initialResume, cached)

    setTitleFontSize(layout.titleFontSize)
    setTitleGap(layout.titleGap)
    setContactFontSize(layout.contactFontSize)
    setSectionTitleFontSize(layout.sectionTitleFontSize)
    setSectionDescFontSize(layout.sectionDescFontSize)
    setSectionGap(layout.sectionGap)
    setHeaderGap(layout.headerGap)
    setSidebarHue(layout.sidebarHue)
    setSidebarSaturation(layout.sidebarSaturation)
    setSidebarBrightness(layout.sidebarBrightness)
    setFontScale(layout.fontScale)
    setFontFamily(layout.fontFamily)
    setSidebarTopMargin(layout.sidebarTopMargin)
    setMainContentTopMargin(layout.mainContentTopMargin)
    setSidebarWidth(layout.sidebarWidth)
    setSidebarOrder([...layout.sidebarOrder])
    setMainContentOrder([...layout.mainContentOrder])
    setHiddenSidebarSections([...layout.hiddenSidebarSections])
    setHiddenMainSections([...layout.hiddenMainSections])

    try {
      const savedPhoto = localStorage.getItem(`resume_photo_${initialResume.id}`)
      if (savedPhoto) setPhotoUrl(savedPhoto)
    } catch {}

    setIsLoaded(true)
    // Mount-only, keyed on the resume. `initialResume` is read in full for its
    // two persisted stores, but this effect must not re-run when the prop
    // object is replaced: the layout state below is authoritative from here on
    // and is written back to the row by the persist effect, so re-reading the
    // stores would discard an in-progress edit and overwrite it with what was
    // loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResume.id])

  /**
   * The current layout model, assembled once from the nineteen pieces of state
   * that hold it, so that the two things which consume a whole model — the
   * localStorage cache and the account write — cannot be handed different ones.
   */
  const layoutModel = useMemo(
    () => ({
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
    }),
    [titleFontSize, titleGap, contactFontSize, sectionTitleFontSize, sectionDescFontSize, sectionGap, headerGap, sidebarHue, sidebarSaturation, sidebarBrightness, fontScale, fontFamily, sidebarTopMargin, mainContentTopMargin, sidebarWidth, sidebarOrder, mainContentOrder, hiddenSidebarSections, hiddenMainSections],
  )

  // Cache the model in localStorage for a fast first paint on the next visit.
  // A cache, not a store: `resolveResumeLayout` lets the account override it.
  useEffect(() => {
    if (!isLoaded) return // Don't save until initial load is complete

    try {
      localStorage.setItem(
        `resume_slider_settings_${initialResume.id}`,
        serializeLayoutModel(layoutModel),
      )
    } catch (error) {
      // A full or disabled localStorage costs a fast first paint, nothing more:
      // the account write below is what actually keeps these settings.
      console.error('Failed to cache layout settings:', error)
    }
  }, [isLoaded, layoutModel, initialResume.id])

  // Persist the model to the account. The one writer lives in the hook.
  usePersistedLayout(initialResume.id, layoutModel, isLoaded)

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
