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

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
        Relationships: []
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
          job_application_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          template?: 'modern' | 'classic' | 'minimal' | 'creative' | 'professional'
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
          job_application_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          template?: 'modern' | 'classic' | 'minimal' | 'creative' | 'professional'
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
          job_application_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'resumes_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'resumes_job_application_id_fkey'
            columns: ['job_application_id']
            isOneToOne: false
            referencedRelation: 'job_applications'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'resume_analyses_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'resume_analyses_resume_id_fkey'
            columns: ['resume_id']
            isOneToOne: false
            referencedRelation: 'resumes'
            referencedColumns: ['id']
          }
        ]
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
          cover_letter_id: string | null
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
          cover_letter_id?: string | null
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
          cover_letter_id?: string | null
          is_archived?: boolean
          color_tag?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'job_applications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'job_applications_resume_id_fkey'
            columns: ['resume_id']
            isOneToOne: false
            referencedRelation: 'resumes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'job_applications_cover_letter_id_fkey'
            columns: ['cover_letter_id']
            isOneToOne: false
            referencedRelation: 'cover_letters'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'career_goals_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'ai_suggestions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      cover_letters: {
        Row: {
          id: string
          user_id: string
          resume_id: string | null
          job_application_id: string | null
          title: string
          recipient_name: string | null
          recipient_title: string | null
          company_name: string | null
          company_address: string | null
          greeting: string
          opening_paragraph: string | null
          body_paragraphs: Json
          closing_paragraph: string | null
          sign_off: string
          sender_name: string | null
          job_title: string | null
          job_description: string | null
          template: 'modern'
          analysis_score: number | null
          analysis_results: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          resume_id?: string | null
          job_application_id?: string | null
          title?: string
          recipient_name?: string | null
          recipient_title?: string | null
          company_name?: string | null
          company_address?: string | null
          greeting?: string
          opening_paragraph?: string | null
          body_paragraphs?: Json
          closing_paragraph?: string | null
          sign_off?: string
          sender_name?: string | null
          job_title?: string | null
          job_description?: string | null
          template?: 'modern'
          analysis_score?: number | null
          analysis_results?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          resume_id?: string | null
          job_application_id?: string | null
          title?: string
          recipient_name?: string | null
          recipient_title?: string | null
          company_name?: string | null
          company_address?: string | null
          greeting?: string
          opening_paragraph?: string | null
          body_paragraphs?: Json
          closing_paragraph?: string | null
          sign_off?: string
          sender_name?: string | null
          job_title?: string | null
          job_description?: string | null
          template?: 'modern'
          analysis_score?: number | null
          analysis_results?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cover_letters_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cover_letters_resume_id_fkey'
            columns: ['resume_id']
            isOneToOne: false
            referencedRelation: 'resumes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cover_letters_job_application_id_fkey'
            columns: ['job_application_id']
            isOneToOne: false
            referencedRelation: 'job_applications'
            referencedColumns: ['id']
          }
        ]
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
