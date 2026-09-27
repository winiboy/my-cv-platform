# Milestone A — Engineering Quality Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `my-cv-platform` install deterministically under one package manager on one Node version, with a GitHub CI pipeline whose required checks are genuinely green.

**Architecture:** Four atomic commits on one branch. Remove the provably-dead dependency that breaks npm resolution, declare pnpm and Node authoritatively, then rewrite CI to consume those declarations. CI required checks are limited to validation that actually passes today (`typecheck`, `build`); lint runs as a non-blocking, visible debt report because its 476 errors are a separate, large project and governance forbids weakening the rule to go green.

**Tech Stack:** Next.js 14.2.33, React 18.3.1, TypeScript 5.9, ESLint 9 (flat config), pnpm 10.25.0, Node 22, GitHub Actions, Vercel.

**Spec:** This plan implements Milestone A / Phases 06–09 of the 32-phase roadmap supplied in the session handoff of 2026-08-28. Reconciliation findings against `origin/main` = `30fc5d9` are recorded in "Baseline Evidence" below.

## Global Constraints

- Branch: `chore/engineering-quality-foundation`, based on `origin/main` = `30fc5d99fb7ad1fd1ef96724d5b4148444c96d5f`. Never commit to `main`.
- One phase = one atomic commit. Four commits total, in order: 06, 09, 08, 07.
- Stage with explicit paths only: `git add -- exact/path`. Never `git add .`, `-A`, `--all`, `:/`.
- Do not push, open a PR, merge, or use `--admin`. Those are user-controlled.
- Never weaken, disable, or downgrade an ESLint rule, type check, or assertion to obtain green.
- Never create a script or CI job that reports success for validation that did not run.
- Do not modify, stage, or clean unrelated worktree state: `package-lock.json`'s local version-field edit (until Task 2 removes the file), the ~130 untracked entries (`Screenshot/`, `tasks/prds/`, `.playwright-mcp/`, `.claude/worktrees/`, `*.png`, `*.txt` logs), or `stash@{0}`.
- Never read, print, hash, copy, or commit `.env`, `.env.local`, or `.env.sentry-build-plugin`. Filenames only.
- After every phase's validation run, diff `.claude/settings.local.json` against `HEAD` and remove any permission entry the harness auto-added. Commit no pollution.
- Node floor is `>=20.9.0` — the highest real floor among `@supabase/supabase-js@2.87.1` (`>=20.0.0`), `eslint@9.39.1` (`^20.9.0 || >=21.1.0`), `next@14.2.33` (`>=18.17.0`).
- pnpm version is exactly `10.25.0`, matching the local toolchain that produced the green build.

---

## Baseline Evidence (measured 2026-08-28 at `30fc5d9`)

Establish these numbers before changing anything; every task compares against them.

| Check | Command | Result |
|---|---|---|
| Build | `pnpm build` | **exit 0** — green |
| Typecheck | `pnpm exec tsc --noEmit` | **exit 0** — zero errors |
| Lint | `pnpm lint` | **exit 1** — 623 problems (476 errors, 147 warnings) |
| CI install | `npm install` (GitHub) | **exit 1** — `ERESOLVE` on `react-dom-server` |

Lint debt composition (do **not** attempt to fix in this milestone):

| Rule | Count |
|---|---|
| `@typescript-eslint/no-explicit-any` | 458 |
| `@typescript-eslint/no-unused-vars` | 132 |
| `react-hooks/*` | 17 |
| other (`@next/next/*`, `react/*`) | 16 |

Corrections to prior project notes, confirmed by the runs above: the previously recorded `/_error`, `/404`, `/500` build failure **no longer occurs**, and the lint baseline is **623**, not ~313.

---

## Phase Ordering Rationale

The roadmap numbers these 06 → 07 → 08 → 09. Implementation order is **06 → 09 → 08 → 07** because Phase 07 (CI) consumes the outputs of 08 and 09: a CI workflow cannot install with `--frozen-lockfile` under a declared package manager and Node version before those declarations exist, and pinning CI to a dependency set still containing a React-0.14-era package would encode the defect. No phase goal is dropped or renumbered; only the landing sequence changes.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Quality-contract scripts (T1); dependency removals (T2); `packageManager` + `engines` (T2, T3) |
| `pnpm-lock.yaml` | Regenerate | Authoritative lockfile; loses 4 dead dependency trees (T2) |
| `package-lock.json` | Delete | Stale (v0.53.7 vs package.json 0.54.3), missing whole dependency groups, competes with pnpm-lock for Vercel/CI detection (T2) |
| `next.config.ts` | Delete | Dead: Next 14 ignores TS config and `next.config.js` wins regardless; its `reactCompiler: true` never applied (T2) |
| `.nvmrc` | Create | Single Node version for local, CI, Vercel (T3) |
| `.github/workflows/ci.yml` | Rewrite | pnpm-based pipeline, UTF-8 (currently UTF-16LE + BOM) (T4) |
| `docs/engineering/quality-contract.md` | Create | Documents which checks exist, which gate CI, and why lint does not yet (T1) |

Files deliberately untouched: all of `src/`, `supabase/migrations/`, `eslint.config.mjs`, `tsconfig.json`, `next.config.js`, `.claude/**` (except pollution reverts).

---

### Task 1 — Phase 06: Engineering Quality Contract

Expose only quality entry points whose underlying validation genuinely exists. `typecheck` is added because `tsc --noEmit` is proven green. `test`, `test:integration`, and `test:e2e` are **deliberately not added** — no such infrastructure exists, and a script that exits 0 without running anything is a fake PASS.

**Files:**
- Modify: `package.json` (scripts block, lines 5–10)
- Create: `docs/engineering/quality-contract.md`

**Interfaces:**
- Produces: `pnpm typecheck` → `tsc --noEmit`, exit 0 on success. Task 4 invokes this as a required CI step.

- [ ] **Step 1: Record the pre-change typecheck result**

```bash
pnpm exec tsc --noEmit
```

Expected: exit 0, no output. If this fails, STOP — the baseline has drifted and the plan needs re-derivation.

- [ ] **Step 2: Add the `typecheck` script**

In `package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 3: Verify the new script runs**

```bash
pnpm typecheck
```

Expected: exit 0, no diagnostics.

- [ ] **Step 4: Write the quality-contract document**

Create `docs/engineering/quality-contract.md`:

```markdown
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
```

- [ ] **Step 5: Confirm no permission pollution**

```bash
git diff -- .claude/settings.local.json
```

Expected: empty. If entries were auto-added, remove exactly those lines before committing.

- [ ] **Step 6: Commit**

```bash
git add -- package.json docs/engineering/quality-contract.md
git commit -m "chore(quality): add typecheck script and engineering quality contract"
```

---

### Task 2 — Phase 09: Remove dead dependencies and settle lockfile strategy

Four dependencies have zero import sites anywhere outside lockfiles. One of them (`react-dom-server@0.0.5`, a React-0.14-era package present since the initial commit) is the sole cause of the `ERESOLVE` failure that has kept CI red on every run since April 2026.

**Files:**
- Modify: `package.json` (remove 4 dependencies; add `packageManager`)
- Regenerate: `pnpm-lock.yaml`
- Delete: `package-lock.json`, `next.config.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `packageManager: "pnpm@10.25.0"` in `package.json`, and a single authoritative `pnpm-lock.yaml`. Task 4's `pnpm install --frozen-lockfile` depends on both.

- [ ] **Step 1: Re-verify each dependency is genuinely unused**

Run each and confirm zero matches outside lockfiles and `.claude/worktrees/`:

```bash
grep -rn "react-dom-server\|html-to-docx\|PrismaAdapter\|prisma-adapter\|react-compiler" src/ *.js *.mjs *.ts 2>/dev/null
```

Expected: no output. `next.config.ts:5` may match `reactCompiler` — that file is deleted in Step 3, so it does not block removal. If any match appears in `src/`, STOP and report; that dependency is live and must stay.

- [ ] **Step 2: Remove the four dead dependencies**

In `package.json`, delete these lines:

From `dependencies`:
```json
    "@next-auth/prisma-adapter": "^1.0.7",
    "html-to-docx": "^1.8.0",
    "react-dom-server": "^0.0.5",
```

From `devDependencies`:
```json
    "babel-plugin-react-compiler": "1.0.0",
```

Rationale per package:
- `react-dom-server@0.0.5` — peer `react@^0.14.7`, breaks npm resolution, never imported.
- `html-to-docx` — never imported; DOCX generation uses the `docx` library via per-template generators under `src/app/api/resumes/[id]/download-docx/`.
- `@next-auth/prisma-adapter` — never imported; `src/lib/auth.ts` sets no adapter.
- `babel-plugin-react-compiler` — only consumer was `next.config.ts`, which Next 14 never loads.

- [ ] **Step 3: Delete the dead TS config and the stale npm lockfile**

```bash
git rm -- next.config.ts package-lock.json
```

`next.config.ts` is dead because Next 14.2.33 does not support TypeScript config files (a Next 15 feature) and `next.config.js` takes precedence in any case — `reactCompiler: true` has never taken effect. `package-lock.json` is stale (committed at v0.53.7 against a v0.54.3 `package.json`, missing entire dependency groups such as `@dnd-kit/*` and `docx`) and its presence makes package-manager detection on Vercel ambiguous.

Note: this `git rm` also clears the unrelated local version-field edit in `package-lock.json`, which is correct — the whole file is going away by design, not being cleaned incidentally.

- [ ] **Step 4: Declare the authoritative package manager**

In `package.json`, add after `"private": true,`:

```json
  "packageManager": "pnpm@10.25.0",
```

This is what makes pnpm authoritative for Corepack, GitHub Actions, and Vercel detection, replacing the ambiguity created by two competing lockfiles.

- [ ] **Step 5: Regenerate the lockfile**

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates; the `react-dom-server`, `html-to-docx`, `@next-auth/prisma-adapter`, and `babel-plugin-react-compiler` importer entries disappear.

- [ ] **Step 6: Prove the lockfile is committable and frozen-install-clean**

```bash
grep -c "react-dom-server\|html-to-docx\|prisma-adapter\|react-compiler" pnpm-lock.yaml
```
Expected: `0`.

```bash
pnpm install --frozen-lockfile
```
Expected: exit 0. This is exactly what CI will run — if it fails here, CI will fail.

- [ ] **Step 7: Verify no regression**

```bash
pnpm typecheck
```
Expected: exit 0, zero errors.

```bash
pnpm build
```
Expected: exit 0. Confirm the route table still lists the locale pages and API routes as before.

```bash
pnpm lint 2>&1 | tail -3
```
Expected: still 623 problems. This milestone must not change the lint count in either direction — a drop would mean dead code was removed beyond scope; a rise would mean a regression.

- [ ] **Step 8: Confirm no permission pollution, then commit**

```bash
git diff -- .claude/settings.local.json
```
Expected: empty; remove any auto-added lines first.

```bash
git add -- package.json pnpm-lock.yaml
git commit -m "chore(deps): remove unused dependencies, drop stale npm lockfile, declare pnpm"
```

`next.config.ts` and `package-lock.json` are already staged by `git rm` in Step 3.

---

### Task 3 — Phase 08: Align the Node runtime

Pick one Node version for local, CI, and Vercel. CI currently uses Node 18, which is **below** the floor required by `@supabase/supabase-js` (`>=20.0.0`) and `eslint@9` (`^20.9.0 || >=21.1.0`) — an unnoticed second defect.

Node **22** is chosen: it clears every floor, is supported by both `actions/setup-node` and Vercel, and falls inside Next 14.2.33's tested matrix. The local toolchain is currently Node 24.19.0, which does produce a green build, but Next 14 predates Node 24's release and CI/Vercel parity matters more than avoiding a local switch. `engines` is set to a range rather than a pin so a developer on 24 is not hard-blocked.

**Files:**
- Create: `.nvmrc`
- Modify: `package.json` (add `engines`)

**Interfaces:**
- Produces: `.nvmrc` containing `22`. Task 4 reads it via `node-version-file: .nvmrc`, so CI and local cannot drift.

- [ ] **Step 1: Create `.nvmrc`**

File `.nvmrc`, single line, LF ending, no BOM:

```
22
```

- [ ] **Step 2: Declare the engine floor**

In `package.json`, add after the `packageManager` line:

```json
  "engines": {
    "node": ">=20.9.0"
  },
```

- [ ] **Step 3: Verify the declaration does not break install**

```bash
pnpm install --frozen-lockfile
```
Expected: exit 0, no engine warning that blocks install. A warning that local Node 24 differs from `.nvmrc` is acceptable and expected.

- [ ] **Step 4: Verify build still passes**

```bash
pnpm build
```
Expected: exit 0.

- [ ] **Step 5: Confirm no permission pollution, then commit**

```bash
git diff -- .claude/settings.local.json
```
Expected: empty.

```bash
git add -- .nvmrc package.json
git commit -m "chore(runtime): pin Node 22 via .nvmrc and declare engine floor"
```

---

### Task 4 — Phase 07: Rewrite GitHub CI onto pnpm

The existing workflow is UTF-16LE with a BOM (a PowerShell `>` redirect artifact — bytes `FF FE`), uses Node 18, and runs `npm install`. Replace it with a UTF-8 pnpm pipeline whose required job contains only checks proven green.

**Files:**
- Rewrite: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `packageManager` (Task 2), `.nvmrc` (Task 3), `pnpm typecheck` (Task 1).

- [ ] **Step 1: Confirm the current file's encoding defect**

```bash
git cat-file -p HEAD:.github/workflows/ci.yml | od -c | head -2
```
Expected: begins `377 376` (UTF-16LE BOM) with `\0`-interleaved characters.

- [ ] **Step 2: Write the new workflow as UTF-8**

Overwrite `.github/workflows/ci.yml`. Write with a UTF-8 (no BOM) writer — do **not** use PowerShell `>` redirection, which reintroduces UTF-16:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    name: Verify (required)
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Build
        run: pnpm build

  lint-debt-report:
    name: Lint debt (non-blocking)
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Report lint debt
        continue-on-error: true
        run: |
          set +e
          pnpm lint > lint-report.txt 2>&1
          status=$?
          {
            echo "## Lint debt report"
            echo
            echo "This job is **not** a gate. It records the tracked lint debt"
            echo "described in docs/engineering/quality-contract.md."
            echo
            echo '```'
            tail -n 5 lint-report.txt
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"
          exit $status

      - name: Upload lint report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lint-report
          path: lint-report.txt
```

`pnpm/action-setup@v4` reads the `packageManager` field from Task 2, so the pnpm version needs no second declaration. `continue-on-error` is on the **step**, so the job reports the real exit status in its logs and summary while not failing the run — the debt is visible without falsely claiming a pass and without painting every PR red.

- [ ] **Step 3: Verify the file is UTF-8 with no BOM**

```bash
od -c .github/workflows/ci.yml | head -2
```
Expected: begins `n a m e :` with no `377 376` and no `\0` bytes.

- [ ] **Step 4: Validate the YAML parses**

```bash
node -e "const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(f.charCodeAt(0)===0xFEFF) throw new Error('BOM present'); console.log('bytes:',Buffer.byteLength(f),'lines:',f.split('\n').length)"
```
Expected: prints byte and line counts without throwing.

- [ ] **Step 5: Reproduce the CI sequence locally**

Run exactly what the required job runs, in order:

```bash
pnpm install --frozen-lockfile
```
Expected: exit 0.

```bash
pnpm typecheck
```
Expected: exit 0.

```bash
pnpm build
```
Expected: exit 0.

This is local evidence only. It does **not** prove the GitHub run is green — see Residual Risks.

- [ ] **Step 6: Confirm no permission pollution, then commit**

```bash
git diff -- .claude/settings.local.json
```
Expected: empty.

```bash
git add -- .github/workflows/ci.yml
git commit -m "ci: migrate workflow to pnpm on Node 22 with typecheck and build gates"
```

---

## Post-Implementation Verification

- [ ] `git log --oneline origin/main..HEAD` shows exactly 4 commits, in order: quality contract, deps, runtime, ci.
- [ ] `git status --porcelain` shows no staged or modified tracked file beyond the intended set, and the ~130 pre-existing untracked entries remain untouched.
- [ ] `git stash list` still contains `stash@{0}: WIP on ralph/tools-page`.
- [ ] `git diff -- .claude/settings.local.json` is empty.
- [ ] `pnpm lint 2>&1 | tail -3` still reports 623 problems — unchanged, as required.

## Residual Risks

1. **CI green is unproven until pushed.** All evidence in this plan is local. The required job's `pnpm build` runs in an environment with no `.env.local`. Static analysis shows every Supabase client is constructed **inside** a function (`src/lib/supabase/client.ts:11`, `src/lib/supabase-localities.ts:30`), not at module scope, so a missing env var should not throw during prerender — but this is inference, not measurement. **Fallback if the CI build fails on missing env:** add non-secret placeholder values (`NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co` and a dummy anon key) as `env:` on the Build step only. These are fake public values, not credentials.
2. **Sentry source-map upload.** `next.config.js` sets `silent: !process.env.CI`, so CI runs non-silent. Without `SENTRY_AUTH_TOKEN` the plugin warns and skips upload; it should not fail the build, but the warning will be visible.
3. **Vercel Node version** is a dashboard setting this plan cannot change. After merge, the user should confirm the Vercel project's Node version is 22.x so preview matches CI.
4. **Local Node drift.** Local is 24.19.0 against `.nvmrc` 22. `engines: >=20.9.0` permits both, so nothing breaks, but a developer wanting exact parity should run `nvm use`.
5. **`@types/react@19` on `react@18.3.1`** remains an unresolved version mismatch. Typecheck is currently clean, so it is out of scope here; it belongs to the later toolchain-modernization phase.

## Next Phase Prerequisites

Milestone B (Phases 10–14) requires: green required CI (this milestone), a chosen unit-test runner, and a decision on whether the lint-debt burndown is scheduled before or in parallel with test infrastructure. The lint debt must reach zero before lint can be promoted to a required check.
