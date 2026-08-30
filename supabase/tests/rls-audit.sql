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

-- Fixtures private to the M3 block at the tail of this file. That block updates
-- every row it touches, and an update it performs must not be observable by any
-- other check, so it owns its own rows rather than borrowing shared ones. :C is
-- a third identity that exists only because public.profiles is 1:1 with
-- auth.users: a private profile row cannot be seeded without a private user.
\set C   '00000000-0000-4000-8000-00000000000c'
\set R4  '00000000-0000-4000-8000-0000000000f4'
\set JA2 '00000000-0000-4000-8000-0000000000d3'
\set CG2 '00000000-0000-4000-8000-0000000000e2'
\set CL2 '00000000-0000-4000-8000-0000000000c2'

-- Fixtures private to the D3 block at the tail of this file.
--
-- :NP is an auth.users identity with NO public.profiles row - the state that
-- tells the two candidate foreign keys apart. :TC owns :GL3 and nothing else;
-- the transitive-cascade check deletes :TC's account to observe :GL3 disappear.
\set NP  '00000000-0000-4000-8000-00000000000d'
\set TC  '00000000-0000-4000-8000-00000000000e'
\set GL2 '00000000-0000-4000-8000-0000000000d4'
\set GL3 '00000000-0000-4000-8000-0000000000d5'

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
  'b@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb),
 (:'C', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'c@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

-- profiles may already exist via handle_new_user(); ensure all three are present.
INSERT INTO public.profiles (id, email) VALUES (:'A', 'a@example.test')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email) VALUES (:'B', 'b@example.test')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email) VALUES (:'C', 'c@example.test')
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

-- M3 fixtures. One owned row per table carrying an updated_at trigger, seeded
-- here so they are part of the single baseline every check sees rather than
-- appearing mid-run. Each is read and written by the M3 block alone.
--
-- :JA2 exists because :JA cannot serve: the owner-positive-control block
-- deletes :JA, so an M3 check against it at the tail would find no row and
-- report a failure that says nothing about the trigger. The other three follow
-- the same rule for the same reason - :R1, :CG and :CL happen to survive today,
-- but a check that depends on that is a check that breaks when an unrelated
-- section is appended above it.
--
-- :C's profile is the exception that proves the rule: profiles is 1:1 with
-- auth.users, so :C is seeded above alongside :A and :B rather than here.
INSERT INTO public.resumes (id, user_id, title) VALUES (:'R4', :'A', 'A M3 timestamp fixture');
INSERT INTO public.job_applications (id, user_id, company_name, job_title) VALUES (:'JA2', :'A', 'M3 Co', 'Engineer');
INSERT INTO public.career_goals (id, user_id, title) VALUES (:'CG2', :'A', 'A M3 goal');
INSERT INTO public.cover_letters (id, user_id) VALUES (:'CL2', :'A');

-- D3 fixtures. Seeded here, with everything else, for the reason the M3 block
-- gives: state that appears mid-run makes a check's verdict depend on where it
-- was appended. Both identities are read and written by the D3 block alone.
--
-- The on_auth_user_created trigger creates a profiles row for each of these, so
-- :NP's is deleted immediately afterwards to produce the one state that
-- discriminates between the two candidate foreign keys: an id that exists in
-- auth.users but not in public.profiles. Under the pre-migration key that id is
-- an acceptable user_id; under the post-migration key it is not.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
 (:'NP', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'np@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb),
 (:'TC', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'tc@example.test', '', now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

DELETE FROM public.profiles WHERE id = :'NP';

-- :GL3 is owned by :TC but hangs off :R1, a resume owned by :A.
--
-- The parent's owner is the whole point of this fixture, and getting it wrong
-- silently disarms the cascade check at the tail. cv_generation_logs has TWO
-- cascade paths into an account: user_id -> profiles, and resume_id -> resumes
-- -> profiles. If :GL3's resume also belonged to :TC, deleting :TC would remove
-- the log through the resume_id path no matter what the user_id key does - and
-- the check would keep passing with the user_id constraint dropped altogether,
-- asserting a true statement it cannot fail on. Verified by mutation, not by
-- reasoning: with a :TC-owned parent the check passes with no user_id foreign
-- key; with :R1 as parent it fails, because :A survives and :R1 with it, so the
-- user_id hop is the only route by which :GL3 can disappear.
INSERT INTO public.cv_generation_logs (id, user_id, resume_id) VALUES (:'GL3', :'TC', :'R1');

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
-- of the script, because it mutates shared state: it adds one more auth.users
-- row and, through the trigger, one more public.profiles row, on top of the
-- identities the fixtures block seeds. Running it here folds that state into the
-- one baseline every later check sees, so no check can silently inherit
-- mid-script drift depending on where it happens to be appended.
--
-- Stated without a running total on purpose: an earlier revision said "a fourth
-- auth.users row" and went stale the moment the D3 fixtures added two more
-- identities. No check here depends on how many users exist, so the count was
-- only ever a maintenance liability.
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

-- ---------------------------------------------------------------------------
-- Finding M3: one updated_at trigger function.
--
-- Two catalog claims and five behavioural ones.
--
-- The catalog claims - the duplicate function is gone, and the cover_letters
-- trigger executes the survivor - are properties of pg_proc and pg_trigger, not
-- of what any end user may do, so they go through chk_db. The third catalog
-- check is the one that makes this story's title testable: it counts the
-- non-internal triggers in `public` that execute update_updated_at_column and
-- expects all five. It also pins the table set the behavioural checks below
-- must cover, so adding a sixth updated_at trigger without a matching
-- behavioural check makes this check fail rather than letting the gap pass
-- unnoticed.
--
-- The behavioural claims are claims about an owner updating their own row, so
-- they go through chk under the real `authenticated` role - never chk_db, which
-- would answer the same question as a privileged session and prove nothing
-- about the path a user actually takes.
--
-- WHY THESE ARE NOT WRITTEN AS "updated_at got bigger".
--
-- The whole script runs inside one transaction. PostgreSQL's now() returns the
-- transaction start time and does not advance within it, and the trigger body
-- is `NEW.updated_at = NOW()`. A fixture row inserted above already carries
-- updated_at = now() from its column default, so an update performed here
-- writes the value the row already holds. `updated_at > <value read before>`
-- would therefore be false even with a perfectly working trigger, and
-- `updated_at >= <value read before>` would be true even with no trigger at
-- all. Neither shape discriminates; both would be recording the clock, not the
-- trigger.
--
-- What the trigger actually guarantees is narrower and is testable without any
-- clock movement: whatever updated_at the statement supplies, the row ends up
-- with now(). So each check supplies a deliberately wrong value - a timestamp
-- from the year 2000, which the transaction clock can never equal - and asserts
-- through RETURNING that the stored value is now() instead.
--
-- The update and the assertion are one statement on purpose. A data-modifying
-- CTE returns the post-trigger row image, so the outer SELECT counts 1 exactly
-- when the trigger overwrote the sentinel and 0 when it did not. Splitting them
-- into an update check plus a separate read would let the read pass on a row the
-- update never matched. Fixture rows are private to this block, so the year-2000
-- write is unobservable elsewhere - and in the failing case, where the sentinel
-- survives, it is confined to a row nothing else reads.
--
-- Mutation-tested: dropping any of the five triggers turns the corresponding
-- check FAIL, with `0 row(s)` against an expected `1 row(s)`.
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk_db('update_cover_letters_updated_at','CATALOG','M3 duplicate function no longer exists',
  'SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ''public'' AND p.proname = ''update_cover_letters_updated_at''',0);

SELECT pg_temp.chk_db('cover_letters','CATALOG','M3 update trigger executes update_updated_at_column',
  'SELECT 1 FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_proc p ON p.oid = t.tgfoid
     JOIN pg_namespace pn ON pn.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND t.tgname = ''trigger_cover_letters_updated_at''
       AND n.nspname = ''public'' AND c.relname = ''cover_letters''
       AND pn.nspname = ''public'' AND p.proname = ''update_updated_at_column''',1);

SELECT pg_temp.chk_db('pg_trigger','CATALOG','M3 all five public triggers share one function',
  'SELECT 1 FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_proc p ON p.oid = t.tgfoid
     JOIN pg_namespace pn ON pn.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND n.nspname = ''public''
       AND pn.nspname = ''public'' AND p.proname = ''update_updated_at_column''',5);

SELECT pg_temp.chk('cover_letters','A','UPDATE','M3 own update sets updated_at to now()',:'A',
  format('WITH bumped AS (
            UPDATE public.cover_letters SET updated_at = TIMESTAMPTZ ''2000-01-01 00:00:00+00''
             WHERE id = %L RETURNING updated_at)
          SELECT 1 FROM bumped WHERE updated_at = now()',:'CL2'),1);

SELECT pg_temp.chk('resumes','A','UPDATE','M3 own update sets updated_at to now()',:'A',
  format('WITH bumped AS (
            UPDATE public.resumes SET updated_at = TIMESTAMPTZ ''2000-01-01 00:00:00+00''
             WHERE id = %L RETURNING updated_at)
          SELECT 1 FROM bumped WHERE updated_at = now()',:'R4'),1);

SELECT pg_temp.chk('job_applications','A','UPDATE','M3 own update sets updated_at to now()',:'A',
  format('WITH bumped AS (
            UPDATE public.job_applications SET updated_at = TIMESTAMPTZ ''2000-01-01 00:00:00+00''
             WHERE id = %L RETURNING updated_at)
          SELECT 1 FROM bumped WHERE updated_at = now()',:'JA2'),1);

SELECT pg_temp.chk('career_goals','A','UPDATE','M3 own update sets updated_at to now()',:'A',
  format('WITH bumped AS (
            UPDATE public.career_goals SET updated_at = TIMESTAMPTZ ''2000-01-01 00:00:00+00''
             WHERE id = %L RETURNING updated_at)
          SELECT 1 FROM bumped WHERE updated_at = now()',:'CG2'),1);

-- :C updates :C's own profile: same owner-scoped claim as the four above, on the
-- one table whose fixture had to be an identity rather than a row.
SELECT pg_temp.chk('profiles','C','UPDATE','M3 own update sets updated_at to now()',:'C',
  format('WITH bumped AS (
            UPDATE public.profiles SET updated_at = TIMESTAMPTZ ''2000-01-01 00:00:00+00''
             WHERE id = %L RETURNING updated_at)
          SELECT 1 FROM bumped WHERE updated_at = now()',:'C'),1);

-- ---------------------------------------------------------------------------
-- Finding D3: cv_generation_logs.user_id keys ownership to public.profiles.
--
-- Four claims: the catalog shape of the constraint, the behaviour that
-- distinguishes the new key from the old one, the owner's unchanged SELECT and
-- INSERT access, and the transitive cascade.
--
-- WHICH RUNNER, AND WHY.
--
-- The owner-access checks are claims about what an end user may do, so they go
-- through chk under the real `authenticated` role. Everything else here is
-- referential or catalog state - which table a constraint points at, whether a
-- row is physically present - so it goes through chk_db, for the same reason the
-- D2 cascade block does: a role-scoped read would answer "what can this role
-- see", making the verdict depend on the SELECT policy staying correct and
-- coupling this evidence to a policy it is not about.
--
-- The auth.users delete is chk_db because deleting an account is not a user-role
-- capability at all - neither `authenticated` nor `anon` is granted it. The
-- application performs it through the admin API. chk_db labels itself
-- `db:postgres`, so no row here can misrepresent itself as an end user.
--
-- THE CHECK THAT ACTUALLY DISCRIMINATES.
--
-- The catalog checks would catch the constraint being repointed, but a catalog
-- assertion only ever restates the migration. The insert against :NP is the
-- behavioural counterpart, and it is the one that fires: :NP exists in
-- auth.users and has no profiles row, so under the pre-migration key that insert
-- SUCCEEDS and this check reports `1 row(s)` against an expected `refused`.
-- Mutation-tested by repointing the constraint back at auth.users, which turns
-- it FAIL. A random UUID would not discriminate - it violates both keys.
--
-- WHAT IS NOT ASSERTED HERE.
--
-- The migration's orphan pre-check, which must abort rather than drop rows, has
-- no check in this file, and the omission is deliberate.
--
-- The reason is NOT that the guarded state is unreachable. It is perfectly
-- reachable here: DDL is transactional in PostgreSQL and this whole script
-- already runs inside BEGIN ... ROLLBACK, so a check could drop the constraint,
-- insert an orphan, exercise the guard and roll back with no lasting effect.
--
-- The reason is that this file has no way to invoke the real guard. A check
-- here would have to re-implement the orphan query that 006 already contains,
-- and a copy passes happily while the block it claims to cover is broken - a
-- worse failure mode than no check, because it reads as coverage. The only
-- alternative is to have this audit script execute a migration file, which is
-- not its role: it audits the state a migration produced, it does not run
-- migrations. So the guard is exercised where it can be invoked for real, by
-- \i-including 006 itself - see supabase/tests/d3-abort-path.sql.
-- ---------------------------------------------------------------------------
SELECT pg_temp.chk_db('cv_generation_logs','CATALOG','D3 user_id fkey references public.profiles(id)',
  'SELECT 1 FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace tn ON tn.oid = t.relnamespace
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
     WHERE c.conname = ''cv_generation_logs_user_id_fkey'' AND c.contype = ''f''
       AND tn.nspname = ''public'' AND t.relname = ''cv_generation_logs''
       AND rn.nspname = ''public'' AND rt.relname = ''profiles''
       AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                              WHERE attrelid = t.oid AND attname = ''user_id'')]
       AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
                               WHERE attrelid = rt.oid AND attname = ''id'')]',1);

SELECT pg_temp.chk_db('cv_generation_logs','CATALOG','D3 user_id fkey is ON DELETE CASCADE',
  'SELECT 1 FROM pg_constraint c
     WHERE c.conname = ''cv_generation_logs_user_id_fkey''
       AND c.conrelid = ''public.cv_generation_logs''::regclass
       AND c.confdeltype = ''c''',1);

SELECT pg_temp.chk_db('cv_generation_logs','INSERT','D3 log owned by an auth user with no profile is refused',
  format('INSERT INTO public.cv_generation_logs (user_id, resume_id) VALUES (%L,%L)',:'NP',:'R1'),-1);

-- Owner positive control. The isolation block above proves B cannot read A's log
-- or forge one owned by A; neither of those fires if the policies became
-- restrictive rather than over-permissive, because a policy that permits nothing
-- also returns 0 rows and refuses the forge. These two are the other half: they
-- fail if the SELECT or INSERT policy stops admitting the owner, which is the
-- regression a foreign-key swap could plausibly cause.
SELECT pg_temp.chk('cv_generation_logs','A','SELECT','D3 read own log',:'A',
  format('SELECT * FROM public.cv_generation_logs WHERE id=%L',:'GL'),1);

SELECT pg_temp.chk('cv_generation_logs','A','INSERT','D3 insert own log',:'A',
  format('INSERT INTO public.cv_generation_logs (id,user_id,resume_id) VALUES (%L,%L,%L)',
         :'GL2',:'A',:'R1'),1);

-- Transitive cascade: deleting an auth user must still remove its logs, now via
-- public.profiles rather than directly. This is the regression that would follow
-- from repointing the key at a parent whose own delete behaviour did not
-- cascade.
--
-- What each check carries, stated precisely, because an earlier revision of this
-- comment claimed more than the checks delivered. The profiles read asserts only
-- that the intermediate row is gone - it says nothing about cv_generation_logs
-- and would pass with no user_id foreign key at all. The load-bearing one is the
-- final check, and it is load-bearing only because :GL3's resume belongs to a
-- surviving user; see the fixture comment for why the other choice disarms it.
SELECT pg_temp.chk_db('cv_generation_logs','SELECT','D3 cascade fixture present before account delete',
  format('SELECT 1 FROM public.cv_generation_logs WHERE id=%L',:'GL3'),1);

SELECT pg_temp.chk_db('auth.users','DELETE','D3 delete the owning auth user',
  format('DELETE FROM auth.users WHERE id=%L',:'TC'),1);

SELECT pg_temp.chk_db('profiles','SELECT','D3 cascade removed the intermediate profile',
  format('SELECT 1 FROM public.profiles WHERE id=%L',:'TC'),0);

SELECT pg_temp.chk_db('cv_generation_logs','SELECT','D3 cascade removed the log transitively',
  format('SELECT 1 FROM public.cv_generation_logs WHERE id=%L',:'GL3'),0);

\echo ''
\echo '================ RLS AUDIT RESULTS ================'
SELECT seq, tbl, actor, op, intent, expected, actual, verdict FROM results ORDER BY seq;
\echo ''
\echo '================ SUMMARY ================'
SELECT verdict, count(*) FROM results GROUP BY verdict ORDER BY verdict;

ROLLBACK;
