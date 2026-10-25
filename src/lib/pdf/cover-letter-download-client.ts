/**
 * The browser's half of the cover-letter PDF download: the request to
 * `POST /api/cover-letters/[id]/download-pdf` and how its answer is read.
 *
 * Pure apart from `fetch`, which is passed in, so every branch is unit-tested
 * without a browser. Saving the file and the UI state belong to the caller.
 */

import { PdfDownloadError, filenameFromContentDisposition } from './download-client'

/** The route's answer for a letter over the cover-letter size limits. */
export const COVER_LETTER_TOO_LARGE_STATUS = 422

/** The name a download falls back to when the response gives none usable. */
export const DEFAULT_COVER_LETTER_PDF_FILENAME = 'cover-letter.pdf'

export interface CoverLetterPdfRequest {
  coverLetterId: string
  signal: AbortSignal
}

export interface CoverLetterPdf {
  blob: Blob
  filename: string
}

/**
 * Request the saved letter's PDF and return it with its file name.
 *
 * A 422 is the route refusing a letter over the size limits; the caller tells
 * it apart by `PdfDownloadError.status` (`COVER_LETTER_TOO_LARGE_STATUS`).
 *
 * The body is empty: the route prints the letter as stored, never anything the
 * browser holds. Throws `PdfDownloadError` for any answer that is not a PDF, so
 * an error page is never saved as a broken `.pdf`; the error body is not read.
 * Network failures and an aborted `signal` reject with the `fetch` error.
 */
export async function requestCoverLetterPdf(
  { coverLetterId, signal }: CoverLetterPdfRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CoverLetterPdf> {
  const response = await fetchImpl(`/api/cover-letters/${encodeURIComponent(coverLetterId)}/download-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal,
  })

  if (!response.ok) throw new PdfDownloadError('failed', response.status)

  const contentType = response.headers.get('content-type') ?? ''
  if (!/^application\/pdf\s*(?:;|$)/i.test(contentType)) {
    throw new PdfDownloadError('failed', response.status)
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(
      response.headers.get('content-disposition'),
      DEFAULT_COVER_LETTER_PDF_FILENAME,
    ),
  }
}
