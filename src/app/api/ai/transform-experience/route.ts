import { NextRequest, NextResponse } from 'next/server'
import { transformExperience } from '@/lib/ai/transformations'
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
    const { position, company, description, achievements } = body

    if (!position || typeof position !== 'string') {
      return NextResponse.json(
        { error: 'position is required and must be a string' },
        { status: 400 }
      )
    }

    // Ceilings on everything that reaches the prompt: without them the cost of
    // a single request is whatever the caller chooses to upload. The
    // achievements array is bounded in item count as well as per-item length.
    const oversized = findOversizedField(body, {
      position: AI_TEXT_LIMITS.SHORT_LABEL,
      company: AI_TEXT_LIMITS.SHORT_LABEL,
      description: AI_TEXT_LIMITS.DESCRIPTION,
      achievements: {
        maxCharacters: AI_TEXT_LIMITS.BULLET,
        maxItems: AI_LIST_LIMITS.ACHIEVEMENTS,
      },
    })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

    // Transform the experience using AI
    const result = await transformExperience({
      position,
      company,
      description,
      achievements,
    })

    return NextResponse.json({
      success: true,
      transformedAchievements: result.transformedAchievements,
      count: result.count,
      tokensUsed: result.tokensUsed,
    })
  } catch (error) {
    console.error('Error transforming experience:', error)
    return NextResponse.json(
      {
        error: 'Failed to transform experience',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
