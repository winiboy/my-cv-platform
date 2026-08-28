# Engineering Quality Contract

Every entry point listed here runs real validation. A command is added to this
table only once the validation behind it exists. Scripts that would exit 0
without checking anything are prohibited.

## Available today

| Command | Runs | CI status | Baseline at 30fc5d9 |
|---|---|---|---|
| `pnpm lint` | ESLint 9 flat config over the repo | Reported, **not required** | 623 problems (476 errors, 147 warnings) |
| `pnpm typecheck` | `tsc --noEmit` | **Required** | 0 errors |
| `pnpm build` | `next build` | **Required** | Success |

## Not yet available

`pnpm test`, `pnpm test:integration`, and `pnpm test:e2e` are intentionally
absent. Unit tests (Phase 10), integration tests (Phase 11), Playwright
(Phase 12), and visual regression (Phase 13) each add their script when that
layer lands, and become required CI checks at that point.

## Why lint is not a required check

Lint currently reports 476 errors, of which 458 are
`@typescript-eslint/no-explicit-any` and 132 more are unused-variable
warnings. Only 8 are auto-fixable. Eliminating this debt is a typing project
across most of `src/`, and it must not be attempted before a test suite
exists to catch regressions.

Project rules forbid weakening a lint rule to obtain a green result, so
downgrading `no-explicit-any` is not an option. Instead CI runs lint in a
clearly-labelled non-blocking job that publishes the current counts to the
run summary, keeping the debt visible without either blocking every PR or
falsely reporting a pass. Lint is promoted to a required check in the
dedicated lint-debt phase, once the error count reaches zero.
