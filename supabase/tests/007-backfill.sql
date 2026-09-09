-- Migration 007's backfill, exercised against rows.
--
-- 007 adds public.resumes.layout_settings, bounds it with
-- resumes_layout_settings_check, and copies the layout settings that older rows
-- kept inside custom_sections.layoutSettings into it. The column and the
-- constraint are visible in the catalog after `supabase db reset`, but the
-- backfill and its pre-check are NOT: a freshly reset local database has no
-- resumes, so both statements run against zero rows and prove nothing. This
-- script constructs the rows.
--
-- It is the same shape as d3-abort-path.sql and for the same reason: it
-- `\i`-includes the real migration file rather than restating its logic, so
-- what runs here is the statement that will run in production. A copy would
-- pass happily while the original was broken.
--
-- EVERYTHING IS ROLLED BACK. No row, user or schema change survives this
-- script. It is destructive in the sense that it writes, so it belongs to the
-- local stack only - never point it at a deployed database.
--
-- RUN (the db container has no copy of the project's migrations, so the file
-- under test is staged in first):
--
--   docker cp supabase/migrations/007_resume_layout_settings.sql ^
--     supabase_db_my-cv-platform:/tmp/007_resume_layout_settings.sql
--   docker cp supabase/tests/007-backfill.sql ^
--     supabase_db_my-cv-platform:/tmp/007-backfill.sql
--   docker exec -i supabase_db_my-cv-platform ^
--     psql -U postgres -d postgres -f /tmp/007-backfill.sql
--
-- Override the staged path with -v m007=/some/other/path if needed.
-- Expected result: every assertion echoes PASS and the script exits 0. Any
-- failure raises, so a non-zero exit is the failure signal.
--
-- WHY IT RUNS THE MIGRATION AGAINST AN ALREADY-MIGRATED DATABASE
--
-- The local stack has 007 applied, so ADD COLUMN IF NOT EXISTS is a no-op here
-- and the constraint is simply replaced with an identical one. Neither is what
-- this script is about. The seeded rows have layout_settings IS NULL - the
-- exact state every row is in before the backfill - so the UPDATE sees them as
-- a pre-migration database would. Re-running the file over rows that are
-- already migrated is also precisely the idempotency claim 007 makes, which
-- arm 3 asserts directly.

\set ON_ERROR_STOP on
\pset pager off
\timing off

\if :{?m007}
\else
  \set m007 '/tmp/007_resume_layout_settings.sql'
\endif

\set U        '00000000-0000-4000-8000-0000000007a0'
\set R_NULL   '00000000-0000-4000-8000-0000000007a1'
\set R_ARRAY  '00000000-0000-4000-8000-0000000007a2'
\set R_WRAP   '00000000-0000-4000-8000-0000000007a3'
\set R_DONE   '00000000-0000-4000-8000-0000000007a4'
\set R_PLAIN  '00000000-0000-4000-8000-0000000007a5'

BEGIN;

-- ---------------------------------------------------------------------------
-- Setup: one owner and the five states a row can be in.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
 (:'U', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm007-owner@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

INSERT INTO public.resumes (id, user_id, title, template, custom_sections, layout_settings)
VALUES
  -- The three legacy custom_sections shapes embedLayoutSettings ever handled.
  (:'R_NULL',  :'U', '007 legacy: null',    'modern', NULL, NULL),
  (:'R_ARRAY', :'U', '007 legacy: array',   'modern',
   '[{"title":"Awards"}]'::jsonb, NULL),
  (:'R_WRAP',  :'U', '007 legacy: wrapped', 'modern',
   '{"items":[{"title":"Awards"}],"layoutSettings":{"sidebarOrder":["training","skills"],"hiddenMainSections":["education"]}}'::jsonb,
   NULL),
  -- A row the application has already written. The backfill must not touch it,
  -- which is what makes re-application safe rather than merely repeatable.
  (:'R_DONE',  :'U', '007 legacy: already migrated', 'modern',
   '{"items":[],"layoutSettings":{"sidebarOrder":["training"]}}'::jsonb,
   '{"fontScale":1.3,"sidebarOrder":["skills"]}'::jsonb),
  -- A wrapped object with no layoutSettings key at all.
  (:'R_PLAIN', :'U', '007 legacy: wrapped without settings', 'modern',
   '{"items":[{"title":"Awards"}]}'::jsonb, NULL);

\echo 'PASS  setup: five rows seeded across every pre-migration state'

-- ---------------------------------------------------------------------------
-- Arm 1: the backfill copies exactly the rows that have something to copy.
-- ---------------------------------------------------------------------------
\i :m007

DO $$
DECLARE
  v jsonb;
BEGIN
  SELECT layout_settings INTO v FROM public.resumes
   WHERE id = '00000000-0000-4000-8000-0000000007a3';
  IF v IS DISTINCT FROM
     '{"sidebarOrder":["training","skills"],"hiddenMainSections":["education"]}'::jsonb THEN
    RAISE EXCEPTION 'wrapped row was not backfilled correctly; got %', v;
  END IF;

  -- custom_sections is a column this migration has no business rewriting.
  SELECT custom_sections INTO v FROM public.resumes
   WHERE id = '00000000-0000-4000-8000-0000000007a3';
  IF v -> 'layoutSettings' IS NULL OR v -> 'items' IS NULL THEN
    RAISE EXCEPTION 'wrapped row lost its custom_sections content; got %', v;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.resumes
     WHERE id IN ('00000000-0000-4000-8000-0000000007a1',
                  '00000000-0000-4000-8000-0000000007a2',
                  '00000000-0000-4000-8000-0000000007a5')
       AND layout_settings IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a row with no legacy layout settings was given some anyway';
  END IF;

  -- The row that already had a value keeps it. A backfill that overwrote here
  -- would discard whatever the user last saved.
  SELECT layout_settings INTO v FROM public.resumes
   WHERE id = '00000000-0000-4000-8000-0000000007a4';
  IF v IS DISTINCT FROM '{"fontScale":1.3,"sidebarOrder":["skills"]}'::jsonb THEN
    RAISE EXCEPTION 'an already-written row was overwritten by the backfill; got %', v;
  END IF;
END $$;

\echo 'PASS  arm 1: wrapped row backfilled; null/array/settings-less rows untouched; written row preserved'

-- ---------------------------------------------------------------------------
-- Arm 2: re-applying changes nothing.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE before_reapply AS
  SELECT id, custom_sections, layout_settings FROM public.resumes WHERE user_id = :'U';

\i :m007

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n
  FROM public.resumes r
  JOIN before_reapply b ON b.id = r.id
  WHERE r.layout_settings IS DISTINCT FROM b.layout_settings
     OR r.custom_sections IS DISTINCT FROM b.custom_sections;
  IF n > 0 THEN
    RAISE EXCEPTION 're-applying 007 changed % row(s); it must be a no-op', n;
  END IF;
END $$;

\echo 'PASS  arm 2: re-applying 007 changed no row'

-- ---------------------------------------------------------------------------
-- Arm 3: an oversized legacy blob stops the migration instead of being
-- truncated, discarded, or silently skipped.
-- ---------------------------------------------------------------------------
-- WHY THIS ARM EXISTS. The guard is the one part of 007 that decides what to do
-- with data it cannot migrate, and the answer it must give is "nothing, loudly".
-- Without this arm the guard is untested code on the path an operator only
-- reaches during an incident.
UPDATE public.resumes
   SET layout_settings = NULL,
       custom_sections = jsonb_build_object(
         'items', '[]'::jsonb,
         'layoutSettings', jsonb_build_object('fontFamily', repeat('F', 5000))
       )
 WHERE id = :'R_WRAP';

\set ON_ERROR_ROLLBACK on
\set ON_ERROR_STOP off
SAVEPOINT before_guard;
\i :m007
ROLLBACK TO SAVEPOINT before_guard;
\set ON_ERROR_STOP on
\set ON_ERROR_ROLLBACK off

-- The SQLSTATE check lives outside a DO block on purpose: psql does not
-- interpolate its variables inside dollar-quoted bodies, so :'LAST_ERROR_SQLSTATE'
-- written in PL/pgSQL is a syntax error rather than the value. \gset reads it
-- through an ordinary SELECT, where interpolation does happen.
SELECT CASE WHEN :'LAST_ERROR_SQLSTATE' = '23514' THEN 'true' ELSE 'false' END
  AS guard_raised_check_violation \gset

\if :guard_raised_check_violation
\else
  DO $$ BEGIN
    RAISE EXCEPTION
      'expected the oversized guard to raise a check_violation (SQLSTATE 23514); it did not';
  END $$;
\endif

DO $$
DECLARE
  v jsonb;
BEGIN
  -- Nothing resolved the offending row on the migration's behalf.
  SELECT custom_sections INTO v FROM public.resumes
   WHERE id = '00000000-0000-4000-8000-0000000007a3';
  IF octet_length((v -> 'layoutSettings')::text) <= 4096 THEN
    RAISE EXCEPTION 'the oversized legacy blob was modified; the guard must change no data';
  END IF;

  IF (SELECT layout_settings FROM public.resumes
       WHERE id = '00000000-0000-4000-8000-0000000007a3') IS NOT NULL THEN
    RAISE EXCEPTION 'an oversized legacy blob was backfilled despite the guard';
  END IF;
END $$;

\echo 'PASS  arm 3: an oversized legacy blob aborts the backfill and changes no data'

ROLLBACK;

\echo ''
\echo 'ALL PASS - 007 backfill evidence complete, nothing persisted.'
