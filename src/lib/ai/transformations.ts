import { generateCompletion, MODELS } from './client'
import {
  buildSummaryPrompt,
  buildExperiencePrompt,
  buildTranslationPrompt,
  type TransformSummaryInput,
  type TransformExperienceInput,
  type TranslateSummaryInput,
} from './prompts'

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
