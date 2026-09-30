-- ============================================================================
-- 009_adopt_swiss_localities.sql
--
-- Adopts public.swiss_localities into version control, and narrows the
-- over-broad table grant it carries.
--
-- This table PREDATES this migration. It was created directly against the
-- production project -- outside version control, with no migration describing
-- it -- and populated by hand from the swisstopo locality register (the
-- swiss_localities/ helper in this repository only builds the CSV; nothing has
-- ever loaded it programmatically). It is live and load-bearing:
-- src/lib/supabase-localities.ts resolves a job's canton from it on the job
-- search path.
--
-- So this file ADOPTS rather than creates. Every statement is idempotent
-- because the file has to apply cleanly to two different starting states: to
-- production, where all of these objects already exist, and to a fresh database
-- built from migrations alone, where none of them do. It must never drop,
-- truncate or recreate the table -- production holds real reference data that
-- exists nowhere else in this repository in loadable form.
--
-- The second job is the security fix. The table arrived with write privileges
-- granted to anon and authenticated, because Supabase's default privileges on
-- the public schema grant ALL to the client roles and a table created through
-- the dashboard picks them up silently. RLS is enabled with a single SELECT
-- policy, which does block INSERT, UPDATE and DELETE -- there is no policy for
-- them, so row security denies them. TRUNCATE is the hole: it is a table-level
-- privilege and row security does not apply to it, so any holder of the anon
-- key could empty this table and no policy would ever see the statement. The
-- application only ever reads, so the grant is narrowed to match: SELECT and
-- nothing else.
--
-- Once deployed this file is frozen; a later correction gets its own forward
-- migration.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The table.
--
-- Shape is copied verbatim from production, down to the identity clause and the
-- constraint name, because the point of adopting a table is that `db diff`
-- stops reporting it. A single differing keyword -- integer for bigint, BY
-- DEFAULT for ALWAYS, an implicit constraint name -- would leave the drift in
-- place and this file would have failed at its one job.
--
-- Caveat worth knowing rather than discovering: CREATE TABLE IF NOT EXISTS does
-- not verify that the table it finds matches the definition below. Against
-- production this is a no-op whatever the real shape is. What proves the two
-- agree is a `db diff --linked` run, not this statement.
--
-- The two *_normalized columns are the match keys. The consumer lowercases and
-- strips accents from an external provider's city string (src/lib/
-- location-normalizer.ts) and compares against locality_normalized; canton_
-- normalized carries the same treatment for the canton filter.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swiss_localities (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  locality text NOT NULL,
  canton text NOT NULL,
  locality_normalized text NOT NULL,
  canton_normalized text NOT NULL,
  CONSTRAINT swiss_localities_pkey PRIMARY KEY (id)
);


-- ----------------------------------------------------------------------------
-- Match indexes.
--
-- Both lookups in src/lib/supabase-localities.ts filter on a normalized
-- column, and the table is a few thousand rows of static reference data read on
-- every job search, so both are worth their maintenance cost. The prefix
-- fallback (ilike 'x%') does not use the locality index as written -- a
-- case-insensitive match needs a different operator class -- but the exact-match
-- path, which is the common one, does.
--
-- Names are production's, for the same drift reason as the table above.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_swiss_localities_canton_norm
  ON public.swiss_localities USING btree (canton_normalized);

CREATE INDEX IF NOT EXISTS idx_swiss_localities_locality_norm
  ON public.swiss_localities USING btree (locality_normalized);


-- ----------------------------------------------------------------------------
-- Row security.
--
-- This is public reference data -- the Swiss locality register, published by
-- swisstopo -- so world-readable is correct and intended, not an oversight.
-- There is deliberately no INSERT, UPDATE or DELETE policy: with RLS on, an
-- operation with no policy is denied, so the absence of those three policies is
-- what makes the table read-only to anything holding a client key.
--
-- DROP before CREATE because CREATE POLICY has no IF NOT EXISTS form, and
-- because it makes the definition below authoritative rather than
-- whatever-is-already-there. Both statements run inside the migration's
-- transaction, so no reader sees the table unprotected.
-- ----------------------------------------------------------------------------
ALTER TABLE public.swiss_localities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read swiss localities" ON public.swiss_localities;

CREATE POLICY "read swiss localities" ON public.swiss_localities
  FOR SELECT TO PUBLIC USING (true);


-- ----------------------------------------------------------------------------
-- The grant, narrowed.
--
-- REVOKE ALL then GRANT SELECT, rather than revoking the six write privileges
-- by name. Naming them would mean naming MAINTAIN, which only exists from
-- PostgreSQL 17, so the file would fail on an older server and would still miss
-- any privilege a future version adds. REVOKE ALL is version-portable, says
-- what is meant -- the client roles hold nothing except what the next line
-- grants -- and is idempotent on re-application.
--
-- postgres and service_role keep their privileges untouched. service_role is
-- the server-side key used for the administrative work of loading and
-- refreshing this register, and postgres owns the table; narrowing either would
-- break maintenance without closing any client-reachable hole, since neither
-- key is ever exposed to the browser.
--
-- This is the statement that actually closes the TRUNCATE hole described in the
-- header. Removing the TRUNCATE privilege is the only way to close it: no
-- policy can be written that covers TRUNCATE.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.swiss_localities FROM anon, authenticated;

GRANT SELECT ON TABLE public.swiss_localities TO anon, authenticated;
