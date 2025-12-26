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

export default async function LoginPage({
  params,
}: {
  params: { locale: Locale }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-12">
      <LoginForm locale={params.locale} />
    </div>
  )
}
