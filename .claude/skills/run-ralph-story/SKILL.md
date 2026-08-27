---
name: run-ralph-story
description: Executes exactly one pending my-cv-platform Ralph user story from tasks/ralph/prd.json through scoped implementation, required validation, independent review, evidence recording, and one atomic commit. Use only on the exact branch named by the active Ralph contract. Never pushes, merges, auto-bumps version, or executes more than one story per invocation.
---
# Run Ralph Story
## Purpose
Execute exactly one pending Ralph user story from the active `prd.json`.
Flow:
1. select one story,
2. verify branch/worktree,
3. explore and plan read-only,
4. delegate production writes to `senior-coder`,
5. run required checks and specialized validation,
6. run `ui-expert` when UI is affected,
7. run independent `code-reviewer`,
8. record evidence,
9. create exactly one story commit,
10. stop without push or merge.
## Authority and Roles
Apply authority in this order:
1. root `CLAUDE.md`,
2. applicable `.claude/rules/*.md`,
3. approved PRD / active `tasks/ralph/prd.json`,
4. this Skill,
5. agent-specific instructions.
If an older agent instruction conflicts with a higher-authority source, follow the higher-authority source.
Roles:
- Explore / Plan: read-only.
- `senior-coder`: production-code writes and fixes.
- `ui-expert`: validation only.
- `code-reviewer`: independent review only.
- Ralph/orchestrator: selection, checks, evidence, Ralph metadata, and final story commit.
Do not ask `ui-expert` or `code-reviewer` to fix code.
Do not let `senior-coder` perform final review, push, merge, or an automatic version bump.
## Inputs
Required:
- Active Ralph contract, default `tasks/ralph/prd.json`.
Optional:
- `story_id`: exact pending `US-NNN`.
- `progress_path`: default `tasks/ralph/progress.txt`.
Selection:
- If `story_id` is supplied, execute that exact pending story only.
- Otherwise select the unique pending story with the lowest numeric `priority`.
- If none remain, return `NO_PENDING_STORY`.
- If lowest priority is ambiguous, return `BLOCKED`.
Never execute two stories in one invocation.
## Preconditions
Before any production-code write:
1. Load root `CLAUDE.md`.
2. Load `.claude/rules/git.md` and `.claude/rules/testing.md`.
3. Read and validate active `prd.json`.
4. Select exactly one pending story.
5. Determine affected domains and load matching scoped Rules.
6. Inspect `origin/main` enough to establish the canonical baseline without modifying it.
7. Read current Git branch.
8. Confirm current branch exactly equals `prd.json.branchName`.
9. Confirm current branch is not `main`.
10. Inspect index and working tree.
11. Confirm no unrelated or ambiguous pre-existing changes would contaminate the story.
12. Confirm selected story has valid ID, title, description, acceptance criteria, priority, and `passes: false`.
13. Confirm required validation dependencies are available.
Any failed precondition returns `BLOCKED`.
## Working Tree Safety
Never hide or destroy unrelated work.
Do not reset user changes, force checkout over them, force-clean files, delete branches, or stash unrelated work merely to make the tree clean.
If pre-existing modifications exist, continue only when every change is clearly attributable to the active Ralph setup or selected story.
Allowed Ralph metadata is limited to the active `prd.json`, active `progress.txt`, and metadata explicitly belonging to the same Ralph initiative.
Otherwise return `BLOCKED` and identify conflicting paths.
## Story Contract
Build an in-memory contract:
```text
story_id
title
description
priority
acceptance_criteria[]
applicable_rules[]
affected_domains[]
required_checks[]
required_specialized_validations[]
```
Classify each acceptance criterion as one or more of:
- implementation,
- scope/regression,
- command/check,
- browser/interaction,
- visual,
- export,
- database/migration,
- security,
- review.
Do not change criterion text.
If a criterion cannot be interpreted deterministically, return `BLOCKED`.
## Procedure
### 1. Record baseline
Capture current branch, current HEAD, relation to `origin/main`, selected story, worktree state, and applicable Rules.
Do not modify `main`.
### 2. Explore read-only
Inspect only relevant implementation and references.
Identify current behavior, reference behavior, affected files, regression surfaces, existing checks, i18n impact, and database/security/export impact when relevant.
Do not expand scope.
### 3. Make a minimal plan
Map every acceptance criterion to intended change/evidence, likely path(s), and validation method.
If satisfying the story requires another story or approved out-of-scope behavior, return `BLOCKED`.
### 4. Delegate implementation
Invoke `senior-coder` with:
- selected story only,
- exact acceptance criteria,
- applicable Rules,
- relevant references,
- regression constraints,
- instruction to make the smallest correct change,
- instruction not to commit, push, merge, or auto-change version.
The orchestrator does not directly write production code.
### 5. Inspect resulting diff
After implementation:
1. inspect `git status`,
2. inspect complete diff,
3. compare changed paths to story scope,
4. verify no unrelated changes,
5. verify no unauthorized governance/settings/CI changes,
6. verify no automatic version bump,
7. verify no push/merge occurred.
If a defect is clearly in story-created work, return a scoped correction to `senior-coder`.
If provenance is uncertain, return `BLOCKED`.
### 6. Run mandatory checks
Run every check required by root governance and every exact check required by the selected story.
Apply `.claude/rules/testing.md`.
For each check record:
```text
name
command or method
status: PASS | FAIL | BLOCKED | NOT_APPLICABLE
evidence
```
Never report PASS for a check that did not actually pass.
Skipped, flaky, or unevaluated checks are not PASS.
Do not invent an unadopted framework or command.
Environmental inability to run a required check is `BLOCKED`.
If implementation causes a failure:
```text
failure evidence
  ↓
senior-coder scoped fix
  ↓
fresh diff inspection
  ↓
rerun invalidated required checks
```
### 7. Run specialized validation
When required, route to:
- browser behavior → `browser-validation`
- visual parity/regression → `visual-regression`
- export behavior → `export-validation`
- database migration → `database-migration`
- security validation → `security-review`
If a required dedicated Skill is unavailable, return `BLOCKED`.
Do not substitute confidence-based inspection for required evidence.
### 8. Run `ui-expert` when UI is affected
For UI stories:
1. obtain required browser/visual evidence first,
2. provide story, criteria, reference, rendered evidence, and changed UI scope,
3. request validation only,
4. require explicit PASS or FAIL.
On FAIL, send findings to `senior-coder`, rerun invalidated checks/evidence, then rerun `ui-expert`.
If rendered UI cannot be inspected, return `BLOCKED`.
For non-UI stories record `ui-expert: NOT_APPLICABLE`.
### 9. Run `code-reviewer`
Only after prior mandatory gates are PASS or NOT_APPLICABLE.
Provide selected story contract, complete story diff, validation evidence, and directly necessary context.
Require independent review of requirement completeness, scope, regression risk, architecture, security, and maintainability.
`code-reviewer` must not fix its own findings.
On FAIL:
```text
review findings
  ↓
senior-coder scoped fix
  ↓
fresh mandatory/specialized/UI validation
  ↓
code-reviewer again
```
If review lacks required evidence/context, return `BLOCKED`.
### 10. Final acceptance audit
Build:
```text
criterion
implementation/reference
validation evidence
status
```
PASS requires:
- every acceptance criterion = PASS,
- applicable Rules respected,
- scope check = PASS,
- repository checks = PASS,
- specialized validation = PASS or NOT_APPLICABLE,
- `ui-expert` = PASS or NOT_APPLICABLE,
- `code-reviewer` = PASS,
- no unrelated changes,
- no unauthorized version change,
- no push or merge.
Missing mandatory evidence prevents PASS.
### 11. Update Ralph metadata
Only after final acceptance PASS:
- set selected story `"passes": true`,
- do not alter another story's pass state,
- update `progress.txt` with evidence.
Use:
```text
## US-NNN: <title>
Status: PASS
Priority: <n>
Branch: <branch>
Baseline HEAD: <sha>
Scope:
- Scope check: PASS
- Changed paths: <paths>
Checks:
- <check>: PASS — <evidence>
- <check>: NOT_APPLICABLE — <reason>
Specialized validation:
- Browser: PASS | NOT_APPLICABLE
- Visual: PASS | NOT_APPLICABLE
- Export: PASS | NOT_APPLICABLE
- Database: PASS | NOT_APPLICABLE
- Security: PASS | NOT_APPLICABLE
Agents:
- ui-expert: PASS | NOT_APPLICABLE
- code-reviewer: PASS
Acceptance criteria:
- AC-01: PASS — <evidence>
Commit:
- Story commit: THIS_COMMIT
- Commit message: <message>
FINAL: PASS
```
`THIS_COMMIT` is intentional: a commit cannot contain its own SHA inside its tree without changing that SHA. Return the real SHA after the commit.
Do not use `TBD` as PASS evidence.
### 12. Stage only story files
Before staging:
1. re-inspect final diff,
2. enumerate intended paths,
3. require every staged file to belong to selected story implementation/tests or active story Ralph metadata/evidence,
4. stage only those paths,
5. inspect staged diff.
If staged content includes unrelated work, safely unstage only Skill-staged paths and return `BLOCKED`.
### 13. Create exactly one story commit
After all gates PASS, create:
```text
ralph: <US-NNN> <concise story title>
```
Do not amend an unrelated commit, create a second evidence commit, tag a release, auto-bump version, or push.
After commit:
1. capture SHA,
2. verify intended paths only,
3. verify no new story-related uncommitted changes,
4. verify no second story changed.
If commit fails, return `BLOCKED` with working state preserved.
### 14. Stop
After the one story commit:
- do not run the next story,
- do not push,
- do not open/merge a PR,
- do not run release automation.
Return control to the caller.
## Failure and Blocker Semantics
Use `FAIL` for correctable implementation/validation defects.
Do not mark the story passed or commit while any mandatory gate is FAIL.
Use `BLOCKED` for missing material information, unavailable required validation, branch mismatch, ambiguous worktree provenance, unresolved governance conflict, or unsafe staging/commit state.
Do not invent requirements to clear blockers.
## Result Contract
Return exactly:
```text
RUN-RALPH-STORY
result: PASS | FAIL | BLOCKED | NO_PENDING_STORY
story: <US-NNN or NONE>
branch: <branch or NONE>
baseline_head: <sha or NONE>
scope_check: PASS | FAIL | NOT_RUN
repository_checks: PASS | FAIL | BLOCKED | NOT_RUN
specialized_validation: PASS | FAIL | BLOCKED | NOT_APPLICABLE | NOT_RUN
ui_expert: PASS | FAIL | BLOCKED | NOT_APPLICABLE | NOT_RUN
code_reviewer: PASS | FAIL | BLOCKED | NOT_RUN
acceptance_criteria: <passed>/<total>
commit: <sha or NONE>
push: NOT_PERFORMED
next_step: NEXT_STORY | RELEASE_VALIDATION | FIX_STORY | RESOLVE_BLOCKER
```
`next_step`:
- PASS + pending stories → `NEXT_STORY`
- PASS + all stories complete → `RELEASE_VALIDATION`
- FAIL → `FIX_STORY`
- BLOCKED → `RESOLVE_BLOCKER`
- NO_PENDING_STORY → `RELEASE_VALIDATION`
## PASS Definition
A story returns PASS only when it was the only story executed, exact branch preflight passed, scope passed, every criterion has evidence, all mandatory and specialized gates passed, `ui-expert` passed when applicable, `code-reviewer` passed, Ralph evidence was updated, exactly one story commit was created, and no push or merge occurred.
PASS is evidence-based.
## Non-Responsibilities
This Skill must not author/approve a PRD, convert PRD to JSON, execute multiple stories, create requirements, substitute a different branch, modify `main`, refactor unrelated code, auto-bump version, push, merge, or create a release.
## Boundary With Other Skills
- `create-prd` creates the draft PRD.
- `prd-to-json` creates the approved Ralph execution contract.
- `run-ralph-story` executes and commits exactly one pending story.
- `browser-validation`, `visual-regression`, `export-validation`, `database-migration`, and `security-review` provide specialized evidence.
- `release-validation` validates the completed initiative after all stories pass.
