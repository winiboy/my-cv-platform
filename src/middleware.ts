import { NextRequest, NextResponse } from 'next/server'
import { locales, defaultLocale } from './lib/i18n'
import { updateSession } from './lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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
    const newUrl = new URL(`/${detectedLocale}${pathname}${request.nextUrl.search}`, request.url)

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
      // Not authenticated - redirect to login
      const loginUrl = new URL(`/${locale}/login`, request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next|monitoring|.*\\..*).*)'],
}
