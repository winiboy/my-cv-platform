import { isAllowedRendererRequest } from './render-policy'

/**
 * The request handler the PDF renderer installs on its browser context: every
 * request the Preview page makes passes through it.
 *
 * WHY THE RESPONSE IS FETCHED HERE RATHER THAN THE REQUEST CONTINUED
 *
 * Request interception sees only the FIRST URL of a redirect chain. A request
 * the policy allows — a same-origin GET — that is answered with a 3xx is then
 * followed by the browser to wherever `Location` points, and that next hop is
 * never shown to the handler. Measured with Chromium through Playwright: a
 * redirect fulfilled from the handler is followed without the follow-up being
 * intercepted either, so checking the first `Location` and passing the
 * response on would still let a second hop leave the origin unchecked.
 *
 * So the handler fetches allowed requests itself, with redirects disabled,
 * and refuses ANY redirect response. The Preview page and its assets are
 * served directly — no redirect is part of rendering it (the e2e suite renders
 * every template through this handler) — so a redirect here is either a
 * misconfiguration or an attempt to steer the renderer, and the render fails
 * loudly instead of following it.
 *
 * Typed structurally, against only the members used, so the handler can be
 * tested with a fake route and this module does not import Playwright.
 */

export interface GuardedRequest {
  url(): string
  method(): string
  resourceType(): string
  headers(): Record<string, string>
}

export interface FetchedResponse {
  status(): number
}

export interface GuardedRoute<Response extends FetchedResponse> {
  request(): GuardedRequest
  fetch(options: { maxRedirects: number; headers?: Record<string, string> }): Promise<Response>
  fulfill(options: { response: Response }): Promise<void>
  abort(errorCode: 'blockedbyclient' | 'failed'): Promise<void>
}

/**
 * Whether a response status sends the browser elsewhere. `304 Not Modified`
 * is the one 3xx that does not: it is answered from the cache, at the same URL.
 */
export function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400 && status !== 304
}

/** Vercel's header for "Protection Bypass for Automation". */
export const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass'

export interface RendererRouteOptions {
  /**
   * Vercel's `VERCEL_AUTOMATION_BYPASS_SECRET`, when the deployment is behind
   * Deployment Protection. The renderer is a browser with no Vercel login, so
   * without it a protected preview answers the renderer's own page request
   * with Vercel's login wall instead of the Preview.
   *
   * Added here, by the server-side fetch, to requests for the app's own origin
   * only — never to the font hosts, which `extraHTTPHeaders` would have sent
   * it to. The page's scripts never see it: the header is set outside the
   * page, on a request the browser has already handed over.
   */
  protectionBypassSecret?: string
}

/** The handler for one browser context, bound to the app's trusted origin. */
export function createRendererRouteHandler<Response extends FetchedResponse>(
  appOrigin: string,
  { protectionBypassSecret }: RendererRouteOptions = {},
) {
  return async (route: GuardedRoute<Response>): Promise<void> => {
    const request = route.request()
    const allowed = isAllowedRendererRequest(
      { url: request.url(), method: request.method(), resourceType: request.resourceType() },
      appOrigin,
    )
    if (!allowed) return route.abort('blockedbyclient')

    let response: Response
    try {
      response = await route.fetch(fetchOptions(request, appOrigin, protectionBypassSecret))
    } catch {
      // The server could not be reached, or the render is being torn down at
      // its deadline. The request fails as a network error would, rather than
      // being left pending; once the context is closed, aborting can fail too.
      return route.abort('failed').catch(() => undefined)
    }
    if (isRedirectStatus(response.status())) return route.abort('blockedbyclient')
    return route.fulfill({ response })
  }
}

/**
 * Redirects refused, as always; the bypass header added for the app's own
 * origin only. Without a secret the request's headers are left exactly as the
 * browser sent them, so a deployment with no protection fetches as it did
 * before the option existed.
 */
function fetchOptions(
  request: GuardedRequest,
  appOrigin: string,
  protectionBypassSecret: string | undefined,
): { maxRedirects: number; headers?: Record<string, string> } {
  if (!protectionBypassSecret || new URL(request.url()).origin !== appOrigin) return { maxRedirects: 0 }
  return {
    maxRedirects: 0,
    headers: { ...request.headers(), [VERCEL_PROTECTION_BYPASS_HEADER]: protectionBypassSecret },
  }
}
