/**
 * AI Cover Letter Generation API
 * Generates a cover letter from resume data and job description
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateCompletion, MODELS } from '@/lib/ai/client'
import { buildCoverLetterGenerationPrompt } from '@/lib/ai/prompts'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      resumeId,
      jobDescription,
      jobTitle,
      companyName,
      recipientName,
      recipientTitle,
      locale,
    } = body

    if (!jobDescription || typeof jobDescription !== 'string') {
      return NextResponse.json(
        { error: 'jobDescription is required' },
        { status: 400 }
      )
    }

    if (!jobTitle || typeof jobTitle !== 'string') {
      return NextResponse.json(
        { error: 'jobTitle is required' },
        { status: 400 }
      )
    }

    if (!companyName || typeof companyName !== 'string') {
      return NextResponse.json(
        { error: 'companyName is required' },
        { status: 400 }
      )
    }

    // Fetch resume data if resumeId provided
    let resumeSummary: string | undefined
    let resumeExperience: { position: string; company: string; description?: string }[] | undefined
    let resumeSkills: string[] | undefined

    if (resumeId) {
      const { data: resume, error } = await supabase
        .from('resumes')
        .select('summary, experience, skills')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .single<{
          summary: string | null
          experience: unknown
          skills: unknown
        }>()

      if (error) {
        console.error('Error fetching resume:', error)
      } else if (resume) {
        resumeSummary = resume.summary || undefined

        // Extract experience
        const experience = resume.experience as { position: string; company: string; description?: string }[] | null
        if (Array.isArray(experience)) {
          resumeExperience = experience.slice(0, 3).map(exp => ({
            position: exp.position,
            company: exp.company,
            description: exp.description,
          }))
        }

        // Extract skills
        const skills = resume.skills as { items?: string[]; skillsHtml?: string }[] | null
        if (Array.isArray(skills)) {
          resumeSkills = skills.flatMap(cat => cat.items || [])
        }
      }
    }

    // Build prompt and generate
    const prompt = buildCoverLetterGenerationPrompt({
      resumeSummary,
      resumeExperience,
      resumeSkills,
      jobDescription,
      jobTitle,
      companyName,
      recipientName,
      recipientTitle,
      locale,
    })

    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      temperature: 0.7,
      maxTokens: 1500,
    })

    // Parse JSON response
    let parsedContent
    try {
      const text = result.text.trim()
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      const jsonText = jsonMatch ? jsonMatch[1] : text
      parsedContent = JSON.parse(jsonText)
    } catch (error) {
      console.error('Failed to parse JSON response:', error)
      console.error('Raw response:', result.text)
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      coverLetter: {
        greeting: parsedContent.greeting || 'Dear Hiring Manager,',
        openingParagraph: parsedContent.openingParagraph || '',
        bodyParagraphs: Array.isArray(parsedContent.bodyParagraphs)
          ? parsedContent.bodyParagraphs
          : [],
        closingParagraph: parsedContent.closingParagraph || '',
        signOff: parsedContent.signOff || 'Sincerely,',
      },
      tokensUsed: result.usage?.total_tokens || 0,
    })
  } catch (error) {
    console.error('Error generating cover letter:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate cover letter',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
