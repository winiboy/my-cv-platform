/**
 * Resume Cover Letters API Route
 * GET: List all cover letters linked to a specific resume
 *
 * This endpoint returns cover letters that have been associated with the given resume.
 * The user must own the resume to access its linked cover letters (enforced via RLS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: resumeId } = await params
    const supabase = await createServerSupabaseClient()

    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // First verify the user owns this resume
    // RLS should handle this, but explicit check provides clearer error message
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('id')
      .eq('id', resumeId)
      .eq('user_id', user.id)
      .single()

    if (resumeError || !resume) {
      return NextResponse.json(
        { error: 'Resume not found' },
        { status: 404 }
      )
    }

    // Fetch cover letters linked to this resume
    // RLS ensures we only get cover letters owned by the authenticated user
    const { data: coverLetters, error } = await supabase
      .from('cover_letters')
      .select('id, title, company_name, job_title, updated_at')
      .eq('resume_id', resumeId)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching cover letters for resume:', error)
      return NextResponse.json(
        { error: 'Failed to fetch cover letters' },
        { status: 500 }
      )
    }

    return NextResponse.json({ coverLetters: coverLetters || [] })
  } catch (error) {
    console.error('Error in resume cover letters GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
