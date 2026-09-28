import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { toLocale, translate } from '@/lib/i18n'

export async function generateMetadata(
  props: {
    params: Promise<{ locale: string }>
  }
): Promise<Metadata> {
  const params = await props.params;
  const locale = toLocale(params.locale)
  // See `forgot-password/page.tsx` for why this is `translate` and not the
  // `getTranslations(...) as any` the older auth pages use.
  const t = (key: string) => translate(locale, 'common', key)

  return {
    title: `${t('auth.resetPassword.title')} - ${t('meta.title')}`,
    description: t('auth.resetPassword.subtitle'),
    robots: { index: false, follow: false },
  }
}

/**
 * The recovery landing page.
 *
 * A server component that renders a client one and passes only the locale. It
 * deliberately receives nothing else: the recovery token arrives in the URL
 * fragment, which no browser sends to any server, so this component cannot see
 * it even in principle.
 *
 * What that does and does not buy, precisely — an earlier version of this
 * comment overstated it, and the overstatement was the bug:
 *
 *   It DOES keep the token out of anything built from an HTTP request. No
 *   access log, no proxy, no Referer header, no server-side error report can
 *   contain it, because it is never transmitted. That is a property of where
 *   the token travels, not of anyone remembering to redact it.
 *
 *   It does NOT keep the token out of client-side telemetry. A fragment is
 *   fully readable by JavaScript running on the page, and Sentry runs on the
 *   page. Two of its default browser integrations read the fragment — one of
 *   them triggered by the very `history.replaceState` that erases it. That is
 *   handled centrally in `src/lib/sentry-scrub.ts`, which is where the
 *   mechanism is documented; it is NOT handled by this file, and nothing here
 *   should be read as claiming otherwise.
 */
export default async function ResetPasswordPage(
  props: {
    params: Promise<{ locale: string }>
  }
) {
  const params = await props.params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-12">
      <ResetPasswordForm locale={toLocale(params.locale)} />
    </div>
  )
}
