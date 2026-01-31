import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateCompletion, MODELS } from '@/lib/ai/client'

/**
 * Minimum character count for resume text to ensure meaningful analysis.
 */
const MIN_RESUME_CHARACTERS = 100

/**
 * Zod schema for validating resume review request body.
 * Enforces minimum content length for meaningful analysis.
 */
const ReviewResumeRequestSchema = z.object({
  resumeText: z
    .string()
    .min(
      MIN_RESUME_CHARACTERS,
      `Resume text must be at least ${MIN_RESUME_CHARACTERS} characters for meaningful analysis`
    ),
  jobDescription: z.string().optional(),
  locale: z.enum(['en', 'fr', 'de', 'it']).optional().default('en'),
})

/**
 * Category analysis result structure.
 */
interface CategoryResult {
  name: string
  score: number
  feedback: string[]
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
 * Complete analysis response structure.
 */
interface ResumeReviewAnalysis {
  overallScore: number
  categories: CategoryResult[]
  suggestions: string[]
  jobMatch?: JobMatchResult
  analyzedAt: string
}

/**
 * POST /api/tools/review-resume
 *
 * Analyzes a resume text and provides structured feedback across multiple categories.
 * Optionally includes job-specific match analysis when a job description is provided.
 *
 * This is a public endpoint (no authentication required) to support:
 * - Pasted resume text
 * - Uploaded PDF text extraction
 * - Anonymous usage of the resume reviewer tool
 *
 * Categories analyzed:
 * - Impact (action verbs, quantified achievements)
 * - Brevity (conciseness, no fluff)
 * - Style (formatting, consistency)
 * - Sections (completeness - summary, experience, skills, education)
 * - Skills (relevant keywords, technical skills)
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
    const validationResult = ReviewResumeRequestSchema.safeParse(body)
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

    const { resumeText, jobDescription, locale } = validationResult.data

    // Build the analysis prompt
    const prompt = buildResumeReviewPrompt(resumeText, jobDescription, locale)

    // Call AI for analysis with increased tokens for comprehensive feedback
    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      maxTokens: 3000,
      temperature: 0.3,
    })

    // Parse AI response as JSON
    let analysis: ResumeReviewAnalysis
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

      analysis = JSON.parse(responseText) as ResumeReviewAnalysis
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
      !Array.isArray(analysis.suggestions)
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
        !Array.isArray(category.feedback)
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

    // Ensure analyzedAt is set
    if (!analysis.analyzedAt) {
      analysis.analyzedAt = new Date().toISOString()
    }

    // Return success response
    return NextResponse.json({
      success: true,
      overallScore: analysis.overallScore,
      categories: analysis.categories,
      suggestions: analysis.suggestions,
      jobMatch: analysis.jobMatch,
      analyzedAt: analysis.analyzedAt,
    })
  } catch (error) {
    console.error('Error reviewing resume:', error)
    return NextResponse.json(
      {
        error: 'Failed to review resume',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Builds the prompt for resume review analysis.
 * Analyzes 5 core categories and optionally includes job matching.
 */
function buildResumeReviewPrompt(
  resumeText: string,
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
In addition to the standard analysis, compare the resume against the job description and provide:
- A match score (0-100) indicating how well the resume fits the job
- Keywords/skills from the job description that ARE present in the resume
- Keywords/skills from the job description that are MISSING from the resume
- Specific suggestions to improve alignment with this job

Include a "jobMatch" object in your response with this structure:
{
  "score": <number 0-100>,
  "matchedKeywords": ["<keyword found in both>", ...],
  "missingKeywords": ["<keyword missing from resume>", ...],
  "suggestions": ["<suggestion to improve job fit>", ...]
}`
    : ''

  return `You are an expert resume reviewer and career coach. Analyze the following resume and provide detailed, actionable feedback.

**CRITICAL - LANGUAGE REQUIREMENT:**
- Write ALL feedback text in ${targetLanguage}
- Maintain ${targetLanguage} throughout the JSON values
- Use professional ${targetLanguage} career terminology

**RESUME TO ANALYZE:**
"""
${resumeText}
"""
${jobMatchSection}

**ANALYSIS CATEGORIES (ALL 5 REQUIRED):**

1. **Impact** (Weight: 25%)
   - Use of strong action verbs (Led, Achieved, Delivered, etc.)
   - Quantified achievements with metrics, percentages, or numbers
   - Clear demonstration of results and outcomes
   - Avoid passive language and vague statements

2. **Brevity** (Weight: 20%)
   - Concise bullet points (ideally 1-2 lines each)
   - No unnecessary filler words or redundant phrases
   - Information density - every word should add value
   - Appropriate length for experience level

3. **Style** (Weight: 20%)
   - Consistent formatting throughout
   - Proper use of tense (past for previous jobs, present for current)
   - Professional language and tone
   - Clear visual hierarchy and organization

4. **Sections** (Weight: 20%)
   - Presence of key sections: Contact, Summary, Experience, Education, Skills
   - Appropriate ordering of sections
   - Completeness of information in each section
   - Logical flow from section to section

5. **Skills** (Weight: 15%)
   - Relevant technical and soft skills included
   - Industry-appropriate keywords for ATS optimization
   - Skills organized in a clear, scannable format
   - Balance between technical and transferable skills

**SCORING GUIDELINES:**
- 80-100: Excellent - Professional quality, minor refinements only
- 60-79: Good - Solid foundation with room for improvement
- 40-59: Needs Work - Several areas require attention
- 0-39: Poor - Major revisions needed

**OUTPUT FORMAT (JSON ONLY):**
{
  "overallScore": <number 0-100, weighted average of categories>,
  "categories": [
    {
      "name": "Impact",
      "score": <number 0-100>,
      "feedback": [
        "<specific feedback point 1 in ${targetLanguage}>",
        "<specific feedback point 2 in ${targetLanguage}>",
        "<specific feedback point 3 in ${targetLanguage}>"
      ]
    },
    {
      "name": "Brevity",
      "score": <number 0-100>,
      "feedback": ["<feedback>", "<feedback>", ...]
    },
    {
      "name": "Style",
      "score": <number 0-100>,
      "feedback": ["<feedback>", "<feedback>", ...]
    },
    {
      "name": "Sections",
      "score": <number 0-100>,
      "feedback": ["<feedback>", "<feedback>", ...]
    },
    {
      "name": "Skills",
      "score": <number 0-100>,
      "feedback": ["<feedback>", "<feedback>", ...]
    }
  ],
  "suggestions": [
    "<top priority improvement suggestion 1 in ${targetLanguage}>",
    "<top priority improvement suggestion 2 in ${targetLanguage}>",
    "<top priority improvement suggestion 3 in ${targetLanguage}>",
    "<additional suggestion if needed>"
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
  },
  "analyzedAt": "<ISO 8601 timestamp>"
}

**CRITICAL REQUIREMENTS:**
1. Return EXACTLY 5 categories in the order listed above
2. Each category MUST have a name, score (0-100), and feedback array (2-5 items)
3. Overall score MUST be calculated as weighted average:
   - Impact: 25%
   - Brevity: 20%
   - Style: 20%
   - Sections: 20%
   - Skills: 15%
4. Provide 3-5 prioritized suggestions in the suggestions array
5. Be specific and actionable - avoid generic advice
6. Do NOT invent information not present in the resume
7. Set analyzedAt to current ISO timestamp
8. ALL text content must be in ${targetLanguage}
${
  jobDescription
    ? `9. Include jobMatch analysis with realistic scoring based on actual keyword/skill matching`
    : ''
}

**Response:**
Return ONLY the JSON object. No additional text, explanations, or formatting.`
}
