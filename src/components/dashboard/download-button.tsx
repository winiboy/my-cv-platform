'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import {
  PDF_DOWNLOAD_TIMEOUT_MS,
  PdfDownloadError,
  buildPdfRequestBody,
  requestResumePdf,
  type PdfDownloadFailure,
} from '@/lib/pdf/download-client'

interface DownloadButtonDict {
  errors?: {
    api?: {
      downloadDocx?: string
    }
  }
}

/** The PDF button's localized copy (`resumes.*` in `common.json`). */
export interface PdfDownloadMessages {
  generating: string
  error: string
  photoTooLarge: string
  photoUnsupported: string
}

function pdfFailureMessage(failure: PdfDownloadFailure, messages: PdfDownloadMessages): string {
  switch (failure) {
    case 'photo-too-large':
      return messages.photoTooLarge
    case 'photo-unsupported':
      return messages.photoUnsupported
    case 'failed':
      return messages.error
  }
}

interface DownloadButtonProps {
  label: string
  wordLabel?: string
  dict?: DownloadButtonDict
  pdfMessages: PdfDownloadMessages
}

/**
 * How long a downloaded file's object URL is kept. A download that starts from
 * `<a download>` reads the blob asynchronously in some browsers, so revoking it
 * in the same task can cancel the save; FileSaver.js keeps it 40 s for that
 * reason.
 */
const OBJECT_URL_LIFETIME_MS = 40_000

export function DownloadButton({ label, wordLabel, dict, pdfMessages }: DownloadButtonProps) {
  const params = useParams()
  const resumeId = params?.id as string
  const locale = params?.locale as string

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [pdfFailure, setPdfFailure] = useState<PdfDownloadFailure | null>(null)
  // State alone cannot stop a second click: two clicks dispatched before React
  // re-renders the disabled button would both see `false`.
  const pdfInFlightRef = useRef(false)
  const pdfButtonRef = useRef<HTMLButtonElement>(null)
  const restorePdfFocusRef = useRef(false)

  // A disabled button loses focus. Hand it back once the button is usable
  // again, but only if the user had it and has not moved it elsewhere since, so
  // keyboard users stay where they were.
  useEffect(() => {
    if (!isGeneratingPdf && restorePdfFocusRef.current) {
      restorePdfFocusRef.current = false
      const focusWasLost = document.activeElement === null || document.activeElement === document.body
      if (focusWasLost) pdfButtonRef.current?.focus()
    }
  }, [isGeneratingPdf])

  const handlePdfDownload = async () => {
    if (pdfInFlightRef.current) return
    pdfInFlightRef.current = true
    restorePdfFocusRef.current = document.activeElement === pdfButtonRef.current
    setIsGeneratingPdf(true)
    setPdfFailure(null)

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), PDF_DOWNLOAD_TIMEOUT_MS)
    try {
      // The same two localStorage values the Preview wrapper shows; the route
      // validates and bounds both. A browser that refuses storage access shows
      // no draft and no photo in the Preview either.
      let draft: string | null = null
      let photo: string | null = null
      try {
        draft = localStorage.getItem(`resume_draft_${resumeId}`)
        photo = localStorage.getItem(`resume_photo_${resumeId}`)
      } catch {}

      const { blob, filename } = await requestResumePdf({
        resumeId,
        locale: locale || 'fr',
        body: buildPdfRequestBody(draft, photo),
        signal: controller.signal,
      })

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.setTimeout(() => window.URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS)
    } catch (error) {
      // The status or the error's name only: never a body, which could hold
      // resume content.
      const detail =
        error instanceof PdfDownloadError ? error.message : error instanceof Error ? error.name : 'unknown error'
      console.error('Error downloading PDF:', detail)
      setPdfFailure(error instanceof PdfDownloadError ? error.failure : 'failed')
    } finally {
      window.clearTimeout(timeout)
      pdfInFlightRef.current = false
      setIsGeneratingPdf(false)
    }
  }

  const handleWordDownload = async () => {
    try {
      /**
       * The request describes WHICH resume and in WHAT language, and nothing
       * else.
       *
       * This used to assemble fourteen query parameters out of localStorage —
       * typography, colour, spacing, section order, section visibility and the
       * template — so that the server could render what this browser believed
       * the layout to be. The server now reads all of that from the resume
       * record, which is what makes an export from a second device match the
       * first. Re-adding any of them would put a second, browser-local
       * authority back in front of the account's.
       *
       * `locale` stays because it is not layout: it is the localized route the
       * user is on, and a resume has no locale of its own.
       */
      const requestUrl = `/api/resumes/${resumeId}/download-docx?locale=${encodeURIComponent(locale || 'fr')}`

      /**
       * The photo is the one exception, and it is not layout state either.
       *
       * It is never stored on the account — by the decision of 2026-09-07 it
       * stays in this browser's localStorage — so the request body is the only
       * way it can reach the document. The route bounds its size and type
       * before it reaches generation.
       */
      let photoBase64: string | undefined
      try {
        const savedPhoto = localStorage.getItem(`resume_photo_${resumeId}`)
        if (savedPhoto) photoBase64 = savedPhoto
      } catch {}

      // Use POST when photo data is available (too large for query string)
      const response = photoBase64
        ? await fetch(requestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoBase64 }),
          })
        : await fetch(requestUrl)
      if (!response.ok) throw new Error('Failed to download')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resume.docx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading Word document:', error)
      alert(dict?.errors?.api?.downloadDocx || 'Failed to download Word document. Please try again.')
    }
  }

  return (
    <div className="flex gap-2">
      {/* `relative` anchors the error below the button without changing the
          header's height, so the page around it lays out as it always has. */}
      <div className="relative">
        <button
          ref={pdfButtonRef}
          type="button"
          onClick={handlePdfDownload}
          disabled={isGeneratingPdf}
          aria-busy={isGeneratingPdf}
          aria-describedby={pdfFailure ? 'pdf-download-error' : undefined}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-wait disabled:opacity-80 disabled:hover:bg-teal-600"
        >
          {isGeneratingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {isGeneratingPdf ? pdfMessages.generating : label}
        </button>
        {/* Announces the busy state; a changed button label is not reliably
            read out while focus stays on the button. */}
        <span role="status" aria-live="polite" data-testid="pdf-download-status" className="sr-only">
          {isGeneratingPdf ? pdfMessages.generating : ''}
        </span>
        {pdfFailure && (
          <p
            id="pdf-download-error"
            role="alert"
            data-testid="pdf-download-error"
            className="absolute right-0 top-full z-10 mt-2 w-72 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm"
          >
            {pdfFailureMessage(pdfFailure, pdfMessages)}
          </p>
        )}
      </div>
      {wordLabel && (
        <button
          onClick={handleWordDownload}
          className="flex items-center gap-2 rounded-lg border border-teal-600 bg-white px-4 py-2 text-sm font-medium text-teal-600 transition-colors hover:bg-teal-50"
        >
          <FileText className="h-4 w-4" />
          {wordLabel}
        </button>
      )}
    </div>
  )
}
