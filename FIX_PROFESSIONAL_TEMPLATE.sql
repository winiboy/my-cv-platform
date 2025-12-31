-- 🔧 QUICK FIX: Add 'professional' template support
-- Copy and paste this SQL into your Supabase SQL Editor

-- Step 1: Drop the existing CHECK constraint
ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_template_check;

-- Step 2: Add the new CHECK constraint with 'professional' included
ALTER TABLE public.resumes ADD CONSTRAINT resumes_template_check
  CHECK (template IN ('modern', 'classic', 'minimal', 'creative', 'professional'));

-- Step 3: Verify the constraint was added
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'resumes_template_check';

-- You should see:
-- resumes_template_check | CHECK ((template IN ('modern', 'classic', 'minimal', 'creative', 'professional')))
