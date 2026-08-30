# Deploying a migration

How a migration reaches a deployed database. Written for migration `006`,
which is merged but undeployed, and general enough for the ones after it.

The rule this exists to enforce: **a migration must run somewhere real before
it runs in production.** Every migration in this repository has so far only
ever run against a local database that is empty by construction, so the
branches that only fire on real data have never been evaluated at all.

## The environments

| | Purpose | State today |
|---|---|---|
| **Local** | `pnpm supabase start` — the development stack | Working; empty by construction |
| **Staging** | A hosted project with production-shaped data | **Does not exist yet** |
| **Production** | The live database | Exists |

Staging is the missing piece. Creating it needs a Supabase account action and
cannot be automated from this repository:

1. `supabase login` — a browser OAuth flow.
2. Create a project in the Supabase dashboard. The free tier allows two
   active projects, so this may need a plan change if production already
   occupies the second slot.
3. `supabase link --project-ref <staging-ref>`, then
   `supabase db push` to apply `001`–`006` from scratch.

Until it exists, the pre-flight below is the substitute: it answers the one
question staging would answer first, and it is safe to run against production
because it only reads.

## Step 1 — Pre-flight, always

```
psql "$DATABASE_URL" -f supabase/tests/preflight-006.sql
```

Or paste it into the Supabase dashboard SQL editor, which needs no connection
string and no local tooling.

`supabase/tests/preflight-006.sql` opens no transaction, creates no fixture,
and issues no DDL or DML. It is the **only** script in `supabase/tests/` that
is safe to point at a deployed environment — `rls-audit.sql` and
`d3-abort-path.sql` both write fixtures and must never be run there.

Read **section 2**. It reports one of:

- `CLEAR` — `006` will not abort. Continue to step 2.
- `BLOCKED` — `006` will abort and change nothing. Go to step 4.

Do not infer the outcome from the exit code, which is always 0 and reports
only that the query ran.

## Step 2 — Apply to staging first

```
supabase link --project-ref <staging-ref>
supabase db push
```

Then prove the result rather than assuming it. Against **staging only**:

```
psql "$STAGING_URL" -f supabase/tests/rls-audit.sql      # expect 70/70 PASS
```

A migration that applied without error is not the same as a migration that
did what it claims. The audit is what tells them apart.

## Step 3 — Production

Re-run the pre-flight against production immediately before deploying —
staging being clear says nothing about production's data. Then `db push`, then
re-run the pre-flight and compare section 5's structural baseline: expect
8 RLS tables and 28 policies for `006`.

## Step 4 — If the pre-flight says BLOCKED

`006` refuses to repoint `cv_generation_logs_user_id_fkey` while any log row's
`user_id` has no matching `public.profiles` row. It aborts with a message
naming the table, the count and the options, and **changes nothing** — the
rows and the old constraint are left exactly as they were.

It will not resolve the orphans for you, and must not: deleting or reassigning
a user's rows is a data decision the PRD does not authorise.

The pre-flight lists each affected owner with a row count, first and last
timestamps, and whether the owner still exists in `auth.users`. For each,
choose one and record the decision:

- **Create the missing `profiles` row** — right when the owner is still in
  `auth.users` and the profile went missing (a `handle_new_user` failure, or a
  profile deleted directly). Preserves the logs. This is usually the answer.
- **Reassign the log** — when the rows belong to a known different account.
- **Delete the log** — when the owner is gone and the rows have no value.
  Destructive; needs explicit sign-off.

Then re-run the pre-flight until section 2 reports `CLEAR`, and resume at
step 2.

### This path is tested, not theoretical

The whole cycle was exercised against a local database rewound to a pre-`006`
shape with two orphan rows seeded under one owner:

| Step | Result |
|---|---|
| Pre-flight | `BLOCKED — 2 orphan rows, 1 distinct owner`, owner listed by id |
| Apply `006` | psql exit 3, guard message, **2 orphan rows preserved, FK unchanged** |
| Create the missing profile row | — |
| Pre-flight | `CLEAR` |
| Re-apply `006` | exit 0, key repointed to `public.profiles`, **both log rows preserved** |

The pre-flight's prediction and the migration's behaviour agree in both
directions, which is the property that makes the pre-flight worth running.

## Rollback

`006` has no down-migration, by design — the repository uses forward
migrations only, and every change in `006` is additive or a like-for-like
swap. There is no data loss to reverse.

If it must be undone, write a new forward migration that reverses the specific
change, and put it through this same procedure. Do not edit an applied
migration file.

## What this procedure does not cover

Storage buckets, auth provider configuration, and Edge Functions are not in
`supabase/migrations/`, so nothing here validates them. They need their own
procedure when they first change.

Preview deployments per feature branch — the Vercel half of roadmap Phase 27 —
are also out of scope here. This document covers the database only.
