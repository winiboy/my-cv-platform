import JSZip from 'jszip'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COVER_LETTER_PDF_GUARD } from '@/lib/cover-letter-limits'
import { MAX_COVER_LETTER_EXPORT_REQUEST_BYTES } from '@/lib/cover-letter-pdf-html'
import type { CoverLetterDocxInput } from './cover-letter-docx'

/**
 * Unit coverage for `POST /api/cover-letters/[id]/download-docx`
 * (cover-letter-export-translate, US-002): authentication, the request type,
 * ownership, the size guard, a build failure mapped to a clean error with no
 * file, and a file name derived safely from the title; and the sender details
 * of the Swiss letter (cover-letter-swiss-format, US-004), with the linked
 * CV's contact read under the same owner filter as the PDF's.
 *
 * Supabase is a recorder that answers like RLS plus the route's own filters.
 * The builder is the real one, wrapped so a test can make it fail.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'
const LETTER_ID = '44444444-4444-4444-8444-444444444444'
const RESUME_ID = '55555555-5555-4555-8555-555555555555'

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type Row = Record<string, unknown>

const state: {
  user: { id: string } | null
  row: Row | null
  readError: { code: string } | null
  filters: Array<[string, unknown]>
  columns: string | null
  /** The CVs table: rows, a read error or a thrown failure, and what the route asked for. */
  resumes: Row[]
  resumeReadError: { code: string } | null
  resumeReadThrows: boolean
  resumeFilters: Array<[string, unknown]>
  resumeColumns: string | null
  /** The tables read, in order. */
  tables: string[]
} = {
  user: null,
  row: null,
  readError: null,
  filters: [],
  columns: null,
  resumes: [],
  resumeReadError: null,
  resumeReadThrows: false,
  resumeFilters: [],
  resumeColumns: null,
  tables: [],
}

function fakeResumes() {
  const builder = {
    select(columns: string) {
      state.resumeColumns = columns
      return builder
    },
    eq(column: string, value: unknown) {
      state.resumeFilters.push([column, value])
      return builder
    },
    async maybeSingle() {
      if (state.resumeReadThrows) throw new TypeError('fetch failed')
      if (state.resumeReadError) return { data: null, error: state.resumeReadError }
      const visible = state.resumes.find((row) => state.resumeFilters.every(([column, value]) => row[column] === value))
      return { data: visible ?? null, error: null }
    },
  }
  return builder
}

function fakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from(table: string) {
      state.tables.push(table)
      if (table === 'resumes') return fakeResumes()
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

/** The real builder, captured by the mock below. */
const realBuild = vi.hoisted(() => ({ current: null as null | ((input: CoverLetterDocxInput) => Promise<Buffer>) }))
const buildCoverLetterDocx = vi.fn<(input: CoverLetterDocxInput) => Promise<Buffer>>()

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeSupabase() }))
vi.mock('./cover-letter-docx', async (importOriginal) => {
  const original = await importOriginal<typeof import('./cover-letter-docx')>()
  realBuild.current = original.buildCoverLetterDocx
  return { ...original, buildCoverLetterDocx: (input: CoverLetterDocxInput) => buildCoverLetterDocx(input) }
})

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
    resume_id: null,
    sender_street: 'Rue de Bourg 12',
    sender_postal_locality: null,
    sender_phone: null,
    sender_email: '',
    annexes: null,
    ...overrides,
  }
}

function request(contentType: string | null = 'application/json', body = '{}'): NextRequest {
  const headers: Record<string, string> = {}
  if (contentType) headers['content-type'] = contentType
  return new NextRequest(`http://localhost:3000/api/cover-letters/${LETTER_ID}/download-docx`, {
    method: 'POST',
    headers,
    body,
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
  state.resumes = []
  state.resumeReadError = null
  state.resumeReadThrows = false
  state.resumeFilters = []
  state.resumeColumns = null
  state.tables = []
  buildCoverLetterDocx.mockReset()
  buildCoverLetterDocx.mockImplementation((input) => realBuild.current!(input))
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

/** A JSON error and nothing that names or carries a file. */
async function expectNoFile(response: Response): Promise<void> {
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(response.headers.get('content-disposition')).toBeNull()
  const body = Buffer.from(await response.arrayBuffer())
  expect(body.subarray(0, 2).toString('latin1')).not.toBe('PK')
}

describe('POST /api/cover-letters/[id]/download-docx: access', () => {
  it('refuses an anonymous request with 401 and builds nothing', async () => {
    state.user = null
    const response = await call()
    expect(response.status).toBe(401)
    await expectNoFile(response)
    expect(buildCoverLetterDocx).not.toHaveBeenCalled()
  })

  it('refuses a request that is not JSON with 415, so a cross-site form cannot trigger it', async () => {
    expect((await call(LETTER_ID, request('application/x-www-form-urlencoded'))).status).toBe(415)
    expect((await call(LETTER_ID, request(null))).status).toBe(415)
    expect(buildCoverLetterDocx).not.toHaveBeenCalled()
  })

  it("answers 404 for another user's letter, filtering on the session's user id", async () => {
    state.row = letterRow({ user_id: OTHER_USER_ID })
    const response = await call()
    expect(response.status).toBe(404)
    await expectNoFile(response)
    expect(state.filters).toEqual([
      ['id', LETTER_ID],
      ['user_id', USER_ID],
    ])
    expect(buildCoverLetterDocx).not.toHaveBeenCalled()
  })

  it('answers 404 for a letter that does not exist', async () => {
    state.row = null
    const response = await call()
    expect(response.status).toBe(404)
    await expectNoFile(response)
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
    await expectNoFile(response)
    expect(buildCoverLetterDocx).not.toHaveBeenCalled()
  })

  it('reads only the printed columns and the title', async () => {
    await call()
    expect(state.columns).not.toContain('*')
    expect(state.columns).not.toContain('job_description')
    expect(state.columns).toContain('title')
    for (const column of ['resume_id', 'sender_street', 'sender_postal_locality', 'sender_phone', 'sender_email', 'annexes']) {
      expect(state.columns).toContain(column)
    }
  })
})

describe('POST /api/cover-letters/[id]/download-docx: the sender details', () => {
  const CONTACT = { email: 'ada.cv@example.ch', phone: '+41 21 555 01 42', location: '1003 Lausanne' }

  async function documentXml(response: Response): Promise<string> {
    const body = Buffer.from(await response.arrayBuffer())
    return (await JSZip.loadAsync(body)).file('word/document.xml')!.async('string')
  }

  it('fills the details never set from the linked CV, read with an explicit owner filter', async () => {
    state.row = letterRow({ resume_id: RESUME_ID })
    state.resumes = [{ id: RESUME_ID, user_id: USER_ID, contact: CONTACT }]
    const response = await call()
    expect(response.status).toBe(200)
    expect(state.resumeColumns).toBe('contact')
    expect(state.resumeFilters).toEqual([
      ['id', RESUME_ID],
      ['user_id', USER_ID],
    ])
    // Street stored; locality and phone never set (null) take the CV's; the
    // e-mail cleared on purpose ('') stays empty.
    expect(buildCoverLetterDocx.mock.calls[0][0].senderDetails).toEqual({
      sender_street: 'Rue de Bourg 12',
      sender_postal_locality: '1003 Lausanne',
      sender_phone: '+41 21 555 01 42',
      sender_email: '',
    })
    const xml = await documentXml(response)
    expect(xml).toContain('>1003 Lausanne<')
    expect(xml).toContain('>+41 21 555 01 42<')
    expect(xml).not.toContain('ada.cv@example.ch')
  })

  it("never prints another user's CV: the owner filter finds nothing, and the stored details print", async () => {
    state.row = letterRow({ resume_id: RESUME_ID })
    state.resumes = [{ id: RESUME_ID, user_id: OTHER_USER_ID, contact: CONTACT }]
    const response = await call()
    expect(response.status).toBe(200)
    expect(state.resumeFilters).toContainEqual(['user_id', USER_ID])
    expect(buildCoverLetterDocx.mock.calls[0][0].senderDetails).toEqual({
      sender_street: 'Rue de Bourg 12',
      sender_postal_locality: null,
      sender_phone: null,
      sender_email: '',
    })
    expect(await documentXml(response)).not.toContain('+41 21 555 01 42')
  })

  it.each([
    ['the CV is gone', () => undefined],
    ['the CV cannot be read', () => {
      state.resumeReadError = { code: '08006' }
    }],
    ['the read throws', () => {
      state.resumeReadThrows = true
    }],
  ])('still exports, with the stored details only, when %s', async (_case, arrange) => {
    state.row = letterRow({ resume_id: RESUME_ID })
    arrange()
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(DOCX_TYPE)
    expect(buildCoverLetterDocx.mock.calls[0][0].senderDetails).toEqual({
      sender_street: 'Rue de Bourg 12',
      sender_postal_locality: null,
      sender_phone: null,
      sender_email: '',
    })
    expectNoLetterContentLogged()
  })

  it('reads no CV for a letter without one', async () => {
    expect((await call()).status).toBe(200)
    expect(state.resumeFilters).toEqual([])
    expect(state.resumeColumns).toBeNull()
  })

  it('reads the CV only after the letter passed the ownership and size checks', async () => {
    state.row = letterRow({ resume_id: RESUME_ID, user_id: OTHER_USER_ID })
    expect((await call()).status).toBe(404)
    expect(state.tables).toEqual(['cover_letters'])

    state.tables = []
    state.row = letterRow({ resume_id: RESUME_ID, opening_paragraph: 'x'.repeat(COVER_LETTER_PDF_GUARD.richTextField + 1) })
    expect((await call()).status).toBe(422)
    expect(state.tables).toEqual(['cover_letters'])

    state.tables = []
    state.row = letterRow({ resume_id: RESUME_ID })
    expect((await call()).status).toBe(200)
    expect(state.tables).toEqual(['cover_letters', 'resumes'])
  })
})

describe('POST /api/cover-letters/[id]/download-docx: the file', () => {
  it('returns a Word document as a private attachment', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(DOCX_TYPE)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = Buffer.from(await response.arrayBuffer())
    expect(response.headers.get('content-length')).toBe(String(body.byteLength))

    const xml = await (await JSZip.loadAsync(body)).file('word/document.xml')!.async('string')
    expect(xml).toContain(SECRET_SENTENCE)
    expect(xml).toContain('Application for Engineer')
  })

  it('builds the stored row, with the date line the PDF prints', async () => {
    await call()
    expect(buildCoverLetterDocx).toHaveBeenCalledTimes(1)
    const input = buildCoverLetterDocx.mock.calls[0][0]
    expect(input.coverLetter).toMatchObject({ opening_paragraph: `<p>${SECRET_SENTENCE}</p>`, sender_name: 'Ada Lovelace' })
    expect(input.currentDate).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/)
  })

  it('names the file after the title, with an encoded UTF-8 name and an ASCII fallback', async () => {
    const response = await call()
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="Lettre Zurich.docx"; filename*=UTF-8''Lettre%20Z%C3%BCrich.docx`,
    )
  })

  it('keeps a hostile title from splitting or breaking the header', async () => {
    state.row = letterRow({ title: 'a"b\r\nSet-Cookie: x=1\\..\\..\\evil' })
    const header = (await call()).headers.get('content-disposition') ?? ''
    expect(header).toMatch(/^[\x20-\x7e]+$/)
    const ascii = /filename="([^"]*)"/.exec(header)?.[1]
    expect(ascii).toBe('a_b Set-Cookie_ x=1_.._.._evil.docx')
  })

  it('falls back to cover-letter.docx for a title with nothing usable', async () => {
    state.row = letterRow({ title: '   ...   ' })
    expect((await call()).headers.get('content-disposition')).toBe(
      `attachment; filename="cover-letter.docx"; filename*=UTF-8''cover-letter.docx`,
    )
  })
})

describe('POST /api/cover-letters/[id]/download-docx: size guard', () => {
  const guard = COVER_LETTER_PDF_GUARD
  const over = (limit: number) => 'x'.repeat(limit + 1)

  it.each([
    ['an opening one over the rich-text guard', { opening_paragraph: over(guard.richTextField) }],
    ['a sender name one over the plain-text guard', { sender_name: over(guard.plainTextField) }],
    ['one body paragraph over the count', { body_paragraphs: Array.from({ length: guard.bodyParagraphs + 1 }, () => '<p>p</p>') }],
  ])('refuses %s with 422, before building anything', async (_case, overrides) => {
    state.row = letterRow(overrides)
    const response = await call()
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'Cover letter too large to export' })
    expect(buildCoverLetterDocx).not.toHaveBeenCalled()
  })

  it('refuses a letter within the guard but over the Word paragraph limit with 422 and no file', async () => {
    const flood = '<p>x'.repeat(4_990)
    state.row = letterRow({ opening_paragraph: flood, closing_paragraph: flood, body_paragraphs: Array(8).fill(flood) })
    const started = performance.now()
    const response = await call()
    expect(performance.now() - started).toBeLessThan(500)
    expect(response.status).toBe(422)
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(await response.json()).toEqual({ error: 'Cover letter too large to export' })
    expect(buildCoverLetterDocx).toHaveBeenCalledTimes(1)
    expectNoLetterContentLogged()
  })

  it('builds a letter exactly at the per-field guards', async () => {
    state.row = letterRow({
      sender_name: 'x'.repeat(guard.plainTextField),
      opening_paragraph: 'x'.repeat(guard.richTextField),
    })
    expect((await call()).status).toBe(200)
  })
})

describe('POST /api/cover-letters/[id]/download-docx: failures', () => {
  it('maps a build failure to a clean 500 with no file, and logs no letter content', async () => {
    buildCoverLetterDocx.mockRejectedValueOnce(new Error(`while writing ${SECRET_SENTENCE}`))
    const response = await call()
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(await response.json()).toEqual({ error: 'Failed to generate Word document' })
    expectNoLetterContentLogged()
  })

  it('maps a thrown non-error to 500 as well', async () => {
    buildCoverLetterDocx.mockImplementationOnce(() => {
      throw SECRET_SENTENCE
    })
    const response = await call()
    expect(response.status).toBe(500)
    await expectNoFile(response)
    expectNoLetterContentLogged()
  })
})

describe('POST /api/cover-letters/[id]/download-docx: the letter language', () => {
  const GERMAN =
    '<p>Mit großem Interesse habe ich Ihre Anzeige gelesen und bewerbe mich für die Stelle als Entwickler. In meiner bisherigen Erfahrung bei einer Firma habe ich die Aufgaben im Team mit Freude übernommen und bin sicher, dass ich auch Ihre Erwartungen erfülle.</p>'

  async function documentXml(response: Response): Promise<string> {
    const body = Buffer.from(await response.arrayBuffer())
    return (await JSZip.loadAsync(body)).file('word/document.xml')!.async('string')
  }

  it('writes a letter detected as German in German, whatever the page locale', async () => {
    state.row = letterRow({ opening_paragraph: GERMAN, greeting: '', sign_off: '' })
    const response = await call(LETTER_ID, request('application/json', '{"locale":"fr"}'))
    expect(response.status).toBe(200)
    expect(buildCoverLetterDocx.mock.calls[0][0].language).toBe('de')
    const xml = await documentXml(response)
    expect(xml).toContain('Bewerbung als Engineer')
    expect(xml).toContain('Sehr geehrte Damen und Herren,')
    expect(xml).toContain('Freundliche Grüsse')
    expect(xml).not.toContain('Application for')
  })

  it('follows the page locale for a letter too short to tell, keeping a stored greeting and sign-off', async () => {
    const response = await call(LETTER_ID, request('application/json', '{"locale":"it"}'))
    expect(response.status).toBe(200)
    expect(buildCoverLetterDocx.mock.calls[0][0].language).toBe('it')
    const xml = await documentXml(response)
    expect(xml).toContain('Candidatura per la posizione di Engineer')
    expect(xml).toContain('Dear team,')
    expect(xml).toContain('Sincerely,')
  })

  it('writes in English for a short letter without a supported locale, as before', async () => {
    const response = await call(LETTER_ID, request('application/json', '{"locale":"xx"}'))
    expect(response.status).toBe(200)
    expect(buildCoverLetterDocx.mock.calls[0][0].language).toBe('en')
    expect(buildCoverLetterDocx.mock.calls[0][0].currentDate).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/)
    expect(await documentXml(response)).toContain('Application for Engineer')
  })

  it('refuses a body that is not JSON with 400 and builds nothing', async () => {
    const response = await call(LETTER_ID, request('application/json', '{'))
    expect(response.status).toBe(400)
    await expectNoFile(response)
    expect(state.filters).toEqual([])
    expect(buildCoverLetterDocx).not.toHaveBeenCalled()
  })

  it('refuses a body over the cap with 413, before reading the letter, and accepts one exactly at it', async () => {
    const padded = (bytes: number) => {
      const shell = '{"locale":"it","pad":""}'
      return `{"locale":"it","pad":"${'x'.repeat(bytes - shell.length)}"}`
    }
    expect(padded(MAX_COVER_LETTER_EXPORT_REQUEST_BYTES)).toHaveLength(MAX_COVER_LETTER_EXPORT_REQUEST_BYTES)

    const over = await call(LETTER_ID, request('application/json', padded(MAX_COVER_LETTER_EXPORT_REQUEST_BYTES + 1)))
    expect(over.status).toBe(413)
    expect(await over.clone().json()).toEqual({ error: 'Payload too large' })
    await expectNoFile(over)
    expect(state.filters).toEqual([])
    expect(buildCoverLetterDocx).not.toHaveBeenCalled()

    expect((await call(LETTER_ID, request('application/json', padded(MAX_COVER_LETTER_EXPORT_REQUEST_BYTES)))).status).toBe(200)
    expect(buildCoverLetterDocx.mock.calls[0][0].language).toBe('it')
  })

  it('checks the session and the content type before reading the body', async () => {
    const oversized = 'x'.repeat(MAX_COVER_LETTER_EXPORT_REQUEST_BYTES + 1)
    expect((await call(LETTER_ID, request('text/plain', oversized))).status).toBe(415)
    state.user = null
    expect((await call(LETTER_ID, request('application/json', oversized))).status).toBe(401)
  })
})
