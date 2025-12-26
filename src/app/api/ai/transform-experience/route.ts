import { NextRequest, NextResponse } from 'next/server'
import { transformExperience } from '@/lib/ai/transformations'
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
    const { position, company, description, achievements } = body

    if (!position || typeof position !== 'string') {
      return NextResponse.json(
        { error: 'position is required and must be a string' },
        { status: 400 }
      )
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
