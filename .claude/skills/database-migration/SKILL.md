---
name: database-migration
description: Orchestrates and validates one my-cv-platform Supabase schema migration as a forward migration. Use when an approved change affects tables, columns, constraints, indexes, foreign keys, RLS policies, functions/triggers, persisted data contracts, or database TypeScript types. Delegates production SQL/code changes to senior-coder, validates in a non-production environment, and never edits applied migrations or deploys to production.
---

# Database Migration

## Purpose
Orchestrate one approved database change from repository-grounded design through isolated execution and database-specific evidence. This Skill owns the migration procedure and database-specific validation; it does not own broad security review, release approval, or production deployment.

## Authority
Apply in order: root `CLAUDE.md`; `.claude/rules/database.md`; `.claude/rules/security.md` when ownership/RLS/authentication/privileged access is relevant; `.claude/rules/testing.md`; `.claude/rules/resumes.md` when resume persistence is affected; other applicable Rules; approved PRD/active Ralph story; this Skill.

This Skill must not:
- edit an already-applied migration or rewrite migration history,
- create unrelated schema refactors,
- apply changes to production,
- use privileged/service-role access as proof of ordinary-user authorization,
- bypass RLS to obtain PASS,
- destroy data to simplify validation,
- invent database commands, scripts, tests, or environments,
- change Claude governance, hooks, settings, CI, or permissions,
- write production SQL/application/type code directly when `senior-coder` is the authorized writer,
- commit, push, merge, or deploy.

## Inputs
Required:
- `requirements`: exact approved database acceptance criteria.
- `change`: one bounded schema/persistence change.
- `source_prd`: approved PRD path or active Ralph story.
- `target_environment`: deterministic non-production validation environment.

Optional: `story_id`, `migration_name`, `affected_tables`, `affected_types`, `backfill_fixture`, `rls_test_identities`, `evidence_path`, `expected_schema`, `explicit_destructive_authorization`.

Multiple unrelated database initiatives → `BLOCKED`.

## Preconditions
Before implementation:
1. Load applicable governance and Rules.
2. Preserve acceptance criteria verbatim.
3. Confirm approved PRD/story and one bounded change.
4. Inspect `supabase/migrations/` chronologically.
5. Inspect affected DB/domain types and affected queries/API/server/persistence call sites read-only.
6. Determine whether requested schema behavior already exists and whether relevant historical migrations may already be applied.
7. Confirm the non-production target.
8. Discover actual database tooling/scripts available.
9. Confirm the target can be reset/restored without production impact.
10. Confirm deterministic fixtures contain no credentials/private documents.
11. Confirm destructive/data-loss authorization when required.
12. Resolve material ambiguity.

Any unresolved mandatory precondition → `BLOCKED`.

## Baseline
Record:
```text
repository_ref
latest_migration
migration_directory
affected_tables_columns
affected_constraints_indexes_foreign_keys
affected_rls_policies
affected_functions_triggers
affected_types_call_sites
persistence_contracts
database_tooling
target_environment
```
If target migration-history metadata is available, compare it with repository history before applying. Repository/target history mismatch → `BLOCKED`.

## Classify the change
Use applicable classifications:
```text
ADDITIVE_SCHEMA
CONSTRAINT_CHANGE
INDEX_CHANGE
FOREIGN_KEY_CHANGE
RLS_POLICY_CHANGE
FUNCTION_TRIGGER_CHANGE
DATA_BACKFILL
DATA_TRANSFORMATION
TYPE_CONTRACT_CHANGE
DESTRUCTIVE_SCHEMA
```
For each operation record `affected_object`, `existing_data_risk`, `ownership_rls_impact`, `application_compatibility_impact`, and `forward_repair_strategy`. Never disguise destructive work as additive.

## Destructive gate
For any drop, overwrite, narrowing, irreversible transformation, or possible data loss:
1. identify data at risk,
2. estimate affected rows when evidence exists,
3. record recovery expectations,
4. define forward repair/restoration,
5. verify explicit authorization,
6. BLOCK when authorization or recovery evidence is missing.

Do not simulate authorization.

## Select migration path
Create a new migration under the repository's established migration directory/naming convention. Derive the next identifier/name from actual repository state; do not hard-code a number.

If the intended path exists: inspect it; never overwrite silently; if it may be applied, use a new forward migration; if applied status is ambiguous, `BLOCKED`.

## Implementation contract
Before delegating the write, define for `senior-coder`:
```text
migration_path
objective
affected_objects
required_sql_effects
required_rls_effects
required_data_effects
required_type_changes
required_application_compatibility
required_verification
prohibited_unrelated_changes
```
Do not add unapproved requirements.

## Production-code delegation
`senior-coder` owns migration SQL and required production TypeScript/application changes.

After the write:
1. inspect the diff,
2. confirm only intended files changed,
3. confirm historical migrations were not modified,
4. confirm the new migration is forward-only,
5. confirm no unrelated refactor was introduced.

Unexpected scope → `FAIL` or `BLOCKED`.

## Static SQL review
Inspect applicable risks: invalid references; dependency ordering; nullability/default transitions; defaults/backfill ordering; uniqueness conflicts; FK orphan risks; cascade behavior; constraint compatibility with existing rows; index conflicts; function/trigger effects; duplicate policy names; RLS enablement/policy coverage; ownership predicates; unsafe broad grants; destructive statements; unbounded rewrites; persisted contract compatibility; schema/type drift.

Static inspection alone cannot prove runtime PASS.

## Existing-data compatibility
For constraint/type/FK/persistence changes:
1. create representative pre-migration fixtures including relevant legacy/null/boundary cases,
2. apply migration in isolation,
3. verify valid existing rows remain valid,
4. verify intended invalid rows are handled exactly as specified,
5. verify unrelated rows are unchanged,
6. use row counts/checksums/targeted queries when useful.

If relevant legacy cases cannot be represented reliably → `BLOCKED`.

## RLS and ownership
When user-owned data, relationships, or RLS are affected, build an operation matrix for applicable:
```text
SELECT
INSERT
UPDATE
DELETE
```
Use deterministic identities such as `OWNER_A`, `OWNER_B`, `ANONYMOUS`. For every tested case record `identity`, `operation`, `target_row_owner`, `expected`, `actual`, `status`.

Validate allowed and denied paths. Do not use privileged/service-role execution as the authorization assertion. For user-owned relationships, verify users cannot create or mutate cross-owner associations unless explicitly permitted. Mismatch → `FAIL`.

## Referential integrity
For affected relationships verify applicable cases:
- valid parent/child association succeeds,
- missing parent fails when required,
- ownership remains safe,
- delete/update behavior matches the approved contract,
- no unintended orphans appear,
- required indexes exist.

Do not infer database behavior from TypeScript types.

## Backfill
For data backfills/transformations:
1. define deterministic pre-migration rows and expected values,
2. run the migration once,
3. compare actual transformed values,
4. verify unaffected rows and null/empty/boundary cases,
5. test rerun behavior only if repository workflow explicitly requires it.

Do not rerun a non-idempotent migration merely to get PASS.

## Type alignment
After migration, compare affected schema with applicable:
```text
src/types/supabase.ts
src/types/database.ts
approved domain types/callers
```
If type generation is part of the actual workflow, use the discovered adopted command. If no adopted command exists, do not invent one. Required type changes belong to `senior-coder`. Do not claim alignment without evidence.

## Apply
Use only database tooling actually discovered in the repository/environment and only the identified non-production target.

Before execution require:
```text
target_environment != production
migration_history_matches_repository
fixture_state_known
recovery_path_known
```
Any failure → `BLOCKED`.

Record `tool`, `command_or_action`, `exit_status`, `migration_applied`, `database_error`, and timestamp/elapsed time when available.

Healthy environment + migration application failure → `FAIL`. Missing/unconfigured execution environment/tool → `BLOCKED`.

## Post-migration verification
Inspect the migrated non-production database directly when tooling permits. Check applicable table/column existence, types/nullability/defaults, constraints, indexes, foreign keys, functions/triggers, RLS enabled state, policy definitions, intended grants, and migrated/backfilled values.

The migration file alone is not proof of resulting schema state.

## Regression checks
Run database-specific checks required by the story and active Rules. For application-level checks, use commands adopted by current repository governance/tooling. Do not invent missing commands. Skipped, flaky, or unevaluated required checks are not PASS.

## Forward repair
Record how a defect would be repaired without rewriting migration history, for example: new forward corrective migration, isolated data restore, forward constraint relaxation, forward RLS correction, or type/caller compatibility patch. This is recovery planning, not permission to edit applied history.

## Evidence
Per migration:
```text
DBM-001
migration: <path>
classification: <list>
target: <non-production target>
history_match: PASS
static_review: PASS
apply: PASS
schema_postcheck: PASS
data_compatibility: PASS | NOT_APPLICABLE
referential_integrity: PASS | NOT_APPLICABLE
rls_ownership: PASS | NOT_APPLICABLE
backfill: PASS | NOT_APPLICABLE
type_alignment: PASS
destructive_authorization: PASS | NOT_APPLICABLE
production_applied: NO
status: PASS
```
For a defect record expected, actual, reproducibility, and query/tool evidence.

## Failure reproduction
When safe in isolation, reproduce each deterministic failure once from known fixture state. Do not alter migration/fixture between attempts merely to obtain PASS. Flaky/non-deterministic mandatory evidence is not PASS.

## Final audit
Before PASS verify:
- one approved database initiative handled,
- new forward migration used,
- no historical applied migration modified,
- non-production target used,
- repository/target history matched,
- migration applied and post-migration schema inspected,
- applicable data/RLS/referential/backfill checks passed,
- destructive authorization present when required,
- schema/type alignment evidenced,
- no mandatory check skipped,
- no unrelated production files changed,
- no production deployment,
- no commit/push/merge.

Missing mandatory evidence prevents PASS.

## Result contract
Return exactly:
```text
DATABASE-MIGRATION
result: PASS | FAIL | BLOCKED
story: <US-NNN or NONE>
migration: <repository-relative path or NONE>
classification: <comma-separated classifications or NONE>
target_environment: <non-production target>
history_match: PASS | FAIL | BLOCKED
static_review: PASS | FAIL | BLOCKED
apply: PASS | FAIL | BLOCKED
schema_postcheck: PASS | FAIL | BLOCKED
data_compatibility: PASS | FAIL | BLOCKED | NOT_APPLICABLE
referential_integrity: PASS | FAIL | BLOCKED | NOT_APPLICABLE
rls_ownership: PASS | FAIL | BLOCKED | NOT_APPLICABLE
backfill: PASS | FAIL | BLOCKED | NOT_APPLICABLE
type_alignment: PASS | FAIL | BLOCKED | NOT_APPLICABLE
destructive_authorization: PASS | BLOCKED | NOT_APPLICABLE
requirements: <passed>/<total>
failures: <integer>
blocked: <integer>
production_applied: NO
evidence: <summary/path/runtime evidence>
next_step: CONTINUE_VALIDATION | SENIOR_CODER_FIX | RESOLVE_BLOCKER
```
PASS → `CONTINUE_VALIDATION`; FAIL → `SENIOR_CODER_FIX`; BLOCKED → `RESOLVE_BLOCKER`.

## Verdict rules
**PASS** requires a repository-grounded new forward migration, successful isolated application, direct post-migration schema evidence, all applicable data/RLS/referential/backfill/type checks, and no missing mandatory evidence. PASS does not mean production deployment occurred.

**FAIL** applies when a testable migration reproducibly violates approved requirements, fails in a healthy environment, causes unintended schema/data behavior, breaks RLS/ownership expectations, or leaves required schema/type contracts inconsistent. Route implementation fixes through `senior-coder`.

**BLOCKED** applies when evidence cannot be obtained because of ambiguous scope, production-only target, unavailable non-production target/tooling, migration-history disagreement, ambiguous applied status, missing destructive authorization, unavailable deterministic fixtures/identities, or unavailable schema/type evidence.

## Skill boundaries
- `create-prd` defines approved database requirements.
- `prd-to-json` preserves them in Ralph's execution contract.
- `run-ralph-story` orchestrates story execution, repository validation, and commit lifecycle.
- `database-migration` owns forward migration procedure and database-specific evidence.
- `security-review` owns broader security analysis; this Skill still validates RLS/ownership affected by the migration.
- `browser-validation` owns browser-facing effects.
- `export-validation` owns export artifacts affected by persistence changes.
- `release-validation` may aggregate completed migration evidence.

This Skill never deploys a migration to production.
