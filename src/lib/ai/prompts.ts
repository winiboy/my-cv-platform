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

export interface JobDescriptionToResumeInput {
  jobDescription: string
  locale?: string
}

/**
 * Generate prompt for creating a resume from a job description
 */
export function buildJobDescriptionToResumePrompt(input: JobDescriptionToResumeInput): string {
  const { jobDescription, locale } = input

  // Map locale to language name
  const languageMap: Record<string, string> = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
  }

  const targetLanguage = locale && languageMap[locale] ? languageMap[locale] : 'English'

  return `You are an expert CV writer and career consultant. Analyze the following job description and create a tailored CV/resume structure optimized for this specific role.

**CRITICAL - LANGUAGE REQUIREMENT:**
- Write your ENTIRE response in ${targetLanguage}
- All sections, content, and text must be in ${targetLanguage}
- Use professional ${targetLanguage} business language and terminology
- Maintain ${targetLanguage} throughout the JSON values

**CRITICAL - OUTPUT FORMAT:**
You MUST respond with VALID JSON ONLY. No other text, explanations, or comments.
The JSON structure must be EXACTLY as shown below.

**Job Description:**
"""
${jobDescription}
"""

**Instructions:**
1. Analyze the job description carefully
2. Extract key requirements, skills, and responsibilities
3. Create a professional CV structure tailored to this role
4. Generate 2-3 relevant work experience entries that match the job requirements
5. Include all technical and soft skills mentioned in the job description
6. Create 3-5 key achievements that demonstrate relevant capabilities
7. ALL text content must be in ${targetLanguage}

**Output Structure (JSON):**
{
  "summary": "<Professional summary in HTML format (60-100 words) highlighting relevant experience and skills for this role. Use <strong>, <em>, <ul>, <li> tags for formatting. Must be in ${targetLanguage}>",
  "experience": [
    {
      "position": "<Job title in ${targetLanguage}>",
      "company": "<Company name>",
      "location": "<City, Country in ${targetLanguage}>",
      "startDate": "<YYYY-MM>",
      "endDate": "<YYYY-MM or 'Present'>",
      "current": <boolean>,
      "description": "<HTML formatted description of responsibilities and achievements using <p>, <strong>, <em>, <ul>, <li> tags. Must be in ${targetLanguage}>",
      "visible": true
    }
  ],
  "skills": [
    {
      "category": "<Skill category name in ${targetLanguage}>",
      "items": ["<skill1>", "<skill2>", "<skill3>"]
    }
  ],
  "projects": [
    {
      "name": "<Achievement title in ${targetLanguage}>",
      "description": "<HTML formatted description using <p>, <strong>, <em> tags. Must be in ${targetLanguage}>",
      "technologies": ["<skill1>", "<skill2>"],
      "visible": true
    }
  ]
}

**Important Requirements:**
1. **Experience Section:**
   - Create 2-3 realistic work experience entries
   - Each position should align with the job requirements
   - Descriptions should be in HTML format with proper formatting
   - Use bullet points (<ul><li>) for achievements
   - Include quantifiable results where appropriate
   - Dates should be in YYYY-MM format

2. **Summary Section:**
   - Must be 60-100 words
   - In HTML format with <p>, <strong>, <em> tags
   - Highlight skills and experience relevant to the job description
   - Include keywords from the job description for ATS optimization

3. **Skills Section:**
   - Organize skills into logical categories (e.g., "Programming Languages", "Frameworks", "Tools", "Soft Skills")
   - Include ALL technical skills mentioned in the job description
   - Add relevant soft skills
   - Categories must be in ${targetLanguage}

4. **Projects/Key Achievements Section:**
   - Create 3-5 achievements that demonstrate capabilities for this role
   - Each achievement should be concrete and specific
   - Use HTML formatting for descriptions
   - Link achievements to skills mentioned in the job description

5. **Language Consistency:**
   - ALL content must be in ${targetLanguage}
   - Use professional business language
   - Maintain consistent terminology throughout

**Response:**
Return ONLY the JSON object. No additional text, explanations, or formatting.`
}

export interface CoverLetterGenerationInput {
  resumeSummary?: string
  resumeExperience?: {
    position: string
    company: string
    description?: string
  }[]
  resumeSkills?: string[]
  jobDescription: string
  jobTitle: string
  companyName: string
  recipientName?: string
  recipientTitle?: string
  locale?: string
}

/**
 * Generate prompt for creating a cover letter from resume and job description
 */
export function buildCoverLetterGenerationPrompt(input: CoverLetterGenerationInput): string {
  const {
    resumeSummary,
    resumeExperience,
    resumeSkills,
    jobDescription,
    jobTitle,
    companyName,
    recipientName,
    recipientTitle,
    locale,
  } = input

  const languageMap: Record<string, string> = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
  }

  const targetLanguage = locale && languageMap[locale] ? languageMap[locale] : 'English'

  const experienceText = resumeExperience
    ?.map(exp => `- ${exp.position} at ${exp.company}${exp.description ? `: ${exp.description}` : ''}`)
    .join('\n') || 'Not provided'

  const skillsText = resumeSkills?.join(', ') || 'Not provided'

  return `You are an expert cover letter writer. Create a compelling, professional cover letter for a job application.

**CRITICAL - LANGUAGE REQUIREMENT:**
- Write the ENTIRE cover letter in ${targetLanguage}
- Use professional ${targetLanguage} business language
- Maintain ${targetLanguage} throughout

**CRITICAL - ANTI-COPY RULES:**
1. NEVER copy sentences verbatim from the job description
2. NEVER mirror the exact bullet point structure from the job posting
3. ALL content must be original, professional, and personalized
4. Focus on demonstrating relevant experience without copying

**JOB DETAILS:**
Position: ${jobTitle}
Company: ${companyName}
${recipientName ? `Recipient: ${recipientName}` : ''}
${recipientTitle ? `Recipient Title: ${recipientTitle}` : ''}

**JOB DESCRIPTION:**
"""
${jobDescription}
"""

**CANDIDATE PROFILE:**
Summary: ${resumeSummary || 'Not provided'}

Experience:
${experienceText}

Skills: ${skillsText}

**COVER LETTER STRUCTURE:**
1. **Opening Paragraph (2-3 sentences):**
   - Hook the reader with enthusiasm for the specific role
   - Mention how you learned about the position (generic is fine)
   - Brief statement of why you're a strong fit

2. **Body Paragraphs (2-3 paragraphs, 3-4 sentences each):**
   - Connect your experience to key job requirements
   - Highlight 2-3 specific achievements relevant to the role
   - Demonstrate knowledge of the company/industry
   - Show how your skills align with their needs

3. **Closing Paragraph (2-3 sentences):**
   - Reiterate interest and enthusiasm
   - Call to action (interview request)
   - Professional sign-off

**OUTPUT FORMAT (JSON):**
{
  "greeting": "<Professional greeting, e.g., 'Dear ${recipientName || 'Hiring Manager'},'>",
  "openingParagraph": "<Opening paragraph in ${targetLanguage}>",
  "bodyParagraphs": [
    "<First body paragraph>",
    "<Second body paragraph>",
    "<Third body paragraph (optional)>"
  ],
  "closingParagraph": "<Closing paragraph in ${targetLanguage}>",
  "signOff": "<Professional sign-off, e.g., 'Sincerely,' or equivalent in ${targetLanguage}>"
}

**REQUIREMENTS:**
- Total length: 250-400 words
- Tone: Professional, confident, enthusiastic
- Focus on value you bring to the company
- Be specific, not generic
- Avoid clichés and overused phrases
- ALL content in ${targetLanguage}

**Response:**
Return ONLY the JSON object. No additional text.`
}

export interface CoverLetterCheckerInput {
  openingParagraph?: string
  bodyParagraphs?: string[]
  closingParagraph?: string
  jobDescription: string
  jobTitle: string
  companyName: string
  locale?: string
}

/**
 * Generate prompt for analyzing and scoring a cover letter
 */
export function buildCoverLetterCheckerPrompt(input: CoverLetterCheckerInput): string {
  const {
    openingParagraph,
    bodyParagraphs,
    closingParagraph,
    jobDescription,
    jobTitle,
    companyName,
    locale,
  } = input

  const languageMap: Record<string, string> = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
  }

  const targetLanguage = locale && languageMap[locale] ? languageMap[locale] : 'English'

  const fullCoverLetter = [
    openingParagraph,
    ...(bodyParagraphs || []),
    closingParagraph,
  ].filter(Boolean).join('\n\n')

  return `You are an expert career coach and cover letter reviewer. Analyze the following cover letter and provide detailed feedback.

**JOB CONTEXT:**
Position: ${jobTitle}
Company: ${companyName}

**JOB DESCRIPTION:**
"""
${jobDescription}
"""

**COVER LETTER TO ANALYZE:**
"""
${fullCoverLetter}
"""

**ANALYSIS CRITERIA:**

1. **Content Alignment (0-25 points):**
   - How well does the letter address job requirements?
   - Are relevant skills and experiences highlighted?
   - Is there evidence of company research?

2. **Structure & Format (0-25 points):**
   - Is the opening engaging?
   - Are body paragraphs well-organized?
   - Is the closing strong with a clear call to action?

3. **Language & Tone (0-25 points):**
   - Is the tone professional and confident?
   - Is the language clear and concise?
   - Are there any grammar or spelling issues?

4. **Keyword Coverage (0-25 points):**
   - Are key skills from the job description mentioned?
   - Are industry-relevant terms used appropriately?

**OUTPUT FORMAT (JSON):**
{
  "score": <number 0-100>,
  "strengths": [
    "<strength 1 in ${targetLanguage}>",
    "<strength 2 in ${targetLanguage}>",
    "<strength 3 in ${targetLanguage}>"
  ],
  "weaknesses": [
    "<weakness 1 in ${targetLanguage}>",
    "<weakness 2 in ${targetLanguage}>"
  ],
  "suggestions": [
    "<actionable suggestion 1 in ${targetLanguage}>",
    "<actionable suggestion 2 in ${targetLanguage}>",
    "<actionable suggestion 3 in ${targetLanguage}>"
  ],
  "keywordCoverage": <number 0-100>,
  "matchedKeywords": ["<keyword1>", "<keyword2>", "<keyword3>"],
  "missingKeywords": ["<keyword1>", "<keyword2>"]
}

**REQUIREMENTS:**
- Be specific and actionable in feedback
- Provide at least 2-3 items for each category
- Score fairly but honestly
- All text output must be in ${targetLanguage}

**Response:**
Return ONLY the JSON object. No additional text.`
}

export interface ResumeAdaptationInput {
  currentSummary: string
  currentExperience: {
    position: string
    company: string
    startDate: string
    endDate?: string
    current: boolean
    location?: string
    description?: string
    achievements?: string[]
  }[]
  currentSkills: {
    category: string
    items: string[]
  }[]
  jobDescription: string
  jobTitle: string
  company: string
  locale: string
}

/**
 * Generate prompt for adapting an existing resume to a job description
 * This creates targeted patches (not full rewrites) with confidence scoring
 */
export function buildResumeAdaptationPrompt(input: ResumeAdaptationInput): string {
  const {
    currentSummary,
    currentExperience,
    currentSkills,
    jobDescription,
    jobTitle,
    company,
    locale,
  } = input

  // Map locale to language name
  const languageMap: Record<string, string> = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
  }

  const targetLanguage = locale && languageMap[locale] ? languageMap[locale] : 'English'

  // Format current experience for prompt
  const currentExpFormatted = currentExperience
    .slice(0, 1) // Only use most recent experience
    .map(exp => `
Position: ${exp.position}
Company: ${exp.company}
Duration: ${exp.startDate} - ${exp.current ? 'Present' : (exp.endDate || 'N/A')}
Description: ${exp.description || 'No description provided'}
`)
    .join('\n')

  // Format current skills for prompt
  const currentSkillsFormatted = currentSkills
    .map(cat => `${cat.category}: ${cat.items.join(', ')}`)
    .join('\n')

  return `You are an expert CV consultant specializing in tailoring resumes to specific job opportunities.

**CRITICAL - ANTI-COPY RULES (MANDATORY):**
1. NEVER copy sentences verbatim from the job description
2. NEVER mirror the bullet point structure from the job posting
3. NEVER use exact phrases from the requirements section
4. ALL content must be:
   - Abstracted and synthesized
   - Rewritten in CV-appropriate language
   - Focused on demonstrating relevant experience/skills
   - Original and professional

**TASK:**
Analyze the job description and suggest TARGETED adaptations to the candidate's existing CV.

**JOB DESCRIPTION:**
"""
${jobDescription}
"""

**TARGET ROLE:**
Position: ${jobTitle}
Company: ${company}

**CURRENT CV CONTENT:**

Summary:
${currentSummary || 'No summary provided'}

Most Recent Experience:
${currentExpFormatted || 'No experience provided'}

Current Skills:
${currentSkillsFormatted || 'No skills provided'}

**ADAPTATION STRATEGY:**

1. **Summary Adaptation:**
   - Rewrite to emphasize relevant experience for THIS specific role
   - Highlight transferable skills that match job requirements
   - Reference domain-relevant achievements
   - Use keywords from job description (abstracted, not copied)
   - Keep 60-100 words
   - Write in ${targetLanguage}

2. **Experience Description Adaptation:**
   - Adapt the MOST RECENT role to align with job requirements
   - Emphasize responsibilities matching the job posting
   - Reframe achievements to show relevant capabilities
   - DO NOT invent new facts or achievements
   - DO NOT copy job description text
   - Write in ${targetLanguage}

3. **Skills Analysis:**
   - Identify hard skills mentioned in job description (if not already present)
   - Identify inferred soft skills (e.g., "team collaboration" if job mentions "cross-functional teams")
   - Suggest new skill categories if needed
   - NEVER remove existing skills
   - Write skill names in ${targetLanguage}

4. **Confidence Scoring:**
   - HIGH: Change is clearly justified and well-aligned with current experience
   - MEDIUM: Change is reasonable but requires judgment, involves transferable skills
   - LOW: Uncertain or speculative change, significant gaps in qualifications

**CRITICAL - LANGUAGE REQUIREMENT:**
- ALL proposed text must be in ${targetLanguage}
- Maintain professional business language
- Use industry-appropriate terminology

**OUTPUT FORMAT (JSON ONLY):**
{
  "patches": {
    "summary": {
      "original": "<current summary text>",
      "proposed": "<adapted summary in ${targetLanguage}>",
      "confidence": "high" | "medium" | "low",
      "reasoning": "<brief explanation of why this change was suggested>"
    },
    "experienceDescription": {
      "original": "<current description text>",
      "proposed": "<adapted description in ${targetLanguage}>",
      "confidence": "high" | "medium" | "low",
      "reasoning": "<brief explanation>",
      "experienceIndex": 0
    },
    "skillsToAdd": [
      {
        "category": "<category name in ${targetLanguage}>",
        "items": ["<skill1>", "<skill2>"],
        "confidence": "high" | "medium" | "low",
        "reasoning": "<brief explanation>"
      }
    ],
    "skillsToEnhance": [
      {
        "category": "<existing category name>",
        "itemsToAdd": ["<skill1>", "<skill2>"],
        "confidence": "high" | "medium" | "low",
        "reasoning": "<brief explanation>"
      }
    ]
  },
  "analysis": {
    "matchScore": <number 0-100>,
    "keyGaps": ["<gap1>", "<gap2>"],
    "strengths": ["<strength1>", "<strength2>"]
  }
}

**IMPORTANT CONSTRAINTS:**
- If a section cannot be improved or is already well-aligned, OMIT that patch from the output
- Only include patches where you have high or medium confidence
- Low confidence patches should be omitted unless critically important
- If the CV already aligns well with the job, you may return minimal or no patches
- DO NOT invent facts, achievements, or experiences not present in the current CV
- Focus on REFRAMING and EMPHASIZING existing content, not creating new content

**Response:**
Return ONLY the JSON object. No additional text, explanations, or formatting.`
}

