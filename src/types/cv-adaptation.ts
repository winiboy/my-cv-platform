/**
 * Types for CV Adaptation Feature
 *
 * This feature allows users to adapt their existing CV to specific job descriptions
 * using AI-powered analysis. The system generates targeted patches (not full rewrites)
 * that users can preview and selectively apply.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low'

/**
 * Represents a single field patch with confidence scoring
 */
export interface PatchField {
  original: string
  proposed: string
  confidence: ConfidenceLevel
  reasoning: string
}

/**
 * Skill additions for a new or existing category
 */
export interface SkillPatch {
  category: string
  items: string[]
  confidence: ConfidenceLevel
  reasoning: string
}

/**
 * Skill enhancements for existing categories
 */
export interface SkillEnhancementPatch {
  category: string
  itemsToAdd: string[]
  confidence: ConfidenceLevel
  reasoning: string
}

/**
 * Experience description patch with index reference
 */
export interface ExperiencePatch extends PatchField {
  experienceIndex: number
}

/**
 * Complete CV Adaptation Patch
 *
 * Contains all proposed changes to adapt a CV to a specific job description.
 * Each patch includes confidence scoring and reasoning to help users make
 * informed decisions about which changes to apply.
 */
export interface CVAdaptationPatch {
  // Metadata
  jobTitle: string
  company: string
  jobDescription: string
  createdAt: string
  locale: string

  // Proposed changes
  patches: {
    summary?: PatchField
    experienceDescription?: ExperiencePatch
    skillsToAdd?: SkillPatch[]
    skillsToEnhance?: SkillEnhancementPatch[]
  }

  // Overall analysis
  analysis: {
    matchScore: number  // 0-100: how well current CV matches job
    keyGaps: string[]   // Missing skills/experiences
    strengths: string[] // What already matches well
  }
}

/**
 * Request body for CV adaptation API
 */
export interface CVAdaptationRequest {
  resumeId: string
  jobDescription: string
  jobTitle: string
  company?: string
  locale?: string
}

/**
 * Response from CV adaptation API
 */
export interface CVAdaptationResponse {
  success: boolean
  patch?: CVAdaptationPatch
  tokensUsed?: number
  error?: string
  message?: string
}
