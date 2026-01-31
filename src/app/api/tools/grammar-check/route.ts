import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateCompletion, MODELS } from '@/lib/ai/client'
import type { GrammarAnalysisResponse } from '@/types/grammar-check'

/**
 * Minimum character count for resume text to ensure meaningful analysis.
 */
const MIN_RESUME_CHARACTERS = 100

/**
 * Zod schema for validating grammar check request body.
 * Enforces minimum content length for meaningful analysis.
 */
const GrammarCheckRequestSchema = z.object({
  resumeText: z
    .string()
    .min(
      MIN_RESUME_CHARACTERS,
      `Resume text must be at least ${MIN_RESUME_CHARACTERS} characters`
    ),
  locale: z.enum(['en', 'fr', 'de', 'it']).optional().default('en'),
})

/**
 * POST /api/tools/grammar-check
 *
 * Analyzes resume text for grammar, spelling, punctuation, tense, and phrasing issues.
 * Provides structured feedback with corrections and explanations.
 *
 * This is a public endpoint (no authentication required) to support:
 * - Pasted resume text analysis
 * - Uploaded PDF text extraction
 * - Anonymous usage of the resume checker tool
 *
 * Issue types detected:
 * - spelling: Misspelled words
 * - grammar: Grammatical errors (subject-verb agreement, articles, etc.)
 * - punctuation: Missing or incorrect punctuation
 * - tense: Inconsistent or incorrect verb tense usage
 * - phrasing: Awkward or unclear phrasing that could be improved
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
    const validationResult = GrammarCheckRequestSchema.safeParse(body)
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

    const { resumeText, locale } = validationResult.data

    // Build the grammar check prompt
    const prompt = buildGrammarCheckPrompt(resumeText, locale)

    // Call AI for analysis
    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      maxTokens: 2500,
      temperature: 0.3,
    })

    // Parse AI response as JSON
    let analysis: GrammarAnalysisResponse
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

      analysis = JSON.parse(responseText) as GrammarAnalysisResponse
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
      typeof analysis.issueCount !== 'number' ||
      !Array.isArray(analysis.issues)
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

    // Validate each issue structure
    const validIssueTypes = ['spelling', 'grammar', 'punctuation', 'tense', 'phrasing']
    const validSeverities = ['error', 'warning', 'suggestion']

    for (const issue of analysis.issues) {
      if (
        typeof issue.id !== 'string' ||
        !validIssueTypes.includes(issue.type) ||
        !validSeverities.includes(issue.severity) ||
        typeof issue.originalText !== 'string' ||
        typeof issue.suggestedText !== 'string' ||
        typeof issue.explanation !== 'string' ||
        typeof issue.location !== 'string'
      ) {
        console.error('Invalid issue structure:', issue)
        return NextResponse.json(
          {
            error: 'Invalid issue structure',
            message: 'One or more issues have an invalid format',
          },
          { status: 500 }
        )
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      overallScore: analysis.overallScore,
      issueCount: analysis.issueCount,
      issues: analysis.issues,
    })
  } catch (error) {
    console.error('Error checking grammar:', error)
    return NextResponse.json(
      {
        error: 'Failed to check grammar',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Builds the prompt for grammar check analysis.
 * Analyzes spelling, grammar, punctuation, tense, and phrasing issues.
 */
function buildGrammarCheckPrompt(resumeText: string, locale: string): string {
  const languageMap: Record<string, string> = {
    en: 'English',
    fr: 'French',
    de: 'German',
    it: 'Italian',
  }

  const targetLanguage = languageMap[locale] || 'English'

  return `You are an expert proofreader specializing in professional resumes and CVs. Analyze the following resume text for grammar, spelling, punctuation, tense, and phrasing issues.

**CRITICAL - LANGUAGE REQUIREMENT:**
- Analyze the resume in the language it is written (${targetLanguage} expected based on locale)
- Write ALL feedback and explanations in ${targetLanguage}
- Maintain ${targetLanguage} throughout the JSON values
- Use professional ${targetLanguage} terminology

**RESUME TEXT TO ANALYZE:**
"""
${resumeText}
"""

**ANALYSIS INSTRUCTIONS:**

Detect and report the following issue types:

1. **spelling** - Misspelled words, typos, incorrect word choices
2. **grammar** - Subject-verb agreement, article usage, sentence structure errors
3. **punctuation** - Missing commas, periods, incorrect punctuation usage
4. **tense** - Inconsistent verb tenses (e.g., mixing past and present tense for past jobs)
5. **phrasing** - Awkward constructions, unclear sentences, wordy phrases that could be more concise

**SEVERITY LEVELS:**
- **error** - Critical issues that must be fixed (spelling mistakes, clear grammatical errors)
- **warning** - Important issues that should be addressed (inconsistent tenses, punctuation problems)
- **suggestion** - Minor improvements that would enhance readability (better phrasing options)

**SCORING GUIDELINES:**
- **90-100 (Excellent):** No errors, maybe 1-2 minor suggestions. Professional quality.
- **70-89 (Good):** Few minor errors, mostly clean. Acceptable for submission with minor edits.
- **50-69 (Needs Work):** Multiple issues across categories. Requires editing before submission.
- **0-49 (Poor):** Significant errors throughout. Needs substantial revision.

**OUTPUT FORMAT (JSON ONLY):**
{
  "overallScore": <number 0-100>,
  "issueCount": <total number of issues found>,
  "issues": [
    {
      "id": "<unique identifier, e.g., 'issue-1'>",
      "type": "spelling" | "grammar" | "punctuation" | "tense" | "phrasing",
      "severity": "error" | "warning" | "suggestion",
      "originalText": "<the exact problematic text from the resume>",
      "suggestedText": "<the corrected version>",
      "explanation": "<clear explanation of the issue and why it matters, in ${targetLanguage}>",
      "location": "<context description, e.g., 'Summary section', 'Work experience - Company X', 'Skills section'>"
    }
  ]
}

**CRITICAL REQUIREMENTS:**
1. Return ONLY valid JSON, no additional text or markdown formatting
2. Each issue MUST have all required fields: id, type, severity, originalText, suggestedText, explanation, location
3. Issue IDs must be unique (use format "issue-1", "issue-2", etc.)
4. originalText must be the EXACT text from the resume (for precise matching)
5. suggestedText must be a direct replacement that fixes the issue
6. explanation should be helpful and educational
7. location should help the user find the issue in their resume
8. issueCount MUST match the length of the issues array
9. Be thorough but not overly pedantic - focus on issues that matter for professional documents
10. Consider resume-specific conventions (e.g., bullet points may omit periods, using present tense for current role is acceptable)
11. ALL text content must be in ${targetLanguage}

**RESUME-SPECIFIC CONSIDERATIONS:**
- Past roles typically use past tense; current roles can use present tense
- Bullet points often omit subjects ("Managed team" vs "I managed team") - this is acceptable
- Some abbreviations are standard in resumes (e.g., "Q1", "YoY", "KPIs")
- Technical terms and company names should not be flagged as spelling errors
- Action verbs at the start of bullets are expected and should be varied

**Response:**
Return ONLY the JSON object. No additional text, explanations, or formatting.`
}
