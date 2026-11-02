import { describe, expect, it, vi } from 'vitest'
import {
  COVER_LETTER_EXPORT_FORMATS,
  COVER_LETTER_TOO_LARGE_STATUS,
  CoverLetterDownloadError,
  requestCoverLetterFile,
  type CoverLetterExportFormat,
} from './cover-letter-download-client'
import { attachmentContentDisposition } from './pdf/filename'

const ID = '44444444-4444-4444-8444-444444444444'

const CONTENT_TYPES: Record<CoverLetterExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function fileResponse(format: CoverLetterExportFormat, headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
    status: 200,
    headers: { 'content-type': CONTENT_TYPES[format], ...headers },
  })
}

const signal = () => new AbortController().signal

describe.each(['pdf', 'docx'] as const)('requestCoverLetterFile (%s)', (format) => {
  it("POSTs only the page locale to the format's route: the server exports the saved letter only", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fileResponse(format))
    const abort = signal()
    await requestCoverLetterFile({ coverLetterId: ID, format, locale: 'de', signal: abort }, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith(`/api/cover-letters/${ID}/download-${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"locale":"de"}',
      signal: abort,
    })
  })

  it('encodes the id into the path', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fileResponse(format))
    await requestCoverLetterFile({ coverLetterId: '../x?y', format, locale: 'en', signal: signal() }, fetchImpl)
    expect(fetchImpl.mock.calls[0][0]).toBe(`/api/cover-letters/..%2Fx%3Fy/download-${format}`)
  })

  it('returns the blob named by the response', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fileResponse(format, { 'content-disposition': attachmentContentDisposition('Lettre Zürich', 'cover-letter', format) }),
    )
    const { blob, filename } = await requestCoverLetterFile({ coverLetterId: ID, format, locale: 'en', signal: signal() }, fetchImpl)
    expect(filename).toBe(`Lettre Zürich.${format}`)
    expect(blob.size).toBe(4)
  })

  it(`falls back to cover-letter.${format} without a usable name`, async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fileResponse(format))
    const { filename } = await requestCoverLetterFile({ coverLetterId: ID, format, locale: 'en', signal: signal() }, fetchImpl)
    expect(filename).toBe(COVER_LETTER_EXPORT_FORMATS[format].defaultFilename)
    expect(filename).toBe(`cover-letter.${format}`)
  })

  it('reports the size refusal by its status, so the caller can say what helps', async () => {
    expect(COVER_LETTER_TOO_LARGE_STATUS).toBe(422)
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 422 }))
    await expect(requestCoverLetterFile({ coverLetterId: ID, format, locale: 'en', signal: signal() }, fetchImpl)).rejects.toMatchObject({
      format,
      status: COVER_LETTER_TOO_LARGE_STATUS,
    })
  })

  it.each([404, 500, 503, 504])('throws for HTTP %i, so no file is saved', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{"error":"x"}', { status }))
    const error = await requestCoverLetterFile({ coverLetterId: ID, format, locale: 'en', signal: signal() }, fetchImpl).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(CoverLetterDownloadError)
    expect(error).toMatchObject({ format, status })
  })

  it('throws for a 2xx that is not the file, such as a sign-in page', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }))
    await expect(requestCoverLetterFile({ coverLetterId: ID, format, locale: 'en', signal: signal() }, fetchImpl)).rejects.toBeInstanceOf(
      CoverLetterDownloadError,
    )
  })

  it("throws for the other format's file: a PDF is never saved as .docx, nor the reverse", async () => {
    const other: CoverLetterExportFormat = format === 'pdf' ? 'docx' : 'pdf'
    const fetchImpl = vi.fn<typeof fetch>(async () => fileResponse(other))
    await expect(requestCoverLetterFile({ coverLetterId: ID, format, locale: 'en', signal: signal() }, fetchImpl)).rejects.toBeInstanceOf(
      CoverLetterDownloadError,
    )
  })
})
