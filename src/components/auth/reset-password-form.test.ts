import { describe, it, expect } from 'vitest'
import { parseRecoveryFragment, passwordUpdateErrorKey } from './reset-password-form'
import { locales, translate } from '@/lib/i18n'

/**
 * What counts as a recovery grant.
 *
 * This is the gate in front of the only credential-changing surface in the
 * product that no password protects, so every case below is a way in that must
 * stay shut. It is a pure function of a string precisely so this file can exist:
 * the alternative is proving the same properties by driving a browser, which is
 * slower and covers fewer of them.
 *
 * The end of every rejected case is the same panel in the UI, which is
 * deliberate — see the function's own documentation for why the user is not told
 * which kind of bad link they have.
 */

const VALID = '#access_token=header.payload.sig&refresh_token=rt-abc&type=recovery&expires_in=3600'

describe('parseRecoveryFragment', () => {
  it('accepts a recovery grant and returns both tokens', () => {
    expect(parseRecoveryFragment(VALID)).toEqual({
      accessToken: 'header.payload.sig',
      refreshToken: 'rt-abc',
    })
  })

  it('accepts a fragment with no leading hash', () => {
    // `window.location.hash` includes the '#', but a caller that has already
    // stripped it must not silently get `null` — that would be a page that
    // rejects every valid link.
    expect(parseRecoveryFragment(VALID.slice(1))).not.toBeNull()
  })

  it('rejects an empty fragment', () => {
    // The plain-visit case: someone opens /reset-password directly, or is
    // already signed in and navigates to it. No form may be offered.
    expect(parseRecoveryFragment('')).toBeNull()
    expect(parseRecoveryFragment('#')).toBeNull()
  })

  it('rejects GoTrue error redirects', () => {
    // What a consumed or expired link actually produces. Each key is checked
    // independently because GoTrue does not always send all three.
    expect(
      parseRecoveryFragment('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    ).toBeNull()
    expect(parseRecoveryFragment('#error_code=otp_expired')).toBeNull()
    expect(parseRecoveryFragment('#error_description=whatever')).toBeNull()
  })

  it('rejects an error redirect that also carries tokens', () => {
    // The ordering guard. If the token fields were read first, a fragment that
    // pairs an error with leftover tokens would be treated as a grant.
    expect(
      parseRecoveryFragment(`${VALID}&error=access_denied&error_code=otp_expired`)
    ).toBeNull()
  })

  it('rejects a grant of any other type', () => {
    // Defence in depth against ACCIDENTAL reuse, not a security boundary, and
    // this test should not be cited as one. `type` is a field in a fragment its
    // holder can edit, so anyone who receives a magic link can relabel it
    // `recovery` and walk past this check.
    //
    // What actually bounds them is that `updateUser` sends the access token to
    // GoTrue, which only ever lets a token change its own account's password.
    // Keeping the check is still worth three lines: it stops a user spending a
    // token they needed for something else.
    for (const type of ['magiclink', 'signup', 'invite', 'email_change', '']) {
      expect(
        parseRecoveryFragment(VALID.replace('type=recovery', `type=${type}`)),
        `type=${type} must not be accepted as a recovery grant`
      ).toBeNull()
    }
  })

  it('rejects a fragment with no type at all', () => {
    expect(
      parseRecoveryFragment('#access_token=header.payload.sig&refresh_token=rt-abc')
    ).toBeNull()
  })

  it('rejects a half-present grant', () => {
    // `setSession` needs both. Reaching it with one and letting it fail would
    // render the form first and the error afterwards.
    expect(parseRecoveryFragment('#access_token=a.b.c&type=recovery')).toBeNull()
    expect(parseRecoveryFragment('#refresh_token=rt&type=recovery')).toBeNull()
  })

  it('rejects empty token values', () => {
    // `URLSearchParams.get` returns '' for `access_token=`, which is truthy
    // enough to be a bug if the check were `!== null`.
    expect(parseRecoveryFragment('#access_token=&refresh_token=rt&type=recovery')).toBeNull()
    expect(parseRecoveryFragment('#access_token=a.b.c&refresh_token=&type=recovery')).toBeNull()
  })

  it('rejects a query string dressed up as a fragment', () => {
    // A PKCE-style `?code=` link, which this flow does not use. It must not be
    // mistaken for a grant if it ever arrives.
    expect(parseRecoveryFragment('#code=abc123')).toBeNull()
  })
})

/**
 * US-002 AC5: "a password rejected by Supabase's policy surfaces the reason to
 * the user in their own locale rather than failing silently".
 *
 * Tested here rather than through the browser because it is unreachable through
 * the browser: the form requires 8 characters and Supabase's minimum is 6, so
 * nothing the form will submit can be rejected as weak. The options were to
 * loosen the product so a test could reach the path, or to test the path
 * directly. This is the second.
 */
describe('passwordUpdateErrorKey', () => {
  it('maps a weak-password rejection to its own message', () => {
    expect(passwordUpdateErrorKey({ code: 'weak_password' })).toBe(
      'auth.errors.passwordRejected'
    )
  })

  it.each([
    ['an expired recovery session', 'session_expired'],
    ['a revoked token', 'refresh_token_not_found'],
    ['an unauthenticated update', 'bad_jwt'],
    ['an error with no code at all', undefined],
  ])('maps %s to the generic retry message', (_case, code) => {
    // All of these lead to the same advice — get a fresh link — and giving them
    // separate wording would tell the user which KIND of invalid their token
    // was, which is the distinction the rest of this flow works to avoid.
    expect(passwordUpdateErrorKey({ code })).toBe('auth.errors.resetFailed')
  })

  /**
   * The trap this test exists for.
   *
   * `translate()` returns the key when a key is missing, so a typo like
   * `auth.errors.passwordRejcted` renders the literal dotted path to the user —
   * in all four locales, with no error anywhere and nothing failing. A test
   * that only checked which key was chosen would pass against that.
   */
  it('returns keys that resolve to real copy in every locale', () => {
    const keys = [
      passwordUpdateErrorKey({ code: 'weak_password' }),
      passwordUpdateErrorKey({ code: 'anything-else' }),
    ]

    for (const locale of locales) {
      for (const key of keys) {
        const copy = translate(locale, 'common', key)
        expect(copy, `${key} must be translated in ${locale}`).not.toBe(key)
        expect(copy.trim().length, `${key} must not be empty in ${locale}`).toBeGreaterThan(0)
      }
    }
  })
})
