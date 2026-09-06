# Engineering Quality Contract

Every entry point listed here runs real validation. A command is added to this
table only once the validation behind it exists. Scripts that would exit 0
without checking anything are prohibited.

## Available today

| Command | Runs | CI status | Baseline at dce3750 |
|---|---|---|---|
| `pnpm lint` | ESLint 9 flat config over the repo | Reported, **not required** | 311 problems (237 errors, 74 warnings) |
| `pnpm typecheck` | `tsc --noEmit` | **Required** | 0 errors |
| `pnpm test` | Vitest, pure-function unit tests | **Required** | 89 tests passing |
| `pnpm test:integration` | Vitest, route handlers against a local Supabase stack | **Required** | 14 tests passing |
| `pnpm test:e2e` | Playwright, real browser against a production build | **Required** | 22 passing |
| `pnpm build` | `next build` | **Required** | Success |
| `pnpm build:verify` | `next build` into `.next-verify` | Local convenience | Same result as `pnpm build` |

**Use `pnpm build:verify` when a dev server is running.** A plain `pnpm build`
writes into `.next`, the directory a running `next dev` reads, leaving
`.next/cache` holding both development and production webpack packs — the dev
server then invalidates and rebuilds against all of it. Observed here: 1.6 GB
of mixed cache and a dev server that felt broken rather than merely cold.
Nothing warns you, because both commands succeed.

CI and releases should keep using `pnpm build`; nothing shares the directory
there. `playwright.config.ts` already builds into `.next-e2e` for the same
reason.

`typecheck`, `test` and `build` run in one CI job, `Verify (required)`, in that
order, so a logic regression fails before the slower build step.

`test:integration` runs in its own job, `Integration (required)`, because it
must start a database first. That job also runs the RLS audit — see below for
why both are needed.

`pnpm test:watch` runs the same suite in watch mode for local development; it
is not used by CI.

## Branch protection

`main` is protected as of 2026-08-28 (Phase 28). The settings live in GitHub,
not in this repository, so they are recorded here to stay auditable and
restorable:

| Setting | Value | Why |
|---|---|---|
| Required status check | `Verify (required)` | The only check that gates. The lint job is deliberately excluded — see below. |
| Strict (branch up to date) | `true` | A PR must be current with `main` before merging, so two individually-green PRs cannot break `main` together. |
| Enforce for administrators | `true` | `gh pr merge --admin` no longer works for anyone. |
| Required approving reviews | `0` | A PR is required, but the sole maintainer can merge it. GitHub does not permit self-approval, so any higher count would deadlock the repository. |
| Force pushes | denied | |
| Branch deletion | denied | |

Protection was deliberately not enabled before Phase 07. CI had failed on
every run since April 2026, so a required check would have deadlocked the
repository rather than protected it. It became meaningful only once
`Verify (required)` was genuinely green.

**On the administrator setting.** PR #15 was merged with `--admin` while
required checks were failing — a documented one-time exception taken before
the CI defect was fixed. `enforce_admins: true` makes that route unavailable
rather than merely discouraged. The consequence is deliberate: if CI breaks
badly enough to need a bypass, protection must be explicitly disabled first,
which is a visible, auditable act rather than a flag on a merge command.

Restore these settings with:

```bash
gh api -X PUT repos/winiboy/my-cv-platform/branches/main/protection --input <file>
```

## Unit test scope

The suite covers pure, deterministic functions only. Tests live beside the
module they cover as `<module>.test.ts` and run under Node, with no DOM.
Adding React component tests later needs a DOM environment declared as a
separate Vitest project rather than a change to the existing one.

Tests must fail when behaviour regresses, not merely execute the code. Where
a function's current behaviour looks wrong, the defect is reported rather
than encoded as an expected value — a test that asserts a bug cements it.

## Integration test scope

`*.integration.test.ts`, run by `vitest.integration.config.mts`. These call
real route handlers against the real local Supabase stack: real Zod
validation, real queries, real auth, real database.

Start the stack first:

```bash
pnpm supabase start
pnpm test:integration
```

The single seam is `createServerSupabaseClient`, replaced so a test can act as
a chosen user without reconstructing cookie and session plumbing. Everything
past that seam is real.

**These tests do not cover RLS, and it matters that they look like they do.**
Verified by experiment: disabling RLS on `cover_letters` leaves all eleven
tests passing, because each route also filters with `.eq('user_id', user.id)`
and that alone satisfies every ownership assertion.

That is defense in depth working — two independent layers, either sufficient —
but the consequence is that the integration suite cannot detect RLS being
weakened. `supabase/tests/rls-audit.sql` covers the policy layer, and the CI
job runs both. Neither substitutes for the other.

Also not covered here: cookie and session translation, and middleware. Both
need a running server and belong to E2E.

`src/test/integration/supabase.ts` refuses to run against any non-local host.
These helpers create and delete users, so that guard is enforcement rather
than convention.

## E2E scope

`pnpm test:e2e` drives a real browser against a production build of the app
talking to the local Supabase stack. It covers the one layer the integration
suite deliberately does not reach: the login form, the browser Supabase
client, the cookies it writes, and the server reading them back.

It builds into `.next-e2e` and runs `next start` rather than `next dev`. Both
are for determinism, not realism: sharing `.next` with a dev server produced
intermittent `Unexpected end of JSON input` 500s that failed two tests on one
run and passed them on the next with no code change. Against a build the same
suite runs roughly six times faster and has been repeatably clean.

It became a **required check** on 2026-09-05, on evidence rather than
confidence: 10 consecutive runs on GitHub's hardware, each verified at *step*
level. That distinction was the point — the job carried `continue-on-error`,
so it reported success even when it failed, and the green job badges it
accumulated proved nothing until the `Run E2E tests` step itself was checked.
All 10 were genuine.

At 3.98–5.36 minutes it is now the longest job. It runs in parallel with
`Verify` (~3 min), so it sets the wall clock for a PR.

Known harness limitation: two runs launched back to back collide at
`webServer` startup, because `reuseExistingServer` is false and each run
starts its own server. CI runs it once per job so it is unaffected, but
locally `pnpm test:e2e` needs a moment between runs.

Tests create and delete users, so `src/test/local-stack.ts` refuses any
non-local Supabase host. That matters more here than for the integration
suite: the app reads `.env.local`, which points at a real project, so a run
that failed to override it would create users in production.

### `pnpm test:visual`

Pixel comparison of the five resume templates, rendered through the real
preview route, against committed baselines. Requires the local Supabase stack.

This is the only layer that can see a rendering regression: unit tests do not
render, integration tests stop at the server, and the E2E suite asserts on
URLs, text and cookies — none of which move when a column shifts.

**Local only, deliberately.** Baselines are per-platform because Windows and
Linux rasterise text differently, and only `win32` baselines are committed. A
CI job would fail every run for a reason unrelated to correctness. Promoting it
requires Linux baselines generated in CI itself.

Baseline updates are an approval decision, not a test fix. See
`docs/engineering/visual-regression.md` for the rules, the thresholds, and the
truncation guard.

## Provider health — the layer no test can be

Every suite above tests *the code*. None of them can see the AI provider
breaking, and that is deliberate: `src/lib/ai/client.test.ts` mocks the Groq
SDK, no test holds an API key, and CI has no `GROQ_API_KEY` secret. A test that
called Groq for real would be non-deterministic, cost money on every PR, and
fail on a fork.

The cost of that gap has already been paid. Groq retired a hosted model, every
AI tool in the product began returning 500, and nothing noticed for an unknown
period — not the unit tests, not the integration tests, not E2E, not CI. The
owner found it by clicking a button in the UI. No amount of test coverage would
have caught it, because not a single line of code had changed.

Three things close it:

| Layer | What it catches |
|---|---|
| `GET /api/health/ai` | Whether the running app can actually complete a Groq request, on demand |
| `.github/workflows/ai-health.yml` | The same, daily, unprompted |
| `Sentry.captureException` in `generateCompletion` | Every real user-facing AI failure, as it happens |

### `GET /api/health/ai`

Two depths, because a live check spends tokens and must not become a free way
for anyone to run down the Groq budget.

**Unauthenticated** — configuration only. Reports whether an API key is present
(a boolean; never the value, never its length) and which model ids resolve,
each tagged `env` or `default`. Makes no provider call and costs nothing.

**Authenticated** with `Authorization: Bearer <HEALTH_CHECK_TOKEN>` —
additionally performs one 32-token completion through the same
`generateCompletion` path production uses, and reports the model actually used
and the latency. Probing the SDK directly would have proved that Groq works
while saying nothing about whether *the app* can reach it.

Status codes are the contract, because an uptime monitor watches those and not
the body:

| Code | Meaning |
|---|---|
| `200` | The checked depth is healthy |
| `503` | The key is missing, or the provider rejected the call — a retired model lands here |
| `401` | A bearer token was supplied but is wrong, malformed, or `HEALTH_CHECK_TOKEN` is not configured |

**The deep check fails closed.** With `HEALTH_CHECK_TOKEN` unset there is no
correct credential, so the deep check is unavailable rather than open. The
unauthenticated depth keeps working.

The body never carries the API key, a provider stack trace, or the provider's
own error text — only a short reason code such as `model_not_found`. The detail
goes to Sentry.

Verified by making the check fail the way a real retirement does — setting
`GROQ_MODEL` to a nonexistent id and confirming a 503 rather than a 200. A
health check that cannot report unhealthy is worse than none, so that path is
proven rather than assumed, both here and in
`src/app/api/health/ai/route.test.ts`.

### The scheduled workflow

`.github/workflows/ai-health.yml` runs daily and on `workflow_dispatch`. It is
deliberately **not** in `ci.yml`: that runs per pull request and checks the
code, while this checks the world.

It prefers the deployed endpoint (`AI_HEALTH_URL` + `HEALTH_CHECK_TOKEN` as
secrets) and otherwise calls Groq directly via `scripts/ai-health-probe.mjs`,
using the model id the application would use. The probe reads the fallback id
out of `src/lib/ai/client.ts` rather than copying it — a copy is exactly what
made the last retirement a three-file change — and a test asserts that parse
still resolves.

**It skips cleanly when no `GROQ_API_KEY` secret exists**, which is the state
of this repository today, printing what to add rather than failing red. A job
that fails every morning for a known reason trains everyone to ignore it, and
a check nobody trusts is worse than no check. It becomes live the moment the
secret is added; nothing else needs changing.

### Sentry

`generateCompletion` captures every provider failure, tagged with the model id,
the calling operation and a coarse reason. One capture point covers all ten
consumers — adding it to each route would recreate the duplication that made
the retirement a three-file change in the first place.

The prompt is deliberately never captured: it carries user resume content,
which `.claude/rules/security.md` forbids logging. A test asserts the prompt
does not appear anywhere in the captured payload.

## Not yet available

Every layer named by the roadmap now has a script.

## Why lint is not a required check

Lint currently reports 237 errors, of which 229 are
`@typescript-eslint/no-explicit-any`, plus 66 unused-variable warnings.
Eliminating this debt is a typing project across most of `src/`.

The debt concentrates heavily: `src/app/api/resumes/[id]/download-docx`
(61 problems across the five DOCX generators),
`src/components/dashboard/resume-sections` (31) and
`src/components/dashboard` (27) account for roughly half of it.

Note that `.claude/**` is excluded from linting. Agent worktrees under
`.claude/worktrees/` contain a full duplicate copy of `src/`, which double
counted every problem (623 instead of 311) and made local lint disagree with
CI, where those untracked directories do not exist.

Project rules forbid weakening a lint rule to obtain a green result, so
downgrading `no-explicit-any` is not an option. Instead CI runs lint in a
clearly-labelled non-blocking job that publishes the current counts to the
run summary, keeping the debt visible without either blocking every PR or
falsely reporting a pass. Lint is promoted to a required check in the
dedicated lint-debt phase, once the error count reaches zero.
