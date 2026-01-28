-- Migration: 005_cv_generation_logs.sql
-- CV generation logs for auditing AI-powered CV creation/adaptation

-- ============================================
-- CV_GENERATION_LOGS TABLE
-- ============================================
-- Stores CV generation analysis results for auditing purposes
-- Tracks iterations, scores, and identified gaps during CV generation

CREATE TABLE IF NOT EXISTS public.cv_generation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  job_id TEXT,

  -- Analysis results
  score INTEGER CHECK (score >= 0 AND score <= 100),
  gaps JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"type": "skill", "description": "Missing Python experience"}, {"type": "keyword", "description": "No mention of Agile methodology"}]

  -- Iteration tracking
  iteration INTEGER NOT NULL DEFAULT 1 CHECK (iteration >= 1),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cv_generation_logs_user_id ON public.cv_generation_logs(user_id);
CREATE INDEX idx_cv_generation_logs_resume_id ON public.cv_generation_logs(resume_id);
CREATE INDEX idx_cv_generation_logs_job_id ON public.cv_generation_logs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_cv_generation_logs_created_at ON public.cv_generation_logs(created_at DESC);

-- RLS Policies
ALTER TABLE public.cv_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generation logs"
  ON public.cv_generation_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own generation logs"
  ON public.cv_generation_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
