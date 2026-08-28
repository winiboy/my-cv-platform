# Engineering Quality Contract

Every entry point listed here runs real validation. A command is added to this
table only once the validation behind it exists. Scripts that would exit 0
without checking anything are prohibited.

## Available today

| Command | Runs | CI status | Baseline at 30fc5d9 |
|---|---|---|---|
| `pnpm lint` | ESLint 9 flat config over the repo | Reported, **not required** | 311 problems (237 errors, 74 warnings) |
| `pnpm typecheck` | `tsc --noEmit` | **Required** | 0 errors |
| `pnpm test` | Vitest, pure-function unit tests | **Required** | 76 tests passing |
| `pnpm build` | `next build` | **Required** | Success |

`pnpm test:watch` runs the same suite in watch mode for local development; it
is not used by CI.

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
