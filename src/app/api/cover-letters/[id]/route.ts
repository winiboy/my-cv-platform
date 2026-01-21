/**
 * Cover Letter API Route (by ID)
 * GET: Fetch a single cover letter
 * PATCH: Update a cover letter
 * DELETE: Delete a cover letter
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { CoverLetterUpdate } from '@/types/database'
import type { Json } from '@/types/supabase'
import { z } from 'zod'

/**
 * Zod schema for cover letter updates
 * All fields are optional since PATCH only updates provided fields
 */
const coverLetterUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  resume_id: z.string().uuid().nullable().optional(),
  recipient_name: z.string().max(255).nullable().optional(),
  recipient_title: z.string().max(255).nullable().optional(),
  company_name: z.string().max(255).nullable().optional(),
  company_address: z.string().max(1000).nullable().optional(),
  greeting: z.string().max(255).optional(),
  opening_paragraph: z.string().max(5000).nullable().optional(),
  body_paragraphs: z.array(z.string().max(5000)).optional(),
  closing_paragraph: z.string().max(5000).nullable().optional(),
  sign_off: z.string().max(255).optional(),
  sender_name: z.string().max(255).nullable().optional(),
  job_title: z.string().max(255).nullable().optional(),
  job_description: z.string().max(50000).nullable().optional(),
  template: z.literal('modern').optional(),
  analysis_score: z.number().min(0).max(100).nullable().optional(),
  analysis_results: z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: coverLetter, error } = await supabase
      .from('cover_letters')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Cover letter not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching cover letter:', error)
      return NextResponse.json(
        { error: 'Failed to fetch cover letter' },
        { status: 500 }
      )
    }

    return NextResponse.json({ coverLetter })
  } catch (error) {
    console.error('Error in cover letter GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = coverLetterUpdateSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      )
    }

    const validatedData = validationResult.data

    // Build update object with only provided fields
    const updateData: CoverLetterUpdate = {
      updated_at: new Date().toISOString(),
    }

    // Explicitly assign validated fields
    if ('title' in validatedData) updateData.title = validatedData.title
    if ('resume_id' in validatedData) updateData.resume_id = validatedData.resume_id
    if ('recipient_name' in validatedData) updateData.recipient_name = validatedData.recipient_name
    if ('recipient_title' in validatedData) updateData.recipient_title = validatedData.recipient_title
    if ('company_name' in validatedData) updateData.company_name = validatedData.company_name
    if ('company_address' in validatedData) updateData.company_address = validatedData.company_address
    if ('greeting' in validatedData) updateData.greeting = validatedData.greeting
    if ('opening_paragraph' in validatedData) updateData.opening_paragraph = validatedData.opening_paragraph
    if ('body_paragraphs' in validatedData) updateData.body_paragraphs = validatedData.body_paragraphs
    if ('closing_paragraph' in validatedData) updateData.closing_paragraph = validatedData.closing_paragraph
    if ('sign_off' in validatedData) updateData.sign_off = validatedData.sign_off
    if ('sender_name' in validatedData) updateData.sender_name = validatedData.sender_name
    if ('job_title' in validatedData) updateData.job_title = validatedData.job_title
    if ('job_description' in validatedData) updateData.job_description = validatedData.job_description
    if ('template' in validatedData) updateData.template = validatedData.template
    if ('analysis_score' in validatedData) updateData.analysis_score = validatedData.analysis_score
    if ('analysis_results' in validatedData) updateData.analysis_results = validatedData.analysis_results as Json | null

    const { data: coverLetter, error } = await supabase
      .from('cover_letters')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Cover letter not found' },
          { status: 404 }
        )
      }
      console.error('Error updating cover letter:', error)
      return NextResponse.json(
        { error: 'Failed to update cover letter' },
        { status: 500 }
      )
    }

    return NextResponse.json({ coverLetter })
  } catch (error) {
    console.error('Error in cover letter PATCH:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('cover_letters')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting cover letter:', error)
      return NextResponse.json(
        { error: 'Failed to delete cover letter' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in cover letter DELETE:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
