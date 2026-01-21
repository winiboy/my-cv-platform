/**
 * Cover Letters API Route
 * GET: List all cover letters for the authenticated user
 * POST: Create a new cover letter
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

/**
 * Zod schema for cover letter creation
 * Validates all fields that can be provided when creating a new cover letter
 */
const coverLetterCreateSchema = z.object({
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
})

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: coverLetters, error } = await supabase
      .from('cover_letters')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching cover letters:', error)
      return NextResponse.json(
        { error: 'Failed to fetch cover letters' },
        { status: 500 }
      )
    }

    return NextResponse.json({ coverLetters })
  } catch (error) {
    console.error('Error in cover letters GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = coverLetterCreateSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      )
    }

    const {
      title,
      resume_id,
      recipient_name,
      recipient_title,
      company_name,
      company_address,
      greeting,
      opening_paragraph,
      body_paragraphs,
      closing_paragraph,
      sign_off,
      sender_name,
      job_title,
      job_description,
      template,
    } = validationResult.data

    const { data: coverLetter, error } = await supabase
      .from('cover_letters')
      .insert({
        user_id: user.id,
        title: title || 'Untitled Cover Letter',
        resume_id: resume_id || null,
        recipient_name: recipient_name || null,
        recipient_title: recipient_title || null,
        company_name: company_name || null,
        company_address: company_address || null,
        greeting: greeting || 'Dear Hiring Manager,',
        opening_paragraph: opening_paragraph || null,
        body_paragraphs: body_paragraphs || [],
        closing_paragraph: closing_paragraph || null,
        sign_off: sign_off || 'Sincerely,',
        sender_name: sender_name || null,
        job_title: job_title || null,
        job_description: job_description || null,
        template: template || 'modern',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating cover letter:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      // Return more specific error information for debugging
      return NextResponse.json(
        {
          error: 'Failed to create cover letter',
          details: error.message,
          code: error.code,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ coverLetter }, { status: 201 })
  } catch (error) {
    console.error('Error in cover letters POST:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
