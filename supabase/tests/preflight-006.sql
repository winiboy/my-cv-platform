-- Pre-flight check for migration 006 (RLS and schema hardening).
--
-- Answers one question before you deploy: would 006 apply cleanly against
-- THIS database, or would it abort?
--
-- 006 refuses to repoint cv_generation_logs_user_id_fkey when any log row's
-- user_id has no matching public.profiles row. That guard has only ever run
-- against a local database that is empty by construction, so the orphan
-- condition has never been evaluated against real data. This script evaluates
-- it, and reports what else 006 will change, without changing anything.
--
-- THIS SCRIPT IS READ-ONLY. It opens no transaction, creates no fixture, and
-- issues no DDL or DML. Unlike everything else in supabase/tests/, it is safe
-- to run against a deployed environment - that is its entire purpose.
--
-- Run against a hosted database:
--
--   psql "$DATABASE_URL" -f supabase/tests/preflight-006.sql
--
-- or from the Supabase dashboard SQL editor, which is the route that needs no
-- connection string and no local tooling.
--
-- Against the local stack:
--
--   docker exec -i supabase_db_my-cv-platform \
--     psql -U postgres -d postgres -f - < supabase/tests/preflight-006.sql
--
-- Exit code is always 0. Read the VERDICT column; do not infer from the exit
-- status, which reports only whether the query ran.

\pset pager off
\timing off

\echo ''
\echo '=== 1. Has 006 already been applied here? ==================================='

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class c  ON c.oid = con.conrelid
      JOIN pg_class rc ON rc.oid = con.confrelid
      JOIN pg_namespace rn ON rn.oid = rc.relnamespace
      WHERE c.relname = 'cv_generation_logs'
        AND con.conname = 'cv_generation_logs_user_id_fkey'
        AND rn.nspname = 'public' AND rc.relname = 'profiles'
    ) THEN 'ALREADY APPLIED - the D3 key already points at public.profiles'
    ELSE 'NOT YET APPLIED - the D3 key still points at auth.users'
  END AS state;

\echo ''
\echo '=== 2. THE BLOCKER: orphaned cv_generation_logs rows ========================'
\echo '    Zero means 006 applies cleanly. Any other number means it ABORTS,'
\echo '    deliberately, and each owner needs a decision before you retry.'
\echo ''

SELECT
  count(*) AS orphan_rows,
  count(DISTINCT l.user_id) AS distinct_orphan_owners,
  CASE
    WHEN count(*) = 0 THEN 'CLEAR - 006 will not abort on this check'
    ELSE 'BLOCKED - 006 will abort and change nothing'
  END AS verdict
FROM public.cv_generation_logs l
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = l.user_id
);

\echo ''
\echo '--- If BLOCKED, these are the owners needing a decision --------------------'
\echo '    Per owner: create the missing profiles row, reassign the log, or'
\echo '    delete it. 006 will not choose for you, and must not.'
\echo '    An empty result here is the healthy case.'
\echo ''

SELECT
  l.user_id                                              AS orphan_owner,
  count(*)                                               AS log_rows,
  min(l.created_at)                                      AS earliest,
  max(l.created_at)                                      AS latest,
  EXISTS (SELECT 1 FROM auth.users u WHERE u.id = l.user_id) AS still_in_auth_users
FROM public.cv_generation_logs l
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = l.user_id
)
GROUP BY l.user_id
ORDER BY count(*) DESC
LIMIT 50;

\echo ''
\echo '=== 3. Related integrity, for context ======================================='
\echo '    Not blockers for 006. A non-zero auth users without a profile row is'
\echo '    how orphans are created in the first place, so it is worth knowing.'
\echo ''

SELECT
  (SELECT count(*) FROM public.cv_generation_logs)                       AS total_log_rows,
  (SELECT count(*) FROM auth.users)                                      AS auth_users,
  (SELECT count(*) FROM public.profiles)                                 AS profile_rows,
  (SELECT count(*) FROM auth.users u
     WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)) AS auth_users_without_profile;

\echo ''
\echo '=== 4. What else 006 will change ============================================'
\echo '    Each row shows the current state. See the expected-after column for'
\echo '    what 006 sets it to. Nothing here can block the migration.'
\echo ''

SELECT 'S2  handle_new_user search_path' AS finding,
       COALESCE(
         (SELECT array_to_string(p.proconfig, ', ')
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'),
         '(not set - mutable)') AS current_state,
       'search_path=public, pg_temp' AS expected_after
UNION ALL
SELECT 'D2  resume_analyses DELETE policy',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          WHERE c.relname = 'resume_analyses' AND p.polcmd = 'd')
       THEN 'present' ELSE '(absent - owners cannot delete)' END,
       'present'
UNION ALL
SELECT 'M3  cover_letters updated_at trigger',
       COALESCE(
         (SELECT pr.proname FROM pg_trigger t
            JOIN pg_class c  ON c.oid = t.tgrelid
            JOIN pg_proc  pr ON pr.oid = t.tgfoid
           WHERE c.relname = 'cover_letters' AND NOT t.tgisinternal
           LIMIT 1),
         '(none)'),
       'update_updated_at_column'
UNION ALL
SELECT 'S1  UPDATE policies missing WITH CHECK',
       (SELECT count(*)::text FROM pg_policy p
          JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND p.polcmd = 'w' AND p.polwithcheck IS NULL),
       '0';

\echo ''
\echo '=== 5. Structural baseline, to compare after deploying ======================'
\echo ''

SELECT
  (SELECT count(*) FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity)          AS rls_enabled_tables,
  (SELECT count(*) FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public')                               AS policies;

\echo ''
\echo '=== READ SECTION 2 BEFORE DEPLOYING. Nothing was modified. ================='
\echo ''
