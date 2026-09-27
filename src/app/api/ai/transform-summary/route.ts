import { NextRequest, NextResponse } from 'next/server'
import { transformSummary } from '@/lib/ai/transformations'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import {
  AI_LIST_LIMITS,
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

    // This request spends the project's AI provider account. The budget is
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
    const { rawSummary, currentRole, yearsOfExperience, topSkills, locale } = body

    if (!rawSummary || typeof rawSummary !== 'string') {
      return NextResponse.json(
        { error: 'rawSummary is required and must be a string' },
        { status: 400 }
      )
    }

    // Ceilings on everything that reaches the prompt: without them the cost of
    // a single request is whatever the caller chooses to upload.
    // yearsOfExperience is listed even though the prompt builder declares it a
    // number, because that declaration is compile-time only -- the parsed body
    // is untrusted, and a string sent in that field is interpolated into the
    // prompt like any other.
    const oversized = findOversizedField(body, {
      rawSummary: AI_TEXT_LIMITS.SUMMARY,
      currentRole: AI_TEXT_LIMITS.SHORT_LABEL,
      yearsOfExperience: AI_TEXT_LIMITS.SHORT_LABEL,
      topSkills: { maxCharacters: AI_TEXT_LIMITS.SKILL, maxItems: AI_LIST_LIMITS.SKILLS },
    })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

    // Transform the summary using AI
    const result = await transformSummary({
      rawSummary,
      currentRole,
      yearsOfExperience,
      topSkills,
      locale,
    })

    return NextResponse.json({
      success: true,
      transformedSummary: result.transformedSummary,
      wordCount: result.wordCount,
      tokensUsed: result.tokensUsed,
    })
  } catch (error) {
    console.error('Error transforming summary:', error)
    return NextResponse.json(
      {
        error: 'Failed to transform summary',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
