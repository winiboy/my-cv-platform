-- Migration: Cover Letters Table
-- Creates the cover_letters table with RLS policies for secure user-scoped access

-- Create cover_letters table
CREATE TABLE IF NOT EXISTS public.cover_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'Untitled Cover Letter',
    recipient_name TEXT,
    recipient_title TEXT,
    company_name TEXT,
    company_address TEXT,
    greeting TEXT NOT NULL DEFAULT 'Dear Hiring Manager,',
    opening_paragraph TEXT,
    body_paragraphs JSONB NOT NULL DEFAULT '[]'::jsonb,
    closing_paragraph TEXT,
    sign_off TEXT NOT NULL DEFAULT 'Sincerely,',
    sender_name TEXT,
    job_title TEXT,
    job_description TEXT,
    template TEXT NOT NULL DEFAULT 'modern' CHECK (template = 'modern'),
    analysis_score INTEGER CHECK (analysis_score IS NULL OR (analysis_score >= 0 AND analysis_score <= 100)),
    analysis_results JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster user queries
CREATE INDEX IF NOT EXISTS idx_cover_letters_user_id ON public.cover_letters(user_id);

-- Create index for resume relationship
CREATE INDEX IF NOT EXISTS idx_cover_letters_resume_id ON public.cover_letters(resume_id);

-- Create index for updated_at (for ordering by recent)
CREATE INDEX IF NOT EXISTS idx_cover_letters_updated_at ON public.cover_letters(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only SELECT their own cover letters
CREATE POLICY "Users can view their own cover letters"
    ON public.cover_letters
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Users can only INSERT cover letters for themselves
CREATE POLICY "Users can create their own cover letters"
    ON public.cover_letters
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only UPDATE their own cover letters
CREATE POLICY "Users can update their own cover letters"
    ON public.cover_letters
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only DELETE their own cover letters
CREATE POLICY "Users can delete their own cover letters"
    ON public.cover_letters
    FOR DELETE
    USING (auth.uid() = user_id);

-- Add trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cover_letters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cover_letters_updated_at
    BEFORE UPDATE ON public.cover_letters
    FOR EACH ROW
    EXECUTE FUNCTION update_cover_letters_updated_at();

-- Comment on table
COMMENT ON TABLE public.cover_letters IS 'Stores user cover letters with RLS for secure access';
