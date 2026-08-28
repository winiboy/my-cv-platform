# PRD: RLS and schema hardening follow-up migration

**Status:** DRAFT

## Objective

Close the schema and policy defects confirmed by the Phase 26 empirical RLS
audit in one forward migration, without changing any user-visible application
behaviour.

## Context / Current Behavior

[`docs/engineering/rls-audit.md`](../../docs/engineering/rls-audit.md) recorded
35 checks executed against a live local database as the real `authenticated`
and `anon` roles. Isolation holds on all eight tables and all 27 policies are
active. The audit nonetheless confirmed four defects, and withdrew a fifth
finding that turned out not to be one.

**S2 — `handle_new_user()` has a mutable `search_path`.**
[`001_initial_schema.sql:396-408`](../../supabase/migrations/001_initial_schema.sql)
declares it `SECURITY DEFINER` with no `SET search_path`. The catalog confirms
`proconfig` is null. It runs with the definer's rights and resolves unqualified
names through the caller's `search_path`. Exploitation requires CREATE on a
schema resolving earlier than `public`, which an ordinary Supabase user does
not hold, so this is hardening rather than an open hole.

**D2 — `resume_analyses` has no DELETE policy.**
The table declares SELECT and INSERT only, so an owner's delete affects 0 rows
(audit check 7). Rows are removable only by cascade from the parent resume. No
application code deletes from this table today: it is written at
[`analyze-resume/route.ts:162`](../../src/app/api/ai/analyze-resume/route.ts)
and read at
[`analyze-resume/[resumeId]/route.ts:82`](../../src/app/api/ai/analyze-resume/[resumeId]/route.ts),
never deleted.

**D3 — inconsistent ownership root.**
[`005_cv_generation_logs.sql:12`](../../supabase/migrations/005_cv_generation_logs.sql)
points `user_id` at `auth.users(id)`. The other seven tables point at
`public.profiles(id)`. Isolation holds either way (audit checks 17-18); the
cost is that a join from logs to profiles cannot rely on the same key path as
everything else. This table's types were never generated, and
[`generation-logs.ts:62-68`](../../src/lib/supabase/generation-logs.ts) works
around their absence with a type assertion.

**M3 — duplicate trigger functions.**
`update_updated_at_column()`
([`001:366-372`](../../supabase/migrations/001_initial_schema.sql)) and
`update_cover_letters_updated_at()`
([`003:67-71`](../../supabase/migrations/003_cover_letters.sql)) have identical
bodies. Only the `cover_letters` trigger uses the second one.

**S1 — withdrawn, and explicitly not a security fix.**
Five tables omit `WITH CHECK` on their UPDATE policies while `cover_letters`
declares it. PostgreSQL substitutes `USING` as the check expression when
`WITH CHECK` is absent, so all six refuse ownership reassignment identically
(audit checks 21-26). Adding the clauses makes intent explicit for future
readers and removes a trap that already produced one incorrect audit finding.
It closes no hole.

## Scope

- One new forward migration file, `supabase/migrations/006_*.sql`.
- Pin `search_path` on `handle_new_user()`.
- Resolve the `resume_analyses` DELETE gap in the direction chosen at approval.
- Repoint `cv_generation_logs.user_id` at `public.profiles(id)`.
- Remove the duplicate `updated_at` trigger function.
- Add explicit `WITH CHECK` clauses to the five UPDATE policies that omit them,
  labelled in the migration as readability, not as a security fix.
- Extend `supabase/tests/rls-audit.sql` so the changed behaviour is asserted.

## Out of Scope

- The `is_public` column allow-list (finding S3). It is a product decision
  requiring its own PRD, and is not urgent while no code path sets the flag.
- Renaming migrations to the CLI timestamp format (finding M2).
- Establishing a process to apply migrations to a deployed environment
  (finding M4). That is Phase 27.
- Regenerating `src/types/supabase.ts` wholesale, or adding the missing
  `cv_generation_logs` types.
- Removing the type assertion in `generation-logs.ts`.
- Any change to storage buckets, `service_role` code paths, or application
  authorization logic.
- Any change to application behaviour, UI, or exports.

## Impact Assessment

- **Frontend / UI:** Not affected — no component, route or rendered state changes.
- **Internationalization:** Not affected — no user-facing strings.
- **Resume model / templates:** Not affected — no resume column, template or
  rendering path changes.
- **Exports:** Not affected — PDF and DOCX generation read resume data that
  this migration does not touch.
- **Database / persistence:** Affected — this PRD is entirely a schema change:
  one function signature, one policy addition, one foreign key, one function
  drop, five policy replacements.
- **Security / authorization:** Affected — S2 is a privilege-escalation
  hardening fix; the D2 policy decision changes what an owner may delete.
- **Testing / validation:** Affected — `supabase/tests/rls-audit.sql` must be
  extended to cover the new behaviour and must continue to pass.

## User Stories

### US-001: `handle_new_user()` resolves names deterministically

**Description:**
As the platform operator, I want the `SECURITY DEFINER` signup trigger to
resolve unqualified names through a fixed `search_path`, so that a schema
earlier in a caller's search path cannot influence what it executes.

**Acceptance Criteria:**

- [ ] `SELECT proconfig FROM pg_proc WHERE proname = 'handle_new_user'` returns
      an array containing `search_path=public, pg_temp`, not null.
- [ ] The function remains `SECURITY DEFINER` (`prosecdef` is true).
- [ ] Inserting a row into `auth.users` still creates the matching
      `public.profiles` row with `id`, `email`, `full_name` and `avatar_url`
      populated as before.
- [ ] The migration replaces the function rather than dropping and recreating
      the `on_auth_user_created` trigger.

### US-002: `resume_analyses` deletion behaviour is explicit

**Description:**
As a user, I want the deletion behaviour of my resume analyses to be a stated
decision rather than an omission, so that the policy set matches intent.

> **Blocked pending approval.** The direction is undetermined — see
> [Open Questions](#open-questions). Criteria are written for the "add the
> policy" branch and must be replaced wholesale if the append-only branch is
> chosen at approval.

**Acceptance Criteria:**

- [ ] `resume_analyses` has a DELETE policy `USING (auth.uid() = user_id)`.
- [ ] A user deleting their own analysis affects exactly 1 row.
- [ ] A user attempting to delete another user's analysis affects 0 rows.
- [ ] Existing cascade deletion from the parent resume is unchanged.

### US-003: One `updated_at` trigger function

**Description:**
As a maintainer, I want a single `updated_at` trigger function, so that a
change to that behaviour does not have to be made in two places.

**Acceptance Criteria:**

- [ ] `public.update_cover_letters_updated_at` no longer exists.
- [ ] The `cover_letters` update trigger executes
      `public.update_updated_at_column()`.
- [ ] Updating a `cover_letters` row still advances `updated_at`.
- [ ] Updating a row in each other table with an `updated_at` trigger still
      advances `updated_at`.

### US-004: `cv_generation_logs` shares the ownership root

**Description:**
As a maintainer, I want every user-owned table to key ownership to
`public.profiles(id)`, so that joins and future policy work follow one key path.

**Acceptance Criteria:**

- [ ] `cv_generation_logs_user_id_fkey` references `public.profiles(id)` with
      `ON DELETE CASCADE`.
- [ ] The existing SELECT and INSERT policies still restrict rows to
      `auth.uid() = user_id` — verified by execution, not by inspection.
- [ ] `writeGenerationLog` in
      [`generation-logs.ts`](../../src/lib/supabase/generation-logs.ts) still
      inserts successfully for an authenticated user.
- [ ] The migration aborts with a clear error rather than silently dropping
      rows if any existing `user_id` has no matching `profiles` row.

### US-005: UPDATE policies state their check expression explicitly

**Description:**
As a maintainer, I want every UPDATE policy to declare `WITH CHECK` explicitly,
so that a reader does not have to know PostgreSQL's substitution rule to
determine whether ownership transfer is possible.

**Acceptance Criteria:**

- [ ] `profiles`, `resumes`, `job_applications`, `career_goals` and
      `ai_suggestions` each have a non-null `polwithcheck` for their UPDATE
      policy.
- [ ] Ownership reassignment remains refused on all six tables, unchanged from
      the audit baseline.
- [ ] The migration comment states that this is a readability change and closes
      no vulnerability.
- [ ] The withdrawn-S1 section of `rls-audit.md` is updated to record that the
      clauses now exist, without reinstating the finding.

## Functional Requirements

- **FR-1:** All changes land in one new forward migration. No already-applied
  migration file is edited.
- **FR-2:** The migration is idempotent where PostgreSQL permits it
  (`CREATE OR REPLACE`, `DROP ... IF EXISTS`, policy drop-then-create), so a
  re-run against an already-migrated database does not error.
- **FR-3:** The migration performs no destructive or lossy data change. No
  row is deleted and no column is dropped.
- **FR-4:** `supabase/tests/rls-audit.sql` is extended so that every acceptance
  criterion expressible as a SQL check is asserted there, and the suite passes
  in full.
- **FR-5:** RLS remains enabled on all eight tables and the policy count does
  not decrease.
- **FR-6:** No application source file changes, with the sole exception of
  documentation updates required by US-005.
- **FR-7:** The migration is applied and verified against the local stack only.
  Deploying it to any hosted environment is out of scope and requires separate
  explicit authorization.

## Regression Constraints

- Cross-user isolation must continue to hold on all eight tables: the 20
  isolation checks in the audit harness must still pass unchanged.
- An owner must retain SELECT, UPDATE and DELETE on their own rows wherever
  those policies exist today.
- `anon` must continue to read 0 rows from `profiles` and `cover_letters`, and
  must continue to read a resume with `is_public = true` — this PRD does not
  change S3 behaviour in either direction.
- The `on_auth_user_created` trigger must continue to create a profile row on
  signup.
- `updated_at` maintenance must continue on every table that has it today.
- `pnpm build`, `pnpm typecheck` and `pnpm test` must remain green, and
  `pnpm lint` must not increase above its 311-problem baseline.

## Required Verification

- **Migration applies cleanly:** `pnpm supabase db reset` completes with all six
  migrations applied in order, from an empty database.
- **Effective policy behaviour:** the extended
  `supabase/tests/rls-audit.sql` runs against the local stack and reports every
  check PASS, with the new checks visible in the output. Evidence is the run
  output, not the migration source.
- **Catalog state:** `pg_proc.proconfig` for `handle_new_user`, `pg_policy`
  rows for `resume_analyses` and the five UPDATE policies, and
  `pg_constraint` for `cv_generation_logs_user_id_fkey` are queried directly
  and recorded.
- **Idempotency:** the migration is applied a second time against an
  already-migrated database and completes without error.
- **Repository baseline:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and
  `pnpm build` are run and their results recorded.
- **Documentation:** `docs/engineering/rls-audit.md` is updated to reflect the
  post-migration state, including which findings are now closed.

Per `.claude/rules/testing.md`, PASS may be claimed only for checks that
actually ran. Static inspection of the migration file is not evidence that a
policy behaves as intended.

## FAIL Conditions

- Any existing check in `supabase/tests/rls-audit.sql` regresses from PASS.
- Cross-user isolation weakens on any table.
- `handle_new_user` loses `SECURITY DEFINER`, or signup stops creating a
  profile row.
- The migration deletes rows, drops a column, or edits an already-applied
  migration file.
- Application behaviour changes in any way observable to a user.
- The S1 clauses are described anywhere in the commit, migration or docs as
  fixing a vulnerability.
- PASS is claimed for any criterion without a recorded command and result.

## BLOCKER Conditions

- The `resume_analyses` DELETE direction is not decided at approval — US-002
  cannot be implemented in either direction without it.
- `cv_generation_logs` contains rows whose `user_id` has no matching
  `public.profiles` row, making the US-004 foreign key unachievable without a
  data decision that this PRD does not authorize.
- The local Supabase stack cannot be started, since every verification step
  depends on it.
- Implementation is attempted on `main`, or on a branch other than the one
  approved for this work.

## Risks

- **US-004 is the only story that can fail on real data.** The foreign key
  swap succeeds locally against an empty table but may abort against a
  deployed database holding orphan rows. The migration must abort loudly
  rather than coerce or delete. Because no process currently applies these
  migrations to any environment (finding M4), the deployed state is unknown.
- **Policy replacement has a visible window.** Dropping and recreating the five
  UPDATE policies is not atomic from a reader's perspective; it must occur
  inside a transaction so no window exists where a table is unprotected.
- **The audit harness is the only regression net.** There is no integration or
  E2E coverage of database behaviour yet (Phases 11-12), so a defect not
  expressible as a SQL check will not be caught.
- **Low-value churn.** US-005 changes five policies to no behavioural effect.
  If the migration must be re-reviewed under time pressure, it is the story to
  drop.

## Evidence / References

- `docs/engineering/rls-audit.md` — the 35-check empirical audit these findings
  come from; the authority for every claim in this PRD.
- `docs/engineering/supabase-baseline-audit.md` — the earlier read-only audit,
  including the withdrawn S1.
- `supabase/tests/rls-audit.sql` — the harness to extend.
- `supabase/migrations/001_initial_schema.sql` — `handle_new_user`,
  `update_updated_at_column`, and the five UPDATE policies.
- `supabase/migrations/003_cover_letters.sql` — the duplicate trigger function
  and the one UPDATE policy that already declares `WITH CHECK`.
- `supabase/migrations/005_cv_generation_logs.sql` — the `auth.users` foreign
  key.
- `src/lib/supabase/generation-logs.ts` — the only writer of
  `cv_generation_logs`, and its type assertion.
- `src/app/api/ai/analyze-resume/route.ts` and
  `src/app/api/ai/analyze-resume/[resumeId]/route.ts` — the only readers and
  writers of `resume_analyses`; neither deletes.
- `.claude/rules/database.md`, `.claude/rules/security.md`,
  `.claude/rules/testing.md` — governing rules for this change.

## Open Questions

1. **BLOCKING — should users be able to delete their own resume analyses?**
   The audit could establish that they currently cannot, but not whether that
   is intended. Two directions, and US-002 differs completely between them:
   - *Add the DELETE policy.* Users can remove their own analyses. Matches the
     other six user-owned tables and is what the current acceptance criteria
     describe.
   - *Record append-only as deliberate.* No policy is added; the migration
     carries a comment stating the omission is intentional, and the audit
     document is updated to reclassify D2 from defect to design.

   This is a product decision, not a technical one, and cannot be inferred from
   the repository.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
