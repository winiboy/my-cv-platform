import { generateCompletion, MODELS } from './client'
import {
  buildSummaryPrompt,
  buildExperiencePrompt,
  buildTranslationPrompt,
  buildJobDescriptionToResumePrompt,
  buildResumeAdaptationPrompt,
  type TransformSummaryInput,
  type TransformExperienceInput,
  type TranslateSummaryInput,
  type JobDescriptionToResumeInput,
  type ResumeAdaptationInput,
} from './prompts'
import type { CVAdaptationPatch } from '@/types/cv-adaptation'
import type { Resume, ResumeExperience, ResumeSkillCategory } from '@/types/database'

/**
 * Transform a resume summary using AI
 */
export async function transformSummary(input: TransformSummaryInput) {
  const prompt = buildSummaryPrompt(input)

  const result = await generateCompletion(prompt, {
    model: MODELS.BALANCED,
    temperature: 0.7,
    maxTokens: 300,
  })

  return {
    transformedSummary: result.text.trim(),
    wordCount: result.text.trim().split(/\s+/).length,
    tokensUsed: result.usage?.total_tokens || 0,
  }
}

/**
 * Transform experience achievements using AI
 */
export async function transformExperience(input: TransformExperienceInput) {
  const prompt = buildExperiencePrompt(input)

  const result = await generateCompletion(prompt, {
    model: MODELS.BALANCED,
    temperature: 0.7,
    maxTokens: 500,
  })

  // Parse the bullet points from the response
  const achievements = result.text
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
    .filter((line) => line.length > 0)

  return {
    transformedAchievements: achievements,
    count: achievements.length,
    tokensUsed: result.usage?.total_tokens || 0,
  }
}

/**
 * Translate a resume summary to a different language
 */
export async function translateSummary(input: TranslateSummaryInput) {
  const prompt = buildTranslationPrompt(input)

  const result = await generateCompletion(prompt, {
    model: MODELS.BALANCED,
    temperature: 0.3, // Lower temperature for more accurate translation
    maxTokens: 400,
  })

  return {
    translatedSummary: result.text.trim(),
    targetLanguage: input.targetLanguage,
    tokensUsed: result.usage?.total_tokens || 0,
  }
}

/**
 * Optimize a description text (make it more professional and impactful)
 */
export async function optimizeDescription(input: { text: string; context?: string; locale?: string }) {
  // Map locale to language name
  const languageMap: Record<string, string> = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
  }

  const targetLanguage = input.locale && languageMap[input.locale] ? languageMap[input.locale] : null

  const prompt = `You are an expert resume writer. Optimize the following text to make it more professional, impactful, and concise while preserving the original language.

**CRITICAL - LANGUAGE REQUIREMENT:**
${targetLanguage
  ? `- Write your response ENTIRELY in ${targetLanguage}
- Maintain ${targetLanguage} throughout your entire response
- Use professional ${targetLanguage} business language and terminology`
  : `- Detect the language of the provided text
- Write your response in THE SAME LANGUAGE as the input text
- If the input is in French, respond in French
- If the input is in German, respond in German
- If the input is in English, respond in English
- Maintain the same language throughout your entire response`}

${input.context ? `Context: ${input.context}\n\n` : ''}Original text:
${input.text}

Please improve this text by:
1. Making it more professional and impactful
2. Using strong action verbs
3. Quantifying achievements where possible
4. Removing filler words
5. Maintaining the same structure (paragraphs, line breaks, bullet points)
6. Keeping it concise yet comprehensive

Provide ONLY the optimized text without any introduction or explanation.`

  const result = await generateCompletion(prompt, {
    model: MODELS.BALANCED,
    temperature: 0.7,
    maxTokens: 500,
  })

  return {
    optimizedText: result.text.trim(),
    tokensUsed: result.usage?.total_tokens || 0,
  }
}

/**
 * Generate resume content from a job description
 */
export async function generateResumeFromJobDescription(input: JobDescriptionToResumeInput) {
  const prompt = buildJobDescriptionToResumePrompt(input)

  const result = await generateCompletion(prompt, {
    model: MODELS.BALANCED,
    temperature: 0.7,
    maxTokens: 2000,
  })

  // Parse JSON response
  let parsedContent
  try {
    // Try to extract JSON from the response
    const text = result.text.trim()

    // Sometimes the AI wraps JSON in markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    const jsonText = jsonMatch ? jsonMatch[1] : text

    parsedContent = JSON.parse(jsonText)
  } catch (error) {
    console.error('Failed to parse JSON response:', error)
    console.error('Raw response:', result.text)
    throw new Error('Failed to parse AI response. Please try again.')
  }

  // Validate and sanitize the response
  const resumeData = {
    summary: parsedContent.summary || '',
    experience: Array.isArray(parsedContent.experience) ? parsedContent.experience : [],
    skills: Array.isArray(parsedContent.skills) ? parsedContent.skills : [],
    projects: Array.isArray(parsedContent.projects) ? parsedContent.projects : [],
  }

  return {
    resumeData,
    tokensUsed: result.usage?.total_tokens || 0,
  }
}

/**
 * Input for adapting an existing resume to a job description
 */
export interface AdaptResumeInput {
  currentResume: Resume
  jobDescription: string
  jobTitle: string
  company: string
  locale: string
}

/**
 * Adapt an existing resume to a specific job description
 * Creates targeted patches (not full rewrites) with confidence scoring
 */
export async function adaptResumeToJobDescription(input: AdaptResumeInput) {
  const { currentResume, jobDescription, jobTitle, company, locale } = input

  // Extract current CV content
  const currentSummary = currentResume.summary || ''
  const currentExperience = (Array.isArray(currentResume.experience) ? currentResume.experience : []) as unknown as ResumeExperience[]
  const currentSkills = (Array.isArray(currentResume.skills) ? currentResume.skills : []) as unknown as ResumeSkillCategory[]

  // Build the prompt
  const prompt = buildResumeAdaptationPrompt({
    currentSummary,
    currentExperience,
    currentSkills,
    jobDescription,
    jobTitle,
    company,
    locale,
  })

  // Call AI
  const result = await generateCompletion(prompt, {
    model: MODELS.BALANCED,
    temperature: 0.7,
    maxTokens: 2000,
  })

  // Parse JSON response
  let parsedContent
  try {
    // Try to extract JSON from the response
    const text = result.text.trim()

    // Sometimes the AI wraps JSON in markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    const jsonText = jsonMatch ? jsonMatch[1] : text

    parsedContent = JSON.parse(jsonText)
  } catch (error) {
    console.error('Failed to parse JSON response:', error)
    console.error('Raw response:', result.text)
    throw new Error('Failed to parse AI response. Please try again.')
  }

  // Construct the patch with validation
  const patch: CVAdaptationPatch = {
    jobTitle,
    company,
    jobDescription,
    createdAt: new Date().toISOString(),
    locale,
    patches: {
      summary: parsedContent.patches?.summary || undefined,
      experienceDescription: parsedContent.patches?.experienceDescription || undefined,
      skillsToAdd: Array.isArray(parsedContent.patches?.skillsToAdd)
        ? parsedContent.patches.skillsToAdd
        : undefined,
      skillsToEnhance: Array.isArray(parsedContent.patches?.skillsToEnhance)
        ? parsedContent.patches.skillsToEnhance
        : undefined,
    },
    analysis: {
      matchScore: parsedContent.analysis?.matchScore || 0,
      keyGaps: Array.isArray(parsedContent.analysis?.keyGaps) ? parsedContent.analysis.keyGaps : [],
      strengths: Array.isArray(parsedContent.analysis?.strengths)
        ? parsedContent.analysis.strengths
        : [],
    },
  }

  return {
    patch,
    tokensUsed: result.usage?.total_tokens || 0,
  }
}
