import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from 'playwright-core'

// Which runtime the renderer believes it is on, and what it hands the page.
// The browser is faked: the page fails at navigation, which is enough to see
// what the context was given and that the browser is closed.
const runtime = vi.fn<() => 'local' | 'serverless'>(() => 'local')
const close = vi.fn(async () => undefined)
const initScripts: unknown[][] = []

function fakeBrowser() {
  const context = {
    setDefaultTimeout: () => undefined,
    setDefaultNavigationTimeout: () => undefined,
    route: async () => undefined,
    routeWebSocket: async () => undefined,
    addCookies: async () => undefined,
    addInitScript: async (...args: unknown[]) => {
      initScripts.push(args)
    },
    newPage: async () => ({
      on: () => undefined,
      goto: async () => {
        throw new Error('stop at navigation')
      },
    }),
  }
  return { newContext: async () => context, close }
}

vi.mock('./browser', () => ({
  launchPdfBrowser: async () => fakeBrowser(),
  pdfBrowserRuntime: () => runtime(),
}))

const FACES = [{ family: 'Arial', weight: 400, style: 'normal', unicodeRange: 'U+0000-00FF', source: 'url(data:x)' }]
const serverlessFontSubstitutes = vi.fn(async () => FACES)
const INTER_HYPHENS = [{ weight: 400, style: 'normal', unicodeRange: 'U+2010-2012', source: 'url(data:y)' }]
const serverlessInterHyphenSupplements = vi.fn(async () => INTER_HYPHENS)
vi.mock('./font-substitutes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./font-substitutes')>()),
  serverlessFontSubstitutes: () => serverlessFontSubstitutes(),
  serverlessInterHyphenSupplements: () => serverlessInterHyphenSupplements(),
}))

const { assertFacesLoaded, renderPreviewPdf, registerInterHyphenSupplements } = await import('./render-preview')
const { registerFontSubstitutes } = await import('./font-substitutes')

const INPUT = {
  origin: 'https://cv.example.test',
  locale: 'en' as const,
  resumeId: '00000000-0000-0000-0000-000000000001',
  sessionCookies: [],
  draft: null,
  photo: null,
  timeoutMs: 5_000,
}

describe('renderPreviewPdf: substitute fonts', () => {
  beforeEach(() => {
    initScripts.length = 0
    close.mockClear()
    serverlessFontSubstitutes.mockClear()
    serverlessInterHyphenSupplements.mockClear()
  })

  afterEach(() => {
    runtime.mockReturnValue('local')
  })

  it('registers nothing and reads no font off serverless, so local prints keep the real fonts', async () => {
    runtime.mockReturnValue('local')
    await expect(renderPreviewPdf(INPUT)).rejects.toMatchObject({ stage: 'navigate' })
    expect(serverlessFontSubstitutes).not.toHaveBeenCalled()
    expect(serverlessInterHyphenSupplements).not.toHaveBeenCalled()
    expect(initScripts).toEqual([])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('registers the substitutes for the trusted origin on serverless', async () => {
    runtime.mockReturnValue('serverless')
    await expect(renderPreviewPdf(INPUT)).rejects.toMatchObject({ stage: 'navigate' })
    expect(initScripts).toEqual([[registerFontSubstitutes, { origin: INPUT.origin, faces: FACES }]])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('reads the substitutes and Inter\'s supplements on serverless; the supplements are not an init script', async () => {
    runtime.mockReturnValue('serverless')
    await expect(renderPreviewPdf(INPUT)).rejects.toMatchObject({ stage: 'navigate' })
    expect(serverlessFontSubstitutes).toHaveBeenCalledTimes(1)
    expect(serverlessInterHyphenSupplements).toHaveBeenCalledTimes(1)
    expect(initScripts).toHaveLength(1)
  })

  it.each([
    ['the substitutes', serverlessFontSubstitutes],
    ["Inter's supplements", serverlessInterHyphenSupplements],
  ] as const)('fails at the fonts stage, and closes the browser, when %s cannot be read', async (_label, read) => {
    runtime.mockReturnValue('serverless')
    read.mockRejectedValueOnce(new Error('ENOENT'))
    await expect(renderPreviewPdf(INPUT)).rejects.toMatchObject({ stage: 'fonts' })
    expect(initScripts).toEqual([])
    expect(close).toHaveBeenCalledTimes(1)
  })
})

/** The two Page methods the registration uses; the fakes below stand for them. */
type EvaluatingPage = Pick<Page, 'evaluate' | 'evaluateHandle'>

describe("registerInterHyphenSupplements: under the page's next/font fallback family", () => {
  function fakePage(bodyFontFamily: string) {
    const handled: unknown[][] = []
    const page = {
      // The page function is not run here: it reads the body's computed font-family.
      evaluate: vi.fn(async () => bodyFontFamily),
      evaluateHandle: vi.fn(async (...args: unknown[]) => {
        handled.push(args)
        return 'handle'
      }),
    }
    return { page, handled }
  }

  it('registers every supplement under the fallback family the body lists after Inter, for the trusted origin', async () => {
    const { page, handled } = fakePage('Inter, "Inter Fallback"')
    const handle = await registerInterHyphenSupplements(page as unknown as EvaluatingPage, INPUT.origin, INTER_HYPHENS)
    expect(handle).toBe('handle')
    expect(handled).toEqual([
      [registerFontSubstitutes, { origin: INPUT.origin, faces: [{ ...INTER_HYPHENS[0], family: 'Inter Fallback' }] }],
    ])
  })

  it('registers nothing, and fails, when the body is not in next/font\'s Inter', async () => {
    const { page, handled } = fakePage('Arial, sans-serif')
    await expect(registerInterHyphenSupplements(page as unknown as EvaluatingPage, INPUT.origin, INTER_HYPHENS)).rejects.toThrow('next/font')
    expect(handled).toEqual([])
  })
})

describe('assertFacesLoaded: the faces Inter\'s supplements added', () => {
  /** A handle whose page-side count is the given answer. */
  function handleAnswering(answer: unknown): Parameters<typeof assertFacesLoaded>[0] {
    return { evaluate: vi.fn(async () => answer) } as unknown as Parameters<typeof assertFacesLoaded>[0]
  }

  it('passes when no face failed', async () => {
    await expect(assertFacesLoaded(handleAnswering(0))).resolves.toBeUndefined()
  })

  it.each([
    ['a failed face', 1],
    ['a string', '0'],
    ['undefined', undefined],
    ['null', null],
    // A number, yet `NaN > 0` is false: only an exact zero may pass.
    ['NaN', Number.NaN],
    ['an object', {}],
  ])('fails at settle for %s, rather than printing', async (_label, answer) => {
    await expect(assertFacesLoaded(handleAnswering(answer))).rejects.toMatchObject({ stage: 'settle' })
  })
})
