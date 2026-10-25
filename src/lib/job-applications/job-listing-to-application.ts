import type { JobListing } from '@/types/jobs'
import { jobLocationLabel } from '@/lib/job-search-format'

/**
 * The fields of a job application saved from a Job Search offer, exactly as
 * the client sends them: to `POST /api/job-applications` (the "Save" button)
 * and, as `offer`, to `POST /api/ai/generate-from-job-description` (the
 * "Créer un CV" flow, job-cv-linking US-001).
 *
 * Both flows build it with `jobListingToApplicationInput`, so the application
 * created next to a CV can never be mapped differently from a saved one
 * (job-cv-linking FR-2). The server validates it again: it is untrusted.
 */
export interface JobOfferApplicationInput {
  job_title: string
  company_name: string
  location: string
  salary_min: number | null
  salary_max: number | null
  job_url: string | null
  job_description: string | null
  source: 'Adzuna'
}

/**
 * The first one or two numbers of an offer's salary text, typically
 * "X - Y CHF" from Adzuna, thousands separators (space, apostrophe) removed.
 */
function salaryBounds(salaryRange: string | undefined): { min: number | null; max: number | null } {
  if (!salaryRange) return { min: null, max: null }
  const salaryMatch = salaryRange.match(/(\d[\d\s']*)/g)
  if (!salaryMatch || salaryMatch.length < 1) return { min: null, max: null }
  const min = parseInt(salaryMatch[0].replace(/[\s']/g, ''), 10) || null
  const max = salaryMatch.length >= 2 ? parseInt(salaryMatch[1].replace(/[\s']/g, ''), 10) || null : null
  return { min, max }
}

/**
 * Maps a Job Search offer to the job application fields.
 *
 * @param locationTemplate The locale's "{city}, Switzerland" text, used when
 *   the offer has no full location.
 */
export function jobListingToApplicationInput(
  job: Pick<
    JobListing,
    'title' | 'company' | 'location_city' | 'location_full' | 'salary_range' | 'application_url' | 'description'
  >,
  locationTemplate: string
): JobOfferApplicationInput {
  const salary = salaryBounds(job.salary_range)
  return {
    job_title: job.title,
    company_name: job.company,
    location: jobLocationLabel(job, locationTemplate),
    salary_min: salary.min,
    salary_max: salary.max,
    job_url: job.application_url || null,
    job_description: job.description || null,
    source: 'Adzuna',
  }
}
