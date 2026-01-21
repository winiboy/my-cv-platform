/**
 * Application-level database types
 *
 * These types extend the Supabase types with application-specific models
 */

import type { Database } from './supabase'

// Alias for convenience
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

// Type aliases for each table
export type Profile = Tables<'profiles'>
export type Resume = Tables<'resumes'>
export type ResumeAnalysis = Tables<'resume_analyses'>
export type JobApplication = Tables<'job_applications'>
export type CareerGoal = Tables<'career_goals'>
export type AISuggestion = Tables<'ai_suggestions'>
export type CoverLetter = Tables<'cover_letters'>

// Insert types
export type ProfileInsert = TablesInsert<'profiles'>
export type ResumeInsert = TablesInsert<'resumes'>
export type ResumeAnalysisInsert = TablesInsert<'resume_analyses'>
export type JobApplicationInsert = TablesInsert<'job_applications'>
export type CareerGoalInsert = TablesInsert<'career_goals'>
export type AISuggestionInsert = TablesInsert<'ai_suggestions'>
export type CoverLetterInsert = TablesInsert<'cover_letters'>

// Update types
export type ProfileUpdate = TablesUpdate<'profiles'>
export type ResumeUpdate = TablesUpdate<'resumes'>
export type ResumeAnalysisUpdate = TablesUpdate<'resume_analyses'>
export type JobApplicationUpdate = TablesUpdate<'job_applications'>
export type CareerGoalUpdate = TablesUpdate<'career_goals'>
export type AISuggestionUpdate = TablesUpdate<'ai_suggestions'>
export type CoverLetterUpdate = TablesUpdate<'cover_letters'>

// Structured types for JSONB fields

export interface ResumeContact {
  name?: string
  email?: string
  phone?: string
  location?: string
  linkedin?: string
  github?: string
  website?: string
  visible?: boolean // Control visibility in CV
  [key: string]: string | boolean | undefined
}

export interface ResumeExperience {
  company: string
  position: string
  startDate: string
  endDate?: string
  current: boolean
  location?: string
  description?: string
  achievements?: string[]
  visible?: boolean // Control visibility in CV (default: true)
}

export interface ResumeEducation {
  school: string
  degree: string
  field?: string
  startDate: string
  endDate?: string
  gpa?: string
  description?: string
  achievements?: string[]
  visible?: boolean // Control visibility in CV (default: true)
}

export interface ResumeSkillCategory {
  category: string
  items: string[] // Legacy: array of skill names (kept for backward compatibility)
  skillsHtml?: string // Rich text HTML content for skills
  visible?: boolean // Control visibility in CV (default: true)
}

export interface ResumeLanguage {
  language: string
  level: 'Native' | 'Fluent' | 'Professional' | 'Intermediate' | 'Basic'
  visible?: boolean // Control visibility in CV (default: true)
}

export interface ResumeCertification {
  name: string
  issuer: string
  date: string
  expiryDate?: string
  credentialId?: string
  url?: string
  visible?: boolean // Control visibility in CV (default: true)
}

export interface ResumeProject {
  name: string
  description: string
  url?: string
  startDate?: string
  endDate?: string
  technologies?: string[]
  visible?: boolean // Control visibility in CV (default: true)
}

export interface CustomSection {
  title: string
  content: string
}

export interface AnalysisRecommendation {
  category: string
  priority: 'low' | 'medium' | 'high'
  message: string
  suggestions?: string[]
}

export interface JobContact {
  name: string
  email?: string
  phone?: string
  role?: string
  notes?: string
}

export interface JobDocument {
  name: string
  url: string
  type: 'resume' | 'cover_letter' | 'portfolio' | 'other'
  uploadedAt?: string
}

export interface JobInterview {
  date: string
  type: 'phone_screen' | 'technical' | 'behavioral' | 'final' | 'other'
  interviewer?: string
  notes?: string
  outcome?: 'positive' | 'neutral' | 'negative'
}

export interface CareerGoalMilestone {
  title: string
  date?: string
  completed: boolean
  notes?: string
}

export interface CareerGoalResource {
  type: 'course' | 'book' | 'article' | 'video' | 'other'
  title: string
  url?: string
  notes?: string
}

// Cover Letter Analysis type
export interface CoverLetterAnalysis {
  score: number
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  keywordCoverage: number
  matchedKeywords: string[]
  missingKeywords: string[]
}

// Enums
export type UserPlan = Profile['plan']
export type ResumeTemplate = Resume['template']
export type CoverLetterTemplate = CoverLetter['template']
export type JobStatus = JobApplication['status']
export type JobPriority = JobApplication['priority']
export type GoalStatus = CareerGoal['status']
export type GoalCategory = NonNullable<CareerGoal['category']>
export type SuggestionType = AISuggestion['suggestion_type']
export type Locale = Profile['preferred_locale']

// Extended types for bidirectional CV-Cover Letter associations

/**
 * Cover letter with optional linked resume information
 * Used when fetching cover letters that may be associated with a resume
 */
export interface CoverLetterWithResume extends CoverLetter {
  resume: {
    id: string
    title: string
  } | null
}

/**
 * Resume with optional linked cover letters array
 * Used when fetching resumes with their associated cover letters
 */
export interface ResumeWithCoverLetters extends Resume {
  cover_letters?: Array<{
    id: string
    title: string
    company_name: string | null
    job_title: string | null
    updated_at: string
  }>
}
