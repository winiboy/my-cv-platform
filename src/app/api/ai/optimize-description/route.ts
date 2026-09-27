import { NextRequest, NextResponse } from 'next/server'
import { optimizeDescription } from '@/lib/ai/transformations'
import { createServerSupabaseClient } from '@/lib/supabase/server'
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
    const { text, context, locale } = body

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return NextResponse.json(
        { error: 'text is required and must be at least 10 characters' },
        { status: 400 }
      )
    }

    // Ceilings on everything that reaches the prompt: without them the cost of
    // a single request is whatever the caller chooses to upload.
    const oversized = findOversizedField(body, {
      text: AI_TEXT_LIMITS.DESCRIPTION,
      context: AI_TEXT_LIMITS.LIST_ITEM,
    })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

    // Optimize the description using AI
    const result = await optimizeDescription({
      text,
      context,
      locale,
    })

    return NextResponse.json({
      success: true,
      optimizedText: result.optimizedText,
      tokensUsed: result.tokensUsed,
    })
  } catch (error) {
    console.error('Error optimizing description:', error)
    return NextResponse.json(
      {
        error: 'Failed to optimize description',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
