'use client'

import { useCallback, useRef, useState } from 'react'
import { PDF_DOWNLOAD_TIMEOUT_MS } from '@/lib/pdf/download-client'
import {
  COVER_LETTER_TOO_LARGE_STATUS,
  CoverLetterDownloadError,
  requestCoverLetterFile,
  type CoverLetterExportFormat,
} from '@/lib/cover-letter-download-client'

/**
 * How long a downloaded file's object URL is kept. A download started from
 * `<a download>` reads the blob asynchronously in some browsers, so revoking it
 * in the same task can cancel the save (the resume download keeps it as long).
 */
const OBJECT_URL_LIFETIME_MS = 40_000

/**
 * `downloaded`: the file was handed to the browser. `too-large`: the letter is
 * over the size guard, and shortening it is what helps. `failed`: anything
 * else. Nothing is saved unless `downloaded`.
 */
export type CoverLetterDownloadResult = 'downloaded' | 'too-large' | 'failed'

/**
 * Downloads a saved cover letter as a PDF or Word file, for the letters list
 * and the editor. One instance per format, so each button has its own busy
 * state. `locale` is the page's, sent for the wording of a letter whose own
 * language cannot be told.
 *
 * `download` resolves once the file is handed to the browser or the attempt
 * failed; the caller tells the user. A click while one download is running is
 * ignored and resolves to `null`: state alone cannot stop it, since two clicks
 * dispatched before React re-renders the busy button would both see `false`.
 */
export function useCoverLetterDownload(coverLetterId: string, format: CoverLetterExportFormat, locale: string) {
  const [isDownloading, setIsDownloading] = useState(false)
  const inFlightRef = useRef(false)

  const download = useCallback(async (): Promise<CoverLetterDownloadResult | null> => {
    if (inFlightRef.current) return null
    inFlightRef.current = true
    setIsDownloading(true)

    const controller = new AbortController()
    // The PDF's budget bounds the Word file too, which is far quicker.
    const timeout = window.setTimeout(() => controller.abort(), PDF_DOWNLOAD_TIMEOUT_MS)
    try {
      const { blob, filename } = await requestCoverLetterFile({
        coverLetterId,
        format,
        locale,
        signal: controller.signal,
      })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => window.URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS)
      return 'downloaded'
    } catch (error) {
      // The status or the error's name only: never a body or the letter.
      const detail =
        error instanceof CoverLetterDownloadError ? error.message : error instanceof Error ? error.name : 'unknown error'
      console.error(`Error downloading the cover letter (${format}):`, detail)
      return error instanceof CoverLetterDownloadError && error.status === COVER_LETTER_TOO_LARGE_STATUS
        ? 'too-large'
        : 'failed'
    } finally {
      window.clearTimeout(timeout)
      inFlightRef.current = false
      setIsDownloading(false)
    }
  }, [coverLetterId, format, locale])

  return { download, isDownloading }
}
