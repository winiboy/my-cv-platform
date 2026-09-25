# Programme closure — phases 06 to 32

**Date:** 2026-09-25. **Branch:** `ralph/milestone-c-part-3-parity-defects`.

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
| **C** — resume rendering unification | 15–21 | **Substantially complete.** See below |
| **D** — development operating system | 22–24 | **Complete.** `prd-lifecycle.md`, `ralph-pass-criteria.md`, `progress-log-format.md` |
| **E** — database / environment maturity | 25–29 | **Complete.** Local Supabase, RLS audit, staging database, protected `main`, preview validation on every PR |
| **F** — production hardening | 30–32 | **30 and 31 complete. 32 deferred**, see below |

## Milestone C, in detail

Part 1 built one typed layout model and persisted it. Part 2 moved every export
onto that model without changing a byte of output, and built `pnpm test:parity`,
which renders a fixture resume through Preview, PDF and DOCX for all five
templates and compares every surface against the model and against the others.

**That check is what turned a tidy-up into a programme.** It found 58
divergences nobody had named. Part 3 was rewritten from 5 stories to 16 to
account for them.

Eleven of the sixteen are done: the parity report moved from **MATCH 93 /
KNOWN 110** at Part 3's start to **MATCH 159 / KNOWN 47**, with **0 NEW** rows
throughout.

### The five stories deliberately left open

Each is measured, named in the report, and fails loudly if it changes shape.
None is a surprise waiting to be found.

| Story | What still differs |
|---|---|
| **US-009** | The classic and minimal Previews render sections in a hardcoded order and ignore the stored order and visibility; their DOCX honours both |
| **US-010** | Modern's empty-main-column fallback disagrees between surfaces |
| **US-011** | Font scale does not reach the classic, minimal and creative Previews, and the per-property sizes reach the Preview but not the DOCX |
| **US-013** | Modern's accent falls back to gold on a non-integer stored hue in the Preview while the DOCX uses the real colour; the professional print band ignores the user's sidebar colour |
| **US-015** | Creative's section order and visibility controls do nothing on either surface — a dead control, not a divergence |

**US-013 also needs a contract change before it can start:** its second criterion
expects a multi-page print capture to show a visible sidebar band, and that band
is never visible in print — `html` and `body` are `white !important` and the
gradient ends where `body` ends. The criterion has to be reworded or the story
blocks on its own terms.

### One divergence this close-out created, and registered

`US-016-html-body-line-height`. Making the classic, minimal and creative
Previews render stored HTML revealed that their generators write the template's
own body ratio where those Previews now draw `.formatted-content`'s 1.4.
Professional and modern already follow the Preview. The Preview is right; the
DOCX side is owed. The signature pins both sides, so a generator drifting to
some third value reports as NEW rather than being absorbed.

## Phase 32 — deferred, with its prerequisites met

Phase 32 is the controlled framework and toolchain upgrade. Its own definition
gates it on CI being green, unit, integration, E2E and visual suites existing,
and a performance baseline. **All of those now exist**, which is precisely why
it should be its own piece of work rather than the tail of this one: a framework
upgrade changes every surface at once, and the value of the safety net built
here is that such a change can now be measured instead of hoped about.

`docs/engineering/performance-baseline.md` records the numbers to compare
against: build 92 s, shared First Load JS 161 kB, DOCX generation 6–10 ms per
template.

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

The rest are recorded for the owner and are **not** fixed here:

| Severity | Finding |
|---|---|
| High | SSRF: the URL allowlist is validated once and redirects are then followed blindly, in `extract-job-url` and `fetch-external`. The allowlists also match multi-tenant ATS domains by suffix |
| High | The five public AI endpoints have no authentication, no rate limit and no `.max()` on any input field, against the owner's own provider account |
| Medium | A CSS-injection escape in the sanitiser through the deprecated `font face` attribute — a beacon or overlay, not script execution |
| Medium | The upload path trusts the client-supplied MIME type and returns parser errors; `pdf-parse` is unmaintained since 2018 |
| Medium | No security response headers at all: no CSP, HSTS, `frame-ancestors` or `X-Content-Type-Options` |
| Medium | The `resumes` SELECT policy grants anonymous read of whole rows where `is_public`, which the app never sets but PostgREST would honour |
| Medium | No server-side validation or size bound on resume content: all writes go browser → PostgREST, and only `layout_settings` has a CHECK |
| Medium | The resume title is interpolated unescaped into `Content-Disposition` |
| Medium | **Production carries at least one RLS-enabled table and one policy that no migration in this repository creates and no audit has inspected** — the counts in `rls-audit.md` and `migration-deployment.md` disagree, and GRANTs were never compared |

The verdict was *conditional*: the authentication and authorization model is
sound — every one of the 22 user-data routes establishes identity server-side
and scopes by owner, and no route reads a user id from a request — but the key
disclosure had to go before production hardening, and it has.

## What the owner still decides

1. **US-013's second criterion** must be reworded before that story can run.
2. **The five open stories**: finish them, or accept them as measured
   differences and close Part 3.
3. **The security list above**, in the order the review suggested: SSRF and the
   AI endpoint bounds first, then the headers, then the production RLS
   reconciliation.
4. **The PRD backlog**: `prd-lifecycle.md` records 116 files under `tasks/`, 14
   slugs existing in two places at once, and three naming conventions. Nothing
   was moved or deleted; the rule is written and the cleanup is a decision.
5. **Whether `Integration` and `E2E` are truly required checks** — both carry
   `(required)` in their job names, but the branch-protection table lists only
   `Verify`. One of the two records is wrong.

## The governance change made on 2026-09-25

The hook no longer prompts for `git push`, `git merge`, `gh pr *`, `gh release`,
`pnpm publish`, `vercel` or hosted database commands, at the owner's explicit
instruction. **The refusals are unchanged**: `.env` access, force-push,
`reset --hard`, `git clean`, `commit -a`, blind staging, and any repository
mutation on `main` or on a branch that cannot be determined. Both hook suites
pass — 74/74 and 232/232 — with every deny case intact.
