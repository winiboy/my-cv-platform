-- ============================================================================
-- 007_resume_layout_settings.sql
--
-- Forward migration for Milestone C Part 1, US-003: give resume layout state a
-- home on the account instead of in the browser.
--
-- WHY A COLUMN RATHER THAN A WIDER custom_sections BLOB
--
-- custom_sections already carries user-authored sections under `items`, and
-- four of the nineteen layout properties were bolted onto the same value under
-- `layoutSettings` because no other column existed. Two unrelated things in one
-- value have a concrete cost, not only an aesthetic one:
--
--   - Every layout write has to read-modify-write the user's custom sections
--     alongside it, so a layout save races a content save and can lose one.
--   - A size or shape constraint that bounds layout state would also bound
--     user-authored content, which must stay unbounded by this work.
--
-- A dedicated column separates the two, lets the CHECK below bound exactly the
-- machine-written payload, and makes "does this resume have persisted layout
-- settings?" a NULL test rather than a nested-key probe.
--
-- NOTHING HERE DEPENDS ON 006. This migration touches only public.resumes,
-- created by 001, and its own new column. It does not reference any object
-- 006 adds, alters or drops, so it neither requires nor asserts that 006 has
-- been applied.
--
-- Additive and reversible in effect: one nullable column, one CHECK, and a
-- backfill that only fills NULLs. No column is dropped, no row is deleted, and
-- no existing value is overwritten. Every statement is idempotent, so
-- re-applying against an already-migrated database is a no-op.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The column.
--
-- NULLABLE WITH NO DEFAULT, DELIBERATELY. NULL is the signal the application's
-- precedence rule reads: "this resume has no persisted layout settings, so the
-- browser's local values are the only ones anybody has." Defaulting to
-- '{}'::jsonb would make every row claim to have persisted settings and would
-- be the first step toward empty server-side defaults beating a real local
-- customization — the data loss US-004 exists to prevent.
--
-- RLS is row-level, not column-level, so the four policies already on
-- public.resumes govern this column exactly as they govern every other one; a
-- new column needs no new policy. That holds only while the table's privileges
-- are table-wide rather than column-scoped, which they are here: the grants to
-- anon and authenticated were issued with GRANT ... ON TABLE and therefore
-- extend to columns added later. Confirmed rather than assumed — see the
-- ownership and privilege assertions in
-- src/lib/layout-settings.integration.test.ts, which execute the cross-owner
-- read and write against this column with two real users.
-- ----------------------------------------------------------------------------
ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS layout_settings JSONB;

COMMENT ON COLUMN public.resumes.layout_settings IS
  'Persisted resume layout model (typography, colour, spacing, section order and visibility). NULL means no settings have been persisted for this resume, which is what lets the client adopt its local values rather than overwrite them with defaults. Shape and bounds are enforced by resumes_layout_settings_check and validated again in src/lib/layout-settings.ts before the value reaches rendering.';


-- ----------------------------------------------------------------------------
-- The bound.
--
-- This value is written straight from the browser through PostgREST under the
-- table's UPDATE policy, so the policy decides WHOSE row may be written but
-- nothing in it decides WHAT may be written there. Without a constraint an
-- authenticated user could store megabytes of arbitrary JSON in their own row
-- and have the server hand it back on every page load.
--
-- Two things are checked, and only these two: the value is a JSON object, and
-- it is small. Per-property validation stays in src/lib/layout-settings.ts,
-- where it is expressed once for every reader; duplicating it here would create
-- the second copy of the layout contract this milestone exists to remove, and
-- would turn a future range change into a migration.
--
-- 4096 bytes against a worst case of ~1 KB — nineteen properties with every
-- list full and the longest accepted font stack — measured, not guessed. That
-- is roughly four times headroom for the model to grow, and three orders of
-- magnitude below what an unbounded column would accept.
--
-- octet_length(x::text) rather than pg_column_size(x): the cast and
-- octet_length are both immutable, so the expression is legal in a CHECK, and
-- it measures the payload rather than its TOAST-compressed storage — the
-- number that actually crosses the wire.
--
-- DROP IF EXISTS then ADD, the idiom 006 uses for policies: ADD CONSTRAINT has
-- no IF NOT EXISTS, and the pair converges on this definition from any starting
-- state. Existing rows are validated by the ADD; all of them are NULL or
-- backfilled below from values well under the bound.
-- ----------------------------------------------------------------------------
ALTER TABLE public.resumes
  DROP CONSTRAINT IF EXISTS resumes_layout_settings_check;

ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_layout_settings_check
  CHECK (
    layout_settings IS NULL
    OR (
      jsonb_typeof(layout_settings) = 'object'
      AND octet_length(layout_settings::text) <= 4096
    )
  );


-- ----------------------------------------------------------------------------
-- The backfill.
--
-- Rows that already persisted section order and visibility did so inside
-- custom_sections.layoutSettings. Copying that value into the new column means
-- a user who reordered their sidebar keeps that order the moment this ships,
-- without depending on the application's legacy read path.
--
-- WHAT IT DOES NOT DO. It copies only the four properties the old blob held.
-- The other fifteen — typography, colour, spacing, sidebar width — have never
-- been persisted anywhere and are not invented here. A backfilled row therefore
-- has SOME persisted keys and not others, which is exactly why the application
-- resolves precedence per property rather than per row: the four backfilled
-- values win over the browser, and the fifteen absent ones leave the browser's
-- real customization in place instead of replacing it with defaults.
--
-- custom_sections is left untouched. It is still read as a fallback during the
-- transition, and rewriting it here would be a destructive change to a column
-- this migration has no reason to touch.
--
-- `WHERE layout_settings IS NULL` is what makes re-application a no-op: a row
-- the application has since written is never reverted to its legacy value.
--
-- THE PRE-CHECK. ADD CONSTRAINT above has already validated every existing row,
-- but it validated them BEFORE this UPDATE — so an oversized legacy blob would
-- surface as a constraint violation from the UPDATE, naming the constraint and
-- one row and nothing about what the operator is actually looking at. The count
-- is therefore taken first and, if it is non-zero, the migration stops having
-- changed no data. It never truncates or discards the offending value: that is
-- a data decision this story does not authorize, and the affected resumes keep
-- rendering from the legacy read path in the meantime.
--
-- With app-written data this cannot trigger — the old blob holds at most four
-- short arrays of known section ids, well under 300 bytes. It exists so that if
-- it ever does, the failure says so.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  oversized_count bigint;
BEGIN
  SELECT count(*) INTO oversized_count
  FROM public.resumes
  WHERE layout_settings IS NULL
    AND jsonb_typeof(custom_sections) = 'object'
    AND jsonb_typeof(custom_sections -> 'layoutSettings') = 'object'
    AND octet_length((custom_sections -> 'layoutSettings')::text) > 4096;

  IF oversized_count > 0 THEN
    RAISE EXCEPTION
      'public.resumes has % row(s) whose custom_sections.layoutSettings exceeds the 4096-byte bound of resumes_layout_settings_check and cannot be backfilled into layout_settings',
      oversized_count
      USING
        ERRCODE = 'check_violation',
        DETAIL  = 'Migration 007 stopped before the backfill and changed no data. Under a runner that applies each migration file in one transaction — which the Supabase CLI does — the column and the constraint above are rolled back with it, so the database is left exactly as it was; re-running after resolving the rows below re-creates them.',
        HINT    = 'List them with: SELECT id, octet_length((custom_sections -> ''layoutSettings'')::text) FROM public.resumes WHERE jsonb_typeof(custom_sections -> ''layoutSettings'') = ''object'' AND octet_length((custom_sections -> ''layoutSettings'')::text) > 4096; Decide per resume what that value should become, record the decision, and re-run this migration once the query returns no rows.';
  END IF;

  UPDATE public.resumes
  SET layout_settings = custom_sections -> 'layoutSettings'
  WHERE layout_settings IS NULL
    AND jsonb_typeof(custom_sections) = 'object'
    AND jsonb_typeof(custom_sections -> 'layoutSettings') = 'object';
END $$;
