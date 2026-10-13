import { describe, expect, it } from 'vitest'
import { createRendererRouteHandler, isRedirectStatus, type GuardedRoute } from './route-guard'

const APP = 'https://cv.example.test'

interface FakeResponse {
  status(): number
  headers: Record<string, string>
}

/** A route whose server answers with `status` and `headers`, recording what the handler did. */
function fakeRoute(
  request: { url: string; method?: string; resourceType?: string },
  answer: { status: number; headers?: Record<string, string> } = { status: 200 },
) {
  const calls: string[] = []
  const fetched: { headers?: Record<string, string> }[] = []
  const response: FakeResponse = { status: () => answer.status, headers: answer.headers ?? {} }
  const route: GuardedRoute<FakeResponse> = {
    request: () => ({
      url: () => request.url,
      method: () => request.method ?? 'GET',
      resourceType: () => request.resourceType ?? 'document',
      headers: () => ({ accept: 'text/html', 'user-agent': 'HeadlessChrome' }),
    }),
    fetch: async (options) => {
      calls.push(`fetch maxRedirects=${options.maxRedirects}`)
      fetched.push({ headers: options.headers })
      return response
    },
    fulfill: async (options) => {
      calls.push(`fulfill ${options.response.status()}`)
    },
    abort: async (code) => {
      calls.push(`abort ${code}`)
    },
  }
  return { route, calls, fetched }
}

const handle = createRendererRouteHandler<FakeResponse>(APP)

describe('createRendererRouteHandler', () => {
  it('fetches an allowed request itself, with redirects disabled, and fulfills the page with it', async () => {
    const { route, calls } = fakeRoute({ url: `${APP}/en/dashboard/resumes/1/preview` })
    await handle(route)
    expect(calls).toEqual(['fetch maxRedirects=0', 'fulfill 200'])
  })

  it('aborts a request the policy refuses without fetching it', async () => {
    const { route, calls } = fakeRoute({ url: 'https://example.com/x.png', resourceType: 'image' })
    await handle(route)
    expect(calls).toEqual(['abort blockedbyclient'])
  })

  it('refuses a same-origin request that redirects off the origin', async () => {
    const { route, calls } = fakeRoute(
      { url: `${APP}/en/dashboard/resumes/1/preview` },
      { status: 302, headers: { location: 'https://evil.example.test/steal' } },
    )
    await handle(route)
    expect(calls).toEqual(['fetch maxRedirects=0', 'abort blockedbyclient'])
  })

  it('refuses a same-origin redirect too: the browser would follow its next hop unchecked', async () => {
    const { route, calls } = fakeRoute(
      { url: `${APP}/_next/static/chunk.js`, resourceType: 'script' },
      { status: 307, headers: { location: `${APP}/elsewhere.js` } },
    )
    await handle(route)
    expect(calls).toEqual(['fetch maxRedirects=0', 'abort blockedbyclient'])
  })

  it('refuses a font host redirect', async () => {
    const { route, calls } = fakeRoute(
      { url: 'https://fonts.googleapis.com/css2?family=Roboto', resourceType: 'stylesheet' },
      { status: 301, headers: { location: 'http://127.0.0.1:9999/' } },
    )
    await handle(route)
    expect(calls).toEqual(['fetch maxRedirects=0', 'abort blockedbyclient'])
  })

  it('fails a request whose fetch throws instead of leaving it pending', async () => {
    const { route, calls } = fakeRoute({ url: `${APP}/x` })
    route.fetch = async () => {
      throw new Error('net::ERR_CONNECTION_REFUSED')
    }
    await handle(route)
    expect(calls).toEqual(['abort failed'])
  })

  it.each([200, 204, 304, 404, 500])('passes a %s response through', async (status) => {
    const { route, calls } = fakeRoute({ url: `${APP}/x` }, { status })
    await handle(route)
    expect(calls).toEqual(['fetch maxRedirects=0', `fulfill ${status}`])
  })

  it("leaves the browser's headers untouched when no bypass secret is configured", async () => {
    const { route, fetched } = fakeRoute({ url: `${APP}/en/dashboard/resumes/1/preview` })
    await handle(route)
    expect(fetched).toEqual([{ headers: undefined }])
  })
})

describe('createRendererRouteHandler with a Vercel protection bypass secret', () => {
  const SECRET = 'bypass-secret-value'
  const handleProtected = createRendererRouteHandler<FakeResponse>(APP, { protectionBypassSecret: SECRET })

  it.each([
    [`${APP}/en/dashboard/resumes/1/preview`, 'document'],
    [`${APP}/_next/static/chunks/main.js`, 'script'],
    [`${APP}/_next/static/media/inter.woff2`, 'font'],
  ])("adds the header, keeping the browser's own headers, to the app's origin: %s", async (url, resourceType) => {
    const { route, calls, fetched } = fakeRoute({ url, resourceType })
    await handleProtected(route)
    expect(calls).toEqual(['fetch maxRedirects=0', 'fulfill 200'])
    expect(fetched).toEqual([
      { headers: { accept: 'text/html', 'user-agent': 'HeadlessChrome', 'x-vercel-protection-bypass': SECRET } },
    ])
  })

  it.each([
    ['https://fonts.googleapis.com/css2?family=Roboto', 'stylesheet'],
    ['https://fonts.gstatic.com/s/roboto/v30/x.woff2', 'font'],
  ])('never sends it to a font host: %s', async (url, resourceType) => {
    const { route, calls, fetched } = fakeRoute({ url, resourceType })
    await handleProtected(route)
    expect(calls).toEqual(['fetch maxRedirects=0', 'fulfill 200'])
    expect(fetched).toEqual([{ headers: undefined }])
  })

  it('never fetches a refused request, so the secret goes nowhere else either', async () => {
    const { route, calls, fetched } = fakeRoute({ url: 'https://evil.example.test/x', resourceType: 'image' })
    await handleProtected(route)
    expect(calls).toEqual(['abort blockedbyclient'])
    expect(fetched).toEqual([])
  })

  it('still refuses a redirect from the app origin', async () => {
    const { route, calls } = fakeRoute(
      { url: `${APP}/en/dashboard/resumes/1/preview` },
      { status: 302, headers: { location: 'https://evil.example.test/steal' } },
    )
    await handleProtected(route)
    expect(calls).toEqual(['fetch maxRedirects=0', 'abort blockedbyclient'])
  })

  it('treats an empty secret as none', async () => {
    const { route, fetched } = fakeRoute({ url: `${APP}/x` })
    await createRendererRouteHandler<FakeResponse>(APP, { protectionBypassSecret: '' })(route)
    expect(fetched).toEqual([{ headers: undefined }])
  })
})

describe('isRedirectStatus', () => {
  it.each([300, 301, 302, 303, 305, 307, 308])('%s is a redirect', (status) => {
    expect(isRedirectStatus(status)).toBe(true)
  })

  it.each([200, 299, 304, 400, 404, 500])('%s is not', (status) => {
    expect(isRedirectStatus(status)).toBe(false)
  })
})
