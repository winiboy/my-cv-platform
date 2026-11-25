-- Migration: Add the ten Swiss CV template identifiers
-- Date: 2026-11-18
-- PRD: tasks/prds/swiss-cv-templates.md (US-001)
-- Description: Widens the CHECK constraint on resumes.template so it accepts the
-- ten Swiss template identifiers alongside the five existing ones. No row is
-- read or written, and no other part of the schema changes.
--
-- The constraint lists all fifteen identifiers even though only
-- 'swissVocational' is offered by the application in US-001: the template set
-- is a schema contract, widened once here, while each remaining template is
-- offered by the application in its own story.
--
-- Rollback: after confirming no row holds one of the ten new identifiers,
-- re-run both statements of 002_add_professional_template.sql: its CHECK
-- constraint and its COMMENT ON COLUMN public.resumes.template.

ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_template_check;

ALTER TABLE public.resumes ADD CONSTRAINT resumes_template_check
  CHECK (template IN (
    'modern',
    'classic',
    'minimal',
    'creative',
    'professional',
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

COMMENT ON COLUMN public.resumes.template IS 'CV template type: modern, classic, minimal, creative, professional, or one of the ten Swiss templates (swissVocational, swissCommerce, swissTrades, swissHealth, swissFinance, swissEngineering, swissIt, swissExecutive, swissAcademic, swissFirstJob)';
