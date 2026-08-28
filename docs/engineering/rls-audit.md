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
| Migrations | All five applied by the CLI at startup, in filename order |
| Harness | [`supabase/tests/rls-audit.sql`](../../supabase/tests/rls-audit.sql) |
| Result | **35 checks, 35 PASS** |

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

### S2 — CONFIRMED. `handle_new_user()` has a mutable `search_path`.

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

### D2 — CONFIRMED. Users cannot delete their own analyses.

`resume_analyses` has 2 policies, SELECT and INSERT. There is no DELETE policy,
so the owner's delete affects 0 rows (check 7). Rows are removable only by
cascade from the parent resume. Whether that is intended is a product decision;
today the data is effectively append-only from the user's side.

### D3 — CONFIRMED. Inconsistent ownership root.

`cv_generation_logs.user_id` references `auth.users(id)`. The other seven
tables reference `public.profiles(id)`. Both work, and isolation holds either
way (checks 17-18), but the inconsistency means a query joining logs to
profiles cannot rely on the same key path as everything else.

### M3 — CONFIRMED. Duplicate trigger functions.

`update_updated_at_column` and `update_cover_letters_updated_at` are two
functions doing the same job. Neither is `SECURITY DEFINER`.

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

## Recommended follow-up

One migration, no PRD-level behaviour change, in rough priority order:

1. Pin `search_path` on `handle_new_user()` (S2).
2. Decide `resume_analyses` DELETE — add the policy or record that
   append-only is deliberate (D2).
3. Repoint `cv_generation_logs.user_id` at `public.profiles` (D3).
4. Collapse the duplicate trigger functions (M3).
5. Optionally add the redundant `WITH CHECK` clauses for readability, labelled
   as such, not as a security fix (S1).

The `is_public` column allow-list (S3) is a product decision and needs a PRD
before a sharing feature is built. It is not urgent while nothing sets the flag.
