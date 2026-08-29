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


-- ----------------------------------------------------------------------------
-- Finding D2 — give resume_analyses owners an explicit DELETE policy.
--
-- 001_initial_schema.sql gave resume_analyses SELECT and INSERT policies but no
-- DELETE, so an owner's delete matched no policy and affected 0 rows: analyses
-- were append-only from the user's side and removable only by cascade from the
-- parent resume. Every other user-owned table in that migration grants DELETE
-- to its owner, so the omission is treated as an oversight and closed here.
--
-- USING mirrors the SELECT policy exactly. DELETE takes no WITH CHECK — there
-- is no post-image row to validate — so USING alone is the whole predicate, and
-- it restricts the delete to rows the caller already owns.
--
-- DROP ... IF EXISTS then CREATE, because CREATE POLICY has no OR REPLACE and
-- ALTER POLICY would fail when the policy is absent. The pair is idempotent and
-- converges on this definition whatever the starting state.
--
-- Cascade deletion from public.resumes is untouched: the ON DELETE CASCADE on
-- resume_analyses.resume_id is enforced by the constraint's internal referential
-- trigger, which does not consult row-level policies.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own analyses" ON public.resume_analyses;

CREATE POLICY "Users can delete own analyses"
  ON public.resume_analyses FOR DELETE
  USING (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- Finding M3 — collapse two identical updated_at trigger functions into one.
--
-- 001_initial_schema.sql defined public.update_updated_at_column(), and
-- 003_cover_letters.sql defined public.update_cover_letters_updated_at() with an
-- equivalent body: `NEW.updated_at = NOW(); RETURN NEW;`. Four of the five
-- updated_at triggers in `public` already execute the first; cover_letters is
-- the only caller of the second. Two copies of one behaviour is a maintenance
-- hazard, not a behavioural difference, so the duplicate is removed and its one
-- trigger repointed at the shared function. Timestamp maintenance is unchanged
-- on every table, which is why this is invisible to the application.
--
-- Order is load-bearing. Dropping update_cover_letters_updated_at() while
-- trigger_cover_letters_updated_at still executes it would be refused outright,
-- or — with CASCADE — would silently take the trigger with it and leave
-- cover_letters without updated_at maintenance. The trigger is therefore
-- repointed first, and the function dropped only once nothing references it.
--
-- The drop is deliberately written without CASCADE. If some dependent this
-- migration does not know about still exists, the statement must fail loudly
-- rather than quietly remove it.
--
-- Dropping a now-unreferenced function is not the destructive change FR-3
-- forbids: no column is dropped and no row is deleted. Criterion 1 of this
-- story requires the function to be gone.
--
-- PostgreSQL has no ALTER TRIGGER ... EXECUTE FUNCTION, so repointing means
-- replacing the trigger. DROP ... IF EXISTS then CREATE mirrors the idiom used
-- for the policy above and is idempotent: re-applying converges on this
-- definition from any starting state, including one where the trigger already
-- executes the shared function and the duplicate is already gone.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_cover_letters_updated_at ON public.cover_letters;

CREATE TRIGGER trigger_cover_letters_updated_at
  BEFORE UPDATE ON public.cover_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP FUNCTION IF EXISTS public.update_cover_letters_updated_at();
