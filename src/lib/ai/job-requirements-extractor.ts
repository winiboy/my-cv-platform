/**
 * Job Requirements Extraction Utility
 *
 * Extracts structured requirements from job description text for CV generation
 * and quality evaluation. This utility parses job descriptions to identify
 * skills, responsibilities, qualifications, and nice-to-haves that can be
 * used to tailor CVs to specific job postings.
 */

import { generateCompletion, MODELS } from './client'

/**
 * Structured requirements extracted from a job description.
 * Each array contains relevant items parsed from the job posting.
 */
export interface JobRequirements {
  /** Technical and soft skills required for the role */
  skills: string[]
  /** Key job responsibilities and duties */
  responsibilities: string[]
  /** Required qualifications (education, certifications, experience) */
  qualifications: string[]
  /** Optional or preferred qualifications that are not strictly required */
  niceToHaves: string[]
}

/**
 * Minimum character length for a job description to be considered valid
 * for full extraction. Shorter descriptions will return partial results.
 */
const MIN_DESCRIPTION_LENGTH = 50

/**
 * Default empty result returned when extraction cannot be performed
 */
const EMPTY_REQUIREMENTS: JobRequirements = {
  skills: [],
  responsibilities: [],
  qualifications: [],
  niceToHaves: [],
}

/**
 * Maps locale codes to language names for AI prompts
 */
const LOCALE_TO_LANGUAGE: Record<string, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  it: 'Italian',
}

/**
 * Builds the prompt for extracting job requirements from a job description.
 *
 * @param jobDescription - The raw job description text to analyze
 * @param locale - The target language for extracted content
 * @returns The formatted prompt string for the AI model
 */
function buildJobRequirementsPrompt(jobDescription: string, locale: string): string {
  const targetLanguage = LOCALE_TO_LANGUAGE[locale] || 'English'

  return `You are an expert HR analyst and job description parser. Extract structured requirements from the following job description.

**CRITICAL - LANGUAGE REQUIREMENT:**
- Extract and output ALL content in ${targetLanguage}
- Translate any non-${targetLanguage} content to ${targetLanguage}
- Use professional ${targetLanguage} terminology

**JOB DESCRIPTION:**
"""
${jobDescription}
"""

**EXTRACTION RULES:**

1. **Skills (technical and soft skills):**
   - Extract ALL mentioned technical skills (programming languages, tools, frameworks, methodologies)
   - Extract soft skills (communication, leadership, teamwork, etc.)
   - Include skill variations (e.g., "JavaScript" and "JS" should both appear as "JavaScript")
   - Do NOT include generic terms like "computer skills" unless specific

2. **Responsibilities (key duties):**
   - Extract concrete job duties and tasks
   - Focus on actionable items (what the person will DO)
   - Keep each item concise (1 sentence max)
   - Remove duplicates and merge similar items

3. **Qualifications (required):**
   - Education requirements (degrees, certifications)
   - Experience requirements (years, specific domains)
   - Mandatory certifications or licenses
   - Language requirements
   - ONLY include items explicitly marked as "required" or "must have"

4. **Nice-to-haves (preferred/optional):**
   - Items marked as "preferred", "nice to have", "bonus", "plus", "ideally"
   - Additional skills that would be beneficial
   - Extra certifications or experience
   - Include items that are clearly optional

**OUTPUT FORMAT (JSON ONLY):**
{
  "skills": ["<skill1>", "<skill2>", ...],
  "responsibilities": ["<responsibility1>", "<responsibility2>", ...],
  "qualifications": ["<qualification1>", "<qualification2>", ...],
  "niceToHaves": ["<item1>", "<item2>", ...]
}

**IMPORTANT:**
- Return ONLY valid JSON, no additional text
- Each array should contain 0-15 items (prioritize most important)
- Remove duplicates within each category
- If a category has no items, return an empty array []
- Do NOT invent requirements not mentioned in the description

**Response:**`
}

/**
 * Parses the AI response and extracts the JSON content.
 * Handles cases where the AI wraps JSON in markdown code blocks.
 *
 * @param responseText - The raw response text from the AI model
 * @returns Parsed JobRequirements or null if parsing fails
 */
function parseAIResponse(responseText: string): JobRequirements | null {
  try {
    const text = responseText.trim()

    // Handle markdown code blocks (```json ... ``` or ``` ... ```)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    const jsonText = jsonMatch ? jsonMatch[1] : text

    const parsed = JSON.parse(jsonText)

    // Validate and sanitize the response structure
    return {
      skills: Array.isArray(parsed.skills)
        ? parsed.skills.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
      responsibilities: Array.isArray(parsed.responsibilities)
        ? parsed.responsibilities.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
      qualifications: Array.isArray(parsed.qualifications)
        ? parsed.qualifications.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
      niceToHaves: Array.isArray(parsed.niceToHaves)
        ? parsed.niceToHaves.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
    }
  } catch (error) {
    console.error('Failed to parse job requirements JSON:', error)
    return null
  }
}

/**
 * Extracts structured job requirements from a job description text.
 *
 * This function analyzes job descriptions using AI to identify and categorize:
 * - Required skills (technical and soft)
 * - Key responsibilities and duties
 * - Required qualifications (education, experience, certifications)
 * - Nice-to-have or preferred qualifications
 *
 * The extracted requirements can be used for:
 * - CV generation tailored to specific jobs
 * - CV-to-job matching and scoring
 * - Identifying skill gaps
 * - Cover letter generation
 *
 * @param jobDescription - The job description text to analyze. Can be plain text or HTML.
 * @param locale - The locale code for the target language (e.g., 'en', 'fr', 'de', 'it').
 *                 Extracted content will be in this language.
 * @returns A Promise resolving to JobRequirements containing categorized requirements.
 *          Returns empty arrays for all categories if extraction fails or input is insufficient.
 *
 * @example
 * ```typescript
 * const requirements = await extractJobRequirements(
 *   "We're looking for a Senior Software Engineer with 5+ years of experience in TypeScript...",
 *   "en"
 * )
 * // Result:
 * // {
 * //   skills: ["TypeScript", "React", "Node.js"],
 * //   responsibilities: ["Design and implement scalable solutions", ...],
 * //   qualifications: ["5+ years of software development experience", ...],
 * //   niceToHaves: ["Experience with AWS", ...]
 * // }
 * ```
 */
export async function extractJobRequirements(
  jobDescription: string,
  locale: string
): Promise<JobRequirements> {
  // Handle empty or whitespace-only input
  if (!jobDescription || typeof jobDescription !== 'string') {
    return EMPTY_REQUIREMENTS
  }

  const trimmedDescription = jobDescription.trim()

  // Handle very short descriptions that lack meaningful content
  if (trimmedDescription.length < MIN_DESCRIPTION_LENGTH) {
    console.warn(
      `Job description too short for extraction (${trimmedDescription.length} chars, minimum ${MIN_DESCRIPTION_LENGTH})`
    )
    return EMPTY_REQUIREMENTS
  }

  // Normalize locale to supported values
  const normalizedLocale = locale?.toLowerCase() || 'en'
  const supportedLocale = LOCALE_TO_LANGUAGE[normalizedLocale] ? normalizedLocale : 'en'

  try {
    const prompt = buildJobRequirementsPrompt(trimmedDescription, supportedLocale)

    const result = await generateCompletion(prompt, {
      model: MODELS.BALANCED,
      temperature: 0.3, // Lower temperature for more consistent extraction
      maxTokens: 1500,
    })

    const parsed = parseAIResponse(result.text)

    if (!parsed) {
      console.error('Failed to parse AI response for job requirements extraction')
      return EMPTY_REQUIREMENTS
    }

    return parsed
  } catch (error) {
    console.error('Error extracting job requirements:', error)
    return EMPTY_REQUIREMENTS
  }
}

/**
 * Minimum character length threshold for job description quality check.
 * Descriptions shorter than this are considered insufficient for CV generation.
 */
const INSUFFICIENT_DESCRIPTION_MIN_LENGTH = 100

/**
 * Minimum total items threshold across all requirement categories.
 * Fewer than this number of extractable items indicates insufficient data.
 */
const INSUFFICIENT_ITEMS_MIN_COUNT = 3

/**
 * Determines whether a job description is too short or vague to generate a quality CV.
 *
 * This function performs two checks to assess job description quality:
 * 1. Length check: The raw description must be at least 100 characters
 * 2. Content check: The extracted requirements must contain at least 3 total items
 *    across all categories (skills, responsibilities, qualifications, niceToHaves)
 *
 * Use this function before attempting CV generation to avoid producing
 * low-quality or generic CVs from insufficient input data.
 *
 * @param jobDescription - The raw job description text to evaluate
 * @param requirements - The extracted JobRequirements from the job description
 * @returns true if the job description is insufficient for quality CV generation,
 *          false if the description has enough content to proceed
 *
 * @example
 * ```typescript
 * const requirements = await extractJobRequirements(jobDescription, 'en')
 * if (isJobDescriptionInsufficient(jobDescription, requirements)) {
 *   // Show error: "Please provide a more detailed job description"
 *   return
 * }
 * // Proceed with CV generation
 * ```
 */
export function isJobDescriptionInsufficient(
  jobDescription: string,
  requirements: JobRequirements
): boolean {
  // Check if description is too short
  const trimmedDescription = jobDescription?.trim() || ''
  if (trimmedDescription.length < INSUFFICIENT_DESCRIPTION_MIN_LENGTH) {
    return true
  }

  // Count total extractable items across all requirement categories
  const totalItems =
    requirements.skills.length +
    requirements.responsibilities.length +
    requirements.qualifications.length +
    requirements.niceToHaves.length

  // Check if there are too few extractable items
  if (totalItems < INSUFFICIENT_ITEMS_MIN_COUNT) {
    return true
  }

  return false
}
