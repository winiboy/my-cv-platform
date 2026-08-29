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
\set R3 '00000000-0000-4000-8000-0000000000f3'
\set AN '00000000-0000-4000-8000-0000000000a1'
\set AN2 '00000000-0000-4000-8000-0000000000a2'
\set JA '00000000-0000-4000-8000-0000000000d1'
\set CG '00000000-0000-4000-8000-0000000000e1'
\set AS '00000000-0000-4000-8000-0000000000b1'
\set CL '00000000-0000-4000-8000-0000000000c1'
\set GL '00000000-0000-4000-8000-0000000000d2'
\set SN '00000000-0000-4000-8000-0000000000c9'

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
-- :R3 / :AN2 are a private parent/child pair owned by A, seeded solely for the
-- D2 cascade check and read by nothing else. The cascade check deletes its
-- parent, so that parent must be one no other check depends on: deleting :R1
-- would cascade away :GL, the only cv_generation_logs fixture, and silently
-- vacate any later check that reads it. Giving the cascade its own parent keeps
-- :R1 and :GL alive to the end of the run and makes the D2 block
-- order-independent.
INSERT INTO public.resumes (id, user_id, title) VALUES (:'R3', :'A', 'A cascade parent');
INSERT INTO public.resume_analyses (id, user_id, resume_id) VALUES (:'AN2', :'A', :'R3');
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
-- Sibling runner for checks that are not about an end-user role: catalog
-- assertions and privileged fixtures such as the signup trigger, which no
-- `authenticated` or `anon` role is granted. Same results table, same
-- PASS/FAIL contract, no role switching.
--
-- The actor is NOT a parameter. This runner executes as the privileged session
-- user, so an actor label supplied by the caller could describe an identity the
-- statement never ran under, and the resulting row would be indistinguishable
-- from a genuine role-scoped chk() row. Deriving the actor from current_user
-- means a chk_db row can only ever present itself as `db:<role>`, never as
-- `A`, `B` or `anon`. The role is pinned on entry so the recorded identity is
-- established here rather than inherited from whatever ran last.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.chk_db(
  p_tbl text, p_op text, p_intent text,
  p_sql text, p_expect integer)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE n integer; v text; a text;
BEGIN
  PERFORM set_config('role', 'postgres', true);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    a := n || ' row(s)';
    v := CASE WHEN p_expect >= 0 AND n = p_expect THEN 'PASS' ELSE 'FAIL' END;
  EXCEPTION WHEN others THEN
    a := 'refused: ' || split_part(regexp_replace(SQLERRM, '\s+', ' ', 'g'), '.', 1);
    v := CASE WHEN p_expect = -1 THEN 'PASS' ELSE 'FAIL' END;
  END;
  INSERT INTO results (tbl, actor, op, intent, expected, actual, verdict)
  VALUES (p_tbl, 'db:' || current_user, p_op, p_intent,
          CASE WHEN p_expect = -1 THEN 'refused' ELSE p_expect || ' row(s)' END,
          a, v);
END $fn$;

-- ---------------------------------------------------------------------------
-- Finding S2: handle_new_user() must resolve unqualified names through a
-- pinned search_path, keep SECURITY DEFINER, keep its trigger, and still
-- populate the profile row on signup.
--
-- This section runs immediately after the fixtures block, and not at the tail
-- of the script, because it is the only section that mutates shared state: it
-- adds a third auth.users row and, through the trigger, a third
-- public.profiles row. Running it here folds that state into the one baseline
-- every later check sees, so no check can silently inherit mid-script drift
-- depending on where it happens to be appended.
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk_db('handle_new_user','CATALOG','S2 search_path pinned to public, pg_temp',
  'SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ''public'' AND p.proname = ''handle_new_user''
       AND p.proconfig @> ARRAY[''search_path=public, pg_temp'']',1);

SELECT pg_temp.chk_db('handle_new_user','CATALOG','S2 still SECURITY DEFINER',
  'SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ''public'' AND p.proname = ''handle_new_user'' AND p.prosecdef',1);

-- The function is replaced in place, never dropped: a DROP would have cascaded
-- this trigger away.
SELECT pg_temp.chk_db('handle_new_user','CATALOG','S2 on_auth_user_created trigger survives',
  'SELECT 1 FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal AND t.tgname = ''on_auth_user_created''
       AND n.nspname = ''auth'' AND c.relname = ''users''
       AND p.proname = ''handle_new_user''',1);

-- This check observes the INSERT only, never the trigger: the trigger evidence
-- is the catalog check above and the profile check below.
SELECT pg_temp.chk_db('auth.users','INSERT','S2 signup fixture row inserted',
  format('INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                                  created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
          VALUES (%L, ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'',
                  %L, '''', now(), now(), ''{"provider":"email"}''::jsonb, %L::jsonb)',
    :'SN', 'signup@example.test',
    '{"full_name":"Signup Fixture","avatar_url":"https://example.test/avatar.png"}'),1);

SELECT pg_temp.chk_db('profiles','SELECT','S2 signup still populates the profile row',
  format('SELECT 1 FROM public.profiles
            WHERE id = %L AND email = %L AND full_name = %L AND avatar_url = %L',
    :'SN', 'signup@example.test', 'Signup Fixture', 'https://example.test/avatar.png'),1);

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
-- These three are ordered, not merely adjacent. B must fail against a row that
-- is still there, so both of B's deletes run first; A's delete then consumes
-- :AN. Before the D2 policy landed the last check expected 0 and passed for the
-- wrong reason - it was recording the missing DELETE policy, not an isolation
-- guarantee.
--
-- The first check below is TRUE but NON-DISCRIMINATING ON ITS OWN, and must not
-- be read as the whole of criterion 3. Its predicate references a column, so
-- PostgreSQL applies the SELECT policy to find candidate rows before the DELETE
-- policy is ever consulted against them. :AN is invisible to B, so the delete
-- matches nothing and reports 0 rows whatever the DELETE policy says - it would
-- report 0 even under `USING (true)`, where B can in fact destroy A's analysis.
-- The check therefore constrains the SELECT policy, not the DELETE policy.
--
-- The second check is the one that discriminates. An unqualified DELETE has no
-- predicate for the SELECT policy to pre-filter, so every row is offered
-- directly to the DELETE policy and the result counts exactly the rows that
-- policy permits B to remove. Under the correct owner-scoped policy B owns no
-- analysis, so it removes 0 rows and A's fixtures are untouched, which keeps
-- this non-destructive and leaves the ordering the checks around it depend on
-- intact. Under `USING (true)` it removes A's rows and FAILs - the failure the
-- qualified check structurally cannot produce.
--
-- Together with the catalog assertion in the D2 section below, these are the
-- only guards against an over-permissive DELETE policy on this table.
SELECT pg_temp.chk('resume_analyses','B','DELETE','D2 delete A analysis by id',:'B',
  format('DELETE FROM public.resume_analyses WHERE id=%L',:'AN'),0);
SELECT pg_temp.chk('resume_analyses','B','DELETE','D2 delete all analyses unqualified',:'B',
  'DELETE FROM public.resume_analyses',0);
SELECT pg_temp.chk('resume_analyses','A','DELETE','D2 delete own analysis',:'A',
  format('DELETE FROM public.resume_analyses WHERE id=%L',:'AN'),1);

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

-- ---------------------------------------------------------------------------
-- Finding D2: resume_analyses owners can delete their own analyses.
--
-- The behavioural criteria - A deletes its own analysis (1 row), and B removes
-- 0 rows both by id and unqualified - are asserted in the cross-user isolation
-- block above, through pg_temp.chk under the real `authenticated` role. They
-- live there because they need :AN alive and are ordered against each other;
-- see the comment at those checks, which also explains why the unqualified
-- delete is the one that actually discriminates.
--
-- What is left here is the catalog assertion and the cascade regression.
--
-- The cascade check operates on :R3 / :AN2, a parent/child pair seeded for it
-- alone. It could equally use :R1, whose analyses cascade the same way, but
-- :R1 is read by the S1, S3 and owner-positive-control sections and is the
-- parent of :GL, the only cv_generation_logs fixture, whose resume_id is
-- NOT NULL ... ON DELETE CASCADE. Deleting :R1 here would destroy :GL and
-- would force this block to the tail of the file, where any check appended
-- after it would silently inherit that drift - a later cv_generation_logs
-- check would read 0 rows because the row was gone, not because a policy
-- held. Using a private parent removes the ordering constraint entirely: this
-- block touches nothing any other check reads, and :R1 and :GL survive to the
-- end of the run as a stable baseline.
-- ---------------------------------------------------------------------------

-- This assertion compares the policy expression as an exact string, so a
-- semantically identical qualifier written the other way round -
-- `USING (user_id = auth.uid())` - would FAIL it. That is accepted: the
-- acceptance criterion is phrased as this literal, and a normalising comparison
-- would need either an expression parser or a looser match that could accept
-- predicates this check exists to reject. The tradeoff is a check that can fail
-- on a harmless rewrite, and the fix in that case is to update this literal
-- deliberately rather than to relax the comparison.
SELECT pg_temp.chk_db('resume_analyses','CATALOG','D2 DELETE policy exists with owner qualifier',
  'SELECT 1 FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ''public'' AND c.relname = ''resume_analyses''
       AND p.polcmd = ''d''
       AND pg_get_expr(p.polqual, p.polrelid) = ''(auth.uid() = user_id)''',1);

-- The two reads around the cascade go through chk_db, not chk, because the
-- claim under test is referential, not policy-scoped: the child row must be
-- physically present and then physically absent. A role-scoped read would
-- answer a different question - what that role can see - and would make this
-- regression test's verdict depend on the resume_analyses SELECT policy staying
-- correct, coupling it to a policy it is not about. Asserting presence
-- unconditionally keeps the cascade evidence independent of RLS. The delete of
-- the parent in between is a user action, so that one is role-scoped.
SELECT pg_temp.chk_db('resume_analyses','SELECT','D2 cascade fixture present before parent delete',
  format('SELECT 1 FROM public.resume_analyses WHERE id=%L',:'AN2'),1);

SELECT pg_temp.chk('resumes','A','DELETE','D2 delete own parent resume',:'A',
  format('DELETE FROM public.resumes WHERE id=%L',:'R3'),1);

SELECT pg_temp.chk_db('resume_analyses','SELECT','D2 cascade removed the child analysis',
  format('SELECT 1 FROM public.resume_analyses WHERE id=%L',:'AN2'),0);

-- Order-independence guard for the block above: :R1 and its cv_generation_logs
-- child :GL must still be present after the cascade, so a check appended below
-- this point starts from the same baseline as one appended above it.
SELECT pg_temp.chk_db('cv_generation_logs','SELECT','D2 :GL survives the cascade block',
  format('SELECT 1 FROM public.cv_generation_logs WHERE id=%L AND resume_id=%L',:'GL',:'R1'),1);

\echo ''
\echo '================ RLS AUDIT RESULTS ================'
SELECT seq, tbl, actor, op, intent, expected, actual, verdict FROM results ORDER BY seq;
\echo ''
\echo '================ SUMMARY ================'
SELECT verdict, count(*) FROM results GROUP BY verdict ORDER BY verdict;

ROLLBACK;
