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
| `pnpm build` | `next build` | **Required** | Success |

The three required commands run in one CI job, `Verify (required)`, in that
order — typecheck, test, build — so a logic regression fails before the
slower build step.

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

## Not yet available

`pnpm test:integration` and `pnpm test:e2e` are intentionally absent.
Integration tests (Phase 11), Playwright (Phase 12) and visual regression
(Phase 13) each add their script when that layer lands, and become required
CI checks at that point.

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
