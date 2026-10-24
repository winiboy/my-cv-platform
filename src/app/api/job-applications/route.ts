/**
 * Job Applications API Route
 * GET: Fetches user's saved job applications for linking to cover letters
 * POST: Creates a new job application (saves a job from job search)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  createJobApplicationWithDedupe,
  jobApplicationCreateSchema,
} from '@/lib/job-applications/create-job-application'

export const dynamic = 'force-dynamic'

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
    // Include records where is_archived is false OR null (null = not yet set)
    const { data: jobApplications, error } = await supabase
      .from('job_applications')
      .select('id, company_name, job_title, job_url, status, created_at')
      .eq('user_id', user.id)
      .or('is_archived.eq.false,is_archived.is.null')
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
      console.log('[job-applications POST] user:', 'NO USER', 'authError:', authError?.message || 'none')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[job-applications POST] user:', user.id)

    // Ensure profile exists before insert (defensive check)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      console.log('[job-applications POST] Profile missing, creating for user:', user.id)
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: user.id, email: user.email || '' })

      if (profileError) {
        console.error('[job-applications POST] Failed to create profile:', profileError)
        return NextResponse.json(
          { error: 'Failed to initialize user profile' },
          { status: 500 }
        )
      }
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

    const result = await createJobApplicationWithDedupe(supabase, user.id, validationResult.data)

    if (result.kind === 'duplicate') {
      return NextResponse.json(
        {
          error: 'Job already saved',
          jobApplication: result.existing,
          isDuplicate: true,
        },
        { status: 409 }
      )
    }

    if (result.kind === 'failed') {
      const { error } = result
      console.error('[job-applications POST] insert error:', error)
      console.error('[API] Error creating job application:', {
        code: error.code,
        message: error.message,
        details: error.details,
        userId: user.id,
      })
      return NextResponse.json(
        { error: 'Failed to save job application', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { jobApplication: result.jobApplication, message: 'Job saved successfully' },
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
