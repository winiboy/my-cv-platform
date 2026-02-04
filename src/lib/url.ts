/**
 * Returns a reliable base URL for constructing OAuth callback URLs.
 *
 * Works in both client-side (browser) and server-side (Node.js) contexts.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_APP_URL` env var (available in both environments).
 *   2. (Client) Detects `0.0.0.0` and replaces with `localhost`.
 *   3. (Client) `window.location.origin` for standard setups.
 *   4. (Server) Falls back to `http://localhost:3000` with a warning.
 */
export function getBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return envUrl.replace(/\/+$/, '')

  if (typeof window !== 'undefined') {
    const { hostname, port, protocol } = window.location
    if (hostname === '0.0.0.0') {
      return `${protocol}//localhost${port ? `:${port}` : ''}`
    }
    return window.location.origin
  }

  // Server-side fallback — should not be reached in production
  console.warn(
    '[getBaseUrl] NEXT_PUBLIC_APP_URL is not set. Falling back to http://localhost:3000. ' +
    'This will cause OAuth failures in production.'
  )
  return 'http://localhost:3000'
}
