'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { Locale } from '@/lib/i18n'

interface ForgotPasswordFormProps {
  locale: Locale
}

/**
 * Request a recovery email.
 *
 * WHY THIS POSTS TO OUR OWN ROUTE INSTEAD OF CALLING SUPABASE DIRECTLY
 * `supabase.auth.resetPasswordForEmail` would work from here, and the rate
 * limit would then be enforced nowhere: this code runs in the caller's browser.
 * `POST /api/auth/password-reset` exists so the limit can exist. See that
 * route's documentation for the rest.
 *
 * WHY THE SUCCESS PANEL SAYS "IF AN ACCOUNT EXISTS"
 * Because this component has no idea whether one does, and must not. The route
 * answers 202 for every well-formed request; there is no branch here that could
 * word the message differently for a registered address, because there is no
 * information here to branch on. The awkward phrasing is the feature — a
 * friendlier "we've sent you an email" would be a lie in one of the two cases
 * and, worse, would tell an attacker which case they were in the moment anyone
 * made it accurate.
 *
 * THE ONE RESPONSE THAT IS TREATED DIFFERENTLY, AND WHY THAT IS SAFE
 * A 429 shows a throttle message rather than the success panel. That does not
 * leak anything about any account: the refusal is decided by the caller's own
 * request count before the address is even read, so it is a statement about the
 * caller, not about the address. Hiding it behind the success panel would leave
 * a user waiting for mail that was never requested.
 */
export function ForgotPasswordForm({ locale }: ForgotPasswordFormProps) {
  const { t } = useTranslation('common')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  /**
   * Client-side shape check only, with the same expression the login and signup
   * forms use. It is a courtesy to the user, not a control: the route validates
   * independently and does not trust anything decided here.
   */
  const validate = (): boolean => {
    if (!email.trim()) {
      setFieldError(t('auth.errors.emailRequired'))
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError(t('auth.errors.invalidEmail'))
      return false
    }
    setFieldError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validate()) {
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The locale travels with the request because it decides where the
        // recovery link lands. Taken from the route segment this page was
        // rendered for, so a user who started in French comes back to French.
        body: JSON.stringify({ email: email.trim(), locale }),
      })

      if (response.status === 429) {
        setError(t('auth.errors.resetRequestThrottled'))
        return
      }

      if (!response.ok) {
        setError(t('auth.errors.resetRequestFailed'))
        return
      }

      setIsSubmitted(true)
    } catch {
      // A network failure, not a server answer. Nothing about it is
      // address-dependent, so reporting it does not weaken the property above.
      setError(t('auth.errors.resetRequestFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900">
              {t('auth.forgotPassword.sentTitle')}
            </h1>
            <p className="mt-4 text-sm text-slate-600">
              {t('auth.forgotPassword.sentBody')}
            </p>
            <p className="mt-3 text-sm text-slate-500">
              {t('auth.forgotPassword.sentHint')}
            </p>
          </div>

          <p className="mt-8 text-center text-sm">
            <Link
              href={`/${locale}/login`}
              className="font-medium text-teal-600 hover:text-teal-500"
            >
              {t('auth.forgotPassword.backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            {t('auth.forgotPassword.title')}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('auth.forgotPassword.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              {t('auth.forgotPassword.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'email-error' : undefined}
              className={`mt-1 block w-full rounded-lg border ${
                fieldError
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:border-teal-500 focus:ring-teal-500'
              } bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm`}
              placeholder="john@example.com"
              disabled={isLoading}
            />
            {fieldError && (
              <p id="email-error" className="mt-1 text-sm text-red-600">
                {fieldError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading
              ? t('auth.forgotPassword.submitting')
              : t('auth.forgotPassword.submit')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link
            href={`/${locale}/login`}
            className="font-medium text-teal-600 hover:text-teal-500"
          >
            {t('auth.forgotPassword.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  )
}
