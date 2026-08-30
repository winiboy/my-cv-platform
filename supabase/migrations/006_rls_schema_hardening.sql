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


-- ----------------------------------------------------------------------------
-- Finding D3 — key cv_generation_logs ownership to public.profiles.
--
-- 005_cv_generation_logs.sql pointed cv_generation_logs.user_id at
-- auth.users(id), while the other seven user-owned tables in `public` point at
-- public.profiles(id). One ownership root means joins, future policy work and
-- cascade reasoning all follow a single key path instead of two.
--
-- NET DELETE BEHAVIOUR IS UNCHANGED, which is why this is invisible to the
-- application. public.profiles.id itself is `REFERENCES auth.users(id) ON
-- DELETE CASCADE`, so deleting an auth user still removes its logs — now in two
-- hops (auth.users -> profiles -> cv_generation_logs) rather than one. The
-- reachable set is identical because profiles is 1:1 with auth.users and is
-- created by the on_auth_user_created trigger. Asserted, not assumed: the
-- transitive cascade has a regression check in supabase/tests/rls-audit.sql,
-- built so that the log it watches hangs off a resume owned by a *surviving*
-- user. cv_generation_logs reaches an account by two cascade paths - user_id
-- and resume_id -> resumes - and only that fixture choice isolates the one this
-- constraint controls.
--
-- The whole section is one DO block so the swap is atomic under any caller. A
-- bare DROP followed by a bare ADD would, if the ADD failed outside a
-- transaction, leave the column with no foreign key at all — a silent widening
-- of what user_id may hold. Inside a DO block the ADD's failure rolls the DROP
-- back with it, so the outcome is always either the old constraint or the new
-- one, never neither.
--
-- The swap is unconditional rather than guarded on the current state, so it
-- converges on this definition from any starting point: pointing at auth.users,
-- pointing at profiles already, or missing entirely. Re-applying revalidates the
-- table, which is the cost of that convergence and is negligible at this table's
-- size. DROP ... IF EXISTS makes the pair idempotent (FR-2).
--
-- WHY THE ORPHAN PRE-CHECK EXISTS.
--
-- ADD CONSTRAINT already refuses to create a foreign key that existing rows
-- violate, so the pre-check is not what makes this safe — PostgreSQL's own
-- validation is. What the pre-check adds is a *legible* failure. The built-in
-- error reports "violates foreign key constraint" and names one offending row;
-- it does not tell the operator how many rows are affected, which decision they
-- are facing, or that this migration is deliberately declining to make it for
-- them. Repointing an ownership key is exactly the situation where a terse
-- referential error invites someone to reach for a DELETE.
--
-- So the count is taken first and, if it is non-zero, the migration stops before
-- touching the constraint. It never deletes, reassigns or otherwise resolves the
-- orphans: FR-3 forbids destructive data change, and choosing between creating
-- the missing profile, reassigning the log and discarding it is a data decision
-- this PRD does not authorize. Stopping leaves the database exactly as it was.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.cv_generation_logs l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = l.user_id
  );

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'public.cv_generation_logs has % row(s) whose user_id has no matching public.profiles row; cannot repoint cv_generation_logs_user_id_fkey at public.profiles(id)',
      orphan_count
      USING
        ERRCODE = 'foreign_key_violation',
        DETAIL  = 'Migration 006 (finding D3) stopped before altering the constraint. No row was deleted, reassigned or modified, and the existing foreign key is intact.',
        HINT    = 'List the affected owners with: SELECT DISTINCT user_id FROM public.cv_generation_logs l WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = l.user_id); Then decide per owner - create the missing profiles row, reassign the log, or delete it - record that decision, and re-run this migration once the query returns no rows.';
  END IF;

  ALTER TABLE public.cv_generation_logs
    DROP CONSTRAINT IF EXISTS cv_generation_logs_user_id_fkey;

  ALTER TABLE public.cv_generation_logs
    ADD CONSTRAINT cv_generation_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
END $$;
