'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { Locale } from '@/lib/i18n'

interface SignupFormProps {
  locale: Locale
}

export function SignupForm({ locale }: SignupFormProps) {
  const { t } = useTranslation('common')
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
  })
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string
    email?: string
    password?: string
  }>({})

  const validateForm = () => {
    const errors: typeof fieldErrors = {}

    if (!formData.fullName.trim()) {
      errors.fullName = t('auth.errors.fullNameRequired')
    }

    if (!formData.email.trim()) {
      errors.email = t('auth.errors.emailRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = t('auth.errors.invalidEmail')
    }

    if (!formData.password) {
      errors.password = t('auth.errors.passwordRequired')
    } else if (formData.password.length < 8) {
      errors.password = t('auth.errors.passwordTooShort')
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

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
        },
      })

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError(t('auth.errors.userExists'))
        } else {
          setError(signUpError.message || t('auth.errors.signupFailed'))
        }
        return
      }

      if (data.user) {
        router.push(`/${locale}/dashboard`)
        router.refresh()
      }
    } catch (err) {
      setError(t('auth.errors.signupFailed'))
      console.error('Signup error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthSignup = async (provider: 'google' | 'github') => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Build callback URL with locale-aware redirect
      const callbackUrl = new URL('/api/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('next', `/${locale}/dashboard`)

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
        },
      })

      if (error) {
        setError(error.message || t('auth.errors.signupFailed'))
      }
    } catch (err) {
      setError(t('auth.errors.signupFailed'))
      console.error('OAuth signup error:', err)
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
            {t('auth.signup.title')}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('auth.signup.subtitle')}
          </p>
        </div>

        {/* OAuth Buttons */}
        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => handleOAuthSignup('google')}
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
            {t('auth.signup.googleSignup')}
          </button>

          <button
            type="button"
            onClick={() => handleOAuthSignup('github')}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
            {t('auth.signup.githubSignup')}
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-4 text-slate-500">
              {t('auth.signup.divider')}
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
              htmlFor="fullName"
              className="block text-sm font-medium text-slate-700"
            >
              {t('auth.signup.fullName')}
            </label>
            <input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) =>
                setFormData({ ...formData, fullName: e.target.value })
              }
              className={`mt-1 block w-full rounded-lg border ${
                fieldErrors.fullName
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:border-teal-500 focus:ring-teal-500'
              } bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm`}
              placeholder="John Doe"
              disabled={isLoading}
            />
            {fieldErrors.fullName && (
              <p className="mt-1 text-sm text-red-600">
                {fieldErrors.fullName}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              {t('auth.signup.email')}
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
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              {t('auth.signup.password')}
            </label>
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
              placeholder={t('auth.signup.passwordHint')}
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
            {isLoading ? t('auth.signup.submitting') : t('auth.signup.submit')}
          </button>
        </form>

        {/* Sign In Link */}
        <p className="mt-6 text-center text-sm text-slate-600">
          {t('auth.signup.hasAccount')}{' '}
          <Link
            href={`/${locale}/login`}
            className="font-medium text-teal-600 hover:text-teal-500"
          >
            {t('auth.signup.loginLink')}
          </Link>
        </p>

        {/* Terms & Privacy */}
        <p className="mt-6 text-center text-xs text-slate-500">
          {t('auth.signup.terms')}{' '}
          <Link href={`/${locale}/terms`} className="underline hover:text-slate-700">
            {t('auth.signup.termsLink')}
          </Link>{' '}
          {t('auth.signup.and')}{' '}
          <Link href={`/${locale}/privacy`} className="underline hover:text-slate-700">
            {t('auth.signup.privacyLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
