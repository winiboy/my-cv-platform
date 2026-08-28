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
 * Also filters out any IDs that are not in the known valid set, collapses
 * repeated IDs to their first occurrence, and appends any missing defaults.
 *
 * A repeated ID would otherwise render the same section twice and produce
 * duplicate React keys, so de-duplication happens before any insertion.
 */
export function migrateSidebarOrder(order: string[]): string[] {
  // Filter to only known valid IDs, keeping the first occurrence of each.
  // Set iteration order is insertion order, so the user's chosen order stands.
  const filtered = Array.from(
    new Set(
      order.filter((id): id is string =>
        VALID_SIDEBAR_IDS.includes(id as typeof VALID_SIDEBAR_IDS[number])
      )
    )
  )

  // No recognized IDs at all (empty or fully unrecognized input): fall back to
  // the canonical default order rather than building one up from scratch.
  // Without this, 'languages' would be pushed onto the empty array below and
  // become the first section, which is not the default the editor and the
  // templates use. VALID_SIDEBAR_IDS is declared in canonical default order,
  // so it doubles as that default — see the test that pins the order literally.
  if (filtered.length === 0) {
    return [...VALID_SIDEBAR_IDS]
  }

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

// ---------- Editor → Modern template section-ID mapping ----------

/** Editor sidebar section IDs (used by the drag-and-drop UI). */
type EditorSidebarId = 'keyAchievements' | 'skills' | 'languages' | 'training'

/** Editor main-content section IDs. */
type EditorMainId = 'summary' | 'experience' | 'education'

/** Modern template sidebar section IDs. */
type ModernSidebarId = 'contact' | 'education' | 'skills' | 'languages' | 'training'

/** Modern template main-content section IDs. */
type ModernMainId = 'summary' | 'experience'

/** IDs shared between editor sidebar and Modern sidebar. */
const SHARED_SIDEBAR_IDS: ReadonlySet<string> = new Set(['skills', 'languages', 'training'])

/** IDs valid in Modern main content. */
const VALID_MODERN_MAIN_IDS: ReadonlySet<string> = new Set(['summary', 'experience'])

interface ModernMappedOrder {
  modernSidebarOrder: ModernSidebarId[]
  modernMainOrder: ModernMainId[]
  hiddenModernSidebar: ModernSidebarId[]
  hiddenModernMain: ModernMainId[]
}

/**
 * Maps editor-level section order and visibility to the Modern template's
 * section IDs, which differ from the editor's generic set.
 *
 * Key differences:
 * - Modern sidebar always starts with 'contact', then 'education',
 *   followed by the shared sections (skills, languages, training)
 *   in the order the user chose in the editor.
 * - Modern sidebar does NOT have 'keyAchievements'.
 * - Modern main only contains 'summary' and 'experience'
 *   ('education' lives in the Modern sidebar).
 * - Hidden-section mapping follows the same rules, plus:
 *   if 'education' is hidden in the editor main, it becomes
 *   hidden in the Modern sidebar.
 */
export function mapEditorOrderToModern(
  editorSidebarOrder: EditorSidebarId[],
  editorMainOrder: EditorMainId[],
  hiddenSidebar: EditorSidebarId[],
  hiddenMain: EditorMainId[],
): ModernMappedOrder {
  // --- Sidebar order ---
  // 'contact' is always first, 'education' always second,
  // then the shared IDs in the user's chosen order.
  const sharedInOrder = editorSidebarOrder.filter(
    (id): id is ModernSidebarId & EditorSidebarId => SHARED_SIDEBAR_IDS.has(id),
  )
  const modernSidebarOrder: ModernSidebarId[] = ['contact', 'education', ...sharedInOrder]

  // --- Main order ---
  const modernMainOrder = editorMainOrder.filter(
    (id): id is ModernMainId => VALID_MODERN_MAIN_IDS.has(id),
  )

  // --- Hidden sidebar ---
  const hiddenSidebarSet = new Set<string>(hiddenSidebar)
  const hiddenModernSidebar: ModernSidebarId[] = []
  // If 'education' is hidden in editor main, hide it in Modern sidebar too
  if ((hiddenMain as string[]).includes('education')) {
    hiddenModernSidebar.push('education')
  }
  for (const id of sharedInOrder) {
    if (hiddenSidebarSet.has(id)) {
      hiddenModernSidebar.push(id)
    }
  }

  // --- Hidden main ---
  const hiddenModernMain = hiddenMain.filter(
    (id): id is ModernMainId => VALID_MODERN_MAIN_IDS.has(id),
  )

  return { modernSidebarOrder, modernMainOrder, hiddenModernSidebar, hiddenModernMain }
}
