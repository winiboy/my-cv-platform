# PRD: Authentication redirects land the user where they intended

**Status:** DRAFT

## Objective

After a successful sign-in or sign-up, the user arrives at their intended
destination without further action.

## Context / Current Behavior

Two independent defects prevent that today. Both were found by the E2E suite
added in Phase 12; neither is caught by any other layer.

### Defect A — the post-authentication navigation loses the race

[`login-form.tsx:92-97`](../../src/components/auth/login-form.tsx) calls
`router.push()` as soon as `signInWithPassword` resolves. The auth cookie has
not been persisted at that moment, so the RSC request for the destination is
unauthenticated, [`middleware.ts:70-74`](../../src/middleware.ts) redirects it
to `/login`, and nothing retries.

Measured against the local stack:

```
t+   47ms  cookie=no   url=/en/login
t+  558ms  cookie=YES  url=/en/login
t+ 3613ms  cookie=YES  url=/en/login      <- never leaves
explicit goto /en/dashboard               -> holds, survives reload
```

The session is valid throughout. The user is signed in and left on the login
form, with no error shown, because from the form's perspective nothing failed.

[`signup-form.tsx:87-89`](../../src/components/auth/signup-form.tsx) has the
identical `router.push()` then `router.refresh()` sequence and is therefore
subject to the same race. It has no E2E coverage yet, so its behavior is
inferred from the shared pattern rather than measured — see BLOCKER-1.

This is a race, so it may present intermittently in deployed environments
rather than reliably. That is what makes it easy to dismiss as an isolated
report.

### Defect B — the deep-link destination is discarded

The middleware sets `?redirect=<pathname>` when it bounces an unauthenticated
request ([`middleware.ts:73`](../../src/middleware.ts)). The login form reads
`?callbackUrl` ([`login-form.tsx:94`](../../src/components/auth/login-form.tsx)).

The names do not match, so the parameter the middleware writes is never read.
A user who follows a link to `/en/dashboard/resumes/<id>/edit` while signed
out is sent to login, signs in, and arrives at `/en/dashboard` instead of the
resume they asked for.

`?callbackUrl` is genuinely used elsewhere — the marketing tools pages link to
`/login?callbackUrl=...` directly
([`cover-letter-checker/page.tsx:313`](../../src/app/[locale]/(marketing)/tools/cover-letter-checker/page.tsx)) —
so the parameter cannot simply be renamed without breaking those entry points.

### Existing safety behavior to preserve

`getSafeRedirectUrl` ([`login-form.tsx:20-31`](../../src/components/auth/login-form.tsx))
accepts only paths beginning with a single `/`, rejecting absolute and
protocol-relative URLs. Any destination read from a query parameter must keep
passing through it: widening redirect handling without that check would
introduce an open redirect.

## Scope

- Sign-in navigates to the intended destination reliably, without the user
  retrying or navigating manually.
- Sign-up navigates to its destination on the same terms.
- The destination recorded by the middleware when it bounces an
  unauthenticated request is honored after sign-in.
- `?callbackUrl`, already used by the marketing tools pages, keeps working.
- E2E coverage for both, replacing the `test.fixme` placeholder.

## Out of Scope

- OAuth sign-in (`signInWithOAuth`). It redirects through a provider and
  returns via `api/auth/callback`, a different navigation path that this PRD
  does not investigate or change.
- The auth architecture itself: NextAuth is configured with `providers: []`
  and authentication runs through Supabase. That inconsistency is real but is
  not this defect.
- Session refresh. `src/lib/supabase/middleware.ts` exists but is not invoked
  by `src/middleware.ts`; whether it should be is a separate question.
- Any redesign of the login or signup UI.
- Password reset, email confirmation, and account deletion flows.

## Impact Assessment

- **Frontend / UI:** Affected — the post-authentication navigation in
  `login-form.tsx` and `signup-form.tsx` changes.
- **Internationalization:** Not affected — no user-facing copy is added or
  changed. Destinations remain locale-prefixed, which the fix must preserve.
- **Resume model / templates:** Not affected — no resume state or rendering is
  involved.
- **Exports:** Not affected — no export path is involved.
- **Database / persistence:** Not affected — no schema, policy, or query
  changes. The session cookie is written by the Supabase client as it is today.
- **Security / authorization:** Affected — redirect destinations derive from a
  query parameter, so open-redirect protection is directly in scope. No
  authorization boundary moves: the middleware and page guards are unchanged.
- **Testing / validation:** Affected — the `test.fixme` in
  `e2e/auth.spec.ts:129` is replaced by a passing assertion, and the
  workaround in `e2e/fixtures/auth.ts` is removed with it.

## User Stories

### US-001: Signing in lands on the dashboard without further action

**Description:**
As a returning user, I want signing in to take me to my dashboard, so that I
do not have to work out whether my sign-in succeeded.

**Acceptance Criteria:**

- [ ] Submitting valid credentials at `/en/login` results in the browser URL
      matching `/en/dashboard`, with no additional navigation or interaction.
- [ ] The destination is reached within 10 seconds of submitting.
- [ ] The resulting page survives a reload without redirecting to `/login`,
      proving a server-readable session and not only a client-side route change.
- [ ] Verified by execution in a real browser, not by inspection: the
      `test.fixme` at `e2e/auth.spec.ts:129` becomes a normal passing test.
- [ ] The cookie-wait workaround in `loginAs` (`e2e/fixtures/auth.ts`) is
      removed, and the suite still passes without it.
- [ ] Invalid credentials still show the existing error and write no session
      cookie.

### US-002: Signing up lands on the dashboard without further action

**Description:**
As a new user, I want completing sign-up to take me into the product, so that
I am not left on the form wondering whether my account was created.

**Acceptance Criteria:**

- [ ] Completing sign-up with a new email results in the browser URL matching
      `/en/dashboard`, with no additional navigation or interaction.
- [ ] The resulting page survives a reload without redirecting to `/login`.
- [ ] Verified by execution in a real browser by a new E2E test; sign-up has
      no browser coverage today.
- [ ] Signing up with an already-registered email still shows the existing
      error and does not navigate.

### US-003: A deep link survives the sign-in detour

**Description:**
As a user following a link to a specific page while signed out, I want to
arrive at that page after signing in, so that the link works.

**Acceptance Criteria:**

- [ ] Visiting a protected deep link while signed out — for example
      `/en/dashboard/resumes` — redirects to login, and signing in from that
      page results in the browser URL matching the originally requested path.
- [ ] An existing `/login?callbackUrl=<path>` entry point still honors
      `callbackUrl`; the marketing tools pages are not broken.
- [ ] A destination that is not a single-slash relative path — `//evil.test`,
      `https://evil.test`, `javascript:alert(1)` — is rejected and the user
      lands on the default destination instead.
- [ ] The rejection is asserted by execution for at least the
      protocol-relative and absolute-URL cases, not only by unit test.
- [ ] Verified by execution in a real browser.

## Functional Requirements

- **FR-1:** Navigation to the post-authentication destination must not begin
  before the session is readable by the server. The user must not be able to
  observe a state in which they are authenticated but still on the auth form.
- **FR-2:** When the middleware redirects an unauthenticated request to login,
  the requested path must be recoverable by the login form. Whether that is
  achieved by aligning the parameter name or by reading both is an
  implementation decision, provided existing `?callbackUrl` entry points keep
  working.
- **FR-3:** Every destination derived from a query parameter must pass through
  the existing single-slash relative-path validation before being navigated to.
  No change may widen what is accepted.
- **FR-4:** Destinations must remain locale-prefixed. Signing in under `/fr/`
  must not land the user on an `/en/` page.
- **FR-5:** A failed sign-in or sign-up must continue to show the existing
  error and must not navigate.
- **FR-6:** No change to the middleware's or page guards' authorization
  decisions. This PRD changes where an authenticated user is sent, never who
  is allowed through.
- **FR-7:** No new runtime dependency.

## Regression Constraints

- The five existing tests in `e2e/auth.spec.ts` must continue to pass: session
  survives reload, session carries to another protected page, protected pages
  redirect anonymous visitors, wrong password writes no cookie, deleted user
  cannot sign in.
- `/en/dashboard` and `/en/dashboard/resumes` must continue to redirect an
  anonymous visitor to `/en/login`.
- The 14 integration tests and 89 unit tests must continue to pass; neither
  layer covers this navigation, so any change there indicates unintended reach.
- `getSafeRedirectUrl` must continue to reject absolute URLs, protocol-relative
  URLs, and non-path schemes.
- The OAuth button and its handler must remain functional and unmodified.
- `pnpm lint` must not exceed its 311-problem baseline.

## Required Verification

- `pnpm test:e2e` — the primary evidence. US-001, US-002 and US-003 are all
  browser-observable and must be proven by execution, since this defect exists
  precisely in the layer below the browser and above the API.
- Each new or changed E2E assertion must be mutation-proven: the assertion is
  shown to fail against the current unfixed behavior, and to pass after the
  fix. An assertion that passes in both states is not evidence.
- `pnpm test`, `pnpm test:integration`, `pnpm typecheck`, `pnpm build`,
  `pnpm lint` — recorded against the baselines in the regression constraints.
- Timing evidence for US-001 comparable to the measurement in Context, showing
  the URL reaching the destination rather than remaining at `/login`.
- Because the underlying defect is a race, US-001's E2E test must pass on at
  least three consecutive runs. A single green run does not distinguish a fix
  from a lucky timing outcome.

## FAIL Conditions

- Any acceptance criterion is claimed without a recorded command and result.
- An E2E assertion is added that cannot fail against the current behavior.
- `test.fixme` is deleted without a passing assertion replacing it, or the
  fixture workaround is left in place while the story is claimed complete.
- Redirect validation is widened, or a destination bypasses it.
- Any existing test is weakened, skipped, or deleted to obtain a green result.
- The fix introduces a fixed delay or timeout as the mechanism for waiting on
  the session. A sleep tuned to one machine reproduces the same race elsewhere.
- Authorization behavior changes for any route.

## BLOCKER Conditions

- **BLOCKER-1:** Sign-up's failure is inferred from the shared code pattern,
  not measured — it has no E2E coverage. If US-002's first browser test shows
  sign-up already navigates correctly, the story's premise is wrong and US-002
  must be re-scoped rather than implemented against an assumed defect.
- The fix cannot be implemented without changing the authorization decisions
  in `src/middleware.ts`, which is out of scope and would need its own PRD.
- Correcting Defect B breaks an existing `?callbackUrl` entry point, requiring
  a decision about the marketing tools pages that this PRD does not authorize.

## Risks

- **The race may not reproduce on every machine.** It was measured reliably
  against a local production build, but a faster or slower environment may
  change the timing. This is why the fix must be structural rather than a
  tuned delay, and why the verification requires repeated runs.
- **A fix that waits on the wrong signal.** Waiting for the cookie to appear
  in `document.cookie` is what the E2E fixture does as a workaround; it is not
  necessarily correct in the application, where the reliable signal is that
  the server can read the session. Choosing the wrong signal would move the
  race rather than remove it.
- **Deep-link handling touches a security surface.** Widening what counts as
  an acceptable destination is the standard way open redirects are introduced.
  FR-3 exists to prevent that, and US-003 asserts it by execution.
- **Sign-up may differ from sign-in** in ways not yet measured, since
  `signUp` may or may not establish a session depending on whether email
  confirmation is required. See BLOCKER-1.

## Evidence / References

- `e2e/auth.spec.ts:129` — the `test.fixme` recording Defect A, with the
  measured timings.
- `e2e/fixtures/auth.ts` — the `loginAs` workaround that exists only because
  of Defect A, and which this work removes.
- `src/components/auth/login-form.tsx:20-31, 92-97` — `getSafeRedirectUrl`,
  and the `router.push()` that loses the race.
- `src/components/auth/signup-form.tsx:87-89` — the same pattern after
  `signUp`.
- `src/middleware.ts:70-74` — the redirect that sets `?redirect`, and the
  authorization decision that must not change.
- `src/app/[locale]/(marketing)/tools/cover-letter-checker/page.tsx:313` — an
  existing `?callbackUrl` entry point that must keep working.
- `src/app/[locale]/(dashboard)/layout.tsx:20-22` — the page-level guard,
  unreachable for anonymous users because the middleware fires first.
- `docs/engineering/quality-contract.md` — the baselines the regression
  constraints refer to.

## Open Questions

- None blocking beyond BLOCKER-1, which is resolved by measuring sign-up's
  actual behavior as the first step of US-002 rather than by a decision.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
