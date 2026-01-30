/**
 * Job Match Analysis Types
 *
 * Types for the Resume-Job Description Match tool that performs AI-powered
 * analysis to determine how well a resume aligns with a specific job posting.
 * Provides match scoring, skill gap analysis, and actionable recommendations.
 */

/**
 * Request payload for job match analysis.
 *
 * Contains the resume text and job description to be compared,
 * along with the locale for language-appropriate analysis output.
 */
export interface JobMatchRequest {
  /**
   * The full text content of the resume to analyze.
   * Should include all sections (summary, experience, skills, education).
   */
  resumeText: string

  /**
   * The full text of the job description/posting to match against.
   * Should include requirements, responsibilities, and qualifications.
   */
  jobDescription: string

  /**
   * Locale code for the analysis output language.
   * Supported values: 'en', 'fr', 'de', 'it'
   */
  locale: string
}

/**
 * Complete job match analysis result.
 *
 * Contains the overall match score, skill analysis (matched and missing),
 * personalized recommendations, identified strengths, and timestamp.
 * This is the primary data structure returned by the job match API
 * and consumed by the UI component.
 */
export interface JobMatchAnalysis {
  /**
   * Overall match score from 0-100 indicating alignment with the job.
   * Higher scores indicate better qualification match.
   * - 0-40: Poor match, significant gaps
   * - 41-70: Moderate match, some gaps to address
   * - 71-100: Strong match, well-qualified
   */
  matchScore: number

  /**
   * Skills from the job description that were found in the resume.
   * Includes both technical and soft skills.
   */
  matchedSkills: string[]

  /**
   * Skills mentioned in the job description that are absent from the resume.
   * These represent gaps the candidate should consider addressing.
   */
  missingSkills: string[]

  /**
   * Actionable recommendations for improving the resume's match score.
   * Each recommendation should be specific and implementable.
   */
  recommendations: string[]

  /**
   * Key strengths identified in the resume relevant to the job.
   * Highlights areas where the candidate excels for this position.
   */
  strengths: string[]

  /**
   * ISO 8601 timestamp when the analysis was generated.
   * Used for caching decisions and display purposes.
   */
  analyzedAt: string
}
