/**
 * OAuth Callback Route
 *
 * Handles the OAuth callback from Supabase authentication.
 * Exchanges the authorization code for a session and sets cookies.
 *
 * Flow:
 * 1. User clicks "Continue with Google/GitHub"
 * 2. Redirected to OAuth provider
 * 3. Provider redirects back to Supabase
 * 4. Supabase redirects here with authorization code
 * 5. This route exchanges code for session
 * 6. User is redirected to the final destination
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // Handle OAuth errors from provider
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    // Redirect to login with error message
    const loginUrl = new URL('/fr/login', requestUrl.origin)
    loginUrl.searchParams.set('error', errorDescription || error)
    return NextResponse.redirect(loginUrl)
  }

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options })
          },
        },
      }
    )

    // Exchange the authorization code for a session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError.message)
      // Redirect to login with error
      const loginUrl = new URL('/fr/login', requestUrl.origin)
      loginUrl.searchParams.set('error', exchangeError.message)
      return NextResponse.redirect(loginUrl)
    }

    // Get the locale from the 'next' parameter or default to 'fr'
    const nextPath = next.startsWith('/') ? next : `/${next}`
    const localeMatch = nextPath.match(/^\/(fr|en|de|it)\//)
    const locale = localeMatch ? localeMatch[1] : 'fr'

    // Construct redirect URL with locale
    let redirectUrl: URL
    if (nextPath.match(/^\/(fr|en|de|it)\//)) {
      // Already has locale
      redirectUrl = new URL(nextPath, requestUrl.origin)
    } else {
      // Add locale prefix
      redirectUrl = new URL(`/${locale}${nextPath}`, requestUrl.origin)
    }

    return NextResponse.redirect(redirectUrl)
  }

  // No code provided - redirect to home
  return NextResponse.redirect(new URL('/fr', requestUrl.origin))
}
