/**
 * Jobs API Route
 * Fetches real Swiss jobs from Adzuna API or returns mock data as fallback
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchSwissJobs } from '@/lib/adzuna-client'
import { mockSwissJobs } from '@/lib/mock-jobs'
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
    const useMockData = searchParams.get('useMock') === 'true'

    // Check if Adzuna API is configured
    const hasAdzunaCredentials = process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY

    // Use mock data if:
    // 1. Explicitly requested via query param
    // 2. Adzuna credentials are not configured
    if (useMockData || !hasAdzunaCredentials) {
      console.log('Using mock job data')

      // Filter mock jobs based on parameters
      let filteredJobs = [...mockSwissJobs]

      if (query) {
        const searchLower = query.toLowerCase()
        filteredJobs = filteredJobs.filter(
          job =>
            job.title.toLowerCase().includes(searchLower) ||
            job.company.toLowerCase().includes(searchLower) ||
            job.description.toLowerCase().includes(searchLower)
        )
      }

      if (location) {
        filteredJobs = filteredJobs.filter(job => job.location_city === location)
      }

      if (employmentType) {
        filteredJobs = filteredJobs.filter(job => job.employment_type === employmentType)
      }

      // Paginate
      const startIndex = (page - 1) * resultsPerPage
      const endIndex = startIndex + resultsPerPage
      const paginatedJobs = filteredJobs.slice(startIndex, endIndex)

      return NextResponse.json({
        jobs: paginatedJobs,
        total: filteredJobs.length,
        source: 'mock',
        message: hasAdzunaCredentials
          ? 'Using mock data (requested via query param)'
          : 'Using mock data (Adzuna API credentials not configured)',
      })
    }

    // Fetch from Adzuna API
    console.log('Fetching jobs from Adzuna API')

    const { jobs, total } = await fetchSwissJobs({
      query,
      location,
      employmentType,
      page,
      resultsPerPage,
    })

    return NextResponse.json({
      jobs,
      total,
      source: 'adzuna',
      message: 'Successfully fetched jobs from Adzuna API',
    })

  } catch (error) {
    console.error('Error in jobs API route:', error)

    // Fallback to mock data on error
    console.log('Falling back to mock data due to error')

    return NextResponse.json(
      {
        jobs: mockSwissJobs.slice(0, 20),
        total: mockSwissJobs.length,
        source: 'mock',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Using mock data (API error occurred)',
      },
      { status: 200 } // Return 200 with mock data instead of error
    )
  }
}
