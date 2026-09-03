import { NextRequest, NextResponse } from 'next/server'
import { locales, defaultLocale } from './lib/i18n'
import { updateSession } from './lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Prefer env-configured base URL to avoid 0.0.0.0 issues when dev server binds to all interfaces
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin).replace(/\/+$/, '')

  // Skip API routes, static files, Next.js internals, Sentry
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/monitoring') ||
    pathname.includes('.') // static files
  ) {
    return NextResponse.next()
  }

  // Check if pathname already has a locale
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  // Handle i18n redirect if no locale in path
  if (!pathnameHasLocale) {
    // Detect locale from cookie or Accept-Language header
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
    const headerLocale = request.headers
      .get('accept-language')
      ?.split(',')[0]
      ?.split('-')[0]

    let detectedLocale = cookieLocale || headerLocale || defaultLocale

    // Validate locale
    if (!locales.includes(detectedLocale as any)) {
      detectedLocale = defaultLocale
    }

    // Redirect to /{locale}{pathname}
    const newUrl = new URL(`/${detectedLocale}${pathname}${request.nextUrl.search}`, baseUrl)

    const response = NextResponse.redirect(newUrl)

    // Set cookie to persist locale choice (1 year)
    response.cookies.set('NEXT_LOCALE', detectedLocale, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })

    return response
  }

  // Refresh Supabase session (for authenticated routes)
  const { response: supabaseResponse, user } = await updateSession(request)

  // Extract locale from pathname for protected routes
  const locale = locales.find((l) => pathname.startsWith(`/${l}/`)) || defaultLocale

  // Protected routes: /dashboard/*
  const protectedRoutes = ['/dashboard']
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(`/${locale}${route}`)
  )

  if (isProtectedRoute) {
    // Check if user is authenticated
    if (!user) {
      // Not authenticated - redirect to login, remembering where they meant
      // to go.
      //
      // The parameter is `callbackUrl` because that is the one the login form
      // reads, and because the marketing tools pages already link to
      // /login?callbackUrl=... directly. This used to write `redirect`, which
      // nothing read, so every deep link was silently discarded.
      //
      // The search string travels with the path: a deep link that comes back
      // without its own query parameters has not survived the detour, it has
      // been truncated. The login form validates whatever it reads back.
      const loginUrl = new URL(`/${locale}/login`, baseUrl)
      loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`)
      return NextResponse.redirect(loginUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next|monitoring|.*\\..*).*)'],
}
