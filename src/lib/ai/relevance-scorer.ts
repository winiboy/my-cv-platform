/**
 * Relevance Scoring Utility
 *
 * Calculates a deterministic relevance score comparing CV content against
 * extracted job requirements. This utility uses pure algorithmic text matching
 * (no AI) to ensure consistent, reproducible scoring.
 *
 * Scoring weights:
 * - Skills coverage: 40%
 * - Responsibilities coverage: 40%
 * - Keyword presence: 20%
 */

import type { JobRequirements } from './job-requirements-extractor'
import type {
  ResumeContact,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
  ResumeProject,
  ResumeCertification,
} from '@/types/database'
import type { Json } from '@/types/supabase'

/**
 * Structured content extracted from a resume for scoring purposes.
 * This interface represents the relevant fields from a Resume that
 * are used for relevance comparison against job requirements.
 */
export interface ResumeContent {
  /** Professional summary text */
  summary: string | null
  /** Contact information including name and role */
  contact: ResumeContact | Json
  /** Work experience entries */
  experience: ResumeExperience[] | Json
  /** Education entries */
  education: ResumeEducation[] | Json
  /** Skills organized by category */
  skills: ResumeSkillCategory[] | Json
  /** Project entries */
  projects?: ResumeProject[] | Json
  /** Certification entries */
  certifications?: ResumeCertification[] | Json
}

/**
 * Represents a single matched or missing item with metadata
 * for detailed analysis feedback.
 */
export interface ScoringItem {
  /** The item text (skill, responsibility, or keyword) */
  item: string
  /** Category of the item for grouping in reports */
  category: 'skill' | 'responsibility' | 'keyword'
  /** Where the match was found in the CV (if matched) */
  matchedIn?: string
}

/**
 * Result of relevance scoring between CV content and job requirements.
 * All scores are deterministic - same inputs always produce same outputs.
 */
export interface RelevanceScore {
  /** Overall relevance score from 0-100 */
  score: number
  /** Breakdown of individual scoring components */
  breakdown: {
    /** Skills coverage score (0-40) */
    skillsScore: number
    /** Responsibilities coverage score (0-40) */
    responsibilitiesScore: number
    /** Keyword presence score (0-20) */
    keywordScore: number
  }
  /** Items from job requirements that were found in the CV */
  matchedItems: ScoringItem[]
  /** Items from job requirements that were NOT found in the CV */
  missingItems: ScoringItem[]
  /** Generic or overly common items that may not add value */
  genericItems: ScoringItem[]
}

/**
 * Scoring weight constants (must sum to 100)
 */
const SCORING_WEIGHTS = {
  SKILLS: 40,
  RESPONSIBILITIES: 40,
  KEYWORDS: 20,
} as const

/**
 * Minimum match threshold for fuzzy text matching (0-1 scale).
 * A value of 0.6 means 60% of words must match for a positive match.
 */
const FUZZY_MATCH_THRESHOLD = 0.6

/**
 * Common words that should be excluded from keyword matching
 * to avoid false positives.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
  'these', 'those', 'it', 'its', 'i', 'you', 'we', 'they', 'he', 'she',
  'who', 'which', 'what', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'now', 'our', 'your', 'their', 'any', 'etc',
])

/**
 * Generic terms that may indicate low-value matches.
 * Items containing primarily these terms are flagged as generic.
 */
const GENERIC_TERMS = new Set([
  'communication', 'teamwork', 'team player', 'hard worker', 'motivated',
  'detail oriented', 'detail-oriented', 'self-starter', 'proactive',
  'problem solving', 'problem-solving', 'time management', 'organized',
  'flexible', 'adaptable', 'quick learner', 'passionate', 'dedicated',
  'responsible', 'reliable', 'professional', 'excellent',
])

/**
 * Normalizes text for consistent comparison.
 * Converts to lowercase, removes punctuation, and trims whitespace.
 *
 * @param text - The text to normalize
 * @returns Normalized text string
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ') // Replace punctuation with spaces (keep hyphens)
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim()
}

/**
 * Extracts meaningful words from text, removing stop words.
 *
 * @param text - The text to extract words from
 * @returns Array of meaningful words
 */
function extractWords(text: string): string[] {
  const normalized = normalizeText(text)
  return normalized
    .split(' ')
    .filter(word => word.length > 1 && !STOP_WORDS.has(word))
}

/**
 * Strips HTML tags from text content.
 *
 * @param html - HTML string to strip
 * @returns Plain text without HTML tags
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Checks if an item contains primarily generic terms.
 *
 * @param item - The item text to check
 * @returns True if the item is considered generic
 */
function isGenericItem(item: string): boolean {
  const normalized = normalizeText(item)
  return GENERIC_TERMS.has(normalized) ||
    Array.from(GENERIC_TERMS).some(term => normalized.includes(term))
}

/**
 * Calculates word overlap ratio between two texts.
 * Uses Jaccard-like similarity based on word intersection.
 *
 * @param text1 - First text to compare
 * @param text2 - Second text to compare
 * @returns Similarity ratio from 0 to 1
 */
function calculateWordOverlap(text1: string, text2: string): number {
  const words1 = new Set(extractWords(text1))
  const words2 = new Set(extractWords(text2))

  if (words1.size === 0 || words2.size === 0) {
    return 0
  }

  let matchCount = 0
  for (const word of words1) {
    if (words2.has(word)) {
      matchCount++
    }
  }

  // Return ratio of matched words from the smaller set
  const minSize = Math.min(words1.size, words2.size)
  return matchCount / minSize
}

/**
 * Checks if a requirement item is present in the CV content.
 * Uses fuzzy matching to account for variations in wording.
 *
 * @param requirementItem - The requirement to search for
 * @param cvTextSections - Array of text sections from the CV to search in
 * @returns Object indicating if matched and where
 */
function findMatchInCV(
  requirementItem: string,
  cvTextSections: { text: string; source: string }[]
): { matched: boolean; matchedIn?: string } {
  const normalizedRequirement = normalizeText(requirementItem)

  for (const section of cvTextSections) {
    const normalizedSection = normalizeText(section.text)

    // Direct substring match
    if (normalizedSection.includes(normalizedRequirement)) {
      return { matched: true, matchedIn: section.source }
    }

    // Fuzzy word overlap match
    const overlap = calculateWordOverlap(requirementItem, section.text)
    if (overlap >= FUZZY_MATCH_THRESHOLD) {
      return { matched: true, matchedIn: section.source }
    }

    // Check individual words from requirement in section
    const requirementWords = extractWords(requirementItem)
    if (requirementWords.length > 0) {
      const sectionWords = new Set(extractWords(section.text))
      const matchedWords = requirementWords.filter(word => sectionWords.has(word))
      const matchRatio = matchedWords.length / requirementWords.length

      if (matchRatio >= FUZZY_MATCH_THRESHOLD) {
        return { matched: true, matchedIn: section.source }
      }
    }
  }

  return { matched: false }
}

/**
 * Safely extracts array from JSONB field.
 *
 * @param jsonField - The JSON field that may be an array
 * @returns Array or empty array if not valid
 */
function safeJsonArray<T>(jsonField: T[] | Json | undefined): T[] {
  if (Array.isArray(jsonField)) {
    return jsonField as T[]
  }
  return []
}

/**
 * Extracts all searchable text sections from CV content.
 * Each section is labeled with its source for match reporting.
 *
 * @param cvContent - The resume content to extract from
 * @returns Array of text sections with source labels
 */
function extractCVTextSections(
  cvContent: ResumeContent
): { text: string; source: string }[] {
  const sections: { text: string; source: string }[] = []

  // Summary
  if (cvContent.summary) {
    sections.push({ text: cvContent.summary, source: 'Summary' })
  }

  // Contact (may contain job title or role)
  const contact = cvContent.contact as ResumeContact | null
  if (contact) {
    if (contact.name) {
      sections.push({ text: contact.name, source: 'Contact' })
    }
  }

  // Experience
  const experience = safeJsonArray<ResumeExperience>(cvContent.experience)
  for (const exp of experience) {
    if (exp.position) {
      sections.push({ text: exp.position, source: 'Experience (Position)' })
    }
    if (exp.description) {
      sections.push({ text: stripHtml(exp.description), source: 'Experience (Description)' })
    }
    if (exp.achievements && Array.isArray(exp.achievements)) {
      for (const achievement of exp.achievements) {
        sections.push({ text: achievement, source: 'Experience (Achievement)' })
      }
    }
  }

  // Education
  const education = safeJsonArray<ResumeEducation>(cvContent.education)
  for (const edu of education) {
    if (edu.degree) {
      sections.push({ text: edu.degree, source: 'Education (Degree)' })
    }
    if (edu.field) {
      sections.push({ text: edu.field, source: 'Education (Field)' })
    }
    if (edu.description) {
      sections.push({ text: stripHtml(edu.description), source: 'Education (Description)' })
    }
  }

  // Skills
  const skills = safeJsonArray<ResumeSkillCategory>(cvContent.skills)
  for (const skillCategory of skills) {
    if (skillCategory.category) {
      sections.push({ text: skillCategory.category, source: 'Skills (Category)' })
    }
    if (skillCategory.skillsHtml) {
      sections.push({ text: stripHtml(skillCategory.skillsHtml), source: 'Skills' })
    }
    if (skillCategory.items && Array.isArray(skillCategory.items)) {
      for (const item of skillCategory.items) {
        sections.push({ text: item, source: 'Skills' })
      }
    }
  }

  // Projects
  const projects = safeJsonArray<ResumeProject>(cvContent.projects)
  for (const project of projects) {
    if (project.name) {
      sections.push({ text: project.name, source: 'Projects (Name)' })
    }
    if (project.description) {
      sections.push({ text: stripHtml(project.description), source: 'Projects (Description)' })
    }
    if (project.technologies && Array.isArray(project.technologies)) {
      for (const tech of project.technologies) {
        sections.push({ text: tech, source: 'Projects (Technology)' })
      }
    }
  }

  // Certifications
  const certifications = safeJsonArray<ResumeCertification>(cvContent.certifications)
  for (const cert of certifications) {
    if (cert.name) {
      sections.push({ text: cert.name, source: 'Certifications' })
    }
    if (cert.issuer) {
      sections.push({ text: cert.issuer, source: 'Certifications (Issuer)' })
    }
  }

  return sections
}

/**
 * Extracts keywords from job requirements for keyword presence scoring.
 * Combines skills, responsibilities, and qualifications into a keyword set.
 *
 * @param requirements - The job requirements to extract keywords from
 * @returns Array of unique keywords
 */
function extractKeywordsFromRequirements(requirements: JobRequirements): string[] {
  const allText = [
    ...requirements.skills,
    ...requirements.responsibilities,
    ...requirements.qualifications,
    ...requirements.niceToHaves,
  ].join(' ')

  const words = extractWords(allText)

  // Get unique words, sorted for determinism
  const uniqueWords = [...new Set(words)].sort()

  // Filter to keep only meaningful keywords (length >= 3)
  return uniqueWords.filter(word => word.length >= 3)
}

/**
 * Calculates the relevance score comparing CV content against job requirements.
 *
 * This function performs deterministic scoring using pure text matching algorithms.
 * The same inputs will always produce the same score.
 *
 * Scoring breakdown:
 * - Skills coverage (40%): How many required skills are present in the CV
 * - Responsibilities coverage (40%): How well CV describes relevant experience
 * - Keyword presence (20%): General keyword coverage across all requirements
 *
 * @param cvContent - The resume content to evaluate
 * @param jobRequirements - The extracted job requirements to match against
 * @returns RelevanceScore containing score, breakdown, and item analysis
 *
 * @example
 * ```typescript
 * const cvContent: ResumeContent = {
 *   summary: "Experienced software engineer...",
 *   skills: [{ category: "Programming", items: ["TypeScript", "React"] }],
 *   // ... other fields
 * }
 *
 * const requirements: JobRequirements = {
 *   skills: ["TypeScript", "React", "Node.js"],
 *   responsibilities: ["Build scalable applications"],
 *   qualifications: ["5+ years experience"],
 *   niceToHaves: ["AWS experience"]
 * }
 *
 * const result = calculateRelevanceScore(cvContent, requirements)
 * // result.score = 75
 * // result.matchedItems = [{ item: "TypeScript", category: "skill", matchedIn: "Skills" }]
 * ```
 */
export function calculateRelevanceScore(
  cvContent: ResumeContent,
  jobRequirements: JobRequirements
): RelevanceScore {
  const matchedItems: ScoringItem[] = []
  const missingItems: ScoringItem[] = []
  const genericItems: ScoringItem[] = []

  // Extract searchable text sections from CV
  const cvTextSections = extractCVTextSections(cvContent)

  // ========================================
  // Skills Scoring (40%)
  // ========================================
  let skillsMatched = 0
  const totalSkills = jobRequirements.skills.length

  for (const skill of jobRequirements.skills) {
    // Check if skill is generic
    if (isGenericItem(skill)) {
      genericItems.push({ item: skill, category: 'skill' })
      skillsMatched++ // Give credit for generic items but flag them
      continue
    }

    const match = findMatchInCV(skill, cvTextSections)
    if (match.matched) {
      skillsMatched++
      matchedItems.push({ item: skill, category: 'skill', matchedIn: match.matchedIn })
    } else {
      missingItems.push({ item: skill, category: 'skill' })
    }
  }

  const skillsScore = totalSkills > 0
    ? Math.round((skillsMatched / totalSkills) * SCORING_WEIGHTS.SKILLS)
    : SCORING_WEIGHTS.SKILLS // Full score if no skills required

  // ========================================
  // Responsibilities Scoring (40%)
  // ========================================
  let responsibilitiesMatched = 0
  const totalResponsibilities = jobRequirements.responsibilities.length

  for (const responsibility of jobRequirements.responsibilities) {
    // Check if responsibility is generic
    if (isGenericItem(responsibility)) {
      genericItems.push({ item: responsibility, category: 'responsibility' })
      responsibilitiesMatched++ // Give credit for generic items but flag them
      continue
    }

    const match = findMatchInCV(responsibility, cvTextSections)
    if (match.matched) {
      responsibilitiesMatched++
      matchedItems.push({ item: responsibility, category: 'responsibility', matchedIn: match.matchedIn })
    } else {
      missingItems.push({ item: responsibility, category: 'responsibility' })
    }
  }

  const responsibilitiesScore = totalResponsibilities > 0
    ? Math.round((responsibilitiesMatched / totalResponsibilities) * SCORING_WEIGHTS.RESPONSIBILITIES)
    : SCORING_WEIGHTS.RESPONSIBILITIES // Full score if no responsibilities defined

  // ========================================
  // Keyword Presence Scoring (20%)
  // ========================================
  const keywords = extractKeywordsFromRequirements(jobRequirements)
  let keywordsMatched = 0
  const totalKeywords = keywords.length

  // Combine all CV text for keyword search
  const allCVText = cvTextSections.map(s => s.text).join(' ')
  const cvWords = new Set(extractWords(allCVText))

  for (const keyword of keywords) {
    if (cvWords.has(keyword)) {
      keywordsMatched++
      // Only add to matchedItems if not already counted in skills/responsibilities
      const alreadyCounted = matchedItems.some(
        item => normalizeText(item.item).includes(keyword)
      )
      if (!alreadyCounted) {
        matchedItems.push({ item: keyword, category: 'keyword', matchedIn: 'Various' })
      }
    }
  }

  const keywordScore = totalKeywords > 0
    ? Math.round((keywordsMatched / totalKeywords) * SCORING_WEIGHTS.KEYWORDS)
    : SCORING_WEIGHTS.KEYWORDS // Full score if no keywords extracted

  // ========================================
  // Calculate Final Score
  // ========================================
  const totalScore = skillsScore + responsibilitiesScore + keywordScore

  // Ensure score is within 0-100 bounds
  const finalScore = Math.max(0, Math.min(100, totalScore))

  return {
    score: finalScore,
    breakdown: {
      skillsScore,
      responsibilitiesScore,
      keywordScore,
    },
    matchedItems,
    missingItems,
    genericItems,
  }
}

/**
 * Calculates a quick relevance score without detailed item tracking.
 * Use this for batch processing or when detailed analysis is not needed.
 *
 * @param cvContent - The resume content to evaluate
 * @param jobRequirements - The extracted job requirements to match against
 * @returns Simple score from 0-100
 */
export function calculateQuickScore(
  cvContent: ResumeContent,
  jobRequirements: JobRequirements
): number {
  return calculateRelevanceScore(cvContent, jobRequirements).score
}

/**
 * Determines if a CV is a strong match for a job based on relevance score.
 *
 * @param score - The relevance score (0-100)
 * @returns 'strong' (>=70), 'moderate' (>=40), or 'weak' (<40)
 */
export function getMatchStrength(score: number): 'strong' | 'moderate' | 'weak' {
  if (score >= 70) return 'strong'
  if (score >= 40) return 'moderate'
  return 'weak'
}

/**
 * Extracts text content from CV sections for comparison against job requirements.
 *
 * This function takes a full Resume object (database row) and extracts
 * normalized text strings from key content sections: summary, experience
 * descriptions, skills, and education.
 *
 * @param resume - The Resume object from the database
 * @returns Array of normalized text strings (lowercase, trimmed)
 *
 * @example
 * ```typescript
 * const resume = await getResumeById(id)
 * const textContent = extractCvTextContent(resume)
 * // textContent = ["experienced software engineer...", "react", "typescript", ...]
 * ```
 */
export function extractCvTextContent(resume: {
  summary: string | null
  experience: Json
  education: Json
  skills: Json
}): string[] {
  const textContent: string[] = []

  // Extract summary
  if (resume.summary) {
    const normalized = normalizeText(resume.summary)
    if (normalized) {
      textContent.push(normalized)
    }
  }

  // Extract experience descriptions
  const experience = safeJsonArray<ResumeExperience>(resume.experience)
  for (const exp of experience) {
    if (exp.position) {
      const normalized = normalizeText(exp.position)
      if (normalized) {
        textContent.push(normalized)
      }
    }
    if (exp.description) {
      const normalized = normalizeText(stripHtml(exp.description))
      if (normalized) {
        textContent.push(normalized)
      }
    }
    if (exp.achievements && Array.isArray(exp.achievements)) {
      for (const achievement of exp.achievements) {
        const normalized = normalizeText(achievement)
        if (normalized) {
          textContent.push(normalized)
        }
      }
    }
  }

  // Extract skills
  const skills = safeJsonArray<ResumeSkillCategory>(resume.skills)
  for (const skillCategory of skills) {
    if (skillCategory.category) {
      const normalized = normalizeText(skillCategory.category)
      if (normalized) {
        textContent.push(normalized)
      }
    }
    if (skillCategory.skillsHtml) {
      const normalized = normalizeText(stripHtml(skillCategory.skillsHtml))
      if (normalized) {
        textContent.push(normalized)
      }
    }
    if (skillCategory.items && Array.isArray(skillCategory.items)) {
      for (const item of skillCategory.items) {
        const normalized = normalizeText(item)
        if (normalized) {
          textContent.push(normalized)
        }
      }
    }
  }

  // Extract education
  const education = safeJsonArray<ResumeEducation>(resume.education)
  for (const edu of education) {
    if (edu.degree) {
      const normalized = normalizeText(edu.degree)
      if (normalized) {
        textContent.push(normalized)
      }
    }
    if (edu.field) {
      const normalized = normalizeText(edu.field)
      if (normalized) {
        textContent.push(normalized)
      }
    }
    if (edu.description) {
      const normalized = normalizeText(stripHtml(edu.description))
      if (normalized) {
        textContent.push(normalized)
      }
    }
  }

  return textContent
}
