/**
 * Location Normalization Utility
 * Pure functions for normalizing Swiss city/locality names
 */

/**
 * Remove accents from string (e.g., "Zürich" → "Zurich")
 */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Remove common canton abbreviations from location strings
 * Examples: "Lausanne VD" → "Lausanne", "Zürich ZH" → "Zürich"
 */
function removeCantonAbbreviation(str: string): string {
  // Swiss canton abbreviations (2 uppercase letters at end)
  return str.replace(/\s+[A-Z]{2}$/i, '').trim()
}

/**
 * Normalize a locality/city name for matching against swiss_localities
 *
 * Rules:
 * - Lowercase
 * - Remove accents
 * - Remove canton abbreviations
 * - Trim whitespace
 *
 * @param locality - Raw locality string from Adzuna
 * @returns Normalized locality string
 */
export function normalizeLocality(locality: string): string {
  if (!locality) return ''

  let normalized = locality
  normalized = removeCantonAbbreviation(normalized)
  normalized = removeAccents(normalized)
  normalized = normalized.toLowerCase().trim()

  return normalized
}
