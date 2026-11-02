import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfRenderError } from '@/lib/pdf/render-preview'
import { MAX_CONCURRENT_PDF_RENDERS, tryAcquirePdfRenderSlot, type PdfRenderSlot } from '@/lib/pdf/render-slots'
import { COVER_LETTER_FIELD_LIMITS, COVER_LETTER_PDF_GUARD } from '@/lib/cover-letter-limits'

/**
 * Unit coverage for `POST /api/cover-letters/[id]/download-pdf`
 * (cover-letter-export-translate, US-001): authentication, the request type,
 * ownership, render failures mapped to clean errors with no file, the busy
 * limit, and a file name derived safely from the title.
 *
 * Supabase is a recorder that answers like RLS plus the route's own filters;
 * the renderer is mocked, so no browser starts here.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'
const LETTER_ID = '44444444-4444-4444-8444-444444444444'

type Row = Record<string, unknown>

const state: {
  user: { id: string } | null
  row: Row | null
  readError: { code: string } | null
  filters: Array<[string, unknown]>
  columns: string | null
} = { user: null, row: null, readError: null, filters: [], columns: null }

function fakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from(table: string) {
      expect(table).toBe('cover_letters')
      const builder = {
        select(columns: string) {
          state.columns = columns
          return builder
        },
        eq(column: string, value: unknown) {
          state.filters.push([column, value])
          return builder
        },
        async maybeSingle() {
          if (state.readError) return { data: null, error: state.readError }
          const visible = state.row && state.filters.every(([column, value]) => state.row![column] === value)
          return { data: visible ? state.row : null, error: null }
        },
      }
      return builder
    },
  }
}

const renderCoverLetterPdf = vi.fn<(input: { coverLetter: Row; currentDate: string; timeoutMs: number }) => Promise<Buffer>>()

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeSupabase() }))
vi.mock('@/lib/pdf/render-cover-letter', () => ({
  renderCoverLetterPdf: (input: { coverLetter: Row; currentDate: string; timeoutMs: number }) => renderCoverLetterPdf(input),
}))

const { POST } = await import('./route')

const SECRET_SENTENCE = 'My confidential motivation paragraph'

function letterRow(overrides: Row = {}): Row {
  return {
    id: LETTER_ID,
    user_id: USER_ID,
    title: 'Lettre Zürich',
    sender_name: 'Ada Lovelace',
    recipient_name: null,
    recipient_title: null,
    company_name: 'Analytical Engines SA',
    company_address: null,
    job_title: 'Engineer',
    greeting: 'Dear team,',
    opening_paragraph: `<p>${SECRET_SENTENCE}</p>`,
    body_paragraphs: ['<p>Body</p>'],
    closing_paragraph: '<p>Closing</p>',
    sign_off: 'Sincerely,',
    ...overrides,
  }
}

function request(contentType: string | null = 'application/json'): NextRequest {
  const headers: Record<string, string> = {}
  if (contentType) headers['content-type'] = contentType
  return new NextRequest(`http://localhost:3000/api/cover-letters/${LETTER_ID}/download-pdf`, {
    method: 'POST',
    headers,
    body: '{}',
  })
}

const call = (id = LETTER_ID, req = request()) => POST(req, { params: Promise.resolve({ id }) })

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.user = { id: USER_ID }
  state.row = letterRow()
  state.readError = null
  state.filters = []
  state.columns = null
  renderCoverLetterPdf.mockReset()
  renderCoverLetterPdf.mockResolvedValue(Buffer.from('%PDF-1.7 test'))
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  consoleError.mockRestore()
})

/** Nothing the route logged may carry the letter. */
function expectNoLetterContentLogged(): void {
  const logged = JSON.stringify(consoleError.mock.calls)
  expect(logged).not.toContain(SECRET_SENTENCE)
  expect(logged).not.toContain('Ada Lovelace')
}

describe('POST /api/cover-letters/[id]/download-pdf: access', () => {
  it('refuses an anonymous request with 401 and renders nothing', async () => {
    state.user = null
    const response = await call()
    expect(response.status).toBe(401)
    expect(renderCoverLetterPdf).not.toHaveBeenCalled()
  })

  it('refuses a request that is not JSON with 415, so a cross-site form cannot start a render', async () => {
    expect((await call(LETTER_ID, request('application/x-www-form-urlencoded'))).status).toBe(415)
    expect((await call(LETTER_ID, request(null))).status).toBe(415)
    expect(renderCoverLetterPdf).not.toHaveBeenCalled()
  })

  it("answers 404 for another user's letter, filtering on the session's user id", async () => {
    state.row = letterRow({ user_id: OTHER_USER_ID })
    const response = await call()
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(state.filters).toEqual([
      ['id', LETTER_ID],
      ['user_id', USER_ID],
    ])
    expect(renderCoverLetterPdf).not.toHaveBeenCalled()
  })

  it('answers 404 for a letter that does not exist', async () => {
    state.row = null
    expect((await call()).status).toBe(404)
    expect(renderCoverLetterPdf).not.toHaveBeenCalled()
  })

  it('answers 404 for an id that is not a UUID, without querying', async () => {
    const response = await call('not-a-uuid')
    expect(response.status).toBe(404)
    expect(state.filters).toEqual([])
  })

  it('answers 500, not 404, when the letter cannot be read', async () => {
    state.readError = { code: '08006' }
    const response = await call()
    expect(response.status).toBe(500)
    expect(renderCoverLetterPdf).not.toHaveBeenCalled()
  })

  it('reads only the printed columns and the title', async () => {
    await call()
    expect(state.columns).not.toContain('*')
    expect(state.columns).not.toContain('job_description')
    expect(state.columns).toContain('title')
  })
})

describe('POST /api/cover-letters/[id]/download-pdf: the file', () => {
  it('returns the rendered PDF as a private attachment', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('%PDF-1.7 test')
    expect(response.headers.get('content-length')).toBe(String('%PDF-1.7 test'.length))
  })

  it('renders the stored row, with the date line', async () => {
    await call()
    expect(renderCoverLetterPdf).toHaveBeenCalledTimes(1)
    const input = renderCoverLetterPdf.mock.calls[0][0]
    expect(input.coverLetter).toMatchObject({ opening_paragraph: `<p>${SECRET_SENTENCE}</p>`, sender_name: 'Ada Lovelace' })
    expect(input.currentDate).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/)
    expect(input.timeoutMs).toBe(30_000)
  })

  it('names the file after the title, with an encoded UTF-8 name and an ASCII fallback', async () => {
    const response = await call()
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="Lettre Zurich.pdf"; filename*=UTF-8''Lettre%20Z%C3%BCrich.pdf`,
    )
  })

  it('keeps a hostile title from splitting or breaking the header', async () => {
    state.row = letterRow({ title: 'a"b\r\nSet-Cookie: x=1\\..\\..\\evil' })
    const header = (await call()).headers.get('content-disposition') ?? ''
    expect(header).toMatch(/^[\x20-\x7e]+$/)
    expect(header).not.toMatch(/[\r\n]/)
    const ascii = /filename="([^"]*)"/.exec(header)?.[1]
    expect(ascii).toBe('a_b Set-Cookie_ x=1_.._.._evil.pdf')
  })

  it('falls back to cover-letter.pdf for a title with nothing usable', async () => {
    state.row = letterRow({ title: '   ...   ' })
    expect((await call()).headers.get('content-disposition')).toBe(
      `attachment; filename="cover-letter.pdf"; filename*=UTF-8''cover-letter.pdf`,
    )
  })
})

describe('POST /api/cover-letters/[id]/download-pdf: render guard', () => {
  const guard = COVER_LETTER_PDF_GUARD
  const over = (limit: number) => 'x'.repeat(limit + 1)

  it.each([
    ['an opening one over the rich-text guard', { opening_paragraph: over(guard.richTextField) }],
    ['a closing one over the rich-text guard', { closing_paragraph: over(guard.richTextField) }],
    ['a body paragraph one over the rich-text guard', { body_paragraphs: [over(guard.richTextField)] }],
    ['a sender name one over the plain-text guard', { sender_name: over(guard.plainTextField) }],
    ['a company address one over the plain-text guard', { company_address: over(guard.plainTextField) }],
    ['one body paragraph over the count', { body_paragraphs: Array.from({ length: guard.bodyParagraphs + 1 }, () => '<p>p</p>') }],
    [
      'everything printed over the total, every field under its own guard',
      { body_paragraphs: Array.from({ length: 10 }, () => 'x'.repeat(guard.richTextField)) },
    ],
  ])('refuses %s with 422, without rendering or taking a render slot', async (_case, overrides) => {
    state.row = letterRow(overrides)
    const held: PdfRenderSlot[] = []
    try {
      // Every slot taken: a 422 rather than a 503 shows the size is checked first.
      for (let i = 0; i < MAX_CONCURRENT_PDF_RENDERS; i++) held.push(tryAcquirePdfRenderSlot()!)
      const response = await call()
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: 'Cover letter too large to export' })
      expect(renderCoverLetterPdf).not.toHaveBeenCalled()
    } finally {
      held.forEach((slot) => slot.release())
    }
  })

  it('renders a letter over the API limits, as the editor can save it: a 5,001-character paragraph', async () => {
    const overApi = 'x'.repeat(COVER_LETTER_FIELD_LIMITS.body_paragraph + 1)
    expect(overApi).toHaveLength(5_001)
    state.row = letterRow({ opening_paragraph: overApi, body_paragraphs: [overApi], closing_paragraph: overApi })
    expect((await call()).status).toBe(200)
    expect(renderCoverLetterPdf).toHaveBeenCalledTimes(1)
  })

  it('renders a letter exactly at the per-field guards', async () => {
    state.row = letterRow({
      sender_name: 'x'.repeat(guard.plainTextField),
      opening_paragraph: 'x'.repeat(guard.richTextField),
      body_paragraphs: ['x'.repeat(guard.richTextField)],
    })
    expect((await call()).status).toBe(200)
  })

  it('renders a row whose body is malformed, from what can print', async () => {
    state.row = letterRow({ body_paragraphs: ['<p>Body</p>', null, 7] })
    expect((await call()).status).toBe(200)
  })
})

describe('POST /api/cover-letters/[id]/download-pdf: failures', () => {
  it('maps a render failure to a clean 500 with no PDF and logs no letter content', async () => {
    renderCoverLetterPdf.mockRejectedValueOnce(
      new PdfRenderError('print', 'PDF render failed at print', { cause: new Error(`evaluating ${SECRET_SENTENCE}`) }),
    )
    const response = await call()
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ error: 'Failed to generate PDF' })
    expect(response.headers.get('content-disposition')).toBeNull()
    expectNoLetterContentLogged()
  })

  it('maps a render timeout to 504', async () => {
    renderCoverLetterPdf.mockRejectedValueOnce(new PdfRenderError('timeout', 'PDF render exceeded 30000 ms'))
    expect((await call()).status).toBe(504)
  })

  it('maps an unexpected error to 500 without leaking its message', async () => {
    renderCoverLetterPdf.mockRejectedValueOnce(new Error(SECRET_SENTENCE))
    const response = await call()
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain(SECRET_SENTENCE)
    expectNoLetterContentLogged()
  })

  it('answers 503 with Retry-After when every render slot is taken, and frees its own slot after a render', async () => {
    const held: PdfRenderSlot[] = []
    try {
      for (let i = 0; i < MAX_CONCURRENT_PDF_RENDERS; i++) held.push(tryAcquirePdfRenderSlot()!)
      const busy = await call()
      expect(busy.status).toBe(503)
      expect(busy.headers.get('retry-after')).toBe('5')
      expect(renderCoverLetterPdf).not.toHaveBeenCalled()
    } finally {
      held.forEach((slot) => slot.release())
    }

    renderCoverLetterPdf.mockRejectedValueOnce(new PdfRenderError('print', 'failed'))
    await call()
    await call()
    // Both slots are free again after a failed and a successful render.
    const slots = [tryAcquirePdfRenderSlot(), tryAcquirePdfRenderSlot()]
    expect(slots.every((slot) => slot !== null)).toBe(true)
    slots.forEach((slot) => slot?.release())
  })
})
