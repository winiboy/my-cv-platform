import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PDF_FILENAME,
  PdfDownloadError,
  buildPdfRequestBody,
  filenameFromContentDisposition,
  requestResumePdf,
} from './download-client'
import { pdfContentDisposition } from './filename'
import { MAX_PHOTO_LENGTH } from './photo'

describe('filenameFromContentDisposition', () => {
  it('prefers the RFC 5987 filename* over the ASCII fallback', () => {
    expect(
      filenameFromContentDisposition(`attachment; filename="CV _Zoe_ _ Zurich.pdf"; filename*=UTF-8''CV%20_Zo%C3%AB_%20%E2%80%93%20Z%C3%BCrich.pdf`),
    ).toBe('CV _Zoë_ – Zürich.pdf')
  })

  it('reads every header the route emits back to the title it was built from', () => {
    for (const title of ['CV "Zoë" – Zürich', 'Lebenslauf (2026)', "L'été*", '简历', 'Plain']) {
      const header = pdfContentDisposition(title)
      const name = filenameFromContentDisposition(header)
      expect(name.endsWith('.pdf')).toBe(true)
      expect(decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(header)![1])).toBe(name)
    }
  })

  it('accepts a language tag and any case in filename*', () => {
    expect(filenameFromContentDisposition(`attachment; FILENAME*=utf-8'fr'r%C3%A9sum%C3%A9.pdf`)).toBe('résumé.pdf')
  })

  it('falls back to the quoted filename when filename* is absent, undecodable or not UTF-8', () => {
    expect(filenameFromContentDisposition('attachment; filename="My CV.pdf"')).toBe('My CV.pdf')
    expect(filenameFromContentDisposition(`attachment; filename="ok.pdf"; filename*=UTF-8''%E0%A4%A.pdf`)).toBe('ok.pdf')
    expect(filenameFromContentDisposition(`attachment; filename="ok.pdf"; filename*=ISO-8859-1''r%E9sum%E9.pdf`)).toBe('ok.pdf')
  })

  it('unescapes a quoted-pair in the quoted filename', () => {
    expect(filenameFromContentDisposition('attachment; filename="a \\"b\\" c.pdf"')).toBe('a "b" c.pdf')
  })

  it('reads an unquoted token filename', () => {
    expect(filenameFromContentDisposition('attachment; filename=cv.pdf')).toBe('cv.pdf')
  })

  it('gives resume.pdf for a missing, empty or nameless header', () => {
    expect(filenameFromContentDisposition(null)).toBe(DEFAULT_PDF_FILENAME)
    expect(filenameFromContentDisposition(undefined)).toBe(DEFAULT_PDF_FILENAME)
    expect(filenameFromContentDisposition('')).toBe(DEFAULT_PDF_FILENAME)
    expect(filenameFromContentDisposition('attachment')).toBe(DEFAULT_PDF_FILENAME)
    expect(filenameFromContentDisposition('attachment; filename=""')).toBe(DEFAULT_PDF_FILENAME)
  })

  it('reads the route header for an empty title as resume.pdf', () => {
    expect(filenameFromContentDisposition(pdfContentDisposition(''))).toBe('resume.pdf')
  })
})

describe('buildPdfRequestBody', () => {
  it('sends neither value when the browser holds neither', () => {
    expect(buildPdfRequestBody(null, null)).toEqual({})
    expect(buildPdfRequestBody('', '')).toEqual({})
  })

  it('sends the draft and the photo verbatim', () => {
    const draft = JSON.stringify({ id: 'r1', summary: 'x' })
    expect(buildPdfRequestBody(draft, 'data:image/png;base64,AAAA')).toEqual({
      draft,
      photoBase64: 'data:image/png;base64,AAAA',
    })
  })

  it('leaves out a draft the Preview cannot parse, as the Preview shows the stored resume then', () => {
    expect(buildPdfRequestBody('{not json', 'data:image/png;base64,AAAA')).toEqual({
      photoBase64: 'data:image/png;base64,AAAA',
    })
  })

  it('sends a photo the route accepts, WebP and AVIF included, even one too large for the platform', () => {
    for (const type of ['jpeg', 'png', 'webp', 'avif']) {
      const photo = `data:image/${type};base64,QUJD`
      expect(buildPdfRequestBody(null, photo).photoBase64).toBe(photo)
    }
    // Over Vercel's 4.5 MB but within the route's bound: sent, so a platform
    // 413 can say the photo is too large rather than the PDF lacking it.
    const large = `data:image/jpeg;base64,${'A'.repeat(6 * 1024 * 1024)}`
    expect(buildPdfRequestBody(null, large).photoBase64).toBe(large)
  })

  it.each([
    ['SVG', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['TIFF', 'data:image/tiff;base64,QUJD'],
    ['a remote URL', 'https://example.com/me.png'],
  ])('refuses to build a body with an %s photo the route would drop', (_label, photo) => {
    expect(() => buildPdfRequestBody('{"id":"r"}', photo)).toThrow(PdfDownloadError)
    expect(() => buildPdfRequestBody(null, photo)).toThrow(
      expect.objectContaining({ failure: 'photo-unsupported', status: undefined }),
    )
  })

  it("refuses to build a body with a photo over the route's bound", () => {
    const photo = `data:image/png;base64,${'A'.repeat(MAX_PHOTO_LENGTH)}`
    expect(() => buildPdfRequestBody(null, photo)).toThrow(expect.objectContaining({ failure: 'photo-too-large' }))
  })

  it('sends a JSON draft the Preview shows even when the route will refuse it, so the refusal is visible', () => {
    const otherResume = JSON.stringify({ id: 'another-resume' })
    expect(buildPdfRequestBody(otherResume, null)).toEqual({ draft: otherResume })
  })
})

describe('requestResumePdf', () => {
  const signal = new AbortController().signal
  const pdfResponse = (headers: Record<string, string> = {}) =>
    new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', ...headers },
    })

  it('POSTs the body as JSON to the route, with the locale, and returns the file and its name', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      pdfResponse({ 'Content-Disposition': `attachment; filename="CV.pdf"; filename*=UTF-8''CV%C3%A9.pdf` }),
    )
    const body = { draft: '{"id":"r 1"}', photoBase64: 'data:image/png;base64,AAAA' }

    const result = await requestResumePdf({ resumeId: 'r 1', locale: 'de', body, signal }, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/resumes/r%201/download-pdf?locale=de')
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, signal })
    expect(JSON.parse(init!.body as string)).toEqual(body)
    expect(result.filename).toBe('CVé.pdf')
    expect(result.blob.size).toBe(4)
  })

  it('names the file resume.pdf when the response gives no name', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(pdfResponse())
    const result = await requestResumePdf({ resumeId: 'r', locale: 'fr', body: {}, signal }, fetchImpl)
    expect(result.filename).toBe('resume.pdf')
  })

  it.each([400, 401, 404, 415, 500, 503, 504])('fails for HTTP %i without reading the body', async (status) => {
    const response = new Response('{"error":"x"}', { status, headers: { 'Content-Type': 'application/json' } })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    const error = await requestResumePdf({ resumeId: 'r', locale: 'fr', body: {}, signal }, fetchImpl).catch((e) => e)
    expect(error).toBeInstanceOf(PdfDownloadError)
    expect(error).toMatchObject({ failure: 'failed', status })
    expect(response.bodyUsed).toBe(false)
  })

  it("reports a 413 with a photo as the photo's size, even with the platform's own non-JSON body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE', {
        status: 413,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )
    const error = await requestResumePdf(
      { resumeId: 'r', locale: 'fr', body: { photoBase64: 'data:image/png;base64,AAAA' }, signal },
      fetchImpl,
    ).catch((e) => e)
    expect(error).toMatchObject({ failure: 'photo-too-large', status: 413 })
  })

  it('reports a 413 without a photo as a plain failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 413 }))
    const error = await requestResumePdf({ resumeId: 'r', locale: 'fr', body: { draft: '{}' }, signal }, fetchImpl).catch(
      (e) => e,
    )
    expect(error).toMatchObject({ failure: 'failed', status: 413 })
  })

  it('fails for a successful response that is not a PDF', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>Sign in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )
    const error = await requestResumePdf({ resumeId: 'r', locale: 'fr', body: {}, signal }, fetchImpl).catch((e) => e)
    expect(error).toMatchObject({ failure: 'failed', status: 200 })
  })

  it('rejects with the fetch error on a network failure or an abort', async () => {
    const networkError = new TypeError('Failed to fetch')
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(networkError)
    await expect(requestResumePdf({ resumeId: 'r', locale: 'fr', body: {}, signal }, fetchImpl)).rejects.toBe(networkError)
  })
})
