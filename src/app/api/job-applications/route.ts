/**
 * Job Applications API Route
 * GET: Fetches user's saved job applications for linking to cover letters
 * POST: Creates a new job application (saves a job from job search)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * Zod schema for job application creation from job search
 * Maps job search data to job_applications table fields
 */
const jobApplicationCreateSchema = z.object({
  job_title: z.string().min(1, 'Job title is required').max(255),
  company_name: z.string().min(1, 'Company name is required').max(255),
  location: z.string().max(500).nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  job_url: z.string().url().max(2000).nullable().optional(),
  job_description: z.string().max(50000).nullable().optional(),
  source: z.string().max(100).nullable().optional(),
})

/**
 * GET /api/job-applications
 * Returns list of user's saved job applications with essential fields for display
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch user's job applications with essential fields for cover letter linking
    const { data: jobApplications, error } = await supabase
      .from('job_applications')
      .select('id, company_name, job_title, job_url, status, created_at')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[API] Error fetching job applications:', error)
      return NextResponse.json(
        { error: 'Failed to fetch job applications' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      jobApplications: jobApplications || [],
    })
  } catch (error) {
    console.error('[API] Unexpected error in job-applications GET:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/job-applications
 * Creates a new job application record from job search results
 * Used when user clicks "Track" or "Save" on a job listing
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = jobApplicationCreateSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      )
    }

    const {
      job_title,
      company_name,
      location,
      salary_min,
      salary_max,
      job_url,
      job_description,
      source,
    } = validationResult.data

    // Format salary range if provided
    let salaryRange: string | null = null
    if (salary_min !== null && salary_min !== undefined && salary_max !== null && salary_max !== undefined) {
      salaryRange = `${salary_min.toLocaleString('de-CH')} - ${salary_max.toLocaleString('de-CH')} CHF`
    } else if (salary_min !== null && salary_min !== undefined) {
      salaryRange = `From ${salary_min.toLocaleString('de-CH')} CHF`
    } else if (salary_max !== null && salary_max !== undefined) {
      salaryRange = `Up to ${salary_max.toLocaleString('de-CH')} CHF`
    }

    // Check if this job URL already exists for this user (prevent duplicates)
    if (job_url) {
      const { data: existingJob } = await supabase
        .from('job_applications')
        .select('id')
        .eq('user_id', user.id)
        .eq('job_url', job_url)
        .single()

      if (existingJob) {
        return NextResponse.json(
          {
            error: 'Job already saved',
            jobApplication: existingJob,
            isDuplicate: true,
          },
          { status: 409 }
        )
      }
    }

    // Create the job application record
    const { data: jobApplication, error } = await supabase
      .from('job_applications')
      .insert({
        user_id: user.id,
        job_title,
        company_name,
        location: location || null,
        salary_range: salaryRange,
        job_url: job_url || null,
        job_description: job_description || null,
        status: 'saved',
        priority: 'medium',
        notes: source ? `Source: ${source}` : null,
        contacts: [],
        documents: [],
        interviews: [],
        is_archived: false,
      })
      .select()
      .single()

    if (error) {
      console.error('[API] Error creating job application:', {
        code: error.code,
        message: error.message,
        details: error.details,
      })
      return NextResponse.json(
        { error: 'Failed to save job application', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { jobApplication, message: 'Job saved successfully' },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Unexpected error in job-applications POST:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
