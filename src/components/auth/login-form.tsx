'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getBaseUrl } from '@/lib/url'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { Locale } from '@/lib/i18n'

interface LoginFormProps {
  locale: Locale
}

/**
 * Origin used only to resolve a candidate destination during validation. It is
 * never navigated to and never returned; it exists so the URL parser - the
 * thing that decides where the browser actually goes - can be asked directly
 * whether a candidate stays on our own origin.
 */
const VALIDATION_ORIGIN = 'http://callback-validation.invalid'

/**
 * Characters a URL parser removes *before* it parses. Any check against the
 * literal string has to remove them first, or it is validating a string the
 * browser will never see.
 */
const URL_STRIPPED_CHARACTERS = /[\t\n\r]/g

/**
 * True if `value` is a relative path that cannot open a URL authority.
 *
 * The second character decides as much as the first: '//' opens an authority,
 * and '\' is folded to '/' before that decision is made.
 *
 * This is applied to the string that will actually be navigated - which is not
 * necessarily the string that was validated. See `getSafeRedirectUrl`.
 */
function isSingleSlashRelativePath(value: string): boolean {
  return value.startsWith('/') && value[1] !== '/' && value[1] !== '\\'
}

/**
 * Validates and returns a safe redirect URL.
 * Only allows single-slash relative paths, to prevent open redirect attacks.
 * Returns the fallback URL if validation fails.
 *
 * A literal `startsWith('/') && !startsWith('//')` test is not equivalent to
 * "stays on this origin". Five strings defeat it, all verified by execution
 * against this app:
 *
 *   /\evil.test     one leading slash, so it passes a literal check - but
 *                   WHATWG URL parsing treats '\' as '/' in a special-scheme
 *                   URL, so the browser resolves it to http://evil.test/.
 *   /\\evil.test    the same fold, doubled.
 *   /<TAB>/…        a raw tab, reaching this function decoded from %09 in the
 *   /<LF>/…         query string. A URL parser strips tab, newline and
 *   /<CR>/…         carriage return BEFORE parsing, so what a literal check
 *                   sees and what the browser resolves are two different
 *                   strings - and the one the browser resolves is the
 *                   protocol-relative //evil.test.
 *
 * Note the literal three-character text "%09" is NOT this bug: it survives as
 * a percent-encoded path segment and stays on our origin, so it stays allowed.
 *
 * THE RETURNED STRING IS THE THING THAT GETS NAVIGATED, so it is the thing
 * that must satisfy the rule. Validating the parsed URL is not enough, because
 * this function returns a *different representation* of it - a path string,
 * re-resolved later by the router. Dot-segment normalization can turn a
 * genuinely same-origin URL into a pathname that begins with '//':
 *
 *   /.//evil.test   parses same-origin (the single leading slash makes it
 *   /..//evil.test  path-relative, so an origin check passes honestly), yet
 *                   `resolved.pathname` is "//evil.test" - protocol-relative
 *                   all over again once anything resolves it.
 *
 * An earlier version of this function checked only the parsed URL and shipped
 * exactly that hole: safe on all six dot-segment inputs before, escaping on
 * all six after. Hence the final re-check on the reconstructed value.
 */
function getSafeRedirectUrl(callbackUrl: string | null, fallbackUrl: string): string {
  if (!callbackUrl) {
    return fallbackUrl
  }

  const candidate = callbackUrl.replace(URL_STRIPPED_CHARACTERS, '')

  if (!isSingleSlashRelativePath(candidate)) {
    return fallbackUrl
  }

  // The parser gets a say, so anything the check above did not anticipate
  // still has to resolve to our own origin.
  let resolved: URL
  try {
    resolved = new URL(candidate, VALIDATION_ORIGIN)
  } catch {
    return fallbackUrl
  }

  if (resolved.origin !== VALIDATION_ORIGIN) {
    return fallbackUrl
  }

  // Re-check what was reconstructed, not what was parsed.
  const destination = `${resolved.pathname}${resolved.search}${resolved.hash}`
  if (!isSingleSlashRelativePath(destination)) {
    return fallbackUrl
  }

  return destination
}

export function LoginForm({ locale }: LoginFormProps) {
  const { t } = useTranslation('common')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
    password?: string
  }>({})

  const validateForm = () => {
    const errors: typeof fieldErrors = {}

    if (!formData.email.trim()) {
      errors.email = t('auth.errors.emailRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = t('auth.errors.invalidEmail')
    }

    if (!formData.password) {
      errors.password = t('auth.errors.passwordRequired')
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError(t('auth.errors.invalidCredentials'))
        } else {
          setError(signInError.message || t('auth.errors.loginFailed'))
        }
        return
      }

      if (data.user) {
        const defaultRedirect = `/${locale}/dashboard`
        const callbackUrl = searchParams.get('callbackUrl')
        const redirectUrl = getSafeRedirectUrl(callbackUrl, defaultRedirect)
        router.push(redirectUrl)
        router.refresh()
      }
    } catch (err) {
      setError(t('auth.errors.loginFailed'))
      console.error('Login error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthLogin = async (provider: 'google') => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Build callback URL with locale-aware redirect
      // Use the callbackUrl from query params if provided, otherwise default to dashboard
      const defaultRedirect = `/${locale}/dashboard`
      const requestedCallback = searchParams.get('callbackUrl')
      const nextUrl = getSafeRedirectUrl(requestedCallback, defaultRedirect)

      const authCallbackUrl = new URL('/api/auth/callback', getBaseUrl())
      authCallbackUrl.searchParams.set('next', nextUrl)

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: authCallbackUrl.toString(),
        },
      })

      if (error) {
        setError(error.message || t('auth.errors.loginFailed'))
      }
    } catch (err) {
      setError(t('auth.errors.loginFailed'))
      console.error('OAuth login error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            {t('auth.login.title')}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('auth.login.subtitle')}
          </p>
        </div>

        {/* OAuth Buttons */}
        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => handleOAuthLogin('google')}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {t('auth.login.googleLogin')}
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-4 text-slate-500">
              {t('auth.login.divider')}
            </span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              {t('auth.login.email')}
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className={`mt-1 block w-full rounded-lg border ${
                fieldErrors.email
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:border-teal-500 focus:ring-teal-500'
              } bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm`}
              placeholder="john@example.com"
              disabled={isLoading}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                {t('auth.login.password')}
              </label>
              <Link
                href={`/${locale}/forgot-password`}
                className="text-xs font-medium text-teal-600 hover:text-teal-500"
              >
                {t('auth.login.forgotPassword')}
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className={`mt-1 block w-full rounded-lg border ${
                fieldErrors.password
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:border-teal-500 focus:ring-teal-500'
              } bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm`}
              placeholder="••••••••"
              disabled={isLoading}
            />
            {fieldErrors.password && (
              <p className="mt-1 text-sm text-red-600">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </form>

        {/* Sign Up Link */}
        <p className="mt-6 text-center text-sm text-slate-600">
          {t('auth.login.noAccount')}{' '}
          <Link
            href={`/${locale}/signup`}
            className="font-medium text-teal-600 hover:text-teal-500"
          >
            {t('auth.login.signupLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
