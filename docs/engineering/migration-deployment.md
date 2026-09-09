# Deploying a migration

How a migration reaches a deployed database. Originally written for `006`;
revised on 2026-09-10 after `005`, `006` and `007` were actually deployed and
four assumptions in it turned out to be false.

The rule this exists to enforce: **a migration must run somewhere real before
it runs in production.** Every migration in this repository had, until that
day, only ever run against a local database that is empty by construction, so
the branches that only fire on real data had never been evaluated at all.

> ## Read this before anything else
>
> **Production was not created by these migrations.** Its schema was built by
> hand — most likely through the dashboard — and `supabase_migrations` was
> empty even though `001`–`004`'s tables all existed. Every instruction below
> that assumes a tracked migration history was written before anyone checked.
>
> That history now exists, because `001`–`004` were adopted with
> `migration repair` on 2026-09-10. But **`repair` asserts; it does not
> verify.** It writes a row claiming a migration ran. Anything that migration
> would have created, which the hand-built schema happens to lack, stays
> missing until something later trips over it — which is exactly what happened
> with `uuid-ossp`. See "What the first real deployment found".

## The environments

| | Purpose | State today |
|---|---|---|
| **Local** | `pnpm supabase start` — the development stack | Working; empty by construction |
| **Staging** | A hosted project with production-shaped data | **Does not exist yet** |
| **Production** | The live database | Exists; at `007` as of 2026-09-10 |

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

**Do not paste it into the dashboard SQL editor as-is.** An earlier version of
this document recommended that. The editor is not `psql`: it rejects every
meta-command outright, so the file's 31 `\echo` and `\pset` lines produce

```
ERROR: 42601: syntax error at or near "\"
```

before a single query runs. If you need the dashboard route, strip the lines
beginning with `\` first — the SQL between them is unchanged and still
read-only. Keeping the `\echo` text as `--` comments preserves the section
structure, which matters because the editor returns one result grid per
statement with nothing to say which is which.

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

**This step was skipped on 2026-09-10**, because staging still does not exist.
`005`, `006` and `007` went straight to production, and every problem in "What
the first real deployment found" would have surfaced against staging instead,
at no cost. That is the argument for building it, stated as plainly as it can
be: four defects, each found in production, each harmless only by luck.

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
compare the structural baseline.

**Do not trust a predicted count on this database.** The figure this document
carried for months — "8 RLS tables and 28 policies for `006`" — was wrong on
both halves, and wrong in a way that would have looked like a failed
deployment:

| | Predicted | Actual | Why |
|---|---|---|---|
| RLS tables after `006` | 8 | **9** | The 8 was measured before `005` existed. `005` adds `cv_generation_logs` and enables RLS on it. |
| Policies after `006` | 28 | **29** | `006` does `DROP POLICY IF EXISTS` then `CREATE` for "Users can delete own analyses". Production's hand-built schema never had that policy, so the DROP was a no-op and the CREATE was a net `+1`. |

The lesson is not "use 9 and 29". It is that a count derived from the
migrations describes a database the migrations built, and this one was not.
**Record the baseline before deploying and compare against your own number.**

A count is also a weak check. What `006` is actually *for* is adding
`WITH CHECK` to five `UPDATE` policies — without it a user may edit their own
row *and reassign it to another user's id*, because `USING` governs which rows
they may touch, not what they may set. Verify the property, not the tally:

```sql
SELECT tablename, policyname,
       CASE WHEN with_check IS NULL THEN '*** MISSING ***' ELSE 'present' END
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'UPDATE'
ORDER BY tablename;
```

Every row must read `present`. On 2026-09-10 all six did.

### The verification gap you cannot close from here

`supabase/tests/rls-audit.sql` is the 70-check script that proves `006` did
what it claims — and it **writes fixtures, so it can never be pointed at
production.** The tool built to verify this migration is unusable on the only
database that matters.

Until staging exists, the substitute is to sign in and exercise the app:
create a resume, edit it, change a layout control, export a PDF and a DOCX,
open a cover letter. If a policy is wrong the symptom is blunt — your own rows
returning empty, or a save failing. Record that you did it. It is the weakest
link in this procedure and pretending otherwise helps nobody.

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

## What the first real deployment found

`005`, `006` and `007` reached production on 2026-09-10 — the first time any
migration in this repository ran against a database with real users in it.
Four things went wrong, none of them predicted by this document. They are
recorded because each cost time to diagnose and each will recur.

### 1. The migration history was empty

`supabase migration list` showed **every** migration as local-only, including
`001`–`004`, whose tables demonstrably existed. Production's schema had been
built by hand, so `supabase_migrations` had never been written.

Left alone, `db push` would have re-run all seven from `001` against a
database that already had those objects. `001`–`004` happen to be written
idempotently (`CREATE TABLE IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before
`ADD`), so it would *probably* have been survivable — which is not a standard
to deploy by.

The fix was to record what was already true, without running anything:

```
pnpm supabase migration repair --status applied 001 002 003 004
```

**Verify before repairing.** Confirm each migration's objects actually exist
first — `supabase/tests/` has no probe for this, so it was done ad hoc against
`information_schema` and `pg_constraint`. Marking a migration applied when it
was not is how you get gap 2.

### 2. `uuid-ossp` was missing, because `repair` only asserts

`005` failed on its first statement:

```
ERROR: function uuid_generate_v4() does not exist (SQLSTATE 42883)
```

`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` is line 11 of `001` — the
migration just marked applied without running. The hand-built schema had used
something else, so the extension was never enabled.

This is the general hazard of `repair`, and it will bite again for anything
else `001`–`004` create that production lacks. The policy count was compared
(25 specified, 26 present) and looked broadly right, but **triggers,
functions, indexes and grants were never compared.** That comparison does not
exist yet and should.

### 3. The extension landed where the migration role cannot see it

Creating the extension did not fix it. The identical error recurred, because
Supabase installs extensions into a dedicated `extensions` schema:

```sql
SELECT e.extname, n.nspname AS installed_in, current_setting('search_path')
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'uuid-ossp';
```

→ `installed_in = extensions`, and the **dashboard editor's** `search_path`
was `"$user", public, extensions`, so it resolved there. The CLI connects as
its own migration role (`Initialising login role...`), whose `search_path`
does not include `extensions`. Same database, same function, different
visibility — which is why testing the fix in the SQL editor proves nothing
about whether `db push` will work.

```sql
ALTER EXTENSION "uuid-ossp" SET SCHEMA public;
```

`public` is what a plain `CREATE EXTENSION` gives, which is what every local
database has. Existing column defaults are unaffected: Postgres stores default
expressions against the function's OID, and `SET SCHEMA` does not change it.

### 4. The CLI could not reach the API from one particular shell

`supabase login` and `projects list` both failed with `Transport error` on
`api.supabase.com`. Not a credential problem, not IPv6, not a proxy, not the
firewall — the same binary, on the same machine, reached the API fine from a
different shell.

The failing shell was the terminal panel embedded in the editor, which
inherits its parent process's environment. **A standalone PowerShell window
worked immediately.** If the CLI reports a transport error, try another
terminal before diagnosing the network.

### The sequence that worked

```
# in a standalone terminal, not an embedded one
$env:SUPABASE_ACCESS_TOKEN = "<personal access token>"
pnpm supabase projects list                       # confirms auth + gives the ref
pnpm supabase link --project-ref <ref>            # asks for the DB password
pnpm supabase migration list                      # READ-ONLY. stop and read it.
pnpm supabase migration repair --status applied 001 002 003 004
pnpm supabase migration list                      # confirm both columns filled
pnpm supabase db push
```

A personal access token from the dashboard avoids `supabase login`'s browser
device-code flow entirely, which is one fewer thing to fail.

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
