-- D3 abort path: migration 006 must refuse to repoint cv_generation_logs.user_id
-- when an orphan exists, rather than dropping rows to make the key fit.
--
-- This is the evidence for the US-004 acceptance criterion that the audit
-- harness deliberately does not cover. supabase/tests/rls-audit.sql audits the
-- state a migration produced and does not run migrations; a guard check written
-- there would have to re-implement 006's orphan query, and a copy passes happily
-- while the block it claims to cover is broken. This script instead \i-includes
-- the real migration file, so what runs is the guard itself.
--
-- The local stack never reaches the guarded state by accident - cv_generation_logs
-- is empty and, once 006 has been applied, the constraint makes an orphan
-- impossible to insert. So the state is constructed here on purpose. It is
-- reachable despite the constraint because DDL is transactional in PostgreSQL:
-- this script drops the constraint, restores the pre-migration one, seeds the
-- orphan, exercises the guard, and rolls the whole thing back.
--
-- RUN (the db container has no copy of the project's migrations, so the file
-- under test is staged in first):
--
--   docker cp supabase/migrations/006_rls_schema_hardening.sql \
--     supabase_db_my-cv-platform:/tmp/006_rls_schema_hardening.sql
--   docker cp supabase/tests/d3-abort-path.sql \
--     supabase_db_my-cv-platform:/tmp/d3-abort-path.sql
--   docker exec -i supabase_db_my-cv-platform \
--     psql -U postgres -d postgres -f /tmp/d3-abort-path.sql
--
-- Override the staged path with -v d3_migration=/some/other/path if needed.
-- Expected result: every assertion echoes PASS and the script exits 0. Any
-- failure raises, so a non-zero exit is the failure signal.
--
-- WHY THERE ARE TWO ARMS.
--
-- Arm 1 alone would be weak. "Applying 006 with an orphan present raises an
-- error" is satisfied by a migration that is simply broken, and the assertions
-- one could add after it - the row survived, the old constraint survived - are
-- vacuous, because arm 1 ends in a rollback that would restore both of those
-- whether the guard fired or not.
--
-- Arm 2 is what makes the pair discriminating. It resolves the orphan the
-- non-destructive way, applies the same file again, and asserts it now succeeds
-- AND that the previously-orphaned row is still there afterwards. That
-- assertion runs before any rollback, so it is real: it fails if the migration
-- resolves orphans by deleting them. Together the arms pin the abort to the
-- orphan condition specifically, rather than to 006 being unrunnable.

\set ON_ERROR_STOP on
\pset pager off

\if :{?d3_migration}
\else
  \set d3_migration '/tmp/006_rls_schema_hardening.sql'
\endif

\set O  '00000000-0000-4000-8000-00000000004f'
\set SU '00000000-0000-4000-8000-00000000004e'
\set RS '00000000-0000-4000-8000-00000000004d'
\set LG '00000000-0000-4000-8000-00000000004c'

BEGIN;

-- ---------------------------------------------------------------------------
-- Restore the pre-migration constraint, then construct the orphan.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cv_generation_logs
  DROP CONSTRAINT IF EXISTS cv_generation_logs_user_id_fkey;
ALTER TABLE public.cv_generation_logs
  ADD CONSTRAINT cv_generation_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- :SU survives; :O is the orphan-to-be. Both get a profile from the signup
-- trigger, and :O's is then removed.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
 (:'SU', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'd3-survivor@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb),
 (:'O',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'd3-orphan@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

-- THE TRAP, stated so the next person does not fall into it: this resume must
-- belong to :SU, never to :O. public.resumes.user_id references profiles ON
-- DELETE CASCADE, so deleting :O's profile below would take an :O-owned resume
-- with it - and cv_generation_logs.resume_id would then cascade the orphan log
-- away too. The guard would find nothing, the migration would succeed, and this
-- script would report a failure that says nothing about the guard.
INSERT INTO public.resumes (id, user_id, title) VALUES (:'RS', :'SU', 'D3 surviving parent');

DELETE FROM public.profiles WHERE id = :'O';

INSERT INTO public.cv_generation_logs (id, user_id, resume_id)
VALUES (:'LG', :'O', :'RS');

-- Precondition. If this is wrong the two arms below prove nothing, so it is
-- asserted rather than assumed.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n
  FROM public.cv_generation_logs l
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = l.user_id);
  IF n <> 1 THEN
    RAISE EXCEPTION 'setup failed: expected exactly 1 orphan log, found %', n;
  END IF;
END $$;

\echo 'PASS  setup: exactly one orphan cv_generation_logs row exists'

-- ---------------------------------------------------------------------------
-- Arm 1: the real migration must refuse to run.
-- ---------------------------------------------------------------------------
-- WHY ON_ERROR_ROLLBACK, AND WHY :ERROR NO LONGER ANSWERS "DID IT RAISE?".
--
-- 006 is no longer a file whose last failing statement is the D3 guard: US-005
-- appended an S1 section after it. Without ON_ERROR_ROLLBACK, the guard aborts
-- the transaction and every appended statement then fails with "current
-- transaction is aborted", so :LAST_ERROR_MESSAGE at the end of the include is
-- that collateral message and not the guard's. This is the relocation the
-- previous revision of this comment said would be needed, and it arrived exactly
-- as predicted - the assertion below failed loudly and named the string it got.
--
-- ON_ERROR_ROLLBACK wraps each statement of the include in an implicit
-- savepoint, so the guard's abort undoes the guard's own statement and leaves
-- the transaction usable. The statements after it then succeed, and
-- :LAST_ERROR_MESSAGE still holds the guard's message, because psql updates that
-- variable only on error and never clears it on success. What this asserts is
-- therefore unchanged, and it no longer depends on where in 006 the guard sits.
--
-- Nothing is weakened by letting the include continue. The guarded work - the
-- orphan count and the constraint swap - is one DO block, one statement, so a
-- fired guard means the swap did not happen whether or not the rest of the file
-- runs. And arm 1 ends in ROLLBACK TO SAVEPOINT regardless, which is why the
-- comment on arm 2 notes that arm 1's own after-the-fact assertions would be
-- vacuous.
--
-- The cost is that :ERROR now reports the *last* statement, which succeeds, so
-- it can no longer stand for "the migration raised". A sentinel replaces it:
-- :LAST_ERROR_MESSAGE is set to a value no error can produce, and the include
-- having changed it is the signal that something raised. The sentinel is
-- deliberately space-free - psql's \set concatenates its arguments, so a
-- sentinel with spaces would not survive being passed through a variable.
\set d3_no_error 'd3-abort-path-nothing-raised'
\set LAST_ERROR_MESSAGE :d3_no_error

SAVEPOINT before_migration;

\set ON_ERROR_STOP off
\set ON_ERROR_ROLLBACK on
\i :d3_migration
\set errmsg :LAST_ERROR_MESSAGE
\set ON_ERROR_ROLLBACK off
\set ON_ERROR_STOP on

ROLLBACK TO SAVEPOINT before_migration;

SELECT (:'errmsg' IS DISTINCT FROM :'d3_no_error') AS fired \gset

-- Assertions branch with \if rather than testing the variable inside a DO block:
-- psql does not interpolate its variables into dollar-quoted text, so :'fired'
-- there is a syntax error, not a value.
\if :fired
  \echo 'PASS  arm 1: applying 006 with an orphan present raised an error'
\else
  \echo 'FAIL  arm 1: migration 006 completed with an orphan present'
  DO $$ BEGIN RAISE EXCEPTION
    'd3-abort-path arm 1: applying 006 with an orphan present did not raise; the D3 guard did not fire';
  END $$;
\endif

-- The message must be the guard's own, and must carry what an operator needs:
-- the table, and how many rows are affected.
--
-- This reads the last error the include produced. Under ON_ERROR_ROLLBACK that
-- is the guard's message as long as no statement after the guard also fails; if
-- one did, this assertion reports that string instead - a loud, self-explaining
-- failure rather than a silent one. Demonstrated, not supposed: a mutant with a
-- failing statement appended after the guard fails here and echoes what it got.
SELECT (:'errmsg' LIKE '%cv_generation_logs%'
        AND :'errmsg' LIKE '%1 row(s)%') AS msg_names_table_and_count \gset

\if :msg_names_table_and_count
  \echo 'PASS  arm 1: the abort message names the table and the orphan count'
\else
  \echo 'FAIL  arm 1: the error raised was not the D3 guard. Got:'
  \echo :errmsg
  DO $$ BEGIN RAISE EXCEPTION
    'd3-abort-path arm 1: the abort message does not name the table and the orphan count';
  END $$;
\endif

-- ---------------------------------------------------------------------------
-- Arm 2: resolve the orphan, and the same file must now succeed and preserve
-- the row it previously refused to touch.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, email) VALUES (:'O', 'd3-orphan@example.test');

\i :d3_migration

\echo 'PASS  arm 2: applying 006 with no orphan completed without error'

DO $$
DECLARE refs text; deltype "char"; kept bigint;
BEGIN
  SELECT confrelid::regclass::text, confdeltype INTO refs, deltype
  FROM pg_constraint WHERE conname = 'cv_generation_logs_user_id_fkey';

  IF refs IS DISTINCT FROM 'profiles' OR deltype IS DISTINCT FROM 'c' THEN
    RAISE EXCEPTION
      'expected the key to reference profiles ON DELETE CASCADE, got % / %', refs, deltype;
  END IF;

  -- The load-bearing half: the row the guard refused to drop is still here.
  -- :LG spelled out, because psql does not interpolate into dollar-quoted text.
  SELECT count(*) INTO kept FROM public.cv_generation_logs
   WHERE id = '00000000-0000-4000-8000-00000000004c';
  IF kept <> 1 THEN
    RAISE EXCEPTION
      'the previously-orphaned log row was not preserved (found % rows); the migration resolved the orphan destructively', kept;
  END IF;
END $$;

\echo 'PASS  arm 2: key repointed at profiles ON DELETE CASCADE, orphaned row preserved'

ROLLBACK;

\echo ''
\echo 'D3 ABORT PATH: all assertions passed (transaction rolled back)'
