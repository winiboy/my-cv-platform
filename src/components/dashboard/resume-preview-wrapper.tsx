'use client'

import { useEffect, useState } from 'react'
import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { useResumeLayout } from '@/lib/hooks/use-resume-layout'
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { resumeWithDraft } from '@/lib/resume-draft'
import { ResumePreview } from './resume-preview'
import { ResumeSheets } from './resume-sheets'

interface ResumePreviewWrapperProps {
  initialResume: Resume
  locale: Locale
  dict: any
}

/**
 * Wrapper component that checks for unsaved changes in localStorage
 * and displays them in the preview instead of the saved version
 *
 * Layout state is NOT declared here. It is owned by `useResumeLayout`, which
 * `resume-editor.tsx` also calls — one declaration, one loader, one cache
 * writer, one account writer. Adding a `useState` for a layout property to this
 * file would recreate the second authoritative copy US-002 removed.
 *
 * Read-only for layout (swiss-cv-templates FR-13): the Preview renders the
 * stored values and passes no setter, so no template draws an in-page editing
 * control here. Layout is changed in the Editor.
 */
export function ResumePreviewWrapper({
  initialResume,
  locale,
  dict,
}: ResumePreviewWrapperProps) {
  const [resume, setResume] = useState<Resume>(initialResume)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string>('')

  const { layout } = useResumeLayout(
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
        // The stored row keeps its template, so this page — and the PDF, which
        // prints it with the draft seeded — draws what Word draws.
        setResume(resumeWithDraft(initialResume, JSON.parse(draft)))
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

      {/* The query container for the labels' gutter below. Block-level, with no
          box of its own, so it changes neither the layout nor the print. */}
      <div className="@container">
        {/* Exactly as wide as the page, centred. The sheets follow the draft,
            the template it names, and fonts or a photo that finish loading
            after mount; they are screen-only, so the document prints and is
            captured by the PDF route as it was without them. */}
        <ResumeSheets
          template={resume.template}
          scale={1}
          labelTemplate={dict.resumes.pageBreakLabel}
          // A label is drawn 3 px + 10 px past the sheet's edge. Below
          // 820 px = 794 + 2 × 13 there is no such gutter beside the centred
          // sheet, and a label there would widen the page's horizontal scroll,
          // or create one; the gap alone still parts the sheets.
          labelClassName="@max-[820px]:hidden"
          className="mx-auto"
          style={{ width: `${PAGE_WIDTH_PX}px` }}
        >
          <ResumePreview
            resume={resume}
            locale={locale}
            dict={dict}
            hiddenSidebarSections={layout.hiddenSidebarSections}
            hiddenMainSections={layout.hiddenMainSections}
            hiddenContactFields={layout.hiddenContactFields}
            photoUrl={photoUrl}
          />
        </ResumeSheets>
      </div>
    </>
  )
}
