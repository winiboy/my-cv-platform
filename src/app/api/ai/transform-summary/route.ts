import { NextRequest, NextResponse } from 'next/server'
import { transformSummary } from '@/lib/ai/transformations'
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
    const { rawSummary, currentRole, yearsOfExperience, topSkills, locale } = body

    if (!rawSummary || typeof rawSummary !== 'string') {
      return NextResponse.json(
        { error: 'rawSummary is required and must be a string' },
        { status: 400 }
      )
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
