/**
 * Resume Analysis Types
 *
 * Types for the Resume Checker tool that performs AI-powered resume analysis.
 * The analysis evaluates multiple categories and provides actionable feedback
 * with severity-based issue tracking for user guidance.
 */

/**
 * Severity level for individual issues found during analysis.
 * Used to prioritize which issues need immediate attention.
 */
export type IssueSeverity = 'low' | 'medium' | 'high'

/**
 * Status indicating the overall health of a category.
 * - pass: Category meets quality standards
 * - warning: Category has minor issues that could be improved
 * - fail: Category has critical issues requiring attention
 */
export type CategoryStatus = 'pass' | 'warning' | 'fail'

/**
 * Represents a single issue found during resume analysis.
 *
 * Each issue includes a description, severity level, and actionable suggestion.
 * The optional section field enables "Show me" navigation to locate the issue
 * in the resume editor.
 */
export interface AnalysisIssue {
  /**
   * Human-readable description of the issue found.
   */
  description: string

  /**
   * Severity level indicating how critical this issue is.
   * High severity issues should be addressed first.
   */
  severity: IssueSeverity

  /**
   * Optional section identifier for "Show me" navigation.
   * Maps to resume editor sections (e.g., 'experience', 'skills', 'summary').
   * When provided, enables direct navigation to the affected section.
   */
  section?: string

  /**
   * Actionable suggestion for resolving this issue.
   * Should provide clear guidance on how to improve.
   */
  suggestion: string
}

/**
 * Represents an analysis category with its score and issues.
 *
 * Categories group related analysis criteria together, such as
 * "Impact & Achievements", "Keywords & Skills", or "Formatting".
 */
export interface AnalysisCategory {
  /**
   * Display name of the category (e.g., "Impact & Achievements").
   */
  name: string

  /**
   * Score from 0-100 for this category.
   * Higher scores indicate better quality in this area.
   */
  score: number

  /**
   * Overall status based on the score and issues found.
   * Determines the visual indicator (green/yellow/red) in the UI.
   */
  status: CategoryStatus

  /**
   * Summary feedback explaining the category's current state.
   * Provides context for the score and status.
   */
  feedback: string

  /**
   * List of specific issues found in this category.
   * Empty array indicates no issues were detected.
   */
  issues: AnalysisIssue[]
}

/**
 * Complete resume analysis result.
 *
 * Contains the overall score, category-level breakdown, and timestamp.
 * This is the primary data structure returned by the resume analysis API
 * and consumed by the Resume Checker UI component.
 */
export interface ResumeAnalysis {
  /**
   * Overall resume quality score from 0-100.
   * Calculated as a weighted average of category scores.
   */
  overallScore: number

  /**
   * Array of analysis categories with individual scores and issues.
   * Categories cover different aspects of resume quality.
   */
  categories: AnalysisCategory[]

  /**
   * ISO 8601 timestamp when the analysis was generated.
   * Used for caching decisions and display purposes.
   */
  generatedAt: string
}
