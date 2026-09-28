'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { Locale } from '@/lib/i18n'

interface ResetPasswordFormProps {
  locale: Locale
}

/**
 * Consume a recovery link and set a new password.
 *
 * ── THE ONE THING THIS FILE IS FOR ────────────────────────────────────────────
 *
 * A recovery token IS a credential. GoTrue hands back a real access token and a
 * real refresh token, and anything holding them can do everything a signed-in
 * session can: read this account's resumes, cover letters and job applications,
 * change its email address, delete it. The only capability the user asked for is
 * "set this account's password".
 *
 * So the recovery session is never given to the application. It lives in the
 * client built below — created once, held in a ref, and thrown away with the
 * page — and that client is configured so it CANNOT become an app session:
 *
 *   persistSession: false      nothing is written to cookies or localStorage,
 *                              so `@/lib/supabase/client` — which every other
 *                              component in the app uses — never finds it. Were
 *                              this true, a reload of any page in the app would
 *                              come back signed in as the account from the
 *                              email, which is a full session granted by a link
 *                              rather than by a password.
 *   autoRefreshToken: false    the session is not kept alive in the background.
 *                              It expires when it expires.
 *   detectSessionInUrl: false  this code reads the fragment itself, once,
 *                              explicitly, rather than having a library pick up
 *                              whatever happens to be in the URL.
 *
 * `@supabase/supabase-js` rather than `@/lib/supabase/client`, for exactly that
 * reason: `createBrowserClient` from `@supabase/ssr` persists to cookies by
 * design, and using it here would be the bug this whole structure exists to
 * avoid. Do not "simplify" this import.
 *
 * ── WHY THE TOKEN IS IN THE FRAGMENT ──────────────────────────────────────────
 *
 * The request route asks Supabase for the implicit flow, so the recovery link
 * resolves to `…/reset-password#access_token=…&refresh_token=…&type=recovery`.
 * A URL fragment is never transmitted: not in the request line, not in a Referer
 * header. So the token cannot reach a server log or a proxy.
 *
 * IT CAN REACH AN ANALYTICS BEACON, and an earlier version of this comment said
 * it could not. That sentence was the bug: a fragment is invisible to servers
 * and completely visible to scripts on the page, and anything that reads
 * `location.href` and sends it somewhere will send the token with it. Sentry did
 * exactly that, by two separate default integrations, until
 * `src/lib/sentry-scrub.ts` was written. Any future telemetry added to this app
 * is a new instance of the same problem and needs the same treatment.
 *
 * ── WHAT "ERASED FROM THE ADDRESS BAR" DOES AND DOES NOT MEAN ─────────────────
 *
 * The effect below clears the fragment so it does not sit in the URL bar, in a
 * screenshot pasted into a support ticket, or in the entry the browser keeps in
 * its own persistent history.
 *
 * Copies it does NOT remove, both readable by any script for the lifetime of the
 * document:
 *
 *   `performance.getEntriesByType('navigation')[0].name` holds the full original
 *   URL, tokens included. There is no API to clear or overwrite it —
 *   `performance.clearResourceTimings()` does not cover navigation entries.
 *
 *   The back/forward entry the browser holds in memory for this document may
 *   retain the pre-`replaceState` URL depending on how the page was reached.
 *
 * Neither adds meaningful risk against a realistic attacker: any script able to
 * read them is already running in the page and could simply have read
 * `location.hash` first. They are recorded so that "erased from the address bar"
 * is never read as "no client-readable copy remains" — because it is not, and
 * the cost of that misreading is another integration shipping the token.
 *
 * ── WHY `type` IS CHECKED, AND WHAT THAT CHECK IS NOT ─────────────────────────
 *
 * The same fragment shape carries magic-link and signup confirmations, so the
 * `type` field is checked and only `recovery` is accepted. That keeps a link
 * sent for one purpose from being spent here by accident.
 *
 * It is NOT a security boundary, and an earlier version of this comment claimed
 * it was. `type` is a field in a fragment the holder can edit: anyone who
 * receives a magic link can change `type=magiclink` to `type=recovery` before
 * opening it, and this check will pass. It stops mistakes, not attackers.
 *
 * The real boundary is one step further down and is not ours: `updateUser`
 * sends `PUT /user` with the access token, and GoTrue decides. What actually
 * limits the holder of any of these grants is that they hold a valid access
 * token FOR THAT ACCOUNT — which is a credential the auth server issued and
 * verifies, not a string in a URL. A magic-link token relabelled `recovery`
 * would still only ever change its own account's password, which is the same
 * thing its holder could do by signing in with it.
 *
 * Keeping the check is still right: defence in depth costs three lines, and
 * accidental reuse is a real way for a user to spend a token they needed. But
 * nothing downstream may be built on the belief that this check is what keeps
 * one account's link from touching another account.
 *
 * ── WHY THERE IS NO FORM WITHOUT A TOKEN ──────────────────────────────────────
 *
 * The password fields are not rendered at all until a recovery session has been
 * established. That is not politeness about a dead-end form: it is the guarantee
 * that this page cannot change a password on the strength of an ordinary signed-in
 * session. A visitor who is already logged in and opens this URL with no fragment
 * sees the "this link cannot be used" panel, because the client that performs the
 * update has no access to their cookies and no session of its own.
 */

/** Matches the signup form's rule, which is stricter than Supabase's own. */
const MIN_PASSWORD_LENGTH = 8

/**
 * What the page is showing.
 *
 * A discriminated state rather than a set of booleans, so "checking" cannot
 * overlap with "ready" and there is no combination that renders a form and an
 * error panel at once.
 */
type Phase = 'checking' | 'ready' | 'invalid' | 'done'

/** The fields GoTrue's implicit recovery redirect puts in the fragment. */
interface RecoveryTokens {
  readonly accessToken: string
  readonly refreshToken: string
}

/**
 * Reads a recovery grant out of a URL fragment.
 *
 * Returns `null` for everything that is not one — an empty fragment, an error
 * redirect, a different token type, a truncated one. Every `null` leads to the
 * same panel: the user is told the link cannot be used and offered a new one,
 * and is NOT told whether it was wrong, already used, or expired. Those three
 * cases are distinguishable to GoTrue and must not be distinguishable here,
 * because the difference between "no such token" and "that token expired" tells
 * a caller holding a guessed token that the guess was structurally right.
 *
 * This is a well-formedness check on a value the holder controls, not an
 * authorisation check. Nothing it accepts has been trusted yet: `setSession`
 * puts every field past it to the auth server, which is what decides whether
 * the grant is real. See the `type` discussion in the file header.
 *
 * Exported for the unit tests, which is the whole reason it is a pure function
 * of a string rather than something that reaches for `window`.
 */
export function parseRecoveryFragment(fragment: string): RecoveryTokens | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''))

  // GoTrue signals refusal here — `error`, `error_code=otp_expired`, and so on.
  // Checked before the token fields so an error redirect that also carried them
  // could not be mistaken for a grant.
  if (params.has('error') || params.has('error_code') || params.has('error_description')) {
    return null
  }

  if (params.get('type') !== 'recovery') {
    return null
  }

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) {
    return null
  }

  return { accessToken, refreshToken }
}

/**
 * The translation key for a failed `updateUser`.
 *
 * Split out of the submit handler and exported so it can be tested directly.
 * The behaviour it encodes is an acceptance criterion — "a password rejected by
 * Supabase's policy surfaces the reason to the user in their own locale rather
 * than failing silently" — and it is otherwise unreachable from the UI: the
 * client-side rule below (8 characters) is stricter than Supabase's own minimum
 * of 6, so GoTrue never gets a chance to reject a password that reaches it.
 * Loosening the product to make the test reachable would be the wrong trade;
 * testing the mapping directly is not.
 *
 * It also catches the failure mode a rendering test would miss. `translate()`
 * returns the key itself when a key is missing, so a typo like
 * `auth.errors.passwordRejcted` would put the literal dotted path on screen in
 * all four locales with nothing failing anywhere. The test asserts these keys
 * resolve.
 *
 * Only `weak_password` gets its own message: it is the one failure the user can
 * do something about. An expired recovery session, a revoked token and a
 * network fault all lead to the same advice — start again with a fresh link —
 * and inventing separate wording for them would mean telling the user which
 * kind of invalid their token was, which is the distinction the rest of this
 * file works to avoid making.
 */
export function passwordUpdateErrorKey(error: { code?: string }): string {
  return error.code === 'weak_password'
    ? 'auth.errors.passwordRejected'
    : 'auth.errors.resetFailed'
}

/**
 * Reports a recovery grant that could not be revoked after a successful reset.
 *
 * Carries no token, no address and no user id — only the failure kind, per
 * FR-6. The grant is short-lived and the account's other sessions are already
 * gone by the time this can fire, so this is a hygiene signal rather than an
 * incident; it exists so a systematic revocation failure is visible to the
 * owner instead of being swallowed to keep the success screen clean.
 */
function reportFailedRevocation(error: unknown): void {
  Sentry.captureException(
    error instanceof Error ? error : new Error('Recovery session revocation failed'),
    {
      level: 'warning',
      tags: { area: 'password-reset', failure_kind: 'revocation_failed' },
      extra: {
        note:
          'The password WAS changed. Only the revocation of the spent recovery ' +
          'session failed, and the user was correctly shown success.',
      },
    }
  )
}

export function ResetPasswordForm({ locale }: ResetPasswordFormProps) {
  const { t } = useTranslation('common')

  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({})

  /**
   * The recovery client, and the only place the recovery session exists.
   *
   * A ref rather than state: it is not rendered, and putting it in state would
   * schedule a re-render for a value no output depends on.
   */
  const recoveryClient = useRef<SupabaseClient | null>(null)

  /**
   * The grant, captured once.
   *
   * This effect CONSUMES ITS OWN INPUT: it reads the fragment and then erases
   * it. That makes it non-idempotent, and React is entitled to run an effect
   * more than once — under Strict Mode it deliberately does, precisely to find
   * effects like this one. The second run would find an empty hash and send
   * every valid recovery link to the "invalid" panel.
   *
   * `reactStrictMode` is not enabled in this project today, so this is latent
   * rather than live. It is fixed anyway: the cost is a ref, and the failure
   * mode is that enabling a standard React setting silently breaks account
   * recovery for everyone, with no error to follow.
   *
   * `undefined` means "not yet read"; `null` means "read, and there was no
   * usable grant". They must stay distinct, or the second run re-reads.
   */
  const capturedGrant = useRef<RecoveryTokens | null | undefined>(undefined)

  useEffect(() => {
    if (capturedGrant.current === undefined) {
      capturedGrant.current = parseRecoveryFragment(window.location.hash)

      // Erase the fragment whether or not it parsed. An unusable token is still
      // a token, and leaving it in the address bar leaves it in history — and
      // in any screenshot the user sends to support.
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }

    const tokens = capturedGrant.current

    if (!tokens) {
      setPhase('invalid')
      return
    }

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    )

    let cancelled = false

    // `setSession` validates the tokens against the auth server rather than
    // trusting the fragment, so a forged or expired grant lands in `invalid`
    // here instead of failing later with a form already on screen.
    client.auth
      .setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
      .then(({ data, error: sessionError }) => {
        if (cancelled) {
          return
        }
        if (sessionError || !data.session) {
          setPhase('invalid')
          return
        }
        recoveryClient.current = client
        setPhase('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setPhase('invalid')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const validate = useCallback((): boolean => {
    const errors: { password?: string; confirmPassword?: string } = {}

    if (!password) {
      errors.password = t('auth.errors.passwordRequired')
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = t('auth.errors.passwordTooShort')
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = t('auth.errors.passwordsDoNotMatch')
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }, [password, confirmPassword, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validate()) {
      return
    }

    const client = recoveryClient.current
    if (!client) {
      // Unreachable through the UI — the form only renders in `ready`, which is
      // only set after the client is stored. Handled rather than asserted so a
      // future refactor that breaks the invariant fails visibly instead of
      // throwing inside an event handler.
      setPhase('invalid')
      return
    }

    setIsLoading(true)

    try {
      const { error: updateError } = await client.auth.updateUser({ password })

      if (updateError) {
        setError(t(passwordUpdateErrorKey(updateError)))
        return
      }

      // FROM HERE THE PASSWORD HAS CHANGED. Everything below is cleanup, and
      // none of it may turn a completed reset into a reported failure.
      //
      // These two steps used to share one `try` with the update above. If
      // `signOut` threw — a dropped connection on the revocation call is
      // enough — the catch reported "the password could not be updated" to a
      // user whose password HAD been updated, sending them off to request
      // another link and, most likely, to conclude the feature is broken. The
      // state that matters is already committed on the server; the UI must say
      // so.
      //
      // WHAT `scope: 'local'` ACTUALLY DOES, measured on GoTrue v2.196.0:
      // it revokes THIS session — the recovery grant — server-side. It is not a
      // client-side discard, which is what an earlier version of this comment
      // implied. After this call the recovery access token answers 403 revoked
      // and its refresh token 400 revoked.
      //
      // And the account's OTHER sessions are gone too, by then. GoTrue revokes
      // every other session on the password change itself, before this line is
      // reached: a session established with the old password, in another
      // browser, is already dead. That is unconditional and not ours to choose.
      // `'global'` would therefore add nothing here.
      //
      // REVOCATION IS SESSION-SCOPED, NOT TOKEN-SCOPED. This is the part it
      // would be easy — and wrong — to read as "after a reset nothing remains
      // usable". Measured, one access token against four destinations, before
      // and after a completed reset:
      //
      //     GoTrue /user            200  ->  403
      //     refresh                 200  ->  400
      //     PostgREST resumes       200  ->  200
      //     PostgREST cover_letters 200  ->  200
      //
      // PostgREST verifies the JWT's signature and expiry statelessly and never
      // consults session state, so a revoked access token keeps READING AND
      // WRITING that account's resumes and cover letters until the token
      // expires on its own — `jwt_expiry`, measured at 3600s.
      //
      // So a user resetting because they fear a compromise is protected against
      // refresh and against the auth API immediately, and exposed to data
      // access for up to an hour. It is bounded, it requires the grant to have
      // leaked in the first place, and it applies identically to an ordinary
      // sign-out. Nothing in this component can change it; the only lever is
      // the project's `jwt_expiry`.
      try {
        const { error: signOutError } = await client.auth.signOut({ scope: 'local' })
        if (signOutError) {
          reportFailedRevocation(signOutError)
        }
      } catch (revocationError) {
        // Reported, never shown. The user's password is changed and their other
        // sessions are gone; a recovery grant that outlived its use is the
        // owner's problem to see, not a failure to put in front of someone who
        // just succeeded.
        reportFailedRevocation(revocationError)
      }

      recoveryClient.current = null
      setPassword('')
      setConfirmPassword('')
      setPhase('done')
    } catch {
      setError(t('auth.errors.resetFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  if (phase === 'checking') {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-center text-sm text-slate-600" role="status">
            {t('auth.resetPassword.checking')}
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'invalid') {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900">
              {t('auth.resetPassword.invalidTitle')}
            </h1>
            <p className="mt-4 text-sm text-slate-600">
              {t('auth.resetPassword.invalidBody')}
            </p>
          </div>

          <Link
            href={`/${locale}/forgot-password`}
            className="mt-8 block w-full rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            {t('auth.resetPassword.requestNewLink')}
          </Link>

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

  if (phase === 'done') {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900">
              {t('auth.resetPassword.doneTitle')}
            </h1>
            <p className="mt-4 text-sm text-slate-600">
              {t('auth.resetPassword.doneBody')}
            </p>
          </div>

          <Link
            href={`/${locale}/login`}
            className="mt-8 block w-full rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            {t('auth.resetPassword.goToLogin')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            {t('auth.resetPassword.title')}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('auth.resetPassword.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              {t('auth.resetPassword.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
              className={`mt-1 block w-full rounded-lg border ${
                fieldErrors.password
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:border-teal-500 focus:ring-teal-500'
              } bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm`}
              placeholder="••••••••"
              disabled={isLoading}
            />
            {fieldErrors.password ? (
              <p id="password-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.password}
              </p>
            ) : (
              <p id="password-hint" className="mt-1 text-xs text-slate-500">
                {t('auth.resetPassword.passwordHint')}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
              {t('auth.resetPassword.confirmPassword')}
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={fieldErrors.confirmPassword ? true : undefined}
              aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
              className={`mt-1 block w-full rounded-lg border ${
                fieldErrors.confirmPassword
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:border-teal-500 focus:ring-teal-500'
              } bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 sm:text-sm`}
              placeholder="••••••••"
              disabled={isLoading}
            />
            {fieldErrors.confirmPassword && (
              <p id="confirm-password-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading
              ? t('auth.resetPassword.submitting')
              : t('auth.resetPassword.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
