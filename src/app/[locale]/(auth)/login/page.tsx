import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'
import { getTranslations, type Locale } from '@/lib/i18n'

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale }
}): Promise<Metadata> {
  const t = getTranslations(params.locale, 'common') as any

  return {
    title: `${t.auth.login.title} - ${t.meta.title}`,
    description: t.auth.login.subtitle,
  }
}

/**
 * Loading fallback for the login form.
 * Displayed while the client component hydrates and reads URL search params.
 */
function LoginFormFallback() {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 mx-auto rounded bg-slate-200" />
          <div className="h-4 w-48 mx-auto rounded bg-slate-100" />
          <div className="mt-8 space-y-3">
            <div className="h-10 rounded-lg bg-slate-100" />
            <div className="h-10 rounded-lg bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function LoginPage({
  params,
}: {
  params: { locale: Locale }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-12">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm locale={params.locale} />
      </Suspense>
    </div>
  )
}
