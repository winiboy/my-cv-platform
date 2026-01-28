/**
 * Job Applications Batch API Route
 * PATCH: Batch update status and applied_date for multiple job applications
 *
 * Supports up to 50 items per request to prevent abuse.
 * Rate limited to 10 requests per minute per user.
 * All items must belong to the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { JOB_STATUSES } from '@/lib/constants/job-statuses'
import type { JobStatus, JobApplicationUpdate } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * Maximum number of items allowed in a single batch request.
 * Prevents abuse and ensures reasonable response times.
 */
const MAX_BATCH_SIZE = 50

/**
 * Rate limiting configuration
 * Note: In-memory rate limiting resets on server restart.
 * For serverless/distributed environments, consider using Redis or Upstash.
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10 // max 10 batch requests per minute per user

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

/**
 * Checks if a user has exceeded their rate limit.
 * Uses a sliding window approach with automatic cleanup.
 */
function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const userLimit = rateLimitMap.get(userId)

  // Clean up expired entry or create new one
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true }
  }

  // Check if limit exceeded
  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000)
    return { allowed: false, retryAfter }
  }

  // Increment counter
  userLimit.count++
  return { allowed: true }
}

/**
 * UUID validation regex pattern
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Zod schema for batch update request
 * Each update item can include status and/or applied_date
 */
const batchUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid('Invalid job application ID format'),
        status: z
          .enum(JOB_STATUSES as unknown as [string, ...string[]])
          .optional(),
        applied_date: z
          .string()
          .datetime({ message: 'Invalid ISO date format' })
          .nullable()
          .optional(),
      })
    )
    .min(1, 'At least one update is required')
    .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} items per batch request`),
})

type BatchUpdateItem = z.infer<typeof batchUpdateSchema>['updates'][number]

/**
 * PATCH /api/job-applications/batch
 * Updates multiple job applications' status and/or applied_date in a single request
 *
 * Request body:
 * {
 *   updates: [
 *     { id: "uuid", status: "applied", applied_date?: "2024-01-15T00:00:00.000Z" },
 *     { id: "uuid", status: "interviewing" },
 *     ...
 *   ]
 * }
 *
 * Behavior:
 * - All IDs must exist and belong to the authenticated user
 * - If status changes to 'applied' and no applied_date is provided and none exists, sets today's date
 * - Returns all updated records on success
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check rate limit
    const rateLimit = checkRateLimit(user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter),
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    // Parse and validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const validationResult = batchUpdateSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      )
    }

    const { updates } = validationResult.data

    // Extract all IDs and validate UUID format (defense in depth)
    const ids = updates.map((u) => u.id)
    const invalidIds = ids.filter((id) => !UUID_REGEX.test(id))

    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid job application ID format',
          invalidIds,
        },
        { status: 400 }
      )
    }

    // Fetch all job applications by IDs in a single query
    const { data: existingJobs, error: fetchError } = await supabase
      .from('job_applications')
      .select('id, user_id, status, applied_date')
      .in('id', ids)

    if (fetchError) {
      console.error('[API] Error fetching job applications for batch update:', {
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        userId: user.id,
        requestedIds: ids,
      })
      return NextResponse.json(
        { success: false, error: 'Failed to fetch job applications' },
        { status: 500 }
      )
    }

    // Check if all requested IDs were found
    const foundIds = new Set(existingJobs?.map((j) => j.id) || [])
    const missingIds = ids.filter((id) => !foundIds.has(id))

    if (missingIds.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Job applications not found',
          missingIds,
        },
        { status: 404 }
      )
    }

    // Verify ownership - all must belong to the authenticated user
    const unauthorizedIds = existingJobs
      ?.filter((j) => j.user_id !== user.id)
      .map((j) => j.id)

    if (unauthorizedIds && unauthorizedIds.length > 0) {
      // Security: Do not reveal which specific IDs failed ownership check
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Create a map for quick lookup of existing job data
    const existingJobsMap = new Map(
      existingJobs?.map((j) => [j.id, j]) || []
    )

    // Build update operations
    const now = new Date().toISOString()
    const todayDate = now.split('T')[0]

    const updatePromises = updates.map(async (updateItem: BatchUpdateItem) => {
      const existing = existingJobsMap.get(updateItem.id)
      if (!existing) {
        // This should never happen due to earlier checks, but handle defensively
        return { id: updateItem.id, success: false, error: 'Not found' }
      }

      // Build update data object with proper typing for Supabase
      const updateData: JobApplicationUpdate & { updated_at: string } = {
        updated_at: now,
      }

      // Add status if provided (cast to JobStatus for type safety)
      if (updateItem.status !== undefined) {
        updateData.status = updateItem.status as JobStatus
      }

      // Handle applied_date logic (same as single update endpoint)
      if (updateItem.applied_date !== undefined) {
        // Explicit applied_date provided (could be null to clear it)
        updateData.applied_date = updateItem.applied_date
      } else if (
        updateItem.status === 'applied' &&
        existing.status !== 'applied' &&
        !existing.applied_date
      ) {
        // Status changing to 'applied' and no existing applied_date - set to today
        updateData.applied_date = todayDate
      }

      // Perform the update
      const { data: updatedJob, error: updateError } = await supabase
        .from('job_applications')
        .update(updateData)
        .eq('id', updateItem.id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (updateError) {
        console.error('[API] Error updating job application in batch:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          jobId: updateItem.id,
          userId: user.id,
        })
        return { id: updateItem.id, success: false, error: 'Update failed' }
      }

      return { id: updateItem.id, success: true, data: updatedJob }
    })

    // Execute all updates in parallel
    const results = await Promise.all(updatePromises)

    // Check if any updates failed
    const failedUpdates = results.filter((r) => !r.success)

    if (failedUpdates.length > 0) {
      // Some updates failed - return partial failure response
      console.error('[API] Batch update partial failure:', {
        userId: user.id,
        totalRequested: updates.length,
        failed: failedUpdates.length,
        failedIds: failedUpdates.map((f) => f.id),
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Some updates failed',
          results: {
            updated: results.filter((r) => r.success).map((r) => r.data),
            // Sanitize error messages to prevent database error disclosure
            failed: failedUpdates.map((f) => ({ id: f.id, error: 'Update failed' })),
          },
        },
        {
          status: 207, // 207 Multi-Status for partial success
          headers: {
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
          },
        }
      )
    }

    // All updates succeeded
    const updatedJobs = results.map((r) => r.data)

    return NextResponse.json(
      {
        success: true,
        data: {
          updated: updatedJobs,
          count: updatedJobs.length,
        },
      },
      {
        headers: {
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
        },
      }
    )
  } catch (error) {
    console.error('[API] Unexpected error in job-applications batch PATCH:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
