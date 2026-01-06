import { NextRequest, NextResponse } from 'next/server'
import { adaptResumeToJobDescription } from '@/lib/ai/transformations'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { CVAdaptationRequest, CVAdaptationResponse } from '@/types/cv-adaptation'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: CVAdaptationRequest = await request.json()
    const { resumeId, jobDescription, jobTitle, company, locale } = body

    // Validate inputs
    if (!resumeId || typeof resumeId !== 'string') {
      return NextResponse.json(
        { error: 'resumeId is required and must be a string' },
        { status: 400 }
      )
    }

    if (!jobDescription || typeof jobDescription !== 'string') {
      return NextResponse.json(
        { error: 'jobDescription is required and must be a string' },
        { status: 400 }
      )
    }

    if (jobDescription.trim().length < 100) {
      return NextResponse.json(
        {
          error:
            'Job description is too short. Please provide at least 100 characters for accurate CV adaptation.',
        },
        { status: 400 }
      )
    }

    if (!jobTitle || typeof jobTitle !== 'string') {
      return NextResponse.json(
        { error: 'jobTitle is required and must be a string' },
        { status: 400 }
      )
    }

    // Fetch resume from database (with user_id check for security)
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .eq('user_id', user.id) // Ensure user owns this resume
      .single()

    if (resumeError || !resume) {
      console.error('Error fetching resume:', resumeError)
      return NextResponse.json(
        { error: 'Resume not found or you do not have permission to access it' },
        { status: 404 }
      )
    }

    // Call AI transformation
    const result = await adaptResumeToJobDescription({
      currentResume: resume,
      jobDescription: jobDescription.trim(),
      jobTitle: jobTitle.trim(),
      company: company?.trim() || jobTitle.trim(), // Fallback to jobTitle if company not provided
      locale: locale || 'en',
    })

    // Return success response
    const response: CVAdaptationResponse = {
      success: true,
      patch: result.patch,
      tokensUsed: result.tokensUsed,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error adapting resume to job description:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to adapt resume',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
