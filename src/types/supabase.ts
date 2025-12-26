/**
 * Supabase Database Types
 *
 * Auto-generated types for type-safe database queries
 * These types match the schema defined in supabase/migrations/001_initial_schema.sql
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          plan: 'free' | 'premium'
          plan_expires_at: string | null
          credits: number
          preferred_locale: 'fr' | 'de' | 'en'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          plan?: 'free' | 'premium'
          plan_expires_at?: string | null
          credits?: number
          preferred_locale?: 'fr' | 'de' | 'en'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          plan?: 'free' | 'premium'
          plan_expires_at?: string | null
          credits?: number
          preferred_locale?: 'fr' | 'de' | 'en'
          created_at?: string
          updated_at?: string
        }
      }
      resumes: {
        Row: {
          id: string
          user_id: string
          title: string
          template: 'modern' | 'classic' | 'minimal' | 'creative' | 'professional'
          contact: Json
          summary: string | null
          experience: Json
          education: Json
          skills: Json
          languages: Json
          certifications: Json
          projects: Json
          custom_sections: Json
          is_default: boolean
          is_public: boolean
          public_slug: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          template?: 'modern' | 'classic' | 'minimal' | 'creative'
          contact?: Json
          summary?: string | null
          experience?: Json
          education?: Json
          skills?: Json
          languages?: Json
          certifications?: Json
          projects?: Json
          custom_sections?: Json
          is_default?: boolean
          is_public?: boolean
          public_slug?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          template?: 'modern' | 'classic' | 'minimal' | 'creative'
          contact?: Json
          summary?: string | null
          experience?: Json
          education?: Json
          skills?: Json
          languages?: Json
          certifications?: Json
          projects?: Json
          custom_sections?: Json
          is_default?: boolean
          is_public?: boolean
          public_slug?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      resume_analyses: {
        Row: {
          id: string
          user_id: string
          resume_id: string | null
          overall_score: number | null
          ats_score: number | null
          category_scores: Json
          recommendations: Json
          job_description: string | null
          matched_keywords: Json
          missing_keywords: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          resume_id?: string | null
          overall_score?: number | null
          ats_score?: number | null
          category_scores?: Json
          recommendations?: Json
          job_description?: string | null
          matched_keywords?: Json
          missing_keywords?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          resume_id?: string | null
          overall_score?: number | null
          ats_score?: number | null
          category_scores?: Json
          recommendations?: Json
          job_description?: string | null
          matched_keywords?: Json
          missing_keywords?: Json
          created_at?: string
        }
      }
      job_applications: {
        Row: {
          id: string
          user_id: string
          company_name: string
          job_title: string
          job_url: string | null
          location: string | null
          salary_range: string | null
          job_description: string | null
          status: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'accepted' | 'declined'
          priority: 'low' | 'medium' | 'high'
          applied_date: string | null
          deadline: string | null
          notes: string | null
          contacts: Json
          documents: Json
          interviews: Json
          resume_id: string | null
          is_archived: boolean
          color_tag: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_name: string
          job_title: string
          job_url?: string | null
          location?: string | null
          salary_range?: string | null
          job_description?: string | null
          status?: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'accepted' | 'declined'
          priority?: 'low' | 'medium' | 'high'
          applied_date?: string | null
          deadline?: string | null
          notes?: string | null
          contacts?: Json
          documents?: Json
          interviews?: Json
          resume_id?: string | null
          is_archived?: boolean
          color_tag?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_name?: string
          job_title?: string
          job_url?: string | null
          location?: string | null
          salary_range?: string | null
          job_description?: string | null
          status?: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'accepted' | 'declined'
          priority?: 'low' | 'medium' | 'high'
          applied_date?: string | null
          deadline?: string | null
          notes?: string | null
          contacts?: Json
          documents?: Json
          interviews?: Json
          resume_id?: string | null
          is_archived?: boolean
          color_tag?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      career_goals: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          category: 'skill' | 'position' | 'salary' | 'networking' | 'education' | 'project' | 'other' | null
          target_date: string | null
          progress: number
          status: 'active' | 'completed' | 'abandoned' | 'on_hold'
          milestones: Json
          resources: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          category?: 'skill' | 'position' | 'salary' | 'networking' | 'education' | 'project' | 'other' | null
          target_date?: string | null
          progress?: number
          status?: 'active' | 'completed' | 'abandoned' | 'on_hold'
          milestones?: Json
          resources?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          category?: 'skill' | 'position' | 'salary' | 'networking' | 'education' | 'project' | 'other' | null
          target_date?: string | null
          progress?: number
          status?: 'active' | 'completed' | 'abandoned' | 'on_hold'
          milestones?: Json
          resources?: Json
          created_at?: string
          updated_at?: string
        }
      }
      ai_suggestions: {
        Row: {
          id: string
          user_id: string
          suggestion_type: 'resume_improvement' | 'cover_letter' | 'linkedin_headline' | 'linkedin_summary' | 'job_match' | 'interview_prep' | 'skill_recommendation'
          context: Json | null
          suggestion_content: string
          is_applied: boolean
          is_favorite: boolean
          rating: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          suggestion_type: 'resume_improvement' | 'cover_letter' | 'linkedin_headline' | 'linkedin_summary' | 'job_match' | 'interview_prep' | 'skill_recommendation'
          context?: Json | null
          suggestion_content: string
          is_applied?: boolean
          is_favorite?: boolean
          rating?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          suggestion_type?: 'resume_improvement' | 'cover_letter' | 'linkedin_headline' | 'linkedin_summary' | 'job_match' | 'interview_prep' | 'skill_recommendation'
          context?: Json | null
          suggestion_content?: string
          is_applied?: boolean
          is_favorite?: boolean
          rating?: number | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
