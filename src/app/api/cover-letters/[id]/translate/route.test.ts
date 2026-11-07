import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCompletionError } from '@/lib/ai/client'
import { CoverLetterTranslationReplyError, type CoverLetterTranslator } from '@/lib/ai/cover-letter-translation'
import { COVER_LETTER_FIELD_LIMITS, COVER_LETTER_PDF_GUARD } from '@/lib/cover-letter-limits'
import { COVER_LETTER_TRANSLATION_LIMITS } from './letter-segments'

/**
 * Unit coverage for `POST /api/cover-letters/[id]/translate`
 * (cover-letter-export-translate, US-003): authentication, the request,
 * ownership, the size bounds, the AI budget, AI failures creating nothing,
 * and the copy itself: columns kept, columns translated and sanitized, the
 * title (a default title in the target language, any other with the suffix,
 * cover-letter-preview-and-card-language US-004), and nothing but one insert
 * written.
 *
 * Supabase is a recorder that answers reads like RLS plus the route's own
 * filters, and records every write. The translator is a fake chosen per test.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'
const LETTER_ID = '44444444-4444-4444-8444-444444444444'
const COPY_ID = '55555555-5555-4555-8555-555555555555'
const RESUME_ID = '66666666-6666-4666-8666-666666666666'
const APPLICATION_ID = '77777777-7777-4777-8777-777777777777'

type Row = Record<string, unknown>

interface Write {
  table: string
  operation: 'insert' | 'update' | 'upsert' | 'delete'
  payload?: unknown
}

const state: {
  user: { id: string } | null
  row: Row | null
  readError: { code: string } | null
  insertError: { code: string } | null
  filters: Array<[string, unknown]>
  tables: string[]
  selects: Array<string | undefined>
  writes: Write[]
} = { user: null, row: null, readError: null, insertError: null, filters: [], tables: [], selects: [], writes: [] }

function fakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from(table: string) {
      state.tables.push(table)
      const record = (operation: Write['operation'], payload?: unknown) => {
        state.writes.push({ table, operation, payload })
        return builder
      }
      const builder = {
        select(columns?: string) {
          state.selects.push(columns)
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
        async single() {
          if (state.insertError) return { data: null, error: state.insertError }
          return { data: { id: COPY_ID }, error: null }
        },
        insert: (payload: unknown) => record('insert', payload),
        update: (payload: unknown) => record('update', payload),
        upsert: (payload: unknown) => record('upsert', payload),
        delete: () => record('delete'),
      }
      return builder
    },
  }
}

const translator = vi.fn<CoverLetterTranslator>()
const enforceAiRateLimit = vi.fn<() => Promise<NextResponse | null>>()

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeSupabase() }))
vi.mock('@/lib/ai/test-stub', () => ({ coverLetterTranslatorFor: () => translator }))
vi.mock('@/lib/api/ai-rate-limit', () => ({ enforceAiRateLimit: () => enforceAiRateLimit() }))

const { POST, maxDuration } = await import('./route')

const SECRET = 'My confidential motivation paragraph'

function letterRow(overrides: Row = {}): Row {
  return {
    id: LETTER_ID,
    user_id: USER_ID,
    title: 'Lettre Zürich',
    resume_id: RESUME_ID,
    job_application_id: APPLICATION_ID,
    recipient_name: 'Jürgen Weiß',
    recipient_title: 'Leiter Entwicklung',
    company_name: 'Größe & Söhne AG',
    company_address: 'Bahnhofstraße 1',
    greeting: 'Madame, Monsieur,',
    opening_paragraph: `<p>${SECRET} avec <strong>conviction</strong>.</p><ul><li>Point</li></ul>`,
    body_paragraphs: ['<p>Corps <em>un</em></p>', '<p>Corps deux</p>'],
    closing_paragraph: '<p>Merci.</p>',
    sign_off: 'Cordialement,',
    sender_name: 'Zoë Lovelace',
    sender_street: 'Rue de Bourg 12',
    sender_postal_locality: '1003 Lausanne',
    sender_phone: '+41 21 555 01 42',
    sender_email: 'zoe@example.ch',
    annexes: 'CV, certificats',
    job_title: 'Ingénieur',
    job_description: 'Offre',
    template: 'modern',
    analysis_score: 81,
    ...overrides,
  }
}

function request(body: unknown = { targetLanguage: 'de' }, contentType: string | null = 'application/json'): NextRequest {
  const headers: Record<string, string> = {}
  if (contentType) headers['content-type'] = contentType
  return new NextRequest(`http://localhost:3000/api/cover-letters/${LETTER_ID}/translate`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const call = (id = LETTER_ID, req = request()) => POST(req, { params: Promise.resolve({ id }) })

/** The stub's behaviour: each segment prefixed, markup kept. */
const prefixing: CoverLetterTranslator = async ({ segments, targetLanguage }) =>
  segments.map((segment) => `[${targetLanguage.toUpperCase()}] ${segment}`)

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.user = { id: USER_ID }
  state.row = letterRow()
  state.readError = null
  state.insertError = null
  state.filters = []
  state.tables = []
  state.selects = []
  state.writes = []
  translator.mockReset()
  translator.mockImplementation(prefixing)
  enforceAiRateLimit.mockReset()
  enforceAiRateLimit.mockResolvedValue(null)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  // No log line ever carries the letter or the AI's text.
  for (const args of consoleError.mock.calls) {
    expect(JSON.stringify(args)).not.toContain(SECRET)
    expect(JSON.stringify(args)).not.toContain('[DE]')
  }
  consoleError.mockRestore()
})

/** Nothing was written, and the AI was not called. */
function expectNothingDone() {
  expect(state.writes).toEqual([])
  expect(translator).not.toHaveBeenCalled()
}

describe('POST /api/cover-letters/[id]/translate', () => {
  it('answers 401 without a session, before reading anything', async () => {
    state.user = null
    const response = await call()
    expect(response.status).toBe(401)
    expect(state.tables).toEqual([])
    expectNothingDone()
  })

  it('answers 415 to a request that is not JSON', async () => {
    expect((await call(LETTER_ID, request('targetLanguage=de', 'application/x-www-form-urlencoded'))).status).toBe(415)
    expect((await call(LETTER_ID, request({ targetLanguage: 'de' }, null))).status).toBe(415)
    expectNothingDone()
  })

  it.each([
    ['an unknown language', { targetLanguage: 'es' }],
    ['an upper-case code', { targetLanguage: 'DE' }],
    ['no language', {}],
    ['a non-string', { targetLanguage: 1 }],
    ['not JSON', '{'],
  ])('answers 400 to %s', async (_label, body) => {
    const response = await call(LETTER_ID, request(body))
    expect(response.status).toBe(400)
    expect(state.tables).toEqual([])
    expectNothingDone()
  })

  it('answers 404 to an id that is not a uuid, before reading', async () => {
    expect((await call('not-a-uuid')).status).toBe(404)
    expect(state.tables).toEqual([])
    expectNothingDone()
  })

  it("answers 404 to another user's letter, filtering by the session's user", async () => {
    state.row = letterRow({ user_id: OTHER_USER_ID })
    const response = await call()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Cover letter not found' })
    expect(state.filters).toEqual([
      ['id', LETTER_ID],
      ['user_id', USER_ID],
    ])
    expectNothingDone()
    expect(enforceAiRateLimit).not.toHaveBeenCalled()
  })

  it('answers 404 to a missing letter, as to a foreign one', async () => {
    state.row = null
    expect((await call()).status).toBe(404)
    expectNothingDone()
  })

  it('answers 500 when the letter cannot be read', async () => {
    state.readError = { code: 'XX000' }
    expect((await call()).status).toBe(500)
    expectNothingDone()
  })

  it('answers 422 to a letter over the export guard, spending no AI budget', async () => {
    state.row = letterRow({ sign_off: 'x'.repeat(COVER_LETTER_PDF_GUARD.plainTextField + 1) })
    expect((await call()).status).toBe(422)
    expectNothingDone()
    expect(enforceAiRateLimit).not.toHaveBeenCalled()
  })

  it('answers 422 to a letter over the AI input limit, spending no AI budget', async () => {
    const paragraph = `<p>${'x'.repeat(COVER_LETTER_TRANSLATION_LIMITS.totalCharacters / 2)}</p>`
    state.row = letterRow({ body_paragraphs: [paragraph, paragraph] })
    expect((await call()).status).toBe(422)
    expectNothingDone()
    expect(enforceAiRateLimit).not.toHaveBeenCalled()
  })

  it("answers 422 { error: 'empty' } to a letter with no text, distinct from a letter too large", async () => {
    state.row = letterRow({ greeting: '', opening_paragraph: null, body_paragraphs: ['<p><br></p>'], closing_paragraph: '', sign_off: '' })
    const empty = await call()
    expect(empty.status).toBe(422)
    expect(await empty.json()).toEqual({ error: 'empty' })
    expectNothingDone()
    expect(enforceAiRateLimit).not.toHaveBeenCalled()

    state.filters = []
    state.row = letterRow({ sign_off: 'x'.repeat(COVER_LETTER_PDF_GUARD.plainTextField + 1) })
    const tooLarge = await call()
    expect(tooLarge.status).toBe(422)
    expect(await tooLarge.json()).not.toEqual({ error: 'empty' })
  })

  it('answers the AI budget\'s 429 and creates nothing', async () => {
    enforceAiRateLimit.mockResolvedValue(NextResponse.json({ error: 'Too many requests' }, { status: 429 }))
    expect((await call()).status).toBe(429)
    expectNothingDone()
  })

  it.each([
    ['a provider error', new AiCompletionError('provider_error', 'm', 500), 502],
    ['a network error', new AiCompletionError('network_error', 'm'), 502],
    ['a provider rate limit', new AiCompletionError('rate_limited', 'm', 429), 429],
    ['a reply that is not a translation', new CoverLetterTranslationReplyError(), 502],
  ])('answers %s with %s and creates nothing', async (_label, error, status) => {
    translator.mockRejectedValue(error)
    const response = await call()
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: 'The cover letter could not be translated' })
    expect(state.writes).toEqual([])
  })

  it('answers 502 and creates nothing when the reply leaves a part empty', async () => {
    translator.mockImplementation(async ({ segments }) => segments.map((segment, index) => (index === 2 ? '<b> </b>' : segment)))
    expect((await call()).status).toBe(502)
    expect(state.writes).toEqual([])
  })

  it('stores a translation much longer than its original whole', async () => {
    // A paragraph near the old 2,000-character run cap, translated 1.8 times longer.
    const original = 'Une phrase française. '.repeat(88).trim()
    expect(original.length).toBeGreaterThan(1_900)
    expect(original.length).toBeLessThan(2_000)
    const translated = `${'Ein längerer deutscher Satz, wie gewöhnlich. '.repeat(78)}ENDE`
    expect(translated.length).toBeGreaterThan(original.length * 1.75)
    state.row = letterRow({ body_paragraphs: [`<p>${original}</p>`] })
    translator.mockImplementation(async ({ segments }) =>
      segments.map((segment) => (segment === original ? translated : segment))
    )

    expect((await call()).status).toBe(201)
    expect((state.writes[0].payload as Row).body_paragraphs).toEqual([`<p>${translated}</p>`])
  })

  it.each([
    ['a body paragraph', (segment: string) => segment.startsWith('Corps deux'), COVER_LETTER_PDF_GUARD.richTextField],
    ['the greeting', (segment: string) => segment === 'Madame, Monsieur,', COVER_LETTER_FIELD_LIMITS.greeting + 1],
    ['the sign-off', (segment: string) => segment === 'Cordialement,', COVER_LETTER_FIELD_LIMITS.sign_off + 1],
  ])('answers 502 and creates nothing when the translation of %s is over its column limit', async (_label, isTarget, length) => {
    translator.mockImplementation(async ({ segments }) =>
      segments.map((segment) => (isTarget(segment) ? 'y'.repeat(length) : segment))
    )
    const response = await call()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'The cover letter could not be translated' })
    expect(state.writes).toEqual([])
  })

  it('gives the function the 60 s budget of the other letter routes', () => {
    expect(maxDuration).toBe(60)
  })

  it('answers 500 when the copy cannot be inserted', async () => {
    state.insertError = { code: '23514' }
    expect((await call()).status).toBe(500)
  })

  it('creates a translated copy, keeps every other column, and writes nothing else', async () => {
    const response = await call()
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ coverLetterId: COPY_ID })

    expect(translator).toHaveBeenCalledTimes(1)
    expect(translator.mock.calls[0][0].targetLanguage).toBe('de')

    // One insert into cover_letters, and nothing else: the original and the
    // application are never written, so its cover_letter_id still names the original.
    expect(state.writes).toHaveLength(1)
    expect(state.tables).not.toContain('job_applications')
    const [write] = state.writes
    expect(write).toMatchObject({ table: 'cover_letters', operation: 'insert' })
    expect(write.payload).toEqual({
      user_id: USER_ID,
      title: 'Lettre Zürich (DE)',
      resume_id: RESUME_ID,
      job_application_id: APPLICATION_ID,
      recipient_name: 'Jürgen Weiß',
      recipient_title: 'Leiter Entwicklung',
      company_name: 'Größe & Söhne AG',
      company_address: 'Bahnhofstraße 1',
      sender_name: 'Zoë Lovelace',
      sender_street: 'Rue de Bourg 12',
      sender_postal_locality: '1003 Lausanne',
      sender_phone: '+41 21 555 01 42',
      sender_email: 'zoe@example.ch',
      annexes: 'CV, certificats',
      job_title: 'Ingénieur',
      job_description: 'Offre',
      template: 'modern',
      greeting: '[DE] Madame, Monsieur,',
      opening_paragraph: `<p>[DE] ${SECRET} avec <strong>conviction</strong>.</p><ul><li>[DE] Point</li></ul>`,
      body_paragraphs: ['<p>[DE] Corps <em>un</em></p>', '<p>[DE] Corps deux</p>'],
      closing_paragraph: '<p>[DE] Merci.</p>',
      sign_off: '[DE] Cordialement,',
    })
  })

  it('reads the five sender and annexes columns, and copies them untranslated', async () => {
    expect((await call()).status).toBe(201)
    const read = state.selects[0] ?? ''
    for (const column of ['sender_street', 'sender_postal_locality', 'sender_phone', 'sender_email', 'annexes']) {
      expect(read.split(/,\s*/), column).toContain(column)
    }
    // None of them is sent to the AI.
    const segments = translator.mock.calls[0][0].segments.join('\n')
    for (const value of ['Rue de Bourg 12', '1003 Lausanne', '+41 21 555 01 42', 'zoe@example.ch', 'CV, certificats']) {
      expect(segments).not.toContain(value)
    }
  })

  it.each([
    ['an empty annexes (no Annexes block)', ''],
    ['a null annexes (the default list)', null],
  ])('keeps %s as it is in the copy', async (_label, annexes) => {
    state.row = letterRow({ annexes })
    expect((await call()).status).toBe(201)
    expect((state.writes[0].payload as Row).annexes).toBe(annexes)
  })

  it('stores the copy under the session user, whatever the row or the body say', async () => {
    const response = await call(LETTER_ID, request({ targetLanguage: 'it', user_id: OTHER_USER_ID }))
    expect(response.status).toBe(201)
    expect(state.writes[0].payload).toMatchObject({ user_id: USER_ID, title: 'Lettre Zürich (IT)' })
  })

  it('gives the copy of a default-titled letter the target language default, unsuffixed', async () => {
    for (const [title, target, expected] of [
      ['Lettre de motivation - Ingénieur chez Größe & Söhne AG', 'de', 'Anschreiben - Ingénieur bei Größe & Söhne AG'],
      ['Cover Letter - Ingénieur at Größe & Söhne AG (DE)', 'it', 'Lettera di presentazione - Ingénieur presso Größe & Söhne AG'],
      ['Anschreiben - Ingénieur bei Größe & Söhne AG (DE)', 'en', 'Cover Letter - Ingénieur at Größe & Söhne AG'],
      ['Lettera di presentazione - Ingénieur presso Größe & Söhne AG', 'fr', 'Lettre de motivation - Ingénieur chez Größe & Söhne AG'],
    ] as const) {
      state.row = letterRow({ title })
      state.filters = []
      state.writes = []
      const response = await call(LETTER_ID, request({ targetLanguage: target }))
      expect(response.status).toBe(201)
      expect(state.writes).toHaveLength(1)
      expect(state.writes[0].payload).toMatchObject({ title: expected, job_title: 'Ingénieur', company_name: 'Größe & Söhne AG' })
    }
  })

  it("matches the title against the original's own job title and company", async () => {
    // A default title of another job: a user title, suffixed as before.
    state.row = letterRow({ title: 'Lettre de motivation - Designer chez Größe & Söhne AG' })
    expect((await call()).status).toBe(201)
    expect(state.writes[0].payload).toMatchObject({ title: 'Lettre de motivation - Designer chez Größe & Söhne AG (DE)' })
  })

  it('stores hostile AI output only as escaped text in allowed tags', async () => {
    translator.mockImplementation(async ({ segments }) =>
      segments.map((segment) => `<img src=x onerror=alert(1)><a href="javascript:x">${segment}</a><script>steal()</script>`)
    )
    expect((await call()).status).toBe(201)
    const payload = state.writes[0].payload as Row
    const stored = JSON.stringify([payload.opening_paragraph, payload.body_paragraphs, payload.closing_paragraph])
    expect(stored).not.toMatch(/<img|<a |<script|onerror|javascript:/)
    expect(payload.greeting).not.toMatch(/[<>]/)
    expect(payload.sign_off).not.toMatch(/[<>]/)
  })
})
