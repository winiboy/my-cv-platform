import type { Metadata } from 'next'
import { SignupForm } from '@/components/auth/signup-form'
import { getTranslations, toLocale } from '@/lib/i18n'

export async function generateMetadata(
  props: {
    params: Promise<{ locale: string }>
  }
): Promise<Metadata> {
  const params = await props.params;
  const t = getTranslations(toLocale(params.locale), 'common') as any

  return {
    title: `${t.auth.signup.title} - ${t.meta.title}`,
    description: t.auth.signup.subtitle,
  }
}

export default async function SignupPage(
  props: {
    params: Promise<{ locale: string }>
  }
) {
  const params = await props.params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-12">
      <SignupForm locale={toLocale(params.locale)} />
    </div>
  )
}
