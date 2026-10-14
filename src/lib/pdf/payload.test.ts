import { describe, expect, it } from 'vitest'
import {
  MAX_DRAFT_LENGTH,
  MAX_PDF_REQUEST_BYTES,
  MAX_PHOTO_LENGTH,
  boundedPdfPhoto,
  parsePdfRequestBody,
  readBoundedBody,
} from './payload'

const RESUME_ID = '0b5f6a8e-2d4c-4f7a-9c1e-1a2b3c4d5e6f'
const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const draftFor = (fields: Record<string, unknown>) => JSON.stringify(fields)
const body = (fields: Record<string, unknown>) => JSON.stringify(fields)

describe('boundedPdfPhoto', () => {
  // WebP and AVIF beyond the DOCX's types: Chromium draws both (owner, 2026-10-13).
  it.each(['jpeg', 'jpg', 'png', 'gif', 'bmp', 'webp', 'avif'])('accepts a %s data URL', (type) => {
    const value = `data:image/${type};base64,QUJD`
    expect(boundedPdfPhoto(value)).toBe(value)
  })

  it.each([
    ['a non-string', 42],
    ['an empty string', ''],
    ['bare base64, which an <img src> would resolve as a URL', 'iVBORw0KGgo='],
    ['an SVG data URL', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['an SVG data URL spelled as svg', 'data:image/svg;base64,PHN2Zz4='],
    ['a TIFF data URL', 'data:image/tiff;base64,QUJD'],
    ['an HEIC data URL', 'data:image/heic;base64,QUJD'],
    ['a non-image data URL', 'data:text/html;base64,PGI+'],
    ['a type that only starts like an accepted one', 'data:image/webpx;base64,QUJD'],
    ['a remote URL', 'https://example.com/x.png'],
    ['a local file', 'file:///C:/Windows/win.ini'],
    ['a data URL with whitespace in its payload', 'data:image/png;base64,QU JD'],
    ['a data URL with markup in its payload', 'data:image/png;base64,"><script>'],
    ['a data URL with no payload', 'data:image/png;base64,'],
  ])('drops %s', (_label, value) => {
    expect(boundedPdfPhoto(value)).toBeUndefined()
  })

  it('drops a photo over the bound and keeps one at it', () => {
    const prefix = 'data:image/png;base64,'
    const atBound = prefix + 'A'.repeat(MAX_PHOTO_LENGTH - prefix.length)
    expect(boundedPdfPhoto(atBound)).toBe(atBound)
    expect(boundedPdfPhoto(atBound + 'A')).toBeUndefined()
  })
})

describe('parsePdfRequestBody', () => {
  it('treats an empty body as "the stored resume, no photo"', () => {
    expect(parsePdfRequestBody('', RESUME_ID, USER_ID)).toEqual({ ok: true, draft: null, photo: null })
    expect(parsePdfRequestBody('{}', RESUME_ID, USER_ID)).toEqual({ ok: true, draft: null, photo: null })
  })

  it('accepts a draft for this resume and this user, re-serialized', () => {
    const draft = `{ "id": "${RESUME_ID}",  "user_id": "${USER_ID}", "summary": "Draft" }`
    const result = parsePdfRequestBody(body({ draft, photoBase64: PNG }), RESUME_ID, USER_ID)
    expect(result).toEqual({
      ok: true,
      draft: JSON.stringify({ id: RESUME_ID, user_id: USER_ID, summary: 'Draft' }),
      photo: PNG,
    })
  })

  it('accepts a draft that names no owner', () => {
    const result = parsePdfRequestBody(body({ draft: draftFor({ id: RESUME_ID }) }), RESUME_ID, USER_ID)
    expect(result).toMatchObject({ ok: true })
  })

  it('drops an unusable photo without failing the request', () => {
    const result = parsePdfRequestBody(body({ photoBase64: 'https://example.com/x.png' }), RESUME_ID, USER_ID)
    expect(result).toEqual({ ok: true, draft: null, photo: null })
  })

  it.each([
    ['a draft for another resume', { draft: draftFor({ id: 'another-id' }) }],
    ['a draft with no id', { draft: draftFor({ summary: 'x' }) }],
    ['a draft owned by another user', { draft: draftFor({ id: RESUME_ID, user_id: 'someone-else' }) }],
    ['a draft that is not JSON', { draft: '{not json' }],
    ['a draft that is an array', { draft: '[]' }],
    ['a draft that is null', { draft: 'null' }],
    ['a draft that is not a string', { draft: { id: RESUME_ID } }],
    ['an unknown key', { layout: { fontScale: 2 } }],
  ])('rejects %s with 400', (_label, fields) => {
    expect(parsePdfRequestBody(body(fields), RESUME_ID, USER_ID)).toMatchObject({ ok: false, status: 400 })
  })

  it.each([
    ['malformed JSON', '{"draft":'],
    ['a JSON array', '[]'],
    ['a JSON string', '"draft"'],
  ])('rejects a body that is %s with 400', (_label, text) => {
    expect(parsePdfRequestBody(text, RESUME_ID, USER_ID)).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects a draft over its bound with 413', () => {
    const draft = draftFor({ id: RESUME_ID, summary: 'x'.repeat(MAX_DRAFT_LENGTH) })
    expect(parsePdfRequestBody(body({ draft }), RESUME_ID, USER_ID)).toMatchObject({ ok: false, status: 413 })
  })
})

describe('readBoundedBody', () => {
  const streamOf = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        controller.close()
      },
    })

  const request = (stream: ReadableStream<Uint8Array> | null, headers: Record<string, string> = {}) =>
    new Request('http://localhost/api', {
      method: 'POST',
      body: stream,
      headers,
      // Required by Node's fetch for a streamed body.
      ...({ duplex: 'half' } as Record<string, string>),
    })

  it('reads a body within the bound', async () => {
    expect(await readBoundedBody(request(streamOf(['{"a":', '1}'])), 100)).toEqual({ ok: true, text: '{"a":1}' })
  })

  it('reads a missing body as empty', async () => {
    expect(await readBoundedBody(request(null), 100)).toEqual({ ok: true, text: '' })
  })

  it('refuses a declared length over the bound without reading', async () => {
    const result = await readBoundedBody(request(streamOf(['x']), { 'content-length': '101' }), 100)
    expect(result).toEqual({ ok: false, status: 413 })
  })

  it('refuses a streamed body that exceeds the bound whatever its header claims', async () => {
    const result = await readBoundedBody(request(streamOf(['x'.repeat(60), 'x'.repeat(60)]), { 'content-length': '10' }), 100)
    expect(result).toEqual({ ok: false, status: 413 })
  })

  it('admits both fields at their bounds', () => {
    expect(MAX_PDF_REQUEST_BYTES).toBeGreaterThan(MAX_PHOTO_LENGTH + MAX_DRAFT_LENGTH)
  })
})
