'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { X, Loader2, AlertCircle, FileText } from 'lucide-react'
import type { JobApplicationWithRelations } from '@/types/database'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { KanbanLinkedResume } from './kanban-resume-link'

interface ResumeOption {
  id: string
  title: string
  updated_at: string
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; resumes: ResumeOption[] }

interface LinkResumeDialogProps {
  /** The card the dialog links a CV to. */
  jobApplication: JobApplicationWithRelations
  locale: string
  /** Translation dictionary (the `common` namespace) */
  dict: Record<string, unknown>
  /** Called with the dialog's card, so the caller can ignore a dialog it no longer shows. */
  onClose: (applicationId: string) => void
  /** Called with the CV the server linked; the dialog is then closed by the caller. */
  onLinked: (applicationId: string, resume: KanbanLinkedResume) => void
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The elements Tab reaches inside `root`, in order. A radio group is one tab
 * stop: its checked radio, or its first one while none is checked.
 */
function tabStops(root: HTMLElement): HTMLElement[] {
  const checkedRadio = root.querySelector<HTMLInputElement>('input[type="radio"]:checked')
  const firstRadio = root.querySelector<HTMLInputElement>('input[type="radio"]')
  const radioStop = checkedRadio ?? firstRadio
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    if (element.matches(':disabled')) return false
    if (element instanceof HTMLInputElement && element.type === 'radio') return element === radioStop
    return true
  })
}

/** Fills `{name}` placeholders in one pass, so user text is inserted literally. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match)
}

/**
 * "Lier un CV existant" on a Kanban card (job-cv-linking US-002): lists the
 * user's CVs, most recently updated first, the card's current CV marked, and
 * links the one picked through `POST /api/job-applications/[id]/link-resume`.
 *
 * The board renders it while open, outside the cards, as it does
 * `QuickAddModal`, whose dialog conventions it follows (Escape, outside click,
 * Tab kept inside): the project has no dialog primitive, and a card is a
 * draggable, clickable, transformed element that must not contain one. The
 * board keys it on the card, so each opening starts fresh, and returns focus
 * to the card's menu button on close.
 *
 * Nothing changes on the board until the server has answered with the
 * linked CV: a failure leaves the dialog open with its error. While a link
 * request is in flight the dialog cannot be closed by any means (Escape, the
 * close button, an outside click, Cancel), so its answer always lands in the
 * dialog that sent it.
 */
export function LinkResumeDialog({ jobApplication, locale, dict, onClose, onLinked }: LinkResumeDialogProps) {
  const applicationId = jobApplication.id
  const currentResumeId = jobApplication.resume?.id ?? jobApplication.resume_id ?? null

  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const radioName = useId()

  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(currentResumeId)
  const [isLinking, setIsLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const cardDict = (kanbanDict.card || {}) as Record<string, string>
  const linkDict = (kanbanDict.linkResume || {}) as Record<string, string>
  const commonDict = (dict.common || {}) as Record<string, string>

  // Load the CVs on each opening, so a CV created in another tab is listed; a
  // late answer for a closed dialog is dropped.
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/resumes', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = (await response.json()) as { resumes?: ResumeOption[] }
        setList({ kind: 'ready', resumes: body.resumes ?? [] })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error('[LinkResumeDialog] Error loading resumes:', error instanceof Error ? error.message : 'unknown')
        setList({ kind: 'error' })
      })

    return () => controller.abort()
  }, [])

  // Focus the picked CV once the list is shown, the close button before.
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const radio =
      modal.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
      modal.querySelector<HTMLInputElement>('input[type="radio"]')
    ;(radio ?? closeButtonRef.current)?.focus()
  }, [list.kind])

  // The confirm button is disabled while linking, which drops focus to the
  // body; the error that ends a failed link takes it, so it is read out and
  // the next Tab starts from inside the dialog.
  useEffect(() => {
    if (linkError) errorRef.current?.focus()
  }, [linkError])

  // Escape closes, except while linking; Tab stays inside the dialog. Read on
  // each key press, as the dialog's controls change with its state.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!isLinking) onClose(applicationId)
        return
      }
      if (event.key !== 'Tab') return
      const modal = modalRef.current
      if (!modal) return
      const focusable = tabStops(modal)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      // Focus on none of the controls (the body after a control was disabled,
      // or the error box): Tab enters at the first, Shift+Tab at the last.
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, applicationId, isLinking])

  // An outside click closes, as for the quick-add modal, except while linking.
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (isLinking) return
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) onClose(applicationId)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose, applicationId, isLinking])

  const close = () => {
    if (!isLinking) onClose(applicationId)
  }

  const linkErrorMessage = linkDict.linkError || 'The CV could not be linked. Please try again.'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (selectedId === null || selectedId === currentResumeId) return
    setIsLinking(true)
    setLinkError(null)
    try {
      const response = await fetch(`/api/job-applications/${applicationId}/link-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId: selectedId }),
      })
      const body = (await response.json().catch(() => ({}))) as { resume?: KanbanLinkedResume }
      if (!response.ok || !body.resume) {
        setLinkError(linkErrorMessage)
        setIsLinking(false)
        return
      }
      onLinked(applicationId, body.resume)
    } catch {
      setLinkError(linkErrorMessage)
      setIsLinking(false)
    }
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))

  const description = fill(linkDict.description || 'Choose the CV you sent for {title} at {company}.', {
    title: jobApplication.job_title,
    company: jobApplication.company_name,
  })

  const canSubmit =
    list.kind === 'ready' && list.resumes.length > 0 && selectedId !== null && selectedId !== currentResumeId && !isLinking

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      <div
        ref={modalRef}
        className={cn(
          'relative w-full min-w-0 max-w-md mx-4 max-h-[85vh] flex flex-col',
          'bg-white dark:bg-slate-800',
          'rounded-lg shadow-xl',
          'animate-in fade-in-0 zoom-in-95 duration-200'
        )}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {linkDict.title || 'Link an existing CV'}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            disabled={isLinking}
            className={cn(
              'p-2 -mr-2 rounded-lg',
              'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'focus:outline-none focus:ring-2 focus:ring-teal-500',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label={commonDict.cancel || 'Close'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            <p id={descriptionId} className="text-sm text-slate-600 dark:text-slate-400 break-words">
              {description}
            </p>

            {linkError && (
              <div
                ref={errorRef}
                tabIndex={-1}
                className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                role="alert"
              >
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{linkError}</p>
              </div>
            )}

            {list.kind === 'loading' && (
              <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400" role="status">
                <Loader2 className="h-4 w-4 animate-spin" />
                {linkDict.loading || 'Loading your CVs...'}
              </p>
            )}

            {list.kind === 'error' && (
              <p className="text-sm text-red-700 dark:text-red-300" role="alert">
                {linkDict.loadError || 'Your CVs could not be loaded. Please try again.'}
              </p>
            )}

            {list.kind === 'ready' && list.resumes.length === 0 && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {linkDict.empty || "You don't have any CV yet."}
                </p>
                <Link
                  href={`/${locale}/dashboard/resumes/new?jobApplicationId=${jobApplication.id}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded"
                >
                  <FileText className="h-4 w-4" />
                  {cardDict.createCV || 'Create CV for this Job'}
                </Link>
              </div>
            )}

            {list.kind === 'ready' && list.resumes.length > 0 && (
              <fieldset>
                <legend className="sr-only">{linkDict.listLabel || 'Your CVs'}</legend>
                <div className="space-y-2">
                  {list.resumes.map((resume) => {
                    const isCurrent = resume.id === currentResumeId
                    const isSelected = resume.id === selectedId
                    return (
                      <label
                        key={resume.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer',
                          'focus-within:ring-2 focus-within:ring-teal-500',
                          isSelected
                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        )}
                      >
                        <input
                          type="radio"
                          name={radioName}
                          value={resume.id}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedId(resume.id)
                            setLinkError(null)
                          }}
                          disabled={isLinking}
                          className="mt-1 accent-teal-600"
                        />
                        <span className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                            {resume.title}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {fill(linkDict.updated || 'Updated {date}', { date: formatDate(resume.updated_at) })}
                          </span>
                          {isCurrent && (
                            <span className="mt-1 self-start text-xs font-medium px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">
                              {linkDict.current || 'Currently linked'}
                            </span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-lg">
            <Button type="button" variant="outline" onClick={close} disabled={isLinking}>
              {commonDict.cancel || 'Cancel'}
            </Button>
            {list.kind === 'ready' && list.resumes.length > 0 && (
              <Button type="submit" disabled={!canSubmit}>
                {isLinking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {linkDict.linking || 'Linking...'}
                  </>
                ) : (
                  linkDict.confirm || 'Link CV'
                )}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
