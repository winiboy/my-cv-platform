import { NextRequest, NextResponse } from 'next/server'
import { translateSummary } from '@/lib/ai/transformations'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
    const body = await request.json()
    const { summary, targetLanguage, sourceLanguage } = body

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
