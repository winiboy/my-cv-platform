-- ============================================
-- INITIAL SCHEMA FOR CV PLATFORM (TealHQ Clone)
-- ============================================
-- Description: Complete database schema with RLS policies
-- Tables: profiles, resumes, resume_analyses, job_applications, career_goals, ai_suggestions
-- Author: Generated for my-cv-platform
-- Date: 2025-12-12
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
-- Stores additional user profile information
-- Links to Supabase Auth users via foreign key

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,

  -- Subscription info
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  plan_expires_at TIMESTAMP WITH TIME ZONE,
  credits INTEGER DEFAULT 0,

  -- Preferences
  preferred_locale TEXT DEFAULT 'en' CHECK (preferred_locale IN ('fr', 'de', 'en')),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_plan ON public.profiles(plan);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- RESUMES TABLE
-- ============================================
-- Stores user CVs with all sections in JSONB format

CREATE TABLE IF NOT EXISTS public.resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Basic info
  title TEXT NOT NULL DEFAULT 'Untitled Resume',
  template TEXT DEFAULT 'modern' CHECK (template IN ('modern', 'classic', 'minimal', 'creative', 'professional')),

  -- Resume content (JSONB for flexibility)
  contact JSONB DEFAULT '{}'::jsonb,
  -- Example: {"name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "location": "Paris, France", "linkedin": "linkedin.com/in/johndoe"}

  summary TEXT,
  -- Professional summary/objective

  experience JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"company": "TechCorp", "position": "Senior Developer", "startDate": "2020-01", "endDate": "2023-12", "current": false, "description": "Led team of 5 developers...", "achievements": ["Increased performance by 40%", "Migrated to microservices"]}]

  education JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"school": "University of Paris", "degree": "Master in Computer Science", "startDate": "2015-09", "endDate": "2017-06", "description": "Specialized in AI and Machine Learning"}]

  skills JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"category": "Programming", "items": ["JavaScript", "TypeScript", "Python", "React"]}, {"category": "Tools", "items": ["Git", "Docker", "AWS"]}]

  languages JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"language": "English", "level": "Native"}, {"language": "French", "level": "Professional"}]

  certifications JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"name": "AWS Solutions Architect", "issuer": "Amazon", "date": "2023-01", "url": "https://..."}]

  projects JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"name": "E-commerce Platform", "description": "Built scalable platform with React and Node.js", "url": "https://github.com/...", "technologies": ["React", "Node.js", "MongoDB"]}]

  custom_sections JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"title": "Publications", "content": "Published 3 papers on ML..."}]

  -- Metadata
  is_default BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  public_slug TEXT UNIQUE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_resumes_user_id ON public.resumes(user_id);
CREATE INDEX idx_resumes_is_default ON public.resumes(user_id, is_default);
CREATE INDEX idx_resumes_public_slug ON public.resumes(public_slug) WHERE public_slug IS NOT NULL;

-- RLS Policies
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own resumes"
  ON public.resumes FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create own resumes"
  ON public.resumes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resumes"
  ON public.resumes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own resumes"
  ON public.resumes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RESUME ANALYSES TABLE
-- ============================================
-- Stores AI analysis results for resumes

CREATE TABLE IF NOT EXISTS public.resume_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE CASCADE,

  -- Analysis scores
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  ats_score INTEGER CHECK (ats_score >= 0 AND ats_score <= 100),

  -- Detailed scores by category (JSONB)
  category_scores JSONB DEFAULT '{}'::jsonb,
  -- Example: {"formatting": 85, "keywords": 70, "impact": 90, "brevity": 75, "sections": 95}

  -- Recommendations (JSONB array)
  recommendations JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"category": "keywords", "priority": "high", "message": "Add more technical keywords related to your field", "suggestions": ["React", "Node.js", "AWS"]}, {"category": "formatting", "priority": "medium", "message": "Consider using bullet points for achievements"}]

  -- Job description used for analysis (optional)
  job_description TEXT,
  matched_keywords JSONB DEFAULT '[]'::jsonb,
  missing_keywords JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_resume_analyses_user_id ON public.resume_analyses(user_id);
CREATE INDEX idx_resume_analyses_resume_id ON public.resume_analyses(resume_id);
CREATE INDEX idx_resume_analyses_created_at ON public.resume_analyses(created_at DESC);

-- RLS Policies
ALTER TABLE public.resume_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses"
  ON public.resume_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own analyses"
  ON public.resume_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- JOB APPLICATIONS TABLE
-- ============================================
-- Job application tracking system

CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Job details
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_url TEXT,
  location TEXT,
  salary_range TEXT,
  job_description TEXT,

  -- Application tracking
  status TEXT DEFAULT 'saved' CHECK (status IN ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'accepted', 'declined')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),

  applied_date DATE,
  deadline DATE,

  -- Notes and documents
  notes TEXT,

  contacts JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"name": "Jane Smith", "email": "jane@company.com", "role": "Hiring Manager", "notes": "Very friendly, mentioned they need someone ASAP"}]

  documents JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"name": "Cover Letter", "url": "https://...", "type": "cover_letter"}, {"name": "Portfolio", "url": "https://...", "type": "portfolio"}]

  -- Interview tracking
  interviews JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"date": "2024-01-15T14:00:00Z", "type": "phone_screen", "interviewer": "Jane Smith", "notes": "Discussed technical background", "outcome": "positive"}]

  -- Resume used for this application
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,

  -- Metadata
  is_archived BOOLEAN DEFAULT false,
  color_tag TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_job_applications_user_id ON public.job_applications(user_id);
CREATE INDEX idx_job_applications_status ON public.job_applications(user_id, status);
CREATE INDEX idx_job_applications_priority ON public.job_applications(user_id, priority);
CREATE INDEX idx_job_applications_deadline ON public.job_applications(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_job_applications_archived ON public.job_applications(user_id, is_archived);

-- RLS Policies
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own applications"
  ON public.job_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own applications"
  ON public.job_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
  ON public.job_applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications"
  ON public.job_applications FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- CAREER GOALS TABLE
-- ============================================
-- Career planning and goal tracking

CREATE TABLE IF NOT EXISTS public.career_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('skill', 'position', 'salary', 'networking', 'education', 'project', 'other')),

  target_date DATE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'on_hold')),

  -- Milestones (JSONB array)
  milestones JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"title": "Complete React course", "date": "2024-02-01", "completed": true, "notes": "Finished Udemy course"}, {"title": "Build portfolio project", "date": "2024-03-15", "completed": false}]

  -- Resources and notes
  resources JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"type": "course", "title": "Advanced React Patterns", "url": "https://..."}, {"type": "book", "title": "Clean Code"}]

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_career_goals_user_id ON public.career_goals(user_id);
CREATE INDEX idx_career_goals_status ON public.career_goals(user_id, status);
CREATE INDEX idx_career_goals_target_date ON public.career_goals(target_date) WHERE target_date IS NOT NULL;

-- RLS Policies
ALTER TABLE public.career_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goals"
  ON public.career_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own goals"
  ON public.career_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
  ON public.career_goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
  ON public.career_goals FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- AI SUGGESTIONS TABLE
-- ============================================
-- Cache for AI-generated suggestions

CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN (
    'resume_improvement',
    'cover_letter',
    'linkedin_headline',
    'linkedin_summary',
    'job_match',
    'interview_prep',
    'skill_recommendation'
  )),

  -- Context used to generate suggestion (JSONB)
  context JSONB,
  -- Example: {"resume_id": "uuid", "job_description": "text", "user_profile": {...}}

  suggestion_content TEXT NOT NULL,

  -- Metadata
  is_applied BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ai_suggestions_user_id ON public.ai_suggestions(user_id);
CREATE INDEX idx_ai_suggestions_type ON public.ai_suggestions(user_id, suggestion_type);
CREATE INDEX idx_ai_suggestions_created_at ON public.ai_suggestions(created_at DESC);

-- RLS Policies
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own suggestions"
  ON public.ai_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own suggestions"
  ON public.ai_suggestions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own suggestions"
  ON public.ai_suggestions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own suggestions"
  ON public.ai_suggestions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function: Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_career_goals_updated_at
  BEFORE UPDATE ON public.career_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auto-create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SEED DATA (Optional - for development)
-- ============================================
-- Uncomment to add sample data

-- INSERT INTO public.profiles (id, email, full_name, plan) VALUES
--   ('00000000-0000-0000-0000-000000000001', 'demo@example.com', 'Demo User', 'premium');

-- ============================================
-- SCHEMA COMPLETE
-- ============================================
-- Tables created: 6
-- RLS policies: 24
-- Triggers: 5
-- Functions: 2
