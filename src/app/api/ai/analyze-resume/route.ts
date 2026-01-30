import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateCompletion, MODELS } from '@/lib/ai/client'
import { buildResumeAnalysisPrompt, type ResumeAnalysisInput } from '@/lib/ai/prompts'
import type { ResumeAnalysis } from '@/types/resume-analysis'
import type {
  ResumeContact,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
} from '@/types/database'

/**
 * POST /api/ai/analyze-resume
 *
 * Performs comprehensive AI-powered analysis of a resume.
 * Returns detailed scoring across 15 categories with actionable feedback.
 */
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
    const { resumeId, locale } = body

    // Validate resumeId
    if (!resumeId || typeof resumeId !== 'string') {
      return NextResponse.json(
        { error: 'resumeId is required and must be a string' },
        { status: 400 }
      )
    }

    // Fetch resume from database (with user_id check for security)
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .eq('user_id', user.id)
      .single()

    if (resumeError || !resume) {
      console.error('Error fetching resume:', resumeError)
      return NextResponse.json(
        { error: 'Resume not found or you do not have permission to access it' },
        { status: 404 }
      )
    }

    // Extract resume content for analysis
    const contact = resume.contact as ResumeContact | null
    const experience = resume.experience as ResumeExperience[] | null
    const education = resume.education as ResumeEducation[] | null
    const skills = resume.skills as ResumeSkillCategory[] | null

    // Build analysis input
    const analysisInput: ResumeAnalysisInput = {
      summary: resume.summary || undefined,
      experience: experience?.map((exp) => ({
        position: exp.position,
        company: exp.company,
        startDate: exp.startDate,
        endDate: exp.endDate,
        description: exp.description,
      })),
      education: education?.map((edu) => ({
        degree: edu.degree,
        institution: edu.school,
        graduationDate: edu.endDate,
      })),
      skills: extractSkillsFromCategories(skills),
      contact: contact
        ? {
            email: contact.email,
            phone: contact.phone,
            location: contact.location,
            linkedin: contact.linkedin,
          }
        : undefined,
      locale: locale || 'en',
    }

    // Build the analysis prompt
    const prompt = buildResumeAnalysisPrompt(analysisInput)

    // Call AI for analysis
    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      maxTokens: 4000,
      temperature: 0.3,
    })

    // Parse AI response as JSON
    let analysis: ResumeAnalysis
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

      analysis = JSON.parse(responseText) as ResumeAnalysis
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError)
      console.error('Raw response:', result.text)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to parse analysis response',
          message: 'The AI returned an invalid response format',
        },
        { status: 500 }
      )
    }

    // Validate the analysis structure has required fields
    if (
      typeof analysis.overallScore !== 'number' ||
      !Array.isArray(analysis.categories) ||
      !analysis.generatedAt
    ) {
      console.error('Invalid analysis structure:', analysis)
      return NextResponse.json(
        {
          success: false,
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
      tokensUsed: result.usage?.total_tokens || 0,
    })
  } catch (error) {
    console.error('Error analyzing resume:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to analyze resume',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Extract flat skill list from skill categories.
 * Handles both legacy items array and rich text HTML content.
 */
function extractSkillsFromCategories(
  skills: ResumeSkillCategory[] | null
): string[] | undefined {
  if (!skills || skills.length === 0) {
    return undefined
  }

  const allSkills: string[] = []

  for (const category of skills) {
    // Use items array if available
    if (category.items && Array.isArray(category.items)) {
      allSkills.push(...category.items)
    }
    // If using rich text HTML, extract text content
    else if (category.skillsHtml) {
      // Simple extraction of text from HTML
      const textContent = category.skillsHtml
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (textContent) {
        // Split by common delimiters
        const extracted = textContent
          .split(/[,;•\n]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
        allSkills.push(...extracted)
      }
    }
  }

  return allSkills.length > 0 ? allSkills : undefined
}
