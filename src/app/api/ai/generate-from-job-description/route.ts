import { NextRequest, NextResponse } from 'next/server'
import { generateResumeFromJobDescription } from '@/lib/ai/transformations'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractJobRequirements } from '@/lib/ai/job-requirements-extractor'
import { calculateRelevanceScore, type ResumeContent } from '@/lib/ai/relevance-scorer'
import { QUALITY_THRESHOLD } from '@/lib/constants'
import type { ResumeInsert } from '@/types/database'
import type { QualityAnalysis } from '@/types/quality-analysis'
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import {
  AI_TEXT_LIMITS,
  enforceJsonBodyLimit,
  findOversizedField,
  oversizedFieldResponse,
} from '@/lib/api/ai-input-limits'

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

    // This request spends the project's AI provider account -- three times over,
    // since it also extracts requirements and scores relevance. The budget is
    // keyed by the authenticated user, so it is counted once the identity is
    // known and cannot be reset by changing address.
    const throttled = await enforceAiRateLimit(request, { kind: 'user', userId: user.id })
    if (throttled) {
      return throttled
    }

    const oversizedBody = enforceJsonBodyLimit(request)
    if (oversizedBody) {
      return oversizedBody
    }

    // Parse request body
    const body = await request.json()
    const { jobDescription, title, template, locale } = body

    // Ceilings on everything that reaches the prompt: without them the cost of
    // a single request is whatever the caller chooses to upload.
    const oversized = findOversizedField(body, {
      jobDescription: AI_TEXT_LIMITS.JOB_DESCRIPTION,
      title: AI_TEXT_LIMITS.SHORT_LABEL,
    })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

    // Validate inputs
    if (!jobDescription || typeof jobDescription !== 'string') {
      return NextResponse.json(
        { error: 'jobDescription is required and must be a string' },
        { status: 400 }
      )
    }

    if (jobDescription.trim().length < 50) {
      return NextResponse.json(
        { error: 'Job description is too short. Please provide a complete job description.' },
        { status: 400 }
      )
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'title is required and must be a string' },
        { status: 400 }
      )
    }

    const validTemplates = ['modern', 'classic', 'minimal', 'creative', 'professional']
    if (!template || !validTemplates.includes(template)) {
      return NextResponse.json(
        { error: 'Invalid template. Must be one of: modern, classic, minimal, creative, professional' },
        { status: 400 }
      )
    }

    // Generate resume content using AI
    const result = await generateResumeFromJobDescription({
      jobDescription: jobDescription.trim(),
      locale: locale || 'en',
    })

    // Create resume in database
    const newResume = {
      user_id: user.id,
      title: title.trim(),
      template,
      contact: {},
      summary: result.resumeData.summary || '',
      experience: result.resumeData.experience || [],
      education: [],
      skills: result.resumeData.skills || [],
      languages: [],
      certifications: [],
      projects: result.resumeData.projects || [],
      custom_sections: [],
      is_default: false,
      is_public: false,
    } as const

    const result2: any = await (supabase
      .from('resumes')
      .insert(newResume as any)
      .select()
      .single())

    if (result2.error) {
      console.error('Error creating resume:', result2.error)
      return NextResponse.json(
        { error: 'Failed to create resume in database' },
        { status: 500 }
      )
    }

    // Extract job requirements and calculate quality analysis
    let qualityAnalysis: QualityAnalysis | null = null

    try {
      const requirements = await extractJobRequirements(
        jobDescription.trim(),
        locale || 'en'
      )

      // Convert the saved resume to ResumeContent format for scoring
      const resumeContent: ResumeContent = {
        summary: result.resumeData.summary || null,
        contact: {},
        experience: result.resumeData.experience || [],
        education: [],
        skills: result.resumeData.skills || [],
        projects: result.resumeData.projects || [],
        certifications: [],
      }

      const relevanceScore = calculateRelevanceScore(resumeContent, requirements)

      qualityAnalysis = {
        score: relevanceScore.score,
        matchedItems: relevanceScore.matchedItems,
        missingItems: relevanceScore.missingItems,
        genericItems: relevanceScore.genericItems,
        isInsufficient: relevanceScore.score < QUALITY_THRESHOLD,
        iteration: 1,
      }
    } catch (analysisError) {
      // Quality analysis is non-blocking - log error but don't fail the request
      console.error('Error calculating quality analysis:', analysisError)
    }

    return NextResponse.json({
      success: true,
      resumeId: result2.data.id,
      tokensUsed: result.tokensUsed,
      qualityAnalysis,
    })
  } catch (error) {
    console.error('Error generating resume from job description:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate resume',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
