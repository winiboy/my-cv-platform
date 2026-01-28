/**
 * Quality Analysis Types
 *
 * Types for storing and passing quality analysis results between
 * the CV generation system and the UI. Used during iterative refinement
 * to track content quality scores and identify gaps.
 */

import type { ScoringItem } from '@/lib/ai/relevance-scorer'

/**
 * Quality analysis result from CV content evaluation.
 *
 * Contains the relevance score, categorized items (matched, missing, generic),
 * and metadata about the analysis iteration. This data structure is passed
 * between the generation pipeline and UI components.
 */
export interface QualityAnalysis {
  /**
   * Overall quality/relevance score from 0-100.
   * Higher scores indicate better alignment with job requirements.
   */
  score: number

  /**
   * Items from job requirements that were found in the CV content.
   * Each item includes category (skill/responsibility/keyword) and
   * where it was matched in the CV.
   */
  matchedItems: ScoringItem[]

  /**
   * Items from job requirements that were NOT found in the CV content.
   * These represent gaps that could be addressed in subsequent iterations.
   */
  missingItems: ScoringItem[]

  /**
   * Generic or overly common items that may not add significant value.
   * Examples: "communication skills", "team player", etc.
   */
  genericItems: ScoringItem[]

  /**
   * Flag indicating if the quality is below the acceptable threshold.
   * When true, the system should attempt another refinement iteration.
   */
  isInsufficient: boolean

  /**
   * Current iteration number in the refinement process.
   * Starts at 1 for the initial generation.
   */
  iteration: number
}

/**
 * Client-side state management for quality analysis.
 *
 * Provides a simple state container for tracking the current analysis
 * state in UI components. Actual state management implementation
 * (React Context, Zustand, etc.) will be added in UI stories.
 */
export interface QualityAnalysisStore {
  /**
   * The current quality analysis result, or null if no analysis
   * has been performed yet.
   */
  analysis: QualityAnalysis | null

  /**
   * Loading state indicator for async analysis operations.
   */
  isLoading: boolean

  /**
   * Error message if the analysis failed, undefined otherwise.
   */
  error?: string
}

/**
 * Default threshold for determining if quality is sufficient.
 * Scores below this value set isInsufficient to true.
 */
export const QUALITY_THRESHOLD = 70

/**
 * Maximum number of refinement iterations allowed.
 * Prevents infinite loops in the generation pipeline.
 */
export const MAX_ITERATIONS = 3
