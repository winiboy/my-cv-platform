import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import type { createServerSupabaseClient } from '@/lib/supabase/server'
import { JOB_STATUSES } from '@/lib/constants/job-statuses'
import type { JobApplication, JobStatus } from '@/types/database'

/**
 * Creating a job application from Job Search, server side: the request schema
 * and the insert with its `user_id` + `job_url` duplicate check.
 *
 * Shared by `POST /api/job-applications` (the "Save" button and the Kanban
 * quick-add) and `POST /api/ai/generate-from-job-description` (the "Créer un
 * CV" flow, job-cv-linking US-001), so that both store the same fields and
 * refuse the same duplicates (job-cv-linking FR-2).
 */

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Valid job statuses for validation.
 * Uses the canonical JOB_STATUSES array from constants.
 */
const jobStatusSchema = z.enum(JOB_STATUSES as [string, ...string[]])

/**
 * Zod schema for job application creation from job search
 * Maps job search data to job_applications table fields
 */
export const jobApplicationCreateSchema = z.object({
  job_title: z.string().min(1, 'Job title is required').max(255),
  company_name: z.string().min(1, 'Company name is required').max(255),
  location: z.string().max(500).nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  job_url: z.string().url().max(2000).nullable().optional(),
  job_description: z.string().max(50000).nullable().optional(),
  source: z.string().max(100).nullable().optional(),
  /** Optional status for quick-add from Kanban column. Defaults to 'saved' if not provided. */
  status: jobStatusSchema.optional(),
})

export type JobApplicationCreateInput = z.infer<typeof jobApplicationCreateSchema>

/**
 * The offer sent along with "Créer un CV" from Job Search (job-cv-linking
 * US-001, FR-3): the Save schema and its limits, with two differences that only
 * narrow it. The status is not the caller's to choose, so it is dropped and the
 * application is created `saved`. The URL must be http(s): it is the offer's
 * link, and a `javascript:` or `data:` URL stored here would later be rendered
 * as a link.
 */
export const jobOfferApplicationSchema = jobApplicationCreateSchema.omit({ status: true }).extend({
  job_url: jobApplicationCreateSchema.shape.job_url.refine(
    (url) => url === null || url === undefined || isHttpUrl(url),
    'job_url must be an http(s) URL'
  ),
})

export type JobOfferApplication = z.infer<typeof jobOfferApplicationSchema>

/** False for anything `URL` cannot parse: the refinement may run after `.url()` failed. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** The salary range text stored for the given bounds, or `null` without any. */
export function formatSalaryRange(
  salaryMin: number | null | undefined,
  salaryMax: number | null | undefined
): string | null {
  if (salaryMin !== null && salaryMin !== undefined && salaryMax !== null && salaryMax !== undefined) {
    return `${salaryMin.toLocaleString('de-CH')} - ${salaryMax.toLocaleString('de-CH')} CHF`
  }
  if (salaryMin !== null && salaryMin !== undefined) {
    return `From ${salaryMin.toLocaleString('de-CH')} CHF`
  }
  if (salaryMax !== null && salaryMax !== undefined) {
    return `Up to ${salaryMax.toLocaleString('de-CH')} CHF`
  }
  return null
}

export type CreateJobApplicationResult =
  | { kind: 'created'; jobApplication: JobApplication }
  /** The user already has an application with this `job_url`; nothing was written. */
  | { kind: 'duplicate'; existing: { id: string } }
  | { kind: 'failed'; error: PostgrestError }

/**
 * Inserts the user's job application, unless the user already has one with
 * the same `job_url`. An application without a URL is always inserted: there
 * is nothing to match it on.
 *
 * `userId` must be the authenticated user's id; RLS enforces it again.
 */
export async function createJobApplicationWithDedupe(
  supabase: ServerSupabaseClient,
  userId: string,
  input: JobApplicationCreateInput
): Promise<CreateJobApplicationResult> {
  const {
    job_title,
    company_name,
    location,
    salary_min,
    salary_max,
    job_url,
    job_description,
    source,
    status: requestedStatus,
  } = input

  if (job_url) {
    const { data: existingJob } = await supabase
      .from('job_applications')
      .select('id')
      .eq('user_id', userId)
      .eq('job_url', job_url)
      .single()

    if (existingJob) {
      return { kind: 'duplicate', existing: existingJob }
    }
  }

  // The schema accepts only JOB_STATUSES, which are the column's values.
  const initialStatus = (requestedStatus || 'saved') as JobStatus

  const { data: jobApplication, error } = await supabase
    .from('job_applications')
    .insert({
      user_id: userId,
      job_title,
      company_name,
      location: location || null,
      salary_range: formatSalaryRange(salary_min, salary_max),
      job_url: job_url || null,
      job_description: job_description || null,
      status: initialStatus,
      priority: 'medium',
      notes: source ? `Source: ${source}` : null,
      contacts: [],
      documents: [],
      interviews: [],
      is_archived: false,
    })
    .select()
    .single()

  if (error) {
    return { kind: 'failed', error }
  }

  return { kind: 'created', jobApplication }
}
