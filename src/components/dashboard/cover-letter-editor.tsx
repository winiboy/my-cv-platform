'use client'

import { useState, useCallback, useEffect, useId, useMemo, useRef } from 'react'
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
  Download,
  Eye,
  Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { LANGUAGE_FLAG_OPTIONS, type FlagLanguage } from '@/components/ui/language-flags'
import { requestCoverLetterTranslation } from '@/lib/cover-letter-translate-client'
import {
  COVER_LETTER_SENDER_FIELDS,
  effectiveSenderDetails,
  normalizeAnnexes,
  validateCoverLetterSenderFields,
  type CoverLetterSenderField,
  type CoverLetterSenderFieldError,
} from '@/lib/cover-letter-sender'
import { COVER_LETTER_WORDING } from '@/lib/cover-letter-language'
import { coverLetterLanguage } from '@/lib/cover-letter-pdf-html'
import { useCoverLetterDownload } from '@/lib/hooks/use-cover-letter-download'
import type { CoverLetterExportFormat } from '@/lib/cover-letter-download-client'
import type { Locale } from '@/lib/i18n'
import type { CoverLetter, Resume, CoverLetterAnalysis } from '@/types/database'
import { CoverLetterActionsMenu, type ActionsMenuGroup } from './cover-letter-actions-menu'
import { CoverLetterPreview } from './cover-letter-preview'
import { CoverLetterPreviewDialog } from './cover-letter-preview-dialog'
import { EditorSectionTabs } from './editor-section-tabs'
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

/** Why a download button (PDF or Word) did not download, as the editor tells the user. */
interface DownloadNotice {
  format: CoverLetterExportFormat
  reason: 'save-first' | 'failed' | 'too-large'
}

/** Why a translation flag created no letter, as the editor tells the user. */
type TranslateNotice = 'save-first' | 'failed' | 'rate-limited' | 'too-large' | 'empty'

/** The notice element the flags point to; one notice is shown at a time. */
const TRANSLATE_NOTICE_ID = 'cover-letter-translate-notice'

type SectionId = 'resume' | 'job' | 'recipient' | 'opening' | 'body' | 'closing' | 'signature'

/**
 * What the editor shows below `xl` (1280px), one at a time: the section nav
 * and the form, or the letter. At `xl` and above both are shown and the
 * choice has no effect.
 */
type EditorView = 'edit' | 'preview'

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
  const router = useRouter()
  const [coverLetter, setCoverLetter] = useState(initialCoverLetter)
  const [currentJobApplication, setCurrentJobApplication] = useState<JobApplicationData | null>(initialJobApplication)
  const [activeSection, setActiveSection] = useState<SectionId>('recipient')
  const [view, setView] = useState<EditorView>('edit')
  const viewRadioName = useId()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [senderErrors, setSenderErrors] = useState<
    Partial<Record<CoverLetterSenderField, CoverLetterSenderFieldError>>
  >({})
  // The invalid field the Signature section moves focus to, once it is shown.
  const [senderFocusField, setSenderFocusField] = useState<CoverLetterSenderField | null>(null)
  const [showGenerationModal, setShowGenerationModal] = useState(false)
  const [showCheckerModal, setShowCheckerModal] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [downloadNotice, setDownloadNotice] = useState<DownloadNotice | null>(null)
  const [translatingTo, setTranslatingTo] = useState<FlagLanguage | null>(null)
  const [translateNotice, setTranslateNotice] = useState<TranslateNotice | null>(null)
  const previewButtonRef = useRef<HTMLButtonElement>(null)
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null)
  // The control that started a request (a header button, or the "•••" menu's
  // trigger below xl), set when it starts and cleared once focus is handed back.
  const restoreFocusRef = useRef<Record<CoverLetterExportFormat, HTMLElement | null>>({ pdf: null, docx: null })
  const { download: downloadPdf, isDownloading: isDownloadingPdf } = useCoverLetterDownload(
    initialCoverLetter.id,
    'pdf',
    locale
  )
  const { download: downloadWord, isDownloading: isDownloadingWord } = useCoverLetterDownload(
    initialCoverLetter.id,
    'docx',
    locale
  )

  const coverLettersDict = (dict.coverLetters || {}) as Record<string, unknown>
  const editorDict = (coverLettersDict.editor || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>
  const translateDict = (editorDict.translate || {}) as Record<string, unknown>
  const translateToDict = (translateDict.to || {}) as Partial<Record<FlagLanguage, string>>
  const translatingDict = (translateDict.translating || {}) as Partial<Record<FlagLanguage, string>>
  const viewDict = (editorDict.view || {}) as Partial<Record<'label' | EditorView, string>>
  const viewOptions = [
    { id: 'edit', label: viewDict.edit || 'Edit', icon: Pencil },
    { id: 'preview', label: viewDict.preview || 'Preview', icon: Eye },
  ] as const satisfies readonly { id: EditorView; label: string; icon: typeof Eye }[]

  // The linked CV's contact: the fallback of the sender details the letter
  // has never set (`effectiveSenderDetails`). What the fields show is what
  // Save stores, so a CV value is stored by the next save, without the
  // letter counting as changed until then.
  const linkedContact = useMemo(
    () => resumes.find((r) => r.id === coverLetter.resume_id)?.contact ?? null,
    [resumes, coverLetter.resume_id]
  )
  const senderDetails = useMemo(
    () => effectiveSenderDetails(coverLetter, linkedContact),
    [coverLetter, linkedContact]
  )

  // What an empty greeting or sign-off prints: the default of the letter's
  // language, as the preview and the exports detect it (`swissLetterParts`).
  const { opening_paragraph, body_paragraphs, closing_paragraph } = coverLetter
  const letterWording = useMemo(
    () => COVER_LETTER_WORDING[coverLetterLanguage({ opening_paragraph, body_paragraphs, closing_paragraph }, locale)],
    [opening_paragraph, body_paragraphs, closing_paragraph, locale]
  )

  const handleSave = async () => {
    // The editor writes to the table directly, not through the API, so it
    // refuses here what the API's schema would refuse
    // (`coverLetterSenderFieldsShape`), before anything is written.
    const senderValues = { ...senderDetails, annexes: normalizeAnnexes(coverLetter.annexes) }
    const errors = validateCoverLetterSenderFields(senderValues)
    const firstInvalid = COVER_LETTER_SENDER_FIELDS.find((field) => errors[field])
    setSenderErrors(errors)
    if (firstInvalid) {
      setActiveSection('signature')
      setView('edit')
      setSenderFocusField(firstInvalid)
      return
    }

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
          ...senderValues,
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
        // The letter now holds what was stored: a CV value saved in a field
        // never set is the letter's own from here on. A field edited while
        // the save ran keeps its edit.
        setCoverLetter((prev) => {
          const stored = { ...prev }
          for (const field of COVER_LETTER_SENDER_FIELDS) {
            const unchanged = field === 'annexes' ? prev.annexes === coverLetter.annexes : prev[field] === null
            if (unchanged) stored[field] = senderValues[field]
          }
          return stored
        })
        // Saving is the only way unsaved changes end, and it answers every
        // notice: the letter is saved, and a new click is a new attempt.
        setDownloadNotice(null)
        setTranslateNotice(null)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      setSaveError((editorDict.saveFailed as string) || 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * The server exports the SAVED letter. With unsaved edits that would not be
   * the letter on screen, so the user is asked to save first; saving on their
   * behalf would commit edits they have not chosen to keep.
   */
  const handleDownload = async (format: CoverLetterExportFormat, origin: HTMLElement | null) => {
    // One notice at a time.
    setTranslateNotice(null)
    // No request and no busy state here, so the button keeps its focus.
    if (hasUnsavedChanges) {
      setDownloadNotice({ format, reason: 'save-first' })
      return
    }
    setDownloadNotice(null)
    restoreFocusRef.current[format] = origin
    const result = await (format === 'pdf' ? downloadPdf : downloadWord)()
    if (result === 'failed' || result === 'too-large') setDownloadNotice({ format, reason: result })
  }

  /**
   * Translates the SAVED letter into a new copy and opens it, by the same
   * save-first rule as the downloads: the server translates what is stored,
   * so with unsaved edits the copy would not be the letter on screen.
   *
   * The flags are `aria-disabled`, not `disabled`, while a translation runs,
   * so the clicked flag keeps keyboard focus; a second click is ignored here.
   * On success the busy state stays until the new letter's page replaces
   * this one.
   */
  const handleTranslate = async (targetLanguage: FlagLanguage) => {
    if (translatingTo !== null) return
    setDownloadNotice(null)
    if (hasUnsavedChanges) {
      setTranslateNotice('save-first')
      return
    }
    setTranslateNotice(null)
    setTranslatingTo(targetLanguage)
    const result = await requestCoverLetterTranslation(coverLetter.id, targetLanguage)
    if (result.kind === 'created') {
      router.push(`/${locale}/dashboard/cover-letters/${result.coverLetterId}/edit`)
      return
    }
    setTranslatingTo(null)
    setTranslateNotice(result.kind)
  }

  const isTranslateFailure = translateNotice === 'failed' || translateNotice === 'rate-limited'

  const translateNoticeMessage = (() => {
    switch (translateNotice) {
      case 'save-first':
        return (
          (translateDict.saveFirst as string) ||
          'Save your changes first: the translation is made from the saved letter.'
        )
      case 'rate-limited':
        return (
          (translateDict.rateLimited as string) ||
          'Too many AI requests in a short time. No new letter was created. Try again in a few minutes.'
        )
      case 'too-large':
        return (
          (translateDict.tooLarge as string) ||
          'This letter is too long to translate. Shorten its paragraphs and try again.'
        )
      case 'empty':
        return (
          (translateDict.empty as string) ||
          'This letter has no text to translate yet. Write it, save it, and try again.'
        )
      case 'failed':
        return (
          (translateDict.failed as string) ||
          'The letter could not be translated. No new letter was created. Please try again.'
        )
      default:
        return ''
    }
  })()

  // A button is disabled while its request runs, and a disabled button drops
  // focus to <body>: a keyboard user would be left nowhere, unable to retry
  // with Enter. Once it is usable again, focus returns to it, but only if
  // focus is still lost, never taken from where the user moved it since. The
  // notice keeps `role="alert"`, so the outcome is still announced.
  // The "•••" trigger is never disabled and keeps focus itself; it is handed
  // focus back only the same way, if focus was lost meanwhile.
  const restoreFocus = useCallback((format: CoverLetterExportFormat) => {
    const origin = restoreFocusRef.current[format]
    if (!origin) return
    restoreFocusRef.current[format] = null
    const focusWasLost = document.activeElement === null || document.activeElement === document.body
    if (focusWasLost) origin.focus()
  }, [])

  useEffect(() => {
    if (!isDownloadingPdf) restoreFocus('pdf')
  }, [isDownloadingPdf, restoreFocus])

  useEffect(() => {
    if (!isDownloadingWord) restoreFocus('docx')
  }, [isDownloadingWord, restoreFocus])

  const downloadNoticeMessage = (() => {
    if (!downloadNotice) return ''
    const { format, reason } = downloadNotice
    if (reason === 'too-large') {
      // The size guard is the same for both formats, and so is its message.
      return (
        (coverLettersDict.downloadPDFTooLarge as string) ||
        'This letter is too long to export. Shorten its paragraphs and try again.'
      )
    }
    if (format === 'pdf') {
      return reason === 'failed'
        ? (coverLettersDict.downloadPDFError as string) || 'The PDF could not be created. Please try again.'
        : (editorDict.saveBeforeDownload as string) || 'Save your changes first: the PDF is made from the saved letter.'
    }
    return reason === 'failed'
      ? (coverLettersDict.downloadWordError as string) || 'The Word file could not be created. Please try again.'
      : (editorDict.saveBeforeDownloadWord as string) ||
          'Save your changes first: the Word file is made from the saved letter.'
  })()
  // One notice at a time, named after the button it answers.
  const downloadNoticeId = downloadNotice ? `cover-letter-${downloadNotice.format}-notice` : undefined

  // The header's controls and their "•••" menu items below xl say the same.
  const pdfLabel = isDownloadingPdf
    ? (editorDict.downloadingPdf as string) || 'Creating PDF...'
    : (coverLettersDict.downloadPDF as string) || 'Download PDF'
  const wordLabel = isDownloadingWord
    ? (editorDict.downloadingWord as string) || 'Creating Word file...'
    : (coverLettersDict.downloadWord as string) || 'Download Word'
  const translateLabel = (code: FlagLanguage) =>
    translatingTo === code
      ? translatingDict[code] || `Translating into ${code.toUpperCase()}...`
      : translateToDict[code] || `Translate into ${code.toUpperCase()}`
  const translateStatus = translatingTo ? translateLabel(translatingTo) : ''
  // Below xl a request started from the "•••" menu has no button of its own
  // left on screen to carry its busy label, so the label is announced.
  const compactBusyStatus =
    translateStatus || (isDownloadingPdf ? pdfLabel : isDownloadingWord ? wordLabel : '')
  const saveDisabled = isSaving || !hasUnsavedChanges
  const generateLabel = (editorDict.generate as string) || 'Generate'
  const checkLabel = (editorDict.check as string) || 'Check'
  const saveContent = (
    <>
      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {isSaving ? (commonDict.saving as string) || 'Saving...' : (commonDict.save as string) || 'Save'}
    </>
  )

  /**
   * Below xl the header's secondary actions, through the very handlers of the
   * header buttons they replace there. A request started here hands focus
   * back to the menu's trigger, which stays on screen, never to a hidden button.
   */
  const actionsMenuGroups: ActionsMenuGroup[] = [
    {
      id: 'actions',
      items: [
        {
          id: 'generate',
          label: generateLabel,
          icon: <Sparkles className="h-4 w-4" />,
          onSelect: () => setShowGenerationModal(true),
        },
        {
          id: 'check',
          label: checkLabel,
          icon: <CheckCircle className="h-4 w-4" />,
          onSelect: () => setShowCheckerModal(true),
        },
        {
          id: 'pdf',
          label: pdfLabel,
          icon: isDownloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />,
          onSelect: () => handleDownload('pdf', actionsMenuButtonRef.current),
          busy: isDownloadingPdf,
          describedBy: downloadNotice?.format === 'pdf' ? downloadNoticeId : undefined,
        },
        {
          id: 'docx',
          label: wordLabel,
          icon: isDownloadingWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />,
          onSelect: () => handleDownload('docx', actionsMenuButtonRef.current),
          busy: isDownloadingWord,
          describedBy: downloadNotice?.format === 'docx' ? downloadNoticeId : undefined,
        },
      ],
    },
    {
      id: 'translate',
      label: (translateDict.label as string) || 'Translate',
      items: LANGUAGE_FLAG_OPTIONS.map(({ code, Flag }) => ({
        id: `translate-${code}`,
        label: translateLabel(code),
        icon: (
          <>
            <Flag />
            {translatingTo === code && <Loader2 className="h-3 w-3 animate-spin" />}
          </>
        ),
        onSelect: () => handleTranslate(code),
        busy: translatingTo === code,
        unavailable: translatingTo !== null,
        describedBy: translateNotice ? TRANSLATE_NOTICE_ID : undefined,
      })),
    },
  ]
  const isActionRunning = isDownloadingPdf || isDownloadingWord || translatingTo !== null

  // Below xl the page scrolls, so a notice can appear above the fold, out of
  // sight of the bottom bar's Save; it is scrolled into view as it appears.
  // Each notice is keyed by what it says, so a different notice in the same
  // place is a new element and is revealed again. At xl it is always in
  // view, and `nearest` leaves the page where it is.
  const revealNotice = useCallback((notice: HTMLDivElement | null) => {
    notice?.scrollIntoView({ block: 'nearest' })
  }, [])

  const closePreviewDialog = useCallback(() => setShowPreviewDialog(false), [])

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

  const handleSenderFieldChange = useCallback(
    (field: string, value: string | null) => {
      setSenderErrors((prev) => {
        if (!(field in prev)) return prev
        const rest = { ...prev }
        delete rest[field as CoverLetterSenderField]
        return rest
      })
      handleFieldChange(field, value)
    },
    [handleFieldChange]
  )

  const clearSenderFocusField = useCallback(() => setSenderFocusField(null), [])

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
   * and persists to database. Also propagates resume_id to the linked
   * job application for tri-directional sync. Reverts on error.
   */
  const handleResumeChange = useCallback(
    async (resumeId: string | null) => {
      const previousResumeId = coverLetter.resume_id

      // Update local state immediately for responsive UI
      setCoverLetter((prev) => ({ ...prev, resume_id: resumeId }))

      try {
        const supabase = createClient()

        // Step 1: Update the cover letter's resume_id
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
          return
        }

        // Step 2: Tri-directional sync - if cover letter is linked to a job application,
        // propagate the resume_id change to the job application
        if (coverLetter.job_application_id) {
          const { error: jobUpdateError } = await supabase
            .from('job_applications')
            .update({ resume_id: resumeId })
            .eq('id', coverLetter.job_application_id)

          if (jobUpdateError) {
            // Log but don't revert - the primary operation succeeded
            // The job application update is a secondary sync operation
            console.error('Error syncing resume_id to job application:', jobUpdateError)
          }
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
    [coverLetter.id, coverLetter.resume_id, coverLetter.job_application_id, editorDict]
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

        // Step 3: Set the new job's cover_letter_id and resume_id if linking to a job
        if (jobApplicationId) {
          // Build update payload: always set cover_letter_id, and propagate resume_id if present
          const jobUpdatePayload: { cover_letter_id: string; resume_id?: string | null } = {
            cover_letter_id: coverLetter.id,
          }
          // Tri-directional sync: propagate the cover letter's resume_id to the job application
          if (coverLetter.resume_id !== undefined) {
            jobUpdatePayload.resume_id = coverLetter.resume_id
          }

          const { error: setNewError } = await supabase
            .from('job_applications')
            .update(jobUpdatePayload)
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
    [coverLetter.id, coverLetter.job_application_id, coverLetter.resume_id, currentJobApplication, jobApplications, dict]
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
            defaultGreeting={letterWording.defaultGreeting}
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
            defaultSignOff={letterWording.defaultSignOff}
            senderName={coverLetter.sender_name}
            streetExample={letterWording.streetExample}
            postalLocalityExample={letterWording.postalLocalityExample}
            senderDetails={senderDetails}
            annexes={coverLetter.annexes}
            errors={senderErrors}
            focusField={senderFocusField}
            onFocusHandled={clearSenderFocusField}
            onChange={handleSenderFieldChange}
            dict={dict}
          />
        )
      default:
        return null
    }
  }

  const sectionsDict = (editorDict.sections || {}) as Partial<Record<SectionId, string>>
  const sectionTabs = SECTIONS.map((section) => ({
    id: section.id,
    label: sectionsDict[section.id] || section.label,
    icon: section.icon,
  }))

  return (
    // The dashboard's <main> already spans the viewport below the header; it
    // is filled rather than sized to the viewport again, which overflowed its
    // padding and put the editor's bottom edge, and the preview pane's zoom
    // controls with it, below the fold.
    // Below xl it grows past that height instead: in the Édition view the
    // header, nav and form scroll together in <main>, as the resume editor
    // does below xl, since a phone leaves too little height under the header
    // for a form with a scroller of its own. The Aperçu view adds no height,
    // so the letter fills what is left and scrolls in its own area.
    <div className="min-h-full xl:h-full flex flex-col">
      {/* Header */}
      {/*
        At xl, one row while the title area's 13.5rem and the buttons fit
        beside each other; the title then takes the rest. Narrower, the
        buttons move to lines of their own, right-aligned, so they never
        cover the title and every label stays visible.
        Below xl, always one row: Back, the title and its save status, and the
        "•••" menu, which holds the buttons but Save (in the bottom bar) and
        Preview (the Aperçu view replaces it).
      */}
      <div
        data-testid="cover-letter-editor-header"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 max-xl:flex-nowrap max-xl:gap-x-2 max-xl:px-2 max-xl:py-2"
      >
        {/*
          The explicit min width sets the size the row wraps at: left to its
          default, it would be the title input's own width, wider than 13.5rem.
          Below xl the row never wraps, so the group shrinks to what is left.
        */}
        <div className="flex min-w-[13.5rem] grow basis-[13.5rem] items-center gap-4 max-xl:min-w-0 max-xl:gap-2">
          <Link
            href={`/${locale}/dashboard/cover-letters`}
            aria-label={(commonDict.back as string) || 'Back'}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors max-xl:flex max-xl:size-11 max-xl:shrink-0 max-xl:items-center max-xl:justify-center max-xl:p-0"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          {/*
            Below xl the save status follows the title on its line while both
            fit, and moves under it otherwise: the title keeps at least 6rem,
            within the 44px row. Where even its own line is too narrow (the
            longest locales at 320px) it ends in an ellipsis rather than run
            under the menu; its full text is still what is announced.
          */}
          <div className="min-w-40 flex-1 max-xl:flex max-xl:min-w-0 max-xl:flex-wrap max-xl:items-center max-xl:gap-x-2">
            <input
              type="text"
              value={coverLetter.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              className="max-w-full text-xl font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0 max-xl:min-w-24 max-xl:flex-1 max-xl:basis-24"
              placeholder={(editorDict.titlePlaceholder as string) || 'Untitled Cover Letter'}
            />
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400 ml-2 whitespace-nowrap max-xl:ml-0 max-xl:max-w-full max-xl:truncate">
                {(editorDict.unsavedChanges as string) || 'Unsaved changes'}
              </span>
            )}
            {lastSaved && !hasUnsavedChanges && (
              <span className="text-xs text-slate-500 ml-2 whitespace-nowrap max-xl:ml-0 max-xl:max-w-full max-xl:truncate">
                {(editorDict.lastSaved as string) || 'Saved'}{' '}
                {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <CoverLetterActionsMenu
          label={(commonDict.moreActions as string) || 'More actions'}
          groups={actionsMenuGroups}
          triggerRef={actionsMenuButtonRef}
          busy={isActionRunning}
          className="shrink-0 xl:hidden"
        />
        {/*
          Below xl the translate row is hidden with its status, so the busy
          state of a translation or a download is announced from here instead.
        */}
        <span role="status" className="sr-only xl:hidden">
          {compactBusyStatus}
        </span>
        <div className="ml-auto hidden min-w-0 flex-wrap items-center justify-end gap-2 xl:flex">
          {/* AI Generate Button */}
          <button
            onClick={() => setShowGenerationModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {generateLabel}
          </button>
          {/* Check Button */}
          <button
            onClick={() => setShowCheckerModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            {checkLabel}
          </button>
          {/* Preview: the letter on screen, unsaved edits included, in a full-screen window */}
          <button
            ref={previewButtonRef}
            type="button"
            onClick={() => setShowPreviewDialog(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Eye className="h-4 w-4" />
            {(editorDict.preview as string) || 'Preview'}
          </button>
          {/* PDF download: the saved letter, generated by the server */}
          <button
            type="button"
            onClick={(event) => handleDownload('pdf', event.currentTarget)}
            disabled={isDownloadingPdf}
            aria-busy={isDownloadingPdf}
            aria-label={pdfLabel}
            aria-describedby={downloadNotice?.format === 'pdf' ? downloadNoticeId : undefined}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-80"
          >
            {isDownloadingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {(editorDict.downloadPdf as string) || 'PDF'}
          </button>
          {/* Word download: the saved letter, generated by the server */}
          <button
            type="button"
            onClick={(event) => handleDownload('docx', event.currentTarget)}
            disabled={isDownloadingWord}
            aria-busy={isDownloadingWord}
            aria-label={wordLabel}
            aria-describedby={downloadNotice?.format === 'docx' ? downloadNoticeId : undefined}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-80"
          >
            {isDownloadingWord ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {(editorDict.downloadWord as string) || 'Word'}
          </button>
          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saveDisabled}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveContent}
          </button>
        </div>
      </div>

      {/* Error message */}
      {saveError && (
        <div
          key={saveError}
          ref={revealNotice}
          className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800"
        >
          <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
        </div>
      )}

      {/* Translation: a translated copy of the saved letter, opened once created */}
      {/* Below xl the four targets are in the "•••" menu instead. */}
      <div className="hidden items-center justify-end gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 xl:flex">
        {/*
          Before the flags, so busy text grows to the left and the flags never
          move. Always in the DOM, so it is announced when it fills. Below sm
          it is visually hidden: beside 44 px flags it would not fit, and the
          spinner in the tapped flag shows the busy state there.
        */}
        <span role="status" className="sr-only sm:not-sr-only text-sm text-slate-600 dark:text-slate-300">
          {translateStatus}
        </span>
        {/* Label and flags stay together; on a screen too narrow for one line, the label sits above the flags. */}
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <span id="cover-letter-translate-label" className="text-sm text-slate-600 dark:text-slate-300">
            {(translateDict.label as string) || 'Translate'}
          </span>
          <div role="group" aria-labelledby="cover-letter-translate-label" className="flex items-center gap-2 sm:gap-1">
            {LANGUAGE_FLAG_OPTIONS.map(({ code, Flag }) => {
              const isBusy = translatingTo === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleTranslate(code)}
                  aria-disabled={translatingTo !== null}
                  aria-busy={isBusy}
                  aria-label={translateLabel(code)}
                  aria-describedby={translateNotice ? TRANSLATE_NOTICE_ID : undefined}
                  className={cn(
                    // 44 px touch targets on phones: a mis-tap creates a letter and leaves the page.
                    'flex items-center justify-center gap-1 px-2 py-1.5 rounded-full transition-colors min-h-11 min-w-11 sm:min-h-0 sm:min-w-0',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1',
                    'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600',
                    'aria-disabled:cursor-wait aria-disabled:opacity-80'
                  )}
                >
                  <Flag />
                  {isBusy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Translation notice: red for a failure, amber for what the user can fix, as the download notice */}
      {translateNotice && (
        <div
          key={translateNotice}
          ref={revealNotice}
          className={
            isTranslateFailure
              ? 'px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800'
              : 'px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800'
          }
        >
          <p
            id={TRANSLATE_NOTICE_ID}
            role="alert"
            className={isTranslateFailure ? 'text-sm text-red-700 dark:text-red-400' : 'text-sm text-amber-700 dark:text-amber-400'}
          >
            {translateNoticeMessage}
          </p>
        </div>
      )}

      {/* PDF or Word download notice */}
      {downloadNotice && (
        <div
          key={`${downloadNotice.format}-${downloadNotice.reason}`}
          ref={revealNotice}
          className={
            downloadNotice.reason === 'failed'
              ? 'px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800'
              : 'px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800'
          }
        >
          <p
            id={downloadNoticeId}
            role="alert"
            className={
              downloadNotice.reason === 'failed'
                ? 'text-sm text-red-700 dark:text-red-400'
                : 'text-sm text-amber-700 dark:text-amber-400'
            }
          >
            {downloadNoticeMessage}
          </p>
        </div>
      )}

      {/*
        Below xl, the Édition / Aperçu toggle: native radios, so the group
        keeps the platform's single-choice semantics and arrow-key behaviour.
        Each radio covers its whole option, so a tap anywhere on it selects.
      */}
      <div
        role="radiogroup"
        aria-label={viewDict.label || 'Editor view'}
        className="xl:hidden px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
      >
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
          {viewOptions.map(({ id, label, icon: Icon }) => {
            const isSelected = view === id
            return (
              <label
                key={id}
                className={cn(
                  'relative flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                  'has-focus-visible:ring-2 has-focus-visible:ring-teal-500',
                  // Forced colors drop box shadows and backgrounds, so the ring
                  // and the selected look would vanish: focus becomes an
                  // outline, and the selection a border every option reserves,
                  // in the background colour when unselected, so none moves.
                  'forced-colors:border-2 forced-colors:has-focus-visible:outline-2 forced-colors:has-focus-visible:outline-offset-2 forced-colors:has-focus-visible:outline-[color:Highlight]',
                  isSelected
                    ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-800 dark:text-teal-400 forced-colors:border-[color:Highlight]'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white forced-colors:border-[color:Canvas]'
                )}
              >
                <input
                  type="radio"
                  name={viewRadioName}
                  value={id}
                  checked={isSelected}
                  onChange={() => setView(id)}
                  className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-md opacity-0"
                />
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </label>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      {/*
        Three columns at xl. Below it, one view at a time, at full width: the
        other is hidden with CSS rather than unmounted, so the form keeps its
        section and the rich-text editors' own state (their content, font
        and size choices). Its scroll position is not kept: below xl the page
        scrolls in <main>, and Aperçu, which adds no height, leaves <main> at
        the top, where Édition then starts again.
      */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
        {/*
          Left sidebar - Section navigation: the resume editor's tab strip
          below xl, above the form, and the 192px column from xl up. The xl
          classes restore this editor's own column look: its gap, weight and
          colours differ from the resume editor's list.
        */}
        <div
          className={cn(
            'flex-shrink-0 border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-y-auto xl:block xl:w-48',
            view === 'preview' && 'hidden'
          )}
        >
          <EditorSectionTabs
            tabs={sectionTabs}
            activeId={activeSection}
            onSelect={setActiveSection}
            xlPadding="xl:p-2"
            tabClassName="xl:gap-2 xl:font-normal"
            activeTabClassName="xl:text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
            inactiveTabClassName="xl:hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          />
        </div>

        {/* Editor pane */}
        {/*
          Below xl the bottom bar overlays the form as it scrolls: a control
          scrolled to, or focused, stops above the bar rather than under it.
        */}
        <div
          className={cn(
            'flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-800 xl:block',
            'max-xl:[&_:is(input,textarea,select,button,a,[contenteditable])]:scroll-mb-[calc(4rem+env(safe-area-inset-bottom))]',
            view === 'preview' && 'hidden'
          )}
        >
          {renderSection()}
        </div>

        {/* Preview pane */}
        <div
          data-testid="cover-letter-preview-pane"
          className={cn(
            'flex-col border-slate-200 dark:border-slate-700 overflow-hidden xl:flex xl:flex-none xl:w-1/2 xl:border-l',
            view === 'preview' ? 'flex flex-1' : 'hidden'
          )}
        >
          {/*
            Keyed by the view: below xl the hidden pane measured an empty
            area, so the preview is mounted afresh when Aperçu opens and its
            layout effect fits the page to the width before the first paint.
            At xl the toggle is hidden, the view never changes, and the
            preview is never remounted.
          */}
          <CoverLetterPreview
            key={view}
            coverLetter={coverLetter}
            senderDetails={senderDetails}
            locale={locale}
            editorDict={editorDict}
            variant="pane"
          />
        </div>
      </div>

      {/*
        Below xl, Save in a bar at the bottom, within thumb reach. Sticky in
        <main>, which scrolls the Édition view: it stays at the bottom of the
        screen while the form scrolls under it, and rests below the form's
        end, so the last field can always be scrolled above it. In Aperçu
        nothing scrolls past it, and the letter's own area ends above it.
        Sticking stops at <main>'s padding, so below lg the bar is pulled
        through <main>'s bottom padding (p-4, sm:p-6 in the dashboard layout)
        by the same amount, as an offset while stuck and as a margin at rest,
        to sit on the screen's edge with nothing painted under it.
        From lg it is not: the dashboard layout sizes its content area as
        `h-[calc(100vh-64px)]`, but from lg the site header is taller than
        64px, so <main> ends 17px below the viewport. A bar pulled to
        <main>'s edge would be cut by that much; resting on the padding, it
        stays whole, 7px above the screen's edge. (Below lg the header is
        65px, so <main> ends 1px below it.) The defect is the shell's.
        The form scrolls through <main>'s padding too, so from lg the bar's
        background is extended through that padding (sm:p-6, 1.5rem): the
        strip under the bar shows the bar, never the form scrolling under it.
      */}
      <div className="sticky bottom-0 z-10 flex justify-end border-t border-slate-200 bg-white px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] max-lg:-bottom-4 max-lg:-mb-4 sm:max-lg:-bottom-6 sm:max-lg:-mb-6 lg:after:absolute lg:after:inset-x-0 lg:after:top-full lg:after:h-6 lg:after:bg-white xl:hidden dark:border-slate-700 dark:bg-slate-800 dark:lg:after:bg-slate-800">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveDisabled}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
        >
          {saveContent}
        </button>
      </div>

      {/* Modals */}
      {showPreviewDialog && (
        <CoverLetterPreviewDialog
          coverLetter={coverLetter}
          senderDetails={senderDetails}
          locale={locale}
          editorDict={editorDict}
          onClose={closePreviewDialog}
          returnFocusRef={previewButtonRef}
        />
      )}

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
        coverLetterId={coverLetter.id}
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
