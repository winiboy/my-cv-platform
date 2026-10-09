# PRD: Run the parity check in CI

**Status:** APPROVED 2026-10-09

## Objective

`pnpm test:parity` runs on every pull request to `main` as a CI job. A change
that introduces a NEW Preview/PDF/Word divergence can then no longer merge
unnoticed, as PR #88 did.

## Context / Current Behavior

- **CI today.** `.github/workflows/ci.yml` runs every job on `ubuntu-latest`:
  `verify`, `integration`, `lint-debt-report` and `e2e`.
  - The `e2e` job runs `playwright install --with-deps chromium`, then
    `supabase start -x …`, then `pnpm test:e2e`. The Playwright webServer builds
    the app.
  - No job runs `test:parity` or `test:visual`. That is stated in
    `docs/engineering/ralph-pass-criteria.md:42-46`, and the header of
    `playwright.parity.config.ts` (lines 16-20) says "NOT A CI GATE".
- **What it cost.** PR #88 merged with parity red: 182 passed / 67 failed. That
  went unseen until #94 realigned the reader.
  - Since #94, local parity is green: 261 passed, MATCH 206 / KNOWN 3 / NEW 0,
    report sha256 `4e0e9975…`.
- **The parity config.**
  - `playwright.parity.config.ts`: port `PARITY_PORT ?? 3120`, `NEXT_DIST_DIR=.next-parity`, `reuseExistingServer: false`, 600 s
    webServer timeout, `workers: 1`, `retries: 0`.
  - `assertLocalSupabase` rejects any non-local Supabase.
  - It uses no Word or Windows API. The PDF comes from Chromium `page.pdf()`,
    read with the pdf.js bundled in `pdf-parse`, and the DOCX is read as XML
    with JSZip.
- **The font dependency.** The check depends on installed fonts.
  - `font-family` rows compare the faces Chromium resolves
    (`surfaces.ts:510-546`, `verdicts.ts:696-699`).
  - `verdicts.ts:959-966` warns that, without Verdana ("typical Linux CI"),
    the professional and modern font-family rows turn NEW.
  - Classic's Times New Roman is likely affected the same way.
  - The report records the OS and how each font resolved
    (`parity.spec.ts:417-421`).
- **Why not Windows.** GitHub Windows runners cannot run the Linux containers
  `supabase start` needs. So the job must be Linux, with Microsoft core fonts
  installed.
- **Visual suite.** It is OS-specific (`snapshotPathTemplate` per platform; only
  `win32` baselines are committed) and stays out of scope.

## Scope

- A new CI job, "Parity (required)", in `ci.yml` on `ubuntu-latest`.
  - It installs Microsoft core fonts (`ttf-mscorefonts-installer`, with EULA
    pre-accepted) and refreshes the font cache.
  - It installs Chromium, starts Supabase with the same exclusions as `e2e`
    (mailpit may be excluded), and runs `pnpm test:parity`.
  - It uploads `test-results-parity/` (the report and observations) as an
    artifact, always.
- The job passes on exit 0, which means 0 NEW and every KNOWN still
  reproducing. That matches the suite's own exit rules.
- Make the new check required on `main`, once the owner adds it to branch
  protection. That last step is the owner's action and is listed below.
- Update `docs/engineering/ralph-pass-criteria.md` (the "local-only" paragraph)
  and the "NOT A CI GATE" header of `playwright.parity.config.ts` to describe the
  new state.

## Out of Scope

- `test:visual` in CI (it needs Linux baselines; a separate decision).
- Any change to `e2e/parity/*` comparison logic, tolerances or the KNOWN list.
- Speeding up the parity suite.

## Impact Assessment

- **Frontend / UI:** Not affected.
- **Internationalization:** Not affected.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected in code. Exports are now gated in CI.
- **Database / persistence:** Not affected. Local Supabase in CI only.
- **Security / authorization:** Not affected. No secrets are added; the local
  Supabase keys are the public dev defaults already used by `e2e`.
- **Testing / validation:** Affected. A new CI job and docs.

## User Stories

### US-001: A pull request that breaks Preview/PDF/Word parity fails CI

**Description:**
As the owner, I want every PR to run the parity check in CI, so that a NEW
divergence blocks the merge instead of being found weeks later.

**Acceptance Criteria:**

- [ ] **The job runs green.** `ci.yml` has a "Parity (required)" job on
      `ubuntu-latest` that runs on push and on PRs to `main`, and it is green on
      the PR that adds it (exit 0, 0 NEW, KNOWN 3).
- [ ] **Fonts.** The job's log shows Verdana and Times New Roman installed. The
      parity report artifact's environment block shows how every font-family row
      resolved, and they are MATCH.
- [ ] **It catches a regression.** On a throwaway branch whose only change
      reverts the US-001 reader fix of #94 in `e2e/parity/surfaces.ts`, the
      Parity job fails. A link to the failed run is recorded as evidence, and
      the branch is not merged and is deleted after.
- [ ] **Artifact.** `test-results-parity/` is uploaded on every run, pass or
      fail.
- [ ] **Docs.** `ralph-pass-criteria.md` and the `playwright.parity.config.ts`
      header no longer say parity is local-only or not a CI gate.
- [ ] **Other jobs.** The existing jobs (`verify`, `integration`, `e2e`,
      `lint-debt-report`) are unchanged and still pass.

## Functional Requirements

- **FR-1:** No secret is added to the workflow.
- **FR-2:** The job reuses the `e2e` job's setup steps (pnpm, Node version,
  Playwright Chromium, Supabase start flags) rather than inventing new ones.
- **FR-3:** The job does not weaken the suite. No `continue-on-error`, no
  `--grep` filter, and no env flag that skips rows.

## Regression Constraints

- Local `pnpm test:parity` on Windows keeps its current result and report hash.
- The CI wall time of the other jobs is unchanged. The parity job runs in
  parallel.

## Required Verification

- The PR's CI run shows the Parity job green, with its artifact.
- The throwaway-branch failing run is linked in `progress.txt`.
- Local `pnpm test:parity` is unchanged.
- `code-reviewer` on the workflow and docs diff. `ui-expert` is
  NOT_APPLICABLE.

## FAIL Conditions

- The Parity job passes on the throwaway regression branch.
- The job uses `continue-on-error`, or filters rows.
- Any existing CI job changes behaviour.

## BLOCKER Conditions

- **Linux result.** With core fonts installed, the Linux run still reports NEW
  rows (for example from rasterisation or anti-aliasing differences). Report
  them with the artifact. The owner decides between OS-specific KNOWN handling,
  a non-required job, or another approach. The suite must not be loosened
  silently.
- **Fonts package.** `ttf-mscorefonts-installer` cannot be installed on the
  runner image.

## Risks

- Parity adds roughly the e2e job's runtime (one build plus about 3 minutes) to
  every PR, in parallel with the other jobs.
- Microsoft core fonts on Linux may differ slightly in version from Windows'.

## Evidence / References

- `.github/workflows/ci.yml`; `playwright.parity.config.ts`;
  `playwright.config.ts` (webServer build).
- `e2e/parity/verdicts.ts:696-699, 959-966`; `surfaces.ts:510-546, 649-918`;
  `parity.spec.ts:417-421`.
- `docs/engineering/ralph-pass-criteria.md:42-46`.
- `tasks/ralph/archive/2026-10-07-parity-reader-docx-layout/progress.txt`: the
  #88 incident and the green baseline.

## Owner actions (outside the agent's reach)

- After merge, add "Parity (required)" to the required status checks of the
  `main` branch protection, in GitHub repository settings.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
