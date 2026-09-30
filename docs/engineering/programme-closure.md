# Programme closure — phases 06 to 32

**Written:** 2026-09-25 on `ralph/milestone-c-part-3-parity-defects`.
**Reconciled against git:** 2026-09-30, after phases 6–32 were all complete.

Every claim below was re-checked against `origin/main` on the reconciliation
date, not against memory of what was intended. Where the original text had gone
stale it is corrected in place and the correction is labelled, so the drift
itself stays visible — a record that quietly rewrites itself teaches nobody
anything.

The 32-phase clean-up began on 2026-08-28 with a repository that could not be
installed deterministically, had no tests, and had CI that did not run. This
records what that programme delivered, what is deliberately left, and where the
open work is written down. Nothing here is a plan; everything is either done or
named with its owner.

## Milestones

| Milestone | Phases | Status |
|---|---|---|
| **A** — trustworthy build system | 06–09 | **Complete.** One package manager, one Node version, working CI |
| **B** — automated quality foundation | 10–14 | **Complete.** Unit, integration, E2E and visual suites; evidence-based UI review |
| **C** — resume rendering unification | 15–21 | **Complete.** All 16 Part 3 stories pass |
| **D** — development operating system | 22–24 | **Complete.** `prd-lifecycle.md`, `ralph-pass-criteria.md`, `progress-log-format.md` |
| **E** — database / environment maturity | 25–29 | **Complete.** Local Supabase, RLS audit, staging database, protected `main`, preview validation on every PR |
| **F** — production hardening | 30–32 | **Complete.** Security findings closed in #79, framework upgrade in #80 and #81 |

## Milestone C, in detail

Part 1 built one typed layout model and persisted it. Part 2 moved every export
onto that model without changing a byte of output, and built `pnpm test:parity`,
which renders a fixture resume through Preview, PDF and DOCX for all five
templates and compares every surface against the model and against the others.

**That check is what turned a tidy-up into a programme.** It found 58
divergences nobody had named. Part 3 was rewritten from 5 stories to 16 to
account for them.

All sixteen are done: the parity report moved from **MATCH 93 / KNOWN 110** at
Part 3's start to **MATCH 206 / KNOWN 3**, with **0 NEW** rows throughout.

### All sixteen stories are done

The five that were left open on 2026-09-25 — US-009, US-010, US-011, US-013 and
US-015 — were closed on 2026-09-26. The parity report now reads **MATCH 206,
KNOWN 3, NEW 0**: every divergence this document named is closed, and the three
that remain are the one this work registered itself, below.

Four product decisions were made and recorded in `tasks/ralph/progress.txt`:
where `projects` sits when the section order is changed (each template keeps its
own slot); which surface was right about an empty main column (the generator);
whether creative's `summary` can be reordered (no — it is fixed in the header and
carries visibility only); and how the print band reaches the user's colour.

**US-013's second criterion was amended before that story could run.** It
required evidence, on a multi-page print capture, that the professional sidebar
band follows the user's colour. Measured, no pixel of any printed page shows the
band at all: where the sidebar reaches, the sidebar element covers it exactly;
where it does not, the white main area paints over it; and below the content
there is no band, because the gradient is on `body` and `html` is
`white !important` under print. The colour is now correct and nothing displays
it. That is recorded as a limitation, and the criterion now asks for the printed
page's own pixels wherever the band is painted.

### One divergence this close-out created, and registered

`US-016-html-body-line-height`. Making the classic, minimal and creative
Previews render stored HTML revealed that their generators write the template's
own body ratio where those Previews now draw `.formatted-content`'s 1.4.
Professional and modern already follow the Preview. The Preview is right; the
DOCX side is owed. The signature pins both sides, so a generator drifting to
some third value reports as NEW rather than being absorbed.

## Phase 32 — complete

**This section previously read "deferred, with its prerequisites met". It was
written on 2026-09-25 and was accurate for about two days.** Phase 32 shipped
on 2026-09-27, in two deliberately separated passes:

- **#80** — the safe sweep, and `next-auth` removed. Splitting it this way meant
  a failure in the routine part could not be confused with a failure in the
  framework jump.
- **#81** — Next 15 and React 19. Its own title records the outcome: *closes the
  roadmap*.

`docs/engineering/performance-baseline.md` holds the numbers the upgrade was
measured against: build 92 s, shared First Load JS 161 kB, DOCX generation
6–10 ms per template.

The reasoning for deferring was right at the time — a framework upgrade changes
every surface at once, and the safety net built across phases 10–14 is what let
it be measured rather than hoped about. It was deferred, then done, and this
record simply failed to keep up. That is the specific failure mode this
reconciliation exists to correct: **a closure document that stops being true
is worse than none, because it is trusted.**

## Phase 30 — security findings

Two were fixed in this pass:

- **An unauthenticated diagnostic route returned the first eight characters of a
  live API key** on its error branch, and proxied a credentialed call on its
  success branch. `src/app/api/jobs/test/` is deleted, along with
  `src/app/api/sentry-example-api/`, a route that existed only to throw.
- **Error tracking was configured to send full personal data on every request**,
  at 100 % trace sampling, on a platform whose request bodies carry names,
  addresses, employment history and cover-letter text. `sendDefaultPii` is now
  false, sampling is 10 % in production, and a `beforeSend` strips the request
  payload, cookies, headers and user object.

**Four more were closed in #79 on 2026-09-27**, each verified present on `main`
at the time of this reconciliation:

| Finding | Closed by |
|---|---|
| SSRF — the allowlist was validated once and redirects then followed blindly | `src/lib/security/safe-fetch.ts`, which revalidates every hop |
| The five public AI endpoints had no rate limit and no bound on any input field | `src/lib/api/ai-rate-limit.ts` and `ai-input-limits.ts`, backed by migration `008_api_rate_limits.sql` |
| No security response headers at all | `headers()` in `next.config.js` — CSP (report-only), HSTS and the rest |
| No verified backup path | `scripts/db-backup.mjs` and `docs/engineering/database-backup.md` |

**Still open, and still the owner's to sequence:**

| Severity | Finding |
|---|---|
| Medium | A CSS-injection escape in the sanitiser through the deprecated `font face` attribute — a beacon or overlay, not script execution |
| Medium | The upload path trusts the client-supplied MIME type and returns parser errors; `pdf-parse` is unmaintained since 2018 |
| Medium | The `resumes` SELECT policy grants anonymous read of whole rows where `is_public`, which the app never sets but PostgREST would honour |
| Medium | No server-side validation or size bound on resume content: all writes go browser → PostgREST, and only `layout_settings` has a CHECK |
| Medium | The resume title is still interpolated unescaped into `Content-Disposition` — `download-docx/route.ts:259` at the time of writing |
| Medium | **Production carries at least one RLS-enabled table and one policy that no migration in this repository creates and no audit has inspected** — the counts in `rls-audit.md` and `migration-deployment.md` disagree, and GRANTs were never compared |

**Migration `008_api_rate_limits.sql` exists in this repository and has not been
deployed.** Until it is, the shared rate-limit tier cannot answer in production
and every limit built on it — the AI endpoints and password recovery alike —
degrades to per-instance. On a serverless deployment that multiplies the
effective ceiling by the instance count. The code says so where it matters; this
is the record saying so too.

The verdict was *conditional*: the authentication and authorization model is
sound — every one of the 22 user-data routes establishes identity server-side
and scopes by owner, and no route reads a user id from a request — but the key
disclosure had to go before production hardening, and it has.

## What the owner still decides

1. **The remaining security list above.** The review's suggested order has been
   worked through: SSRF and the AI bounds first, then the headers. What is left
   begins with the production RLS reconciliation, which cannot be settled from
   this repository at all.
2. **Deploying migration `008`**, which is what turns the rate limits from
   per-instance into real ones.
3. **The PRD backlog**: `prd-lifecycle.md` records 116 files under `tasks/`, 14
   slugs existing in two places at once, and three naming conventions. Nothing
   was moved or deleted; the rule is written and the cleanup is a decision.
4. **Whether `Integration` and `E2E` are truly required checks** — both carry
   `(required)` in their job names, but the branch-protection table lists only
   `Verify`. One of the two records is wrong.

## After the roadmap — what shipped on top, 2026-09-27 to 2026-09-28

Recorded here because each one was found while doing something else, and
together they say something about what the clean-up did and did not catch.

| | |
|---|---|
| **#82** | `html2pdf.js` pinned `jspdf ^3.0.0` and resolved a nested 3.0.4 — the copy the cover-letter export actually ran. The earlier bump of the top-level `jspdf` made the tree *look* patched. `html2pdf.js` 0.14.0 declares `jspdf ^4.0.0`, so upstream had already done the migration |
| **#83** | **Cover-letter PDF export produced no file at all, for every user, in every browser.** `html2canvas` 1.4.1 cannot parse `oklch()`, which Tailwind v4 put on every element. It threw, an `alert` swallowed it, and an invisible full-viewport overlay then blocked the dashboard until reload |
| **#84** | The dashboard offered Goals and Settings. Neither route existed; their prefetches 404'd on every visit |
| **#85** | **The product had no account recovery.** The login page linked to a route that had never existed in any commit |

Three of those four were invisible failures: no error surfaced to a server, no
test failed, and the one user-visible symptom — an alert — was auto-dismissed by
the test runner that should have caught it. The suites built in phases 10–14
were what made each one *findable* once suspected, and none of them was enough
to raise the suspicion. That gap is worth naming rather than filing away.

## The governance change made on 2026-09-25

The hook no longer prompts for `git push`, `git merge`, `gh pr *`, `gh release`,
`pnpm publish`, `vercel` or hosted database commands, at the owner's explicit
instruction. **The refusals are unchanged**: `.env` access, force-push,
`reset --hard`, `git clean`, `commit -a`, blind staging, and any repository
mutation on `main` or on a branch that cannot be determined. Both hook suites
pass — 74/74 and 232/232 — with every deny case intact.
