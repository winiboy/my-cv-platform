import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { toLocale, translate } from '@/lib/i18n'

export async function generateMetadata(
  props: {
    params: Promise<{ locale: string }>
  }
): Promise<Metadata> {
  const params = await props.params;
  const locale = toLocale(params.locale)
  // `translate` rather than `getTranslations(...) as any`, which is what the
  // neighbouring login and signup pages do. That cast is there because the four
  // locale JSON files infer as four separate types and a union of them cannot be
  // indexed; `translate` walks the same tree and returns a string, so the new
  // pages get the strings without adding two more `no-explicit-any` errors to
  // the tracked lint baseline.
  const t = (key: string) => translate(locale, 'common', key)

  return {
    title: `${t('auth.forgotPassword.title')} - ${t('meta.title')}`,
    description: t('auth.forgotPassword.subtitle'),
    // A recovery page has nothing to offer a search index, and an indexed one
    // is an invitation to point mail-sending traffic at it.
    robots: { index: false, follow: false },
  }
}

/**
 * No `Suspense` boundary, unlike `login/page.tsx`.
 *
 * That one exists because `LoginForm` reads `useSearchParams`, which makes a
 * client component suspend during prerender. This form reads no search params
 * and needs no fallback; adding one would be a wrapper around nothing.
 *
 * The outer wrapper's classes are copied from the login page rather than
 * extracted into a shared layout: the `(auth)` group has no layout today, and
 * introducing one would change how `login` and `signup` render, which is a
 * regression constraint on this work.
 */
export default async function ForgotPasswordPage(
  props: {
    params: Promise<{ locale: string }>
  }
) {
  const params = await props.params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-12">
      <ForgotPasswordForm locale={toLocale(params.locale)} />
    </div>
  )
}
