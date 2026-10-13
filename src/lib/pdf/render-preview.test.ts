import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('./font-substitutes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./font-substitutes')>()),
  serverlessFontSubstitutes: () => serverlessFontSubstitutes(),
}))

const { renderPreviewPdf } = await import('./render-preview')
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
  })

  afterEach(() => {
    runtime.mockReturnValue('local')
  })

  it('registers nothing and reads no font off serverless, so local prints keep the real fonts', async () => {
    runtime.mockReturnValue('local')
    await expect(renderPreviewPdf(INPUT)).rejects.toMatchObject({ stage: 'navigate' })
    expect(serverlessFontSubstitutes).not.toHaveBeenCalled()
    expect(initScripts).toEqual([])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('registers the substitutes for the trusted origin on serverless', async () => {
    runtime.mockReturnValue('serverless')
    await expect(renderPreviewPdf(INPUT)).rejects.toMatchObject({ stage: 'navigate' })
    expect(initScripts).toEqual([[registerFontSubstitutes, { origin: INPUT.origin, faces: FACES }]])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('fails at the fonts stage, and closes the browser, when they cannot be read', async () => {
    runtime.mockReturnValue('serverless')
    serverlessFontSubstitutes.mockRejectedValueOnce(new Error('ENOENT'))
    await expect(renderPreviewPdf(INPUT)).rejects.toMatchObject({ stage: 'fonts' })
    expect(initScripts).toEqual([])
    expect(close).toHaveBeenCalledTimes(1)
  })
})
