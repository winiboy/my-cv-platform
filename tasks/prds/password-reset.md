# PRD: Password reset (account recovery)

**Status:** DRAFT

<!--
  Approval is an owner act. Per .claude/rules/prd.md, only the owner writes
  `Status: APPROVED <YYYY-MM-DD>`. No agent may write or imply that line.
-->

## Objective

A user who cannot sign in because they have forgotten their password can recover
access to their own account, unaided, by email.

## Context / Current Behavior

There is no password-reset capability anywhere in the product.

- `src/components/auth/login-form.tsx:321` renders a "Forgot password?" link to
  `/${locale}/forgot-password`.
- No route of that name has ever existed, in any commit. The link 404s, and its
  RSC prefetch 404s on every login-page visit.
- No `resetPasswordForEmail`, no recovery route, and no password-update surface
  exists in `src/`.

So a locked-out user has no path back to their account at all, and the only
affordance the product offers them is a dead link.

Adjacent facts established while scoping this:

- Auth pages live in the `src/app/[locale]/(auth)/` route group
  (`login/page.tsx`, `signup/page.tsx`); this work adds to that group.
- `src/lib/api/rate-limit.ts` already provides `enforceRateLimit`,
  `RateLimitPolicy` and a shared/local store tiering, used today by the AI
  endpoints via `src/lib/api/ai-rate-limit.ts`. `resolveClientIp` is there too.
- The local Supabase stack exposes SMTP on port **54324**, so the whole flow —
  including reading the delivered email — is verifiable locally without
  touching a hosted project.

### Two configuration facts that constrain this work

1. **`supabase/config.toml:163`** sets
   `additional_redirect_urls = ["https://127.0.0.1:3000"]` — note `https`, and
   port 3000. The e2e server runs on **http** port **3100**. Recovery links
   will not resolve under test until the local allow-list covers the ports and
   schemes actually used. This file is version-controlled, so the local side is
   in scope here; the hosted project's allow-list is not, and is owner-only.

2. **`supabase/config.toml:198`** sets `[auth.rate_limit] email_sent = 2` per
   hour. An e2e suite that requests more than two recovery emails in an hour
   will be throttled by Supabase itself, and the failure will look like a
   product bug. The verification design has to account for this.

## Scope

- A request page at `/[locale]/forgot-password` that accepts an email address
  and triggers a recovery email.
- A landing page at `/[locale]/reset-password` that consumes the recovery token
  and sets a new password.
- Localisation of both pages, and of the recovery email's destination, in `fr`,
  `en`, `de` and `it`.
- Rate limiting of the request endpoint.
- Local Supabase configuration needed to make the flow work under test.

## Out of Scope

- Changing the password policy for signup or for existing accounts
  (`minimum_password_length = 6`, `password_requirements = ""`) — see Open
  Questions; this is a decision, not an omission.
- A dashboard settings page, or changing a password while signed in.
- Email address change, account deletion, MFA, passkeys, social-account
  recovery.
- The hosted Supabase project's redirect allow-list and email templates, which
  only the owner can change.
- Any change to the existing login or signup flows beyond the link that already
  points at the new route.
- Restyling the auth pages.

## Impact Assessment

- **Frontend / UI:** Affected — two new pages in the existing `(auth)` group.
- **Internationalization:** Affected — new user-facing strings in four locales;
  the recovery link must return the user to the locale they started in.
- **Resume model / templates:** Not affected — no resume surface is touched.
- **Exports:** Not affected.
- **Database / persistence:** Not affected — recovery is handled by Supabase
  Auth against `auth.users`; no migration and no application table is involved.
- **Security / authorization:** Affected, materially. This is an unauthenticated
  endpoint that sends email on demand and, on the second leg, changes an
  account credential. It is the highest-risk surface in this change.
- **Testing / validation:** Affected — new e2e coverage, and the console-error
  filter in `e2e/cover-letter-pdf-export.spec.ts` can be tightened once the
  `/forgot-password` prefetch stops 404ing.

## User Stories

### US-001: Request a recovery email

**Description:**
As a user who cannot sign in, I want to ask for a recovery link by entering my
email address, so that I can regain access without contacting support.

**Acceptance Criteria:**

- [ ] `/[locale]/forgot-password` renders for each of `fr`, `en`, `de`, `it`
      with no hardcoded user-facing English.
- [ ] Submitting a registered address causes Supabase to send a recovery email;
      the email is observed in the local SMTP inbox on port 54324.
- [ ] The recovery link in that email points at `/[locale]/reset-password` in
      the same locale the request was made from.
- [ ] Submitting an address that has no account produces a response that is
      **indistinguishable** from the registered case — identical rendered text,
      identical status, and no observable timing channel introduced by the
      application's own branching.
- [ ] The "Forgot password?" link at `src/components/auth/login-form.tsx:321`
      reaches this page and no longer 404s, in every locale.

### US-002: Set a new password from a recovery link

**Description:**
As a user who has received a recovery email, I want to choose a new password,
so that I can sign in again.

**Acceptance Criteria:**

- [ ] Following a valid recovery link renders `/[locale]/reset-password` in a
      state that can accept a new password.
- [ ] Submitting a new password updates the credential, and the user can then
      sign in with it; evidence is a completed sign-in, not a success toast.
- [ ] The old password no longer authenticates after a successful reset.
- [ ] An invalid, already-consumed, or expired token renders an explanatory
      error and offers a route back to requesting a new link — it must not
      render a password form that cannot work, and must not leak whether the
      token was wrong versus expired.
- [ ] A password rejected by Supabase's policy surfaces the reason to the user
      in their own locale rather than failing silently.

### US-003: The request endpoint resists abuse

**Description:**
As the owner, I want the recovery request bounded, so that it cannot be used to
send mail at my expense or to flood a third party's inbox.

**Acceptance Criteria:**

- [ ] The request path enforces a rate limit using the existing
      `src/lib/api/rate-limit.ts`, keyed so that one client cannot exhaust
      another's budget.
- [ ] Exceeding the limit returns a bounded, non-enumerating response and does
      not send mail.
- [ ] The limit is covered by an automated test that does not depend on
      Supabase's own `email_sent` throttle to produce the failure.
- [ ] The chosen limit and window are recorded with the reasoning, next to the
      AI policies they sit beside.

## Functional Requirements

- **FR-1:** The request response must not reveal whether an address has an
  account. This is the single most important property in this PRD: without it
  the endpoint becomes an oracle for "does this person use this product",
  against a service holding career data.
- **FR-2:** User-facing strings in both pages must come from the existing i18n
  architecture in all four locales (§11).
- **FR-3:** The recovery link must preserve the requesting locale.
- **FR-4:** The request endpoint must be rate limited (US-003).
- **FR-5:** No secret, service-role key or Supabase admin credential may be
  used in, or reachable from, either page. Recovery must run through the
  ordinary anon-key client path (§13).
- **FR-6:** No recovery token, session token or full email address may be
  written to logs or to Sentry. An error report may carry the failure kind and
  nothing that identifies the account.
- **FR-7:** The local `supabase/config.toml` redirect allow-list must cover the
  scheme, host and ports the app and the e2e suite actually use, so the flow is
  reproducible locally by anyone who clones the repository.
- **FR-8:** Neither page may be reachable in a way that lets an already
  authenticated session change another account's password.

## Regression Constraints

- Sign-in and sign-up behaviour must be unchanged, including their existing
  validation, error text and redirect behaviour.
- The `(auth)` route group's existing layout and styling must be unchanged;
  the new pages adopt them rather than altering them.
- Middleware route protection must not be weakened to admit the new pages. If
  the new routes need to be reachable unauthenticated, that must be expressed
  in the same way the existing `login` and `signup` routes express it.
- `supabase/config.toml` changes must be additive to the redirect allow-list.
  No change to `minimum_password_length`, `password_requirements`, `site_url`,
  or any `[auth.rate_limit]` value that would alter existing behaviour, except
  where the verification design requires it and the change is called out.
- The 305-problem lint baseline must not rise (ceiling 311).

## Required Verification

- **E2E, against the local stack**, covering the whole flow end to end:
  request → read the email from the SMTP inbox on port 54324 → follow the link
  → set a new password → sign in with it. A test that stops at "a success
  message appeared" does not satisfy US-002.
- **The negative cases as first-class tests**, not afterthoughts: unknown
  address produces the identical response; a consumed token is refused; an
  expired or malformed token is refused.
- **The old password no longer works** after reset — asserted by a failed
  sign-in, not inferred.
- **Rate limit** exercised without relying on Supabase's `email_sent = 2`
  throttle to produce the failure, since that would test Supabase rather than
  this code.
- **`security-review`** on the final diff. This is an unauthenticated
  credential-changing surface; a passing e2e is not sufficient evidence.
- **`ui-expert`** on both rendered pages, in at least one non-English locale.
- **`code-reviewer`** on the final diff.
- The mandatory §14 set: typecheck, unit, integration, e2e, `build:verify`,
  lint recorded against the ceiling.

## FAIL Conditions

- The response differs in any observable way between a registered and an
  unregistered address.
- A recovery token, session token or full email address appears in a log, an
  error response, or a Sentry payload.
- The request endpoint has no rate limit, or one that can be bypassed by
  varying a client-controlled value.
- Either page is reachable in a state that allows changing a password without a
  valid recovery token.
- A service-role key, admin API or elevated credential is used by either page.
- The reset succeeds but the old password still authenticates.
- Sign-in or sign-up behaviour changes.
- Any required check is claimed rather than run.

## BLOCKER Conditions

- The hosted Supabase project's redirect allow-list or recovery email template
  cannot be configured by the owner, making the flow undeliverable in
  production. The local flow can still be built and verified; shipping cannot
  complete without it.
- Supabase's `email_sent` throttle makes the end-to-end test
  non-deterministic and no in-repo configuration can make it reproducible.
- The locale cannot be preserved across the recovery link by any means the
  existing i18n architecture supports.

## Risks

- **The recovery email is the weakest link.** Its template, sender and
  deliverability live in the hosted project, outside this repository, and a
  flow that works perfectly locally can still fail for every real user.
- **Supabase's recovery session is a real session.** The landing page must be
  written so that a token grants exactly one capability — set this account's
  password — and does not become a general authenticated context.
- **Rate-limit state is per-instance** until migration `008_api_rate_limits.sql`
  is deployed to the hosted database, which has not happened. A serverless
  deployment therefore multiplies the effective limit by the instance count.
  That is a pre-existing condition of the rate limiter, not introduced here,
  but it applies to this endpoint too and should not be mistaken for a bound.

## Evidence / References

- `src/components/auth/login-form.tsx:321` — the dead link this closes.
- `src/app/[locale]/(auth)/` — where the new pages belong.
- `src/lib/api/rate-limit.ts`, `src/lib/api/ai-rate-limit.ts` — the rate-limit
  primitives and the precedent for policy placement.
- `supabase/config.toml:163` — redirect allow-list, currently `https` / 3000.
- `supabase/config.toml:198` — `email_sent = 2` per hour.
- `supabase/config.toml:182-184` — `minimum_password_length = 6`,
  `password_requirements = ""`.
- `src/test/local-stack.ts` — local-only Supabase assertions used by tests.
- `e2e/cover-letter-pdf-export.spec.ts` — its console-error filter can be
  tightened once the `/forgot-password` prefetch stops 404ing.

## Open Questions

1. **Password policy.** `minimum_password_length = 6` with no character
   requirements is weak for an account holding career data, and a reset page is
   where users choose a new password. Raising it is a one-line config change
   that also affects signup and is therefore a deliberate product decision, not
   a detail of this work. **Owner decision; out of scope unless answered yes.**
2. ~~**Session invalidation on reset.** Should a successful password reset sign
   out that account's other active sessions?~~ **WITHDRAWN — there is no
   decision to make.** The question assumed the behaviour was ours to choose
   and that it traded safety against convenience. Measured against GoTrue
   v2.196.0 during implementation, it is neither:

   - After a reset, the recovery access token answers **403 revoked** and its
     refresh token **400 revoked**.
   - An independent, pre-existing session for the same account — established
     with the OLD password in a separate client — is **also revoked**.
   - That revocation is performed by GoTrue on the password change itself,
     before the application's own `signOut` call is reached.
   - **But revocation is session-scoped, not token-scoped.** The same access
     token, measured against four destinations before and after a completed
     reset:

     | destination | before | after |
     |---|---|---|
     | GoTrue `/user` | 200 | **403** |
     | refresh | 200 | **400** |
     | PostgREST `resumes` | 200 | **200** |
     | PostgREST `cover_letters` | 200 | **200** |

     PostgREST verifies the JWT statelessly and never consults session state, so
     a revoked access token continues to **read and write** that account's
     resumes and cover letters until it expires on its own — `jwt_expiry`,
     measured at **3600 s**.

   So the "safer half" of the trade-off is already in force unconditionally for
   refresh and for the auth API, and the "more annoying half" is imposed by
   Supabase whether or not anyone wants it. `scope: 'local'` in
   `reset-password-form.tsx` means "revoke this session" and is not a
   client-side discard; switching it to `'global'` would change nothing
   observable.

   **What this does NOT mean.** An earlier version of this withdrawal left the
   impression that after a reset nothing remains usable. That is too strong. A
   user who resets because they fear a compromise is exposed to data access for
   up to an hour afterwards. It is bounded, it requires the grant to have leaked
   in the first place, and it is identical after an ordinary sign-out — it is a
   property of Supabase's architecture, not of this change, and **nothing in
   this change can fix it.** The only lever is the project's `jwt_expiry`, which
   is an owner setting and a separate decision.

   Recorded rather than deleted because the reasoning in the original question
   was sound and only the premise was wrong, and because a future upgrade of
   GoTrue could make it a real question again.

Question 1 does not block US-001 or US-003, and affects only which passwords
US-002 accepts.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation, recorded by the owner as
`Status: APPROVED <YYYY-MM-DD>`.
