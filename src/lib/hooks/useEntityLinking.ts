'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

// Database row types
type Resume = Database['public']['Tables']['resumes']['Row']
type JobApplication = Database['public']['Tables']['job_applications']['Row']

// Entity types for the hook
export type EntityType = 'resume' | 'coverLetter' | 'jobApplication'

// Inconsistency categories for auto-repair
type InconsistencyCategory =
  | 'A1' // Resume has job_application_id, but Job's resume_id is null
  | 'A2' // Resume has job_application_id, but Job's resume_id points to different resume
  | 'A3' // Job has resume_id, but Resume's job_application_id is null
  | 'A4' // Job has resume_id, but Resume's job_application_id points to different job
  | 'B1' // CoverLetter has job_application_id, but Job's cover_letter_id is null
  | 'B2' // CoverLetter has job_application_id, but Job's cover_letter_id points to different CL
  | 'B3' // Job has cover_letter_id, but CoverLetter's job_application_id is null
  | 'B4' // Job has cover_letter_id, but CoverLetter's job_application_id points to different job
  | 'C1' // CoverLetter has resume_id, Resume has job_application_id, but CoverLetter's job_application_id is null
  | 'C2' // CoverLetter has resume_id, Resume has job_application_id, but CoverLetter's job_application_id differs
  | 'D1' // Resume references non-existent job
  | 'D2' // CoverLetter references non-existent job
  | 'D3' // CoverLetter references non-existent resume
  | 'D4' // Job references non-existent resume
  | 'D5' // Job references non-existent cover letter

interface Inconsistency {
  category: InconsistencyCategory
  entityType: EntityType
  entityId: string
  details: string
  repairAction: RepairAction
}

interface RepairAction {
  table: 'resumes' | 'cover_letters' | 'job_applications'
  id: string
  field: string
  value: string | null
}

// Linked entity info types (subset of fields needed for display)
export interface LinkedJobInfo {
  id: string
  company_name: string
  job_title: string
  location: string | null
  status: JobApplication['status']
}

export interface LinkedResumeInfo {
  id: string
  title: string
  template: Resume['template']
}

export interface LinkedCoverLetterInfo {
  id: string
  title: string
  company_name: string | null
  job_title: string | null
}

export interface UseEntityLinkingParams {
  entityType: EntityType
  entityId: string
}

export interface UseEntityLinkingReturn {
  linkedJob: LinkedJobInfo | null
  linkedResume: LinkedResumeInfo | null
  linkedCoverLetters: LinkedCoverLetterInfo[]
  isLoading: boolean
  error: string | null
  linkJob: (jobId: string) => Promise<void>
  unlinkJob: () => Promise<void>
  linkResume: (resumeId: string) => Promise<void>
  unlinkResume: () => Promise<void>
  linkCoverLetter: (coverLetterId: string) => Promise<void>
  unlinkCoverLetter: (coverLetterId: string) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Detects inconsistencies in entity linking based on the current entity type.
 * Returns an array of inconsistencies that need to be repaired.
 */
async function detectInconsistencies(
  supabase: SupabaseClient<Database>,
  entityType: EntityType,
  entityId: string
): Promise<Inconsistency[]> {
  const inconsistencies: Inconsistency[] = []

  if (entityType === 'resume') {
    // Fetch resume data
    const { data: resume } = await supabase
      .from('resumes')
      .select('id, job_application_id')
      .eq('id', entityId)
      .single()

    if (!resume) return inconsistencies

    // Check Category A: Resume <-> Job links
    if (resume.job_application_id) {
      const { data: job } = await supabase
        .from('job_applications')
        .select('id, resume_id')
        .eq('id', resume.job_application_id)
        .single()

      if (!job) {
        // D1: Resume references non-existent job
        inconsistencies.push({
          category: 'D1',
          entityType: 'resume',
          entityId: resume.id,
          details: `Resume references non-existent job ${resume.job_application_id}`,
          repairAction: {
            table: 'resumes',
            id: resume.id,
            field: 'job_application_id',
            value: null,
          },
        })
      } else if (job.resume_id === null) {
        // A1: Resume has job_application_id, but Job's resume_id is null
        inconsistencies.push({
          category: 'A1',
          entityType: 'resume',
          entityId: resume.id,
          details: `Resume linked to job ${job.id}, but job has no resume_id`,
          repairAction: {
            table: 'job_applications',
            id: job.id,
            field: 'resume_id',
            value: resume.id,
          },
        })
      } else if (job.resume_id !== resume.id) {
        // A2: Resume has job_application_id, but Job's resume_id points to different resume
        inconsistencies.push({
          category: 'A2',
          entityType: 'resume',
          entityId: resume.id,
          details: `Resume linked to job ${job.id}, but job points to different resume ${job.resume_id}`,
          repairAction: {
            table: 'job_applications',
            id: job.id,
            field: 'resume_id',
            value: resume.id,
          },
        })
      }
    }

    // Check for cover letters linked to this resume that need transitive propagation
    const { data: coverLetters } = await supabase
      .from('cover_letters')
      .select('id, job_application_id')
      .eq('resume_id', entityId)

    if (coverLetters && resume.job_application_id) {
      for (const cl of coverLetters) {
        if (cl.job_application_id === null) {
          // C1: CoverLetter has resume_id, Resume has job_application_id, but CL's job_application_id is null
          inconsistencies.push({
            category: 'C1',
            entityType: 'coverLetter',
            entityId: cl.id,
            details: `CoverLetter linked to resume with job, but has no job_application_id`,
            repairAction: {
              table: 'cover_letters',
              id: cl.id,
              field: 'job_application_id',
              value: resume.job_application_id,
            },
          })
        } else if (cl.job_application_id !== resume.job_application_id) {
          // C2: CoverLetter has resume_id, Resume has job_application_id, but CL's job_application_id differs
          inconsistencies.push({
            category: 'C2',
            entityType: 'coverLetter',
            entityId: cl.id,
            details: `CoverLetter job_application_id ${cl.job_application_id} differs from resume's ${resume.job_application_id}`,
            repairAction: {
              table: 'cover_letters',
              id: cl.id,
              field: 'job_application_id',
              value: resume.job_application_id,
            },
          })
        }
      }
    }
  } else if (entityType === 'coverLetter') {
    // Fetch cover letter data
    const { data: coverLetter } = await supabase
      .from('cover_letters')
      .select('id, resume_id, job_application_id')
      .eq('id', entityId)
      .single()

    if (!coverLetter) return inconsistencies

    // Check Category D3: CoverLetter references non-existent resume
    if (coverLetter.resume_id) {
      const { data: resume } = await supabase
        .from('resumes')
        .select('id, job_application_id')
        .eq('id', coverLetter.resume_id)
        .single()

      if (!resume) {
        // D3: CoverLetter references non-existent resume
        inconsistencies.push({
          category: 'D3',
          entityType: 'coverLetter',
          entityId: coverLetter.id,
          details: `CoverLetter references non-existent resume ${coverLetter.resume_id}`,
          repairAction: {
            table: 'cover_letters',
            id: coverLetter.id,
            field: 'resume_id',
            value: null,
          },
        })
      } else if (resume.job_application_id) {
        // Check Category C: Transitive propagation failures
        if (coverLetter.job_application_id === null) {
          // C1: CoverLetter has resume_id, Resume has job_application_id, but CL's job_application_id is null
          inconsistencies.push({
            category: 'C1',
            entityType: 'coverLetter',
            entityId: coverLetter.id,
            details: `CoverLetter linked to resume with job ${resume.job_application_id}, but has no job_application_id`,
            repairAction: {
              table: 'cover_letters',
              id: coverLetter.id,
              field: 'job_application_id',
              value: resume.job_application_id,
            },
          })
        } else if (coverLetter.job_application_id !== resume.job_application_id) {
          // C2: CoverLetter has resume_id, Resume has job_application_id, but CL's job_application_id differs
          inconsistencies.push({
            category: 'C2',
            entityType: 'coverLetter',
            entityId: coverLetter.id,
            details: `CoverLetter job_application_id ${coverLetter.job_application_id} differs from resume's ${resume.job_application_id}`,
            repairAction: {
              table: 'cover_letters',
              id: coverLetter.id,
              field: 'job_application_id',
              value: resume.job_application_id,
            },
          })
        }
      }
    }

    // Check Category B: CoverLetter <-> Job links
    if (coverLetter.job_application_id) {
      const { data: job } = await supabase
        .from('job_applications')
        .select('id, cover_letter_id')
        .eq('id', coverLetter.job_application_id)
        .single()

      if (!job) {
        // D2: CoverLetter references non-existent job
        inconsistencies.push({
          category: 'D2',
          entityType: 'coverLetter',
          entityId: coverLetter.id,
          details: `CoverLetter references non-existent job ${coverLetter.job_application_id}`,
          repairAction: {
            table: 'cover_letters',
            id: coverLetter.id,
            field: 'job_application_id',
            value: null,
          },
        })
      } else if (job.cover_letter_id === null) {
        // B1: CoverLetter has job_application_id, but Job's cover_letter_id is null
        inconsistencies.push({
          category: 'B1',
          entityType: 'coverLetter',
          entityId: coverLetter.id,
          details: `CoverLetter linked to job ${job.id}, but job has no cover_letter_id`,
          repairAction: {
            table: 'job_applications',
            id: job.id,
            field: 'cover_letter_id',
            value: coverLetter.id,
          },
        })
      } else if (job.cover_letter_id !== coverLetter.id) {
        // B2: CoverLetter has job_application_id, but Job's cover_letter_id points to different CL
        inconsistencies.push({
          category: 'B2',
          entityType: 'coverLetter',
          entityId: coverLetter.id,
          details: `CoverLetter linked to job ${job.id}, but job points to different CL ${job.cover_letter_id}`,
          repairAction: {
            table: 'job_applications',
            id: job.id,
            field: 'cover_letter_id',
            value: coverLetter.id,
          },
        })
      }
    }
  } else if (entityType === 'jobApplication') {
    // Fetch job application data
    const { data: job } = await supabase
      .from('job_applications')
      .select('id, resume_id, cover_letter_id')
      .eq('id', entityId)
      .single()

    if (!job) return inconsistencies

    // Check Category A: Job <-> Resume links
    if (job.resume_id) {
      const { data: resume } = await supabase
        .from('resumes')
        .select('id, job_application_id')
        .eq('id', job.resume_id)
        .single()

      if (!resume) {
        // D4: Job references non-existent resume
        inconsistencies.push({
          category: 'D4',
          entityType: 'jobApplication',
          entityId: job.id,
          details: `Job references non-existent resume ${job.resume_id}`,
          repairAction: {
            table: 'job_applications',
            id: job.id,
            field: 'resume_id',
            value: null,
          },
        })
      } else if (resume.job_application_id === null) {
        // A3: Job has resume_id, but Resume's job_application_id is null
        inconsistencies.push({
          category: 'A3',
          entityType: 'jobApplication',
          entityId: job.id,
          details: `Job linked to resume ${resume.id}, but resume has no job_application_id`,
          repairAction: {
            table: 'resumes',
            id: resume.id,
            field: 'job_application_id',
            value: job.id,
          },
        })
      } else if (resume.job_application_id !== job.id) {
        // A4: Job has resume_id, but Resume's job_application_id points to different job
        inconsistencies.push({
          category: 'A4',
          entityType: 'jobApplication',
          entityId: job.id,
          details: `Job linked to resume ${resume.id}, but resume points to different job ${resume.job_application_id}`,
          repairAction: {
            table: 'resumes',
            id: resume.id,
            field: 'job_application_id',
            value: job.id,
          },
        })
      }
    }

    // Check Category B: Job <-> CoverLetter links
    if (job.cover_letter_id) {
      const { data: coverLetter } = await supabase
        .from('cover_letters')
        .select('id, job_application_id')
        .eq('id', job.cover_letter_id)
        .single()

      if (!coverLetter) {
        // D5: Job references non-existent cover letter
        inconsistencies.push({
          category: 'D5',
          entityType: 'jobApplication',
          entityId: job.id,
          details: `Job references non-existent cover letter ${job.cover_letter_id}`,
          repairAction: {
            table: 'job_applications',
            id: job.id,
            field: 'cover_letter_id',
            value: null,
          },
        })
      } else if (coverLetter.job_application_id === null) {
        // B3: Job has cover_letter_id, but CoverLetter's job_application_id is null
        inconsistencies.push({
          category: 'B3',
          entityType: 'jobApplication',
          entityId: job.id,
          details: `Job linked to CL ${coverLetter.id}, but CL has no job_application_id`,
          repairAction: {
            table: 'cover_letters',
            id: coverLetter.id,
            field: 'job_application_id',
            value: job.id,
          },
        })
      } else if (coverLetter.job_application_id !== job.id) {
        // B4: Job has cover_letter_id, but CoverLetter's job_application_id points to different job
        inconsistencies.push({
          category: 'B4',
          entityType: 'jobApplication',
          entityId: job.id,
          details: `Job linked to CL ${coverLetter.id}, but CL points to different job ${coverLetter.job_application_id}`,
          repairAction: {
            table: 'cover_letters',
            id: coverLetter.id,
            field: 'job_application_id',
            value: job.id,
          },
        })
      }
    }
  }

  return inconsistencies
}

/**
 * Repairs a single inconsistency by applying the repair action.
 * Returns true if the repair was successful, false otherwise.
 */
async function repairInconsistency(
  supabase: SupabaseClient<Database>,
  inconsistency: Inconsistency
): Promise<boolean> {
  const { repairAction } = inconsistency

  try {
    const { error } = await supabase
      .from(repairAction.table)
      .update({ [repairAction.field]: repairAction.value })
      .eq('id', repairAction.id)

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[useEntityLinking] Failed to repair ${inconsistency.category}:`, error)
      }
      return false
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[useEntityLinking] Repaired ${inconsistency.category}: ${inconsistency.details}`,
        `\n  -> Set ${repairAction.table}.${repairAction.field} = ${repairAction.value}`
      )
    }

    return true
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[useEntityLinking] Error repairing ${inconsistency.category}:`, err)
    }
    return false
  }
}

/**
 * useEntityLinking - Centralized hook for managing 3-way entity linking
 *
 * This hook handles the tri-directional relationships between:
 * - Resumes (has job_application_id)
 * - Cover Letters (has resume_id, job_application_id)
 * - Job Applications (has resume_id, cover_letter_id)
 *
 * All linking operations propagate changes to related entities to maintain consistency.
 * The hook includes auto-repair logic that detects and fixes inconsistent links on mount.
 */
export function useEntityLinking({
  entityType,
  entityId,
}: UseEntityLinkingParams): UseEntityLinkingReturn {
  const [linkedJob, setLinkedJob] = useState<LinkedJobInfo | null>(null)
  const [linkedResume, setLinkedResume] = useState<LinkedResumeInfo | null>(null)
  const [linkedCoverLetters, setLinkedCoverLetters] = useState<LinkedCoverLetterInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetches linked entities based on the current entity type and ID
   */
  const fetchLinkedEntities = useCallback(async () => {
    if (!entityId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Auto-repair: Detect and fix inconsistencies before fetching display data
      const inconsistencies = await detectInconsistencies(supabase, entityType, entityId)

      if (inconsistencies.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log(
            `[useEntityLinking] Detected ${inconsistencies.length} inconsistencies for ${entityType} ${entityId}`
          )
        }

        // Apply repairs
        let repairsApplied = 0
        for (const inconsistency of inconsistencies) {
          const success = await repairInconsistency(supabase, inconsistency)
          if (success) repairsApplied++
        }

        if (repairsApplied > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `[useEntityLinking] Applied ${repairsApplied}/${inconsistencies.length} repairs`
            )
          }
          // Note: We continue with fetching - the repairs have been applied to the database
          // and the subsequent queries will return the corrected data
        }
      }

      if (entityType === 'resume') {
        // Fetch resume to get job_application_id
        const { data: resume, error: resumeError } = await supabase
          .from('resumes')
          .select('job_application_id')
          .eq('id', entityId)
          .single()

        if (resumeError) throw resumeError

        // Fetch linked job if exists
        if (resume?.job_application_id) {
          const { data: job, error: jobError } = await supabase
            .from('job_applications')
            .select('id, company_name, job_title, location, status')
            .eq('id', resume.job_application_id)
            .single()

          if (jobError) throw jobError
          setLinkedJob(job)
        } else {
          setLinkedJob(null)
        }

        // Fetch cover letters linked to this resume
        const { data: coverLetters, error: clError } = await supabase
          .from('cover_letters')
          .select('id, title, company_name, job_title')
          .eq('resume_id', entityId)

        if (clError) throw clError
        setLinkedCoverLetters(coverLetters || [])

        // Resume has no linkedResume (it IS the resume)
        setLinkedResume(null)
      } else if (entityType === 'coverLetter') {
        // Fetch cover letter to get resume_id and job_application_id
        const { data: coverLetter, error: clError } = await supabase
          .from('cover_letters')
          .select('resume_id, job_application_id')
          .eq('id', entityId)
          .single()

        if (clError) throw clError

        // Fetch linked resume if exists
        if (coverLetter?.resume_id) {
          const { data: resume, error: resumeError } = await supabase
            .from('resumes')
            .select('id, title, template')
            .eq('id', coverLetter.resume_id)
            .single()

          if (resumeError) throw resumeError
          setLinkedResume(resume)
        } else {
          setLinkedResume(null)
        }

        // Fetch linked job if exists
        if (coverLetter?.job_application_id) {
          const { data: job, error: jobError } = await supabase
            .from('job_applications')
            .select('id, company_name, job_title, location, status')
            .eq('id', coverLetter.job_application_id)
            .single()

          if (jobError) throw jobError
          setLinkedJob(job)
        } else {
          setLinkedJob(null)
        }

        // Cover letter doesn't have linked cover letters (it IS a cover letter)
        setLinkedCoverLetters([])
      } else if (entityType === 'jobApplication') {
        // Fetch job application to get resume_id and cover_letter_id
        const { data: job, error: jobError } = await supabase
          .from('job_applications')
          .select('id, company_name, job_title, location, status, resume_id, cover_letter_id')
          .eq('id', entityId)
          .single()

        if (jobError) throw jobError

        // Set self as linked job for consistency
        setLinkedJob({
          id: job.id,
          company_name: job.company_name,
          job_title: job.job_title,
          location: job.location,
          status: job.status,
        })

        // Fetch linked resume if exists
        if (job?.resume_id) {
          const { data: resume, error: resumeError } = await supabase
            .from('resumes')
            .select('id, title, template')
            .eq('id', job.resume_id)
            .single()

          if (resumeError) throw resumeError
          setLinkedResume(resume)
        } else {
          setLinkedResume(null)
        }

        // Fetch linked cover letter if exists (as array for consistency)
        if (job?.cover_letter_id) {
          const { data: coverLetter, error: clError } = await supabase
            .from('cover_letters')
            .select('id, title, company_name, job_title')
            .eq('id', job.cover_letter_id)
            .single()

          if (clError) throw clError
          setLinkedCoverLetters(coverLetter ? [coverLetter] : [])
        } else {
          setLinkedCoverLetters([])
        }
      }
    } catch (err) {
      console.error('Error fetching linked entities:', err)
      setError('Failed to fetch linked entities')
    } finally {
      setIsLoading(false)
    }
  }, [entityType, entityId])

  // Fetch linked entities on mount and when entityType/entityId changes
  useEffect(() => {
    fetchLinkedEntities()
  }, [fetchLinkedEntities])

  /**
   * Links a job application to the current entity with 3-way propagation
   */
  const linkJob = useCallback(
    async (jobId: string) => {
      setError(null)

      try {
        const supabase = createClient()

        if (entityType === 'resume') {
          // Step 1: Get current resume's job_application_id to clear reverse link
          const { data: currentResume } = await supabase
            .from('resumes')
            .select('job_application_id')
            .eq('id', entityId)
            .single()

          const previousJobId = currentResume?.job_application_id

          // Step 2: Update resume's job_application_id
          const { error: resumeError } = await supabase
            .from('resumes')
            .update({ job_application_id: jobId })
            .eq('id', entityId)

          if (resumeError) throw resumeError

          // Step 3: Update job application's resume_id
          const { error: jobError } = await supabase
            .from('job_applications')
            .update({ resume_id: entityId })
            .eq('id', jobId)

          if (jobError) {
            // Rollback resume update
            await supabase
              .from('resumes')
              .update({ job_application_id: previousJobId })
              .eq('id', entityId)
            throw jobError
          }

          // Step 4: Clear previous job's resume_id if different
          if (previousJobId && previousJobId !== jobId) {
            await supabase
              .from('job_applications')
              .update({ resume_id: null })
              .eq('id', previousJobId)
          }

          // Step 5: Propagate job_application_id to all cover letters linked to this resume
          // First, fetch their current job_application_id values to clear old job references
          const { data: linkedCLs } = await supabase
            .from('cover_letters')
            .select('id, job_application_id')
            .eq('resume_id', entityId)

          if (linkedCLs && linkedCLs.length > 0) {
            // Collect old job IDs that need their cover_letter_id cleared
            const oldJobIdsToClean = new Set<string>()
            for (const cl of linkedCLs) {
              if (cl.job_application_id && cl.job_application_id !== jobId) {
                oldJobIdsToClean.add(cl.job_application_id)
              }
            }

            // Clear cover_letter_id from old jobs
            const oldJobIdsArray = Array.from(oldJobIdsToClean)
            for (let i = 0; i < oldJobIdsArray.length; i++) {
              await supabase
                .from('job_applications')
                .update({ cover_letter_id: null })
                .eq('id', oldJobIdsArray[i])
            }

            // Update cover letters with the new job_application_id
            await supabase
              .from('cover_letters')
              .update({ job_application_id: jobId })
              .eq('resume_id', entityId)
          }
        } else if (entityType === 'coverLetter') {
          // Step 1: Get current cover letter data
          const { data: currentCL } = await supabase
            .from('cover_letters')
            .select('job_application_id, resume_id')
            .eq('id', entityId)
            .single()

          const previousJobId = currentCL?.job_application_id

          // Step 2: Update cover letter's job_application_id
          const { error: clError } = await supabase
            .from('cover_letters')
            .update({ job_application_id: jobId, updated_at: new Date().toISOString() })
            .eq('id', entityId)

          if (clError) throw clError

          // Step 3: Clear previous job's cover_letter_id if different
          if (previousJobId && previousJobId !== jobId) {
            await supabase
              .from('job_applications')
              .update({ cover_letter_id: null })
              .eq('id', previousJobId)
          }

          // Step 4: Build job update payload with cover_letter_id and propagate resume_id
          const jobUpdatePayload: { cover_letter_id: string; resume_id?: string | null } = {
            cover_letter_id: entityId,
          }

          // Propagate resume_id if cover letter has one
          if (currentCL?.resume_id !== undefined) {
            jobUpdatePayload.resume_id = currentCL.resume_id
          }

          const { error: jobError } = await supabase
            .from('job_applications')
            .update(jobUpdatePayload)
            .eq('id', jobId)

          if (jobError) {
            // Rollback cover letter update
            await supabase
              .from('cover_letters')
              .update({ job_application_id: previousJobId, updated_at: new Date().toISOString() })
              .eq('id', entityId)
            if (previousJobId) {
              await supabase
                .from('job_applications')
                .update({ cover_letter_id: entityId })
                .eq('id', previousJobId)
            }
            throw jobError
          }

          // GAP #1 FIX: Propagate job_application_id to the linked resume
          // When linking a job from a cover letter, if the CL has a resume_id,
          // that resume should also be linked to this job
          if (currentCL?.resume_id) {
            await supabase
              .from('resumes')
              .update({ job_application_id: jobId })
              .eq('id', currentCL.resume_id)
          }
        } else if (entityType === 'jobApplication') {
          // Job application linking to itself is a no-op
          console.warn('Cannot link a job application to itself')
          return
        }

        // Refresh linked entities
        await fetchLinkedEntities()
      } catch (err) {
        console.error('Error linking job:', err)
        setError('Failed to link job application')
      }
    },
    [entityType, entityId, fetchLinkedEntities]
  )

  /**
   * Unlinks the current job application from the entity with 3-way cleanup
   */
  const unlinkJob = useCallback(async () => {
    if (!linkedJob) return

    setError(null)

    try {
      const supabase = createClient()

      if (entityType === 'resume') {
        // Step 1: Clear resume's job_application_id
        const { error: resumeError } = await supabase
          .from('resumes')
          .update({ job_application_id: null })
          .eq('id', entityId)

        if (resumeError) throw resumeError

        // Step 2: Clear job application's resume_id
        const { error: jobError } = await supabase
          .from('job_applications')
          .update({ resume_id: null })
          .eq('id', linkedJob.id)

        if (jobError) {
          // Rollback resume update
          await supabase
            .from('resumes')
            .update({ job_application_id: linkedJob.id })
            .eq('id', entityId)
          throw jobError
        }

        // Step 3: Clear job_application_id from cover letters linked to this resume
        await supabase
          .from('cover_letters')
          .update({ job_application_id: null })
          .eq('resume_id', entityId)
      } else if (entityType === 'coverLetter') {
        // Step 1: Clear cover letter's job_application_id
        const { error: clError } = await supabase
          .from('cover_letters')
          .update({ job_application_id: null, updated_at: new Date().toISOString() })
          .eq('id', entityId)

        if (clError) throw clError

        // Step 2: Clear job application's cover_letter_id
        const { error: jobError } = await supabase
          .from('job_applications')
          .update({ cover_letter_id: null })
          .eq('id', linkedJob.id)

        if (jobError) {
          // Rollback cover letter update
          await supabase
            .from('cover_letters')
            .update({ job_application_id: linkedJob.id, updated_at: new Date().toISOString() })
            .eq('id', entityId)
          throw jobError
        }
      } else if (entityType === 'jobApplication') {
        // Unlinking job from itself is a no-op
        console.warn('Cannot unlink a job application from itself')
        return
      }

      // Refresh linked entities
      await fetchLinkedEntities()
    } catch (err) {
      console.error('Error unlinking job:', err)
      setError('Failed to unlink job application')
    }
  }, [entityType, entityId, linkedJob, fetchLinkedEntities])

  /**
   * Links a resume to the current entity with transitive job propagation
   */
  const linkResume = useCallback(
    async (resumeId: string) => {
      setError(null)

      try {
        const supabase = createClient()

        if (entityType === 'coverLetter') {
          // Step 1: Get current cover letter's job_application_id for transitive propagation
          const { data: currentCL } = await supabase
            .from('cover_letters')
            .select('job_application_id')
            .eq('id', entityId)
            .single()

          // Step 2: Update cover letter's resume_id
          const { error: clError } = await supabase
            .from('cover_letters')
            .update({ resume_id: resumeId, updated_at: new Date().toISOString() })
            .eq('id', entityId)

          if (clError) throw clError

          // Step 3: Transitive propagation - if the new resume has a linked job,
          // propagate that job to the cover letter
          const { data: newResume } = await supabase
            .from('resumes')
            .select('job_application_id')
            .eq('id', resumeId)
            .single()

          if (newResume?.job_application_id) {
            // Update cover letter's job_application_id
            await supabase
              .from('cover_letters')
              .update({ job_application_id: newResume.job_application_id })
              .eq('id', entityId)

            // Update job application's cover_letter_id
            await supabase
              .from('job_applications')
              .update({ cover_letter_id: entityId })
              .eq('id', newResume.job_application_id)

            // Clear previous job's cover_letter_id if different
            if (
              currentCL?.job_application_id &&
              currentCL.job_application_id !== newResume.job_application_id
            ) {
              await supabase
                .from('job_applications')
                .update({ cover_letter_id: null })
                .eq('id', currentCL.job_application_id)
            }
          }

          // Step 4: If cover letter is linked to a job but new resume has NO linked job,
          // propagate resume_id to that job, then clear the cover letter's job link
          // and clear the job's cover_letter_id to prevent orphaned references
          if (currentCL?.job_application_id && !newResume?.job_application_id) {
            // Propagate resume_id to the job
            await supabase
              .from('job_applications')
              .update({ resume_id: resumeId, cover_letter_id: null })
              .eq('id', currentCL.job_application_id)

            // Clear the cover letter's job_application_id
            await supabase
              .from('cover_letters')
              .update({ job_application_id: null })
              .eq('id', entityId)
          }
        } else if (entityType === 'jobApplication') {
          // Step 1: Get current job's resume_id and cover_letter_id
          const { data: currentJob } = await supabase
            .from('job_applications')
            .select('resume_id, cover_letter_id')
            .eq('id', entityId)
            .single()

          const previousResumeId = currentJob?.resume_id

          // Step 2: Update job application's resume_id
          const { error: jobError } = await supabase
            .from('job_applications')
            .update({ resume_id: resumeId })
            .eq('id', entityId)

          if (jobError) throw jobError

          // Step 3: Update resume's job_application_id
          const { error: resumeError } = await supabase
            .from('resumes')
            .update({ job_application_id: entityId })
            .eq('id', resumeId)

          if (resumeError) {
            // Rollback job update
            await supabase
              .from('job_applications')
              .update({ resume_id: previousResumeId })
              .eq('id', entityId)
            throw resumeError
          }

          // Step 4: Clear previous resume's job_application_id if different
          if (previousResumeId && previousResumeId !== resumeId) {
            await supabase
              .from('resumes')
              .update({ job_application_id: null })
              .eq('id', previousResumeId)
          }

          // Step 5 (GAP #1 FIX): Propagate resume_id to job's linked cover letter
          // When linking a resume from the Job Application page, if the job has a
          // cover_letter_id, that cover letter's resume_id should be updated
          if (currentJob?.cover_letter_id) {
            await supabase
              .from('cover_letters')
              .update({ resume_id: resumeId, updated_at: new Date().toISOString() })
              .eq('id', currentJob.cover_letter_id)
          }
        } else if (entityType === 'resume') {
          // Resume linking to a resume is not applicable
          console.warn('Cannot link a resume to another resume')
          return
        }

        // Refresh linked entities
        await fetchLinkedEntities()
      } catch (err) {
        console.error('Error linking resume:', err)
        setError('Failed to link resume')
      }
    },
    [entityType, entityId, fetchLinkedEntities]
  )

  /**
   * Unlinks the current resume from the entity
   */
  const unlinkResume = useCallback(async () => {
    if (!linkedResume) return

    setError(null)

    try {
      const supabase = createClient()

      if (entityType === 'coverLetter') {
        // Step 1: Get current cover letter's job_application_id
        const { data: currentCL } = await supabase
          .from('cover_letters')
          .select('job_application_id')
          .eq('id', entityId)
          .single()

        // Step 2: Clear cover letter's resume_id AND job_application_id
        // GAP #4 FIX: When unlinking a resume from a cover letter,
        // also clear the cover letter's job_application_id to prevent orphaned job links
        const { error: clError } = await supabase
          .from('cover_letters')
          .update({ resume_id: null, job_application_id: null, updated_at: new Date().toISOString() })
          .eq('id', entityId)

        if (clError) throw clError

        // Step 3: If cover letter was linked to a job, clear that job's references
        // Single atomic update to clear both resume_id and cover_letter_id
        if (currentCL?.job_application_id) {
          await supabase
            .from('job_applications')
            .update({ resume_id: null, cover_letter_id: null })
            .eq('id', currentCL.job_application_id)
        }
      } else if (entityType === 'jobApplication') {
        // Step 1: Get job's cover_letter_id before clearing resume
        const { data: currentJob } = await supabase
          .from('job_applications')
          .select('cover_letter_id')
          .eq('id', entityId)
          .single()

        // Step 2: Clear job application's resume_id
        const { error: jobError } = await supabase
          .from('job_applications')
          .update({ resume_id: null })
          .eq('id', entityId)

        if (jobError) throw jobError

        // Step 3: Clear resume's job_application_id
        const { error: resumeError } = await supabase
          .from('resumes')
          .update({ job_application_id: null })
          .eq('id', linkedResume.id)

        if (resumeError) {
          // Rollback job update
          await supabase
            .from('job_applications')
            .update({ resume_id: linkedResume.id })
            .eq('id', entityId)
          throw resumeError
        }

        // Step 4 (GAP #2 FIX): Clear resume_id from job's linked cover letter
        // When unlinking a resume from the Job Application page, if the job has a
        // cover_letter_id, that cover letter's resume_id should also be cleared
        if (currentJob?.cover_letter_id) {
          await supabase
            .from('cover_letters')
            .update({ resume_id: null, updated_at: new Date().toISOString() })
            .eq('id', currentJob.cover_letter_id)
        }
      } else if (entityType === 'resume') {
        // Resume unlinking from itself is not applicable
        console.warn('Cannot unlink a resume from itself')
        return
      }

      // Refresh linked entities
      await fetchLinkedEntities()
    } catch (err) {
      console.error('Error unlinking resume:', err)
      setError('Failed to unlink resume')
    }
  }, [entityType, entityId, linkedResume, fetchLinkedEntities])

  /**
   * Links a cover letter to the current entity
   */
  const linkCoverLetter = useCallback(
    async (coverLetterId: string) => {
      setError(null)

      try {
        const supabase = createClient()

        if (entityType === 'resume') {
          // Step 1: Get cover letter's current job_application_id to clear old job reference if needed
          const { data: currentCL } = await supabase
            .from('cover_letters')
            .select('job_application_id')
            .eq('id', coverLetterId)
            .single()

          const previousJobId = currentCL?.job_application_id

          // Step 2: Update cover letter's resume_id to this resume
          const { error: clError } = await supabase
            .from('cover_letters')
            .update({ resume_id: entityId, updated_at: new Date().toISOString() })
            .eq('id', coverLetterId)

          if (clError) throw clError

          // Step 3: Get this resume's job_application_id
          const { data: resume } = await supabase
            .from('resumes')
            .select('job_application_id')
            .eq('id', entityId)
            .single()

          // Step 4: Propagate job_application_id to the cover letter
          if (resume?.job_application_id) {
            await supabase
              .from('cover_letters')
              .update({ job_application_id: resume.job_application_id })
              .eq('id', coverLetterId)

            // Update job's cover_letter_id
            await supabase
              .from('job_applications')
              .update({ cover_letter_id: coverLetterId })
              .eq('id', resume.job_application_id)

            // Step 5: Clear previous job's cover_letter_id if it was linked to a different job
            if (previousJobId && previousJobId !== resume.job_application_id) {
              await supabase
                .from('job_applications')
                .update({ cover_letter_id: null })
                .eq('id', previousJobId)
            }
          }
        } else if (entityType === 'jobApplication') {
          // Step 1: Get current job's cover_letter_id
          const { data: currentJob } = await supabase
            .from('job_applications')
            .select('cover_letter_id, resume_id')
            .eq('id', entityId)
            .single()

          const previousCLId = currentJob?.cover_letter_id

          // Step 2: Update job application's cover_letter_id
          const { error: jobError } = await supabase
            .from('job_applications')
            .update({ cover_letter_id: coverLetterId })
            .eq('id', entityId)

          if (jobError) throw jobError

          // Step 3: Update cover letter's job_application_id
          const { error: clError } = await supabase
            .from('cover_letters')
            .update({ job_application_id: entityId, updated_at: new Date().toISOString() })
            .eq('id', coverLetterId)

          if (clError) {
            // Rollback job update
            await supabase
              .from('job_applications')
              .update({ cover_letter_id: previousCLId })
              .eq('id', entityId)
            throw clError
          }

          // Step 4: Clear previous cover letter's job_application_id if different
          if (previousCLId && previousCLId !== coverLetterId) {
            await supabase
              .from('cover_letters')
              .update({ job_application_id: null, updated_at: new Date().toISOString() })
              .eq('id', previousCLId)
          }

          // Step 5: If job has a linked resume, propagate to cover letter
          if (currentJob?.resume_id) {
            await supabase
              .from('cover_letters')
              .update({ resume_id: currentJob.resume_id })
              .eq('id', coverLetterId)
          }
        } else if (entityType === 'coverLetter') {
          // Cover letter linking to another cover letter is not applicable
          console.warn('Cannot link a cover letter to another cover letter')
          return
        }

        // Refresh linked entities
        await fetchLinkedEntities()
      } catch (err) {
        console.error('Error linking cover letter:', err)
        setError('Failed to link cover letter')
      }
    },
    [entityType, entityId, fetchLinkedEntities]
  )

  /**
   * Unlinks a cover letter from the current entity
   */
  const unlinkCoverLetter = useCallback(
    async (coverLetterId: string) => {
      setError(null)

      try {
        const supabase = createClient()

        if (entityType === 'resume') {
          // Step 1: Get the cover letter's current job_application_id
          const { data: cl } = await supabase
            .from('cover_letters')
            .select('job_application_id')
            .eq('id', coverLetterId)
            .single()

          // Step 2: Clear cover letter's resume_id
          const { error: clError } = await supabase
            .from('cover_letters')
            .update({ resume_id: null, updated_at: new Date().toISOString() })
            .eq('id', coverLetterId)

          if (clError) throw clError

          // Step 3: If cover letter was linked to a job, clear the job's cover_letter_id
          if (cl?.job_application_id) {
            await supabase
              .from('job_applications')
              .update({ cover_letter_id: null })
              .eq('id', cl.job_application_id)

            // Also clear the cover letter's job_application_id
            await supabase
              .from('cover_letters')
              .update({ job_application_id: null })
              .eq('id', coverLetterId)
          }
        } else if (entityType === 'jobApplication') {
          // Step 1: Clear job application's cover_letter_id
          const { error: jobError } = await supabase
            .from('job_applications')
            .update({ cover_letter_id: null })
            .eq('id', entityId)

          if (jobError) throw jobError

          // Step 2: Clear cover letter's job_application_id
          const { error: clError } = await supabase
            .from('cover_letters')
            .update({ job_application_id: null, updated_at: new Date().toISOString() })
            .eq('id', coverLetterId)

          if (clError) {
            // Rollback is complex here, log and continue
            console.error('Error clearing cover letter job link:', clError)
          }
        } else if (entityType === 'coverLetter') {
          // Cover letter unlinking from itself is not applicable
          console.warn('Cannot unlink a cover letter from itself')
          return
        }

        // Refresh linked entities
        await fetchLinkedEntities()
      } catch (err) {
        console.error('Error unlinking cover letter:', err)
        setError('Failed to unlink cover letter')
      }
    },
    [entityType, entityId, fetchLinkedEntities]
  )

  /**
   * Refresh all linked entities
   */
  const refresh = useCallback(async () => {
    await fetchLinkedEntities()
  }, [fetchLinkedEntities])

  return {
    linkedJob,
    linkedResume,
    linkedCoverLetters,
    isLoading,
    error,
    linkJob,
    unlinkJob,
    linkResume,
    unlinkResume,
    linkCoverLetter,
    unlinkCoverLetter,
    refresh,
  }
}
