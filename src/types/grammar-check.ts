/**
 * Grammar Check Types
 *
 * Type definitions for the grammar analysis API endpoint.
 * Used by the Resume Checker tool's grammar analysis feature.
 */

/**
 * Types of grammar issues that can be detected.
 */
export type GrammarIssueType =
  | 'spelling'
  | 'grammar'
  | 'punctuation'
  | 'tense'
  | 'phrasing'

/**
 * Severity levels for grammar issues.
 */
export type GrammarIssueSeverity = 'error' | 'warning' | 'suggestion'

/**
 * Represents a single grammar issue found in the resume text.
 */
export interface GrammarIssue {
  /**
   * Unique identifier for the issue.
   */
  id: string

  /**
   * Type of grammar issue detected.
   */
  type: GrammarIssueType

  /**
   * Severity level of the issue.
   */
  severity: GrammarIssueSeverity

  /**
   * The original text containing the issue.
   */
  originalText: string

  /**
   * Suggested correction for the issue.
   */
  suggestedText: string

  /**
   * Explanation of why this is an issue and how to fix it.
   */
  explanation: string

  /**
   * Location/context where the issue was found in the resume.
   */
  location: string
}

/**
 * Response structure from the grammar analysis API.
 */
export interface GrammarAnalysisResponse {
  /**
   * Overall grammar score from 0-100.
   * - 90-100: Excellent
   * - 70-89: Good
   * - 50-69: Needs work
   * - 0-49: Poor
   */
  overallScore: number

  /**
   * Total number of issues found.
   */
  issueCount: number

  /**
   * Array of detected grammar issues.
   */
  issues: GrammarIssue[]
}

/**
 * Request payload for the grammar check API.
 */
export interface GrammarCheckRequest {
  /**
   * The resume text to analyze.
   * Must be at least 100 characters.
   */
  resumeText: string

  /**
   * Locale for language-specific analysis.
   * Defaults to 'en' if not specified.
   */
  locale?: 'en' | 'fr' | 'de' | 'it'
}
