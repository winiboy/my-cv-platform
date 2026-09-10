'use client'

import { Download, FileText } from 'lucide-react'
import { useParams } from 'next/navigation'

interface DownloadButtonDict {
  errors?: {
    api?: {
      downloadDocx?: string
    }
  }
}

interface DownloadButtonProps {
  label: string
  wordLabel?: string
  dict?: DownloadButtonDict
}

export function DownloadButton({ label, wordLabel, dict }: DownloadButtonProps) {
  const params = useParams()
  const resumeId = params?.id as string
  const locale = params?.locale as string

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
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
      >
        <Download className="h-4 w-4" />
        {label}
      </button>
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
