/**
 * The browser's half of the resume PDF download: what the Preview page sends
 * to `POST /api/resumes/[id]/download-pdf`, and how it reads the answer.
 *
 * Pure apart from `fetch`, which is passed in, so every branch is unit-tested
 * without a browser. The component that calls this owns the UI state, the
 * localStorage reads and the file save.
 */

import { pdfPhotoProblem } from './photo'

/**
 * How long the browser waits for the PDF before giving up.
 *
 * Above the route's own budget (a 30 s render inside a 60 s function), so a
 * render the server can still finish is never abandoned here; low enough that a
 * request the platform lets hang ends in the error state rather than a button
 * that stays busy forever.
 */
export const PDF_DOWNLOAD_TIMEOUT_MS = 45_000

/** The name a download falls back to when the response gives none usable. */
export const DEFAULT_PDF_FILENAME = 'resume.pdf'

/** The route's body: the two values only this browser holds, both optional. */
export interface PdfRequestBody {
  draft?: string
  photoBase64?: string
}

/**
 * The body for the resume's PDF, from its `resume_draft_${id}` and
 * `resume_photo_${id}` localStorage values.
 *
 * Both are sent verbatim — the route validates and bounds them — with one rule
 * taken from the Preview itself (`resume-preview-wrapper.tsx`): a draft that is
 * not JSON is not shown there, the stored resume is, so it is not sent here
 * either and the PDF shows the stored resume too. Sending it would turn a
 * Preview that works into a download that fails with 400.
 *
 * That is the only draft the Preview ignores. A draft that parses but names
 * another resume, or is not an object, is used by the Preview as it stands; it
 * is sent, and the route's 400 ends in the error message rather than in a PDF
 * that quietly differs from the screen.
 *
 * The photo is never dropped here: a PDF that silently lacks the photo the
 * Preview shows is a fidelity failure (owner, 2026-10-13: warn rather than lose
 * the photo in silence). A photo the route would drop — a type the render may
 * not be given, such as SVG, or one over the bound — throws `PdfDownloadError`
 * before any request, so nothing is downloaded and the user is told why.
 */
export function buildPdfRequestBody(draft: string | null, photo: string | null): PdfRequestBody {
  const body: PdfRequestBody = {}
  if (draft && isJson(draft)) body.draft = draft
  if (photo) {
    const problem = pdfPhotoProblem(photo)
    if (problem === 'too-large') throw new PdfDownloadError('photo-too-large')
    if (problem === 'unsupported') throw new PdfDownloadError('photo-unsupported')
    body.photoBase64 = photo
  }
  return body
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * The file name a `Content-Disposition` header names.
 *
 * `filename*` (RFC 5987, the title itself) is preferred, then the ASCII
 * `filename` fallback, then `resume.pdf`. A parameter that cannot be decoded is
 * skipped rather than shown percent-encoded. The browser sanitizes whatever
 * reaches `<a download>` for its own file system; this only chooses the name.
 */
export function filenameFromContentDisposition(header: string | null | undefined): string {
  if (!header) return DEFAULT_PDF_FILENAME

  const extended = /(?:^|;)\s*filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (extended) {
    const decoded = decodeExtendedValue(extended[1], extended[2].trim())
    if (decoded) return decoded
  }

  const quoted = /(?:^|;)\s*filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header)
  if (quoted) {
    const unescaped = quoted[1].replace(/\\(.)/g, '$1').trim()
    if (unescaped) return unescaped
  }

  const token = /(?:^|;)\s*filename\s*=\s*([^";\s][^;]*)/i.exec(header)
  if (token) {
    const value = token[1].trim()
    if (value) return value
  }

  return DEFAULT_PDF_FILENAME
}

/** RFC 5987 `ext-value`; UTF-8 only, which is all the route emits and all `decodeURIComponent` reads. */
function decodeExtendedValue(charset: string, encoded: string): string | null {
  if (charset.trim().toLowerCase() !== 'utf-8') return null
  try {
    const decoded = decodeURIComponent(encoded).trim()
    return decoded.length > 0 ? decoded : null
  } catch {
    return null
  }
}

/**
 * Why a download failed, as the button tells the user.
 *
 * - `photo-too-large`: a 413 for a request that carried a photo. The route
 *   accepts about 10 MiB, but the hosting platform refuses bodies over 4.5 MB
 *   before the route runs, with a body of its own; either way the photo is what
 *   made the request too large, and a smaller photo is what fixes it. Also
 *   found before sending, for a photo over the route's own bound.
 * - `photo-unsupported`: the stored photo is in a format the PDF may not carry
 *   (see `photo.ts`). Found before any request is sent.
 * - `failed`: anything else — another status, a response that is not a PDF,
 *   the network, the timeout.
 */
export type PdfDownloadFailure = 'photo-too-large' | 'photo-unsupported' | 'failed'

export class PdfDownloadError extends Error {
  constructor(
    readonly failure: PdfDownloadFailure,
    /** The HTTP status, when there was a response. Never the response body. */
    readonly status?: number,
  ) {
    super(status === undefined ? `PDF download failed (${failure})` : `PDF download failed with HTTP ${status}`)
    this.name = 'PdfDownloadError'
  }
}

export interface ResumePdfRequest {
  resumeId: string
  locale: string
  body: PdfRequestBody
  signal: AbortSignal
}

export interface ResumePdf {
  blob: Blob
  filename: string
}

/**
 * Request the resume's PDF and return it with its file name.
 *
 * Throws `PdfDownloadError` for a response that is not a PDF. The error body is
 * never read: it may be the route's JSON or the platform's own page, and
 * neither is shown to the user. Network failures and an aborted `signal`
 * reject with the `fetch` error, which the caller treats as `failed`.
 */
export async function requestResumePdf(
  { resumeId, locale, body, signal }: ResumePdfRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ResumePdf> {
  const url = `/api/resumes/${encodeURIComponent(resumeId)}/download-pdf?locale=${encodeURIComponent(locale)}`
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const failure = response.status === 413 && body.photoBase64 !== undefined ? 'photo-too-large' : 'failed'
    throw new PdfDownloadError(failure, response.status)
  }

  // A 2xx that is not a PDF — a sign-in page served after a redirect, say —
  // would otherwise be saved as a broken `.pdf`.
  const contentType = response.headers.get('content-type') ?? ''
  if (!/^application\/pdf\s*(?:;|$)/i.test(contentType)) {
    throw new PdfDownloadError('failed', response.status)
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(response.headers.get('content-disposition')),
  }
}
