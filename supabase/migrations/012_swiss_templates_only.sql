-- Migration: Keep only the ten Swiss CV templates
-- Date: 2026-11-25
-- PRD: tasks/prds/swiss-templates-only-page-fidelity.md (US-001, FR-1, FR-2)
-- Description: Remaps every row that still holds one of the five legacy
-- template identifiers to a Swiss template, then narrows the CHECK constraint
-- and the column default of resumes.template to the ten Swiss identifiers.
--
-- The remap is fixed by FR-2:
--   professional -> swissTrades
--   modern       -> swissEngineering
--   classic      -> swissFinance
--   minimal      -> swissVocational
--   creative     -> swissFirstJob
--
-- Only resumes.template changes. update_resumes_updated_at (001) would stamp
-- updated_at = NOW() on every remapped row, which would reorder each user's
-- resume list by "last edited" for an edit the user never made. The trigger is
-- therefore disabled around the UPDATE alone and re-enabled immediately.
-- This is safe because a migration runs in one transaction and
-- ALTER TABLE ... DISABLE TRIGGER takes a SHARE ROW EXCLUSIVE lock on
-- public.resumes that is held until COMMIT. That lock conflicts with the
-- ROW EXCLUSIVE lock every INSERT, UPDATE and DELETE takes, so no other
-- session can write a row while the trigger is off (reads are not blocked);
-- and if any statement fails the whole migration, the trigger state included,
-- rolls back.
--
-- The UPDATE runs before the constraint is narrowed, so the new constraint is
-- validated against rows that already hold only Swiss identifiers.
--
-- Rollback: the remap is not reversible row by row (a swissTrades row may have
-- been professional or chosen directly). To restore the previous schema
-- contract, re-run the two constraint statements and the COMMENT of
-- 011_add_swiss_cv_templates.sql, and
-- ALTER TABLE public.resumes ALTER COLUMN template SET DEFAULT 'modern'.

ALTER TABLE public.resumes DISABLE TRIGGER update_resumes_updated_at;

UPDATE public.resumes
SET template = CASE template
  WHEN 'professional' THEN 'swissTrades'
  WHEN 'modern' THEN 'swissEngineering'
  WHEN 'classic' THEN 'swissFinance'
  WHEN 'minimal' THEN 'swissVocational'
  WHEN 'creative' THEN 'swissFirstJob'
END
WHERE template IN ('professional', 'modern', 'classic', 'minimal', 'creative');

ALTER TABLE public.resumes ENABLE TRIGGER update_resumes_updated_at;

ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_template_check;

ALTER TABLE public.resumes ADD CONSTRAINT resumes_template_check
  CHECK (template IN (
    'swissVocational',
    'swissCommerce',
    'swissTrades',
    'swissHealth',
    'swissFinance',
    'swissEngineering',
    'swissIt',
    'swissExecutive',
    'swissAcademic',
    'swissFirstJob'
  ));

ALTER TABLE public.resumes ALTER COLUMN template SET DEFAULT 'swissCommerce';

COMMENT ON COLUMN public.resumes.template IS 'CV template type: one of the ten Swiss templates (swissVocational, swissCommerce, swissTrades, swissHealth, swissFinance, swissEngineering, swissIt, swissExecutive, swissAcademic, swissFirstJob); default swissCommerce';
