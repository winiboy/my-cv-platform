-- Migration 012, exercised against rows that hold each legacy template id.
--
-- 012 remaps every resume whose template is one of the five legacy ids to a
-- Swiss template (swiss-templates-only-page-fidelity FR-2), narrows
-- resumes_template_check to the ten Swiss ids and sets the column default to
-- swissCommerce. A freshly reset local database has no legacy rows, so the
-- remap would run against zero rows and prove nothing. This script constructs
-- them.
--
-- Same shape as 007-backfill.sql: it `\i`-includes the real migration file
-- rather than restating its logic, so what runs here is the statement that will
-- run in production.
--
-- WHY IT FIRST PUTS BACK THE 011 CONSTRAINT AND DEFAULT
--
-- Legacy rows can only be inserted while the constraint still accepts them.
-- On a database that already has 012 applied, the script therefore restores
-- 011's constraint and 'modern' default inside its own transaction, seeds the
-- rows, and applies 012 over them. On a database at 011 those two statements
-- are no-ops in effect. Either way the starting state is exactly the one
-- production is in before 012.
--
-- EVERYTHING IS ROLLED BACK. No row, user or schema change survives this
-- script. It belongs to the local stack only - never point it at a deployed
-- database.
--
-- RUN (the db container has no copy of the project's migrations, so the file
-- under test is staged in first):
--
--   docker cp supabase/migrations/012_swiss_templates_only.sql ^
--     supabase_db_my-cv-platform:/tmp/012_swiss_templates_only.sql
--   docker cp supabase/tests/012-swiss-templates-only.sql ^
--     supabase_db_my-cv-platform:/tmp/012-swiss-templates-only.sql
--   docker exec -i supabase_db_my-cv-platform ^
--     psql -U postgres -d postgres -f /tmp/012-swiss-templates-only.sql
--
-- Override the staged path with -v m012=/some/other/path if needed.
-- Expected result: every assertion echoes PASS and the script exits 0. Any
-- failure raises, so a non-zero exit is the failure signal.

\set ON_ERROR_STOP on
\pset pager off
\timing off

\if :{?m012}
\else
  \set m012 '/tmp/012_swiss_templates_only.sql'
\endif

\set U '00000000-0000-4000-8000-000000000120'

BEGIN;

-- ---------------------------------------------------------------------------
-- Setup: the pre-012 schema contract, one owner, and one row per legacy id
-- plus one Swiss row, each with a distinct, fixed updated_at.
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_template_check;
ALTER TABLE public.resumes ADD CONSTRAINT resumes_template_check
  CHECK (template IN (
    'modern', 'classic', 'minimal', 'creative', 'professional',
    'swissVocational', 'swissCommerce', 'swissTrades', 'swissHealth', 'swissFinance',
    'swissEngineering', 'swissIt', 'swissExecutive', 'swissAcademic', 'swissFirstJob'
  ));
ALTER TABLE public.resumes ALTER COLUMN template SET DEFAULT 'modern';

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
 (:'U', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm012-owner@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

INSERT INTO public.resumes (id, user_id, title, template, summary, layout_settings, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000121', :'U', '012 professional', 'professional', 'S1', '{"fontScale":1.1}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000122', :'U', '012 modern',       'modern',       'S2', NULL,                         '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000123', :'U', '012 classic',      'classic',      'S3', NULL,                         '2026-01-01T00:00:00Z', '2026-01-04T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000124', :'U', '012 minimal',      'minimal',      'S4', NULL,                         '2026-01-01T00:00:00Z', '2026-01-05T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000125', :'U', '012 creative',     'creative',     'S5', NULL,                         '2026-01-01T00:00:00Z', '2026-01-06T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000126', :'U', '012 swiss',        'swissHealth',  'S6', NULL,                         '2026-01-01T00:00:00Z', '2026-01-07T00:00:00Z');

-- Every column but template, as it stood before the migration.
CREATE TEMP TABLE before_012 AS
  SELECT id, template, to_jsonb(r) - 'template' AS other_columns
    FROM public.resumes r
   WHERE user_id = :'U';

\echo 'BEFORE'
SELECT title, template, updated_at FROM public.resumes WHERE user_id = :'U' ORDER BY id;

\echo 'PASS  setup: one row per legacy id and one Swiss row, under the 011 contract'

-- ---------------------------------------------------------------------------
-- The migration.
-- ---------------------------------------------------------------------------
\i :m012

\echo 'AFTER'
SELECT title, template, updated_at FROM public.resumes WHERE user_id = :'U' ORDER BY id;

-- ---------------------------------------------------------------------------
-- Arm 1: each legacy id is remapped as FR-2 fixes; the Swiss row is untouched.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  got text;
  expected record;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('00000000-0000-4000-8000-000000000121'::uuid, 'swissTrades'),
      ('00000000-0000-4000-8000-000000000122'::uuid, 'swissEngineering'),
      ('00000000-0000-4000-8000-000000000123'::uuid, 'swissFinance'),
      ('00000000-0000-4000-8000-000000000124'::uuid, 'swissVocational'),
      ('00000000-0000-4000-8000-000000000125'::uuid, 'swissFirstJob'),
      ('00000000-0000-4000-8000-000000000126'::uuid, 'swissHealth')
    ) AS t(id, template)
  LOOP
    SELECT template INTO got FROM public.resumes WHERE id = expected.id;
    IF got IS DISTINCT FROM expected.template THEN
      RAISE EXCEPTION 'row % expected %, got %', expected.id, expected.template, got;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.resumes
     WHERE template IN ('professional', 'modern', 'classic', 'minimal', 'creative')
  ) THEN
    RAISE EXCEPTION 'a legacy template id survived the migration';
  END IF;
END $$;

\echo 'PASS  arm 1: professional->swissTrades, modern->swissEngineering, classic->swissFinance, minimal->swissVocational, creative->swissFirstJob; Swiss row untouched; no legacy id left'

-- ---------------------------------------------------------------------------
-- Arm 2: no other column changed - updated_at included - and the trigger is
-- back on.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  changed bigint;
  trigger_state "char";
BEGIN
  SELECT count(*) INTO changed
    FROM before_012 b
    JOIN public.resumes r ON r.id = b.id
   WHERE (to_jsonb(r) - 'template') IS DISTINCT FROM b.other_columns;
  IF changed <> 0 THEN
    RAISE EXCEPTION '% row(s) changed a column other than template', changed;
  END IF;

  SELECT tgenabled INTO trigger_state
    FROM pg_trigger
   WHERE tgname = 'update_resumes_updated_at' AND tgrelid = 'public.resumes'::regclass;
  IF trigger_state IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'update_resumes_updated_at is not enabled after the migration (tgenabled = %)', trigger_state;
  END IF;
END $$;

-- The re-enabled trigger still stamps an ordinary update.
UPDATE public.resumes SET summary = 'S1 edited' WHERE id = '00000000-0000-4000-8000-000000000121';
DO $$
BEGIN
  IF (SELECT updated_at FROM public.resumes WHERE id = '00000000-0000-4000-8000-000000000121')
     = '2026-01-02T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'update_resumes_updated_at did not stamp an update after the migration';
  END IF;
END $$;

\echo 'PASS  arm 2: only template changed (updated_at preserved); the updated_at trigger is enabled and stamps updates again'

-- ---------------------------------------------------------------------------
-- Arm 3: the constraint accepts exactly the ten ids, and the default is swissCommerce.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  def text;
  legacy text;
  inserted text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
   WHERE conname = 'resumes_template_check' AND conrelid = 'public.resumes'::regclass;
  IF def IS DISTINCT FROM
     'CHECK ((template = ANY (ARRAY[''swissVocational''::text, ''swissCommerce''::text, ''swissTrades''::text, ''swissHealth''::text, ''swissFinance''::text, ''swissEngineering''::text, ''swissIt''::text, ''swissExecutive''::text, ''swissAcademic''::text, ''swissFirstJob''::text])))' THEN
    RAISE EXCEPTION 'unexpected resumes_template_check: %', def;
  END IF;

  FOREACH legacy IN ARRAY ARRAY['professional', 'modern', 'classic', 'minimal', 'creative'] LOOP
    BEGIN
      INSERT INTO public.resumes (user_id, title, template)
      VALUES ('00000000-0000-4000-8000-000000000120', '012 refused', legacy);
      RAISE EXCEPTION 'the constraint accepted the legacy id %', legacy;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.resumes (user_id, title)
  VALUES ('00000000-0000-4000-8000-000000000120', '012 default')
  RETURNING template INTO inserted;
  IF inserted IS DISTINCT FROM 'swissCommerce' THEN
    RAISE EXCEPTION 'a new row defaults to %, not swissCommerce', inserted;
  END IF;
END $$;

\echo 'PASS  arm 3: constraint is the ten Swiss ids, every legacy id is refused, a new row defaults to swissCommerce'

ROLLBACK;

\echo 'PASS  rolled back: nothing this script did survives'
