import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateCompletion, MODELS } from '@/lib/ai/client'

/**
 * Minimum character count for cover letter text to ensure meaningful analysis.
 */
const MIN_COVER_LETTER_CHARACTERS = 100

/**
 * Zod schema for validating cover letter check request body.
 * Enforces minimum content length for meaningful analysis.
 */
const CheckCoverLetterRequestSchema = z.object({
  coverLetterText: z
    .string()
    .min(
      MIN_COVER_LETTER_CHARACTERS,
      `Cover letter text must be at least ${MIN_COVER_LETTER_CHARACTERS} characters`
    ),
  jobDescription: z.string().optional(),
  locale: z.enum(['en', 'fr', 'de', 'it']).optional().default('en'),
})

/**
 * Category analysis result structure for cover letter analysis.
 */
interface CategoryResult {
  name: string
  score: number
  feedback: string
}

/**
 * Job match analysis result structure (when job description is provided).
 */
interface JobMatchResult {
  score: number
  matchedKeywords: string[]
  missingKeywords: string[]
  suggestions: string[]
}

/**
 * Complete cover letter analysis response structure.
 */
interface CoverLetterAnalysis {
  overallScore: number
  categories: CategoryResult[]
  strengths: string[]
  improvements: string[]
  jobMatch?: JobMatchResult
}

/**
 * POST /api/tools/check-cover-letter
 *
 * Analyzes cover letter text and provides structured feedback across multiple categories.
 * Optionally includes job-specific match analysis when a job description is provided.
 *
 * This is a public endpoint (no authentication required) to support:
 * - Pasted cover letter text
 * - Uploaded document text extraction
 * - Anonymous usage of the cover letter checker tool
 *
 * Categories analyzed:
 * - Structure (opening, body, closing)
 * - Tone (professional, enthusiastic, appropriate)
 * - Clarity (clear, concise, easy to read)
 * - Relevance (aligned to job/industry)
 * - Call to Action (clear next steps, confidence)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    // Validate input with Zod
    const validationResult = CheckCoverLetterRequestSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }))
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      )
    }

    const { coverLetterText, jobDescription, locale } = validationResult.data

    // Build the analysis prompt
    const prompt = buildCoverLetterCheckPrompt(coverLetterText, jobDescription, locale)

    // Call AI for analysis with increased tokens for comprehensive feedback
    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      maxTokens: 3000,
      temperature: 0.3,
    })

    // Parse AI response as JSON
    let analysis: CoverLetterAnalysis
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

      analysis = JSON.parse(responseText) as CoverLetterAnalysis
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError)
      console.error('Raw response:', result.text)
      return NextResponse.json(
        {
          error: 'Failed to parse analysis response',
          message: 'The AI returned an invalid response format',
        },
        { status: 500 }
      )
    }

    // Validate the analysis structure has required fields
    if (
      typeof analysis.overallScore !== 'number' ||
      analysis.overallScore < 0 ||
      analysis.overallScore > 100 ||
      !Array.isArray(analysis.categories) ||
      !Array.isArray(analysis.strengths) ||
      !Array.isArray(analysis.improvements)
    ) {
      console.error('Invalid analysis structure:', analysis)
      return NextResponse.json(
        {
          error: 'Invalid analysis structure',
          message: 'The analysis response is missing required fields',
        },
        { status: 500 }
      )
    }

    // Validate category structure
    for (const category of analysis.categories) {
      if (
        typeof category.name !== 'string' ||
        typeof category.score !== 'number' ||
        typeof category.feedback !== 'string'
      ) {
        console.error('Invalid category structure:', category)
        return NextResponse.json(
          {
            error: 'Invalid category structure',
            message: 'One or more categories have an invalid format',
          },
          { status: 500 }
        )
      }
    }

    // Validate jobMatch structure if job description was provided
    if (jobDescription && analysis.jobMatch) {
      const jm = analysis.jobMatch
      if (
        typeof jm.score !== 'number' ||
        !Array.isArray(jm.matchedKeywords) ||
        !Array.isArray(jm.missingKeywords) ||
        !Array.isArray(jm.suggestions)
      ) {
        console.error('Invalid jobMatch structure:', jm)
        return NextResponse.json(
          {
            error: 'Invalid job match structure',
            message: 'The job match analysis has an invalid format',
          },
          { status: 500 }
        )
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      analysis: {
        overallScore: analysis.overallScore,
        categories: analysis.categories,
        strengths: analysis.strengths,
        improvements: analysis.improvements,
        jobMatch: analysis.jobMatch,
      },
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

/**
 * Builds the prompt for cover letter analysis.
 * Analyzes 5 core categories: Structure, Tone, Clarity, Relevance, Call to Action.
 */
function buildCoverLetterCheckPrompt(
  coverLetterText: string,
  jobDescription: string | undefined,
  locale: string
): string {
  const languageMap: Record<string, string> = {
    en: 'English',
    fr: 'French',
    de: 'German',
    it: 'Italian',
  }

  const targetLanguage = languageMap[locale] || 'English'

  const jobMatchSection = jobDescription
    ? `

**JOB DESCRIPTION TO MATCH AGAINST:**
"""
${jobDescription}
"""

**JOB MATCH ANALYSIS INSTRUCTIONS:**
In addition to the standard analysis, compare the cover letter against the job description and provide:
- A match score (0-100) indicating how well the cover letter addresses the job requirements
- Keywords/skills from the job description that ARE mentioned in the cover letter
- Keywords/skills from the job description that are MISSING from the cover letter
- Specific suggestions to improve alignment with this job

Include a "jobMatch" object in your response with this structure:
{
  "score": <number 0-100>,
  "matchedKeywords": ["<keyword found in both>", ...],
  "missingKeywords": ["<keyword missing from cover letter>", ...],
  "suggestions": ["<suggestion to improve job fit>", ...]
}`
    : ''

  return `You are an expert career coach and cover letter reviewer. Analyze the following cover letter and provide detailed, actionable feedback.

**CRITICAL - LANGUAGE REQUIREMENT:**
- Write ALL feedback text in ${targetLanguage}
- Maintain ${targetLanguage} throughout the JSON values
- Use professional ${targetLanguage} career terminology

**COVER LETTER TO ANALYZE:**
"""
${coverLetterText}
"""
${jobMatchSection}

**ANALYSIS CATEGORIES (ALL 5 REQUIRED):**

1. **Structure** (Weight: 20%)
   - Clear opening that hooks the reader
   - Well-organized body paragraphs with logical flow
   - Strong closing that summarizes and invites action
   - Appropriate length (typically 250-400 words)
   - Professional formatting

2. **Tone** (Weight: 20%)
   - Professional yet personable voice
   - Confident without being arrogant
   - Enthusiastic and genuine interest in the role
   - Appropriate formality for the industry
   - Active voice and positive language

3. **Clarity** (Weight: 20%)
   - Clear and concise writing
   - Easy to read and understand
   - No jargon unless industry-appropriate
   - Grammatically correct
   - No spelling or punctuation errors

4. **Relevance** (Weight: 20%)
   - Tailored to the specific role/company (if context provided)
   - Highlights relevant experience and skills
   - Demonstrates understanding of the company/industry
   - Addresses job requirements directly
   - Shows research and genuine interest

5. **Call to Action** (Weight: 20%)
   - Clear request for next steps (interview, meeting)
   - Confident closing statement
   - Provides contact information or availability
   - Creates sense of urgency without being pushy
   - Leaves positive lasting impression

**SCORING GUIDELINES:**
- 80-100: Excellent - Compelling, professional, ready to send
- 60-79: Good - Solid foundation with room for improvement
- 40-59: Needs Work - Several areas require attention
- 0-39: Poor - Major revisions needed

**OUTPUT FORMAT (JSON ONLY):**
{
  "overallScore": <number 0-100, weighted average of categories>,
  "categories": [
    {
      "name": "Structure",
      "score": <number 0-100>,
      "feedback": "<specific feedback in ${targetLanguage}, 1-2 sentences>"
    },
    {
      "name": "Tone",
      "score": <number 0-100>,
      "feedback": "<specific feedback in ${targetLanguage}, 1-2 sentences>"
    },
    {
      "name": "Clarity",
      "score": <number 0-100>,
      "feedback": "<specific feedback in ${targetLanguage}, 1-2 sentences>"
    },
    {
      "name": "Relevance",
      "score": <number 0-100>,
      "feedback": "<specific feedback in ${targetLanguage}, 1-2 sentences>"
    },
    {
      "name": "Call to Action",
      "score": <number 0-100>,
      "feedback": "<specific feedback in ${targetLanguage}, 1-2 sentences>"
    }
  ],
  "strengths": [
    "<strength 1 in ${targetLanguage}>",
    "<strength 2 in ${targetLanguage}>",
    "<strength 3 in ${targetLanguage}>"
  ],
  "improvements": [
    "<improvement 1 in ${targetLanguage}>",
    "<improvement 2 in ${targetLanguage}>",
    "<improvement 3 in ${targetLanguage}>"
  ]${
    jobDescription
      ? `,
  "jobMatch": {
    "score": <number 0-100>,
    "matchedKeywords": ["<keyword>", ...],
    "missingKeywords": ["<keyword>", ...],
    "suggestions": ["<job-specific suggestion>", ...]
  }`
      : ''
  }
}

**CRITICAL REQUIREMENTS:**
1. Return EXACTLY 5 categories in the order listed above
2. Each category MUST have a name, score (0-100), and feedback string
3. Overall score MUST be calculated as weighted average (all categories equal weight: 20%)
4. Provide exactly 3 strengths - things the cover letter does well
5. Provide exactly 3 improvements - specific, actionable suggestions
6. Be specific and constructive - avoid generic advice
7. Do NOT invent information not present in the cover letter
8. ALL text content must be in ${targetLanguage}
${
  jobDescription
    ? `9. Include jobMatch analysis with realistic scoring based on actual keyword/skill matching`
    : ''
}

**COVER LETTER BEST PRACTICES TO EVALUATE:**
- Opens with a compelling hook, not "I am writing to apply..."
- Shows specific knowledge of the company/role
- Quantifies achievements where possible
- Explains what value the candidate brings
- Avoids simply repeating the resume
- Uses the company's language and values
- Is addressed to a specific person when possible

**Response:**
Return ONLY the JSON object. No additional text, explanations, or formatting.`
}
