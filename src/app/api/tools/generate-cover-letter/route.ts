import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateCompletion, MODELS } from '@/lib/ai/client'

/**
 * Minimum character count for resume text to ensure meaningful generation.
 */
const MIN_RESUME_CHARACTERS = 100

/**
 * Minimum character count for job description to ensure relevant tailoring.
 */
const MIN_JOB_DESCRIPTION_CHARACTERS = 50

/**
 * Cover letter length options with target word counts.
 */
const LENGTH_SETTINGS = {
  short: { min: 200, max: 250 },
  medium: { min: 300, max: 350 },
  long: { min: 400, max: 450 },
} as const

/**
 * Cover letter tone options.
 */
const TONE_DESCRIPTIONS = {
  professional:
    'formal, polished, and business-appropriate language with a measured tone',
  enthusiastic:
    'energetic, passionate, and excited about the opportunity while remaining professional',
  confident:
    'assertive, self-assured language that demonstrates strong competence and capability',
  conversational:
    'friendly, approachable tone that feels natural and personable while staying professional',
} as const

/**
 * Zod schema for validating cover letter generation request body.
 */
const GenerateCoverLetterRequestSchema = z.object({
  resumeText: z
    .string()
    .min(
      MIN_RESUME_CHARACTERS,
      `Resume text must be at least ${MIN_RESUME_CHARACTERS} characters`
    ),
  jobDescription: z
    .string()
    .min(
      MIN_JOB_DESCRIPTION_CHARACTERS,
      `Job description must be at least ${MIN_JOB_DESCRIPTION_CHARACTERS} characters`
    ),
  length: z.enum(['short', 'medium', 'long']).optional().default('medium'),
  tone: z
    .enum(['professional', 'enthusiastic', 'confident', 'conversational'])
    .optional()
    .default('professional'),
  selectedDetails: z.array(z.string()).optional().default([]),
  customPrompt: z.string().optional(),
  locale: z.enum(['en', 'fr', 'de', 'it']).optional().default('en'),
})

/**
 * POST /api/tools/generate-cover-letter
 *
 * Generates a tailored cover letter using AI based on resume content and job description.
 * Applies user-specified settings for length, tone, and focus areas.
 *
 * This is a public endpoint (no authentication required) to support:
 * - Pasted resume and job description text
 * - Anonymous usage of the cover letter generator tool
 *
 * The generated cover letter includes:
 * - Professional greeting
 * - 3-4 body paragraphs highlighting relevant experience
 * - Appropriate closing
 *
 * Settings:
 * - length: short (200-250 words), medium (300-350 words), long (400-450 words)
 * - tone: professional, enthusiastic, confident, conversational
 * - selectedDetails: specific requirements from job description to emphasize
 * - customPrompt: additional user instructions for customization
 * - locale: target language (en, fr, de, it)
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
    const validationResult = GenerateCoverLetterRequestSchema.safeParse(body)
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

    const {
      resumeText,
      jobDescription,
      length,
      tone,
      selectedDetails,
      customPrompt,
      locale,
    } = validationResult.data

    // Build the generation prompt
    const prompt = buildCoverLetterPrompt({
      resumeText,
      jobDescription,
      length,
      tone,
      selectedDetails,
      customPrompt,
      locale,
    })

    // Call AI for generation with sufficient tokens for full letter
    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      maxTokens: 1500,
      temperature: 0.7,
    })

    // Extract cover letter from response
    const coverLetter = result.text.trim()

    // Validate we got a non-empty response
    if (!coverLetter || coverLetter.length < 100) {
      console.error('AI returned empty or too short response:', coverLetter)
      return NextResponse.json(
        {
          error: 'Failed to generate cover letter',
          message: 'The AI returned an incomplete response. Please try again.',
        },
        { status: 500 }
      )
    }

    // Return success response
    return NextResponse.json({
      success: true,
      coverLetter,
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

/**
 * Builds the prompt for cover letter generation.
 * Creates a comprehensive prompt that combines resume highlights with job requirements.
 */
function buildCoverLetterPrompt(params: {
  resumeText: string
  jobDescription: string
  length: 'short' | 'medium' | 'long'
  tone: 'professional' | 'enthusiastic' | 'confident' | 'conversational'
  selectedDetails: string[]
  customPrompt?: string
  locale: string
}): string {
  const {
    resumeText,
    jobDescription,
    length,
    tone,
    selectedDetails,
    customPrompt,
    locale,
  } = params

  const languageMap: Record<string, string> = {
    en: 'English',
    fr: 'French',
    de: 'German',
    it: 'Italian',
  }

  const targetLanguage = languageMap[locale] || 'English'
  const lengthSetting = LENGTH_SETTINGS[length]
  const toneDescription = TONE_DESCRIPTIONS[tone]

  // Build selected details section if any are provided
  const selectedDetailsSection =
    selectedDetails.length > 0
      ? `
**PRIORITY REQUIREMENTS TO ADDRESS:**
The candidate specifically wants to emphasize these aspects from the job description:
${selectedDetails.map((detail, index) => `${index + 1}. ${detail}`).join('\n')}

Make sure to directly address each of these requirements with relevant experience from the resume.
`
      : ''

  // Build custom instructions section if provided
  const customInstructionsSection = customPrompt
    ? `
**ADDITIONAL INSTRUCTIONS FROM USER:**
${customPrompt}

Follow these instructions while maintaining the professional quality of the cover letter.
`
    : ''

  return `You are an expert professional cover letter writer with extensive experience helping candidates land interviews at top companies. Your cover letters are known for being compelling, tailored, and effective.

**YOUR TASK:**
Generate a tailored cover letter that connects the candidate's experience with the job requirements.

**CRITICAL - LANGUAGE REQUIREMENT:**
- Write the ENTIRE cover letter in ${targetLanguage}
- Use professional ${targetLanguage} business letter conventions
- Maintain native-quality ${targetLanguage} throughout

**CANDIDATE'S RESUME:**
"""
${resumeText}
"""

**JOB DESCRIPTION:**
"""
${jobDescription}
"""
${selectedDetailsSection}${customInstructionsSection}
**SETTINGS:**
- **Length:** ${length.toUpperCase()} (${lengthSetting.min}-${lengthSetting.max} words)
- **Tone:** ${tone.toUpperCase()} - Use ${toneDescription}

**COVER LETTER STRUCTURE:**

1. **Opening/Greeting:**
   - Use "Dear Hiring Manager," as default greeting (or appropriate ${targetLanguage} equivalent)
   - First paragraph: Express interest in the specific position and company
   - Hook the reader with a compelling opening statement

2. **Body Paragraphs (2-3 paragraphs depending on length):**
   - Highlight the most relevant experience and achievements from the resume
   - Draw clear connections between candidate's background and job requirements
   - Use specific examples and quantified achievements where available
   - Demonstrate understanding of the company's needs
   - Show enthusiasm for the role without being generic

3. **Closing Paragraph:**
   - Summarize key value proposition
   - Express genuine interest in discussing the opportunity further
   - Include a call to action

4. **Sign-off:**
   - Use professional closing (e.g., "Sincerely," / "Best regards," or ${targetLanguage} equivalent)
   - Leave placeholder for name: [Your Name]

**CRITICAL REQUIREMENTS:**

1. **Tailoring:** Every sentence should be relevant to THIS specific job. No generic filler content.

2. **Authenticity:** Only reference skills and experiences that appear in the resume. Never fabricate.

3. **Originality:** Write unique content. Do NOT copy phrases verbatim from the job description.

4. **Action-Oriented:** Use strong action verbs and active voice.

5. **Professional:** Maintain appropriate formality based on the tone setting.

6. **Concise:** Stay within the word count range. Every word should earn its place.

7. **ATS-Friendly:** Naturally incorporate relevant keywords from the job description.

8. **No Generic Phrases:** Avoid cliches like "I am writing to apply," "I am the perfect fit," "I would be a great asset."

**WHAT TO AVOID:**
- Generic opening lines
- Repeating the resume verbatim
- Overly humble or overly boastful language
- Focusing on what the candidate wants (focus on what they offer)
- Mentioning salary expectations
- Including personal information (age, marital status, etc.)
- Negative comments about previous employers
- Typos, grammatical errors, or awkward phrasing

**OUTPUT:**
Return ONLY the cover letter text. No additional commentary, explanations, or formatting instructions.
The cover letter should be ready to use immediately.

Generate the cover letter now:`
}
