'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Sparkles,
  CheckCircle,
  User,
  FileText,
  AlignLeft,
  PenTool,
  Loader2,
  Link2,
  Briefcase,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n'
import type { CoverLetter, Resume, CoverLetterAnalysis } from '@/types/database'
import { CoverLetterPreview } from './cover-letter-preview'
import { ResumeAssociationSection } from './cover-letter-sections/resume-association-section'
import { JobAssociationSection } from './cover-letter-sections/job-association-section'
import { RecipientSection } from './cover-letter-sections/recipient-section'
import { OpeningSection } from './cover-letter-sections/opening-section'
import { BodySection } from './cover-letter-sections/body-section'
import { ClosingSection } from './cover-letter-sections/closing-section'
import { SignatureSection } from './cover-letter-sections/signature-section'
import { CoverLetterGenerationModal } from './cover-letter-generation-modal'
import { CoverLetterCheckerModal } from './cover-letter-checker-modal'

interface JobApplicationData {
  id: string
  company_name: string
  job_title: string
  job_url: string | null
  job_description: string | null
}

interface CoverLetterEditorProps {
  coverLetter: CoverLetter
  resumes: Resume[]
  jobApplications: JobApplicationData[]
  currentJobApplication: JobApplicationData | null
  locale: Locale
  dict: Record<string, unknown>
}

type SectionId = 'resume' | 'job' | 'recipient' | 'opening' | 'body' | 'closing' | 'signature'

const SECTIONS = [
  { id: 'resume' as const, label: 'Linked CV', icon: Link2 },
  { id: 'job' as const, label: 'Linked Job', icon: Briefcase },
  { id: 'recipient' as const, label: 'Recipient', icon: User },
  { id: 'opening' as const, label: 'Opening', icon: FileText },
  { id: 'body' as const, label: 'Body', icon: AlignLeft },
  { id: 'closing' as const, label: 'Closing', icon: AlignLeft },
  { id: 'signature' as const, label: 'Signature', icon: PenTool },
]

export function CoverLetterEditor({
  coverLetter: initialCoverLetter,
  resumes,
  jobApplications,
  currentJobApplication: initialJobApplication,
  locale,
  dict,
}: CoverLetterEditorProps) {
  const _router = useRouter()
  const [coverLetter, setCoverLetter] = useState(initialCoverLetter)
  const [currentJobApplication, setCurrentJobApplication] = useState<JobApplicationData | null>(initialJobApplication)
  const [activeSection, setActiveSection] = useState<SectionId>('recipient')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showGenerationModal, setShowGenerationModal] = useState(false)
  const [showCheckerModal, setShowCheckerModal] = useState(false)

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const editorDict = (coverLettersDict.editor || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError('')

    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('cover_letters')
        .update({
          title: coverLetter.title,
          recipient_name: coverLetter.recipient_name,
          recipient_title: coverLetter.recipient_title,
          company_name: coverLetter.company_name,
          company_address: coverLetter.company_address,
          greeting: coverLetter.greeting,
          opening_paragraph: coverLetter.opening_paragraph,
          body_paragraphs: coverLetter.body_paragraphs,
          closing_paragraph: coverLetter.closing_paragraph,
          sign_off: coverLetter.sign_off,
          sender_name: coverLetter.sender_name,
          job_title: coverLetter.job_title,
          job_description: coverLetter.job_description,
          template: coverLetter.template,
          resume_id: coverLetter.resume_id,
          analysis_score: coverLetter.analysis_score,
          analysis_results: coverLetter.analysis_results,
          updated_at: new Date().toISOString(),
        })
        .eq('id', coverLetter.id)

      if (error) {
        console.error('Error saving cover letter:', error)
        setSaveError((editorDict.saveFailed as string) || 'Failed to save')
      } else {
        setLastSaved(new Date())
        setHasUnsavedChanges(false)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      setSaveError((editorDict.saveFailed as string) || 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const updateCoverLetter = useCallback((updates: Partial<CoverLetter>) => {
    setCoverLetter((prev) => ({ ...prev, ...updates }))
    setHasUnsavedChanges(true)
  }, [])

  const handleFieldChange = useCallback(
    (field: string, value: unknown) => {
      updateCoverLetter({ [field]: value } as Partial<CoverLetter>)
    },
    [updateCoverLetter]
  )

  const handleBodyParagraphsChange = useCallback(
    (paragraphs: string[]) => {
      updateCoverLetter({ body_paragraphs: paragraphs as unknown as CoverLetter['body_paragraphs'] })
    },
    [updateCoverLetter]
  )

  const handleAnalysisComplete = useCallback(
    (analysis: CoverLetterAnalysis) => {
      updateCoverLetter({
        analysis_score: analysis.score,
        analysis_results: analysis as unknown as CoverLetter['analysis_results'],
      })
    },
    [updateCoverLetter]
  )

  /**
   * Handles resume association changes. Updates local state immediately
   * and persists to database. Reverts on error.
   */
  const handleResumeChange = useCallback(
    async (resumeId: string | null) => {
      const previousResumeId = coverLetter.resume_id

      // Update local state immediately for responsive UI
      setCoverLetter((prev) => ({ ...prev, resume_id: resumeId }))

      try {
        const supabase = createClient()
        const { error } = await supabase
          .from('cover_letters')
          .update({ resume_id: resumeId, updated_at: new Date().toISOString() })
          .eq('id', coverLetter.id)

        if (error) {
          console.error('Error updating resume association:', error)
          // Revert on error
          setCoverLetter((prev) => ({ ...prev, resume_id: previousResumeId }))
          setSaveError(
            ((editorDict.resume as Record<string, string>)?.error as string) ||
              'Failed to update linked resume'
          )
        }
      } catch (err) {
        console.error('Unexpected error updating resume association:', err)
        // Revert on error
        setCoverLetter((prev) => ({ ...prev, resume_id: previousResumeId }))
        setSaveError(
          ((editorDict.resume as Record<string, string>)?.error as string) ||
            'Failed to update linked resume'
        )
      }
    },
    [coverLetter.id, coverLetter.resume_id, editorDict]
  )

  /**
   * Handles job application association changes. Updates both sides of the relationship:
   * - cover_letters.job_application_id
   * - job_applications.cover_letter_id (bidirectional sync)
   * Updates local state immediately and persists to database. Reverts on error.
   */
  const handleJobApplicationChange = useCallback(
    async (jobApplicationId: string | null) => {
      const previousJobApplicationId = coverLetter.job_application_id
      const previousJobApplication = currentJobApplication

      // Find the new job application data
      const newJobApplication = jobApplicationId
        ? jobApplications.find((j) => j.id === jobApplicationId) || null
        : null

      // Update local state immediately for responsive UI
      setCoverLetter((prev) => ({ ...prev, job_application_id: jobApplicationId }))
      setCurrentJobApplication(newJobApplication)

      try {
        const supabase = createClient()

        // Step 1: Update the cover letter to link to the new job (or null)
        const { error: coverLetterError } = await supabase
          .from('cover_letters')
          .update({ job_application_id: jobApplicationId, updated_at: new Date().toISOString() })
          .eq('id', coverLetter.id)

        if (coverLetterError) {
          console.error('Error updating cover letter job association:', coverLetterError)
          throw coverLetterError
        }

        // Step 2: Clear the previous job's cover_letter_id if there was one
        if (previousJobApplicationId) {
          const { error: clearPreviousError } = await supabase
            .from('job_applications')
            .update({ cover_letter_id: null })
            .eq('id', previousJobApplicationId)

          if (clearPreviousError) {
            console.error('Error clearing previous job reverse link:', clearPreviousError)
            // Non-fatal: log but continue since the primary link was updated
          }
        }

        // Step 3: Set the new job's cover_letter_id if linking to a job
        if (jobApplicationId) {
          const { error: setNewError } = await supabase
            .from('job_applications')
            .update({ cover_letter_id: coverLetter.id })
            .eq('id', jobApplicationId)

          if (setNewError) {
            console.error('Error setting new job reverse link:', setNewError)
            // Rollback: revert cover letter update and restore previous job link
            await supabase
              .from('cover_letters')
              .update({ job_application_id: previousJobApplicationId, updated_at: new Date().toISOString() })
              .eq('id', coverLetter.id)
            if (previousJobApplicationId) {
              await supabase
                .from('job_applications')
                .update({ cover_letter_id: coverLetter.id })
                .eq('id', previousJobApplicationId)
            }
            throw setNewError
          }
        }
      } catch (err) {
        console.error('Unexpected error updating job application association:', err)
        // Revert local state on error
        setCoverLetter((prev) => ({ ...prev, job_application_id: previousJobApplicationId }))
        setCurrentJobApplication(previousJobApplication)
        const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
        const jobAssociationDict = (coverLettersDict.jobAssociation || {}) as Record<string, string>
        setSaveError(jobAssociationDict.error || 'Failed to update linked job')
      }
    },
    [coverLetter.id, coverLetter.job_application_id, currentJobApplication, jobApplications, dict]
  )

  /**
   * Handles generated content from AI and optionally links to selected job
   */
  const handleGeneratedContent = useCallback(
    async (
      content: {
        greeting: string
        openingParagraph: string
        bodyParagraphs: string[]
        closingParagraph: string
        signOff: string
      },
      jobApplicationId?: string
    ) => {
      updateCoverLetter({
        greeting: content.greeting,
        opening_paragraph: content.openingParagraph,
        body_paragraphs: content.bodyParagraphs as unknown as CoverLetter['body_paragraphs'],
        closing_paragraph: content.closingParagraph,
        sign_off: content.signOff,
      })

      // If a saved job was selected, link the cover letter to it
      if (jobApplicationId && jobApplicationId !== coverLetter.job_application_id) {
        await handleJobApplicationChange(jobApplicationId)
      }
    },
    [updateCoverLetter, coverLetter.job_application_id, handleJobApplicationChange]
  )

  const bodyParagraphs = Array.isArray(coverLetter.body_paragraphs)
    ? (coverLetter.body_paragraphs as string[])
    : []

  const renderSection = () => {
    switch (activeSection) {
      case 'resume':
        return (
          <ResumeAssociationSection
            coverLetterId={coverLetter.id}
            currentResumeId={coverLetter.resume_id}
            resumes={resumes.map((r) => ({ id: r.id, title: r.title }))}
            locale={locale}
            dict={dict}
            onResumeChange={handleResumeChange}
          />
        )
      case 'job':
        return (
          <JobAssociationSection
            currentJobApplicationId={coverLetter.job_application_id}
            currentJobApplication={currentJobApplication}
            jobApplications={jobApplications}
            locale={locale}
            dict={dict}
            onJobApplicationChange={handleJobApplicationChange}
          />
        )
      case 'recipient':
        return (
          <RecipientSection
            recipientName={coverLetter.recipient_name}
            recipientTitle={coverLetter.recipient_title}
            companyName={coverLetter.company_name}
            companyAddress={coverLetter.company_address}
            onChange={handleFieldChange}
            dict={dict}
          />
        )
      case 'opening':
        return (
          <OpeningSection
            greeting={coverLetter.greeting}
            openingParagraph={coverLetter.opening_paragraph}
            onChange={handleFieldChange}
            dict={dict}
          />
        )
      case 'body':
        return (
          <BodySection
            bodyParagraphs={bodyParagraphs}
            onChange={handleBodyParagraphsChange}
            dict={dict}
          />
        )
      case 'closing':
        return (
          <ClosingSection
            closingParagraph={coverLetter.closing_paragraph}
            onChange={(value) => handleFieldChange('closing_paragraph', value)}
            dict={dict}
          />
        )
      case 'signature':
        return (
          <SignatureSection
            signOff={coverLetter.sign_off}
            senderName={coverLetter.sender_name}
            onChange={handleFieldChange}
            dict={dict}
          />
        )
      default:
        return null
    }
  }

  // Get section labels from dict
  const getSectionLabel = (sectionId: SectionId) => {
    const sectionsDict = (editorDict.sections || {}) as Record<string, string>
    return sectionsDict[sectionId] || SECTIONS.find((s) => s.id === sectionId)?.label || sectionId
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/dashboard/cover-letters`}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <input
              type="text"
              value={coverLetter.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              className="text-xl font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0"
              placeholder={(editorDict.titlePlaceholder as string) || 'Untitled Cover Letter'}
            />
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">
                {(editorDict.unsavedChanges as string) || 'Unsaved changes'}
              </span>
            )}
            {lastSaved && !hasUnsavedChanges && (
              <span className="text-xs text-slate-500 ml-2">
                {(editorDict.lastSaved as string) || 'Saved'}{' '}
                {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* AI Generate Button */}
          <button
            onClick={() => setShowGenerationModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {(editorDict.generate as string) || 'Generate'}
          </button>
          {/* Check Button */}
          <button
            onClick={() => setShowCheckerModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            {(editorDict.check as string) || 'Check'}
          </button>
          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving
              ? ((commonDict.saving as string) || 'Saving...')
              : ((commonDict.save as string) || 'Save')}
          </button>
        </div>
      </div>

      {/* Error message */}
      {saveError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Section navigation */}
        <div className="w-48 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-y-auto">
          <nav className="p-2 space-y-1">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {getSectionLabel(section.id)}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Editor pane */}
        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-800">
          {renderSection()}
        </div>

        {/* Preview pane */}
        <div className="w-1/2 flex-shrink-0 border-l border-slate-200 dark:border-slate-700 overflow-hidden">
          <CoverLetterPreview
            coverLetter={coverLetter}
            senderName={coverLetter.sender_name || undefined}
          />
        </div>
      </div>

      {/* Modals */}
      <CoverLetterGenerationModal
        isOpen={showGenerationModal}
        onClose={() => setShowGenerationModal(false)}
        onGenerate={handleGeneratedContent}
        resumes={resumes}
        savedJobs={jobApplications.map((j) => ({
          id: j.id,
          company_name: j.company_name,
          job_title: j.job_title,
          job_description: j.job_description,
        }))}
        defaultResumeId={coverLetter.resume_id}
        defaultJobDescription={coverLetter.job_description}
        defaultJobTitle={coverLetter.job_title}
        defaultCompanyName={coverLetter.company_name}
        defaultJobApplicationId={coverLetter.job_application_id}
        dict={dict}
        locale={locale}
      />

      <CoverLetterCheckerModal
        isOpen={showCheckerModal}
        onClose={() => setShowCheckerModal(false)}
        openingParagraph={coverLetter.opening_paragraph}
        bodyParagraphs={bodyParagraphs}
        closingParagraph={coverLetter.closing_paragraph}
        jobDescription={coverLetter.job_description}
        jobTitle={coverLetter.job_title}
        companyName={coverLetter.company_name}
        onAnalysisComplete={handleAnalysisComplete}
        dict={dict}
        locale={locale}
      />
    </div>
  )
}
