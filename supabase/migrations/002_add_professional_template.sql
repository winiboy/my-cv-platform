-- Migration: Add 'professional' template option
-- Date: 2025-12-14
-- Description: Updates the CHECK constraint on resumes.template to include 'professional'

-- Drop the existing CHECK constraint
ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_template_check;

-- Add the new CHECK constraint with 'professional' included
ALTER TABLE public.resumes ADD CONSTRAINT resumes_template_check
  CHECK (template IN ('modern', 'classic', 'minimal', 'creative', 'professional'));

-- Optional: Update the comment on the column
COMMENT ON COLUMN public.resumes.template IS 'CV template type: modern, classic, minimal, creative, or professional';
