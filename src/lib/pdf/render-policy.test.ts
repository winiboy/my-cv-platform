import { describe, expect, it } from 'vitest'
import { isAllowedRendererRequest, resolveRenderOrigin, selectSessionCookies } from './render-policy'

const APP = 'https://cv.example.test'

describe('resolveRenderOrigin', () => {
  const origin = (
    appUrl: string | undefined,
    authUrl: string | undefined,
    vercelEnv?: string,
    vercelUrl?: string,
  ) => resolveRenderOrigin({ appUrl, authUrl, vercelEnv, vercelUrl })

  it('prefers NEXT_PUBLIC_APP_URL and keeps only its origin', () => {
    expect(origin('https://cv.example.test/some/path?q=1#x', 'https://other.example.test')).toBe(APP)
  })

  it('falls back to NEXTAUTH_URL', () => {
    expect(origin(undefined, 'http://127.0.0.1:3100/')).toBe('http://127.0.0.1:3100')
    expect(origin('', 'http://127.0.0.1:3100')).toBe('http://127.0.0.1:3100')
  })

  it.each([
    ['nothing configured', undefined, undefined],
    ['a malformed URL', 'not a url', undefined],
    ['a file URL', 'file:///etc/passwd', undefined],
    ['a javascript URL', 'javascript:alert(1)', undefined],
    ['credentials in the URL', 'https://user:pass@cv.example.test', undefined],
  ])('fails closed on %s', (_label, appUrl, authUrl) => {
    expect(origin(appUrl, authUrl)).toBeNull()
  })

  describe('on a Vercel preview deployment', () => {
    const PRODUCTION = 'https://cv.example.test'

    it("renders from this deployment's own URL, over https, not the build-time app URL", () => {
      expect(origin(PRODUCTION, PRODUCTION, 'preview', 'my-cv-platform-abc123-team.vercel.app')).toBe(
        'https://my-cv-platform-abc123-team.vercel.app',
      )
    })

    it('keeps the configured origin on production, in development and off Vercel', () => {
      expect(origin(PRODUCTION, undefined, 'production', 'my-cv-platform-abc123-team.vercel.app')).toBe(PRODUCTION)
      expect(origin(PRODUCTION, undefined, 'development', 'my-cv-platform-abc123-team.vercel.app')).toBe(PRODUCTION)
      expect(origin(PRODUCTION, undefined, undefined, 'my-cv-platform-abc123-team.vercel.app')).toBe(PRODUCTION)
    })

    it('keeps the configured origin on a preview with no VERCEL_URL', () => {
      expect(origin(PRODUCTION, undefined, 'preview', undefined)).toBe(PRODUCTION)
      expect(origin(PRODUCTION, undefined, 'preview', '')).toBe(PRODUCTION)
    })

    it.each([
      ['a scheme', 'https://evil.test'],
      ['a path', 'my-app.vercel.app/evil'],
      ['credentials', 'user:pass@my-app.vercel.app'],
      ['another host behind credentials', 'my-app.vercel.app@evil.test'],
      ['a port', 'my-app.vercel.app:8443'],
      ['a query', 'my-app.vercel.app?x=1'],
      ['a fragment', 'my-app.vercel.app#x'],
      ['whitespace', 'my-app.vercel.app evil.test'],
      ['a backslash', 'my-app.vercel.app\\evil.test'],
    ])('fails closed, without falling back, on a VERCEL_URL with %s', (_label, vercelUrl) => {
      expect(origin(PRODUCTION, PRODUCTION, 'preview', vercelUrl)).toBeNull()
    })
  })
})

describe('isAllowedRendererRequest', () => {
  const allowed = (url: string, method = 'GET', resourceType = 'document') =>
    isAllowedRendererRequest({ url, method, resourceType }, APP)

  it("allows reads of the app's own origin", () => {
    expect(allowed(`${APP}/en/dashboard/resumes/1/preview`)).toBe(true)
    expect(allowed(`${APP}/_next/static/chunks/main.js`, 'GET', 'script')).toBe(true)
    expect(allowed(`${APP}/_next/static/media/inter.woff2`, 'HEAD', 'font')).toBe(true)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])("refuses a %s to the app's own origin", (method) => {
    expect(allowed(`${APP}/api/resumes/1`, method, 'fetch')).toBe(false)
  })

  it('refuses another port, scheme or subdomain of the app host', () => {
    expect(allowed('https://cv.example.test:8443/')).toBe(false)
    expect(allowed('http://cv.example.test/')).toBe(false)
    expect(allowed('https://evil.cv.example.test/')).toBe(false)
    expect(allowed('https://cv.example.test.evil.test/')).toBe(false)
  })

  it('refuses credentials smuggled into an app URL', () => {
    expect(allowed('https://user:pass@cv.example.test/')).toBe(false)
  })

  it.each([
    ['Supabase', 'https://abcd.supabase.co/rest/v1/resumes', 'fetch'],
    ['a remote image', 'https://example.com/x.png', 'image'],
    ['a remote frame', 'https://example.com/', 'document'],
    ['Sentry', 'https://o1.ingest.de.sentry.io/api/1/envelope/', 'fetch'],
    ['a loopback listener on another port', 'http://127.0.0.1:9999/x.png', 'image'],
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/', 'fetch'],
  ])('refuses %s', (_label, url, resourceType) => {
    expect(allowed(url, 'GET', resourceType)).toBe(false)
  })

  it.each([
    'file:///C:/Windows/win.ini',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'chrome://settings',
    'javascript:alert(1)',
    'not a url',
  ])('refuses %s', (url) => {
    expect(allowed(url, 'GET', 'image')).toBe(false)
  })

  it('allows inline data and blob URLs, which never reach the network', () => {
    expect(allowed('data:image/png;base64,QUJD', 'GET', 'image')).toBe(true)
    expect(allowed(`blob:${APP}/0b5f6a8e`, 'GET', 'image')).toBe(true)
  })

  describe('the font picker exception', () => {
    it('allows the Google Fonts stylesheet and font files, for those resource types only', () => {
      expect(allowed('https://fonts.googleapis.com/css2?family=Roboto', 'GET', 'stylesheet')).toBe(true)
      expect(allowed('https://fonts.gstatic.com/s/roboto/v30/a.woff2', 'GET', 'font')).toBe(true)
    })

    it('refuses anything else on those hosts', () => {
      expect(allowed('https://fonts.googleapis.com/css2?family=Roboto', 'GET', 'script')).toBe(false)
      expect(allowed('https://fonts.googleapis.com/icon?family=x', 'GET', 'stylesheet')).toBe(false)
      expect(allowed('https://fonts.gstatic.com/s/roboto/v30/a.woff2', 'GET', 'image')).toBe(false)
      expect(allowed('https://fonts.gstatic.com/other/a.woff2', 'GET', 'font')).toBe(false)
      expect(allowed('https://fonts.googleapis.com/css2?family=Roboto', 'POST', 'stylesheet')).toBe(false)
      expect(allowed('http://fonts.googleapis.com/css2?family=Roboto', 'GET', 'stylesheet')).toBe(false)
    })
  })
})

describe('selectSessionCookies', () => {
  it('forwards the Supabase session cookie, chunked or not, and nothing else', () => {
    const selected = selectSessionCookies([
      { name: 'sb-127-auth-token', value: 'base64-a' },
      { name: 'sb-abcdefgh-auth-token.0', value: 'base64-b' },
      { name: 'sb-abcdefgh-auth-token.1', value: 'c' },
      { name: 'sb-abcdefgh-auth-token-code-verifier', value: 'verifier' },
      { name: 'sb-abcdefgh-auth-token.x', value: 'x' },
      { name: 'NEXT_LOCALE', value: 'fr' },
      { name: '_ga', value: 'tracking' },
      { name: 'sb-127-auth-token', value: '' },
    ])
    expect(selected).toEqual([
      { name: 'sb-127-auth-token', value: 'base64-a' },
      { name: 'sb-abcdefgh-auth-token.0', value: 'base64-b' },
      { name: 'sb-abcdefgh-auth-token.1', value: 'c' },
    ])
  })
})
