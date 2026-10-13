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
  const response: FakeResponse = { status: () => answer.status, headers: answer.headers ?? {} }
  const route: GuardedRoute<FakeResponse> = {
    request: () => ({
      url: () => request.url,
      method: () => request.method ?? 'GET',
      resourceType: () => request.resourceType ?? 'document',
    }),
    fetch: async (options) => {
      calls.push(`fetch maxRedirects=${options.maxRedirects}`)
      return response
    },
    fulfill: async (options) => {
      calls.push(`fulfill ${options.response.status()}`)
    },
    abort: async (code) => {
      calls.push(`abort ${code}`)
    },
  }
  return { route, calls }
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
})

describe('isRedirectStatus', () => {
  it.each([300, 301, 302, 303, 305, 307, 308])('%s is a redirect', (status) => {
    expect(isRedirectStatus(status)).toBe(true)
  })

  it.each([200, 299, 304, 400, 404, 500])('%s is not', (status) => {
    expect(isRedirectStatus(status)).toBe(false)
  })
})
