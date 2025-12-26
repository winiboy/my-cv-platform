/**
 * AI Prompts for Resume Transformations
 * Based on specifications in AI_TRANSFORMATION_LOGIC.md
 */

export interface TransformSummaryInput {
  rawSummary: string
  currentRole?: string
  yearsOfExperience?: number
  topSkills?: string[]
  locale?: string
}

/**
 * Generate prompt for transforming a resume summary
 */
export function buildSummaryPrompt(input: TransformSummaryInput): string {
  const { rawSummary, currentRole, yearsOfExperience, topSkills, locale } = input

  // Map locale to language name
  const languageMap: Record<string, string> = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
  }

  const targetLanguage = locale && languageMap[locale] ? languageMap[locale] : null

  return `You are a professional CV writer specializing in creating impactful, ATS-optimized resume summaries.

Transform the following raw summary into a professional, compelling summary that follows these rules:

**CRITICAL - LANGUAGE REQUIREMENT:**
${targetLanguage
  ? `- Write your response ENTIRELY in ${targetLanguage}
- Maintain ${targetLanguage} throughout your entire response
- Use professional ${targetLanguage} business language and terminology`
  : `- Detect the language of the provided summary text
- Write your response in THE SAME LANGUAGE as the input text
- If the input is in French, respond in French
- If the input is in German, respond in German
- If the input is in English, respond in English
- Maintain the same language throughout your entire response`}

**RULES:**
1. **Length:** 60-100 words (3-4 sentences maximum)
2. **Structure:**
   - Sentence 1: Professional title + years of experience + domain
   - Sentence 2: Top quantifiable achievement (with metrics if available)
   - Sentence 3: Key expertise areas
   - Sentence 4: Value proposition for future employer
3. **Style:**
   - Use strong action verbs (Drove, Spearheaded, Led, Delivered)
   - Include specific metrics when possible
   - Maintain professional tone
   - Optimize for ATS with relevant keywords
4. **Constraints:**
   - Do NOT invent facts or metrics
   - Only enhance the writing, don't create new information
   - Keep it truthful and authentic

**Context:**
${currentRole ? `- Current Role: ${currentRole}` : ''}
${yearsOfExperience ? `- Years of Experience: ${yearsOfExperience}` : ''}
${topSkills && topSkills.length > 0 ? `- Top Skills: ${topSkills.join(', ')}` : ''}

**Raw Summary:**
"""
${rawSummary}
"""

**Instructions:**
Transform the raw summary above into a professional, ATS-optimized summary following all the rules.
Return ONLY the transformed summary text, nothing else. Do not include explanations, comments, or additional text.

**Transformed Summary:**`
}

export interface TransformExperienceInput {
  position: string
  company: string
  description?: string
  achievements?: string[]
  locale?: string
}

/**
 * Generate prompt for transforming experience achievements
 */
export function buildExperiencePrompt(input: TransformExperienceInput): string {
  const { position, company, description, achievements, locale } = input

  // Map locale to language name
  const languageMap: Record<string, string> = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
  }

  const targetLanguage = locale && languageMap[locale] ? languageMap[locale] : null

  return `You are a professional CV writer specializing in creating impactful, results-oriented achievement statements.

Transform the following job experience into 3-5 powerful achievement bullets using the STAR method (Situation, Task, Action, Result).

**CRITICAL - LANGUAGE REQUIREMENT:**
${targetLanguage
  ? `- Write your response ENTIRELY in ${targetLanguage}
- Maintain ${targetLanguage} throughout your entire response
- Use professional ${targetLanguage} business language and terminology`
  : `- Detect the language of the provided description/achievements text
- Write your response in THE SAME LANGUAGE as the input text
- If the input is in French, respond in French
- If the input is in German, respond in German
- If the input is in English, respond in English
- Maintain the same language throughout your entire response`}

**RULES:**
1. **Structure:** [Action Verb] + [What you did] + [How/Method] + [Quantifiable Result]
2. **Length:** Each bullet should be 1-2 lines (max 150 characters)
3. **Verbs:** Use strong action verbs appropriate for the seniority level
4. **Metrics:** Include quantifiable results whenever possible (%, $, time saved, etc.)
5. **Impact:** Focus on business impact and measurable outcomes
6. **Constraints:**
   - Do NOT invent facts, numbers, or accomplishments
   - Only enhance clarity and impact of existing information
   - If no metrics exist, focus on scope and responsibility

**Job Details:**
- Position: ${position}
- Company: ${company}
${description ? `- Description: ${description}` : ''}

**Current Achievements:**
${achievements && achievements.length > 0 ? achievements.map((a, i) => `${i + 1}. ${a}`).join('\n') : 'None provided'}

**Instructions:**
Transform the above into 3-5 achievement bullets that are compelling, quantifiable, and impactful.
Return ONLY the bullet points, one per line, starting with a bullet character (•).
Do not include explanations, comments, or additional text.

**Transformed Achievements:**`
}

export interface TranslateSummaryInput {
  summary: string
  targetLanguage: 'fr' | 'de' | 'en' | 'it'
  sourceLanguage?: 'fr' | 'de' | 'en' | 'it'
}

/**
 * Generate prompt for translating a resume summary
 */
export function buildTranslationPrompt(input: TranslateSummaryInput): string {
  const { summary, targetLanguage, sourceLanguage } = input

  const languageNames = {
    fr: 'French',
    de: 'German',
    en: 'English',
    it: 'Italian',
  }

  const languageContext = {
    fr: 'Use professional French business language. Maintain formal tone.',
    de: 'Use professional German business language. Maintain formal tone.',
    en: 'Use professional English (US/UK) business language. Maintain formal tone.',
    it: 'Use professional Italian business language. Maintain formal tone.',
  }

  return `You are a professional translator specializing in resume and CV translations.

Translate the following resume summary to ${languageNames[targetLanguage]}.

**RULES:**
1. **Maintain Professional Tone:** Keep the same level of professionalism and formality
2. **Preserve Meaning:** Do not add or remove information
3. **Natural Flow:** The translation should read naturally in ${languageNames[targetLanguage]}, not like a word-for-word translation
4. **Business Context:** Use appropriate business and professional terminology
5. **Length:** Keep similar length to the original (±10%)
6. **Format:** Return ONLY the translated text, no explanations or comments
7. **CRITICAL - Preserve Structure:**
   - Maintain ALL line breaks and paragraph structure EXACTLY as in the original
   - Preserve bullet points (•, -, *) and their formatting
   - Keep numbered lists intact (1., 2., 3., etc.)
   - Maintain spacing and indentation
   - If the original has multiple paragraphs, your translation MUST have the same number of paragraphs
   - If the original has bullet points, your translation MUST have bullet points in the same positions

**Target Language Context:**
${languageContext[targetLanguage]}

**Example of Structure Preservation:**
If the original text is:
"Experienced developer with 5 years of experience.

Key achievements:
• Led a team of 5 developers
• Increased performance by 40%
• Delivered 10+ projects"

Your translation MUST maintain the exact same structure:
"[Translated first line]

[Translated "Key achievements:"]
• [Translated bullet 1]
• [Translated bullet 2]
• [Translated bullet 3]"

**Original Summary:**
"""
${summary}
"""

**Instructions:**
Translate the above summary to ${languageNames[targetLanguage]}.
Return ONLY the translated text, nothing else.
IMPORTANT: Preserve ALL formatting, line breaks, and bullet points exactly as shown in the original.

**Translated Summary (${languageNames[targetLanguage]}):**`
}
