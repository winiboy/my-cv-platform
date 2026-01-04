/**
 * Swiss Localities Resolver
 * Maps normalized city names to Swiss cantons using Supabase swiss_localities table
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface LocalityMatch {
  locality: string
  canton: string
  locality_normalized: string
  canton_normalized: string
}

/**
 * Resolve canton from normalized locality name
 *
 * @param normalizedLocality - Normalized city/locality name
 * @returns Locality match with canton data, or null if not found
 */
export async function resolveCantonFromLocality(
  normalizedLocality: string
): Promise<LocalityMatch | null> {
  if (!normalizedLocality) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Try exact match first
    const { data: exactMatch, error: exactError } = await supabase
      .from('swiss_localities')
      .select('locality, canton, locality_normalized, canton_normalized')
      .eq('locality_normalized', normalizedLocality)
      .limit(1)
      .single()

    if (exactMatch && !exactError) {
      return exactMatch as LocalityMatch
    }

    // Fallback: Try prefix match (e.g., "avry" matches "avry-devant-pont")
    // This handles cases where Adzuna returns shortened city names
    const { data: prefixMatches, error: prefixError } = await supabase
      .from('swiss_localities')
      .select('locality, canton, locality_normalized, canton_normalized')
      .ilike('locality_normalized', `${normalizedLocality}%`)
      .limit(1)

    if (prefixError || !prefixMatches || prefixMatches.length === 0) {
      return null
    }

    // Return first prefix match
    return prefixMatches[0] as LocalityMatch
  } catch (error) {
    console.error('[Locality Resolver] Error:', error)
    return null
  }
}

/**
 * Batch resolve cantons for multiple localities
 *
 * @param normalizedLocalities - Array of normalized locality names
 * @returns Map of normalized locality to canton match
 */
export async function batchResolveCantons(
  normalizedLocalities: string[]
): Promise<Map<string, LocalityMatch>> {
  if (normalizedLocalities.length === 0) {
    return new Map()
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Step 1: Try exact matches for all localities
    const { data: exactMatches, error: exactError } = await supabase
      .from('swiss_localities')
      .select('locality, canton, locality_normalized, canton_normalized')
      .in('locality_normalized', normalizedLocalities)

    if (exactError) {
      console.error('[Batch Locality Resolver] Exact match error:', exactError)
    }

    const resultMap = new Map<string, LocalityMatch>()

    // Add exact matches to result map
    if (exactMatches) {
      for (const match of exactMatches) {
        resultMap.set(match.locality_normalized, match as LocalityMatch)
      }
    }

    // Step 2: Find localities that didn't match exactly
    const unmatchedLocalities = normalizedLocalities.filter(loc => !resultMap.has(loc))

    // Step 3: Try prefix matching for unmatched localities
    if (unmatchedLocalities.length > 0) {
      for (const locality of unmatchedLocalities) {
        const { data: prefixMatches } = await supabase
          .from('swiss_localities')
          .select('locality, canton, locality_normalized, canton_normalized')
          .ilike('locality_normalized', `${locality}%`)
          .limit(1)

        if (prefixMatches && prefixMatches.length > 0) {
          // Map the original normalized locality to the prefix match
          // This way when we look up "avry" we get the result for "avry-devant-pont"
          resultMap.set(locality, prefixMatches[0] as LocalityMatch)
        }
      }
    }

    return resultMap
  } catch (error) {
    console.error('[Batch Locality Resolver] Error:', error)
    return new Map()
  }
}
