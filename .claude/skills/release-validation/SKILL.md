---
name: release-validation
description: Aggregates evidence for one my-cv-platform release candidate and returns PASS, FAIL, or BLOCKED for the declared release stage. Use after all Ralph stories are complete, and optionally again after manual push/PR preview, to verify contract consistency, scope, commits, repository checks, specialized validation, independent reviews, CI/preview evidence, and candidate integrity. Validation-only: never changes code, versions, Ralph state, pushes, merges, deploys, or substitutes missing evidence with confidence.
---

# Release Validation

## Purpose
Determine whether one exact release candidate is ready to advance to the next human-controlled release transition.

This Skill aggregates and validates existing evidence. It does not implement fixes, create missing infrastructure, rerun Ralph stories by default, push, merge, deploy, or change versions.

## Stages
Supported stages:
```text
FEATURE_BRANCH
PR_PREVIEW
```

`FEATURE_BRANCH`: after all Ralph stories are complete, before manual push/PR. PASS means ready for manual push/PR.

`PR_PREVIEW`: after manual push and PR/preview exist. PASS means ready for human approval/merge consideration.

PASS never authorizes an automatic push, merge, deploy, production migration, or version change.

## Authority
Apply in order:

1. root `CLAUDE.md`,
2. applicable `.claude/rules/*.md`,
3. approved PRD,
4. active `tasks/ralph/prd.json`,
5. this Skill.

Use `tasks/ralph/progress.txt` only as supporting evidence; it cannot override the PRD or `prd.json`.

This Skill must not:
- modify code, tests, SQL, config, docs, `prd.json`, or `progress.txt`,
- mark stories complete,
- change `package.json` version,
- create/amend/rebase/squash commits,
- push, create/modify/merge PRs, deploy, or promote environments,
- apply production migrations,
- install CI/E2E/preview tooling,
- invent missing commands, checks, URLs, CI results, reviewer verdicts, or test evidence,
- accept stale evidence for another candidate.

## Inputs
Required:
- `stage`: `FEATURE_BRANCH` or `PR_PREVIEW`.
- `baseline_ref`: exact approved baseline.
- `candidate_ref`: exact candidate SHA/immutable ref.
- `source_prd`: approved PRD.
- `prd_json`: active Ralph contract.

Optional:
- `progress_log`
- `pr_number`, `pr_head_sha`
- `ci_evidence`
- `preview_url`, `preview_environment`, `database_preview_environment`
- `e2e_evidence`
- `repository_check_evidence`
- `browser_validation_evidence`
- `visual_regression_evidence`
- `export_validation_evidence`
- `database_migration_evidence`
- `security_review_evidence`
- `ui_expert_evidence`
- `code_reviewer_evidence`
- `story_commit_map`
- `evidence_path`

Omitted evidence is never inferred PASS.

## Preconditions
Before verdict:

1. Load governance and applicable Rules.
2. Resolve `baseline_ref` and `candidate_ref`.
3. Confirm candidate exists and is not `main`.
4. Confirm approved PRD revision.
5. Load active Ralph contract and progress evidence when present.
6. Inspect full `baseline_ref..candidate_ref` diff and commit history.
7. Determine required checks from governance, PRD/story criteria, and adopted tooling.
8. Determine applicable specialized Skills from changed surface and acceptance criteria.
9. Determine UI/reviewer requirements.
10. Determine stage-specific CI/preview/E2E requirements.
11. Confirm all supplied evidence can be attributed to the exact candidate.

Missing mandatory evidence → `BLOCKED`.
Confirmed mandatory defect/gate failure → `FAIL`.

## Candidate identity
Record:
```text
stage
baseline_ref
candidate_ref
branch
approved_prd
prd_json
progress_log
pr_number
pr_head_sha
```

At `FEATURE_BRANCH`, candidate must equal intended feature-branch HEAD.

At `PR_PREVIEW`:
- PR source branch must be expected feature branch,
- PR target must be approved target branch, normally `main`,
- PR head SHA must equal `candidate_ref`,
- CI/preview evidence must belong to candidate.

If candidate moves after evidence was produced, stale evidence cannot PASS.

## Ralph completion
Build:
```text
story_id
priority
passes
commit
acceptance_evidence
specialized_evidence
review_evidence
status
```

Require:
- every approved Ralph story exactly once,
- every story `passes: true`,
- no synthetic extra story,
- no unresolved story blocker,
- one atomic story commit per story when required,
- each story commit exists in candidate range.

`progress.txt` must not contradict `prd.json`.

Contradictions include:
- `prd.json` says `passes: false` while progress says PASS,
- branch names disagree,
- progress says COMPLETE while a story is pending,
- required final commit/evidence remains placeholder.

Contradictory release metadata → `BLOCKED` until the owning workflow reconciles it.

This Skill does not repair Ralph metadata.

## PRD/Ralph consistency
Verify:
- approved story set preserved,
- acceptance criteria preserved,
- out-of-scope constraints preserved,
- no approved requirement removed,
- no unapproved requirement added.

Material contract inconsistency → `BLOCKED`.
Confirmed implementation outside approved scope → `FAIL`.

## Branch, commits, version
Verify:
- exact approved feature/Ralph branch,
- candidate is not `main`,
- approved baseline relationship,
- commit set maps to approved stories/supporting evidence,
- one Ralph story = one atomic commit where applicable,
- no unrelated commit,
- no unauthorized version bump.

If `package.json` changed, establish authorization/scope.

Automatic or unapproved version bump → `FAIL`.

Do not modify Git history.

## Diff scope
Classify every changed path:
```text
story_implementation
story_test
migration
ralph_metadata
approved_supporting_change
unrelated
```

Every path must map to approved scope/evidence.

Unrelated production change → `FAIL`.
Materially unclear provenance → `BLOCKED`.

## Evidence freshness
Evidence must identify the candidate/diff it evaluated.

Evidence is stale when:
- it references another SHA,
- later changes touched its validated surface,
- it predates a fix that invalidates it,
- its build/environment cannot be tied to candidate.

Stale mandatory evidence → `BLOCKED` until rerun by its owning workflow.

## Repository checks
Build the required check matrix from actual governance and tooling:
```text
check
command
candidate
result
evidence
```

Examples only when required/adopted: lint, build, typecheck, unit, integration, exact PRD commands.

Use actual commands. Do not infer CI `build` proves lint/typecheck/tests unless they actually ran.

Skipped, flaky, unevaluated, stale, or unavailable required checks are not PASS.

## Specialized validation
Evaluate applicability independently:
```text
browser-validation
visual-regression
export-validation
database-migration
security-review
```

Each gate is `PASS`, `FAIL`, `BLOCKED`, or `NOT_APPLICABLE`.

Never choose `NOT_APPLICABLE` merely because a Skill was not run.

Typical applicability:
- UI interaction → browser,
- exact visual requirement → visual,
- export change → export,
- schema/migration → database,
- changed trust boundary/security requirement → security.

## UI expert
For user-visible UI:
- require current browser/visual evidence as applicable,
- require explicit current `ui-expert` PASS.

Non-UI → `NOT_APPLICABLE`.

Do not infer UI approval from screenshots alone.

## Code reviewer
Require independent `code-reviewer` PASS for the final candidate.

Review must cover the final diff after fixes. Later implementation changes that touch reviewed scope make review stale.

Missing/failed final review prevents PASS.

## Database gate
When migrations exist:
- require `database-migration` PASS,
- require non-production migration validation,
- confirm applied historical migrations were not edited,
- confirm production migration was not applied,
- record forward-repair evidence when required.

## Security gate
When security review applies:
- require current `security-review`,
- unresolved Critical/High/Medium → FAIL,
- Security Rule violation → FAIL,
- blocked mandatory security check → BLOCKED.

Do not downgrade security findings here.

## FEATURE_BRANCH gate
Require common gates plus:
- all Ralph stories complete,
- exact feature HEAD known,
- working-tree/index cleanliness evidence when available,
- all required repository checks current,
- all applicable specialized validation current,
- `ui-expert` current when applicable,
- `code-reviewer` current.

PR, remote CI, and preview are `NOT_REQUIRED_AT_STAGE` unless governance/PRD explicitly requires them before push.

FEATURE_BRANCH PASS → `MANUAL_PUSH_AND_PR`.

This Skill does not push.

## PR_PREVIEW gate
Require common gates plus:
- PR exists and targets approved branch,
- PR head SHA equals candidate,
- required CI/checks belong to candidate and pass,
- required preview/staging belongs to candidate,
- required preview configuration/dependencies are available without exposing secrets,
- database preview/staging is compatible when migrations exist,
- required E2E evidence passes when adopted/required,
- preview-level browser/visual/export/security evidence is current when required,
- no supplied blocking PR/review condition remains.

If required preview/E2E infrastructure cannot provide mandatory evidence → `BLOCKED`.

PR_PREVIEW PASS → `HUMAN_APPROVAL`.

This Skill does not merge.

## CI evidence
At `PR_PREVIEW`, record:
```text
check_name
provider
candidate_sha
required
status
conclusion
evidence
```

Old SHA, unrelated workflow, or partial job is not PASS.

If repository CI performs fewer checks than governance requires, CI success does not replace missing local/specialized evidence.

## Preview evidence
When required, record:
```text
provider
preview_url
candidate_sha
environment
database_environment
required_configuration_available
validation_evidence
```

Establish preview provenance. Never expose environment secrets.

## E2E
Require E2E only when current governance/release process requires it.

Use an adopted mechanism if one exists. Do not invent Playwright/Cypress.

Required E2E with no adopted/available mechanism → `BLOCKED`.

## Gate matrix
Produce:
```text
contract_consistency
ralph_complete
branch_commit_integrity
scope
version
repository_checks
browser
visual
exports
database
security
ui_expert
code_reviewer
ci
preview
e2e
```

Statuses:
```text
PASS
FAIL
BLOCKED
NOT_APPLICABLE
NOT_REQUIRED_AT_STAGE
```

`NOT_REQUIRED_AT_STAGE` is only for genuinely later-stage evidence.

## Verdict precedence
Use:
```text
FAIL > BLOCKED > PASS
```

Any confirmed mandatory failure → overall FAIL.

Otherwise any missing/stale/ambiguous mandatory evidence → BLOCKED.

PASS only when every stage-required gate is PASS or legitimately NOT_APPLICABLE.

## No side effects
This Skill leaves:
```text
code_modified: NO
version_changed: NO
ralph_state_modified: NO
commit_created: NO
push: NOT_PERFORMED
merge: NOT_PERFORMED
deployment: NOT_PERFORMED
production_migration: NOT_PERFORMED
```

## Result contract
Return exactly:
```text
RELEASE-VALIDATION
result: PASS | FAIL | BLOCKED
stage: FEATURE_BRANCH | PR_PREVIEW
baseline: <sha/ref>
candidate: <sha>
branch: <branch>
stories: <passed>/<total>
contract_consistency: PASS | FAIL | BLOCKED
scope: PASS | FAIL | BLOCKED
commits: PASS | FAIL | BLOCKED
version: PASS | FAIL | BLOCKED
repository_checks: PASS | FAIL | BLOCKED
specialized_validation: PASS | FAIL | BLOCKED | NOT_APPLICABLE
ui_expert: PASS | FAIL | BLOCKED | NOT_APPLICABLE
code_reviewer: PASS | FAIL | BLOCKED
ci: PASS | FAIL | BLOCKED | NOT_REQUIRED_AT_STAGE
preview: PASS | FAIL | BLOCKED | NOT_REQUIRED_AT_STAGE
e2e: PASS | FAIL | BLOCKED | NOT_REQUIRED_AT_STAGE | NOT_APPLICABLE
blockers: <integer>
failures: <integer>
code_modified: NO
version_changed: NO
ralph_state_modified: NO
commit_created: NO
push: NOT_PERFORMED
merge: NOT_PERFORMED
deployment: NOT_PERFORMED
production_migration: NOT_PERFORMED
evidence: <summary/path>
next_step: MANUAL_PUSH_AND_PR | HUMAN_APPROVAL | FIX_RELEASE_CANDIDATE | RESOLVE_BLOCKER
```

Next step:
- FEATURE_BRANCH PASS → `MANUAL_PUSH_AND_PR`
- PR_PREVIEW PASS → `HUMAN_APPROVAL`
- FAIL → `FIX_RELEASE_CANDIDATE`
- BLOCKED → `RESOLVE_BLOCKER`

## Verdict definitions
**PASS**: exact candidate satisfies every gate required for declared stage with current attributable evidence. It does not authorize push/merge/deploy.

**FAIL**: reliable evidence establishes a mandatory candidate defect, scope violation, failed check/review, or required specialized-validation failure.

**BLOCKED**: readiness cannot be established because required evidence/infrastructure is unavailable, stale, contradictory, ambiguous, or not attributable to candidate.

## Skill boundaries
- `run-ralph-story` executes one story and produces story evidence/commit.
- specialized validation Skills own domain verdicts.
- `ui-expert` owns UI validation.
- `code-reviewer` owns independent code review.
- `release-validation` only aggregates candidate-level readiness.
- humans own manual push, PR approval, merge, deployment, and production promotion.

This Skill never performs the release transition it approves.
