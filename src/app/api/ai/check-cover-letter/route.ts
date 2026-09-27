/**
 * AI Cover Letter Checker API
 * Analyzes and scores a cover letter against job requirements
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateCompletion, MODELS } from '@/lib/ai/client'
import { buildCoverLetterCheckerPrompt } from '@/lib/ai/prompts'
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

    const body = await request.json()
    const {
      openingParagraph,
      bodyParagraphs,
      closingParagraph,
      jobDescription,
      jobTitle,
      companyName,
      locale,
    } = body

    // Ceilings on everything that reaches the prompt: without them the cost of
    // a single request is whatever the caller chooses to upload. bodyParagraphs
    // is bounded in item count as well as per-paragraph length, since the prompt
    // carries every entry.
    const oversized = findOversizedField(body, {
      openingParagraph: AI_TEXT_LIMITS.COVER_LETTER_PARAGRAPH,
      closingParagraph: AI_TEXT_LIMITS.COVER_LETTER_PARAGRAPH,
      bodyParagraphs: {
        maxCharacters: AI_TEXT_LIMITS.COVER_LETTER_PARAGRAPH,
        maxItems: AI_LIST_LIMITS.COVER_LETTER_PARAGRAPHS,
      },
      jobDescription: AI_TEXT_LIMITS.JOB_DESCRIPTION,
      jobTitle: AI_TEXT_LIMITS.SHORT_LABEL,
      companyName: AI_TEXT_LIMITS.SHORT_LABEL,
    })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

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

    // Validate that at least some content exists
    const hasContent = openingParagraph ||
      (Array.isArray(bodyParagraphs) && bodyParagraphs.length > 0) ||
      closingParagraph

    if (!hasContent) {
      return NextResponse.json(
        { error: 'Cover letter content is required' },
        { status: 400 }
      )
    }

    // Build prompt and generate
    const prompt = buildCoverLetterCheckerPrompt({
      openingParagraph,
      bodyParagraphs: Array.isArray(bodyParagraphs) ? bodyParagraphs : [],
      closingParagraph,
      jobDescription,
      jobTitle,
      companyName: companyName || 'Unknown Company',
      locale,
    })

    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      temperature: 0.5,
      maxTokens: 1000,
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
      analysis: {
        score: typeof parsedContent.score === 'number' ? parsedContent.score : 0,
        strengths: Array.isArray(parsedContent.strengths) ? parsedContent.strengths : [],
        weaknesses: Array.isArray(parsedContent.weaknesses) ? parsedContent.weaknesses : [],
        suggestions: Array.isArray(parsedContent.suggestions) ? parsedContent.suggestions : [],
        keywordCoverage: typeof parsedContent.keywordCoverage === 'number'
          ? parsedContent.keywordCoverage
          : 0,
        matchedKeywords: Array.isArray(parsedContent.matchedKeywords)
          ? parsedContent.matchedKeywords
          : [],
        missingKeywords: Array.isArray(parsedContent.missingKeywords)
          ? parsedContent.missingKeywords
          : [],
      },
      tokensUsed: result.usage?.total_tokens || 0,
    })
  } catch (error) {
    console.error('Error checking cover letter:', error)
    return NextResponse.json(
      {
        error: 'Failed to check cover letter',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
