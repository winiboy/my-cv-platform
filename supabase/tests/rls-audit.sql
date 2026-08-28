-- Empirical RLS audit (Phase 26).
--
-- Proves effective policy behaviour by executing real statements as the real
-- `authenticated` and `anon` roles, rather than by reading the migrations.
-- Everything runs inside one transaction that is rolled back at the end, so
-- the database is left untouched and the script is safe to re-run.
--
-- Run against the local stack only:
--
--   pnpm supabase start
--   docker exec -i supabase_db_my-cv-platform \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/rls-audit.sql
--
-- Never run this against a deployed environment: it writes fixture rows to
-- auth.users and every public table before rolling back.
--
-- Expected result: every check reports PASS. A FAIL means the effective policy
-- no longer matches what docs/engineering/rls-audit.md recorded.

\set ON_ERROR_STOP on
\pset pager off

\set A  '00000000-0000-4000-8000-00000000000a'
\set B  '00000000-0000-4000-8000-00000000000b'
\set R1 '00000000-0000-4000-8000-0000000000f1'
\set R2 '00000000-0000-4000-8000-0000000000f2'
\set AN '00000000-0000-4000-8000-0000000000a1'
\set JA '00000000-0000-4000-8000-0000000000d1'
\set CG '00000000-0000-4000-8000-0000000000e1'
\set AS '00000000-0000-4000-8000-0000000000b1'
\set CL '00000000-0000-4000-8000-0000000000c1'
\set GL '00000000-0000-4000-8000-0000000000d2'

BEGIN;

CREATE TEMP TABLE results (
  seq serial, tbl text, actor text, op text, intent text,
  expected text, actual text, verdict text
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
 (:'A', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'a@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb),
 (:'B', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'b@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

-- profiles may already exist via handle_new_user(); ensure both are present.
INSERT INTO public.profiles (id, email) VALUES (:'A', 'a@example.test')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email) VALUES (:'B', 'b@example.test')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO public.resumes (id, user_id, title) VALUES (:'R1', :'A', 'A private');
INSERT INTO public.resumes (id, user_id, title, is_public) VALUES (:'R2', :'A', 'A public', true);
INSERT INTO public.resume_analyses (id, user_id, resume_id) VALUES (:'AN', :'A', :'R1');
INSERT INTO public.job_applications (id, user_id, company_name, job_title) VALUES (:'JA', :'A', 'ACME', 'Engineer');
INSERT INTO public.career_goals (id, user_id, title) VALUES (:'CG', :'A', 'A goal');
INSERT INTO public.ai_suggestions (id, user_id, suggestion_type, suggestion_content) VALUES (:'AS', :'A', 'resume_improvement', 'seed');
INSERT INTO public.cover_letters (id, user_id) VALUES (:'CL', :'A');
INSERT INTO public.cv_generation_logs (id, user_id, resume_id) VALUES (:'GL', :'A', :'R1');

-- ---------------------------------------------------------------------------
-- Runner. p_expect = -1 means "the statement must be refused".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.chk(
  p_tbl text, p_actor text, p_op text, p_intent text,
  p_uid text, p_sql text, p_expect integer)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE n integer; v text; a text;
BEGIN
  BEGIN
    IF p_uid IS NULL THEN
      PERFORM set_config('role', 'anon', true);
      PERFORM set_config('request.jwt.claims', NULL, true);
    ELSE
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    END IF;
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    a := n || ' row(s)';
    v := CASE WHEN p_expect >= 0 AND n = p_expect THEN 'PASS' ELSE 'FAIL' END;
  EXCEPTION WHEN others THEN
    a := 'refused: ' || split_part(regexp_replace(SQLERRM, '\s+', ' ', 'g'), '.', 1);
    v := CASE WHEN p_expect = -1 THEN 'PASS' ELSE 'FAIL' END;
  END;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO results (tbl, actor, op, intent, expected, actual, verdict)
  VALUES (p_tbl, p_actor, p_op, p_intent,
          CASE WHEN p_expect = -1 THEN 'refused' ELSE p_expect || ' row(s)' END,
          a, v);
END $fn$;

-- ---------------------------------------------------------------------------
-- Cross-user isolation: B must not see or touch A's rows.
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('resumes','B','SELECT','read A private',:'B',
  format('SELECT * FROM public.resumes WHERE id=%L',:'R1'),0);
SELECT pg_temp.chk('resumes','B','UPDATE','modify A row',:'B',
  format('UPDATE public.resumes SET title=''hacked'' WHERE id=%L',:'R1'),0);
SELECT pg_temp.chk('resumes','B','DELETE','delete A row',:'B',
  format('DELETE FROM public.resumes WHERE id=%L',:'R1'),0);
SELECT pg_temp.chk('resumes','B','INSERT','forge row owned by A',:'B',
  format('INSERT INTO public.resumes (user_id,title) VALUES (%L,''forged'')',:'A'),-1);

SELECT pg_temp.chk('resume_analyses','B','SELECT','read A analysis',:'B',
  format('SELECT * FROM public.resume_analyses WHERE id=%L',:'AN'),0);
SELECT pg_temp.chk('resume_analyses','B','INSERT','forge row owned by A',:'B',
  format('INSERT INTO public.resume_analyses (user_id) VALUES (%L)',:'A'),-1);
SELECT pg_temp.chk('resume_analyses','A','DELETE','delete own analysis',:'A',
  format('DELETE FROM public.resume_analyses WHERE id=%L',:'AN'),0);

SELECT pg_temp.chk('job_applications','B','SELECT','read A application',:'B',
  format('SELECT * FROM public.job_applications WHERE id=%L',:'JA'),0);
SELECT pg_temp.chk('job_applications','B','UPDATE','modify A row',:'B',
  format('UPDATE public.job_applications SET company_name=''x'' WHERE id=%L',:'JA'),0);
SELECT pg_temp.chk('job_applications','B','DELETE','delete A row',:'B',
  format('DELETE FROM public.job_applications WHERE id=%L',:'JA'),0);

SELECT pg_temp.chk('career_goals','B','SELECT','read A goal',:'B',
  format('SELECT * FROM public.career_goals WHERE id=%L',:'CG'),0);
SELECT pg_temp.chk('career_goals','B','DELETE','delete A row',:'B',
  format('DELETE FROM public.career_goals WHERE id=%L',:'CG'),0);

SELECT pg_temp.chk('ai_suggestions','B','SELECT','read A suggestion',:'B',
  format('SELECT * FROM public.ai_suggestions WHERE id=%L',:'AS'),0);

SELECT pg_temp.chk('cover_letters','B','SELECT','read A letter',:'B',
  format('SELECT * FROM public.cover_letters WHERE id=%L',:'CL'),0);
SELECT pg_temp.chk('cover_letters','B','UPDATE','modify A row',:'B',
  format('UPDATE public.cover_letters SET title=''x'' WHERE id=%L',:'CL'),0);
SELECT pg_temp.chk('cover_letters','B','DELETE','delete A row',:'B',
  format('DELETE FROM public.cover_letters WHERE id=%L',:'CL'),0);

SELECT pg_temp.chk('cv_generation_logs','B','SELECT','read A log',:'B',
  format('SELECT * FROM public.cv_generation_logs WHERE id=%L',:'GL'),0);
SELECT pg_temp.chk('cv_generation_logs','B','INSERT','forge row owned by A',:'B',
  format('INSERT INTO public.cv_generation_logs (user_id,resume_id) VALUES (%L,%L)',:'A',:'R1'),-1);

SELECT pg_temp.chk('profiles','B','SELECT','read A profile',:'B',
  format('SELECT * FROM public.profiles WHERE id=%L',:'A'),0);
SELECT pg_temp.chk('profiles','B','UPDATE','modify A profile',:'B',
  format('UPDATE public.profiles SET full_name=''x'' WHERE id=%L',:'A'),0);

-- ---------------------------------------------------------------------------
-- Finding S1: UPDATE policies without WITH CHECK. Can an owner reassign
-- ownership of their own row to another user?
-- Postgres substitutes USING as the check when WITH CHECK is absent, so the
-- expectation here is "refused" on every table, including those S1 flagged.
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('resumes','A','UPDATE','S1 reassign own row to B',:'A',
  format('UPDATE public.resumes SET user_id=%L WHERE id=%L',:'B',:'R1'),-1);
SELECT pg_temp.chk('job_applications','A','UPDATE','S1 reassign own row to B',:'A',
  format('UPDATE public.job_applications SET user_id=%L WHERE id=%L',:'B',:'JA'),-1);
SELECT pg_temp.chk('career_goals','A','UPDATE','S1 reassign own row to B',:'A',
  format('UPDATE public.career_goals SET user_id=%L WHERE id=%L',:'B',:'CG'),-1);
SELECT pg_temp.chk('ai_suggestions','A','UPDATE','S1 reassign own row to B',:'A',
  format('UPDATE public.ai_suggestions SET user_id=%L WHERE id=%L',:'B',:'AS'),-1);
SELECT pg_temp.chk('profiles','A','UPDATE','S1 reassign own row to B',:'A',
  format('UPDATE public.profiles SET id=%L WHERE id=%L',:'B',:'A'),-1);
-- cover_letters declares WITH CHECK explicitly; included as the control.
SELECT pg_temp.chk('cover_letters','A','UPDATE','S1 reassign own row to B (control)',:'A',
  format('UPDATE public.cover_letters SET user_id=%L WHERE id=%L',:'B',:'CL'),-1);

-- ---------------------------------------------------------------------------
-- Finding S3: is_public resumes and what anon can reach.
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('resumes','B','SELECT','read A public resume',:'B',
  format('SELECT * FROM public.resumes WHERE id=%L',:'R2'),1);
SELECT pg_temp.chk('resumes','anon','SELECT','read A public resume',NULL,
  format('SELECT * FROM public.resumes WHERE id=%L',:'R2'),1);
SELECT pg_temp.chk('resumes','anon','SELECT','read A private resume',NULL,
  format('SELECT * FROM public.resumes WHERE id=%L',:'R1'),0);
SELECT pg_temp.chk('profiles','anon','SELECT','read any profile',NULL,
  'SELECT * FROM public.profiles',0);
SELECT pg_temp.chk('cover_letters','anon','SELECT','read any letter',NULL,
  'SELECT * FROM public.cover_letters',0);

-- ---------------------------------------------------------------------------
-- Owner positive control: A must retain full access to its own rows.
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk('resumes','A','SELECT','read own row',:'A',
  format('SELECT * FROM public.resumes WHERE id=%L',:'R1'),1);
SELECT pg_temp.chk('resumes','A','UPDATE','rename own row',:'A',
  format('UPDATE public.resumes SET title=''renamed'' WHERE id=%L',:'R1'),1);
SELECT pg_temp.chk('cover_letters','A','UPDATE','rename own row',:'A',
  format('UPDATE public.cover_letters SET title=''renamed'' WHERE id=%L',:'CL'),1);
SELECT pg_temp.chk('job_applications','A','DELETE','delete own row',:'A',
  format('DELETE FROM public.job_applications WHERE id=%L',:'JA'),1);

\echo ''
\echo '================ RLS AUDIT RESULTS ================'
SELECT seq, tbl, actor, op, intent, expected, actual, verdict FROM results ORDER BY seq;
\echo ''
\echo '================ SUMMARY ================'
SELECT verdict, count(*) FROM results GROUP BY verdict ORDER BY verdict;

ROLLBACK;
