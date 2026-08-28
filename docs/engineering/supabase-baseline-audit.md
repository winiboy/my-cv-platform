# Supabase Baseline Audit

Read-only audit of the checked-in database schema, performed 2026-08-28 at
`origin/main` = `894b5923`, as the first half of Phase 25.

**Scope and limits.** Every statement here is derived from the five migration
files in `supabase/migrations/`. Nothing was executed. No database was
connected to. This audit therefore describes what the migrations *declare*,
not what any deployed environment currently *has* — those can differ, and
proving the effective state is Phase 26's job.

## Why the local project is not finished yet

Phase 25's goal is a reproducible `local -> preview/staging -> production`
path. That requires `supabase start`, which requires Docker. Neither Docker
nor the Supabase CLI is installed on the development machine, so a
`config.toml` written now could not be validated, and an unvalidated config
is worth little. `.claude/rules/testing.md` forbids reporting PASS for checks
that did not run, so the runnable local stack is explicitly deferred rather
than claimed.

**To complete Phase 25 later,** install Docker Desktop and the Supabase CLI
(`winget install Supabase.CLI`), then see "CLI adoption path" below.

## Schema as declared

Eight tables, all in `public`, all with RLS enabled. 27 policies.

| Table | Owner column | FK target | Policies present | Missing |
|---|---|---|---|---|
| `profiles` | `id` | `auth.users` | SELECT, INSERT, UPDATE | DELETE |
| `resumes` | `user_id` | `public.profiles` | SELECT, INSERT, UPDATE, DELETE | — |
| `resume_analyses` | `user_id` | `public.profiles` | SELECT, INSERT | UPDATE, DELETE |
| `job_applications` | `user_id` | `public.profiles` | SELECT, INSERT, UPDATE, DELETE | — |
| `career_goals` | `user_id` | `public.profiles` | SELECT, INSERT, UPDATE, DELETE | — |
| `ai_suggestions` | `user_id` | `public.profiles` | SELECT, INSERT, UPDATE, DELETE | — |
| `cover_letters` | `user_id` | `public.profiles` | SELECT, INSERT, UPDATE, DELETE | — |
| `cv_generation_logs` | `user_id` | `auth.users` | SELECT, INSERT | UPDATE, DELETE |

A missing policy under RLS means the operation is **denied**, not open. So the
gaps above are restrictions, not holes — but two of them look unintended, and
are listed below.

## Findings

Ordered by severity. None has been fixed; all are reported for a decision.

### S1 — UPDATE policies omit `WITH CHECK`, permitting ownership transfer

`profiles`, `resumes`, `job_applications`, `career_goals` and `ai_suggestions`
all declare UPDATE as:

```sql
CREATE POLICY "..." ON public.resumes FOR UPDATE
  USING (auth.uid() = user_id);
```

`USING` decides which existing rows may be updated. It does **not** constrain
the resulting row. Without a `WITH CHECK`, a user may update a row they own
and set `user_id` to a different user's id — moving a row out of their own
account and into someone else's.

This is an inconsistency rather than a deliberate design: `cover_letters`, the
most recently written table, does it correctly —

```sql
CREATE POLICY "Users can update their own cover letters"
  ON public.cover_letters FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

The practical reach depends on whether the application ever sends `user_id` in
an update payload, which Phase 26 should establish. The policy should not rely
on the client omitting the column.

### S2 — `handle_new_user()` is SECURITY DEFINER with a mutable `search_path`

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;
```

The function runs with the definer's privileges and writes to
`public.profiles`, but does not pin `search_path`. This is the condition
Supabase's own linter reports as `function_search_path_mutable`. The
conventional remedy is `SET search_path = public, pg_temp` on the function.

### S3 — Public resumes expose every column, including contact details

```sql
CREATE POLICY "Users can view own resumes" ON public.resumes FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);
```

Publishing a resume makes the whole row readable, including the `contact`
JSONB, which the schema documents as holding email, phone and location. That
may be intended for a public CV, but it is worth an explicit decision rather
than an implicit one, and it is the only policy in the schema granting access
to unauthenticated readers.

### D1 — `preferred_locale` rejects Italian, which the product supports

```sql
preferred_locale TEXT DEFAULT 'en'
  CHECK (preferred_locale IN ('fr', 'de', 'en'))
```

`CLAUDE.md` states the supported locales are `fr`, `en`, `de` and `it`, and
the application ships Italian routes and translations. An Italian user's
preference cannot be persisted; the write fails the constraint. Fixing this
needs a forward migration altering the constraint.

### D2 — Users cannot delete their own AI analyses

`resume_analyses` and `cv_generation_logs` have SELECT and INSERT policies
only. For `cv_generation_logs`, append-only is a reasonable design for an
audit log. For `resume_analyses` it looks unintended: a user can create
analyses of their own resume but never remove one. They are cleared only
indirectly, by `ON DELETE CASCADE` when the parent resume is deleted. This is
worth confirming against data-retention expectations.

### D3 — `cv_generation_logs` references a different owner table

Every other table keys ownership to `public.profiles(id)`;
`cv_generation_logs.user_id` references `auth.users(id)`. Both resolve to the
same uuid in practice because `profiles.id` is itself a FK to `auth.users`,
so this is a consistency issue rather than a live defect — but it means a
join pattern that works for seven tables does not for the eighth.

### M1 — `002` is redundant against `001` as committed

`002_add_professional_template.sql` exists to add `'professional'` to the
`resumes.template` CHECK constraint. But `001_initial_schema.sql` already
contains `'professional'` in that constraint at creation time, so `002` drops
and recreates an identical constraint.

**What git can and cannot show here.** Both files entered the repository in
the same commit — `8895a31`, "v0.1.0: Initial CV Platform Release" — so the
history was squashed at that point. Git therefore cannot demonstrate that
`001` was edited after `002` was written, and this audit does not claim it
was. Two explanations fit the evidence equally well: `001` was amended before
the squash, or it was finalised with `'professional'` included while `002` was
retained as an artifact of the pre-git working history.

**Why it still matters.** If any deployed environment was built from a
pre-squash `001` that lacked `'professional'`, then replaying today's files
does not reproduce that environment, and the CLI adoption path below must use
the *baseline* strategy rather than renaming in place. Resolving this needs
the production schema inspected directly, which Phase 26 will do. It also
illustrates the risk that `.claude/rules/database.md` guards against by
requiring forward-only migrations: once history is ambiguous, the files stop
being a trustworthy description of any environment.

### M2 — Migration filenames are not in Supabase CLI format

Files are `001_initial_schema.sql` through `005_cv_generation_logs.sql`. The
CLI expects `<timestamp>_name.sql` and records applied migrations in
`supabase_migrations.schema_migrations`. See the adoption path below; this is
the main obstacle to adopting the CLI safely.

### M3 — Duplicated `updated_at` trigger function

`003` defines `update_cover_letters_updated_at()`, which is byte-for-byte
equivalent in behaviour to `update_updated_at_column()` from `001`. Two
functions maintaining one convention.

### M4 — No documented way to apply migrations

Nothing in `README.md`, `docs/` or `CLAUDE.md` describes how these files reach
any environment. With no CLI installed, they were most likely pasted into the
Supabase SQL editor by hand. That is the reproducibility gap Phase 25 exists
to close, and it is why M1 was possible in the first place.

## CLI adoption path

The order matters, because the risky step is telling the CLI about migrations
that have already been applied by other means.

1. **Install tooling.** Docker Desktop, then the Supabase CLI.
2. **Determine production's tracking state first.** Check whether
   `supabase_migrations.schema_migrations` exists and what it contains. Do
   this before renaming anything. If it is absent, the CLI has never managed
   this database and will consider all migrations unapplied.
3. **Decide between two strategies, then rename:**
   - *Baseline* — squash the current schema into a single
     `<timestamp>_baseline.sql` reflecting production as it stands, and mark
     it applied via `supabase migration repair`. Loses per-migration history
     but guarantees the CLI's view matches reality. Best if M1 means the
     files no longer reproduce production exactly.
   - *Rename in place* — rename all five to timestamps preserving order, then
     `supabase migration repair --status applied` for each. Keeps history,
     but is only safe if replaying the files truly reproduces production.
4. **Verify locally before touching anything hosted.** `supabase start`, then
   `supabase db reset` to apply the full chain to a throwaway local database.
   This is what proves the migrations are self-consistent, and it is exactly
   the step that is impossible today.
5. **Author `seed.sql`** only after step 4, so it can be validated against a
   real local database. It must contain synthetic data only — no production
   rows, no real user data.
6. **Never** run `supabase db push` against production as the first use of the
   CLI. Preview/staging first, which is Phase 27.

## What this unblocks

Phase 26's RLS audit can begin from the policy table above, but it must prove
the *effective* state by executing queries as different roles — a declared
policy is not evidence that the deployed database has it. That requires a
database it is safe to test against, so Phase 26 remains gated on either the
local stack or a staging project.

Phase 11's integration tests are gated on the same thing.
