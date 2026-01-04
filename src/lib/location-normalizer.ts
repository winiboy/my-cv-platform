/**
 * Location Normalization Utility
 * Pure functions for normalizing Swiss city/locality names
 */

/**
 * German to French/Standard city name mappings
 * Maps common German city names to their database equivalents
 */
const CITY_NAME_MAPPINGS: Record<string, string> = {
  // German → French/Standard
  'Genf': 'Genève',
  'Kanton Genf': 'Genève',
  'Basel': 'Bâle',
  'Sankt Gallen': 'St. Gallen',
  'Sankt Moritz': 'St. Moritz',
  'Neuenburg': 'Neuchâtel',
  'Freiburg': 'Fribourg',
  'Sitten': 'Sion',
  'Chur': 'Coire',
  // Merged municipalities and variations
  'Glarus Süd': 'Glarus',
  'Glarus Sud': 'Glarus',
}

/**
 * Apply city name mappings (German → French/Standard)
 */
function applyCityMapping(str: string): string {
  // Check exact match first
  if (CITY_NAME_MAPPINGS[str]) {
    return CITY_NAME_MAPPINGS[str]
  }

  // Check case-insensitive match
  const lowerStr = str.toLowerCase()
  for (const [key, value] of Object.entries(CITY_NAME_MAPPINGS)) {
    if (key.toLowerCase() === lowerStr) {
      return value
    }
  }

  return str
}

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
 * - Apply German→French city name mappings
 * - Remove canton abbreviations
 * - Remove accents
 * - Lowercase and trim
 *
 * @param locality - Raw locality string from Adzuna
 * @returns Normalized locality string
 */
export function normalizeLocality(locality: string): string {
  if (!locality) return ''

  let normalized = locality
  normalized = applyCityMapping(normalized) // Map German→French names
  normalized = removeCantonAbbreviation(normalized)
  normalized = removeAccents(normalized)
  normalized = normalized.toLowerCase().trim()

  return normalized
}
