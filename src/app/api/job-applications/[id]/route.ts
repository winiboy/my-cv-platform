/**
 * Job Application [id] API Route
 * PATCH: Updates a job application status and fields
 * DELETE: Removes a job application
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * Valid job application statuses
 */
const JOB_STATUSES = [
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'accepted',
  'declined',
] as const

type JobStatus = (typeof JOB_STATUSES)[number]

/**
 * Zod schema for job application update
 * All fields are optional - only provided fields will be updated
 */
const jobApplicationUpdateSchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  applied_date: z
    .string()
    .datetime({ message: 'Invalid ISO date format' })
    .nullable()
    .optional(),
})

/**
 * PATCH /api/job-applications/[id]
 * Updates a job application's status and/or applied_date
 * Automatically sets applied_date to today if status changes to 'applied' and no date provided
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid job application ID format' },
        { status: 400 }
      )
    }

    // Check that the job application exists and belongs to the user
    const { data: existingJob, error: fetchError } = await supabase
      .from('job_applications')
      .select('id, user_id, status, applied_date')
      .eq('id', id)
      .single()

    if (fetchError || !existingJob) {
      return NextResponse.json(
        { success: false, error: 'Job application not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (existingJob.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = jobApplicationUpdateSchema.safeParse(body)

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

    const { status, applied_date } = validationResult.data

    // Build update object with only provided fields
    const updateData: {
      status?: JobStatus
      applied_date?: string | null
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (status !== undefined) {
      updateData.status = status
    }

    // Handle applied_date logic
    if (applied_date !== undefined) {
      // Explicit applied_date provided (could be null to clear it)
      updateData.applied_date = applied_date
    } else if (
      status === 'applied' &&
      existingJob.status !== 'applied' &&
      !existingJob.applied_date
    ) {
      // Status changing to 'applied' and no existing applied_date - set to today
      updateData.applied_date = new Date().toISOString().split('T')[0]
    }

    // Perform the update
    const { data: updatedJob, error: updateError } = await supabase
      .from('job_applications')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('[API] Error updating job application:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        jobId: id,
        userId: user.id,
      })
      return NextResponse.json(
        { success: false, error: 'Failed to update job application' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updatedJob,
    })
  } catch (error) {
    console.error('[API] Unexpected error in job-applications PATCH:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/job-applications/[id]
 * Deletes a job application belonging to the authenticated user
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid job application ID format' },
        { status: 400 }
      )
    }

    // Check that the job application exists and belongs to the user
    const { data: existingJob, error: fetchError } = await supabase
      .from('job_applications')
      .select('id, user_id')
      .eq('id', id)
      .single()

    if (fetchError || !existingJob) {
      return NextResponse.json(
        { success: false, error: 'Job application not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (existingJob.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Perform the deletion
    const { error: deleteError } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('[API] Error deleting job application:', {
        code: deleteError.code,
        message: deleteError.message,
        details: deleteError.details,
        jobId: id,
        userId: user.id,
      })
      return NextResponse.json(
        { success: false, error: 'Failed to delete job application' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Unexpected error in job-applications DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
