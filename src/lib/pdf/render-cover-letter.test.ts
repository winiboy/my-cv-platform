import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import { sanitizeRichHtml } from '@/lib/rich-html-sanitizer'

/**
 * The cover-letter renderer with the browser faked: what the context is
 * allowed, that rich text is sanitized by the editor's own function before any
 * markup reaches the page, what the page is given, how failures are staged and
 * that the browser is always closed. The real print is covered by
 * `e2e/cover-letter-pdf-export.spec.ts`.
 */

const runtime = vi.fn<() => 'local' | 'serverless'>(() => 'local')
const close = vi.fn(async () => undefined)
const launch = vi.fn<() => Promise<unknown>>()

interface Recorded {
  contextOptions: Record<string, unknown> | null
  routeHandler: ((route: { abort: (code: string) => Promise<void> }) => unknown) | null
  webSocketHandler: ((socket: { close: () => Promise<void> }) => unknown) | null
  contents: string[]
  evaluated: Array<{ fn: unknown; arg: unknown }>
  pdfOptions: Record<string, unknown> | null
}

const recorded: Recorded = {
  contextOptions: null,
  routeHandler: null,
  webSocketHandler: null,
  contents: [],
  evaluated: [],
  pdfOptions: null,
}

/** What the fake page answers; each test can make one step fail. */
const behaviour: {
  sanitize: (html: string) => string
  failSetContentAt: number | null
  failingSubstitutes: number
  pdf: () => Promise<Buffer>
} = {
  sanitize: (html) => `[clean:${html}]`,
  failSetContentAt: null,
  failingSubstitutes: 0,
  pdf: async () => Buffer.from('%PDF-1.4 fake'),
}

function fakePage() {
  return {
    setContent: async (html: string) => {
      recorded.contents.push(html)
      if (behaviour.failSetContentAt === recorded.contents.length) throw new Error('setContent failed')
    },
    evaluate: async (fn: unknown, arg?: unknown) => {
      recorded.evaluated.push({ fn, arg })
      if (fn === sanitizeRichHtml) return behaviour.sanitize(arg as string)
      // The substitute check passes its families; the font settle passes nothing.
      if (Array.isArray(arg)) return behaviour.failingSubstitutes
      return undefined
    },
    emulateMedia: async () => undefined,
    pdf: async (options: Record<string, unknown>) => {
      recorded.pdfOptions = options
      return behaviour.pdf()
    },
  }
}

function fakeBrowser() {
  const context = {
    setDefaultTimeout: () => undefined,
    setDefaultNavigationTimeout: () => undefined,
    route: async (_pattern: string, handler: Recorded['routeHandler']) => {
      recorded.routeHandler = handler
    },
    routeWebSocket: async (_pattern: RegExp, handler: Recorded['webSocketHandler']) => {
      recorded.webSocketHandler = handler
    },
    newPage: async () => fakePage(),
  }
  return {
    newContext: async (options: Record<string, unknown>) => {
      recorded.contextOptions = options
      return context
    },
    close,
  }
}

vi.mock('./browser', () => ({
  launchPdfBrowser: () => launch(),
  pdfBrowserRuntime: () => runtime(),
}))

const FACES = [{ family: 'Georgia', weight: 400, style: 'normal', unicodeRange: 'U+0000-00FF', source: 'url(data:font/woff2;base64,AA==) format(\'woff2\')' }]
const serverlessFontSubstitutes = vi.fn(async () => FACES)
vi.mock('./font-substitutes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./font-substitutes')>()),
  serverlessFontSubstitutes: () => serverlessFontSubstitutes(),
}))

const {
  renderCoverLetterPdf,
  buildCoverLetterPdfDocument,
  richTextFields,
  sanitizedLookup,
  fontFaceCss,
  COVER_LETTER_PRINT_CSS,
} = await import('./render-cover-letter')

const LETTER: CoverLetterPdfFields = {
  sender_name: 'Ada Lovelace',
  recipient_name: 'Charles Babbage',
  recipient_title: 'Head of Engineering',
  company_name: 'Analytical Engines SA',
  company_address: '12 Rue du Calcul',
  job_title: 'Engineer',
  greeting: 'Dear Mr. Babbage,',
  opening_paragraph: '<p>Opening <strong>bold</strong></p>',
  body_paragraphs: ['<p>Body one</p>', '<p>Body two</p>'],
  closing_paragraph: '<p>Closing</p>',
  sign_off: 'Sincerely,',
}

const INPUT = { coverLetter: LETTER, currentDate: 'October 25, 2026', timeoutMs: 5_000 }

beforeEach(() => {
  recorded.contextOptions = null
  recorded.routeHandler = null
  recorded.webSocketHandler = null
  recorded.contents = []
  recorded.evaluated = []
  recorded.pdfOptions = null
  behaviour.sanitize = (html) => `[clean:${html}]`
  behaviour.failSetContentAt = null
  behaviour.failingSubstitutes = 0
  behaviour.pdf = async () => Buffer.from('%PDF-1.4 fake')
  close.mockClear()
  launch.mockReset()
  launch.mockImplementation(async () => fakeBrowser())
  serverlessFontSubstitutes.mockClear()
})

afterEach(() => {
  runtime.mockReturnValue('local')
  vi.useRealTimers()
})

describe('renderCoverLetterPdf: isolation', () => {
  it('disables page scripts, blocks service workers and downloads', async () => {
    await renderCoverLetterPdf(INPUT)
    expect(recorded.contextOptions).toMatchObject({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      acceptDownloads: false,
    })
  })

  it('aborts every request the page makes', async () => {
    await renderCoverLetterPdf(INPUT)
    const abort = vi.fn(async () => undefined)
    await recorded.routeHandler?.({ abort })
    expect(abort).toHaveBeenCalledWith('blockedbyclient')
  })

  it('closes every WebSocket, as the resume renderer does', async () => {
    await renderCoverLetterPdf(INPUT)
    const close = vi.fn(async () => undefined)
    await recorded.webSocketHandler?.({ close })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('never navigates: the page is a set document', async () => {
    await renderCoverLetterPdf(INPUT)
    expect(recorded.contents).toHaveLength(2)
    expect(recorded.contents[0]).not.toContain('Ada Lovelace')
  })
})

describe('renderCoverLetterPdf: sanitizing', () => {
  it('sanitizes every rich-text field with the editor sanitizer before the letter is set', async () => {
    await renderCoverLetterPdf(INPUT)
    const sanitized = recorded.evaluated.filter(({ fn }) => fn === sanitizeRichHtml).map(({ arg }) => arg)
    expect(sanitized).toEqual([
      '<p>Opening <strong>bold</strong></p>',
      '<p>Body one</p>',
      '<p>Body two</p>',
      '<p>Closing</p>',
    ])

    const letter = recorded.contents[1]
    expect(letter).toContain('[clean:<p>Opening <strong>bold</strong></p>]')
    expect(letter).toContain('[clean:<p>Body one</p>]')
    expect(letter).toContain('[clean:<p>Body two</p>]')
    expect(letter).toContain('[clean:<p>Closing</p>]')
  })

  it('prints what the sanitizer returned, not the stored markup', async () => {
    behaviour.sanitize = (html) => html.replace(/<img[^>]*>/g, '')
    await renderCoverLetterPdf({
      ...INPUT,
      coverLetter: { ...LETTER, opening_paragraph: '<p>Hi</p><img src="https://evil.example/x" onerror="x()">' },
    })
    expect(recorded.contents[1]).not.toContain('evil.example')
  })

  it('escapes plain-text fields', async () => {
    await renderCoverLetterPdf({ ...INPUT, coverLetter: { ...LETTER, sender_name: '<img src=x onerror=y()>' } })
    expect(recorded.contents[1]).toContain('&lt;img src=x onerror=y()&gt;')
    expect(recorded.contents[1]).not.toContain('<img src=x')
  })
})

describe('renderCoverLetterPdf: output and failures', () => {
  it('returns the PDF printed at the stylesheet page size', async () => {
    const pdf = await renderCoverLetterPdf(INPUT)
    expect(pdf.toString()).toBe('%PDF-1.4 fake')
    expect(recorded.pdfOptions).toMatchObject({ preferCSSPageSize: true })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('fails at launch when the browser does not start', async () => {
    launch.mockRejectedValueOnce(new Error('no browser'))
    await expect(renderCoverLetterPdf(INPUT)).rejects.toMatchObject({ stage: 'launch' })
  })

  it('fails at sanitize, and closes the browser, when the blank page cannot be set', async () => {
    behaviour.failSetContentAt = 1
    await expect(renderCoverLetterPdf(INPUT)).rejects.toMatchObject({ stage: 'sanitize' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('fails at navigate when the letter cannot be set', async () => {
    behaviour.failSetContentAt = 2
    await expect(renderCoverLetterPdf(INPUT)).rejects.toMatchObject({ stage: 'navigate' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('fails at print when Chromium cannot print', async () => {
    behaviour.pdf = async () => {
      throw new Error('print failed')
    }
    await expect(renderCoverLetterPdf(INPUT)).rejects.toMatchObject({ stage: 'print' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('times out, and still closes the browser', async () => {
    behaviour.pdf = () => new Promise<Buffer>(() => undefined)
    await expect(renderCoverLetterPdf({ ...INPUT, timeoutMs: 50 })).rejects.toMatchObject({ stage: 'timeout' })
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('renderCoverLetterPdf: fonts', () => {
  it('reads no substitute off serverless', async () => {
    await renderCoverLetterPdf(INPUT)
    expect(serverlessFontSubstitutes).not.toHaveBeenCalled()
    expect(recorded.contents[1]).not.toContain('@font-face')
  })

  it('inlines the substitutes on serverless', async () => {
    runtime.mockReturnValue('serverless')
    await renderCoverLetterPdf(INPUT)
    expect(recorded.contents[1]).toContain('@font-face { font-family: "Georgia"')
  })

  it('fails at settle when a substitute did not load', async () => {
    runtime.mockReturnValue('serverless')
    behaviour.failingSubstitutes = 1
    await expect(renderCoverLetterPdf(INPUT)).rejects.toMatchObject({ stage: 'settle' })
  })

  it('fails at fonts when the substitutes cannot be read', async () => {
    runtime.mockReturnValue('serverless')
    serverlessFontSubstitutes.mockRejectedValueOnce(new Error('ENOENT'))
    await expect(renderCoverLetterPdf(INPUT)).rejects.toMatchObject({ stage: 'fonts' })
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('the printed document', () => {
  it('wraps the letter with the print stylesheet and the cover-letter page size', () => {
    const doc = buildCoverLetterPdfDocument('<div>letter</div>', [])
    expect(doc).toMatch(/^<!doctype html>/)
    expect(doc).toContain(COVER_LETTER_PRINT_CSS)
    expect(doc).toContain('<body><div>letter</div></body>')
    expect(COVER_LETTER_PRINT_CSS).toContain('@page { size: 816px 1056px;')
    expect(COVER_LETTER_PRINT_CSS).toContain('box-sizing: border-box')
    // The bullet is text (U+2022), so it is extractable with its item.
    expect(COVER_LETTER_PRINT_CSS).toContain("ul { list-style-type: '\\2022\\00a0\\00a0'; }")
    expect(COVER_LETTER_PRINT_CSS).toContain('ol { list-style-type: decimal; }')
  })

  it('lifts the template min-height and bottom padding, so only content can start a page', () => {
    expect(COVER_LETTER_PRINT_CSS).toContain(
      'body > div:first-child { min-height: 0 !important; padding-bottom: 0 !important; }',
    )
    expect(COVER_LETTER_PRINT_CSS).toContain('@page :first { margin-top: 0; }')
  })

  it('declares one @font-face per substitute face', () => {
    expect(fontFaceCss(FACES)).toBe(
      `@font-face { font-family: "Georgia"; font-style: normal; font-weight: 400; src: ${FACES[0].source}; unicode-range: U+0000-00FF; }`,
    )
  })

  it('lists each rich-text field once, skipping missing ones and non-strings', () => {
    expect(
      richTextFields({ ...LETTER, opening_paragraph: null, body_paragraphs: ['<p>a</p>', '<p>a</p>', 3, ''], closing_paragraph: '<p>c</p>' }),
    ).toEqual(['<p>a</p>', '', '<p>c</p>'])
  })

  it('refuses a field that was not sanitized', () => {
    const lookup = sanitizedLookup(new Map([['<p>a</p>', 'a']]))
    expect(lookup('<p>a</p>')).toBe('a')
    expect(() => lookup('<p>b</p>')).toThrow(/unsanitized/)
  })
})
