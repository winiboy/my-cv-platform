# Ralph Pass Criteria — what is enforced, what is convention

The target is that a story cannot pass while lint, typecheck, tests or build
are failing. This records how close the repository actually is, separating
machinery from prose. Prose is followed only as long as the model follows it;
machinery holds regardless.

## Enforced by machinery

| Gate | Where | What it does |
|---|---|---|
| `Verify (required)` | `.github/workflows/ci.yml` | `pnpm typecheck`, `pnpm test`, `pnpm build`. Required status check on `main` — a PR cannot merge while it is red. |
| `Integration (required)` | same | `pnpm test:integration` plus the RLS audit, which fails the job on a `FAIL` verdict. |
| `E2E (required)` | same | `pnpm test:e2e` against a production build on a local Supabase stack. |
| Branch protection | GitHub, recorded in `quality-contract.md` | Strict-up-to-date, `enforce_admins: true`, force-push and deletion denied. |
| Shipping-action gate | `.claude/hooks/pre-tool-guard.ps1` | `ask` for push, merge, PR, release, publish, deploy, hosted-DB push. Denies `.env` access, destructive git, unsafe staging, and any repository mutation on `main`. |
| Story-state clear | `.claude/hooks/post-commit-governance.ps1` | Ends the story's fast-track scope when its commit lands. |

The net effect: **nothing failing can reach `main`.** That is real, and it is
the strongest guarantee here.

## Convention only — state it plainly

These are followed by the model reading a document. No hook, script or CI job
checks any of them.

1. **A story commit is not gated on anything.** `pre-tool-guard.ps1` inspects
   commands and paths, never results. `git commit` with a red typecheck
   succeeds. The gate is CI, and CI runs at PR time — so a story can be
   committed failing and only the initiative, not the story, is caught.
2. **The `run-ralph-story` PASS definition is procedure.** Sections 6, 10 and
   11 of `.claude/skills/run-ralph-story/SKILL.md` — "never report PASS for a
   check that did not actually pass", the final acceptance audit, the evidence
   write-up — are instructions to the orchestrator. Their reliability is the
   model's reliability.
3. **`pnpm lint` cannot be a pass/fail gate and is not one.** It exits non-zero
   at baseline (306 problems on `origin/main` a4942b4). The operative criterion
   is *not above baseline*, and the baseline is a number kept in prose — in
   `quality-contract.md`, in memory, and as a per-PRD ceiling. Nothing measures
   it, and the CI lint job is `continue-on-error` by design. A story that adds
   a lint error passes every machine gate in this repository.
4. **`pnpm test:visual` and `pnpm test:parity` run in no CI job.** They are
   local-only. Every visual and parity claim in `progress.txt` rests on a
   local run, unreproducible on another machine — the parity report is
   explicitly machine-dependent, since font-face resolution depends on
   installed fonts.
5. **`ui-expert` and `code-reviewer` are agents, not gates.** Their PASS is a
   returned string. Nothing records or verifies that either ran.
6. **`progress.txt` is written after the fact by the same actor that ran the
   checks.** It is evidence in the sense of a lab notebook, not an audit log.

## Gap closed here

`CLAUDE.md` §14 named `pnpm lint` and `pnpm build` as the mandatory baseline.
That was weaker than CI's required set — a story could satisfy §14 literally
while typecheck, unit tests, integration and E2E all failed — and weaker than
what Part 3 stories were already running. §14 now names the CI-required set as
the floor and states the lint criterion as a baseline comparison rather than an
exit code, which is the only form of it that can be true. §15 now requires the
checks to have been re-run on the final diff, closing the case where a
post-review fix invalidates evidence gathered before it.

This is a wording change. It moves convention from wrong to correct; it does
not move it into machinery.

## Open for the owner

- **Are `Integration (required)` and `E2E (required)` actually required?** Both
  jobs carry `(required)` in their names, and `ci.yml` records E2E's promotion
  on 2026-09-05 after ten verified consecutive runs — but the branch-protection
  table in `quality-contract.md` lists only `Verify (required)` as the required
  status check. Either the table is stale or two jobs are required in name
  only. Confirm against GitHub and correct whichever is wrong.
- **Should a lint-baseline gate exist?** A CI step comparing the problem count
  against a committed number would turn item 3 into machinery for roughly ten
  lines of workflow. It also makes the baseline a file that must be updated
  deliberately, which is the point.
- **Should a pre-commit check gate the story commit?** It would close item 1,
  at the cost of a full check run per commit on Windows. The alternative —
  accept that CI is the gate and that story-level PASS is convention — is
  defensible, but should be a decision rather than a default.
