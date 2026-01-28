/**
 * Iterative CV Generator
 *
 * Implements retry logic for CV generation when quality is below threshold.
 * Uses job requirements extraction, relevance scoring, and generation logging
 * to produce the best possible CV content through iterative refinement.
 *
 * Maximum 3 attempts (initial + 2 retries). Returns the best-scoring attempt.
 */

import { extractJobRequirements, type JobRequirements } from './job-requirements-extractor'
import { calculateRelevanceScore, type ResumeContent } from './relevance-scorer'
import { logGenerationAttempt, type GenerationGap } from '@/lib/supabase/generation-logs'
import { QUALITY_THRESHOLD } from '@/lib/constants'
import type { QualityAnalysis } from '@/types/quality-analysis'

/**
 * Maximum number of generation attempts allowed.
 * Initial attempt + 2 retries = 3 total.
 */
const MAX_ITERATIONS = 3

/**
 * Parameters required for CV generation with retry logic.
 */
export interface GenerationParams {
  /** The job description text to generate CV content from */
  jobDescription: string
  /** Locale code for the target language (en, fr, de, it) */
  locale: string
  /** ID of the user requesting the generation */
  userId: string
  /** ID of the resume being generated or updated */
  resumeId: string
  /** Optional job ID for tracking (external job ID or job_application ID) */
  jobId?: string
}

/**
 * Generated CV content structure.
 * Matches the output format from generateResumeFromJobDescription.
 */
export interface GeneratedContent {
  /** Professional summary text */
  summary: string
  /** Array of work experience entries */
  experience: Array<{
    company: string
    position: string
    startDate: string
    endDate: string
    current: boolean
    description: string
    achievements: string[]
  }>
  /** Array of skill categories with items */
  skills: Array<{
    category: string
    items: string[]
  }>
  /** Array of project entries */
  projects: Array<{
    name: string
    description: string
    technologies: string[]
    url?: string
  }>
}

/**
 * Result of the iterative generation process.
 */
export interface GenerationResult {
  /** The generated CV content */
  content: GeneratedContent
  /** Quality analysis of the final content */
  analysis: QualityAnalysis
  /** Number of iterations used (1-3) */
  iterationsUsed: number
}

/**
 * Internal tracking for generation attempts.
 */
interface GenerationAttempt {
  content: GeneratedContent
  analysis: QualityAnalysis
  iteration: number
}

/**
 * Generates CV content based on a job description.
 *
 * This is a placeholder function that will be replaced with actual AI generation.
 * Currently returns mock content for testing the iterative pipeline.
 *
 * @param jobDescription - The job description to generate content from
 * @param locale - Target language locale
 * @param _enhancedPrompt - Optional enhanced prompt with gap information for retries
 * @returns Generated CV content
 */
async function generateCVContent(
  _jobDescription: string,
  _locale: string,
  _enhancedPrompt?: string
): Promise<GeneratedContent> {
  // TODO: Wire up actual AI generation via generateResumeFromJobDescription
  // For now, return mock content that allows testing the iterative pipeline

  return {
    summary: 'Experienced professional with expertise in the required domain.',
    experience: [
      {
        company: 'Sample Company',
        position: 'Senior Position',
        startDate: '2020-01',
        endDate: '',
        current: true,
        description: 'Led key initiatives and delivered measurable results.',
        achievements: [
          'Achieved significant improvements in key metrics',
          'Led cross-functional teams successfully',
        ],
      },
    ],
    skills: [
      {
        category: 'Technical Skills',
        items: ['Skill 1', 'Skill 2', 'Skill 3'],
      },
    ],
    projects: [],
  }
}

/**
 * Converts GeneratedContent to ResumeContent format for scoring.
 *
 * @param content - The generated CV content
 * @returns ResumeContent compatible with the relevance scorer
 */
function toResumeContent(content: GeneratedContent): ResumeContent {
  return {
    summary: content.summary,
    contact: {},
    experience: content.experience.map((exp) => ({
      company: exp.company,
      position: exp.position,
      startDate: exp.startDate,
      endDate: exp.endDate || null,
      current: exp.current,
      description: exp.description,
      achievements: exp.achievements,
      location: null,
    })),
    education: [],
    skills: content.skills.map((skill) => ({
      category: skill.category,
      items: skill.items,
      skillsHtml: null,
    })),
    projects: content.projects.map((proj) => ({
      name: proj.name,
      description: proj.description,
      technologies: proj.technologies,
      url: proj.url || null,
      startDate: null,
      endDate: null,
    })),
  }
}

/**
 * Builds an enhanced prompt incorporating gap information from previous attempts.
 *
 * @param jobDescription - Original job description
 * @param missingItems - Items that were not found in the previous attempt
 * @returns Enhanced prompt string for retry generation
 */
function buildEnhancedPrompt(
  jobDescription: string,
  missingItems: QualityAnalysis['missingItems']
): string {
  const missingSkills = missingItems
    .filter((item) => item.category === 'skill')
    .map((item) => item.item)

  const missingResponsibilities = missingItems
    .filter((item) => item.category === 'responsibility')
    .map((item) => item.item)

  const missingKeywords = missingItems
    .filter((item) => item.category === 'keyword')
    .map((item) => item.item)

  let enhancedPrompt = `${jobDescription}\n\n`
  enhancedPrompt += '--- IMPORTANT: Address the following gaps from previous analysis ---\n\n'

  if (missingSkills.length > 0) {
    enhancedPrompt += `Missing Skills (must include): ${missingSkills.join(', ')}\n\n`
  }

  if (missingResponsibilities.length > 0) {
    enhancedPrompt += `Missing Responsibilities (must address): ${missingResponsibilities.join(', ')}\n\n`
  }

  if (missingKeywords.length > 0) {
    enhancedPrompt += `Missing Keywords (should incorporate): ${missingKeywords.join(', ')}\n\n`
  }

  return enhancedPrompt
}

/**
 * Converts missing items to GenerationGap format for logging.
 *
 * @param missingItems - Missing items from quality analysis
 * @returns Array of GenerationGap objects
 */
function toGenerationGaps(missingItems: QualityAnalysis['missingItems']): GenerationGap[] {
  return missingItems.map((item) => {
    let gapType: GenerationGap['type']

    switch (item.category) {
      case 'skill':
        gapType = 'skill'
        break
      case 'responsibility':
        gapType = 'experience'
        break
      case 'keyword':
        gapType = 'keyword'
        break
      default:
        gapType = 'other'
    }

    return {
      type: gapType,
      description: item.item,
    }
  })
}

/**
 * Performs quality analysis on generated content against job requirements.
 *
 * @param content - The generated CV content
 * @param requirements - Extracted job requirements
 * @param iteration - Current iteration number
 * @returns QualityAnalysis result
 */
function analyzeQuality(
  content: GeneratedContent,
  requirements: JobRequirements,
  iteration: number
): QualityAnalysis {
  const resumeContent = toResumeContent(content)
  const relevanceScore = calculateRelevanceScore(resumeContent, requirements)

  return {
    score: relevanceScore.score,
    matchedItems: relevanceScore.matchedItems,
    missingItems: relevanceScore.missingItems,
    genericItems: relevanceScore.genericItems,
    isInsufficient: relevanceScore.score < QUALITY_THRESHOLD,
    iteration,
  }
}

/**
 * Generates CV content with automatic retry when quality is below threshold.
 *
 * This function implements an iterative refinement process:
 * 1. Extract job requirements from the description
 * 2. Generate initial CV content
 * 3. Calculate relevance score
 * 4. If score < QUALITY_THRESHOLD and iterations < 3, regenerate with enhanced prompt
 * 5. Track all attempts and return the best-scoring result
 * 6. Log each attempt for audit purposes
 *
 * @param params - Generation parameters including job description and user context
 * @returns Promise resolving to GenerationResult with best content and analysis
 * @throws Error if job requirements cannot be extracted
 *
 * @example
 * ```typescript
 * const result = await generateWithRetry({
 *   jobDescription: "We are looking for a Senior Developer...",
 *   locale: "en",
 *   userId: "user-123",
 *   resumeId: "resume-456",
 *   jobId: "job-789"
 * })
 *
 * console.log(`Score: ${result.analysis.score}`)
 * console.log(`Iterations used: ${result.iterationsUsed}`)
 * ```
 */
export async function generateWithRetry(params: GenerationParams): Promise<GenerationResult> {
  const { jobDescription, locale, userId, resumeId, jobId } = params

  // Step 1: Extract job requirements
  const requirements = await extractJobRequirements(jobDescription, locale)

  // Validate that we have meaningful requirements to work with
  const totalRequirements =
    requirements.skills.length +
    requirements.responsibilities.length +
    requirements.qualifications.length +
    requirements.niceToHaves.length

  if (totalRequirements === 0) {
    throw new Error(
      'Unable to extract meaningful requirements from job description. Please provide a more detailed job description.'
    )
  }

  // Track all attempts to find the best one
  const attempts: GenerationAttempt[] = []
  let currentIteration = 1
  let enhancedPrompt: string | undefined

  // Iterative generation loop
  while (currentIteration <= MAX_ITERATIONS) {
    try {
      // Step 2: Generate CV content
      const content = await generateCVContent(
        jobDescription,
        locale,
        currentIteration > 1 ? enhancedPrompt : undefined
      )

      // Step 3: Analyze quality
      const analysis = analyzeQuality(content, requirements, currentIteration)

      // Store this attempt
      attempts.push({ content, analysis, iteration: currentIteration })

      // Step 4: Log the attempt (non-blocking)
      logGenerationAttempt({
        userId,
        resumeId,
        jobId,
        score: analysis.score,
        gaps: toGenerationGaps(analysis.missingItems),
        iteration: currentIteration,
      }).catch((err) => {
        // Logging failures should not interrupt the generation flow
        console.error('[iterative-generator] Failed to log attempt:', err)
      })

      // Step 5: Check if quality is sufficient or max iterations reached
      if (analysis.score >= QUALITY_THRESHOLD || currentIteration >= MAX_ITERATIONS) {
        break
      }

      // Step 6: Prepare enhanced prompt for retry with gap information
      enhancedPrompt = buildEnhancedPrompt(jobDescription, analysis.missingItems)
      currentIteration++
    } catch (error) {
      // Log the error but continue to next iteration if possible
      console.error(`[iterative-generator] Generation attempt ${currentIteration} failed:`, error)

      // If this is the first attempt and it failed, we need to throw
      if (currentIteration === 1 && attempts.length === 0) {
        throw error
      }

      // Otherwise, break and return the best attempt we have
      break
    }
  }

  // Step 7: Find the best-scoring attempt
  if (attempts.length === 0) {
    throw new Error('All generation attempts failed. Please try again.')
  }

  const bestAttempt = attempts.reduce((best, current) =>
    current.analysis.score > best.analysis.score ? current : best
  )

  return {
    content: bestAttempt.content,
    analysis: bestAttempt.analysis,
    iterationsUsed: attempts.length,
  }
}
