/**
 * CV Generation Logs Utility
 *
 * Provides functions for logging CV generation attempts for audit purposes.
 * Uses the cv_generation_logs table created in migration 005.
 */

import { createServerSupabaseClient } from './server'
import type { Json } from '@/types/supabase'

/**
 * Represents a gap identified during CV generation analysis.
 * Gaps indicate missing skills, keywords, or other content that could
 * improve the CV's match score against a job description.
 */
export interface GenerationGap {
  type: 'skill' | 'keyword' | 'experience' | 'education' | 'certification' | 'other'
  description: string
}

/**
 * Parameters required to log a CV generation attempt.
 */
export interface GenerationLogParams {
  /** The ID of the user who initiated the generation */
  userId: string
  /** The ID of the resume being generated or adapted */
  resumeId: string
  /** Optional external job ID (e.g., from Adzuna) or internal job_application ID */
  jobId?: string | null
  /** Match score between 0-100 indicating how well the CV matches the job */
  score?: number | null
  /** Array of identified gaps between the CV and job requirements */
  gaps?: GenerationGap[] | null
  /** Iteration number for multi-pass generation (starts at 1) */
  iteration?: number
}

/**
 * Logs a CV generation attempt for audit purposes.
 *
 * This function is designed to be non-blocking and fail-safe.
 * Errors are logged to the console but never thrown, ensuring
 * the main generation flow is not interrupted by logging failures.
 *
 * @param params - The generation log parameters
 * @returns Promise that resolves when logging is complete (or fails silently)
 */
export async function logGenerationAttempt(params: GenerationLogParams): Promise<void> {
  const {
    userId,
    resumeId,
    jobId = null,
    score = null,
    gaps = null,
    iteration = 1,
  } = params

  try {
    const supabase = await createServerSupabaseClient()

    // Note: cv_generation_logs table is created in migration 005 but types are not regenerated yet
    // Using type assertion to bypass Supabase type checking until types are regenerated
    const { error } = await (supabase as unknown as {
      from: (table: string) => {
        insert: (data: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
      }
    })
      .from('cv_generation_logs')
      .insert({
        user_id: userId,
        resume_id: resumeId,
        job_id: jobId,
        score,
        gaps: gaps as Json,
        iteration,
      })

    if (error) {
      // Log error but do not throw - generation logging should not block main flow
      console.error('[generation-logs] Failed to insert generation log:', error.message)
    }
  } catch (err) {
    // Catch any unexpected errors (network issues, client creation failures, etc.)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generation-logs] Unexpected error logging generation attempt:', errorMessage)
  }
}
