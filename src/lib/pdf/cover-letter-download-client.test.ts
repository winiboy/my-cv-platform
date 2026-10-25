import { describe, expect, it, vi } from 'vitest'
import { PdfDownloadError } from './download-client'
import {
  COVER_LETTER_TOO_LARGE_STATUS,
  DEFAULT_COVER_LETTER_PDF_FILENAME,
  requestCoverLetterPdf,
} from './cover-letter-download-client'
import { pdfContentDisposition } from './filename'

const ID = '44444444-4444-4444-8444-444444444444'

function pdfResponse(headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
    status: 200,
    headers: { 'content-type': 'application/pdf', ...headers },
  })
}

describe('requestCoverLetterPdf', () => {
  it('POSTs an empty JSON body to the letter route: the server prints the saved letter only', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => pdfResponse())
    const signal = new AbortController().signal
    await requestCoverLetterPdf({ coverLetterId: ID, signal }, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith(`/api/cover-letters/${ID}/download-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal,
    })
  })

  it('encodes the id into the path', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => pdfResponse())
    await requestCoverLetterPdf({ coverLetterId: '../x?y', signal: new AbortController().signal }, fetchImpl)
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/cover-letters/..%2Fx%3Fy/download-pdf')
  })

  it('returns the blob named by the response', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      pdfResponse({ 'content-disposition': pdfContentDisposition('Lettre Zürich', 'cover-letter') }),
    )
    const { blob, filename } = await requestCoverLetterPdf({ coverLetterId: ID, signal: new AbortController().signal }, fetchImpl)
    expect(filename).toBe('Lettre Zürich.pdf')
    expect(blob.size).toBe(4)
  })

  it('falls back to cover-letter.pdf, not resume.pdf, without a usable name', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => pdfResponse())
    const { filename } = await requestCoverLetterPdf({ coverLetterId: ID, signal: new AbortController().signal }, fetchImpl)
    expect(filename).toBe(DEFAULT_COVER_LETTER_PDF_FILENAME)
  })

  it('reports the size refusal by its status, so the caller can say what helps', async () => {
    expect(COVER_LETTER_TOO_LARGE_STATUS).toBe(422)
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 422 }))
    await expect(
      requestCoverLetterPdf({ coverLetterId: ID, signal: new AbortController().signal }, fetchImpl),
    ).rejects.toMatchObject({ failure: 'failed', status: COVER_LETTER_TOO_LARGE_STATUS })
  })

  it.each([404, 500, 503, 504])('throws for HTTP %i, so no file is saved', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{"error":"x"}', { status }))
    const error = await requestCoverLetterPdf({ coverLetterId: ID, signal: new AbortController().signal }, fetchImpl).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(PdfDownloadError)
    expect(error).toMatchObject({ failure: 'failed', status })
  })

  it('throws for a 2xx that is not a PDF, such as a sign-in page', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }))
    await expect(
      requestCoverLetterPdf({ coverLetterId: ID, signal: new AbortController().signal }, fetchImpl),
    ).rejects.toBeInstanceOf(PdfDownloadError)
  })
})
