import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateCompletion, MODELS } from '@/lib/ai/client'
import { buildJobMatchAnalysisPrompt } from '@/lib/ai/prompts'
import type { JobMatchAnalysis } from '@/types/job-match'
import { ANONYMOUS_AI_CALLER, enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import { AI_TEXT_LIMITS, enforceJsonBodyLimit } from '@/lib/api/ai-input-limits'

/**
 * Zod schema for validating job match analysis request body.
 *
 * Enforces minimum content lengths to ensure meaningful analysis, and maximums
 * that bound what one anonymous request can cost at the AI provider. Both are
 * checked before any provider call.
 */
const JobMatchRequestSchema = z.object({
  resumeText: z
    .string()
    .min(200, 'Resume text must be at least 200 characters for meaningful analysis')
    .max(
      AI_TEXT_LIMITS.RESUME_TEXT,
      `Resume text must be at most ${AI_TEXT_LIMITS.RESUME_TEXT} characters`
    ),
  jobDescription: z
    .string()
    .min(100, 'Job description must be at least 100 characters')
    .max(
      AI_TEXT_LIMITS.JOB_DESCRIPTION,
      `Job description must be at most ${AI_TEXT_LIMITS.JOB_DESCRIPTION} characters`
    ),
  locale: z
    .enum(['en', 'fr', 'de', 'it'])
    .optional()
    .default('en'),
})

/**
 * POST /api/tools/match-resume-job
 *
 * Analyzes the match between a resume and job description.
 * Returns a structured analysis with match score, skill gaps, and recommendations.
 *
 * This is a public endpoint - no authentication required.
 */
export async function POST(request: NextRequest) {
  try {
    // This endpoint is anonymous and spends a paid provider account, so the
    // request is bounded and counted before anything else happens: the body
    // size from its declared length, then the caller's budget. Neither guard
    // reads the body and neither can reach the provider.
    const oversizedBody = enforceJsonBodyLimit(request)
    if (oversizedBody) {
      return oversizedBody
    }

    const throttled = await enforceAiRateLimit(request, ANONYMOUS_AI_CALLER)
    if (throttled) {
      return throttled
    }

    // Parse request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    // Validate input with Zod
    const validationResult = JobMatchRequestSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }))
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      )
    }

    const { resumeText, jobDescription, locale } = validationResult.data

    // Build the analysis prompt
    const prompt = buildJobMatchAnalysisPrompt({
      resumeText,
      jobDescription,
      locale,
    })

    // Call AI for analysis
    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      maxTokens: 2000,
      temperature: 0.3,
    })

    // Parse AI response as JSON
    let analysis: JobMatchAnalysis
    try {
      // Clean the response text - remove any markdown code blocks if present
      let responseText = result.text.trim()
      if (responseText.startsWith('```json')) {
        responseText = responseText.slice(7)
      } else if (responseText.startsWith('```')) {
        responseText = responseText.slice(3)
      }
      if (responseText.endsWith('```')) {
        responseText = responseText.slice(0, -3)
      }
      responseText = responseText.trim()

      analysis = JSON.parse(responseText) as JobMatchAnalysis
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError)
      console.error('Raw response:', result.text)
      return NextResponse.json(
        {
          error: 'Failed to parse analysis response',
          message: 'The AI returned an invalid response format',
        },
        { status: 500 }
      )
    }

    // Validate the analysis structure has required fields
    if (
      typeof analysis.matchScore !== 'number' ||
      analysis.matchScore < 0 ||
      analysis.matchScore > 100 ||
      !Array.isArray(analysis.matchedSkills) ||
      !Array.isArray(analysis.missingSkills) ||
      !Array.isArray(analysis.recommendations) ||
      !Array.isArray(analysis.strengths) ||
      typeof analysis.analyzedAt !== 'string'
    ) {
      console.error('Invalid analysis structure:', analysis)
      return NextResponse.json(
        {
          error: 'Invalid analysis structure',
          message: 'The analysis response is missing required fields',
        },
        { status: 500 }
      )
    }

    // Return success response
    return NextResponse.json({
      success: true,
      analysis,
    })
  } catch (error) {
    console.error('Error analyzing job match:', error)
    return NextResponse.json(
      {
        error: 'Failed to analyze job match',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
