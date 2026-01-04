/**
 * Jobs API Route
 * Fetches real Swiss jobs from Adzuna API
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchSwissJobs } from '@/lib/adzuna-client'
import type { EmploymentType, JobListing } from '@/types/jobs'
import { normalizeLocality } from '@/lib/location-normalizer'
import { batchResolveCantons } from '@/lib/supabase-localities'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Extract query parameters
    const query = searchParams.get('query') || undefined
    const location = searchParams.get('location') || undefined
    const employmentType = searchParams.get('employmentType') as EmploymentType | undefined
    const page = parseInt(searchParams.get('page') || '1')
    const resultsPerPage = parseInt(searchParams.get('resultsPerPage') || '20')

    // Check if Adzuna API is configured
    const hasAdzunaCredentials = process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY

    if (!hasAdzunaCredentials) {
      console.error('[API Route] Adzuna API credentials not configured')
      return NextResponse.json(
        {
          jobs: [],
          total: 0,
          source: 'none',
          error: 'Adzuna API credentials not configured',
          message: 'Please configure ADZUNA_APP_ID and ADZUNA_APP_KEY in .env.local',
        },
        { status: 500 }
      )
    }

    // Fetch from Adzuna API
    console.log('[API Route] Fetching jobs from Adzuna API')
    console.log('[API Route] Params:', { query, location, employmentType, page, resultsPerPage })
    console.log('[API Route] Location filter (canton):', location || 'NONE')

    const { jobs, total } = await fetchSwissJobs({
      query,
      location,
      employmentType,
      page,
      resultsPerPage,
    })

    console.log('[API Route] Successfully fetched', jobs.length, 'jobs from Adzuna')

    // Resolve cantons from swiss_localities table
    const normalizedCities = jobs.map(job => normalizeLocality(job.location_city))
    const uniqueCities = [...new Set(normalizedCities)]
    const cantonMap = await batchResolveCantons(uniqueCities)

    console.log('[API Route] Resolved cantons for', cantonMap.size, 'unique localities')
    console.log('[DEBUG] Sample canton map entries:', Array.from(cantonMap.entries()).slice(0, 3))

    // Enrich jobs with resolved canton data
    const enrichedJobs: JobListing[] = jobs.map(job => {
      const normalized = normalizeLocality(job.location_city)
      const match = cantonMap.get(normalized)

      if (match) {
        return {
          ...job,
          location_city_normalized: normalized,
          location_canton: match.canton,
          location_canton_normalized: match.canton_normalized,
          location_unresolved: false,
        }
      } else {
        return {
          ...job,
          location_city_normalized: normalized,
          location_unresolved: true,
        }
      }
    })

    // Debug: Count resolved vs unresolved
    const resolvedCount = enrichedJobs.filter(j => !j.location_unresolved).length
    const unresolvedCount = enrichedJobs.filter(j => j.location_unresolved).length
    console.log('[DEBUG] Resolved jobs:', resolvedCount, '| Unresolved jobs:', unresolvedCount)

    // Debug: Show sample enriched job
    const sampleResolved = enrichedJobs.find(j => !j.location_unresolved)
    if (sampleResolved) {
      console.log('[DEBUG] Sample resolved job:', {
        city: sampleResolved.location_city,
        city_normalized: sampleResolved.location_city_normalized,
        canton: sampleResolved.location_canton,
        canton_normalized: sampleResolved.location_canton_normalized,
      })
    }

    // Filter by canton if requested (only include resolved jobs)
    let filteredJobs = enrichedJobs
    if (location) {
      const cantonFilterNormalized = normalizeLocality(location)
      console.log('[DEBUG] Filter canton:', location, '→ normalized:', cantonFilterNormalized)

      filteredJobs = enrichedJobs.filter(job =>
        !job.location_unresolved &&
        job.location_canton_normalized === cantonFilterNormalized
      )

      console.log('[API Route] Canton filter applied:', location, '→', filteredJobs.length, 'jobs')

      // Debug: Show why no matches if result is empty
      if (filteredJobs.length === 0 && resolvedCount > 0) {
        const uniqueCantons = [...new Set(enrichedJobs
          .filter(j => !j.location_unresolved)
          .map(j => j.location_canton_normalized))]
        console.log('[DEBUG] Available cantons in results:', uniqueCantons)
        console.log('[DEBUG] Looking for canton:', cantonFilterNormalized)
      }
    }

    return NextResponse.json({
      jobs: filteredJobs,
      total,
      source: 'adzuna',
      message: 'Successfully fetched jobs from Adzuna API',
    })

  } catch (error) {
    console.error('[API Route] Error in jobs API route:', error)
    console.error('[API Route] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        jobs: [],
        total: 0,
        source: 'none',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to fetch jobs from Adzuna API',
      },
      { status: 500 }
    )
  }
}
