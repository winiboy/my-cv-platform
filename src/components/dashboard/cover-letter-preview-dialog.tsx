'use client'

import { useEffect, useId, useRef, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n'
import type { CoverLetter } from '@/types/database'
import type { CoverLetterSenderDetails } from '@/lib/cover-letter-sender'
import { CoverLetterPreview } from './cover-letter-preview'

const TABBABLE_CANDIDATES = 'a[href], button, input, select, textarea, [tabindex]'

/**
 * The elements Tab can reach inside `root`, in DOM order. Read on every Tab
 * press: the letter's own text may hold links, and it changes with the letter.
 */
function tabbableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE_CANDIDATES)).filter(
    (element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0
  )
}

interface CoverLetterPreviewDialogProps {
  /** The editor's in-memory letter, unsaved edits included: the same object its preview pane shows. */
  coverLetter: CoverLetter
  /** The sender details as printed, as the editor's pane shows them. */
  senderDetails: CoverLetterSenderDetails
  locale: Locale
  /** The `coverLetters.editor` dictionary. */
  editorDict: Record<string, unknown>
  onClose: () => void
  /** Where focus goes when the dialog closes: the button that opened it. */
  returnFocusRef: RefObject<HTMLElement | null>
}

/**
 * The letter in a full-screen window (cover-letter-preview-and-card-language,
 * US-001). It renders the letter through the same `CoverLetterPreview` as the
 * editor's pane, from the same in-memory letter, so it shows what the user is
 * editing, saved or not; opening it saves nothing.
 *
 * The caller renders it only while open. It follows the project's hand-rolled
 * dialog conventions (`CVAdaptationModal`, `LinkResumeDialog`): Escape closes,
 * Tab stays inside, and focus returns to the opener on close. Focus starts on
 * the letter's scroll area, so the arrow and page keys scroll it at once.
 * The window opens at "show all", with its own zoom, apart from the pane's.
 */
export function CoverLetterPreviewDialog({
  coverLetter,
  senderDetails,
  locale,
  editorDict,
  onClose,
  returnFocusRef,
}: CoverLetterPreviewDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Focus the scroll area on open, and hand focus back on close. This is the
  // cleanup rather than part of `onClose`, as the dialog closes both from its
  // button and from Escape and renders nothing once closed.
  useEffect(() => {
    const target = returnFocusRef.current
    scrollAreaRef.current?.focus()
    return () => {
      if (target?.isConnected) target.focus()
    }
  }, [returnFocusRef])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const tabbable = tabbableElements(dialog)
      const first = tabbable[0]
      const last = tabbable[tabbable.length - 1]
      if (!first || !last) {
        event.preventDefault()
        return
      }
      const active = document.activeElement
      if (!dialog.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-800"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {(editorDict.previewTitle as string) || 'Letter preview'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={(editorDict.closePreview as string) || 'Close preview'}
          className={cn(
            'p-2 -mr-2 rounded-lg',
            'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            'hover:bg-slate-100 dark:hover:bg-slate-700',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
            'transition-colors'
          )}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <CoverLetterPreview
        coverLetter={coverLetter}
        senderDetails={senderDetails}
        locale={locale}
        editorDict={editorDict}
        variant="window"
        scrollAreaRef={scrollAreaRef}
      />
    </div>
  )
}
