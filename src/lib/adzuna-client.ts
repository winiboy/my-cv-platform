/**
 * Adzuna API Client for Swiss Jobs
 *
 * Setup Instructions:
 * 1. Sign up at https://developer.adzuna.com/
 * 2. Get your API credentials (App ID and App Key)
 * 3. Add to .env.local:
 *    ADZUNA_APP_ID=your_app_id
 *    ADZUNA_APP_KEY=your_app_key
 */

import type { JobListing, EmploymentType } from '@/types/jobs'
import type { AdzunaJobResult, AdzunaSearchResponse } from '@/types/adzuna'

const ADZUNA_BASE_URL = 'https://api.adzuna.com/v1/api/jobs'
const COUNTRY_CODE = 'ch' // Switzerland

/**
 * Map Adzuna contract types to our EmploymentType
 */
function mapContractType(adzunaJob: AdzunaJobResult): EmploymentType {
  const contractType = adzunaJob.contract_type?.toLowerCase() || ''
  const contractTime = adzunaJob.contract_time?.toLowerCase() || ''

  // Check contract_time first (more reliable)
  if (contractTime === 'full_time') return 'full-time'
  if (contractTime === 'part_time') return 'part-time'

  // Fallback to contract_type
  if (contractType.includes('full')) return 'full-time'
  if (contractType.includes('part')) return 'part-time'
  if (contractType.includes('contract') || contractType.includes('temporary')) return 'contract'
  if (contractType.includes('intern')) return 'internship'

  // Default to full-time if unknown
  return 'full-time'
}

/**
 * Extract city name from Adzuna location
 */
function extractCity(location: AdzunaJobResult['location']): string {
  // Adzuna location.area is an array like ["Zürich", "Zürich", "Switzerland"]
  // or location.display_name like "Zürich, Zürich"

  if (location.area && location.area.length > 0) {
    return location.area[0]
  }

  if (location.display_name) {
    const parts = location.display_name.split(',')
    return parts[0].trim()
  }

  return 'Zürich' // Default fallback
}

/**
 * Format salary range from Adzuna data
 */
function formatSalaryRange(job: AdzunaJobResult): string | undefined {
  if (!job.salary_min && !job.salary_max) return undefined

  const min = job.salary_min
  const max = job.salary_max

  if (min && max) {
    return `CHF ${min.toLocaleString()} - ${max.toLocaleString()}`
  } else if (min) {
    return `CHF ${min.toLocaleString()}+`
  } else if (max) {
    return `Up to CHF ${max.toLocaleString()}`
  }

  return undefined
}

/**
 * Clean and format job description from Adzuna
 */
function cleanDescription(html: string): string {
  // Remove HTML tags
  let clean = html.replace(/<[^>]*>/g, '')

  // Decode HTML entities
  clean = clean
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Remove excessive whitespace
  clean = clean.replace(/\s+/g, ' ').trim()

  // Truncate if too long (keep first 2000 chars)
  if (clean.length > 2000) {
    clean = clean.substring(0, 2000) + '...'
  }

  return clean
}

/**
 * Transform Adzuna job to our JobListing format
 */
export function transformAdzunaJob(adzunaJob: AdzunaJobResult): JobListing {
  return {
    id: adzunaJob.id,
    title: adzunaJob.title,
    company: adzunaJob.company.display_name,
    location_city: extractCity(adzunaJob.location),
    location_country: 'CH',
    employment_type: mapContractType(adzunaJob),
    description: cleanDescription(adzunaJob.description),
    requirements: undefined, // Adzuna doesn't separate requirements
    salary_range: formatSalaryRange(adzunaJob),
    posted_date: adzunaJob.created.split('T')[0], // Convert ISO to YYYY-MM-DD
    application_url: adzunaJob.redirect_url,
    is_saved: false,
  }
}

/**
 * Fetch jobs from Adzuna API
 */
export async function fetchSwissJobs(params: {
  query?: string
  location?: string
  employmentType?: EmploymentType
  page?: number
  resultsPerPage?: number
}): Promise<{ jobs: JobListing[]; total: number }> {
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY

  if (!appId || !appKey) {
    throw new Error(
      'Adzuna API credentials not configured. Please add ADZUNA_APP_ID and ADZUNA_APP_KEY to your .env.local file.'
    )
  }

  // Build query parameters
  const queryParams = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(params.resultsPerPage || 20),
    page: String(params.page || 1),
    sort_by: 'date',
  })

  // Add search query
  if (params.query) {
    queryParams.append('what', params.query)
  }

  // Add location filter (city name)
  if (params.location) {
    queryParams.append('where', params.location)
  }

  // Add employment type filter
  if (params.employmentType) {
    switch (params.employmentType) {
      case 'full-time':
        queryParams.append('full_time', '1')
        break
      case 'part-time':
        queryParams.append('part_time', '1')
        break
      case 'contract':
        queryParams.append('contract', '1')
        break
      // Note: Adzuna doesn't have specific filters for internship/temporary
      // These will be filtered from results
    }
  }

  // Make API request
  const url = `${ADZUNA_BASE_URL}/${COUNTRY_CODE}/search/1?${queryParams.toString()}`

  console.log('[Adzuna] Fetching jobs from:', url.replace(appKey, 'REDACTED'))

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store', // Disable caching for now to avoid issues
    })

    console.log('[Adzuna] Response status:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Adzuna] API error response:', errorText)
      throw new Error(`Adzuna API error: ${response.status} ${response.statusText}`)
    }

    const data: AdzunaSearchResponse = await response.json()
    console.log('[Adzuna] Successfully fetched', data.results?.length, 'jobs (total:', data.count, ')')

    // Transform results
    let jobs = data.results.map(transformAdzunaJob)

    // Additional filtering for employment types not supported by Adzuna API
    if (params.employmentType === 'internship') {
      jobs = jobs.filter(job =>
        job.title.toLowerCase().includes('intern') ||
        job.description.toLowerCase().includes('internship')
      )
    } else if (params.employmentType === 'temporary') {
      jobs = jobs.filter(job =>
        job.title.toLowerCase().includes('temporary') ||
        job.title.toLowerCase().includes('temp ') ||
        job.description.toLowerCase().includes('temporary position')
      )
    }

    return {
      jobs,
      total: data.count,
    }
  } catch (error) {
    console.error('Error fetching jobs from Adzuna:', error)
    throw error
  }
}

/**
 * Get available cities with job counts (for filter dropdown)
 */
export async function getSwissCitiesWithJobs(): Promise<string[]> {
  // Major Swiss cities - we could fetch this dynamically but hardcoding is more reliable
  return [
    'Zürich',
    'Genève',
    'Basel',
    'Lausanne',
    'Bern',
    'Winterthur',
    'Luzern',
    'St. Gallen',
    'Lugano',
    'Biel/Bienne',
    'Thun',
    'Neuchâtel',
  ]
}
