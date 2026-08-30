# RLS audit — empirical

Phase 26. Establishes what the row-level security policies **actually do**, by
running statements against a live database as the real `authenticated` and
`anon` roles.

This supersedes the policy reasoning in
[`supabase-baseline-audit.md`](supabase-baseline-audit.md), which was produced
by reading the migrations with nothing running. That document's structural
inventory proved accurate. One of its security findings did not survive
execution.

## How this was produced

| | |
|---|---|
| Stack | `supabase start`, CLI 2.116.0, Docker 29.7.2 |
| Database | Postgres 17, local only — never a deployed environment |
| Migrations | Five at the original audit; six since `006_rls_schema_hardening.sql`, all applied by the CLI at startup in filename order |
| Harness | [`supabase/tests/rls-audit.sql`](../../supabase/tests/rls-audit.sql) |
| Result | **70 checks, 70 PASS** — 35 at the original audit, the rest added alongside the remediation |

Reproduce with:

```bash
pnpm supabase start
docker exec -i supabase_db_my-cv-platform psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/rls-audit.sql
```

Every check runs inside one transaction that is rolled back, so the harness is
re-runnable and leaves no rows behind.

"PASS" here means *the observed behaviour matched what this document records* —
including the cases where the recorded behaviour is a weakness. PASS is not a
statement that the schema is secure.

## Status after migration 006

[`006_rls_schema_hardening.sql`](../../supabase/migrations/006_rls_schema_hardening.sql)
was written against the findings below and applied to the local stack. The
findings themselves are left as they were recorded; each now carries a note on
what changed. In summary:

| Finding | State |
|---|---|
| S1 | Withdrawn at the audit and still withdrawn. The clauses were added for readability; nothing was closed. |
| S2 | **Closed** — `handle_new_user()` has a pinned `search_path`. |
| D2 | **Closed** — owners can delete their own analyses. |
| M3 | **Closed** — one `updated_at` trigger function. |
| D3 | **Closed** — `cv_generation_logs` keys to `public.profiles(id)`. |
| S3 | **Open.** Deliberately out of scope for that migration; it is a product decision and needs its own PRD. |
| M2 | Downgraded, unchanged. |
| M4 | **Open.** |

Local stack only. No deployed environment has migration 006, so nothing above
describes production — which is finding M4, still open.

**On check numbers.** The harness grew from 35 checks to 70, and the numbering
shifted with it. Check numbers inside a finding's original text refer to the
35-check audit run and are left as recorded; check numbers inside a
**post-migration note** refer to the current 70-check harness. Where a finding's
own checks moved and the distinction matters, the note says so explicitly.

## Structural state — confirmed

Read from `pg_class` and `pg_policy`, not from the migrations:

| Table | RLS enabled | Policies |
|---|---|---|
| `ai_suggestions` | yes | 4 |
| `career_goals` | yes | 4 |
| `cover_letters` | yes | 4 |
| `cv_generation_logs` | yes | 2 |
| `job_applications` | yes | 4 |
| `profiles` | yes | 3 |
| `resume_analyses` | yes | 2 |
| `resumes` | yes | 4 |

8 tables, RLS enabled on all, 27 policies — matching the earlier read-only
count exactly. `relforcerowsecurity` is false throughout, so the table owner
and `service_role` bypass RLS by design; server-side code holding the service
key is unconstrained by any of this.

Migration 006 changed one number here: `resume_analyses` has 3 policies and the
total is 28, because D2 added a DELETE policy. Nothing else in this table moved
— RLS stayed enabled on all eight, no policy was removed, and
`relforcerowsecurity` is still false throughout.

## Cross-user isolation — holds

Twenty checks put user B against user A's rows across all eight tables. Every
one behaved correctly:

- SELECT of another user's row returns **0 rows** on all eight tables
- UPDATE and DELETE of another user's row affect **0 rows**
- INSERT of a row carrying another user's `user_id` is **refused** with
  `new row violates row-level security policy`
- `anon` reads **0 rows** from `profiles` and `cover_letters`
- The owner retains full SELECT / UPDATE / DELETE on their own rows

The `handle_new_user()` trigger also works: inserting into `auth.users` created
the matching `public.profiles` row without help.

## Findings

### S1 — WITHDRAWN. Not a vulnerability.

The previous audit reported that `profiles`, `resumes`, `job_applications`,
`career_goals` and `ai_suggestions` omit `WITH CHECK` on their UPDATE policies,
and concluded a user could reassign a row they own to another user.

The observation is real. `pg_policy.polwithcheck` is null for those five and
non-null for `cover_letters`:

| Table | UPDATE policy has explicit `WITH CHECK` |
|---|---|
| `ai_suggestions` | no |
| `career_goals` | no |
| `job_applications` | no |
| `profiles` | no |
| `resumes` | no |
| `cover_letters` | **yes** |

The conclusion is wrong. PostgreSQL substitutes the `USING` expression as the
check expression when a policy omits `WITH CHECK`, so `auth.uid() = user_id`
constrains the *new* row too. Checks 21-26 attempted the exact attack — user A
updating their own row to set `user_id` to B — on all six tables:

```
21 | resumes          | A | UPDATE | S1 reassign own row to B  | refused | PASS
22 | job_applications | A | UPDATE | S1 reassign own row to B  | refused | PASS
23 | career_goals     | A | UPDATE | S1 reassign own row to B  | refused | PASS
24 | ai_suggestions   | A | UPDATE | S1 reassign own row to B  | refused | PASS
25 | profiles         | A | UPDATE | S1 reassign own row to B  | refused | PASS
26 | cover_letters    | A | UPDATE | S1 ... (control)          | refused | PASS
```

All six refuse identically. The table that "does it correctly" behaves exactly
like the five that supposedly do not.

Adding the redundant clauses would make intent explicit and remove a trap for
future readers. That is a readability change, not a security fix, and should
not be scheduled as one.

**Since — the clauses now exist, and the finding stays withdrawn.** Migration
006 added the explicit `WITH CHECK` to all five, so the table above records the
state at the audit and every row of it would read "yes" if taken again today. It
was scheduled and written as the readability change this section describes. It closed nothing, because there was nothing to close: no
statement any role can issue returns a different answer before and after it.
`profiles` keeps its own expression, `auth.uid() = id`; the other four use
`auth.uid() = user_id`.

Each policy's `USING` expression is untouched — the migration uses `ALTER
POLICY`, so no policy was dropped and the policy count never dipped.

The six reassignment checks are now numbered 28-33 in the extended harness and
still report `refused` on all six tables. **They are a regression guard on the
behaviour, not evidence that the clauses were added.** Because the change is
behaviourally inert they pass identically with the clauses and without them, so
they cannot tell the two states apart. The evidence is catalog state: checks
65-70 read `pg_policy.polwithcheck` directly and compare the expression.
Mutation-tested — reverting all five policies to their pre-migration shape
leaves 28-33 at PASS and turns all six of 65-70 FAIL.

One detail surfaced by that mutation testing, recorded because it makes the
`profiles` row of this section doubly uninteresting: on `profiles` the
reassignment is refused even with `WITH CHECK (true)`. PostgreSQL applies the
SELECT policy to the post-update row there, and behind that the primary key
already forbids taking an id another profile holds. The `USING` substitution was
never the only thing standing in the way on that table.

### S3 — CONFIRMED. Public resumes expose contact PII to anonymous users.

`resumes` SELECT is `USING (auth.uid() = user_id OR is_public = true)`. The
policy grants the whole row, not a safe subset. As `anon`, against a resume
with `is_public = true`:

| title | contact_email | contact_phone | summary |
|---|---|---|---|
| Public | private@example.test | +41791234567 | Private summary |

Email, phone, location and the full summary are readable without
authentication. Checks 28 and 29 confirm the flag is what gates this: the same
query against a private resume returns 0 rows.

**Severity is currently latent.** `is_public` appears in exactly three places
in `src/`, and all three set it to `false`
([`create-resume-form.tsx:102`](../../src/components/dashboard/create-resume-form.tsx),
[`resume-card.tsx:149`](../../src/components/dashboard/resume-card.tsx),
[`generate-from-job-description/route.ts:77`](../../src/app/api/ai/generate-from-job-description/route.ts)).
No code path sets it true, so no resume is public today.

It is reachable, though: a user has UPDATE on their own rows, so a direct
Supabase call can set the flag. And the moment a sharing feature is built, this
policy leaks contact PII by default. A public-sharing feature needs an explicit
column allow-list — a view or a redacted `contact` — decided before the flag
becomes settable.

### S2 — CONFIRMED, now CLOSED by migration 006.

```
proname          | security_definer | config
handle_new_user  | t                | (none)
```

`SECURITY DEFINER` with no pinned `search_path` is the standard
privilege-escalation shape: it runs with the definer's rights and resolves
unqualified names through the caller's `search_path`. Exploitation requires
CREATE on a schema that resolves earlier, which an ordinary Supabase user does
not have, so this is hardening rather than an open hole. The fix is one line —
`SET search_path = public, pg_temp` — and belongs in the same migration as any
other policy work.

**Closed.** The function was replaced in place with
`SET search_path = public, pg_temp`, so `on_auth_user_created` was never dropped
and signup behaviour is unchanged. Checks 1-5 assert the pinned `search_path`,
that `SECURITY DEFINER` survived, that the trigger is still attached, and that a
new `auth.users` row still produces a fully populated profile.

### D2 — CONFIRMED, now CLOSED by migration 006.

`resume_analyses` has 2 policies, SELECT and INSERT. There is no DELETE policy,
so the owner's delete affects 0 rows (check 7). Rows are removable only by
cascade from the parent resume. Whether that is intended is a product decision;
today the data is effectively append-only from the user's side.

**Closed.** The direction was decided in favour of adding the policy: every
other user-owned table in `001_initial_schema.sql` grants DELETE to its owner,
so the omission was treated as an oversight. `USING (auth.uid() = user_id)`.
An owner now deletes their own analysis (1 row, check 14) and B removes 0 rows
both by id and unqualified (checks 12-13); cascade from the parent resume is
unchanged (checks 44-46).

### D3 — CONFIRMED, now CLOSED by migration 006.

`cv_generation_logs.user_id` references `auth.users(id)`. The other seven
tables reference `public.profiles(id)`. Both work, and isolation holds either
way (checks 17-18), but the inconsistency means a query joining logs to
profiles cannot rely on the same key path as everything else.

**Closed.** The key was repointed at `public.profiles(id) ON DELETE CASCADE`,
so all eight tables now share one ownership root. Net delete behaviour is
unchanged — `profiles.id` itself cascades from `auth.users` — and the transitive
path is asserted rather than assumed (checks 61-64). The migration refuses to
run, rather than dropping rows, if any log's `user_id` has no profile; that
guard has its own test in
[`supabase/tests/d3-abort-path.sql`](../../supabase/tests/d3-abort-path.sql),
which `\i`-includes the real migration instead of re-implementing it.

### M3 — CONFIRMED, now CLOSED by migration 006.

`update_updated_at_column` and `update_cover_letters_updated_at` are two
functions doing the same job. Neither is `SECURITY DEFINER`.

**Closed.** The `cover_letters` trigger was repointed at
`update_updated_at_column()` and the duplicate dropped, in that order, so the
table was never left without `updated_at` maintenance. All five `updated_at`
triggers in `public` now execute the one function (check 50), and each of the
five tables still advances `updated_at` on an owner's update (checks 51-55).

### M2 — Downgraded.

The migrations are not in the CLI's timestamp filename format, but all five
applied cleanly at `supabase start` in lexicographic order. The practical
impact is limited to remote migration tracking — `supabase db push` against a
deployed project — not to local use. Renaming still matters before adopting
the CLI against production, and the ordering constraint recorded in the earlier
audit still applies.

## Not covered

Stated so the gaps are not mistaken for clean results:

- **Storage buckets and their policies.** None are declared in the migrations;
  any bucket in the deployed project was created through the dashboard and is
  invisible to this audit.
- **The deployed database.** Everything here describes what the checked-in
  migrations produce. Whether production matches them is unverified — no
  process applies these migrations to any environment (finding M4).
- **`service_role` paths.** API routes using the service key bypass RLS
  entirely. Their authorization is application code, and belongs to the Phase
  30 security review.
- **Realtime and `pg_net`.**

## Recommended follow-up — done

The five items below were the recommendation. All five landed in one migration,
`006_rls_schema_hardening.sql`, with no PRD-level behaviour change:

1. ~~Pin `search_path` on `handle_new_user()` (S2).~~ Done.
2. ~~Decide `resume_analyses` DELETE — add the policy or record that
   append-only is deliberate (D2).~~ Done; the policy was added.
3. ~~Repoint `cv_generation_logs.user_id` at `public.profiles` (D3).~~ Done.
4. ~~Collapse the duplicate trigger functions (M3).~~ Done.
5. ~~Optionally add the redundant `WITH CHECK` clauses for readability, labelled
   as such, not as a security fix (S1).~~ Done, and labelled as such — in the
   migration comment and in the S1 note above.

## Still open

1. **S3 — the `is_public` column allow-list.** A product decision, and it needs
   its own PRD before a sharing feature is built. Not urgent while nothing sets
   the flag, and untouched in either direction by migration 006.
2. **M4 — no process applies these migrations to a deployed environment.**
   Migration 006 has been applied to the local stack only. Deploying it is a
   separate, explicitly authorized step.
3. **M2 — migration filenames are not in the CLI timestamp format.** Downgraded,
   and only matters before adopting `supabase db push` against production.
