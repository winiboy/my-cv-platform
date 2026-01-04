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

    const { data, error } = await supabase
      .from('swiss_localities')
      .select('locality, canton, locality_normalized, canton_normalized')
      .eq('locality_normalized', normalizedLocality)
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    return data as LocalityMatch
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

    const { data, error } = await supabase
      .from('swiss_localities')
      .select('locality, canton, locality_normalized, canton_normalized')
      .in('locality_normalized', normalizedLocalities)

    if (error || !data) {
      console.error('[Batch Locality Resolver] Error:', error)
      return new Map()
    }

    const resultMap = new Map<string, LocalityMatch>()
    for (const match of data) {
      resultMap.set(match.locality_normalized, match as LocalityMatch)
    }

    return resultMap
  } catch (error) {
    console.error('[Batch Locality Resolver] Error:', error)
    return new Map()
  }
}
