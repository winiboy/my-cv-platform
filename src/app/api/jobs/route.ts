/**
 * Jobs API Route
 * Fetches real Swiss jobs from Adzuna API
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchSwissJobs } from '@/lib/adzuna-client'
import type { EmploymentType } from '@/types/jobs'

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

    return NextResponse.json({
      jobs,
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
