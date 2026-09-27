import { NextRequest, NextResponse } from 'next/server'
import { translateSummary } from '@/lib/ai/transformations'
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
    const { summary, targetLanguage, sourceLanguage } = body

    // Ceiling on the only field that reaches the prompt at length.
    // targetLanguage and sourceLanguage cannot: both are mapped through a fixed
    // language table below and in the prompt builder, never interpolated raw.
    const oversized = findOversizedField(body, { summary: AI_TEXT_LIMITS.SUMMARY })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

    if (!summary || typeof summary !== 'string') {
      return NextResponse.json(
        { error: 'summary is required and must be a string' },
        { status: 400 }
      )
    }

    if (!targetLanguage || !['fr', 'de', 'en', 'it'].includes(targetLanguage)) {
      return NextResponse.json(
        { error: 'targetLanguage must be one of: fr, de, en, it' },
        { status: 400 }
      )
    }

    // Translate the summary using AI
    const result = await translateSummary({
      summary,
      targetLanguage,
      sourceLanguage,
    })

    return NextResponse.json({
      success: true,
      translatedSummary: result.translatedSummary,
      targetLanguage: result.targetLanguage,
      tokensUsed: result.tokensUsed,
    })
  } catch (error) {
    console.error('Error translating summary:', error)
    return NextResponse.json(
      {
        error: 'Failed to translate summary',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
