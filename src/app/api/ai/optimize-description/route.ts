import { NextRequest, NextResponse } from 'next/server'
import { optimizeDescription } from '@/lib/ai/transformations'
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
    const { text, context, locale } = body

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return NextResponse.json(
        { error: 'text is required and must be at least 10 characters' },
        { status: 400 }
      )
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
