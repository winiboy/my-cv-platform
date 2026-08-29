-- ============================================================================
-- 006_rls_schema_hardening.sql
--
-- Forward migration for the Phase 26 RLS / schema hardening work.
--
-- It carries the remediations for the findings recorded in
-- docs/engineering/rls-audit.md. Every change here is additive or in-place:
-- no row is deleted, no column is dropped, RLS stays enabled on all eight
-- public tables and the policy count never decreases.
--
-- Re-applying this file against an already-migrated database must be a no-op,
-- so every statement is written to be idempotent wherever PostgreSQL allows it.
--
-- Sections are appended in user-story order. This file stays open for appending
-- until all five Phase 26 stories have landed, and must not be deployed to any
-- environment before then. Once deployed it is frozen: a later correction gets
-- its own forward migration.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Finding S2 — pin the search_path of handle_new_user().
--
-- The signup trigger function is SECURITY DEFINER, so it executes with the
-- definer's rights while resolving unqualified names through the *caller's*
-- search_path. Pinning search_path removes the caller's influence over what
-- the elevated body actually executes; pg_temp is listed last so a temporary
-- object can never shadow a public one.
--
-- CREATE OR REPLACE, not DROP + CREATE: DROP FUNCTION would cascade to the
-- on_auth_user_created trigger on auth.users. Replacing in place leaves the
-- trigger, its OID and its attachment untouched. The body is carried over
-- unchanged from 001_initial_schema.sql, so signup behaviour is identical.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$;
