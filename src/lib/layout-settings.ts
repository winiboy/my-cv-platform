/**
 * Pure helper functions for reading and writing ResumeLayoutSettings
 * inside the existing custom_sections JSONB column.
 *
 * Storage format when layout settings are present:
 *   { items: CustomSection[], layoutSettings: ResumeLayoutSettings }
 *
 * Legacy format (no layout settings):
 *   CustomSection[]  (plain array)
 */

import type { ResumeLayoutSettings } from '@/types/database'

/** Known sidebar section IDs — used for validation and migration. */
const VALID_SIDEBAR_IDS = ['keyAchievements', 'skills', 'languages', 'training'] as const

/**
 * Migrates a sidebar order array to ensure 'languages' is present.
 * Inserts 'languages' after 'skills' if possible, otherwise appends it.
 * Also filters out any IDs that are not in the known valid set and appends
 * any missing defaults.
 */
export function migrateSidebarOrder(order: string[]): string[] {
  // Filter to only known valid IDs
  const filtered = order.filter((id): id is string =>
    VALID_SIDEBAR_IDS.includes(id as typeof VALID_SIDEBAR_IDS[number])
  )

  // Ensure 'languages' is present
  if (!filtered.includes('languages')) {
    const skillsIndex = filtered.indexOf('skills')
    if (skillsIndex >= 0) {
      filtered.splice(skillsIndex + 1, 0, 'languages')
    } else {
      filtered.push('languages')
    }
  }

  // Add back any missing defaults that weren't in the original array
  for (const id of VALID_SIDEBAR_IDS) {
    if (!filtered.includes(id)) {
      filtered.push(id)
    }
  }

  return filtered
}

/**
 * Wrapper shape stored in custom_sections when layout settings are present.
 */
interface CustomSectionsWithLayout {
  items: unknown[]
  layoutSettings: ResumeLayoutSettings
}

/**
 * Type guard: returns true if the value is the wrapped object format
 * (has both `items` array and `layoutSettings` object).
 */
function isWrappedFormat(value: unknown): value is CustomSectionsWithLayout {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    'layoutSettings' in obj &&
    obj.layoutSettings !== null &&
    typeof obj.layoutSettings === 'object' &&
    !Array.isArray(obj.layoutSettings)
  )
}

/**
 * Extracts layout settings from the custom_sections JSONB value.
 *
 * Returns the ResumeLayoutSettings if the value uses the wrapped format,
 * or null if the value is a legacy array, null, or otherwise missing settings.
 */
export function extractLayoutSettings(
  customSections: unknown
): ResumeLayoutSettings | null {
  if (!isWrappedFormat(customSections)) {
    return null
  }
  return customSections.layoutSettings
}

/**
 * Embeds layout settings into the custom_sections value, producing
 * the wrapped format { items: [...], layoutSettings: {...} }.
 *
 * Handles three input shapes:
 * 1. null/undefined  -> { items: [], layoutSettings }
 * 2. Array (legacy)  -> { items: <array>, layoutSettings }
 * 3. Object (already wrapped) -> { ...existing, layoutSettings }
 */
export function embedLayoutSettings(
  customSections: unknown,
  settings: ResumeLayoutSettings
): CustomSectionsWithLayout {
  // Case 1: null or undefined
  if (customSections === null || customSections === undefined) {
    return { items: [], layoutSettings: settings }
  }

  // Case 2: Legacy array format
  if (Array.isArray(customSections)) {
    return { items: customSections, layoutSettings: settings }
  }

  // Case 3: Already an object (possibly wrapped)
  if (typeof customSections === 'object') {
    const existing = customSections as Record<string, unknown>
    const items = Array.isArray(existing.items) ? existing.items : []
    return { items, layoutSettings: settings }
  }

  // Fallback for unexpected types — treat as empty
  return { items: [], layoutSettings: settings }
}
