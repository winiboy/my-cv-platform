import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ResumeAnalysis, AnalysisCategory, AnalysisIssue } from '@/types/resume-analysis'

/**
 * Time threshold for considering an analysis as "recent" (24 hours in milliseconds).
 * Analyses older than this threshold should prompt user to re-analyze.
 */
const ANALYSIS_FRESHNESS_THRESHOLD_MS = 24 * 60 * 60 * 1000

/**
 * Database row shape for resume_analyses table.
 * Used for type-safe data transformation.
 */
interface ResumeAnalysisRow {
  id: string
  user_id: string
  resume_id: string | null
  overall_score: number | null
  ats_score: number | null
  category_scores: Record<string, number> | null
  recommendations: Array<{
    category: string
    priority: 'high' | 'medium' | 'low'
    message: string
    suggestions: string[]
  }> | null
  job_description: string | null
  matched_keywords: string[] | null
  missing_keywords: string[] | null
  created_at: string
}

/**
 * GET /api/ai/analyze-resume/[resumeId]
 *
 * Fetches the most recent analysis for a given resume.
 * Returns the analysis if it exists and includes freshness information.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resumeId: string }> }
) {
  try {
    const { resumeId } = await params

    // Check authentication
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate resumeId
    if (!resumeId || typeof resumeId !== 'string') {
      return NextResponse.json(
        { error: 'resumeId is required and must be a string' },
        { status: 400 }
      )
    }

    // Verify the resume belongs to the user (RLS will also enforce this)
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('id')
      .eq('id', resumeId)
      .eq('user_id', user.id)
      .single()

    if (resumeError || !resume) {
      return NextResponse.json(
        { error: 'Resume not found or you do not have permission to access it' },
        { status: 404 }
      )
    }

    // Fetch the most recent analysis for this resume
    const { data: analysisRow, error: analysisError } = await supabase
      .from('resume_analyses')
      .select('*')
      .eq('resume_id', resumeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (analysisError) {
      // No analysis found is not an error - return null
      if (analysisError.code === 'PGRST116') {
        return NextResponse.json({
          success: true,
          analysis: null,
          isRecent: false,
        })
      }
      console.error('Error fetching analysis:', analysisError)
      return NextResponse.json(
        { error: 'Failed to fetch analysis' },
        { status: 500 }
      )
    }

    // Transform database row to ResumeAnalysis format
    const analysis = transformRowToAnalysis(analysisRow as ResumeAnalysisRow)

    // Determine if the analysis is recent (< 24 hours old)
    const analysisDate = new Date(analysisRow.created_at)
    const now = new Date()
    const isRecent = now.getTime() - analysisDate.getTime() < ANALYSIS_FRESHNESS_THRESHOLD_MS

    return NextResponse.json({
      success: true,
      analysis,
      isRecent,
      analyzedAt: analysisRow.created_at,
    })
  } catch (error) {
    console.error('Error fetching resume analysis:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch analysis',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Transforms a database row into the ResumeAnalysis format expected by the UI.
 * Reconstructs the category structure from flattened database storage.
 */
function transformRowToAnalysis(row: ResumeAnalysisRow): ResumeAnalysis {
  const categoryScores = row.category_scores || {}
  const recommendations = row.recommendations || []

  // Build categories from scores and recommendations
  const categories: AnalysisCategory[] = Object.entries(categoryScores).map(
    ([name, score]) => {
      // Find matching recommendation for this category
      const recommendation = recommendations.find((r) => r.category === name)

      // Determine status based on score
      let status: 'pass' | 'warning' | 'fail'
      if (score >= 80) {
        status = 'pass'
      } else if (score >= 50) {
        status = 'warning'
      } else {
        status = 'fail'
      }

      // Build issues from recommendation suggestions
      const issues: AnalysisIssue[] = recommendation
        ? recommendation.suggestions.map((suggestion) => ({
            description: suggestion,
            severity: recommendation.priority,
            suggestion: suggestion,
          }))
        : []

      return {
        name,
        score,
        status,
        feedback: recommendation?.message || '',
        issues,
      }
    }
  )

  return {
    overallScore: row.overall_score || 0,
    categories,
    generatedAt: row.created_at,
  }
}
