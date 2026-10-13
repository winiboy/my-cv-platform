/**
 * What the headless browser behind the resume PDF route may visit, and what it
 * carries there.
 *
 * Pure functions, so the policy can be tested without a browser; the renderer
 * (`render-preview.ts`) applies them to every request the page makes.
 */

/**
 * The origin the renderer opens the Preview page on, or `null` when none is
 * configured.
 *
 * CONFIGURED, NEVER DERIVED FROM THE REQUEST. The renderer is sent to this
 * origin carrying the user's session cookies. Taking it from `Host` or
 * `X-Forwarded-Host` would let a forged header send those cookies, and the
 * render, to a host of the caller's choosing. So it is read from the same
 * variables the auth callback and password reset already trust, in the same
 * order, and when neither is set the route fails closed instead of guessing.
 *
 * `NEXT_PUBLIC_APP_URL` is substituted at BUILD time (see the note in
 * `src/app/api/auth/password-reset/route.ts`); `NEXTAUTH_URL` is a runtime read.
 *
 * Only an http(s) URL with no credentials is accepted, and only its origin is
 * kept: a configured path, query or fragment cannot leak into the page URL.
 */
export function resolveRenderOrigin(
  appUrl: string | undefined,
  authUrl: string | undefined,
): string | null {
  const configured = appUrl || authUrl
  if (!configured) return null

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username !== '' || url.password !== '') return null
  return url.origin
}

/**
 * The Google Fonts endpoints the Preview's own `<link>` in `src/app/layout.tsx`
 * loads the font picker's families from.
 *
 * THE ONE EXCEPTION TO "THE APP'S OWN ORIGIN". The Preview draws a CV in the
 * family the user picked, and those families are only available from these
 * two hosts; without them the PDF would fall back to another font, with other
 * line breaks and possibly another page count than the user's own print.
 * Self-hosting them would change the root layout, which the PRD keeps out of
 * scope. The exception is held as narrow as it can be: GET only, the
 * stylesheet endpoint only for stylesheets, the font-file path only for fonts.
 * No resume content, cookie or credential is sent: the requests are
 * cross-origin, so the browser attaches no app cookie, and the referrer is cut
 * to the bare origin by the app's `Referrer-Policy`.
 */
const FONT_STYLESHEET_ORIGIN = 'https://fonts.googleapis.com'
const FONT_FILE_ORIGIN = 'https://fonts.gstatic.com'

/** The request as the policy sees it: Playwright's `Request` reduced to three facts. */
export interface RendererRequest {
  url: string
  method: string
  /** Playwright's `request.resourceType()`: `document`, `script`, `stylesheet`, `font`, `image`, `fetch`… */
  resourceType: string
}

const READ_METHODS = new Set(['GET', 'HEAD'])

/**
 * Whether the renderer may make this request. Everything not allowed is
 * aborted before it leaves the browser.
 *
 *   - The app's own origin, READ ONLY. A GET is all the Preview needs to load
 *     and hydrate; refusing every other method is what guarantees the render
 *     cannot write — no server action, no API mutation.
 *   - The two font endpoints above, as narrowly as described there.
 *   - Nothing else: not Supabase (so no layout or account write can be issued
 *     from the page either), not Sentry, not any URL a draft might name, and
 *     no other scheme — `file:` included.
 *
 * `data:` and `blob:` URLs never reach the network and are not intercepted by
 * the browser's request routing; they are listed so the policy states them.
 */
export function isAllowedRendererRequest(request: RendererRequest, appOrigin: string): boolean {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return false
  }

  if (url.protocol === 'data:' || url.protocol === 'blob:') return true
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false

  const method = request.method.toUpperCase()
  if (!READ_METHODS.has(method)) return false

  if (url.origin === appOrigin) return true

  if (url.origin === FONT_STYLESHEET_ORIGIN) {
    return request.resourceType === 'stylesheet' && (url.pathname === '/css' || url.pathname === '/css2')
  }
  if (url.origin === FONT_FILE_ORIGIN) {
    return request.resourceType === 'font' && url.pathname.startsWith('/s/')
  }
  return false
}

/**
 * The Supabase session cookie, as `@supabase/ssr` names it:
 * `sb-<project-ref>-auth-token`, split into `.0`, `.1`… when it is large.
 * The PKCE `-code-verifier` cookie is deliberately not matched.
 */
const SUPABASE_SESSION_COOKIE = /^sb-[A-Za-z0-9_-]+-auth-token(?:\.\d+)?$/

export interface NamedCookie {
  name: string
  value: string
}

/**
 * The cookies the renderer needs to open the user's own Preview page: the
 * Supabase session and nothing else. Any other cookie the request carried is
 * not the renderer's business and is not forwarded.
 */
export function selectSessionCookies(cookies: readonly NamedCookie[]): NamedCookie[] {
  return cookies
    .filter((cookie) => SUPABASE_SESSION_COOKIE.test(cookie.name) && cookie.value !== '')
    .map(({ name, value }) => ({ name, value }))
}
