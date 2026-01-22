/**
 * Job Applications API Route
 * Fetches user's saved job applications for linking to cover letters
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
    console.error('[API] Unexpected error in job-applications route:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
