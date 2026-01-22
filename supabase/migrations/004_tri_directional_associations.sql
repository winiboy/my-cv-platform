-- Migration: 004_tri_directional_associations.sql
-- Tri-directional associations between resumes, cover_letters, and job_applications

-- Add job_application_id to resumes for resume-job association
ALTER TABLE public.resumes
ADD COLUMN IF NOT EXISTS job_application_id UUID REFERENCES public.job_applications(id) ON DELETE SET NULL;

-- Add job_application_id to cover_letters for cover letter-job association
ALTER TABLE public.cover_letters
ADD COLUMN IF NOT EXISTS job_application_id UUID REFERENCES public.job_applications(id) ON DELETE SET NULL;

-- Add cover_letter_id to job_applications for job-cover letter reverse lookup
ALTER TABLE public.job_applications
ADD COLUMN IF NOT EXISTS cover_letter_id UUID REFERENCES public.cover_letters(id) ON DELETE SET NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_resumes_job_application_id ON public.resumes(job_application_id);
CREATE INDEX IF NOT EXISTS idx_cover_letters_job_application_id ON public.cover_letters(job_application_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_cover_letter_id ON public.job_applications(cover_letter_id);
