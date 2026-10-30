/**
 * The browser's half of a cover letter download, as a PDF
 * (`POST /api/cover-letters/[id]/download-pdf`) or a Word file
 * (`POST /api/cover-letters/[id]/download-docx`), and how the answer is read.
 *
 * Pure apart from `fetch`, which is passed in, so every branch is unit-tested
 * without a browser. Saving the file and the UI state belong to the caller.
 */

import { filenameFromContentDisposition } from './pdf/download-client'

export type CoverLetterExportFormat = 'pdf' | 'docx'

/** The route's answer for a letter over the export size guard. */
export const COVER_LETTER_TOO_LARGE_STATUS = 422

interface FormatContract {
  /** The route's last path segment. */
  route: string
  /** The only content type accepted as the file. */
  contentType: RegExp
  /** The name a download falls back to when the response gives none usable. */
  defaultFilename: string
}

export const COVER_LETTER_EXPORT_FORMATS: Readonly<Record<CoverLetterExportFormat, FormatContract>> = Object.freeze({
  pdf: {
    route: 'download-pdf',
    contentType: /^application\/pdf\s*(?:;|$)/i,
    defaultFilename: 'cover-letter.pdf',
  },
  docx: {
    route: 'download-docx',
    contentType: /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\s*(?:;|$)/i,
    defaultFilename: 'cover-letter.docx',
  },
})

/** A download that produced no file. Carries the HTTP status when there was a response, never its body. */
export class CoverLetterDownloadError extends Error {
  constructor(
    readonly format: CoverLetterExportFormat,
    readonly status?: number,
  ) {
    super(
      status === undefined
        ? `Cover letter ${format} download failed`
        : `Cover letter ${format} download failed with HTTP ${status}`,
    )
    this.name = 'CoverLetterDownloadError'
  }
}

export interface CoverLetterFileRequest {
  coverLetterId: string
  format: CoverLetterExportFormat
  signal: AbortSignal
}

export interface CoverLetterFile {
  blob: Blob
  filename: string
}

/**
 * Request the saved letter as a file and return it with its name.
 *
 * The body is empty: the route exports the letter as stored, never anything
 * the browser holds. Throws `CoverLetterDownloadError` for any answer that is
 * not the requested file type, so an error page is never saved as a broken
 * file; the error body is not read. A 422 is the route refusing a letter over
 * the size guard; the caller tells it apart by `status`. Network failures and
 * an aborted `signal` reject with the `fetch` error.
 */
export async function requestCoverLetterFile(
  { coverLetterId, format, signal }: CoverLetterFileRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CoverLetterFile> {
  const contract = COVER_LETTER_EXPORT_FORMATS[format]
  const response = await fetchImpl(`/api/cover-letters/${encodeURIComponent(coverLetterId)}/${contract.route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal,
  })

  if (!response.ok) throw new CoverLetterDownloadError(format, response.status)

  // A 2xx that is not the file, such as a sign-in page served after a redirect.
  if (!contract.contentType.test(response.headers.get('content-type') ?? '')) {
    throw new CoverLetterDownloadError(format, response.status)
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(response.headers.get('content-disposition'), contract.defaultFilename),
  }
}
